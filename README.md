# 승부노트

스포츠토토 대상 종목(축구·농구·야구·배구) 경기의 승·무·패 확률을 통계 모델로 계산하고,
부상자·최근 경기력·맞대결 기록과 AI 해설을 함께 보여 주는 정적 사이트입니다. Firebase Hosting 에 배포합니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `site.config.json` | 사이트 정보, 대상 리그, API 한도, AI 해설, 광고 설정 |
| `pipeline/apisports.js` | API-Sports 클라이언트(호출 한도 관리, 종목별 응답 정규화) |
| `pipeline/model.js` | 확률 모델: 축구 포아송, 그 외 Elo, 부상 보정 |
| `pipeline/analyze.js` | 경기별 분석 데이터 조립, 백테스트, 적중 기록 |
| `pipeline/commentary.js` | Claude API 로 한국어 해설 작성(근거 데이터가 같으면 캐시 재사용) |
| `pipeline/collect.js` | 실제 수집 → `data/matches.json` |
| `pipeline/sample.js` | 가상 팀으로 만든 샘플 데이터(키 없이 화면 확인용) |
| `scripts/build.js` | `data/` → `dist/` 정적 사이트 |
| `.github/workflows/update.yml` | 하루 3회 수집·분석·Firebase 배포 |

## 실행

```bash
npm install
npm test                 # 모델·정규화 테스트
npm run sample           # 샘플 데이터 생성 (API 키 불필요)
npm run build && npm run serve

APISPORTS_KEY=... npm run collect   # 실제 데이터 (ANTHROPIC_API_KEY 가 있으면 AI 해설 포함)
```

## 실제 데이터 연결

1. https://dashboard.api-football.com 에서 무료 가입 후 API 키를 발급받습니다. 같은 키로 축구·농구·야구·배구 API 를 모두 씁니다(종목별 하루 100회).
2. `APISPORTS_KEY=... npm run collect epl` 로 한 리그만 먼저 돌려 봅니다.
   - **아직 실제 키로 검증하지 못했습니다.** 응답 구조는 공식 문서 기준으로 작성했고, 무료 요금제가 현재 시즌 조회를 막는 경우 오류 메시지가 그대로 출력됩니다.
   - `site.config.json` 의 리그 `apiId` 중 KBL·V리그 등은 확인이 필요합니다: `APISPORTS_KEY=... node scripts/leagues.js volleyball korea`
3. AI 해설을 쓰려면 Anthropic API 키를 `ANTHROPIC_API_KEY` 로 넣습니다. 경기당 한 번만 작성하고 근거 데이터가 바뀔 때만 다시 씁니다. 끄려면 `commentary.enabled` 를 `false` 로 둡니다.

## Firebase 배포

1. Firebase 콘솔에서 프로젝트를 만들고 Hosting 을 켭니다(무료 Spark 요금제로 충분합니다).
2. `.firebaserc` 의 `YOUR_FIREBASE_PROJECT_ID` 를 프로젝트 ID 로 바꿉니다.
3. 직접 배포: `npx firebase-tools login && npm run build && npx firebase-tools deploy --only hosting`
4. 자동 배포(GitHub Actions): 저장소 Settings 에 다음을 등록합니다.
   - Secrets: `APISPORTS_KEY`, `ANTHROPIC_API_KEY`(선택), `FIREBASE_SERVICE_ACCOUNT`(Firebase 서비스 계정 JSON)
   - Variables: `FIREBASE_PROJECT_ID`
5. 도메인은 Firebase 콘솔 Hosting → 커스텀 도메인에서 연결하고, `site.config.json` 의 `siteUrl` 을 바꿉니다.

## 한계

- 부상자 정보는 축구만 제공됩니다. 농구·야구·배구는 부상이 확률에 반영되지 않습니다.
- 무료 한도 때문에 부상 선수 기록 조회는 실행당 20명으로 제한합니다(`api.maxPlayerLookupsPerRun`).
- 베트맨의 회차별 대상 경기 목록과는 연동하지 않습니다. 설정한 리그의 향후 3일 경기를 모두 분석합니다.
- 확률은 추정치이며 결과를 보장하지 않습니다. 사설 베팅 사이트 광고·링크는 넣지 않습니다.
