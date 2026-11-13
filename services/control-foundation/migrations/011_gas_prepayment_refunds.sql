BEGIN;
LOCK TABLE orio_conversion.external_receipts,orio_redemption.receipts,orio_gas.funding_receipts,orio_settlement.receipt_claims IN ACCESS EXCLUSIVE MODE;
ALTER TABLE orio_settlement.receipt_claims DROP CONSTRAINT receipt_claims_consumer_check;
ALTER TABLE orio_settlement.receipt_claims ADD CONSTRAINT receipt_claims_consumer_check
  CHECK (consumer IN ('conversion','redemption','gas-funding','gas-refund'));
CREATE TABLE orio_gas.refund_requests (
  refund_id text PRIMARY KEY,
  owner_ref text NOT NULL CHECK (owner_ref ~ '^0x[0-9a-f]{40}$'),
  asset_id text NOT NULL REFERENCES orio_gas.funding_assets,
  units numeric(78,0) NOT NULL CHECK(units > 0 AND units < power(2::numeric,256)),
  gas_transaction_id text NOT NULL UNIQUE REFERENCES orio_gas.reservations,
  authorization_digest text NOT NULL CHECK(authorization_digest ~ '^[a-f0-9]{64}$'),
  journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals
);
CREATE TABLE orio_gas.refund_receipts (
  refund_id text PRIMARY KEY REFERENCES orio_gas.refund_requests,
  external_ref text NOT NULL UNIQUE,
  evidence jsonb NOT NULL,
  journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals
);
CREATE TABLE orio_gas.refund_closures (
  refund_id text PRIMARY KEY REFERENCES orio_gas.refund_requests,
  kind text NOT NULL CHECK(kind='CANCELLED'),
  journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['refund_requests','refund_receipts','refund_closures'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON orio_gas.%I FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
    EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON orio_gas.%I FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION orio_settlement.claim_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target_consumer text; target_operation text; existing orio_settlement.receipt_claims;
BEGIN
  IF TG_TABLE_SCHEMA='orio_conversion' AND TG_TABLE_NAME='external_receipts' THEN
    target_consumer := 'conversion'; target_operation := NEW.intent_id;
  ELSIF TG_TABLE_SCHEMA='orio_redemption' AND TG_TABLE_NAME='receipts' THEN
    target_consumer := 'redemption'; target_operation := NEW.request_id;
  ELSIF TG_TABLE_SCHEMA='orio_gas' AND TG_TABLE_NAME='funding_receipts' THEN
    target_consumer := 'gas-funding'; target_operation := NEW.funding_id;
  ELSIF TG_TABLE_SCHEMA='orio_gas' AND TG_TABLE_NAME='refund_receipts' THEN
    target_consumer := 'gas-refund'; target_operation := NEW.refund_id;
  ELSE RAISE EXCEPTION 'Unexpected settlement receipt source'; END IF;
  INSERT INTO orio_settlement.receipt_claims VALUES(NEW.external_ref,target_consumer,target_operation) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT existing FROM orio_settlement.receipt_claims WHERE external_ref=NEW.external_ref;
  IF existing.consumer <> target_consumer OR existing.operation_id <> target_operation THEN
    RAISE EXCEPTION 'Finalized receipt already belongs to another operation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION orio_settlement.claim_receipt() FROM PUBLIC;
CREATE TRIGGER shared_receipt_claim BEFORE INSERT ON orio_gas.refund_receipts
  FOR EACH ROW EXECUTE FUNCTION orio_settlement.claim_receipt();
COMMIT;
