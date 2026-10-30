"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Sheet } from "@/components/ui/Sheet";
import { FieldThumbnail } from "@/components/farm/FieldThumbnail";
import type { Field, SoilTest } from "@/domain/types";
import { soilTestAgeValidityForFertility, yearsBetweenIsoDates } from "@/domain/nutrients";
import { resolveFieldSoilIndexProvenance } from "@/domain/soil-index-provenance";
import { fieldWorkspaceHref } from "@/lib/farm-spatial-field-lens";

function soilTestValidityLabel(fertility: Field["fertility"] & { verifiedTest: SoilTest }): { label: string; tone: "good" | "risk" | "neutral" } {
  const today = new Date().toISOString().slice(0, 10);
  const ageYears = yearsBetweenIsoDates(fertility.verifiedTest.sampleDate, today);
  const outcome = soilTestAgeValidityForFertility(fertility, today);
  const ageLabel = ageYears < 1 ? "<1 year old" : `${Math.floor(ageYears)} year${Math.floor(ageYears) === 1 ? "" : "s"} old`;
  if (outcome.status !== "OK") return { label: `${ageLabel} — validity unresolved`, tone: "neutral" };
  if (outcome.value === "VALID") return { label: `Valid — ${ageLabel}`, tone: "good" };
  if (outcome.value === "INDEX4_PERSISTED") return { label: `${ageLabel} — P4 result still applies`, tone: "good" };
  return { label: `${ageLabel} — too old for statutory ceilings`, tone: "risk" };
}

function previousTestsFrom(test: SoilTest): SoilTest[] {
  const out: SoilTest[] = [];
  let current = test.previous;
  while (current) {
    out.push(current);
    current = current.previous;
  }
  return out;
}

/**
 * Soil is an overview only. Field-specific agronomy evidence is entered in
 * the field workspace so there is one write path for crop, soil and legal
 * inputs. This card deliberately has no P/K override or lab-entry controls.
 */
export function SoilFieldCard({ field }: { field: Field }) {
  const { fertility, mappedSoil } = field;
  const [viewTestOpen, setViewTestOpen] = useState(false);
  const indexProvenance = resolveFieldSoilIndexProvenance(fertility);
  const overridden = indexProvenance.p.basis === "farmer_override_of_laboratory" || indexProvenance.k.basis === "farmer_override_of_laboratory";
  const badgeStatus = overridden ? "farmer_adjusted" : fertility.verifiedTest ? "verified" : (fertility.pIndex?.status ?? "unavailable");
  const validity = fertility.verifiedTest && fertility.pIndex ? soilTestValidityLabel({ ...fertility, verifiedTest: fertility.verifiedTest }) : null;
  const previousTests = fertility.verifiedTest ? previousTestsFrom(fertility.verifiedTest) : [];

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex gap-3">
          <FieldThumbnail field={field} className="h-20 w-24 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-fr-ink-900">{field.name}</p>
                <p className="mt-0.5 text-xs text-fr-ink-600">{mappedSoil?.dominantSeries ?? "Mapped soil unavailable"}{mappedSoil?.drainage ? ` · ${mappedSoil.drainage.replace(/_/g, " ")}` : ""}</p>
              </div>
              <StatusBadge status={badgeStatus} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-fr-ink-600">P Index</p><p className="font-semibold">{fertility.pIndex?.value ?? "—"}</p></div>
              <div><p className="text-xs text-fr-ink-600">K Index</p><p className="font-semibold">{fertility.kIndex?.value ?? "—"}</p></div>
              <div><p className="text-xs text-fr-ink-600">pH</p><p className="font-semibold">{fertility.pH?.value ?? "—"}</p></div>
            </div>
          </div>
        </div>

        {fertility.verifiedTest ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-fr-border pt-3 text-sm">
            <span className="flex items-center gap-1.5 text-fr-good"><CheckCircle2 className="size-4" />Lab test {new Date(fertility.verifiedTest.sampleDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>
            <button type="button" onClick={() => setViewTestOpen(true)} className="font-semibold text-fr-green-700 hover:underline">View evidence →</button>
          </div>
        ) : (
          <p className="border-l-[3px] border-fr-v2-gold pl-3 text-xs text-fr-ink-600">No laboratory soil test is recorded for this field.</p>
        )}

        {validity ? <p className={validity.tone === "risk" ? "flex items-center gap-1.5 text-xs text-fr-risk" : "text-xs text-fr-ink-600"}>{validity.tone === "risk" ? <TriangleAlert className="size-3.5" /> : null}{validity.label}</p> : null}

        <Link href={fieldWorkspaceHref(field.id, "nutrients")} className="text-sm font-semibold text-fr-green-700 underline underline-offset-2">
          Open field recommendation setup →
        </Link>
      </Card>

      {fertility.verifiedTest ? (
        <Sheet open={viewTestOpen} onClose={() => setViewTestOpen(false)} title={`${field.name} — soil evidence`}>
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-fr-ink-600">Sample reference</p><p className="font-semibold">{fertility.verifiedTest.sampleRef}</p></div>
              <div><p className="text-xs text-fr-ink-600">Laboratory</p><p className="font-semibold">{fertility.verifiedTest.laboratory}</p></div>
              <div><p className="text-xs text-fr-ink-600">Sample date</p><p className="font-semibold">{fertility.verifiedTest.sampleDate}</p></div>
              <div><p className="text-xs text-fr-ink-600">pH</p><p className="font-semibold">{fertility.verifiedTest.pH}</p></div>
              <div><p className="text-xs text-fr-ink-600">P</p><p className="font-semibold">{fertility.verifiedTest.p} mg/L</p></div>
              <div><p className="text-xs text-fr-ink-600">K</p><p className="font-semibold">{fertility.verifiedTest.k} mg/L</p></div>
            </div>
            {fertility.verifiedTest.limeRequirement !== undefined ? <p><span className="text-fr-ink-600">Lime requirement:</span> <strong>{fertility.verifiedTest.limeRequirement} t/ha</strong></p> : null}
            {previousTests.length > 0 ? <div className="border-t border-fr-border pt-3"><p className="text-xs font-semibold text-fr-ink-600">Earlier tests</p>{previousTests.map((test) => <p key={`${test.sampleRef}-${test.sampleDate}`} className="mt-1 text-xs text-fr-ink-600">{test.sampleDate} · {test.laboratory} · {test.sampleRef}</p>)}</div> : null}
            <Link href={fieldWorkspaceHref(field.id, "nutrients")} className="font-semibold text-fr-green-700 underline underline-offset-2">Manage soil evidence in this field →</Link>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
