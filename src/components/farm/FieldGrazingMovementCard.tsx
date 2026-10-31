"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  loadGrazingMovementContextAction,
  moveLivestockGroupToFieldAction,
  type GrazingMovementContext,
} from "@/app/actions/grazing-field-movements";
import { useIsRealMode } from "@/store/farm-store";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function rejectionMessage(code: string): string {
  switch (code) {
    case "MOVE_NOT_AFTER_CURRENT_START":
      return "The move date must be after this group's current field start date.";
    case "HEADCOUNT_NOT_RECORDED":
      return "Record a headcount for this group before moving it to a field.";
    case "INVALID_MOVE_DATE":
    case "INVALID_STARTED_AT":
      return "Choose a valid move date that is not in the future.";
    case "FIELD_NOT_FOUND":
      return "This field is no longer available.";
    case "GROUP_NOT_FOUND":
      return "This livestock group is no longer available.";
    default:
      return "The cattle move could not be recorded. Please review the group and date and try again.";
  }
}

export function FieldGrazingMovementCard({ fieldId }: { fieldId: string }) {
  const isRealMode = useIsRealMode();
  const router = useRouter();
  const [context, setContext] = useState<GrazingMovementContext | null>(null);
  const [loading, setLoading] = useState(isRealMode);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [movedOn, setMovedOn] = useState(todayIsoDate());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => {
    if (!isRealMode) return;
    setLoading(true);
    setLoadError(false);
    void loadGrazingMovementContextAction(fieldId)
      .then((next) => {
        setContext(next);
        setLoading(false);
      })
      .catch(() => {
        setContext(null);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!isRealMode) return;
    let cancelled = false;
    void loadGrazingMovementContextAction(fieldId)
      .then((next) => {
        if (cancelled) return;
        setContext(next);
        setLoadError(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setContext(null);
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fieldId, isRealMode]);

  const groupsHere = useMemo(
    () => context?.groups.filter((group) => group.currentFieldId === fieldId) ?? [],
    [context, fieldId],
  );

  if (!isRealMode) {
    return (
      <div className="py-2">
        <p className="text-sm text-fr-v2-muted">Field grazing movements are recorded for signed-in farm data.</p>
      </div>
    );
  }

  return (
    <div className="py-2" data-field-grazing-movements>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-fr-v2-graphite">Livestock in this field</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fr-v2-muted">
            Recorded moves build the field&apos;s grazing pressure automatically for the fertiliser calculation.
          </p>
        </div>
        {!editing && context?.groups.length ? (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setMessage(null);
              const firstAway = context.groups.find((group) => group.currentFieldId !== fieldId);
              setGroupId(firstAway?.id ?? context.groups[0]?.id ?? "");
              setMovedOn(todayIsoDate());
            }}
            className="min-h-9 text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-forest/30 underline-offset-[3px] hover:decoration-fr-v2-gold"
          >
            Move cattle here
          </button>
        ) : null}
      </div>

      {loading ? <p className="mt-3 text-xs italic text-fr-v2-muted">Loading grazing records…</p> : null}
      {loadError ? <p className="mt-3 text-xs text-fr-v2-clay">Grazing records are temporarily unavailable.</p> : null}

      {!loading && !loadError && context ? (
        <div className="mt-3">
          {groupsHere.length > 0 ? (
            <ul className="divide-y divide-fr-v2-cream-rule/70 border-y border-fr-v2-cream-rule/70">
              {groupsHere.map((group) => (
                <li key={group.id} className="flex items-baseline justify-between gap-4 py-2">
                  <span className="text-sm font-semibold text-fr-v2-graphite">{group.label}</span>
                  <span className="text-right font-mono text-[11px] text-fr-v2-muted">
                    {group.headCount} head{group.currentSince ? ` · since ${formatDate(group.currentSince) ?? "recorded date"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-fr-v2-muted">No cattle are currently recorded in this field.</p>
          )}

          {context.groups.length === 0 ? (
            <p className="mt-2 text-xs text-fr-v2-muted">Add a livestock group before recording field movements.</p>
          ) : null}
        </div>
      ) : null}

      {editing && context ? (
        <div className="mt-4 border-l-[3px] border-fr-v2-gold pl-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-fr-v2-graphite">
              Livestock group
              <select
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                className="min-h-10 w-full border border-fr-v2-cream-rule bg-white px-3 text-sm text-fr-v2-graphite outline-none focus:border-fr-v2-forest"
              >
                <option value="">Select group</option>
                {context.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label} — {group.headCount} head{group.currentFieldName ? ` · ${group.currentFieldName}` : " · field not recorded"}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-semibold text-fr-v2-graphite">
              Moved on
              <input
                type="date"
                max={todayIsoDate()}
                value={movedOn}
                onChange={(event) => setMovedOn(event.target.value)}
                className="min-h-10 w-full border border-fr-v2-cream-rule bg-white px-3 text-sm text-fr-v2-graphite outline-none focus:border-fr-v2-forest"
              />
            </label>
          </div>

          {groupId && context.groups.find((group) => group.id === groupId)?.currentFieldName ? (
            <p className="mt-2 text-xs text-fr-v2-muted">
              This closes the group&apos;s current session in {context.groups.find((group) => group.id === groupId)?.currentFieldName} and starts a new session in {context.fieldName}.
            </p>
          ) : (
            <p className="mt-2 text-xs text-fr-v2-muted">
              This starts the group&apos;s recorded grazing history in {context.fieldName}.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending || !groupId || !movedOn}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  try {
                    const result = await moveLivestockGroupToFieldAction({ livestockGroupId: groupId, fieldId, movedOn });
                    if (result.status === "rejected") {
                      setMessage(rejectionMessage(result.reasonCode));
                      return;
                    }
                    setEditing(false);
                    setMessage("Cattle moved. Grazing pressure and fertiliser evidence will use this field session automatically.");
                    reload();
                    router.refresh();
                  } catch {
                    setMessage("The cattle move could not be saved. Please try again.");
                  }
                });
              }}
              className="min-h-10 bg-fr-v2-forest-deep px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "Saving…" : `Move to ${context.fieldName}`}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setEditing(false);
                setMessage(null);
              }}
              className="min-h-10 px-3 text-xs font-semibold text-fr-v2-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-xs leading-relaxed text-fr-v2-muted">{message}</p> : null}
    </div>
  );
}
