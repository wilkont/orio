BEGIN;
-- Serialize historical backfill with all direct preparations. Bindings do not exist yet.
LOCK TABLE orio_gas.submissions IN ACCESS EXCLUSIVE MODE;
CREATE TABLE orio_gas.execution_claims (
  execution_ref text PRIMARY KEY,
  transaction_id text NOT NULL,
  operation_id text NOT NULL,
  FOREIGN KEY(transaction_id,operation_id) REFERENCES orio_gas.submissions
    DEFERRABLE INITIALLY DEFERRED
);
INSERT INTO orio_gas.execution_claims SELECT execution_ref,transaction_id,operation_id FROM orio_gas.submissions;
CREATE TABLE orio_gas.execution_bindings (
  transaction_id text NOT NULL,
  operation_id text NOT NULL,
  execution_ref text NOT NULL UNIQUE,
  signed_payload_digest text NOT NULL CHECK (signed_payload_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(transaction_id,operation_id),
  FOREIGN KEY(transaction_id,operation_id) REFERENCES orio_gas.submissions
);
CREATE FUNCTION orio_gas.claim_execution() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,orio_gas AS $$
DECLARE existing orio_gas.execution_claims;
BEGIN
  INSERT INTO orio_gas.execution_claims VALUES(NEW.execution_ref,NEW.transaction_id,NEW.operation_id)
    ON CONFLICT (execution_ref) DO NOTHING;
  SELECT * INTO STRICT existing FROM orio_gas.execution_claims WHERE execution_ref=NEW.execution_ref;
  IF existing.transaction_id <> NEW.transaction_id OR existing.operation_id <> NEW.operation_id THEN
    RAISE EXCEPTION 'Gas execution reference already claimed';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION orio_gas.claim_execution() FROM PUBLIC;
CREATE TRIGGER claim_execution BEFORE INSERT ON orio_gas.submissions
  FOR EACH ROW EXECUTE FUNCTION orio_gas.claim_execution();
CREATE TRIGGER claim_execution BEFORE INSERT ON orio_gas.execution_bindings
  FOR EACH ROW EXECUTE FUNCTION orio_gas.claim_execution();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON orio_gas.execution_claims
  FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON orio_gas.execution_claims
  FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON orio_gas.execution_bindings
  FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON orio_gas.execution_bindings
  FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
COMMIT;
