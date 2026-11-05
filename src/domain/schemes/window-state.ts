import type { StoredSchemeVersion } from "./repository";

export type SchemeProgrammeState =
  | "DRAFT"
  | "NOT_YET_IN_FORCE"
  | "IN_FORCE"
  | "ENDED"
  | "SUPERSEDED";

export type SchemeEntryWindowState =
  | "NO_ENTRY_WINDOW_RECORDED"
  | "UPCOMING"
  | "OPEN"
  | "LATE_WINDOW"
  | "CLOSED";

function time(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveSchemeProgrammeState(
  version: Pick<
    StoredSchemeVersion,
    "publicationState" | "effectiveFrom" | "effectiveTo"
  >,
  nowIso: string,
): SchemeProgrammeState {
  if (version.publicationState === "draft") return "DRAFT";
  if (version.publicationState === "superseded") return "SUPERSEDED";

  const now = Date.parse(nowIso);
  const from = time(version.effectiveFrom);
  const to = time(version.effectiveTo);

  if (from !== null && now < from) return "NOT_YET_IN_FORCE";
  if (to !== null && now > to) return "ENDED";
  return "IN_FORCE";
}

export function deriveSchemeEntryWindowState(
  version: Pick<
    StoredSchemeVersion,
    "applicationOpen" | "applicationClose" | "lateApplicationClose"
  >,
  nowIso: string,
): SchemeEntryWindowState {
  const open = time(version.applicationOpen);
  const close = time(version.applicationClose);
  const lateClose = time(version.lateApplicationClose);

  if (open === null && close === null && lateClose === null) {
    return "NO_ENTRY_WINDOW_RECORDED";
  }

  const now = Date.parse(nowIso);
  if (open !== null && now < open) return "UPCOMING";
  if (close === null || now <= close) return "OPEN";
  if (lateClose !== null && now <= lateClose) return "LATE_WINDOW";
  return "CLOSED";
}
