// posts/*.md + player.json + blog.config.json → dist/ (GitHub Pages 에 올릴 정적 블로그)
// 날짜가 아직 오지 않은 글은 빼고 만든다. 미리보기: node src/build.js --drafts
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import { coverSvg } from './cover.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'blog.config.json'), 'utf8'));
const player = JSON.parse(await fs.readFile(path.join(root, 'player.json'), 'utf8'));
const journey = JSON.parse(await fs.readFile(path.join(root, 'journey.json'), 'utf8').catch(() => 'null'));
const showDrafts = process.argv.includes('--drafts');
const now = Date.now();
const siteUrl = config.siteUrl.replace(/\/$/, '');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KST = 'Asia/Seoul';
const fmtDate = (d) => new Date(d).toLocaleDateString('ko-KR', { timeZone: KST, year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (d) => new Date(d).toLocaleDateString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric' });

// ---------- 글 읽기 ----------
const files = (await fs.readdir(path.join(root, 'posts'))).filter((f) => f.endsWith('.md')).sort();
const all = [];
for (const file of files) {
  const { data, content } = matter(await fs.readFile(path.join(root, 'posts', file), 'utf8'));
  const slug = file.replace(/\.md$/, '');
  const date = new Date(data.date);
  if (Number.isNaN(date.getTime())) throw new Error(`${file}: date 가 올바르지 않습니다`);
  if (!data.title) throw new Error(`${file}: title 이 없습니다`);
  const words = content.replace(/\s+/g, '').length;
  all.push({
    slug, file, date, title: data.title, summary: data.summary || '', category: data.category || '일기', series: data.series || '',
    tags: data.tags || [], cover: data.cover || '', coverAlt: data.coverAlt || data.title, mood: data.mood || '',
    stats: data.stats || {}, html: marked.parse(content), readMin: Math.max(1, Math.round(words / 500)),
  });
}
all.sort((a, b) => a.date - b.date);
const posts = all.filter((p) => showDrafts || p.date.getTime() <= now);
const scheduled = all.length - posts.length;

// ---------- 상태창: 글 순서대로 값을 덮어쓰며 변화량을 계산 ----------
const fields = [...player.profile, ...player.stats, player.condition ? { key: 'condition', ...player.condition } : null].filter(Boolean);
const current = Object.fromEntries(fields.map((f) => [f.key, f.value ?? null]));
for (const p of posts) {
  p.changes = [];
  for (const [key, value] of Object.entries(p.stats)) {
    const field = fields.find((f) => f.key === key);
    if (!field) throw new Error(`${p.file}: stats 의 '${key}' 는 player.json 에 없는 항목입니다`);
    const before = current[key];
    current[key] = value;
    p.changes.push({ label: field.label, unit: field.unit || '', before, after: value, diff: typeof value === 'number' && typeof before === 'number' ? Number((value - before).toFixed(1)) : null });
  }
}

// ---------- 공통 틀 ----------
const fontLinks = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">`;

const page = ({ title, description, canonical, body, base, image = '', type = 'website' }) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(siteUrl + canonical)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(siteUrl + canonical)}">
${image ? `<meta property="og:image" content="${esc(siteUrl + '/' + image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#2f9e5b">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="${base}feed.xml">
${fontLinks}
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
${type === 'article' ? '<div class="progress" aria-hidden="true"><i></i></div>' : ''}
<header class="site-header"><div class="wrap">
  <a class="brand" href="${base}"><span class="brand-ball" aria-hidden="true">⚽</span><span>${esc(config.title)}</span><small>${esc(config.titleEn)}</small></a>
  <nav class="nav"><a href="${base}">글 목록</a>${journey ? `<a href="${base}journey/">성장 연대기</a>` : ''}<a href="${base}about/">주니어 소개</a></nav>
</div></header>
${body}
<footer class="site-footer"><div class="wrap">
  <p><b>${esc(config.title)}</b> · ${esc(config.tagline)}</p>
  <p>${esc(player.note)}</p>
  <p><a href="${base}feed.xml">RSS 구독</a></p>
</div></footer>
${type === 'article' ? `<script>(()=>{const b=document.querySelector('.progress i');const f=()=>{const h=document.documentElement;const m=h.scrollHeight-h.clientHeight;b.style.width=(m>0?h.scrollTop/m*100:0)+'%'};addEventListener('scroll',f,{passive:true});f()})();</script>` : ''}
</body>
</html>
`;

const coverOf = (p, base) => (p.cover ? `${base}${p.cover}` : `${base}covers/${p.slug}.svg`);
const coverTag = (p, base, cls = '') => `<img class="${cls}" src="${esc(coverOf(p, base))}" alt="${esc(p.cover ? p.coverAlt : '')}" loading="lazy" width="1200" height="630">`;

function statusCard(base) {
  const measured = (v) => v !== null && v !== undefined && v !== '';
  const profileRows = player.profile.map((f) => `<div class="prof"><span>${esc(f.label)}</span><b>${measured(current[f.key]) ? esc(current[f.key]) + esc(f.unit || '') : '측정 전'}</b></div>`).join('');
  const bars = player.stats.map((f) => {
    const v = current[f.key];
    return `<li><span class="stat-label">${esc(f.label)}</span><span class="bar"><i style="width:${measured(v) ? Math.max(0, Math.min(100, v)) : 0}%"></i></span><b class="stat-val">${measured(v) ? esc(v) : '?'}</b></li>`;
  }).join('');
  const cond = current.condition;
  return `<aside class="status" aria-label="선수 상태창">
  <div class="status-head"><div class="avatar" aria-hidden="true">${player.backNumber}</div><div><div class="status-name">${esc(player.nickname)} <small>${player.age}살 · ${esc(player.position)}</small></div>${player.team ? `<div class="status-cond">소속: <b>${esc(player.team)}</b></div>` : ''}<div class="status-cond">${esc(player.condition?.label || '컨디션')}: <b>${measured(cond) ? esc(cond) : '측정 전'}</b></div></div></div>
  <div class="profile">${profileRows}</div>
  <ul class="stats">${bars}</ul>
  <p class="status-note">${posts.some((p) => p.changes.length) ? `최근 변화: ${esc(shortDate([...posts].reverse().find((p) => p.changes.length).date))}` : '아직 측정 전입니다. 첫 측정 후 채워집니다.'}</p>
  <a class="status-more" href="${base}about/">주니어 소개 보기 →</a>
</aside>`;
}

const postCard = (p, base, feature = false) => `<article class="card${feature ? ' feature' : ''}">
  <a href="${base}posts/${p.slug}/" class="card-link">
    <div class="card-cover">${coverTag(p, base)}</div>
    <div class="card-body">
      <div class="meta"><span class="cat">${esc(p.category)}</span><time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time></div>
      <h2>${esc(p.title)}</h2>
      <p>${esc(p.summary)}</p>
    </div>
  </a>
</article>`;

// ---------- 페이지 생성 ----------
const out = new Map(); // 경로 → 내용
const newest = [...posts].reverse();

const pillars = config.pillars || [];
const pillarOf = (c) => pillars.find((x) => x.category === c);
const categories = [...new Set([...pillars.map((x) => x.category).filter((c) => newest.some((p) => p.category === c)), ...newest.map((p) => p.category)])];
const pillarSection = (base) => pillars.length ? `<section class="pillars wrap" aria-label="블로그 주제"><h2 class="sr">이 블로그에서 다루는 이야기</h2>${pillars.map((x) => {
  const n = newest.filter((p) => p.category === x.category).length;
  const inner = `<span class="pillar-emoji" aria-hidden="true">${x.emoji || '⚽'}</span><b>${esc(x.category)}</b><span class="pillar-desc">${esc(x.desc)}</span><small>${n ? `글 ${n}편` : '곧 연재'}</small>`;
  return n ? `<a class="pillar" href="${base}category/${encodeURIComponent(x.category)}/">${inner}</a>` : `<div class="pillar soon">${inner}</div>`;
}).join('')}</section>` : '';
const seriesMap = new Map();
for (const p of posts) if (p.series) { if (!seriesMap.has(p.series)) seriesMap.set(p.series, []); seriesMap.get(p.series).push(p); }
const seriesBox = (p, base) => {
  const list = seriesMap.get(p.series);
  if (!list || list.length < 2) return '';
  const idx = list.indexOf(p);
  return `<nav class="series-box" aria-label="연재 목차"><div class="series-head"><span>연재</span><b>${esc(p.series)}</b><small>${idx + 1} / ${list.length}화</small></div><ol>${list.map((x) => `<li${x === p ? ' aria-current="page"' : ''}><a href="${base}posts/${x.slug}/">${esc(x.title)}</a></li>`).join('')}</ol></nav>`;
};
const activeSeries = () => [...seriesMap].filter(([, list]) => list.length >= 2);
const seriesSection = (base) => activeSeries().length ? `<section class="series-strip wrap" aria-label="연재"><h2>연재 중</h2><div class="series-cards">${activeSeries().map(([name, list]) => `<a class="series-card" href="${base}posts/${list[0].slug}/"><small>${list.length}편 · 1화부터 읽기</small><b>${esc(name)}</b><span>${esc(list[list.length - 1].title)}</span></a>`).join('')}</div></section>` : '';
const firstChronicle = seriesMap.get(journey?.title)?.[0];

const listBody = (list, base, heading = '') => `<main class="wrap layout">
<div class="main-col">
${heading}
${list.length ? `<div class="grid">${list.map((p, i) => postCard(p, base, !heading && i === 0)).join('\n')}</div>` : '<p class="empty">아직 올라온 글이 없습니다.</p>'}
</div>
<div class="side-col">${statusCard(base)}
<nav class="cats card-plain" aria-label="카테고리"><h3>카테고리</h3>${categories.map((c) => `<a href="${base}category/${encodeURIComponent(c)}/">${esc(c)} <small>${newest.filter((p) => p.category === c).length}</small></a>`).join('')}</nav>
</div>
</main>`;

out.set('index.html', page({
  title: `${config.title} - ${config.tagline}`, description: config.description, canonical: '/', base: '',
  body: `<section class="hero"><div class="wrap"><p class="hero-kicker">${esc(config.titleEn)}</p><h1>${esc(config.tagline)}</h1><p>${esc(config.description)}</p><div class="hero-cta">${firstChronicle ? `<a class="btn primary" href="posts/${firstChronicle.slug}/">처음이라면, 연대기 1화부터 →</a>` : ''}${journey ? '<a class="btn" href="journey/">성장 연대기 한눈에 보기</a>' : ''}</div></div></section>\n${seriesSection('')}\n${pillarSection('')}\n${listBody(newest, '')}`,
}));

for (const c of categories) {
  const base = '../../';
  out.set(`category/${c}/index.html`, page({
    title: `${c} - ${config.title}`, description: `${config.title}의 ${c} 글 모음`, canonical: `/category/${encodeURIComponent(c)}/`, base,
    body: listBody(newest.filter((p) => p.category === c), base, `<h1 class="list-title">${esc(pillarOf(c)?.emoji ? pillarOf(c).emoji + ' ' : '')}${esc(c)}</h1>${pillarOf(c) ? `<p class="list-desc">${esc(pillarOf(c).desc)}</p>` : ''}`),
  }));
}

posts.forEach((p, i) => {
  const base = '../../';
  const prev = posts[i - 1], next = posts[i + 1];
  const changes = p.changes.length ? `<section class="levelup"><h2>📈 상태창 변화</h2><ul>${p.changes.map((c) => `<li><span>${esc(c.label)}</span><span class="from">${c.before ?? '측정 전'}${c.before != null ? esc(c.unit) : ''}</span><span class="arrow">→</span><b>${esc(c.after)}${esc(c.unit)}</b>${c.diff ? `<em class="${c.diff > 0 ? 'up' : 'down'}">${c.diff > 0 ? '+' : ''}${c.diff}</em>` : ''}</li>`).join('')}</ul></section>` : '';
  out.set(`posts/${p.slug}/index.html`, page({
    title: `${p.title} - ${config.title}`, description: p.summary || config.description, canonical: `/posts/${p.slug}/`, base, type: 'article',
    image: p.cover || '',
    body: `<main class="wrap post-wrap">
<article class="post">
  <header class="post-head">
    <div class="meta"><a class="cat" href="${base}category/${encodeURIComponent(p.category)}/">${esc(p.category)}</a><time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time><span>${p.readMin}분 읽기</span>${p.mood ? `<span class="mood">오늘의 기분 · ${esc(p.mood)}</span>` : ''}</div>
    <h1>${esc(p.title)}</h1>
    ${p.summary ? `<p class="lead">${esc(p.summary)}</p>` : ''}
  </header>
  <figure class="post-cover">${coverTag(p, base)}</figure>
  <div class="prose">${p.html}</div>
  ${seriesBox(p, base)}
  ${changes}
  ${p.tags.length ? `<p class="tags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</p>` : ''}
  <nav class="pager">${prev ? `<a href="${base}posts/${prev.slug}/"><small>← 이전 글</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${base}posts/${next.slug}/"><small>다음 글 →</small>${esc(next.title)}</a>` : '<span></span>'}</nav>
</article>
<div class="side-col">${statusCard(base)}</div>
</main>`,
  }));
});

out.set('about/index.html', page({
  title: `주니어 소개 - ${config.title}`, description: `${config.title}의 주인공, ${player.age}살 ${player.position} 주니어를 소개합니다.`, canonical: '/about/', base: '../',
  body: `<main class="wrap post-wrap"><article class="post"><header class="post-head"><h1>주니어를 소개합니다</h1><p class="lead">${player.age}살, 등번호 ${player.backNumber}번 ${esc(player.position)}. 이 블로그의 주인공입니다.</p></header>
<div class="prose"><p>${esc(config.description)}</p>
<h2>이 블로그에서 다루는 이야기</h2><ul>${pillars.map((x) => `<li><b>${esc(x.category)}</b>: ${esc(x.desc)}</li>`).join('')}</ul>
<h2>블로그 규칙</h2><ul><li>${esc(player.note)}</li><li>상태창 점수는 프로 선수와 비교한 점수가 아니라, 첫 측정을 기준으로 한 우리 아이만의 성장 지표입니다.</li><li>글은 아빠의 관찰과 기록이며, 의학·전문 코칭 조언이 아닙니다.</li></ul>
<h2>지금까지의 기록</h2><ul>${newest.map((p) => `<li><a href="../posts/${p.slug}/">${esc(p.title)}</a> <small>${shortDate(p.date)}</small></li>`).join('')}</ul></div></article>
<div class="side-col">${statusCard('../')}</div></main>`,
}));

if (journey) {
  const base = '../';
  const linkOf = (slug) => posts.find((p) => p.slug === slug);
  const item = (e, kind) => {
    const post = linkOf(e.post);
    return `<li class="tl-item ${kind}"><span class="tl-dot" aria-hidden="true"></span><div class="tl-card"><small>${esc(e.when)}</small><b>${esc(e.title)}</b><p>${esc(e.text)}</p>${post ? `<a href="${base}posts/${post.slug}/">이야기 읽기 →</a>` : e.post ? '<span class="tl-soon">글 공개 예정</span>' : ''}</div></li>`;
  };
  out.set('journey/index.html', page({
    title: `성장 연대기 - ${config.title}`, description: journey.intro, canonical: '/journey/', base,
    body: `<main class="wrap journey"><header class="journey-head"><p class="hero-kicker">${esc(config.titleEn)}</p><h1>${esc(journey.title)}</h1><p>${esc(journey.intro)}</p></header>
<ol class="timeline">
<li class="tl-label">지나온 길</li>
${journey.past.map((e) => item(e, 'past')).join('\n')}
<li class="tl-label now-label">지금</li>
${item(journey.now, 'now')}
<li class="tl-label">앞으로 가고 싶은 길</li>
${journey.future.map((e) => item(e, 'future')).join('\n')}
</ol></main>`,
  }));
}

out.set('404.html', page({ title: `페이지를 찾을 수 없어요 - ${config.title}`, description: '', canonical: '/404.html', base: '/', body: '<main class="wrap"><p class="empty">공이 골대를 벗어났어요. 없는 페이지입니다.<br><a href="./">처음으로</a></p></main>' }));

const rssItems = newest.slice(0, 30).map((p) => `<item><title>${esc(p.title)}</title><link>${esc(`${siteUrl}/posts/${p.slug}/`)}</link><guid>${esc(`${siteUrl}/posts/${p.slug}/`)}</guid><pubDate>${p.date.toUTCString()}</pubDate><category>${esc(p.category)}</category><description>${esc(p.summary)}</description></item>`).join('\n');
out.set('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(config.title)}</title><link>${esc(siteUrl)}/</link><description>${esc(config.description)}</description><language>ko</language>\n${rssItems}\n</channel></rss>\n`);
out.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/about/', ...(journey ? ['/journey/'] : []), ...newest.map((p) => `/posts/${p.slug}/`)].map((u) => `<url><loc>${esc(siteUrl + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
out.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
out.set('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2f9e5b"/><text x="32" y="44" font-size="34" text-anchor="middle">⚽</text></svg>`);
out.set('.nojekyll', '');
for (const p of posts) if (!p.cover) out.set(`covers/${p.slug}.svg`, coverSvg(p, pillarOf(p.category)?.emoji));

// ---------- 쓰기 ----------
await fs.rm(dist, { recursive: true, force: true });
for (const [rel, content] of out) {
  const file = path.join(dist, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}
await fs.copyFile(path.join(root, 'src', 'style.css'), path.join(dist, 'style.css'));
await fs.cp(path.join(root, 'images'), path.join(dist, 'images'), { recursive: true });
for (const p of posts) if (p.cover) await fs.access(path.join(root, p.cover)).catch(() => { throw new Error(`${p.file}: cover 파일 ${p.cover} 이 없습니다`); });
console.log(`dist/ 생성: 공개 글 ${posts.length}편${scheduled ? `, 예약 ${scheduled}편` : ''}${showDrafts ? ' (예약 글 포함 미리보기)' : ''}`);
