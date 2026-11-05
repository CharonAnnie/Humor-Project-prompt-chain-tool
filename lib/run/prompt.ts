import "server-only";

/**
 * Turning a step's template into the exact string that gets sent.
 *
 * The placeholder vocabulary is not invented here -- the four chains seeded in
 * Week 7 already use `{{step_1}}`, `{{step_2}}` and `{{terms}}`, and the admin
 * panel's step editor documents them to whoever is writing a prompt. This
 * module is the half that was missing: the thing that actually substitutes
 * them.
 *
 *   {{step_1}} … {{step_n}}  an earlier step's output, 1-based
 *   {{previous}}             the step immediately before this one
 *   {{input}} / {{seed}}     the run's seed text
 *   {{terms}}                the active vernacular from `terms`
 *
 * An unrecognised placeholder is left in place rather than blanked. Blanking it
 * would send a prompt with a silent hole in it and the output would look merely
 * disappointing; leaving `{{plot}}` visible in the recorded request_prompt
 * makes the typo obvious the first time anyone reads the run.
 */

export type Term = {
  term: string;
  category: string;
  definition: string;
  example_usage: string | null;
};

export type RenderContext = {
  /** Outputs of the steps already run, in order. Index 0 is step 1. */
  stepOutputs: string[];
  seedInput: string | null;
  terms: Term[];
};

/**
 * The vernacular, as a prompt fragment.
 *
 * `banned` is a real category rather than a soft delete, so those terms are
 * interpolated too -- as the list to avoid. Dropping them would turn the
 * table's most deliberate feature into a no-op.
 */
export function renderTerms(terms: Term[]): string {
  if (terms.length === 0) return "(no vernacular configured)";

  const usable = terms.filter((term) => term.category !== "banned");
  const banned = terms.filter((term) => term.category === "banned");

  const lines = usable.map((term) => {
    const example = term.example_usage ? ` e.g. "${term.example_usage}"` : "";
    return `- ${term.term}: ${term.definition}${example}`;
  });

  if (banned.length > 0) {
    lines.push(
      "",
      `Do not use, under any circumstances: ${banned
        .map((term) => term.term)
        .join(", ")}.`,
    );
  }

  return lines.join("\n");
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function renderStepPrompt(
  template: string,
  context: RenderContext,
): string {
  return template.replace(PLACEHOLDER, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();

    if (key === "terms") return renderTerms(context.terms);

    if (key === "input" || key === "seed") {
      return context.seedInput ?? "";
    }

    if (key === "previous") {
      return context.stepOutputs.at(-1) ?? "";
    }

    const step = /^step_(\d+)$/.exec(key);
    if (step) {
      const index = Number(step[1]) - 1;
      // A step that reaches forward -- {{step_3}} inside step 2 -- resolves to
      // nothing, because nothing has run yet. Left as the placeholder so it
      // reads as the mistake it is.
      return context.stepOutputs[index] ?? whole;
    }

    return whole;
  });
}

/** Placeholders a template uses that this renderer has no value for. */
export function unknownPlaceholders(
  template: string,
  stepCount: number,
): string[] {
  const found = new Set<string>();

  for (const match of template.matchAll(PLACEHOLDER)) {
    const key = match[1].toLowerCase();
    if (["terms", "input", "seed", "previous"].includes(key)) continue;

    const step = /^step_(\d+)$/.exec(key);
    if (step && Number(step[1]) >= 1 && Number(step[1]) <= stepCount) continue;

    found.add(match[0]);
  }

  return [...found];
}

/**
 * The caption text a finished run produced.
 *
 * Every seeded chain's last step declares a schema with a single `caption`, and
 * a chain written to the assignment's example ends with several captions, so
 * both shapes are read. A step with no schema at all just returns its text.
 */
export function extractCaptions(finalOutput: string): string[] {
  const trimmed = finalOutput.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [trimmed];
  }

  const out: string[] = [];

  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) out.push(value.trim());
    else if (value && typeof value === "object") {
      const text = (value as { text?: unknown; caption?: unknown });
      if (typeof text.caption === "string" && text.caption.trim()) {
        out.push(text.caption.trim());
      } else if (typeof text.text === "string" && text.text.trim()) {
        out.push(text.text.trim());
      }
    }
  };

  if (typeof parsed === "string") {
    push(parsed);
  } else if (Array.isArray(parsed)) {
    parsed.forEach(push);
  } else if (parsed && typeof parsed === "object") {
    const object = parsed as Record<string, unknown>;
    if (Array.isArray(object.captions)) object.captions.forEach(push);
    else if (object.caption !== undefined) push(object.caption);
    else if (typeof object.text === "string") push(object.text);
  }

  // Nothing recognisable: the raw text is still what the model said, and a
  // caption a person can edit beats no caption and a swallowed result.
  return out.length > 0 ? out : [trimmed];
}
