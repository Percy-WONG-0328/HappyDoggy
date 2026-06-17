drop policy if exists "owners can delete their events" on public.events;
drop policy if exists "owners and participants can delete shared events" on public.events;

create policy "owners and participants can delete shared events"
on public.events for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or (
    visibility <> 'private'
    and public.is_event_participant(events.id, auth.uid())
  )
);
