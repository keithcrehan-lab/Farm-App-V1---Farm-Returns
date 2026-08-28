"use client";

import { Scissors } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FieldIdentityRow } from "@/components/farm/FieldIdentityRow";
import { SilagePlanCard } from "@/components/farm/SilagePlanCard";
import { SilageNutrientCostCard } from "@/components/farm/SilageNutrientCostCard";
import { FeedValueCard } from "@/components/farm/FeedValueCard";
import { WholeFarmFeedBalanceCard } from "@/components/farm/WholeFarmFeedBalanceCard";
import { mockForageInventory, mockSilagePlans } from "@/data/mock-farm";
import { useFieldById, useHousingList, useSlurryAllocations } from "@/store/farm-store";

/**
 * Real Farm V1 Phase 10/11/19 — the real per-field silage plan/inventory
 * engine is a documented, investigated blocker (BUILD_LOG.md Phase 10: no
 * sourced yield model, no sourced fresh-to-DM conversion). This screen
 * still only has the one Phase 1 mock plan (`mockSilagePlans[0]`, tied to
 * the demo farm's "field-back") to show — a real signed-in farmer's own
 * fields will never match that id, so this became a silent blank page
 * rather than telling the farmer why. Two real fixes this pass, neither
 * of which requires the yield engine: an honest empty state instead of a
 * blank one, and a guard against a real crash (`useHousingList()[0]` on a
 * farm with zero housing yet — Phase 11's same class of bug as the
 * Housing screen).
 */
export default function SilagePage() {
  const plan = mockSilagePlans[0];
  const field = useFieldById(plan.fieldId);
  const slurryAllocations = useSlurryAllocations();
  const allocation = slurryAllocations.find((a) => a.fieldId === plan.fieldId);
  const housing = useHousingList()[0];

  if (!field) {
    return (
      <>
        <MobileDetailHeader title="Silage planning" backHref="/fields" />
        <PageHeader title="Silage & Fields" subtitle="Cuts, expected/actual yield, forage balance and cost" />
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <Scissors className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No silage plan for this farm yet</p>
          <p className="max-w-xs text-sm text-fr-ink-600">
            Real per-field silage planning is still being built (see docs/real-farm-v1/BUILD_LOG.md, Phase 10) — a real
            sourced yield model doesn&apos;t exist yet, so this screen can&apos;t safely show one for your own fields.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <MobileDetailHeader title="Silage planning" backHref="/fields" />
      <PageHeader title="Silage & Fields" subtitle="Cuts, expected/actual yield, forage balance and cost" />

      <div className="flex flex-col gap-4">
        <FieldIdentityRow field={field} />
        <SilagePlanCard plan={plan} field={field} />
        {housing ? (
          <SilageNutrientCostCard plan={plan} allocation={allocation} storageCapacityM3={housing.storageCapacityM3} />
        ) : null}
        <FeedValueCard plan={plan} field={field} />
        <WholeFarmFeedBalanceCard inventory={mockForageInventory} />
      </div>
    </>
  );
}
