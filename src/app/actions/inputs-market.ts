"use server";

/**
 * Inputs Market V1 — the farm-scoped read behind `/inputs-market`. Pure
 * composition of existing reads; every number comes from an existing
 * engine and is shaped by `src/domain/inputs-market.ts`:
 *  - Fertiliser: `getFertiliserPlanOverviewAction` reused verbatim (its
 *    canonical stock bands and aggregation), so this screen's "to buy"
 *    always equals the Fertiliser workspace and the RFQ prefill.
 *  - Feed: the farm's livestock groups and the cattle production plans,
 *    through `loadCattleOperationalView` (the same plan metrics the Cattle
 *    workspace shows).
 *
 * Each category fails independently: a feed read failure never hides the
 * fertiliser need, and vice versa. Farm identity is resolved server-side
 * by every underlying read; nothing here accepts a farm id.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { loadCattleOperationalView } from "@/server/cattle-real/operational-view";
import { getFertiliserPlanOverviewAction } from "./fertiliser-plan-overview";
import {
  INPUTS_MARKET_VERSION,
  buildFeedNeed,
  buildFertiliserNeedLines,
  fertiliserUpstreamDisclosure,
  summariseCategory,
  type CategoryNeedState,
  type FeedGroupInput,
  type InputsMarketView,
} from "@/domain/inputs-market";

const FEED_UNAVAILABLE = "Farm Return couldn't load your cattle plans right now — try again shortly.";
const FERTILISER_UNAVAILABLE = "Farm Return couldn't load your fertiliser plan right now — try again shortly.";

export async function getInputsMarketViewAction(planningSeason?: string): Promise<InputsMarketView> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("Inputs market: no farm for the current session");
  const asOfDate = new Date().toISOString().slice(0, 10);
  const season = planningSeason ?? asOfDate.slice(0, 4);

  const [fertiliser, feed] = await Promise.all([
    getFertiliserPlanOverviewAction(season).then(
      (overview) => ({ ok: true as const, overview }),
      (error: unknown) => {
        console.error("[inputs-market] fertiliser overview failed:", error);
        return { ok: false as const };
      },
    ),
    loadFeedGroups(farm.id, asOfDate),
  ]);

  const fertiliserNeed: CategoryNeedState = fertiliser.ok
    ? {
        status: "ready",
        summary: summariseCategory(
          "fertiliser",
          buildFertiliserNeedLines({ stockBands: fertiliser.overview.stockColumns, aggregation: fertiliser.overview.aggregation }),
          [],
          fertiliser.overview.aggregation.status === "INCOMPLETE",
        ),
        disclosure: fertiliserUpstreamDisclosure(fertiliser.overview.aggregation.status),
      }
    : { status: "unavailable", message: FERTILISER_UNAVAILABLE };

  const feedNeed: CategoryNeedState = feed.ok
    ? (() => {
        const { lines, gaps } = buildFeedNeed(feed.groups);
        return { status: "ready" as const, summary: summariseCategory("feed", lines, gaps), disclosure: null };
      })()
    : { status: "unavailable", message: FEED_UNAVAILABLE };

  return {
    version: INPUTS_MARKET_VERSION,
    planningSeason: fertiliser.ok ? fertiliser.overview.planningSeason : season,
    seasonLabel: fertiliser.ok ? fertiliser.overview.seasonLabel : season,
    needs: { fertiliser: fertiliserNeed, feed: feedNeed },
  };
}

async function loadFeedGroups(farmId: string, asOfDate: string): Promise<{ ok: true; groups: FeedGroupInput[] } | { ok: false }> {
  try {
    const groups = await listLivestockGroupsForFarm(farmId);
    const operational = await loadCattleOperationalView(farmId, groups, asOfDate);
    if (operational.state !== "OK") return { ok: false };
    const byId = new Map(operational.groups.map((view) => [view.groupId, view]));
    return {
      ok: true,
      groups: groups.flatMap((group) => {
        const view = byId.get(group.id);
        if (!view) return [];
        return [{ group, metrics: view.productionMetrics, ...(view.productionPlan ? { plan: view.productionPlan } : {}) }];
      }),
    };
  } catch (error) {
    console.error("[inputs-market] feed groups failed:", error);
    return { ok: false };
  }
}
