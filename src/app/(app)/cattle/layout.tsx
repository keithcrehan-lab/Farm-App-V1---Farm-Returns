import { CattleDemoSessionProvider } from "@/components/cattle/session/CattleDemoSessionProvider";

/**
 * Cattle C10 — the cattle section. The demonstration session (local
 * demonstration mode only) lives in this layout so it survives client
 * navigation between herd, group, animal and plan; a reload clears it.
 */
export default function CattleLayout({ children }: { children: React.ReactNode }) {
  return <CattleDemoSessionProvider>{children}</CattleDemoSessionProvider>;
}
