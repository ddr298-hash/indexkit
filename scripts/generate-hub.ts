import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchAllNaverPosts, naverPostUrl } from "../src/lib/naver";

function parseNaverDate(addDate: string): Date {
  const m = addDate.match(/(\d+)\.\s*(\d+)\.\s*(\d+)/);
  if (!m) return new Date();
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function main() {
  const blogId = process.argv[2];
  const domainArg = process.argv[3];
  if (!blogId || !domainArg) {
    console.error("사용법: npm run generate-hub -- <네이버블로그ID> <https://내가-소유한-도메인.example>");
    process.exit(1);
  }
  const baseUrl = domainArg.replace(/\/$/, "");

  console.log(`"${blogId}" 블로그 글 목록 수집 중...`);
  const posts = await fetchAllNaverPosts(blogId);
  console.log(`  → ${posts.length}개 글 발견`);

  const entries = posts.map((p) => ({
    ...p,
    naverUrl: naverPostUrl(blogId, p.logNo),
    hubUrl: `${baseUrl}/posts/${p.logNo}.html`,
    date: parseNaverDate(p.addDate),
  }));

  const outDir = join(process.cwd(), "generated-hub");
  const postsDir = join(outDir, "posts");
  mkdirSync(postsDir, { recursive: true });

  // Per-post pages: title + date + a link to the original — no body content,
  // so this never competes with the Naver post as duplicate content.
  for (const e of entries) {
    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeXml(e.title)}</title>
<meta name="robots" content="index,follow">
<link rel="canonical" href="${e.hubUrl}">
</head>
<body>
<article>
<h1>${escapeXml(e.title)}</h1>
<p>발행일: ${e.addDate}</p>
<p><a href="${e.naverUrl}" rel="noopener">원문 보기 (네이버 블로그) →</a></p>
</article>
</body>
</html>
`;
    writeFileSync(join(postsDir, `${e.logNo}.html`), html, "utf-8");
  }

  const listItems = entries
    .map((e) => `<li><a href="${e.hubUrl}">${escapeXml(e.title)}</a> — <time>${e.addDate}</time></li>`)
    .join("\n");
  const indexHtml = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeXml(blogId)} 블로그 글 모음</title>
<meta name="robots" content="index,follow">
</head>
<body>
<h1>${escapeXml(blogId)} 블로그 글 모음</h1>
<ul>
${listItems}
</ul>
</body>
</html>
`;
  writeFileSync(join(outDir, "index.html"), indexHtml, "utf-8");

  const urlEntries = [
    { loc: `${baseUrl}/`, lastmod: toLocalDateString(new Date()) },
    ...entries.map((e) => ({ loc: e.hubUrl, lastmod: toLocalDateString(e.date) })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.map((u) => `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;
  writeFileSync(join(outDir, "sitemap.xml"), sitemap, "utf-8");

  const rssItems = entries
    .map(
      (e) => `  <item>
    <title>${escapeXml(e.title)}</title>
    <link>${escapeXml(e.naverUrl)}</link>
    <guid>${escapeXml(e.naverUrl)}</guid>
    <pubDate>${e.date.toUTCString()}</pubDate>
  </item>`,
    )
    .join("\n");
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(blogId)} 블로그</title>
  <link>${escapeXml(baseUrl)}/</link>
  <description>${escapeXml(blogId)} 네이버 블로그 글 모음</description>
${rssItems}
</channel>
</rss>
`;
  writeFileSync(join(outDir, "rss.xml"), rss, "utf-8");

  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`, "utf-8");

  // Files that must survive every regeneration (e.g. a Search Console HTML
  // verification file) live in hub-static/ and get copied in as-is, last —
  // this folder is git-tracked, so they persist across CI regenerations too.
  const staticDir = join(process.cwd(), "hub-static");
  if (existsSync(staticDir)) {
    cpSync(staticDir, outDir, { recursive: true, filter: (src) => !src.endsWith("README.md") });
  }

  console.log(`\n생성 완료: ${outDir}`);
  console.log(`- index.html, posts/*.html (${entries.length}개), sitemap.xml, rss.xml, robots.txt`);
  if (existsSync(staticDir)) console.log(`- hub-static/ 내용도 함께 복사됨 (인증 파일 등)`);
  console.log(`\n이 폴더를 ${baseUrl} 에 배포한 뒤 Search Console에 등록하고 sitemap.xml을 제출하세요.`);
  console.log(`(서비스 계정을 이 도메인의 소유자로 등록해두면 npm run submit-sitemap 으로 자동 제출 가능)`);
}

main().catch((err) => {
  console.error("생성 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
