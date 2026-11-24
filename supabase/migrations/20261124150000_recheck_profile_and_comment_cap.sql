-- Comments do not use a slot in the six-round window, and a human reviewer
-- can retag their own reading's criterion profile.
-- Apply this file in the Supabase SQL editor. Do not apply it from the app.
-- Additive: air_append_issue_round keeps the same arguments. owner_hash is a
-- new nullable column. The retag RPC checks the sha256 of the owner secret
-- the publishing browser kept. It changes only criterionProfile.

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

alter table air_reviews add column if not exists owner_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'air_reviews_owner_hash') then
    alter table air_reviews add constraint air_reviews_owner_hash
      check (owner_hash is null or owner_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

-- Owner only. The secret is not stored. The browser that published the human
-- review sends it, and this checks the hash. Scores and every other payload
-- field stay as they were.
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
