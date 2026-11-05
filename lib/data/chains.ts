import "server-only";
import { adminClient } from "@/lib/auth/dal";
import type { Tables } from "@/types/database";

/**
 * Every read in the tool, each one starting at `adminClient()` -- which
 * authorizes before it hands back a client -- so there is no way to write a
 * query here that forgot to check who is asking. RLS checks again underneath.
 */

export type Chain = Tables<"prompt_chains">;
export type Step = Tables<"prompt_chain_steps">;
export type Run = Tables<"prompt_chain_runs">;
export type Response = Tables<"llm_responses">;

export type ModelOption = {
  id: number;
  slug: string;
  displayName: string;
  providerSlug: string;
  providerName: string;
  /** False when the provider has no key configured, so the step cannot run. */
  providerActive: boolean;
  supportsVision: boolean;
  isDefault: boolean;
  isActive: boolean;
};

export type ChainSummary = {
  chain: Chain;
  stepCount: number;
  runCount: number;
  lastRunAt: string | null;
};

/** The chains list: every chain with enough context to pick one. */
export async function listChains(): Promise<ChainSummary[]> {
  const supabase = await adminClient();

  const [chains, steps, runs] = await Promise.all([
    supabase.from("prompt_chains").select("*").order("id", { ascending: true }),
    supabase.from("prompt_chain_steps").select("chain_id"),
    supabase.from("prompt_chain_runs").select("chain_id, created_at"),
  ]);

  if (chains.error) {
    throw new Error(`Could not load chains: ${chains.error.message}`);
  }

  const stepCounts = new Map<number, number>();
  for (const step of steps.data ?? []) {
    stepCounts.set(step.chain_id, (stepCounts.get(step.chain_id) ?? 0) + 1);
  }

  const runStats = new Map<number, { count: number; last: string | null }>();
  for (const run of runs.data ?? []) {
    const current = runStats.get(run.chain_id) ?? { count: 0, last: null };
    current.count += 1;
    if (!current.last || run.created_at > current.last) {
      current.last = run.created_at;
    }
    runStats.set(run.chain_id, current);
  }

  return (chains.data ?? []).map((chain) => ({
    chain,
    stepCount: stepCounts.get(chain.id) ?? 0,
    runCount: runStats.get(chain.id)?.count ?? 0,
    lastRunAt: runStats.get(chain.id)?.last ?? null,
  }));
}

/**
 * The model registry as the step editor needs it: flattened onto its provider,
 * because what matters when choosing a model is whether the provider has a key
 * -- and that is a column on the other table.
 */
export async function listModels(): Promise<ModelOption[]> {
  const supabase = await adminClient();

  const { data, error } = await supabase
    .from("llm_models")
    .select(
      "id, slug, display_name, supports_vision, is_default, is_active, llm_providers(slug, name, is_active)",
    )
    .order("is_active", { ascending: false })
    .order("slug", { ascending: true });

  if (error) throw new Error(`Could not load models: ${error.message}`);

  return (data ?? []).map((model) => ({
    id: model.id,
    slug: model.slug,
    displayName: model.display_name,
    providerSlug: model.llm_providers?.slug ?? "unknown",
    providerName: model.llm_providers?.name ?? "Unknown provider",
    providerActive: model.llm_providers?.is_active ?? false,
    supportsVision: model.supports_vision,
    isDefault: model.is_default,
    isActive: model.is_active,
  }));
}

export type ChainDetail = {
  chain: Chain;
  steps: Step[];
  models: ModelOption[];
  voices: { id: string; label: string }[];
  runCount: number;
};

/** One chain, its steps in run order, and everything the editor offers. */
export async function getChain(id: number): Promise<ChainDetail | null> {
  const supabase = await adminClient();

  const [chain, steps, models, voices, runs] = await Promise.all([
    supabase.from("prompt_chains").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("prompt_chain_steps")
      .select("*")
      .eq("chain_id", id)
      .order("step_number", { ascending: true }),
    listModels(),
    supabase.from("voices").select("id, label").order("sort_order"),
    supabase
      .from("prompt_chain_runs")
      .select("id")
      .eq("chain_id", id),
  ]);

  if (!chain.data) return null;

  return {
    chain: chain.data,
    steps: steps.data ?? [],
    models,
    voices: voices.data ?? [],
    runCount: runs.data?.length ?? 0,
  };
}

/** Active steps only, in run order. What the runner executes. */
export async function getRunnableChain(id: number) {
  const supabase = await adminClient();

  const [chain, steps, models] = await Promise.all([
    supabase.from("prompt_chains").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("prompt_chain_steps")
      .select("*")
      .eq("chain_id", id)
      .eq("is_active", true)
      .order("step_number", { ascending: true }),
    listModels(),
  ]);

  if (!chain.data) return null;
  return { chain: chain.data, steps: steps.data ?? [], models };
}

export type RunSummary = {
  run: Run;
  storagePath: string | null;
  stepsRecorded: number;
};

/** The media a chain has produced, newest first. */
export async function listRuns(chainId: number): Promise<RunSummary[]> {
  const supabase = await adminClient();

  const { data: runs, error } = await supabase
    .from("prompt_chain_runs")
    .select("*, images(storage_path)")
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load runs: ${error.message}`);

  const ids = (runs ?? []).map((run) => run.id);
  const counts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: responses } = await supabase
      .from("llm_responses")
      .select("run_id")
      .in("run_id", ids);

    for (const response of responses ?? []) {
      if (!response.run_id) continue;
      counts.set(response.run_id, (counts.get(response.run_id) ?? 0) + 1);
    }
  }

  return (runs ?? []).map(({ images, ...run }) => ({
    run,
    storagePath: images?.storage_path ?? null,
    stepsRecorded: counts.get(run.id) ?? 0,
  }));
}

export type RunDetail = {
  run: Run;
  chain: Chain;
  storagePath: string | null;
  responses: Response[];
  steps: Step[];
  models: Map<number, ModelOption>;
  captions: { id: string; text: string; voice: string | null }[];
};

/** One run, with every model call it made and whatever it published. */
export async function getRun(runId: string): Promise<RunDetail | null> {
  const supabase = await adminClient();

  const { data: run } = await supabase
    .from("prompt_chain_runs")
    .select("*, images(storage_path), prompt_chains(*)")
    .eq("id", runId)
    .maybeSingle();

  if (!run) return null;

  const { images, prompt_chains: chain, ...runRow } = run;
  if (!chain) return null;

  const [responses, steps, models, captions] = await Promise.all([
    supabase
      .from("llm_responses")
      .select("*")
      .eq("run_id", runId)
      .order("step_number", { ascending: true }),
    supabase
      .from("prompt_chain_steps")
      .select("*")
      .eq("chain_id", chain.id)
      .order("step_number", { ascending: true }),
    listModels(),
    // Only a published run has captions, and `generation_id` is the only thing
    // that links them -- the captions themselves know nothing about chains.
    runRow.generation_id
      ? supabase
          .from("captions")
          .select("id, text, voice")
          .eq("generation_id", runRow.generation_id)
      : Promise.resolve({ data: [] as { id: string; text: string; voice: string | null }[] }),
  ]);

  return {
    run: runRow,
    chain,
    storagePath: images?.storage_path ?? null,
    responses: responses.data ?? [],
    steps: steps.data ?? [],
    models: new Map(models.map((model) => [model.id, model])),
    captions: captions.data ?? [],
  };
}

/** Images already in the database, for seeding a run without an upload. */
export async function listSeedImages(limit = 60) {
  const supabase = await adminClient();

  const { data } = await supabase
    .from("images")
    .select("id, storage_path, file_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/** Public URL for an object in the `images` bucket, which is a public bucket. */
export function imageUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/images/${storagePath}`;
}
