"use client";

import { useActionState } from "react";
import { deleteChain, updateChain } from "@/lib/chains/actions";
import type { Chain } from "@/lib/data/chains";

export default function ChainSettings({
  chain,
  voices,
  runCount,
}: {
  chain: Chain;
  voices: { id: string; label: string }[];
  runCount: number;
}) {
  const [saveState, save, saving] = useActionState(updateChain, null);
  const [deleteState, remove, removing] = useActionState(deleteChain, null);

  return (
    <>
      <form action={save} className="grid gap-4">
        <input type="hidden" name="chain_id" value={chain.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="slug">
              Slug
            </label>
            <input
              id="slug"
              name="slug"
              required
              maxLength={60}
              defaultValue={chain.slug}
              className="input mt-1.5 font-mono"
            />
          </div>

          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={chain.name}
              className="input mt-1.5"
            />
          </div>

          <div>
            <label className="label" htmlFor="style">
              Style
            </label>
            <input
              id="style"
              name="style"
              maxLength={60}
              defaultValue={chain.style ?? ""}
              className="input mt-1.5"
            />
          </div>

          <div>
            <label className="label" htmlFor="voice">
              Caption voice
            </label>
            <select
              id="voice"
              name="voice"
              defaultValue={chain.voice ?? ""}
              className="input mt-1.5"
            >
              <option value="">— none —</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              The Caption Drop voice a published run writes in. Optional: a
              chain does not have to map to one.
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={chain.description ?? ""}
            className="input mt-1.5"
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={chain.is_active}
            className="mt-0.5"
          />
          <span>
            Active
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              An inactive chain stays in the database and stops being visible to
              Caption Drop. Deleting is for mistakes; deactivating is for
              decisions.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save chain"}
          </button>
          {saveState?.ok && (
            <span className="text-xs" style={{ color: "var(--positive)" }}>
              Saved.
            </span>
          )}
        </div>

        {saveState && !saveState.ok && (
          <p className="notice-error">{saveState.message}</p>
        )}
      </form>

      <details className="mt-6">
        <summary className="cursor-pointer text-xs" style={{ color: "var(--muted)" }}>
          Delete this chain
        </summary>
        <form action={remove} className="mt-3">
          <input type="hidden" name="chain_id" value={chain.id} />
          <p className="text-sm">
            Deletes its steps, its examples, its mix row and its{" "}
            {runCount === 1 ? "1 run" : `${runCount} runs`}. The model calls
            those runs made stay in <code>llm_responses</code> with the chain
            link set to null — an audit trail that disappears when you tidy up
            is not an audit trail.
          </p>
          <button type="submit" disabled={removing} className="btn btn-danger mt-3">
            {removing ? "Deleting…" : "Delete chain"}
          </button>
          {deleteState && !deleteState.ok && (
            <p className="notice-error mt-3">{deleteState.message}</p>
          )}
        </form>
      </details>
    </>
  );
}
