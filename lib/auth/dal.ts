import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Admin = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

/**
 * The authorization boundary for the whole admin area.
 *
 * `proxy.ts` runs the same check earlier and more cheaply, but a proxy cannot be
 * the boundary: Server Functions accept direct POSTs that never pass through it,
 * and a layout's check does not cover the actions or the pages nested under it.
 * So this runs in *every* page, Server Function and Route Handler, and RLS runs
 * behind it as the third layer.
 *
 * Wrapped in React's `cache()` rather than `use cache: private`. That is
 * deliberate: a private cache scope would hold the verdict for its `stale`
 * window, so a revoked admin would keep access for minutes. `cache()` dedupes
 * within a single render pass and re-verifies on every new request, which is the
 * behaviour an authorization check should have. The cost is one extra
 * `auth.getUser()` and one indexed primary-key lookup per request.
 *
 * `getUser()` and not `getSession()`: only `getUser()` validates the JWT against
 * the auth server instead of trusting whatever is in the cookie.
 */
export const requireSuperadmin = cache(async (): Promise<Admin> => {
  // Supabase's client reads `Date.now()` to decide whether the access token has
  // expired. Under Cache Components that is an unstable value, and Next refuses
  // to prerender a tree that produces one -- correctly, because a prerendered
  // "is this token still valid" is a cached authorization decision, which is
  // exactly the thing `cache()` below is chosen to avoid.
  //
  // `connection()` says what is already true: this answer belongs to one
  // request. Every caller of this function sits inside a `<Suspense>` boundary,
  // so marking it request-time costs nothing -- the shell still prerenders and
  // the authorized content streams in behind it.
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin, first_name, last_name, avatar_url")
    .eq("id", user.id)
    .single();

  // Not an admin, or no profile row at all. Both are "you may not be here".
  if (!profile?.is_superadmin) {
    redirect("/access-denied");
  }

  return {
    id: user.id,
    email: user.email ?? null,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarUrl: profile.avatar_url,
  };
});

/**
 * Gate first, then hand back a client bound to the same request's cookies.
 * Every function in `lib/data/` starts here, so there is no way to write a query
 * that forgot to authorize itself.
 */
export async function adminClient() {
  await requireSuperadmin();
  return createClient();
}
