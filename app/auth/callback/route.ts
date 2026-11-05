import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google sends the user back here with a one-time `code`. Exchanging it writes
// the session cookies.
//
// This route deliberately does NOT check `is_superadmin`. Anyone with a Google
// account can complete a sign-in; what they get is a session, not access. The
// authorization decision belongs to `proxy.ts` and `requireSuperadmin()`, and
// keeping it out of here means there is exactly one place that decides.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // A declined consent screen comes back as `?error=`, with no code at all.
  const providerError = searchParams.get("error");
  if (providerError) {
    const query = new URLSearchParams({ error: providerError });
    const description = searchParams.get("error_description");
    if (description) query.set("error_description", description);
    return NextResponse.redirect(`${origin}/login?${query}`);
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`);
  }

  return NextResponse.redirect(`${origin}/`);
}
