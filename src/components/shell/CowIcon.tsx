import type { SVGProps } from "react";

/** Full side-profile cattle silhouette used by the Farm Return shell. */
export function CowIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
      {...props}
    >
      <path d="M1.03 7.29 1.11 8.16 1.89 8.71 3.41 8.50 5.96 9.02 7.29 11.02 8.29 14.05 10.20 15.35 10.64 18.76 9.84 21.86 11.39 21.71 12.02 17.64 12.44 20.21 11.89 21.74 13.58 21.74 13.96 20.47 13.52 17.92 14.07 14.89 15.46 14.75 19.86 16.02 23.66 13.73 24.57 17.49 23.08 21.65 24.85 21.65 26.79 16.10 27.79 19.05 27.29 21.80 29.17 21.60 29.23 15.58 28.53 13.39 29.28 9.40 29.67 16.31 29.86 16.08 30.53 17.09 30.97 14.37 30.11 11.88 29.95 6.60 29.37 5.35 28.37 4.57 26.37 4.28 18.65 5.44 10.97 4.83 7.26 3.99 7.45 2.81 5.90 3.10 4.93 2.00Z" />
    </svg>
  );
}
