-- Fluid issue rounds across versions.
-- A source-check or recheck whose recordVersionChecked differs from the
-- opening version starts a fresh window of six rounds. Rounds that already
-- fit in a single window of six stay valid on a database that has not
-- applied this migration: the client keeps those re-checks in local storage
-- and says so, until this function is installed.
-- Additive: same RPC name and payload. Earlier rounds still cannot be edited.

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

  window_version := air_round_window_version(current_row.record_version, new_rounds, old_len);
  window_count := 1;
  if old_len > 0 then
    for walk in 0..old_len - 1 loop
      if air_round_window_version(current_row.record_version, new_rounds, walk) = window_version then
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
