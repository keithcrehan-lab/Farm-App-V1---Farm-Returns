"use client";

/**
 * Supplier Portal — quote drafting. The live totals preview calls the
 * same pure domain functions the server uses (`validateSupplierQuoteDraft`
 * → `computeSupplierQuoteTotals`); the server never trusts it — it
 * re-validates, and stored totals are recomputed from stored inputs.
 * The editor sends only references (route id, quote id, version) plus
 * the draft content; it has no supplier id to send.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  SUPPLIER_QUOTE_MAX_LINES,
  SUPPLIER_QUOTE_UNITS,
  computeSupplierQuoteTotals,
  validateSupplierQuoteDraft,
  type SupplierQuoteIssue,
} from "@/domain/supplier-quote";
import type { QuoteRequestUnit } from "@/domain/quote-request";
import { saveSupplierQuoteDraftAction, submitSupplierQuoteAction } from "@/app/actions/supplier-portal";
import type { SupplierPortalQuote, SupplierPortalRequest } from "@/lib/farm-data/supplier-portal";
import { formatCents } from "./supplier-presentation";

const inputClass = "w-full rounded-fr-control border border-fr-border px-2.5 py-1.5 text-sm text-fr-ink-900 aria-[invalid=true]:border-fr-risk";

interface LineState {
  key: number;
  product: string;
  description: string;
  quantity: string;
  unit: QuoteRequestUnit;
  unitPriceExVat: string;
  vatRatePercent: string;
}

interface HeaderState {
  deliveryChargeExVat: string;
  deliveryVatRatePercent: string;
  deliveryEarliest: string;
  deliveryLatest: string;
  validUntil: string;
  paymentTerms: string;
  notes: string;
}

export interface SupplierQuoteEditorProps {
  routeId: string;
  request: SupplierPortalRequest;
  draft: SupplierPortalQuote | null;
  /** Prefill for a brand-new draft only, from the supplier's own settings. */
  defaultValidUntil: string | null;
  defaultTerms: string | null;
}

function initialLines(request: SupplierPortalRequest, draft: SupplierPortalQuote | null): LineState[] {
  if (draft && draft.lines.length > 0) {
    return draft.lines.map((line, index) => ({
      key: index,
      product: line.product,
      description: line.description ?? "",
      quantity: line.quantity,
      unit: line.unit,
      unitPriceExVat: line.unitPriceExVat,
      vatRatePercent: line.vatRatePercent ?? "",
    }));
  }
  // The farmer's own ask as the starting line; price and VAT are left
  // blank for the supplier to enter — never guessed.
  return [{ key: 0, product: request.product, description: request.packaging ?? "", quantity: request.quantity, unit: request.unit, unitPriceExVat: "", vatRatePercent: "" }];
}

function initialHeader(request: SupplierPortalRequest, draft: SupplierPortalQuote | null, defaultValidUntil: string | null, defaultTerms: string | null): HeaderState {
  if (draft) {
    return {
      deliveryChargeExVat: draft.deliveryChargeExVat ?? "",
      deliveryVatRatePercent: draft.deliveryVatRatePercent ?? "",
      deliveryEarliest: draft.deliveryEarliest ?? "",
      deliveryLatest: draft.deliveryLatest ?? "",
      validUntil: draft.validUntil ?? "",
      paymentTerms: draft.paymentTerms ?? "",
      notes: draft.notes ?? "",
    };
  }
  return {
    deliveryChargeExVat: "",
    deliveryVatRatePercent: "",
    deliveryEarliest: request.deliveryWindowStart,
    deliveryLatest: request.deliveryWindowEnd,
    validUntil: defaultValidUntil ?? "",
    paymentTerms: defaultTerms ?? "",
    notes: "",
  };
}

type Feedback = { tone: "good" | "risk"; message: string } | null;

export function SupplierQuoteEditor({ routeId, request, draft, defaultValidUntil, defaultTerms }: SupplierQuoteEditorProps) {
  const router = useRouter();
  const [lines, setLines] = useState<LineState[]>(() => initialLines(request, draft));
  const [header, setHeader] = useState<HeaderState>(() => initialHeader(request, draft, defaultValidUntil, defaultTerms));
  const [ref, setRef] = useState<{ quoteId: string; version: number } | null>(draft ? { quoteId: draft.id, version: draft.version } : null);
  const [issues, setIssues] = useState<SupplierQuoteIssue[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(lines.length);

  const payload = useMemo(
    () => ({
      lines: lines.map((line) => ({
        product: line.product,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceExVat: line.unitPriceExVat,
        vatRatePercent: line.vatRatePercent,
      })),
      ...header,
    }),
    [lines, header],
  );

  const preview = useMemo(() => {
    const validated = validateSupplierQuoteDraft(payload);
    return validated.ok ? { ok: true as const, totals: computeSupplierQuoteTotals(validated.value) } : { ok: false as const };
  }, [payload]);

  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;

  function updateLine(key: number, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function run(kind: "save" | "submit") {
    setFeedback(null);
    startTransition(async () => {
      const body = { routeId, quoteId: ref?.quoteId ?? null, expectedVersion: ref?.version ?? null, draft: payload };
      const result = kind === "save" ? await saveSupplierQuoteDraftAction(body) : await submitSupplierQuoteAction(body);
      if (result.ok) {
        setRef(result.value);
        setIssues([]);
        setConfirming(false);
        setFeedback({ tone: "good", message: kind === "save" ? "Draft saved." : "Quote submitted." });
        router.refresh();
        return;
      }
      if (result.latest) setRef(result.latest);
      setIssues(result.issues ?? []);
      setConfirming(false);
      setFeedback({ tone: "risk", message: result.message });
    });
  }

  const lineError = (index: number, field: string) => issueFor(`lines.${index}.${field}`);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        run("save");
      }}
      aria-label="Quote editor"
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-fr-ink-900">Line items</legend>
        {lines.map((line, index) => (
          <div key={line.key} className="grid grid-cols-2 gap-2 rounded-fr-control border border-fr-border p-3 sm:grid-cols-12">
            <label className="col-span-2 flex flex-col gap-1 text-xs text-fr-ink-600 sm:col-span-4">
              Product
              <input className={inputClass} value={line.product} aria-invalid={Boolean(lineError(index, "product"))} onChange={(e) => updateLine(line.key, { product: e.target.value })} />
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-fr-ink-600 sm:col-span-2">
              Quantity
              <input className={inputClass} inputMode="decimal" value={line.quantity} aria-invalid={Boolean(lineError(index, "quantity"))} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-fr-ink-600 sm:col-span-2">
              Unit
              <select className={inputClass} value={line.unit} onChange={(e) => updateLine(line.key, { unit: e.target.value as QuoteRequestUnit })}>
                {SUPPLIER_QUOTE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-fr-ink-600 sm:col-span-2">
              Unit price € ex VAT
              <input
                className={inputClass}
                inputMode="decimal"
                value={line.unitPriceExVat}
                aria-invalid={Boolean(lineError(index, "unitPriceExVat"))}
                onChange={(e) => updateLine(line.key, { unitPriceExVat: e.target.value })}
              />
            </label>
            <label className="col-span-1 flex flex-col gap-1 text-xs text-fr-ink-600 sm:col-span-2">
              VAT rate %
              <input
                className={inputClass}
                inputMode="decimal"
                value={line.vatRatePercent}
                aria-invalid={Boolean(lineError(index, "vatRatePercent"))}
                onChange={(e) => updateLine(line.key, { vatRatePercent: e.target.value })}
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-fr-ink-600 sm:col-span-10">
              Description (optional)
              <input className={inputClass} value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} />
            </label>
            <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-2 sm:justify-end">
              <span className="text-sm text-fr-ink-900 sm:hidden">{preview.ok ? formatCents(preview.totals.lines[index]?.exVatCents ?? null) : "—"}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-fr-risk disabled:opacity-40"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                aria-label={`Remove line ${index + 1}`}
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            </div>
            {["product", "quantity", "unit", "unitPriceExVat", "vatRatePercent", "description"].map((field) =>
              lineError(index, field) ? (
                <p key={field} role="alert" className="col-span-2 text-xs text-fr-risk sm:col-span-12">
                  Line {index + 1}: {lineError(index, field)}
                </p>
              ) : null,
            )}
          </div>
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-1 self-start rounded-full border border-fr-border px-3 py-1.5 text-sm text-fr-ink-900 disabled:opacity-40"
          disabled={lines.length >= SUPPLIER_QUOTE_MAX_LINES}
          onClick={() => {
            setLines((current) => [...current, { key: nextKey, product: "", description: "", quantity: "", unit: request.unit, unitPriceExVat: "", vatRatePercent: "" }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus className="size-4" /> Add line
        </button>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-semibold text-fr-ink-900">Delivery and validity</legend>
        <Field label="Delivery charge € ex VAT (0 if included)" error={issueFor("deliveryChargeExVat")}>
          <input className={inputClass} inputMode="decimal" value={header.deliveryChargeExVat} aria-invalid={Boolean(issueFor("deliveryChargeExVat"))} onChange={(e) => setHeader({ ...header, deliveryChargeExVat: e.target.value })} />
        </Field>
        <Field label="Delivery VAT rate %" error={issueFor("deliveryVatRatePercent")}>
          <input className={inputClass} inputMode="decimal" value={header.deliveryVatRatePercent} aria-invalid={Boolean(issueFor("deliveryVatRatePercent"))} onChange={(e) => setHeader({ ...header, deliveryVatRatePercent: e.target.value })} />
        </Field>
        <Field label="Earliest delivery" error={issueFor("deliveryEarliest")}>
          <input type="date" className={inputClass} value={header.deliveryEarliest} aria-invalid={Boolean(issueFor("deliveryEarliest"))} onChange={(e) => setHeader({ ...header, deliveryEarliest: e.target.value })} />
        </Field>
        <Field label="Latest delivery" error={issueFor("deliveryLatest")}>
          <input type="date" className={inputClass} value={header.deliveryLatest} aria-invalid={Boolean(issueFor("deliveryLatest"))} onChange={(e) => setHeader({ ...header, deliveryLatest: e.target.value })} />
        </Field>
        <Field label="Quote valid until" error={issueFor("validUntil")}>
          <input type="date" className={inputClass} value={header.validUntil} aria-invalid={Boolean(issueFor("validUntil"))} onChange={(e) => setHeader({ ...header, validUntil: e.target.value })} />
        </Field>
        <Field label="Payment terms (optional)" error={issueFor("paymentTerms")} wide>
          <input className={inputClass} value={header.paymentTerms} onChange={(e) => setHeader({ ...header, paymentTerms: e.target.value })} />
        </Field>
        <Field label="Notes to the farmer (optional)" error={issueFor("notes")} wide>
          <textarea className={inputClass} rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
        </Field>
      </fieldset>

      <section aria-label="Quote totals preview" className="rounded-fr-control bg-fr-surface-alt p-3 text-sm">
        {preview.ok ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:max-w-sm">
            <dt className="text-fr-ink-600">Goods ex VAT</dt>
            <dd className="text-right">{formatCents(preview.totals.goodsExVatCents)}</dd>
            <dt className="text-fr-ink-600">Delivery ex VAT</dt>
            <dd className="text-right">{preview.totals.deliveryExVatCents === null ? "Not entered" : formatCents(preview.totals.deliveryExVatCents)}</dd>
            <dt className="text-fr-ink-600">VAT</dt>
            <dd className="text-right">{preview.totals.vatCents === null ? "Unknown until every rate is entered" : formatCents(preview.totals.vatCents)}</dd>
            <dt className="font-semibold text-fr-ink-900">Total inc VAT</dt>
            <dd className="text-right font-semibold text-fr-ink-900">{preview.totals.complete ? formatCents(preview.totals.totalIncVatCents) : "Incomplete"}</dd>
          </dl>
        ) : (
          <p className="text-fr-ink-600">Totals appear once every line has a product, a positive quantity (up to 3 decimals) and a unit price (up to 2 decimals).</p>
        )}
        <p className="mt-2 text-xs text-fr-ink-600">Each line is rounded to the cent, then lines are added. VAT rates are yours to declare — Farm Return does not assume a rate.</p>
      </section>

      {feedback ? (
        <p role={feedback.tone === "risk" ? "alert" : "status"} className={feedback.tone === "risk" ? "rounded-fr-control bg-fr-risk-bg px-3 py-2 text-sm text-fr-risk" : "rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm text-fr-good"}>
          {feedback.message}
          {issues.filter((issue) => !issue.path.startsWith("lines.")).length > 0 && feedback.tone === "risk" ? (
            <span className="mt-1 block text-xs">{issues.filter((issue) => !issue.path.startsWith("lines.")).map((issue) => issue.message).join(" ")}</span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-full border border-fr-border px-4 py-2 text-sm font-semibold text-fr-ink-900 disabled:opacity-60">
          {pending ? "Working…" : "Save draft"}
        </button>
        {confirming ? (
          <>
            <button type="button" disabled={pending} onClick={() => run("submit")} className="rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Confirm and submit
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="text-sm text-fr-ink-600">
              Cancel
            </button>
            <p className="basis-full text-xs text-fr-ink-600">
              A submitted quote cannot be edited. To change it later, withdraw it and start a new quote. Submitted quotes are recorded for
              Farm Return; passing them on to the farmer inside Farm Return is not built yet.
            </p>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Submit quote…
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-fr-ink-600 ${wide ? "col-span-2" : ""}`}>
      {label}
      {children}
      {error ? (
        <span role="alert" className="text-fr-risk">
          {error}
        </span>
      ) : null}
    </label>
  );
}
