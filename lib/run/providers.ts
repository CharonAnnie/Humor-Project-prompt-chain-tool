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
// this cap applies per call rather than to a whole chain.
const CALL_TIMEOUT_MS = 45_000;

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
  const startedAt = Date.now();

  // Body keys are snake_case and an unknown one is rejected outright; the
  // options argument is camelCase. Both of those are measured findings carried
  // over from lib/gemini.ts in the other two apps rather than guesses.
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

  try {
    const response = await ai.interactions.create(
      {
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
      },
      // `timeout`, not `timeout_ms`: an unknown key here is dropped silently,
      // which would leave the call uncapped. `maxRetries: 0` is what this
      // client honours -- without it the SDK retries a 429 behind our back and
      // a step that should fail in 300ms takes 34 seconds to say so.
      { timeout: CALL_TIMEOUT_MS, maxRetries: 0 },
    );

    const text = response.output_text?.trim() ?? "";

    if (!text) {
      throw new StepCallError(
        `${call.modelSlug} returned an empty response for this step.`,
      );
    }

    // A step with a schema asked for JSON, so parsing it here means the next
    // step interpolates structured output and the run page can pretty-print it.
    // A model that ignores its schema is recorded as text rather than failed.
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

    if (isDailyQuota(error)) {
      throw new StepCallError(
        `${call.modelSlug} is out of free-tier requests for today. The cap is per model, so pointing this step at a different model will run now.`,
        error,
      );
    }

    throw new StepCallError(
      `${call.modelSlug} did not answer: ${
        (error as { message?: string })?.message ?? "unknown error"
      }`,
      error,
    );
  }
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
