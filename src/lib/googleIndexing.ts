import { google } from "googleapis";

export interface IndexRequestResult {
  url: string;
  ok: boolean;
  error?: string;
}

let clientPromise: ReturnType<typeof buildClient> | null = null;

async function buildClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyFile) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH 환경변수가 설정되지 않았습니다 (.env.local 확인).");
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/indexing"],
  });

  return google.indexing({ version: "v3", auth });
}

function getClient() {
  if (!clientPromise) clientPromise = buildClient();
  return clientPromise;
}

/**
 * Submits a single URL to Google's Indexing API (URL_UPDATED).
 *
 * Note: this API is officially scoped to JobPosting/BroadcastEvent pages.
 * Google may silently ignore requests for ordinary blog posts — this is a
 * best-effort crawl signal, not a guarantee of indexing. It also requires
 * the target URL to belong to a Search Console property the service account
 * has been added to as an owner, which for a Naver-hosted blog means
 * verifying https://blog.naver.com/{blogId}/ via the HTML-tag method
 * (see README "구글 서치 콘솔 소유권 확인").
 */
export async function requestIndexing(url: string): Promise<IndexRequestResult> {
  try {
    const indexing = await getClient();
    await indexing.urlNotifications.publish({
      requestBody: { url, type: "URL_UPDATED" },
    });
    return { url, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { url, ok: false, error: message };
  }
}

/** Submits URLs sequentially with a small delay to stay under the API's rate limit. */
export async function requestIndexingBatch(
  urls: string[],
  delayMs = 300,
): Promise<IndexRequestResult[]> {
  const results: IndexRequestResult[] = [];
  for (const url of urls) {
    results.push(await requestIndexing(url));
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
