"use client";

/**
 * Managed Quote Pilot, Checkpoint 1 — "Request a quote"
 * (`managed-quotes-build-brief.md`: entry point on Input Planner).
 * Composed entirely from existing primitives (`Sheet`, the same input
 * styling `FertiliserPlanSheet` already established) — no new visual
 * system, per `CLAUDE.md`'s never-rules. **No approved reference image
 * exists yet for this screen** — this layout follows the architecture
 * doc's own reviewed section 7 wireframe proposal as the working basis,
 * per `UX_DESIGN.md`'s precedent for a screen with no reference yet
 * (Today/GPS job mode); it is not a final pixel-accurate implementation.
 *
 * Three quantities stay distinct (brief, non-negotiable): the prefilled
 * `remainingRequirementKg` option is a read-only *estimate*, never
 * itself submitted — the farmer's own confirmed/typed `quantity` is
 * what actually goes to `submitQuoteRequestAction`. A manual entry
 * (`quantityBasis: "farmer_entered"`) carries no estimate at all.
 *
 * `RequestQuoteSheet` (outer) always renders `Sheet` so it can animate
 * open/closed; `RequestQuoteSheetBody` (inner) is only ever mounted
 * while `open` is true, so every open gets a genuinely fresh
 * `useState` initial value with no explicit "reset to loading" inside
 * an effect — a plain conditional-mount, not a `key` trick, since
 * there is only ever one instance at a time.
 *
 * The pre-submit disclosure below is both enforced (the checkbox gates
 * the Confirm button — a farmer cannot submit without it) AND
 * persisted as its own real, auditable database fact: `disclosureVersion`/
 * `disclosureAcceptedAt` are captured at the real moment the farmer
 * ticks the box and sent through to `submitQuoteRequestAction`, which
 * the real RPC stores on the request's own revision row
 * (`quote_request_revisions.disclosure_version`/`disclosure_accepted_at`,
 * `20260911150000_quote_pilot_disclosure_fields.sql`) — Codex audit LOW
 * (Checkpoint C round 2): this doc comment previously described that
 * persistence as a still-open gap, stale since this branch ported the
 * already-fixed, disclosure-persisting version of this workflow.
 */
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import {
  getFarmDeliveryDetailsAction,
  getQuoteRequestPrefillContextAction,
  saveFarmDeliveryDetailsAction,
  submitQuoteRequestAction,
} from "@/app/actions/quote-requests";
import type { QuoteRequestPrefillContext } from "@/orchestration/quotes";
import type { FarmDeliveryDetails } from "@/lib/farm-data/farm-delivery-details";
import { formatNumber } from "@/lib/format";

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900";
const MANUAL_OPTION = "__manual__";
const DISCLOSURE_TEXT = "Farm Return will seek a supplier quote for these items. This is not an order and no payment is taken.";
/** Identifies exactly which wording of the disclosure above a farmer
 * accepted (`quote-request.ts`'s own `disclosureVersion` doc comment) —
 * bump this whenever `DISCLOSURE_TEXT` changes, never silently reuse
 * "v1" for different wording. */
const DISCLOSURE_VERSION = "v1";

type LoadState = { status: "loading" } | { status: "ready"; prefill: QuoteRequestPrefillContext; delivery: FarmDeliveryDetails | null } | { status: "error" };

export function RequestQuoteSheet({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Request a quote">
      {open ? <RequestQuoteSheetBody onSubmitted={onSubmitted} /> : null}
    </Sheet>
  );
}

function RequestQuoteSheetBody({ onSubmitted }: { onSubmitted: () => void }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [selectedOption, setSelectedOption] = useState<string>(MANUAL_OPTION);
  const [manualProduct, setManualProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"kg" | "tonnes" | "bags">("kg");
  const [packaging, setPackaging] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [townOrCity, setTownOrCity] = useState("");
  const [county, setCounty] = useState("");
  const [eircode, setEircode] = useState("");

  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  // The real moment the farmer ticked the box — never backdated to
  // submission time, and cleared if they untick it, so a later re-tick
  // records its own real, distinct timestamp.
  const [disclosureAcceptedAt, setDisclosureAcceptedAt] = useState<string | null>(null);
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "submitted"; message?: string; reference?: string }>({ status: "idle" });

  // Mounts fresh exactly once per open (see RequestQuoteSheet's own doc
  // comment) — no "reset to loading" branch needed, `load`'s own
  // useState initializer already starts there.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getQuoteRequestPrefillContextAction(), getFarmDeliveryDetailsAction()])
      .then(([prefill, delivery]) => {
        if (cancelled) return;
        setLoad({ status: "ready", prefill, delivery });
        if (delivery) {
          setContactName(delivery.contactName);
          setContactPhone(delivery.contactPhone ?? "");
          setContactEmail(delivery.contactEmail ?? "");
          setAddressLine1(delivery.addressLine1);
          setAddressLine2(delivery.addressLine2 ?? "");
          setTownOrCity(delivery.townOrCity);
          setCounty(delivery.county);
          setEircode(delivery.eircode ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.status === "loading") {
    return <p className="text-sm text-fr-ink-600">Loading your farm&rsquo;s estimated requirements…</p>;
  }
  if (load.status === "error") {
    return <p className="text-sm text-fr-attention">Could not load this form — please try again.</p>;
  }

  const { prefill } = load;
  const selectedEstimate = selectedOption === MANUAL_OPTION ? null : prefill.options.find((o) => o.product === selectedOption);
  const product = selectedEstimate ? selectedEstimate.product : manualProduct.trim();
  const quantityNumber = Number(quantity);
  const canSubmit =
    product.length > 0 &&
    quantity.trim().length > 0 &&
    Number.isFinite(quantityNumber) &&
    quantityNumber > 0 &&
    windowStart.length > 0 &&
    windowEnd.length > 0 &&
    windowStart <= windowEnd &&
    contactName.trim().length > 0 &&
    addressLine1.trim().length > 0 &&
    townOrCity.trim().length > 0 &&
    county.trim().length > 0 &&
    disclosureAccepted;

  async function handleSubmit() {
    if (!canSubmit || !disclosureAcceptedAt) return;
    setState({ status: "submitting" });
    try {
      // Codex audit LOW (Checkpoint C round 6) — deliberately two
      // independent writes, not one atomic transaction: this saves the
      // farmer's own real, reusable delivery-details PROFILE
      // (`farm_delivery_details`) — separate from the request's own
      // immutable delivery SNAPSHOT the RPC below persists — and it
      // stays saved even if the quote request itself then fails to
      // submit. That is the intended behaviour, not a bug: the farmer
      // genuinely typed/confirmed these details for their own future
      // reuse regardless of whether this one specific request
      // succeeds, the same way editing a contact profile elsewhere in
      // this app isn't undone by an unrelated later failure.
      await saveFarmDeliveryDetailsAction({
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        townOrCity: townOrCity.trim(),
        county: county.trim(),
        eircode: eircode.trim() || undefined,
      });
      const result = await submitQuoteRequestAction(idempotencyKey, {
        product,
        quantity: quantityNumber,
        unit,
        packaging: packaging.trim() || undefined,
        quantityBasis: selectedEstimate ? "estimated" : "farmer_entered",
        deliveryWindow: { start: windowStart, end: windowEnd },
        disclosureVersion: DISCLOSURE_VERSION,
        disclosureAcceptedAt,
        delivery: {
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          townOrCity: townOrCity.trim(),
          county: county.trim(),
          eircode: eircode.trim() || undefined,
        },
      });
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      // Codex audit MEDIUM (Checkpoint C round 1): `onSubmitted` must
      // NOT fire here — both real parents (`input-planner/page.tsx`,
      // `QuotesPageClient.tsx`) close this sheet in that same callback,
      // which would unmount the confirmation/reference screen below
      // before the farmer ever sees it. Deferred to the "Done" button
      // instead, so the farmer has genuinely seen the real reference
      // before the sheet closes/the list refreshes.
      setState({ status: "submitted", reference: result.result.requestId });
    } catch (error) {
      console.error("[RequestQuoteSheet] submit failed:", error);
      setState({ status: "error", message: "Something went wrong — please try again." });
    }
  }

  if (state.status === "submitted") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fr-ink-900">Your quote request has been submitted.</p>
        <p className="text-xs text-fr-ink-600">Reference: {state.reference}</p>
        <p className="text-sm text-fr-ink-600">
          Farm Return will review compatible requests and seek a supplier quote. This was not an order — no payment was taken.
        </p>
        <button type="button" onClick={onSubmitted} className="rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-label uppercase tracking-wide text-fr-ink-600">Product</p>
        {/* Grassland Fertiliser Pilot Completion, Checkpoint C (audit
            F1/F5/"see products/units/lime") — the farm's real, laboratory-
            evidenced lime total, shown here for the farmer's own
            reference. Codex audit HIGH (Checkpoint C round 1): the first
            version of this auto-quick-filled the manual fields below
            when selected, then submitted the result as
            `quantityBasis: "farmer_entered"` — an honest label for the
            manual route in general, but misleading here specifically,
            since the number displayed as if entered by the farmer was
            actually computed by this app. Fixed by never auto-filling
            anything: this is purely informational, and a farmer who
            wants to request it types it into the manual fields below
            themselves — at that point "farmer_entered" is genuinely,
            unambiguously true, with no special-cased provenance claim
            this schema was never built to carry. */}
        {prefill.limeOption ? (
          <p className="rounded-fr-control border border-fr-border bg-fr-bg p-2.5 text-xs text-fr-ink-600">
            {/* Codex audit HIGH (Checkpoint C round 5) — calling this
                "your farm's real total lime requirement" while ALSO
                disclosing missing evidence was contradictory: exactly
                the "partial total presented as complete" shape
                `FarmLimeRequirementCard.tsx`'s own audited disclosure
                (audit F5) already guards against. Reworded to the same
                honest framing that card already established: the real
                total for fields WITH a lime figure on file, never
                claimed as the farm's complete requirement when it
                genuinely is not. */}
            {prefill.limeOption.fieldsWithoutLimeEvidence > 0 ? (
              <>
                The real lime total from laboratory results on file so far is{" "}
                <span className="font-semibold text-fr-ink-900">{formatNumber(prefill.limeOption.farmTotalTonnes, 2)} t</span> —{" "}
                {prefill.limeOption.fieldsWithoutLimeEvidence} field{prefill.limeOption.fieldsWithoutLimeEvidence === 1 ? " has" : "s have"} no lime figure on file yet, so
                this is real but partial, not your farm&rsquo;s complete lime requirement.
              </>
            ) : (
              <>
                Your farm&rsquo;s real total lime requirement, from laboratory soil test results on file, is{" "}
                <span className="font-semibold text-fr-ink-900">{formatNumber(prefill.limeOption.farmTotalTonnes, 2)} t</span>.
              </>
            )}{" "}
            To request a quote for lime, choose &ldquo;Something else&rdquo; below and enter it manually.
          </p>
        ) : null}
        <select
          aria-label="Product source"
          className={inputClass}
          value={selectedOption}
          onChange={(e) => {
            setSelectedOption(e.target.value);
            const opt = prefill.options.find((o) => o.product === e.target.value);
            if (opt) {
              // Codex audit HIGH (Checkpoint C round 7) — `Math.round`
              // on a real domain-produced figure inside a React
              // component is exactly the kind of calculation `AGENTS.md`
              // reserves for `src/domain/`. Fixed by not rounding at
              // all: the real, exact `remainingRequirementKg` prefills
              // this editable field verbatim — the farmer can still
              // adjust it before submitting, but the starting point is
              // never silently altered by UI-layer arithmetic.
              setQuantity(String(opt.remainingRequirementKg));
              setUnit("kg");
            } else {
              setQuantity("");
            }
          }}
        >
          {prefill.options.map((o) => (
            <option key={o.product} value={o.product}>
              {/* Codex audit HIGH (Checkpoint C round 8, and its own
                  genuine round-9 re-review: an earlier 6dp ceiling
                  still truncated a real value with more than 6
                  fractional digits) — this label must not silently
                  approximate the real figure the quantity field
                  prefills verbatim (round 7's own fix). 20dp exceeds
                  what a JS `number` can even accurately represent
                  (~15-17 significant decimal digits total), so every
                  digit a real value can genuinely carry is shown —
                  still via the same established `formatNumber` display
                  convention (trailing zeros drop naturally) rather than
                  a raw, inconsistent `String(...)`. */}
              {o.product} — estimated {formatNumber(o.remainingRequirementKg, 20)} kg remaining
            </option>
          ))}
          <option value={MANUAL_OPTION}>Something else (enter manually)</option>
        </select>
        {selectedEstimate ? (
          <p className="text-xs text-fr-ink-600">
            Estimated from your farm&rsquo;s fertiliser plan{selectedEstimate.mayUnderstate ? " — this figure may understate your real need (some evidence is incomplete)." : "."}{" "}
            Adjust the quantity below to what you actually want quoted.
          </p>
        ) : null}
        {selectedOption === MANUAL_OPTION ? (
          <input
            aria-label="Product name"
            className={inputClass}
            placeholder="e.g. Protected Urea"
            value={manualProduct}
            onChange={(e) => setManualProduct(e.target.value)}
          />
        ) : null}
      </div>

      <div className="flex gap-2">
        <input
          aria-label="Quantity"
          className={inputClass}
          type="number"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <select aria-label="Unit" className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as "kg" | "tonnes" | "bags")}>
          <option value="kg">kg</option>
          <option value="tonnes">tonnes</option>
          <option value="bags">bags</option>
        </select>
      </div>
      <input
        aria-label="Packaging (optional)"
        className={inputClass}
        placeholder="Packaging (optional, e.g. 25kg bags)"
        value={packaging}
        onChange={(e) => setPackaging(e.target.value)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-label uppercase tracking-wide text-fr-ink-600">Preferred delivery window</p>
        <div className="flex gap-2">
          <input aria-label="Delivery window start" className={inputClass} type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          <input aria-label="Delivery window end" className={inputClass} type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-label uppercase tracking-wide text-fr-ink-600">Delivery details</p>
        <input aria-label="Contact name" className={inputClass} placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <div className="flex gap-2">
          <input aria-label="Contact phone (optional)" className={inputClass} placeholder="Phone (optional)" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <input aria-label="Contact email (optional)" className={inputClass} placeholder="Email (optional)" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <input aria-label="Address line 1" className={inputClass} placeholder="Address line 1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        <input aria-label="Address line 2 (optional)" className={inputClass} placeholder="Address line 2 (optional)" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        <div className="flex gap-2">
          <input aria-label="Town or city" className={inputClass} placeholder="Town/city" value={townOrCity} onChange={(e) => setTownOrCity(e.target.value)} />
          <input aria-label="County" className={inputClass} placeholder="County" value={county} onChange={(e) => setCounty(e.target.value)} />
          <input aria-label="Eircode (optional)" className={inputClass} placeholder="Eircode (optional)" value={eircode} onChange={(e) => setEircode(e.target.value)} />
        </div>
        <p className="text-xs text-fr-ink-600">This delivery information is shared with the supplier(s) Farm Return contacts for this request.</p>
      </div>

      <div className="rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
        <label className="flex items-start gap-2 text-sm text-fr-ink-900">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={disclosureAccepted}
            onChange={(e) => {
              setDisclosureAccepted(e.target.checked);
              setDisclosureAcceptedAt(e.target.checked ? new Date().toISOString() : null);
            }}
          />
          <span>{DISCLOSURE_TEXT}</span>
        </label>
      </div>

      {state.status === "error" ? (
        <div role="alert" className="rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">
          {state.message}
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit || state.status === "submitting"}
        onClick={handleSubmit}
        className="rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {state.status === "submitting" ? "Submitting…" : "Submit request"}
      </button>
    </div>
  );
}
