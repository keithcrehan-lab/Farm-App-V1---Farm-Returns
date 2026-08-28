"use client";

import { useState } from "react";
import { Check, Cloud, Database, LogOut, MapPin, Ruler, Sliders, User } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { useFarm, useFarmActions } from "@/store/farm-store";
import { signOut } from "@/app/actions/auth";

const INTEGRATIONS = [
  { id: "teagasc", label: "Teagasc rule sets", description: "Nutrient advice, silage and finishing evidence base" },
  { id: "met-eireann", label: "Met Éireann", description: "Rainfall, soil temperature and SMD data for Spreading" },
  { id: "isis", label: "Irish Soil Information System", description: "Mapped soil association and drainage class" },
  { id: "mapping", label: "Satellite mapping provider", description: "Live field imagery (no provider configured yet)" },
];

const PRICE_SOURCES: { id: string; label: string; options: string[] }[] = [
  { id: "fertiliser", label: "Fertiliser price source", options: ["Public benchmark (CSO)", "My supplier quote"] },
  { id: "feed", label: "Feed price source", options: ["Public benchmark (CSO)", "My merchant contract price"] },
  { id: "cattle", label: "Cattle price source", options: ["Public benchmark (Bord Bia)", "My mart/factory price"] },
];

export function SettingsPageClient({
  userEmail,
  supabaseConfigured,
}: {
  userEmail: string | null;
  supabaseConfigured: boolean;
}) {
  const farm = useFarm();
  const { updateFarmProfile } = useFarmActions();
  const [dataSharing, setDataSharing] = useState(true);
  const [demandAggregation, setDemandAggregation] = useState(true);
  const [priceSource, setPriceSource] = useState<Record<string, string>>({
    fertiliser: PRICE_SOURCES[0].options[0],
    feed: PRICE_SOURCES[1].options[0],
    cattle: PRICE_SOURCES[2].options[0],
  });

  const [nameInput, setNameInput] = useState(farm.name);
  const [ownerInput, setOwnerInput] = useState(farm.ownerName);
  const [countyInput, setCountyInput] = useState(farm.location.county);
  const [saved, setSaved] = useState(false);

  // Keep the form in sync if the store changes underneath it — e.g. the
  // one-time post-mount rehydration from localStorage. This is the
  // "adjusting state when a prop changes" pattern (React docs: You Might
  // Not Need An Effect) rather than an effect, so it resets synchronously
  // during render instead of after an extra paint.
  const [syncedFarm, setSyncedFarm] = useState(farm);
  if (farm !== syncedFarm) {
    setSyncedFarm(farm);
    setNameInput(farm.name);
    setOwnerInput(farm.ownerName);
    setCountyInput(farm.location.county);
  }

  const dirty = nameInput !== farm.name || ownerInput !== farm.ownerName || countyInput !== farm.location.county;

  function handleSave() {
    updateFarmProfile({ name: nameInput, ownerName: ownerInput, county: countyInput });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="text-title text-fr-ink-900">Settings</h1>
        <p className="text-sm text-fr-ink-600">Farm profile, units, data permissions, integrations</p>
      </div>
      <PageHeader title="Settings" subtitle="Farm profile, units, data permissions, integrations, source preferences" />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <span className="flex items-center gap-3">
              <IconChip icon={User} tone="good" />
              <CardTitle>Account</CardTitle>
            </span>
          </CardHeader>
          {userEmail ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-fr-ink-900">{userEmail}</p>
                <p className="text-xs text-fr-ink-600">Signed in</p>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-fr-control border border-fr-border px-3 py-2 text-sm font-medium text-fr-ink-900 transition-colors hover:bg-fr-surface-alt"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-fr-ink-600">
              {supabaseConfigured
                ? "Not signed in."
                : "Account system not yet connected — this environment has no Supabase project configured (docs/real-farm-v1/BUILD_LOG.md, Phase 2)."}
            </p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <span className="flex items-center gap-3">
              <IconChip icon={User} tone="good" />
              <CardTitle>Farm profile</CardTitle>
            </span>
          </CardHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-fr-ink-600">Farm name</span>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-fr-ink-600">Owner name</span>
              <input
                type="text"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs text-fr-ink-600">
                <MapPin className="size-3.5" />
                County
              </span>
              <input
                type="text"
                value={countyInput}
                onChange={(e) => setCountyInput(e.target.value)}
                className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-fr-ink-600">Primary enterprise</span>
              <input
                type="text"
                defaultValue="Suckler beef"
                className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
              />
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <span className="flex items-center gap-3">
              <IconChip icon={Ruler} tone="good" />
              <CardTitle>Units</CardTitle>
            </span>
          </CardHeader>
          <p className="text-sm text-fr-ink-600">
            Metric (ha, kg, °C) — the only unit system supported for Irish farms.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <span className="flex items-center gap-3">
              <IconChip icon={Database} tone="good" />
              <CardTitle>Data permissions</CardTitle>
            </span>
          </CardHeader>
          <div className="flex flex-col divide-y divide-fr-border">
            <ToggleRow
              label="Share anonymised data for regional benchmarking"
              description="Helps Farm Return produce farm comparisons without identifying your farm."
              checked={dataSharing}
              onChange={setDataSharing}
            />
            <ToggleRow
              label="Allow bulk-buy demand aggregation"
              description="Include your confirmed Input Planner quantities in regional buying-group totals."
              checked={demandAggregation}
              onChange={setDemandAggregation}
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <span className="flex items-center gap-3">
              <IconChip icon={Cloud} tone="good" />
              <CardTitle>Integrations</CardTitle>
            </span>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-fr-border">
            {INTEGRATIONS.map((integration) => (
              <li key={integration.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fr-ink-900">{integration.label}</p>
                  <p className="text-xs text-fr-ink-600">{integration.description}</p>
                </div>
                <Pill tone="neutral" className="shrink-0">
                  Not connected
                </Pill>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <span className="flex items-center gap-3">
              <IconChip icon={Sliders} tone="good" />
              <CardTitle>Source preferences</CardTitle>
            </span>
          </CardHeader>
          <p className="mb-3 text-xs text-fr-ink-600">
            Which price source is active for each input — see spec §8/§15 price provenance.
          </p>
          <div className="flex flex-col gap-3">
            {PRICE_SOURCES.map((source) => (
              <label key={source.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-fr-ink-900">{source.label}</span>
                <select
                  value={priceSource[source.id]}
                  onChange={(e) => setPriceSource((prev) => ({ ...prev, [source.id]: e.target.value }))}
                  className="rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900 sm:w-64"
                >
                  {source.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Card>

        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="flex items-center justify-center gap-1.5 rounded-fr-control bg-fr-green-700 py-3 text-sm font-semibold text-white transition-colors disabled:bg-fr-green-700/40"
        >
          {saved ? (
            <>
              <Check className="size-4" />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fr-ink-900">{label}</p>
        <p className="text-xs text-fr-ink-600">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-fr-green-700" : "bg-fr-border"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
