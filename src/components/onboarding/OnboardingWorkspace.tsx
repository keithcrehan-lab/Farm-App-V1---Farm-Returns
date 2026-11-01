"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, LocateFixed, Search } from "lucide-react";
import { establishFarmStep, addOnboardingFieldStep, finishOnboardingStep, lookupExactEircodeStep } from "@/app/actions/onboarding";
import { signOut } from "@/app/actions/auth";
import { computeBoundaryGeometry, isValidBoundaryPolygon } from "@/domain/field-boundary";
import type { Farm } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatHa } from "@/lib/format";
import { mapboxConfigured } from "@/lib/mapbox";
import { COUNTY_NAMES, FARM_TYPES, type OnboardingStage } from "@/lib/onboarding";
import { countyAt, normaliseEircode, searchPlaces, type PlaceResult } from "@/lib/onboarding-geocoding";
import { IRISH_COUNTIES } from "@/lib/irish-counties";
import { OnboardingMap, type OnboardingMapHandle } from "./OnboardingMap";

const FieldBoundaryMapModal = dynamic(() => import("@/components/farm/FieldBoundaryMapModal").then((m) => m.FieldBoundaryMapModal), { ssr: false });

/**
 * Map-led first-farm onboarding: the first few minutes of Farm Return, not a questionnaire. The real satellite map
 * fills the screen; one contextual panel (the Farm/Fields deep-forest surface with its thin gold rule) changes as the
 * farmer moves through: find the farm → "Is this your farm?" → name it → draw the first real field → choose where to
 * go next. The farm and its fields appear on the map as they're saved.
 *
 * Every write goes through the onboarding Server Actions (farm resolved server-side). Buttons are disabled while a
 * write is in flight, and a failed write keeps what the farmer entered.
 */

type LocalStep = "FIND" | "CONFIRM" | "IDENTITY" | "FIRST_FIELD" | "NAME_FIELD" | "NEXT_STEPS";

export interface OnboardingField {
  id: string;
  name: string;
  polygon: GeoJSON.Polygon;
}

const IRELAND_CENTER: [number, number] = [-7.9, 53.4];
const CONFIRM_ZOOM = 15;
const SEARCH_OVERVIEW_RADIUS_KM = 3;
const LOCATION_SEARCH_STORAGE_KEY = "farm-return:onboarding:location-search";

function initialStep(stage: OnboardingStage): LocalStep {
  return stage === "NEXT_STEPS" ? "NEXT_STEPS" : stage === "FIRST_FIELD" ? "FIRST_FIELD" : "FIND";
}

export function OnboardingWorkspace({ stage, farm: initialFarm, fields: initialFields }: { stage: OnboardingStage; farm: Farm | null; fields: OnboardingField[] }) {
  const [step, setStep] = useState<LocalStep>(initialStep(stage));
  const [farm, setFarm] = useState<Farm | null>(initialFarm);
  const [fields, setFields] = useState<OnboardingField[]>(initialFields);
  const [farmPoint, setFarmPoint] = useState<[number, number] | null>(initialFarm?.location.centroid ?? null);
  const [drawing, setDrawing] = useState(false);
  const [pendingPolygon, setPendingPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ center: [number, number]; radiusKm?: number; zoom: number; token: number } | null>(null);
  const mapRef = useRef<OnboardingMapHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [padding, setPadding] = useState({ top: 72, bottom: 0, left: 0, right: 0 });

  // Keep the camera (and the centre pin) in the part of the map the panel doesn't cover: beside it on desktop,
  // above the bottom sheet on a phone.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      const desktop = window.matchMedia?.("(min-width: 1024px)")?.matches ?? false;
      const rect = el.getBoundingClientRect();
      setPadding(desktop ? { top: 72, bottom: 24, left: Math.round(rect.right + 24), right: 24 } : { top: 64, bottom: Math.round(window.innerHeight - rect.top), left: 0, right: 0 });
    };
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const startCenter = initialFarm?.location.centroid ?? IRELAND_CENTER;
  const mapStartCenter = cameraTarget?.center ?? startCenter;
  const mapStartZoom = cameraTarget?.zoom ?? (initialFarm ? CONFIRM_ZOOM : 6.4);
  const onUserMove = useCallback(() => setStep((s) => (s === "FIND" ? "CONFIRM" : s)), []);
  const showPin = step === "FIND" || step === "CONFIRM";

  return (
    <main className="fixed inset-0 overflow-hidden bg-fr-v2-forest-deep" data-onboarding-step={step}>
      {mapboxConfigured ? (
        <OnboardingMap
          key={cameraTarget?.token ?? 0}
          ref={mapRef}
          initialCenter={mapStartCenter}
          initialZoom={mapStartZoom}
          initialRadiusKm={cameraTarget?.radiusKm}
          fields={fields}
          pendingPolygon={pendingPolygon}
          padding={padding}
          onUserMove={onUserMove}
        />
      ) : (
        <div className="absolute inset-0 bg-fr-v2-forest-deep" />
      )}

      {showPin ? <CentrePin padding={padding} /> : null}
      {farmPoint && !showPin ? <CentrePin padding={padding} subtle /> : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/55 to-transparent px-4 pb-8 pt-4 lg:px-6">
        <span className="pointer-events-auto font-display text-[22px] tracking-tight text-white">Farm Return</span>
        <form action={signOut} className="pointer-events-auto">
          <button type="submit" className="min-h-11 px-2 text-xs font-semibold text-white/75 underline decoration-white/30 underline-offset-[3px] hover:text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw">
            Sign out
          </button>
        </form>
      </header>

      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 max-h-[58dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:bottom-auto lg:left-6 lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:w-[400px]"
      >
        <Panel>
          {step === "FIND" || step === "CONFIRM" ? (
            <LocateStep
              confirming={step === "CONFIRM"}
              mapAvailable={mapboxConfigured}
              onPlace={(center, searchOverview = false) => {
                setCameraTarget((prev) => ({
                  center,
                  zoom: searchOverview ? CONFIRM_ZOOM : CONFIRM_ZOOM,
                  radiusKm: searchOverview ? SEARCH_OVERVIEW_RADIUS_KM : undefined,
                  token: (prev?.token ?? 0) + 1,
                }));
                setStep("CONFIRM");
              }}
              onConfirm={() => {
                setFarmPoint(mapRef.current?.center() ?? null);
                setStep("IDENTITY");
              }}
              onSkipMap={(county) => {
                setFarmPoint(IRISH_COUNTIES.find((c) => c.name === county)?.centroid ?? null);
                setStep("IDENTITY");
              }}
            />
          ) : null}
          {step === "IDENTITY" && farmPoint ? (
            <IdentityStep
              point={farmPoint}
              approximate={!mapboxConfigured}
              onBack={() => setStep("CONFIRM")}
              onCreated={(f) => {
                setFarm(f);
                setFarmPoint(f.location.centroid);
                setStep("FIRST_FIELD");
              }}
            />
          ) : null}
          {step === "FIRST_FIELD" && farm ? (
            <FirstFieldStep farm={farm} mapAvailable={mapboxConfigured} onDraw={() => setDrawing(true)} />
          ) : null}
          {step === "NAME_FIELD" && pendingPolygon ? (
            <NameFieldStep
              polygon={pendingPolygon}
              first={fields.length === 0}
              onRedraw={() => setDrawing(true)}
              onCancel={() => {
                setPendingPolygon(null);
                setStep(fields.length === 0 ? "FIRST_FIELD" : "NEXT_STEPS");
              }}
              onSaved={(field) => {
                setFields((fs) => [...fs, field]);
                setPendingPolygon(null);
                setStep("NEXT_STEPS");
              }}
            />
          ) : null}
          {step === "NEXT_STEPS" && farm ? <NextSteps farm={farm} fields={fields} mapAvailable={mapboxConfigured} onMapAnother={() => setDrawing(true)} /> : null}
        </Panel>
      </div>

      {drawing && farm ? (
        <FieldBoundaryMapModal
          fieldName={fields.length === 0 ? "your first field" : "another field"}
          initialCentroid={farm.location.centroid}
          onClose={() => setDrawing(false)}
          onSave={(polygon) => {
            setPendingPolygon(polygon);
            setDrawing(false);
            setStep("NAME_FIELD");
          }}
        />
      ) : null}
    </main>
  );
}

/** The point being positioned: a straw pin over the map's padded centre (purely visual; pointer events pass through). */
function CentrePin({ padding, subtle = false }: { padding: { top: number; bottom: number; left: number; right: number }; subtle?: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: `calc(${padding.left}px + (100% - ${padding.left + padding.right}px) / 2)`, top: `calc(${padding.top}px + (100% - ${padding.top + padding.bottom}px) / 2)` }}
    >
      <span className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fr-v2-straw", subtle ? "size-4 bg-fr-v2-straw/40" : "size-6 bg-fr-v2-straw/25 shadow-[0_0_0_6px_rgba(227,199,126,0.18)]")} />
      {subtle ? null : <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fr-v2-straw" />}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="flex bg-fr-v2-forest-deep/[0.96] text-white shadow-[0_-12px_40px_rgba(0,0,0,0.35)] lg:shadow-[0_18px_40px_rgba(0,0,0,0.32)]" aria-live="polite">
      <span aria-hidden className="w-[3px] shrink-0 bg-fr-v2-gold" />
      <div className="min-w-0 flex-1 px-5 pb-6 pt-5">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">{children}</p>;
}

function Heading({ children }: { children: ReactNode }) {
  return <h1 className="mt-1 text-balance font-display text-[30px] leading-[1.04] tracking-[-0.015em]">{children}</h1>;
}

function PrimaryButton({ children, disabled, onClick, type = "button" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="mt-5 flex min-h-12 w-full items-center justify-between gap-3 bg-fr-v2-cream px-4 text-[15px] font-semibold text-fr-v2-forest-deep transition-colors duration-[160ms] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-straw disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
    >
      {children}
      <ArrowRight className="size-4" />
    </button>
  );
}

function QuietButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="min-h-11 text-sm font-semibold text-white/75 underline decoration-white/30 underline-offset-[3px] hover:text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw disabled:opacity-50">
      {children}
    </button>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="mt-3 text-sm text-fr-v2-clay-tint">
      {text}
    </p>
  ) : null;
}

const inputClass =
  "mt-1.5 min-h-12 w-full border border-white/20 bg-white/[0.06] px-3 text-[16px] text-white placeholder:text-white/40 focus:border-fr-v2-straw focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fr-v2-straw";
const labelClass = "block font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/60";

// ---------------------------------------------------------------------------
// 1. Find the farm
// ---------------------------------------------------------------------------

function LocateStep({ confirming, mapAvailable, onPlace, onConfirm, onSkipMap }: { confirming: boolean; mapAvailable: boolean; onPlace: (center: [number, number], searchOverview?: boolean) => void; onConfirm: () => void; onSkipMap: (county: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [county, setCounty] = useState("");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(LOCATION_SEARCH_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in strict/private browser contexts; onboarding still works normally.
    }
    if (!saved) return;
    const frame = window.requestAnimationFrame(() => setQuery(saved ?? ""));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateQuery(value: string) {
    setQuery(value);
    try {
      if (value) window.localStorage.setItem(LOCATION_SEARCH_STORAGE_KEY, value);
      else window.localStorage.removeItem(LOCATION_SEARCH_STORAGE_KEY);
    } catch {
      // Search persistence is a convenience only; never block onboarding if storage is unavailable.
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setMessage(null);

    const eircode = normaliseEircode(query);
    if (eircode) {
      updateQuery(eircode);
      const exact = await lookupExactEircodeStep(eircode);
      setSearching(false);
      setResults([]);

      if (exact.ok) {
        // A full Eircode is already a premises-level match, so go straight to
        // the close confirmation zoom rather than fitting the wider search-area radius.
        onPlace(exact.value.center);
        setMessage(`Found ${exact.value.eircode}. We've centred the map on that exact Eircode. Move the pin if your farmyard is nearby, then confirm it.`);
      } else {
        setMessage(exact.error);
      }
      return;
    }

    const found = await searchPlaces(query);
    setSearching(false);
    setResults(found);
    if (found === null) setMessage("Search isn't available just now. Move the map to your farm instead.");
    else if (found.length === 0 && query.trim().length >= 2) setMessage("Nothing found for that. Try a townland, address or nearby town.");
    else if (found.length > 0) {
      onPlace(found[0].center, true);
      setMessage(found.length > 1 ? "We've zoomed to the best match. Choose another result below if needed, then move the pin onto your farm." : "We've zoomed to that area. Move the pin onto your farm, then confirm it.");
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("This device can't share its location. Search or move the map instead.");
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPlace([pos.coords.longitude, pos.coords.latitude]);
      },
      (err) => {
        setLocating(false);
        setMessage(err.code === err.PERMISSION_DENIED ? "Location sharing is off. That's fine — search or move the map to your farm." : "Your location couldn't be found just now. Search or move the map instead.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  if (!mapAvailable) {
    return (
      <>
        <Eyebrow>Set up · your farm</Eyebrow>
        <Heading>Where is your farm?</Heading>
        <p className="mt-3 text-[15px] leading-snug text-white/75">The map isn&apos;t available just now, so your farm will start at your county centre. You can map your fields later.</p>
        <label className={cn(labelClass, "mt-5")}>
          County
          <select className={inputClass} value={county} onChange={(e) => setCounty(e.target.value)}>
            <option value="">Choose your county</option>
            {COUNTY_NAMES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <PrimaryButton disabled={!county} onClick={() => onSkipMap(county)}>
          Continue
        </PrimaryButton>
      </>
    );
  }

  return (
    <>
      <Eyebrow>Set up · your farm</Eyebrow>
      <Heading>{confirming ? "Is this your farm?" : "Let’s find your farm"}</Heading>
      <p className="mt-3 text-[15px] leading-snug text-white/75">
        {confirming ? "Move the map until the pin sits on your farmyard or main block of land." : "Search for your Eircode, townland, address or nearest town — or move the map yourself."}
      </p>

      <form onSubmit={onSearch} className="mt-5" role="search">
        <label className={labelClass} htmlFor="farm-search">
          Search
        </label>
        <div className="mt-1.5 flex">
          <input id="farm-search" className={cn(inputClass, "mt-0")} value={query} onChange={(e) => updateQuery(e.target.value)} placeholder="Eircode, townland, address or town" autoComplete="off" enterKeyHint="search" />
          <button type="submit" disabled={searching || query.trim().length < 2} aria-label="Search" className="flex min-h-12 w-12 shrink-0 items-center justify-center border border-l-0 border-white/20 text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw disabled:opacity-40">
            <Search className="size-4" />
          </button>
        </div>
      </form>
      {results && results.length > 0 ? (
        <ul className="mt-2 border-t border-white/10" aria-label="Search results">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setResults([]);
                  updateQuery(r.label.split(",")[0]);
                  onPlace(r.center, true);
                }}
                className="flex min-h-11 w-full items-center border-b border-white/10 py-2 text-left text-sm text-white/85 hover:text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button type="button" onClick={useMyLocation} disabled={locating} className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw disabled:opacity-50">
        <LocateFixed className="size-4" />
        {locating ? "Finding your location…" : "Use my current location"}
      </button>
      <ErrorLine text={message} />

      {confirming ? <PrimaryButton onClick={onConfirm}>Yes, this is my farm</PrimaryButton> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Establish the farm
// ---------------------------------------------------------------------------

function IdentityStep({ point, approximate, onBack, onCreated }: { point: [number, number]; approximate: boolean; onBack: () => void; onCreated: (farm: Farm) => void }) {
  const [name, setName] = useState("");
  const [farmTypes, setFarmTypes] = useState<string[]>([]);
  const [grazingProductionSystem, setGrazingProductionSystem] = useState<"SUCKLER_CALF_TO_BEEF" | "SUCKLER_CALF_TO_WEANING" | "OTHER_DRYSTOCK" | "">("");
  const [county, setCounty] = useState<string>("");
  const [detected, setDetected] = useState<"PENDING" | "FOUND" | "NOT_FOUND">(approximate ? "NOT_FOUND" : "PENDING");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (approximate) return;
    const ctrl = new AbortController();
    countyAt(point, ctrl.signal).then((c) => {
      if (ctrl.signal.aborted) return;
      if (c) {
        setCounty(c);
        setDetected("FOUND");
      } else setDetected("NOT_FOUND");
    });
    return () => ctrl.abort();
  }, [point, approximate]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const r = await establishFarmStep({ name, farmTypes, county, centroid: point, ...(grazingProductionSystem ? { grazingProductionSystem } : {}) });
      if (r.ok) onCreated(r.value);
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit}>
      <Eyebrow>Set up · your farm</Eyebrow>
      <Heading>Name your farm</Heading>
      <label className={cn(labelClass, "mt-5")} htmlFor="farm-name">
        Farm name
      </label>
      <input id="farm-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="organization" placeholder="e.g. Back Avenue Farm" />

      <fieldset className="mt-5">
        <legend className={labelClass}>Farm types</legend>
        <p className="mt-1 text-xs text-white/50">Choose all that apply.</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {FARM_TYPES.map((t) => {
            const selected = farmTypes.includes(t.id);
            return (
              <label key={t.id} className={cn("flex min-h-11 cursor-pointer items-center justify-center border px-2 text-center text-sm font-medium transition-colors duration-[160ms] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fr-v2-straw motion-reduce:transition-none", selected ? "border-fr-v2-straw bg-fr-v2-straw/15 text-white" : "border-white/20 text-white/75 hover:border-white/40")}>
                <input
                  type="checkbox"
                  name="farmTypes"
                  value={t.id}
                  checked={selected}
                  onChange={() =>
                    setFarmTypes((current) => {
                      if (selected) return current.filter((id) => id !== t.id);
                      if (t.id === "mixed" || t.id === "other") return [t.id];
                      return [...current.filter((id) => id !== "mixed" && id !== "other"), t.id];
                    })
                  }
                  className="sr-only"
                />
                {t.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {farmTypes.includes("suckler") ? (
        <label className={cn(labelClass, "mt-5")} htmlFor="farm-grazing-system">
          Normal grazing production system
          <select id="farm-grazing-system" className={cn(inputClass, "mt-2")} value={grazingProductionSystem} onChange={(e) => setGrazingProductionSystem(e.target.value as typeof grazingProductionSystem)}>
            <option value="">Choose system</option>
            <option value="SUCKLER_CALF_TO_BEEF">Suckler calf-to-beef</option>
            <option value="SUCKLER_CALF_TO_WEANING">Suckler calf-to-weaning</option>
            <option value="OTHER_DRYSTOCK">Other drystock</option>
          </select>
          <span className="mt-1 block text-xs normal-case tracking-normal text-white/50">Set this once as the farm baseline. Farm Return will use recorded cattle movements to improve individual field evidence automatically.</span>
        </label>
      ) : null}

      <label className={cn(labelClass, "mt-5")} htmlFor="farm-county">
        County
        <span className="ml-2 normal-case tracking-normal text-white/45">
          {detected === "PENDING" ? "Reading from the map…" : detected === "FOUND" ? "From your map location" : approximate ? "" : "Choose it below"}
        </span>
      </label>
      <select id="farm-county" className={inputClass} value={county} onChange={(e) => setCounty(e.target.value)}>
        <option value="">Choose your county</option>
        {COUNTY_NAMES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>

      <ErrorLine text={error} />
      <PrimaryButton type="submit" disabled={pending || !name.trim() || farmTypes.length === 0 || !county || (farmTypes.includes("suckler") && !grazingProductionSystem)}>
        {pending ? "Creating your farm…" : "Create farm"}
      </PrimaryButton>
      <div className="mt-2">
        <QuietButton onClick={onBack} disabled={pending}>
          Change location
        </QuietButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 3. Map the first field
// ---------------------------------------------------------------------------

function FirstFieldStep({ farm, mapAvailable, onDraw }: { farm: Farm; mapAvailable: boolean; onDraw: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Eyebrow>{farm.name}</Eyebrow>
      <Heading>Let’s add your first field</Heading>
      {mapAvailable ? (
        <>
          <p className="mt-3 text-[15px] leading-snug text-white/75">Draw around one of your fields on the satellite map. Its area is worked out from the boundary you draw.</p>
          <PrimaryButton onClick={onDraw}>Draw field boundary</PrimaryButton>
        </>
      ) : (
        <>
          <p className="mt-3 text-[15px] leading-snug text-white/75">The map isn&apos;t available just now, so fields can&apos;t be drawn yet. You can map them from Fields later.</p>
          <ErrorLine text={error} />
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await finishOnboardingStep("explore");
                if (!r.ok) setError(r.error);
              })
            }
          >
            Explore Farm Return
          </PrimaryButton>
        </>
      )}
    </>
  );
}

function NameFieldStep({ polygon, first, onRedraw, onCancel, onSaved }: { polygon: GeoJSON.Polygon; first: boolean; onRedraw: () => void; onCancel: () => void; onSaved: (field: OnboardingField) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const area = useMemo(() => (isValidBoundaryPolygon(polygon) ? formatHa(computeBoundaryGeometry(polygon).areaHa) : null), [polygon]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const r = await addOnboardingFieldStep({ name, polygon });
      if (r.ok) onSaved({ id: r.value.id, name: r.value.name, polygon: r.value.polygon ?? polygon });
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit}>
      <Eyebrow>{first ? "Your first field" : "Another field"}</Eyebrow>
      <Heading>Name this field</Heading>
      {area ? <p className="mt-2 font-mono text-[13px] tabular-nums text-white/70">{area} · from your boundary</p> : null}
      <label className={cn(labelClass, "mt-5")} htmlFor="field-name">
        Field name
      </label>
      <input id="field-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Back Avenue Meadow" />
      <ErrorLine text={error} />
      <PrimaryButton type="submit" disabled={pending || !name.trim()}>
        {pending ? "Saving field…" : "Save field"}
      </PrimaryButton>
      <div className="mt-2 flex gap-5">
        <QuietButton onClick={onRedraw} disabled={pending}>
          Redraw boundary
        </QuietButton>
        <QuietButton onClick={onCancel} disabled={pending}>
          Cancel
        </QuietButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 4. Where next
// ---------------------------------------------------------------------------

function NextSteps({ farm, fields, mapAvailable, onMapAnother }: { farm: Farm; fields: OnboardingField[]; mapAvailable: boolean; onMapAnother: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (destination: "explore" | "cattle") =>
    startTransition(async () => {
      setError(null);
      const r = await finishOnboardingStep(destination);
      if (!r.ok) setError(r.error);
    });
  return (
    <>
      <Eyebrow>{farm.name}</Eyebrow>
      <Heading>Your farm is taking shape.</Heading>
      <p className="mt-2 font-mono text-[13px] tabular-nums text-white/70" data-onboarding-fields>
        {fields.length} {fields.length === 1 ? "field" : "fields"} mapped · {fields.map((f) => f.name).join(", ")}
      </p>
      <PrimaryButton disabled={pending} onClick={() => go("explore")}>
        {pending ? "Opening Farm Return…" : "Explore Farm Return"}
      </PrimaryButton>
      <div className="mt-3 flex flex-col items-start">
        {mapAvailable ? (
          <QuietButton onClick={onMapAnother} disabled={pending}>
            Map another field
          </QuietButton>
        ) : null}
        <QuietButton onClick={() => go("cattle")} disabled={pending}>
          Add cattle
        </QuietButton>
      </div>
      <ErrorLine text={error} />
    </>
  );
}
