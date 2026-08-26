-- A user belongs to at most one family (the household unit). Enforcing this
-- as the primary key (rather than the composite user_id+family_id we started
-- with) lets first-login family bootstrap rely on a unique-violation to
-- detect "someone already created my family" instead of a racy check-then-insert.
alter table family_members drop constraint family_members_pkey;
alter table family_members add constraint family_members_pkey primary key (user_id);
