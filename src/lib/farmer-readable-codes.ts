/**
 * Pilot acceptance repair — farmer-facing wording for the machine codes that some shared prompt copy carries (the
 * closed-period consequence is written by the frozen calendar with its material code and MM-DD dates). Presentation
 * only: the stored prompt, the legal rule and every identifier stay exactly as they are; this rewrites just the text a
 * farmer reads on Plan (and wherever a prompt description is shown).
 */
const MATERIAL_LABELS: Readonly<Record<string, string>> = {
  organic_fertiliser_other_than_FYM: "slurry and other organic fertiliser (not farmyard manure)",
  chemical_fertiliser: "chemical fertiliser",
  farmyard_manure: "farmyard manure",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayMonth(mm: string, dd: string): string | null {
  const m = Number(mm);
  const d = Number(dd);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${d} ${MONTHS[m - 1]}` : null;
}

export function farmerReadableText(text: string): string {
  let out = text;
  for (const [code, label] of Object.entries(MATERIAL_LABELS)) out = out.split(code).join(label);
  // A closed-period window written as "(MM-DD - MM-DD)" → "(15 Sep – 29 Jan)".
  out = out.replace(/\((\d{2})-(\d{2}) - (\d{2})-(\d{2})\)/g, (whole, m1: string, d1: string, m2: string, d2: string) => {
    const from = dayMonth(m1, d1);
    const to = dayMonth(m2, d2);
    return from && to ? `(${from} – ${to})` : whole;
  });
  return out;
}
