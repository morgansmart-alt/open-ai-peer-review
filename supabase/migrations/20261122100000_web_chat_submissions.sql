-- Uncalibrated scores sent from the AIR web-chat extension.
-- Deploy this file in the Supabase SQL editor, then deploy
-- supabase/functions/submit-web-chat.
-- Anon may read the table. Anon may not insert, update, or delete.
-- The edge function inserts with the service role, which bypasses these policies.

create table if not exists air_web_chat (
  id text primary key,
  doi text not null,
  site text not null,
  model text not null,
  title text not null,
  paper_url text not null default '',
  blind_score integer not null,
  defended_score integer,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint air_web_chat_payload_size check (pg_column_size(payload) < 65536),
  constraint air_web_chat_one_score unique (doi, site, model)
);

create index if not exists air_web_chat_created_idx on air_web_chat (created_at desc);

alter table air_web_chat enable row level security;

revoke all on air_web_chat from public, anon, authenticated;
grant select on air_web_chat to anon, authenticated;

drop policy if exists air_web_chat_read on air_web_chat;
create policy air_web_chat_read on air_web_chat
  for select
  to anon, authenticated
  using (true);
