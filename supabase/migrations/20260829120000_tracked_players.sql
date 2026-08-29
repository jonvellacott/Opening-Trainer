-- Accounts the family curates to pull opening-move statistics from (Chess.com,
-- eventually Lichess). The imported numbers themselves live in the existing
-- global move_stats table (source = '<provider>:<username>') — this table is
-- just the family's private, curated list of which accounts they care about.
create table tracked_players (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id),
  source text not null check (source in ('chess.com', 'lichess')),
  username text not null,
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, source, username)
);

alter table tracked_players enable row level security;

create policy "tracked_players accessible to family members"
  on tracked_players for all
  to authenticated
  using (family_id in (select family_id from family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from family_members where user_id = auth.uid()));
