// 그림이 아직 없는 글에 쓰는 일러스트풍 표지(SVG). 카테고리마다 하늘색이 달라진다.
const PALETTES = {
  공지: ['#ffd6a5', '#ffadad'], 성장기록: ['#bde0fe', '#a2d2ff'], 경기: ['#caffbf', '#9bf6ff'],
  훈련: ['#fdffb6', '#ffd6a5'], 식단: ['#ffc6ff', '#ffadad'], 멘탈: ['#d0bfff', '#bde0fe'],
};
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function coverSvg(post) {
  const [sky1, sky2] = PALETTES[post.category] || ['#b9fbc0', '#a3c4f3'];
  const h = hash(post.slug);
  const ballX = 520 + (h % 420), ballY = 330 + (h % 70);
  const clouds = [0, 1, 2].map((i) => {
    const x = ((h >> (i * 5)) % 1000) + 60, y = 70 + i * 55 + ((h >> (i * 3)) % 30);
    return `<g fill="#fff" opacity=".85"><ellipse cx="${x}" cy="${y}" rx="70" ry="24"/><ellipse cx="${x + 40}" cy="${y - 16}" rx="44" ry="26"/><ellipse cx="${x - 36}" cy="${y - 8}" rx="34" ry="20"/></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cc27a"/><stop offset="1" stop-color="#2f9e5b"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#sky)"/>
<circle cx="${1040 - (h % 200)}" cy="110" r="52" fill="#fff6c9"/>
${clouds}
<path d="M0 300 Q600 250 1200 300 L1200 630 L0 630Z" fill="url(#grass)"/>
${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${i * 240 - 60} 630 L${i * 200 + 40} 290 L${i * 200 + 140} 290 L${i * 240 + 60} 630Z" fill="#fff" opacity=".06"/>`).join('')}
<path d="M120 630 Q600 330 1080 630" fill="none" stroke="#fff" stroke-width="6" opacity=".7"/>
<g transform="translate(90 205)" stroke="#fff" stroke-width="8" fill="none" stroke-linejoin="round"><path d="M0 110 V0 H230 V110"/><path d="M0 0 L30 30 H200 L230 0" opacity=".5"/></g>
<g transform="translate(${ballX} ${ballY})">
<ellipse cx="0" cy="58" rx="54" ry="12" fill="#1d6b3c" opacity=".35"/>
<circle r="52" fill="#fff" stroke="#24313a" stroke-width="5"/>
<path d="M0 -18 L17 -6 L11 14 L-11 14 L-17 -6Z" fill="#24313a"/>
<path d="M0 -52 L0 -18 M17 -6 L47 -20 M11 14 L30 42 M-11 14 L-30 42 M-17 -6 L-47 -20" stroke="#24313a" stroke-width="4"/>
</g>
<g font-family="Jua, 'Apple SD Gothic Neo', sans-serif" fill="#173b2a">
<rect x="60" y="40" rx="22" width="${Math.max(140, post.category.length * 34 + 60)}" height="54" fill="#fff" opacity=".9"/>
<text x="90" y="78" font-size="30">${esc(post.category)}</text>
</g>
<text x="1140" y="600" text-anchor="end" font-family="Jua, sans-serif" font-size="26" fill="#fff" opacity=".9">SOCCER DADDY</text>
</svg>`;
}
