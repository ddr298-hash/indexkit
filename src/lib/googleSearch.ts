const CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const MAX_RESULTS = 100; // Custom Search API hard cap (start=1..91, 10 per page)
const PAGE_SIZE = 10;

export interface CseItem {
  link: string;
}

interface CseResponse {
  items?: CseItem[];
  error?: { message: string; status?: string; code?: number };
}

/** Thrown on a non-2xx Custom Search API response; carries enough detail to tell a quota error from any other failure. */
export class GoogleApiError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.reason = reason;
  }
}

export function isQuotaError(err: unknown): err is GoogleApiError {
  if (!(err instanceof GoogleApiError)) return false;
  if (err.status === 429) return true;
  const reason = (err.reason || "").toLowerCase();
  return ["resource_exhausted", "ratelimitexceeded", "dailylimitexceeded", "quotaexceeded", "userratelimitexceeded"].includes(
    reason,
  );
}

/** A single `site:` search page fetch. Given directly to the CLI (fixed key) or wrapped for key rotation (app). */
export type CsePageFetcher = (query: string, start: number) => Promise<CseItem[]>;

export async function cseSearchPage(
  apiKey: string,
  cseId: string,
  query: string,
  start: number,
): Promise<CseItem[]> {
  const params = new URLSearchParams({
    key: apiKey,
    cx: cseId,
    q: query,
    start: String(start),
    num: String(PAGE_SIZE),
  });

  const res = await fetch(`${CSE_ENDPOINT}?${params.toString()}`);
  const data = (await res.json()) as CseResponse;

  if (!res.ok) {
    throw new GoogleApiError(data.error?.message || res.statusText, res.status, data.error?.status);
  }

  return data.items ?? [];
}

export function makeSimpleCseFetcher(apiKey: string, cseId: string): CsePageFetcher {
  return (query, start) => cseSearchPage(apiKey, cseId, query, start);
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
export async function fetchIndexedNaverUrls(blogId: string, fetchPage: CsePageFetcher): Promise<Set<string>> {
  const indexed = new Set<string>();

  for (let start = 1; start <= MAX_RESULTS; start += PAGE_SIZE) {
    const items = await fetchPage(`site:blog.naver.com/${blogId}`, start);

    if (items.length === 0) break;

    for (const item of items) {
      const normalized = normalizeNaverUrl(item.link);
      if (normalized) indexed.add(normalized);
    }

    if (items.length < PAGE_SIZE) break;
  }

  return indexed;
}
