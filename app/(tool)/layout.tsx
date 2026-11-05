import { Suspense } from "react";
import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth/dal";
import SignOutButton from "@/app/components/SignOutButton";
import ThemeToggle from "@/app/components/ThemeToggle";

/**
 * The signed-in shell. Everything under this route group is superadmin-only:
 * `proxy.ts` redirects anyone else before a page renders, and every page and
 * action under here calls `requireSuperadmin()` again for itself, because a
 * layout's check does not cover what is nested inside it and a Server Function
 * can be POSTed to directly without passing through either.
 *
 * Nothing is awaited at this layout's top level. With Cache Components a
 * session read here would hold `{children}` -- the whole app -- behind that
 * request; instead the shell prerenders and the one piece that needs the
 * session streams into its own boundary.
 */
export default function ToolLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in oklab, var(--background) 85%, transparent)",
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-x-4 px-4 py-3 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Prompt <span style={{ color: "var(--accent)" }}>Chain</span> Tool
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            <Link href="/" className="nav-link">
              Chains
            </Link>
            <Link href="/models" className="nav-link">
              Models
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Suspense
              fallback={
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  …
                </span>
              }
            >
              <Identity />
            </Suspense>
            <ThemeToggle />
            <SignOutButton className="btn btn-secondary !py-1.5 !text-xs" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

async function Identity() {
  const admin = await requireSuperadmin();
  const name = [admin.firstName, admin.lastName].filter(Boolean).join(" ");

  return (
    <span className="hidden text-xs sm:inline" style={{ color: "var(--muted)" }}>
      {name || admin.email}
    </span>
  );
}
