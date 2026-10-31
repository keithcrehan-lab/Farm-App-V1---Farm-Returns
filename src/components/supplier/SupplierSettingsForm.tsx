"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { updateSupplierSettingsAction } from "@/app/actions/supplier-portal";
import type { SupplierPortalContext } from "@/lib/farm-data/supplier-portal";

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900 disabled:bg-fr-surface-alt";

export function SupplierSettingsForm({ context, counties }: { context: SupplierPortalContext; counties: string[] }) {
  const router = useRouter();
  const readOnly = context.role !== "admin";
  const [contactEmail, setContactEmail] = useState(context.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(context.contactPhone ?? "");
  const [serviceCounties, setServiceCounties] = useState<string[]>(context.serviceCounties);
  const [validityDays, setValidityDays] = useState(context.defaultQuoteValidityDays === null ? "" : String(context.defaultQuoteValidityDays));
  const [quoteTerms, setQuoteTerms] = useState(context.quoteTerms ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    const days = validityDays.trim() === "" ? null : Number(validityDays);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 90)) {
      setFeedback({ ok: false, message: "Default validity must be a whole number of days between 1 and 90, or blank." });
      return;
    }
    startTransition(async () => {
      const result = await updateSupplierSettingsAction({ contactEmail, contactPhone, serviceCounties, defaultQuoteValidityDays: days, quoteTerms });
      if (result.ok) {
        setFeedback({ ok: true, message: "Settings saved." });
        router.refresh();
      } else {
        setFeedback({ ok: false, message: [result.message, ...(result.issues ?? []).map((issue) => issue.message)].join(" ") });
      }
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      {readOnly ? <p className="rounded-fr-control bg-fr-surface-alt px-3 py-2 text-sm text-fr-ink-600">Only a supplier admin can change these settings.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          Quotes contact email
          <input type="email" className={inputClass} disabled={readOnly} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          Quotes contact phone
          <input className={inputClass} disabled={readOnly} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          Default quote validity (days, optional)
          <input inputMode="numeric" className={inputClass} disabled={readOnly} value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs text-fr-ink-600">Counties you deliver to (for Farm Return&apos;s routing — not shown to farmers)</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {counties.map((county) => (
            <label key={county} className="flex items-center gap-2 text-sm text-fr-ink-900">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={serviceCounties.includes(county)}
                onChange={(e) => setServiceCounties((current) => (e.target.checked ? [...current, county] : current.filter((c) => c !== county)))}
              />
              {county}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
        Standard quote terms (prefilled as payment terms on new quotes)
        <textarea className={inputClass} rows={3} maxLength={2000} disabled={readOnly} value={quoteTerms} onChange={(e) => setQuoteTerms(e.target.value)} />
      </label>
      {feedback ? (
        <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-sm text-fr-good" : "text-sm text-fr-risk"}>
          {feedback.message}
        </p>
      ) : null}
      {readOnly ? null : (
        <button type="button" disabled={pending} onClick={save} className="self-start rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save settings"}
        </button>
      )}
    </Card>
  );
}
