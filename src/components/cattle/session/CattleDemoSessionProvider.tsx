"use client";

/**
 * Cattle C10 — the demonstration session store (client, in-memory only).
 * Holds the farmer actions taken in local demonstration mode, the per-animal
 * plan drafts and the session photo store for as long as the browser tab
 * stays on the cattle screens (client navigation keeps it; a reload clears
 * it). Nothing here is persisted or uploaded, and the screens say so.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { AnimalPlanAssumptions } from "@/domain/animal-plan";
import { createSessionPhotoStore, type AnimalPhotoStore } from "../photos/photo-store";
import { CATTLE_DEMO_SESSION_MAX_EVENTS, EMPTY_CATTLE_DEMO_SESSION, type CattleDemoEvent, type CattleDemoSession } from "./demo-session";

interface PlanDraft {
  assumptions: AnimalPlanAssumptions;
  martId: string;
  /** The assumptions last saved in this session (`null` = never saved). */
  saved: { assumptions: AnimalPlanAssumptions; martId: string } | null;
}

type NewEvent = CattleDemoEvent extends infer E ? (E extends unknown ? Omit<E, "eventId"> : never) : never;

interface CattleDemoSessionValue {
  session: CattleDemoSession;
  addEvent: (event: NewEvent) => string | null;
  reset: () => void;
  photos: AnimalPhotoStore;
  /** Re-render trigger for photo changes. */
  photoVersion: number;
  bumpPhotos: () => void;
  planDraft: (tag: string) => PlanDraft | null;
  setPlanDraft: (tag: string, draft: PlanDraft) => void;
}

const Ctx = createContext<CattleDemoSessionValue | null>(null);

export function CattleDemoSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CattleDemoSession>(EMPTY_CATTLE_DEMO_SESSION);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const counter = useRef(0);
  const photos = useMemo(() => createSessionPhotoStore(), []);

  const addEvent = useCallback(
    (event: NewEvent) => {
      if (session.events.length >= CATTLE_DEMO_SESSION_MAX_EVENTS) return null;
      counter.current += 1;
      const id = `ev-${counter.current}`;
      setSession((s) => (s.events.length >= CATTLE_DEMO_SESSION_MAX_EVENTS ? s : { ...s, events: [...s.events, { ...event, eventId: id } as CattleDemoEvent] }));
      return id;
    },
    [session.events.length],
  );

  const value = useMemo<CattleDemoSessionValue>(
    () => ({
      session,
      addEvent,
      reset: () => {
        setSession(EMPTY_CATTLE_DEMO_SESSION);
        setDrafts({});
        photos.clear();
        setPhotoVersion((v) => v + 1);
      },
      photos,
      photoVersion,
      bumpPhotos: () => setPhotoVersion((v) => v + 1),
      planDraft: (tag) => drafts[tag] ?? null,
      setPlanDraft: (tag, draft) => setDrafts((d) => ({ ...d, [tag]: draft })),
    }),
    [session, addEvent, photos, photoVersion, drafts],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCattleDemoSession(): CattleDemoSessionValue {
  const v = useContext(Ctx);
  if (v === null) throw new Error("useCattleDemoSession outside CattleDemoSessionProvider");
  return v;
}

export type { PlanDraft };
