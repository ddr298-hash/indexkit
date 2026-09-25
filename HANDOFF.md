# IndexKit 인수인계서

작성일: 2026-09-25
저장소: GitHub `ddr298-hash/indexkit`, `main` 브랜치

## 1. 목적 및 현재 방식

네이버 블로그 글이 네이버/구글 검색에서 누락되지 않았는지 확인하고, 누락된 글을 구글이 발견하도록 돕는
개인용 Android 앱(APK)이다. 백엔드 서버 없이 Next.js(정적 export) + Capacitor로 만든 하이브리드 앱 하나로
동작한다.

핵심 아이디어 두 가지:

1. **진단 (API 키 불필요)**: 각 글의 제목을 네이버/구글에 그대로 검색해서, 검색 결과 페이지에 그 글
   자신의 링크가 실제로 뜨는지 확인한다. Search Console API나 Custom Search API를 전혀 쓰지 않는다 —
   둘 다 blog.naver.com 개인 블로그에는 구조적으로 쓸 수 없다는 것을 확인했다 (아래 4번 참고).
   네이버 통합검색에서 이미 노출되는 글은 구글 체크를 생략한다 (허브에 올릴 필요가 없으므로).
2. **허브 (색인 유도)**: 본인이 소유한 GitHub Pages 도메인에, 등록한 블로그들의 글 목록/링크만 담은
   정적 사이트를 자동 생성·배포한다. 이 허브의 사이트맵을 Search Console에 제출해서 Googlebot이 크롤링
   중 네이버 원문 링크를 자연스럽게 발견하게 만든다. 네이버 본문은 복제하지 않는다 (중복 콘텐츠 페널티
   방지).

## 2. 진단 동작 방식 (제목 검증)

`src/lib/rankChecker.ts` + 네이티브 플러그인 `android/.../RankCheckerPlugin.java`:

1. 글 제목을 큰따옴표로 감싸 정확히 일치하는 검색 쿼리로 만든다.
2. 네이버: `search.naver.com/search.naver?where=view&query="제목"` 을 숨겨진 실제 Android `WebView`로
   렌더링한다 (일부 결과가 JS로 렌더링되므로 fetch+파싱이 아니라 실제 WebView가 필요).
3. 페이지 로드 후 `evaluateJavascript`로 DOM의 모든 `<a href>`를 뒤져 블로그ID가 포함된 링크의 순번을
   찾는다. 없으면 -1 (누락).
4. 네이버에서 -1(누락)인 글만 같은 방식으로 구글(`google.com/search?q="제목"`)도 확인한다.
5. 결과는 `DiagnosisReport`로 로컬 저장 (`src/lib/storage.ts`), 앱 화면에 누락 글 목록으로 표시된다.

API 키, Search Console 인증, 사용량 제한이 전혀 없다. 대신 실제 검색 결과 페이지를 스크래핑하는
방식이므로 네이버/구글 페이지 구조가 바뀌면 셀렉터를 손봐야 할 수 있고, 너무 빠르게 반복 호출하면
차단 위험이 있어 요청 사이에 지연(400ms)을 둔다.

## 3. 허브 자동화 (GitHub Actions)

- `scripts/generate-hub.ts`: 등록된 블로그ID들(쉼표 구분)의 전체 글을 수집해 `generated-hub/`에
  블로그별 글 안내 페이지, 통합 `index.html`, `sitemap.xml`, `rss.xml`, `robots.txt`를 생성한다.
- `.github/workflows/hub.yml`: 12시간마다(및 수동 트리거) 위 생성 스크립트를 실행하고 GitHub Pages로
  배포한 뒤, 서비스 계정으로 Search Console에 사이트맵을 재제출한다.
- 앱의 "🔗 허브에 반영" 버튼은 등록된 블로그ID 목록을 GitHub repo variable(`NAVER_BLOG_ID`)에 반영하고
  워크플로우를 즉시 트리거한다.
- 앱의 "🚀 GitHub 자동 설정" 버튼(`handleAutoSetup`, `src/app/page.tsx`)은 처음 쓰는 사용자를 위해
  한 번에: repo 공개 전환(필요 시, 동의 체크박스 필요) → Pages 활성화 → `HUB_DOMAIN`/`NAVER_BLOG_ID`
  변수 설정 → `GOOGLE_SERVICE_ACCOUNT_JSON` 시크릿 암호화 등록(`libsodium` sealed box) → 워크플로우
  트리거까지 자동 실행한다 (`src/lib/github.ts`).
- "📊 허브 색인 현황" 버튼은 Search Console Sitemaps API로 제출된 사이트맵의 처리 상태(제출/색인 수,
  마지막 처리일)를 조회한다 (`src/lib/sitemap.ts`).

## 4. 확인된 제약 (중요 — 재조사 불필요)

1. **Google Custom Search JSON API**: 2025년부터 신규 프로젝트/키 발급이 막혔고 2027-01-01 전체
   종료 예정. 콘솔 설정을 아무리 고쳐도 신규 키는 항상 403 PERMISSION_DENIED. → 이 앱에서는 사용하지
   않는다 (`googleSearch.ts`, `apiKeys.ts` 삭제됨).
2. **Google Search Console API (URL Inspection / Sitemaps)**: 속성 소유권 인증이 필요한데,
   blog.naver.com은 DNS도 `<head>` 태그 삽입도 불가능해 개인 블로그 하나하나를 인증할 방법이 없다.
   → 진단 기능에는 쓰지 않는다. 오직 **본인이 소유한 허브 도메인**의 사이트맵 제출/조회에만 쓴다.
3. **Google Indexing API**: 하루 200건 고정 쿼터, 공식적으로 JobPosting/BroadcastEvent 전용. 일반
   블로그에 강제로 써도 색인 반영 보장 없음. → 자동 설정 흐름에서 사용하지 않음
   (`googleIndexing.ts`/`request-index.ts`는 CLI 실험 코드로만 남아 있음, 앱 UI에는 없음).
4. 허브는 색인을 보장하지 않고 "발견"을 돕는 역할일 뿐이며, 대량·기계적으로 백링크를 찍어내면
   Google SpamBrain 계열 패턴 탐지에 걸릴 수 있다는 리스크가 있음 — 개인 블로그 몇 개 규모로만 사용.

## 5. 파일 구조

| 파일 | 역할 |
|---|---|
| `src/app/page.tsx` | 유일한 화면. 블로그 등록/진단, GitHub 연결/자동 설정, 허브 반영, 사용 가이드 |
| `src/lib/naver.ts` | 네이버 공개 글 목록 페이지네이션 수집 |
| `src/lib/rankChecker.ts` | 네이티브 WebView 플러그인 호출 래퍼 (제목 검증 진단) |
| `src/lib/storage.ts` | localStorage: 진단 리포트, 블로그ID 목록, 서비스 계정, GitHub 설정 |
| `src/lib/github.ts` | GitHub REST API: 변수/시크릿 설정, Pages 활성화, 워크플로우 트리거 |
| `src/lib/googleAuth.ts` | 서비스 계정 RS256 JWT 서명 → OAuth 액세스 토큰 (jose 사용, 브라우저/Node 공용) |
| `src/lib/sitemap.ts` | Search Console 사이트맵 제출/상태 조회 (허브 도메인 전용) |
| `src/lib/searchConsole.ts`, `googleIndexing.ts` | CLI 전용 실험 기능 (`scripts/diagnose.ts`, `request-index.ts`), 앱 UI에서는 미사용 |
| `scripts/generate-hub.ts` | 허브 정적 사이트 생성 |
| `.github/workflows/hub.yml` | 허브 생성 → Pages 배포 → 사이트맵 제출 자동화 |
| `android/app/src/main/java/kr/indexkit/app/RankCheckerPlugin.java` | 숨겨진 WebView로 검색 결과 DOM을 읽는 네이티브 Capacitor 플러그인 |
| `hub-static/` | 허브에 그대로 복사되는 정적 파일 (Search Console 소유권 확인용 HTML 포함) |

## 6. 빌드 명령

```powershell
npm ci
npm run cap:sync          # next build + capacitor sync android
npm run android:build     # 위 + gradlew assembleDebug
```

APK 출력 위치: `android/app/build/outputs/apk/debug/indexkit-<version>-debug.apk`
버전은 `android/app/build.gradle`의 `versionCode`/`versionName`을 빌드마다 올린다 (현재 15 / 3.0).

Windows 환경 주의:
- Node/npm이 PATH에 없으면 `C:\Program Files\nodejs`를 세션마다 추가해야 한다.
- Gradle 빌드는 JDK 21이 필요하다 (Android Studio 번들 JDK 25는 너무 최신이라 실패함). Temurin 21을
  받아 `JAVA_HOME`으로 지정해서 빌드했다.

## 7. 진행 중 이슈

Search Console Sitemaps 화면에서 허브 사이트맵이 "가져올 수 없음"으로 표시된 적 있음. `curl`로 직접
확인한 결과 `sitemap.xml`/`robots.txt` 파일 자체는 200 OK, 정상 XML로 문제 없음 — Google 쪽 캐시/비동기
처리 지연으로 추정. 12시간 자동 재제출을 기다리거나, Search Console에서 기존 사이트맵 항목을 삭제 후
재제출하면 즉시 재시도를 유도할 수 있다.

## 8. 다음 작업 후보

1. 사이트맵 재처리 후 실제 색인 반영 여부 1~2주 관찰
2. 네이버/구글 결과 페이지 구조 변경 시 `RankCheckerPlugin.java`의 셀렉터 점검
3. release 서명 빌드 (`assembleRelease`) 및 배포용 keystore 준비 — 현재는 debug APK만 존재
4. 필요 시 진단 속도 개선 (현재 글 1개당 네이버 400ms + 조건부 구글 400ms 지연 포함, 글 수가 많으면 수 분 소요)

## 9. 보안 주의사항

- 서비스 계정 JSON, GitHub 토큰을 저장소에 커밋하지 않는다 (앱 내 localStorage에만 저장).
- 허브 페이지에는 네이버 원문 본문을 복제하지 않는다 (제목/날짜/링크만).
- 네이버 글 목록 엔드포인트와 검색 결과 페이지는 비공식이므로 응답 형식 변경 가능성을 감안한다.
