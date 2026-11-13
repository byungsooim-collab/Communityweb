// data/posts.json + site.config.json → dist/ (정적 사이트)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
let data = { updatedAt: new Date().toISOString(), sources: [], posts: [] };
try { data = JSON.parse(await fs.readFile(path.join(root, 'data', 'posts.json'), 'utf8')); } catch {
  console.warn('data/posts.json 이 없습니다. 먼저 `npm run collect` 를 실행하세요.');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만` : n.toLocaleString('ko-KR'));
const siteUrl = config.siteUrl.replace(/\/$/, '');
const ads = config.ads;

// 종합 인기 점수: 사이트마다 수치 규모가 다르므로 "같은 사이트 안에서의 백분위"로 맞춘 뒤 시간에 따라 감쇠시킨다.
const bySource = Map.groupBy(data.posts, (p) => p.source);
const percentile = (group, key, value) => {
  const values = group.map((p) => p[key]).filter((v) => v != null);
  if (value == null || values.length < 2) return null;
  return values.filter((v) => v <= value).length / values.length;
};
const now = Date.parse(data.updatedAt);
for (const [, group] of bySource) {
  for (const p of group) {
    const parts = [[percentile(group, 'likes', p.likes), 0.5], [percentile(group, 'comments', p.comments), 0.3], [percentile(group, 'views', p.views), 0.2]]
      .filter(([v]) => v != null);
    const weight = parts.reduce((sum, [, w]) => sum + w, 0);
    const heat = weight ? parts.reduce((sum, [v, w]) => sum + v * w, 0) / weight : 0.5;
    const ageHours = Math.max(0, now - Date.parse(p.firstSeen)) / 3600000;
    const listed = p.rank != null ? 1 : 0.6; // 베스트 목록에서 내려간 글은 뒤로
    p.score = Number(((heat * listed) / (1 + ageHours / 12)).toFixed(4));
  }
}
const posts = [...data.posts].sort((a, b) => b.score - a.score);
const sourceMeta = new Map(data.sources.map((s) => [s.id, s]));

const adBlock = (key, tag = 'div') => {
  const slot = ads.slots[key];
  if (ads.adsenseClient && slot) {
    return `<${tag} class="ad" aria-label="광고"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.adsenseClient)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></${tag}>`;
  }
  return ads.showPlaceholders ? `<${tag} class="ad" aria-label="광고"><div class="ad-placeholder">광고 영역</div></${tag}>` : '';
};

const page = ({ title, description, canonical, body, scripts = '' }) => `<!doctype html>
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
<meta property="og:url" content="${esc(siteUrl + canonical)}">
<meta name="theme-color" content="#ff4d2e">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff4d2e'/%3E%3Cpath d='M9 22V10h3v9h3v-6h3v6h3v-9h3v12z' fill='%23fff'/%3E%3C/svg%3E">
<link rel="stylesheet" href="style.css">
${ads.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ads.adsenseClient)}" crossorigin="anonymous"></script>` : ''}
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="logo" href="./">커뮤<b>베스트</b></a>
  <span class="tagline">${esc(config.tagline)}</span>
  <time class="updated" datetime="${esc(data.updatedAt)}" data-rel data-prefix="업데이트 ">${esc(new Date(data.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }))} 업데이트</time>
</div></header>
${body}
<footer class="site-footer"><div class="wrap">
  <p><a href="about.html">서비스 소개 · 게시 중단 요청</a><a href="privacy.html">개인정보처리방침</a></p>
  <p>${esc(config.siteName)}는 각 커뮤니티 인기글의 제목과 링크만 제공하며, 게시물의 저작권과 책임은 원 게시자와 해당 커뮤니티에 있습니다.</p>
</div></footer>
${scripts}
</body>
</html>
`;

const postItem = (p, i) => {
  const s = sourceMeta.get(p.source) || { name: p.source, color: '#888' };
  const meta = [
    `<span class="badge" style="--c:${esc(s.color)}">${esc(s.name)}</span>`,
    p.likes != null ? `<span class="${p.likes >= 100 ? 'hot' : ''}">추천 ${fmt(p.likes)}</span>` : '',
    p.comments != null ? `<span>댓글 ${fmt(p.comments)}</span>` : '',
    p.views != null ? `<span>조회 ${fmt(p.views)}</span>` : '',
    `<time datetime="${esc(p.firstSeen)}" data-rel></time>`,
  ].join('');
  return `<li class="post${i < 3 ? ' top' : ''}" data-source="${esc(p.source)}" data-score="${p.score}" data-time="${esc(p.firstSeen)}" data-title="${esc(p.title.toLowerCase())}"><a href="${esc(p.url)}" target="_blank" rel="noopener nofollow"><span class="no">${i + 1}</span><span class="title">${esc(p.title)}</span><span class="meta">${meta}</span></a></li>`;
};

const chips = [`<button class="chip" data-source="all" aria-pressed="true">전체<span class="n">${posts.length}</span></button>`]
  .concat(data.sources.filter((s) => bySource.has(s.id)).map((s) =>
    `<button class="chip" data-source="${esc(s.id)}" aria-pressed="false">${esc(s.name)}<span class="n">${bySource.get(s.id).length}</span></button>`)).join('');

const sourceList = data.sources.map((s) =>
  `<li class="${s.ok ? '' : 'fail'}"><a href="${esc(s.home)}" target="_blank" rel="noopener nofollow"><span class="badge" style="--c:${esc(s.color)}">${esc(s.name)}</span></a><small>${s.ok ? esc(s.board) : '일시적으로 수집 지연'}</small></li>`).join('');

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'ItemList', name: `${config.siteName} 실시간 인기글`,
  itemListElement: posts.slice(0, 30).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: p.url })),
};

const adConfig = { client: ads.adsenseClient, slots: ads.slots, infeedEvery: ads.infeedEvery, placeholders: ads.showPlaceholders };
const indexHtml = page({
  title: `${config.siteName} - ${config.tagline}`,
  description: config.description,
  canonical: '/',
  body: `<div class="wrap">
${adBlock('top')}
<div class="toolbar">
  <nav class="chips" aria-label="커뮤니티 선택">${chips}</nav>
  <div class="controls">
    <div class="sort" role="group" aria-label="정렬"><button data-sort="hot" aria-pressed="true">인기순</button><button data-sort="new" aria-pressed="false">최신순</button></div>
    <input class="search" id="q" type="search" placeholder="제목 검색" aria-label="제목 검색" autocomplete="off">
  </div>
</div>
<div class="layout">
  <main>
    <h1 hidden>${esc(config.siteName)} 실시간 커뮤니티 인기글</h1>
    <ol class="posts" id="posts">
${posts.map(postItem).join('\n')}
    </ol>
    <p class="empty" id="empty"${posts.length ? ' hidden' : ''}>${posts.length ? '조건에 맞는 게시물이 없습니다.' : '아직 수집된 게시물이 없습니다.'}</p>
    ${adBlock('bottom')}
  </main>
  <aside class="side">
    <section class="card"><h2>수집 중인 커뮤니티</h2><ul class="sources">${sourceList}</ul></section>
    ${adBlock('sidebar')}
  </aside>
</div>
</div>`,
  scripts: `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<script type="application/json" id="ad-config">${JSON.stringify(adConfig).replace(/</g, '\\u003c')}</script>
<script src="app.js" defer></script>`,
});

const doc = (file, title, html) => [file, page({
  title: `${title} - ${config.siteName}`, description: `${config.siteName} ${title}`, canonical: `/${file}`,
  body: `<div class="wrap"><article class="doc"><h1>${esc(title)}</h1>${html}</article></div>`,
  scripts: `<script>document.querySelectorAll('time[data-rel]').forEach(function(t){t.removeAttribute('data-rel')})</script>`,
})];
const mail = `<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`;
const docs = [
  doc('about.html', '서비스 소개', `
<p>${esc(config.siteName)}는 국내 주요 커뮤니티의 베스트(인기) 게시판에 올라온 글을 한 화면에 모아 보여 주는 서비스입니다.</p>
<h2>무엇을 수집하나요</h2>
<p>각 커뮤니티의 공개된 인기글 목록에서 <strong>제목, 원문 링크, 추천·댓글·조회 수</strong>만 가져옵니다. 본문, 이미지, 댓글, 작성자 정보는 수집하거나 저장하지 않으며, 글을 읽으려면 원문 커뮤니티로 이동합니다.</p>
<h2>수집 원칙</h2>
<ul><li>각 사이트의 robots.txt를 매번 확인하고, 수집을 허용하지 않는 사이트는 수집하지 않습니다.</li>
<li>수집기는 자신을 <code>${esc(config.botUserAgent)}</code> 로 밝히며, 사이트당 목록 페이지 1개만 주기적으로 요청합니다.</li>
<li>보안 확인(CAPTCHA 등)으로 자동 접근을 막는 사이트는 우회하지 않습니다.</li></ul>
<h2>게시 중단 요청</h2>
<p>커뮤니티 운영자 또는 권리자께서 목록 노출 중단을 원하시면 ${mail} 로 알려 주세요. 확인 즉시 수집 대상에서 제외합니다.</p>
<h2>수집 대상</h2><ul>${data.sources.map((s) => `<li><a href="${esc(s.home)}" rel="noopener nofollow" target="_blank">${esc(s.name)}</a> — ${esc(s.board)}</li>`).join('')}</ul>`),
  doc('privacy.html', '개인정보처리방침', `
<p>${esc(config.siteName)}는 회원가입 기능이 없으며 이용자의 이름, 이메일 등 개인정보를 직접 수집하지 않습니다.</p>
<h2>광고 및 쿠키</h2>
<p>이 사이트는 Google AdSense 등 제3자 광고 서비스를 사용할 수 있습니다. Google을 포함한 제3자 광고 사업자는 쿠키를 사용해 이용자의 이 사이트 및 다른 사이트 방문 기록을 바탕으로 광고를 게재합니다. 이용자는 <a href="https://www.google.com/settings/ads" rel="noopener" target="_blank">Google 광고 설정</a>에서 맞춤 광고를 해제할 수 있습니다.</p>
<h2>접속 기록</h2>
<p>호스팅 사업자가 서비스 운영과 보안을 위해 IP 주소, 브라우저 정보 등 접속 기록을 일정 기간 보관할 수 있습니다.</p>
<h2>문의</h2><p>${mail}</p>`),
];

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(dist, 'index.html'), indexHtml),
  ...docs.map(([file, html]) => fs.writeFile(path.join(dist, file), html)),
  fs.copyFile(path.join(root, 'site', 'style.css'), path.join(dist, 'style.css')),
  fs.copyFile(path.join(root, 'site', 'app.js'), path.join(dist, 'app.js')),
  fs.writeFile(path.join(dist, 'posts.json'), JSON.stringify({ updatedAt: data.updatedAt, sources: data.sources, posts })),
  fs.writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`),
  fs.writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/about.html', '/privacy.html'].map((u) => `<url><loc>${esc(siteUrl + u)}</loc><lastmod>${data.updatedAt}</lastmod></url>`).join('\n')}\n</urlset>\n`),
  fs.writeFile(path.join(dist, '.nojekyll'), ''),
  // AdSense 게시자 ID가 있으면 ads.txt 를 자동 생성한다 (ca-pub-123 → pub-123).
  ...(ads.adsenseClient ? [fs.writeFile(path.join(dist, 'ads.txt'), `google.com, ${ads.adsenseClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`)] : []),
]);
console.log(`dist/ 생성 완료: 게시물 ${posts.length}건, 커뮤니티 ${data.sources.length}곳`);
