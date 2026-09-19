import "dotenv/config";
import { readFileSync } from "node:fs";
import { latestReportPath, loadReport } from "../src/lib/report";
import { requestIndexingBatch, type ServiceAccount } from "../src/lib/googleIndexing";

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
    console.error("사용법: npm run request-index -- <네이버블로그ID> [--all]");
    process.exit(1);
  }

  const serviceAccount = loadServiceAccount();
  const path = latestReportPath(blogId);
  if (!path) {
    console.error(`"${blogId}"의 진단 보고서가 없습니다. 먼저 실행하세요: npm run diagnose -- ${blogId}`);
    process.exit(1);
  }

  const report = loadReport(path);
  const missing = report.entries.filter((e) => !e.indexed);

  if (missing.length === 0) {
    console.log("누락된 글이 없습니다. 색인 요청을 보낼 URL이 없습니다.");
    return;
  }

  console.log(`보고서: ${path}`);
  console.log(`누락 글 ${missing.length}개에 대해 Google Indexing API 색인 요청을 전송합니다...`);
  console.log("(주의: 이 API는 공식적으로 채용공고/라이브방송 페이지 전용이며, 일반 블로그 글에는");
  console.log(" 색인이 보장되지 않습니다. 또한 blog.naver.com 소유권을 서치 콘솔에서 확인해야 동작합니다.)\n");

  const results = await requestIndexingBatch(missing.map((e) => e.url), serviceAccount);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n========== 색인 요청 결과 ==========`);
  console.log(`성공: ${ok.length} / 실패: ${failed.length}`);
  if (failed.length > 0) {
    console.log("\n실패 목록:");
    failed.slice(0, 10).forEach((r) => console.log(`  - ${r.url}\n    사유: ${r.error}`));
    if (failed.length > 10) console.log(`  ... 외 ${failed.length - 10}건`);
  }
  console.log("=====================================");
}

main().catch((err) => {
  console.error("색인 요청 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
