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
