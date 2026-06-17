create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Asia/Hong_Kong',
  category text not null default 'Other',
  color text not null default '#2f6df6',
  visibility text not null default 'relationship',
  is_all_day boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_time check (end_at > start_at),
  constraint events_valid_visibility check (visibility in ('relationship', 'private'))
);

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table if not exists public.user_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  related_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  relationship_type text not null default 'close_friend',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, related_user_id),
  constraint user_relationships_no_self check (user_id <> related_user_id)
);

create index if not exists events_owner_start_idx on public.events (owner_user_id, start_at);
create index if not exists events_time_range_idx on public.events (start_at, end_at);
create index if not exists event_participants_user_idx on public.event_participants (user_id, event_id);
create index if not exists user_relationships_lookup_idx on public.user_relationships (user_id, related_user_id, status);

alter table public.events replica identity full;
alter table public.event_participants replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_participants'
  ) then
    alter publication supabase_realtime add table public.event_participants;
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.user_relationships enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists user_relationships_touch_updated_at on public.user_relationships;
create trigger user_relationships_touch_updated_at
before update on public.user_relationships
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_event_owner(event_id_to_check uuid, user_id_to_check uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.events e
    where e.id = event_id_to_check
      and e.owner_user_id = user_id_to_check
  );
$$;

create or replace function public.is_event_participant(event_id_to_check uuid, user_id_to_check uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.event_participants p
    where p.event_id = event_id_to_check
      and p.user_id = user_id_to_check
  );
$$;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "users can read their own relationships" on public.user_relationships;
create policy "users can read their own relationships"
on public.user_relationships for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can read their own participant rows" on public.event_participants;
create policy "users can read their own participant rows"
on public.event_participants for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_event_owner(event_participants.event_id, auth.uid())
);

drop policy if exists "owners can manage participants for their events" on public.event_participants;
create policy "owners can manage participants for their events"
on public.event_participants for all
to authenticated
using (public.is_event_owner(event_participants.event_id, auth.uid()))
with check (public.is_event_owner(event_participants.event_id, auth.uid()));

drop policy if exists "users can read visible events" on public.events;
create policy "users can read visible events"
on public.events for select
to authenticated
using (
  owner_user_id = auth.uid()
  or (
    visibility = 'relationship'
    and exists (
      select 1
      from public.user_relationships r
      where r.user_id = auth.uid()
        and r.related_user_id = events.owner_user_id
        and r.status = 'active'
    )
  )
  or (
    visibility <> 'private'
    and public.is_event_participant(events.id, auth.uid())
  )
);

drop policy if exists "users can create their own events" on public.events;
create policy "users can create their own events"
on public.events for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and visibility in ('relationship', 'private')
);

drop policy if exists "owners can update their events" on public.events;
drop policy if exists "owners and participants can update shared events" on public.events;
create policy "owners and participants can update shared events"
on public.events for update
to authenticated
using (
  owner_user_id = auth.uid()
  or (
    visibility <> 'private'
    and public.is_event_participant(events.id, auth.uid())
  )
)
with check (
  owner_user_id = auth.uid()
  or (
    visibility <> 'private'
    and public.is_event_participant(events.id, auth.uid())
  )
);

drop policy if exists "owners can delete their events" on public.events;
create policy "owners can delete their events"
on public.events for delete
to authenticated
using (owner_user_id = auth.uid());
