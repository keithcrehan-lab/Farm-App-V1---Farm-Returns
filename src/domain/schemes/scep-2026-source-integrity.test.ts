import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCES = [
  {
    path: "docs/evidence/schemes/scep-2026-dafm-service.md",
    sha256: "bd8b2d4aac2a8cfdc110ac945996217b87bfde334708b2b02409d9b5419eb7f9",
  },
  {
    path: "docs/evidence/schemes/scep-2026-icbf-actions.md",
    sha256: "f6d74736a6f1183b6aa5731048469ccd530a6ffaf07a61919163f758595d8f80",
  },
  {
    path: "docs/evidence/schemes/scep-2026-year4-current.md",
    sha256: "5735f1fd8e577f3affe9ebcd904c987dbaeb1f7d88ec026f8068b6993071f5bd",
  },
  {
    path: "docs/evidence/schemes/scep-2026-icbf-weighing.md",
    sha256: "c364113cc9eae89026e572335bbdc8ad8e37945a483cc1ea13b0aa75ea4f9ebe",
  },
] as const;

describe("SCEP 2026 local source integrity", () => {
  for (const source of SOURCES) {
    it("matches the pinned fingerprint for " + source.path, () => {
      const content = readFileSync(join(process.cwd(), source.path));
      const actual = createHash("sha256").update(content).digest("hex");
      expect(actual).toBe(source.sha256);
    });
  }
});
