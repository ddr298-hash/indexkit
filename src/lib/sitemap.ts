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
