import { Suspense } from "react";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";

// Everything outside the <Suspense> boundary is static and prerenders into the
// shell. Only the error banner reads `searchParams`, so only it has to wait.
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-sm p-8">
        <p className="label">Caption Drop</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Prompt Chain Tool
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          Builds and runs the prompt chains behind Caption Drop. Restricted to
          accounts flagged as superadmins in the database -- signing in does not
          grant access on its own.
        </p>

        <div className="mt-6">
          <GoogleSignInButton />
        </div>

        <Suspense fallback={null}>
          <AuthError searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

const MESSAGES: Record<string, string> = {
  missing_code: "Google sent you back without an authorization code. Try again.",
  exchange_failed: "That sign-in link could not be exchanged for a session. Try again.",
  no_user: "The session was created but no user came back with it. Try again.",
  access_denied: "You cancelled the Google sign-in.",
};

async function AuthError({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { error, error_description } = await searchParams;
  if (typeof error !== "string") return null;

  const message =
    MESSAGES[error] ??
    (typeof error_description === "string" ? error_description : error);

  return <p className="notice-error mt-4">{message}</p>;
}
