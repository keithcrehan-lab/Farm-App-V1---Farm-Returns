import type { SVGProps } from "react";

/**
 * Farm Return fertiliser icon — a simplified FIBC/bulk fertiliser bag.
 * Kept deliberately bold and low-detail so the lifting loops, bag body
 * and plant/granule mark remain legible at the shell's 16px nav size.
 */
export function FertiliserBagIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      {...props}
    >
      {/* lifting loops */}
      <path d="M7.2 5.5 8.1 2.8c.2-.7.8-1.2 1.5-1.2.9 0 1.6.8 1.5 1.7l-.3 2.2" />
      <path d="m13.2 5.5-.3-2.2c-.1-.9.6-1.7 1.5-1.7.7 0 1.3.5 1.5 1.2l.9 2.7" />

      {/* bag body + reinforced sides */}
      <path d="M7.2 5.5c-1.4 1-2.3 2.5-2.5 4.2l-.8 8.5c-.2 2 1.4 3.8 3.5 3.8h9.2c2.1 0 3.7-1.8 3.5-3.8l-.8-8.5c-.2-1.7-1.1-3.2-2.5-4.2" />
      <path d="M7.2 5.5h9.6" />
      <path d="M7.5 6.3c-.7 3.9-.9 9-.5 14.8" />
      <path d="M16.5 6.3c.7 3.9.9 9 .5 14.8" />

      {/* sprout */}
      <path d="M12 16v-3.3" />
      <path d="M12 13.2c-1-1.9-2.4-2.8-4.3-2.8.2 1.9 1.3 3.2 3.3 3.7" />
      <path d="M12 13.2c1-1.9 2.4-2.8 4.3-2.8-.2 1.9-1.3 3.2-3.3 3.7" />

      {/* fertiliser granules */}
      <circle cx="9.6" cy="17.8" r=".55" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r=".55" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="17.8" r=".55" fill="currentColor" stroke="none" />
    </svg>
  );
}
