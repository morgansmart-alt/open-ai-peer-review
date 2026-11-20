-- AIR Peer Review — Supabase / Postgres schema for the free-tier shared board.
-- Run this in the Supabase SQL editor, then paste the project URL and anon key
-- into .env.local as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
--
-- Use the anon key only. Never put the service-role key in the frontend.
-- This MVP trusts inserted payloads. Pair it with Supabase rate limits or an
-- Edge Function before a busy public launch. API keys are not a column and
-- must never be placed in payload.

create table if not exists air_reviews (
  id text primary key,
  doi text not null,
  record_version text not null,
  assessor_id text not null,
  model_id text not null,
  criteria_version text not null,
  custom_criteria boolean not null default false,
  output_hash text not null,
  payload jsonb not null,
  -- Count only. Private chat URLs are never stored here.
  private_context_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint air_reviews_payload_size check (pg_column_size(payload) < 262144 and private_context_count between 0 and 10)
);

create index if not exists air_reviews_record_idx on air_reviews (doi, record_version, assessor_id);

create table if not exists air_nodes (
  id text primary key,
  review_id text not null,
  node_id text not null,
  payload jsonb not null,
  private_context_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (review_id, node_id),
  constraint air_nodes_payload_size check (pg_column_size(payload) < 131072 and private_context_count between 0 and 10)
);

create table if not exists air_issues (
  id text primary key,
  doi text not null,
  record_version text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint air_issues_payload_size check (pg_column_size(payload) < 262144)
);

create index if not exists air_issues_record_idx on air_issues (doi, record_version);

create table if not exists air_claims (
  id text primary key,
  doi text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint air_claims_payload_size check (pg_column_size(payload) < 65536)
);

alter table air_reviews enable row level security;
alter table air_nodes enable row level security;
alter table air_issues enable row level security;
alter table air_claims enable row level security;

create policy air_reviews_read on air_reviews for select using (true);
create policy air_reviews_insert on air_reviews for insert with check (true);

create policy air_nodes_read on air_nodes for select using (true);
create policy air_nodes_insert on air_nodes for insert with check (true);

create policy air_issues_read on air_issues for select using (true);
create policy air_issues_insert on air_issues for insert with check (true);

create policy air_claims_read on air_claims for select using (true);
create policy air_claims_insert on air_claims for insert with check (true);

-- Issue replies are not a public UPDATE. air_issues has no created_at column.
-- The statements below are the live database after
-- 20261120000000_append_only_issues_and_claims.sql and
-- 20261120000100_fix_function_search_paths.sql.

create table if not exists air_issue_events (
  id text primary key,
  issue_id text not null,
  doi text not null,
  round jsonb not null,
  created_at timestamptz not null default now(),
  constraint air_issue_events_round_size check (pg_column_size(round) < 32768)
);

alter table air_issue_events enable row level security;

drop policy if exists air_issue_events_read on air_issue_events;
create policy air_issue_events_read on air_issue_events for select using (true);

create or replace function air_json_text_ok(value jsonb, max_len integer, depth integer)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  item jsonb;
  key text;
begin
  if depth > 12 then
    return false;
  end if;
  if jsonb_typeof(value) = 'string' then
    return length(value #>> '{}') <= max_len;
  elsif jsonb_typeof(value) = 'array' then
    if jsonb_array_length(value) > 400 then
      return false;
    end if;
    for item in select jsonb_array_elements(value)
    loop
      if not air_json_text_ok(item, max_len, depth + 1) then
        return false;
      end if;
    end loop;
    return true;
  elsif jsonb_typeof(value) = 'object' then
    if (select count(*) from jsonb_object_keys(value)) > 80 then
      return false;
    end if;
    for key, item in select * from jsonb_each(value)
    loop
      if key in ('conversationLinks', 'privateLinks', 'chatUrl', 'chatNote') then
        return false;
      end if;
      if not air_json_text_ok(item, max_len, depth + 1) then
        return false;
      end if;
    end loop;
    return true;
  else
    return true;
  end if;
end;
$$;

create or replace function air_recent_inserts(target_doi text)
returns integer
language sql
stable
set search_path = public
as $$
  select
    (select count(*) from air_reviews where doi = target_doi and created_at > now() - interval '1 minute')
    + (select count(*) from air_nodes where coalesce(payload->>'doi', '') = target_doi and created_at > now() - interval '1 minute')
    + (select count(*) from air_issues where doi = target_doi and updated_at > now() - interval '1 minute')
    + (select count(*) from air_claims where doi = target_doi and created_at > now() - interval '1 minute')
    + (select count(*) from air_issue_events where doi = target_doi and created_at > now() - interval '1 minute');
$$;

create or replace function air_guard_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_doi text := '';
begin
  if tg_table_name <> 'air_nodes' then
    target_doi := new.doi;
  end if;
  target_doi := left(coalesce(nullif(target_doi, ''), new.payload->>'doi', ''), 300);
  if target_doi = '' then
    raise exception 'A DOI is required.';
  end if;
  if not air_json_text_ok(new.payload, 20000, 0) then
    raise exception 'That text is too long to store, or it includes a private chat address.';
  end if;
  if air_recent_inserts(target_doi) >= 30 then
    raise exception 'Too many posts for this record in a short time. Wait a minute and try again.';
  end if;
  return new;
end;
$$;

drop trigger if exists air_reviews_guard on air_reviews;
create trigger air_reviews_guard before insert on air_reviews
  for each row execute function air_guard_insert();

drop trigger if exists air_nodes_guard on air_nodes;
create trigger air_nodes_guard before insert on air_nodes
  for each row execute function air_guard_insert();

drop trigger if exists air_issues_guard on air_issues;
create trigger air_issues_guard before insert on air_issues
  for each row execute function air_guard_insert();

drop trigger if exists air_claims_guard on air_claims;
create trigger air_claims_guard before insert on air_claims
  for each row execute function air_guard_insert();

create or replace function air_block_direct_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('air.allow_controlled_update', true), '') is distinct from 'on' then
    raise exception 'This row is append-only. Add a new round or a new label instead of replacing it.';
  end if;
  return new;
end;
$$;

drop trigger if exists air_issues_append_only on air_issues;
create trigger air_issues_append_only before update on air_issues
  for each row execute function air_block_direct_update();

drop trigger if exists air_claims_append_only on air_claims;
create trigger air_claims_append_only before update on air_claims
  for each row execute function air_block_direct_update();

create or replace function air_append_issue_round(p_issue_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row air_issues%rowtype;
  old_rounds jsonb;
  new_rounds jsonb;
  old_len integer;
  new_round jsonb;
  index integer;
begin
  if p_issue_id is null or length(p_issue_id) > 200 or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'That issue update is not valid.';
  end if;
  if p_payload->>'id' is distinct from p_issue_id then
    raise exception 'That issue update is not valid.';
  end if;
  if not air_json_text_ok(p_payload, 20000, 0) then
    raise exception 'That text is too long to store, or it includes a private chat address.';
  end if;

  select * into current_row from air_issues where id = p_issue_id for update;
  if not found then
    raise exception 'That issue is not on the shared board.';
  end if;

  if p_payload->>'doi' is distinct from current_row.doi
     or p_payload->>'recordVersion' is distinct from current_row.record_version
     or p_payload->>'source' is distinct from current_row.payload->>'source'
     or p_payload->>'sourceId' is distinct from current_row.payload->>'sourceId'
     or p_payload->>'criterionId' is distinct from current_row.payload->>'criterionId'
     or p_payload->>'claim' is distinct from current_row.payload->>'claim'
     or p_payload->>'quotedPassage' is distinct from current_row.payload->>'quotedPassage'
     or p_payload->>'reason' is distinct from current_row.payload->>'reason'
     or p_payload->>'createdAt' is distinct from current_row.payload->>'createdAt' then
    raise exception 'Only a new round can be added to an issue.';
  end if;

  if p_payload->>'status' not in (
    'open', 'addressed-in-publication', 'partially-addressed', 'unresolved', 'fixed-in-new-version'
  ) then
    raise exception 'That issue status is not valid.';
  end if;

  old_rounds := coalesce(current_row.payload->'rounds', '[]'::jsonb);
  new_rounds := p_payload->'rounds';
  if jsonb_typeof(old_rounds) is distinct from 'array' or jsonb_typeof(new_rounds) is distinct from 'array' then
    raise exception 'Only a new round can be added to an issue.';
  end if;
  old_len := jsonb_array_length(old_rounds);
  if jsonb_array_length(new_rounds) is distinct from old_len + 1 or old_len + 1 > 6 then
    raise exception 'An issue thread stops at six rounds.';
  end if;
  for index in 0..old_len - 1 loop
    if (new_rounds->index) is distinct from (old_rounds->index) then
      raise exception 'Earlier rounds cannot be changed.';
    end if;
  end loop;

  new_round := new_rounds->old_len;
  if jsonb_typeof(new_round) is distinct from 'object'
     or coalesce(new_round->>'id', '') = ''
     or length(new_round->>'id') > 200
     or new_round->>'kind' not in ('claim', 'source-check', 'rebuttal', 'counter', 'recheck')
     or length(coalesce(new_round->>'body', '')) > 4000
     or length(coalesce(new_round->>'authorLabel', '')) > 200
     or coalesce(jsonb_array_length(new_round->'citations'), 0) > 8 then
    raise exception 'That round is not valid.';
  end if;
  if new_round ? 'privateContextCount' then
    if (new_round->>'privateContextCount') !~ '^[0-9]+$'
       or (new_round->>'privateContextCount')::integer > 10 then
      raise exception 'That round is not valid.';
    end if;
  end if;

  if air_recent_inserts(current_row.doi) >= 30 then
    raise exception 'Too many posts for this record in a short time. Wait a minute and try again.';
  end if;

  insert into air_issue_events (id, issue_id, doi, round)
  values (new_round->>'id', p_issue_id, current_row.doi, new_round);

  perform set_config('air.allow_controlled_update', 'on', true);
  update air_issues
    set payload = p_payload,
        updated_at = now()
    where id = p_issue_id;

  return p_payload;
end;
$$;

revoke all on function air_append_issue_round(text, jsonb) from public;
grant execute on function air_append_issue_round(text, jsonb) to anon, authenticated;

-- Existing projects created before private context counts:
alter table air_reviews add column if not exists private_context_count integer not null default 0;
alter table air_nodes add column if not exists private_context_count integer not null default 0;

-- Payload size limits. Private chat URLs are not part of payload.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'air_reviews_payload_size') then
    alter table air_reviews add constraint air_reviews_payload_size
      check (pg_column_size(payload) < 262144 and private_context_count between 0 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'air_nodes_payload_size') then
    alter table air_nodes add constraint air_nodes_payload_size
      check (pg_column_size(payload) < 131072 and private_context_count between 0 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'air_issues_payload_size') then
    alter table air_issues add constraint air_issues_payload_size
      check (pg_column_size(payload) < 262144);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'air_claims_payload_size') then
    alter table air_claims add constraint air_claims_payload_size
      check (pg_column_size(payload) < 65536);
  end if;
end $$;
