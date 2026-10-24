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
 * Pilot Integration P4 (DECISIONS D15) — the pilot primary navigation:
 * Farm · What Matters · Plan · Cattle · Records. What Matters is now a real
 * screen (`/what-matters`); Market moves under More; Finance is hidden from
 * the pilot navigation (`pilotHiddenNavItems`).
 *
 * Earlier (Farm Spatial V2 Phase 2 shell) primary navigation:
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
  { href: "/what-matters", label: "What Matters", icon: Target },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/cattle", label: "Cattle", icon: Beef },
  { href: "/records", label: "Records", icon: Folder },
];

export const moreNavItems: NavItem[] = [
  { href: "/fields", label: "Fields", icon: Map },
  { href: "/soil", label: "Soil", icon: Sprout },
  // Fertiliser Overview and Stock Visuals campaign — the farm-wide landing
  // page carries the "Fertiliser Plan" label; the per-field detailed plan
  // (`/nutrients`) is relabelled so the two aren't confused.
  { href: "/fertiliser-plan", label: "Fertiliser Plan", icon: FlaskConical },
  { href: "/nutrients", label: "Field Nutrient Plan", icon: FlaskConical },
  { href: "/spreading", label: "Spreading", icon: Tractor },
  { href: "/supports", label: "Supports", icon: HandCoins },
  { href: "/quotes", label: "Market", icon: Store },
  { href: "/market-prices", label: "Market Prices", icon: LineChart },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Pilot Integration P4 (DECISIONS D15) — screens kept and reachable by URL (and from in-app links) but not advertised
 * in the pilot navigation, because they are outside the pilot or not finished for a signed-in farm: Finance (full
 * profitability isn't in the pilot), Dashboard (superseded by Farm), Silage (demo plan only), Feed Optimiser and Input
 * Planner. Nothing is deleted.
 */
export const pilotHiddenNavItems: NavItem[] = [
  { href: "/finance", label: "Finance", icon: BarChart3 },
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/silage", label: "Silage & Fields", icon: Wheat },
  { href: "/feed-optimiser", label: "Feed Optimiser", icon: Gauge },
  { href: "/input-planner", label: "Input Planner", icon: Package },
];

/** Mobile bottom nav — the four primary items plus one "More" slot (not a
 * link, opens `MoreSheet`) — matches the reference's 5-icon row. */
export const mobileNavItems: NavItem[] = primaryNavItems;
export const moreNavIcon = MoreHorizontal;

/** Desktop left rail — primary group first, then every legacy screen
 * behind `DesktopSidebar`'s compact "More" disclosure — order otherwise
 * unchanged from before this cutover. */
export const desktopNavItems: NavItem[] = moreNavItems;
