/**
 * Real Farm V1 Phase 2 — session refresh + route protection, invoked from
 * `src/proxy.ts` (Next.js 16 renamed `middleware.ts` -> `proxy.ts`; see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * Supabase's documented Next.js App Router pattern: refresh the auth
 * session on every request that isn't a static asset, then redirect to
 * `/sign-in` if the route requires a signed-in farmer and none exists.
 * Per Next.js's own Data Security guide, this is defence in depth, not the
 * only check — every Server Action/Route Handler that touches farm data
 * must independently verify the session too, because a Server Action can
 * be called directly without going through a page proxy would otherwise
 * guard.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./env";

/** Routes reachable without a signed-in farmer. */
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // Documented credential blocker (docs/real-farm-v1/BUILD_LOG.md Phase
    // 2) — no Supabase project exists in this environment yet. Fail open
    // to mock/local behaviour rather than locking every route behind a
    // sign-in screen that can never succeed; once real credentials are
    // set this branch stops being reachable.
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = new URL("/sign-in", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
