-- The append-only migration created these helpers without a fixed search_path.
-- Pin them to public, matching air_append_issue_round.

alter function air_guard_insert() set search_path = public;
alter function air_json_text_ok(jsonb, integer, integer) set search_path = public;
alter function air_recent_inserts(text) set search_path = public;
alter function air_block_direct_update() set search_path = public;
