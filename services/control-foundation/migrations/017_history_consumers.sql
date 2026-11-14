BEGIN;
CREATE TABLE orio_history.consumers (
 stream_id text NOT NULL REFERENCES orio_history.streams,
 consumer_id text NOT NULL,
 handler_digest text NOT NULL CHECK(handler_digest ~ '^[0-9a-f]{64}$'),
 next_block numeric(78,0) NOT NULL CHECK(next_block>0),
 receipt_offset integer NOT NULL CHECK(receipt_offset>=0),
 PRIMARY KEY(stream_id,consumer_id)
);
CREATE TABLE orio_history.deliveries (
 stream_id text NOT NULL,
 consumer_id text NOT NULL,
 height numeric(78,0) NOT NULL,
 receipt_offset integer NOT NULL CHECK(receipt_offset>=0),
 receipt_digest text NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
 result jsonb NOT NULL,
 PRIMARY KEY(stream_id,consumer_id,height,receipt_offset),
 FOREIGN KEY(stream_id,consumer_id) REFERENCES orio_history.consumers,
 FOREIGN KEY(stream_id,height) REFERENCES orio_history.blocks
);
CREATE TRIGGER immutable_history_delivery BEFORE UPDATE OR DELETE ON orio_history.deliveries
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_history_delivery_truncate BEFORE TRUNCATE ON orio_history.deliveries
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TABLE orio_history.completions (
 stream_id text NOT NULL,
 consumer_id text NOT NULL,
 height numeric(78,0) NOT NULL,
 block_digest text NOT NULL CHECK(block_digest ~ '^[0-9a-f]{64}$'),
 receipt_count integer NOT NULL CHECK(receipt_count>=0),
 PRIMARY KEY(stream_id,consumer_id,height),
 FOREIGN KEY(stream_id,consumer_id) REFERENCES orio_history.consumers,
 FOREIGN KEY(stream_id,height) REFERENCES orio_history.blocks
);
CREATE TRIGGER immutable_history_completion BEFORE UPDATE OR DELETE ON orio_history.completions
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_history_completion_truncate BEFORE TRUNCATE ON orio_history.completions
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA orio_history FROM PUBLIC;
COMMIT;
