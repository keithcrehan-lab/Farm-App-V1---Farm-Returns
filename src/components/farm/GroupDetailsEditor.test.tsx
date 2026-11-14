import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupRecordEdit } from "@/server/cattle-real/group-record-edit";
import { GroupDetailsEditor } from "./GroupDetailsEditor";

const mocked = vi.hoisted(() => ({
  update: vi.fn(async () => true),
  remove: vi.fn(async () => true),
  bulk: vi.fn(async (): Promise<{ ok: boolean; updated?: number; reason?: string; message?: string }> => ({ ok: true, updated: 2 })),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/store/farm-store", () => ({
  useFarm: () => ({ ownerName: "Farmer" }),
  useFarmActions: () => ({
    updateLivestockGroup: mocked.update,
    deleteLivestockGroup: mocked.remove,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocked.refresh, push: mocked.push }),
}));
vi.mock("@/app/(app)/cattle/real-actions", () => ({
  applyBreedToCurrentGroupMembers: mocked.bulk,
}));

const groupId = "6a000000-0000-4000-8000-000000000001";
const first = "a1000000-0000-4000-8000-000000000001";
const second = "a1000000-0000-4000-8000-000000000002";
const record: GroupRecordEdit = {
  groupId, name: "Weanlings", breed: null, categoryLabel: "Weanling",
  storedHeadcount: 2, individuals: 2, headcountEditable: false,
  headcountNote: null,
  members: [{ animalId: first, breed: "Angus" }, { animalId: second, breed: "Hereford" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.update.mockResolvedValue(true);
  mocked.bulk.mockResolvedValue({ ok: true, updated: 2 });
});
afterEach(cleanup);

function openEditor() {
  render(<GroupDetailsEditor record={record} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit group details" }));
}

function selectBreed(mode: "One breed" | "Crossbred" | "Mixed group" | "Not known") {
  fireEvent.click(screen.getByRole("button", { name: "Breed" }));
  fireEvent.click(screen.getByRole("radio", { name: mode }));
}

describe("group breed editor: safety and interaction", () => {
  it("starts with mixed from the two individual identities, without changing them", async () => {
    openEditor();
    expect(screen.getByText("1 Angus · 1 Hereford")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Breed" })).toHaveTextContent("Mixed breeds");
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save group details" }));
    await waitFor(() => expect(mocked.update).toHaveBeenCalledWith(groupId,
      expect.objectContaining({ breed: "Mixed breeds" }), "Farmer"));
    expect(mocked.bulk).not.toHaveBeenCalled();
  });

  it("saves a group breed without silently touching individual animals", async () => {
    openEditor();
    selectBreed("One breed");
    fireEvent.click(screen.getByRole("button", { name: "Charolais" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save group details" }));
    await waitFor(() => expect(mocked.update).toHaveBeenCalledWith(groupId,
      expect.objectContaining({ breed: "Charolais" }), "Farmer"));
    expect(mocked.bulk).not.toHaveBeenCalled();
  });

  it("requires checkbox plus second confirmation before overwriting individual breeds", async () => {
    openEditor();
    selectBreed("Crossbred");
    fireEvent.click(screen.getByRole("button", { name: "Limousin" }));
    fireEvent.click(screen.getByRole("button", { name: "Angus" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Apply this breed to all 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review breed changes" }));
    expect(screen.getByRole("alertdialog", { name: "Confirm animal breed changes" })).toBeInTheDocument();
    expect(mocked.bulk).not.toHaveBeenCalled();
    expect(mocked.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    await waitFor(() => expect(mocked.bulk).toHaveBeenCalledWith({
      groupId, breed: "Limousin × Angus", expectedAnimalIds: [first, second],
    }));
    expect(mocked.update).toHaveBeenCalledWith(groupId,
      expect.objectContaining({ breed: "Limousin × Angus" }), "Farmer");
  });

  it("can deliberately leave breed unknown and clear a stale group value", async () => {
    openEditor();
    selectBreed("Not known");
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save group details" }));
    await waitFor(() => expect(mocked.update).toHaveBeenCalledWith(groupId,
      expect.objectContaining({ breed: null }), "Farmer"));
    expect(mocked.bulk).not.toHaveBeenCalled();
  });

  it("refuses to save an incomplete cross and does not change group or animals", () => {
    openEditor();
    selectBreed("Crossbred");
    expect(screen.getByRole("button", { name: "Save group details" })).toBeDisabled();
    expect(mocked.update).not.toHaveBeenCalled();
    expect(mocked.bulk).not.toHaveBeenCalled();
  });

  it("clearly explains if group details saved but member corrections did not", async () => {
    mocked.bulk.mockResolvedValue({ ok: false, reason: "MEMBERS_CHANGED", message: "Animals in this group have changed. Reload before applying the breed." });
    openEditor();
    selectBreed("One breed");
    fireEvent.click(screen.getByRole("button", { name: "Angus" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Apply this breed to all 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review breed changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Group details were saved, but animal breeds were not updated/);
  });
});
