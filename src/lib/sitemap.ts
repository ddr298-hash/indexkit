import { getAccessToken, type ServiceAccount } from "./googleAuth";

const SCOPE = "https://www.googleapis.com/auth/webmasters";

/**
 * Submits a sitemap for a Search Console property via the legacy Webmasters
 * API. Unlike the Naver-hosted URL prefix, `siteUrl` here is expected to be
 * a domain the user actually controls and has verified normally (DNS/HTML
 * file/meta tag) — no ownership workaround needed.
 */
export async function submitSitemap(siteUrl: string, sitemapUrl: string, sa: ServiceAccount): Promise<void> {
  const token = await getAccessToken(sa, SCOPE);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `사이트맵 제출 실패 (${res.status})`);
  }
}

export interface SitemapContentStat {
  type: string;
  submitted: number;
  indexed: number;
}

export interface SitemapStatus {
  path: string;
  lastDownloaded?: string;
  isPending: boolean;
  contents: SitemapContentStat[];
}

/**
 * Reads Google's own count of how many submitted URLs it has indexed, for
 * a sitemap on a property that's actually verified (the hub domain — never
 * blog.naver.com itself). This is an indirect signal: it reports on the hub
 * pages, not the linked Naver posts directly, but it's the one official,
 * stable number available without per-Naver-blog ownership verification.
 */
export async function getSitemapStatus(siteUrl: string, sitemapUrl: string, sa: ServiceAccount): Promise<SitemapStatus> {
  const token = await getAccessToken(sa, SCOPE);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `사이트맵 상태 조회 실패 (${res.status})`);
  }

  const contents: SitemapContentStat[] = (data.contents ?? []).map(
    (c: { type?: string; submitted?: string; indexed?: string }) => ({
      type: c.type ?? "web",
      submitted: Number(c.submitted) || 0,
      indexed: Number(c.indexed) || 0,
    }),
  );

  return {
    path: data.path,
    lastDownloaded: data.lastDownloaded,
    isPending: !!data.isPending,
    contents,
  };
}
