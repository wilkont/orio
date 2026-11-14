BEGIN;
CREATE TABLE orio_monetary.company_withdrawals (
 external_ref text PRIMARY KEY REFERENCES orio_settlement.receipt_claims,
 deployment_id text NOT NULL REFERENCES orio_monetary.deployments,
 evidence jsonb NOT NULL,
 journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals
);
CREATE TRIGGER immutable_company_withdrawals BEFORE UPDATE OR DELETE ON orio_monetary.company_withdrawals
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_company_withdrawals_truncate BEFORE TRUNCATE ON orio_monetary.company_withdrawals
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
COMMIT;
