BEGIN;
CREATE SCHEMA orio_conversion;
REVOKE ALL ON SCHEMA orio_conversion FROM PUBLIC;

CREATE TABLE orio_conversion.entries (
  intent_id text PRIMARY KEY CHECK (length(btrim(intent_id)) > 0),
  owner_ref text NOT NULL CHECK (length(btrim(owner_ref)) > 0),
  source_asset_id text NOT NULL CHECK (length(btrim(source_asset_id)) > 0),
  source_units text NOT NULL CHECK (source_units ~ '^[1-9][0-9]{0,77}$'),
  election_id text NOT NULL REFERENCES orio_master.elections,
  reserve_vault_id text NOT NULL CHECK (length(btrim(reserve_vault_id)) > 0),
  minimum_master_units text NOT NULL CHECK (minimum_master_units ~ '^[1-9][0-9]{0,77}$'),
  quote_digest text NOT NULL CHECK (quote_digest ~ '^[0-9a-f]{64}$'),
  quote_expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'REQUESTED' CHECK (state IN
    ('REQUESTED','FUNDED','CONVERTING','MASTER_RECEIVED','REFUND_DUE','REFUNDED')),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE orio_conversion.events (
  event_id text PRIMARY KEY CHECK (length(btrim(event_id)) > 0),
  intent_id text NOT NULL REFERENCES orio_conversion.entries,
  expected_version bigint NOT NULL,
  kind text NOT NULL,
  evidence jsonb NOT NULL,
  resulting_state text NOT NULL,
  resulting_version bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (intent_id, resulting_version)
);

CREATE TABLE orio_conversion.external_receipts (
  external_ref text PRIMARY KEY CHECK (length(btrim(external_ref)) > 0),
  intent_id text NOT NULL REFERENCES orio_conversion.entries,
  kind text NOT NULL
);

CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON orio_conversion.events
  FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_events_truncate BEFORE TRUNCATE ON orio_conversion.events
  FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON orio_conversion.external_receipts
  FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_receipts_truncate BEFORE TRUNCATE ON orio_conversion.external_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();

-- Owner-only control recording boundary. Independent adapters must authenticate
-- intent ownership, quote approval, finality, asset custody and failure evidence.
CREATE FUNCTION orio_conversion.record_event(
  p_event_id text, p_intent_id text, p_expected_version bigint,
  p_kind text, p_evidence jsonb
) RETURNS orio_conversion.events
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  entry orio_conversion.entries;
  prior orio_conversion.events;
  result orio_conversion.events;
  master_asset text;
  master_election text;
  master_state text;
  next_state text;
  claimed_intent text;
  claimed_kind text;
  receipt_ref text;
BEGIN
  SELECT * INTO STRICT entry FROM orio_conversion.entries
    WHERE intent_id = p_intent_id FOR UPDATE;
  SELECT * INTO prior FROM orio_conversion.events WHERE event_id = p_event_id;
  IF FOUND THEN
    IF prior.intent_id <> p_intent_id OR prior.expected_version IS DISTINCT FROM p_expected_version
       OR prior.kind IS DISTINCT FROM p_kind OR prior.evidence IS DISTINCT FROM p_evidence THEN
      RAISE EXCEPTION 'Conversion event idempotency conflict';
    END IF;
    RETURN prior;
  END IF;
  IF entry.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Conversion intent version changed';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object'
     OR jsonb_typeof(p_evidence->'intentId') IS DISTINCT FROM 'string'
     OR p_evidence->>'intentId' IS DISTINCT FROM p_intent_id
     OR jsonb_typeof(p_evidence->'digest') IS DISTINCT FROM 'string'
     OR COALESCE(p_evidence->>'digest','') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Missing verified conversion evidence';
  END IF;

  IF p_kind = 'DEPOSIT_CONFIRMED' AND entry.state = 'REQUESTED' THEN
    IF jsonb_typeof(p_evidence->'units') IS DISTINCT FROM 'string'
       OR p_evidence->>'assetId' IS DISTINCT FROM entry.source_asset_id
       OR p_evidence->>'units' IS DISTINCT FROM entry.source_units THEN
      RAISE EXCEPTION 'Deposit does not match entry intent';
    END IF;
    next_state := 'FUNDED';
  ELSIF p_kind = 'CONVERSION_STARTED' AND entry.state = 'FUNDED' THEN
    IF entry.quote_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'Conversion quote expired';
    END IF;
    SELECT c.election_id, c.state INTO master_election, master_state
      FROM orio_master.current_election c WHERE c.singleton FOR SHARE;
    IF master_election IS DISTINCT FROM entry.election_id OR master_state IS DISTINCT FROM 'ACTIVE_MASTER' THEN
      RAISE EXCEPTION 'Master election is unavailable or changed';
    END IF;
    next_state := 'CONVERTING';
  ELSIF p_kind = 'MASTER_RECEIVED' AND entry.state IN ('FUNDED','CONVERTING') THEN
    SELECT c.election_id, c.state, e.asset_id INTO master_election, master_state, master_asset
      FROM orio_master.current_election c JOIN orio_master.elections e USING (election_id)
      WHERE c.singleton FOR SHARE OF c;
    IF master_election IS DISTINCT FROM entry.election_id OR master_state IS DISTINCT FROM 'ACTIVE_MASTER' THEN
      RAISE EXCEPTION 'Master election is unavailable or changed';
    END IF;
    IF entry.state = 'FUNDED' AND entry.source_asset_id <> master_asset THEN
      RAISE EXCEPTION 'Secondary deposit requires conversion';
    END IF;
    IF p_evidence->>'assetId' IS DISTINCT FROM master_asset
       OR p_evidence->>'vaultId' IS DISTINCT FROM entry.reserve_vault_id
       OR jsonb_typeof(p_evidence->'units') IS DISTINCT FROM 'string'
       OR COALESCE(p_evidence->>'units','') !~ '^[1-9][0-9]{0,77}$' THEN
      RAISE EXCEPTION 'Invalid canonical master receipt';
    END IF;
    IF (p_evidence->>'units')::numeric < entry.minimum_master_units::numeric THEN
      RAISE EXCEPTION 'Master receipt is below quoted minimum';
    END IF;
    IF entry.state = 'FUNDED' AND p_evidence->>'units' <> entry.source_units THEN
      RAISE EXCEPTION 'Direct master receipt differs from deposit';
    END IF;
    next_state := 'MASTER_RECEIVED';
  ELSIF p_kind = 'CONVERSION_FAILED' AND entry.state IN ('FUNDED','CONVERTING') THEN
    -- Record a source-denominated refund claim. This event requires verified
    -- evidence that source assets remain refundable. Uncertain executions
    -- must stay CONVERTING while the adapter investigates custody.
    IF jsonb_typeof(p_evidence->'refundableUnits') IS DISTINCT FROM 'string'
       OR p_evidence->>'refundableAssetId' IS DISTINCT FROM entry.source_asset_id
       OR p_evidence->>'refundableUnits' IS DISTINCT FROM entry.source_units THEN
      RAISE EXCEPTION 'Failure must preserve the source refund claim';
    END IF;
    next_state := 'REFUND_DUE';
  ELSIF p_kind = 'REFUND_CONFIRMED' AND entry.state = 'REFUND_DUE' THEN
    IF jsonb_typeof(p_evidence->'units') IS DISTINCT FROM 'string'
       OR p_evidence->>'assetId' IS DISTINCT FROM entry.source_asset_id
       OR p_evidence->>'units' IS DISTINCT FROM entry.source_units
       OR p_evidence->>'ownerRef' IS DISTINCT FROM entry.owner_ref THEN
      RAISE EXCEPTION 'Refund does not discharge the recorded claim';
    END IF;
    next_state := 'REFUNDED';
  ELSE
    RAISE EXCEPTION 'Invalid conversion transition';
  END IF;

  IF p_kind IN ('DEPOSIT_CONFIRMED','MASTER_RECEIVED','REFUND_CONFIRMED') THEN
    receipt_ref := p_evidence->>'externalRef';
    IF jsonb_typeof(p_evidence->'externalRef') IS DISTINCT FROM 'string'
       OR receipt_ref IS NULL OR length(btrim(receipt_ref)) = 0 THEN
      RAISE EXCEPTION 'Missing finalized settlement reference';
    END IF;
    INSERT INTO orio_conversion.external_receipts VALUES (receipt_ref, p_intent_id, p_kind)
      ON CONFLICT DO NOTHING;
    SELECT intent_id, kind INTO STRICT claimed_intent, claimed_kind FROM orio_conversion.external_receipts
      WHERE orio_conversion.external_receipts.external_ref = receipt_ref;
    IF claimed_intent <> p_intent_id THEN
      RAISE EXCEPTION 'Settlement reference already belongs to another intent';
    END IF;
    IF NOT (claimed_kind = p_kind OR
       (claimed_kind = 'DEPOSIT_CONFIRMED' AND p_kind = 'MASTER_RECEIVED'
        AND entry.state = 'FUNDED' AND entry.source_asset_id = master_asset)) THEN
      RAISE EXCEPTION 'Settlement reference cannot discharge another operation';
    END IF;
  END IF;

  UPDATE orio_conversion.entries SET state = next_state, version = version + 1
    WHERE intent_id = p_intent_id;
  INSERT INTO orio_conversion.events
    (event_id,intent_id,expected_version,kind,evidence,resulting_state,resulting_version)
    VALUES (p_event_id,p_intent_id,p_expected_version,p_kind,p_evidence,next_state,entry.version + 1)
    RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION orio_conversion.record_event(text,text,bigint,text,jsonb) FROM PUBLIC;
COMMIT;
