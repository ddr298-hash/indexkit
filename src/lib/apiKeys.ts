import { GoogleApiError, cseSearchPage, isQuotaError, type CseItem, type CsePageFetcher } from "./googleSearch";

export interface ApiKeyEntry {
  key: string;
  /** epoch ms until which this key is assumed exhausted; skipped until then. */
  exhaustedUntil?: number;
}

const KEYS_STORAGE = "indexkit.googleApiKeys";
const INDEX_STORAGE = "indexkit.googleApiKeyIndex";

function nextPacificMidnightUtcMs(): number {
  // Google's Custom Search free-tier quota resets at midnight Pacific time.
  // We don't need to be exact — a same-day cooldown is enough to skip a dead key.
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 8, 0, 0));
  return reset.getTime();
}

export function loadApiKeys(): ApiKeyEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE);
    return raw ? (JSON.parse(raw) as ApiKeyEntry[]) : [];
  } catch {
    return [];
  }
}

function saveApiKeys(keys: ApiKeyEntry[]): void {
  window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
}

export function addApiKey(key: string): ApiKeyEntry[] {
  const trimmed = key.trim();
  if (!trimmed) return loadApiKeys();
  const keys = loadApiKeys();
  if (keys.some((k) => k.key === trimmed)) return keys;
  const updated = [...keys, { key: trimmed }];
  saveApiKeys(updated);
  return updated;
}

export function removeApiKey(key: string): ApiKeyEntry[] {
  const updated = loadApiKeys().filter((k) => k.key !== key);
  saveApiKeys(updated);
  return updated;
}

function getCurrentIndex(): number {
  const raw = window.localStorage.getItem(INDEX_STORAGE);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function setCurrentIndex(idx: number): void {
  window.localStorage.setItem(INDEX_STORAGE, String(idx));
}

function markExhausted(key: string): void {
  const keys = loadApiKeys();
  const updated = keys.map((k) => (k.key === key ? { ...k, exhaustedUntil: nextPacificMidnightUtcMs() } : k));
  saveApiKeys(updated);
}

export function isKeyExhausted(entry: ApiKeyEntry): boolean {
  return !!entry.exhaustedUntil && entry.exhaustedUntil > Date.now();
}

/**
 * Runs `request` against the currently-active key; on a quota error, marks
 * that key exhausted for the day and retries the SAME request with the next
 * registered key, continuing until one succeeds or all keys are exhausted.
 */
async function withKeyRotation<T>(request: (apiKey: string) => Promise<T>): Promise<T> {
  const keys = loadApiKeys();
  if (keys.length === 0) {
    throw new Error("등록된 Google API 키가 없습니다. 설정에서 키를 추가해주세요.");
  }

  const startIndex = getCurrentIndex() % keys.length;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (startIndex + attempt) % keys.length;
    const entry = keys[idx];
    if (isKeyExhausted(entry)) continue;

    try {
      const result = await request(entry.key);
      setCurrentIndex(idx);
      return result;
    } catch (err) {
      if (isQuotaError(err)) {
        markExhausted(entry.key);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    lastError instanceof GoogleApiError
      ? `등록된 키 ${keys.length}개가 모두 사용량을 소진했습니다: ${lastError.message}`
      : "등록된 키가 모두 사용량을 소진했거나 유효하지 않습니다.",
  );
}

/** A CSE page fetcher that automatically rotates through registered API keys on quota errors. */
export function makeRotatingCseFetcher(cseId: string): CsePageFetcher {
  return (query, start) => withKeyRotation<CseItem[]>((apiKey) => cseSearchPage(apiKey, cseId, query, start));
}
