import Link from "next/link";

/**
 * Cattle — a signed-in farm's cattle view that can't be shown (no farm yet, the records couldn't be read, or a
 * capability Farm Return holds no evidence for). The words come from the real service (`REAL_UNAVAILABLE`); a
 * signed-in farmer never sees the demonstration herd, a fixture price or a synthetic figure in its place.
 */
export function CattleUnavailable({ title, detail, link }: { title: string; detail: string; link: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-2xl py-6" data-cattle-mode="REAL">
      <h1 className="font-display text-[40px] font-semibold leading-none tracking-tight text-fr-v2-graphite">Cattle</h1>
      <p className="mt-4 text-[17px] text-fr-v2-charcoal">{title}</p>
      <p className="mt-2 text-[15px] text-fr-v2-muted">{detail}</p>
      <Link href={link.href} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest hover:underline">
        {link.label}
      </Link>
    </div>
  );
}
