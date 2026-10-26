-- messages.read had no default and the send actions don't set it, so every
-- new message was stored with read = NULL. The unread counts
-- (my_unread_message_count, my_conversations) count "not read", which is
-- never true for NULL — so the header badge and inbox dots never showed an
-- unread message. New messages now start unread.
--
-- Existing NULL rows (all from before this fix) are left as they are, so old
-- conversations don't suddenly light up as unread; the one test message
-- sent during the 2026-10-26 live test is set unread so the badge can be
-- checked.
--
-- Rollback: supabase/rollbacks/20261029140000_messages_read_default.down.sql
alter table public.messages alter column read set default false;

update public.messages set read = false
where conversation_id = 'bda79f33-ba9c-46e4-b474-32ff425e6d27:750784a0-ff09-4b5f-aeb4-80d71dbcc55a'
  and read is null;
