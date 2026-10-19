-- Quote follow-ups: reminders before a quote request expires, and an email
-- with similar vendors when a vendor never replied. pg_cron calls the app's
-- /api/cron/quote-followups every 15 minutes through pg_net; the route
-- checks a shared secret kept in app_settings (service role only — anon and
-- authenticated have no grants on that table).

create extension if not exists pg_net with schema extensions;

alter table public.quote_requests
  add column if not exists vendor_reminder_sent_at timestamptz,
  add column if not exists client_reminder_sent_at timestamptz,
  add column if not exists expiry_notice_sent_at timestamptz;

-- Don't email about quotes that expired before this feature existed.
update public.quote_requests
set expiry_notice_sent_at = now()
where expiry_notice_sent_at is null
  and (status = 'expired' or (status in ('pending', 'quoted') and expires_at <= now()));

insert into public.app_settings (key, value)
values
  ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex')),
  -- Update when the custom domain goes live.
  ('site_url', 'https://evntly-tau.vercel.app')
on conflict (key) do nothing;

select cron.schedule(
  'quote-followups',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select value from public.app_settings where key = 'site_url') || '/api/cron/quote-followups',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
