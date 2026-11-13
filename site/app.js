// 종목 필터. 목록은 서버에서 미리 렌더링되어 있고 여기서는 보이기/숨기기만 한다.
(() => {
  const chips = document.querySelector('.chips');
  if (!chips) return;
  const matches = [...document.querySelectorAll('.match[data-sport]')];
  const days = [...document.querySelectorAll('.day')];
  const empty = document.getElementById('empty');
  const apply = (sport) => {
    matches.forEach((m) => { m.hidden = sport !== 'all' && m.dataset.sport !== sport; });
    days.forEach((d) => { d.hidden = !matches.some((m) => !m.hidden && m.dataset.day === d.dataset.day); });
    chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.sport === sport)));
    if (empty) empty.hidden = matches.some((m) => !m.hidden);
    history.replaceState(null, '', sport === 'all' ? location.pathname : `?sport=${sport}`);
  };
  chips.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) apply(c.dataset.sport); });
  const initial = new URLSearchParams(location.search).get('sport');
  if (initial && chips.querySelector(`.chip[data-sport="${CSS.escape(initial)}"]`)) apply(initial);
})();
