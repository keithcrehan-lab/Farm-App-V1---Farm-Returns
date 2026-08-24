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
  ClipboardList,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Canonical mobile bottom nav — matches the Dashboard reference screen. */
export const mobileNavItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/soil", label: "Soil", icon: Sprout },
  { href: "/nutrients", label: "Nutrients", icon: FlaskConical },
  { href: "/spreading", label: "Spreading", icon: Tractor },
  { href: "/finance", label: "Finance", icon: BarChart3 },
];

/** Desktop left rail — order per design/design-system.md "Navigation structure". */
export const desktopNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/fields", label: "Farm Map", icon: Map },
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
