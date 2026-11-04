import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/auth", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { FarmProvider } from "@/store/farm-store";
import { SettingsPageClient } from "./SettingsPageClient";

afterEach(() => cleanup());

describe("Settings — preceding-year grassland stocking rate (LESS evidence)", () => {
  it("records last year's figure as season-bound evidence and rejects an invalid one", async () => {
    render(
      <FarmProvider>
        <SettingsPageClient userEmail={null} supabaseConfigured={false} />
      </FarmProvider>,
    );
    const lastYear = String(new Date().getFullYear() - 1);
    const summary = screen.getByLabelText(`${lastYear} grassland stocking rate`);
    expect(summary.textContent).toBe(`${lastYear}: not recorded`);

    fireEvent.click(screen.getByRole("button", { name: `Record ${lastYear} figure` }));
    expect(await screen.findByText("Enter the stocking rate in kg N/ha (0–1000).")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(`${lastYear} grassland stocking rate (kg N/ha)`), { target: { value: "140" } });
    fireEvent.click(screen.getByRole("button", { name: `Record ${lastYear} figure` }));
    await waitFor(() =>
      expect(screen.getByLabelText(`${lastYear} grassland stocking rate`).textContent).toBe(
        `${lastYear}: 140 kg N/ha · Nitrates statement ${lastYear} · farmer entered`,
      ),
    );
  });
});
