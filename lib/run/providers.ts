import "server-only";
import { GoogleGenAI } from "@google/genai";

/**
 * One model call, per provider.
 *
 * A chain's steps may each sit on a different model from a different provider --
 * that is the point of `llm_models.provider_id` being a foreign key rather than
 * a string -- so the runner asks this module for an adapter by provider slug and
 * never knows which SDK answered.
 *
 * Only `google` is implemented, because `GEMINI_API_KEY` is the only key this
 * project holds. The Week 7 registry already says exactly that about itself:
 * openai and anthropic are registered rows with `is_active = false` and a note
 * reading "No key configured, so the pipeline cannot select it." A step pointed
 * at one of them fails with that sentence instead of a stack trace, which is
 * the honest outcome and keeps the registry's claim and the runtime's behaviour
 * the same claim.
 */

export type StepCall = {
  providerSlug: string;
  modelSlug: string;
  prompt: string;
  /** Null leaves the provider's own default alone. */
  temperature: number | null;
  maxOutputTokens: number | null;
  /** Switches the call into JSON mode when the step declares a schema. */
  responseSchema: Record<string, unknown> | null;
  /** Step 1 of an image-seeded run. Only sent to a vision-capable model. */
  image: { base64: string; mimeType: string } | null;
};

export type StepCallResult = {
  text: string;
  json: unknown | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

/** A failure with a sentence meant for the person who clicked Run. */
export class StepCallError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StepCallError";
    this.cause = cause;
  }
}

// One step has to fit inside the platform's function budget with room for the
// database writes around it. The tool runs one step per request precisely so
// these caps apply per step rather than to a whole chain.
//
// The numbers are the ones lib/gemini.ts in the other two apps arrived at by
// measurement, re-scoped from "a whole chain of calls" to "one step":
const STEP_BUDGET_MS = 45_000;     // everything below must finish inside this
const ATTEMPT_TIMEOUT_MS = 20_000; // a single call that stalls is cut loose
const MIN_ATTEMPT_MS = 6_000;      // below this there is no point starting one
const ATTEMPTS = 3;

// Capacity problems, all of them worth asking the same model again:
//
//   503  "currently experiencing high demand, spikes are usually temporary" --
//        which is precisely a thing that is true for a second and then is not
//   429  a burst limit (the daily cap is told apart by its message below)
//   408, 500, 502, 504  transport and upstream hiccups
//
// A 400 or 403 is our bug or a bad key and fails identically on a retry, so it
// is thrown immediately rather than tried twice.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// Deliberately no model fallback, unlike lib/gemini.ts in the other two apps.
// They substitute the next model in a chain because any caption beats none.
// Here the step names its model and its temperature, and the entire value of
// the run page is showing what each step actually did -- so quietly running
// step 3 on a different model would either misreport the model or contradict
// the configuration being evaluated. The same model is retried instead, and a
// run that still cannot get through is resumable from the step that failed.
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let googleClient: GoogleGenAI | null = null;

function google(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new StepCallError(
      "This step's model is served by Google AI Studio, and GEMINI_API_KEY is not set in this environment.",
    );
  }

  googleClient ??= new GoogleGenAI({ apiKey });
  return googleClient;
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

function isDailyQuota(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  return /per day|daily limit|quota.*exceeded.*day/i.test(message);
}

async function callGoogle(call: StepCall): Promise<StepCallResult> {
  const ai = google();

  // Body keys are snake_case and an unknown one is rejected outright; the
  // options argument is camelCase. Both of those are measured findings carried
  // over from lib/gemini.ts in the other two apps rather than guesses.
  //
  // Typed as the SDK's own content union rather than a loose object array, so
  // a wrong key here is a compile error instead of an "Unknown parameter" at
  // run time.
  const input: (
    | { type: "text"; text: string }
    | { type: "image"; data: string; mime_type: string }
  )[] = [{ type: "text", text: call.prompt }];

  if (call.image) {
    input.push({
      type: "image",
      data: call.image.base64,
      mime_type: call.image.mimeType,
    });
  }

  const generationConfig: Record<string, unknown> = {};

  // `temperature` is marked deprecated on this API's generation config and
  // still honoured. It stays, because per-step temperature is a property of the
  // chain being modelled -- `prompt_chain_steps.temperature` is a real column
  // with a 0..2 constraint, and dropping it would make the step editor lie.
  if (call.temperature !== null) generationConfig.temperature = call.temperature;
  if (call.maxOutputTokens !== null) {
    generationConfig.max_output_tokens = call.maxOutputTokens;
  }

  const request = {
    model: call.modelSlug,
    input,
    ...(call.responseSchema
      ? {
          response_format: {
            type: "text" as const,
            mime_type: "application/json" as const,
            schema: call.responseSchema,
          },
        }
      : {}),
    ...(Object.keys(generationConfig).length > 0
      ? { generation_config: generationConfig }
      : {}),
  };

  const deadline = Date.now() + STEP_BUDGET_MS;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    const remaining = deadline - startedAt;

    // Never start a call that cannot finish inside the budget: reporting a real
    // error beats being killed mid-request with the step unrecorded.
    if (remaining < MIN_ATTEMPT_MS) break;

    try {
      const response = await ai.interactions.create(request, {
        // `timeout`, not `timeout_ms`: an unknown key here is dropped silently,
        // which would leave the call uncapped. `maxRetries: 0` is what this
        // client honours -- without it the SDK retries a 429 behind our back,
        // on its own schedule, inside one of our attempts.
        timeout: Math.min(ATTEMPT_TIMEOUT_MS, remaining),
        maxRetries: 0,
      });

      const text = response.output_text?.trim() ?? "";

      if (!text) {
        throw new StepCallError(
          `${call.modelSlug} returned an empty response for this step.`,
        );
      }

      // A step with a schema asked for JSON, so parsing it here means the next
      // step interpolates structured output and the run page can pretty-print
      // it. A model that ignores its schema is recorded as text, not failed.
      let json: unknown = null;
      if (call.responseSchema) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      return {
        text,
        json,
        inputTokens: response.usage?.total_input_tokens ?? null,
        outputTokens: response.usage?.total_output_tokens ?? null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;

      // An empty or unreadable reply is a different kind of failure from a busy
      // server, and asking again changes nothing about it.
      if (error instanceof StepCallError) throw error;

      const status = statusOf(error);

      if (status === 400 || status === 401 || status === 403) {
        throw new StepCallError(
          `${call.modelSlug} rejected the request (${status}). Check GEMINI_API_KEY, and check that this step's model slug is one the provider still serves.`,
          error,
        );
      }

      if (status === 404) {
        throw new StepCallError(
          `The provider does not serve "${call.modelSlug}" any more. Mark it inactive in the registry and point this step at a model that is.`,
          error,
        );
      }

      // A spent daily quota will still be spent in two seconds.
      if (isDailyQuota(error)) {
        throw new StepCallError(
          `${call.modelSlug} is out of free-tier requests for today. The cap is per model, so pointing this step at a different model will run now.`,
          error,
        );
      }

      if (status !== null && !RETRYABLE_STATUS.has(status)) {
        throw new StepCallError(
          `${call.modelSlug} did not answer: ${
            (error as { message?: string })?.message ?? `status ${status}`
          }`,
          error,
        );
      }

      // Retryable. Back off a little further each time -- a model under load
      // wants a breath, not an immediate second request.
      if (attempt < ATTEMPTS) await sleep(1_000 * attempt);
    }
  }

  const status = statusOf(lastError);
  const detail = (lastError as { message?: string })?.message ?? "no response";

  throw new StepCallError(
    status === 503
      ? `${call.modelSlug} is under heavy load and turned down ${ATTEMPTS} attempts over ${Math.round(STEP_BUDGET_MS / 1000)}s. This clears on its own: use Retry on this run and it picks up from this step, keeping the steps that already succeeded.`
      : `${call.modelSlug} did not answer after ${ATTEMPTS} attempts: ${detail}`,
    lastError,
  );
}

/**
 * Providers the tool can actually call. A model whose provider is absent from
 * this map is a configuration fact, not a bug -- the registry is allowed to
 * describe models this deployment has no key for.
 */
const ADAPTERS: Record<string, (call: StepCall) => Promise<StepCallResult>> = {
  google: callGoogle,
};

export function hasAdapter(providerSlug: string): boolean {
  return Object.hasOwn(ADAPTERS, providerSlug);
}

export async function callModel(call: StepCall): Promise<StepCallResult> {
  const adapter = ADAPTERS[call.providerSlug];

  if (!adapter) {
    throw new StepCallError(
      `No adapter for provider "${call.providerSlug}". This tool only has a key for Google AI Studio, so a step has to run on one of its models.`,
    );
  }

  return adapter(call);
}
