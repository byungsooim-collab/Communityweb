// 한 리그의 경기 목록(+부상자)을 받아 예정 경기별 분석 데이터를 만든다. 실제 수집과 샘플 생성이 함께 쓴다.
import { footballModel, eloModel, injuryAdjustment, pickOf } from './model.js';

const DAY = 86400000;
const perGame = (n, games) => (games ? Number((n / games).toFixed(2)) : 0);

function teamSummary(teamId, finished) {
  const games = finished.filter((g) => g.home.id === teamId || g.away.id === teamId);
  const rec = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, home: { played: 0, win: 0, draw: 0, loss: 0 }, away: { played: 0, win: 0, draw: 0, loss: 0 } };
  const rows = games.map((g) => {
    const isHome = g.home.id === teamId;
    const gf = isHome ? g.score.home : g.score.away;
    const ga = isHome ? g.score.away : g.score.home;
    const result = gf > ga ? 'win' : gf < ga ? 'loss' : 'draw';
    const side = isHome ? rec.home : rec.away;
    rec.played++; rec[result]++; rec.gf += gf; rec.ga += ga; side.played++; side[result]++;
    return { date: g.date, home: isHome, opponent: (isHome ? g.away : g.home).name, gf, ga, result };
  });
  const last5 = rows.slice(-5).reverse();
  return {
    record: { ...rec, gfPerGame: perGame(rec.gf, rec.played), gaPerGame: perGame(rec.ga, rec.played) },
    last5,
    last5Summary: { win: last5.filter((r) => r.result === 'win').length, draw: last5.filter((r) => r.result === 'draw').length, loss: last5.filter((r) => r.result === 'loss').length,
      gfPerGame: perGame(last5.reduce((s, r) => s + r.gf, 0), last5.length), gaPerGame: perGame(last5.reduce((s, r) => s + r.ga, 0), last5.length) },
    lastPlayed: rows.at(-1)?.date ?? null,
  };
}

function standings(finished, sport) {
  const table = new Map();
  for (const g of finished) for (const t of [g.home, g.away]) if (!table.has(t.id)) table.set(t.id, { id: t.id, points: 0, wins: 0, played: 0, diff: 0 });
  for (const g of finished) {
    const h = table.get(g.home.id), a = table.get(g.away.id);
    const d = g.score.home - g.score.away;
    h.played++; a.played++; h.diff += d; a.diff -= d;
    if (d > 0) { h.wins++; h.points += 3; } else if (d < 0) { a.wins++; a.points += 3; } else { h.points++; a.points++; }
  }
  // 축구는 승점, 나머지는 승률 순.
  const key = (t) => (sport === 'football' ? t.points : t.played ? t.wins / t.played : 0);
  const sorted = [...table.values()].sort((x, y) => key(y) - key(x) || y.diff - x.diff);
  return new Map(sorted.map((t, i) => [t.id, i + 1]));
}

export function analyzeLeague({ league, games, injuriesByFixture = new Map(), playerStats = new Map(), now = Date.now(), daysAhead = 3 }) {
  const finished = games.filter((g) => g.status === 'finished' && g.score).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const upcoming = games
    .filter((g) => g.status === 'scheduled' && Date.parse(g.date) >= now && Date.parse(g.date) <= now + daysAhead * DAY)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!upcoming.length) return [];

  const model = league.sport === 'football' ? footballModel(finished, now) : eloModel(finished, league.sport);
  const ranks = standings(finished, league.sport);
  const teamCount = ranks.size;

  return upcoming.map((g) => {
    const home = teamSummary(g.home.id, finished);
    const away = teamSummary(g.away.id, finished);
    const listed = (injuriesByFixture.get(g.id) || []).map((p) => ({ ...p, stats: playerStats.get(p.playerId) ?? null }));
    const injuries = { home: listed.filter((p) => p.teamId === g.home.id), away: listed.filter((p) => p.teamId === g.away.id) };

    let adjust = null;
    let base = null;
    if (league.sport === 'football' && listed.length) {
      const h = injuryAdjustment(injuries.home, home.record.gf, home.record.played);
      const a = injuryAdjustment(injuries.away, away.record.gf, away.record.played);
      adjust = { homeAttack: h.attack, homeDefense: h.defense, awayAttack: a.attack, awayDefense: a.defense };
      base = model.predict(g.home.id, g.away.id);
    }
    const prediction = model.predict(g.home.id, g.away.id, adjust || {});
    const minPlayed = Math.min(home.record.played, away.record.played);
    const h2h = finished
      .filter((x) => (x.home.id === g.home.id && x.away.id === g.away.id) || (x.home.id === g.away.id && x.away.id === g.home.id))
      .slice(-5).reverse()
      .map((x) => ({ date: x.date, home: x.home.name, away: x.away.name, score: x.score }));
    const rest = (t) => (t.lastPlayed ? Math.floor((Date.parse(g.date) - Date.parse(t.lastPlayed)) / DAY) : null);

    return {
      id: `${league.id}-${g.id}`,
      sport: league.sport, leagueId: league.id, leagueName: league.name, date: g.date,
      home: { name: g.home.name, rank: ranks.get(g.home.id) ?? null, restDays: rest(home), ...home },
      away: { name: g.away.name, rank: ranks.get(g.away.id) ?? null, restDays: rest(away), ...away },
      teamCount,
      prediction: { ...prediction, ...pickOf(prediction, league.sport), sample: model.sample, lowData: minPlayed < 5 },
      injuryImpact: adjust && { ...adjust, before: { pHome: base.pHome, pDraw: base.pDraw, pAway: base.pAway } },
      injuries: { available: league.sport === 'football', home: injuries.home, away: injuries.away },
      h2h,
      commentary: null,
    };
  });
}

// 예측 기록과 적중 여부. 경기가 끝나면 결과를 채운다.
export function updateHistory(history, matches, gamesByLeague) {
  const entries = new Map((history.entries || []).map((e) => [e.id, e]));
  for (const m of matches) {
    entries.set(m.id, { id: m.id, sport: m.sport, leagueName: m.leagueName, date: m.date, home: m.home.name, away: m.away.name,
      pick: m.prediction.pick, confidence: m.prediction.confidence, p: Math.max(m.prediction.pHome, m.prediction.pDraw, m.prediction.pAway), result: null });
  }
  for (const e of entries.values()) {
    if (e.result) continue;
    const [leagueId, gameId] = [e.id.slice(0, e.id.lastIndexOf('-')), e.id.slice(e.id.lastIndexOf('-') + 1)];
    const g = (gamesByLeague.get(leagueId) || []).find((x) => String(x.id) === gameId);
    if (g?.status === 'finished' && g.score) {
      e.result = g.score.home > g.score.away ? 'home' : g.score.home < g.score.away ? 'away' : 'draw';
      e.score = g.score;
      e.hit = e.result === e.pick;
    }
  }
  const all = [...entries.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const cutoff = Date.now() - 14 * DAY; // 결과가 끝내 안 들어온 예측은 2주 뒤 정리
  return { entries: all.filter((e) => e.result || Date.parse(e.date) > cutoff).slice(0, 1000) };
}

// 백테스트: 시즌의 각 경기를 "그 경기 이전 결과만" 가지고 예측했을 때의 적중률. 부상자 보정은 포함하지 않는다.
export function backtest(games, sport, { maxGames = 300 } = {}) {
  const finished = games.filter((g) => g.status === 'finished' && g.score).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const warmup = Math.max(30, Math.floor(finished.length * 0.2));
  const start = Math.max(warmup, finished.length - maxGames);
  let total = 0, hit = 0, highTotal = 0, highHit = 0;
  for (let i = start; i < finished.length; i++) {
    const g = finished[i];
    const before = finished.slice(0, i);
    const model = sport === 'football' ? footballModel(before, Date.parse(g.date)) : eloModel(before, sport);
    const { pick, confidence } = pickOf(model.predict(g.home.id, g.away.id), sport);
    const result = g.score.home > g.score.away ? 'home' : g.score.home < g.score.away ? 'away' : 'draw';
    total++; if (pick === result) hit++;
    if (confidence === 'high') { highTotal++; if (pick === result) highHit++; }
  }
  return total ? { total, hit, highTotal, highHit } : null;
}
