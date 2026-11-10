"use client";

/**
 * Records phase 2 entry: evidence photos (resized on the phone, read when
 * reading is switched on), medicine treatments with withdrawal dates, and
 * animal health and deaths.
 */
import { useState, type ReactNode } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { DOSE_UNITS, HEALTH_KINDS, HEALTH_KIND_LABEL, withdrawalEndsOn, type DoseUnit, type HealthKind } from "@/domain/farm-records";
import { saveHealthEventAction, saveTreatmentAction } from "@/app/actions/farm-records";
import { uploadRecordPhotoAction } from "@/app/actions/record-evidence";

export const inputClass = "mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-cream-rule bg-white px-3 text-base text-fr-ink-900";
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export function RecordSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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

/** Shrinks a phone photo to at most 1600px on its long side as JPEG. */
async function resizePhoto(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.75));
}

export function PhotoCapture({ kind, label, onDone }: {
  kind: "feed" | "spray" | "health"; label: string;
  onDone: (path: string, fields: Record<string, string> | null) => void;
}) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [note, setNote] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setState("working"); setNote("");
    try {
      const blob = await resizePhoto(file).catch(() => file);
      const form = new FormData();
      form.set("kind", kind);
      form.set("photo", blob, "photo.jpg");
      const r = await uploadRecordPhotoAction(form);
      if (!r.ok) { setState("idle"); setNote(r.error); return; }
      const read = r.reading.status === "read" ? r.reading.fields : null;
      onDone(r.path, read && Object.keys(read).length ? read : null);
      setState("done");
      setNote(read && Object.keys(read).length ? "Filled in from the photo. Check each field before saving."
        : r.reading.status === "read" || r.reading.status === "failed" ? "Photo saved. It couldn't be read clearly, so fill in the details."
          : "Photo saved with the record.");
    } catch {
      setState("idle"); setNote("Couldn't use that photo. Try again.");
    }
  }

  return (
    <div>
      <label className={cn("flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-dashed text-sm font-semibold",
        state === "done" ? "border-fr-v2-forest text-fr-v2-forest" : "border-fr-ink-400 text-fr-ink-900")}>
        {state === "working" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : state === "done" ? <Check className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
        {state === "working" ? "Saving photo…" : state === "done" ? "Photo saved · take another" : label}
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={state === "working"} onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {note ? <p className="mt-1 text-xs text-fr-ink-600" role="status">{note}</p> : null}
    </div>
  );
}

export interface MedicineChoice { id: string; productName: string; batchNumber: string | null; vetName: string | null }

export function TreatmentSheet({ today, groups, medicines, onClose, onSaved }: {
  today: string; groups: Array<{ id: string; name: string }>; medicines: MedicineChoice[]; onClose: () => void; onSaved: () => void;
}) {
  const [purchaseId, setPurchaseId] = useState(medicines[0]?.id ?? "");
  const [otherName, setOtherName] = useState("");
  const [batchNumber, setBatchNumber] = useState(medicines[0]?.batchNumber ?? "");
  const [treatedOn, setTreatedOn] = useState(today);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [tags, setTags] = useState("");
  const [count, setCount] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState<DoseUnit>("ml");
  const [withdrawal, setWithdrawal] = useState("");
  const [givenBy, setGivenBy] = useState("");
  const [prescribedBy, setPrescribedBy] = useState(medicines[0]?.vetName ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const chosen = medicines.find((m) => m.id === purchaseId);
  const days = withdrawal === "" ? null : Number(withdrawal);

  function pickMedicine(v: string) {
    setPurchaseId(v);
    const m = medicines.find((x) => x.id === v);
    setBatchNumber(m?.batchNumber ?? "");
    if (m?.vetName) setPrescribedBy(m.vetName);
  }

  async function save() {
    setSaving(true); setError("");
    const r = await saveTreatmentAction({
      id, treatedOn, medicinePurchaseId: chosen ? chosen.id : null, productName: chosen ? chosen.productName : otherName,
      batchNumber: batchNumber || null, livestockGroupId: groupId || null, animalTags: tags.trim() || null,
      animalCount: Number(count), dose: Number(dose), doseUnit, withdrawalMeatDays: days ?? Number.NaN,
      administeredBy: givenBy, prescribedBy: prescribedBy || null, reason: reason || null,
    });
    setSaving(false);
    if (r.ok) onSaved(); else setError(r.error);
  }

  return (
    <RecordSheet title="Add treatment" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-fr-ink-900">Medicine
          <select value={purchaseId} onChange={(e) => pickMedicine(e.target.value)} className={inputClass}>
            {medicines.map((m) => <option key={m.id} value={m.id}>{m.productName}{m.batchNumber ? ` · batch ${m.batchNumber}` : ""}</option>)}
            <option value="">Something not in your purchases</option>
          </select>
        </label>
        {!chosen ? <input value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={160} placeholder="Medicine name" aria-label="Medicine name" className={inputClass} /> : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-fr-ink-900">Date given
            <input type="date" value={treatedOn} max={today} onChange={(e) => setTreatedOn(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">Batch
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} maxLength={60} className={inputClass} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-fr-ink-900">Group treated
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="">Individual animals (tags below)</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">Tag numbers {groupId ? "(optional)" : ""}
          <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={2000} placeholder="Last digits are fine, separated by commas" className={inputClass} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs font-semibold text-fr-ink-900">Animals
            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">Dose each
            <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">Unit
            <select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value as DoseUnit)} className={inputClass}>{DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-fr-ink-900">Meat withdrawal (days, from the label)
          <input inputMode="numeric" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value)} placeholder="0 if none" className={inputClass} />
        </label>
        {days !== null && Number.isInteger(days) && days >= 0 ? (
          <p className="text-xs font-semibold text-fr-ink-900">{days === 0 ? "No meat withdrawal." : `Not for slaughter until ${fmt(withdrawalEndsOn(treatedOn, days))}.`}</p>
        ) : null}
        <label className="block text-xs font-semibold text-fr-ink-900">Given by
          <input value={givenBy} onChange={(e) => setGivenBy(e.target.value)} maxLength={80} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">Prescribed by (vet, if prescribed)
          <input value={prescribedBy} onChange={(e) => setPrescribedBy(e.target.value)} maxLength={120} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-fr-ink-900">Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Worms, pneumonia, lameness" className={inputClass} />
        </label>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-fr-risk">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save treatment"}</button>
    </RecordSheet>
  );
}

export function HealthSheet({ today, groups, onClose, onSaved }: {
  today: string; groups: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void;
}) {
  const [kind, setKind] = useState<HealthKind>("illness");
  const [occurredOn, setOccurredOn] = useState(today);
  const [animalTag, setAnimalTag] = useState("");
  const [groupId, setGroupId] = useState("");
  const [count, setCount] = useState("1");
  const [description, setDescription] = useState("");
  const [vetSeen, setVetSeen] = useState(false);
  const [disposal, setDisposal] = useState<"knackery" | "other" | "">("knackery");
  const [disposalRef, setDisposalRef] = useState("");
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());

  async function save() {
    setSaving(true); setError("");
    const r = await saveHealthEventAction({
      id, occurredOn, kind, animalTag: animalTag.trim() || null, livestockGroupId: groupId || null, animalCount: Number(count),
      description, vetSeen, disposal: kind === "death" && disposal ? disposal : null, disposalRef: kind === "death" ? disposalRef || null : null,
      evidencePath: kind === "death" ? evidencePath : null,
    });
    setSaving(false);
    if (r.ok) onSaved(); else setError(r.error);
  }

  return (
    <RecordSheet title="Add health or death" onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-fr-surface-alt p-1 text-[12.5px] font-semibold" role="radiogroup" aria-label="What happened">
        {HEALTH_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={cn("min-h-10 rounded-[9px]", kind === k ? "bg-white text-fr-ink-900 shadow-sm" : "text-fr-ink-600")}>{HEALTH_KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-fr-ink-900">Date
            <input type="date" value={occurredOn} max={today} onChange={(e) => setOccurredOn(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">How many
            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-fr-ink-900">Tag number (optional)
          <input value={animalTag} onChange={(e) => setAnimalTag(e.target.value)} maxLength={40} className={inputClass} />
        </label>
        {groups.length ? (
          <label className="block text-xs font-semibold text-fr-ink-900">Group (optional)
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
              <option value="">Not in a group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block text-xs font-semibold text-fr-ink-900">What happened
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} placeholder={kind === "death" ? "Found dead, suspected cause" : "Signs, and what was done"} className={cn(inputClass, "py-2")} />
        </label>
        <label className="flex items-center gap-2 text-sm text-fr-ink-900"><input type="checkbox" checked={vetSeen} onChange={(e) => setVetSeen(e.target.checked)} className="size-4" />Vet saw the animal</label>
        {kind === "death" ? (
          <>
            <label className="block text-xs font-semibold text-fr-ink-900">Disposal
              <select value={disposal} onChange={(e) => setDisposal(e.target.value as "knackery" | "other" | "")} className={inputClass}>
                <option value="knackery">Knackery</option>
                <option value="other">Other approved route</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-fr-ink-900">Docket or receipt number
              <input value={disposalRef} onChange={(e) => setDisposalRef(e.target.value)} maxLength={80} className={inputClass} />
            </label>
            <PhotoCapture kind="health" label="Photo of the knackery receipt" onDone={(path) => setEvidencePath(path)} />
          </>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-fr-risk">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
    </RecordSheet>
  );
}

export interface WithdrawalLine { id: string; who: string; productName: string; endsOn: string }

export function WithdrawalBanner({ lines }: { lines: WithdrawalLine[] }) {
  if (!lines.length) return null;
  return (
    <section aria-label="In meat withdrawal" className="rounded-[14px] border p-3.5" style={{ borderColor: "#EF9F27", backgroundColor: "#FAEEDA" }}>
      <p className="text-sm font-semibold" style={{ color: "#633806" }}>In meat withdrawal: not for slaughter</p>
      <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "#633806" }}>
        {lines.slice(0, 5).map((l) => <li key={l.id}>{l.who} · {l.productName} · until {fmt(l.endsOn)}</li>)}
        {lines.length > 5 ? <li>and {lines.length - 5} more</li> : null}
      </ul>
    </section>
  );
}
