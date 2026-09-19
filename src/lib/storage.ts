import type { ServiceAccount } from "./googleIndexing";

export interface DiagnosisEntry {
  logNo: string;
  title: string;
  addDate: string;
  url: string;
  indexed: boolean;
}

export interface DiagnosisReport {
  blogId: string;
  generatedAt: string;
  totalPosts: number;
  indexedCount: number;
  missingCount: number;
  entries: DiagnosisEntry[];
}

const REPORT_PREFIX = "indexkit.report.";
const CSE_ID_KEY = "indexkit.cseId";
const SERVICE_ACCOUNT_KEY = "indexkit.serviceAccount";
const LAST_BLOG_ID_KEY = "indexkit.lastBlogId";

export function saveReport(report: DiagnosisReport): void {
  window.localStorage.setItem(`${REPORT_PREFIX}${report.blogId}`, JSON.stringify(report));
}

export function loadReport(blogId: string): DiagnosisReport | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${REPORT_PREFIX}${blogId}`);
  return raw ? (JSON.parse(raw) as DiagnosisReport) : null;
}

export function getCseId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CSE_ID_KEY) ?? "";
}

export function setCseId(id: string): void {
  window.localStorage.setItem(CSE_ID_KEY, id.trim());
}

export function getServiceAccount(): ServiceAccount | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SERVICE_ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.client_email && parsed.private_key) return parsed as ServiceAccount;
    return null;
  } catch {
    return null;
  }
}

/** Returns null on success, or an error message if the pasted JSON isn't a usable service-account key. */
export function setServiceAccount(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return "JSON 형식이 아닙니다.";
  }
  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    return "client_email / private_key 필드가 없습니다. 서비스 계정 키 JSON 파일 전체를 붙여넣어 주세요.";
  }
  window.localStorage.setItem(SERVICE_ACCOUNT_KEY, JSON.stringify({ client_email: sa.client_email, private_key: sa.private_key }));
  return null;
}

export function clearServiceAccount(): void {
  window.localStorage.removeItem(SERVICE_ACCOUNT_KEY);
}

export function getLastBlogId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_BLOG_ID_KEY) ?? "";
}

export function setLastBlogId(blogId: string): void {
  window.localStorage.setItem(LAST_BLOG_ID_KEY, blogId);
}
