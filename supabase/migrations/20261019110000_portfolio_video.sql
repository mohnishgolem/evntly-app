-- Portfolio videos (DJs/MCs asked for reels) and direct-to-storage uploads.
--
-- Uploads now go straight from the browser to storage (server actions cap
-- request bodies at 1 MB, so photos over 1 MB were failing), then a server
-- action records the item. The bucket allows short videos up to 50 MB; the
-- app keeps photos at 10 MB.

update storage.buckets
set allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
      'video/mp4', 'video/webm', 'video/quicktime'
    ],
    file_size_limit = 52428800
where id = 'portfolio';

-- Items may only point at the owner's own folder in our portfolio bucket
-- (previously any https URL was accepted), and must be an image or video.
create or replace function public.guard_portfolio_items_write()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  if not exists (
    select 1 from public.service_providers sp
    where sp.id = new.provider_id and sp.owner_user_id = auth.uid()
  ) then
    raise exception 'You can only add portfolio items to your own listing';
  end if;
  if coalesce(new.media_type, '') not in ('image', 'video') then
    raise exception 'Portfolio media must be an image or a video';
  end if;
  if position(
       'https://pzeosxtdulveuywhmkfe.supabase.co/storage/v1/object/public/portfolio/' || auth.uid()::text || '/'
       in new.media_url) <> 1 then
    raise exception 'Portfolio media must be uploaded to your own portfolio folder';
  end if;
  return new;
end;
$$;
