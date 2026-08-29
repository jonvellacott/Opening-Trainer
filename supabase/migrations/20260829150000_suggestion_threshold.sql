-- Moves below this share of games aren't shown as Build-mode suggestions
-- (Masters, Lichess database, and tracked streamers all share one cutoff).
alter table families add column suggestion_threshold_percent integer not null default 7;

-- families had select/insert policies but no update policy, needed now that
-- members can change this setting from the Settings page.
create policy "family members can update their family"
  on families for update
  to authenticated
  using (id in (select family_id from family_members where user_id = auth.uid()))
  with check (id in (select family_id from family_members where user_id = auth.uid()));
