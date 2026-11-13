// 통계 모델이 만든 수치를 근거로 Claude 가 한국어 경기 해설을 쓴다.
// ANTHROPIC_API_KEY 가 없으면 건너뛰고, 같은 근거 데이터에 대해서는 캐시를 재사용한다.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `당신은 스포츠 경기 데이터 분석가입니다. 주어진 JSON 데이터만 근거로 한국어 경기 분석을 씁니다.

독자는 경기를 앞두고 양 팀 상황을 빠르게 파악하려는 스포츠 팬입니다. 이 글은 통계 모델의 확률 옆에 실리며, 독자가 "왜 이런 확률이 나왔는지"를 이해하도록 돕는 것이 목적입니다.

지킬 것:
- 데이터에 없는 사실(부상, 이적, 감독, 날씨, 배당, 과거 시즌 등)은 쓰지 않습니다. 부상자 정보가 제공되지 않은 종목이면 부상에 대해 언급하지 않습니다.
- 양 팀의 최근 5경기 흐름, 홈/원정 성적, 득실, 부상 결장자와 그 선수의 기록, 휴식일 중 승부에 실제로 영향을 줄 요소를 골라 설명합니다.
- 모델 확률을 그대로 반복하기보다 확률의 근거와 변수를 짚습니다. 데이터가 적으면(lowData) 불확실하다고 분명히 말합니다.
- 결과를 보장하거나 구매를 권유하는 표현은 쓰지 않습니다.
- 4~6문장의 줄글 한 단락으로, 제목·목록·마크다운 없이 씁니다.`;

const factsOf = (m) => ({
  sport: m.sport, league: m.leagueName, date: m.date, teamCount: m.teamCount,
  home: { name: m.home.name, rank: m.home.rank, restDays: m.home.restDays, record: m.home.record, last5: m.home.last5 },
  away: { name: m.away.name, rank: m.away.rank, restDays: m.away.restDays, record: m.away.record, last5: m.away.last5 },
  prediction: m.prediction, injuryImpact: m.injuryImpact,
  injuries: m.injuries.available ? { home: m.injuries.home, away: m.injuries.away } : '이 종목은 부상자 데이터가 제공되지 않음',
  headToHeadThisSeason: m.h2h,
});

export async function addCommentary(matches, config, cache = {}) {
  const next = {};
  if (!config.enabled) return next;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const client = hasKey ? new Anthropic() : null;
  let written = 0;

  for (const m of matches) {
    const facts = JSON.stringify(factsOf(m));
    const key = crypto.createHash('sha1').update(config.model + facts).digest('hex');
    if (cache[key]) { m.commentary = next[key] = cache[key]; continue; }
    if (!client || written >= config.maxPerRun) continue;
    try {
      // 요청이 정책상 거절되면 서버가 다른 모델로 한 번 더 시도하도록 fallbacks 를 켠다.
      const response = await client.beta.messages.create({
        model: config.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: config.effort },
        system: SYSTEM,
        messages: [{ role: 'user', content: `다음 경기 데이터를 분석해 주세요.\n\n${facts}` }],
      });
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        console.warn(`해설 생략(${response.stop_reason}): ${m.home.name} vs ${m.away.name}`);
        continue;
      }
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (text) { m.commentary = next[key] = text; written++; }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) { console.warn('해설 중단: Anthropic API 키가 올바르지 않습니다.'); break; }
      if (error instanceof Anthropic.RateLimitError) { console.warn('해설 중단: 요청 한도 초과. 다음 실행에서 이어집니다.'); break; }
      if (error instanceof Anthropic.APIError) { console.warn(`해설 실패(${error.status}): ${error.message}`); continue; }
      throw error;
    }
  }
  if (!client) console.log('ANTHROPIC_API_KEY 가 없어 AI 해설을 건너뜁니다.');
  else console.log(`AI 해설 ${written}건 새로 작성`);
  return next;
}
