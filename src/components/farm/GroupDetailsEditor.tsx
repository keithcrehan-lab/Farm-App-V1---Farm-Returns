"use client";

/**
 * The group workspace's own record correction (`/cattle/groups/<id>`): name, breed, and the headcount while no animal
 * is recorded individually — the only facts `livestock_groups` owns here. Category is shown, not edited. Moves,
 * weighings, housing and the production goal stay in their own workflows. Writes go through the farm store's existing
 * `updateLivestockGroup` / `deleteLivestockGroup` (→ the livestock server actions, farm resolved server-side), and the
 * page is refreshed once the write has persisted so the workspace shows the saved record. It is a form (it parses typed
 * input), so it lives with the other farm forms and reaches the cattle group screen as its `editor` slot.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFarm, useFarmActions } from "@/store/farm-store";
import type { GroupRecordEdit } from "@/server/cattle-real/group-record-edit";
import s from "@/components/cattle/continuity/continuity.module.css";

const input = "w-full rounded-[10px] border border-[var(--cc-rule)] bg-white px-3 py-2.5 text-base text-[var(--cc-ink)]";
const fieldLabel = "mb-1 block text-xs text-[var(--cc-muted)]";
const readValue = "py-2.5 text-base font-semibold text-[var(--cc-ink)]";
const hint = "block text-[11px] text-[var(--cc-muted)]";

export const EDIT_GROUP_DETAILS_ID = "edit-group-details";

export function GroupDetailsEditor({ record }: { record: GroupRecordEdit }) {
  const farm = useFarm();
  const router = useRouter();
  const { updateLivestockGroup, deleteLivestockGroup } = useFarmActions();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState(record.name);
  const [breed, setBreed] = useState(record.breed ?? "");
  const [count, setCount] = useState(record.storedHeadcount === null ? "" : String(record.storedHeadcount));

  // The production recommendation's "Add the breed in Edit group details" links to #edit-group-details.
  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === `#${EDIT_GROUP_DETAILS_ID}`) queueMicrotask(start);
    };
    openOnHash();
    window.addEventListener("hashchange", openOnHash);
    return () => window.removeEventListener("hashchange", openOnHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start() {
    setName(record.name);
    setBreed(record.breed ?? "");
    setCount(record.storedHeadcount === null ? "" : String(record.storedHeadcount));
    setConfirmDelete(false);
    setFailed(false);
    setOpen(true);
  }

  const countValid = !record.headcountEditable || (Number.isInteger(Number(count)) && Number(count) > 0);
  const canSave = name.trim() !== "" && countValid && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setFailed(false);
    const ok = await updateLivestockGroup(
      record.groupId,
      {
        label: name.trim(),
        ...(breed.trim() ? { breed: breed.trim() } : {}),
        ...(record.headcountEditable ? { count: Number(count) } : {}),
      },
      farm.ownerName,
    );
    setBusy(false);
    if (!ok) return setFailed(true);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setFailed(false);
    const ok = await deleteLivestockGroup(record.groupId);
    setBusy(false);
    if (!ok) return setFailed(true);
    router.push("/cattle");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" id={EDIT_GROUP_DETAILS_ID} onClick={start} className={s.manage}>
        Edit group details
      </button>
    );
  }

  return (
    <section id={EDIT_GROUP_DETAILS_ID} aria-label="Edit group details" className={`${s.aboutPanel} mt-3 w-full p-4`} data-group-editor={record.groupId}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={s.quietLabel}>Edit group details</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-[var(--cc-muted)]">
          Cancel
        </button>
      </div>
      <p className="mt-1 text-[13px] text-[var(--cc-muted)]">Corrects the group record. Moves to a field or a shed and weighings are recorded in their own workflows; the production goal is set in Override / edit production target.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>Group name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={fieldLabel}>Breed</span>
          <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Not recorded" className={input} />
        </label>
        {record.headcountEditable ? (
          <label className="block">
            <span className={fieldLabel}>Headcount</span>
            <input type="number" min={1} step={1} value={count} onChange={(e) => setCount(e.target.value)} className={input} />
            <span className={`${hint} mt-1`}>No animals are recorded individually, so the group record holds the count. Confirmed by you when saved.</span>
          </label>
        ) : (
          <div data-group-editor-fact="headcount">
            <span className={fieldLabel}>Headcount</span>
            <p className={readValue}>
              {record.individuals} {record.individuals === 1 ? "animal" : "animals"} recorded
            </p>
            <span className={hint}>Headcount comes from the animals recorded in this group. Add or move animals to change it.</span>
            {record.headcountNote ? <span className="mt-1 block text-[11px] font-semibold text-[var(--cc-quiet)]">{record.headcountNote}</span> : null}
          </div>
        )}
        <div data-group-editor-fact="category">
          <span className={fieldLabel}>Category</span>
          <p className={readValue}>{record.categoryLabel}</p>
          <span className={hint} data-group-editor-category-note>
            Fixed once the group is added: field movements keep the category they were recorded with, so it isn&apos;t rewritten here. If it&apos;s wrong, add a new group with the right category in Add cattle and record the cattle there; a group with no animals recorded individually can then be deleted below.
          </span>
        </div>
      </div>

      {failed ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-[#9b2c2c]">
          That change couldn&apos;t be saved to your farm&apos;s records — try again.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-10 px-1 text-sm font-semibold text-[#9b2c2c]">
          Delete group
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={save}
          className="min-h-11 rounded-full bg-[var(--cc-green)] px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy && !confirmDelete ? "Saving…" : "Save group details"}
        </button>
      </div>

      {confirmDelete ? (
        <div className="mt-3 rounded-[10px] border border-[#9b2c2c]/30 bg-[#9b2c2c]/5 p-4" data-group-editor-delete>
          <p className="text-sm font-semibold text-[#9b2c2c]">Delete {record.name}?</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--cc-muted)]">
            This removes the group from herd totals and calculations, and deletes the field movements recorded for it. Fields that relied on those movements fall back to the farm-level stocking rate in the fertiliser plan. Any individual animals linked to this group are not deleted; they remain in Cattle but become ungrouped. This action cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-10 rounded-full border border-[var(--cc-rule)] px-4 text-sm font-semibold text-[var(--cc-muted)]">
              Keep group
            </button>
            <button type="button" disabled={busy} onClick={remove} className="min-h-10 rounded-full bg-[#9b2c2c] px-4 text-sm font-semibold text-white disabled:opacity-40">
              Delete group permanently
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
