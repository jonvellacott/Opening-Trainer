-- Canonical repertoire schema. See docs/architecture.md for the model rationale.
create extension if not exists pgcrypto;

-- Global reference data, shared across every repertoire -------------------

create table positions (
  fen text primary key
  -- normalized: piece placement + side-to-move + castling + en-passant only.
  -- Halfmove/fullmove clocks are dropped (irrelevant to repertoire identity)
  -- and fixed to "0 1" when reconstructing a board for chess.js.
);

create table move_stats (
  from_fen text not null references positions(fen),
  san text not null,
  to_fen text not null references positions(fen),
  source text not null, -- 'lichess_all' | 'lichess_masters' | 'stockfish' | 'player:<name>' ...
  stats jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (from_fen, san, source)
);

alter table positions enable row level security;
alter table move_stats enable row level security;

create policy "positions readable by authenticated users"
  on positions for select
  to authenticated
  using (true);

create policy "positions writable by authenticated users"
  on positions for insert
  to authenticated
  with check (true);

create policy "move_stats readable by authenticated users"
  on move_stats for select
  to authenticated
  using (true);

create policy "move_stats writable by authenticated users"
  on move_stats for all
  to authenticated
  using (true)
  with check (true);

-- Family scoping ------------------------------------------------------------

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table family_members (
  user_id uuid not null references auth.users(id),
  family_id uuid not null references families(id),
  primary key (user_id, family_id)
);

alter table families enable row level security;
alter table family_members enable row level security;

create policy "families readable by their members"
  on families for select
  to authenticated
  using (id in (select family_id from family_members where user_id = auth.uid()));

create policy "any authenticated user can create a family"
  on families for insert
  to authenticated
  with check (true);

create policy "family_members readable by fellow members"
  on family_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or family_id in (select family_id from family_members where user_id = auth.uid())
  );

create policy "join self or be added by an existing member"
  on family_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or family_id in (select family_id from family_members where user_id = auth.uid())
  );

-- Shared repertoire data (family-owned) --------------------------------------

create table repertoires (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  name text not null,
  training_color text not null check (training_color in ('white', 'black')),
  root_fen text not null references positions(fen),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table repertoire_edges (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references repertoires(id),
  from_fen text not null references positions(fen),
  san text not null,
  to_fen text not null references positions(fen),
  status text not null default 'unexplored'
    check (status in ('unexplored', 'active', 'ignored', 'terminal')),
  -- Whether an edge is "my repertoire move" or an "opponent continuation" is
  -- derived from from_fen's side-to-move vs. the repertoire's training_color,
  -- not stored, to avoid state that could go stale.
  comment text,
  nags text[],
  shapes jsonb, -- { arrows: string[], squares: string[] }
  provenance jsonb, -- { source: 'manual'|'pgn_import'|'lichess_study', importedAt, ref? }
  created_at timestamptz not null default now(),
  unique (repertoire_id, from_fen, san)
);

alter table repertoires enable row level security;
alter table repertoire_edges enable row level security;

create policy "repertoires accessible to family members"
  on repertoires for all
  to authenticated
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));

create policy "repertoire_edges accessible to family members"
  on repertoire_edges for all
  to authenticated
  using (
    repertoire_id in (
      select id from repertoires
      where family_id in (select family_id from family_members where user_id = auth.uid())
    )
  )
  with check (
    repertoire_id in (
      select id from repertoires
      where family_id in (select family_id from family_members where user_id = auth.uid())
    )
  );

-- Per-user training/progress data --------------------------------------------

create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  repertoire_id uuid not null references repertoires(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reps_completed int not null default 0,
  perfect_reps int not null default 0,
  mistakes int not null default 0
);

create table edge_progress (
  user_id uuid not null references auth.users(id),
  edge_id uuid not null references repertoire_edges(id),
  times_seen int not null default 0,
  times_correct_first_try int not null default 0,
  last_seen_at timestamptz,
  last_result text check (last_result in ('correct', 'wrong')),
  primary key (user_id, edge_id)
);

alter table training_sessions enable row level security;
alter table edge_progress enable row level security;

create policy "training_sessions owned by the training user"
  on training_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "edge_progress owned by the training user"
  on edge_progress for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
