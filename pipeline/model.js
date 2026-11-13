// 승패 확률 모델.
// - 축구: 팀별 홈/원정 공격·수비 강도로 기대 득점을 구하고 포아송 분포로 승·무·패 확률을 계산한다.
// - 농구·야구·배구: 경기 결과로 Elo 레이팅을 쌓아 승률을 계산한다(무승부 없음).
// 모든 수치는 같은 시즌 경기 결과만으로 계산하며, 최근 경기에 더 큰 가중치를 준다.

const DAY = 86400000;
const round = (n, d = 3) => Number(n.toFixed(d));

function poissonPmf(lambda, max) {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) out.push((out[k - 1] * lambda) / k);
  return out;
}

export function footballModel(finished, now = Date.now(), { halfLifeDays = 180, prior = 3 } = {}) {
  const teams = new Map();
  const team = (id) => {
    if (!teams.has(id)) teams.set(id, { hf: 0, ha: 0, hn: 0, af: 0, aa: 0, an: 0 });
    return teams.get(id);
  };
  let homeGoals = 0, awayGoals = 0, weight = 0;
  for (const g of finished) {
    const w = 0.5 ** (Math.max(0, now - Date.parse(g.date)) / DAY / halfLifeDays);
    const h = team(g.home.id), a = team(g.away.id);
    h.hf += w * g.score.home; h.ha += w * g.score.away; h.hn += w;
    a.af += w * g.score.away; a.aa += w * g.score.home; a.an += w;
    homeGoals += w * g.score.home; awayGoals += w * g.score.away; weight += w;
  }
  const avgHome = weight ? homeGoals / weight : 1.5;
  const avgAway = weight ? awayGoals / weight : 1.2;
  // 경기 수가 적은 팀은 리그 평균 쪽으로 당긴다(prior 경기만큼의 평균 성적을 섞는다).
  const strength = (scored, n, avg) => (scored + prior * avg) / (n + prior) / avg;

  return {
    sample: finished.length,
    predict(homeId, awayId, adjust = {}) {
      const h = team(homeId), a = team(awayId);
      let lambdaHome = avgHome * strength(h.hf, h.hn, avgHome) * strength(a.aa, a.an, avgHome);
      let lambdaAway = avgAway * strength(a.af, a.an, avgAway) * strength(h.ha, h.hn, avgAway);
      lambdaHome *= (adjust.homeAttack ?? 1) * (adjust.awayDefense ?? 1);
      lambdaAway *= (adjust.awayAttack ?? 1) * (adjust.homeDefense ?? 1);
      const ph = poissonPmf(lambdaHome, 10), pa = poissonPmf(lambdaAway, 10);
      let pHome = 0, pDraw = 0, pAway = 0, over25 = 0, best = { p: 0 };
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        const p = ph[i] * pa[j];
        if (i > j) pHome += p; else if (i === j) pDraw += p; else pAway += p;
        if (i + j > 2.5) over25 += p;
        if (p > best.p) best = { p, home: i, away: j };
      }
      const sum = pHome + pDraw + pAway;
      return {
        pHome: round(pHome / sum), pDraw: round(pDraw / sum), pAway: round(pAway / sum),
        expected: { home: round(lambdaHome, 2), away: round(lambdaAway, 2) },
        over25: round(over25 / sum), likelyScore: `${best.home}-${best.away}`,
      };
    },
  };
}

const ELO = {
  basketball: { k: 20, homeAdv: 60, blowout: 20 },
  baseball: { k: 6, homeAdv: 24, blowout: 6 },
  volleyball: { k: 24, homeAdv: 40, blowout: 3 },
};

export function eloModel(finished, sport) {
  const cfg = ELO[sport] || ELO.basketball;
  const ratings = new Map();
  const rating = (id) => ratings.get(id) ?? 1500;
  const expect = (home, away) => 1 / (1 + 10 ** (-(rating(home) + cfg.homeAdv - rating(away)) / 400));
  for (const g of [...finished].sort((x, y) => Date.parse(x.date) - Date.parse(y.date))) {
    if (g.score.home === g.score.away) continue;
    const e = expect(g.home.id, g.away.id);
    const margin = Math.abs(g.score.home - g.score.away);
    const delta = cfg.k * (1 + Math.min(1, margin / cfg.blowout)) * ((g.score.home > g.score.away ? 1 : 0) - e);
    ratings.set(g.home.id, rating(g.home.id) + delta);
    ratings.set(g.away.id, rating(g.away.id) - delta);
  }
  return {
    sample: finished.length,
    predict(homeId, awayId) {
      const pHome = expect(homeId, awayId);
      return { pHome: round(pHome), pDraw: 0, pAway: round(1 - pHome), rating: { home: Math.round(rating(homeId)), away: Math.round(rating(awayId)) } };
    },
  };
}

// 부상 결장이 기대 득점에 주는 영향(축구). 경험적 보정값이며 상한을 둔다.
// - 공격: 결장 선수의 (골+도움) / 팀 득점 비중만큼 공격력을 낮춘다. 최대 25%.
// - 수비: 주전급(팀 경기 시간의 절반 이상 출전) 수비수·골키퍼 1명당 상대 기대 득점 +4%. 최대 15%.
// - 기록이 없는 선수는 1명당 공격 -1.5% 로만 반영한다. '출전 불투명'은 절반만 반영한다.
export function injuryAdjustment(injuries, teamGoals, teamGames) {
  let involvement = 0, defenders = 0, unknown = 0;
  for (const p of injuries) {
    const w = /question|doubt/i.test(p.type) ? 0.5 : 1;
    if (!p.stats) { unknown += w; continue; }
    involvement += (w * (p.stats.goals + p.stats.assists)) / Math.max(teamGoals, 1);
    const regular = teamGames > 0 && p.stats.minutes / (teamGames * 90) >= 0.5;
    if (regular && /^(D|G)/i.test(p.stats.position || '')) defenders += w;
  }
  return {
    attack: round(1 - Math.min(0.25, 0.6 * involvement + 0.015 * unknown)),
    defense: round(1 + Math.min(0.15, 0.04 * defenders)),
  };
}

export function pickOf(pred, sport) {
  const options = [['home', pred.pHome], ['draw', pred.pDraw], ['away', pred.pAway]].sort((a, b) => b[1] - a[1]);
  const [pick, p] = options[0];
  const [high, mid] = sport === 'football' ? [0.55, 0.45] : [0.65, 0.57];
  return { pick, confidence: p >= high ? 'high' : p >= mid ? 'mid' : 'low' };
}
