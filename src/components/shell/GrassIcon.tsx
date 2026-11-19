import type { SVGProps } from "react";

/** Original grass-blade silhouette for navigation, not a licensed stock asset. */
export function GrassIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M2.5 21h19" />
      <path d="M7.5 21C7 15.7 5.3 11.5 2.9 8.6c3.8 2.1 6.3 6.3 7.1 12.4" />
      <path d="M10.2 21C9.5 13.7 8.6 8.5 6.4 4.8c4.6 3.6 6.3 9.3 6.1 16.2" />
      <path d="M12.4 21C12.9 12.5 15.1 6.4 20.7 2.7c-3.4 5.2-4.7 11.3-4.7 18.3" />
      <path d="M15.3 21c1.1-6 3.4-9.5 6-11.4-1.7 3.2-2.8 7.3-3.1 11.4" />
    </svg>
  );
}
