-- Planner adoption: run read-only in the Supabase SQL editor (or via MCP
-- execute_sql). Counts only — no names or emails. Staff accounts and the
-- browsers they've used are excluded, as in the admin funnel.
-- Change the window in `since`.
with since as (select now() - interval '30 days' as t),
admins as (select id::uuid as id from public.users where role = 'admin'),
staff_browsers as (
  select distinct visitor_id from public.page_views
  where visitor_id is not null and user_id in (select id from admins)
),
pe as (
  select * from public.planner_events
  where created_at > (select t from since)
    and (user_id is null or user_id not in (select id from admins))
    and (visitor_id is null or visitor_id not in (select visitor_id from staff_browsers))
)
select
  -- Top of the funnel
  (select count(distinct visitor_id) from public.page_views
     where kind = 'plan' and created_at > (select t from since)
       and visitor_id not in (select visitor_id from staff_browsers))                  as plan_page_visitors,
  (select count(distinct visitor_id) from pe where event = 'plan_started')          as creation_started,
  (select count(distinct visitor_id) from pe where event = 'plan_previewed')        as guest_previews,
  (select count(distinct visitor_id) from pe where event = 'plan_save_clicked')     as guest_save_taps,
  -- Created = signed-in form + guest previews saved after sign-up
  (select count(*) from pe where event = 'event_created')                           as events_created,
  (select count(*) from pe where event = 'event_created' and detail = 'guest_preview') as registrations_from_planner,
  -- Abandoned: started the form in a browser that never produced an event
  (select count(distinct visitor_id) from pe s where s.event = 'plan_started'
     and not exists (select 1 from pe c where c.event = 'event_created'
                     and c.user_id in (select user_id from pe x where x.visitor_id = s.visitor_id and x.user_id is not null)))
                                                                                     as creation_abandoned,
  -- Engagement
  (select count(*) from (select user_id from pe where event = 'planner_opened' and user_id is not null
                         group by user_id having count(distinct created_at::date) >= 2) r) as repeat_planner_users,
  (select count(*) from pe where event = 'planner_opened')                          as planner_opens,
  (select count(*) from pe where event = 'task_completed')                          as tasks_completed,
  (select count(*) from pe where event = 'recommendation_clicked')                  as recommendations_clicked,
  (select count(*) from pe where event = 'vendor_saved')                            as vendors_shortlisted,
  (select count(*) from pe where event = 'vendor_enquiry')                          as vendor_enquiries_from_planner,
  (select count(*) from public.quote_requests where created_at > (select t from since)) as all_quote_requests;
