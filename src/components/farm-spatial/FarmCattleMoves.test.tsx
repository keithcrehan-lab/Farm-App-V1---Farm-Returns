import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Field } from "@/domain/types";

vi.mock("@/app/actions/grazing-field-movements", () => ({
  listGrazingMovementGroupsAction: vi.fn(),
  moveLivestockGroupToFieldAction: vi.fn(),
}));

import { listGrazingMovementGroupsAction, moveLivestockGroupToFieldAction } from "@/app/actions/grazing-field-movements";
import { FarmCattleMoves } from "./FarmCattleMoves";

const square = (x0: number): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [[[x0, 52.7], [x0 + 0.001, 52.7], [x0 + 0.001, 52.701], [x0, 52.701], [x0, 52.7]]],
});
const FIELDS = [
  { id: "a", name: "Callas 1", areaHa: 2, centroid: [-8.7995, 52.7005], polygon: square(-8.8) },
  { id: "b", name: "Callas 2", areaHa: 2, centroid: [-8.7975, 52.7005], polygon: square(-8.798) },
] as unknown as Field[];

const GROUPS = [
  { id: "g-out", label: "Weanlings", category: "weanling", headCount: 24, system: "grazing", currentFieldId: "a", currentFieldName: "Callas 1", currentSince: "2026-11-01T09:00:00.000Z" },
  { id: "g-in", label: "Cows", category: "suckler_cow", headCount: 30, system: "housed" },
];

/** Opens a group's Move to… list and picks a field, then sends the confirmation. */
async function moveByTap(groupName: RegExp, fieldName: string) {
  fireEvent.pointerDown(await screen.findByRole("button", { name: groupName }));
  fireEvent.pointerUp(screen.getByRole("button", { name: groupName }));
  fireEvent.click(await screen.findByRole("button", { name: fieldName }));
  const confirm = await screen.findByRole("dialog", { name: /^Move .*\?$/ });
  fireEvent.click(within(confirm).getByRole("button", { name: "Move" }));
}

describe("cattle groups on the Farm map", () => {
  beforeEach(() => {
    vi.mocked(listGrazingMovementGroupsAction).mockResolvedValue(GROUPS as never);
    vi.mocked(moveLivestockGroupToFieldAction).mockResolvedValue({ status: "saved", sessionId: "s-new" });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows nothing and loads nothing for demo data", () => {
    const { container } = render(<FarmCattleMoves map={null} fields={FIELDS} enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(listGrazingMovementGroupsAction).not.toHaveBeenCalled();
  });

  it("lists groups that aren't on a field in the strip, with a hint to drag them onto one", async () => {
    render(<FarmCattleMoves map={null} fields={FIELDS} enabled />);
    expect(await screen.findByRole("button", { name: /^Cows, 30 head, housed/ })).toBeInTheDocument();
    expect(screen.getByText(/hold and drag onto one/i)).toBeInTheDocument();
    // A group on a mapped field is drawn on the map, not in the strip.
    expect(screen.queryByRole("button", { name: /^Weanlings/ })).not.toBeInTheDocument();
  });

  it("a tap opens Move to…, asks to confirm, then waits with Undo: undo saves nothing", async () => {
    render(<FarmCattleMoves map={null} fields={FIELDS} enabled />);
    await moveByTap(/^Cows, 30 head/, "Callas 2");
    expect(await screen.findByText("Moving Cows to Callas 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Moving Cows to Callas 2")).not.toBeInTheDocument();
    expect(moveLivestockGroupToFieldAction).not.toHaveBeenCalled();
  });

  it("saves a confirmed move with its exact time once the Undo window ends (here, by leaving the page)", async () => {
    const onMoved = vi.fn();
    const view = render(<FarmCattleMoves map={null} fields={FIELDS} enabled onMoved={onMoved} />);
    await moveByTap(/^Cows, 30 head/, "Callas 1");
    await screen.findByText("Moving Cows to Callas 1");
    expect(moveLivestockGroupToFieldAction).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => expect(moveLivestockGroupToFieldAction).toHaveBeenCalledTimes(1));
    const call = vi.mocked(moveLivestockGroupToFieldAction).mock.calls[0][0];
    expect(call).toMatchObject({ livestockGroupId: "g-in", fieldId: "a" });
    expect(Math.abs(Date.parse(call.movedAt!) - Date.now())).toBeLessThan(2 * 60_000);
  });

  it("offers Move to… when a group is pressed from the keyboard or a screen reader", async () => {
    render(<FarmCattleMoves map={null} fields={FIELDS} enabled />);
    fireEvent.click(await screen.findByRole("button", { name: /^Cows, 30 head/ }), { detail: 0 });
    expect(await screen.findByRole("dialog", { name: "Cows · 30 head" })).toBeInTheDocument();
  });

  it("refuses a move time before the group went into its current field, before anything is sent", async () => {
    vi.mocked(listGrazingMovementGroupsAction).mockResolvedValue([{ ...GROUPS[1], system: "grazing", currentFieldId: "elsewhere", currentFieldName: "Old field", currentSince: new Date().toISOString() }] as never);
    render(<FarmCattleMoves map={null} fields={FIELDS} enabled />);
    fireEvent.pointerDown(await screen.findByRole("button", { name: /^Cows, 30 head/ }));
    fireEvent.pointerUp(screen.getByRole("button", { name: /^Cows, 30 head/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Callas 2" }));
    const confirm = await screen.findByRole("dialog", { name: "Move Cows?" });
    fireEvent.change(within(confirm).getByLabelText("When"), { target: { value: "2026-01-01T08:00" } });
    fireEvent.click(within(confirm).getByRole("button", { name: "Move" }));
    expect(within(confirm).getByRole("alert")).toHaveTextContent(/went into Old field after that/);
    expect(moveLivestockGroupToFieldAction).not.toHaveBeenCalled();
  });
});
