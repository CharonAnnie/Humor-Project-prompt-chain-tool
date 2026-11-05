"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The OAuth call has to start in the browser: @supabase/ssr uses PKCE, and the
// code verifier is written to a browser cookie that `/auth/callback` later reads
// to exchange the code. Starting the flow on the server would leave no verifier.
export default function GoogleSignInButton() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithGoogle = async () => {
    setBusy(true);
    const supabase = createClient();

    // Exactly `/auth/callback`, no extra query parameters: Supabase matches this
    // against its Redirect URLs allow-list, which has to include every origin
    // the app is served from -- localhost and each Vercel URL.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={signInWithGoogle}
        disabled={busy}
        className="btn btn-primary btn-lg w-full"
      >
        <GoogleMark />
        {busy ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p className="notice-error mt-4">{error}</p>}
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.58 2.68-3.9 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a8.99 8.99 0 0 0 0 8.12l3.01-2.34Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
