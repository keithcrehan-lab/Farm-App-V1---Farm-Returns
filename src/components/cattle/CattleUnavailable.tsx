import Link from "next/link";

/**
 * Cattle C10 — real-account state. No canonical cattle records are connected
 * (no persistence or adapter exists yet), so a signed-in farmer sees this —
 * never the demonstration herd, a fixture price or a synthetic figure.
 */
export function CattleUnavailable() {
  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="font-display text-[40px] font-semibold leading-none tracking-tight text-fr-v2-graphite">Cattle</h1>
      <p className="mt-4 text-[17px] text-fr-v2-charcoal">No canonical cattle records are connected to your farm yet.</p>
      <p className="mt-2 text-[15px] text-fr-v2-muted">
        Animal profiles, weights, work and plans appear here once your cattle records are connected. Nothing is estimated or filled in for you in the meantime.
      </p>
      <Link href="/livestock" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest hover:underline">
        Go to Livestock →
      </Link>
    </div>
  );
}
