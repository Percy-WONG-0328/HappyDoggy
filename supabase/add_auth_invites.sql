alter table public.user_relationships replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_relationships'
  ) then
    alter publication supabase_realtime add table public.user_relationships;
  end if;
end $$;

create or replace function public.accept_relationship_invite(invite_id_to_accept uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_id uuid;
  invitee_id uuid;
begin
  select user_id, related_user_id
  into inviter_id, invitee_id
  from public.user_relationships
  where id = invite_id_to_accept
    and related_user_id = auth.uid()
    and status = 'pending';

  if inviter_id is null or invitee_id is null then
    raise exception 'Invitation not found or already handled.';
  end if;

  update public.user_relationships
  set status = 'active'
  where id = invite_id_to_accept;

  insert into public.user_relationships (user_id, related_user_id, status, relationship_type)
  values (invitee_id, inviter_id, 'active', 'close_friend')
  on conflict (user_id, related_user_id)
  do update set status = 'active';
end;
$$;

drop policy if exists "users can read their own relationships" on public.user_relationships;
create policy "users can read their own relationships"
on public.user_relationships for select
to authenticated
using (user_id = auth.uid() or related_user_id = auth.uid());

drop policy if exists "users can invite other users" on public.user_relationships;
create policy "users can invite other users"
on public.user_relationships for insert
to authenticated
with check (
  user_id = auth.uid()
  and related_user_id <> auth.uid()
  and status in ('pending', 'active')
);

drop policy if exists "invitees can accept relationship invites" on public.user_relationships;
create policy "invitees can accept relationship invites"
on public.user_relationships for update
to authenticated
using (related_user_id = auth.uid() and status = 'pending')
with check (related_user_id = auth.uid() and status = 'active');
