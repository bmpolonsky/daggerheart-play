-- A persisted anonymous Supabase session represents one browser participant.
-- Rejoining with a fresh peer id must replace its previous room membership,
-- otherwise reloads briefly appear as duplicate players in the roster.
delete from public.dh_room_members as older
using public.dh_room_members as newer
where older.room_id = newer.room_id
  and older.incarnation = newer.incarnation
  and older.user_id = newer.user_id
  and (older.last_seen_at, older.peer_id) < (newer.last_seen_at, newer.peer_id);

alter table public.dh_room_members
  add constraint dh_room_members_user_unique
  unique (room_id, incarnation, user_id);

create or replace function public.dh_join_room(
  p_room_id text,
  p_peer_id text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_room public.dh_rooms%rowtype;
  active_user uuid;
  current_attempts integer;
  cursor_value bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    raise exception 'participant_unauthorized';
  end if;
  if nullif(p_peer_id, '') is null
    or length(p_peer_id) > 160
    or length(coalesce(p_display_name, '')) > 120 then
    raise exception 'invalid_participant';
  end if;

  insert into public.dh_join_attempts(user_id, window_started_at, attempts)
  values (auth.uid(), now(), 1)
  on conflict (user_id) do update set
    window_started_at = case
      when public.dh_join_attempts.window_started_at <= now() - interval '10 minutes'
        then now()
      else public.dh_join_attempts.window_started_at
    end,
    attempts = case
      when public.dh_join_attempts.window_started_at <= now() - interval '10 minutes'
        then 1
      else public.dh_join_attempts.attempts + 1
    end
  returning attempts into current_attempts;
  if current_attempts > 30 then raise exception 'rate_limited'; end if;

  select * into current_room from public.dh_rooms where id = p_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if current_room.active_until <= now() then raise exception 'master_offline'; end if;

  select user_id into active_user
  from public.dh_room_members
  where room_id = p_room_id
    and incarnation = current_room.incarnation
    and peer_id = p_peer_id
    and last_seen_at > now() - interval '45 seconds';
  if active_user is not null and active_user <> auth.uid() then
    raise exception 'participant_in_use';
  end if;

  delete from public.dh_room_members
  where room_id = p_room_id
    and incarnation = current_room.incarnation
    and peer_id = p_peer_id
    and last_seen_at <= now() - interval '45 seconds';

  insert into public.dh_room_members(room_id, incarnation, user_id, peer_id, role, display_name)
  values (
    p_room_id, current_room.incarnation, auth.uid(), p_peer_id, 'player',
    coalesce(nullif(p_display_name, ''), 'Игрок')
  )
  on conflict on constraint dh_room_members_user_unique do update set
    peer_id = excluded.peer_id,
    role = excluded.role,
    display_name = excluded.display_name,
    last_seen_at = now();

  select coalesce(max(sequence), 0) into cursor_value
  from public.dh_room_events
  where room_id = p_room_id and incarnation = current_room.incarnation;

  return jsonb_build_object(
    'incarnation', current_room.incarnation,
    'cursor', cursor_value,
    'ownerId', current_room.owner_id,
    'worldId', current_room.world_id,
    'gmPeerId', current_room.gm_peer_id,
    'roster', public.dh_room_roster(p_room_id, current_room.incarnation),
    'stateRows', public.dh_state_rows(current_room.owner_id, current_room.world_id)
  );
end;
$$;

revoke all on function public.dh_join_room(text, text, text) from public;
grant execute on function public.dh_join_room(text, text, text) to authenticated;
