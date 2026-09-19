const CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const MAX_RESULTS = 100; // Custom Search API hard cap (start=1..91, 10 per page)
const PAGE_SIZE = 10;

interface CseItem {
  link: string;
}

interface CseResponse {
  items?: CseItem[];
  searchInformation?: { totalResults: string };
  error?: { message: string };
}

/**
 * Normalizes a Naver blog URL to logNo-only form so PC (blog.naver.com) and
 * mobile (m.blog.naver.com) variants, and query-string junk, are treated as one.
 */
export function normalizeNaverUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)blog\.naver\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // PathnaverURL forms: /{blogId}/{logNo}  or  /PostView.naver?blogId=..&logNo=..
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      return `${parts[0]}/${parts[1]}`;
    }
    const blogId = u.searchParams.get("blogId");
    const logNo = u.searchParams.get("logNo");
    if (blogId && logNo) return `${blogId}/${logNo}`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetches every URL Google currently has indexed under blog.naver.com/{blogId}
 * via a single `site:` query, paginated up to the API's 100-result cap.
 * This is far cheaper than checking one query per post.
 */
export async function fetchIndexedNaverUrls(
  blogId: string,
  apiKey: string,
  cseId: string,
): Promise<Set<string>> {
  const indexed = new Set<string>();

  for (let start = 1; start <= MAX_RESULTS; start += PAGE_SIZE) {
    const params = new URLSearchParams({
      key: apiKey,
      cx: cseId,
      q: `site:blog.naver.com/${blogId}`,
      start: String(start),
      num: String(PAGE_SIZE),
    });

    const res = await fetch(`${CSE_ENDPOINT}?${params.toString()}`);
    const data = (await res.json()) as CseResponse;

    if (!res.ok) {
      throw new Error(`Google Custom Search API 오류: ${data.error?.message || res.status}`);
    }

    if (!data.items || data.items.length === 0) break;

    for (const item of data.items) {
      const normalized = normalizeNaverUrl(item.link);
      if (normalized) indexed.add(normalized);
    }

    if (data.items.length < PAGE_SIZE) break;
  }

  return indexed;
}
