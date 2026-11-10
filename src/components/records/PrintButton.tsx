"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-fr-green-700 px-4 text-sm font-semibold text-white">
      <Printer className="size-4" aria-hidden />Print or save PDF
    </button>
  );
}
