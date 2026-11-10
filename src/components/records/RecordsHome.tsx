"use client";

/**
 * Records: the farm book. Audit readiness for Bord Bia SBLAS and Nitrates,
 * the record books, a plain-language farm diary, and quick entry for the
 * two books the app can't fill on its own: feed and pesticides.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, CircleDashed, FileText, HeartPulse, Info, Plus, SprayCan, Syringe, Wheat, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CROP_SITUATIONS, FEED_TYPES, FEED_TYPE_LABEL, FEED_UNITS, HOME_GROWN, RATE_UNITS, RATE_UNIT_LABEL, RECORD_BOOKS, RECORD_BOOK_COLOR, RECORD_BOOK_LABEL, SPRAY_REASONS,
  nitratesReadiness, readinessSummary, sblasReadiness,
  type DiaryEntry, type FeedRecord, type FeedType, type FeedUnit, type RateUnit, type ReadinessItem, type RecordBook, type SprayOperator,
} from "@/domain/farm-records";
import { confirmBookNotUsedAction, saveFeedRecordAction, savePesticideJobAction, saveSprayOperatorAction } from "@/app/actions/farm-records";
import { HealthSheet, PhotoCapture, TreatmentSheet, WithdrawalBanner, type MedicineChoice, type WithdrawalLine } from "./RecordSheets";

export interface RecordsHomeProps {
  today: string;
  signedIn: boolean;
  diary: DiaryEntry[];
  dates: Partial<Record<RecordBook, string[]>>;
  notUsed: Partial<Record<RecordBook, string>>;
  unavailable: RecordBook[];
  fields: Array<{ id: string; name: string; areaHa: number }>;
  groups: Array<{ id: string; name: string }>;
  operators: SprayOperator[];
  feed: FeedRecord[];
  /** Medicines bought, for the treatment form. */
  medicines?: MedicineChoice[];
  /** Animals still inside a meat withdrawal period. */
  withdrawals?: WithdrawalLine[];
}

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const inputClass = "mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-cream-rule bg-white px-3 text-base text-fr-ink-900";

export function RecordsHome(props: RecordsHomeProps) {
  const { today, signedIn } = props;
  const router = useRouter();
  const [filter, setFilter] = useState<RecordBook | "all">("all");
  const [sheet, setSheet] = useState<"feed" | "spray" | "treatment" | "health" | null>(null);
  const [notUsed, setNotUsed] = useState(props.notUsed);
  const [shown, setShown] = useState(30);
  const [error, setError] = useState("");

  const sblas = useMemo(() => sblasReadiness({ today, dates: props.dates, notUsed }), [today, props.dates, notUsed]);
  const nitrates = useMemo(() => nitratesReadiness({ today, dates: props.dates, notUsed }), [today, props.dates, notUsed]);
  const diary = props.diary.filter((e) => filter === "all" || e.book === filter);
  const counts = Object.fromEntries(RECORD_BOOKS.map((b) => [b, props.diary.filter((e) => e.book === b).length])) as Record<RecordBook, number>;

  async function confirmNotUsed(book: RecordBook) {
    const r = await confirmBookNotUsedAction(book);
    if (r.ok) setNotUsed((n) => ({ ...n, [book]: r.on }));
    else setError(r.error);
  }

  return (
    <div className="space-y-6">
      {signedIn ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSheet("feed")} className="flex min-h-12 items-center justify-center gap-2 rounded-[12px] bg-fr-green-700 text-sm font-semibold text-white"><Wheat className="size-4" aria-hidden />Add feed</button>
          <button type="button" onClick={() => setSheet("spray")} className="flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-ink-900"><SprayCan className="size-4" aria-hidden />Add spray</button>
          <button type="button" onClick={() => setSheet("treatment")} className="flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-ink-900"><Syringe className="size-4" aria-hidden />Add treatment</button>
          <button type="button" onClick={() => setSheet("health")} className="flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-ink-900"><HeartPulse className="size-4" aria-hidden />Health or death</button>
        </div>
      ) : <p className="text-sm text-fr-ink-600">Sign in to keep your farm records here.</p>}
      {error ? <p role="alert" className="text-sm text-fr-risk">{error}</p> : null}
      <WithdrawalBanner lines={props.withdrawals ?? []} />

      <section aria-label="Audit readiness" className="space-y-2">
        <Readiness title="Bord Bia SBLAS" period={`Last 6 months, from ${fmt(sblas.from)}`} items={sblas.items} pack="sblas" signedIn={signedIn} onConfirm={confirmNotUsed} unavailable={props.unavailable} />
        <Readiness title="Nitrates" period={`${today.slice(0, 4)} so far`} items={nitrates.items} pack="nitrates" signedIn={signedIn} onConfirm={confirmNotUsed} unavailable={props.unavailable} />
      </section>

      <section aria-labelledby="fr-diary">
        <h2 id="fr-diary" className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">Farm diary</h2>
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Record book">
          {(["all", ...RECORD_BOOKS] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={filter === b} onClick={() => { setFilter(b); setShown(30); }}
              className={cn("min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold", filter === b ? "border-fr-v2-forest bg-fr-v2-forest text-white" : "border-fr-v2-cream-rule bg-white text-fr-ink-600")}>
              {b === "all" ? "All" : `${RECORD_BOOK_LABEL[b]}${counts[b] ? ` · ${counts[b]}` : ""}`}
            </button>
          ))}
        </div>
        {diary.length ? (
          <ul className="divide-y divide-fr-v2-cream-rule rounded-[14px] border border-fr-v2-cream-rule bg-white">
            {diary.slice(0, shown).map((e) => {
              const body = (
                <>
                  <span className="block text-sm font-semibold text-fr-ink-900">{e.title}</span>
                  <span className="block text-xs text-fr-ink-600">{fmt(e.date)} · {RECORD_BOOK_LABEL[e.book]}{e.detail ? ` · ${e.detail}` : ""}</span>
                </>
              );
              return (
                <li key={e.id} className="flex gap-3 px-3.5 py-2.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: RECORD_BOOK_COLOR[e.book] }} aria-hidden />
                  {e.href ? <Link href={e.href} className="min-w-0 flex-1">{body}</Link> : <div className="min-w-0 flex-1">{body}</div>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[12px] border border-dashed border-fr-v2-cream-rule p-4 text-center text-sm text-fr-ink-600">
            {filter === "all" ? "Nothing recorded yet. Medicines, treatments, cattle moves, feed, sprays, spreading, grass walks, health and finished jobs appear here as you record them." : `No ${RECORD_BOOK_LABEL[filter].toLowerCase()} records yet.`}
          </p>
        )}
        {diary.length > shown ? (
          <button type="button" onClick={() => setShown((n) => n + 30)} className="mt-1 min-h-10 w-full text-sm font-semibold text-fr-green-700">Show more ({diary.length - shown} left)</button>
        ) : null}
      </section>

      <Link href="/settings/advice-history" className="block text-center text-xs font-semibold text-fr-ink-600">Advice history has moved to Settings</Link>

      {sheet === "feed" ? <FeedSheet today={today} groups={props.groups} feed={props.feed} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh(); }} /> : null}
      {sheet === "spray" ? <SpraySheet today={today} fields={props.fields} operators={props.operators} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh(); }} /> : null}
      {sheet === "treatment" ? <TreatmentSheet today={today} groups={props.groups} medicines={props.medicines ?? []} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh(); }} /> : null}
      {sheet === "health" ? <HealthSheet today={today} groups={props.groups} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh(); }} /> : null}
    </div>
  );
}

const STATUS_ICON: Record<ReadinessItem["status"], { icon: typeof CheckCircle2; tone: string }> = {
  complete: { icon: CheckCircle2, tone: "text-fr-v2-forest" },
  not_used: { icon: CheckCircle2, tone: "text-fr-v2-forest" },
  gap: { icon: CircleDashed, tone: "text-fr-risk" },
  outside_app: { icon: Info, tone: "text-fr-ink-400" },
  not_tracked: { icon: Info, tone: "text-fr-ink-400" },
};

function Readiness({ title, period, items, pack, signedIn, onConfirm, unavailable }: {
  title: string; period: string; items: ReadinessItem[]; pack: "sblas" | "nitrates"; signedIn: boolean;
  onConfirm: (b: RecordBook) => void; unavailable: RecordBook[];
}) {
  const gaps = items.filter((i) => i.status === "gap").length;
  return (
    <details className="group rounded-[14px] border border-fr-v2-cream-rule bg-white" open={gaps > 0}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3.5 py-3">
        {gaps ? <CircleDashed className="size-5 shrink-0 text-fr-risk" aria-hidden /> : <CheckCircle2 className="size-5 shrink-0 text-fr-v2-forest" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fr-ink-900">{title}</span>
          <span className="block text-xs text-fr-ink-600">{readinessSummary(items)} · {period}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fr-ink-600 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-fr-v2-cream-rule px-3.5 pb-3.5 pt-1">
        <ul className="divide-y divide-fr-v2-cream-rule">
          {items.map((i) => {
            const s = STATUS_ICON[i.status];
            const down = i.book && unavailable.includes(i.book);
            return (
              <li key={i.key} className="flex gap-2.5 py-2.5">
                <s.icon className={cn("mt-0.5 size-4 shrink-0", s.tone)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fr-ink-900">{i.label}</p>
                  <p className="text-xs text-fr-ink-600">{down ? "Couldn't load this book just now." : i.detail}</p>
                  {signedIn && i.canConfirmNotUsed && i.book && !down ? (
                    <button type="button" onClick={() => onConfirm(i.book!)} className="mt-1 min-h-9 text-xs font-semibold text-fr-green-700">None used in this period</button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <Link href={`/records/audit-pack?pack=${pack}`} className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-fr-v2-cream-rule text-sm font-semibold text-fr-ink-900">
          <FileText className="size-4" aria-hidden />Open {title} audit pack
        </Link>
      </div>
    </details>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-fr-v2-cream p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-[20px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[24px] leading-none">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FeedSheet({ today, groups, feed, onClose, onSaved }: { today: string; groups: RecordsHomeProps["groups"]; feed: FeedRecord[]; onClose: () => void; onSaved: () => void }) {
  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of feed) if (!f.homeGrown && !m.has(f.supplierName)) m.set(f.supplierName, f.supplierAddress ?? "");
    return m;
  }, [feed]);
  const products = useMemo(() => [...new Set(feed.map((f) => f.product))], [feed]);
  const [homeGrown, setHomeGrown] = useState(false);
  const [receivedOn, setReceivedOn] = useState(today);
  const [supplierName, setSupplierName] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [product, setProduct] = useState("");
  const [feedType, setFeedType] = useState<FeedType>("concentrate");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<FeedUnit>("tonnes");
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const [evidencePath, setEvidencePath] = useState<string | null>(null);

  function fillFromDocket(path: string, f: Record<string, string> | null) {
    setEvidencePath(path);
    if (!f) return;
    if (f.receivedOn && receivedOn === today && /^\d{4}-\d{2}-\d{2}$/.test(f.receivedOn) && f.receivedOn <= today) setReceivedOn(f.receivedOn);
    if (f.supplierName && !supplierName) setSupplierName(f.supplierName);
    if (f.supplierAddress && !supplierAddress) setSupplierAddress(f.supplierAddress);
    if (f.product && !product) setProduct(f.product);
    if (f.batchNumber && !batchNumber) setBatchNumber(f.batchNumber);
    if (f.quantity && !quantity && Number.isFinite(Number(f.quantity))) setQuantity(f.quantity);
    if (f.unit && (FEED_UNITS as readonly string[]).includes(f.unit)) setUnit(f.unit as FeedUnit);
  }

  function pickProduct(v: string) {
    setProduct(v);
    const prev = feed.find((f) => f.product === v);
    if (prev) { setFeedType(prev.feedType); setUnit(prev.unit); }
  }

  async function save() {
    setSaving(true); setError("");
    const r = await saveFeedRecordAction({
      id, receivedOn, homeGrown,
      supplierName: homeGrown ? HOME_GROWN : supplierName, supplierAddress: homeGrown ? null : supplierAddress || null,
      product, feedType, batchNumber: batchNumber || null, quantity: Number(quantity), unit, livestockGroupId: groupId || null, notes: null,
      evidencePath: homeGrown ? null : evidencePath,
    });
    setSaving(false);
    if (r.ok) onSaved(); else setError(r.error);
  }

  return (
    <Sheet title="Add feed" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-fr-surface-alt p-1 text-[13px] font-semibold" role="radiogroup" aria-label="Where it came from">
        {([false, true] as const).map((h) => (
          <button key={String(h)} type="button" role="radio" aria-checked={homeGrown === h} onClick={() => { setHomeGrown(h); if (h) setFeedType("forage"); }}
            className={cn("min-h-10 rounded-[9px]", homeGrown === h ? "bg-white text-fr-ink-900 shadow-sm" : "text-fr-ink-600")}>{h ? "Grown on this farm" : "Bought in"}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {!homeGrown ? <PhotoCapture kind="feed" label="Photo of the docket" onDone={fillFromDocket} /> : null}
        <label className="block text-xs font-semibold text-fr-ink-900">{homeGrown ? "Date fed or made" : "Date it arrived"}
          <input type="date" value={receivedOn} max={today} onChange={(e) => setReceivedOn(e.target.value)} className={inputClass} />
        </label>
        {!homeGrown ? (
          <>
            <label className="block text-xs font-semibold text-fr-ink-900">Supplier
              <input value={supplierName} list="fr-feed-suppliers" maxLength={120} placeholder="Merchant or co-op" className={inputClass}
                onChange={(e) => { setSupplierName(e.target.value); const a = suppliers.get(e.target.value); if (a) setSupplierAddress(a); }} />
              <datalist id="fr-feed-suppliers">{[...suppliers.keys()].map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label className="block text-xs font-semibold text-fr-ink-900">Supplier address
              <input value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} maxLength={300} placeholder="Town and county" className={inputClass} />
            </label>
          </>
        ) : null}
        <label className="block text-xs font-semibold text-fr-ink-900">Feed
          <input value={product} list="fr-feed-products" onChange={(e) => pickProduct(e.target.value)} maxLength={120} placeholder={homeGrown ? "Silage, barley, hay" : "16% beef nut"} className={inputClass} />
          <datalist id="fr-feed-products">{products.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">Type
          <select value={feedType} onChange={(e) => setFeedType(e.target.value as FeedType)} className={inputClass}>
            {FEED_TYPES.map((t) => <option key={t} value={t}>{FEED_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-fr-ink-900">Quantity
            <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">Unit
            <select value={unit} onChange={(e) => setUnit(e.target.value as FeedUnit)} className={inputClass}>
              {FEED_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>
        {!homeGrown ? (
          <label className="block text-xs font-semibold text-fr-ink-900">Batch or lot number (from the docket)
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} maxLength={60} className={inputClass} />
          </label>
        ) : null}
        {groups.length ? (
          <label className="block text-xs font-semibold text-fr-ink-900">For which group (optional)
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
              <option value="">Whole farm</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        ) : null}
        {!homeGrown ? <p className="text-xs text-fr-ink-600">Keep the paper docket as well. The photo is kept with this record and printed in your audit pack.</p> : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-fr-risk">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save feed record"}</button>
    </Sheet>
  );
}

function SpraySheet({ today, fields, operators: initialOperators, onClose, onSaved }: {
  today: string; fields: RecordsHomeProps["fields"]; operators: SprayOperator[]; onClose: () => void; onSaved: () => void;
}) {
  const [operators, setOperators] = useState(initialOperators);
  const [appliedOn, setAppliedOn] = useState(today);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [cropSituation, setCropSituation] = useState<string>(CROP_SITUATIONS[0]);
  const [productName, setProductName] = useState("");
  const [pcsNumber, setPcsNumber] = useState("");
  const [rate, setRate] = useState("");
  const [rateUnit, setRateUnit] = useState<RateUnit>("l_ha");
  const [water, setWater] = useState("");
  const [reason, setReason] = useState<string>(SPRAY_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [operatorId, setOperatorId] = useState(initialOperators[0]?.id ?? "");
  const [addingOperator, setAddingOperator] = useState(initialOperators.length === 0);
  const [op, setOp] = useState({ name: "", puNumber: "", isContractor: false, address: "", sprayerCert: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [jobId] = useState(() => crypto.randomUUID());
  const [evidencePath, setEvidencePath] = useState<string | null>(null);

  function fillFromLabel(path: string, f: Record<string, string> | null) {
    setEvidencePath(path);
    if (f?.productName && !productName) setProductName(f.productName);
    if (f?.pcsNumber && !pcsNumber) setPcsNumber(f.pcsNumber);
  }

  function toggle(f: { id: string; areaHa: number }) {
    setPicked((p) => {
      const next = { ...p };
      if (next[f.id] !== undefined) delete next[f.id]; else next[f.id] = f.areaHa ? String(Math.round(f.areaHa * 100) / 100) : "";
      return next;
    });
  }

  async function saveOperator(): Promise<string | null> {
    const r = await saveSprayOperatorAction({ id: crypto.randomUUID(), name: op.name, puNumber: op.puNumber, isContractor: op.isContractor, address: op.address || null, sprayerCert: op.sprayerCert || null });
    if (!r.ok) { setError(r.error); return null; }
    setOperators((o) => [...o, r.operator]);
    setOperatorId(r.operator.id);
    setAddingOperator(false);
    return r.operator.id;
  }

  async function save() {
    setSaving(true); setError("");
    const who = addingOperator ? await saveOperator() : operatorId;
    if (!who) { setSaving(false); if (!addingOperator) setError("Choose who sprayed it."); return; }
    const r = await savePesticideJobAction({
      sprayJobId: jobId, appliedOn, fields: Object.entries(picked).map(([fieldId, a]) => ({ fieldId, areaHa: Number(a) })),
      cropSituation, productName, pcsNumber: pcsNumber.trim(), rate: Number(rate), rateUnit, waterLHa: water ? Number(water) : null,
      reason: reason === "Other" ? otherReason : reason, operatorId: who, evidencePath,
    });
    setSaving(false);
    if (r.ok) onSaved(); else setError(r.error);
  }

  return (
    <Sheet title="Add spray" onClose={onClose}>
      <div className="space-y-3">
        <PhotoCapture kind="spray" label="Photo of the product label" onDone={fillFromLabel} />
        <label className="block text-xs font-semibold text-fr-ink-900">Date sprayed
          <input type="date" value={appliedOn} max={today} onChange={(e) => setAppliedOn(e.target.value)} className={inputClass} />
        </label>
        <div>
          <p className="text-xs font-semibold text-fr-ink-900">Fields</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fields.map((f) => {
              const on = picked[f.id] !== undefined;
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => toggle(f)}
                  className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold", on ? "border-fr-green-700 bg-fr-green-700 text-white" : "border-fr-v2-cream-rule bg-white text-fr-ink-600")}>{f.name}</button>
              );
            })}
          </div>
          {Object.keys(picked).length ? (
            <div className="mt-2 space-y-1.5">
              {fields.filter((f) => picked[f.id] !== undefined).map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-xs text-fr-ink-900">
                  <span className="min-w-0 flex-1 truncate">{f.name}: area sprayed (ha)</span>
                  <input inputMode="decimal" value={picked[f.id]} onChange={(e) => setPicked((p) => ({ ...p, [f.id]: e.target.value }))} className="min-h-10 w-24 rounded-[10px] border border-fr-v2-cream-rule bg-white px-2 text-base" />
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <label className="block text-xs font-semibold text-fr-ink-900">Crop or situation
          <select value={cropSituation} onChange={(e) => setCropSituation(e.target.value)} className={inputClass}>{CROP_SITUATIONS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">Product name (as on the container)
          <input value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={120} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">PCS number (from the label)
          <input inputMode="numeric" value={pcsNumber} onChange={(e) => setPcsNumber(e.target.value)} maxLength={6} placeholder="05164" className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-fr-ink-900">Rate
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">Unit
            <select value={rateUnit} onChange={(e) => setRateUnit(e.target.value as RateUnit)} className={inputClass}>{RATE_UNITS.map((u) => <option key={u} value={u}>{RATE_UNIT_LABEL[u]}</option>)}</select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-fr-ink-900">Water (L/ha, optional)
          <input inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>{SPRAY_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        {reason === "Other" ? <input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} maxLength={120} placeholder="What it was for" aria-label="Other reason" className={inputClass} /> : null}
        <div>
          <p className="text-xs font-semibold text-fr-ink-900">Who sprayed</p>
          {!addingOperator ? (
            <div className="mt-1 flex gap-2">
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={cn(inputClass, "mt-0 flex-1")} aria-label="Who sprayed">
                {operators.map((o) => <option key={o.id} value={o.id}>{o.name} · PU {o.puNumber}{o.isContractor ? " · contractor" : ""}</option>)}
              </select>
              <button type="button" onClick={() => setAddingOperator(true)} aria-label="Add a person or contractor" className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-fr-v2-cream-rule bg-white"><Plus className="size-4" /></button>
            </div>
          ) : (
            <div className="mt-1 space-y-2 rounded-[12px] border border-fr-v2-cream-rule bg-white p-3">
              <input value={op.name} onChange={(e) => setOp({ ...op, name: e.target.value })} placeholder="Name" aria-label="Name" className={cn(inputClass, "mt-0")} />
              <input value={op.puNumber} onChange={(e) => setOp({ ...op, puNumber: e.target.value })} placeholder="Professional user (PU) number" aria-label="PU number" className={cn(inputClass, "mt-0")} />
              <label className="flex items-center gap-2 text-xs text-fr-ink-900"><input type="checkbox" checked={op.isContractor} onChange={(e) => setOp({ ...op, isContractor: e.target.checked })} className="size-4" />Contractor</label>
              {op.isContractor ? <input value={op.address} onChange={(e) => setOp({ ...op, address: e.target.value })} placeholder="Contractor's address" aria-label="Contractor's address" className={cn(inputClass, "mt-0")} /> : null}
              <input value={op.sprayerCert} onChange={(e) => setOp({ ...op, sprayerCert: e.target.value })} placeholder="Sprayer test certificate (optional)" aria-label="Sprayer test certificate" className={cn(inputClass, "mt-0")} />
              {operators.length ? <button type="button" onClick={() => setAddingOperator(false)} className="text-xs font-semibold text-fr-ink-600">Use a saved person</button> : null}
            </div>
          )}
        </div>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-fr-risk">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save spray record"}</button>
    </Sheet>
  );
}
