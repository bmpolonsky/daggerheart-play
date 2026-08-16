-- P2P rooms keep game state off the server. This short-lived registry exists
-- only so authenticated room participants can receive Cloudflare TURN credentials.
create table public.dh_p2p_turn_rooms (
  id text primary key check (id ~ '^[A-Z0-9_-]{4,24}$'),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_peer_id text not null,
  active_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dh_p2p_turn_members (
  room_id text not null references public.dh_p2p_turn_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id text not null,
  role text not null check (role in ('gm', 'player')),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, peer_id)
);

alter table public.dh_p2p_turn_rooms enable row level security;
alter table public.dh_p2p_turn_members enable row level security;
revoke all on public.dh_p2p_turn_rooms, public.dh_p2p_turn_members from anon, authenticated;

create or replace function public.dh_claim_p2p_turn_credentials(
  p_room_id text,
  p_peer_id text,
  p_role text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_room public.dh_p2p_turn_rooms%rowtype;
  reset_members boolean := false;
  peer_owner uuid;
  current_attempts integer;
  current_issuance integer;
begin
  if auth.uid() is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    return false;
  end if;
  if p_room_id !~ '^[A-Z0-9_-]{4,24}$'
    or nullif(p_peer_id, '') is null
    or length(p_peer_id) > 160
    or p_role not in ('gm', 'player') then
    return false;
  end if;

  if p_role = 'gm' then
    select * into current_room
    from public.dh_p2p_turn_rooms
    where id = p_room_id
    for update;

    if found and current_room.active_until > now()
      and current_room.owner_user_id <> auth.uid() then
      return false;
    end if;
    reset_members := not found or current_room.active_until <= now()
      or current_room.owner_peer_id <> p_peer_id;

    insert into public.dh_p2p_turn_rooms(id, owner_user_id, owner_peer_id, active_until)
    values (p_room_id, auth.uid(), p_peer_id, now() + interval '8 hours')
    on conflict (id) do update set
      owner_user_id = excluded.owner_user_id,
      owner_peer_id = excluded.owner_peer_id,
      active_until = excluded.active_until,
      updated_at = now()
    where public.dh_p2p_turn_rooms.active_until <= now()
      or public.dh_p2p_turn_rooms.owner_user_id = auth.uid();
    if not found then return false; end if;
    if reset_members then
      delete from public.dh_p2p_turn_members where room_id = p_room_id;
    end if;
  else
    insert into public.dh_join_attempts(user_id, window_started_at, attempts)
    values (auth.uid(), now(), 1)
    on conflict (user_id) do update set
      window_started_at = case
        when public.dh_join_attempts.window_started_at <= now() - interval '10 minutes' then now()
        else public.dh_join_attempts.window_started_at
      end,
      attempts = case
        when public.dh_join_attempts.window_started_at <= now() - interval '10 minutes' then 1
        else public.dh_join_attempts.attempts + 1
      end
    returning attempts into current_attempts;
    if current_attempts > 30 then return false; end if;

    select * into current_room
    from public.dh_p2p_turn_rooms
    where id = p_room_id and active_until > now();
    if not found then return false; end if;

    select user_id into peer_owner
    from public.dh_p2p_turn_members
    where room_id = p_room_id and peer_id = p_peer_id;
    if found and peer_owner <> auth.uid() then return false; end if;
    if (select count(*) from public.dh_p2p_turn_members where room_id = p_room_id) >= 32
      and peer_owner is null then
      return false;
    end if;
  end if;

  insert into public.dh_p2p_turn_members(room_id, user_id, peer_id, role, last_seen_at)
  values (p_room_id, auth.uid(), p_peer_id, p_role, now())
  on conflict (room_id, peer_id) do update set
    user_id = excluded.user_id,
    role = excluded.role,
    last_seen_at = now();

  insert into public.dh_turn_issuance(user_id, room_id, peer_id, window_started_at, attempts)
  values (auth.uid(), p_room_id, p_peer_id, now(), 1)
  on conflict (user_id, room_id, peer_id) do update set
    window_started_at = case
      when public.dh_turn_issuance.window_started_at <= now() - interval '10 minutes' then now()
      else public.dh_turn_issuance.window_started_at
    end,
    attempts = case
      when public.dh_turn_issuance.window_started_at <= now() - interval '10 minutes' then 1
      else public.dh_turn_issuance.attempts + 1
    end
  returning attempts into current_issuance;
  return current_issuance <= 3;
end;
$$;

revoke all on function public.dh_claim_p2p_turn_credentials(text, text, text) from public;
grant execute on function public.dh_claim_p2p_turn_credentials(text, text, text) to authenticated;

create or replace function public.dh_cleanup_p2p_turn_rooms()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.dh_p2p_turn_rooms where active_until < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.dh_cleanup_p2p_turn_rooms() from public;
grant execute on function public.dh_cleanup_p2p_turn_rooms() to service_role;

select cron.schedule(
  'daggerheart-cleanup-p2p-turn-rooms',
  '17 * * * *',
  $$select public.dh_cleanup_p2p_turn_rooms();$$
);
