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
  created_at timestamptz not null default now()
);

create index if not exists air_reviews_record_idx on air_reviews (doi, record_version, assessor_id);

create table if not exists air_nodes (
  id text primary key,
  review_id text not null,
  node_id text not null,
  payload jsonb not null,
  private_context_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (review_id, node_id)
);

create table if not exists air_issues (
  id text primary key,
  doi text not null,
  record_version text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists air_issues_record_idx on air_issues (doi, record_version);

create table if not exists air_claims (
  id text primary key,
  doi text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
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
create policy air_issues_update on air_issues for update using (true) with check (true);

create policy air_claims_read on air_claims for select using (true);
create policy air_claims_insert on air_claims for insert with check (true);
create policy air_claims_update on air_claims for update using (true) with check (true);

-- Existing projects created before private context counts:
alter table air_reviews add column if not exists private_context_count integer not null default 0;
alter table air_nodes add column if not exists private_context_count integer not null default 0;
