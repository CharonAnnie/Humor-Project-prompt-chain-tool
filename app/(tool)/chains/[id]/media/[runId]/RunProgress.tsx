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
 *
 * Both flags live in one ref, and that is the whole correctness argument.
 *
 * The obvious version of this -- a `started` ref to keep one driver, and a
 * `cancelled` local that the effect's cleanup sets -- stops after exactly one
 * step, which is a bug this component shipped with. `router.refresh()` changes
 * the props the parent computes from the database, React tears the effect down
 * and sets up a new one, the teardown cancels the loop that is mid-flight, and
 * the new setup declines to start another because `started` is already true.
 * Development's deliberate mount/unmount/mount does the same thing on its own.
 *
 * Keeping `cancelled` in the ref means a re-run can *revive* the driver rather
 * than orphan it: setup clears the flag, teardown sets it, and a loop that is
 * between awaits when both happen carries on as though nothing did. Only a real
 * unmount leaves the flag set, and the loop then stops after the step already in
 * flight -- never mid-call, so no step is lost or recorded twice.
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
  const driver = useRef({ started: false, cancelled: false });
  const [done, setDone] = useState(completed);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const total = stepNames.length;

  useEffect(() => {
    // Captured once, and safe to hold across awaits and into the cleanup: the
    // ref's value is a stable object that is never reassigned, so `state` and
    // `driver.current` are the same mutable flags for this component's life.
    const state = driver.current;

    // Set up: this component is mounted, so the driver is live again whether or
    // not a teardown just marked it otherwise.
    state.cancelled = false;

    // A driver is already looping. Leave it alone -- starting a second would
    // run the same step twice and record it twice.
    if (state.started) return;
    state.started = true;

    (async () => {
      // A chain cannot need more calls than it has steps. The cap is a stop
      // against a server that somehow never reports `done`, so a bug there
      // cannot turn into an unbounded loop of model calls.
      for (let attempt = 0; attempt <= total; attempt++) {
        const result = await runNextStep(runId);

        if (state.cancelled) {
          state.started = false;
          return;
        }

        if (!result.ok) {
          setError(result.message);
          state.started = false;
          router.refresh();
          return;
        }

        setDone((count) => count + 1);
        router.refresh();

        if (result.done) {
          setFinished(true);
          state.started = false;
          return;
        }
      }

      state.started = false;
    })();

    return () => {
      state.cancelled = true;
    };
  }, [runId, router, total]);

  if (error) {
    return (
      <div className="notice-error">
        <p className="font-medium">The run stopped on step {done + 1}.</p>
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
      <div className="notice-info">Finished. Reloading the recorded output…</div>
    );
  }

  return (
    <div className="notice-info flex items-center gap-3">
      <span
        className="size-2 shrink-0 animate-pulse rounded-full"
        style={{ background: "var(--accent)" }}
      />
      <span>
        Running step {done + 1} of {total}
        {stepNames[done] ? `: ${stepNames[done]}` : ""}…
        <span className="block text-xs" style={{ color: "var(--muted)" }}>
          One model call per step. Leaving this page stops the run after the step
          in flight; reopening it picks up where it left off.
        </span>
      </span>
    </div>
  );
}
