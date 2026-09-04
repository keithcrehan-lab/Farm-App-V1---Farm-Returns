import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/support-profile", () => ({
  upsertSupportProfileFactAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { upsertSupportProfileFactAction } from "@/app/actions/support-profile";
import { SupportsPageClient } from "./SupportsPageClient";
import type { SupportProfile } from "@/domain/support-profile";
import { FarmProvider } from "@/store/farm-store";

const mockUpsert = vi.mocked(upsertSupportProfileFactAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const profile: SupportProfile = {
  farmId: "farm-1",
  version: "support-profile-v1",
  derived: {
    countyLocation: "Cork",
    primaryEnterprises: ["suckler_beef"],
    totalMappedAreaHa: 12,
    forageAreaHa: 12,
    fieldsWithUnresolvedUse: 0,
    totalLivestockUnits: 8,
  },
  knownFacts: [],
  farmerFacts: {},
  gaps: [{ key: "date_of_birth", label: "What is your date of birth?", reason: "Needed for a young-farmer age gate.", requiredBySchemeIds: [] }],
};

// Codex audit MEDIUM (round 9, 2026-09-04): a mock/demo farm has no real
// farm row for the server action to persist a fact against — every save
// attempt could only ever fail. `isDemoMode` disables these controls
// instead of inviting an attempt that can never succeed.
describe("SupportsPageClient — isDemoMode", () => {
  it("disables the gap's Save control and never calls the real server action in demo mode", () => {
    render(
      <FarmProvider>
        <SupportsPageClient profile={profile} assessments={[]} schemeNames={{}} isDemoMode />
      </FarmProvider>,
    );
    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.getByText(/demo mode/i)).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("leaves the gap's date input active (not demo-disabled) outside demo mode", () => {
    render(
      <FarmProvider>
        <SupportsPageClient profile={profile} assessments={[]} schemeNames={{}} isDemoMode={false} />
      </FarmProvider>,
    );
    expect(screen.queryByText(/demo mode/i)).toBeNull();
    const dateInput = screen.getByDisplayValue("") as HTMLInputElement;
    expect(dateInput.disabled).toBe(false);
  });
});
