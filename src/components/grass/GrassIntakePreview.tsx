"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { getGrassIntakePreviewAction } from "@/app/actions/grass-intake-preview";
import type {
  GrassIntakePreviewHeldReason,
  GrassIntakePreviewUnavailableReason,
  GrassIntakePreviewView,
} from "@/lib/farm-data/grass-intake-preview";

/** Research preview only. Displays the server's bounded result; computes nothing and never feeds the live grass picture. */
export const GRASS_INTAKE_PREVIEW_LABEL = "Research preview — planning allocation, not measured grass eaten";

const HELD_MESSAGE: Record<GrassIntakePreviewHeldReason, string> = {
  EVIDENCE_MISSING: "Intake evidence is missing for a group grazing this field (headcount and weight, feed, and cow/calf pair or dairy stage).",
  EVIDENCE_STALE_OR_INCOMPLETE: "Some intake evidence is too old for the source rule or incomplete. Record up-to-date evidence for the grazing groups.",
  EVIDENCE_CONFLICT: "Recorded intake evidence conflicts (overlapping or inconsistent records). Correct the evidence before this can be checked.",
  HEADCOUNT_MISMATCH: "The headcount in the evidence does not match the recorded cattle movement.",
  GROUP_RECORDS_CHANGED: "A cattle group named in the evidence has been removed or changed category since it was recorded.",
  SESSION_RECORDS_INCONSISTENT: "Cattle movement records overlap or are incomplete (for example a cow group without its calves). Check movements in Cattle.",
  COVER_NOT_VERIFIED_PRE_GRAZING: "Dairy allocation needs a measured (plate meter or cut & weigh) pre-grazing cover for this field, taken before the cows went in.",
  FEED_NOT_SUPPORTED: "The recorded supplementary feed is outside what the source rule covers.",
  STAGE_NOT_SUPPORTED: "The recorded animal stage is outside what the source rule covers.",
  OUTSIDE_SOURCE_RANGE: "Recorded values are outside the range of the published source table.",
  FIELD_NOT_ON_FARM: "This field is not available on your farm.",
  POSSIBLY_INCOMPLETE_READ: "Too many movement records to read safely in one go, so nothing is shown.",
  OTHER: "A required check did not pass, so no figure is shown.",
};

const UNAVAILABLE_MESSAGE: Record<GrassIntakePreviewUnavailableReason, string> = {
  NOT_AUTHORISED: "This preview is not available for this account.",
  NO_FARM: "No signed-in farm is available.",
  INVALID_SCOPE: "Choose a mapped field to check.",
  EVIDENCE_SCHEMA_UNAVAILABLE: "Intake evidence storage is not set up for this environment yet, so nothing can be checked.",
  READ_FAILED: "The evidence could not be read just now. Nothing has been changed; try again later.",
};

function dayLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IE", { day: "numeric", month: "short" }) : "—";
}

export function GrassIntakePreview({ fieldId, fieldName }: { fieldId?: string; fieldName?: string }) {
  const [result, setResult] = useState<{ fieldId: string; view: GrassIntakePreviewView } | null>(null);
  const [checking, setChecking] = useState(false);
  const view = result && result.fieldId === fieldId ? result.view : null;

  async function check() {
    if (!fieldId) return;
    setChecking(true);
    try {
      setResult({ fieldId, view: await getGrassIntakePreviewAction({ fieldId }) });
    } catch {
      setResult({ fieldId, view: { status: "UNAVAILABLE", reason: "READ_FAILED" } });
    } finally {
      setChecking(false);
    }
  }

  return (
    <details className="mt-8 border-t border-fr-v2-cream-rule pt-4" data-grass-intake-preview>
      <summary className="cursor-pointer text-sm font-semibold text-fr-v2-forest">Grass intake — research preview</summary>
      <div className="mt-3 border-l-[3px] border-fr-v2-harvest bg-fr-v2-cream px-4 py-3 text-xs text-fr-v2-muted">
        <p className="font-semibold text-fr-v2-charcoal">{GRASS_INTAKE_PREVIEW_LABEL}</p>
        <p className="mt-1">Source-scoped Teagasc allocation for one field over the last 7 days. It is not used in your cover, wedge, forecasts, fertiliser or plans, and it has not been reviewed by an agronomist.</p>
      </div>
      {!fieldId ? (
        <p className="mt-3 text-xs text-fr-v2-muted">Select a field on the map to check it.</p>
      ) : (
        <div className="mt-3">
          <button type="button" disabled={checking} onClick={() => void check()} className="min-h-10 rounded-fr-v2-control border border-fr-v2-forest px-3 text-xs font-semibold text-fr-v2-forest disabled:opacity-50">
            {checking ? "Checking…" : `Check ${fieldName ?? "this field"}`}
          </button>
          {view ? <PreviewResult view={view} /> : null}
        </div>
      )}
    </details>
  );
}

function PreviewResult({ view }: { view: GrassIntakePreviewView }) {
  switch (view.status) {
    case "DISABLED":
      return <p className="mt-3 text-xs text-fr-v2-muted" data-preview-status="DISABLED">This preview is switched off.</p>;
    case "UNAVAILABLE":
      return <p className="mt-3 text-xs text-fr-v2-muted" data-preview-status="UNAVAILABLE">Unavailable · {UNAVAILABLE_MESSAGE[view.reason]}</p>;
    case "NO_RECORDED_GRAZING":
      return (
        <p className="mt-3 text-xs text-fr-v2-muted" data-preview-status="NO_RECORDED_GRAZING">
          No recorded grazing in this field {dayLabel(view.window.from)} – {dayLabel(view.window.to)}. No allocation is shown (this is not zero).
        </p>
      );
    case "HELD":
      return (
        <div className="mt-3 text-xs" data-preview-status="HELD">
          <p className="font-semibold text-fr-v2-charcoal">Held · no figure shown for {dayLabel(view.window.from)} – {dayLabel(view.window.to)}</p>
          <ul className="mt-1 list-disc pl-4 text-fr-v2-muted">
            {view.reasons.map((reason) => <li key={reason}>{HELD_MESSAGE[reason]}</li>)}
          </ul>
          <p className="mt-1 font-mono text-[10px] text-fr-v2-muted">{view.version}</p>
        </div>
      );
    case "READY":
      return (
        <div className="mt-3 text-xs" data-preview-status="READY">
          <p className="font-semibold text-fr-v2-charcoal">{GRASS_INTAKE_PREVIEW_LABEL}</p>
          <p className="mt-1 text-fr-v2-charcoal">
            <span className="font-mono font-semibold">{formatNumber(view.grazedKgDm, 0)}</span> kg DM allocated over {formatNumber(view.grazedDays, 1)} recorded grazing days ({dayLabel(view.window.from)} – {dayLabel(view.window.to)}).
          </p>
          {view.completeness === "PARTIAL_UNRECORDED_OCCUPANCY" ? (
            <p className="mt-1 text-fr-v2-muted">Partial: {formatNumber(view.unrecordedDays, 1)} days in this window have no recorded cattle movement. That time is unknown, not zero, so this is not the field&apos;s total.</p>
          ) : null}
          <p className="mt-1 text-fr-v2-muted">Source: {view.sources.join("; ")}</p>
          {view.limitations.length ? (
            <ul className="mt-1 list-disc pl-4 text-fr-v2-muted">{view.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : null}
          <p className="mt-1 font-mono text-[10px] text-fr-v2-muted">{[view.version, view.resolutionVersion, ...view.gateVersions, ...view.ruleIds].join(" · ")}</p>
        </div>
      );
  }
}
