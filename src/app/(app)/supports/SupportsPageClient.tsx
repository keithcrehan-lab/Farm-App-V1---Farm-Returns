"use client";

/**
 * Farm Return Next — Supports Intelligence + Farm Strategy phase, Supports
 * home screen. `SUPPORTS_STRATEGY_CONTRACT.md` §11/§12/§13 — calm light
 * visual language, contextual cards, progressive disclosure, real
 * evidence states; explicitly not a dense KPI grid or a grant-directory
 * listing (every card here is this specific farm's own real assessment,
 * never a generic scheme blurb).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { FarmSectionHeading } from "@/components/next/FarmSectionHeading";
import { AskAIButton, type AskAIContext } from "@/components/next/AskAI";
import type { StatusTone } from "@/lib/status";
import type { SupportProfile, SupportProfileFactKey } from "@/domain/support-profile";
import type { EligibilityAssessment, EligibilityState } from "@/domain/scheme-eligibility";
import { upsertSupportProfileFactAction } from "@/app/actions/support-profile";

const STATE_TONE: Record<EligibilityState, StatusTone> = {
  ELIGIBLE: "good",
  LIKELY_ELIGIBLE: "good",
  MORE_INFORMATION_REQUIRED: "attention",
  NOT_ELIGIBLE: "risk",
  RULES_UNVERIFIED: "neutral",
  SCHEME_UNAVAILABLE: "neutral",
};

const STATE_LABEL: Record<EligibilityState, string> = {
  ELIGIBLE: "Eligible",
  LIKELY_ELIGIBLE: "Likely eligible",
  MORE_INFORMATION_REQUIRED: "More information required",
  NOT_ELIGIBLE: "Not eligible",
  RULES_UNVERIFIED: "Rules not yet confirmed",
  SCHEME_UNAVAILABLE: "Not yet assessable",
};

function GapField({ gapKey, label, onSaved }: { gapKey: SupportProfileFactKey; label: string; onSaved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [dateValue, setDateValue] = useState("");
  const [levelValue, setLevelValue] = useState("");

  async function save(value: unknown) {
    setPending(true);
    setError(undefined);
    try {
      await upsertSupportProfileFactAction(gapKey, value);
      onSaved();
    } catch {
      setError("Couldn't save that — please try again.");
    } finally {
      setPending(false);
    }
  }

  if (gapKey === "biss_participant_2026") {
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <span className="text-sm text-fr-ink-700">{label}</span>
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={() => save(true)} className="rounded-full border border-fr-border px-3 py-1.5 text-xs font-medium text-fr-ink-700 disabled:opacity-50">
            Yes
          </button>
          <button type="button" disabled={pending} onClick={() => save(false)} className="rounded-full border border-fr-border px-3 py-1.5 text-xs font-medium text-fr-ink-700 disabled:opacity-50">
            No
          </button>
        </div>
        {error ? <span className="text-xs text-fr-risk">{error}</span> : null}
      </div>
    );
  }

  if (gapKey === "agricultural_qualification_level") {
    return (
      <div className="flex flex-col gap-2 py-3">
        <span className="text-sm text-fr-ink-700">{label}</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={10}
            placeholder="NFQ level, e.g. 6"
            value={levelValue}
            onChange={(e) => setLevelValue(e.target.value)}
            className="w-32 rounded-fr-control border border-fr-border px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending || levelValue === ""}
            onClick={() => save(Number(levelValue))}
            className="rounded-full bg-fr-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {error ? <span className="text-xs text-fr-risk">{error}</span> : null}
      </div>
    );
  }

  // date_of_birth / head_of_holding_since
  return (
    <div className="flex flex-col gap-2 py-3">
      <span className="text-sm text-fr-ink-700">{label}</span>
      <div className="flex items-center gap-2">
        <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="rounded-fr-control border border-fr-border px-3 py-1.5 text-sm" />
        <button
          type="button"
          disabled={pending || dateValue === ""}
          onClick={() => save(dateValue)}
          className="rounded-full bg-fr-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {error ? <span className="text-xs text-fr-risk">{error}</span> : null}
    </div>
  );
}

function AssessmentCard({ assessment, schemeName }: { assessment: EligibilityAssessment; schemeName: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <p className="text-sm font-semibold text-fr-ink-900">{schemeName}</p>
          <p className="mt-1 text-xs text-fr-ink-600">{assessment.whyThisState}</p>
        </div>
        <Pill tone={STATE_TONE[assessment.state]}>{STATE_LABEL[assessment.state]}</Pill>
      </button>
      {expanded ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-fr-border pt-4 text-xs">
          {assessment.satisfied.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-fr-ink-700">Confirmed</p>
              <ul className="flex flex-col gap-1">
                {assessment.satisfied.map((r) => (
                  <li key={r.ruleId} className="flex items-start gap-1.5 text-fr-ink-600">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-fr-good" />
                    {r.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {assessment.failed.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-fr-ink-700">Not met</p>
              <ul className="flex flex-col gap-1 text-fr-ink-600">
                {assessment.failed.map((r) => (
                  <li key={r.ruleId}>{r.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {(assessment.unknown.length > 0 || assessment.whatIsMissing.length > 0) && (
            <div>
              <p className="mb-1 font-semibold text-fr-ink-700">What Farm Return still needs</p>
              <ul className="flex flex-col gap-1">
                {(assessment.unknown.length > 0 ? assessment.unknown.map((r) => r.detail) : assessment.whatIsMissing).map((text, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-fr-ink-600">
                    <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-fr-attention" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {assessment.sources.length > 0 ? (
            <div>
              <p className="mb-1 font-semibold text-fr-ink-700">Source</p>
              <ul className="flex flex-col gap-1">
                {assessment.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-fr-info underline">
                      {s.publisher} — {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function SupportsPageClient({ profile, assessments, schemeNames }: { profile: SupportProfile; assessments: EligibilityAssessment[]; schemeNames: Record<string, string> }) {
  const router = useRouter();

  const askAIContext: AskAIContext = {
    screen: "Supports",
    facts: {
      County: profile.derived.countyLocation ?? "Unknown",
      "Total declared area": `${profile.derived.totalDeclaredAreaHa.toFixed(2)} ha`,
      "Total livestock units": `${profile.derived.totalLivestockUnits.toFixed(2)} LU`,
      ...Object.fromEntries(assessments.map((a) => [a.schemeId, STATE_LABEL[a.state]])),
    },
  };

  return (
    <>
      <PageHeader title="Supports" subtitle="What may apply to your farm, based on what Farm Return already knows." />

      <div className="flex flex-col gap-6">
        <section>
          <FarmSectionHeading>Known from your farm</FarmSectionHeading>
          <Card>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {profile.knownFacts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs text-fr-ink-400">{f.label}</dt>
                  <dd className="font-medium text-fr-ink-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        {profile.gaps.length > 0 ? (
          <section>
            <FarmSectionHeading>Needs your input ({profile.gaps.length})</FarmSectionHeading>
            <Card>
              <div className="divide-y divide-fr-border">
                {profile.gaps.map((gap) => (
                  <GapField key={gap.key} gapKey={gap.key} label={gap.label} onSaved={() => router.refresh()} />
                ))}
              </div>
            </Card>
          </section>
        ) : (
          <section>
            <FarmSectionHeading>Needs your input</FarmSectionHeading>
            <Card>
              <p className="text-sm text-fr-ink-600">Farm Return already has everything it needs from you for the schemes it currently knows about.</p>
            </Card>
          </section>
        )}

        <section>
          <FarmSectionHeading>What may apply to you</FarmSectionHeading>
          <div className="flex flex-col gap-3">
            {assessments.map((a) => (
              <AssessmentCard key={a.schemeId} assessment={a} schemeName={schemeNames[a.schemeId] ?? a.schemeId} />
            ))}
          </div>
        </section>

        <AskAIButton context={askAIContext} className="w-full justify-center py-3 shadow-fr-card" />
      </div>
    </>
  );
}
