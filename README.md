# 커뮤베스트

국내 주요 커뮤니티의 베스트(인기) 게시물을 모아 보여 주는 정적 웹사이트입니다.
제목·원문 링크·추천/댓글/조회 수만 수집하고, 글을 읽을 때는 원문 커뮤니티로 이동합니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `collector/sources.js` | 수집 대상 커뮤니티와 사이트별 파서 |
| `collector/collect.js` | robots.txt 확인 → 목록 수집 → `data/posts.json` 갱신 |
| `scripts/build.js` | `data/posts.json` → `dist/` 정적 사이트 생성 (종합 인기 점수 계산 포함) |
| `site/` | 스타일과 화면 스크립트(필터·정렬·검색·인피드 광고) |
| `site.config.json` | 사이트 이름, 주소, 연락처, 광고 설정 |
| `.github/workflows/update.yml` | 30분마다 수집·빌드·GitHub Pages 배포 |

## 실행

```bash
npm install
npm run update   # 수집 + 빌드
npm run serve    # dist/ 미리보기
```

## 배포

1. `site.config.json` 의 `siteUrl`, `contactEmail`, `botUserAgent` 안의 주소를 실제 값으로 바꿉니다.
2. GitHub 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 설정합니다.
3. 기본 브랜치(`main`)에 올리면 워크플로가 30분마다 수집해서 배포합니다.

`dist/` 는 순수 정적 파일이라 Cloudflare Pages, Netlify, Vercel 등 어디에나 올릴 수 있습니다.

## 광고 (Google AdSense)

`site.config.json` 의 `ads` 를 채우면 광고 코드와 `ads.txt` 가 자동으로 들어갑니다.

```json
"ads": {
  "adsenseClient": "ca-pub-0000000000000000",
  "slots": { "top": "1111111111", "infeed": "2222222222", "sidebar": "3333333333", "bottom": "4444444444" },
  "infeedEvery": 12,
  "showPlaceholders": false
}
```

- `top` 상단 배너, `infeed` 목록 사이(12개마다), `sidebar` PC 우측, `bottom` 목록 하단
- `showPlaceholders: true` 이면 광고 ID가 없을 때 "광고 영역" 자리 표시를 보여 줍니다. 실서비스에서는 `false` 로 두세요.

## 수집 대상

현재: 디시인사이드(실시간 베스트), 루리웹(유머 베스트), 인벤(오픈이슈갤러리), 보배드림(베스트), 웃긴대학(웃긴자료), 개드립.

다음 사이트는 **의도적으로 제외**했습니다.

| 사이트 | 이유 |
| --- | --- |
| 클리앙, SLR클럽, 네이트판 | robots.txt 가 해당 목록의 자동 수집을 금지 |
| 에펨코리아, 더쿠, 인스티즈, 오늘의유머, 아카라이브, 다모앙 | CAPTCHA·보안 확인으로 자동 접근 차단 |
| 뽐뿌, MLB파크, 82쿡 | 서버에서 접속 거부(403/연결 끊김) |

이런 사이트를 넣으려면 해당 운영사의 허락(제휴·공식 API·RSS)이 필요합니다.

### 커뮤니티 추가하기

`collector/sources.js` 에 항목을 추가하고 `node collector/collect.js <id>` 로 확인합니다.
수집기는 매번 robots.txt 를 확인하므로, 금지된 주소는 추가해도 자동으로 건너뜁니다.
한 사이트가 실패해도 나머지는 계속 갱신되며, 실패한 사이트는 기존 데이터를 유지합니다.
