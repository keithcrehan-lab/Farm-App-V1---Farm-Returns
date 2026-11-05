import { redirect } from "next/navigation";

/**
 * Pilot Integration P3 (DECISIONS D14) — Cattle is the one cattle destination. An old Livestock link or
 * bookmark lands on Cattle → Add cattle (`/cattle/manage`), where new groups and animals are added; existing groups
 * are corrected in their own workspace (`/cattle/groups/<id>`). `/cattle/manage` never redirects back, so there is no
 * loop. The group economics screen (`/livestock/[groupId]`) is kept as it was, reached through plan action routes.
 */
export default function LivestockPage() {
  redirect("/cattle/manage");
}
