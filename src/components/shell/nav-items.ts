import {
  Home,
  Map,
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
  Target,
  Store,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Farm Spatial V2 — an approved primary destination with no route yet.
   * Rendered as a visibly disabled, non-navigating item carrying this
   * honest note, never a link to a missing page. */
  placeholderNote?: string;
}

/**
 * Farm Spatial V2 (Phase 2 shell) — the approved primary navigation:
 * Farm · What Matters · Plan · Market · Finance
 * (`design/farm-spatial-v2/DESIGN_CONTRACT.md`;
 * `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §2).
 *
 * - Farm → `/today`, the map-led screen that owns `MapHero` and every
 *   Today producer, now composed as the Farm Spatial V2 shell.
 * - What Matters → no route exists yet; the What Matters pilot still
 *   renders on Farm. A disabled placeholder until a scoped task builds
 *   the route.
 * - Plan → `/plan`; Market → `/quotes` (`/market-prices` stays under
 *   More); Finance → `/finance`.
 *
 * Nothing from the previous primary set (Today/Farm/Plan/Supports/
 * Records) is dropped: the field list `/fields`, Supports and Records
 * move to the head of More (`PRODUCT_RULES.md`: never remove an approved
 * screen without explicit instruction).
 */
export const primaryNavItems: NavItem[] = [
  { href: "/today", label: "Farm", icon: Map },
  { href: "/what-matters", label: "What Matters", icon: Target, placeholderNote: "Coming soon — What matters now is on Farm" },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/quotes", label: "Market", icon: Store },
  { href: "/finance", label: "Finance", icon: BarChart3 },
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
  { href: "/fields", label: "Fields", icon: Map },
  { href: "/supports", label: "Supports", icon: HandCoins },
  { href: "/records", label: "Records", icon: Folder },
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
