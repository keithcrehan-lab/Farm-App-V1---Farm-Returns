const LEGEND: { label: string; className: string }[] = [
  { label: "Grazing", className: "bg-fr-good" },
  { label: "Silage", className: "bg-fr-map-silage" },
  { label: "Tillage", className: "bg-fr-attention" },
  { label: "Other", className: "bg-fr-ink-400" },
];

/** Field-map land-use legend — design-system.md component inventory. */
export function MapLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fr-ink-600">
      {LEGEND.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
