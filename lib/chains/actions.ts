"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Every write the tool makes to a chain or a step.
 *
 * A Server Function is a POST endpoint that accepts a request from anywhere, so
 * living in this file protects nothing by itself. Each action therefore:
 *
 *   1. calls `requireSuperadmin()` before reading a single field;
 *   2. reads only the fields it names out of the FormData, so an extra key in
 *      the body is ignored rather than written;
 *   3. leaves the real rules to Postgres -- the slug format, the uniqueness of
 *      a step number, the 0..2 temperature range are all constraints, and a
 *      constraint re-implemented in TypeScript is a second definition of the
 *      same rule with nothing keeping the two in step. `friendly()` turns what
 *      comes back into a sentence instead;
 *   4. is refused a third time by RLS if the first check was somehow wrong.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const OK: ActionResult = { ok: true };

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/** Trimmed, or null when blank. Forms send "" for every untouched field. */
function text(form: FormData, key: string): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function id(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function num(form: FormData, key: string): number | null | "invalid" {
  const raw = text(form, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function bool(form: FormData, key: string): boolean {
  const raw = form.get(key);
  return raw === "on" || raw === "true";
}

/**
 * The four Postgres errors these forms can actually produce. Anything else is
 * passed through verbatim rather than flattened into "something went wrong",
 * which would throw away the half that says what to do about it.
 */
function friendly(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "23505":
      return error.message.includes("step_number")
        ? "That step number is already taken in this chain. Reload and try again."
        : "That slug is already in use. Chain slugs have to be unique.";
    case "23514":
      return `Rejected by a database constraint: ${error.message}`;
    case "23503":
      return "That points at a row which no longer exists. Reload and try again.";
    case "42501":
      return "You do not have permission to write this.";
    case "22023":
    case "P0002":
      return error.message;
    default:
      return error.message;
  }
}

function revalidateChain(chainId: number | string) {
  revalidatePath("/");
  revalidatePath(`/chains/${chainId}`);
  revalidatePath(`/chains/${chainId}/run`);
  revalidatePath(`/chains/${chainId}/media`);
}

// ── Chains ───────────────────────────────────────────────────────────────────

export async function createChain(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const slug = text(form, "slug");
  const name = text(form, "name");
  if (!slug) return fail("Slug is required.");
  if (!name) return fail("Name is required.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prompt_chains")
    .insert({
      slug,
      name,
      style: text(form, "style"),
      description: text(form, "description"),
      voice: text(form, "voice"),
      is_active: bool(form, "is_active"),
    })
    .select("id")
    .single();

  if (error) return fail(friendly(error));

  // The chain's mix row was created by the trigger on prompt_chains, not here.
  revalidateChain(data.id);
  redirect(`/chains/${data.id}`);
}

export async function updateChain(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const chainId = id(form, "chain_id");
  if (chainId === null) return fail("Which chain?");

  const slug = text(form, "slug");
  const name = text(form, "name");
  if (!slug) return fail("Slug is required.");
  if (!name) return fail("Name is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("prompt_chains")
    .update({
      slug,
      name,
      style: text(form, "style"),
      description: text(form, "description"),
      voice: text(form, "voice"),
      is_active: bool(form, "is_active"),
    })
    .eq("id", chainId);

  if (error) return fail(friendly(error));

  revalidateChain(chainId);
  return OK;
}

export async function deleteChain(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const chainId = id(form, "chain_id");
  if (chainId === null) return fail("Which chain?");

  const supabase = await createClient();
  const { error } = await supabase
    .from("prompt_chains")
    .delete()
    .eq("id", chainId);

  if (error) return fail(friendly(error));

  // Steps, examples, the mix row and this chain's runs go with it, by cascade.
  // Its llm_responses rows survive with chain_id set to null: an audit trail
  // that disappears when you tidy up is not an audit trail.
  revalidatePath("/");
  redirect("/");
}

// ── Steps ────────────────────────────────────────────────────────────────────

/**
 * Shared by create and update. Returns a message rather than a row when the
 * input cannot be coerced at all; everything else is Postgres's call.
 */
function stepValues(form: FormData):
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; message: string } {
  const name = text(form, "name");
  const prompt = text(form, "prompt_template");

  if (!name) return { ok: false, message: "Step name is required." };
  if (!prompt) return { ok: false, message: "A step with no prompt cannot run." };

  const temperature = num(form, "temperature");
  if (temperature === "invalid") {
    return { ok: false, message: "Temperature must be a number." };
  }

  const maxTokens = num(form, "max_output_tokens");
  if (maxTokens === "invalid") {
    return { ok: false, message: "Max output tokens must be a number." };
  }

  // Parsed here rather than sent as a string, so a malformed schema is rejected
  // at save time with the field named instead of at call time inside a run.
  let responseSchema: unknown = null;
  const rawSchema = text(form, "response_schema");
  if (rawSchema) {
    try {
      responseSchema = JSON.parse(rawSchema);
    } catch {
      return { ok: false, message: "Response schema is not valid JSON." };
    }
  }

  return {
    ok: true,
    values: {
      name,
      purpose: text(form, "purpose"),
      prompt_template: prompt,
      model_id: id(form, "model_id"),
      temperature,
      max_output_tokens: maxTokens,
      response_schema: responseSchema,
      is_active: bool(form, "is_active"),
    },
  };
}

export async function createStep(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const chainId = id(form, "chain_id");
  if (chainId === null) return fail("Which chain?");

  const coerced = stepValues(form);
  if (!coerced.ok) return fail(coerced.message);

  const supabase = await createClient();

  // Appended at the end. Reading the current max rather than counting rows
  // means a chain with a gap in its numbering still gets a free number, and the
  // unique constraint is the backstop if two creates race.
  const { data: last } = await supabase
    .from("prompt_chain_steps")
    .select("step_number")
    .eq("chain_id", chainId)
    .order("step_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("prompt_chain_steps").insert({
    ...coerced.values,
    chain_id: chainId,
    step_number: (last?.step_number ?? 0) + 1,
  } as never);

  if (error) return fail(friendly(error));

  revalidateChain(chainId);
  return OK;
}

export async function updateStep(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const stepId = id(form, "step_id");
  const chainId = id(form, "chain_id");
  if (stepId === null || chainId === null) return fail("Which step?");

  const coerced = stepValues(form);
  if (!coerced.ok) return fail(coerced.message);

  // `step_number` is deliberately not in here. Position is changed by
  // `moveStep` and nothing else, so the two cannot disagree about who owns it.
  const supabase = await createClient();
  const { error } = await supabase
    .from("prompt_chain_steps")
    .update(coerced.values as never)
    .eq("id", stepId);

  if (error) return fail(friendly(error));

  revalidateChain(chainId);
  return OK;
}

export async function deleteStep(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const stepId = id(form, "step_id");
  const chainId = id(form, "chain_id");
  if (stepId === null || chainId === null) return fail("Which step?");

  const supabase = await createClient();
  const { error } = await supabase
    .from("prompt_chain_steps")
    .delete()
    .eq("id", stepId);

  if (error) return fail(friendly(error));

  // Deleting step 2 of three leaves 1 and 3, and "step 3" is then both the last
  // step and the number the next insert wants. Closing the gap immediately
  // keeps the numbering someone reads the same as the order it runs in.
  const { error: compactError } = await supabase.rpc(
    "compact_prompt_chain_steps",
    { p_chain_id: chainId },
  );

  if (compactError) {
    return fail(
      `The step was deleted but the remaining ones could not be renumbered: ${compactError.message}`,
    );
  }

  revalidateChain(chainId);
  return OK;
}

/**
 * Reorder. One RPC, because this is the operation the client genuinely cannot
 * do: `unique (chain_id, step_number)` makes any two-write swap pass through a
 * state where two steps claim the same number, and Postgres rejects it. The
 * function renumbers the whole chain inside one transaction instead.
 */
export async function moveStep(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const stepId = id(form, "step_id");
  const chainId = id(form, "chain_id");
  const to = id(form, "to_position");

  if (stepId === null || chainId === null || to === null) {
    return fail("Which step, and to where?");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_prompt_chain_step", {
    p_step_id: stepId,
    p_to_position: to,
  });

  if (error) return fail(friendly(error));

  revalidateChain(chainId);
  return OK;
}
