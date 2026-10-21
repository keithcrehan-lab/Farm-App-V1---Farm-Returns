"use client";

/**
 * Cattle C10 — one loader for every demonstration screen. A view is keyed by
 * everything it depends on: the screen identity (route kind, tag, scenario)
 * AND the session. With an empty session the server-rendered `initial` prop
 * is the view (so a changed route / scenario is reflected at once); otherwise
 * the view is fetched for the exact key, and a response for a superseded key
 * is discarded. While the current key is loading, the last view of the same
 * identity stays on screen marked pending — never another screen's data.
 */

import { useEffect, useRef, useState } from "react";
import type { CattleDemoSession } from "./demo-session";
import { useCattleDemoSession } from "./CattleDemoSessionProvider";

type LoadResult<T> = { ok: true; value: T } | { ok: false };

export interface DemoView<T> {
  view: T;
  /** The shown view is not (yet) the one for the current identity + session. */
  pending: boolean;
  /** Loading the current key failed; the shown view is the last good one for this identity. */
  failed: boolean;
}

export function useDemoView<T>(initial: T, identity: string, load: (session: CattleDemoSession) => Promise<LoadResult<T>>): DemoView<T> {
  const { session } = useCattleDemoSession();
  const fromServer = session.events.length === 0;
  const key = `${identity}\u0000${JSON.stringify(session)}`;
  const [loaded, setLoaded] = useState<{ key: string; identity: string; value: T } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (fromServer) return;
    let current = true; // cleared when the key changes: a late response for an old key is dropped
    loadRef.current(session).then(
      (r) => {
        if (!current) return;
        if (r.ok) setLoaded({ key, identity, value: r.value });
        else setFailedKey(key);
      },
      () => {
        if (current) setFailedKey(key);
      },
    );
    return () => {
      current = false;
    };
  }, [key, identity, session, fromServer]);

  if (fromServer) return { view: initial, pending: false, failed: false };
  if (loaded?.key === key) return { view: loaded.value, pending: false, failed: false };
  const sameScreen = loaded !== null && loaded.identity === identity;
  return { view: sameScreen ? loaded.value : initial, pending: failedKey !== key, failed: failedKey === key };
}
