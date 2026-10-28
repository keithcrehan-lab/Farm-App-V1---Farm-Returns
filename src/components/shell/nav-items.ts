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
  Warehouse,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Farm Spatial V2 — an approved primary destination with no route yet.
   * Rendered as a visibly disabled, non-navigating item carrying this
   * honest note, never a link to a missing page. */
  placeholderNote?: string;
  /** Other routes that belong to this destination (Farm owns its Fields
   * companion view), so the destination stays marked current there. */
  alsoActiveOn?: string[];
}

/** True when `pathname` is this item's route, one of its nested routes, or
 * a route it owns (`alsoActiveOn`). */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.alsoActiveOn ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * Farm + Fields redesign (2026-10-27,
 * `docs/design/farm-fields-high-fidelity-reference.md` "Global shell
 * direction"): the primary navigation is
 * Farm · Plan · Cattle · Housing · Finance · Records, plus More.
 *
 * - Farm → `/today`, the map-led home.
 * - Housing and Finance are first-level now (Finance leaves
 *   `pilotHiddenNavItems`; Housing leaves the legacy list).
 * - What Matters is no longer first-level. Its route and behaviour are
 *   unchanged and it heads More until the later Plan redesign absorbs it;
 *   Farm also reaches it through its quiet "What matters" disclosure.
 *
 * Earlier: Pilot Integration P4 (DECISIONS D15) used
 * Farm · What Matters · Plan · Cattle · Records. Nothing is dropped — every
 * other screen stays under More (`PRODUCT_RULES.md`: never remove an
 * approved screen without explicit instruction).
 */
export const primaryNavItems: NavItem[] = [
  { href: "/today", label: "Farm", icon: Map, alsoActiveOn: ["/fields"] },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/cattle", label: "Cattle", icon: Beef },
  { href: "/housing", label: "Housing", icon: Warehouse },
  { href: "/finance", label: "Finance", icon: BarChart3 },
  { href: "/records", label: "Records", icon: Folder },
];

/** Mobile keeps five slots: these four primary destinations plus More.
 * Housing and Finance lead the More sheet on mobile (`mobileMoreNavItems`)
 * so no primary destination is lost and the bar never overflows. */
const MOBILE_PRIMARY_HREFS = new Set(["/today", "/plan", "/cattle", "/records"]);

export const moreNavItems: NavItem[] = [
  // Transitional: What Matters stays reachable here until the Plan redesign.
  { href: "/what-matters", label: "What Matters", icon: Target },
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
 * in the pilot navigation, because they are outside the pilot or not finished for a signed-in farm: Dashboard
 * (superseded by Farm), Silage (demo plan only), Feed Optimiser and Input Planner. Finance moved to the primary
 * navigation in the Farm + Fields redesign. Nothing is deleted.
 */
export const pilotHiddenNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/silage", label: "Silage & Fields", icon: Wheat },
  { href: "/feed-optimiser", label: "Feed Optimiser", icon: Gauge },
  { href: "/input-planner", label: "Input Planner", icon: Package },
];

/** Mobile bottom nav — four primary items plus one "More" slot (not a
 * link, opens `MoreSheet`) — the reference's 5-icon row. */
export const mobileNavItems: NavItem[] = primaryNavItems.filter((item) => MOBILE_PRIMARY_HREFS.has(item.href));

/** Mobile More sheet — the primary destinations without a bottom-nav slot
 * first, then every `moreNavItems` destination. */
export const mobileMoreNavItems: NavItem[] = [...primaryNavItems.filter((item) => !MOBILE_PRIMARY_HREFS.has(item.href)), ...moreNavItems];
export const moreNavIcon = MoreHorizontal;

/** Desktop left rail — primary group first, then every legacy screen
 * behind `DesktopSidebar`'s compact "More" disclosure — order otherwise
 * unchanged from before this cutover. */
export const desktopNavItems: NavItem[] = moreNavItems;
