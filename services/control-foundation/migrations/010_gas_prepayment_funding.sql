BEGIN;
LOCK TABLE orio_conversion.external_receipts,orio_redemption.receipts,orio_settlement.receipt_claims IN ACCESS EXCLUSIVE MODE;
ALTER TABLE orio_settlement.receipt_claims DROP CONSTRAINT receipt_claims_consumer_check;
ALTER TABLE orio_settlement.receipt_claims ADD CONSTRAINT receipt_claims_consumer_check
  CHECK (consumer IN ('conversion','redemption','gas-funding'));

CREATE TABLE orio_gas.funding_assets (
  asset_id text PRIMARY KEY CHECK (asset_id ~ '^[A-Za-z0-9:_-]{1,100}$'),
  chain_id text NOT NULL CHECK (chain_id IN ('8453','84532')),
  token_address text NOT NULL CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  decimals integer NOT NULL CHECK (decimals BETWEEN 0 AND 77),
  treasury_address text NOT NULL CHECK (treasury_address ~ '^0x[0-9a-f]{40}$'),
  policy_digest text NOT NULL CHECK (policy_digest ~ '^[a-f0-9]{64}$'),
  CHECK(token_address <> '0x0000000000000000000000000000000000000000'),
  CHECK(treasury_address <> '0x0000000000000000000000000000000000000000'),
  UNIQUE(chain_id,token_address,treasury_address),
  CHECK(asset_id='erc20:' || chain_id || ':' || token_address)
);
CREATE TABLE orio_gas.funding_intents (
  funding_id text PRIMARY KEY CHECK (funding_id ~ '^[A-Za-z0-9:_-]{1,100}$'),
  owner_ref text NOT NULL CHECK (owner_ref ~ '^0x[0-9a-f]{40}$'),
  asset_id text NOT NULL REFERENCES orio_gas.funding_assets,
  units numeric(78,0) NOT NULL CHECK (units > 0 AND units < power(2::numeric,256)),
  authorization_digest text NOT NULL CHECK (authorization_digest ~ '^[a-f0-9]{64}$')
);
CREATE FUNCTION orio_gas.validate_funding_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE treasury text;
BEGIN
  SELECT treasury_address INTO STRICT treasury FROM orio_gas.funding_assets WHERE asset_id=NEW.asset_id;
  IF NEW.owner_ref=treasury OR NEW.owner_ref='0x0000000000000000000000000000000000000000' THEN
    RAISE EXCEPTION 'Gas prepayment requires a nonzero external customer source';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION orio_gas.validate_funding_owner() FROM PUBLIC;
CREATE TRIGGER validate_funding_owner BEFORE INSERT ON orio_gas.funding_intents
  FOR EACH ROW EXECUTE FUNCTION orio_gas.validate_funding_owner();
CREATE TABLE orio_gas.funding_receipts (
  funding_id text PRIMARY KEY REFERENCES orio_gas.funding_intents,
  external_ref text NOT NULL UNIQUE,
  evidence jsonb NOT NULL,
  journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['funding_assets','funding_intents','funding_receipts'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON orio_gas.%I FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
    EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON orio_gas.%I FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION orio_settlement.claim_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE target_consumer text; target_operation text; existing orio_settlement.receipt_claims;
BEGIN
  IF TG_TABLE_SCHEMA='orio_conversion' AND TG_TABLE_NAME='external_receipts' THEN
    target_consumer := 'conversion'; target_operation := NEW.intent_id;
  ELSIF TG_TABLE_SCHEMA='orio_redemption' AND TG_TABLE_NAME='receipts' THEN
    target_consumer := 'redemption'; target_operation := NEW.request_id;
  ELSIF TG_TABLE_SCHEMA='orio_gas' AND TG_TABLE_NAME='funding_receipts' THEN
    target_consumer := 'gas-funding'; target_operation := NEW.funding_id;
  ELSE RAISE EXCEPTION 'Unexpected settlement receipt source'; END IF;
  INSERT INTO orio_settlement.receipt_claims VALUES(NEW.external_ref,target_consumer,target_operation)
    ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT existing FROM orio_settlement.receipt_claims WHERE external_ref=NEW.external_ref;
  IF existing.consumer <> target_consumer OR existing.operation_id <> target_operation THEN
    RAISE EXCEPTION 'Finalized receipt already belongs to another operation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION orio_settlement.claim_receipt() FROM PUBLIC;
CREATE TRIGGER shared_receipt_claim BEFORE INSERT ON orio_gas.funding_receipts
  FOR EACH ROW EXECUTE FUNCTION orio_settlement.claim_receipt();

-- The owner-only adapter verifies finality and exact transfer before invoking this function.
-- Receipt, journal, prepaid liability and gas-only cash commit together. No monetary reserve use.
CREATE FUNCTION orio_gas.credit_prepayment(p_funding_id text,p_evidence jsonb)
RETURNS orio_ledger.journals LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE intent orio_gas.funding_intents; asset orio_gas.funding_assets;
  prior orio_gas.funding_receipts; claim orio_settlement.receipt_claims; result orio_ledger.journals;
  prepaid text; gas_cash text; ref text; normalized jsonb;
BEGIN
  SELECT * INTO STRICT intent FROM orio_gas.funding_intents WHERE funding_id=p_funding_id FOR UPDATE;
  SELECT * INTO STRICT asset FROM orio_gas.funding_assets WHERE asset_id=intent.asset_id;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'Invalid funding evidence'; END IF;
  ref := p_evidence->>'settlementRef';
  IF p_evidence->>'assetId' IS DISTINCT FROM 'eip155:' || asset.chain_id || '/erc20:' || asset.token_address
     OR jsonb_typeof(p_evidence->'units') IS DISTINCT FROM 'string'
     OR p_evidence->>'units' IS DISTINCT FROM intent.units::text
     OR p_evidence->>'senderAddress' IS DISTINCT FROM intent.owner_ref
     OR p_evidence->>'recipientAddress' IS DISTINCT FROM asset.treasury_address
     OR COALESCE(p_evidence->>'blockHash','') !~ '^0x[0-9a-f]{64}$'
     OR COALESCE(p_evidence->>'blockNumber','') !~ '^(0|[1-9][0-9]{0,77})$'
     OR COALESCE(ref,'') !~ ('^eip155:' || asset.chain_id || '/tx:0x[0-9a-f]{64}/log:(0|[1-9][0-9]{0,77})$') THEN
    RAISE EXCEPTION 'Funding evidence does not match immutable intent';
  END IF;
  normalized := jsonb_build_object('assetId',p_evidence->>'assetId','units',p_evidence->>'units',
    'senderAddress',p_evidence->>'senderAddress','recipientAddress',p_evidence->>'recipientAddress',
    'settlementRef',ref,'blockHash',p_evidence->>'blockHash','blockNumber',p_evidence->>'blockNumber');
  SELECT * INTO prior FROM orio_gas.funding_receipts WHERE funding_id=p_funding_id;
  IF FOUND THEN
    IF prior.evidence <> normalized THEN RAISE EXCEPTION 'Gas funding idempotency conflict'; END IF;
    SELECT * INTO STRICT result FROM orio_ledger.journals WHERE sequence=prior.journal_sequence;
    RETURN result;
  END IF;
  INSERT INTO orio_settlement.receipt_claims VALUES(ref,'gas-funding',p_funding_id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT claim FROM orio_settlement.receipt_claims WHERE external_ref=ref;
  IF claim.consumer <> 'gas-funding' OR claim.operation_id <> p_funding_id THEN
    RAISE EXCEPTION 'Finalized receipt already belongs to another operation';
  END IF;
  -- Compact JSON array encoding matches gasDigest([ownerRef,paymentAsset]) exactly.
  prepaid := 'gas_prepaid_' || encode(orio_ledger.digest(
    '[' || to_json(intent.owner_ref)::text || ',' || to_json(intent.asset_id)::text || ']','sha256'),'hex');
  gas_cash := 'gas_cash_' || encode(orio_ledger.digest(
    '[' || to_json(intent.asset_id)::text || ',' || to_json(asset.treasury_address)::text || ']','sha256'),'hex');
  PERFORM orio_ledger.create_account(prepaid,intent.asset_id,'credit',false);
  PERFORM orio_ledger.create_account(gas_cash,intent.asset_id,'debit',false);
  SELECT * INTO STRICT result FROM orio_ledger.post_journal('gas_funding:' || p_funding_id,ref,
    'Finalized segregated gas prepayment',jsonb_build_array(
      jsonb_build_object('accountId',gas_cash,'side','debit','units',intent.units::text),
      jsonb_build_object('accountId',prepaid,'side','credit','units',intent.units::text)));
  INSERT INTO orio_gas.funding_receipts VALUES(p_funding_id,ref,normalized,result.sequence);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION orio_gas.credit_prepayment(text,jsonb) FROM PUBLIC;
COMMIT;
