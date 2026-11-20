-- Private archive for a reviewee's already-trained chat share link.
-- The public thread keeps private_context_count only. chatUrl, privateLinks,
-- conversationLinks, and chatNote stay rejected on the public tables.
--
-- Do not apply this with the anon key. Run it from the Supabase SQL editor
-- or a service-role connection, then deploy supabase/functions/archive-context.
-- The frontend still works before this exists: the link stays in that browser.

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

-- No select, update, or delete policy for anon or authenticated.
-- The service role, used by the archive function, bypasses row level security.

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

-- p_secret is the receipt the browser showed once. The stored value is its sha256 hex.
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
