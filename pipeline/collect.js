// 실제 데이터 수집: API-Sports → 분석 → data/matches.json
// 사용법: APISPORTS_KEY=... node pipeline/collect.js [리그id ...]
import { ApiSports, BudgetError, seasonFor, fetchGames, fetchInjuries, fetchPlayerStats } from './apisports.js';
import { analyzeLeague, updateHistory, backtest } from './analyze.js';
import { addCommentary } from './commentary.js';
import { addTeamNews } from './news.js';
import { dataPath, readJson, writeJson, loadConfig } from './store.js';

const config = await loadConfig();
if (!process.env.APISPORTS_KEY) {
  console.error('APISPORTS_KEY 환경변수가 없습니다. api-sports.io 무료 키를 넣어 주세요. (화면만 보려면 `npm run sample`)');
  process.exit(1);
}
const cache = await readJson(dataPath('cache.json'), {});
const previous = await readJson(dataPath('matches.json'), { matches: [], leagues: [] });
const api = new ApiSports({ key: process.env.APISPORTS_KEY, dailyLimit: config.api.dailyLimitPerSport, minIntervalMs: config.api.minIntervalMs, usage: cache.usage });
const players = cache.players || {}; // `${playerId}:${season}` → { at, stats }
const PLAYER_TTL = 3 * 86400000;

const only = process.argv.slice(2);
const leagues = only.length ? config.leagues.filter((l) => only.includes(l.id)) : config.leagues;
const now = Date.now();
const matches = [];
const leagueStatus = [];
const gamesByLeague = new Map();
let lookups = 0;

for (const league of leagues) {
  const season = seasonFor(league, new Date(now));
  try {
    const games = await fetchGames(api, league, season);
    gamesByLeague.set(league.id, games);
    const horizon = now + config.daysAhead * 86400000;
    const upcoming = games.filter((g) => g.status === 'scheduled' && Date.parse(g.date) >= now && Date.parse(g.date) <= horizon);

    let injuriesByFixture = new Map();
    const playerStats = new Map();
    let note = null;
    if (league.sport === 'football' && upcoming.length) {
      try {
        const dates = [...new Set(upcoming.map((g) => g.date.slice(0, 10)))];
        injuriesByFixture = await fetchInjuries(api, league, season, dates);
        const wanted = upcoming.flatMap((g) => injuriesByFixture.get(g.id) || []);
        for (const p of wanted) {
          const key = `${p.playerId}:${season}`;
          if (!players[key] || now - players[key].at > PLAYER_TTL) {
            if (lookups >= config.api.maxPlayerLookupsPerRun) continue;
            lookups++;
            players[key] = { at: now, stats: await fetchPlayerStats(api, p.playerId, season, league.apiId) };
          }
          if (players[key].stats) playerStats.set(p.playerId, players[key].stats);
        }
      } catch (error) {
        // 부상자 조회가 실패해도 경기 분석은 계속한다.
        note = `부상자 조회 실패: ${error.message}`;
        console.warn(`! ${league.name} ${note}`);
      }
    }
    const analyzed = analyzeLeague({ league, games, injuriesByFixture, playerStats, now, daysAhead: config.daysAhead });
    matches.push(...analyzed);
    leagueStatus.push({ id: league.id, name: league.name, sport: league.sport, season, ok: true, finished: games.filter((g) => g.status === 'finished').length, upcoming: analyzed.length, note, backtest: backtest(games, league.sport) });
    console.log(`✓ ${league.name} ${season}: 종료 ${games.filter((g) => g.status === 'finished').length}경기, 분석 ${analyzed.length}경기`);
  } catch (error) {
    console.error(`✗ ${league.name} ${season}: ${error.message}`);
    leagueStatus.push({ id: league.id, name: league.name, sport: league.sport, season, ok: false, error: error.message });
    // 실패한 리그는 직전 분석 중 아직 시작 전인 경기를 유지한다.
    matches.push(...previous.matches.filter((m) => m.leagueId === league.id && Date.parse(m.date) > now));
    if (!(error instanceof BudgetError) && /key|token|subscription/i.test(error.message)) break;
  }
}

// 이번에 실행하지 않은 리그의 경기는 유지
if (only.length) matches.push(...previous.matches.filter((m) => !only.includes(m.leagueId) && Date.parse(m.date) > now));
matches.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
const news = await addTeamNews(matches, config.news, cache.news, now);
const commentary = await addCommentary(matches, config.commentary, cache.commentary);
const history = updateHistory(await readJson(dataPath('history.json'), { entries: [] }), matches, gamesByLeague);
// 이번에 실행하지 않은 리그의 상태는 유지
for (const s of previous.leagues || []) if (!leagueStatus.some((x) => x.id === s.id) && config.leagues.some((l) => l.id === s.id)) leagueStatus.push(s);

for (const key of Object.keys(players)) if (now - players[key].at > 30 * 86400000) delete players[key];
await writeJson(dataPath('matches.json'), { updatedAt: new Date(now).toISOString(), sample: false, leagues: leagueStatus, matches });
await writeJson(dataPath('history.json'), history);
await writeJson(dataPath('cache.json'), { usage: api.usage, players, commentary, news });
console.log(`\n분석 ${matches.length}경기 저장. 오늘 API 사용량: ${JSON.stringify(api.usage)}`);
if (!leagueStatus.some((s) => s.ok)) process.exit(1);
