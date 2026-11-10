import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { loadRecordBooks } from "@/lib/farm-data/record-books";
import { addDays } from "@/domain/farm-calendar";
import { activeWithdrawals } from "@/domain/farm-records";
import { PageHeader } from "@/components/shell/PageHeader";
import { RecordsHome } from "@/components/records/RecordsHome";

/**
 * Records: the farm book. Readiness for Bord Bia SBLAS and Nitrates, the
 * record books and the farm diary. The earlier activity and advice timeline
 * lives on at Settings → Advice history.
 */
export default async function RecordsPage() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
  const header = (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="font-display text-title text-fr-ink-900">Records</h1>
        <p className="text-sm text-fr-ink-600">Your farm book, ready for inspection</p>
      </div>
      <PageHeader title="Records" subtitle="Your farm book, ready for inspection" />
    </>
  );
  const empty = { diary: [], dates: {}, notUsed: {}, unavailable: [], fields: [], groups: [], operators: [], feed: [] };

  if (!isSupabaseConfigured()) return <>{header}<RecordsHome today={today} signedIn={false} {...empty} /></>;
  const farm = await getFarmForCurrentUser();
  if (!farm) return <>{header}<RecordsHome today={today} signedIn={false} {...empty} /></>;

  // Six months back covers the Bord Bia window; January covers Nitrates.
  const from = [addDays(today, -183), `${today.slice(0, 4)}-01-01`].sort()[0];
  const books = await loadRecordBooks(farm.id, from, today);
  const groupName = new Map(books.groups.map((g) => [g.id, g.name]));
  const seen = new Set<string>();
  const medicines = books.medicineStock
    .filter((m) => { const k = `${m.productName}|${m.batchNumber ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 40)
    .map((m) => ({ id: m.id, productName: m.productName, batchNumber: m.batchNumber ?? null, vetName: m.vetName ?? null }));
  const withdrawals = activeWithdrawals(books.treatments, today).map((t) => ({
    id: t.id, productName: t.productName, endsOn: t.withdrawalEndsOn,
    who: t.livestockGroupId ? groupName.get(t.livestockGroupId) ?? "A group" : t.animalTags ?? `${t.animalCount} animals`,
  }));
  return (
    <>
      {header}
      <RecordsHome
        today={today}
        signedIn
        diary={books.diary}
        dates={books.dates}
        notUsed={books.notUsed}
        unavailable={books.unavailable}
        fields={books.fields}
        groups={books.groups}
        operators={books.operators}
        feed={books.feed}
        medicines={medicines}
        withdrawals={withdrawals}
      />
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
