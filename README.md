# 사커대디 (Soccer Daddy)

13살 미드필더 아들을 다마고치처럼 키우는 축구 성장 블로그. 마크다운 글을 정적 사이트로 만들어 GitHub Pages 에 올립니다.

```bash
npm install
npm run build     # 공개 시각이 지난 글만
npm run preview   # 예약 글까지 포함
npm run serve     # dist/ 미리보기
```

| 경로 | 역할 |
| --- | --- |
| `posts/*.md` | 글 (작성 규칙은 `POSTING.md`) |
| `images/` | 글에 들어가는 그림 |
| `player.json` | 상태창 항목과 기본 프로필 |
| `blog.config.json` | 블로그 이름, 소개, 주소 |
| `src/` | 빌드 스크립트, 자동 표지, 스타일 |
| `.github/workflows/deploy.yml` | `main` 에 올리거나 매일 09:05·19:05(KST)에 자동 배포 |

## 처음 한 번 설정

1. 저장소 Settings → General 에서 이름을 바꿉니다(예: `soccer-daddy`).
2. Settings → Pages → Source 를 **GitHub Actions** 로 바꿉니다.
3. 작업 브랜치를 `main` 에 병합하면 배포됩니다. 주소는 `https://<아이디>.github.io/<저장소이름>/` 입니다.
4. `blog.config.json` 의 `siteUrl` 을 실제 주소로 바꿉니다(공유 미리보기·RSS 에 쓰임).
