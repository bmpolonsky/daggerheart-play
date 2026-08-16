-- Server state is deliberately stored as small JSON fragments, not as one
-- mutable world document.  The client chooses stable keys such as `game`,
-- `characters`, `scene:<id>` and `sceneTokens:<id>`.
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table public.dh_worlds (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null default 'Без названия',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.dh_world_state (
  owner_id uuid not null,
  world_id text not null,
  key text not null check (key ~ '^[A-Za-z0-9:_-]{1,160}$'),
  value jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (owner_id, world_id, key),
  foreign key (owner_id, world_id)
    references public.dh_worlds(owner_id, id) on delete cascade
);

create table public.dh_rooms (
  id text primary key check (id ~ '^[A-Z0-9_-]{4,24}$'),
  owner_id uuid not null,
  world_id text not null,
  incarnation uuid not null default gen_random_uuid(),
  gm_peer_id text not null,
  gm_name text not null,
  active_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, world_id)
    references public.dh_worlds(owner_id, id) on delete cascade
);

create table public.dh_room_members (
  room_id text not null references public.dh_rooms(id) on delete cascade,
  incarnation uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id text not null,
  role text not null check (role in ('gm', 'player')),
  display_name text not null,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, incarnation, peer_id)
);

-- Events carry intents and transient notifications only. Durable state lives
-- in dh_world_state; snapshot envelopes are rejected by the RPC below.
create table public.dh_room_events (
  sequence bigint generated always as identity primary key,
  room_id text not null references public.dh_rooms(id) on delete cascade,
  incarnation uuid not null,
  event_id text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_peer_id text not null,
  target_peer_id text,
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, incarnation, event_id)
);

-- Room codes remain human-sized, so repeated guesses are throttled per
-- authenticated guest. Supabase separately limits creation of guest users.
create table public.dh_join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempts integer not null default 1
);

create table public.dh_turn_issuance (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id text not null,
  peer_id text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 1,
  primary key (user_id, room_id, peer_id)
);

create index dh_world_state_updated_idx
  on public.dh_world_state(owner_id, world_id, updated_at);
create index dh_room_members_active_idx
  on public.dh_room_members(room_id, incarnation, last_seen_at);
create index dh_room_events_room_sequence_idx
  on public.dh_room_events(room_id, incarnation, sequence);

alter table public.dh_world_state replica identity full;

alter table public.dh_worlds enable row level security;
alter table public.dh_world_state enable row level security;
alter table public.dh_rooms enable row level security;
alter table public.dh_room_members enable row level security;
alter table public.dh_room_events enable row level security;
alter table public.dh_join_attempts enable row level security;
alter table public.dh_turn_issuance enable row level security;

create or replace function public.dh_is_room_member(p_room_id text, p_incarnation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dh_room_members member
    join public.dh_rooms room
      on room.id = member.room_id
     and room.incarnation = member.incarnation
    where member.room_id = p_room_id
      and member.incarnation = p_incarnation
      and member.user_id = auth.uid()
      and room.active_until > now()
      and (
        (member.role = 'gm'
          and room.owner_id = auth.uid()
          and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false)
        or (member.role = 'player'
          and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = true)
      )
  );
$$;

create or replace function public.dh_can_read_world_state(p_owner_id uuid, p_world_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    p_owner_id = auth.uid()
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  ) or exists (
    select 1
    from public.dh_rooms room
    join public.dh_room_members member
      on member.room_id = room.id
     and member.incarnation = room.incarnation
    where room.owner_id = p_owner_id
      and room.world_id = p_world_id
      and room.active_until > now()
      and member.user_id = auth.uid()
      and public.dh_is_room_member(member.room_id, member.incarnation)
  );
$$;

drop policy if exists dh_worlds_owner_select on public.dh_worlds;
create policy dh_worlds_owner_select on public.dh_worlds for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists dh_world_state_room_select on public.dh_world_state;
create policy dh_world_state_room_select on public.dh_world_state for select to authenticated
  using (public.dh_can_read_world_state(owner_id, world_id));

drop policy if exists dh_rooms_member_select on public.dh_rooms;
create policy dh_rooms_member_select on public.dh_rooms for select to authenticated
  using (public.dh_is_room_member(id, incarnation));

drop policy if exists dh_members_room_select on public.dh_room_members;
create policy dh_members_room_select on public.dh_room_members for select to authenticated
  using (public.dh_is_room_member(room_id, incarnation));

drop policy if exists dh_events_room_select on public.dh_room_events;
create policy dh_events_room_select on public.dh_room_events for select to authenticated
  using (
    public.dh_is_room_member(room_id, incarnation)
    and (
      target_peer_id is null
      or author_id = auth.uid()
      or exists (
        select 1 from public.dh_room_members
        where room_id = dh_room_events.room_id
          and incarnation = dh_room_events.incarnation
          and user_id = auth.uid()
          and peer_id = dh_room_events.target_peer_id
      )
    )
  );

revoke all on public.dh_worlds, public.dh_world_state, public.dh_rooms,
  public.dh_room_members, public.dh_room_events, public.dh_join_attempts,
  public.dh_turn_issuance from anon, authenticated;
grant select on public.dh_worlds, public.dh_world_state, public.dh_rooms,
  public.dh_room_members, public.dh_room_events to authenticated;

create or replace function public.dh_room_roster(p_room_id text, p_incarnation uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'peerId', peer_id,
    'displayName', display_name,
    'role', role
  ) order by role, display_name), '[]'::jsonb)
  from public.dh_room_members
  where room_id = p_room_id
    and incarnation = p_incarnation
    and last_seen_at > now() - interval '45 seconds';
$$;

create or replace function public.dh_state_rows(p_owner_id uuid, p_world_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', key,
    'value', value,
    'revision', revision
  ) order by key), '[]'::jsonb)
  from public.dh_world_state
  where owner_id = p_owner_id and world_id = p_world_id;
$$;

create or replace function public.dh_open_room(
  p_room_id text,
  p_world_id text,
  p_peer_id text,
  p_display_name text,
  p_fragments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_room public.dh_rooms%rowtype;
  next_incarnation uuid := gen_random_uuid();
  world_name text;
begin
  if auth.uid() is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = true
    or not exists (select 1 from auth.users where id = auth.uid() and not is_anonymous) then
    raise exception 'not_authenticated';
  end if;
  if p_room_id !~ '^[A-Z0-9_-]{4,24}$'
    or nullif(p_world_id, '') is null or length(p_world_id) > 160
    or nullif(p_peer_id, '') is null or length(p_peer_id) > 160
    or length(coalesce(p_display_name, '')) > 120
    or jsonb_typeof(p_fragments) <> 'object'
    or length(p_fragments::text) > 8388608
    or (select count(*) from jsonb_object_keys(p_fragments)) > 2000 then
    raise exception 'invalid_room_payload';
  end if;

  select * into current_room from public.dh_rooms where id = p_room_id for update;
  if found and current_room.owner_id <> auth.uid() and current_room.active_until > now() then
    raise exception 'room_in_use';
  end if;

  world_name := coalesce(nullif(p_fragments #>> '{game,name}', ''), 'Без названия');
  insert into public.dh_worlds(owner_id, id, name)
  values (auth.uid(), p_world_id, world_name)
  on conflict (owner_id, id) do update set
    name = excluded.name,
    updated_at = now();

  -- Reopening an owned room starts a new incarnation and clears old members.
  delete from public.dh_rooms where id = p_room_id;
  insert into public.dh_rooms(id, owner_id, world_id, incarnation, gm_peer_id, gm_name, active_until)
  values (
    p_room_id, auth.uid(), p_world_id, next_incarnation, p_peer_id,
    coalesce(nullif(p_display_name, ''), 'Мастер'), now() + interval '45 seconds'
  );
  insert into public.dh_room_members(room_id, incarnation, user_id, peer_id, role, display_name)
  values (
    p_room_id, next_incarnation, auth.uid(), p_peer_id, 'gm',
    coalesce(nullif(p_display_name, ''), 'Мастер')
  );

  -- The GM opens a room with a complete local snapshot, so it is authoritative
  -- for both upserts and removals.
  delete from public.dh_world_state
  where owner_id = auth.uid()
    and world_id = p_world_id
    and not (p_fragments ? key);

  insert into public.dh_world_state(owner_id, world_id, key, value, revision, updated_at)
  select auth.uid(), p_world_id, item.key, item.value, 1, now()
  from jsonb_each(p_fragments) as item(key, value)
  where item.key ~ '^[A-Za-z0-9:_-]{1,160}$'
  on conflict (owner_id, world_id, key) do update set
    value = excluded.value,
    revision = public.dh_world_state.revision + 1,
    updated_at = now();

  return jsonb_build_object(
    'incarnation', next_incarnation,
    'cursor', 0,
    'ownerId', auth.uid(),
    'worldId', p_world_id,
    'gmPeerId', p_peer_id,
    'roster', public.dh_room_roster(p_room_id, next_incarnation),
    'stateRows', public.dh_state_rows(auth.uid(), p_world_id)
  );
end;
$$;

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
  on conflict (room_id, incarnation, peer_id) do update set
    user_id = excluded.user_id,
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

create or replace function public.dh_save_world_fragments(
  p_room_id text,
  p_incarnation uuid,
  p_fragments jsonb,
  p_deletes text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_room public.dh_rooms%rowtype;
  member public.dh_room_members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_fragments) <> 'object'
    or length(p_fragments::text) > 8388608
    or (select count(*) from jsonb_object_keys(p_fragments)) > 2000
    or coalesce(cardinality(p_deletes), 0) > 2000 then
    raise exception 'invalid_fragments';
  end if;

  select * into current_room from public.dh_rooms
  where id = p_room_id and incarnation = p_incarnation for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into member from public.dh_room_members
  where room_id = p_room_id and incarnation = p_incarnation and user_id = auth.uid();
  if not found or member.role <> 'gm' or current_room.owner_id <> auth.uid() then
    raise exception 'participant_unauthorized';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_fragments) as key
    where key !~ '^[A-Za-z0-9:_-]{1,160}$'
  ) or exists (
    select 1 from unnest(p_deletes) as key
    where key !~ '^[A-Za-z0-9:_-]{1,160}$'
  ) then
    raise exception 'invalid_fragment_key';
  end if;

  delete from public.dh_world_state
  where owner_id = current_room.owner_id
    and world_id = current_room.world_id
    and key = any(p_deletes)
    and not p_fragments ? key;

  insert into public.dh_world_state(owner_id, world_id, key, value, revision, updated_at)
  select current_room.owner_id, current_room.world_id, item.key, item.value, 1, now()
  from jsonb_each(p_fragments) as item(key, value)
  on conflict (owner_id, world_id, key) do update set
    value = excluded.value,
    revision = public.dh_world_state.revision + 1,
    updated_at = now();

  update public.dh_worlds
  set updated_at = now(), name = coalesce(nullif(p_fragments #>> '{game,name}', ''), name)
  where owner_id = current_room.owner_id and id = current_room.world_id;

  return public.dh_state_rows(current_room.owner_id, current_room.world_id);
end;
$$;

create or replace function public.dh_submit_room_event(
  p_room_id text,
  p_incarnation uuid,
  p_envelope jsonb,
  p_target_peer_id text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_room public.dh_rooms%rowtype;
  member public.dh_room_members%rowtype;
  payload_kind text := p_envelope #>> '{payload,kind}';
  control_type text := p_envelope #>> '{payload,type}';
  next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_envelope is null
    or jsonb_typeof(p_envelope) <> 'object'
    or length(p_envelope::text) > 131072
    or nullif(p_envelope->>'id', '') is null
    or length(p_envelope->>'id') > 160
    or p_envelope->>'channel' not in ('control', 'data')
    or p_envelope #>> '{payload,kind}' = 'snapshot' then
    raise exception 'invalid_event';
  end if;

  select * into current_room from public.dh_rooms
  where id = p_room_id and incarnation = p_incarnation;
  if not found then raise exception 'room_not_found'; end if;
  select * into member from public.dh_room_members
  where room_id = p_room_id
    and incarnation = p_incarnation
    and user_id = auth.uid()
    and peer_id = p_envelope #>> '{sender,peerId}';
  if not found then raise exception 'participant_unauthorized'; end if;
  if member.role = 'player'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    raise exception 'participant_unauthorized';
  end if;
  if member.role = 'player' and current_room.active_until <= now() then
    raise exception 'master_offline';
  end if;
  if p_envelope #>> '{sender,peerId}' <> member.peer_id
    or p_envelope #>> '{sender,role}' <> member.role then
    raise exception 'invalid_event_sender';
  end if;
  if p_target_peer_id is not null and not exists (
    select 1 from public.dh_room_members
    where room_id = p_room_id and incarnation = p_incarnation and peer_id = p_target_peer_id
  ) then
    raise exception 'invalid_event_target';
  end if;

  -- Players may request actions and publish presence, but cannot impersonate
  -- the authoritative GM or relay arbitrary application messages.
  if member.role = 'player' and not (
    (p_envelope->>'channel' = 'control'
      and control_type = any(array['hello', 'player-ping', 'heartbeat', 'goodbye']))
    or (p_envelope->>'channel' = 'data'
      and payload_kind = any(array[
        'actor', 'asset', 'callPresence', 'feed', 'playerActivation',
        'playerCharacterCreate', 'playerCharacterUpdateAck', 'playerDecision', 'playerRequest',
        'playerRestChoice', 'playerRollIntent', 'playerTokenMove', 'presence',
        'snapshotRequest'
      ]))
  ) then
    raise exception 'event_forbidden';
  end if;

  insert into public.dh_room_events(
    room_id, incarnation, event_id, author_id, author_peer_id, target_peer_id, envelope
  ) values (
    p_room_id, p_incarnation, p_envelope->>'id', auth.uid(), member.peer_id,
    p_target_peer_id, p_envelope
  )
  on conflict (room_id, incarnation, event_id) do update
    set event_id = excluded.event_id
  returning sequence into next_sequence;

  return next_sequence;
end;
$$;

create or replace function public.dh_heartbeat(p_room_id text, p_incarnation uuid, p_peer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member public.dh_room_members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into member from public.dh_room_members
  where room_id = p_room_id
    and incarnation = p_incarnation
    and user_id = auth.uid()
    and peer_id = p_peer_id;
  if not found then raise exception 'participant_unauthorized'; end if;
  if member.role = 'player'
    and (coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
      or not exists (
        select 1 from public.dh_rooms
        where id = p_room_id and incarnation = p_incarnation and active_until > now()
      )) then
    raise exception 'master_offline';
  end if;

  update public.dh_room_members
  set last_seen_at = now()
  where room_id = p_room_id and incarnation = p_incarnation
    and user_id = auth.uid() and peer_id = p_peer_id;
  if member.role = 'gm' then
    update public.dh_rooms
    set active_until = now() + interval '45 seconds', updated_at = now()
    where id = p_room_id and incarnation = p_incarnation and owner_id = auth.uid();
  end if;
end;
$$;

create or replace function public.dh_leave_room(p_room_id text, p_incarnation uuid, p_peer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member public.dh_room_members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into member from public.dh_room_members
  where room_id = p_room_id
    and incarnation = p_incarnation
    and user_id = auth.uid()
    and peer_id = p_peer_id;
  if not found then return; end if;
  if member.role = 'player'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    raise exception 'participant_unauthorized';
  end if;

  if member.role = 'gm' then
    update public.dh_rooms
    set active_until = now(), updated_at = now()
    where id = p_room_id and incarnation = p_incarnation and owner_id = auth.uid();
  end if;
  delete from public.dh_room_members
  where room_id = p_room_id and incarnation = p_incarnation
    and user_id = auth.uid() and peer_id = p_peer_id;
end;
$$;

create or replace function public.dh_claim_turn_credentials(p_room_id text, p_peer_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  current_attempts integer;
begin
  select exists (
    select 1
    from public.dh_room_members member
    join public.dh_rooms room
      on room.id = member.room_id
     and room.incarnation = member.incarnation
    where member.room_id = p_room_id
      and member.peer_id = p_peer_id
      and member.user_id = auth.uid()
      and room.active_until > now()
      and member.last_seen_at > now() - interval '45 seconds'
      and public.dh_is_room_member(member.room_id, member.incarnation)
  ) into allowed;
  if not allowed then return false; end if;

  insert into public.dh_turn_issuance(user_id, room_id, peer_id, window_started_at, attempts)
  values (auth.uid(), p_room_id, p_peer_id, now(), 1)
  on conflict (user_id, room_id, peer_id) do update set
    window_started_at = case
      when public.dh_turn_issuance.window_started_at <= now() - interval '10 minutes'
        then now()
      else public.dh_turn_issuance.window_started_at
    end,
    attempts = case
      when public.dh_turn_issuance.window_started_at <= now() - interval '10 minutes'
        then 1
      else public.dh_turn_issuance.attempts + 1
    end
  returning attempts into current_attempts;
  return current_attempts <= 3;
end;
$$;

create or replace function public.dh_cleanup_anonymous_users()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.dh_rooms
  where active_until < now() - interval '7 days';
  delete from public.dh_join_attempts
  where window_started_at < now() - interval '1 day';
  delete from public.dh_turn_issuance
  where window_started_at < now() - interval '1 day';

  delete from auth.users users
  where users.is_anonymous
    and users.created_at < now() - interval '30 days'
    and not exists (
      select 1
      from public.dh_room_members member
      join public.dh_rooms room
        on room.id = member.room_id
       and room.incarnation = member.incarnation
      where member.user_id = users.id
        and room.active_until > now()
        and member.last_seen_at > now() - interval '45 seconds'
    );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.dh_is_room_member(text, uuid) from public;
revoke all on function public.dh_can_read_world_state(uuid, text) from public;
grant execute on function public.dh_is_room_member(text, uuid) to authenticated;
grant execute on function public.dh_can_read_world_state(uuid, text) to authenticated;
revoke all on function public.dh_room_roster(text, uuid) from public;
revoke all on function public.dh_state_rows(uuid, text) from public;
revoke all on function public.dh_open_room(text, text, text, text, jsonb) from public;
revoke all on function public.dh_join_room(text, text, text) from public;
revoke all on function public.dh_save_world_fragments(text, uuid, jsonb, text[]) from public;
revoke all on function public.dh_submit_room_event(text, uuid, jsonb, text) from public;
revoke all on function public.dh_heartbeat(text, uuid, text) from public;
revoke all on function public.dh_leave_room(text, uuid, text) from public;
revoke all on function public.dh_claim_turn_credentials(text, text) from public;
revoke all on function public.dh_cleanup_anonymous_users() from public;
grant execute on function public.dh_open_room(text, text, text, text, jsonb) to authenticated;
grant execute on function public.dh_join_room(text, text, text) to authenticated;
grant execute on function public.dh_save_world_fragments(text, uuid, jsonb, text[]) to authenticated;
grant execute on function public.dh_submit_room_event(text, uuid, jsonb, text) to authenticated;
grant execute on function public.dh_heartbeat(text, uuid, text) to authenticated;
grant execute on function public.dh_leave_room(text, uuid, text) to authenticated;
grant execute on function public.dh_claim_turn_credentials(text, text) to authenticated;
grant execute on function public.dh_cleanup_anonymous_users() to service_role;

select cron.schedule(
  'daggerheart-cleanup-anonymous-users',
  '23 4 * * 0',
  $$select public.dh_cleanup_anonymous_users();$$
);

alter publication supabase_realtime add table public.dh_world_state;
alter publication supabase_realtime add table public.dh_room_members;
alter publication supabase_realtime add table public.dh_room_events;

insert into storage.buckets(id, name, public, file_size_limit)
values ('world-assets', 'world-assets', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists dh_assets_owner_insert on storage.objects;
create policy dh_assets_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.dh_worlds world
      where world.owner_id = auth.uid()
        and world.id = (storage.foldername(storage.objects.name))[2]
    )
  );

drop policy if exists dh_assets_owner_update on storage.objects;
create policy dh_assets_owner_update on storage.objects for update to authenticated
  using (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  )
  with check (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.dh_worlds world
      where world.owner_id = auth.uid()
        and world.id = (storage.foldername(storage.objects.name))[2]
    )
  );

drop policy if exists dh_assets_owner_delete on storage.objects;
create policy dh_assets_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'world-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

drop policy if exists dh_assets_room_select on storage.objects;
create policy dh_assets_room_select on storage.objects for select to authenticated
  using (
    bucket_id = 'world-assets'
    and public.dh_can_read_world_state(
      ((storage.foldername(name))[1])::uuid,
      (storage.foldername(name))[2]
    )
  );
