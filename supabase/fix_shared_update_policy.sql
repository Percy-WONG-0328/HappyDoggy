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
