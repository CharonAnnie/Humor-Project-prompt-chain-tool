"use client";

import { useActionState } from "react";
import { createChain } from "@/lib/chains/actions";

/**
 * `useActionState` rather than hand-rolled pending state: the action already
 * returns either ok or a message, and this hook is the thing that carries that
 * message back to the form it came from without a state machine in between.
 */
export default function NewChainForm() {
  const [state, action, pending] = useActionState(createChain, null);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-slug">
            Slug
          </label>
          <input
            id="new-slug"
            name="slug"
            required
            maxLength={60}
            placeholder="image_to_captions"
            className="input mt-1.5 font-mono"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Lowercase, digits, hyphens and underscores. The database enforces the
            shape, so a bad slug is refused rather than quietly accepted.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="new-name">
            Name
          </label>
          <input
            id="new-name"
            name="name"
            required
            className="input mt-1.5"
            placeholder="Image to captions"
          />
        </div>

        <div>
          <label className="label" htmlFor="new-style">
            Style
          </label>
          <input id="new-style" name="style" maxLength={60} className="input mt-1.5" />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked />
            Active
          </label>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="new-description">
          Description
        </label>
        <textarea
          id="new-description"
          name="description"
          rows={2}
          className="input mt-1.5"
          placeholder="What this chain is for, and what the steps do between them."
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create chain"}
        </button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Creating a chain also creates its row in the chain mix, at weight 1 — a
          database trigger does that, not this form.
        </span>
      </div>

      {state && !state.ok && <p className="notice-error">{state.message}</p>}
    </form>
  );
}
