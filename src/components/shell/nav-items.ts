import {
  Home,
  Map,
  CircleDollarSign,
  Sparkles,
  Sprout,
  Beef,
  Wheat,
  FlaskConical,
  Tractor,
  Gauge,
  Package,
  LineChart,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Folder,
  MoreHorizontal,
  Settings,
  HandCoins,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Farm Return Next v1.1 §4/§18 — the canonical primary navigation.
 * `media/image1.png`'s own bottom nav row (Today/Farm/Plan/Records/More)
 * unblocked the original cutover; **Supports** was added 2026-09-04 —
 * a deliberate product-owner override for the Supports Intelligence +
 * Farm Strategy phase, ahead of any equivalent approved reference image
 * (`docs/product/farm-return-next-v1.1/SUPPORTS_STRATEGY_CONTRACT.md`'s
 * own "product-owner navigation override" section) — inserted between
 * Plan and Records to match that instruction's own literal ordering.
 * The bottom nav now renders these five plus the existing "More" slot
 * (six icons total) rather than dropping "More"/any legacy screen
 * (`CLAUDE.md`: never remove an approved element without explicit
 * instruction) — seven-plus would need a genuine density redesign this
 * session didn't attempt.
 *
 * "Farm" points at the existing real field map/exploration screen
 * (`/fields`) as this build's honest interim for canonical screen #2 —
 * full Farm/Field-exploration (tabs, satellite, constraints) is
 * `BUILD_PLAN.md`'s Vertical E/Phase 3, not yet built; see
 * `docs/overnight/IMPLEMENTATION_MATRIX.md`.
 */
export const primaryNavItems: NavItem[] = [
  { href: "/farm", label: "Farm", icon: Map },
  { href: "/today", label: "What Matters", icon: Sparkles },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/market-prices", label: "Market", icon: LineChart },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
];

/**
 * Every screen this app already had before the v1.1 nav cutover, still
 * fully reachable — `CLAUDE.md`'s "never remove an approved screen
 * element or feature without explicit instruction" applied to this
 * checkpoint's own restructure. Not deleted, not merged away: relocated
 * under "More" (§4's own reference image shows this exact fifth slot),
 * since Today/Farm/Plan/Records now carry the primary IA these used to.
 */
export const moreNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/soil", label: "Soil", icon: Sprout },
  { href: "/livestock", label: "Livestock", icon: Beef },
  { href: "/silage", label: "Silage & Fields", icon: Wheat },
  // Fertiliser Overview and Stock Visuals campaign — the new farm-wide
  // landing page takes over the "Fertiliser Plan" label; the existing
  // per-field detailed plan (soil, NAP compliance, organic offset, "Plan
  // this application") is unchanged and fully reachable, just relabelled
  // here so the two aren't confused for the same screen (CLAUDE.md: never
  // remove an approved screen without explicit instruction — this only
  // relocates a nav label, `/nutrients` itself is untouched).
  { href: "/fertiliser-plan", label: "Fertiliser Plan", icon: FlaskConical },
  { href: "/nutrients", label: "Field Nutrient Plan", icon: FlaskConical },
  { href: "/spreading", label: "Spreading", icon: Tractor },
  { href: "/feed-optimiser", label: "Feed Optimiser", icon: Gauge },
  { href: "/input-planner", label: "Input Planner", icon: Package },
  { href: "/finance", label: "Finance", icon: BarChart3 },
  { href: "/market-prices", label: "Market Prices", icon: LineChart },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Mobile bottom nav — the four primary items plus one "More" slot (not a
 * link, opens `MoreSheet`) — matches the reference's 5-icon row. */
export const mobileNavItems: NavItem[] = primaryNavItems;
export const moreNavIcon = MoreHorizontal;

/** Desktop left rail — primary group first, then every legacy screen
 * under its own "More" heading (`DesktopSidebar` renders the section
 * break) — order otherwise unchanged from before this cutover. */
export const desktopNavItems: NavItem[] = moreNavItems;
