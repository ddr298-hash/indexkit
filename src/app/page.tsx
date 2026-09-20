"use client";

import { useEffect, useState } from "react";
import { extractBlogId, fetchAllNaverPosts, naverPostUrl } from "@/lib/naver";
import { inspectUrlsBatch } from "@/lib/searchConsole";
import { requestIndexingBatch, type IndexRequestResult } from "@/lib/googleIndexing";
import {
  addBlogId,
  getBlogIds,
  getLastBlogId,
  getServiceAccount,
  loadReport,
  removeBlogId,
  saveReport,
  setLastBlogId,
  setServiceAccount,
  type DiagnosisEntry,
  type DiagnosisReport,
} from "@/lib/storage";

function siteUrlFor(blogId: string): string {
  return `https://blog.naver.com/${blogId}/`;
}

type Summary = Pick<DiagnosisReport, "totalPosts" | "indexedCount" | "missingCount">;

export default function Home() {
  const [saJson, setSaJson] = useState("");
  const [hasServiceAccount, setHasServiceAccount] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [blogIds, setBlogIds] = useState<string[]>([]);
  const [newBlogId, setNewBlogId] = useState("");
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [selectedBlogId, setSelectedBlogId] = useState<string>("");
  const [report, setReport] = useState<DiagnosisReport | null>(null);

  const [diagnosingBlogId, setDiagnosingBlogId] = useState<string | null>(null);
  const [diagnosingAll, setDiagnosingAll] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [indexing, setIndexing] = useState(false);
  const [indexResults, setIndexResults] = useState<IndexRequestResult[] | null>(null);
  const [indexProgress, setIndexProgress] = useState("");

  useEffect(() => {
    setHasServiceAccount(!!getServiceAccount());

    const ids = getBlogIds();
    setBlogIds(ids);

    const nextSummaries: Record<string, Summary> = {};
    for (const id of ids) {
      const saved = loadReport(id);
      if (saved) nextSummaries[id] = saved;
    }
    setSummaries(nextSummaries);

    const lastBlogId = getLastBlogId();
    if (lastBlogId && ids.includes(lastBlogId)) {
      setSelectedBlogId(lastBlogId);
      const saved = loadReport(lastBlogId);
      if (saved) setReport(saved);
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

  function handleAddBlog() {
    const id = extractBlogId(newBlogId);
    if (!id) return;
    setBlogIds(addBlogId(id));
    setNewBlogId("");
    handleSelectBlog(id);
  }

  function handleRemoveBlog(id: string) {
    setBlogIds(removeBlogId(id));
    setSummaries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedBlogId === id) {
      setSelectedBlogId("");
      setReport(null);
    }
  }

  function handleSelectBlog(id: string) {
    setSelectedBlogId(id);
    setLastBlogId(id);
    setIndexResults(null);
    setReport(loadReport(id));
  }

  async function diagnoseOne(blogId: string, sa: NonNullable<ReturnType<typeof getServiceAccount>>) {
    const posts = await fetchAllNaverPosts(blogId);
    const siteUrl = siteUrlFor(blogId);
    const urls = posts.map((p) => naverPostUrl(blogId, p.logNo));

    const inspections = await inspectUrlsBatch(urls, siteUrl, sa, 150, (_result, done, total) =>
      setProgress(`"${blogId}" 구글 색인 상태 확인 중... (${done}/${total})`),
    );

    const entries: DiagnosisEntry[] = posts.map((p, i) => ({
      logNo: p.logNo,
      title: p.title,
      addDate: p.addDate,
      url: urls[i],
      indexed: inspections[i].indexed,
    }));

    const indexedCount = entries.filter((e) => e.indexed).length;
    const newReport: DiagnosisReport = {
      blogId,
      generatedAt: new Date().toISOString(),
      totalPosts: entries.length,
      indexedCount,
      missingCount: entries.length - indexedCount,
      entries,
    };

    saveReport(newReport);
    setSummaries((prev) => ({ ...prev, [blogId]: newReport }));
    return newReport;
  }

  async function handleDiagnose(blogId: string) {
    const sa = getServiceAccount();
    if (!sa) {
      setError("설정에서 Google 서비스 계정 키(JSON)를 먼저 등록해주세요.");
      return;
    }

    setError(null);
    setDiagnosingBlogId(blogId);
    setIndexResults(null);

    try {
      setProgress(`"${blogId}" 블로그 글 목록 수집 중...`);
      const newReport = await diagnoseOne(blogId, sa);
      handleSelectBlog(blogId);
      setReport(newReport);
    } catch (err) {
      setError(`"${blogId}" 진단 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDiagnosingBlogId(null);
      setProgress("");
    }
  }

  async function handleDiagnoseAll() {
    const sa = getServiceAccount();
    if (!sa) {
      setError("설정에서 Google 서비스 계정 키(JSON)를 먼저 등록해주세요.");
      return;
    }
    if (blogIds.length === 0) return;

    setError(null);
    setDiagnosingAll(true);
    setIndexResults(null);

    for (let i = 0; i < blogIds.length; i++) {
      const blogId = blogIds[i];
      setDiagnosingBlogId(blogId);
      try {
        setProgress(`[${i + 1}/${blogIds.length}] "${blogId}" 글 목록 수집 중...`);
        await diagnoseOne(blogId, sa);
      } catch (err) {
        setError(`"${blogId}" 진단 실패: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    setDiagnosingBlogId(null);
    setDiagnosingAll(false);
    setProgress("");
    if (selectedBlogId) setReport(loadReport(selectedBlogId));
  }

  async function handleRequestIndex() {
    if (!report) return;
    const sa = getServiceAccount();
    if (!sa) {
      setError("설정에서 Google 서비스 계정 키(JSON)를 먼저 등록해주세요.");
      return;
    }
    const missing = report.entries.filter((e) => !e.indexed);
    if (missing.length === 0) return;

    setError(null);
    setIndexing(true);
    setIndexResults(null);

    try {
      const results = await requestIndexingBatch(
        missing.map((e) => e.url),
        sa,
        300,
        (_result, done, total) => setIndexProgress(`색인 요청 중... (${done}/${total})`),
      );
      setIndexResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIndexing(false);
      setIndexProgress("");
    }
  }

  const missingEntries = report?.entries.filter((e) => !e.indexed) ?? [];
  const anyDiagnosing = diagnosingBlogId !== null;

  return (
    <div className="page">
      <header className="header">
        <h1>인덱스키트</h1>
        <p className="subtitle">내 네이버 블로그 구글 색인 진단 &amp; 요청</p>
      </header>

      <section className="card">
        <button className="settingsToggle" onClick={() => setSettingsOpen((v) => !v)}>
          {settingsOpen ? "▼ 설정 닫기" : "▶ 설정 (서비스 계정)"}
        </button>

        {settingsOpen && (
          <div className="settingsBody">
            <div className="field">
              <label>Google 서비스 계정 키 (JSON) — 진단 &amp; 색인 요청 공용</label>
              <a
                className="linkHint"
                href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                target="_blank"
                rel="noopener noreferrer"
              >
                → 서비스 계정 만들고 키(JSON) 발급받기 (console.cloud.google.com/iam-admin/serviceaccounts)
              </a>
              <p className="hint">
                발급 후 이 계정 이메일(client_email)을{" "}
                <a
                  className="linkHint"
                  style={{ display: "inline" }}
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Search Console
                </a>
                에서 각 블로그의 <code>https://blog.naver.com/블로그ID/</code> URL 접두어 속성 소유자로
                등록해야 진단/색인 요청이 동작합니다 (README 참고).
              </p>
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
          {blogIds.map((id) => {
            const s = summaries[id];
            const isSelected = id === selectedBlogId;
            const isDiagnosingThis = diagnosingBlogId === id;
            return (
              <li key={id} className="keyItem" style={{ flexWrap: "wrap" }}>
                <button
                  onClick={() => handleSelectBlog(id)}
                  style={{
                    background: "none",
                    color: isSelected ? "#1a73e8" : "var(--foreground)",
                    fontWeight: isSelected ? 700 : 400,
                    padding: 0,
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  {id}
                </button>
                {s && (
                  <span className={s.missingCount > 0 ? "badge badgeWarn" : "badge badgeOk"}>
                    {s.indexedCount}/{s.totalPosts}
                  </span>
                )}
                <button onClick={() => handleDiagnose(id)} disabled={anyDiagnosing || diagnosingAll}>
                  {isDiagnosingThis ? "진단 중..." : "진단"}
                </button>
                <button className="removeBtn" onClick={() => handleRemoveBlog(id)}>
                  삭제
                </button>
              </li>
            );
          })}
        </ul>

        {blogIds.length > 1 && (
          <button
            className="primaryBtn"
            style={{ marginTop: 8 }}
            onClick={handleDiagnoseAll}
            disabled={anyDiagnosing || diagnosingAll}
          >
            {diagnosingAll ? "전체 진단 중..." : `등록된 블로그 ${blogIds.length}개 전체 진단`}
          </button>
        )}

        {(anyDiagnosing || diagnosingAll) && progress && <p className="progress">{progress}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {report && (
        <section className="card">
          <h2>&quot;{report.blogId}&quot; 진단 결과</h2>
          <div className="statRow">
            <div className="stat">
              <span className="statNum">{report.totalPosts}</span>
              <span className="statLabel">전체 글</span>
            </div>
            <div className="stat">
              <span className="statNum statOk">{report.indexedCount}</span>
              <span className="statLabel">색인됨</span>
            </div>
            <div className="stat">
              <span className="statNum statWarn">{report.missingCount}</span>
              <span className="statLabel">누락</span>
            </div>
          </div>

          {report.missingCount > 0 && (
            <>
              <button className="primaryBtn" onClick={handleRequestIndex} disabled={indexing}>
                {indexing ? "요청 중..." : `누락 글 ${missingEntries.length}개 색인 요청`}
              </button>
              {indexing && <p className="progress">{indexProgress}</p>}

              {indexResults && (
                <>
                  <p className="hint">
                    성공 {indexResults.filter((r) => r.ok).length} / 실패{" "}
                    {indexResults.filter((r) => !r.ok && !r.skipped).length} / 건너뜀{" "}
                    {indexResults.filter((r) => r.skipped).length}
                  </p>
                  {indexResults.some((r) => r.skipped) && (
                    <p className="error">
                      오늘의 Google Indexing API 할당량(하루 200건)을 다 써서 나머지는 요청하지 않았습니다.
                      태평양시 자정(한국시간 오후 5시경) 이후 초기화되니 그 뒤에 다시 시도해주세요.
                    </p>
                  )}
                </>
              )}

              <ul className="postList">
                {missingEntries.map((e) => {
                  const result = indexResults?.find((r) => r.url === e.url);
                  return (
                    <li key={e.logNo} className="postItem">
                      <div className="postTitle">{e.title}</div>
                      <div className="postMeta">
                        {e.addDate}
                        {result && (
                          <span className={result.ok ? "badge badgeOk" : "badge badgeWarn"}>
                            {result.ok ? "요청됨" : `실패: ${result.error}`}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
