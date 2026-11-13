// API 키 없이 화면을 확인하기 위한 샘플 데이터. 팀·선수·결과는 모두 가상이며, 실제 분석 코드를 그대로 거친다.
import { analyzeLeague, backtest, updateHistory } from './analyze.js';
import { dataPath, writeJson } from './store.js';

let seed = 20261113;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const poisson = (lambda) => { let k = 0, p = 1; const l = Math.exp(-lambda); do { k++; p *= rand(); } while (p > l); return k - 1; };
const DAY = 86400000;
const now = Date.now();

const LEAGUES = [
  { id: 'sample-football', sport: 'football', name: '샘플 축구 리그', teams: ['한강 FC', '남산 유나이티드', '동해 시티', '백두 로버스', '탐라 애슬레틱', '금강 원더러스', '설악 타운', '낙동 알비온'], gapDays: 4 },
  { id: 'sample-basketball', sport: 'basketball', name: '샘플 농구 리그', teams: ['북악 호크스', '서해 웨이브', '태백 베어스', '영산 썬더', '소백 나이츠', '한라 스톰'], gapDays: 3 },
  { id: 'sample-baseball', sport: 'baseball', name: '샘플 야구 리그', teams: ['미리내 스타즈', '가람 타이거즈', '마루 이글스', '다솜 라이온즈', '새벽 위즈', '누리 랜더스'], gapDays: 2 },
  { id: 'sample-volleyball', sport: 'volleyball', name: '샘플 배구 리그', teams: ['바람 스파이커스', '노을 블루윙스', '아라 점퍼스', '온새 스카이'], gapDays: 4 },
];

function score(sport, sh, sa) {
  if (sport === 'football') return { home: poisson(1.55 * sh / sa), away: poisson(1.15 * sa / sh) };
  if (sport === 'basketball') { let h = Math.round(84 * sh + rand() * 44), a = Math.round(81 * sa + rand() * 44); if (h === a) h += 2; return { home: h, away: a }; }
  if (sport === 'baseball') { let h = poisson(4.6 * sh / sa), a = poisson(4.3 * sa / sh); if (h === a) h += 1; return { home: h, away: a }; }
  const homeWins = rand() < 0.5 + (sh - sa) * 1.2 + 0.05; const loser = Math.floor(rand() * 3);
  return homeWins ? { home: 3, away: loser } : { home: loser, away: 3 };
}

function makeGames(league) {
  const teams = league.teams.map((name, i) => ({ id: i + 1, name, strength: 0.78 + (0.5 * (league.teams.length - i)) / league.teams.length + rand() * 0.1 }));
  const pairs = [];
  for (let round = 0; round < 4; round++) for (const h of teams) for (const a of teams) if (h !== a && (round % 2 === 0 ? h.id < a.id : h.id > a.id)) pairs.push([h, a]);
  for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  const perDay = Math.floor(teams.length / 2);
  const upcomingCount = perDay * 2;
  const pastCount = pairs.length - upcomingCount;
  return pairs.map(([h, a], i) => {
    const past = i < pastCount;
    const slot = past ? -(Math.floor((pastCount - 1 - i) / perDay) + 1) * league.gapDays : Math.floor((i - pastCount) / perDay) * 1.2 + 0.4;
    const date = new Date(now + slot * DAY + (i % perDay) * 7200000).toISOString();
    return { id: 1000 + i, date, status: past ? 'finished' : 'scheduled', home: { id: h.id, name: h.name }, away: { id: a.id, name: a.name }, score: past ? score(league.sport, h.strength, a.strength) : null };
  });
}

const SAMPLE_PLAYERS = [
  { name: '김샘플', type: 'Missing Fixture', reason: '햄스트링 부상', stats: { position: 'Attacker', appearances: 11, starts: 10, minutes: 860, rating: 7.42, goals: 7, assists: 3 } },
  { name: '이가상', type: 'Missing Fixture', reason: '무릎 부상', stats: { position: 'Defender', appearances: 12, starts: 12, minutes: 1080, rating: 7.05, goals: 0, assists: 1 } },
  { name: '박예시', type: 'Questionable', reason: '발목 염좌', stats: { position: 'Midfielder', appearances: 9, starts: 6, minutes: 540, rating: 6.88, goals: 2, assists: 4 } },
  { name: '최임의', type: 'Missing Fixture', reason: '경고 누적', stats: null },
];

let playerSeq = 9000;
const matches = [];
const leagues = [];
const gamesByLeague = new Map();
for (const league of LEAGUES) {
  const games = makeGames(league);
  gamesByLeague.set(league.id, games);
  const injuriesByFixture = new Map();
  const playerStats = new Map();
  if (league.sport === 'football') {
    const next = games.filter((g) => g.status === 'scheduled');
    const give = (game, side, players) => {
      const list = injuriesByFixture.get(game.id) || [];
      players.forEach((p, i) => { const playerId = ++playerSeq; list.push({ playerId, name: p.name, teamId: game[side].id, type: p.type, reason: p.reason }); if (p.stats) playerStats.set(playerId, p.stats); });
      injuriesByFixture.set(game.id, list);
    };
    give(next[0], 'home', SAMPLE_PLAYERS.slice(0, 2)); give(next[0], 'away', SAMPLE_PLAYERS.slice(2, 3));
    if (next[2]) give(next[2], 'away', SAMPLE_PLAYERS.slice(3));
  }
  const analyzed = analyzeLeague({ league, games, injuriesByFixture, playerStats, now, daysAhead: 3 });
  matches.push(...analyzed);
  leagues.push({ id: league.id, name: league.name, sport: league.sport, season: '샘플', ok: true, finished: games.filter((g) => g.status === 'finished').length, upcoming: analyzed.length, backtest: backtest(games, league.sport) });
}
// 샘플은 가상 팀이라 실제 기사 대신 검색 링크만 붙인다.
for (const m of matches) for (const t of [m.home, m.away]) t.news = { query: `${t.name} 부상`, items: [] };
matches.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
await writeJson(dataPath('matches.json'), { updatedAt: new Date(now).toISOString(), sample: true, leagues, matches });
await writeJson(dataPath('history.json'), updateHistory({ entries: [] }, matches, gamesByLeague));
console.log(`샘플 데이터 생성: ${matches.length}경기`);
