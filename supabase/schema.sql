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

-- Version window for one round. A source-check or recheck with recordVersionChecked
-- names that version. A claim stays on the opening version. Other rounds stay with
-- the latest check. Each window allows six rounds; a later version starts again.
create or replace function air_round_window_version(p_issue_version text, p_rounds jsonb, p_index integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  active text := coalesce(p_issue_version, '');
  walk integer;
  item jsonb;
  kind text;
  checked text;
begin
  if p_index < 0 or p_rounds is null or jsonb_typeof(p_rounds) is distinct from 'array' then
    return active;
  end if;
  for walk in 0..p_index loop
    item := p_rounds->walk;
    kind := coalesce(item->>'kind', '');
    checked := coalesce(item->>'recordVersionChecked', '');
    if kind in ('source-check', 'recheck') and checked <> '' then
      active := checked;
    end if;
  end loop;
  item := p_rounds->p_index;
  kind := coalesce(item->>'kind', '');
  checked := coalesce(item->>'recordVersionChecked', '');
  if kind in ('source-check', 'recheck') and checked <> '' then
    return checked;
  end if;
  if kind = 'claim' then
    return coalesce(p_issue_version, '');
  end if;
  return active;
end;
$$;

revoke all on function air_round_window_version(text, jsonb, integer) from public;

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
  window_version text;
  window_count integer := 0;
  walk integer;
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
  if jsonb_array_length(new_rounds) is distinct from old_len + 1 then
    raise exception 'Only a new round can be added to an issue.';
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
     or new_round->>'kind' not in ('claim', 'source-check', 'rebuttal', 'counter', 'recheck', 'comment')
     or length(coalesce(new_round->>'body', '')) > 4000
     or length(coalesce(new_round->>'authorLabel', '')) > 200
     or coalesce(jsonb_array_length(new_round->'citations'), 0) > 8 then
    raise exception 'That round is not valid.';
  end if;
  if coalesce(new_round->>'kind', '') = 'comment'
     and (
       p_payload->>'status' is distinct from current_row.payload->>'status'
       or coalesce(new_round->>'result', '') <> ''
     ) then
    raise exception 'A comment does not change the issue status.';
  end if;
  if new_round ? 'privateContextCount' then
    if (new_round->>'privateContextCount') !~ '^[0-9]+$'
       or (new_round->>'privateContextCount')::integer > 10 then
      raise exception 'That round is not valid.';
    end if;
  end if;

  window_version := air_round_window_version(current_row.record_version, new_rounds, old_len);
  -- A comment is discussion. It does not count toward the six-round cap.
  window_count := case when coalesce(new_round->>'kind', '') = 'comment' then 0 else 1 end;
  if old_len > 0 then
    for walk in 0..old_len - 1 loop
      if coalesce(new_rounds->walk->>'kind', '') is distinct from 'comment'
         and air_round_window_version(current_row.record_version, new_rounds, walk) = window_version then
        window_count := window_count + 1;
      end if;
    end loop;
  end if;
  if window_count > 6 then
    raise exception 'This version already has six rounds. A re-check on a later version can start again.';
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

-- Private chat archive. Public tables still store only private_context_count.
-- Anon may insert a share link. Anon cannot select, update, or delete it.

create extension if not exists pgcrypto with schema extensions;

create table if not exists air_private_context (
  id uuid primary key default gen_random_uuid(),
  review_id text null,
  issue_id text null,
  doi text not null,
  link_url text,
  provider text,
  snapshot_text text null,
  snapshot_status text,
  receipt_hash text not null,
  created_at timestamptz not null default now(),
  constraint air_private_context_doi_len check (char_length(doi) between 1 and 300),
  constraint air_private_context_link_len check (link_url is null or char_length(link_url) between 12 and 2000),
  constraint air_private_context_provider_len check (provider is null or char_length(provider) <= 40),
  constraint air_private_context_snapshot_len check (snapshot_text is null or char_length(snapshot_text) <= 100000),
  constraint air_private_context_status_len check (snapshot_status is null or char_length(snapshot_status) <= 40),
  constraint air_private_context_receipt check (receipt_hash ~ '^[0-9a-f]{64}$'),
  constraint air_private_context_review_len check (review_id is null or char_length(review_id) <= 200),
  constraint air_private_context_issue_len check (issue_id is null or char_length(issue_id) <= 200)
);

alter table air_private_context enable row level security;

create or replace function air_share_link_ok(raw text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  host text;
  path text;
begin
  if raw is null or raw !~ '^https://' or raw ~ '^https://[^/@[:space:]]+@' or position(chr(92) in raw) > 0 then
    return false;
  end if;
  host := lower(split_part(split_part(substr(raw, 9), '/', 1), ':', 1));
  host := regexp_replace(host, '^www\.', '');
  path := lower(split_part(substr(raw, 9), '?', 1));
  path := substr(path, position('/' in path));
  if host = 'share.google' and path like '/aimode%' then return true; end if;
  if host = 'chatgpt.com' or host like '%.chatgpt.com' or host = 'chat.openai.com' then return true; end if;
  if host = 'claude.ai' or host like '%.claude.ai' then return true; end if;
  if host in ('gemini.google.com', 'aistudio.google.com') then return true; end if;
  if host = 'grok.com' or host like '%.grok.com' or host = 'grok.x.ai' then return true; end if;
  return false;
end;
$$;

drop policy if exists air_private_context_insert on air_private_context;
create policy air_private_context_insert on air_private_context
  for insert
  to anon, authenticated
  with check (
    snapshot_text is null
    and (snapshot_status is null or snapshot_status = 'pending')
    and receipt_hash ~ '^[0-9a-f]{64}$'
    and char_length(doi) between 1 and 300
    and char_length(coalesce(link_url, '')) between 12 and 2000
    and char_length(coalesce(provider, '')) <= 40
    and air_share_link_ok(link_url)
    and (review_id is null or char_length(review_id) <= 200)
    and (issue_id is null or char_length(issue_id) <= 200)
  );

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
    + (select count(*) from air_issue_events where doi = target_doi and created_at > now() - interval '1 minute')
    + (select count(*) from air_private_context where doi = target_doi and created_at > now() - interval '1 minute');
$$;

create or replace function air_guard_private_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if air_recent_inserts(new.doi) >= 30 then
    raise exception 'Too many posts for this record in a short time. Wait a minute and try again.';
  end if;
  return new;
end;
$$;

drop trigger if exists air_private_context_guard on air_private_context;
create trigger air_private_context_guard before insert on air_private_context
  for each row execute function air_guard_private_context();

create or replace function air_my_context(p_secret text)
returns setof air_private_context
language sql
security definer
set search_path = public, extensions
as $$
  select *
  from air_private_context
  where p_secret is not null
    and char_length(p_secret) between 16 and 200
    and receipt_hash = encode(extensions.digest(convert_to(p_secret, 'utf8'), 'sha256'), 'hex')
  limit 20;
$$;

revoke all on function air_my_context(text) from public;
grant execute on function air_my_context(text) to anon, authenticated;

-- Moltbook opt-in distribution. Same statements as supabase/migrations/20261123235900_moltbook_opt_in.sql.
-- Opt-in Moltbook distribution for one public Zenodo version.
--
-- MOLTBOOK_API_KEY is not a column. Set it only as a Supabase Edge Function
-- secret, then deploy the function:
--   Supabase Dashboard → Project Settings → Edge Functions → Secrets
--   or: supabase secrets set MOLTBOOK_API_KEY=...
--   supabase functions deploy moltbook-review
-- Never put that key in VITE_* env, the browser, or this repository.
--
-- The anon key can read sanitized rows. It cannot insert, update, or delete.
-- The moltbook-review function writes with the service role.
-- The app still loads if this migration has not been applied.

create table if not exists air_moltbook_posts (
  id text primary key,
  doi text not null,
  record_id text not null,
  record_version text not null,
  concept_doi text not null,
  title text not null,
  content text not null,
  air_url text not null,
  status text not null,
  moltbook_post_id text,
  moltbook_url text,
  retry_after timestamptz,
  last_error text,
  last_pulled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint air_moltbook_posts_status check (
    status in ('queued', 'cooldown', 'publishing', 'published', 'verification_pending', 'failed')
  ),
  constraint air_moltbook_posts_doi check (doi ~ '^10\.5281/zenodo\.[0-9]+$'),
  constraint air_moltbook_posts_concept check (concept_doi ~ '^10\.5281/zenodo\.[0-9]+$'),
  constraint air_moltbook_posts_record check (record_id ~ '^[0-9]+$'),
  constraint air_moltbook_posts_title check (char_length(title) between 1 and 300),
  constraint air_moltbook_posts_content check (char_length(content) between 1 and 40000),
  constraint air_moltbook_posts_air_url check (air_url ~ '^https://' and char_length(air_url) <= 500),
  constraint air_moltbook_posts_public_text check (
    title !~* 'moltbook_[a-z0-9]'
    and title !~* 'bearer '
    and content !~* 'moltbook_[a-z0-9]'
    and content !~* 'bearer '
    and content !~* 'chatgpt\.com|claude\.ai|share\.google|chat\.openai'
    and position('@' in title) = 0
    and position('@' in content) = 0
  ),
  constraint air_moltbook_posts_error_safe check (
    last_error is null
    or (
      char_length(last_error) <= 300
      and last_error !~* 'moltbook_[a-z0-9]'
      and last_error !~* 'bearer '
    )
  ),
  constraint air_moltbook_posts_one_version unique (doi, record_version)
);

create index if not exists air_moltbook_posts_status_idx on air_moltbook_posts (status, created_at);

create table if not exists air_moltbook_comments (
  id text primary key,
  post_id text not null references air_moltbook_posts (id),
  moltbook_post_id text not null,
  moltbook_comment_id text,
  agent_name text,
  is_claimed boolean,
  sanitized_content text not null,
  flags jsonb not null default '[]'::jsonb,
  cites_publication boolean not null default false,
  criterion_id text,
  discarded boolean not null default false,
  candidate boolean not null default false,
  promoted_issue_id text,
  comment_created_at timestamptz,
  ingested_at timestamptz not null default now(),
  constraint air_moltbook_comments_content check (char_length(sanitized_content) between 1 and 4000),
  constraint air_moltbook_comments_agent check (agent_name is null or char_length(agent_name) between 1 and 80),
  constraint air_moltbook_comments_ids check (
    char_length(moltbook_post_id) between 1 and 80
    and (moltbook_comment_id is null or char_length(moltbook_comment_id) between 1 and 80)
  ),
  constraint air_moltbook_comments_flags check (jsonb_typeof(flags) = 'array'),
  constraint air_moltbook_comments_safe check (
    sanitized_content !~* 'moltbook_[a-z0-9]'
    and sanitized_content !~* 'bearer '
  )
);

create index if not exists air_moltbook_comments_post_idx on air_moltbook_comments (post_id, ingested_at);

alter table air_moltbook_posts enable row level security;
alter table air_moltbook_comments enable row level security;

drop policy if exists air_moltbook_posts_read on air_moltbook_posts;
create policy air_moltbook_posts_read on air_moltbook_posts for select using (true);

drop policy if exists air_moltbook_comments_read on air_moltbook_comments;
create policy air_moltbook_comments_read on air_moltbook_comments for select using (true);

revoke insert, update, delete on air_moltbook_posts from public, anon, authenticated;
revoke insert, update, delete on air_moltbook_comments from public, anon, authenticated;
grant select on air_moltbook_posts to anon, authenticated;
grant select on air_moltbook_comments to anon, authenticated;

-- Human profile retag. Same statements as supabase/migrations/20261124150000_recheck_profile_and_comment_cap.sql.
alter table air_reviews add column if not exists owner_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'air_reviews_owner_hash') then
    alter table air_reviews add constraint air_reviews_owner_hash
      check (owner_hash is null or owner_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create or replace function air_retag_human_profile(p_review_id text, p_profile text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_row air_reviews%rowtype;
  expected text;
  next_payload jsonb;
begin
  if p_review_id is null or length(p_review_id) > 200 then
    raise exception 'That review update is not valid.';
  end if;
  if p_profile not in ('device', 'theory', 'data', 'roadmap', 'empirical') then
    raise exception 'That criterion profile is not valid.';
  end if;
  if p_secret is null or char_length(p_secret) < 16 or char_length(p_secret) > 200 then
    raise exception 'Only the reviewer who published this reading can change its profile.';
  end if;

  select * into current_row from air_reviews where id = p_review_id for update;
  if not found then
    raise exception 'That review is not on the shared board.';
  end if;
  if coalesce(current_row.payload->>'origin', '') is distinct from 'human'
     and current_row.assessor_id is distinct from 'human' then
    raise exception 'Only a human review can change its criterion profile.';
  end if;
  if current_row.owner_hash is null or current_row.owner_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This review has no owner receipt. It was published before profiles could be retagged.';
  end if;
  expected := encode(extensions.digest(convert_to(p_secret, 'utf8'), 'sha256'), 'hex');
  if expected is distinct from current_row.owner_hash then
    raise exception 'Only the reviewer who published this reading can change its profile.';
  end if;

  next_payload := jsonb_set(current_row.payload, '{criterionProfile}', to_jsonb(p_profile), true);
  if (current_row.payload - 'criterionProfile') is distinct from (next_payload - 'criterionProfile') then
    raise exception 'Only the criterion profile can change.';
  end if;

  update air_reviews
    set payload = next_payload
    where id = p_review_id;

  return next_payload;
end;
$$;

revoke all on function air_retag_human_profile(text, text, text) from public;
grant execute on function air_retag_human_profile(text, text, text) to anon, authenticated;
