-- Prepared qualification extension; not installed on the hosted database.
-- Owner-only tables: no application, public endpoint or signing permission grant.
BEGIN;
CREATE SCHEMA orio_signing;
REVOKE ALL ON SCHEMA orio_signing FROM PUBLIC;
CREATE TABLE orio_signing.authorities (
 id text PRIMARY KEY CHECK(id ~ '^[A-Za-z0-9:_-]{1,100}$'),
 key_arn text NOT NULL,
 signer text NOT NULL CHECK(signer ~ '^0x[0-9a-fA-F]{40}$'),
 policy_digest text NOT NULL CHECK(policy_digest ~ '^0x[0-9a-f]{64}$')
);
CREATE TABLE orio_signing.revocations (
 authority_id text PRIMARY KEY REFERENCES orio_signing.authorities,
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^0x[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE orio_signing.valuation_intents (
 id text PRIMARY KEY CHECK(id ~ '^[A-Za-z0-9:_-]{1,100}$'),
 authority_id text NOT NULL REFERENCES orio_signing.authorities,
 deployment_id text NOT NULL REFERENCES orio_monetary.deployments,
 typed_digest text NOT NULL CHECK(typed_digest ~ '^0x[0-9a-f]{64}$'),
 evidence jsonb NOT NULL,
 prepared_at text NOT NULL CHECK(prepared_at ~ '^(0|[1-9][0-9]{0,14})$'),
 valid_until text NOT NULL CHECK(valid_until ~ '^(0|[1-9][0-9]{0,14})$'),
 CHECK(valid_until::numeric > prepared_at::numeric)
);
CREATE TABLE orio_signing.claims (
 intent_id text PRIMARY KEY REFERENCES orio_signing.valuation_intents,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE orio_signing.completions (
 intent_id text PRIMARY KEY REFERENCES orio_signing.claims,
 signature text NOT NULL CHECK(signature ~ '^0x[0-9a-f]{130}$'),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE n text; BEGIN
 FOR n IN SELECT unnest(ARRAY['authorities','revocations','valuation_intents','claims','completions']) LOOP
  EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON orio_signing.%I FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation()',n);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON orio_signing.%I FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation()',n);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA orio_signing FROM PUBLIC;
COMMIT;
