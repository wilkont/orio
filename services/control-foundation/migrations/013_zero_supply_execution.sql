BEGIN;
-- A reconciled zero-supply checkpoint changes lifecycle state without moving assets.
-- Its immutable evidence and receipt ownership remain mandatory; do not invent zero journals.
ALTER TABLE orio_monetary.executions ALTER COLUMN journal_sequence DROP NOT NULL;
COMMIT;
