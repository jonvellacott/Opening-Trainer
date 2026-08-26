-- family_members' own SELECT/INSERT policies subqueried family_members,
-- which re-triggers that same SELECT policy on every evaluation — genuine
-- infinite recursion (Postgres error 42P17), surfaced to clients as a 500.
-- A security definer function looks up the caller's family bypassing RLS,
-- breaking the cycle. Applied consistently wherever policies otherwise
-- repeat the same "am I in this family" subquery.
create or replace function my_family_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select family_id from family_members where user_id = auth.uid()
$$;

drop policy "family_members readable by fellow members" on family_members;
create policy "family_members readable by fellow members"
  on family_members for select
  to authenticated
  using (user_id = auth.uid() or family_id = my_family_id());

drop policy "join self or be added by an existing member" on family_members;
create policy "join self or be added by an existing member"
  on family_members for insert
  to authenticated
  with check (user_id = auth.uid() or family_id = my_family_id());

drop policy "families readable by their members" on families;
create policy "families readable by their members"
  on families for select
  to authenticated
  using (id = my_family_id());

drop policy "repertoires accessible to family members" on repertoires;
create policy "repertoires accessible to family members"
  on repertoires for all
  to authenticated
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy "repertoire_edges accessible to family members" on repertoire_edges;
create policy "repertoire_edges accessible to family members"
  on repertoire_edges for all
  to authenticated
  using (repertoire_id in (select id from repertoires where family_id = my_family_id()))
  with check (repertoire_id in (select id from repertoires where family_id = my_family_id()));
