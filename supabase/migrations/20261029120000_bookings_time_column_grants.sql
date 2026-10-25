-- bookings.start_time / end_time (added by smart_matching_mvp1) were never
-- granted to signed-in users. bookings uses column-level SELECT grants (to
-- keep emails and Stripe ids private), and the app's BOOKING_COLUMNS reads
-- both, so every booking list and booking page failed with "permission
-- denied for table bookings" since 2026-10-22. Rows are still limited to the
-- booking's customer and vendor by RLS.
grant select (start_time, end_time) on public.bookings to authenticated;
