"use client";

/**
 * Fertiliser Vertical Completion, Session 4 — the farmer's quote request
 * workflow, opened from "Prepare quote" on the farm fertiliser requirement.
 * Steps: review requirement (requested quantities editable) → quote details →
 * final review of exactly what the supplier receives → prepare. Every state
 * change goes through `src/domain/fertiliser-quote-request.ts`; this component
 * computes nothing. No supplier delivery integration exists, so the workflow
 * ends at READY_TO_SEND and never claims the request was sent.
 */
import { useEffect, useState } from "react";
import { Pill } from "@/components/ui/StatusBadge";
import {
  cancelFertiliserQuoteRequest,
  fertiliserQuoteRequestIssues,
  markFertiliserQuoteRequestReady,
  parseRequestedTonnes,
  renderFertiliserQuoteRequestText,
  setQuoteRequestDetails,
  setRequestedQuantity,
  type FertiliserQuoteRecipient,
  type FertiliserQuoteRequest,
  type FertiliserQuoteRequestIssue,
} from "@/domain/fertiliser-quote-request";
import { formatDisplayTonnes, formatProductCost, formatProductKg } from "@/lib/farm-fertiliser-basket-presentation";
import {
  deliveryPrefillFromFarmDetails,
  quoteCoverageNotice,
  quoteRequestIssueMessages,
  quoteRequestStatusPresentation,
  quoteSubmitLabel,
  readyToSendMessage,
  requestedQuantityNote,
} from "@/lib/fertiliser-quote-request-presentation";
import { getFarmDeliveryDetailsAction, listKnownSupplierNamesAction } from "@/app/actions/quote-requests";

const inputClass = "w-full rounded-fr-control border border-fr-border bg-fr-surface px-3 py-2 text-sm text-fr-ink-900";
const primaryButton = "rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";
const secondaryButton = "rounded-full border border-fr-border px-4 py-2.5 text-sm font-medium text-fr-ink-900";

type Step = "review" | "details" | "final";

export function FertiliserQuoteRequestFlow({
  request,
  onRequestChange,
}: {
  request: FertiliserQuoteRequest;
  onRequestChange: (request: FertiliserQuoteRequest) => void;
}) {
  const [step, setStep] = useState<Step>(request.status === "DRAFT" ? "review" : "final");
  const [errors, setErrors] = useState<FertiliserQuoteRequestIssue[]>([]);

  const status = quoteRequestStatusPresentation(request.status);
  const coverage = quoteCoverageNotice(request);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Pill tone={status.tone}>{status.label}</Pill>
        <Pill tone={coverage.tone}>{coverage.title}</Pill>
      </div>
      <p className={coverage.tone === "good" ? "text-fr-ink-600" : "text-fr-attention"}>{coverage.message}</p>

      {step === "review" ? (
        <ReviewStep
          request={request}
          onNext={(next) => {
            onRequestChange(next);
            setErrors([]);
            setStep("details");
          }}
          onErrors={setErrors}
        />
      ) : null}
      {step === "details" ? (
        <DetailsStep
          request={request}
          onBack={() => {
            setErrors([]);
            setStep("review");
          }}
          onNext={(next) => {
            onRequestChange(next);
            setErrors([]);
            setStep("final");
          }}
          onErrors={setErrors}
        />
      ) : null}
      {step === "final" ? (
        <FinalStep
          request={request}
          onBack={() => {
            setErrors([]);
            setStep("details");
          }}
          onRequestChange={onRequestChange}
          onErrors={setErrors}
        />
      ) : null}

      {errors.length > 0 ? (
        <div role="alert" className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">
          {quoteRequestIssueMessages(errors).map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewStep({
  request,
  onNext,
  onErrors,
}: {
  request: FertiliserQuoteRequest;
  onNext: (request: FertiliserQuoteRequest) => void;
  onErrors: (issues: FertiliserQuoteRequestIssue[]) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.lines.map((l) => [l.productKey, l.requestedTonnes.toFixed(2)])),
  );

  function handleNext() {
    let next = request;
    for (const line of request.lines) {
      const text = quantities[line.productKey] ?? "";
      const tonnes = parseRequestedTonnes(text);
      if (tonnes === null) {
        onErrors(["INVALID_REQUESTED_QUANTITY"]);
        return;
      }
      if (tonnes === line.requestedTonnes) continue;
      const result = setRequestedQuantity(next, line.productKey, tonnes);
      if (!result.ok) {
        onErrors(result.issues);
        return;
      }
      next = result.value;
    }
    onNext(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-label uppercase tracking-wide text-fr-ink-600">1. Review requirement</p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-fr-ink-400">
          <tr>
            <th className="py-1 font-normal">Product</th>
            <th className="py-1 font-normal">Calculated</th>
            <th className="py-1 font-normal">Request (t)</th>
            <th className="py-1 font-normal">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {request.lines.map((line) => {
            const note = requestedQuantityNote(line);
            return (
              <tr key={line.productKey} className="border-t border-fr-border align-top">
                <td className="py-1 text-fr-ink-900">
                  {line.name} <span className="text-fr-ink-400">({line.npkAnalysis})</span>
                  {line.provisional ? <span className="block text-xs text-fr-attention">Provisional</span> : null}
                </td>
                <td className="py-1">
                  {formatDisplayTonnes(line.canonicalDisplayTonnes)}
                  <span className="block text-xs text-fr-ink-400">{formatProductKg(line.canonicalQuantityKg)}</span>
                </td>
                <td className="py-1">
                  <input
                    aria-label={`Requested tonnes for ${line.name} (${line.npkAnalysis})`}
                    inputMode="decimal"
                    className={inputClass}
                    value={quantities[line.productKey] ?? ""}
                    onChange={(e) => setQuantities((q) => ({ ...q, [line.productKey]: e.target.value }))}
                  />
                  {note ? <span className="block text-xs text-fr-attention">{note}</span> : null}
                </td>
                <td className="py-1">{formatProductCost(line.estimatedCostEur)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-fr-ink-400">
        Calculated quantities come from your fertiliser plan and don&apos;t change here. Requested quantities are what you ask suppliers to quote,
        to the nearest 0.01 t. Estimated costs are for the calculated quantities and aren&apos;t shared with suppliers. Bag quantities aren&apos;t
        available — no verified bag size.
      </p>
      <button type="button" onClick={handleNext} className={primaryButton}>
        Continue
      </button>
    </div>
  );
}

function DetailsStep({
  request,
  onBack,
  onNext,
  onErrors,
}: {
  request: FertiliserQuoteRequest;
  onBack: () => void;
  onNext: (request: FertiliserQuoteRequest) => void;
  onErrors: (issues: FertiliserQuoteRequestIssue[]) => void;
}) {
  const [recipients, setRecipients] = useState<FertiliserQuoteRecipient[]>(request.details.recipients);
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState(request.details.deliveryLocation ?? "");
  const [contact, setContact] = useState(request.details.contact ?? "");
  const [windowStart, setWindowStart] = useState(request.details.deliveryWindow?.start ?? "");
  const [windowEnd, setWindowEnd] = useState(request.details.deliveryWindow?.end ?? "");
  const [farmerNote, setFarmerNote] = useState(request.details.farmerNote ?? "");

  useEffect(() => {
    let cancelled = false;
    listKnownSupplierNamesAction().then(
      (names) => {
        if (!cancelled) setKnownSuppliers(names);
      },
      (error: unknown) => console.error("[FertiliserQuoteRequestFlow] listKnownSupplierNamesAction failed:", error),
    );
    getFarmDeliveryDetailsAction().then(
      (details) => {
        if (cancelled) return;
        const prefill = deliveryPrefillFromFarmDetails(details);
        setDeliveryLocation((current) => current || prefill.deliveryLocation);
        setContact((current) => current || prefill.contact);
      },
      (error: unknown) => console.error("[FertiliserQuoteRequestFlow] getFarmDeliveryDetailsAction failed:", error),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const hasRecipient = (name: string) => recipients.some((r) => r.name.toLowerCase() === name.trim().toLowerCase());

  function addRecipient(name: string, recipientContact: string) {
    if (!name.trim() || hasRecipient(name)) return;
    setRecipients((list) => [...list, { name: name.trim(), contact: recipientContact.trim() || null }]);
  }

  function handleNext() {
    const partialWindow = (windowStart === "") !== (windowEnd === "");
    if (partialWindow) {
      onErrors(["INVALID_DELIVERY_WINDOW"]);
      return;
    }
    const result = setQuoteRequestDetails(request, {
      recipients,
      deliveryLocation,
      contact,
      farmerNote,
      deliveryWindow: windowStart && windowEnd ? { start: windowStart, end: windowEnd } : null,
    });
    if (!result.ok) {
      onErrors(result.issues);
      return;
    }
    const issues = fertiliserQuoteRequestIssues(result.value);
    if (issues.length > 0) {
      onErrors(issues);
      return;
    }
    onNext(result.value);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-label uppercase tracking-wide text-fr-ink-600">2. Quote details</p>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-fr-ink-600">Suppliers (optional)</p>
        {knownSuppliers.filter((n) => !hasRecipient(n)).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {knownSuppliers
              .filter((n) => !hasRecipient(n))
              .map((n) => (
                <button key={n} type="button" onClick={() => addRecipient(n, "")} className="rounded-full border border-fr-border px-2.5 py-1 text-xs text-fr-ink-900">
                  + {n}
                </button>
              ))}
          </div>
        ) : null}
        {recipients.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {recipients.map((r) => (
              <li key={r.name} className="flex items-center justify-between text-sm">
                <span className="text-fr-ink-900">
                  {r.name}
                  {r.contact ? <span className="ml-1 text-fr-ink-400">({r.contact})</span> : null}
                </span>
                <button type="button" onClick={() => setRecipients((list) => list.filter((x) => x.name !== r.name))} className="text-xs text-fr-ink-600 underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <input aria-label="Supplier name" className={inputClass} placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          <input
            aria-label="Supplier contact (optional)"
            className={inputClass}
            placeholder="Email or phone (optional)"
            value={supplierContact}
            onChange={(e) => setSupplierContact(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              addRecipient(supplierName, supplierContact);
              setSupplierName("");
              setSupplierContact("");
            }}
            className={secondaryButton}
          >
            Add
          </button>
        </div>
      </div>

      <textarea aria-label="Delivery location" className={inputClass} placeholder="Delivery address or area" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-fr-ink-600">Preferred delivery window (optional)</p>
        <div className="flex gap-2">
          <input aria-label="Delivery window start" className={inputClass} type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          <input aria-label="Delivery window end" className={inputClass} type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
        </div>
      </div>
      <input aria-label="Contact" className={inputClass} placeholder="Your name and phone or email" value={contact} onChange={(e) => setContact(e.target.value)} />
      <textarea aria-label="Note for supplier (optional)" className={inputClass} placeholder="Note for supplier (optional)" value={farmerNote} onChange={(e) => setFarmerNote(e.target.value)} />

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
        <button type="button" onClick={handleNext} className={`${primaryButton} flex-1`}>
          Review request
        </button>
      </div>
    </div>
  );
}

function FinalStep({
  request,
  onBack,
  onRequestChange,
  onErrors,
}: {
  request: FertiliserQuoteRequest;
  onBack: () => void;
  onRequestChange: (request: FertiliserQuoteRequest) => void;
  onErrors: (issues: FertiliserQuoteRequestIssue[]) => void;
}) {
  const text = renderFertiliserQuoteRequestText(request);
  const ready = request.status === "READY_TO_SEND";
  const cancelled = request.status === "CANCELLED";

  function handlePrepare() {
    const result = markFertiliserQuoteRequestReady(request, new Date().toISOString());
    if (!result.ok) {
      onErrors(result.issues);
      return;
    }
    onErrors([]);
    onRequestChange(result.value);
  }

  function handleCancel() {
    const result = cancelFertiliserQuoteRequest(request, new Date().toISOString());
    if (!result.ok) {
      onErrors(result.issues);
      return;
    }
    onRequestChange(result.value);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-label uppercase tracking-wide text-fr-ink-600">3. Final review — what the supplier receives</p>
      <pre aria-label="Quote request preview" className="whitespace-pre-wrap rounded-fr-control border border-fr-border bg-fr-bg p-3 text-xs text-fr-ink-900">
        {text}
      </pre>
      <p className="text-xs text-fr-ink-600">
        Suppliers: {request.details.recipients.length > 0 ? request.details.recipients.map((r) => r.name).join(", ") : "none chosen"}
      </p>
      {request.lines.some((l) => l.requestedBelowCanonical) ? (
        <p className="text-xs text-fr-attention">One or more requested quantities are below the calculated requirement.</p>
      ) : null}
      <p className="text-xs text-fr-ink-400">
        Prepared from basket of {request.basketCreatedAt.slice(0, 10)} · {[...request.engineVersions, request.basketVersion, request.requestVersion].join(" · ")}
      </p>

      {ready ? <p className="text-sm text-fr-ink-900">{readyToSendMessage()}</p> : null}
      {cancelled ? <p className="text-sm text-fr-ink-600">This quote request was cancelled.</p> : null}

      {!cancelled ? (
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className={secondaryButton}>
            {ready ? "Edit" : "Back"}
          </button>
          {ready ? (
            <button type="button" onClick={handleCancel} className={`${secondaryButton} flex-1`}>
              Cancel request
            </button>
          ) : (
            <button type="button" disabled={request.status !== "DRAFT"} onClick={handlePrepare} className={`${primaryButton} flex-1`}>
              {quoteSubmitLabel()}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
