BEGIN;
-- Stop receipt writers while backfilling and installing both guards atomically.
LOCK TABLE orio_conversion.external_receipts, orio_redemption.receipts IN ACCESS EXCLUSIVE MODE;

CREATE SCHEMA orio_settlement;
REVOKE ALL ON SCHEMA orio_settlement FROM PUBLIC;

CREATE TABLE orio_settlement.receipt_claims (
  external_ref text PRIMARY KEY CHECK (length(btrim(external_ref)) > 0),
  consumer text NOT NULL CHECK (consumer IN ('conversion','redemption')),
  operation_id text NOT NULL CHECK (length(btrim(operation_id)) > 0)
);

-- Conflicting pre-upgrade ownership aborts the complete migration transaction.
INSERT INTO orio_settlement.receipt_claims
  SELECT external_ref, 'conversion', intent_id FROM orio_conversion.external_receipts;
INSERT INTO orio_settlement.receipt_claims
  SELECT external_ref, 'redemption', request_id FROM orio_redemption.receipts;

CREATE TRIGGER immutable_claims BEFORE UPDATE OR DELETE ON orio_settlement.receipt_claims
  FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_claims_truncate BEFORE TRUNCATE ON orio_settlement.receipt_claims
  FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();

CREATE FUNCTION orio_settlement.claim_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  target_consumer text;
  target_operation text;
  existing orio_settlement.receipt_claims;
BEGIN
  IF TG_TABLE_SCHEMA = 'orio_conversion' AND TG_TABLE_NAME = 'external_receipts' THEN
    target_consumer := 'conversion';
    target_operation := NEW.intent_id;
  ELSIF TG_TABLE_SCHEMA = 'orio_redemption' AND TG_TABLE_NAME = 'receipts' THEN
    target_consumer := 'redemption';
    target_operation := NEW.request_id;
  ELSE
    RAISE EXCEPTION 'Unexpected settlement receipt source';
  END IF;
  INSERT INTO orio_settlement.receipt_claims VALUES (NEW.external_ref,target_consumer,target_operation)
    ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT existing FROM orio_settlement.receipt_claims
    WHERE external_ref = NEW.external_ref;
  IF existing.consumer <> target_consumer OR existing.operation_id <> target_operation THEN
    RAISE EXCEPTION 'Finalized receipt already belongs to another operation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION orio_settlement.claim_receipt() FROM PUBLIC;

CREATE TRIGGER shared_receipt_claim BEFORE INSERT ON orio_conversion.external_receipts
  FOR EACH ROW EXECUTE FUNCTION orio_settlement.claim_receipt();
CREATE TRIGGER shared_receipt_claim BEFORE INSERT ON orio_redemption.receipts
  FOR EACH ROW EXECUTE FUNCTION orio_settlement.claim_receipt();
COMMIT;
