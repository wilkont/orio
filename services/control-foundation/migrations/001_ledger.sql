-- Run once using a migration identity in a dedicated ORIO database.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE SCHEMA orio_ledger;
CREATE EXTENSION pgcrypto WITH SCHEMA orio_ledger;
DO $$ DECLARE runtime_role pg_roles; BEGIN
  IF current_user='orio_ledger_runtime' THEN
    RAISE EXCEPTION 'Migration owner must be distinct from runtime role';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orio_ledger_runtime') THEN
    CREATE ROLE orio_ledger_runtime NOLOGIN;
  END IF;
  SELECT * INTO STRICT runtime_role FROM pg_roles WHERE rolname='orio_ledger_runtime';
  IF runtime_role.rolsuper OR runtime_role.rolcreaterole OR runtime_role.rolcreatedb
      OR runtime_role.rolreplication OR runtime_role.rolbypassrls OR runtime_role.rolcanlogin
      OR EXISTS (SELECT FROM pg_auth_members WHERE member=runtime_role.oid)
      OR EXISTS (SELECT FROM pg_database WHERE datname=current_database() AND datdba=runtime_role.oid) THEN
    RAISE EXCEPTION 'Existing runtime role has unexpected privileges, memberships, or ownership';
  END IF;
END $$;
REVOKE ALL ON SCHEMA orio_ledger FROM PUBLIC;

CREATE TABLE orio_ledger.accounts (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9:_-]{0,99}$'),
  asset text NOT NULL CHECK (asset ~ '^[A-Za-z0-9:_-]{1,100}$'),
  normal_side text NOT NULL CHECK (normal_side IN ('debit','credit')),
  allow_negative boolean NOT NULL DEFAULT false
);
CREATE TABLE orio_ledger.chain_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  sequence bigint NOT NULL,
  event_hash text NOT NULL
);
INSERT INTO orio_ledger.chain_head VALUES (true,0,repeat('0',64));
CREATE TABLE orio_ledger.journals (
  sequence bigint PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  external_ref text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  account_snapshot jsonb NOT NULL,
  request_hash text NOT NULL,
  header jsonb NOT NULL,
  event_hash text NOT NULL UNIQUE
);
CREATE TABLE orio_ledger.postings (
  journal_sequence bigint NOT NULL REFERENCES orio_ledger.journals(sequence),
  account_id text NOT NULL REFERENCES orio_ledger.accounts(id),
  side text NOT NULL CHECK (side IN ('debit','credit')),
  units numeric(78,0) NOT NULL CHECK (units > 0),
  PRIMARY KEY (journal_sequence,account_id)
);
CREATE INDEX postings_account ON orio_ledger.postings(account_id,journal_sequence);
CREATE TABLE orio_ledger.outbox (
  journal_sequence bigint PRIMARY KEY REFERENCES orio_ledger.journals(sequence),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  token uuid,
  leased_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  dead_letter_at timestamptz
);

CREATE FUNCTION orio_ledger.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,orio_ledger AS $$
BEGIN RAISE EXCEPTION 'Accounting records are append-only'; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','journals','postings'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON orio_ledger.%I FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
    EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON orio_ledger.%I FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation()',t);
  END LOOP;
END $$;

CREATE FUNCTION orio_ledger.create_account(p_id text,p_asset text,p_side text,p_negative boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,orio_ledger AS $$
DECLARE existing orio_ledger.accounts;
BEGIN
  IF p_id IS NULL OR p_asset IS NULL OR p_side IS NULL OR p_negative IS NULL THEN
    RAISE EXCEPTION 'Account fields are required';
  END IF;
  INSERT INTO orio_ledger.accounts VALUES(p_id,p_asset,p_side,p_negative) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT existing FROM orio_ledger.accounts WHERE id=p_id;
  IF existing.asset <> p_asset OR existing.normal_side <> p_side OR existing.allow_negative <> p_negative THEN
    RAISE EXCEPTION 'Account definition conflict';
  END IF;
END $$;

CREATE FUNCTION orio_ledger.post_journal(p_key text,p_ref text,p_description text,p_postings jsonb)
RETURNS orio_ledger.journals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,orio_ledger AS $$
DECLARE
  head orio_ledger.chain_head;
  prior orio_ledger.journals;
  result orio_ledger.journals;
  normalized jsonb;
  request jsonb;
  req_hash text;
  account_snapshot jsonb;
  event_header jsonb;
  seq bigint;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9:_./-]{1,200}$'
     OR p_ref IS NULL OR p_ref !~ '^[A-Za-z0-9:_./-]{1,200}$'
     OR p_description IS NULL OR length(p_description) NOT BETWEEN 1 AND 500
     OR p_postings IS NULL OR jsonb_typeof(p_postings) <> 'array' THEN
    RAISE EXCEPTION 'Invalid journal fields';
  END IF;
  IF jsonb_array_length(p_postings) NOT BETWEEN 2 AND 128 THEN
    RAISE EXCEPTION 'Journal requires 2 to 128 postings';
  END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(p_postings) x WHERE jsonb_typeof(x) <> 'object') THEN
    RAISE EXCEPTION 'Postings must be objects';
  END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(p_postings) x
      WHERE (SELECT count(*) FROM jsonb_object_keys(x)) <> 3
        OR jsonb_typeof(x->'accountId') IS DISTINCT FROM 'string'
        OR jsonb_typeof(x->'side') IS DISTINCT FROM 'string'
        OR jsonb_typeof(x->'units') IS DISTINCT FROM 'string'
        OR (x->>'accountId') !~ '^[a-z][a-z0-9:_-]{0,99}$'
        OR (x->>'side') NOT IN ('debit','credit')
        OR (x->>'units') !~ '^[1-9][0-9]{0,77}$') THEN
    RAISE EXCEPTION 'Invalid posting; integer strings required';
  END IF;
  IF (SELECT count(DISTINCT x->>'accountId') FROM jsonb_array_elements(p_postings) x) <> jsonb_array_length(p_postings) THEN
    RAISE EXCEPTION 'Duplicate account in journal';
  END IF;
  SELECT jsonb_agg(x ORDER BY x->>'accountId') INTO normalized FROM jsonb_array_elements(p_postings) x;
  request := jsonb_build_object('schemaVersion',1,'idempotencyKey',p_key,'externalRef',p_ref,'description',p_description,'postings',normalized);
  req_hash := encode(orio_ledger.digest(convert_to(request::text,'UTF8'),'sha256'),'hex');

  -- One database row serializes accounting writes and protects balance checks.
  SELECT * INTO STRICT head FROM orio_ledger.chain_head WHERE singleton FOR UPDATE;
  SELECT * INTO prior FROM orio_ledger.journals WHERE idempotency_key=p_key;
  IF FOUND THEN
    IF prior.request_hash <> req_hash THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
    RETURN prior;
  END IF;
  IF EXISTS (SELECT FROM orio_ledger.journals WHERE external_ref=p_ref) THEN
    RAISE EXCEPTION 'External settlement already recorded';
  END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(normalized) x LEFT JOIN orio_ledger.accounts a ON a.id=x->>'accountId' WHERE a.id IS NULL) THEN
    RAISE EXCEPTION 'Unknown account';
  END IF;
  IF EXISTS (
    SELECT a.asset FROM jsonb_array_elements(normalized) x JOIN orio_ledger.accounts a ON a.id=x->>'accountId'
    GROUP BY a.asset HAVING sum(CASE x->>'side' WHEN 'debit' THEN (x->>'units')::numeric ELSE -(x->>'units')::numeric END) <> 0
  ) THEN RAISE EXCEPTION 'Unbalanced journal for asset'; END IF;
  IF EXISTS (
    SELECT FROM jsonb_array_elements(normalized) x JOIN orio_ledger.accounts a ON a.id=x->>'accountId'
    WHERE NOT a.allow_negative AND
      COALESCE((SELECT sum(CASE WHEN p.side=a.normal_side THEN p.units ELSE -p.units END)
        FROM orio_ledger.postings p WHERE p.account_id=a.id),0)
      + CASE WHEN x->>'side'=a.normal_side THEN (x->>'units')::numeric ELSE -(x->>'units')::numeric END < 0
  ) THEN RAISE EXCEPTION 'Insufficient account balance'; END IF;

  seq := head.sequence+1;
  SELECT jsonb_agg(jsonb_build_object('id',a.id,'asset',a.asset,'normalSide',a.normal_side,'allowNegative',a.allow_negative) ORDER BY a.id)
    INTO account_snapshot FROM jsonb_array_elements(normalized) x JOIN orio_ledger.accounts a ON a.id=x->>'accountId';
  event_header := jsonb_build_object('sequence',seq::text,'previousHash',head.event_hash,'requestHash',req_hash,
    'accountsHash',encode(orio_ledger.digest(convert_to(account_snapshot::text,'UTF8'),'sha256'),'hex'),
    'recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  INSERT INTO orio_ledger.journals VALUES(seq,p_key,p_ref,request,account_snapshot,req_hash,event_header,
    encode(orio_ledger.digest(convert_to(event_header::text,'UTF8'),'sha256'),'hex')) RETURNING * INTO result;
  INSERT INTO orio_ledger.postings SELECT seq,x->>'accountId',x->>'side',(x->>'units')::numeric FROM jsonb_array_elements(normalized) x;
  INSERT INTO orio_ledger.outbox(journal_sequence) VALUES(seq);
  UPDATE orio_ledger.chain_head SET sequence=seq,event_hash=result.event_hash WHERE singleton;
  RETURN result;
END $$;

CREATE FUNCTION orio_ledger.claim_outbox(p_limit integer,p_lease_seconds integer)
RETURNS SETOF orio_ledger.outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,orio_ledger AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Invalid outbox claim';
  END IF;
  UPDATE orio_ledger.outbox SET dead_letter_at=clock_timestamp(),token=NULL,leased_until=NULL
    WHERE delivered_at IS NULL AND dead_letter_at IS NULL AND attempts=10
    AND (leased_until IS NULL OR leased_until<=clock_timestamp());
  RETURN QUERY WITH candidates AS (
    SELECT journal_sequence FROM orio_ledger.outbox
    WHERE delivered_at IS NULL AND dead_letter_at IS NULL AND attempts<10
      AND next_attempt_at<=clock_timestamp() AND (leased_until IS NULL OR leased_until<=clock_timestamp())
    ORDER BY journal_sequence FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE orio_ledger.outbox o SET attempts=o.attempts+1,token=gen_random_uuid(),
    leased_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    FROM candidates c WHERE o.journal_sequence=c.journal_sequence RETURNING o.*;
END $$;

CREATE FUNCTION orio_ledger.finish_outbox(p_sequence bigint,p_token uuid,p_success boolean,p_retry_seconds integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,orio_ledger AS $$
DECLARE event orio_ledger.outbox;
BEGIN
  IF p_success IS NULL OR p_retry_seconds IS NULL OR p_retry_seconds NOT BETWEEN 0 AND 86400 THEN
    RAISE EXCEPTION 'Invalid outbox completion';
  END IF;
  -- Check the clock only after acquiring the row lock. A WHERE predicate can be
  -- evaluated before waiting for an unchanged locked tuple, then become stale.
  SELECT * INTO event FROM orio_ledger.outbox WHERE journal_sequence=p_sequence FOR UPDATE;
  IF NOT FOUND OR event.token IS NULL OR p_token IS NULL OR event.token<>p_token
      OR event.leased_until IS NULL OR event.leased_until<=clock_timestamp()
      OR event.delivered_at IS NOT NULL OR event.dead_letter_at IS NOT NULL THEN
    RETURN false;
  END IF;
  UPDATE orio_ledger.outbox SET
    delivered_at=CASE WHEN p_success THEN clock_timestamp() END,
    dead_letter_at=CASE WHEN NOT p_success AND attempts=10 THEN clock_timestamp() END,
    next_attempt_at=clock_timestamp()+make_interval(secs=>p_retry_seconds),
    token=NULL,leased_until=NULL
  WHERE journal_sequence=p_sequence;
  RETURN true;
END $$;

CREATE VIEW orio_ledger.balances AS SELECT a.id,a.asset,a.normal_side,a.allow_negative,
  COALESCE(sum(CASE WHEN p.side=a.normal_side THEN p.units ELSE -p.units END),0)::text AS units
  FROM orio_ledger.accounts a LEFT JOIN orio_ledger.postings p ON p.account_id=a.id GROUP BY a.id;

REVOKE ALL ON ALL TABLES IN SCHEMA orio_ledger FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA orio_ledger FROM PUBLIC;
GRANT USAGE ON SCHEMA orio_ledger TO orio_ledger_runtime;
GRANT SELECT ON orio_ledger.accounts,orio_ledger.journals,orio_ledger.postings,orio_ledger.chain_head,orio_ledger.outbox,orio_ledger.balances TO orio_ledger_runtime;
GRANT EXECUTE ON FUNCTION orio_ledger.create_account(text,text,text,boolean),
  orio_ledger.post_journal(text,text,text,jsonb),orio_ledger.claim_outbox(integer,integer),
  orio_ledger.finish_outbox(bigint,uuid,boolean,integer) TO orio_ledger_runtime;
COMMIT;
