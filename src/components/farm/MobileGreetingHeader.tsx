import { Sprout } from "lucide-react";
import { mockFarm } from "@/data/mock-farm";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function MobileGreetingHeader() {
  return (
    <header className="mb-5 flex items-center justify-between lg:hidden">
      <div>
        <span className="mb-1 flex items-center gap-1.5 text-fr-green-700">
          <Sprout className="size-5" />
          <span className="text-sm font-semibold">Farm Return</span>
        </span>
        <h1 className="text-title text-fr-ink-900">
          {greeting()}, {mockFarm.ownerName}
        </h1>
        <p className="text-sm text-fr-ink-600">Here&apos;s what&apos;s happening on your farm today.</p>
      </div>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fr-green-100 text-sm font-semibold text-fr-green-700">
        {mockFarm.ownerName[0]}
      </span>
    </header>
  );
}
