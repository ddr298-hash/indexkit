import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
  /** Set when most Search Console calls failed with a permission error — the counts above aren't trustworthy. */
  verificationError?: string;
}

const REPORTS_DIR = join(process.cwd(), "reports");

export function saveReport(report: DiagnosisReport): string {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const dateStr = report.generatedAt.slice(0, 10);
  const path = join(REPORTS_DIR, `${report.blogId}-${dateStr}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf-8");
  return path;
}

export function loadReport(path: string): DiagnosisReport {
  return JSON.parse(readFileSync(path, "utf-8")) as DiagnosisReport;
}

export function latestReportPath(blogId: string): string | null {
  if (!existsSync(REPORTS_DIR)) return null;
  const files = readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith(`${blogId}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  return join(REPORTS_DIR, files[files.length - 1]);
}
