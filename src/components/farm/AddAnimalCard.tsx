"use client";

/**
 * Pilot Integration P3 — "Add individual animal" on Cattle → Add cattle (`/cattle/manage`). Every field but the category
 * is optional, as `livestock_individuals` treats it. It writes through the existing `addIndividualAnimalAction`, which
 * resolves the farm server-side (DECISIONS D14).
 *
 * Interaction-first (docs/design/FARM_RETURN_INTERACTION_PRINCIPLES.md): a quiet action row until the farmer opens it,
 * then group first and identity second. A grouped animal takes its group's category — the farmer isn't asked for the
 * same classification twice; only an ungrouped animal has its category chosen here.
 *
 * After a save the page re-reads from Supabase (`router.refresh()`), and the new animal — identified by its database
 * id — is linked to its Cattle profile, where its weights are recorded. No browser copy of the herd is kept here.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import type { LivestockCategory, LivestockGroup } from "@/domain/types";
import { addIndividualAnimalAction } from "@/app/actions/farm";
import { GROUP_CATEGORY_LABEL } from "@/server/cattle-real/group-record-edit";
import styles from "./AddAnimalCard.module.css";

const CATEGORY_OPTIONS = Object.keys(GROUP_CATEGORY_LABEL) as LivestockCategory[];
const SEX_OPTIONS: readonly { value: "" | "male" | "female"; label: string }[] = [
  { value: "", label: "Unrecorded" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const FIELD = "mt-1.5 block min-h-11 w-full rounded-[10px] border border-fr-v2-rule bg-white px-3 text-sm text-fr-v2-charcoal";
const LABEL = "block text-xs font-medium text-fr-v2-charcoal";
const SECTION_TITLE = "text-[10px] font-semibold uppercase tracking-[0.13em] text-fr-v2-forest";

type Mode = "closed" | "open" | "saved";

export function AddAnimalCard({ farmId, groups }: { farmId: string; groups: LivestockGroup[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("closed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; label: string; detail: string } | null>(null);
  const [groupId, setGroupId] = useState("");
  /** The farmer's own choice, used only while the animal is ungrouped. */
  const [ungroupedCategory, setUngroupedCategory] = useState<LivestockCategory>("suckler_cow");
  const [tagNumber, setTagNumber] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [breed, setBreed] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const previousMode = useRef<Mode>(mode);

  // Keep keyboard focus with the surface that just appeared; return it to the row on cancel.
  useEffect(() => {
    if (previousMode.current === mode) return;
    if (mode === "open") headingRef.current?.focus();
    else if (mode === "saved") successRef.current?.focus();
    else triggerRef.current?.focus();
    previousMode.current = mode;
  }, [mode]);

  const group = groupId ? groups.find((g) => g.id === groupId) : undefined;
  const category = group ? group.category : ungroupedCategory;

  function clearIdentity() {
    setTagNumber("");
    setSex("");
    setBreed("");
    setDateOfBirth("");
  }

  function open() {
    setAdded(null);
    setError(null);
    setMode("open");
  }

  function cancel() {
    clearIdentity();
    setGroupId("");
    setError(null);
    setMode("closed");
  }

  /** Keeps the group (and an ungrouped category) so a run of animals into one group needs one choice. */
  function addAnother() {
    clearIdentity();
    setError(null);
    setMode("open");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const tag = tagNumber.trim();
    const breedText = breed.trim();
    try {
      const animal = await addIndividualAnimalAction(farmId, {
        ...(tag ? { tagNumber: tag } : {}),
        category,
        ...(group ? { groupId: group.id } : {}),
        ...(sex ? { sex } : {}),
        ...(breedText ? { breed: breedText } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
      });
      setAdded({
        id: animal.id,
        label: animal.tagNumber ?? "Untagged animal",
        detail: `${GROUP_CATEGORY_LABEL[animal.category]} · ${group ? group.label : "Ungrouped"}`,
      });
      clearIdentity();
      setMode("saved");
      router.refresh();
    } catch {
      setError("The animal couldn't be saved. Nothing was added — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "closed") {
    return (
      <div className={styles.root}>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={false}
          onClick={open}
          className={`${styles.surface} ${styles.trigger} flex min-h-16 w-full items-center gap-4 px-5 py-4 text-left`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fr-v2-cream text-fr-v2-forest" aria-hidden>
            <Plus className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fr-v2-charcoal">Add individual animal</span>
            <span className="mt-0.5 block text-xs leading-snug text-fr-v2-muted">
              Its own record carries weights, age and breed — the detail production advice is built on.
            </span>
          </span>
        </button>
      </div>
    );
  }

  if (mode === "saved" && added) {
    return (
      <div className={styles.root}>
        <section aria-label="Animal saved" className={`${styles.surface} ${styles.enter} p-5`}>
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fr-v2-forest text-white" aria-hidden>
              <Check className="size-4" />
            </span>
            <div className="min-w-0">
              <p ref={successRef} tabIndex={-1} role="status" className="text-sm font-semibold text-fr-v2-charcoal outline-none">
                {added.label} saved
              </p>
              <p className="mt-0.5 text-xs text-fr-v2-muted">{added.detail}. Record its weights from the animal&apos;s page.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={addAnother}
              className={`${styles.actionButton} inline-flex min-h-11 items-center justify-center rounded-full border border-fr-v2-forest px-5 text-sm font-semibold text-fr-v2-forest`}
            >
              Add another animal
            </button>
            <Link
              href={`/cattle/animals/${encodeURIComponent(added.id)}`}
              className={`${styles.actionButton} inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-fr-v2-forest px-5 text-sm font-semibold text-white`}
            >
              Open animal <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <section aria-labelledby="add-animal-heading" className={`${styles.surface} ${styles.enter} p-5`}>
        <h2 id="add-animal-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-fr-v2-charcoal outline-none">
          Add individual animal
        </h2>
        <p className="mt-1 text-xs leading-snug text-fr-v2-muted">Only the animal type is needed. Everything else can be added now or later.</p>

        <form onSubmit={save} className="mt-5 flex flex-col">
          <fieldset className="border-t border-fr-v2-rule pt-4">
            <legend className={`${SECTION_TITLE} float-left mb-3 w-full`}>Group &amp; animal type</legend>
            <div className="clear-both grid gap-4 sm:grid-cols-2">
              {groups.length > 0 ? (
                <label className={LABEL}>
                  Group
                  <select value={group ? groupId : ""} onChange={(e) => setGroupId(e.target.value)} className={FIELD}>
                    <option value="">No group — record as ungrouped</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} · {GROUP_CATEGORY_LABEL[g.category]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div role="group" aria-labelledby="add-animal-group-label">
                  <p id="add-animal-group-label" className={LABEL}>
                    Group
                  </p>
                  <p
                    className="mt-1.5 flex min-h-11 items-center rounded-[10px] bg-fr-v2-cream px-3 text-sm text-fr-v2-muted"
                  >
                    No groups yet — record as ungrouped
                  </p>
                </div>
              )}

              {group ? (
                <div role="group" aria-labelledby="add-animal-category-label">
                  <p id="add-animal-category-label" className={LABEL}>
                    Animal type
                  </p>
                  <p
                    data-category={group.category}
                    className="mt-1.5 flex min-h-11 items-center justify-between gap-3 rounded-[10px] bg-fr-v2-cream px-3 text-sm text-fr-v2-charcoal"
                  >
                    <span className="font-semibold">{GROUP_CATEGORY_LABEL[group.category]}</span>
                    <span className="text-[11px] text-fr-v2-muted">From {group.label}</span>
                  </p>
                </div>
              ) : (
                <label className={LABEL}>
                  Animal type
                  <select
                    value={ungroupedCategory}
                    onChange={(e) => setUngroupedCategory(e.target.value as LivestockCategory)}
                    className={FIELD}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {GROUP_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </fieldset>

          <fieldset className="mt-6 border-t border-fr-v2-rule pt-4">
            <legend className={`${SECTION_TITLE} float-left w-full`}>Animal identity</legend>
            <p className="clear-both mt-1 text-xs leading-snug text-fr-v2-muted">
              Date of birth, sex and breed raise the confidence of production advice. All optional — correct them later from the animal&apos;s record.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={LABEL}>
                Tag number <span className="font-normal text-fr-v2-muted">(optional)</span>
                <input value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} autoComplete="off" className={FIELD} />
              </label>
              <label className={LABEL}>
                Date of birth <span className="font-normal text-fr-v2-muted">(optional)</span>
                <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={FIELD} />
              </label>
              <fieldset>
                <legend className={LABEL}>Sex</legend>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-[12px] bg-fr-v2-cream p-1">
                  {SEX_OPTIONS.map((o) => (
                    <label
                      key={o.value || "unrecorded"}
                      className={`flex min-h-10 cursor-pointer items-center justify-center rounded-[9px] text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fr-v2-forest ${
                        sex === o.value ? "bg-white font-semibold text-fr-v2-forest shadow-sm" : "text-fr-v2-muted hover:text-fr-v2-charcoal"
                      }`}
                    >
                      <input
                        type="radio"
                        name="add-animal-sex"
                        value={o.value}
                        checked={sex === o.value}
                        onChange={() => setSex(o.value)}
                        className="sr-only"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className={LABEL}>
                Breed <span className="font-normal text-fr-v2-muted">(optional)</span>
                <input value={breed} onChange={(e) => setBreed(e.target.value)} autoComplete="off" className={FIELD} />
              </label>
            </div>
          </fieldset>

          {error ? (
            <p className="mt-5 border-l-[3px] border-fr-risk bg-fr-v2-cream px-4 py-3 text-sm text-fr-risk" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-fr-v2-rule pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancel}
              className={`${styles.actionButton} inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-fr-v2-muted hover:text-fr-v2-charcoal`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${styles.actionButton} inline-flex min-h-11 items-center justify-center rounded-full bg-fr-v2-forest px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {saving ? "Saving…" : "Save animal"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
