-- Demo vendors (seeded accounts on the reserved evntly.test domain) are
-- marked is_demo, labelled "Sample listing" in the app, sorted below real
-- vendors, and given stock sample photos (Unsplash, captioned "Sample
-- photo") so their profiles show how a portfolio looks. They are not real
-- businesses; nothing here should read as real work or real reviews.

alter table public.service_providers
  add column if not exists is_demo boolean not null default false;

update public.service_providers
set is_demo = true
where owner_email ilike '%@evntly.test';

grant select (is_demo) on public.service_providers to anon, authenticated;

-- Owners can't flip the flag on their own listing.
create or replace function public.guard_is_demo()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.is_demo := false;
  elsif new.is_demo is distinct from old.is_demo then
    raise exception 'Not authorized to change this listing''s demo flag';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_is_demo() from public, anon, authenticated;

drop trigger if exists trg_service_providers_is_demo on public.service_providers;
create trigger trg_service_providers_is_demo
  before insert or update on public.service_providers
  for each row execute function public.guard_is_demo();

insert into public.portfolio_items (provider_id, owner_email, media_type, media_url, caption, sort_order)
select sp.id, sp.owner_email, 'image',
       'https://images.unsplash.com/photo-' || v.photo || '?w=1200&q=80',
       'Sample photo', v.ord
from (values
  ('763df60e-25ac-4772-9dfd-da59fa8f15e5', '1514525253161-7a46d19cd819', 1),
  ('763df60e-25ac-4772-9dfd-da59fa8f15e5', '1506157786151-b8491531f063', 2),
  ('856ebf9d-156e-45dd-b747-599126dc633e', '1459749411175-04bf5292ceea', 1),
  ('856ebf9d-156e-45dd-b747-599126dc633e', '1574391884720-bbc3740c59d1', 2),
  ('c5af0dcc-322b-448a-b615-52d0828b8a62', '1429962714451-bb934ecdc4ec', 1),
  ('c5af0dcc-322b-448a-b615-52d0828b8a62', '1501386761578-eac5c94b800a', 2),
  ('ed440214-747e-4aa5-af81-41f53ce3fde4', '1465495976277-4387d4b0b4c6', 1),
  ('ed440214-747e-4aa5-af81-41f53ce3fde4', '1606800052052-a08af7148866', 2),
  ('41da9d19-fb8b-41b5-af0f-a9c9712ef5c4', '1478146896981-b80fe463b330', 1),
  ('41da9d19-fb8b-41b5-af0f-a9c9712ef5c4', '1532712938310-34cb3982ef74', 2),
  ('6c9d6464-04aa-4628-9d09-c6329467a9b2', '1511285560929-80b456fea0bc', 1),
  ('6c9d6464-04aa-4628-9d09-c6329467a9b2', '1537633552985-df8429e8048b', 2),
  ('f8bc01b1-709b-47d1-8959-4324693d040f', '1520854221256-17451cc331bf', 1),
  ('f8bc01b1-709b-47d1-8959-4324693d040f', '1583939003579-730e3918a45a', 2),
  ('4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8', '1563241527-3004b7be0ffd', 1),
  ('4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8', '1508610048659-a06b669e3321', 2),
  ('4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8', '1519378058457-4c29a0a2efac', 3),
  ('151dc82e-11e7-44a2-a4dc-cea1c8bd6764', '1525310072745-f49212b5ac6d', 1),
  ('151dc82e-11e7-44a2-a4dc-cea1c8bd6764', '1455659817273-f96807779a8a', 2),
  ('151dc82e-11e7-44a2-a4dc-cea1c8bd6764', '1490750967868-88aa4486c946', 3),
  ('c20f9e4f-7d20-4deb-a05f-864103d5c4ee', '1414235077428-338989a2e8c0', 1),
  ('c20f9e4f-7d20-4deb-a05f-864103d5c4ee', '1519225421980-715cb0215aed', 2),
  ('c20f9e4f-7d20-4deb-a05f-864103d5c4ee', '1464366400600-7168b8af9bc3', 3),
  ('bffa6f67-9e2e-49c5-a108-b553c5426519', '1504674900247-0877df9cc836', 1),
  ('bffa6f67-9e2e-49c5-a108-b553c5426519', '1540189549336-e6e99c3679fe', 2),
  ('bffa6f67-9e2e-49c5-a108-b553c5426519', '1546069901-ba9599a7e63c', 3)
) as v(provider_id, photo, ord)
join public.service_providers sp on sp.id = v.provider_id and sp.is_demo
where not exists (
  select 1 from public.portfolio_items pi where pi.provider_id = sp.id
);
