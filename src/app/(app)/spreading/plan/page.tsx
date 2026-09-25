"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SlurryPlanForm } from "@/components/farm/SlurryPlanForm";

/**
 * Slurry planning entry — reached from What Matters' "Plan slurry
 * spreading" when slurry is available, spreading is open and nothing is
 * planned yet. Saving creates one real field allocation, then returns to
 * Today, which re-evaluates What Matters against the persisted data.
 */
export default function SlurryPlanPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Plan slurry spreading" subtitle="Where, how much, how and when you plan to spread" />
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Link href="/today" className="inline-flex items-center gap-1 self-start text-sm font-semibold text-fr-green-700">
          <ArrowLeft className="size-4" />
          Back to Today
        </Link>
        <div className="lg:hidden">
          <h1 className="font-display text-title text-fr-ink-900">Plan slurry spreading</h1>
        </div>
        <p className="text-sm text-fr-ink-600">
          Tell Farm Return where you plan to spread slurry. Once it&apos;s saved, What Matters checks the plan and shows the next step — it
          won&apos;t recommend spreading unless the evidence supports it.
        </p>
        <SlurryPlanForm onSaved={() => router.push("/today")} />
      </div>
    </>
  );
}
