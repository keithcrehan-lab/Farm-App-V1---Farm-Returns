import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Farm Spatial V2 Phase 1 — the V2 tokens are additive (`--fr-v2-*`) and
 * the legacy `--fr-*` palette every existing screen renders with is
 * unchanged (`design/design-system.md` "Farm Spatial V2 authority").
 */
const css = readFileSync(join(__dirname, "globals.css"), "utf-8");

function tokenValue(name: string): string | undefined {
  const match = css.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m"));
  return match?.[1].trim();
}

describe("globals.css design tokens", () => {
  it("keeps every legacy token value unchanged", () => {
    const legacy: Record<string, string> = {
      "--fr-green-900": "#0f2818",
      "--fr-green-700": "#1b5e3e",
      "--fr-green-600": "#2e7d4f",
      "--fr-green-100": "#e3f2e8",
      "--fr-ink-900": "#101828",
      "--fr-ink-600": "#475467",
      "--fr-ink-400": "#98a2b3",
      "--fr-surface": "#ffffff",
      "--fr-surface-alt": "#f7f8f6",
      "--fr-border": "#e4e7eb",
      "--fr-status-good": "#2e7d4f",
      "--fr-status-attention": "#d98324",
      "--fr-status-risk": "#c0362c",
      "--fr-status-info": "#2563ac",
      "--fr-map-silage": "#1f8fa3",
      "--radius-fr-card": "20px",
      "--radius-fr-control": "12px",
      "--background": "var(--fr-surface-alt)",
      "--foreground": "var(--fr-ink-900)",
    };
    for (const [name, value] of Object.entries(legacy)) {
      expect(tokenValue(name), name).toBe(value);
    }
  });

  it("defines the approved Farm Spatial V2 functional palette", () => {
    // design/farm-spatial-v2/DESIGN_CONTRACT.md §5 "Colour carries domain meaning".
    const palette: Record<string, string> = {
      "--fr-v2-forest": "#173f2d",
      "--fr-v2-graphite": "#171b18",
      "--fr-v2-cobalt": "#356c9f",
      "--fr-v2-harvest": "#d19a2a",
      "--fr-v2-teal": "#337b74",
      "--fr-v2-plum": "#79526f",
      "--fr-v2-clay": "#aa644c",
    };
    for (const [name, value] of Object.entries(palette)) {
      expect(tokenValue(name), name).toBe(value);
    }
  });

  it("exposes every V2 colour as a Tailwind theme colour", () => {
    const v2Names = [...css.matchAll(/^\s*(--fr-v2-[a-z-]+):/gm)].map((m) => m[1]);
    const colourNames = v2Names.filter((n) => !/-(radius|shadow|duration|ease)-/.test(n) && !n.endsWith("-ease-out"));
    expect(colourNames.length).toBeGreaterThan(0);
    for (const name of colourNames) {
      expect(tokenValue(`--color-${name.slice(2)}`), name).toBe(`var(${name})`);
    }
  });

  it("does not redefine any legacy token inside the V2 namespace", () => {
    const definitions = [...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]);
    const duplicates = definitions.filter((name, index) => definitions.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });
});
