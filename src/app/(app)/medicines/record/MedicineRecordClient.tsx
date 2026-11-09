"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Minus, Pill, Plus, ScanBarcode, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  getMedicineFormDefaultsAction,
  resolveMedicineScanAction,
  saveMedicinePurchaseAction,
  searchMedicineProductsAction,
  type MedicineFormDefaults,
  type MedicineProductChoice,
  type MedicineScanResult,
} from "@/app/actions/medicines";
import type { MedicinePackScan } from "@/lib/medicines/gs1";

const NEW = "__new__";
const localToday = () => new Date().toLocaleDateString("en-CA");
const prettyDate = (iso: string) => new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));

const inputClass = "w-full rounded-xl border border-fr-v2-cream-rule bg-white px-3.5 py-3 text-base text-fr-ink-900 outline-none focus:border-fr-green-700 focus:ring-2 focus:ring-fr-green-700/15";
const labelClass = "mb-1.5 flex items-center justify-between text-sm font-semibold text-fr-ink-900";

function FromScan() {
  return <span className="rounded-full bg-fr-green-700/10 px-2 py-0.5 text-[11px] font-semibold text-fr-green-700">From scan</span>;
}

export function MedicineRecordClient({ initialCode }: { initialCode: string }) {
  const [resolved, setResolved] = useState<MedicineScanResult | null>(null);
  const [loading, setLoading] = useState(Boolean(initialCode));
  const [defaults, setDefaults] = useState<MedicineFormDefaults>({ suppliers: [], vets: [] });

  const [product, setProduct] = useState<MedicineProductChoice | null>(null);
  const [productFromLink, setProductFromLink] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicineProductChoice[]>([]);
  const [searching, setSearching] = useState(false);

  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [dateReceived, setDateReceived] = useState(localToday);
  const [supplierChoice, setSupplierChoice] = useState<string>(NEW);
  const [supplierName, setSupplierName] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [vetChoice, setVetChoice] = useState<string>(NEW);
  const [vetName, setVetName] = useState("");
  const [prescriptionId, setPrescriptionId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const scan: MedicinePackScan | null = resolved?.status === "ok" ? resolved.scan : null;

  useEffect(() => {
    let live = true;
    void getMedicineFormDefaultsAction().then((d) => {
      if (!live) return;
      setDefaults(d);
      if (d.suppliers[0]) {
        setSupplierChoice(d.suppliers[0].name);
        setSupplierName(d.suppliers[0].name);
        setSupplierAddress(d.suppliers[0].address);
      }
      if (d.vets[0]) {
        setVetChoice(d.vets[0]);
        setVetName(d.vets[0]);
      }
    });
    if (initialCode) {
      void resolveMedicineScanAction(initialCode).then((r) => {
        if (!live) return;
        setResolved(r);
        setLoading(false);
        if (r.status === "ok") {
          setBatch(r.scan.batch ?? "");
          setExpiry(r.scan.expiry ?? "");
          if (r.product) {
            setProduct(r.product);
            setProductFromLink(true);
          }
        }
      });
    }
    return () => { live = false; };
  }, [initialCode]);

  // Debounced HPRA search.
  const searchSeq = useRef(0);
  useEffect(() => {
    if (product) return;
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchMedicineProductsAction(q).then((found) => {
        if (seq !== searchSeq.current) return;
        setResults(found);
        setSearching(false);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, product]);

  const supplierIsNew = supplierChoice === NEW;
  const vetIsNew = vetChoice === NEW;
  const needsVet = Boolean(product?.prescription);

  const missing = useMemo(() => {
    const items: string[] = [];
    if (!product) items.push("medicine");
    if (!supplierName.trim()) items.push("supplier");
    if (!supplierAddress.trim()) items.push("supplier address");
    if (needsVet && !vetName.trim()) items.push("vet");
    return items;
  }, [product, supplierName, supplierAddress, needsVet, vetName]);

  function chooseSupplier(value: string) {
    setSupplierChoice(value);
    if (value === NEW) { setSupplierName(""); setSupplierAddress(""); return; }
    const s = defaults.suppliers.find((x) => x.name === value);
    setSupplierName(s?.name ?? "");
    setSupplierAddress(s?.address ?? "");
  }

  function chooseVet(value: string) {
    setVetChoice(value);
    setVetName(value === NEW ? "" : value);
  }

  async function save() {
    if (!product || saving) return;
    setSaving(true);
    setError("");
    const result = await saveMedicinePurchaseAction({
      gtin: scan?.gtin ?? null,
      hpraLicenceNumber: product.licenceNumber,
      batchNumber: batch,
      expiryDate: expiry,
      quantity,
      dateReceived,
      supplierName,
      supplierAddress,
      vetName: needsVet ? vetName : "",
      prescriptionId: needsVet ? prescriptionId : "",
      captureSource: scan ? scan.source : "manual",
    });
    setSaving(false);
    if (result.ok) setSaved(true);
    else setError(result.error);
  }

  if (saved && product) {
    return (
      <div className="mx-auto max-w-xl space-y-5 pb-10 text-fr-v2-graphite">
        <div className="space-y-3 rounded-2xl border border-fr-green-700/30 bg-fr-v2-cream p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-fr-green-700" aria-hidden />
          <h1 className="font-display text-[26px] leading-tight">Medicine purchase saved</h1>
          <p className="text-sm text-fr-ink-600">
            {quantity} × {product.name}{batch ? ` · batch ${batch}` : ""} from {supplierName}, received {prettyDate(dateReceived)}.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/smart-camera" className="flex items-center justify-center gap-2 rounded-xl bg-fr-green-700 px-4 py-3.5 font-semibold text-white"><ScanBarcode className="size-5" aria-hidden />Scan another</Link>
          <Link href="/medicines" className="flex items-center justify-center gap-2 rounded-xl border border-fr-v2-cream-rule bg-fr-v2-cream px-4 py-3.5 font-semibold text-fr-green-700"><Pill className="size-5" aria-hidden />View medicines</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-28 text-fr-v2-graphite">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2 text-fr-green-700"><Pill className="size-5" aria-hidden /><span className="text-sm font-semibold">Animal remedies record</span></div>
        <h1 className="font-display text-[30px] font-normal leading-tight">Record a medicine purchase</h1>
        <p className="text-sm text-fr-ink-600">Check the details below and save. Anything read from the pack is already filled in.</p>
      </header>

      {loading ? <p className="text-sm text-fr-ink-600" role="status">Reading the scan…</p> : null}
      {resolved?.status === "invalid" ? (
        <p role="alert" className="flex gap-2 rounded-xl bg-fr-surface-alt p-3 text-sm text-fr-ink-600"><AlertCircle className="size-4 shrink-0" aria-hidden />That code isn&apos;t a readable medicine barcode. You can still record the purchase by choosing the medicine below.</p>
      ) : null}
      {resolved?.status === "not_signed_in" ? (
        <p role="alert" className="flex gap-2 rounded-xl bg-fr-surface-alt p-3 text-sm text-fr-ink-600"><AlertCircle className="size-4 shrink-0" aria-hidden />Sign in to record medicine purchases.</p>
      ) : null}

      {/* Medicine */}
      <section className="space-y-3 rounded-2xl border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
        <p className={labelClass}>Medicine {productFromLink ? <span className="rounded-full bg-fr-green-700/10 px-2 py-0.5 text-[11px] font-semibold text-fr-green-700">Recognised</span> : null}</p>
        {product ? (
          <div className="space-y-2 rounded-xl border border-fr-green-700/25 bg-white p-3.5">
            <p className="font-semibold leading-snug text-fr-ink-900">{product.name}</p>
            <p className="text-xs text-fr-ink-600">{product.holder} · {product.licenceNumber}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className={cn("rounded-full px-2 py-0.5", product.prescription ? "bg-[#C0362C]/10 text-[#9A2B23]" : "bg-fr-surface-alt text-fr-ink-600")}>{product.legalStatus || "Legal status not listed"}</span>
              {product.species.slice(0, 3).map((s) => <span key={s} className="rounded-full bg-fr-surface-alt px-2 py-0.5 text-fr-ink-600">{s}</span>)}
            </div>
            {productFromLink ? <p className="text-xs text-fr-ink-600">This barcode was linked to this HPRA product before. Check it matches the box.</p> : null}
            <button type="button" onClick={() => { setProduct(null); setProductFromLink(false); setQuery(""); }} className="text-sm font-semibold text-fr-green-700 underline underline-offset-2">
              {productFromLink ? "Not this medicine?" : "Change"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {scan ? <p className="text-xs text-fr-ink-600">First time this barcode has been seen. Pick the medicine once; next time it&apos;s recognised automatically, for you and other Farm Return farmers.</p> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fr-ink-600" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type the name on the box, e.g. Ivomec"
                aria-label="Search authorised medicines"
                autoComplete="off"
                className={cn(inputClass, "pl-10")}
              />
            </div>
            {searching ? <p className="text-xs text-fr-ink-600">Searching the HPRA list…</p> : null}
            {results.length && query.trim().length >= 2 ? (
              <ul className="max-h-80 divide-y divide-fr-v2-cream-rule overflow-y-auto rounded-xl border border-fr-v2-cream-rule bg-white" role="listbox" aria-label="Matching medicines">
                {results.map((r) => (
                  <li key={r.licenceNumber}>
                    <button type="button" role="option" aria-selected={false} onClick={() => { setProduct(r); setResults([]); }} className="w-full px-3.5 py-3 text-left hover:bg-fr-surface-alt">
                      <span className="block text-sm font-semibold leading-snug text-fr-ink-900">{r.name}</span>
                      <span className="block text-xs text-fr-ink-600">{r.holder} · {r.legalStatus || "—"}{r.species.length ? ` · ${r.species.slice(0, 3).join(", ")}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim().length >= 2 && !searching ? (
              <p className="text-xs text-fr-ink-600">No authorised medicine matches “{query.trim()}”. Try the brand name or the active substance.</p>
            ) : null}
          </div>
        )}
      </section>

      {/* Pack */}
      <section className="grid grid-cols-2 gap-3 rounded-2xl border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="med-batch" className={labelClass}>Batch number {scan?.batch ? <FromScan /> : null}</label>
          <input id="med-batch" value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={40} className={inputClass} placeholder="On the box" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="med-expiry" className={labelClass}>Expiry {scan?.expiry ? <FromScan /> : null}</label>
          <input id="med-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} />
        </div>
        <div>
          <p className={labelClass}>Packs</p>
          <div className="flex items-center rounded-xl border border-fr-v2-cream-rule bg-white">
            <button type="button" aria-label="One fewer pack" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="grid size-12 place-items-center text-fr-green-700 disabled:opacity-40" disabled={quantity <= 1}><Minus className="size-4" /></button>
            <span className="flex-1 text-center text-lg font-semibold tabular-nums" aria-live="polite">{quantity}</span>
            <button type="button" aria-label="One more pack" onClick={() => setQuantity((q) => Math.min(10000, q + 1))} className="grid size-12 place-items-center text-fr-green-700"><Plus className="size-4" /></button>
          </div>
        </div>
        <div>
          <label htmlFor="med-date" className={labelClass}>Received</label>
          <input id="med-date" type="date" value={dateReceived} max={localToday()} onChange={(e) => setDateReceived(e.target.value)} className={inputClass} />
        </div>
      </section>

      {/* Supplier */}
      <section className="space-y-3 rounded-2xl border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
        <div>
          <label htmlFor="med-supplier" className={labelClass}>Supplier</label>
          {defaults.suppliers.length ? (
            <select id="med-supplier" value={supplierChoice} onChange={(e) => chooseSupplier(e.target.value)} className={inputClass}>
              {defaults.suppliers.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              <option value={NEW}>+ New supplier</option>
            </select>
          ) : null}
        </div>
        {supplierIsNew ? (
          <input aria-label="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name, e.g. your co-op, vet or pharmacy" maxLength={200} className={inputClass} />
        ) : null}
        <div>
          <label htmlFor="med-address" className="mb-1.5 block text-xs font-semibold text-fr-ink-600">Supplier address {supplierIsNew ? "(saved for next time)" : ""}</label>
          <textarea id="med-address" value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} rows={2} maxLength={400} className={inputClass} placeholder="Required on the animal remedies record" />
        </div>
      </section>

      {/* Prescription */}
      {needsVet ? (
        <section className="space-y-3 rounded-2xl border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
          <div>
            <label htmlFor="med-vet" className={labelClass}>Prescribing vet</label>
            {defaults.vets.length ? (
              <select id="med-vet" value={vetChoice} onChange={(e) => chooseVet(e.target.value)} className={inputClass}>
                {defaults.vets.map((v) => <option key={v} value={v}>{v}</option>)}
                <option value={NEW}>+ New vet</option>
              </select>
            ) : null}
          </div>
          {vetIsNew ? <input aria-label="Vet name" value={vetName} onChange={(e) => setVetName(e.target.value)} placeholder="Vet or practice name" maxLength={200} className={inputClass} /> : null}
          <div>
            <label htmlFor="med-rx" className="mb-1.5 block text-xs font-semibold text-fr-ink-600">Prescription ID (optional, from the NVPS text or email)</label>
            <input id="med-rx" value={prescriptionId} onChange={(e) => setPrescriptionId(e.target.value)} maxLength={80} className={inputClass} />
          </div>
        </section>
      ) : null}

      {error ? <p role="alert" className="flex gap-2 rounded-xl bg-[#C0362C]/10 p-3 text-sm text-[#9A2B23]"><AlertCircle className="size-4 shrink-0" aria-hidden />{error}</p> : null}

      <p className="flex items-start gap-2 text-xs text-fr-ink-600"><ShieldCheck className="size-4 shrink-0" aria-hidden />Saved to your farm&apos;s animal remedies record. Only the barcode-to-medicine link is shared with other farmers, never your purchases.</p>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 px-4 lg:static lg:px-0">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={() => void save()} disabled={saving || missing.length > 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-fr-green-700 px-4 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] disabled:opacity-50">
            {saving ? "Saving…" : missing.length ? `Add ${missing.join(", ")}` : <><CheckCircle2 className="size-5" aria-hidden />Save purchase</>}
          </button>
        </div>
      </div>
      {!initialCode ? (
        <Link href="/smart-camera" className="flex items-center justify-center gap-2 text-sm font-semibold text-fr-green-700"><ScanBarcode className="size-4" aria-hidden />Scan the pack instead</Link>
      ) : null}
      <Link href="/medicines" className="flex items-center justify-center gap-1 text-sm text-fr-ink-600"><X className="size-4" aria-hidden />Cancel</Link>
    </div>
  );
}
