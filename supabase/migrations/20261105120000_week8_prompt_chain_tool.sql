-- Week 8: the prompt chain tool.
--
-- Week 7 (admin-panel) gave this database the whole prompt-chain *configuration*
-- surface: prompt_chains, prompt_chain_steps, the llm_providers/llm_models
-- registry, and llm_responses as the per-call audit trail. Four chains of three
-- steps each are seeded and have never been executed -- the admin panel's own
-- chain screen says so, because every row in llm_responses today is a
-- backfilled single-call Caption Drop generation that predates the chains.
--
-- This migration adds the two things that were missing for a chain to be edited
-- and run rather than only described:
--
--   1. an atomic reorder, because moving step 2 to step 1 is not something a
--      PostgREST client can do at all today (section 1);
--   2. a run record, so the per-step llm_responses rows a run produces group
--      into one thing a person can open and read (section 2).
--
-- Additive throughout. No existing column, constraint, policy or grant is
-- altered, so Caption Drop and the admin panel are untouched by it.


-- ── 1. Reordering steps ───────────────────────────────────────────────────────
-- `prompt_chain_steps` carries `unique (chain_id, step_number)`, which is what
-- makes "step 2" mean something. It is also why the client cannot reorder:
-- swapping two steps with two UPDATEs puts the table through a state where both
-- rows hold the same number, and a non-deferrable unique constraint rejects it.
-- Three writes with a temporary parking number would work and would leave a
-- step stranded there if the second write failed.
--
-- The constraint is deliberately NOT made deferrable to fix this. ON CONFLICT
-- cannot use a deferrable constraint as its arbiter, and the Week 7 seed
-- migration is built on `on conflict (chain_id, step_number) do nothing` and
-- documents itself as safe to re-run. Making the constraint deferrable here
-- would quietly break that file in the other repository.
--
-- So the renumber happens inside one function, in two statements, and never
-- occupies a number that is already taken:
--
--   phase 1  park every step of the chain above the live range (+ max), so no
--            row being updated can collide with a row that has not been
--            updated yet -- the failure mode of `update ... set n = n + 1`;
--   phase 2  bring them all back as 1..n in the new order.
--
-- Both run in the function's transaction, so a caller sees either the old
-- numbering or the new one. Neither phase ever writes a value <= 0, so the
-- `step_number > 0` check holds at every point.

-- SECURITY DEFINER with the authorization check written into the body, the same
-- shape as `public.admin_users` in Week 6. Definer is needed because the
-- function renumbers rows the caller is allowed to see one at a time but must
-- not be able to leave half-renumbered; `is_superadmin()` inside it is what
-- keeps that from being a privilege.
create or replace function public.reorder_prompt_chain_step(
  p_step_id     bigint,
  p_to_position integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_chain_id bigint;
  -- The step's current 1-based POSITION among its siblings, which is not the
  -- same thing as its step_number: numbering is 1..n on every path this tool
  -- takes, but a gap is reachable (a delete whose compaction failed, or a
  -- step_number edited by hand through the admin panel's generic table). Doing
  -- the arithmetic in step numbers makes a move land in the wrong slot exactly
  -- when the numbering is already untidy, so everything below is positions.
  v_from     integer;
  v_count    integer;
  v_offset   integer;
  v_key      numeric;
begin
  if not (select public.is_superadmin()) then
    raise exception 'Only a superadmin may reorder prompt chain steps'
      using errcode = '42501';
  end if;

  select chain_id
    into v_chain_id
    from public.prompt_chain_steps
   where id = p_step_id
     for update;

  if v_chain_id is null then
    raise exception 'No prompt chain step with id %', p_step_id
      using errcode = 'P0002';
  end if;

  select count(*)::integer, coalesce(max(step_number), 0)
    into v_count, v_offset
    from public.prompt_chain_steps
   where chain_id = v_chain_id;

  if p_to_position < 1 or p_to_position > v_count then
    raise exception 'Position % is outside 1..% for this chain', p_to_position, v_count
      using errcode = '22023';
  end if;

  select ranked.ord
    into v_from
    from (
      select s.id,
             row_number() over (order by s.step_number)::integer as ord
        from public.prompt_chain_steps s
       where s.chain_id = v_chain_id
    ) ranked
   where ranked.id = p_step_id;

  -- Nothing to do, and not an error: the UI disables the up arrow on the first
  -- step rather than relying on this, but a double-click should be harmless.
  -- `v_offset = v_count` is "the numbering is already exactly 1..n" -- with the
  -- unique constraint and the step_number > 0 check, max = count can mean
  -- nothing else -- so a move to the position it already holds still runs when
  -- there is a gap to close.
  if p_to_position = v_from and v_offset = v_count then
    return;
  end if;

  -- Where the moved step sorts among the others, which hold their positions.
  -- Moving *down* has to land after the step currently in that slot and moving
  -- *up* has to land before it; one shared half-step either way gets both,
  -- without either case needing to know how far it moved.
  v_key := case
             when p_to_position > v_from then p_to_position + 0.5
             else p_to_position - 0.5
           end;

  update public.prompt_chain_steps
     set step_number = step_number + v_offset
   where chain_id = v_chain_id;

  with by_number as (
    select s.id,
           row_number() over (order by s.step_number)::integer as ord
      from public.prompt_chain_steps s
     where s.chain_id = v_chain_id
  ),
  ranked as (
    select b.id,
           row_number() over (
             order by case
                        when b.id = p_step_id then v_key
                        else b.ord::numeric
                      end
           )::integer as ord
      from by_number b
  )
  update public.prompt_chain_steps s
     set step_number = r.ord
    from ranked r
   where s.id = r.id
     and s.step_number is distinct from r.ord;
end;
$fn$;

comment on function public.reorder_prompt_chain_step(bigint, integer) is
  'Moves one step to an absolute 1-based position and renumbers its chain gap-free, in one transaction. Superadmin only, checked in the body because the function is SECURITY DEFINER.';

revoke execute on function public.reorder_prompt_chain_step(bigint, integer) from public, anon;
grant  execute on function public.reorder_prompt_chain_step(bigint, integer) to authenticated;


-- Deleting step 2 of three leaves 1 and 3, and the next insert at "step 3"
-- then collides. Called after a delete so the numbering a person reads is
-- always 1..n with nothing missing.
create or replace function public.compact_prompt_chain_steps(p_chain_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_offset integer;
begin
  if not (select public.is_superadmin()) then
    raise exception 'Only a superadmin may renumber prompt chain steps'
      using errcode = '42501';
  end if;

  select coalesce(max(step_number), 0)
    into v_offset
    from public.prompt_chain_steps
   where chain_id = p_chain_id;

  if v_offset = 0 then
    return;
  end if;

  update public.prompt_chain_steps
     set step_number = step_number + v_offset
   where chain_id = p_chain_id;

  with ranked as (
    select s.id,
           row_number() over (order by s.step_number)::integer as ord
      from public.prompt_chain_steps s
     where s.chain_id = p_chain_id
  )
  update public.prompt_chain_steps s
     set step_number = r.ord
    from ranked r
   where s.id = r.id
     and s.step_number is distinct from r.ord;
end;
$fn$;

comment on function public.compact_prompt_chain_steps(bigint) is
  'Closes gaps in a chain''s step numbering, preserving order. Run after deleting a step.';

revoke execute on function public.compact_prompt_chain_steps(bigint) from public, anon;
grant  execute on function public.compact_prompt_chain_steps(bigint) to authenticated;


-- ── 2. Runs ───────────────────────────────────────────────────────────────────
-- One row per execution of a chain. `llm_responses` already records one row per
-- model call and carries chain_id, step_id and step_number, but it has no
-- notion of "these four calls were the same run" -- its only grouping column is
-- `generation_id`, which points at a Caption Drop request. A chain run started
-- from pasted text is not one of those, and `generations.image_id` is NOT NULL,
-- so it cannot be made into one either.
--
-- Hence this table, and `llm_responses.run_id` in section 3. A run that *did*
-- start from an image and chose to publish its captions also gets
-- `generation_id` filled in, which is what makes the same run visible in
-- Caption Drop and in the admin panel rather than only here.
create table if not exists public.prompt_chain_runs (
  id            uuid        primary key default gen_random_uuid(),
  chain_id      bigint      not null references public.prompt_chains (id) on delete cascade,
  user_id       uuid        not null default auth.uid()
                              references public.profiles (id) on delete cascade,
  -- The seed. An image, free text, or both: step 1 of every seeded chain reads
  -- a photo, but a chain whose first step takes text is a legitimate shape and
  -- the tool has to be able to run one.
  image_id      uuid        references public.images (id) on delete set null,
  seed_input    text,
  status        text        not null default 'running',
  -- The last step's output, copied up so a list of runs can show what each one
  -- produced without reading every response row.
  final_output  text,
  error_message text,
  -- Set only when the run published its captions back to Caption Drop.
  generation_id uuid        references public.generations (id) on delete set null,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  constraint prompt_chain_runs_status_check
    check (status in ('running', 'succeeded', 'failed')),
  -- A run with neither an image nor text has nothing to feed step 1.
  constraint prompt_chain_runs_has_seed
    check (image_id is not null or (seed_input is not null and seed_input <> ''))
);

create index if not exists prompt_chain_runs_chain_idx
  on public.prompt_chain_runs (chain_id, created_at desc);
create index if not exists prompt_chain_runs_created_idx
  on public.prompt_chain_runs (created_at desc);

comment on table public.prompt_chain_runs is
  'One execution of a prompt chain. The per-step model calls are in llm_responses, joined by run_id.';
comment on column public.prompt_chain_runs.status is
  'running until the last step returns. A run whose step fails is failed and keeps the responses it got that far.';
comment on column public.prompt_chain_runs.generation_id is
  'Set only when the run published its output as Caption Drop captions, which is opt-in per run.';

-- No `updated_at` column and no touch trigger here, unlike every table in
-- Week 7: a run is inserted once, updated once when it finishes, and then never
-- again. `finished_at` is the timestamp that means something, and it is set
-- explicitly by the code that finishes the run.


-- ── 3. Joining the responses to the run ───────────────────────────────────────
-- Nullable and additive: every row already in llm_responses is a pre-chain
-- Caption Drop call with no run, and that stays true.
--
-- ON DELETE CASCADE, unlike the chain_id and step_id columns beside it, which
-- are ON DELETE SET NULL so the audit trail survives tidying up. The difference
-- is deliberate: a response row whose run is gone is not evidence of anything,
-- because the run is the only thing that said what the inputs were.
alter table public.llm_responses
  add column if not exists run_id uuid references public.prompt_chain_runs (id) on delete cascade;

create index if not exists llm_responses_run_idx
  on public.llm_responses (run_id, step_number);

comment on column public.llm_responses.run_id is
  'The prompt_chain_runs row these calls belong to. Null for the pre-chain rows backfilled in Week 7.';


-- ── 4. Privileges and policies ────────────────────────────────────────────────
-- Same rule as Weeks 6 and 7: the tool ships the publishable anon key and
-- nothing else, so a table is reachable only through a policy that calls
-- `public.is_superadmin()`. Revoke first, then grant outright, because
-- Supabase's default privileges may or may not have fired depending on who ran
-- the migration.
alter table public.prompt_chain_runs enable row level security;
revoke all on public.prompt_chain_runs from anon, authenticated;

-- No DELETE: a run is the record of a model call that really happened, and the
-- cheap way to make a tool's history flattering is to let it delete the runs it
-- did not like. Deleting the chain still takes its runs with it, which is a
-- decision about the chain rather than about the evidence.
grant select, insert, update on public.prompt_chain_runs to authenticated;

drop policy if exists "superadmins read runs" on public.prompt_chain_runs;
create policy "superadmins read runs"
  on public.prompt_chain_runs for select
  to authenticated
  using ((select public.is_superadmin()));

-- `user_id` defaults to auth.uid() and the check pins it there, so a run always
-- records which admin started it even though every superadmin can read them all.
drop policy if exists "superadmins start their own runs" on public.prompt_chain_runs;
create policy "superadmins start their own runs"
  on public.prompt_chain_runs for insert
  to authenticated
  with check ((select public.is_superadmin()) and user_id = (select auth.uid()));

drop policy if exists "superadmins finish their own runs" on public.prompt_chain_runs;
create policy "superadmins finish their own runs"
  on public.prompt_chain_runs for update
  to authenticated
  using ((select public.is_superadmin()) and user_id = (select auth.uid()))
  with check ((select public.is_superadmin()) and user_id = (select auth.uid()));
