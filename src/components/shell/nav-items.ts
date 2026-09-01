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
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Farm Return Next v1.1 §4/§18 — the canonical primary navigation, now
 * with an approved visual reference (`media/image1.png`'s bottom nav row:
 * Today/Farm/Plan/Records/More), unblocking the cutover
 * `docs/farm-return-next/BUILD_STATE.json` had recorded as waiting on
 * exactly this ("Vertical E... final visual implementation blocked on an
 * approved design reference"). "Farm" points at the existing real field
 * map/exploration screen (`/fields`) as this build's honest interim for
 * canonical screen #2 — full Farm/Field-exploration (tabs, satellite,
 * constraints) is `BUILD_PLAN.md`'s Vertical E/Phase 3, not yet built;
 * see `docs/overnight/IMPLEMENTATION_MATRIX.md`.
 */
export const primaryNavItems: NavItem[] = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/fields", label: "Farm", icon: Map },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/records", label: "Records", icon: Folder },
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
  { href: "/nutrients", label: "Fertiliser Plan", icon: FlaskConical },
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
