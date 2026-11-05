"use client";

import { useActionState } from "react";
import {
  createStep,
  deleteStep,
  moveStep,
  updateStep,
} from "@/lib/chains/actions";
import type { ModelOption, Step } from "@/lib/data/chains";

/**
 * The steps of one chain: reorder, edit, delete, add.
 *
 * Each step owns its own `useActionState`, so a failed save on step 3 shows its
 * message under step 3 instead of at the top of a list of five. The move
 * buttons share one state per row for the same reason.
 */
export default function StepList({
  chainId,
  steps,
  models,
}: {
  chainId: number;
  steps: Step[];
  models: ModelOption[];
}) {
  return (
    <div className="grid gap-3">
      {steps.map((step, index) => (
        <StepRow
          key={step.id}
          chainId={chainId}
          step={step}
          models={models}
          position={index + 1}
          total={steps.length}
        />
      ))}

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Add a step
        </summary>
        <div className="mt-4">
          <AddStep chainId={chainId} models={models} nextNumber={steps.length + 1} />
        </div>
      </details>
    </div>
  );
}

function StepRow({
  chainId,
  step,
  models,
  position,
  total,
}: {
  chainId: number;
  step: Step;
  models: ModelOption[];
  position: number;
  total: number;
}) {
  const [moveState, move, moving] = useActionState(moveStep, null);
  const [saveState, save, saving] = useActionState(updateStep, null);
  const [deleteState, remove, removing] = useActionState(deleteStep, null);

  const model = models.find((candidate) => candidate.id === step.model_id);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* The arrows send an absolute target position rather than a
            direction, because that is what the RPC takes: "where should this
            step end up" survives a stale page, "one further down" does not. */}
        <div className="flex flex-col gap-0.5">
          <form action={move}>
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="chain_id" value={chainId} />
            <input type="hidden" name="to_position" value={position - 1} />
            <button
              type="submit"
              className="btn-icon"
              disabled={position === 1 || moving}
              title="Move up"
              aria-label={`Move ${step.name} to position ${position - 1}`}
            >
              ↑
            </button>
          </form>
          <form action={move}>
            <input type="hidden" name="step_id" value={step.id} />
            <input type="hidden" name="chain_id" value={chainId} />
            <input type="hidden" name="to_position" value={position + 1} />
            <button
              type="submit"
              className="btn-icon"
              disabled={position === total || moving}
              title="Move down"
              aria-label={`Move ${step.name} to position ${position + 1}`}
            >
              ↓
            </button>
          </form>
        </div>

        <span
          className="flex size-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums"
          style={{ background: "var(--surface-2)" }}
        >
          {step.step_number}
        </span>

        <h3 className="font-medium">{step.name}</h3>

        {!step.is_active && <span className="badge">inactive</span>}
        {model ? (
          <span className="badge">{model.slug}</span>
        ) : (
          <span className="badge">no model</span>
        )}
        {step.temperature !== null && (
          <span className="badge">temp {step.temperature}</span>
        )}
        {step.max_output_tokens !== null && (
          <span className="badge">max {step.max_output_tokens} tok</span>
        )}
        {model && !model.providerActive && (
          <span className="badge" style={{ color: "var(--warning)" }}>
            no key for {model.providerName}
          </span>
        )}
      </div>

      {step.purpose && (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {step.purpose}
        </p>
      )}

      <pre className="pre mt-3">{step.prompt_template}</pre>

      {moveState && !moveState.ok && (
        <p className="notice-error mt-3">{moveState.message}</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs" style={{ color: "var(--muted)" }}>
          Edit this step
        </summary>

        <form action={save} className="mt-4 grid gap-4">
          <input type="hidden" name="step_id" value={step.id} />
          <input type="hidden" name="chain_id" value={chainId} />
          <StepFields step={step} models={models} idPrefix={`step-${step.id}`} />

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save step"}
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

        <form action={remove} className="mt-4">
          <input type="hidden" name="step_id" value={step.id} />
          <input type="hidden" name="chain_id" value={chainId} />
          <button type="submit" disabled={removing} className="btn btn-danger">
            {removing ? "Deleting…" : "Delete step"}
          </button>
          <span className="ml-3 text-xs" style={{ color: "var(--muted)" }}>
            The remaining steps are renumbered to close the gap.
          </span>
          {deleteState && !deleteState.ok && (
            <p className="notice-error mt-3">{deleteState.message}</p>
          )}
        </form>
      </details>
    </div>
  );
}

function AddStep({
  chainId,
  models,
  nextNumber,
}: {
  chainId: number;
  models: ModelOption[];
  nextNumber: number;
}) {
  const [state, action, pending] = useActionState(createStep, null);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="chain_id" value={chainId} />
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Appended as step {nextNumber}. Move it afterwards if it belongs earlier.
      </p>
      <StepFields step={null} models={models} idPrefix="new-step" />
      <div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding…" : "Add step"}
        </button>
      </div>
      {state && !state.ok && <p className="notice-error">{state.message}</p>}
    </form>
  );
}

/** The same fields for create and edit, so the two cannot drift apart. */
function StepFields({
  step,
  models,
  idPrefix,
}: {
  step: Step | null;
  models: ModelOption[];
  idPrefix: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${idPrefix}-name`}>
            Name
          </label>
          <input
            id={`${idPrefix}-name`}
            name="name"
            required
            defaultValue={step?.name ?? ""}
            className="input mt-1.5"
            placeholder="Describe the image"
          />
        </div>

        <div>
          <label className="label" htmlFor={`${idPrefix}-model`}>
            Model
          </label>
          <select
            id={`${idPrefix}-model`}
            name="model_id"
            defaultValue={step?.model_id ?? ""}
            className="input mt-1.5"
          >
            <option value="">— none —</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName} · {model.providerName}
                {model.providerActive ? "" : " (no key configured)"}
                {model.isActive ? "" : " (retired)"}
                {model.supportsVision ? " · vision" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Each step calls its own model, so a chain can read an image on a
            cheap one and write on a better one.
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-purpose`}>
          Purpose
        </label>
        <textarea
          id={`${idPrefix}-purpose`}
          name="purpose"
          rows={2}
          defaultValue={step?.purpose ?? ""}
          className="input mt-1.5"
          placeholder="What this step is for. Not sent to the model."
        />
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-prompt`}>
          Prompt
        </label>
        <textarea
          id={`${idPrefix}-prompt`}
          name="prompt_template"
          required
          rows={10}
          defaultValue={step?.prompt_template ?? ""}
          className="input input-mono mt-1.5"
          placeholder={"Here is what step 1 found:\n{{step_1}}\n\nNow…"}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          <code>{"{{step_1}}"}</code>…<code>{"{{step_n}}"}</code> interpolate
          earlier steps, <code>{"{{previous}}"}</code> the one just before this,{" "}
          <code>{"{{input}}"}</code> the run&rsquo;s seed text, and{" "}
          <code>{"{{terms}}"}</code> the active vernacular. An unknown
          placeholder is left in the prompt rather than blanked, so a typo is
          visible in the recorded request.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`${idPrefix}-temperature`}>
            Temperature
          </label>
          <input
            id={`${idPrefix}-temperature`}
            name="temperature"
            type="number"
            min={0}
            max={2}
            step={0.05}
            defaultValue={step?.temperature ?? 1}
            className="input mt-1.5"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            0–2. Low for a step that reports facts, high for one that invents.
          </p>
        </div>

        <div>
          <label className="label" htmlFor={`${idPrefix}-max-tokens`}>
            Max output tokens
          </label>
          <input
            id={`${idPrefix}-max-tokens`}
            name="max_output_tokens"
            type="number"
            min={1}
            defaultValue={step?.max_output_tokens ?? ""}
            className="input mt-1.5"
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={step?.is_active ?? true}
            />
            Active
          </label>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-schema`}>
          Response schema (JSON)
        </label>
        <textarea
          id={`${idPrefix}-schema`}
          name="response_schema"
          rows={4}
          defaultValue={
            step?.response_schema ? JSON.stringify(step.response_schema, null, 2) : ""
          }
          className="input input-mono mt-1.5"
          placeholder={'{"type":"object","properties":{"caption":{"type":"string"}}}'}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Optional. With a schema the step is called in JSON mode and its output
          is stored parsed as well as raw. Malformed JSON is rejected here rather
          than at call time.
        </p>
      </div>
    </>
  );
}