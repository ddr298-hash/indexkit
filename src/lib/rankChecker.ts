import { registerPlugin } from "@capacitor/core";

export interface RankCheckResult {
  rank: number;
  error?: string;
}

interface RankCheckerPluginApi {
  checkRank(options: { searchUrl: string; urlFragment: string; timeoutMs?: number }): Promise<RankCheckResult>;
}

const RankChecker = registerPlugin<RankCheckerPluginApi>("RankChecker");

/**
 * Checks whether a Naver blog post shows up when its own title is searched —
 * "누락 검증" as done by the keyword app's NaverRankChecker: render the real
 * search page in a WebView (results are partly JS-rendered, so a plain
 * fetch+regex parse misses them) and look for a matching blog.naver.com link.
 */
export async function checkNaverRank(title: string, blogId: string, timeoutMs = 20000): Promise<RankCheckResult> {
  const query = encodeURIComponent(`"${title}"`);
  const searchUrl = `https://search.naver.com/search.naver?where=view&sm=tab_jum&query=${query}`;
  return RankChecker.checkRank({ searchUrl, urlFragment: blogId, timeoutMs });
}

/**
 * Same technique pointed at Google instead — this is what actually solves
 * the Google-indexing question without Search Console API access, which is
 * structurally unobtainable for blog.naver.com (no ownership verification
 * path exists). No API key, no quota, no verification needed; the tradeoff
 * is that it's screen-scraping a rendered search page rather than calling
 * an official API, so treat results as a signal, not a guarantee, and keep
 * a delay between checks.
 */
export async function checkGoogleRank(title: string, blogId: string, timeoutMs = 20000): Promise<RankCheckResult> {
  const query = encodeURIComponent(`"${title}"`);
  const searchUrl = `https://www.google.com/search?q=${query}&num=20&hl=ko`;
  return RankChecker.checkRank({ searchUrl, urlFragment: `blog.naver.com/${blogId}`, timeoutMs });
}
