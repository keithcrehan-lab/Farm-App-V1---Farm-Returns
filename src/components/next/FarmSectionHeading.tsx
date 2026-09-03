/**
 * Visual Acceptance Contract §7's `FarmSectionHeading` primitive — a
 * plain, uppercase-tracked section label (spec reference `media/image1.png`'s
 * own "TOMORROW"/"PLANNED WORK"/"OPPORTUNITIES" labels), used to separate
 * sections of one continuous flow instead of wrapping each section in its
 * own equal-weight bordered `Card` — the Visual Acceptance Contract's own
 * avoid-list item ("stacks of equal-weight white cards with no visual
 * hierarchy"). First real use: Plan (`src/app/(app)/plan/page.tsx`).
 */
export function FarmSectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fr-ink-400">{children}</h2>;
}
