// 최소한의 robots.txt 해석기 (RFC 9309: 가장 구체적인 그룹, 가장 긴 규칙 우선, * 와 $ 지원)

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow') && value) {
        current.rules.push({ allow: key === 'allow', pattern: value });
      }
    }
  }
  return groups;
}

const toRegex = (pattern) => {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
};

export function isAllowed(groups, botToken, pathWithQuery) {
  const token = botToken.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!toRegex(rule.pattern).test(pathWithQuery)) continue;
    if (!best || rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
