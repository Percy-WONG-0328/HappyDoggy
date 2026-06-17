delete from public.event_participants p
using public.events e
where p.event_id = e.id
  and p.user_id = e.owner_user_id;
