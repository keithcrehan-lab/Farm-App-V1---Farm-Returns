"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  COMMON_CATTLE_BREEDS, MAX_BREED_LENGTH, groupBreedValue,
  type BreedDraft, type BreedMode,
} from "@/domain/cattle/group-breed-selection";

const modes: { mode: BreedMode; label: string }[] = [
  { mode: "single", label: "One breed" },
  { mode: "cross", label: "Crossbred" },
  { mode: "mixed", label: "Mixed group" },
  { mode: "unknown", label: "Not known" },
  { mode: "complex", label: "Other / complex cross" },
];
const control = "min-h-11 w-full rounded-[11px] border border-[var(--cc-rule)] bg-white px-3 text-left text-sm text-[var(--cc-ink)]";
const outline = "rounded-full border border-[var(--cc-rule)] px-3 py-2 text-xs font-semibold";
const fieldText = "text-xs text-[var(--cc-muted)]";

export function GroupBreedSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: BreedDraft;
  onChange: (next: BreedDraft) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [which, setWhich] = useState<"first" | "second">("first");
  const result = groupBreedValue(value);
  const summary = result === null ? "Breed not known" : result ?? "Choose breed";
  const query = search.trim();
  const matches = COMMON_CATTLE_BREEDS.filter((breed) =>
    breed.toLowerCase().includes(query.toLowerCase()),
  );
  const hasExactMatch = COMMON_CATTLE_BREEDS.some((breed) => breed.toLowerCase() === query.toLowerCase());

  function select(valueToSave: string) {
    onChange({ ...value, [which]: valueToSave });
    setSearch("");
    if (value.mode === "cross" && which === "first") setWhich("second");
  }
  function changeMode(mode: BreedMode) {
    onChange({ ...value, mode });
    setWhich("first");
    setSearch("");
  }

  return (
    <div className="min-w-0" data-group-breed-selector>
      <label className="mb-1 block text-xs text-[var(--cc-muted)]">Breed</label>
      <button
        type="button"
        aria-label="Breed"
        aria-expanded={open}
        aria-controls="group-breed-options"
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
        className={`${control} flex items-center justify-between gap-3 disabled:opacity-50`}
      >
        <span className="min-w-0 truncate font-medium">{summary}</span>
        <ChevronDown className={`size-4 shrink-0 text-[var(--cc-muted)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {!open ? null : (
        <div id="group-breed-options" className="mt-2 space-y-3 rounded-[12px] border border-[var(--cc-rule)] bg-white p-3" data-breed-options>
          <div role="radiogroup" aria-label="Breed type" className="flex flex-wrap gap-2">
            {modes.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={value.mode === mode}
                disabled={disabled}
                onClick={() => changeMode(mode)}
                className={`${outline} ${value.mode === mode ? "border-[var(--cc-green)] bg-[var(--cc-green)] text-white" : "text-[var(--cc-ink)]"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {value.mode === "single" || value.mode === "cross" ? (
            <div className="space-y-2">
              {value.mode === "cross" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["first", "second"] as const).map((part, index) => (
                      <button key={part} type="button" disabled={disabled}
                        onClick={() => { setWhich(part); setSearch(""); }}
                        className={`${outline} min-h-11 rounded-[10px] text-left ${which === part ? "border-[var(--cc-green)] bg-[var(--cc-green)]/10" : ""}`}>
                        <span className="block text-[10px] font-normal text-[var(--cc-muted)]">Breed {index + 1}</span>
                        <span className="block truncate">{value[part] || "Choose breed"}</span>
                      </button>
                    ))}
                  </div>
                  <p className={fieldText}>Record the breeds in the cross. This does not assume a 50:50 genetic split.</p>
                </>
              ) : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[var(--cc-muted)]" aria-hidden />
                <input
                  type="search"
                  aria-label="Search cattle breeds"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search breeds"
                  maxLength={MAX_BREED_LENGTH}
                  disabled={disabled}
                  className={`${control} pl-9`}
                />
              </div>
              <p className="text-[10px] text-[var(--cc-muted)]">Common Irish breeds first · search or enter another breed</p>
              <div className="grid max-h-[210px] grid-cols-2 gap-1 overflow-auto sm:grid-cols-3" role="group" aria-label="Cattle breed options">
                {matches.map((breed) => (
                  <button key={breed} type="button" onClick={() => select(breed)} disabled={disabled}
                    className={`flex min-h-10 items-center justify-between gap-1 rounded-[8px] px-2 py-1.5 text-left text-xs ${value[which] === breed ? "bg-[var(--cc-green)]/10 font-semibold text-[var(--cc-green)]" : "text-[var(--cc-ink)] hover:bg-[#f2f0e8]"}`}>
                    <span>{breed}</span>
                    {value[which] === breed ? <Check className="size-3.5" aria-hidden /> : null}
                  </button>
                ))}
              </div>
              {query && !hasExactMatch ? (
                <button type="button" onClick={() => select(query)} disabled={disabled}
                  className="min-h-10 w-full rounded-[9px] border border-[var(--cc-rule)] px-3 text-left text-xs font-semibold text-[var(--cc-green)]">
                  Use “{query}” as {value.mode === "cross" ? `breed ${which === "first" ? 1 : 2}` : "breed"}
                </button>
              ) : null}
            </div>
          ) : value.mode === "complex" ? (
            <div>
              <label className={fieldText} htmlFor="group-complex-cross">Describe the cross (e.g. Angus × Limousin × Hereford)</label>
              <input id="group-complex-cross" className={`${control} mt-1`} value={value.complex}
                onChange={(e) => onChange({ ...value, complex: e.target.value })}
                maxLength={MAX_BREED_LENGTH - "Complex cross: ".length}
                placeholder="Enter the breeds involved" disabled={disabled} />
              <p className={`${fieldText} mt-1`}>Use only known parentage; do not guess percentages.</p>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-[var(--cc-muted)]">
              {value.mode === "mixed"
                ? "This group has more than one breed. Each animal keeps its own recorded breed."
                : "Breed can be added later. It won't prevent cattle movements or a grass walk."}
            </p>
          )}

          {result === undefined ? <p className="text-xs font-semibold text-[#9b2c2c]">Select a valid breed before saving.</p> : null}
          <button type="button" disabled={disabled} onClick={() => setOpen(false)}
            className="min-h-10 w-full rounded-full bg-[var(--cc-green)] px-4 text-sm font-semibold text-white">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
