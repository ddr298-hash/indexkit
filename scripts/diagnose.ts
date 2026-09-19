import "dotenv/config";
import { fetchAllNaverPosts, naverPostUrl } from "../src/lib/naver";
import { fetchIndexedNaverUrls } from "../src/lib/googleSearch";
import { saveReport, type DiagnosisEntry } from "../src/lib/report";

async function main() {
  const blogId = process.argv[2] || process.env.NAVER_BLOG_ID;
  if (!blogId) {
    console.error("사용법: npm run diagnose -- <네이버블로그ID>");
    process.exit(1);
  }

  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) {
    console.error("GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID 환경변수가 필요합니다 (.env.local 확인).");
    process.exit(1);
  }

  console.log(`[1/3] "${blogId}" 블로그 글 목록 수집 중...`);
  const posts = await fetchAllNaverPosts(blogId);
  console.log(`  → 총 ${posts.length}개 글 발견`);

  console.log(`[2/3] 구글 색인 상태 조회 중 (site:blog.naver.com/${blogId})...`);
  const indexedSet = await fetchIndexedNaverUrls(blogId, apiKey, cseId);
  console.log(`  → 구글에 색인된 URL ${indexedSet.size}개 확인`);

  console.log(`[3/3] 진단 결과 정리 중...`);
  const entries: DiagnosisEntry[] = posts.map((p) => ({
    logNo: p.logNo,
    title: p.title,
    addDate: p.addDate,
    url: naverPostUrl(blogId, p.logNo),
    indexed: indexedSet.has(`${blogId}/${p.logNo}`),
  }));

  const indexedCount = entries.filter((e) => e.indexed).length;
  const missingCount = entries.length - indexedCount;

  const report = {
    blogId,
    generatedAt: new Date().toISOString(),
    totalPosts: entries.length,
    indexedCount,
    missingCount,
    entries,
  };

  const path = saveReport(report);

  console.log("");
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
