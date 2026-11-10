import type { ReactNode } from "react";
import Link from "next/link";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { loadRecordBooks } from "@/lib/farm-data/record-books";
import { addDays, isIsoDate } from "@/domain/farm-calendar";
import { FEED_TYPE_LABEL, HEALTH_KIND_LABEL, RATE_UNIT_LABEL, formatRecordDate as fmt, nitratesReadiness, sblasReadiness } from "@/domain/farm-records";
import { signedEvidenceUrls } from "@/lib/farm-data/record-evidence";
import { PrintButton } from "@/components/records/PrintButton";

/**
 * Printable audit pack: Bord Bia SBLAS (last six months by default) or
 * Nitrates (calendar year by default), laid out under the record headings
 * an auditor or inspector checks. Print or save as PDF from the browser.
 */
export default async function AuditPackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pack = sp.pack === "nitrates" ? "nitrates" : "sblas";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
  const defFrom = pack === "sblas" ? addDays(today, -182) : `${today.slice(0, 4)}-01-01`;
  const from = typeof sp.from === "string" && isIsoDate(sp.from) ? sp.from : defFrom;
  const to = typeof sp.to === "string" && isIsoDate(sp.to) && sp.to >= from ? sp.to : today;

  const farm = await getFarmForCurrentUser();
  if (!farm) return <p className="p-6 text-sm">Sign in to see your audit pack.</p>;
  const b = await loadRecordBooks(farm.id, from, to);
  const readiness = (pack === "sblas" ? sblasReadiness : nitratesReadiness)({ today: to, dates: b.dates, notUsed: b.notUsed });
  const opName = new Map(b.operators.map((o) => [o.id, o]));
  const groupName = new Map(b.groups.map((g) => [g.id, g.name]));
  const county = (farm as unknown as { location?: { county?: string } }).location?.county;
  const sprayPhotos = new Map(b.sprays.filter((s) => s.evidencePath).map((s) => [s.evidencePath as string, `${fmt(s.appliedOn)} · ${s.productName} label`]));
  const evidence: Array<{ path: string; caption: string }> = pack === "sblas" ? [
    ...b.feed.filter((f) => f.evidencePath).map((f) => ({ path: f.evidencePath as string, caption: `${fmt(f.receivedOn)} · ${f.product} docket` })),
    ...[...sprayPhotos].map(([path, caption]) => ({ path, caption })),
    ...b.health.filter((h) => h.evidencePath).map((h) => ({ path: h.evidencePath as string, caption: `${fmt(h.occurredOn)} · knackery receipt${h.disposalRef ? ` ${h.disposalRef}` : ""}` })),
  ] : [];
  const urls = await signedEvidenceUrls(evidence.map((e) => e.path));
  const shown = evidence.filter((e) => urls.has(e.path));

  return (
    <article className="mx-auto max-w-4xl space-y-8 bg-white p-4 text-fr-ink-900 print:p-0">
      <style>{"@media print { nav, aside, header, .fr-no-print { display: none !important; } body { background: #fff !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }"}</style>
      <div className="fr-no-print flex items-center justify-between gap-3">
        <Link href="/records" className="text-sm font-semibold text-fr-green-700">Back to Records</Link>
        <div className="flex gap-2">
          <Link href={`/records/audit-pack?pack=${pack === "sblas" ? "nitrates" : "sblas"}`} className="min-h-10 rounded-full border border-fr-v2-cream-rule px-4 py-2 text-sm font-semibold">{pack === "sblas" ? "Nitrates pack" : "Bord Bia pack"}</Link>
          <PrintButton />
        </div>
      </div>

      <header className="border-b border-fr-v2-cream-rule pb-4">
        <h1 className="font-display text-[28px] leading-tight">{pack === "sblas" ? "Bord Bia SBLAS records" : "Nitrates records"}</h1>
        <p className="mt-1 text-sm">{(farm as unknown as { name?: string }).name ?? "Farm"}{county ? `, ${county}` : ""}</p>
        <p className="text-sm text-fr-ink-600">Period {fmt(from)} to {fmt(to)} · generated {fmt(today)} from Farm Return</p>
      </header>

      <Section title="Readiness">
        <Table head={["Record", "Status"]} rows={readiness.items.map((i) => [i.label, i.detail])} empty="" />
      </Section>

      {pack === "sblas" ? (
        <>
          <Section title="Animal remedy purchases">
            <Table head={["Date", "Medicine", "Quantity", "Batch", "Supplier", "Vet"]} empty="No purchases recorded in this period."
              rows={b.medicines.map((m) => [fmt(m.dateReceived), m.productName, String(m.quantity), m.batchNumber ?? "", `${m.supplierName}${m.supplierAddress ? `, ${m.supplierAddress}` : ""}`, m.vetName ?? ""])} />
          </Section>
          <Section title="Animal remedy usage">
            <Table head={["Date", "Medicine", "Batch", "Animals", "Dose", "Withdrawal ends", "Given by", "Prescribed by"]} empty={b.notUsed.treatments ? `No remedies used (confirmed ${fmt(b.notUsed.treatments)}).` : "No treatments recorded in this period."}
              rows={b.treatments.map((t) => [fmt(t.treatedOn), t.productName, t.batchNumber ?? "", `${t.animalCount}${t.livestockGroupId ? ` in ${groupName.get(t.livestockGroupId) ?? "a group"}` : ""}${t.animalTags ? ` (${t.animalTags})` : ""}`, `${t.dose} ${t.doseUnit}`, t.withdrawalMeatDays ? fmt(t.withdrawalEndsOn) : "None", t.administeredBy, t.prescribedBy ?? ""])} />
          </Section>
          <Section title="Mortality and significant health issues">
            <Table head={["Date", "What", "Animal", "Details", "Vet", "Disposal"]} empty={b.notUsed.health ? `Nothing to record (confirmed ${fmt(b.notUsed.health)}).` : "Nothing recorded in this period."}
              rows={b.health.map((h) => [fmt(h.occurredOn), HEALTH_KIND_LABEL[h.kind], h.animalTag ?? `${h.animalCount}${h.livestockGroupId ? ` in ${groupName.get(h.livestockGroupId) ?? "a group"}` : ""}`, h.description, h.vetSeen ? "Yes" : "No", h.disposal === "knackery" ? `Knackery${h.disposalRef ? ` ${h.disposalRef}` : ""}` : h.disposal === "other" ? `Other${h.disposalRef ? ` ${h.disposalRef}` : ""}` : ""])} />
          </Section>
          <Section title="Animal movements between fields">
            <Table head={["Moved in", "Group", "Field", "Head", "Moved out"]} empty="No moves recorded in this period."
              rows={b.moves.map((m) => [fmt(m.date), m.groupName, m.fieldName, String(m.headCount), m.endedOn ? fmt(m.endedOn) : "Still there"])} />
            <p className="mt-2 text-xs text-fr-ink-600">Movements on and off the holding are on the herd register (AgFood).</p>
          </Section>
          <Section title="Feed purchases and home-grown feed">
            <Table head={["Date", "Feed", "Type", "Quantity", "Batch", "Supplier", "For"]} empty="No feed recorded in this period."
              rows={b.feed.map((f) => [fmt(f.receivedOn), f.product, FEED_TYPE_LABEL[f.feedType], `${f.quantity} ${f.unit}`, f.batchNumber ?? "", f.homeGrown ? "Grown on this farm" : `${f.supplierName}${f.supplierAddress ? `, ${f.supplierAddress}` : ""}`, f.livestockGroupId ? groupName.get(f.livestockGroupId) ?? "" : "Whole farm"])} />
          </Section>
          <Section title="Pesticide application record">
            <Table head={["Date", "Field (LPIS)", "Crop", "Product", "PCS no.", "Area ha", "Rate", "Water L/ha", "Reason", "Applied by (PU no.)"]} empty={b.notUsed.pesticides ? `No pesticides used (confirmed ${fmt(b.notUsed.pesticides)}).` : "No applications recorded in this period."}
              rows={b.sprays.map((s) => {
                const o = opName.get(s.operatorId);
                return [fmt(s.appliedOn), `${s.fieldName ?? ""}${s.lpisRef ? ` (${s.lpisRef})` : ""}`, s.cropSituation, s.productName, s.pcsNumber, String(s.areaHa), `${s.rate} ${RATE_UNIT_LABEL[s.rateUnit]}`, s.waterLHa === null ? "" : String(s.waterLHa), s.reason, o ? `${o.name} (${o.puNumber})${o.isContractor && o.address ? `, ${o.address}` : ""}` : ""];
              })} />
          </Section>
          <Section title="Kept outside Farm Return">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Herd register, passports and blue cards (AgFood)</li>
              <li>Animal health plan</li>
              <li>Farm safety risk assessment</li>
              <li>Waste plastic collection receipts</li>
              <li>Original feed dockets and knackery receipts (photos are in the appendix below)</li>
            </ul>
          </Section>
          {shown.length ? (
            <Section title="Appendix: docket, label and receipt photos">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {shown.map((e) => (
                  <figure key={e.path} className="break-inside-avoid">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage link */}
                    <img src={urls.get(e.path)} alt={e.caption} className="w-full rounded border border-fr-v2-cream-rule object-contain" />
                    <figcaption className="mt-1 text-xs text-fr-ink-600">{e.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      ) : (
        <>
          <Section title="Slurry spread">
            <Table head={["Date", "Field", "Volume m³"]} empty={b.notUsed.slurry ? `No slurry spread (confirmed ${fmt(b.notUsed.slurry)}).` : "No slurry spreading recorded in this period."}
              rows={b.slurry.map((s) => [fmt(s.date), s.fieldName, s.volumeM3 === null ? "" : String(Math.round(s.volumeM3))])} />
          </Section>
          <Section title="Kept outside Farm Return">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Imports and exports of organic fertiliser, declared on AgFood within 4 days</li>
              <li>Chemical fertiliser purchases (national fertiliser database)</li>
            </ul>
          </Section>
        </>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mb-2 font-display text-[20px]">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-fr-ink-600">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead><tr>{head.map((h) => <th key={h} className="border-b border-fr-ink-400 px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-fr-v2-cream-rule px-2 py-1.5 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
