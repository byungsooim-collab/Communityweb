// 각 커뮤니티의 베스트 목록을 읽어 data/posts.json 을 갱신한다.
// 사용법: node collector/collect.js [소스id ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { sources } from './sources.js';
import { parseRobots, isAllowed } from './robots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
const dataFile = path.join(root, 'data', 'posts.json');
const UA = config.botUserAgent;
const BOT_TOKEN = (UA.match(/compatible;\s*([^/;\s]+)/) || [, 'bot'])[1];
const TIMEOUT_MS = 20000;
const MAX_PER_SOURCE = 30;

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
}

// robots.txt 가 금지하면 수집하지 않는다. 4xx 는 "제한 없음", 그 외 실패는 "이번 회차 건너뜀".
async function robotsAllows(url) {
  const u = new URL(url);
  const res = await get(`${u.origin}/robots.txt`);
  if (res.status >= 400 && res.status < 500) return true;
  if (res.status !== 200) throw new Error(`robots.txt 응답 ${res.status}`);
  return isAllowed(parseRobots(res.body.toString('utf8')), BOT_TOKEN, u.pathname + u.search);
}

async function collectSource(source) {
  if (!(await robotsAllows(source.url))) throw new Error('robots.txt 에서 수집을 허용하지 않음');
  const res = await get(source.url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const $ = cheerio.load(iconv.decode(res.body, source.encoding || 'utf-8'));
  const seen = new Set();
  const items = [];
  for (const raw of source.parse($)) {
    if (!raw.title || !raw.url) continue;
    let url;
    try { url = new URL(raw.url, source.url).href; } catch { continue; }
    if (!/^https?:$/.test(new URL(url).protocol) || seen.has(url)) continue;
    seen.add(url);
    items.push({ ...raw, url, title: raw.title.slice(0, 200) });
    if (items.length >= MAX_PER_SOURCE) break;
  }
  if (!items.length) throw new Error('게시물을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)');
  return items;
}

const only = process.argv.slice(2);
const targets = only.length ? sources.filter((s) => only.includes(s.id)) : sources;
const now = new Date().toISOString();

let previous = { posts: [], sources: [] };
try { previous = JSON.parse(await fs.readFile(dataFile, 'utf8')); } catch {}
const posts = new Map(previous.posts.map((p) => [p.url, p]));
const prevStatus = new Map((previous.sources || []).map((s) => [s.id, s]));

const results = await Promise.allSettled(targets.map(collectSource));
const status = [];
results.forEach((result, i) => {
  const source = targets[i];
  const meta = { id: source.id, name: source.name, board: source.board, color: source.color, home: source.home };
  if (result.status === 'rejected') {
    const reason = result.reason?.cause?.code || result.reason?.message || String(result.reason);
    console.error(`✗ ${source.name}: ${reason}`);
    status.push({ ...meta, ok: false, error: reason, updatedAt: prevStatus.get(source.id)?.updatedAt || null });
    return;
  }
  // 이번 목록에 없는 글은 순위를 지우고(과거 인기글), 있는 글은 순위와 수치를 갱신한다.
  for (const p of posts.values()) if (p.source === source.id) p.rank = null;
  result.value.forEach((item, index) => {
    const old = posts.get(item.url);
    posts.set(item.url, {
      source: source.id,
      title: item.title,
      url: item.url,
      comments: item.comments ?? old?.comments ?? null,
      views: item.views ?? old?.views ?? null,
      likes: item.likes ?? old?.likes ?? null,
      rank: index + 1,
      firstSeen: old?.firstSeen || now,
      lastSeen: now,
    });
  });
  console.log(`✓ ${source.name}: ${result.value.length}건`);
  status.push({ ...meta, ok: true, updatedAt: now });
});

// 이번에 실행하지 않은 소스의 상태는 유지
for (const s of previous.sources || []) {
  if (!status.some((x) => x.id === s.id) && sources.some((x) => x.id === s.id)) status.push(s);
}
status.sort((a, b) => sources.findIndex((s) => s.id === a.id) - sources.findIndex((s) => s.id === b.id));

const cutoff = Date.now() - config.retentionHours * 3600 * 1000;
const kept = [...posts.values()]
  .filter((p) => sources.some((s) => s.id === p.source) && Date.parse(p.lastSeen) >= cutoff)
  .sort((a, b) => Date.parse(b.firstSeen) - Date.parse(a.firstSeen) || (a.rank ?? 999) - (b.rank ?? 999));

await fs.mkdir(path.dirname(dataFile), { recursive: true });
await fs.writeFile(dataFile, JSON.stringify({ updatedAt: now, sources: status, posts: kept }, null, 1) + '\n');
const okCount = status.filter((s) => s.ok).length;
console.log(`\n${okCount}/${status.length}개 커뮤니티 성공, 게시물 ${kept.length}건 저장`);
if (!okCount) process.exit(1);
