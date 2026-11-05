"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MIME, IMAGE_BUCKET, MAX_IMAGE_BYTES } from "@/lib/storage";
import { callModel, hasAdapter, StepCallError } from "./providers";
import { extractCaptions, renderStepPrompt, type Term } from "./prompt";

/**
 * Running a chain.
 *
 * One request runs one step, and the client comes back for the next one. That
 * is the whole design, and it is not an optimisation:
 *
 *   - the seeded chains are three steps of up to ~20s each, which does not fit
 *     inside a serverless function's budget. A chain killed mid-call loses the
 *     catch block that would have recorded the failure, and the run row is
 *     stranded `running` for ever;
 *   - a step that fails leaves every step before it recorded and readable,
 *     which is what makes a failed run worth looking at;
 *   - progress is real rather than a spinner with a guess attached.
 *
 * State lives entirely in the database between calls: the run row and the
 * `llm_responses` rows already written. Nothing is held in memory, so a reload
 * mid-run picks up exactly where it left off.
 */

export type RunStepResult =
  | { ok: true; done: boolean; stepNumber: number; stepName: string; output: string }
  | { ok: false; message: string };

export type StartResult = { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/** The errors these writes can actually produce, as sentences. */
function friendly(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "42501":
      return "You do not have permission to change this run.";
    case "23514":
      return `Rejected by a database constraint: ${error.message}`;
    default:
      return error.message;
  }
}

// ── Starting a run ───────────────────────────────────────────────────────────

/**
 * Creates the run row and sends the browser to it. No model is called here:
 * the run page starts stepping as soon as it loads, which keeps this request
 * fast and makes "started" a state the database holds rather than a promise
 * this function has to keep.
 */
export async function startRun(
  _prev: StartResult | null,
  form: FormData,
): Promise<StartResult> {
  const admin = await requireSuperadmin();

  const chainId = Number(form.get("chain_id"));
  if (!Number.isInteger(chainId)) return fail("Which chain?");

  const seedInput = (form.get("seed_input") as string | null)?.trim() || null;
  const existingImageId = (form.get("image_id") as string | null)?.trim() || null;

  // An upload arrives as a path, never as bytes: a Server Function body is
  // capped at 1MB and most photos are bigger, so the browser puts the file in
  // Storage itself and sends only where it put it.
  const storagePath = (form.get("storage_path") as string | null)?.trim() || null;
  const mimeType = (form.get("mime_type") as string | null)?.trim() || null;

  const supabase = await createClient();

  let imageId: string | null = existingImageId;

  if (storagePath) {
    // The client names the path, so it is checked rather than trusted. Storage
    // RLS confines a member's writes to their own folder, but reads from the
    // `images` bucket are public -- without this an admin could point a run at
    // any object in the bucket and file the result under their own name.
    if (!storagePath.startsWith(`${admin.id}/`) || storagePath.includes("..")) {
      return fail("That upload path is not yours.");
    }

    if (!mimeType || !ALLOWED_MIME.includes(mimeType as (typeof ALLOWED_MIME)[number])) {
      return fail("Upload a JPEG, PNG or WebP image.");
    }

    const sizeBytes = Number(form.get("size_bytes"));
    if (Number.isFinite(sizeBytes) && sizeBytes > MAX_IMAGE_BYTES) {
      return fail("That image is larger than 10MB.");
    }

    // Upsert on storage_path, the same as Caption Drop: re-running after a
    // failure reuses the image already uploaded instead of orphaning a row.
    const { data: image, error } = await supabase
      .from("images")
      .upsert(
        {
          user_id: admin.id,
          storage_path: storagePath,
          file_name: (form.get("file_name") as string | null) ?? null,
          mime_type: mimeType,
          width: Number(form.get("width")) || null,
          height: Number(form.get("height")) || null,
          size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        },
        { onConflict: "storage_path" },
      )
      .select("id")
      .single();

    if (error || !image) {
      return fail(`The image could not be saved: ${error?.message ?? "unknown error"}`);
    }

    imageId = image.id;
  }

  if (!imageId && !seedInput) {
    return fail(
      "A run needs something to start from: pick or upload an image, or type the text step 1 should read.",
    );
  }

  const { data: run, error: runError } = await supabase
    .from("prompt_chain_runs")
    .insert({
      chain_id: chainId,
      image_id: imageId,
      seed_input: seedInput,
      user_id: admin.id,
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return fail(`The run could not be started: ${runError?.message ?? "unknown error"}`);
  }

  revalidatePath(`/chains/${chainId}/media`);
  redirect(`/chains/${chainId}/media/${run.id}`);
}

// ── Running one step ─────────────────────────────────────────────────────────

export async function runNextStep(runId: string): Promise<RunStepResult> {
  const admin = await requireSuperadmin();
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("prompt_chain_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (!run) return fail("That run does not exist.");
  if (run.status !== "running") {
    return fail(`This run is already ${run.status}.`);
  }

  const [steps, responses, terms] = await Promise.all([
    supabase
      .from("prompt_chain_steps")
      .select("*, llm_models(slug, supports_vision, llm_providers(slug, is_active))")
      .eq("chain_id", run.chain_id)
      .eq("is_active", true)
      .order("step_number", { ascending: true }),
    // Only the successful ones count as progress. A retried run therefore
    // re-runs the step that failed rather than skipping past it.
    supabase
      .from("llm_responses")
      .select("step_number, response_text, status")
      .eq("run_id", runId)
      .eq("status", "succeeded")
      .order("step_number", { ascending: true }),
    supabase
      .from("terms")
      .select("term, category, definition, example_usage")
      .eq("is_active", true)
      .order("category", { ascending: true }),
  ]);

  const chainSteps = steps.data ?? [];
  if (chainSteps.length === 0) {
    await finish(supabase, runId, {
      status: "failed",
      error_message:
        "This chain has no active steps, so there is nothing to run. Add one, or reactivate the ones it has.",
    });
    return fail("This chain has no active steps.");
  }

  const done = responses.data ?? [];
  const next = chainSteps[done.length];

  if (!next) {
    // Every step has already succeeded; the run just never got marked.
    await finish(supabase, runId, {
      status: "succeeded",
      final_output: done.at(-1)?.response_text ?? null,
    });
    return { ok: true, done: true, stepNumber: 0, stepName: "", output: "" };
  }

  const model = next.llm_models;
  const provider = model?.llm_providers;

  if (!model || !provider) {
    const message = `Step ${next.step_number} (${next.name}) has no model. Pick one in the chain editor before running it.`;
    await recordFailure(supabase, { run, step: next, admin: admin.id, message, prompt: null });
    return fail(message);
  }

  if (!provider.is_active || !hasAdapter(provider.slug)) {
    const message = `Step ${next.step_number} runs on ${model.slug}, served by a provider this deployment has no key for. Point the step at a Google model, or add the key.`;
    await recordFailure(supabase, { run, step: next, admin: admin.id, message, prompt: null });
    return fail(message);
  }

  const prompt = renderStepPrompt(next.prompt_template, {
    stepOutputs: done.map((response) => response.response_text ?? ""),
    seedInput: run.seed_input,
    terms: (terms.data ?? []) as Term[],
  });

  // Only the first step sees the photo, and only if its model can read one.
  // Every later step works from the previous step's words -- which is the whole
  // reason a chain beats one prompt: a model asked to look at a picture and be
  // funny in a single call describes the picture instead.
  let image: { base64: string; mimeType: string } | null = null;

  if (done.length === 0 && run.image_id && model.supports_vision) {
    const { data: imageRow } = await supabase
      .from("images")
      .select("storage_path, mime_type")
      .eq("id", run.image_id)
      .maybeSingle();

    if (imageRow) {
      const { data: blob } = await supabase.storage
        .from(IMAGE_BUCKET)
        .download(imageRow.storage_path);

      if (blob) {
        image = {
          base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
          mimeType: imageRow.mime_type ?? "image/jpeg",
        };
      }
    }

    if (!image) {
      const message = `The image for this run could not be read from storage, so step ${next.step_number} has nothing to look at.`;
      await recordFailure(supabase, { run, step: next, admin: admin.id, message, prompt });
      return fail(message);
    }
  }

  try {
    const result = await callModel({
      providerSlug: provider.slug,
      modelSlug: model.slug,
      prompt,
      temperature: next.temperature,
      maxOutputTokens: next.max_output_tokens,
      responseSchema: (next.response_schema as Record<string, unknown> | null) ?? null,
      image,
    });

    // Written after the call rather than before it, because llm_responses is
    // append-only by grant -- `authenticated` holds SELECT and INSERT on it and
    // no UPDATE -- so a row cannot be inserted `pending` and finished later.
    // The run row is what carries in-flight state instead.
    await supabase.from("llm_responses").insert({
      run_id: runId,
      chain_id: run.chain_id,
      step_id: next.id,
      step_number: next.step_number,
      model_id: next.model_id,
      user_id: admin.id,
      generation_id: run.generation_id,
      request_prompt: prompt,
      response_text: result.text,
      response_json: (result.json ?? null) as never,
      status: "succeeded",
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: result.latencyMs,
      temperature: next.temperature,
    });

    const isLast = done.length + 1 === chainSteps.length;

    if (isLast) {
      await finish(supabase, runId, {
        status: "succeeded",
        final_output: result.text,
      });
      await rollUpTotals(supabase, runId);
    }

    revalidatePath(`/chains/${run.chain_id}/media/${runId}`);
    revalidatePath(`/chains/${run.chain_id}/media`);
    revalidatePath(`/chains/${run.chain_id}`);

    return {
      ok: true,
      done: isLast,
      stepNumber: next.step_number,
      stepName: next.name,
      output: result.text,
    };
  } catch (error) {
    const message =
      error instanceof StepCallError
        ? error.message
        : `Step ${next.step_number} failed: ${(error as { message?: string })?.message ?? "unknown error"}`;

    await recordFailure(supabase, { run, step: next, admin: admin.id, message, prompt });
    revalidatePath(`/chains/${run.chain_id}/media/${runId}`);
    return fail(message);
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The failed call, then the failed run. In that order, so the row survives. */
async function recordFailure(
  supabase: Supabase,
  args: {
    run: { id: string; chain_id: number; generation_id: string | null };
    step: { id: number; step_number: number; model_id: number | null; temperature: number | null };
    admin: string;
    message: string;
    prompt: string | null;
  },
) {
  await supabase.from("llm_responses").insert({
    run_id: args.run.id,
    chain_id: args.run.chain_id,
    step_id: args.step.id,
    step_number: args.step.step_number,
    model_id: args.step.model_id,
    user_id: args.admin,
    generation_id: args.run.generation_id,
    request_prompt: args.prompt,
    status: "failed",
    error_message: args.message,
    temperature: args.step.temperature,
  });

  await finish(supabase, args.run.id, {
    status: "failed",
    error_message: args.message,
  });
}

async function finish(
  supabase: Supabase,
  runId: string,
  values: { status: string; final_output?: string | null; error_message?: string | null },
) {
  await supabase
    .from("prompt_chain_runs")
    .update({ ...values, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

/** Tokens and wall-clock for the whole run, summed from its own responses. */
async function rollUpTotals(supabase: Supabase, runId: string) {
  const { data } = await supabase
    .from("llm_responses")
    .select("input_tokens, output_tokens, latency_ms")
    .eq("run_id", runId);

  if (!data) return;

  await supabase
    .from("prompt_chain_runs")
    .update({
      input_tokens: data.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
      output_tokens: data.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
      latency_ms: data.reduce((sum, row) => sum + (row.latency_ms ?? 0), 0),
    })
    .eq("id", runId);
}

// ── Resuming a failed run ────────────────────────────────────────────────────

/**
 * Puts a failed run back to `running` so the driver resumes from the step that
 * failed.
 *
 * This exists because the common failure is not a bad prompt, it is a busy
 * model: a 503 on step 3 of 3 would otherwise strand two successful calls that
 * were already paid for, and the only way forward would be to run the whole
 * chain again. `runNextStep` counts *succeeded* responses to decide what to run
 * next, so flipping the status is all a resume needs.
 *
 * The failed `llm_responses` row is deliberately left in place. It is append-only
 * by grant and it is the evidence of what happened; a retry that erased the
 * attempt it is retrying would make the audit trail flattering rather than true.
 */
export async function retryRun(
  _prev: { ok: boolean; message?: string } | null,
  form: FormData,
): Promise<{ ok: boolean; message?: string }> {
  await requireSuperadmin();

  const runId = (form.get("run_id") as string | null)?.trim();
  if (!runId) return { ok: false, message: "Which run?" };

  const supabase = await createClient();

  // Guarded on `status = 'failed'` in the statement itself rather than read
  // first and written after: a run that is already running must not be nudged,
  // or two drivers end up on the same step.
  const { data, error } = await supabase
    .from("prompt_chain_runs")
    .update({ status: "running", error_message: null, finished_at: null })
    .eq("id", runId)
    .eq("status", "failed")
    .select("id, chain_id");

  if (error) return { ok: false, message: friendly(error) };

  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "That run is not in a failed state, so there is nothing to resume.",
    };
  }

  revalidatePath(`/chains/${data[0].chain_id}/media/${runId}`);
  revalidatePath(`/chains/${data[0].chain_id}/media`);

  return { ok: true };
}

// ── Publishing ───────────────────────────────────────────────────────────────

/**
 * Turns a finished run's output into Caption Drop captions.
 *
 * Opt-in, and a separate action rather than a flag on the run, for two reasons:
 * the decision is usually made after reading what the chain produced, and this
 * is the only thing in the tool that writes to a table the public app reads.
 * Keeping it behind its own button means nothing publishes as a side effect.
 *
 * `generations` is written as well as `captions`, because that is the row
 * Caption Drop and the admin panel treat as the request a caption came from --
 * and `generations.prompt_chain_id` is what finally makes the admin panel's
 * chain screens show a chain that really ran.
 */
export async function publishRun(
  _prev: { ok: boolean; message?: string } | null,
  form: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = await requireSuperadmin();

  const runId = (form.get("run_id") as string | null)?.trim();
  if (!runId) return { ok: false, message: "Which run?" };

  const supabase = await createClient();

  const { data: run } = await supabase
    .from("prompt_chain_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (!run) return { ok: false, message: "That run does not exist." };
  if (run.status !== "succeeded") {
    return { ok: false, message: "Only a finished run can be published." };
  }
  if (run.generation_id) {
    return { ok: false, message: "This run has already been published." };
  }
  if (!run.image_id) {
    // `generations.image_id` is NOT NULL, and a caption with no photo is not a
    // thing Caption Drop can display anyway.
    return {
      ok: false,
      message:
        "Only an image-seeded run can be published: a Caption Drop caption belongs to a photo.",
    };
  }
  if (!run.final_output) {
    return { ok: false, message: "This run produced no output to publish." };
  }

  const captionTexts = extractCaptions(run.final_output);
  if (captionTexts.length === 0) {
    return { ok: false, message: "No caption could be read out of the final step's output." };
  }

  const [chain, lastResponse] = await Promise.all([
    supabase.from("prompt_chains").select("*").eq("id", run.chain_id).single(),
    supabase
      .from("llm_responses")
      .select("request_prompt, model_id, step_number, llm_models(slug)")
      .eq("run_id", runId)
      .eq("status", "succeeded")
      .order("step_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const modelSlug = lastResponse.data?.llm_models?.slug ?? "unknown";

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .insert({
      user_id: admin.id,
      image_id: run.image_id,
      model: modelSlug,
      llm_model_id: lastResponse.data?.model_id ?? null,
      prompt_chain_id: run.chain_id,
      system_instruction: `Prompt chain: ${chain.data?.name ?? run.chain_id} (${chain.data?.slug ?? ""})`,
      // The prompt that produced the published text is the last step's, which
      // already contains the earlier steps' output interpolated into it.
      user_prompt: lastResponse.data?.request_prompt ?? "",
      status: "succeeded",
      input_tokens: run.input_tokens,
      output_tokens: run.output_tokens,
      latency_ms: run.latency_ms,
      raw_response: { output_text: run.final_output },
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (generationError || !generation) {
    return {
      ok: false,
      message: `The generation row could not be written: ${generationError?.message ?? "unknown error"}`,
    };
  }

  const { error: captionsError } = await supabase.from("captions").insert(
    captionTexts.map((text) => ({
      user_id: admin.id,
      image_id: run.image_id!,
      generation_id: generation.id,
      // The chain's voice when it maps to one of Caption Drop's; null is a
      // legitimate value and the column allows it.
      voice: chain.data?.voice ?? null,
      text,
      prompt: lastResponse.data?.request_prompt ?? null,
      model: modelSlug,
    })),
  );

  if (captionsError) {
    return {
      ok: false,
      message: `The captions could not be written: ${captionsError.message}`,
    };
  }

  await supabase
    .from("prompt_chain_runs")
    .update({ generation_id: generation.id })
    .eq("id", runId);

  revalidatePath(`/chains/${run.chain_id}/media/${runId}`);
  revalidatePath(`/chains/${run.chain_id}/media`);

  return {
    ok: true,
    message: `Published ${captionTexts.length} caption${captionTexts.length === 1 ? "" : "s"} to Caption Drop.`,
  };
}
