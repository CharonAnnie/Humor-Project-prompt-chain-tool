"use client";

import { useActionState } from "react";
import { publishRun } from "@/lib/run/actions";

/**
 * The only control in this tool that writes to a table the public app reads,
 * which is why it is a button someone presses after reading the output rather
 * than a checkbox ticked before the run starts.
 */
export default function PublishButton({
  runId,
  captionCount,
}: {
  runId: string;
  captionCount: number;
}) {
  const [state, action, pending] = useActionState(publishRun, null);

  return (
    <form action={action}>
      <input type="hidden" name="run_id" value={runId} />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending
          ? "Publishing…"
          : `Publish ${captionCount === 1 ? "this caption" : `these ${captionCount} captions`} to Caption Drop`}
      </button>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Writes a <code>generations</code> row tagged with this chain and one{" "}
        <code>captions</code> row per caption, against the image this run read.
        They become visible in Caption Drop and in the admin panel.
      </p>
      {state && (
        <p
          className={state.ok ? "notice-info mt-3" : "notice-error mt-3"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
