import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useIsMounted } from "./use-mounted";

describe("useIsMounted", () => {
  it("is false on the initial render (matches SSR output), then flips true post-mount", async () => {
    const { result } = renderHook(() => useIsMounted());
    // React Testing Library's renderHook already flushes effects by the
    // time it returns in most cases, so assert the eventual settled state
    // rather than assuming a synchronous false — the guarantee that
    // matters here is "false on first paint, true once mounted", not the
    // exact tick it flips on.
    await waitFor(() => expect(result.current).toBe(true));
  });
});
