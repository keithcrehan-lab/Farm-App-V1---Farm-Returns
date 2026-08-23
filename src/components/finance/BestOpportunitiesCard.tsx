import { ChevronRight, Sprout, Star, TriangleAlert, Users } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { toneClasses, type StatusTone } from "@/lib/status";
import { mockOpportunities } from "@/data/mock-farm";
import type { OpportunityLine } from "@/domain/types";

const KIND_STYLE: Record<OpportunityLine["kind"], { icon: React.ComponentType<{ className?: string }>; tone: StatusTone }> = {
  savings: { icon: Sprout, tone: "good" },
  buying_group: { icon: Users, tone: "attention" },
  risk: { icon: TriangleAlert, tone: "risk" },
};

export function BestOpportunitiesCard() {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Star} tone="good" />
          <div>
            <CardTitle>Best opportunities</CardTitle>
            <p className="text-xs text-fr-ink-600">Actionable ideas to improve your profit</p>
          </div>
        </span>
      </CardHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {mockOpportunities.map((opp) => {
          const style = KIND_STYLE[opp.kind];
          const t = toneClasses[style.tone];
          return (
            <div key={opp.id} className={`flex items-start gap-2 rounded-fr-control p-3 ${t.bg}`}>
              <style.icon className={`mt-0.5 size-4 shrink-0 ${t.text}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${t.text}`}>{opp.title}</p>
                <p className="text-xs text-fr-ink-600">{opp.description}</p>
              </div>
              <ChevronRight className={`mt-0.5 size-4 shrink-0 ${t.text}`} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
