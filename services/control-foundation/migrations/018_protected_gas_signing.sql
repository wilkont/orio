BEGIN;
CREATE TABLE orio_gas.signing_preparations (
 transaction_id text NOT NULL REFERENCES orio_gas.reservations,
 operation_id text NOT NULL,
 prepared_ref text NOT NULL,
 typed_digest text NOT NULL CHECK(typed_digest ~ '^0x[0-9a-f]{64}$'),
 PRIMARY KEY(transaction_id,operation_id),
 FOREIGN KEY(transaction_id,operation_id) REFERENCES orio_gas.submissions
);
CREATE TRIGGER immutable_gas_signing_preparation BEFORE UPDATE OR DELETE ON orio_gas.signing_preparations
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_gas_signing_preparation_truncate BEFORE TRUNCATE ON orio_gas.signing_preparations
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
REVOKE ALL ON orio_gas.signing_preparations FROM PUBLIC;
COMMIT;
