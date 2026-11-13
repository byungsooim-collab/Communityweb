// data/matches.json + data/history.json → dist/ (Firebase Hosting 에 올릴 정적 사이트)
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, dataPath, readJson, loadConfig } from '../pipeline/store.js';
import { searchLink } from '../pipeline/news.js';

const config = await loadConfig();
const data = await readJson(dataPath('matches.json'), null);
if (!data) { console.error('data/matches.json 이 없습니다. `npm run collect` 또는 `npm run sample` 을 먼저 실행하세요.'); process.exit(1); }
const history = await readJson(dataPath('history.json'), { entries: [] });
const dist = path.join(root, 'dist');
const siteUrl = config.siteUrl.replace(/\/$/, '');
const ads = config.ads;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (p) => `${Math.round(p * 100)}%`;
const KST = 'Asia/Seoul';
const dayKey = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: KST });
const dayLabel = (iso) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: KST, month: 'long', day: 'numeric', weekday: 'short' });
const time = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false });
const shortDate = (iso) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric' });
const SPORTS = { football: '축구', basketball: '농구', baseball: '야구', volleyball: '배구' };
const RESULT = { win: '승', draw: '무', loss: '패' };
const PICK = { home: '홈 승', draw: '무승부', away: '원정 승' };
const POSITION = { Attacker: '공격수', Midfielder: '미드필더', Defender: '수비수', Goalkeeper: '골키퍼' };
const CONF = { high: '신뢰도 높음', mid: '신뢰도 보통', low: '신뢰도 낮음' };

const adBlock = (key) => {
  const slot = ads.slots[key];
  if (ads.adsenseClient && slot) return `<div class="ad" aria-label="광고"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.adsenseClient)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>`;
  return ads.showPlaceholders ? '<div class="ad" aria-label="광고"><div class="ad-placeholder">광고 영역</div></div>' : '';
};

const page = ({ title, description, canonical, body, nav = '', base = '' }) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(siteUrl + canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="theme-color" content="#1f6feb">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231f6feb'/%3E%3Cpath d='M8 21l5-6 4 3 7-9' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}style.css">
${ads.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ads.adsenseClient)}" crossorigin="anonymous"></script>` : ''}
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="logo" href="${base || './'}">승부<b>노트</b></a>
  <nav class="nav"><a href="${base || './'}"${nav === 'home' ? ' aria-current="page"' : ''}>경기 분석</a><a href="${base}record.html"${nav === 'record' ? ' aria-current="page"' : ''}>적중률</a></nav>
  <span class="updated">${esc(new Date(data.updatedAt).toLocaleString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))} 업데이트</span>
</div></header>
${data.sample ? '<div class="banner">샘플 데이터입니다. 팀·선수·결과는 모두 가상이며 실제 경기와 무관합니다.</div>' : ''}
<div class="wrap">
${body}
</div>
<footer class="site-footer"><div class="wrap">
  <p><a href="${base}about.html">분석 방법 · 서비스 소개</a><a href="${base}privacy.html">개인정보처리방침</a></p>
  <p>${esc(config.siteName)}의 분석은 통계 모델에 따른 확률 추정이며 경기 결과를 보장하지 않습니다. 체육진흥투표권(스포츠토토·프로토)은 만 19세 이상만 구매할 수 있으며, 공식 발매처 외의 사설 사이트 이용은 불법입니다.</p>
  <p>도박 문제로 도움이 필요하면 한국도박문제예방치유원 ☎ 1336 (24시간, 무료)</p>
</div></footer>
<script src="${base}app.js" defer></script>
</body>
</html>
`;

const probBar = (p) => `<div class="bar" role="img" aria-label="홈 승 ${pct(p.pHome)}${p.pDraw ? `, 무승부 ${pct(p.pDraw)}` : ''}, 원정 승 ${pct(p.pAway)}"><i class="h" style="width:${p.pHome * 100}%"></i><i class="d" style="width:${p.pDraw * 100}%"></i><i class="a" style="width:${p.pAway * 100}%"></i></div>
<div class="probs num"><span>홈 승 <b>${pct(p.pHome)}</b></span>${p.pDraw ? `<span class="draw">무 <b>${pct(p.pDraw)}</b></span>` : ''}<span>원정 승 <b>${pct(p.pAway)}</b></span></div>`;

const tags = (m) => {
  const out = [`<span class="tag ${m.prediction.confidence === 'high' ? 'high' : ''}">${PICK[m.prediction.pick]} · ${CONF[m.prediction.confidence]}</span>`];
  const missing = m.injuries.home.length + m.injuries.away.length;
  if (missing) out.push(`<span class="tag warn">결장·불투명 ${missing}명</span>`);
  if (m.prediction.lowData) out.push('<span class="tag warn">표본 부족</span>');
  if (m.commentary) out.push('<span class="tag">AI 해설</span>');
  return `<div class="tags">${out.join('')}</div>`;
};
const rankText = (t, m) => (t.rank ? `${t.rank}위 · ` : '') + `${t.record.win}승 ${m.sport === 'football' ? `${t.record.draw}무 ` : ''}${t.record.loss}패`;
const teamsRow = (m) => `<div class="teams">
  <div class="team${m.prediction.pick === 'home' ? ' picked' : ''}">${esc(m.home.name)}<small>홈 · ${esc(rankText(m.home, m))}</small></div>
  <span class="vs">vs</span>
  <div class="team away${m.prediction.pick === 'away' ? ' picked' : ''}">${esc(m.away.name)}<small>원정 · ${esc(rankText(m.away, m))}</small></div>
</div>`;

const matchCard = (m) => `<a class="match" href="match/${esc(m.id)}.html" data-sport="${m.sport}" data-day="${dayKey(m.date)}">
<div class="match-top"><span>${SPORTS[m.sport]} · ${esc(m.leagueName)}</span><span class="num">${time(m.date)}</span></div>
${teamsRow(m)}
${probBar(m.prediction)}
${tags(m)}
</a>`;

// ---------- 목록 ----------
const byDay = Map.groupBy(data.matches, (m) => dayKey(m.date));
const sportsPresent = Object.keys(SPORTS).filter((s) => data.matches.some((m) => m.sport === s));
const listBody = [...byDay.entries()].map(([key, list], i) =>
  `<h2 class="day" data-day="${key}">${dayLabel(list[0].date)}</h2>\n${list.map(matchCard).join('\n')}${i === 0 ? `\n${adBlock('infeed')}` : ''}`).join('\n');
const failed = data.leagues.filter((l) => !l.ok);
const indexHtml = page({
  title: `${config.siteName} - ${config.tagline}`, description: config.description, canonical: '/', nav: 'home',
  body: `${adBlock('top')}
<div class="toolbar"><nav class="chips" aria-label="종목 선택"><button class="chip" data-sport="all" aria-pressed="true">전체</button>${sportsPresent.map((s) => `<button class="chip" data-sport="${s}" aria-pressed="false">${SPORTS[s]}</button>`).join('')}</nav></div>
<main>
<h1 hidden>${esc(config.siteName)} 경기 분석</h1>
${listBody}
<p class="empty" id="empty"${data.matches.length ? ' hidden' : ''}>앞으로 ${config.daysAhead}일 안에 분석할 경기가 없습니다.</p>
${failed.length ? `<p class="note">일시적으로 갱신이 지연된 리그: ${failed.map((l) => esc(l.name)).join(', ')}</p>` : ''}
${adBlock('bottom')}
</main>`,
});

// ---------- 경기 상세 ----------
const formTable = (t) => `<div class="scroll"><table><thead><tr><th>날짜</th><th>상대</th><th class="r">점수</th><th class="r">결과</th></tr></thead><tbody>
${t.last5.map((r) => `<tr><td class="num">${shortDate(r.date)}</td><td>${r.home ? '홈' : '원정'} · ${esc(r.opponent)}</td><td class="r num">${r.gf}-${r.ga}</td><td class="r"><span class="res ${r.result}">${RESULT[r.result]}</span></td></tr>`).join('\n') || '<tr><td colspan="4" class="note">이번 시즌 경기 기록이 없습니다.</td></tr>'}
</tbody></table></div>`;

const injuryTable = (list) => (list.length ? `<div class="scroll"><table><thead><tr><th>선수</th><th>상태</th><th>사유</th><th class="r">출전</th><th class="r">시간</th><th class="r">골</th><th class="r">도움</th><th class="r">평점</th></tr></thead><tbody>
${list.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.stats?.position ? ` <span class="note">${esc(POSITION[p.stats.position] || p.stats.position)}</span>` : ''}</td><td>${/question|doubt/i.test(p.type) ? '출전 불투명' : '결장'}</td><td>${esc(p.reason || '-')}</td>${p.stats ? `<td class="r num">${p.stats.appearances}경기</td><td class="r num">${p.stats.minutes}분</td><td class="r num">${p.stats.goals}</td><td class="r num">${p.stats.assists}</td><td class="r num">${p.stats.rating ?? '-'}</td>` : '<td colspan="5" class="note">시즌 기록 없음</td>'}</tr>`).join('\n')}
</tbody></table></div>` : '<p class="note">등록된 결장·불투명 선수가 없습니다.</p>');

const statRow = (label, h, a) => `<div class="stat-row num"><span>${h}</span><em>${label}</em><span>${a}</span></div>`;
const split = (s, football) => `${s.win}승 ${football ? `${s.draw}무 ` : ''}${s.loss}패`;
const scored = (sport) => (sport === 'volleyball' ? '딴 세트' : '득점');
const conceded = (sport) => (sport === 'volleyball' ? '내준 세트' : '실점');

const newsBlock = (t) => `<div><h3>${esc(t.name)}</h3>
${t.news.items.length ? `<ul class="news">${t.news.items.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener nofollow">${esc(n.title)}</a>${n.date ? ` <span class="note num">${shortDate(n.date)}</span>` : ''}</li>`).join('')}</ul>` : ''}
<a class="more" href="${esc(searchLink(t.news.query))}" target="_blank" rel="noopener nofollow">네이버 뉴스에서 "${esc(t.news.query)}" 검색 →</a></div>`;

function matchPage(m) {
  const p = m.prediction;
  const football = m.sport === 'football';
  const impact = m.injuryImpact;
  const title = `${m.home.name} vs ${m.away.name} 분석 - ${m.leagueName}`;
  const body = `<a class="back" href="../">← 경기 목록</a>
<main>
<section class="card hero">
  <div class="match-top"><span>${SPORTS[m.sport]} · ${esc(m.leagueName)}</span><span class="num">${dayLabel(m.date)} ${time(m.date)}</span></div>
  <h1 hidden>${esc(title)}</h1>
  ${teamsRow(m)}
  ${probBar(p)}
  ${tags(m)}
  ${football ? `<p class="note" style="margin-top:12px">기대 득점 ${p.expected.home} : ${p.expected.away} · 가장 가능성 높은 스코어 ${p.likelyScore} · 2.5골 초과 ${pct(p.over25)}</p>` : `<p class="note" style="margin-top:12px">Elo 레이팅 ${p.rating.home} : ${p.rating.away} (홈 이점 포함해 계산)</p>`}
  ${p.lowData ? '<p class="note">이번 시즌 경기 수가 5경기 미만인 팀이 있어 확률의 신뢰도가 낮습니다.</p>' : ''}
</section>
${m.commentary ? `<section class="card"><h2>AI 해설</h2><p>${esc(m.commentary)}</p><p class="note">아래 데이터를 근거로 AI가 작성한 글입니다.</p></section>` : ''}
${adBlock('detail')}
<section class="card"><h2>부상·결장 선수</h2>
${m.injuries.available ? `<div class="cols stack"><div><h3>${esc(m.home.name)}</h3>${injuryTable(m.injuries.home)}</div><div><h3>${esc(m.away.name)}</h3>${injuryTable(m.injuries.away)}</div></div>
${impact ? `<p class="note" style="margin-top:12px">부상 반영 전 확률은 홈 승 ${pct(impact.before.pHome)} · 무 ${pct(impact.before.pDraw)} · 원정 승 ${pct(impact.before.pAway)} 였습니다. 결장 선수의 골·도움 비중과 주전 수비수 여부로 보정했습니다.</p>` : ''}` : '<p class="note">이 종목은 데이터 제공처에서 부상자 정보를 제공하지 않아 분석에 반영하지 못했습니다.</p>'}
</section>
${m.home.news || m.away.news ? `<section class="card"><h2>부상 관련 뉴스</h2><div class="cols">${[m.home, m.away].filter((t) => t.news).map(newsBlock).join('')}</div>
<p class="note" style="margin-top:12px">네이버 뉴스 검색 결과이며 승패 확률과 AI 해설에는 반영되지 않습니다. 기사 내용은 각 언론사에 있습니다.</p></section>` : ''}
<section class="card"><h2>최근 5경기</h2><div class="cols">
<div><h3>${esc(m.home.name)} <span class="note num">${m.home.last5Summary.win}승 ${football ? `${m.home.last5Summary.draw}무 ` : ''}${m.home.last5Summary.loss}패</span></h3>${formTable(m.home)}</div>
<div><h3>${esc(m.away.name)} <span class="note num">${m.away.last5Summary.win}승 ${football ? `${m.away.last5Summary.draw}무 ` : ''}${m.away.last5Summary.loss}패</span></h3>${formTable(m.away)}</div>
</div></section>
<section class="card"><h2>시즌 기록 비교</h2>
${statRow('순위', m.home.rank ? `${m.home.rank}위` : '-', m.away.rank ? `${m.away.rank}위` : '-')}
${statRow('전체 성적', split(m.home.record, football), split(m.away.record, football))}
${statRow('홈 / 원정 성적', `홈 ${split(m.home.record.home, football)}`, `원정 ${split(m.away.record.away, football)}`)}
${statRow(`경기당 ${scored(m.sport)}`, m.home.record.gfPerGame, m.away.record.gfPerGame)}
${statRow(`경기당 ${conceded(m.sport)}`, m.home.record.gaPerGame, m.away.record.gaPerGame)}
${statRow(`최근 5경기 ${scored(m.sport)}`, m.home.last5Summary.gfPerGame, m.away.last5Summary.gfPerGame)}
${statRow(`최근 5경기 ${conceded(m.sport)}`, m.home.last5Summary.gaPerGame, m.away.last5Summary.gaPerGame)}
${statRow('휴식일', m.home.restDays != null ? `${m.home.restDays}일` : '-', m.away.restDays != null ? `${m.away.restDays}일` : '-')}
</section>
<section class="card"><h2>이번 시즌 맞대결</h2>
${m.h2h.length ? `<div class="scroll"><table><tbody>${m.h2h.map((g) => `<tr><td class="num">${shortDate(g.date)}</td><td>${esc(g.home)}</td><td class="r num"><b>${g.score.home}-${g.score.away}</b></td><td>${esc(g.away)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">이번 시즌 맞대결 기록이 없습니다.</p>'}
</section>
<p class="note">이번 시즌 종료 경기 ${p.sample}건을 바탕으로 계산했습니다. <a href="../about.html" style="text-decoration:underline">분석 방법 보기</a></p>
</main>`;
  return page({ title: `${title} | ${config.siteName}`, description: `${m.home.name} vs ${m.away.name} ${dayLabel(m.date)} 경기 분석: 승패 확률, 최근 경기력, 부상자, 맞대결 기록.`, canonical: `/match/${m.id}.html`, body, base: '../' });
}

// ---------- 적중률 ----------
const settled = history.entries.filter((e) => e.result);
const rate = (hit, total) => (total ? `${Math.round((hit / total) * 100)}%` : '-');
const high = settled.filter((e) => e.confidence === 'high');
const recordHtml = page({
  title: `적중률 - ${config.siteName}`, description: `${config.siteName} 예측 적중 기록과 리그별 백테스트 결과.`, canonical: '/record.html', nav: 'record',
  body: `<main>
<section class="card"><h1 style="font-size:20px;margin:0 0 12px">예측 적중률</h1>
<div class="cols"><div><div class="big num">${rate(settled.filter((e) => e.hit).length, settled.length)}</div><p class="note">사전 예측 전체 · ${settled.length}경기 중 ${settled.filter((e) => e.hit).length}경기 적중</p></div>
<div><div class="big num">${rate(high.filter((e) => e.hit).length, high.length)}</div><p class="note">신뢰도 높음만 · ${high.length}경기 중 ${high.filter((e) => e.hit).length}경기 적중</p></div></div>
<p class="note">경기 시작 전에 공개한 예측만 집계합니다. ${settled.length ? '' : '아직 결과가 나온 예측이 없습니다.'}</p></section>
<section class="card"><h2>리그별 백테스트</h2>
<div class="scroll"><table><thead><tr><th>리그</th><th class="r">검증 경기</th><th class="r">적중률</th><th class="r">신뢰도 높음</th></tr></thead><tbody>
${data.leagues.filter((l) => l.ok).map((l) => `<tr><td>${esc(l.name)}</td>${l.backtest ? `<td class="r num">${l.backtest.total}</td><td class="r num"><b>${rate(l.backtest.hit, l.backtest.total)}</b></td><td class="r num">${rate(l.backtest.highHit, l.backtest.highTotal)} <span class="note">(${l.backtest.highTotal})</span></td>` : '<td colspan="3" class="note">경기 수 부족</td>'}</tr>`).join('\n')}
</tbody></table></div>
<p class="note" style="margin-top:10px">이번 시즌 각 경기를 "그 경기 이전 결과만"으로 예측했을 때의 적중률입니다. 부상자 보정은 포함하지 않습니다. 축구는 승·무·패 3지선다, 나머지는 승·패 2지선다 기준입니다.</p></section>
${settled.length ? `<section class="card"><h2>최근 결과</h2><div class="scroll"><table><thead><tr><th>날짜</th><th>경기</th><th>예측</th><th class="r">결과</th><th class="r"></th></tr></thead><tbody>
${settled.slice(0, 50).map((e) => `<tr><td class="num">${shortDate(e.date)}</td><td>${esc(e.home)} vs ${esc(e.away)}</td><td>${PICK[e.pick]} <span class="note num">${pct(e.p)}</span></td><td class="r num">${e.score.home}-${e.score.away}</td><td class="r"><span class="res ${e.hit ? 'win' : 'loss'}">${e.hit ? '○' : '×'}</span></td></tr>`).join('\n')}
</tbody></table></div></section>` : ''}
</main>`,
});

// ---------- 안내 문서 ----------
const mail = `<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`;
const doc = (file, title, html) => [file, page({ title: `${title} - ${config.siteName}`, description: `${config.siteName} ${title}`, canonical: `/${file}`, body: `<main><article class="card doc"><h1 style="font-size:20px;margin-top:0">${esc(title)}</h1>${html}</article></main>` })];
const docs = [
  doc('about.html', '분석 방법', `
<p>${esc(config.siteName)}는 공개된 경기 결과와 부상자 정보를 통계 모델로 분석해 승·무·패 확률을 제공합니다. 확률은 추정치이며 결과를 보장하지 않습니다.</p>
<h2>축구</h2>
<p>이번 시즌 경기 결과로 팀별 홈·원정 공격력과 수비력을 구해 기대 득점을 계산하고, 포아송 분포로 가능한 모든 스코어의 확률을 합산합니다. 최근 경기일수록 더 크게 반영하며(반감기 180일), 경기 수가 적은 팀은 리그 평균에 가깝게 보정합니다.</p>
<h2>부상자 반영 (축구)</h2>
<p>결장 선수의 골·도움이 팀 득점에서 차지하는 비중만큼 공격력을 낮추고(최대 25%), 주전급 수비수·골키퍼가 빠지면 상대 기대 득점을 1명당 4% 높입니다(최대 15%). '출전 불투명' 선수는 절반만 반영합니다. 이 보정값은 경험적 추정입니다.</p>
<h2>농구 · 야구 · 배구</h2>
<p>경기 결과로 Elo 레이팅을 쌓아 승률을 계산하며 홈 이점과 점수 차를 반영합니다. 이 종목들은 데이터 제공처가 부상자 정보를 제공하지 않아 부상은 반영하지 못합니다.</p>
<h2>AI 해설</h2>
<p>해설 글은 위 수치와 기록만을 근거로 AI가 작성합니다. 데이터에 없는 소식은 반영되지 않습니다.</p>
<h2>유의 사항</h2>
<p>시즌 초반처럼 표본이 적을 때, 감독 교체·이적·일정 과밀 같은 수치 밖 변수가 클 때는 정확도가 떨어집니다. 실제 적중 기록은 <a href="record.html">적중률</a> 페이지에서 공개합니다. 본 사이트는 스포츠 베팅을 권유하지 않으며 사설 베팅 사이트와 무관합니다.</p>
<h2>데이터 출처 · 문의</h2><p>경기·선수 데이터: API-Sports. 문의: ${mail}</p>`),
  doc('privacy.html', '개인정보처리방침', `
<p>${esc(config.siteName)}는 회원가입 기능이 없으며 이용자의 이름, 이메일 등 개인정보를 직접 수집하지 않습니다.</p>
<h2>광고 및 쿠키</h2><p>이 사이트는 제3자 광고 서비스를 사용할 수 있으며, 광고 사업자는 쿠키를 사용해 방문 기록을 바탕으로 광고를 게재할 수 있습니다. Google 광고는 <a href="https://www.google.com/settings/ads" rel="noopener" target="_blank">광고 설정</a>에서 맞춤 광고를 해제할 수 있습니다.</p>
<h2>접속 기록</h2><p>호스팅 사업자(Google Firebase)가 서비스 운영과 보안을 위해 IP 주소, 브라우저 정보 등 접속 기록을 일정 기간 보관할 수 있습니다.</p>
<h2>문의</h2><p>${mail}</p>`),
];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'match'), { recursive: true });
const urls = ['/', '/record.html', '/about.html', '/privacy.html', ...data.matches.map((m) => `/match/${m.id}.html`)];
await Promise.all([
  fs.writeFile(path.join(dist, 'index.html'), indexHtml),
  fs.writeFile(path.join(dist, 'record.html'), recordHtml),
  ...docs.map(([file, html]) => fs.writeFile(path.join(dist, file), html)),
  ...data.matches.map((m) => fs.writeFile(path.join(dist, 'match', `${m.id}.html`), matchPage(m))),
  fs.copyFile(path.join(root, 'site', 'style.css'), path.join(dist, 'style.css')),
  fs.copyFile(path.join(root, 'site', 'app.js'), path.join(dist, 'app.js')),
  fs.writeFile(path.join(dist, '404.html'), page({ title: `페이지를 찾을 수 없습니다 - ${config.siteName}`, description: '', canonical: '/404.html', base: '/', body: '<main><p class="empty">종료됐거나 없는 경기입니다. <a href="/" style="text-decoration:underline">경기 목록으로</a></p></main>' })),
  fs.writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`),
  fs.writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(siteUrl + u)}</loc></url>`).join('\n')}\n</urlset>\n`),
  ...(ads.adsenseClient ? [fs.writeFile(path.join(dist, 'ads.txt'), `google.com, ${ads.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`)] : []),
]);
console.log(`dist/ 생성 완료: 경기 ${data.matches.length}건${data.sample ? ' (샘플 데이터)' : ''}`);
