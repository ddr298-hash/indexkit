"use client";

import { useEffect, useState } from "react";
import { fetchAllNaverPosts, naverPostUrl } from "@/lib/naver";
import { fetchIndexedNaverUrls } from "@/lib/googleSearch";
import { addApiKey, isKeyExhausted, loadApiKeys, makeRotatingCseFetcher, removeApiKey, type ApiKeyEntry } from "@/lib/apiKeys";
import { requestIndexingBatch, type IndexRequestResult } from "@/lib/googleIndexing";
import {
  getCseId,
  getLastBlogId,
  getServiceAccount,
  loadReport,
  saveReport,
  setCseId as persistCseId,
  setLastBlogId,
  setServiceAccount,
  type DiagnosisEntry,
  type DiagnosisReport,
} from "@/lib/storage";

export default function Home() {
  const [cseId, setCseIdState] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [newKey, setNewKey] = useState("");
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
    setCseIdState(getCseId());
    setApiKeys(loadApiKeys());
    setHasServiceAccount(!!getServiceAccount());
    const lastBlogId = getLastBlogId();
    setBlogId(lastBlogId);
    if (lastBlogId) {
      const saved = loadReport(lastBlogId);
      if (saved) setReport(saved);
    }
  }, []);

  function handleSaveCseId() {
    persistCseId(cseId);
  }

  function handleAddKey() {
    if (!newKey.trim()) return;
    setApiKeys(addApiKey(newKey));
    setNewKey("");
  }

  function handleRemoveKey(key: string) {
    setApiKeys(removeApiKey(key));
  }

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
    const trimmedBlogId = blogId.trim();
    if (!trimmedBlogId) {
      setError("블로그 ID를 입력해주세요.");
      return;
    }
    if (!cseId) {
      setError("설정에서 Google Custom Search 엔진 ID(cx)를 먼저 등록해주세요.");
      return;
    }
    if (apiKeys.length === 0) {
      setError("설정에서 Google API 키를 최소 1개 등록해주세요.");
      return;
    }

    setError(null);
    setDiagnosing(true);
    setIndexResults(null);
    setReport(null);

    try {
      setProgress(`"${trimmedBlogId}" 블로그 글 목록 수집 중...`);
      const posts = await fetchAllNaverPosts(trimmedBlogId);

      setProgress(`구글 색인 상태 조회 중 (총 ${posts.length}개 글)...`);
      const indexedSet = await fetchIndexedNaverUrls(trimmedBlogId, makeRotatingCseFetcher(cseId));

      setProgress("결과 정리 중...");
      const entries: DiagnosisEntry[] = posts.map((p) => ({
        logNo: p.logNo,
        title: p.title,
        addDate: p.addDate,
        url: naverPostUrl(trimmedBlogId, p.logNo),
        indexed: indexedSet.has(`${trimmedBlogId}/${p.logNo}`),
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
      setApiKeys(loadApiKeys());
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
          {settingsOpen ? "▼ 설정 닫기" : "▶ 설정 (API 키 / 서비스 계정)"}
        </button>

        {settingsOpen && (
          <div className="settingsBody">
            <div className="field">
              <label>Custom Search 엔진 ID (cx)</label>
              <div className="row">
                <input value={cseId} onChange={(e) => setCseIdState(e.target.value)} placeholder="예: 017576662..." />
                <button onClick={handleSaveCseId}>저장</button>
              </div>
            </div>

            <div className="field">
              <label>Google API 키 목록 (사용량 소진 시 자동으로 다음 키로 전환)</label>
              {apiKeys.length === 0 && <p className="hint">등록된 키가 없습니다.</p>}
              <ul className="keyList">
                {apiKeys.map((k) => (
                  <li key={k.key} className="keyItem">
                    <span className="keyValue">{k.key.slice(0, 8)}…{k.key.slice(-4)}</span>
                    <span className={isKeyExhausted(k) ? "badge badgeWarn" : "badge badgeOk"}>
                      {isKeyExhausted(k) ? "소진됨" : "정상"}
                    </span>
                    <button className="removeBtn" onClick={() => handleRemoveKey(k.key)}>
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
              <div className="row">
                <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="새 API 키 붙여넣기" />
                <button onClick={handleAddKey}>+ 추가</button>
              </div>
            </div>

            <div className="field">
              <label>Google 서비스 계정 키 (JSON) — 색인 요청용</label>
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
          <input value={blogId} onChange={(e) => setBlogId(e.target.value)} placeholder="blog.naver.com/이 부분" />
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
