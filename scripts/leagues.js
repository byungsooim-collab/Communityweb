// 리그 ID 확인용: APISPORTS_KEY=... node scripts/leagues.js basketball korea
// site.config.json 의 apiId 가 맞는지 확인할 때 쓴다. (종목별로 1회 호출)
import { ApiSports } from '../pipeline/apisports.js';

const [sport = 'football', search = 'korea'] = process.argv.slice(2);
const api = new ApiSports({ key: process.env.APISPORTS_KEY, minIntervalMs: 0 });
const rows = await api.get(sport, 'leagues', { search });
for (const r of rows) {
  const league = r.league || r;
  const seasons = (r.seasons || []).map((s) => s.year ?? s.season).slice(-3).join(', ');
  console.log(`${league.id}\t${league.name}\t${r.country?.name || ''}\t최근 시즌: ${seasons}`);
}
