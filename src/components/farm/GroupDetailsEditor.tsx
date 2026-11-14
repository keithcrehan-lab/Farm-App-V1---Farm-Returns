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
import { applyBreedToCurrentGroupMembers } from "@/app/(app)/cattle/real-actions";
import { GroupBreedSelector } from "@/components/cattle/continuity/GroupBreedSelector";
import { groupBreedDraft, groupBreedValue, individualBreedSummary } from "@/domain/cattle/group-breed-selection";
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
  const [errorMessage, setErrorMessage] = useState("");
  const [name, setName] = useState(record.name);
  const [breedDraft, setBreedDraft] = useState(() => groupBreedDraft(record.breed, record.members));
  const [applyToAll, setApplyToAll] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
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
    setBreedDraft(groupBreedDraft(record.breed, record.members));
    setCount(record.storedHeadcount === null ? "" : String(record.storedHeadcount));
    setConfirmDelete(false);
    setApplyToAll(false);
    setConfirmBulk(false);
    setErrorMessage("");
    setFailed(false);
    setOpen(true);
  }

  const countValid = !record.headcountEditable || (Number.isInteger(Number(count)) && Number(count) > 0);
  const chosenBreed = groupBreedValue(breedDraft);
  const canApplyToAll = record.members.length > 0 && typeof chosenBreed === "string" && breedDraft.mode !== "mixed";
  const canSave = name.trim() !== "" && countValid && chosenBreed !== undefined && !busy;

  function save() {
    if (!canSave) return;
    if (applyToAll && canApplyToAll) {
      setConfirmBulk(true);
      return;
    }
    void persist();
  }

  async function persist() {
    if (!canSave) return;
    setBusy(true);
    setFailed(false);
    setErrorMessage("");
    setConfirmBulk(false);
    try {
      // Group metadata is a separate record; it never edits individual breed
      // identities unless the farmer explicitly confirms the bulk correction.
      const ok = await updateLivestockGroup(
        record.groupId,
        {
          label: name.trim(),
          breed: chosenBreed,
          ...(record.headcountEditable ? { count: Number(count) } : {}),
        },
        farm.ownerName,
      );
      if (!ok) {
        setFailed(true);
        return;
      }
      if (applyToAll && canApplyToAll && typeof chosenBreed === "string") {
        const applied = await applyBreedToCurrentGroupMembers({
          groupId: record.groupId,
          breed: chosenBreed,
          expectedAnimalIds: record.members.map((m) => m.animalId),
        });
        if (!applied.ok) {
          // Group metadata may already be saved; say so instead of pretending
          // both operations were atomic, and allow a safe retry.
          setErrorMessage(`Group details were saved, but animal breeds were not updated: ${applied.message}`);
          router.refresh();
          return;
        }
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("[cattle] saving group breed details failed", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
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
      <details className="mt-1 text-xs leading-relaxed text-[var(--cc-muted)]">
        <summary className="cursor-pointer font-medium">About group details</summary>
        <p className="mt-1">Edit the group name and breed here. Record field moves, weighings and production targets in their own sections. Individual animal breeds are never changed without confirmation.</p>
      </details>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>Group name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <div className="min-w-0 sm:col-span-2">
          <GroupBreedSelector
            value={breedDraft}
            onChange={(next) => { setBreedDraft(next); setApplyToAll(false); setConfirmBulk(false); }}
            disabled={busy}
          />
          <p className={`${hint} mt-1`}>Optional. Crosses name their breeds without assuming genetic percentages.</p>
          {record.members.length ? (
            <div className="mt-2 rounded-[10px] border border-[var(--cc-rule)] bg-white/60 p-3">
              <p className="text-xs font-semibold text-[var(--cc-ink)]">Recorded animals · {record.members.length}</p>
              <p className={`${hint} mt-1`}>{individualBreedSummary(record.members)}</p>
              <p className={`${hint} mt-1`}>Animal records remain authoritative. Changing the group description alone won&apos;t overwrite them.</p>
              {canApplyToAll ? (
                <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--cc-ink)]">
                  <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--cc-green)]"
                    checked={applyToAll} disabled={busy}
                    onChange={(e) => { setApplyToAll(e.target.checked); setConfirmBulk(false); }} />
                  <span>Apply this breed to all {record.members.length} individually recorded {record.members.length === 1 ? "animal" : "animals"} (optional)</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
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
            <span className={hint}>Calculated from individual animal records. Add or move animals to change it.</span>
            {record.headcountNote ? <span className="mt-1 block text-[11px] font-semibold text-[var(--cc-quiet)]">{record.headcountNote}</span> : null}
          </div>
        )}
        <div data-group-editor-fact="category">
          <span className={fieldLabel}>Category</span>
          <p className={readValue}>{record.categoryLabel}</p>
          <span className={hint} data-group-editor-category-note>Set when this group was created.</span>
          <details className="mt-1 text-[11px] leading-relaxed text-[var(--cc-muted)]">
            <summary className="cursor-pointer">Why can&apos;t I change this?</summary>
            <p className="mt-1">Movements retain their original animal category. If it is wrong, create a group with the correct category and move the animals to it rather than rewriting their movement history.</p>
          </details>
        </div>
      </div>

      {failed || errorMessage ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-[#9b2c2c]">
          {errorMessage || "That change couldn't be saved to your farm's records — try again."}
        </p>
      ) : null}

      {confirmBulk ? (
        <div role="alertdialog" aria-label="Confirm animal breed changes"
          className="mt-3 rounded-[10px] border border-[var(--cc-green)] bg-white p-3">
          <p className="text-sm font-semibold text-[var(--cc-ink)]">Apply {chosenBreed} to {record.members.length} animals?</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--cc-muted)]">This will correct existing individual breed records, including any different breeds already entered. Earlier breed values remain in each animal&apos;s correction history.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="min-h-10 rounded-full border border-[var(--cc-rule)] px-4 text-sm" onClick={() => setConfirmBulk(false)}>
              Go back
            </button>
            <button type="button" disabled={busy} onClick={() => void persist()}
              className="min-h-10 rounded-full bg-[var(--cc-green)] px-4 text-sm font-semibold text-white disabled:opacity-40">
              Confirm and save
            </button>
          </div>
        </div>
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
          {busy && !confirmDelete ? "Saving…" : applyToAll && canApplyToAll ? "Review breed changes" : "Save group details"}
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
