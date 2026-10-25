-- Undo 20261029100000_dispute_evidence.sql. Uploaded files stay in the
-- bucket until removed from the Storage dashboard.
drop policy if exists dispute_evidence_insert on storage.objects;
drop policy if exists dispute_evidence_read on storage.objects;
drop function if exists public.dispute_evidence_access(text, boolean);
drop function if exists public.add_dispute_message(uuid, text, text[]);
-- Recreate add_dispute_message(uuid, text) from 20261028090000_disputes_and_risk.sql, then:
alter table public.booking_dispute_messages drop constraint if exists booking_dispute_messages_content_check;
alter table public.booking_dispute_messages drop column if exists attachment_paths;
alter table public.booking_dispute_messages add constraint booking_dispute_messages_body_check check (char_length(body) between 1 and 4000);
