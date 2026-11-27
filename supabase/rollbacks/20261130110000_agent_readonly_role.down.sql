-- Rollback for 20261130110000_agent_readonly_role.sql
-- On Postgres 16+ the creating role (postgres) can administer evntly_agent_ro
-- but does not hold its privileges, so DROP OWNED needs the membership first
-- (verified on the local QA stack, 26 Nov 2026).
select pg_terminate_backend(pid) from pg_stat_activity where usename = 'evntly_agent_ro';
grant evntly_agent_ro to postgres;
drop owned by evntly_agent_ro;
drop view if exists agent_read.auth_users;
drop schema if exists agent_read;
drop role if exists evntly_agent_ro;
