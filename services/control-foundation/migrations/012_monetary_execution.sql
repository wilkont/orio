BEGIN;
LOCK TABLE orio_settlement.receipt_claims IN ACCESS EXCLUSIVE MODE;
ALTER TABLE orio_settlement.receipt_claims DROP CONSTRAINT receipt_claims_consumer_check;
ALTER TABLE orio_settlement.receipt_claims ADD CONSTRAINT receipt_claims_consumer_check
 CHECK (consumer IN ('conversion','redemption','gas-funding','gas-refund','monetary'));
CREATE SCHEMA orio_monetary;
REVOKE ALL ON SCHEMA orio_monetary FROM PUBLIC;
-- Trusted migration/settlement identity only; no HTTP or runtime grants.
CREATE TABLE orio_monetary.deployments (
 id text PRIMARY KEY,
 configuration jsonb NOT NULL,
 version numeric(78,0) NOT NULL DEFAULT 0 CHECK(version >= 0),
 state jsonb NOT NULL
);
CREATE TABLE orio_monetary.executions (
 deployment_id text NOT NULL REFERENCES orio_monetary.deployments,
 version numeric(78,0) NOT NULL CHECK(version > 0),
 operation_id text NOT NULL,
 evidence jsonb NOT NULL,
 next_state jsonb NOT NULL,
 journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals,
 PRIMARY KEY(deployment_id,version), UNIQUE(deployment_id,operation_id)
);
CREATE TRIGGER immutable_executions BEFORE UPDATE OR DELETE ON orio_monetary.executions
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_executions_truncate BEFORE TRUNCATE ON orio_monetary.executions
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TABLE orio_monetary.transfers (
 external_ref text PRIMARY KEY REFERENCES orio_settlement.receipt_claims,
 deployment_id text NOT NULL REFERENCES orio_monetary.deployments,
 evidence jsonb NOT NULL,
 journal_sequence bigint UNIQUE REFERENCES orio_ledger.journals
);
CREATE TRIGGER immutable_transfers BEFORE UPDATE OR DELETE ON orio_monetary.transfers
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_transfers_truncate BEFORE TRUNCATE ON orio_monetary.transfers
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
COMMIT;
