delete from public.vendor_listing_drafts;
delete from public.listing_setup_requests;
delete from public.vendor_packages where provider_id in (select id from public.service_providers where name like 'Real QA%' or name like 'Northside Beats%' or name like 'Harbour Owner%');
delete from public.beta_applications where user_id::text in (select id::text from auth.users where email like 'real-qa-%');
delete from public.service_providers where name like 'Real QA%' or name like 'Northside Beats%' or name like 'Harbour Owner%';
delete from auth.users where email like 'real-qa-%';
