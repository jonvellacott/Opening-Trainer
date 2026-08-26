-- Creating a family from the client hit a chicken-and-egg RLS problem:
-- inserting a row and reading it back (.insert().select()) requires the
-- SELECT policy to pass for the new row, but a user isn't a member of the
-- family they just created until the *second* insert (family_members)
-- completes. A security definer function does both inserts atomically,
-- bypassing RLS internally, and is also naturally race-safe against
-- concurrent calls (e.g. React StrictMode's double effect invocation).
create or replace function ensure_family()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_family_id uuid;
  created_family_id uuid;
begin
  select family_id into found_family_id from family_members where user_id = auth.uid();
  if found_family_id is not null then
    return found_family_id;
  end if;

  insert into families (name) values ('My Family') returning id into created_family_id;

  begin
    insert into family_members (user_id, family_id) values (auth.uid(), created_family_id);
  exception when unique_violation then
    -- Lost a race with a concurrent call for this same user. Discard this
    -- call's family row and defer to whichever call won.
    delete from families where id = created_family_id;
    select family_id into found_family_id from family_members where user_id = auth.uid();
    return found_family_id;
  end;

  return created_family_id;
end;
$$;

-- Family creation now only happens inside ensure_family(), which bypasses
-- RLS as security definer — clients no longer need direct insert access.
drop policy "any authenticated user can create a family" on families;
