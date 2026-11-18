-- Prepared only. Separate hosted approval is required. No authority binding,
-- signing intent, KMS permission or financial activation is created.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='2000ms';
SET LOCAL statement_timeout='10000ms';
DO $$ BEGIN
 IF current_database()<>'orio_control' OR current_user<>'orio_ledger_admin'
  OR session_user<>'orio_ledger_admin' THEN RAISE EXCEPTION 'Wrong journal bootstrap identity'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='orio_valuation_journal')
 THEN RAISE EXCEPTION 'Journal role already exists; inspect before proceeding'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rds_iam' AND NOT rolcanlogin AND NOT rolsuper
  AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Expected managed IAM role unavailable'; END IF;
 IF NOT pg_try_advisory_xact_lock(1869771119,1903322476)
 THEN RAISE EXCEPTION 'Competing maintenance'; END IF;
 IF (SELECT count(*) FROM orio_signing.authorities)<>0
  OR (SELECT count(*) FROM orio_signing.runtime_authority_bindings)<>0
  OR (SELECT count(*) FROM orio_signing.valuation_intents)<>0
 THEN RAISE EXCEPTION 'Unexpected signing configuration'; END IF;
END $$;
CREATE ROLE orio_valuation_journal LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD NULL;
GRANT rds_iam TO orio_valuation_journal;
GRANT CONNECT ON DATABASE orio_control TO orio_valuation_journal;
GRANT USAGE ON SCHEMA orio_signing TO orio_valuation_journal;
GRANT EXECUTE ON FUNCTION orio_signing.valuation_runtime_load(text),
 orio_signing.valuation_runtime_claim(text,text),
 orio_signing.valuation_runtime_complete(text,text,text) TO orio_valuation_journal;
ALTER ROLE orio_valuation_journal SET statement_timeout='5000ms';
ALTER ROLE orio_valuation_journal SET lock_timeout='1000ms';
ALTER ROLE orio_valuation_journal SET idle_in_transaction_session_timeout='10000ms';
ALTER ROLE orio_valuation_journal SET search_path=pg_catalog;
COMMIT;
