# Prompt Chain Tool

Week 8. A superadmin-only tool for building, reordering and **running** the
prompt chains behind Caption Drop, against the same Supabase project as
[`humor-project-hello-world`](../humor-project-hello-world) (the public app) and
[`admin-panel`](../admin-panel) (the admin area).

A prompt chain is several prompts in sequence, where each step's output is the
next step's input, and every step calls **its own model at its own
temperature**. That is the whole reason it is a chain rather than one prompt: a
model asked to look at a photo and be funny in a single call describes the photo
instead of reacting to it.

## What was already there, and what this adds

Week 7 put the entire prompt-chain *configuration* surface in the database from
the admin panel: `prompt_chains`, `prompt_chain_steps` (with `model_id`,
`temperature`, `max_output_tokens`, `response_schema`), the
`llm_providers` → `llm_models` registry, and `llm_responses` as the per-call
audit trail. Four chains of three steps each were seeded — and never executed.
The admin panel's own chain screen says so: *"every response in the table so far
predates the chains."*

So this tool is the execution and editing surface that was missing, not a second
copy of the schema. It adds exactly two things to the database
(`supabase/migrations/20261105120000_week8_prompt_chain_tool.sql`, additive —
nothing existing is altered):

1. **`reorder_prompt_chain_step(step_id, to_position)`** and
   `compact_prompt_chain_steps(chain_id)`. Reordering is the one operation a
   PostgREST client genuinely cannot do: `unique (chain_id, step_number)` means
   any two-write swap passes through a state where two steps claim the same
   number, and Postgres rejects it. The function renumbers the whole chain in
   one transaction, in two statements — park every step above the live range,
   then bring them back as 1..n — so the constraint is never violated and no
   step is ever left parked. It is `SECURITY DEFINER` with
   `public.is_superadmin()` checked in its body, and granted to `authenticated`
   only.
2. **`prompt_chain_runs`**, plus `llm_responses.run_id`. `llm_responses` already
   records one row per model call but has no notion of "these four calls were
   one run"; its only grouping column is `generation_id`, which points at a
   Caption Drop request, and `generations.image_id` is `NOT NULL` so a run
   seeded with text could never be one.

## Interface

| Route | What it does |
|---|---|
| `/` | Every chain, with step and run counts. Create a chain. |
| `/chains/[id]` | The editor: chain fields, and each step with ↑/↓ reorder, inline edit, delete, add. Per-step model and temperature. |
| `/chains/[id]/run` | Run it, seeded by an upload, an image already in the database, or plain text. |
| `/chains/[id]/media` | **The media this chain has produced** — every run, newest first. |
| `/chains/[id]/media/[runId]` | One run: the image, and for each step the exact prompt sent (with earlier output interpolated), what came back, the model, temperature, tokens and latency. |
| `/models` | The registry, read-only, answering "why can this step not run". |
| `/login`, `/access-denied` | Google sign-in; the one page a non-admin can render. |

Light / dark / **system** is a three-way toggle in the header. The preference
lives in `localStorage` and is read through `useSyncExternalStore`; "system" is
the *absence* of a `data-theme` attribute, so the `prefers-color-scheme` media
query decides and the stored preference can never disagree with the CSS. A
synchronous inline script applies an explicit choice before first paint, so
there is no flash — and with JavaScript off the OS theme still works.

## Authorization

Three layers, the same arrangement as the admin panel:

1. `proxy.ts` — deny-by-default. Everything not in `PUBLIC_PATHS` requires a
   session *and* `profiles.is_superadmin`. (Next 16 renamed Middleware to Proxy:
   a `middleware.ts` here would never run, which on this app would fail silently
   and open.)
2. `requireSuperadmin()` in every page, Server Function and Route Handler. A
   proxy cannot be the boundary, because a Server Function accepts direct POSTs
   that never pass through it.
3. RLS, which refuses it again. **The only key this app holds is the publishable
   anon key** — there is no service-role key anywhere — so every row it can read
   or write is one a policy decided to show the signed-in user.

`is_superadmin` is not writable through the API (a trigger from Week 6 blocks
it), so the tool cannot grant itself access.

## Running a chain

One request runs one step, and the browser comes back for the next. This is not
an optimisation: the seeded chains are three steps of up to ~20s, which does not
fit in a serverless function's budget, and a chain killed mid-call loses the
`catch` that would have recorded the failure — leaving the run stranded
`running` for ever. Stepping also means a failure keeps every step before it,
which is what makes a failed run worth reading, and progress is real rather than
a spinner with a guess attached. All state between calls is in the database, so
a reload mid-run resumes where it left off.

Prompt placeholders: `{{step_1}}`…`{{step_n}}`, `{{previous}}`, `{{input}}` (the
run's seed text) and `{{terms}}` (the active vernacular from `terms`, including
the `banned` ones, interpolated as the list to avoid). An unrecognised
placeholder is left in the prompt rather than blanked, so a typo is visible in
the recorded request instead of silently producing a worse answer.

**Transient failures.** A step retries its own model up to 3 times inside a 45s
budget for the statuses that mean "busy rather than wrong" — 503, a 429 burst
limit, 408/500/502/504. A 400/401/403 (our bug or a bad key), a 404 (retired
model) and a spent daily quota are thrown immediately, because they fail
identically on a second attempt. If a step still cannot get through, the run is
marked failed and the run page offers **Retry from step N**, which resumes from
that step and keeps the calls that already succeeded — `runNextStep` decides
where to carry on by counting *succeeded* responses. The failed attempt stays in
`llm_responses`, which is append-only by grant.

There is deliberately **no model fallback**, unlike `lib/gemini.ts` in the other
two apps: they substitute the next model in a chain because any caption beats
none, whereas here the step names its model and temperature and the whole point
of the run page is showing what each step actually did.

**Providers.** A step calls whatever provider its model belongs to; only
`google` has an adapter, because `GEMINI_API_KEY` is the only key this project
holds. That matches what the registry already says about itself — `openai` and
`anthropic` are registered, inactive, and noted as having no key — so a step
pointed at one fails with that sentence instead of a stack trace.

**Publishing is opt-in and separate.** A finished, image-seeded run can be
published to Caption Drop with a button on the run page: it writes a
`generations` row tagged `prompt_chain_id` plus one `captions` row per caption.
That is the only thing in this tool that writes to a table the public app reads,
which is why it is a deliberate press after reading the output rather than a
flag set before the run.

## Local setup

```bash
npm install
# .env.local — all three are also needed in Vercel
#   NEXT_PUBLIC_SUPABASE_URL=
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=
#   GEMINI_API_KEY=
npm run dev
```

Apply `supabase/migrations/20261105120000_week8_prompt_chain_tool.sql` to the
shared project (Supabase MCP or the dashboard SQL editor), then regenerate
`types/database.ts` — it is hand-extended with the new table, column and
functions so the app could be built before the migration was applied, and
regenerating is what catches any drift.

## Deployment

Vercel, with the three environment variables above. Two things are easy to
forget:

- **Deployment protection off**, so the app opens in Incognito.
- The deployment's origin added to **Supabase Auth → URL Configuration →
  Redirect URLs** as `https://<host>/auth/callback`. Without it Google sign-in
  completes and bounces.

## Assignment checklist

| Requirement | Where |
|---|---|
| Only works for `profiles.is_superadmin == TRUE` | `proxy.ts`, `lib/auth/dal.ts`, RLS |
| Create / update / delete a prompt chain | `/` and `/chains/[id]` |
| Create / update / delete a prompt chain step | `/chains/[id]` |
| Reorder a step (move step 2 to step 1) | ↑/↓ on `/chains/[id]` → `reorder_prompt_chain_step` |
| Generate media from the chain | `/chains/[id]/run` |
| View media produced by a specific chain | `/chains/[id]/media` |
| Dark / light / system theme | header toggle, `app/components/ThemeToggle.tsx` |
| Different LLMs and temperatures per prompt | per-step `model_id` and `temperature`; `lib/run/providers.ts` |
