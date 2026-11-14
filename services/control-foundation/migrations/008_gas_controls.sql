-- Trusted control-writer boundary only. No public/runtime grants or transaction execution.
BEGIN;
CREATE SCHEMA orio_gas;
REVOKE ALL ON SCHEMA orio_gas FROM PUBLIC;
CREATE TABLE orio_gas.reservations (
  transaction_id text PRIMARY KEY,
  quote jsonb NOT NULL,
  authorization_digest text NOT NULL CHECK (authorization_digest ~ '^[a-f0-9]{64}$'),
  reserve_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals(sequence)
);
CREATE TABLE orio_gas.submissions (
  transaction_id text NOT NULL REFERENCES orio_gas.reservations,
  operation_id text NOT NULL,
  execution_ref text NOT NULL UNIQUE,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(transaction_id,operation_id)
);
CREATE TABLE orio_gas.costs (
  transaction_id text NOT NULL,
  operation_id text NOT NULL,
  evidence jsonb NOT NULL,
  expense_sequence bigint UNIQUE REFERENCES orio_ledger.journals(sequence),
  PRIMARY KEY(transaction_id,operation_id),
  FOREIGN KEY(transaction_id,operation_id) REFERENCES orio_gas.submissions
);
CREATE TABLE orio_gas.closures (
  transaction_id text PRIMARY KEY REFERENCES orio_gas.reservations,
  kind text NOT NULL CHECK (kind IN ('SETTLED','CANCELLED')),
  result jsonb NOT NULL,
  policy_digest text CHECK (policy_digest ~ '^[a-f0-9]{64}$'),
  journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals(sequence)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['reservations','submissions','costs','closures'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON orio_gas.%I FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
    EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON orio_gas.%I FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
  END LOOP;
END $$;
COMMIT;
