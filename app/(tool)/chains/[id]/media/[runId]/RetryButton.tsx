"use client";

import { useActionState } from "react";
import { retryRun } from "@/lib/run/actions";

/**
 * Puts a failed run back to `running`, which is all a resume needs: the driver
 * works out where to carry on from by counting the steps that succeeded.
 *
 * Worth having its own button rather than retrying automatically. The failure
 * might be a busy model, in which case one press is the whole fix -- or it
 * might be a prompt that needs editing first, and a page that silently retried
 * would spend model calls on a step that cannot work yet.
 */
export default function RetryButton({
  runId,
  resumeFrom,
}: {
  runId: string;
  resumeFrom: number;
}) {
  const [state, action, pending] = useActionState(retryRun, null);

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="run_id" value={runId} />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Resuming…" : `Retry from step ${resumeFrom}`}
      </button>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Keeps the steps that already succeeded and re-runs only this one. The
        failed attempt stays in the record below.
      </p>
      {state && !state.ok && <p className="notice-error mt-3">{state.message}</p>}
    </form>
  );
}
