"use client";

import { Download, FileSpreadsheet, FileText, Leaf, Sprout } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockSilagePlans } from "@/data/mock-farm";
import { useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { buildFarmPlanSummaryReportCsv, buildNutrientPlanReportCsv, buildSoilTestHistoryReportCsv } from "@/lib/reports";
import { downloadCsv } from "@/lib/csv";
import type { Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

interface ReportDef {
  id: string;
  icon: typeof FileText;
  title: string;
  description: string;
  /** undefined = this report's underlying domain engine isn't real yet
   * (currently just Financial Summary — mockFinanceSummary/mockCashflow
   * are still Phase 1 mock, so a real export of them would just be
   * exporting invented numbers with a CSV wrapper). */
  buildCsv?: (ctx: {
    fields: Field[];
    livestockGroups: LivestockGroup[];
    slurryAllocations: SlurryAllocation[];
  }) => string;
}

const REPORTS: ReportDef[] = [
  {
    id: "farm-plan",
    icon: FileText,
    title: "Farm Plan Summary",
    description: "Field-by-field land use, soil status and planned operations for the season.",
    buildCsv: ({ fields }) => buildFarmPlanSummaryReportCsv(fields),
  },
  {
    id: "financial-summary",
    icon: FileSpreadsheet,
    title: "Financial Summary",
    description: "Whole-farm revenue, costs, margin and cashflow — the Finance page as a downloadable report.",
  },
  {
    id: "nutrient-plan",
    icon: Leaf,
    title: "Nutrient Plan Report",
    description: "Per-field N/P/K requirement, organic offset and purchased fertiliser, for compliance records.",
    buildCsv: ({ fields, livestockGroups, slurryAllocations }) =>
      buildNutrientPlanReportCsv(fields, livestockGroups, slurryAllocations, mockSilagePlans),
  },
  {
    id: "soil-test-history",
    icon: Sprout,
    title: "Soil Test History",
    description: "Verified lab results and fertility-assumption changes across every mapped field.",
    buildCsv: ({ fields }) => buildSoilTestHistoryReportCsv(fields),
  },
];

export default function ReportsPage() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();

  function handleExport(report: ReportDef) {
    if (!report.buildCsv) return;
    const csv = report.buildCsv({ fields, livestockGroups, slurryAllocations });
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`${report.id}-${dateStamp}.csv`, csv);
  }

  return (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="text-title text-fr-ink-900">Reports</h1>
        <p className="text-sm text-fr-ink-600">Farm plans, financial summaries, nutrient reports, exports</p>
      </div>
      <PageHeader title="Reports" subtitle="Farm plans, financial summaries, nutrient reports, exports" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <IconChip icon={report.icon} tone="good" />
              <h3 className="text-base font-semibold text-fr-ink-900">{report.title}</h3>
            </div>
            <p className="text-sm text-fr-ink-600">{report.description}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-fr-ink-400">
                {report.buildCsv ? "Real farm data, generated on export" : "Not yet available"}
              </span>
              <button
                type="button"
                disabled={!report.buildCsv}
                onClick={() => handleExport(report)}
                title={
                  report.buildCsv
                    ? "Exports a real CSV built from this farm's current data"
                    : "Report generation arrives once the relevant domain engine is live — this one needs a real sales-plan/sales-log data source"
                }
                className="flex items-center gap-1.5 rounded-full border border-fr-border px-3 py-1.5 text-xs font-medium text-fr-ink-600 disabled:text-fr-ink-400"
              >
                <Download className="size-3.5" />
                Export
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
