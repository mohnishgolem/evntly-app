-- Customers' Stripe customer records, so the in-app payment form can offer
-- cards they chose to save on an earlier payment. Card details stay with
-- Stripe; this only maps an Evntly user to their Stripe customer id.
-- Written and read only by the service role (payment checkout).

create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
revoke all on public.stripe_customers from anon, authenticated;
