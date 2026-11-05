import SignOutButton from "@/app/components/SignOutButton";

// Reached by a signed-in user whose profile is not flagged as a superadmin.
// It is listed in `PUBLIC_PATHS` in proxy.ts, so it is the one page inside the
// app a non-admin can render -- otherwise the redirect here would fail the same
// check and loop.
//
// It names no table, column value or row count. A visitor who should not be in
// the panel learns only that they are not in it.
export default function AccessDeniedPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-md p-8">
        <p className="label">403</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Access denied
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          You are signed in, but this account is not an administrator of Caption
          Drop, and the prompt chain tool is open only to administrators. If you
          think it should be, ask whoever runs the project to grant it.
        </p>
        <div className="mt-6 flex gap-3">
          <SignOutButton className="btn btn-primary" />
        </div>
      </div>
    </main>
  );
}
