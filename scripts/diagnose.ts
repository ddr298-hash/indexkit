import "dotenv/config";
import { readFileSync } from "node:fs";
import { fetchAllNaverPosts, naverPostUrl } from "../src/lib/naver";
import { inspectUrlsBatch, isPermissionError } from "../src/lib/searchConsole";
import { saveReport, type DiagnosisEntry } from "../src/lib/report";
import type { ServiceAccount } from "../src/lib/googleIndexing";

function loadServiceAccount(): ServiceAccount {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    console.error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH 환경변수가 필요합니다 (.env.local 확인).");
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(keyPath, "utf-8"));
  if (!parsed.client_email || !parsed.private_key) {
    console.error(`서비스 계정 키 파일에 client_email/private_key가 없습니다: ${keyPath}`);
    process.exit(1);
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

async function main() {
  const blogId = process.argv[2] || process.env.NAVER_BLOG_ID;
  if (!blogId) {
    console.error("사용법: npm run diagnose -- <네이버블로그ID>");
    process.exit(1);
  }

  const serviceAccount = loadServiceAccount();
  const siteUrl = `https://blog.naver.com/${blogId}/`;

  console.log(`[1/3] "${blogId}" 블로그 글 목록 수집 중...`);
  const posts = await fetchAllNaverPosts(blogId);
  console.log(`  → 총 ${posts.length}개 글 발견`);

  console.log(`[2/3] 구글 색인 상태 확인 중 (Search Console URL 검사, 글마다 1회 호출)...`);
  const urls = posts.map((p) => naverPostUrl(blogId, p.logNo));
  const inspections = await inspectUrlsBatch(urls, siteUrl, serviceAccount, 150, (_result, done, total) => {
    if (done % 20 === 0 || done === total) process.stdout.write(`\r  → ${done}/${total}`);
  });
  process.stdout.write("\n");

  console.log(`[3/3] 진단 결과 정리 중...`);
  const entries: DiagnosisEntry[] = posts.map((p, i) => ({
    logNo: p.logNo,
    title: p.title,
    addDate: p.addDate,
    url: urls[i],
    indexed: inspections[i].indexed,
  }));

  const permissionErrors = inspections.filter((r) => r.error && isPermissionError(r.error));
  const verificationError =
    permissionErrors.length > inspections.length / 2 ? permissionErrors[0].error : undefined;

  const indexedCount = entries.filter((e) => e.indexed).length;
  const missingCount = entries.length - indexedCount;

  const report = {
    blogId,
    generatedAt: new Date().toISOString(),
    totalPosts: entries.length,
    indexedCount,
    missingCount,
    entries,
    verificationError,
  };

  const path = saveReport(report);

  console.log("");

  if (verificationError) {
    console.log("========== ⚠️ Search Console 인증 필요 ==========");
    console.log(`아래 숫자는 신뢰할 수 없습니다 — 호출이 전부 실패해서 "미색인"으로 표시된 것입니다.`);
    console.log(`서비스 계정을 https://blog.naver.com/${blogId}/ 속성의 소유자로 등록한 뒤 다시 실행하세요.`);
    console.log(`실제 오류: ${verificationError}`);
    console.log("==================================================");
    return;
  }

  console.log("========== 진단 결과 ==========");
  console.log(`전체 글:   ${report.totalPosts}`);
  console.log(`색인됨:    ${indexedCount} (${((indexedCount / (report.totalPosts || 1)) * 100).toFixed(1)}%)`);
  console.log(`누락:      ${missingCount}`);
  console.log(`보고서:    ${path}`);
  console.log("================================");

  if (missingCount > 0) {
    console.log("\n누락된 글 (최대 10개 표시):");
    entries
      .filter((e) => !e.indexed)
      .slice(0, 10)
      .forEach((e) => console.log(`  - [${e.addDate}] ${e.title}\n    ${e.url}`));
    console.log(`\n색인 요청을 하려면: npm run request-index -- ${blogId}`);
  }
}

main().catch((err) => {
  console.error("진단 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
