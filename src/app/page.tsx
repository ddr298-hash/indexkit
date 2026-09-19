"use client";

import { useEffect, useState } from "react";
import { extractBlogId, fetchAllNaverPosts, naverPostUrl } from "@/lib/naver";
import { inspectUrlsBatch } from "@/lib/searchConsole";
import { requestIndexingBatch, type IndexRequestResult } from "@/lib/googleIndexing";
import {
  getLastBlogId,
  getServiceAccount,
  loadReport,
  saveReport,
  setLastBlogId,
  setServiceAccount,
  type DiagnosisEntry,
  type DiagnosisReport,
} from "@/lib/storage";

function siteUrlFor(blogId: string): string {
  return `https://blog.naver.com/${blogId}/`;
}

export default function Home() {
  const [saJson, setSaJson] = useState("");
  const [hasServiceAccount, setHasServiceAccount] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [blogId, setBlogId] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DiagnosisReport | null>(null);

  const [indexing, setIndexing] = useState(false);
  const [indexResults, setIndexResults] = useState<IndexRequestResult[] | null>(null);
  const [indexProgress, setIndexProgress] = useState("");

  useEffect(() => {
    setHasServiceAccount(!!getServiceAccount());
    const lastBlogId = getLastBlogId();
    setBlogId(lastBlogId);
    if (lastBlogId) {
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

  async function handleDiagnose() {
    const trimmedBlogId = extractBlogId(blogId);
    if (!trimmedBlogId) {
      setError("블로그 ID를 입력해주세요.");
      return;
    }
    setBlogId(trimmedBlogId);

    const sa = getServiceAccount();
    if (!sa) {
      setError("설정에서 Google 서비스 계정 키(JSON)를 먼저 등록해주세요.");
      return;
    }

    setError(null);
    setDiagnosing(true);
    setIndexResults(null);
    setReport(null);

    try {
      setProgress(`"${trimmedBlogId}" 블로그 글 목록 수집 중...`);
      const posts = await fetchAllNaverPosts(trimmedBlogId);

      const siteUrl = siteUrlFor(trimmedBlogId);
      const urls = posts.map((p) => naverPostUrl(trimmedBlogId, p.logNo));

      const inspections = await inspectUrlsBatch(urls, siteUrl, sa, 150, (_result, done, total) =>
        setProgress(`구글 색인 상태 확인 중... (${done}/${total})`),
      );

      setProgress("결과 정리 중...");
      const entries: DiagnosisEntry[] = posts.map((p, i) => ({
        logNo: p.logNo,
        title: p.title,
        addDate: p.addDate,
        url: urls[i],
        indexed: inspections[i].indexed,
      }));

      const indexedCount = entries.filter((e) => e.indexed).length;
      const newReport: DiagnosisReport = {
        blogId: trimmedBlogId,
        generatedAt: new Date().toISOString(),
        totalPosts: entries.length,
        indexedCount,
        missingCount: entries.length - indexedCount,
        entries,
      };

      saveReport(newReport);
      setLastBlogId(trimmedBlogId);
      setReport(newReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiagnosing(false);
      setProgress("");
    }
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
                에서 <code>https://blog.naver.com/본인ID/</code> URL 접두어 속성의 소유자로 등록해야 진단/색인 요청이
                동작합니다 (README 참고).
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
        <label>네이버 블로그 ID</label>
        <div className="row">
          <input
            value={blogId}
            onChange={(e) => setBlogId(e.target.value)}
            placeholder="예: elecinout (블로그 주소를 통째로 붙여넣어도 됩니다)"
          />
          <button onClick={handleDiagnose} disabled={diagnosing}>
            {diagnosing ? "진단 중..." : "진단하기"}
          </button>
        </div>
        {diagnosing && <p className="progress">{progress}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {report && (
        <section className="card">
          <h2>진단 결과</h2>
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
                <p className="hint">
                  성공 {indexResults.filter((r) => r.ok).length} / 실패 {indexResults.filter((r) => !r.ok).length}
                </p>
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
