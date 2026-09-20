"use client";

import { useEffect, useState } from "react";
import { extractBlogId } from "@/lib/naver";
import {
  enablePages,
  getRepoVisibility,
  setRepoSecret,
  setRepoVariable,
  setRepoVisibility,
  triggerWorkflow,
} from "@/lib/github";
import {
  addBlogId,
  getBlogIds,
  getGithubConfig,
  getServiceAccount,
  removeBlogId,
  setGithubConfig,
  setServiceAccount,
} from "@/lib/storage";

const TOKEN_CREATE_URL =
  "https://github.com/settings/tokens/new?scopes=repo,workflow&description=indexkit-app";

interface GuideCallout {
  kind: "warn" | "ok";
  title: string;
  body: string;
}

interface GuideSection {
  title: string;
  intro?: string;
  steps?: string[];
  callout?: GuideCallout;
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "왜 \"허브\" 방식인가요?",
    intro:
      "네이버 블로그(blog.naver.com)는 DNS도, <head> 태그도, 정적 파일 업로드도 통제할 수 없어 " +
      "구글 Search Console 소유권 인증이 사실상 불가능합니다. 그래서 본인이 소유한 GitHub Pages " +
      "사이트를 \"허브\"로 만들어, 거기서 네이버 원문으로 링크를 걸어 구글봇이 따라오게 유도합니다. " +
      "네이버 블로그를 직접 진단·색인 요청하는 기능은 이런 이유로 이 앱에 없습니다.",
  },
  {
    title: "1단계 · Google Cloud 프로젝트 준비",
    steps: [
      "console.cloud.google.com 접속 → 새 프로젝트 생성",
      "API 및 서비스 → 라이브러리에서 'Google Search Console API' 검색 후 활성화",
    ],
  },
  {
    title: "2단계 · 서비스 계정 발급",
    steps: [
      "IAM 및 관리자 → 서비스 계정 → + 서비스 계정 만들기 (이름 아무거나)",
      "\"권한\", \"액세스 권한 부여\" 단계는 그냥 건너뛰기(완료 클릭)",
      "만든 계정 클릭 → 키 탭 → 키 추가 → 새 키 만들기 → JSON 선택 → 다운로드",
    ],
    callout: {
      kind: "warn",
      title: "이 JSON 파일은 비밀번호와 같습니다",
      body: "채팅방·공개 저장소 어디에도 올리지 마세요. 이 앱은 폰 안에만 저장하고 서버로 보내지 않습니다.",
    },
  },
  {
    title: "3단계 · GitHub 저장소 준비 (앱에서 자동화됨)",
    steps: [
      "위 \"설정\"에서 서비스 계정 JSON 저장",
      "GitHub 연동(저장소 소유자·이름·토큰) 저장 — 토큰은 링크 눌러서 발급",
      "\"🚀 GitHub 자동 설정\" 버튼 클릭 → Pages 활성화, HUB_DOMAIN·NAVER_BLOG_ID 변수, 시크릿 등록, " +
        "첫 배포까지 전부 자동 실행",
    ],
    callout: {
      kind: "ok",
      title: "여기까지는 버튼만 누르면 끝",
      body: "1~2분 후 https://저장소소유자.github.io/저장소이름/ 주소에서 허브 사이트가 열립니다.",
    },
  },
  {
    title: "4단계 · Google Search Console 소유권 확인 (직접 해야 하는 유일한 단계)",
    steps: [
      "search.google.com/search-console 접속 → 로그인",
      "속성 추가 → URL 접두어 선택 → 3단계에서 나온 허브 주소 입력",
      "인증 방법 중 \"HTML 파일\" 선택 → 안내되는 파일(google로 시작) 다운로드",
      "GitHub 저장소의 hub-static 폴더에 그 파일 업로드 (웹사이트에서 Add file → Upload files)",
      "\"🔗 허브에 반영\" 버튼(또는 GitHub Actions 탭에서 수동 실행)으로 재배포",
      "배포된 주소에서 그 파일이 열리는지 확인 후 Search Console에서 \"확인\" 클릭",
      "확인되면 그 속성 설정 → 사용자 및 권한 → 사용자 추가 → 서비스 계정 이메일(client_email)을 " +
        "소유자로 등록",
    ],
    callout: {
      kind: "ok",
      title: "본인 도메인이 있다면 더 쉬움",
      body: "도메인 속성으로 추가하고 DNS에 TXT 레코드 하나만 넣으면 파일 업로드 없이 바로 인증됩니다.",
    },
  },
  {
    title: "5단계 · 블로그 등록하고 계속 운영하기",
    steps: [
      "\"네이버 블로그 목록\"에서 블로그 추가",
      "\"🔗 허브에 반영\" 버튼으로 언제든 즉시 재배포 (안 눌러도 12시간마다 자동 실행됨)",
    ],
  },
];

export default function Home() {
  const [saJson, setSaJson] = useState("");
  const [hasServiceAccount, setHasServiceAccount] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const [blogIds, setBlogIds] = useState<string[]>([]);
  const [newBlogId, setNewBlogId] = useState("");

  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [hasGithubConfig, setHasGithubConfig] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [syncingHub, setSyncingHub] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [allowPublic, setAllowPublic] = useState(false);
  const [autoSetupRunning, setAutoSetupRunning] = useState(false);
  const [autoSetupStep, setAutoSetupStep] = useState("");
  const [autoSetupResult, setAutoSetupResult] = useState<string | null>(null);

  useEffect(() => {
    setHasServiceAccount(!!getServiceAccount());
    setBlogIds(getBlogIds());

    const gh = getGithubConfig();
    if (gh) {
      setGithubOwner(gh.owner);
      setGithubRepo(gh.repo);
      setGithubToken(gh.token);
      setHasGithubConfig(true);
    } else {
      // Prefilled for this app's own repo — first-time users just paste a token.
      setGithubOwner("ddr298-hash");
      setGithubRepo("indexkit");
    }
  }, []);

  function handleSaveServiceAccount() {
    const err = setServiceAccount(saJson);
    if (err) {
      setSettingsError(err);
      return;
    }
    setSettingsError(null);
    setSaJson("");
    setHasServiceAccount(true);
  }

  function handleSaveGithubConfig() {
    if (!githubOwner.trim() || !githubRepo.trim() || !githubToken.trim()) {
      setGithubError("저장소 소유자, 저장소 이름, 토큰을 모두 입력해주세요.");
      return;
    }
    setGithubConfig({ owner: githubOwner.trim(), repo: githubRepo.trim(), token: githubToken.trim() });
    setGithubError(null);
    setHasGithubConfig(true);
  }

  async function handleSyncHub() {
    const gh = getGithubConfig();
    if (!gh) {
      setGithubError("먼저 GitHub 연동 정보를 저장해주세요.");
      return;
    }
    if (blogIds.length === 0) {
      setSyncMessage("등록된 블로그가 없습니다.");
      return;
    }

    setSyncingHub(true);
    setSyncMessage(null);
    setGithubError(null);

    try {
      await setRepoVariable(gh, "NAVER_BLOG_ID", blogIds.join(","));
      await triggerWorkflow(gh, "hub.yml");
      setSyncMessage(`허브에 반영했습니다 (${blogIds.length}개 블로그) — 잠시 후 사이트가 갱신됩니다.`);
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncingHub(false);
    }
  }

  /**
   * One-shot first-time setup: enables Pages, writes the HUB_DOMAIN /
   * NAVER_BLOG_ID variables, uploads the service-account secret, and kicks
   * off the workflow — everything the GitHub side needs, in one tap. Search
   * Console ownership verification still needs the user's own Google login,
   * so that part stays manual (the guide walks through it).
   */
  async function handleAutoSetup() {
    const gh = getGithubConfig();
    if (!gh) {
      setGithubError("먼저 저장소 소유자·이름·토큰을 입력하고 저장해주세요.");
      return;
    }
    const sa = getServiceAccount();
    if (!sa) {
      setGithubError("먼저 Google 서비스 계정 키(JSON)를 등록해주세요.");
      return;
    }

    setAutoSetupRunning(true);
    setAutoSetupResult(null);
    setGithubError(null);

    try {
      setAutoSetupStep("저장소 공개 설정 확인 중...");
      const visibility = await getRepoVisibility(gh);
      if (visibility === "private") {
        if (!allowPublic) {
          throw new Error(
            "저장소가 private입니다. GitHub Pages 무료 사용에는 public 전환이 필요합니다 — 아래 체크박스를 선택한 뒤 다시 시도하거나, GitHub에서 직접 전환해주세요.",
          );
        }
        setAutoSetupStep("저장소를 public으로 전환 중...");
        await setRepoVisibility(gh, "public");
      }

      setAutoSetupStep("GitHub Pages 활성화 중...");
      const hubUrl = await enablePages(gh);
      const hubDomain = hubUrl.replace(/\/$/, "");

      setAutoSetupStep("저장소 변수(HUB_DOMAIN, NAVER_BLOG_ID) 설정 중...");
      await setRepoVariable(gh, "HUB_DOMAIN", hubDomain);
      await setRepoVariable(gh, "NAVER_BLOG_ID", blogIds.join(","));

      setAutoSetupStep("서비스 계정 키를 GitHub Secret으로 등록 중...");
      await setRepoSecret(gh, "GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(sa));

      setAutoSetupStep("허브 배포 워크플로우 실행 중...");
      await triggerWorkflow(gh, "hub.yml");

      setAutoSetupResult(
        `GitHub 쪽 설정이 끝났습니다. 1~2분 후 ${hubDomain} 에서 허브가 열립니다. ` +
          `이제 Search Console에서 이 주소의 소유권만 확인하면 끝입니다 (위 가이드 4단계 참고).`,
      );
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : String(err));
    } finally {
      setAutoSetupRunning(false);
      setAutoSetupStep("");
    }
  }

  function handleAddBlog() {
    const id = extractBlogId(newBlogId);
    if (!id) return;
    setBlogIds(addBlogId(id));
    setNewBlogId("");
  }

  function handleRemoveBlog(id: string) {
    setBlogIds(removeBlogId(id));
  }

  return (
    <div className="page">
      <header className="header">
        <h1>인덱스키트</h1>
        <p className="subtitle">내 네이버 블로그, 구글 노출용 허브로 자동 발행</p>
      </header>

      <section className="card">
        <button className="settingsToggle" onClick={() => setGuideOpen((v) => !v)}>
          {guideOpen ? "▼ 사용 가이드 닫기" : "📖 사용 가이드 (처음이면 여기부터)"}
        </button>

        {guideOpen && (
          <div className="settingsBody">
            {GUIDE_SECTIONS.map((section) => (
              <div key={section.title} className="field">
                <label>{section.title}</label>
                {section.intro && <p className="hint">{section.intro}</p>}
                {section.steps && (
                  <ol className="guideList">
                    {section.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
                {section.callout && (
                  <div className={section.callout.kind === "warn" ? "callout calloutWarn" : "callout calloutOk"}>
                    <span className="calloutTitle">{section.callout.title}</span>
                    {section.callout.body}
                  </div>
                )}
              </div>
            ))}
            <a
              className="linkHint"
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noopener noreferrer"
            >
              → Search Console 바로가기
            </a>
          </div>
        )}
      </section>

      <section className="card">
        <button className="settingsToggle" onClick={() => setSettingsOpen((v) => !v)}>
          {settingsOpen ? "▼ 설정 닫기" : "▶ 설정 (서비스 계정 / GitHub 연동)"}
        </button>

        {settingsOpen && (
          <div className="settingsBody">
            <div className="field">
              <label>Google 서비스 계정 키 (JSON) — 허브 사이트맵 자동 제출용</label>
              <a
                className="linkHint"
                href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                target="_blank"
                rel="noopener noreferrer"
              >
                → 서비스 계정 만들고 키(JSON) 발급받기 (console.cloud.google.com/iam-admin/serviceaccounts)
              </a>
              <p className="hint">{hasServiceAccount ? "✓ 등록됨" : "미등록"}</p>
              <textarea
                value={saJson}
                onChange={(e) => setSaJson(e.target.value)}
                placeholder='{"client_email": "...", "private_key": "..."}'
                rows={4}
              />
              <button onClick={handleSaveServiceAccount}>서비스 계정 저장</button>
              {settingsError && <p className="error">{settingsError}</p>}
            </div>

            <div className="field">
              <label>GitHub 연동 — 허브 자동 배포용</label>
              <a className="linkHint" href={TOKEN_CREATE_URL} target="_blank" rel="noopener noreferrer">
                → 토큰 발급받기 (버튼 누르면 필요한 권한이 미리 체크된 페이지가 열립니다)
              </a>
              <p className="hint">
                열린 페이지에서 맨 아래 <b>Generate token</b> 클릭 → 나오는 토큰(ghp_로 시작)을 복사해서
                아래 붙여넣기
              </p>
              <div className="row" style={{ marginBottom: 6 }}>
                <input value={githubOwner} onChange={(e) => setGithubOwner(e.target.value)} placeholder="저장소 소유자 (예: ddr298-hash)" />
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="저장소 이름 (예: indexkit)" />
              </div>
              <div className="row" style={{ marginBottom: 6 }}>
                <input
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="토큰 (ghp_...)"
                  type="password"
                />
              </div>
              <p className="hint">{hasGithubConfig ? "✓ 등록됨" : "미등록"}</p>
              <button onClick={handleSaveGithubConfig}>GitHub 연동 저장</button>

              {hasGithubConfig && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)" }}>
                  <p className="hint" style={{ marginBottom: 8 }}>
                    처음 한 번만: 아래 버튼으로 GitHub Pages 활성화 + 저장소 변수/시크릿 등록 +
                    첫 배포까지 자동으로 실행합니다. (Search Console 소유권 확인만 별도로 필요 — 위 가이드 참고)
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={allowPublic}
                      onChange={(e) => setAllowPublic(e.target.checked)}
                      style={{ width: "auto", flex: "none" }}
                    />
                    저장소가 private이면 public으로 전환 허용 (GitHub Pages 무료 사용에 필요)
                  </label>
                  <button onClick={handleAutoSetup} disabled={autoSetupRunning} style={{ width: "100%" }}>
                    {autoSetupRunning ? "설정 중..." : "🚀 GitHub 자동 설정 (처음 한 번)"}
                  </button>
                  {autoSetupRunning && autoSetupStep && <p className="progress">{autoSetupStep}</p>}
                  {autoSetupResult && <p className="hint">{autoSetupResult}</p>}
                </div>
              )}

              {githubError && <p className="error">{githubError}</p>}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <label>네이버 블로그 목록</label>
        <div className="row" style={{ marginTop: 6 }}>
          <input
            value={newBlogId}
            onChange={(e) => setNewBlogId(e.target.value)}
            placeholder="예: elecinout (블로그 주소를 통째로 붙여넣어도 됩니다)"
          />
          <button onClick={handleAddBlog}>+ 추가</button>
        </div>

        {blogIds.length === 0 && <p className="hint" style={{ marginTop: 8 }}>등록된 블로그가 없습니다.</p>}

        <ul className="keyList">
          {blogIds.map((id) => (
            <li key={id} className="keyItem">
              <span style={{ flex: 1 }}>{id}</span>
              <button className="removeBtn" onClick={() => handleRemoveBlog(id)}>
                삭제
              </button>
            </li>
          ))}
        </ul>

        {blogIds.length > 0 && (
          <>
            <button
              className="primaryBtn"
              style={{ marginTop: 8, background: "#1e8e3e" }}
              onClick={handleSyncHub}
              disabled={syncingHub || !hasGithubConfig}
            >
              {syncingHub ? "반영 중..." : "🔗 허브에 반영 (구글 노출용 사이트 갱신)"}
            </button>
            {!hasGithubConfig && (
              <p className="hint">설정에서 GitHub 연동을 먼저 저장하면 이 버튼이 활성화됩니다.</p>
            )}
            {syncMessage && <p className="hint">{syncMessage}</p>}
            {githubError && <p className="error">{githubError}</p>}
          </>
        )}
      </section>
    </div>
  );
}
