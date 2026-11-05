"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { runNextStep } from "@/lib/run/actions";

/**
 * Drives a run that is still `running`, one step per request.
 *
 * The server does not loop: this does. Each call runs exactly one step and
 * records it, so the whole chain never has to fit inside a single function
 * invocation -- which is the constraint that makes a three-step chain of ~20s
 * calls impossible to run any other way on a serverless platform.
 *
 * After each step it calls `router.refresh()`, so what you read is the row the
 * database actually stored rather than a copy of it held in this component.
 */
export default function RunProgress({
  runId,
  stepNames,
  completed,
}: {
  runId: string;
  stepNames: string[];
  completed: number;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [current, setCurrent] = useState(completed);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    // One driver per mount. React re-runs effects in development, and without
    // this guard the second pass would run the same step a second time and
    // record it twice.
    if (started.current) return;
    started.current = true;

    let cancelled = false;

    (async () => {
      let index = completed;

      while (!cancelled && index < stepNames.length) {
        setCurrent(index);

        const result = await runNextStep(runId);
        if (cancelled) return;

        if (!result.ok) {
          setError(result.message);
          router.refresh();
          return;
        }

        index += 1;
        router.refresh();

        if (result.done) {
          setFinished(true);
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, completed, stepNames.length, router]);

  if (error) {
    return (
      <div className="notice-error">
        <p className="font-medium">The run stopped on step {current + 1}.</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-xs">
          Every step that finished is recorded below. Fix the step and run the
          chain again — a failed run is kept rather than cleaned up, so the two
          can be compared.
        </p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="notice-info">
        Finished. Reloading the recorded output…
      </div>
    );
  }

  return (
    <div className="notice-info flex items-center gap-3">
      <span
        className="size-2 shrink-0 animate-pulse rounded-full"
        style={{ background: "var(--accent)" }}
      />
      <span>
        Running step {current + 1} of {stepNames.length}
        {stepNames[current] ? `: ${stepNames[current]}` : ""}…
        <span className="block text-xs" style={{ color: "var(--muted)" }}>
          One model call per step. Leaving this page stops the run after the
          step in flight; reopening it picks up where it left off.
        </span>
      </span>
    </div>
  );
}
