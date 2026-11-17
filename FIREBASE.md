# Firebase 연결하기 (컴퓨터에서 한 번)

## 1. 코드 받기

```bash
git clone https://github.com/byungsooim-collab/soccerdaddy.git
cd soccerdaddy
npm install
```

## 2. Firebase 프로젝트 연결

```bash
firebase login
firebase projects:list                 # 쓸 프로젝트가 있는지 확인
# 없으면: firebase projects:create soccerdaddy-blog --display-name "사커대디"
firebase use --add                     # 프로젝트 고르고, 별칭은 default
```

`firebase use --add` 를 하면 `.firebaserc` 의 `YOUR_FIREBASE_PROJECT_ID` 가 실제 프로젝트 ID 로 바뀝니다.
처음 쓰는 프로젝트라면 Firebase 콘솔 → Hosting → "시작하기"를 한 번 눌러 Hosting 을 켜 주세요.

## 3. 첫 배포

```bash
npm run deploy
```

끝나면 `https://<프로젝트ID>.web.app` 주소가 나옵니다.

## 4. 자동 배포 (예약 글이 매일 9시·19시에 열리도록)

예약 글은 "배포할 때" 공개 시각이 지난 글만 포함됩니다. 그래서 하루 두 번 자동으로 다시 배포해야 합니다.

```bash
# 배포용 서비스 계정 키 만들기 (프로젝트ID 를 바꿔서)
gcloud iam service-accounts create github-deploy --project <프로젝트ID>
gcloud projects add-iam-policy-binding <프로젝트ID> \
  --member "serviceAccount:github-deploy@<프로젝트ID>.iam.gserviceaccount.com" \
  --role roles/firebasehosting.admin
gcloud iam service-accounts keys create key.json \
  --iam-account github-deploy@<프로젝트ID>.iam.gserviceaccount.com

# GitHub 에 등록 (gh CLI 가 있으면)
gh secret set FIREBASE_SERVICE_ACCOUNT < key.json --repo byungsooim-collab/soccerdaddy
gh variable set FIREBASE_PROJECT_ID --body <프로젝트ID> --repo byungsooim-collab/soccerdaddy
rm key.json
```

gcloud 나 gh 가 없으면: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로 받은 JSON 내용을,
GitHub 저장소 Settings → Secrets and variables → Actions 에 `FIREBASE_SERVICE_ACCOUNT` 로 붙여 넣고,
Variables 탭에 `FIREBASE_PROJECT_ID` 를 만들면 됩니다. 키 파일은 등록 뒤 지워 주세요.

## 5. 마무리

- `.firebaserc` 가 바뀌었으면 커밋해서 올려 주세요.
- 도메인을 연결하면 `blog.config.json` 의 `siteUrl` 을 그 주소로 바꿉니다.
