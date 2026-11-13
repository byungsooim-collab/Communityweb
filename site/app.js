// 미리 렌더링된 목록 위에서 필터·정렬·검색·상대시간·인피드 광고를 처리한다.
(() => {
  const list = document.getElementById('posts');
  if (!list) return;
  const cfg = JSON.parse(document.getElementById('ad-config').textContent);
  const items = [...list.querySelectorAll('.post')];
  const empty = document.getElementById('empty');
  const state = { source: 'all', sort: 'hot', q: '' };
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('s') && document.querySelector(`.chip[data-source="${CSS.escape(p.get('s'))}"]`)) state.source = p.get('s');
    if (p.get('sort') === 'new') state.sort = 'new';
  } catch {}

  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return '방금 전';
    if (m < 60) return `${m}분 전`;
    if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
    return `${Math.floor(m / 1440)}일 전`;
  };
  const refreshTimes = () => document.querySelectorAll('time[data-rel]').forEach((t) => {
    t.textContent = (t.dataset.prefix || '') + ago(t.dateTime);
  });

  const adNode = (slot, key) => {
    const box = document.createElement('li');
    box.className = 'ad';
    box.setAttribute('aria-label', '광고');
    if (cfg.client && slot) {
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.dataset.adClient = cfg.client;
      ins.dataset.adSlot = slot;
      ins.dataset.adFormat = key === 'infeed' ? 'fluid' : 'auto';
      ins.dataset.fullWidthResponsive = 'true';
      box.append(ins);
    } else if (cfg.placeholders) {
      box.innerHTML = '<div class="ad-placeholder">광고 영역</div>';
    } else return null;
    return box;
  };

  let adsPlaced = false;
  function render() {
    const q = state.q.trim().toLowerCase();
    const visible = items.filter((el) =>
      (state.source === 'all' || el.dataset.source === state.source) &&
      (!q || el.dataset.title.includes(q)));
    visible.sort(state.sort === 'new'
      ? (a, b) => b.dataset.time.localeCompare(a.dataset.time) || b.dataset.score - a.dataset.score
      : (a, b) => b.dataset.score - a.dataset.score);

    const frag = document.createDocumentFragment();
    items.forEach((el) => { el.hidden = true; });
    visible.forEach((el, i) => {
      el.hidden = false;
      el.classList.toggle('top', state.sort === 'hot' && i < 3);
      el.querySelector('.no').textContent = i + 1;
      frag.append(el);
    });
    items.filter((el) => el.hidden).forEach((el) => frag.append(el));
    list.querySelectorAll('.ad').forEach((el) => el.remove());
    list.append(frag);
    empty.hidden = visible.length > 0;

    // 인피드 광고는 첫 렌더에서만 실제 광고를 요청한다(필터를 바꿀 때마다 재요청하지 않도록).
    if (cfg.infeedEvery > 0 && !(cfg.client && adsPlaced)) {
      for (let i = cfg.infeedEvery; i < visible.length; i += cfg.infeedEvery) {
        const ad = adNode(cfg.slots.infeed, 'infeed');
        if (!ad) break;
        visible[i].before(ad);
        if (cfg.client) (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
      adsPlaced = true;
    }

    document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.source === state.source)));
    document.querySelectorAll('.sort button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
    const p = new URLSearchParams();
    if (state.source !== 'all') p.set('s', state.source);
    if (state.sort !== 'hot') p.set('sort', state.sort);
    history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
  }

  document.querySelector('.chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.source = chip.dataset.source;
    render();
    window.scrollTo({ top: 0 });
  });
  document.querySelector('.sort').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { state.sort = b.dataset.sort; render(); }
  });
  document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });

  refreshTimes();
  setInterval(refreshTimes, 60000);
  render();
})();
