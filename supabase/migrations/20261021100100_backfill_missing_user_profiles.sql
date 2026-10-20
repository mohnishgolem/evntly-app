-- Seven accounts created on 11 Oct 2026 (within about an hour, while the
-- new-user trigger wasn't creating profiles) have no public.users row, so
-- their saved vendors, role and Terms acceptance had nowhere to live.
-- Create the missing rows as customers; they'll be asked to accept the
-- Terms on their next visit. The trigger is verified working again.

insert into public.users (id, email, role)
select au.id::text, au.email, 'customer'
from auth.users au
where not exists (select 1 from public.users pu where pu.id = au.id::text)
on conflict (id) do nothing;
