"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/auth/actions";

export default function SignOutButton({
  className = "btn btn-secondary",
}: {
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className={className}
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
