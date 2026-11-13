// API-Sports (api-sports.io) 클라이언트. 종목마다 호스트와 하루 호출 한도가 따로 있다.
// 무료 요금제: 종목별 하루 100회, 분당 10회. 한도를 넘기지 않도록 호출 수를 세고 간격을 둔다.

const HOSTS = {
  football: 'v3.football.api-sports.io',
  basketball: 'v1.basketball.api-sports.io',
  baseball: 'v1.baseball.api-sports.io',
  volleyball: 'v1.volleyball.api-sports.io',
};

export class BudgetError extends Error {}

export class ApiSports {
  // usage: { date: 'YYYY-MM-DD'(UTC), football: n, ... } — 같은 날 여러 번 실행해도 한도를 공유하도록 호출자가 저장한다.
  constructor({ key, dailyLimit = 90, minIntervalMs = 6500, usage = {} }) {
    this.key = key;
    this.dailyLimit = dailyLimit;
    this.minIntervalMs = minIntervalMs;
    const today = new Date().toISOString().slice(0, 10);
    this.usage = usage.date === today ? usage : { date: today };
    this.lastCall = {};
  }

  remaining(sport) {
    return this.dailyLimit - (this.usage[sport] || 0);
  }

  async get(sport, path, params = {}) {
    if (this.remaining(sport) <= 0) throw new BudgetError(`${sport} 하루 호출 한도(${this.dailyLimit}) 소진`);
    const wait = (this.lastCall[sport] || 0) + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall[sport] = Date.now();
    this.usage[sport] = (this.usage[sport] || 0) + 1;

    const url = new URL(`https://${HOSTS[sport]}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { 'x-apisports-key': this.key }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${sport} ${path}: HTTP ${res.status}`);
    const left = Number(res.headers.get('x-ratelimit-requests-remaining'));
    if (Number.isFinite(left) && res.headers.has('x-ratelimit-requests-remaining')) {
      this.usage[sport] = Math.max(this.usage[sport], 100 - left);
    }
    const body = await res.json();
    // API-Sports 는 요금제 제한·잘못된 파라미터도 HTTP 200 + errors 로 돌려준다.
    const errors = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
    if (errors?.length) throw new Error(`${sport} ${path}: ${errors.join(' / ')}`);
    return body.response ?? [];
  }
}

export function seasonFor(league, now = new Date()) {
  if (league.seasonOverride) return String(league.seasonOverride);
  const year = now.getUTCFullYear();
  if (league.season === 'calendar') return String(year);
  const start = now.getUTCMonth() + 1 >= (league.seasonStartMonth || 7) ? year : year - 1;
  return league.seasonFormat === 'range' ? `${start}-${start + 1}` : String(start);
}

const FINISHED = new Set(['FT', 'AET', 'PEN', 'AOT', 'AP']);
const SCHEDULED = new Set(['NS', 'TBD']);
const status = (short) => (FINISHED.has(short) ? 'finished' : SCHEDULED.has(short) ? 'scheduled' : 'other');
const total = (v) => (v != null && typeof v === 'object' ? v.total : v) ?? null;

// 종목별 응답을 공통 형태로 맞춘다: { id, date, status, home:{id,name}, away:{id,name}, score:{home,away}|null }
export function normalizeGame(sport, g) {
  if (sport === 'football') {
    return {
      id: g.fixture.id, date: g.fixture.date, status: status(g.fixture.status?.short),
      home: { id: g.teams.home.id, name: g.teams.home.name },
      away: { id: g.teams.away.id, name: g.teams.away.name },
      score: g.goals?.home != null && g.goals?.away != null ? { home: g.goals.home, away: g.goals.away } : null,
    };
  }
  const home = total(g.scores?.home);
  const away = total(g.scores?.away);
  return {
    id: g.id, date: g.date, status: status(g.status?.short),
    home: { id: g.teams.home.id, name: g.teams.home.name },
    away: { id: g.teams.away.id, name: g.teams.away.name },
    score: home != null && away != null ? { home, away } : null,
  };
}

export async function fetchGames(api, league, season) {
  const path = league.sport === 'football' ? 'fixtures' : 'games';
  const rows = await api.get(league.sport, path, { league: league.apiId, season });
  return rows.map((g) => normalizeGame(league.sport, g));
}

// 축구만 제공. 경기일(UTC) 단위로 조회해서 경기 id 별로 묶는다.
export async function fetchInjuries(api, league, season, dates) {
  const byFixture = new Map();
  for (const date of dates) {
    const rows = await api.get('football', 'injuries', { league: league.apiId, season, date });
    for (const r of rows) {
      const list = byFixture.get(r.fixture.id) || [];
      if (!list.some((x) => x.playerId === r.player.id)) {
        list.push({ playerId: r.player.id, name: r.player.name, teamId: r.team.id, type: r.player.type || '', reason: r.player.reason || '' });
      }
      byFixture.set(r.fixture.id, list);
    }
  }
  return byFixture;
}

// 선수의 이번 시즌 리그 기록 요약. 없으면 null.
export async function fetchPlayerStats(api, playerId, season, leagueApiId) {
  const rows = await api.get('football', 'players', { id: playerId, season });
  const stats = rows[0]?.statistics?.find((s) => s.league?.id === leagueApiId) || rows[0]?.statistics?.[0];
  if (!stats) return null;
  return {
    position: stats.games?.position || null,
    appearances: stats.games?.appearences ?? 0,
    starts: stats.games?.lineups ?? 0,
    minutes: stats.games?.minutes ?? 0,
    rating: stats.games?.rating ? Number(Number(stats.games.rating).toFixed(2)) : null,
    goals: stats.goals?.total ?? 0,
    assists: stats.goals?.assists ?? 0,
  };
}
