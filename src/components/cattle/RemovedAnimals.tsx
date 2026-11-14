"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreRealAnimal } from "@/app/(app)/cattle/real-actions";
export function RemovedAnimals({ animals }: { animals: { id: string; tagNumber: string | null; deletedAt: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (!animals.length) return null;
  return <details className="mt-6 rounded-2xl border border-stone-200 p-4">
    <summary className="cursor-pointer font-semibold text-green-900">Recently removed animals ({animals.length})</summary>
    <p className="my-3 text-sm text-stone-600">Restore a mistakenly removed animal within 30 days. Its previous records will be retained.</p>
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {animals.map((animal) => <div key={animal.id} className="flex items-center justify-between gap-3 border-t py-3">
      <span className="text-sm">{animal.tagNumber || "Unnamed animal"}</span>
      <button type="button" disabled={pending} className="min-h-11 rounded-full border border-green-800 px-4 text-sm font-semibold text-green-900" onClick={() => start(async () => {
        const result = await restoreRealAnimal(animal.id);
        if (result.ok) router.refresh(); else setError(result.message);
      })}>Restore</button>
    </div>)}
  </details>;
}
