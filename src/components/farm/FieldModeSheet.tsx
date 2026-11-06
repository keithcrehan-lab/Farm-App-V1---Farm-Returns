"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, RefreshCw } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { suggestFieldFromPosition } from "@/domain/near-field";
import type { Field } from "@/domain/types";
import { formatNumber } from "@/lib/format";
import { fieldModeActionablePrompt, fieldModeQuickActions } from "@/lib/field-mode";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import type { LocationPosition } from "@/lib/location/location-tracking-provider";
import type { Prompt } from "@/orchestration/prompt";

const PRIMARY = "flex min-h-11 items-center justify-center bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white disabled:opacity-40";
const SECONDARY = "flex min-h-11 items-center justify-center border border-fr-v2-cream-rule px-4 text-sm font-semibold text-fr-v2-forest";

/**
 * Field Mode — "which field am I in, and what can I do here?", shared by
 * Today and Fields. The location check runs when the farmer opens it. GPS
 * only ever suggests: nothing is treated as this field until the farmer
 * confirms it or picks it themselves, and the quick actions only appear then.
 */
export function FieldModeSheet({
  open,
  onClose,
  fields,
  leadingPromptFor,
  onViewPrompt,
  onConfirmField,
}: {
  open: boolean;
  onClose: () => void;
  fields: Field[];
  leadingPromptFor: (fieldId: string) => Prompt | undefined;
  /** The caller owns the prompt sheet, so Field Mode never completes an operation itself. */
  onViewPrompt: (prompt: Prompt) => void;
  /** Keeps the map's own selection on the field the farmer confirmed. */
  onConfirmField?: (fieldId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Field mode">
      {open ? <FieldModeBody fields={fields} leadingPromptFor={leadingPromptFor} onViewPrompt={onViewPrompt} onConfirmField={onConfirmField} /> : null}
    </Sheet>
  );
}

function FieldModeBody({
  fields,
  leadingPromptFor,
  onViewPrompt,
  onConfirmField,
}: {
  fields: Field[];
  leadingPromptFor: (fieldId: string) => Prompt | undefined;
  onViewPrompt: (prompt: Prompt) => void;
  onConfirmField?: (fieldId: string) => void;
}) {
  const providerRef = useRef(createWebLocationTrackingProvider());
  const [attempt, setAttempt] = useState(0);
  const [fix, setFix] = useState<{ attempt: number; position: LocationPosition | null } | null>(null);
  const [confirmedFieldId, setConfirmedFieldId] = useState<string | undefined>();
  const [manualFieldId, setManualFieldId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void providerRef.current.getCurrentPosition().then((position) => {
      if (!cancelled) setFix({ attempt, position });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const locating = fix?.attempt !== attempt;
  const position = fix && fix.attempt === attempt ? fix.position : null;
  const suggestion = useMemo(
    () => suggestFieldFromPosition(fields, position ? { latitude: position.lat, longitude: position.lng, accuracyMeters: position.accuracyMeters } : null),
    [fields, position],
  );
  const confirmedField = fields.find((field) => field.id === confirmedFieldId);

  function confirm(fieldId: string) {
    setConfirmedFieldId(fieldId);
    onConfirmField?.(fieldId);
  }

  if (confirmedField) {
    const prompt = fieldModeActionablePrompt(leadingPromptFor(confirmedField.id));
    return (
      <div className="flex flex-col gap-4" data-field-mode-confirmed>
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Confirmed field</p>
          <p className="mt-1 font-display text-[28px] leading-none text-fr-v2-graphite">{confirmedField.name}</p>
          <p className="mt-2 font-mono text-[12px] tabular-nums text-fr-v2-muted">{formatNumber(confirmedField.areaHa, 2)} ha</p>
        </div>
        <ul className="flex flex-col border-t border-fr-v2-cream-rule">
          {prompt ? (
            <li className="border-b border-fr-v2-cream-rule">
              <button type="button" onClick={() => onViewPrompt(prompt)} className="flex min-h-14 w-full items-center justify-between gap-4 py-2 text-left">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fr-v2-graphite">{prompt.title}</span>
                  <span className="mt-0.5 block text-xs text-fr-v2-muted">Open prompt for this field</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fr-v2-forest" aria-hidden />
              </button>
            </li>
          ) : null}
          {fieldModeQuickActions(confirmedField.id).map((action) => (
            <li key={action.id} className="border-b border-fr-v2-cream-rule">
              <Link href={action.href} className="flex min-h-14 items-center justify-between gap-4 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fr-v2-graphite">{action.label}</span>
                  <span className="mt-0.5 block text-xs text-fr-v2-muted">{action.detail}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fr-v2-forest" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setConfirmedFieldId(undefined)} className="min-h-11 self-start text-sm font-semibold text-fr-v2-muted underline underline-offset-2">
          Change field
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-field-mode-choose>
      <div aria-live="polite">
        {locating ? <p className="text-sm text-fr-v2-muted">Finding your location…</p> : null}
        {!locating && suggestion.status === "suggested" ? (
          <div className="border-l-[3px] border-fr-v2-gold pl-3" data-field-mode-suggestion>
            <p className="flex items-center gap-2 text-sm text-fr-v2-charcoal">
              <MapPin className="size-4 shrink-0 text-fr-v2-forest" aria-hidden /> Looks like you&apos;re in <strong>{suggestion.field.name}</strong>
            </p>
            {position?.accuracyMeters !== undefined ? <p className="mt-1 text-xs text-fr-v2-muted">GPS accuracy about {formatNumber(position.accuracyMeters, 0)} m. Confirm this is the right field.</p> : null}
            <button type="button" onClick={() => confirm(suggestion.field.id)} className={`${PRIMARY} mt-3 w-full`}>
              Yes, I&apos;m in {suggestion.field.name}
            </button>
          </div>
        ) : null}
        {!locating && suggestion.status === "ambiguous" ? (
          <div className="border-l-[3px] border-fr-v2-gold pl-3" data-field-mode-ambiguous>
            <p className="text-sm text-fr-v2-charcoal">GPS can&apos;t tell which of these fields you&apos;re in. Which one is it?</p>
            <div className="mt-3 flex flex-col gap-2">
              {suggestion.candidates.map((candidate) => (
                <button key={candidate.id} type="button" onClick={() => confirm(candidate.id)} className={SECONDARY}>
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {!locating && suggestion.status === "none" ? (
          <p className="text-sm text-fr-v2-muted" data-field-mode-no-suggestion>
            {position ? "Your location can't confidently be matched to a mapped field." : "Your location isn't available."} Choose the field below.
          </p>
        ) : null}
      </div>

      <div className="border-t border-fr-v2-cream-rule pt-4">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fr-v2-graphite">
          Choose a field
          <select value={manualFieldId} onChange={(event) => setManualFieldId(event.target.value)} className="min-h-11 w-full border border-fr-v2-cream-rule bg-white px-3 text-sm font-normal text-fr-v2-graphite">
            <option value="">Select field</option>
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={!manualFieldId} onClick={() => confirm(manualFieldId)} className={PRIMARY}>
            Use this field
          </button>
          <button type="button" disabled={locating} onClick={() => setAttempt((value) => value + 1)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-fr-v2-forest disabled:opacity-40">
            <RefreshCw className="size-3.5" aria-hidden /> Check location again
          </button>
        </div>
      </div>
    </div>
  );
}
