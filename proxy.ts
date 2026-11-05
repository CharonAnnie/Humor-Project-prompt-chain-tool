import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

// Next.js 16 renamed Middleware to Proxy. This file must be `proxy.ts` with a
// `proxy` export -- a `middleware.ts` here would simply never run, which on an
// app whose entire security model starts with this check would fail silently and
// open. Proxy also defaults to the Node.js runtime in 16, so the profile lookup
// below is an ordinary Postgres query rather than an edge-constrained one.
//
// Everything that is NOT in this list is admin-only. Deny-by-default: adding a
// new page cannot accidentally leave it unguarded, because the guard is the
// default and the exceptions are enumerated here.
//
// `/access-denied` has to be on the list or a signed-in non-admin would be
// redirected to it, fail the check again, and loop.
const PUBLIC_PATHS = ["/login", "/auth", "/access-denied"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// A redirect is a new response, so the refreshed auth cookies that `setAll`
// wrote onto `carrying` have to be copied across or the session is silently
// dropped and the user bounces between /login and here.
function redirectCarryingCookies(url: URL, carrying: NextResponse) {
  const response = NextResponse.redirect(url);
  carrying.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes an expiring session as a side effect, writing rotated cookies onto
  // `response` through `setAll` above. That is why it runs on every request and
  // not only the guarded ones.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return response;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return redirectCarryingCookies(url, response);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_superadmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/access-denied";
    url.search = "";
    return redirectCarryingCookies(url, response);
  }

  // Note what this is and is not. It is an optimistic redirect that keeps the
  // wrong people from ever rendering a page. It is not the authorization
  // decision -- `requireSuperadmin()` in lib/auth/dal.ts makes that, per page
  // and per Server Function, and RLS makes it again in the database.
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
