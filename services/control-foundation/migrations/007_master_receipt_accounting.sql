BEGIN;
CREATE TABLE orio_settlement.entry_journals (
  intent_id text PRIMARY KEY REFERENCES orio_conversion.entries,
  event_id text NOT NULL UNIQUE REFERENCES orio_conversion.events,
  expected_version bigint NOT NULL,
  external_ref text NOT NULL UNIQUE REFERENCES orio_settlement.receipt_claims,
  journal_sequence bigint NOT NULL UNIQUE REFERENCES orio_ledger.journals
);
CREATE TRIGGER immutable_entry_journals BEFORE UPDATE OR DELETE ON orio_settlement.entry_journals
  FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_entry_journals_truncate BEFORE TRUNCATE ON orio_settlement.entry_journals
  FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();

-- Owner-only historical reserve bookkeeping, not an authorization to mint or transfer.
CREATE FUNCTION orio_settlement.credit_entry_master(p_intent_id text,p_expected_version bigint)
RETURNS orio_ledger.journals LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  entry orio_conversion.entries;
  receipt orio_conversion.events;
  asset orio_master.assets;
  link orio_settlement.entry_journals;
  claim orio_settlement.receipt_claims;
  result orio_ledger.journals;
  asset_unit text;
  reserve_account text;
  customer_account text;
  journal_key text;
  receipt_ref text;
  received_units text;
BEGIN
  SELECT * INTO STRICT entry FROM orio_conversion.entries WHERE intent_id=p_intent_id FOR UPDATE;
  IF entry.version IS DISTINCT FROM p_expected_version OR entry.state <> 'MASTER_RECEIVED' THEN
    RAISE EXCEPTION 'Entry is not a current verified master receipt';
  END IF;
  SELECT * INTO link FROM orio_settlement.entry_journals WHERE intent_id=p_intent_id;
  IF FOUND THEN
    IF link.expected_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Entry accounting idempotency conflict';
    END IF;
    SELECT * INTO STRICT result FROM orio_ledger.journals WHERE sequence=link.journal_sequence;
    RETURN result;
  END IF;
  SELECT * INTO STRICT receipt FROM orio_conversion.events
    WHERE intent_id=p_intent_id AND kind='MASTER_RECEIVED' AND resulting_version=p_expected_version;
  receipt_ref := receipt.evidence->>'externalRef';
  received_units := receipt.evidence->>'units';
  SELECT * INTO STRICT claim FROM orio_settlement.receipt_claims
    WHERE orio_settlement.receipt_claims.external_ref=receipt_ref;
  IF claim.consumer <> 'conversion' OR claim.operation_id <> p_intent_id THEN
    RAISE EXCEPTION 'Master receipt belongs to another operation';
  END IF;
  SELECT a.* INTO STRICT asset FROM orio_master.assets a JOIN orio_master.elections e USING(asset_id)
    WHERE e.election_id=entry.election_id;
  IF receipt.evidence->>'assetId' IS DISTINCT FROM asset.asset_id
     OR receipt.evidence->>'vaultId' IS DISTINCT FROM entry.reserve_vault_id
     OR jsonb_typeof(receipt.evidence->'units') IS DISTINCT FROM 'string'
     OR COALESCE(received_units,'') !~ '^[1-9][0-9]{0,77}$' THEN
    RAISE EXCEPTION 'Invalid master credit evidence';
  END IF;
  asset_unit := 'erc20:' || asset.chain_id::text || ':' || asset.token_address;
  reserve_account := 'reserve_' || encode(orio_ledger.digest(
    jsonb_build_array(asset.asset_id,entry.reserve_vault_id)::text,'sha256'),'hex');
  customer_account := 'customer_' || encode(orio_ledger.digest(
    jsonb_build_array(asset.asset_id,entry.owner_ref)::text,'sha256'),'hex');
  journal_key := 'entry_master:' || encode(orio_ledger.digest(p_intent_id,'sha256'),'hex');
  PERFORM orio_ledger.create_account(reserve_account,asset_unit,'debit',false);
  PERFORM orio_ledger.create_account(customer_account,asset_unit,'credit',false);
  SELECT * INTO STRICT result FROM orio_ledger.post_journal(journal_key,receipt_ref,
    'Verified master asset receipt and customer claim',
    jsonb_build_array(
      jsonb_build_object('accountId',reserve_account,'side','debit','units',received_units),
      jsonb_build_object('accountId',customer_account,'side','credit','units',received_units)
    ));
  INSERT INTO orio_settlement.entry_journals
    VALUES(p_intent_id,receipt.event_id,p_expected_version,receipt_ref,result.sequence);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION orio_settlement.credit_entry_master(text,bigint) FROM PUBLIC;
COMMIT;
