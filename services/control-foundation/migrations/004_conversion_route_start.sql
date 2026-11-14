BEGIN;
-- Local-only additive hardening. No live routes are seeded or permissions granted.
CREATE TABLE orio_conversion.eligible_routes (
  provider_id text NOT NULL CHECK (length(btrim(provider_id)) > 0),
  route_id text NOT NULL CHECK (length(btrim(route_id)) > 0),
  source_asset_id text NOT NULL,
  master_asset_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (provider_id, route_id, source_asset_id, master_asset_id)
);
REVOKE ALL ON orio_conversion.eligible_routes FROM PUBLIC;

CREATE FUNCTION orio_conversion.check_route_start() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  entry orio_conversion.entries;
  q jsonb;
  lim jsonb;
  evidence jsonb;
  binding jsonb;
  field text;
  elected text;
  asset text;
  master_state text;
  allowed boolean;
  checked_at numeric;
  issued numeric;
  expires numeric;
BEGIN
  IF NEW.kind <> 'CONVERSION_STARTED' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT entry FROM orio_conversion.entries WHERE intent_id=NEW.intent_id FOR UPDATE;
  IF entry.state <> 'CONVERTING' OR entry.version <> NEW.expected_version + 1
     OR NEW.resulting_state <> 'CONVERTING' OR NEW.resulting_version <> entry.version THEN
    RAISE EXCEPTION 'Route start must be an atomic funded transition';
  END IF;
  SELECT c.election_id,c.state,e.asset_id INTO elected,master_state,asset
    FROM orio_master.current_election c JOIN orio_master.elections e USING(election_id)
    WHERE c.singleton FOR SHARE OF c;
  IF elected IS DISTINCT FROM entry.election_id OR master_state IS DISTINCT FROM 'ACTIVE_MASTER' THEN
    RAISE EXCEPTION 'Route master election changed or unavailable';
  END IF;
  q := NEW.evidence->'quote'; lim := NEW.evidence->'independent';
  IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR jsonb_typeof(lim) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Missing authenticated route and independent evidence';
  END IF;
  binding := jsonb_build_object('intentId',entry.intent_id,'sourceAssetId',entry.source_asset_id,
    'sourceUnits',entry.source_units,'masterAssetId',asset,'electionId',entry.election_id,
    'reserveVaultId',entry.reserve_vault_id);
  FOREACH field IN ARRAY ARRAY['intentId','sourceAssetId','sourceUnits','masterAssetId','electionId','reserveVaultId'] LOOP
    IF q->field IS DISTINCT FROM binding->field OR lim->field IS DISTINCT FROM binding->field THEN
      RAISE EXCEPTION 'Route evidence binding mismatch';
    END IF;
  END LOOP;
  IF jsonb_typeof(q->'providerId') IS DISTINCT FROM 'string' OR jsonb_typeof(q->'routeId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Missing route identity';
  END IF;
  SELECT enabled INTO allowed FROM orio_conversion.eligible_routes
    WHERE provider_id=q->>'providerId' AND route_id=q->>'routeId'
      AND source_asset_id=entry.source_asset_id AND master_asset_id=asset FOR SHARE;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Route not eligible'; END IF;
  -- All potentially blocking entry, election and route locks are held before time checks.
  checked_at := extract(epoch FROM clock_timestamp()) * 1000;
  IF entry.quote_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Stored quote expired'; END IF;
  IF q->'quoteDigest' IS DISTINCT FROM to_jsonb(entry.quote_digest)
     OR q->'minimumMasterUnits' IS DISTINCT FROM to_jsonb(entry.minimum_master_units) THEN
    RAISE EXCEPTION 'Route quote differs from persisted intent';
  END IF;
  IF jsonb_typeof(lim->'evidenceDigest') IS DISTINCT FROM 'string'
     OR COALESCE(lim->>'evidenceDigest','') !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(lim->'minimumMasterUnits') IS DISTINCT FROM 'string'
     OR COALESCE(lim->>'minimumMasterUnits','') !~ '^[1-9][0-9]{0,77}$' THEN
    RAISE EXCEPTION 'Invalid independent route limit';
  END IF;
  FOREACH evidence IN ARRAY ARRAY[q,lim] LOOP
    FOREACH field IN ARRAY ARRAY['issuedAtMs','expiresAtMs'] LOOP
      IF jsonb_typeof(evidence->field) IS DISTINCT FROM 'number'
         OR COALESCE(evidence->>field,'') !~ '^(0|[1-9][0-9]{0,15})$'
         OR (evidence->>field)::numeric > 9007199254740991 THEN
        RAISE EXCEPTION 'Invalid route evidence clock';
      END IF;
    END LOOP;
    issued := (evidence->>'issuedAtMs')::numeric; expires := (evidence->>'expiresAtMs')::numeric;
    IF issued > checked_at OR expires <= checked_at OR issued >= expires THEN
      RAISE EXCEPTION 'Route evidence expired or future dated';
    END IF;
  END LOOP;
  IF (q->>'expiresAtMs')::numeric IS DISTINCT FROM extract(epoch FROM entry.quote_expires_at)*1000 THEN
    RAISE EXCEPTION 'Route expiry differs from persisted intent';
  END IF;
  IF entry.minimum_master_units::numeric < (lim->>'minimumMasterUnits')::numeric THEN
    RAISE EXCEPTION 'Route proceeds below independent minimum';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION orio_conversion.check_route_start() FROM PUBLIC;
CREATE TRIGGER validate_route_start BEFORE INSERT ON orio_conversion.events
  FOR EACH ROW EXECUTE FUNCTION orio_conversion.check_route_start();
-- This entry point exists only with the authoritative guard installed.
CREATE FUNCTION orio_conversion.record_route_start(
  p_event_id text, p_expected_version bigint, p_quote jsonb, p_independent jsonb
) RETURNS orio_conversion.events
LANGUAGE sql SET search_path = pg_catalog AS $$
  SELECT orio_conversion.record_event(p_event_id,p_quote->>'intentId',p_expected_version,
    'CONVERSION_STARTED',jsonb_build_object('intentId',p_quote->>'intentId',
      'digest',p_quote->>'quoteDigest','quote',p_quote,'independent',p_independent));
$$;
REVOKE ALL ON FUNCTION orio_conversion.record_route_start(text,bigint,jsonb,jsonb) FROM PUBLIC;
COMMIT;
