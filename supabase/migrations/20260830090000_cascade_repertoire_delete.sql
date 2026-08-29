-- Deleting a repertoire should take its edges, training sessions, and
-- per-user progress with it, instead of failing on a foreign key violation.
-- These constraints were declared without ON DELETE CASCADE originally.
alter table repertoire_edges drop constraint repertoire_edges_repertoire_id_fkey;
alter table repertoire_edges add constraint repertoire_edges_repertoire_id_fkey
  foreign key (repertoire_id) references repertoires(id) on delete cascade;

alter table training_sessions drop constraint training_sessions_repertoire_id_fkey;
alter table training_sessions add constraint training_sessions_repertoire_id_fkey
  foreign key (repertoire_id) references repertoires(id) on delete cascade;

alter table edge_progress drop constraint edge_progress_edge_id_fkey;
alter table edge_progress add constraint edge_progress_edge_id_fkey
  foreign key (edge_id) references repertoire_edges(id) on delete cascade;
