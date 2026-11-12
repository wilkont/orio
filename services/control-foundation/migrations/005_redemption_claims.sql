BEGIN;
CREATE SCHEMA orio_redemption;
REVOKE ALL ON SCHEMA orio_redemption FROM PUBLIC;
CREATE TABLE orio_redemption.requests (
 request_id text PRIMARY KEY CHECK(length(btrim(request_id))>0),
 owner_ref text NOT NULL CHECK(length(btrim(owner_ref))>0),
 token_asset_id text NOT NULL CHECK(length(btrim(token_asset_id))>0),
 token_units text NOT NULL CHECK(token_units ~ '^[1-9][0-9]{0,77}$'),
 payout_asset_id text NOT NULL CHECK(length(btrim(payout_asset_id))>0),
 payout_units text NOT NULL CHECK(payout_units ~ '^[1-9][0-9]{0,77}$'),
 recipient_ref text NOT NULL CHECK(length(btrim(recipient_ref))>0),
 election_id text NOT NULL REFERENCES orio_master.elections,
 quote_digest text NOT NULL CHECK(quote_digest ~ '^[0-9a-f]{64}$'),
 quote_expires_at timestamptz NOT NULL CHECK(isfinite(quote_expires_at))
);
CREATE TABLE orio_redemption.events (
 event_id text PRIMARY KEY CHECK(length(btrim(event_id))>0),
 request_id text NOT NULL REFERENCES orio_redemption.requests,
 expected_version bigint NOT NULL CHECK(expected_version>=0),
 kind text NOT NULL, evidence jsonb NOT NULL,
 resulting_state text NOT NULL, resulting_version bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,resulting_version)
);
CREATE TABLE orio_redemption.receipts (
 external_ref text PRIMARY KEY CHECK(length(btrim(external_ref))>0),
 request_id text NOT NULL REFERENCES orio_redemption.requests,
 kind text NOT NULL
);
CREATE TRIGGER immutable_requests BEFORE UPDATE OR DELETE ON orio_redemption.requests
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_requests_truncate BEFORE TRUNCATE ON orio_redemption.requests
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON orio_redemption.events
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_events_truncate BEFORE TRUNCATE ON orio_redemption.events
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON orio_redemption.receipts
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_receipts_truncate BEFORE TRUNCATE ON orio_redemption.receipts
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();

CREATE FUNCTION orio_redemption.record_event(p_event_id text,p_request_id text,p_version bigint,p_kind text,p_evidence jsonb)
RETURNS orio_redemption.events LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
 req orio_redemption.requests;
 prior orio_redemption.events;
 result orio_redemption.events;
 state text := 'REQUESTED'; version bigint := 0; next_state text;
 elected text; master_state text; master_asset text;
 receipt text; receipt_kind text;
BEGIN
 SELECT * INTO STRICT req FROM orio_redemption.requests WHERE request_id=p_request_id FOR UPDATE;
 SELECT * INTO prior FROM orio_redemption.events WHERE event_id=p_event_id;
 IF FOUND THEN
   IF prior.request_id IS DISTINCT FROM p_request_id OR prior.expected_version IS DISTINCT FROM p_version
      OR prior.kind IS DISTINCT FROM p_kind OR prior.evidence IS DISTINCT FROM p_evidence THEN
     RAISE EXCEPTION 'Redemption event idempotency conflict';
   END IF;
   RETURN prior;
 END IF;
 SELECT resulting_state,resulting_version INTO state,version FROM orio_redemption.events
   WHERE request_id=p_request_id ORDER BY resulting_version DESC LIMIT 1;
 IF NOT FOUND THEN state := 'REQUESTED'; version := 0; END IF;
 IF version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Redemption version changed'; END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
    OR p_evidence->'requestId' IS DISTINCT FROM to_jsonb(p_request_id)
    OR p_evidence->'electionId' IS DISTINCT FROM to_jsonb(req.election_id)
    OR jsonb_typeof(p_evidence->'digest') IS DISTINCT FROM 'string'
    OR COALESCE(p_evidence->>'digest','') !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Missing independently verified redemption evidence';
 END IF;
 IF p_kind='CLAIM_VERIFIED' AND state='REQUESTED' THEN
   IF p_evidence->'ownerRef' IS DISTINCT FROM to_jsonb(req.owner_ref)
      OR p_evidence->'tokenAssetId' IS DISTINCT FROM to_jsonb(req.token_asset_id)
      OR p_evidence->'tokenUnits' IS DISTINCT FROM to_jsonb(req.token_units) THEN
     RAISE EXCEPTION 'Claim does not match redemption request';
   END IF;
   receipt := p_evidence->>'claimRef'; receipt_kind := 'CLAIM'; next_state := 'CLAIM_VERIFIED';
 ELSIF p_kind='SETTLEMENT_PREPARED' AND state='CLAIM_VERIFIED' THEN
   SELECT c.election_id,c.state,e.asset_id INTO elected,master_state,master_asset
     FROM orio_master.current_election c JOIN orio_master.elections e USING(election_id)
     WHERE c.singleton FOR SHARE OF c;
   IF elected IS DISTINCT FROM req.election_id OR master_state IS DISTINCT FROM 'ACTIVE_MASTER'
      OR master_asset IS DISTINCT FROM req.payout_asset_id THEN
     RAISE EXCEPTION 'Redemption election unavailable or changed';
   END IF;
   IF req.quote_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Redemption quote expired'; END IF;
   IF p_evidence->'quoteDigest' IS DISTINCT FROM to_jsonb(req.quote_digest)
      OR p_evidence->'recipientRef' IS DISTINCT FROM to_jsonb(req.recipient_ref)
      OR p_evidence->'payoutAssetId' IS DISTINCT FROM to_jsonb(req.payout_asset_id)
      OR p_evidence->'payoutUnits' IS DISTINCT FROM to_jsonb(req.payout_units) THEN
     RAISE EXCEPTION 'Prepared settlement differs from approved request';
   END IF;
   next_state := 'SETTLEMENT_PENDING';
 ELSIF p_kind='EXECUTION_UNCERTAIN' AND state='SETTLEMENT_PENDING' THEN
   next_state := 'REVIEW_REQUIRED';
 ELSIF p_kind='SETTLEMENT_CONFIRMED' AND state IN ('SETTLEMENT_PENDING','REVIEW_REQUIRED') THEN
   -- Record authenticated historical finality even if election subsequently changed.
   -- This is not permission for a new payout after expiry or a change of election.
   IF p_evidence->'ownerRef' IS DISTINCT FROM to_jsonb(req.owner_ref)
      OR p_evidence->'tokenAssetId' IS DISTINCT FROM to_jsonb(req.token_asset_id)
      OR p_evidence->'tokenUnits' IS DISTINCT FROM to_jsonb(req.token_units)
      OR p_evidence->'recipientRef' IS DISTINCT FROM to_jsonb(req.recipient_ref)
      OR p_evidence->'payoutAssetId' IS DISTINCT FROM to_jsonb(req.payout_asset_id)
      OR p_evidence->'payoutUnits' IS DISTINCT FROM to_jsonb(req.payout_units) THEN
     RAISE EXCEPTION 'Final settlement does not discharge exact claim';
   END IF;
   FOREACH receipt_kind IN ARRAY ARRAY['burnRef','payoutRef'] LOOP
     receipt := p_evidence->>receipt_kind;
     IF jsonb_typeof(p_evidence->receipt_kind) IS DISTINCT FROM 'string' OR length(btrim(receipt))=0 THEN
       RAISE EXCEPTION 'Missing finalized burn or payout reference';
     END IF;
     INSERT INTO orio_redemption.receipts VALUES(receipt,p_request_id,receipt_kind);
   END LOOP;
   receipt := NULL; next_state := 'SETTLED';
 ELSE RAISE EXCEPTION 'Invalid redemption transition';
 END IF;
 IF receipt_kind='CLAIM' THEN
   IF jsonb_typeof(p_evidence->'claimRef') IS DISTINCT FROM 'string' OR length(btrim(receipt))=0 THEN
     RAISE EXCEPTION 'Missing independently verified claim reference';
   END IF;
   INSERT INTO orio_redemption.receipts VALUES(receipt,p_request_id,receipt_kind);
 END IF;
 INSERT INTO orio_redemption.events(event_id,request_id,expected_version,kind,evidence,resulting_state,resulting_version)
   VALUES(p_event_id,p_request_id,p_version,p_kind,p_evidence,next_state,version+1) RETURNING * INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION orio_redemption.record_event(text,text,bigint,text,jsonb) FROM PUBLIC;
COMMIT;
