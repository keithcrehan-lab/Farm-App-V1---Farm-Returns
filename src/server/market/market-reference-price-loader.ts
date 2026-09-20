/**
 * Economic Opportunity Engine, Phase 3 — the one place database IO and
 * pure price-resolution methodology meet (brief §4). This function does
 * nothing but load a bounded candidate set from `market_price_observations`
 * and hand it to `resolveMarketReferencePrice` — no ranking, no
 * arithmetic, no decision logic lives here; all of that stays in
 * `src/domain/market-price-resolution.ts`, which never imports Supabase
 * and is fully testable with plain fixtures.
 *
 * Server-only by the same convention as this directory's other adapters
 * — a real service-role client in production
 * (`src/lib/supabase/service-role.ts`), an injected mock in tests.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { findObservationsByMappedProduct } from "./cso-fertiliser-repository";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "@/domain/market-price-resolution";
import type { EngineOutcome } from "@/domain/evidence";

export interface LoadMarketReferencePriceParams {
  mappedProduct: string;
  /** "YYYY-MM-DD" — see `market-price-resolution.ts`'s header. */
  asOfDate: string;
  knownAt?: string;
}

export async function loadMarketReferencePrice(
  client: SupabaseClient,
  params: LoadMarketReferencePriceParams,
): Promise<EngineOutcome<AuditableMarketPriceResolution>> {
  const candidates = await findObservationsByMappedProduct(client, params.mappedProduct);
  return resolveMarketReferencePrice({
    candidates,
    mappedProduct: params.mappedProduct,
    asOfDate: params.asOfDate,
    knownAt: params.knownAt,
  });
}
