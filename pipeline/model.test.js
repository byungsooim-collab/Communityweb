import test from 'node:test';
import assert from 'node:assert/strict';
import { footballModel, eloModel, injuryAdjustment, pickOf } from './model.js';
import { seasonFor, normalizeGame } from './apisports.js';
import { analyzeLeague, backtest } from './analyze.js';

const game = (id, daysAgo, home, away, hs, as) => ({ id, date: new Date(Date.now() - daysAgo * 86400000).toISOString(), status: 'finished', home: { id: home, name: `T${home}` }, away: { id: away, name: `T${away}` }, score: { home: hs, away: as } });

test('축구 모델: 확률 합은 1이고 강팀이 유리하다', () => {
  const games = [];
  for (let i = 0; i < 12; i++) { games.push(game(i, 80 - i * 3, 1, 2, 3, 0), game(100 + i, 79 - i * 3, 2, 1, 0, 2), game(200 + i, 78 - i * 3, 2, 3, 1, 1), game(300 + i, 77 - i * 3, 3, 1, 0, 2)); }
  const p = footballModel(games).predict(1, 2);
  assert.ok(Math.abs(p.pHome + p.pDraw + p.pAway - 1) < 0.01);
  assert.ok(p.pHome > 0.7 && p.pHome > p.pAway);
  assert.ok(p.expected.home > p.expected.away);
  const reverse = footballModel(games).predict(2, 1);
  assert.ok(reverse.pAway > reverse.pHome);
});

test('축구 모델: 경기 기록이 없으면 홈 이점만 반영된 평균 확률', () => {
  const p = footballModel([]).predict(1, 2);
  assert.ok(p.pHome > p.pAway && p.pDraw > 0.15);
});

test('부상 보정: 주득점원 결장은 승률을 낮춘다', () => {
  const games = [];
  for (let i = 0; i < 10; i++) games.push(game(i, 60 - i * 3, 1, 2, 2, 1), game(50 + i, 59 - i * 3, 2, 1, 1, 1));
  const model = footballModel(games);
  const adj = injuryAdjustment([{ type: 'Missing Fixture', stats: { goals: 10, assists: 5, minutes: 1500, position: 'Attacker' } }], 30, 20);
  assert.ok(adj.attack < 1 && adj.attack >= 0.75 && adj.defense === 1);
  assert.ok(model.predict(1, 2, { homeAttack: adj.attack }).pHome < model.predict(1, 2).pHome);
  const def = injuryAdjustment([{ type: 'Missing Fixture', stats: { goals: 0, assists: 0, minutes: 1700, position: 'Defender' } }], 30, 20);
  assert.equal(def.defense, 1.04);
  assert.equal(injuryAdjustment([], 30, 20).attack, 1);
});

test('Elo 모델: 무승부가 없고 많이 이긴 팀이 유리하다', () => {
  const games = [];
  for (let i = 0; i < 20; i++) games.push(game(i, 60 - i, 1, 2, 90, 70), game(100 + i, 59 - i, 2, 1, 75, 88));
  const p = eloModel(games, 'basketball').predict(1, 2);
  assert.equal(p.pDraw, 0);
  assert.ok(p.pHome > 0.75);
  assert.ok(Math.abs(p.pHome + p.pAway - 1) < 0.002);
  assert.deepEqual(pickOf(p, 'basketball'), { pick: 'home', confidence: 'high' });
});

test('시즌 계산과 응답 정규화', () => {
  const nov = new Date('2026-11-13T00:00:00Z'), mar = new Date('2027-03-01T00:00:00Z');
  assert.equal(seasonFor({ season: 'split' }, nov), '2026');
  assert.equal(seasonFor({ season: 'split' }, mar), '2026');
  assert.equal(seasonFor({ season: 'calendar' }, mar), '2027');
  assert.equal(seasonFor({ season: 'split', seasonFormat: 'range', seasonStartMonth: 10 }, mar), '2026-2027');
  const f = normalizeGame('football', { fixture: { id: 7, date: '2026-11-14T15:00:00+00:00', status: { short: 'FT' } }, teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } }, goals: { home: 2, away: 1 } });
  assert.deepEqual([f.status, f.score], ['finished', { home: 2, away: 1 }]);
  const b = normalizeGame('basketball', { id: 9, date: '2026-11-14T10:00:00+00:00', status: { short: 'NS' }, teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } }, scores: { home: { total: null }, away: { total: null } } });
  assert.deepEqual([b.status, b.score], ['scheduled', null]);
  const v = normalizeGame('volleyball', { id: 3, date: '2026-11-14T10:00:00+00:00', status: { short: 'FT' }, teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } }, scores: { home: 3, away: 1 } });
  assert.deepEqual(v.score, { home: 3, away: 1 });
});

test('리그 분석: 예정 경기만 나오고 부상자가 팀별로 나뉜다', () => {
  const games = [];
  for (let i = 0; i < 8; i++) games.push(game(i, 40 - i * 4, 1, 2, 2, 0), game(50 + i, 39 - i * 4, 2, 1, 1, 1));
  games.push({ id: 999, date: new Date(Date.now() + 86400000).toISOString(), status: 'scheduled', home: { id: 1, name: 'T1' }, away: { id: 2, name: 'T2' }, score: null });
  games.push({ id: 1000, date: new Date(Date.now() + 30 * 86400000).toISOString(), status: 'scheduled', home: { id: 2, name: 'T2' }, away: { id: 1, name: 'T1' }, score: null });
  const injuriesByFixture = new Map([[999, [{ playerId: 5, name: 'P', teamId: 2, type: 'Missing Fixture', reason: 'x' }]]]);
  const playerStats = new Map([[5, { goals: 6, assists: 2, minutes: 1200, position: 'Attacker' }]]);
  const out = analyzeLeague({ league: { id: 'l', sport: 'football', name: 'L' }, games, injuriesByFixture, playerStats });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'l-999');
  assert.equal(out[0].injuries.away.length, 1);
  assert.equal(out[0].injuries.home.length, 0);
  assert.ok(out[0].prediction.pHome > out[0].injuryImpact.before.pHome);
  assert.equal(out[0].home.last5.length, 5);
  assert.equal(out[0].home.rank, 1);
  assert.equal(backtest(games, 'football'), null); // 경기 수가 워밍업(30)보다 적으면 백테스트 없음
});
