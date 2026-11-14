BEGIN;
CREATE SCHEMA orio_history;
CREATE TABLE orio_history.streams (
 id text PRIMARY KEY,
 configuration jsonb NOT NULL,
 next_block numeric(78,0) NOT NULL CHECK(next_block>0),
 parent_hash text NOT NULL CHECK(parent_hash ~ '^0x[0-9a-f]{64}$')
);
CREATE TABLE orio_history.blocks (
 stream_id text NOT NULL REFERENCES orio_history.streams,
 height numeric(78,0) NOT NULL CHECK(height>0),
 block_hash text NOT NULL CHECK(block_hash ~ '^0x[0-9a-f]{64}$'),
 evidence jsonb NOT NULL,
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(stream_id,height),
 UNIQUE(stream_id,block_hash)
);
CREATE TRIGGER immutable_history_block BEFORE UPDATE OR DELETE ON orio_history.blocks
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_history_block_truncate BEFORE TRUNCATE ON orio_history.blocks
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
REVOKE ALL ON SCHEMA orio_history FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA orio_history FROM PUBLIC;
-- Deliberately no runtime grants. Deployment must assign a dedicated observer role.
COMMIT;
