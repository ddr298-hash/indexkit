# indexkit

내 네이버 블로그 글을 전수 크롤링해서 구글 색인 여부를 진단하고, 누락된 글을 Google Indexing API로
색인 요청하는 개인용 CLI 도구입니다. (indexkit.kr 서비스의 핵심 흐름을 참고해 개인 사용 목적으로 만든 로컬 버전)

## 동작 방식

1. **`npm run diagnose -- <블로그ID>`**
   - `blog.naver.com`의 글 목록 위젯 API를 페이지네이션하며 전체 글(logNo, 제목, 발행일)을 수집
   - Google Custom Search API로 `site:blog.naver.com/<블로그ID>` 검색 결과를 최대 100건까지 페이징 조회해
     실제로 구글에 색인된 URL 집합을 확인 (글 하나하나 검색하지 않고 한 번에 비교 — API 쿼터 절약)
   - PC(`blog.naver.com`)/모바일(`m.blog.naver.com`) URL을 정규화해 동일 글로 비교
   - 결과를 `reports/<블로그ID>-<날짜>.json`에 저장하고 콘솔에 요약 출력

2. **`npm run request-index -- <블로그ID>`**
   - 가장 최근 진단 보고서에서 "누락" 상태인 글만 골라 Google Indexing API(`urlNotifications.publish`)로
     `URL_UPDATED` 색인 요청을 순차 전송

## 사전 준비

### 1) Google Cloud 프로젝트

1. https://console.cloud.google.com 에서 프로젝트 생성
2. **Custom Search API** 사용 설정 (진단용)
3. **Web Search Indexing API (Indexing API)** 사용 설정 (색인 요청용)
4. API 키 발급 → `.env.local`의 `GOOGLE_CSE_API_KEY`

### 2) Programmable Search Engine (진단용)

1. https://programmablesearchengine.google.com 에서 검색엔진 생성
2. 설정에서 **"전체 웹 검색(Search the entire web)"** 활성화
   (이걸 켜야 `site:blog.naver.com/...` 검색이 남의 도메인에서도 동작합니다)
3. 검색엔진 ID(cx) → `.env.local`의 `GOOGLE_CSE_ID`

### 3) 서비스 계정 (색인 요청용)

1. Google Cloud Console → IAM 및 관리자 → 서비스 계정 → 새 서비스 계정 생성
2. 키(JSON) 생성 후 다운로드 → 프로젝트 루트에 저장 (예: `google-credentials.json`, **git에 커밋 금지**,
   이미 `.gitignore`에 패턴 추가되어 있음)
3. `.env.local`의 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`에 경로 지정

### 4) ⚠️ Search Console 소유권 확인 (색인 요청의 핵심 제약)

Indexing API는 **Search Console에서 소유권이 확인된 속성**에 대해서만 동작합니다. 서비스 계정 이메일을
`https://blog.naver.com/<블로그ID>/` URL-접두어 속성의 소유자로 등록해야 합니다.

1. https://search.google.com/search-console 에서 URL 접두어 속성으로
   `https://blog.naver.com/<블로그ID>/` 추가
2. **HTML 태그 방법**으로 인증: 발급된 `<meta name="google-site-verification" ...>` 태그를
   네이버 블로그 관리 → 꾸미기 설정 → 레이아웃·위젯 설정 → **위젯 직접등록(HTML 입력)**에 추가
3. 소유권 확인 완료 후, Search Console 속성 설정 → 사용자 및 권한에서 서비스 계정 이메일
   (`xxx@xxx.iam.gserviceaccount.com`)을 **소유자**로 추가

**한계**: 네이버 블로그의 위젯 입력은 보통 `<body>` 영역에 삽입되며 `<head>`가 아닙니다. 구글의 인증
체커가 이를 인식하지 못하면 소유권 확인 자체가 실패할 수 있습니다. 이 경우 Indexing API는 사용할 수
없고, `diagnose` 단계(진단/보고서)만 정상 동작합니다. 또한 이 API는 공식적으로는 채용공고/라이브방송
페이지 전용이라 일반 블로그 글에 대한 색인 반영은 보장되지 않습니다 — 어디까지나 구글에 크롤링을
요청하는 신호일 뿐입니다.

## 설치 및 실행

```bash
npm install
cp .env.local.example .env.local   # 값 채우기
npm run diagnose -- your_blog_id
npm run request-index -- your_blog_id
```

## 안드로이드 앱 (Capacitor)

폰에는 Node.js가 없어서 CLI를 그대로 담을 수 없기 때문에, 같은 로직(`src/lib/*`)을 브라우저에서
동작하도록 재작성해 Next.js 정적 사이트로 빌드하고 Capacitor로 감쌌습니다. 서버가 없고 모든 API
호출(네이버 글 목록, Google Custom Search, Google Indexing API)이 앱 내부에서 직접 일어납니다.

- Google API 키/서비스 계정 키는 기기의 `localStorage`에만 저장됩니다 (서버 전송 없음). 다만
  사이드로드용 APK이므로 디컴파일 시 값이 노출될 수 있음을 감안하세요 — 개인 전용 기기에만 설치하세요.
- 설정 화면에서 **Google API 키를 여러 개 등록**할 수 있습니다. Custom Search API는 무료 티어가
  키(프로젝트)당 하루 100건이라, 진단 중 한 키가 소진(429/쿼터 오류)되면 자동으로 다음 키로 넘어가
  같은 요청을 이어서 처리합니다 (`src/lib/apiKeys.ts`).
- `blog.naver.com`은 CORS 헤더를 보내지 않으므로, 일반 WebView `fetch`로는 요청이 막힙니다.
  `capacitor.config.ts`에서 `CapacitorHttp` 플러그인을 켜서 네이티브 네트워킹으로 우회합니다.

### 빌드

```bash
npm run build          # next build (output: "export" → out/ 생성)
npx cap sync android    # out/ 를 android/app/src/main/assets/public 에 복사
cd android
./gradlew assembleDebug # → android/app/build/outputs/apk/debug/app-debug.apk
```

APK는 서명되지 않은 디버그 빌드입니다. 설치 시 폰에서 "출처를 알 수 없는 앱" 설치를 허용해야 합니다.

## 폴더 구조

- `scripts/diagnose.ts` — 진단 CLI (데스크톱/Node용)
- `scripts/request-index.ts` — 색인 요청 CLI (데스크톱/Node용)
- `src/app/page.tsx` — 안드로이드 앱의 화면 전체 (설정 + 진단 + 색인 요청)
- `src/lib/naver.ts` — 네이버 블로그 글 목록 크롤링 (Node·브라우저 공용)
- `src/lib/googleSearch.ts` — Custom Search API로 색인 상태 조회 + URL 정규화 (Node·브라우저 공용)
- `src/lib/googleIndexing.ts` — Google Indexing API 호출, `jose`로 JWT 서명 (Node·브라우저 공용)
- `src/lib/apiKeys.ts` — 앱 전용: 다중 API 키 등록/자동 로테이션 (`localStorage`)
- `src/lib/storage.ts` — 앱 전용: 진단 보고서·설정 저장 (`localStorage`)
- `src/lib/report.ts` — CLI 전용: 진단 보고서 파일 저장/조회
- `reports/` — CLI 진단 결과 JSON (git 미포함)
- `android/` — Capacitor 안드로이드 프로젝트 (빌드 산출물은 git 미포함)
