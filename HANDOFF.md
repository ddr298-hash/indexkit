# IndexKit 인수인계서

작성일: 2026-09-20  
저장소 상태: 로컬 Git 저장소, `main` 브랜치

## 1. 목적

네이버 블로그의 공개 글을 자동 수집하고 Google 검색 발견 가능성을 높이는 도구다.

네이버 블로그는 사용자가 DNS나 문서 `<head>`를 수정할 수 없어 일반적인 Search Console 소유권 확인이
어렵다. 따라서 네이버 속성의 소유권을 우회하거나 가장하지 않고, 본인이 소유한 별도 도메인에 다음 파일을
생성·배포하는 방식으로 구현했다.

- 블로그 전체 글 목록 페이지
- 글별 원문 안내 페이지
- `sitemap.xml`
- `feed.xml`
- `robots.txt`

글별 페이지에는 제목, 발행일, 네이버 원문 링크만 넣는다. 네이버 본문을 복제하지 않는다.

## 2. 주요 실행 명령

의존성 설치:

```powershell
npm ci
```

검색 발견용 사이트 생성:

```powershell
npm run generate-hub -- 네이버블로그ID https://본인도메인.example
```

생성 위치:

```text
generated-hub/
```

이 폴더 전체를 GitHub Pages, Cloudflare Pages, Vercel 또는 일반 정적 웹호스팅에 배포한다. 배포 후 본인
도메인을 Search Console에서 확인하고 다음 주소를 사이트맵으로 제출한다.

```text
https://본인도메인.example/sitemap.xml
```

서비스 계정이 해당 Search Console 속성의 사용자로 등록된 경우 자동 제출:

```powershell
npm run submit-sitemap -- https://본인도메인.example/ https://본인도메인.example/sitemap.xml
```

필요한 환경변수는 `.env.local.example`을 참고한다. 서비스 계정 JSON은 Git에 커밋하지 않는다.

## 3. 구현 구조

| 파일 | 역할 |
|---|---|
| `src/lib/naver.ts` | 네이버 공개 글 목록 API를 페이지네이션해 전체 글 수집 |
| `src/lib/discoveryHub.ts` | 안내 페이지, 사이트맵, RSS, robots.txt 생성 |
| `scripts/generate-discovery-hub.ts` | CLI 입력 검증, 수집, `generated-hub/` 출력 |
| `scripts/submit-sitemap.ts` | Search Console Sitemaps API로 본인 도메인의 사이트맵 제출 |
| `src/lib/googleAuth.ts` | 서비스 계정 JWT로 OAuth 액세스 토큰 발급 |
| `src/lib/searchConsole.ts` | URL Inspection API를 통한 색인 상태 조회 실험 기능 |
| `src/lib/googleIndexing.ts` | Indexing API 요청 실험 기능 |

## 4. 중요 제약

1. Google Indexing API는 공식적으로 `JobPosting` 및 라이브 방송 페이지용이다. 일반 네이버 블로그 글에
   `URL_UPDATED`를 보내도 색인 반영은 보장되지 않는다.
2. URL Inspection API는 Search Console에서 소유권 또는 권한이 있는 속성에만 사용할 수 있다.
3. 네이버 블로그는 사용자가 DNS와 `<head>`를 통제하지 못하므로 일반 블로그 사용자가
   `https://blog.naver.com/ID/` 속성을 정상 인증하기 어렵다.
4. 생성된 브리지 사이트는 Google이 네이버 원문 URL을 발견하게 돕지만 원문 색인을 보장하지 않는다.
5. 검색 결과에는 네이버 원문보다 브리지 안내 페이지가 먼저 표시될 수 있다.
6. 과거의 Google sitemap ping 엔드포인트는 폐기됐다. `robots.txt` 또는 Search Console에서 제출해야 한다.
7. IndexNow는 Google Search 색인 제출 수단으로 간주하지 않는다.

## 5. 검증 결과

- `npm run build`: 통과
- `tsc --noEmit`: 통과
- 변경 파일 ESLint 검사: 통과
- 공개 네이버 블로그 샘플: 글 324개 수집
- 생성 결과: 글별 페이지 324개를 포함해 총 328개 파일 생성 확인

전체 `npm run lint`에는 기존 `src/app/page.tsx`의 `react-hooks/set-state-in-effect` 오류가 남아 있다. 이번에
추가한 생성기 파일의 오류는 아니다.

Windows의 Node.js 24 환경에서 `tsx`가 `uv_os_get_passwd returned ENOMEM`을 낸 사례가 있었다. 같은 코드를
TypeScript로 컴파일해 실행했을 때 실제 수집과 파일 생성은 정상 동작했다. 운영 환경은 Node.js 22 LTS를
권장한다.

## 6. 현재 Git 상태

최초 소스는 GitHub 커넥터로 파일 단위로 가져왔으며 `.git` 메타데이터는 포함되지 않았다. 로컬에서 새 Git
저장소를 만들었다.

기준 커밋:

```text
cd94d1b feat: generate search discovery hub for Naver blogs
```

현재 원격 저장소는 등록되어 있지 않다. GitHub에 올리려면 새 저장소를 만든 다음 다음과 같이 연결한다.

```powershell
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

## 7. 다음 작업 권장 순서

1. 실제 사용자 블로그 ID와 배포 도메인 확정
2. `generate-hub` 실행 및 정적 호스팅 배포
3. 배포 도메인 Search Console 소유권 확인
4. `/sitemap.xml` 제출
5. 1~2주 후 브리지 페이지와 네이버 원문의 검색 노출 상태 비교
6. GitHub Actions 또는 호스팅 빌드 단계에서 `generate-hub`를 정기 실행하도록 자동화
7. 기존 앱 화면에서 지원되지 않는 네이버 Search Console 직접 인증 문구 제거

## 8. 보안 주의사항

- 서비스 계정 JSON, `private_key`, OAuth 토큰을 저장소에 올리지 않는다.
- 생성 페이지에 네이버 글 본문이나 비공개 글을 복제하지 않는다.
- 네이버 글 목록 엔드포인트는 공식 공개 API가 아니므로 응답 형식 변경에 대비한다.
- 자동 수집 주기를 과도하게 짧게 설정하지 않는다.

