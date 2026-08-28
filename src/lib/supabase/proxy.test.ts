import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it("treats every auth entry point as public", () => {
    for (const p of ["/sign-in", "/sign-up", "/forgot-password", "/update-password", "/auth/callback"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("treats a nested path under a public route as public (e.g. querystring-bearing callback)", () => {
    expect(isPublicPath("/auth/callback/")).toBe(true);
  });

  it("treats real farm routes as protected, not public", () => {
    for (const p of ["/", "/dashboard", "/fields", "/finance", "/settings", "/reports"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("does not treat a route that merely starts with a public route's name as public", () => {
    // "/sign-in-somehow" must not accidentally match "/sign-in" as a prefix.
    expect(isPublicPath("/sign-in-somehow")).toBe(false);
  });
});
