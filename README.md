# indexkit

내 네이버 블로그 글을 전수 크롤링해서 구글 색인 여부를 진단하고, 누락된 글을 Google Indexing API로
색인 요청하는 개인용 도구입니다. (indexkit.kr 서비스의 핵심 흐름을 참고해 개인 사용 목적으로 만든 로컬 버전)

## 동작 방식

1. **`npm run diagnose -- <블로그ID>`**
   - `blog.naver.com`의 글 목록 위젯 API를 페이지네이션하며 전체 글(logNo, 제목, 발행일)을 수집
   - 각 글 URL을 **Google Search Console의 URL 검사(URL Inspection) API**로 하나씩 조회해 실제 구글
     색인 상태(`indexStatusResult.verdict`)를 확인
   - 결과를 `reports/<블로그ID>-<날짜>.json`에 저장하고 콘솔에 요약 출력

2. **`npm run request-index -- <블로그ID>`**
   - 가장 최근 진단 보고서에서 "누락" 상태인 글만 골라 Google Indexing API(`urlNotifications.publish`)로
     `URL_UPDATED` 색인 요청을 순차 전송

두 기능 모두 **같은 Google 서비스 계정 키 하나**로 동작합니다 (JWT 자체 서명 후 OAuth2 토큰 교환 — Node
전용 `googleapis` 없이 `jose` + `fetch`만 사용해서 브라우저/앱에서도 동일하게 동작).

> **왜 Custom Search API를 안 쓰나요?** 원래는 Custom Search JSON API의 `site:` 검색으로 진단했지만,
> Google이 2025년에 이 API의 **신규 프로젝트 발급을 막았고** 2027-01-01 완전 종료를 예고했습니다. 신규
> 프로젝트/키로는 콘솔에 "사용 설정됨"으로 보여도 실제 호출은 전부 `PERMISSION_DENIED`로 막힙니다. 그래서
> 신규 사용자도 쓸 수 있는 Search Console URL Inspection API로 전환했습니다.

## 사전 준비

### 1) Google Cloud 프로젝트 + 서비스 계정

1. https://console.cloud.google.com 에서 프로젝트 생성 (또는 기존 프로젝트 사용)
2. **Web Search Indexing API**와 **Search Console API** 둘 다 사용 설정
   (API 및 서비스 → 라이브러리에서 각각 검색해서 활성화)
3. IAM 및 관리자 → 서비스 계정 → 새 서비스 계정 생성 (역할 지정 불필요 — Search Console 소유권으로
   권한을 주는 방식)
4. 키(JSON) 생성 후 다운로드 → 프로젝트 루트에 저장 (예: `google-credentials.json`, **git에 커밋 금지**,
   이미 `.gitignore`에 패턴 추가되어 있음)
5. `.env.local`의 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`에 경로 지정 (CLI용). 앱에서는 이 JSON 파일 내용
   전체를 설정 화면에 붙여넣습니다.

### 2) ⚠️ Search Console 소유권 확인 (진단 + 색인 요청 둘 다의 핵심 제약)

Search Console URL Inspection API와 Indexing API 둘 다 **소유권이 확인된 속성**에 대해서만 동작합니다.
서비스 계정 이메일을 `https://blog.naver.com/<블로그ID>/` URL-접두어 속성의 소유자로 등록해야 합니다.

1. https://search.google.com/search-console 에서 URL 접두어 속성으로
   `https://blog.naver.com/<블로그ID>/` 추가
2. **HTML 태그 방법**으로 인증: 발급된 `<meta name="google-site-verification" ...>` 태그를
   네이버 블로그 관리 → 꾸미기 설정 → 레이아웃·위젯 설정 → **위젯 직접등록(HTML 입력)**에 추가
3. 소유권 확인 완료 후, Search Console 속성 설정 → 사용자 및 권한에서 서비스 계정 이메일
   (`xxx@xxx.iam.gserviceaccount.com`)을 **소유자**로 추가

**한계**: 네이버 블로그의 위젯 입력은 보통 `<body>` 영역에 삽입되며 `<head>`가 아닙니다. 구글의 인증
체커가 이를 인식하지 못하면 소유권 확인 자체가 실패할 수 있고, 그러면 진단·색인 요청 둘 다 동작하지
않습니다. 또한 Indexing API는 공식적으로는 채용공고/라이브방송 페이지 전용이라 일반 블로그 글에 대한
색인 반영은 보장되지 않습니다 — 어디까지나 구글에 크롤링을 요청하는 신호일 뿐입니다.

## 검색 발견용 허브 (소유권 인증 없이 발견 가능성 높이기)

Search Console 소유권 인증이 네이버 블로그 구조상 막힐 수 있다는 한계를 우회하는 방법입니다. 본인이
**실제로 소유한 도메인**(GitHub Pages, Vercel 등)에 네이버 원문 링크 모음 페이지를 배포해서, 그 도메인은
정상적으로 소유권 인증을 하고 구글이 사이트맵/RSS를 통해 네이버 원문 URL을 발견하도록 유도합니다. 원문
내용을 복제하지 않고 제목·발행일·링크만 제공하므로 네이버 원문과 중복 콘텐츠가 되지 않습니다.

```bash
npm run generate-hub -- 내블로그ID https://내가-소유한-도메인.example
```

`generated-hub/`에 `index.html`, `posts/<logNo>.html`(글마다 1개), `sitemap.xml`, `rss.xml`, `robots.txt`가
생성됩니다. 이 폴더를 원하는 정적 호스팅에 배포한 뒤, 그 도메인을 Search Console에 등록(정상적인 DNS/HTML
인증 — 본인 도메인이라 문제없이 됩니다)하고 서비스 계정을 소유자로 추가하면:

```bash
npm run submit-sitemap -- https://내도메인.example/ https://내도메인.example/sitemap.xml
```

으로 사이트맵을 즉시 제출할 수 있습니다. 어디까지나 구글이 원문 URL을 "발견"할 확률을 높이는 것이며,
네이버 원문 자체의 색인을 보장하지 않습니다.

### GitHub Actions로 자동화

`.github/workflows/hub.yml`이 매일 자동으로: 글 목록 재수집 → 허브 재생성 → **GitHub Pages 배포** →
사이트맵 자동 제출까지 실행합니다. 사용하려면 저장소에서:

1. **Settings → Pages → Source**를 "GitHub Actions"로 설정
2. **Settings → Secrets and variables → Actions → Variables**에 추가:
   - `NAVER_BLOG_ID` = 본인 블로그 ID
   - `HUB_DOMAIN` = GitHub Pages 주소 (예: `https://ddr298-hash.github.io/indexkit`)
3. 같은 화면의 **Secrets** 탭에 추가:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = 서비스 계정 키 JSON 파일 내용 전체
4. Actions 탭에서 "Generate & publish discovery hub" 워크플로우를 한 번 수동 실행(`Run workflow`)해서
   확인 — 이후로는 매일 자동 실행됩니다.

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
호출(네이버 글 목록, Search Console, Indexing API)이 앱 내부에서 직접 일어납니다.

- 서비스 계정 키는 기기의 `localStorage`에만 저장됩니다 (서버 전송 없음). 다만 사이드로드용 APK이므로
  디컴파일 시 값이 노출될 수 있음을 감안하세요 — 개인 전용 기기에만 설치하세요.
- `blog.naver.com`은 CORS 헤더를 보내지 않으므로, 일반 WebView `fetch`로는 요청이 막힙니다.
  `capacitor.config.ts`에서 `CapacitorHttp` 플러그인을 켜서 네이티브 네트워킹으로 우회합니다.
- URL Inspection API는 URL 하나당 호출 1번이라(하루 약 2,000건 한도), 글이 많은 블로그는 진단에
  시간이 좀 걸립니다 (150ms 간격으로 순차 처리).

### 빌드

```bash
npm run build          # next build (output: "export" → out/ 생성)
npx cap sync android    # out/ 를 android/app/src/main/assets/public 에 복사
cd android
./gradlew assembleDebug # → android/app/build/outputs/apk/debug/indexkit-<version>-debug.apk
```

APK는 서명되지 않은 디버그 빌드입니다. 설치 시 폰에서 "출처를 알 수 없는 앱" 설치를 허용해야 합니다.

## 폴더 구조

- `scripts/diagnose.ts` — 진단 CLI (데스크톱/Node용)
- `scripts/request-index.ts` — 색인 요청 CLI (데스크톱/Node용)
- `scripts/generate-hub.ts` — 검색 발견용 허브(정적 사이트) 생성 CLI
- `scripts/submit-sitemap.ts` — 생성된 사이트맵을 Search Console에 제출하는 CLI
- `.github/workflows/hub.yml` — 허브 생성·배포·사이트맵 제출 자동화 (매일 스케줄)
- `src/app/page.tsx` — 안드로이드 앱의 화면 전체 (설정 + 진단 + 색인 요청)
- `src/lib/naver.ts` — 네이버 블로그 글 목록 크롤링 (Node·브라우저 공용)
- `src/lib/googleAuth.ts` — 서비스 계정 키로 OAuth2 액세스 토큰 발급 (Node·브라우저 공용)
- `src/lib/searchConsole.ts` — Search Console URL Inspection API로 색인 상태 조회 (Node·브라우저 공용)
- `src/lib/googleIndexing.ts` — Google Indexing API 호출 (Node·브라우저 공용)
- `src/lib/sitemap.ts` — Search Console 사이트맵 제출 API 호출
- `src/lib/storage.ts` — 앱 전용: 진단 보고서·서비스 계정 저장 (`localStorage`)
- `src/lib/report.ts` — CLI 전용: 진단 보고서 파일 저장/조회
- `reports/` — CLI 진단 결과 JSON (git 미포함)
- `android/` — Capacitor 안드로이드 프로젝트 (빌드 산출물은 git 미포함)
