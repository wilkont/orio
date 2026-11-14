BEGIN;
CREATE TABLE orio_monetary.master_history (
 deployment_id text NOT NULL REFERENCES orio_monetary.deployments,
 epoch numeric(78,0) NOT NULL CHECK(epoch>0),
 configuration jsonb NOT NULL,
 PRIMARY KEY(deployment_id,epoch)
);
INSERT INTO orio_monetary.master_history SELECT id,(configuration->>'registryEpoch')::numeric,configuration FROM orio_monetary.deployments;
CREATE TRIGGER immutable_master_history BEFORE UPDATE OR DELETE ON orio_monetary.master_history
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_master_history_truncate BEFORE TRUNCATE ON orio_monetary.master_history
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
COMMIT;
