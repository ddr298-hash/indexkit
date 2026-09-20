import { getAccessToken, type ServiceAccount } from "./googleAuth";

export type { ServiceAccount };

export interface IndexRequestResult {
  url: string;
  ok: boolean;
  error?: string;
  /** True when this URL was never actually submitted because the daily quota was already known to be exhausted. */
  skipped?: boolean;
}

const PUBLISH_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

/**
 * Google's Indexing API has a hard default quota of 200 publish requests
 * per day per project (resets at Pacific midnight) — there's no bumping it
 * for ordinary websites, since the API is officially scoped to JobPosting/
 * BroadcastEvent pages. Detects that specific rejection so a batch can stop
 * early instead of burning through the rest of the list on calls that will
 * all fail the same way.
 */
function isDailyQuotaError(message: string): boolean {
  return message.includes("Quota exceeded") && message.toLowerCase().includes("per day");
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
    const token = await getAccessToken(sa, SCOPE);
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

/**
 * Submits URLs sequentially with a small delay to stay under the API's rate
 * limit. Stops early — marking the rest as skipped rather than failed — as
 * soon as the daily publish quota is hit, since every remaining call would
 * fail identically until it resets tomorrow.
 */
export async function requestIndexingBatch(
  urls: string[],
  sa: ServiceAccount,
  delayMs = 300,
  onProgress?: (result: IndexRequestResult, done: number, total: number) => void,
): Promise<IndexRequestResult[]> {
  const results: IndexRequestResult[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const result = await requestIndexing(url, sa);
    results.push(result);
    onProgress?.(result, results.length, urls.length);

    if (!result.ok && result.error && isDailyQuotaError(result.error)) {
      const remaining = urls.slice(i + 1);
      for (const skippedUrl of remaining) {
        const skippedResult: IndexRequestResult = {
          url: skippedUrl,
          ok: false,
          error: "일일 할당량 초과로 건너뜀 (태평양시 자정에 초기화됨)",
          skipped: true,
        };
        results.push(skippedResult);
        onProgress?.(skippedResult, results.length, urls.length);
      }
      break;
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
