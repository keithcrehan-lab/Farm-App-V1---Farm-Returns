export const FIELD_RESTORE_WINDOW_DAYS = 30;
export const FIELD_RESTORE_WINDOW_MS = FIELD_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface FieldRestoreWindow {
  restorable: boolean;
  deletedAt: string;
  restoreUntil: string;
  daysRemaining: number;
}

/**
 * User-facing field deletion is a reversible soft delete for 30 days.
 * The underlying archived record is retained for audit/provenance safety,
 * but self-service restoration closes once this window expires.
 */
export function fieldRestoreWindow(deletedAt: string, now = new Date()): FieldRestoreWindow {
  const deletedMs = Date.parse(deletedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(deletedMs)) {
    return {
      restorable: false,
      deletedAt,
      restoreUntil: deletedAt,
      daysRemaining: 0,
    };
  }

  const restoreUntilMs = deletedMs + FIELD_RESTORE_WINDOW_MS;
  const remainingMs = restoreUntilMs - nowMs;
  return {
    restorable: remainingMs > 0,
    deletedAt: new Date(deletedMs).toISOString(),
    restoreUntil: new Date(restoreUntilMs).toISOString(),
    daysRemaining: remainingMs > 0 ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) : 0,
  };
}

export function canRestoreDeletedField(deletedAt: string, now = new Date()): boolean {
  return fieldRestoreWindow(deletedAt, now).restorable;
}
