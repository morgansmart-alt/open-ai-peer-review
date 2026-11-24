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
