"use client";

/**
 * Phase 1B — the farmer's slurry plan: how much slurry is in the tanks now,
 * how much of it is reserved by planned spreading, and each plan's
 * lifecycle (edit, cancel, mark as spread), with completed and cancelled
 * plans kept as history. Design record:
 * `docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md` § Phase 1B.
 *
 * Every figure comes from `buildSlurryPlanLifecycleView` (the Phase 1A
 * reconciliation mirror) and every transition goes through the farm
 * store's lifecycle actions (the canonical server actions in real mode) —
 * nothing here computes capacity or decides a transition. Nothing is
 * optimistic: a plan only moves after the server accepts it, and a refused
 * or stale action re-reads the canonical plan and says so plainly. When
 * that re-read fails the plan on screen is marked out of date: its figures
 * are labelled as the last ones loaded, lifecycle actions are withdrawn
 * and the farmer is offered "Refresh plan" — nothing is inferred locally.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { CheckCircle2, History, Pencil, RefreshCw, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { Sheet } from "@/components/ui/Sheet";
import {
  useAllFieldsIncludingArchived,
  useFarmActions,
  useFields,
  useHousingList,
  useSlurryAllocationRecords,
  useSlurryPlanFreshness,
  type SlurryLifecycleOutcome,
} from "@/store/farm-store";
import { formatNonNegative, formatNumber } from "@/lib/format";
import { dublinDate, type SlurryAllocationLifecycleIssue, type SlurryAllocationRecord, type SlurryStoreReconciliation } from "@/domain/slurry-allocation-lifecycle";
import { SLURRY_APPLICATION_METHOD_OPTIONS } from "@/domain/slurry-allocation-plan";
import {
  SLURRY_LIFECYCLE_UNEXPECTED_ERROR_COPY,
  SLURRY_RECONCILIATION_QUESTION,
  buildSlurryPlanLifecycleView,
  describeSlurryLifecycleIssues,
  isStaleSlurryLifecycleIssue,
  storeAvailableForPlanM3,
  type SlurryLifecycleActionKind,
  type SlurryStorePlanView,
} from "@/domain/slurry-plan-lifecycle-view";

const INPUT_CLASS = "w-full rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2.5 text-base text-fr-ink-900";
const PRIMARY_BUTTON = "min-h-11 rounded-fr-control bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-fr-green-700/40";
const SECONDARY_BUTTON = "min-h-11 rounded-fr-control border border-fr-border bg-fr-surface px-4 py-2.5 text-sm font-semibold text-fr-ink-900 disabled:opacity-50";

const SAVED_BUT_STALE_COPY = "Your change was saved, but the latest slurry plan could not be refreshed.";
const REFUSED_AND_STALE_COPY = "The latest slurry plan could not be refreshed.";
const ALREADY_CHANGED_AND_STALE_COPY =
  "This plan was already changed — it may have been recorded as spread or cancelled elsewhere. The latest slurry plan could not be refreshed.";
const REFRESH_FAILED_COPY = "We couldn't refresh your slurry plan. Try again.";
const REFRESHED_COPY = "Slurry plan refreshed.";
const STALE_BANNER_COPY = "This slurry plan may be out of date. Refresh it before making any changes.";

function m3(value: number): string {
  return `${formatNonNegative(value, 2)} m³`;
}

function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function methodLabel(record: SlurryAllocationRecord): string | undefined {
  const value = record.applicationMethod?.value;
  return value ? SLURRY_APPLICATION_METHOD_OPTIONS.find((o) => o.value === value)?.label : undefined;
}

type OpenSheet = { kind: SlurryLifecycleActionKind; record: SlurryAllocationRecord };

export function SlurryPlanLifecycle() {
  const housing = useHousingList();
  const records = useSlurryAllocationRecords();
  const allFields = useAllFieldsIncludingArchived();
  const stale = useSlurryPlanFreshness() === "stale";
  const { refreshSlurryPlan } = useFarmActions();
  const view = useMemo(() => buildSlurryPlanLifecycleView(housing, records), [housing, records]);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The plan may have changed since the app loaded (another tab, another
  // device): re-read the canonical state whenever this screen opens.
  useEffect(() => {
    void refreshSlurryPlan();
  }, [refreshSlurryPlan]);

  const fieldName = (id: string) => allFields.find((f) => f.id === id)?.name ?? "Unknown field";
  const storeName = (id: string) => housing.find((h) => h.id === id)?.shedName ?? "Unknown store";
  const showStore = view.stores.length > 1;

  function finish(message: string) {
    setSheet(null);
    setNotice(message);
  }

  async function retryRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    const result = await refreshSlurryPlan();
    setNotice(result.status === "refreshed" ? REFRESHED_COPY : REFRESH_FAILED_COPY);
    setRefreshing(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {stale ? (
        <div role="alert" className="flex flex-col gap-2 rounded-fr-control border border-fr-border bg-fr-surface-alt p-3 text-sm text-fr-ink-900 sm:flex-row sm:items-center sm:justify-between">
          <p>{STALE_BANNER_COPY}</p>
          <button type="button" className={SECONDARY_BUTTON} disabled={refreshing} onClick={() => void retryRefresh()}>
            <RefreshCw className="mr-1.5 inline size-4" aria-hidden />
            {refreshing ? "Refreshing…" : "Refresh plan"}
          </button>
        </div>
      ) : null}

      <SlurrySummaryCard stores={view.stores} totals={view.totals} stale={stale} />

      {notice ? (
        <p role="status" className="rounded-fr-control bg-fr-surface-alt p-3 text-sm text-fr-ink-900">
          {notice}
        </p>
      ) : null}

      <section aria-labelledby="planned-spreading-heading" className="flex flex-col gap-3">
        <h2 id="planned-spreading-heading" className="text-base font-semibold text-fr-ink-900">
          Planned spreading
        </h2>
        {stale ? (
          <p className="text-sm text-fr-ink-600">
            As last loaded — some of these plans may already have been spread, changed or cancelled. Refresh the plan to make changes.
          </p>
        ) : null}
        {view.planned.length === 0 ? (
          <Card>
            <p className="text-sm text-fr-ink-600">No spreading is planned right now.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.planned.map((record) => (
              <li key={record.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold text-fr-ink-900">{fieldName(record.fieldId)}</h3>
                    <span className="text-base font-semibold text-fr-ink-900">{m3(record.volumeM3)}</span>
                  </div>
                  <dl className="grid grid-cols-1 gap-1 text-sm text-fr-ink-600 sm:grid-cols-2">
                    <div>
                      <dt className="inline">Planned date: </dt>
                      <dd className="inline text-fr-ink-900">{record.applicationDate ? formatDate(record.applicationDate.value) : "Not set"}</dd>
                    </div>
                    {methodLabel(record) ? (
                      <div>
                        <dt className="inline">Method: </dt>
                        <dd className="inline text-fr-ink-900">{methodLabel(record)}</dd>
                      </div>
                    ) : null}
                    {showStore ? (
                      <div>
                        <dt className="inline">From: </dt>
                        <dd className="inline text-fr-ink-900">{storeName(record.housingId)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {stale ? null : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button type="button" className={PRIMARY_BUTTON} onClick={() => setSheet({ kind: "complete", record })}>
                      <CheckCircle2 className="mr-1.5 inline size-4" aria-hidden />
                      Mark as spread
                    </button>
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => setSheet({ kind: "edit", record })}>
                      <Pencil className="mr-1.5 inline size-4" aria-hidden />
                      Edit
                    </button>
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => setSheet({ kind: "cancel", record })}>
                      <XCircle className="mr-1.5 inline size-4" aria-hidden />
                      Cancel
                    </button>
                  </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.completed.length + view.cancelled.length > 0 ? (
        <details className="rounded-fr-card border border-fr-border bg-fr-surface p-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-fr-ink-900">
            <History className="size-4 text-fr-ink-400" aria-hidden />
            History ({view.completed.length + view.cancelled.length})
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-fr-border">
            {view.completed.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-fr-ink-900">{fieldName(r.fieldId)}</span>
                  <Pill tone="good">Spread</Pill>
                </div>
                <span className="text-fr-ink-600">
                  {r.actualVolumeM3 !== undefined && r.actualVolumeM3 !== r.volumeM3
                    ? `Planned ${m3(r.volumeM3)} · Spread ${m3(r.actualVolumeM3)}`
                    : `Spread ${m3(r.actualVolumeM3 ?? r.volumeM3)}`}
                  {r.actualSpreadDate ? ` · ${formatDate(r.actualSpreadDate)}` : ""}
                  {methodLabel(r) ? ` · ${methodLabel(r)}` : ""}
                  {showStore ? ` · ${storeName(r.housingId)}` : ""}
                </span>
              </li>
            ))}
            {view.cancelled.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-fr-ink-900">{fieldName(r.fieldId)}</span>
                  <Pill tone="neutral">Cancelled</Pill>
                </div>
                <span className="text-fr-ink-600">
                  Planned {m3(r.volumeM3)}
                  {r.cancelledAt ? ` · cancelled ${formatDate(dublinDate(r.cancelledAt))}` : ""}
                  {showStore ? ` · ${storeName(r.housingId)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* A sheet opened on a plan that has since gone out of date closes
          (its record may no longer be current); the page explains why. */}
      <Sheet open={!stale && sheet?.kind === "edit"} onClose={() => setSheet(null)} title="Edit spreading plan">
        {sheet?.kind === "edit" ? <EditPlanBody record={sheet.record} stores={view.stores} onDone={finish} onClose={() => setSheet(null)} /> : null}
      </Sheet>
      <Sheet open={!stale && sheet?.kind === "cancel"} onClose={() => setSheet(null)} title="Cancel this spreading plan?">
        {sheet?.kind === "cancel" ? (
          <CancelPlanBody record={sheet.record} fieldName={fieldName(sheet.record.fieldId)} onDone={finish} onClose={() => setSheet(null)} />
        ) : null}
      </Sheet>
      <Sheet open={!stale && sheet?.kind === "complete"} onClose={() => setSheet(null)} title="Mark as spread">
        {sheet?.kind === "complete" ? (
          <CompletePlanBody record={sheet.record} fieldName={fieldName(sheet.record.fieldId)} onDone={finish} onClose={() => setSheet(null)} />
        ) : null}
      </Sheet>
    </div>
  );
}

function SlurrySummaryCard({
  stores,
  totals,
  stale,
}: {
  stores: SlurryStorePlanView[];
  totals: ReturnType<typeof buildSlurryPlanLifecycleView>["totals"];
  stale: boolean;
}) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <CardHeader className="mb-0 flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Your slurry</CardTitle>
        {stale ? <Pill tone="attention">May be out of date</Pill> : null}
      </CardHeader>
      {totals ? (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <SummaryStat label="Current slurry" value={totals.currentM3 === undefined ? "Unknown" : m3(totals.currentM3)} />
            <SummaryStat label="Reserved in plan" value={m3(totals.reservedM3)} />
            <SummaryStat label="Unallocated" value={totals.unallocatedM3 === undefined ? "Unknown" : m3(totals.unallocatedM3)} />
          </dl>
          {totals.storesWithUnknownVolume > 0 ? (
            <p className="text-sm text-fr-ink-600">Farm slurry totals are unknown until every store has a size and fill level on file. Add them on the Housing screen.</p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-fr-ink-600">No slurry store is on file yet. Add one on the Housing screen.</p>
      )}
      {stores.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Slurry stores">
          {stores.map((s) => (
            <li key={s.housingId} className="rounded-fr-control bg-fr-surface-alt p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-fr-ink-900">{s.shedName}</span>
                {s.volumeKnown ? <span className="text-fr-ink-900">Current estimate: {m3(s.currentM3)}</span> : null}
              </div>
              {s.volumeKnown ? (
                <>
                  {stores.length > 1 ? (
                    <p className="text-fr-ink-600">
                      Reserved {m3(s.reservedM3)} · Unallocated {m3(s.unallocatedM3)}
                    </p>
                  ) : null}
                  <p className="text-xs text-fr-ink-600">
                    Last tank reading: {formatNumber(s.observedFillPct, 1)}%
                    {s.observationStatus === "estimated" ? " (estimated)" : ""}
                    {s.observationRecordedAt ? `, ${formatDate(dublinDate(s.observationRecordedAt))}` : ""}
                    {s.differsFromReading ? ` — ${m3(s.observedM3)} then, less slurry recorded as spread since` : ""}
                  </p>
                </>
              ) : (
                <p className="text-fr-ink-600">Store size not recorded — current volume unknown.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-fr-control bg-fr-surface-alt p-2.5">
      <dt className="text-xs text-fr-ink-600">{label}</dt>
      <dd className="break-words text-base font-semibold text-fr-ink-900">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

type Done = (message: string) => void;

/** Shared outcome handling: a stale refusal closes the sheet with a page
 * notice (the plan was already re-read); any other refusal or failure stays
 * in the sheet with the farmer's input intact. When the re-read after the
 * action failed, the notice never claims the plan was refreshed and the
 * sheet closes (the page shows the out-of-date state and "Refresh plan"). */
function useLifecycleSubmit(kind: SlurryLifecycleActionKind, onDone: Done) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(run: () => Promise<SlurryLifecycleOutcome>, savedMessage: string, onIssues?: (issues: SlurryAllocationLifecycleIssue[]) => boolean) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await run();
      if (result.plan === "stale") {
        if (result.status === "saved") return onDone(SAVED_BUT_STALE_COPY);
        // Never reuse the stale-refusal copy here: it says the plan was refreshed.
        if (result.issues.some(isStaleSlurryLifecycleIssue)) return onDone(ALREADY_CHANGED_AND_STALE_COPY);
        return onDone(`${describeSlurryLifecycleIssues(result.issues, kind)} ${REFUSED_AND_STALE_COPY}`);
      }
      if (result.status === "saved") return onDone(savedMessage);
      if (result.issues.some(isStaleSlurryLifecycleIssue)) return onDone(describeSlurryLifecycleIssues(result.issues, kind));
      if (onIssues?.(result.issues)) return;
      setError(describeSlurryLifecycleIssues(result.issues, kind));
    } catch (e: unknown) {
      console.error(`[SlurryPlanLifecycle] ${kind} failed:`, e);
      setError(SLURRY_LIFECYCLE_UNEXPECTED_ERROR_COPY);
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, setError, submit };
}

function SheetError({ id, message }: { id: string; message: string | null }) {
  return message ? (
    <p id={id} role="alert" className="text-sm text-fr-risk">
      {message}
    </p>
  ) : null;
}

function EditPlanBody({ record, stores, onDone, onClose }: { record: SlurryAllocationRecord; stores: SlurryStorePlanView[]; onDone: Done; onClose: () => void }) {
  const { editPlannedSlurryAllocation } = useFarmActions();
  const fields = useFields();
  const allFields = useAllFieldsIncludingArchived();
  const [fieldId, setFieldId] = useState(record.fieldId);
  const [housingId, setHousingId] = useState(record.housingId);
  const [volume, setVolume] = useState(String(record.volumeM3));
  const { saving, error, submit } = useLifecycleSubmit("edit", onDone);
  const errorId = useId();
  const fieldOptions = fields.some((f) => f.id === record.fieldId) ? fields : [...fields, ...allFields.filter((f) => f.id === record.fieldId)];
  const selectedStore = stores.find((s) => s.housingId === housingId);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(() => editPlannedSlurryAllocation({ allocationId: record.id, fieldId, housingId, volumeM3: volume }), "Spreading plan updated.");
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-fr-ink-600">
        Field
        <select className={INPUT_CLASS} value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
          {fieldOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-fr-ink-600">
        Slurry store
        <select className={INPUT_CLASS} value={housingId} onChange={(e) => setHousingId(e.target.value)}>
          {stores.map((s) => (
            <option key={s.housingId} value={s.housingId}>
              {s.shedName}
            </option>
          ))}
        </select>
      </label>
      {selectedStore?.volumeKnown ? (
        <p className="text-xs text-fr-ink-600">Up to {m3(storeAvailableForPlanM3(selectedStore, record))} in this store is free for this plan.</p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm text-fr-ink-600">
        Planned volume (m³)
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className={INPUT_CLASS}
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <SheetError id={errorId} message={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
          Back
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function CancelPlanBody({ record, fieldName, onDone, onClose }: { record: SlurryAllocationRecord; fieldName: string; onDone: Done; onClose: () => void }) {
  const { cancelPlannedSlurryAllocation } = useFarmActions();
  const { saving, error, submit } = useLifecycleSubmit("cancel", onDone);
  const errorId = useId();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fr-ink-900">
        {fieldName} · {m3(record.volumeM3)}
      </p>
      <p className="text-sm text-fr-ink-600">The slurry will become available for another field. The plan stays in your history.</p>
      <SheetError id={errorId} message={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
          Keep plan
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={saving}
          onClick={() => void submit(() => cancelPlannedSlurryAllocation(record.id), "Spreading plan cancelled. The slurry is available again.")}
        >
          {saving ? "Cancelling…" : "Cancel plan"}
        </button>
      </div>
    </div>
  );
}

function CompletePlanBody({ record, fieldName, onDone, onClose }: { record: SlurryAllocationRecord; fieldName: string; onDone: Done; onClose: () => void }) {
  const { completePlannedSlurryAllocation } = useFarmActions();
  // The planned amount is only a starting value: nothing is recorded until
  // the farmer submits.
  const [actual, setActual] = useState(String(record.volumeM3));
  const [spreadDate, setSpreadDate] = useState("");
  const [askReconciliation, setAskReconciliation] = useState(false);
  const [reconciliation, setReconciliation] = useState<SlurryStoreReconciliation | null>(null);
  const { saving, error, setError, submit } = useLifecycleSubmit("complete", onDone);
  const errorId = useId();
  const today = dublinDate(new Date());

  function changeDate(value: string) {
    setSpreadDate(value);
    // The answer belongs to one date; the server re-asks if still needed.
    setAskReconciliation(false);
    setReconciliation(null);
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (askReconciliation && reconciliation === null) {
          setError("Choose an answer to the tank-reading question.");
          return;
        }
        void submit(
          () =>
            completePlannedSlurryAllocation({
              allocationId: record.id,
              actualVolumeM3: actual,
              actualSpreadDate: spreadDate,
              ...(askReconciliation && reconciliation ? { storeReconciliation: reconciliation } : {}),
            }),
          `${fieldName} recorded as spread.`,
          (issues) => {
            if (issues.length === 1 && issues[0] === "RECONCILIATION_REQUIRED") {
              setAskReconciliation(true);
              return true;
            }
            return false;
          },
        );
      }}
    >
      <p className="text-sm text-fr-ink-900">{fieldName}</p>
      <p className="text-sm text-fr-ink-600">
        Planned volume: <span className="font-semibold text-fr-ink-900">{m3(record.volumeM3)}</span>
      </p>
      <label className="flex flex-col gap-1 text-sm text-fr-ink-600">
        Actual volume spread (m³)
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className={INPUT_CLASS}
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-sm text-fr-ink-600">
          Spread date
          <input type="date" max={today} className={INPUT_CLASS} value={spreadDate} onChange={(e) => changeDate(e.target.value)} />
        </label>
        <button type="button" className="min-h-11 self-start text-sm font-semibold text-fr-green-700" onClick={() => changeDate(today)}>
          Today
        </button>
      </div>
      {askReconciliation ? (
        <fieldset className="flex flex-col gap-2 rounded-fr-control bg-fr-surface-alt p-3">
          <legend className="float-left mb-1 w-full text-sm font-semibold text-fr-ink-900">{SLURRY_RECONCILIATION_QUESTION.prompt}</legend>
          {SLURRY_RECONCILIATION_QUESTION.options.map((o) => (
            <label key={o.value} className="flex min-h-11 items-start gap-2 text-sm text-fr-ink-900">
              <input
                type="radio"
                name="store-reconciliation"
                className="mt-1 size-4"
                value={o.value}
                checked={reconciliation === o.value}
                onChange={() => setReconciliation(o.value)}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <SheetError id={errorId} message={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
          Back
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
          {saving ? "Saving…" : "Record as spread"}
        </button>
      </div>
    </form>
  );
}
