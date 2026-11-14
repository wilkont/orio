BEGIN;

CREATE SCHEMA orio_master;
REVOKE ALL ON SCHEMA orio_master FROM PUBLIC;

CREATE TABLE orio_master.assets (
  asset_id text PRIMARY KEY CHECK (length(btrim(asset_id)) > 0),
  issuer text NOT NULL CHECK (length(btrim(issuer)) > 0),
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  token_address text NOT NULL CHECK (token_address ~ '^0x[0-9a-f]{40}$' AND token_address <> '0x0000000000000000000000000000000000000000'),
  decimals smallint NOT NULL CHECK (decimals BETWEEN 0 AND 77),
  valuation_policy text NOT NULL CHECK (length(btrim(valuation_policy)) > 0),
  liquidity_policy text NOT NULL CHECK (length(btrim(liquidity_policy)) > 0),
  redemption_policy text NOT NULL CHECK (length(btrim(redemption_policy)) > 0),
  risk_class text NOT NULL CHECK (length(btrim(risk_class)) > 0),
  eligibility_evidence text NOT NULL CHECK (eligibility_evidence ~ '^[0-9a-f]{64}$'),
  UNIQUE (chain_id, token_address)
);

CREATE TABLE orio_master.elections (
  election_id text PRIMARY KEY CHECK (length(btrim(election_id)) > 0),
  asset_id text NOT NULL REFERENCES orio_master.assets,
  predecessor text UNIQUE REFERENCES orio_master.elections,
  approval_digest text NOT NULL CHECK (approval_digest ~ '^[0-9a-f]{64}$'),
  activation_evidence text NOT NULL CHECK (activation_evidence ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE orio_master.current_election (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  election_id text UNIQUE REFERENCES orio_master.elections,
  state text NOT NULL DEFAULT 'DEPOSIT_PAUSED'
    CHECK (state IN ('ACTIVE_MASTER', 'MIGRATING', 'DEPOSIT_PAUSED', 'QUARANTINED')),
  CHECK (election_id IS NOT NULL OR state = 'DEPOSIT_PAUSED')
);

INSERT INTO orio_master.current_election DEFAULT VALUES;

-- The schema owner is the only configured caller. Approval and activation
-- digests must already have been verified against independent evidence.
CREATE FUNCTION orio_master.activate(
  expected_election text,
  new_election text,
  new_asset text,
  approval text,
  evidence text
) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  previous text;
  previous_state text;
BEGIN
  SELECT election_id, state INTO STRICT previous, previous_state
    FROM orio_master.current_election WHERE singleton FOR UPDATE;

  IF previous IS DISTINCT FROM expected_election THEN
    RAISE EXCEPTION 'Master election changed';
  END IF;
  IF previous IS NOT NULL AND previous_state <> 'MIGRATING' THEN
    RAISE EXCEPTION 'Replacement requires migration state';
  END IF;
  IF EXISTS (SELECT 1 FROM orio_master.elections
             WHERE election_id = previous AND asset_id = new_asset) THEN
    RAISE EXCEPTION 'Replacement must use a different asset';
  END IF;

  INSERT INTO orio_master.elections (election_id, asset_id, predecessor, approval_digest, activation_evidence)
    VALUES (new_election, new_asset, previous, approval, evidence);
  UPDATE orio_master.current_election SET election_id = new_election, state = 'ACTIVE_MASTER'
    WHERE singleton;
END;
$$;

REVOKE ALL ON FUNCTION orio_master.activate(text, text, text, text, text) FROM PUBLIC;
COMMIT;
