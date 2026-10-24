import { redirect } from "next/navigation";

/**
 * Pilot Integration P3 (DECISIONS D14) — Cattle is the one cattle destination. The former Livestock screen's
 * management (groups, headcounts, housing links, adding animals) now lives at Cattle → Manage herd, so an old link or
 * bookmark lands there. `/cattle/manage` never redirects back, so there is no loop. The group economics screen
 * (`/livestock/[groupId]`) is kept as it was, reached from Manage herd's group cards.
 */
export default function LivestockPage() {
  redirect("/cattle/manage");
}
