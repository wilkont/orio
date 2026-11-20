BEGIN;
CREATE SCHEMA orio_autonomous;
REVOKE ALL ON SCHEMA orio_autonomous FROM PUBLIC;
-- Trusted importer only; no HTTP/runtime roles receive access here.
CREATE TABLE orio_autonomous.deployments (
 id text PRIMARY KEY, configuration jsonb NOT NULL, state jsonb NOT NULL,
 version numeric(78,0) NOT NULL DEFAULT 0 CHECK(version>=0),
 pending_units numeric(78,0) NOT NULL DEFAULT 0 CHECK(pending_units>=0),
 company_units numeric(78,0) NOT NULL DEFAULT 0 CHECK(company_units>=0),
 block_number numeric(78,0) NOT NULL DEFAULT 0, log_index numeric(78,0) NOT NULL DEFAULT -1
);
CREATE TABLE orio_autonomous.facts (
 external_ref text PRIMARY KEY REFERENCES orio_settlement.receipt_claims, deployment_id text NOT NULL REFERENCES orio_autonomous.deployments,
 proof jsonb NOT NULL, journal_sequence bigint UNIQUE REFERENCES orio_ledger.journals
);
CREATE TRIGGER immutable_autonomous_facts BEFORE UPDATE OR DELETE ON orio_autonomous.facts
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_autonomous_facts_truncate BEFORE TRUNCATE ON orio_autonomous.facts
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
COMMIT;
