"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Info,
  PencilLine,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status";
import { recordScep2026FactAction } from "@/app/actions/schemes";
import { SCHEME_DATA_KEYS } from "@/domain/schemes/data-keys";
import type { Scep2026SchemeFactKey } from "@/domain/schemes/facts";
import {
  SCEP_2026_RULE_KEYS,
  type Scep2026ActionProgress,
  type Scep2026View,
} from "@/domain/schemes/scep-2026";
import type { SchemeRuleEvaluation } from "@/domain/schemes/rule-evaluation";

const STATE_TONE: Record<Scep2026View["state"], StatusTone> = {
  PARTICIPATION_UNKNOWN: "attention",
  NOT_PARTICIPATING: "neutral",
  INFORMATION_MISSING: "attention",
  NEEDS_ATTENTION: "risk",
  TRACKED_ACTIONS_ON_TRACK: "good",
  REVIEW_REQUIRED: "attention",
};

const EVALUATION_TONE: Record<SchemeRuleEvaluation["state"], StatusTone> = {
  PASS: "good",
  FAIL: "risk",
  UNKNOWN: "attention",
  EVIDENCE_CONFLICT: "attention",
  INVALID_EVIDENCE: "attention",
  UNSUPPORTED: "neutral",
  REVIEW_REQUIRED: "attention",
  NOT_APPLICABLE: "neutral",
};

const EVALUATION_LABEL: Record<SchemeRuleEvaluation["state"], string> = {
  PASS: "On track",
  FAIL: "Needs attention",
  UNKNOWN: "Information needed",
  EVIDENCE_CONFLICT: "Check records",
  INVALID_EVIDENCE: "Check record",
  UNSUPPORTED: "Not yet assessable",
  REVIEW_REQUIRED: "Needs review",
  NOT_APPLICABLE: "Not applicable",
};

type NumberFactConfig = {
  key: Scep2026SchemeFactKey;
  label: string;
  help: string;
  type: "number";
  step: string;
  integer?: boolean;
};

type BooleanFactConfig = {
  key: Scep2026SchemeFactKey;
  label: string;
  help: string;
  type: "boolean";
};

type FactConfig = NumberFactConfig | BooleanFactConfig;

const FACTS: FactConfig[] = [
  {
    key: SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key,
    label: "2026 yearly reference number",
    help: "Use the 2026 yearly reference number shown in ICBF/AgFood.",
    type: "number",
    step: "1",
    integer: true,
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key,
    label: "Current SBLAS participation",
    help: "SCEP requires continued membership of the Sustainable Beef and Lamb Assurance Scheme.",
    type: "boolean",
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key,
    label: "DAFM-determined eligible forage area",
    help: "Use the eligible forage hectare figure used by DAFM for the 2026 SCEP payment calculation, not Farm Return's mapped area.",
    type: "number",
    step: "0.01",
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key,
    label: "Eligible beef-breed calves born",
    help: "Scheme Year 4 covers the calving period from 1 July 2025 to 30 June 2026.",
    type: "number",
    step: "1",
    integer: true,
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key,
    label: "Eligible-sire calves",
    help: "Number of eligible calves sired by a SCEP-eligible 4- or 5-star bull or AI source.",
    type: "number",
    step: "1",
    integer: true,
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
    label: "Genotypes completed",
    help: "Use the Scheme Year 4 count shown by ICBF.",
    type: "number",
    step: "1",
    integer: true,
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key,
    label: "Cow-calf pairs weighed and submitted",
    help: "Count only eligible pairs whose weights were submitted to ICBF.",
    type: "number",
    step: "1",
    integer: true,
  },
  {
    key: SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key,
    label: "Calving details and annual ICBF surveys submitted",
    help: "Farm Return records this for review but does not use it to declare full SCEP compliance.",
    type: "boolean",
  },
];

function money(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function displayDate(value: string): string {
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function evaluationFor(
  view: Scep2026View,
  ruleKey: string,
): SchemeRuleEvaluation | null {
  return view.evaluations.find((item) => item.ruleKey === ruleKey) ?? null;
}

function ProgrammeCondition({
  label,
  evaluation,
  detail,
}: {
  label: string;
  evaluation: SchemeRuleEvaluation | null;
  detail: string;
}) {
  const state = evaluation?.state ?? "UNKNOWN";
  return (
    <div className="flex items-start justify-between gap-4 border-b border-fr-border py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fr-ink-900">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fr-ink-500">{detail}</p>
      </div>
      <Pill tone={EVALUATION_TONE[state]} className="shrink-0">
        {EVALUATION_LABEL[state]}
      </Pill>
    </div>
  );
}

function ScepActionRow({ action }: { action: Scep2026ActionProgress }) {
  const complete = action.state === "PASS";
  const deadlineText = action.deadline
    ? (action.deadlineState === "past" ? "Deadline passed" : "Deadline") +
      " · " +
      displayDate(action.deadline)
    : "No dated checkpoint stored";

  return (
    <div className="grid gap-3 border-b border-fr-border py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-fr-ink-900">{action.label}</p>
          <Pill tone={EVALUATION_TONE[action.state]}>
            {EVALUATION_LABEL[action.state]}
          </Pill>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-fr-ink-500">{action.detail}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fr-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {deadlineText}
          </span>
          {action.current !== null && action.target !== null ? (
            <span>
              {action.current} / {action.target} {action.unit}
            </span>
          ) : (
            <span>Target will calculate when the required figures are saved.</span>
          )}
        </div>
      </div>
      <div
        className={[
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          complete
            ? "bg-fr-good-bg text-fr-good"
            : action.state === "FAIL"
              ? "bg-fr-risk-bg text-fr-risk"
              : "bg-fr-attention-bg text-fr-attention",
        ].join(" ")}
        aria-hidden="true"
      >
        {complete ? (
          <CheckCircle2 className="size-5" />
        ) : action.state === "FAIL" ? (
          <AlertTriangle className="size-5" />
        ) : (
          <CircleHelp className="size-5" />
        )}
      </div>
    </div>
  );
}

function BooleanFactEditor({
  config,
  value,
  onSave,
  pending,
}: {
  config: BooleanFactConfig;
  value: boolean | null;
  onSave: (value: boolean) => void;
  pending: boolean;
}) {
  return (
    <div
      id={"scep-fact-" + config.key.replaceAll(".", "-")}
      className="grid gap-3 border-b border-fr-border py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div>
        <p className="text-sm font-medium text-fr-ink-900">{config.label}</p>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fr-ink-500">{config.help}</p>
      </div>
      <div className="flex min-h-11 items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(true)}
          className={[
            "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-50",
            value === true
              ? "border-fr-green-700 bg-fr-green-700 text-white"
              : "border-fr-border bg-fr-surface text-fr-ink-700 hover:bg-fr-surface-alt",
          ].join(" ")}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(false)}
          className={[
            "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-50",
            value === false
              ? "border-fr-ink-700 bg-fr-ink-900 text-white"
              : "border-fr-border bg-fr-surface text-fr-ink-700 hover:bg-fr-surface-alt",
          ].join(" ")}
        >
          No
        </button>
      </div>
    </div>
  );
}

function NumberFactEditor({
  config,
  value,
  onSave,
  pending,
}: {
  config: NumberFactConfig;
  value: number | null;
  onSave: (value: number) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const parsed = draft === "" ? null : Number(draft);
  const valid =
    parsed !== null &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    (!config.integer || Number.isInteger(parsed));

  return (
    <div
      id={"scep-fact-" + config.key.replaceAll(".", "-")}
      className="grid gap-3 border-b border-fr-border py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div>
        <p className="text-sm font-medium text-fr-ink-900">{config.label}</p>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fr-ink-500">{config.help}</p>
      </div>
      <div className="flex min-h-11 items-center gap-2">
        <input
          type="number"
          min={config.key === SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key ? 1 : 0}
          step={config.step}
          inputMode={config.integer ? "numeric" : "decimal"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={config.label}
          className="min-h-11 w-28 rounded-fr-control border border-fr-border bg-fr-surface px-3 text-right text-sm text-fr-ink-900 outline-none focus:border-fr-green-600"
        />
        <button
          type="button"
          disabled={pending || !valid || parsed === value}
          onClick={() => {
            if (parsed !== null) onSave(parsed);
          }}
          className="min-h-11 rounded-full bg-fr-green-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-fr-green-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ScepFactEditors({ view }: { view: Scep2026View }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(key: Scep2026SchemeFactKey, value: boolean | number) {
    setError(null);
    startTransition(async () => {
      try {
        await recordScep2026FactAction(key, value);
        router.refresh();
      } catch {
        setError("That value could not be saved. Your existing scheme record has not been changed.");
      }
    });
  }

  return (
    <div>
      {FACTS.map((config) => {
        const value = view.factValues[config.key] ?? null;
        return config.type === "boolean" ? (
          <BooleanFactEditor
            key={config.key}
            config={config}
            value={typeof value === "boolean" ? value : null}
            pending={pending}
            onSave={(next) => save(config.key, next)}
          />
        ) : (
          <NumberFactEditor
            key={config.key}
            config={config}
            value={typeof value === "number" ? value : null}
            pending={pending}
            onSave={(next) => save(config.key, next)}
          />
        );
      })}
      {error ? (
        <p className="mt-3 text-xs font-medium text-fr-risk" role="alert">{error}</p>
      ) : null}
    </div>
  );
}

function ParticipationQuestion({ view }: { view: Scep2026View }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(value: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await recordScep2026FactAction(
          SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
          value,
        );
        router.refresh();
      } catch {
        setError("Farm Return could not save that answer. Nothing has been changed.");
      }
    });
  }

  if (view.participation === null) {
    return (
      <div
        id="scep-fact-schemes-scep-2026-participation"
        className="rounded-fr-card border border-fr-border bg-fr-surface-alt p-4"
      >
        <p className="text-sm font-semibold text-fr-ink-900">
          Is this farm already participating in SCEP?
        </p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fr-ink-500">
          SCEP is a 2023–2027 programme. Farm Return asks this first so a non-participant is not asked for programme figures that do not apply.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => save(true)}
            className="min-h-11 rounded-full bg-fr-green-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Yes, this farm is in SCEP
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => save(false)}
            className="min-h-11 rounded-full border border-fr-border bg-fr-surface px-5 text-sm font-medium text-fr-ink-700 disabled:opacity-50"
          >
            No
          </button>
        </div>
        {error ? <p className="mt-3 text-xs font-medium text-fr-risk" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (view.participation === false) {
    return (
      <div
        id="scep-fact-schemes-scep-2026-participation"
        className="rounded-fr-card border border-fr-border bg-fr-surface-alt p-4"
      >
        <p className="text-sm text-fr-ink-700">
          This farm is recorded as not participating in SCEP. Farm Return will not ask for SCEP-specific figures.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => save(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-fr-border bg-fr-surface px-4 text-sm font-medium text-fr-ink-700 disabled:opacity-50"
        >
          <PencilLine className="size-4" aria-hidden="true" />
          Correct this — the farm is in SCEP
        </button>
        {error ? <p className="mt-3 text-xs font-medium text-fr-risk" role="alert">{error}</p> : null}
      </div>
    );
  }

  return null;
}

export function Scep2026Card({ view }: { view: Scep2026View }) {
  const readinessPercent = view.readiness.percentage;
  const biss = evaluationFor(view, SCEP_2026_RULE_KEYS.BISS);
  const sblas = evaluationFor(view, SCEP_2026_RULE_KEYS.SBLAS);
  const action5 = evaluationFor(view, SCEP_2026_RULE_KEYS.ACTION5_REVIEW);
  const paymentTitle =
    view.payment.state === "CALCULATED" && view.payment.amount !== null
      ? money(view.payment.amount)
      : view.payment.state === "REVIEW_REQUIRED"
        ? "Needs review"
        : "Not calculated yet";

  const missingSchemeFacts = useMemo(
    () =>
      view.readiness.needsYou.filter((item) =>
        item.dataKey.startsWith("schemes.scep.2026."),
      ),
    [view.readiness.needsYou],
  );

  return (
    <Card id="scep-2026" className="overflow-hidden p-0">
      <div className="border-b border-fr-border px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fr-ink-400">
              Source-pinned · Scheme Year 4 · 2026
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-fr-ink-950">
              {view.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fr-ink-600">
              {view.summary}
            </p>
          </div>
          <Pill tone={STATE_TONE[view.state]} className="shrink-0">
            {view.stateLabel}
          </Pill>
        </div>

        {view.participation === true && readinessPercent !== null ? (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-fr-ink-700">Scheme data readiness</span>
              <span className="text-fr-ink-500">
                {view.readiness.completeCount} of {view.readiness.totalCount} known · {readinessPercent}%
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-fr-surface-alt"
              role="progressbar"
              aria-label="SCEP data readiness"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={readinessPercent}
            >
              <div
                className="h-full rounded-full bg-fr-green-700 transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: String(readinessPercent) + "%" }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <ParticipationQuestion view={view} />

        {view.participation === true ? (
          <>
            <section aria-labelledby="scep-actions-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id="scep-actions-title" className="text-base font-semibold text-fr-ink-900">
                    2026 action position
                  </h3>
                  <p className="mt-1 text-xs text-fr-ink-500">
                    Source-pinned targets from DAFM/ICBF. A green row means the recorded figure meets the target; it is not a declaration of full programme compliance.
                  </p>
                </div>
                {missingSchemeFacts.length > 0 ? (
                  <Pill tone="attention">
                    {missingSchemeFacts.length} SCEP figure{missingSchemeFacts.length === 1 ? "" : "s"} missing
                  </Pill>
                ) : null}
              </div>

              {missingSchemeFacts.some((item) => item.route) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {missingSchemeFacts
                    .filter((item) => item.route)
                    .slice(0, 4)
                    .map((item) => (
                      <a
                        key={item.dataKey}
                        href={item.route?.href}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-fr-border bg-fr-surface px-3 text-xs font-medium text-fr-ink-700 hover:bg-fr-surface-alt"
                      >
                        Complete {item.label}
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                      </a>
                    ))}
                </div>
              ) : null}

              <div className="mt-2">
                {view.actions.map((action) => (
                  <ScepActionRow key={action.key} action={action} />
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-fr-card border border-fr-border bg-fr-surface-alt p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-fr-ink-500">Maximum potential gross payment</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-fr-ink-950">{paymentTitle}</p>
                  </div>
                  <ShieldCheck className="size-5 text-fr-green-700" aria-hidden="true" />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fr-ink-500">{view.payment.detail}</p>
              </div>

              <div className="rounded-fr-card border border-fr-border bg-fr-surface-alt p-4">
                <p className="text-xs font-medium text-fr-ink-500">Programme conditions</p>
                <div className="mt-1">
                  <ProgrammeCondition
                    label="2026 BISS application"
                    evaluation={biss}
                    detail="Reuses the BISS answer already held in your Schemes profile — no duplicate question."
                  />
                  <ProgrammeCondition
                    label="SBLAS membership"
                    evaluation={sblas}
                    detail="Current programme membership condition."
                  />
                  <ProgrammeCondition
                    label="Calving details & annual surveys"
                    evaluation={action5}
                    detail="Recorded for review only; Farm Return does not use this one answer to declare full compliance."
                  />
                </div>
              </div>
            </section>

            <details
              open={missingSchemeFacts.length > 0}
              className="group rounded-fr-card border border-fr-border bg-fr-surface"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-fr-ink-900">
                <span>
                  Programme figures
                  <span className="ml-2 text-xs font-normal text-fr-ink-400">farmer-confirmed from ICBF / AgFood</span>
                </span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="border-t border-fr-border px-4 pb-2">
                <ScepFactEditors view={view} />
              </div>
            </details>

            <details className="group rounded-fr-card border border-fr-border bg-fr-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-fr-ink-900">
                <span>Evidence, limitations & next year</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="space-y-5 border-t border-fr-border px-4 py-4 text-xs text-fr-ink-600">
                <div>
                  <p className="font-semibold text-fr-ink-800">Known limitations</p>
                  <ul className="mt-2 space-y-2">
                    {view.limitations.map((line) => (
                      <li key={line} className="flex gap-2">
                        <Info className="mt-0.5 size-3.5 shrink-0 text-fr-info" aria-hidden="true" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-fr-ink-800">Looking ahead to 2027</p>
                  <ul className="mt-2 space-y-1.5">
                    {view.nextYear.map((line) => (
                      <li key={line}>• {line}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-fr-ink-800">Sources</p>
                  <ul className="mt-2 space-y-2">
                    {view.sources.map((source) => (
                      <li key={source.id}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1.5 text-fr-info underline underline-offset-2"
                        >
                          <span>{source.publisher} — {source.title}</span>
                          <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </Card>
  );
}
