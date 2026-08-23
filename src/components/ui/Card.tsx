import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Base soft card surface used across every module — see
 * design/design-system.md "Radii & elevation". Rounded, low-elevation,
 * white surface, subtle neutral border.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // min-w-0 keeps a card from forcing its flex/grid parent wider than
        // the viewport when a child (e.g. the Upcoming Timeline's wide
        // table) has its own intrinsic min-width — the card's own
        // overflow-x-auto then scrolls internally instead.
        "min-w-0 rounded-fr-card border border-fr-border bg-fr-surface p-5 shadow-fr-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-center justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-fr-ink-900", className)} {...props} />;
}
