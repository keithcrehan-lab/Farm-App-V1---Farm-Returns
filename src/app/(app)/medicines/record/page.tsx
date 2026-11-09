import { MedicineRecordClient } from "./MedicineRecordClient";

export const dynamic = "force-dynamic";

export default async function MedicineRecordPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code.slice(0, 200) : "";
  return <MedicineRecordClient initialCode={code} />;
}
