import "dotenv/config";
import { readFileSync } from "node:fs";
import { submitSitemap } from "../src/lib/sitemap";
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
  const siteUrl = process.argv[2];
  const sitemapUrl = process.argv[3];
  if (!siteUrl || !sitemapUrl) {
    console.error("사용법: npm run submit-sitemap -- <siteUrl> <sitemapUrl>");
    console.error("예:     npm run submit-sitemap -- https://example.com/ https://example.com/sitemap.xml");
    process.exit(1);
  }

  const sa = loadServiceAccount();
  await submitSitemap(siteUrl, sitemapUrl, sa);
  console.log(`사이트맵 제출 완료: ${sitemapUrl} → ${siteUrl}`);
}

main().catch((err) => {
  console.error("사이트맵 제출 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
