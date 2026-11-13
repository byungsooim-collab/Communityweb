// 국내 리그 팀의 부상 관련 뉴스를 네이버 뉴스 검색 API 로 가져온다.
// 검색 결과(제목·링크·날짜)는 화면에 그대로 보여 주기만 하고, 확률 계산이나 AI 해설에는 넣지 않는다.
// 키(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)가 없으면 "네이버에서 검색" 링크만 제공한다.

// API-Sports 의 영문 팀명에 들어 있는 단어로 한글 팀명을 찾는다. 위에서부터 먼저 맞는 것을 쓴다.
const TEAMS = {
  kleague1: [['suwon fc', '수원FC'], ['suwon', '수원 삼성'], ['ulsan', '울산 HD'], ['jeonbuk', '전북 현대'], ['pohang', '포항 스틸러스'], ['seoul', 'FC서울'], ['gangwon', '강원FC'], ['gimcheon', '김천 상무'], ['sangmu', '김천 상무'], ['jeju', '제주 SK'], ['daejeon', '대전하나시티즌'], ['gwangju', '광주FC'], ['daegu', '대구FC'], ['incheon', '인천 유나이티드'], ['anyang', 'FC안양'], ['bucheon', '부천FC'], ['seongnam', '성남FC'], ['jeonnam', '전남 드래곤즈'], ['busan', '부산 아이파크'], ['gyeongnam', '경남FC']],
  kbo: [['kia', 'KIA 타이거즈'], ['samsung', '삼성 라이온즈'], ['lg', 'LG 트윈스'], ['doosan', '두산 베어스'], ['kt', 'KT 위즈'], ['ssg', 'SSG 랜더스'], ['lotte', '롯데 자이언츠'], ['hanwha', '한화 이글스'], ['nc', 'NC 다이노스'], ['kiwoom', '키움 히어로즈']],
  kbl: [['sk', '서울 SK 나이츠'], ['samsung', '서울 삼성 썬더스'], ['lg', '창원 LG 세이커스'], ['changwon', '창원 LG 세이커스'], ['db', '원주 DB 프로미'], ['wonju', '원주 DB 프로미'], ['kcc', '부산 KCC 이지스'], ['kt', '수원 KT 소닉붐'], ['sono', '고양 소노'], ['goyang', '고양 소노'], ['kogas', '대구 한국가스공사'], ['mobis', '울산 현대모비스'], ['ulsan', '울산 현대모비스'], ['jung kwan jang', '안양 정관장'], ['kgc', '안양 정관장'], ['anyang', '안양 정관장']],
  'vleague-m': [['korean air', '대한항공 점보스'], ['hyundai', '현대캐피탈 스카이워커스'], ['kb', 'KB손해보험 배구'], ['woori', '우리카드 배구'], ['samsung', '삼성화재 블루팡스'], ['kepco', '한국전력 빅스톰'], ['ok', 'OK저축은행 배구']],
  'vleague-w': [['heungkuk', '흥국생명 핑크스파이더스'], ['hyundai', '현대건설 힐스테이트'], ['hillstate', '현대건설 힐스테이트'], ['jung kwan jang', '정관장 레드스파크스'], ['kgc', '정관장 레드스파크스'], ['ibk', 'IBK기업은행 알토스'], ['expressway', '한국도로공사 하이패스'], ['hi-pass', '한국도로공사 하이패스'], ['gs', 'GS칼텍스 서울Kixx'], ['pepper', '페퍼저축은행 배구']],
};

export function koreanTeamName(leagueId, name) {
  const words = ` ${name.toLowerCase().replace(/[^a-z0-9&-]+/g, ' ').trim()} `;
  const hit = (TEAMS[leagueId] || []).find(([key]) => words.includes(` ${key} `));
  return hit ? hit[1] : null;
}

const ENTITIES = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ' };
export const plainText = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&(quot|amp|lt|gt|apos|nbsp|#39);/g, (m) => ENTITIES[m]).trim();
export const searchLink = (query) => `https://search.naver.com/search.naver?where=news&sort=1&query=${encodeURIComponent(query)}`;

async function search(config, query) {
  const url = new URL(config.endpoint);
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(config.perTeam));
  url.searchParams.set('sort', 'date');
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`네이버 검색 API HTTP ${res.status}`);
  const body = await res.json();
  return (body.items || []).flatMap((item) => {
    const link = item.link || item.originallink;
    if (!/^https?:\/\//.test(link || '')) return [];
    const date = new Date(item.pubDate);
    return [{ title: plainText(item.title), link, date: Number.isNaN(date.getTime()) ? null : date.toISOString() }];
  });
}

// matches 의 각 팀에 news: { query, items } 를 붙인다. cache: { [query]: { at, items } }
export async function addTeamNews(matches, config, cache = {}, now = Date.now()) {
  const next = {};
  if (!config?.enabled) return next;
  const hasKey = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  let calls = 0, failed = false;
  for (const m of matches) {
    for (const team of [m.home, m.away]) {
      const koName = koreanTeamName(m.leagueId, team.name);
      if (!koName) continue;
      const query = config.queryTemplate.replace('{team}', koName);
      team.news = { query, items: [] };
      const cached = next[query] || cache[query];
      if (cached && now - cached.at < config.cacheHours * 3600000) { next[query] = cached; team.news.items = cached.items; continue; }
      if (!hasKey || failed || calls >= config.maxQueriesPerRun) { if (cached) team.news.items = cached.items; continue; }
      try {
        calls++;
        next[query] = { at: now, items: await search(config, query) };
        team.news.items = next[query].items;
      } catch (error) {
        failed = true; // 키·한도 문제일 가능성이 높으니 이번 실행에서는 더 부르지 않는다.
        console.warn(`! 뉴스 검색 중단: ${error.message}`);
      }
    }
  }
  console.log(hasKey ? `네이버 뉴스 검색 ${calls}회 호출` : 'NAVER_CLIENT_ID/SECRET 이 없어 뉴스는 검색 링크만 제공합니다.');
  return next;
}
