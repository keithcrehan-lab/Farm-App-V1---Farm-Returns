/**
 * Minimal CSV serialisation + client-side download — generic browser
 * utility, not a domain formula, so it lives in `lib/` rather than
 * `domain/`. Used by the Reports screen to export real farm data (per
 * CLAUDE.md, the download itself must never be the thing inventing a
 * number — callers hand this already-real, already-computed rows).
 */

/** Escapes one CSV field per RFC 4180: wrap in quotes and double any
 * internal quote whenever the value contains a comma, quote, or newline. */
function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return lines.join("\r\n");
}

/** Triggers a real browser download of `content` as `filename` — client-
 * side only (no server round-trip), via a Blob + object URL, the standard
 * pattern for exporting already-in-memory data. */
function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, content: string): void {
  downloadBlob(filename, content, "text/csv;charset=utf-8;");
}

/** V3 closure pass (second pass) — RECOMMENDATION_AUDIT_REPORT_SPEC.md §6
 * "JSON: Exact machine-readable trace for debugging/reproduction." */
export function downloadJson(filename: string, value: unknown): void {
  downloadBlob(filename, JSON.stringify(value, null, 2), "application/json;charset=utf-8;");
}

/** V3 closure pass (second pass) — the human-readable Recommendation
 * Audit Report (spec §6), plain text — a browser's native
 * Print -> Save as PDF on the downloaded/opened file is the standard
 * dependency-free route to a PDF from here. */
export function downloadText(filename: string, content: string): void {
  downloadBlob(filename, content, "text/plain;charset=utf-8;");
}
