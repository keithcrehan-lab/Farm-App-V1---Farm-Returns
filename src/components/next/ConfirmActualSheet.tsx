"use client";

/**
 * Confirm Actual — canonical screen #4
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §5/§18). "Farm Return already knows as much as it reasonably can. The
 * farmer confirms/corrects only the important facts" — this shows what
 * was genuinely observed/estimated, then asks only for what
 * `src/domain/job-actual.ts`'s validators actually need for this
 * activity, never a fixed generic form (§5: "Do not make every job
 * require identical fields").
 *
 * No client-side scientific validation is performed here beyond what's
 * needed to disable an obviously-incomplete submission — the real,
 * authoritative validation is `src/domain/job-actual.ts`'s
 * `validateJobActualInput`, run either server-side
 * (`confirmJobSessionActualAction`, online) or here, client-side, only
 * when queuing an offline submission (so a bad offline submission fails
 * before it's queued, not silently after a future sync attempt).
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { AskAIButton } from "@/components/next/AskAI";
import { computeElapsedSeconds } from "@/domain/job-session-lifecycle";
import { validateJobActualInput, type ActivityType, type CompletionType, type FieldAreaContext, type RawJobActualInput } from "@/domain/job-actual";
import { confirmJobSessionActualAction } from "@/app/actions/job-sessions";
import { enqueueJobActualConfirmation } from "@/lib/offline/job-session-sync";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";
import type { Field } from "@/domain/types";

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}h ${pad(minutes)}m` : `${minutes}m`;
}

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900";

export function ConfirmActualSheet({
  open,
  onClose,
  session,
  farmId,
  fields,
  canRecord,
  onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  session: JobSessionRecord;
  farmId: string;
  fields: Field[];
  canRecord: boolean;
  onConfirmed: () => void;
}) {
  const activityType = session.activityType as ActivityType;
  const primaryField = fields.find((f) => f.id === session.primaryFieldId);
  const fieldAreaContexts: FieldAreaContext[] = primaryField ? [{ fieldId: primaryField.id, areaHa: primaryField.areaHa }] : [];
  const elapsedSeconds = computeElapsedSeconds(session, new Date().toISOString());

  const [completionType, setCompletionType] = useState<CompletionType>("whole");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("kg");
  const [areaHa, setAreaHa] = useState("");
  const [slurryType, setSlurryType] = useState("");
  const [applicationMethod, setApplicationMethod] = useState("");
  const [bales, setBales] = useState("");
  const [tonnes, setTonnes] = useState("");
  const [observationNote, setObservationNote] = useState("");
  const [livestockGroupId, setLivestockGroupId] = useState("");
  const [action, setAction] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error"; message?: string }>({ status: "idle" });

  function buildRawInput(): RawJobActualInput {
    return {
      completionType,
      fieldIds: session.primaryFieldId ? [session.primaryFieldId] : undefined,
      product: product.trim() || undefined,
      quantity: quantity ? Number(quantity) : undefined,
      quantityUnit: quantityUnit || undefined,
      areaHa: areaHa ? Number(areaHa) : undefined,
      slurryType: slurryType || undefined,
      applicationMethod: applicationMethod || undefined,
      bales: bales ? Number(bales) : undefined,
      tonnes: tonnes ? Number(tonnes) : undefined,
      observationNote: observationNote.trim() || undefined,
      livestockGroupId: livestockGroupId.trim() || undefined,
      action: action.trim() || undefined,
      note: note.trim() || undefined,
    };
  }

  async function submit() {
    if (!canRecord) {
      setState({ status: "error", message: "Demo mode — this isn't saved to a real account here." });
      return;
    }
    setState({ status: "submitting" });
    const id = globalThis.crypto.randomUUID();
    const confirmedAt = new Date().toISOString();
    const raw = buildRawInput();
    try {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        // Codex audit HIGH (round 1, docs/overnight/audits/
        // gps-job-session-actual-contract-codex-audit-round1.md): the
        // prior version ignored `sessionStatusUpdateError` entirely and
        // always navigated away as if fully confirmed — a farmer would
        // never learn that the session's own status hadn't actually
        // moved to confirmed_actual. The Actual itself is always safely
        // recorded either way (that insert happens first and is what
        // this retry is safe to repeat — `confirmJobSessionActualAction`'s
        // own id-first retry-safety, `job-actuals.ts`); one retry is
        // attempted automatically (the common case: a single dropped
        // request between the two real writes), and only if it's still
        // failing after that does this surface as a real, actionable
        // error rather than a silent, incomplete "success".
        let result = await confirmJobSessionActualAction({ id, jobSessionId: session.id, activityType, raw, confirmedAt });
        if (result.sessionStatusUpdateError) {
          result = await confirmJobSessionActualAction({ id, jobSessionId: session.id, activityType, raw, confirmedAt });
        }
        if (result.sessionStatusUpdateError) {
          setState({
            status: "error",
            message: "Your entry was saved, but we couldn't fully confirm it — please try Confirm Actual again.",
          });
          return;
        }
      } else {
        // Offline: validate here (client-side) so a genuinely incomplete
        // submission fails now, visibly, rather than silently at a future
        // sync attempt — the queued item still carries the server's own
        // real validated payload shape either way.
        const validation = validateJobActualInput(activityType, raw, fieldAreaContexts);
        if (!validation.ok) {
          setState({ status: "error", message: validation.errors.join("; ") });
          return;
        }
        await enqueueJobActualConfirmation(farmId, {
          id,
          farmId,
          jobSessionId: session.id,
          activityType,
          completionType,
          payload: validation.payload as unknown as Record<string, unknown>,
          note: note.trim() || undefined,
          confirmedAt,
        });
      }
      onConfirmed();
    } catch (error) {
      console.error("[ConfirmActualSheet] confirm failed:", error);
      setState({ status: "error", message: "Something went wrong confirming this — please try again." });
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Confirm Actual">
      <div className="flex flex-col gap-4">
        <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
          <p className="mb-1 text-label uppercase tracking-wide text-fr-ink-600">Farm Return observed</p>
          <p className="text-sm text-fr-ink-600">Field: {primaryField?.name ?? "Not field-specific"}</p>
          <p className="text-sm text-fr-ink-600">Duration: {formatElapsed(elapsedSeconds)}</p>
        </div>

        <div>
          <p id="confirm-actual-completion-label" className="mb-2 text-label uppercase tracking-wide text-fr-ink-600">
            Completion
          </p>
          {/* Codex audit MEDIUM (round 1, docs/overnight/audits/
              gps-job-session-actual-contract-codex-audit-round1.md): a
              real radiogroup, not three unrelated buttons — a screen
              reader now announces this as one mutually-exclusive choice
              with its currently-selected option, not three disconnected
              controls. */}
          <div role="radiogroup" aria-labelledby="confirm-actual-completion-label" className="flex gap-2">
            {(["whole", "partial", "did_not_happen"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={completionType === option}
                onClick={() => setCompletionType(option)}
                className={`flex-1 rounded-full border px-3 py-2 text-xs font-medium ${
                  completionType === option ? "border-fr-green-700 bg-fr-green-700 text-white" : "border-fr-border text-fr-ink-900"
                }`}
              >
                {option === "whole" ? "Whole field" : option === "partial" ? "Part of field" : "Did not happen"}
              </button>
            ))}
          </div>
        </div>

        {completionType !== "did_not_happen" && activityType === "fertiliser_spreading" ? (
          <div className="flex flex-col gap-2">
            <input aria-label="Product" className={inputClass} placeholder="Product (e.g. CAN)" value={product} onChange={(e) => setProduct(e.target.value)} />
            <div className="flex gap-2">
              <input aria-label="Quantity" className={inputClass} type="number" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <select aria-label="Quantity unit" className={inputClass} value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)}>
                <option value="kg">kg</option>
                <option value="t">t</option>
                <option value="bags">bags</option>
              </select>
            </div>
            {completionType === "partial" ? (
              <input
                aria-label="Area completed (hectares, optional)"
                className={inputClass}
                type="number"
                placeholder="Area completed (ha, optional)"
                value={areaHa}
                onChange={(e) => setAreaHa(e.target.value)}
              />
            ) : null}
          </div>
        ) : null}

        {completionType !== "did_not_happen" && activityType === "slurry_spreading" ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input aria-label="Quantity" className={inputClass} type="number" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <select aria-label="Quantity unit" className={inputClass} value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)}>
                <option value="m3">m³</option>
                <option value="gallons">gallons</option>
              </select>
            </div>
            <select aria-label="Slurry type" className={inputClass} value={slurryType} onChange={(e) => setSlurryType(e.target.value)}>
              <option value="">Slurry type (if known)</option>
              <option value="cattle_slurry">Cattle slurry</option>
              <option value="pig_slurry">Pig slurry</option>
              <option value="other">Other</option>
            </select>
            <select aria-label="Application method" className={inputClass} value={applicationMethod} onChange={(e) => setApplicationMethod(e.target.value)}>
              <option value="">Application method (if known)</option>
              <option value="LESS">LESS</option>
              <option value="splashplate">Splash plate</option>
              <option value="incorporate_24h">Incorporated within 24h</option>
              <option value="other">Other</option>
            </select>
            {completionType === "partial" ? (
              <input
                aria-label="Area completed (hectares, optional)"
                className={inputClass}
                type="number"
                placeholder="Area completed (ha, optional)"
                value={areaHa}
                onChange={(e) => setAreaHa(e.target.value)}
              />
            ) : null}
          </div>
        ) : null}

        {activityType === "silage" ? (
          <div className="flex gap-2">
            <input aria-label="Bales (optional)" className={inputClass} type="number" placeholder="Bales (optional)" value={bales} onChange={(e) => setBales(e.target.value)} />
            <input aria-label="Tonnes (optional)" className={inputClass} type="number" placeholder="Tonnes (optional)" value={tonnes} onChange={(e) => setTonnes(e.target.value)} />
          </div>
        ) : null}

        {activityType === "field_inspection" ? (
          <textarea
            aria-label="What did you observe?"
            className={inputClass}
            placeholder="What did you observe?"
            value={observationNote}
            onChange={(e) => setObservationNote(e.target.value)}
          />
        ) : null}

        {activityType === "livestock_work" ? (
          <div className="flex flex-col gap-2">
            <input aria-label="Livestock group" className={inputClass} placeholder="Livestock group" value={livestockGroupId} onChange={(e) => setLivestockGroupId(e.target.value)} />
            <input aria-label="Action" className={inputClass} placeholder="Action (e.g. dosed)" value={action} onChange={(e) => setAction(e.target.value)} />
          </div>
        ) : null}

        <textarea aria-label="Note (optional)" className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        {state.status === "error" ? (
          <div role="alert" className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">{state.message}</div>
        ) : null}

        <button
          type="button"
          disabled={state.status === "submitting"}
          onClick={submit}
          className="rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Confirm Actual
        </button>

        <AskAIButton
          className="self-start"
          context={{
            screen: "Confirm Actual",
            facts: {
              Activity: activityType,
              ...(primaryField ? { Field: primaryField.name } : {}),
              Duration: formatElapsed(elapsedSeconds),
            },
          }}
        />
      </div>
    </Sheet>
  );
}
