import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Create account and sign in: simple, Farm Return in tone, and never ask for farm information. */

vi.mock("@/app/actions/auth", () => ({ signUp: vi.fn(), signIn: vi.fn() }));
const params = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => params.value }));

import SignUpPage from "./sign-up/page";
import { SignInForm } from "./sign-in/SignInForm";

afterEach(() => {
  cleanup();
  params.value = new URLSearchParams();
});

describe("Create account", () => {
  it("asks only for email and password, then points to setting up the farm", () => {
    render(<SignUpPage />);
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText("Start by setting up your farm. It only takes a few minutes.")).toBeInTheDocument();
    const inputs = document.querySelectorAll("input:not([type=hidden])");
    expect([...inputs].map((i) => i.getAttribute("name"))).toEqual(["email", "password"]);
    expect(screen.getByLabelText(/Password/)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: /Create account/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(document.body.textContent).not.toMatch(/county|farm name|hectares|livestock/i);
  });
});

describe("Sign in", () => {
  it("is quiet: welcome back, email, password, sign in, forgot password, create an account", () => {
    render(<SignInForm />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
  });

  it("a failed email link is explained in plain words", () => {
    params.value = new URLSearchParams("error=confirmation_failed");
    render(<SignInForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(/didn't work or has expired/);
  });
});
