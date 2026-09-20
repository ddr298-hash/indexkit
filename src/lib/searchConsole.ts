import { getAccessToken, type ServiceAccount } from "./googleAuth";

export interface InspectionResult {
  url: string;
  indexed: boolean;
  verdict?: string;
  error?: string;
  /** True when the call failed specifically because the service account isn't a verified owner. */
  permissionDenied?: boolean;
}

const INSPECT_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/**
 * Google's API error responses carry the real signal in the HTTP status
 * (403) and the `status` field ("PERMISSION_DENIED") — the human-readable
 * `message` text isn't guaranteed to contain any particular wording, so
 * matching on it (as an earlier version of this file did) silently missed
 * real permission failures and let them masquerade as "not indexed".
 */
class SearchConsoleError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = "SearchConsoleError";
    this.status = status;
    this.reason = reason;
  }
}

function isPermissionDenied(err: unknown): boolean {
  return err instanceof SearchConsoleError && (err.status === 403 || err.reason === "PERMISSION_DENIED");
}

/** Kept for any external callers that only have the error message string. */
export function isPermissionError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("permission") || m.includes("forbidden") || m.includes("does not have sufficient");
}

/**
 * Checks a single URL's real Google index status via Search Console's URL
 * Inspection API. Replaces the old Custom Search JSON API approach — Google
 * closed that API to new projects in 2025 (shuts down entirely 2027-01-01),
 * so this is now the only official way to check indexing without scraping
 * search result pages.
 *
 * Requires the service account to be added as an owner on a Search Console
 * URL-prefix property matching `siteUrl` (see README).
 */
export async function inspectUrl(url: string, siteUrl: string, sa: ServiceAccount): Promise<InspectionResult> {
  try {
    const token = await getAccessToken(sa, SCOPE);
    const res = await fetch(INSPECT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl: url, siteUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new SearchConsoleError(data.error?.message || res.statusText, res.status, data.error?.status);
    }
    const verdict = data.inspectionResult?.indexStatusResult?.verdict as string | undefined;
    return { url, indexed: verdict === "PASS", verdict };
  } catch (err) {
    return {
      url,
      indexed: false,
      error: err instanceof Error ? err.message : String(err),
      permissionDenied: isPermissionDenied(err),
    };
  }
}

/** Inspects URLs sequentially with a small delay to stay under the API's rate limit (2,000/day, 600/min per site). */
export async function inspectUrlsBatch(
  urls: string[],
  siteUrl: string,
  sa: ServiceAccount,
  delayMs = 150,
  onProgress?: (result: InspectionResult, done: number, total: number) => void,
): Promise<InspectionResult[]> {
  const results: InspectionResult[] = [];
  for (const url of urls) {
    const result = await inspectUrl(url, siteUrl, sa);
    results.push(result);
    onProgress?.(result, results.length, urls.length);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
