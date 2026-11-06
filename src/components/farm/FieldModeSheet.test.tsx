import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FieldModeSheet } from "./FieldModeSheet";
import { boundaryPolygonFromRing } from "@/domain/field-boundary";
import type { Field } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";

const getCurrentPosition = vi.fn();
vi.mock("@/lib/location/web-location-tracking-provider", () => ({
  createWebLocationTrackingProvider: () => ({ getCurrentPosition: (...args: unknown[]) => getCurrentPosition(...args) }),
}));

const home = {
  id: "field-a",
  name: "Home Field",
  areaHa: 1,
  centroid: [-8.4857, 51.89895],
  polygon: boundaryPolygonFromRing([[-8.4863, 51.8985], [-8.4851, 51.8985], [-8.4851, 51.8994], [-8.4863, 51.8994], [-8.4863, 51.8985]]),
} as unknown as Field;
const road = {
  id: "field-b",
  name: "Road Field",
  areaHa: 1,
  centroid: [-8.4845, 51.89895],
  polygon: boundaryPolygonFromRing([[-8.4851, 51.8985], [-8.4839, 51.8985], [-8.4839, 51.8994], [-8.4851, 51.8994], [-8.4851, 51.8985]]),
} as unknown as Field;

const okPrompt = { id: "p1", title: "Spreading window open", fieldId: "field-a", basis: { status: "OK" } } as unknown as Prompt;
const blockedPrompt = { id: "p2", title: "Blocked prompt", fieldId: "field-a", basis: { status: "BLOCKED_INSUFFICIENT_EVIDENCE" } } as unknown as Prompt;

const onViewPrompt = vi.fn();
const onConfirmField = vi.fn();

function renderSheet(prompt?: Prompt) {
  return render(
    <FieldModeSheet open onClose={vi.fn()} fields={[home, road]} leadingPromptFor={() => prompt} onViewPrompt={onViewPrompt} onConfirmField={onConfirmField} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentPosition.mockResolvedValue(null);
});
afterEach(cleanup);

describe("FieldModeSheet", () => {
  it("suggests a field from GPS but shows no quick actions until the farmer confirms", async () => {
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.4857, accuracyMeters: 5 });
    renderSheet();
    const confirm = await screen.findByRole("button", { name: /yes, i'm in home field/i });
    expect(screen.queryByRole("link", { name: /record grass/i })).toBeNull();
    expect(onConfirmField).not.toHaveBeenCalled();

    fireEvent.click(confirm);
    expect(onConfirmField).toHaveBeenCalledWith("field-a");
    expect(screen.getByRole("link", { name: /open field workspace/i }).getAttribute("href")).toBe("/fields?field=field-a");
    expect(screen.getByRole("link", { name: /record grass/i }).getAttribute("href")).toBe("/grass?field=field-a");
    expect(screen.getByRole("link", { name: /soil sampling/i }).getAttribute("href")).toBe("/soil-sample/field-a");
    expect(screen.getByRole("link", { name: /nutrient and fertiliser/i }).getAttribute("href")).toBe("/fields?field=field-a&chapter=nutrients");
  });

  it("asks the farmer to choose when GPS can't separate two fields, and never claims one", async () => {
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.48515, accuracyMeters: 30 });
    renderSheet();
    await screen.findByText(/can't tell which of these fields/i);
    expect(screen.queryByRole("button", { name: /yes, i'm in/i })).toBeNull();
    expect(onConfirmField).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Road Field" }));
    expect(onConfirmField).toHaveBeenCalledWith("field-b");
    expect(screen.getByRole("link", { name: /record grass/i }).getAttribute("href")).toBe("/grass?field=field-b");
  });

  it("makes no suggestion from a poor fix, and the farmer can still choose by hand", async () => {
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.4857, accuracyMeters: 500 });
    renderSheet();
    await screen.findByText(/can't confidently be matched/i);
    expect(screen.queryByRole("button", { name: /yes, i'm in/i })).toBeNull();
    const use = screen.getByRole("button", { name: "Use this field" }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/choose a field/i), { target: { value: "field-b" } });
    fireEvent.click(use);
    expect(onConfirmField).toHaveBeenCalledWith("field-b");
  });

  it("is honest when location is unavailable and can check again", async () => {
    renderSheet();
    await screen.findByText(/location isn't available/i);
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.4857, accuracyMeters: 5 });
    fireEvent.click(screen.getByRole("button", { name: /check location again/i }));
    await screen.findByRole("button", { name: /yes, i'm in home field/i });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("hands an actionable prompt to its owner rather than completing anything itself", async () => {
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.4857, accuracyMeters: 5 });
    renderSheet(okPrompt);
    fireEvent.click(await screen.findByRole("button", { name: /yes, i'm in home field/i }));
    fireEvent.click(screen.getByRole("button", { name: /spreading window open/i }));
    expect(onViewPrompt).toHaveBeenCalledWith(okPrompt);
  });

  it("doesn't offer a blocked prompt as an action", async () => {
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.4857, accuracyMeters: 5 });
    renderSheet(blockedPrompt);
    fireEvent.click(await screen.findByRole("button", { name: /yes, i'm in home field/i }));
    expect(screen.queryByText("Blocked prompt")).toBeNull();
  });

  it("offers no cattle, tag-reading or other unsupported action", async () => {
    getCurrentPosition.mockResolvedValue({ lat: 51.89895, lng: -8.4857, accuracyMeters: 5 });
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: /yes, i'm in home field/i }));
    await waitFor(() => expect(document.querySelector("[data-field-mode-confirmed]")).toBeTruthy());
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(document.body.textContent).not.toMatch(/cattle|EID|RFID/i);
  });

  it("can go back and change a confirmed field", async () => {
    renderSheet();
    await screen.findByText(/location isn't available/i);
    fireEvent.change(screen.getByLabelText(/choose a field/i), { target: { value: "field-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this field" }));
    fireEvent.click(screen.getByRole("button", { name: "Change field" }));
    expect(document.querySelector("[data-field-mode-choose]")).toBeTruthy();
  });
});
