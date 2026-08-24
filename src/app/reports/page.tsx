import { Download, FileSpreadsheet, FileText, Leaf, Sprout } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";

const REPORTS = [
  {
    id: "farm-plan",
    icon: FileText,
    title: "Farm Plan Summary",
    description: "Field-by-field land use, soil status and planned operations for the season.",
    lastGenerated: "Not yet generated",
  },
  {
    id: "financial-summary",
    icon: FileSpreadsheet,
    title: "Financial Summary",
    description: "Whole-farm revenue, costs, margin and cashflow — the Finance page as a downloadable report.",
    lastGenerated: "Not yet generated",
  },
  {
    id: "nutrient-plan",
    icon: Leaf,
    title: "Nutrient Plan Report",
    description: "Per-field N/P/K requirement, organic offset and purchased fertiliser, for compliance records.",
    lastGenerated: "Not yet generated",
  },
  {
    id: "soil-test-history",
    icon: Sprout,
    title: "Soil Test History",
    description: "Verified lab results and fertility-assumption changes across every mapped field.",
    lastGenerated: "Not yet generated",
  },
];

export default function ReportsPage() {
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
              <span className="text-xs text-fr-ink-400">{report.lastGenerated}</span>
              <button
                type="button"
                disabled
                title="Report generation arrives once the relevant domain engine is live"
                className="flex items-center gap-1.5 rounded-full border border-fr-border px-3 py-1.5 text-xs font-medium text-fr-ink-400"
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
