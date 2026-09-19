import { SignJWT, importPKCS8 } from "jose";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface IndexRequestResult {
  url: string;
  ok: boolean;
  error?: string;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const PUBLISH_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

/**
 * Exchanges a service-account key for a short-lived access token by
 * self-signing a JWT (RS256) and trading it via the OAuth2 JWT-bearer flow.
 * Uses only fetch + WebCrypto (via `jose`), so this runs the same in Node
 * (CLI) and in a Capacitor WebView (app) — no Node-only `googleapis` client.
 */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `OAuth 토큰 발급 실패 (${res.status})`);
  }
  return data.access_token as string;
}

/**
 * Submits a single URL to Google's Indexing API (URL_UPDATED).
 *
 * Note: this API is officially scoped to JobPosting/BroadcastEvent pages.
 * Google may silently ignore requests for ordinary blog posts — this is a
 * best-effort crawl signal, not a guarantee of indexing. It also requires
 * the target URL to belong to a Search Console property the service account
 * has been added to as an owner (see README "구글 서치 콘솔 소유권 확인").
 */
export async function requestIndexing(url: string, sa: ServiceAccount): Promise<IndexRequestResult> {
  try {
    const token = await getAccessToken(sa);
    const res = await fetch(PUBLISH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || res.statusText);
    }
    return { url, ok: true };
  } catch (err) {
    return { url, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Submits URLs sequentially with a small delay to stay under the API's rate limit. */
export async function requestIndexingBatch(
  urls: string[],
  sa: ServiceAccount,
  delayMs = 300,
  onProgress?: (result: IndexRequestResult, done: number, total: number) => void,
): Promise<IndexRequestResult[]> {
  const results: IndexRequestResult[] = [];
  for (const url of urls) {
    const result = await requestIndexing(url, sa);
    results.push(result);
    onProgress?.(result, results.length, urls.length);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
