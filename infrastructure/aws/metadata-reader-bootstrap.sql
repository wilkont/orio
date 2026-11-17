-- Separately approved IAM-reader provisioning, NOT a monetary migration.
-- Check exact RDS identity, fresh recovery window and current catalog first.
-- One-shot: an occupied role name is a stop, never an adoption/retry path.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='2000ms';
SET LOCAL statement_timeout='10000ms';
DO $$ BEGIN
 IF current_database()<>'orio_control' OR current_user<>'orio_ledger_admin'
  OR session_user<>'orio_ledger_admin' THEN RAISE EXCEPTION 'Wrong reader bootstrap identity'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='orio_protocol_reader') THEN RAISE EXCEPTION 'Reader already exists; inspect before proceeding'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rds_iam' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Expected managed IAM role unavailable'; END IF;
 IF NOT pg_try_advisory_xact_lock(1869771119,1903322476) THEN RAISE EXCEPTION 'Competing maintenance'; END IF;
END $$;
CREATE ROLE orio_protocol_reader LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD NULL;
GRANT rds_iam TO orio_protocol_reader;
GRANT CONNECT ON DATABASE orio_control TO orio_protocol_reader;
GRANT USAGE ON SCHEMA orio_master TO orio_protocol_reader;
GRANT SELECT ON orio_master.assets,orio_master.elections,orio_master.current_election TO orio_protocol_reader;
ALTER ROLE orio_protocol_reader SET default_transaction_read_only=on;
ALTER ROLE orio_protocol_reader SET statement_timeout='5000ms';
ALTER ROLE orio_protocol_reader SET lock_timeout='1000ms';
ALTER ROLE orio_protocol_reader SET idle_in_transaction_session_timeout='10000ms';
ALTER ROLE orio_protocol_reader SET search_path=pg_catalog;
COMMIT;
