"use client";

/**
 * Campaign B minimal evidence UX — a store's regulatory neat cattle slurry,
 * on the Housing & Slurry screen next to the tank it belongs to.
 *
 * What is shown comes from the canonical context
 * (`useSlurryRegulatoryEvidence` → `neatSlurryEvidenceView`): the figure on
 * file, when it is true as of, and whether it is in use. The physical tank
 * volume is shown only as a separately-labelled fact and never prefills or
 * substitutes for the neat figure. Saving appends a new record through
 * `recordNeatSlurryDeclaration`; nothing is displayed until it persisted.
 */
import { useId, useState } from "react";
import { Scale } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { Sheet } from "@/components/ui/Sheet";
import { formatNonNegative } from "@/lib/format";
import { dublinDate } from "@/domain/slurry-allocation-lifecycle";
import type { RegulatoryEvidenceViewState } from "@/domain/regulatory-evidence-declarations";
import type { RegulatoryEvidenceActionResult } from "@/app/actions/regulatory-evidence";
import { useFarmActions, useSlurryRegulatoryEvidence } from "@/store/farm-store";

const PRIMARY_BUTTON = "min-h-11 rounded-fr-control bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-fr-green-700/40";
const SECONDARY_BUTTON = "min-h-11 rounded-fr-control border border-fr-border bg-fr-surface px-4 py-2.5 text-sm font-semibold text-fr-ink-900 disabled:opacity-50";
const INPUT = "w-full rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900";

export const EVIDENCE_NOT_AVAILABLE_COPY = "Farm Return can't save this yet — this part of your farm record isn't set up on the server. Nothing was saved.";
export const EVIDENCE_UNEXPECTED_ERROR_COPY = "Something went wrong and nothing was saved. Please try again.";

/** A refused or unavailable save, in plain language (the validation
 * messages are already farmer-facing). `null` for a saved record. */
export function declarationFailureCopy(result: RegulatoryEvidenceActionResult<unknown>): string | null {
  if (result.status === "saved") return null;
  if (result.status === "not_available") return EVIDENCE_NOT_AVAILABLE_COPY;
  return [...new Set(result.errors.map((e) => `${e.message}.`))].join(" ");
}

export function formatEvidenceDate(isoDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T12:00:00Z`) : new Date(isoDate);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Dublin" });
}

export const EVIDENCE_STATE_PILL: Record<RegulatoryEvidenceViewState, { label: string; tone: "good" | "attention" | "risk" | "neutral" }> = {
  in_use: { label: "In use", tone: "good" },
  not_recorded: { label: "Not recorded", tone: "neutral" },
  no_figure: { label: "No figure", tone: "neutral" },
  not_current: { label: "Not in use", tone: "attention" },
  conflicting: { label: "Needs checking", tone: "risk" },
  unreadable: { label: "Needs checking", tone: "risk" },
};

/** Shown while the evidence couldn't be re-read after a save: nothing on
 * screen is presented as in use until a retry succeeds. */
export const EVIDENCE_STALE_PILL = { label: "Not up to date", tone: "attention" } as const;
export const EVIDENCE_STALE_COPY =
  "Your figure was saved, but Farm Return couldn't reload your farm record to check it, so nothing here is in use yet. Try again.";

export function EvidenceRetryButton() {
  const { refreshRegulatoryEvidence } = useFarmActions();
  const [retrying, setRetrying] = useState(false);
  return (
    <button
      type="button"
      className="min-h-11 self-start text-sm font-semibold text-fr-green-700 disabled:opacity-50"
      disabled={retrying}
      onClick={async () => {
        setRetrying(true);
        try {
          await refreshRegulatoryEvidence();
        } finally {
          setRetrying(false);
        }
      }}
    >
      {retrying ? "Reloading…" : "Try again"}
    </button>
  );
}

/** A small positive figure never displays as a false "0" — only an
 * explicit zero does (`formatNonNegative`). */
function m3(value: number): string {
  return `${formatNonNegative(value, 1)} m³`;
}

export function NeatSlurryEvidenceCard({ housingId }: { housingId: string }) {
  const { context, freshness, neatSlurryByHousing } = useSlurryRegulatoryEvidence();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const store = context.stores.find((s) => s.housingId === housingId);
  const view = neatSlurryByHousing.get(housingId);
  if (!store || !view) return null;
  const stale = freshness === "stale";
  const pill = stale ? EVIDENCE_STALE_PILL : EVIDENCE_STATE_PILL[view.state];

  return (
    <Card>
      <CardHeader>
        <span className="flex min-w-0 items-center gap-3">
          <IconChip icon={Scale} tone={view.state === "in_use" && !stale ? "good" : "neutral"} />
          <CardTitle>Neat cattle slurry for nitrates rules</CardTitle>
        </span>
        <Pill tone={pill.tone} className="shrink-0 whitespace-nowrap">{pill.label}</Pill>
      </CardHeader>
      <section aria-label="Neat cattle slurry for nitrates rules" className="flex flex-col gap-3 text-sm">
        <p className="text-fr-ink-700">
          The nitrates rules count neat cattle slurry, which is not the same as everything in the tank (rainwater and washings add volume).
          Farm Return never works one out from the other.
        </p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="min-w-0 break-words rounded-fr-control bg-fr-surface-alt p-2.5">
            <dt className="text-xs text-fr-ink-600">Neat cattle slurry you recorded</dt>
            <dd className="text-base font-bold text-fr-ink-900">
              {view.record ? (view.record.neatVolumeM3 !== undefined ? m3(view.record.neatVolumeM3) : "No figure") : "Not recorded"}
            </dd>
            {view.record ? (
              <dd className="text-xs text-fr-ink-600">
                True as of {formatEvidenceDate(view.record.effectiveDate)} · saved {formatEvidenceDate(view.record.recordedAt)}
              </dd>
            ) : null}
          </div>
          <div className="min-w-0 break-words rounded-fr-control border border-fr-border p-2.5">
            <dt className="text-xs text-fr-ink-600">Total slurry in the tank (a different figure)</dt>
            <dd className="text-base font-bold text-fr-ink-900">{store.physicalVolumeM3.state === "known" ? m3(store.physicalVolumeM3.value) : "Not recorded"}</dd>
            <dd className="text-xs text-fr-ink-600">From the tank&apos;s fill level</dd>
          </div>
        </dl>
        <p role="status" className="text-fr-ink-900">
          {stale ? EVIDENCE_STALE_COPY : view.message}
        </p>
        {stale ? <EvidenceRetryButton /> : null}
        {notice && !stale ? <p className="text-xs text-fr-ink-600">{notice}</p> : null}
        <button
          type="button"
          className="min-h-11 self-start text-sm font-semibold text-fr-green-700"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          {view.record || view.state === "conflicting" ? "Update neat slurry figure" : "Record neat slurry figure"}
        </button>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Neat cattle slurry in ${store.shedName}`}>
        {open ? (
          <NeatSlurryDeclarationForm
            housingId={housingId}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              setNotice("Saved. Earlier figures stay on record.");
            }}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

function NeatSlurryDeclarationForm({ housingId, onClose, onSaved }: { housingId: string; onClose: () => void; onSaved: () => void }) {
  const { recordNeatSlurryDeclaration } = useFarmActions();
  // Never prefilled — least of all from the tank's physical volume.
  const [hasFigure, setHasFigure] = useState<boolean | null>(null);
  const [volume, setVolume] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => dublinDate(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function save() {
    if (saving) return;
    if (hasFigure === null) return setError("Choose whether you have a figure.");
    const neatVolumeM3 = hasFigure ? (volume.trim() === "" ? Number.NaN : Number(volume)) : undefined;
    if (neatVolumeM3 !== undefined && !(Number.isFinite(neatVolumeM3) && neatVolumeM3 >= 0)) return setError("Enter zero or a positive volume.");
    setSaving(true);
    setError(null);
    try {
      const result = await recordNeatSlurryDeclaration({ housingId, ...(neatVolumeM3 !== undefined ? { neatVolumeM3 } : {}), effectiveDate, ...(note.trim() ? { note: note.trim() } : {}) });
      const failure = declarationFailureCopy(result);
      if (failure === null) return onSaved();
      setError(failure);
    } catch (e: unknown) {
      console.error("[NeatSlurryEvidenceCard] save failed:", e);
      setError(EVIDENCE_UNEXPECTED_ERROR_COPY);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-fr-ink-600">
        Only record a figure you can stand over. Total slurry in the tank is a different figure — don&apos;t copy it here unless the tank holds
        only neat cattle slurry.
      </p>
      <fieldset className="flex flex-col gap-2 rounded-fr-control bg-fr-surface-alt p-3" aria-describedby={error ? errorId : undefined}>
        <legend className="float-left mb-1 w-full text-sm font-semibold text-fr-ink-900">Do you have a neat cattle slurry figure for this tank?</legend>
        <label className="flex min-h-11 items-start gap-2 text-sm text-fr-ink-900">
          <input type="radio" name="neat-has-figure" className="mt-1 size-4" checked={hasFigure === true} onChange={() => setHasFigure(true)} />
          Yes, I have a figure
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm text-fr-ink-900">
          <input type="radio" name="neat-has-figure" className="mt-1 size-4" checked={hasFigure === false} onChange={() => setHasFigure(false)} />
          No, I don&apos;t have a figure I can stand over
        </label>
      </fieldset>
      {hasFigure ? (
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Neat cattle slurry (m³)</span>
          <input type="number" inputMode="decimal" min="0" step="any" value={volume} onChange={(e) => setVolume(e.target.value)} className={INPUT} />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">True as of</span>
        <input type="date" required value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={INPUT} />
      </label>
      <p className="text-xs text-fr-ink-600">
        To be used, the date must be after the tank&apos;s latest fill reading and any spreading from it.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs text-fr-ink-600">How you worked this out (optional)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
      </label>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-fr-risk">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={PRIMARY_BUTTON} disabled={saving}>
          {saving ? "Saving…" : "Save figure"}
        </button>
      </div>
    </form>
  );
}
