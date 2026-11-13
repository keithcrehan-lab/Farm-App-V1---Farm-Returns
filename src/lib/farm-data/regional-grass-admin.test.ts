import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type TestUser = { id: string; email: string; email_confirmed_at: string | null };
const state = vi.hoisted(() => ({
  user: null as TestUser | null,
  hasAdminRow: false,
  adminLookupCount: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    },
    from: (table: string) => {
      if (table !== "app_admins") throw new Error("unexpected table");
      state.adminLookupCount += 1;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.hasAdminRow ? { user_id: "the-admin" } : null,
              error: null,
            }),
          }),
        }),
      };
    },
  })),
}));

import {
  canCurrentUserManageRegionalGrassGrowth,
  getRegionalGrassAdminClient,
} from "./regional-grass-admin";

beforeEach(() => {
  state.user = null;
  state.hasAdminRow = false;
  state.adminLookupCount = 0;
});

describe("regional grass growth publishing access", () => {
  it("denies signed-out users without consulting role data", async () => {
    expect(await getRegionalGrassAdminClient()).toBeNull();
    expect(state.adminLookupCount).toBe(0);
  });

  it("denies a different signed-in email, even if it has an admin role", async () => {
    state.user = { id: "other", email: "someone@example.com", email_confirmed_at: "2026-11-01" };
    state.hasAdminRow = true;
    expect(await canCurrentUserManageRegionalGrassGrowth()).toBe(false);
    expect(state.adminLookupCount).toBe(0);
  });

  it("denies an unconfirmed account using the matching email", async () => {
    state.user = { id: "the-admin", email: "keith.crehan@gmail.com", email_confirmed_at: null };
    state.hasAdminRow = true;
    expect(await canCurrentUserManageRegionalGrassGrowth()).toBe(false);
  });

  it("denies the matching email if its database admin role is missing", async () => {
    state.user = { id: "the-admin", email: "keith.crehan@gmail.com", email_confirmed_at: "2026-11-01" };
    expect(await canCurrentUserManageRegionalGrassGrowth()).toBe(false);
  });

  it("permits only the verified owner whose account has the database admin role", async () => {
    state.user = { id: "the-admin", email: "Keith.Crehan@Gmail.com", email_confirmed_at: "2026-11-01" };
    state.hasAdminRow = true;
    expect(await canCurrentUserManageRegionalGrassGrowth()).toBe(true);
    expect(state.adminLookupCount).toBe(1);
  });
});
