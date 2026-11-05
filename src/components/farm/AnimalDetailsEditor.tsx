"use client";

/**
 * "Edit animal details" on a real animal's record (`/cattle/animals/<id>`): correct the date of birth, sex or breed
 * of an animal that's already recorded — so a fact left out when the animal was added (date of birth is optional on
 * Add animal) is never a dead end. The tag isn't edited here (no tag-change contract). The save goes through
 * `correctRealAnimalDetails` (farm resolved server-side, the animal must be that farm's); the correction is appended
 * and the original values stay in the animal's history. The page is refreshed only after the save persists. It is a
 * form, so it lives with the other farm forms and reaches the animal record as its `editor` slot. The production
 * recommendation links here as `#edit-details` (the control opens on that link).
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctRealAnimalDetails } from "@/app/(app)/cattle/real-actions";
import { BREED_MAX_LENGTH, animalDetailsSavedMessage, type AnimalDetailsEdit } from "@/server/cattle-real/animal-details";

export const EDIT_ANIMAL_DETAILS_ID = "edit-details";

const input = "w-full rounded-[10px] border border-[#d8d3c7] bg-white px-3 py-2.5 text-base text-[#17221c]";
const fieldLabel = "mb-1 block text-xs text-[#5f685f]";

export function AnimalDetailsEditor({ record }: { record: AnimalDetailsEdit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState(record.dateOfBirth ?? "");
  const [sex, setSex] = useState<string>(record.sex ?? "");
  const [breed, setBreed] = useState(record.breed ?? "");

  function start() {
    setDateOfBirth(record.dateOfBirth ?? "");
    setSex(record.sex ?? "");
    setBreed(record.breed ?? "");
    setMessage(null);
    setOpen(true);
  }

  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === `#${EDIT_ANIMAL_DETAILS_ID}`) queueMicrotask(start);
    };
    openOnHash();
    window.addEventListener("hashchange", openOnHash);
    return () => window.removeEventListener("hashchange", openOnHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await correctRealAnimalDetails({
        animalId: record.animalId,
        ...(dateOfBirth !== "" ? { dateOfBirth } : {}),
        ...(sex === "male" || sex === "female" ? { sex } : {}),
        ...(breed.trim() !== "" ? { breed: breed.trim() } : {}),
      });
      if (!result.ok) {
        setMessage({ text: result.message, failed: true });
        return;
      }
      setMessage({ text: animalDetailsSavedMessage(result.changed), failed: false });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section id={EDIT_ANIMAL_DETAILS_ID} aria-label="Edit animal details" className="mx-auto max-w-[1280px] px-4 pt-4 sm:px-6 lg:px-8" data-animal-details-editor={record.animalId}>
      {message ? (
        <p role={message.failed ? "alert" : "status"} className={`mb-2 text-[13px] font-semibold ${message.failed ? "text-[#9b2c2c]" : "text-[#5f685f]"}`}>
          {message.text}
        </p>
      ) : null}
      {open ? (
        <div className="rounded-[14px] border border-[#d8d3c7] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[#5f685f]">Edit animal details</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-[#5f685f]">
              Cancel
            </button>
          </div>
          <p className="mt-1 text-[13px] text-[#5f685f]">Corrects this animal&apos;s record. The earlier values stay in its history as corrected; weights aren&apos;t changed.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={fieldLabel}>Date of birth</span>
              <input type="date" value={dateOfBirth} max={record.today} onChange={(e) => setDateOfBirth(e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Sex</span>
              <select value={sex} onChange={(e) => setSex(e.target.value)} className={input}>
                <option value="">Not recorded</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label className="block">
              <span className={fieldLabel}>Breed</span>
              <input value={breed} maxLength={BREED_MAX_LENGTH} onChange={(e) => setBreed(e.target.value)} placeholder="Not recorded" className={input} />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" disabled={pending} onClick={save} className="min-h-11 rounded-full bg-[#1f4d36] px-5 text-sm font-semibold text-white disabled:opacity-40">
              {pending ? "Saving…" : "Save animal details"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={start} className="inline-flex min-h-11 items-center rounded-full border border-[#d8d3c7] bg-white px-4 text-sm font-semibold text-[#1f4d36]">
          Edit animal details
        </button>
      )}
    </section>
  );
}
