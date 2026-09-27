"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SlurryPlanForm } from "@/components/farm/SlurryPlanForm";
import { SlurryPlanLifecycle } from "@/components/farm/SlurryPlanLifecycle";

/**
 * The farmer's slurry plan. Phase 1B: current, reserved and unallocated
 * slurry, each planned spreading with edit / cancel / mark as spread, and
 * the history of completed and cancelled plans (`SlurryPlanLifecycle`).
 * Below it, the planning entry — also reached from What Matters' "Plan
 * slurry spreading" — which creates one real field allocation, then
 * returns to Today, which re-evaluates What Matters against the persisted
 * data.
 */
export default function SlurryPlanPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Slurry plan" subtitle="What's in your tanks, what's planned and what's been spread" />
      <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col gap-4">
        <Link href="/today" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-fr-green-700">
          <ArrowLeft className="size-4" />
          Back to Today
        </Link>
        <div className="lg:hidden">
          <h1 className="font-display text-title text-fr-ink-900">Slurry plan</h1>
        </div>
        <SlurryPlanLifecycle />
        <section aria-labelledby="plan-slurry-spreading-heading" className="flex flex-col gap-3">
          <h2 id="plan-slurry-spreading-heading" className="text-base font-semibold text-fr-ink-900">
            Plan slurry spreading
          </h2>
          <p className="text-sm text-fr-ink-600">
            Tell Farm Return where you plan to spread slurry. Once it&apos;s saved, What Matters checks the plan and shows the next step — it
            won&apos;t recommend spreading unless the evidence supports it.
          </p>
          <SlurryPlanForm onSaved={() => router.push("/today")} />
        </section>
      </div>
    </>
  );
}
