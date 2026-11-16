-- Explicit internal dependency for managed PostgreSQL extension ownership.
-- Run only through the separately authorized migration/qualification procedure.
-- No runtime/PUBLIC access is granted and no monetary state is changed.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$
DECLARE
  ledger_owner oid;
  ledger_owner_name name;
  digest_signature text;
  digest_function oid;
BEGIN
  SELECT nspowner INTO STRICT ledger_owner FROM pg_namespace WHERE nspname='orio_ledger';
  ledger_owner_name := pg_get_userbyid(ledger_owner);
  IF ledger_owner_name='orio_ledger_runtime' OR NOT pg_has_role(ledger_owner,'USAGE')
     OR (SELECT proowner FROM pg_proc WHERE oid='orio_ledger.post_journal(text,text,text,jsonb)'::regprocedure) <> ledger_owner THEN
    RAISE EXCEPTION 'Trusted ledger owner or provider grant authority is required';
  END IF;
  FOREACH digest_signature IN ARRAY ARRAY['orio_ledger.digest(bytea,text)','orio_ledger.digest(text,text)'] LOOP
    digest_function := to_regprocedure(digest_signature);
    IF digest_function IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
      WHERE d.classid='pg_proc'::regclass AND d.objid=digest_function
        AND d.refclassid='pg_extension'::regclass AND d.deptype='e' AND e.extname='pgcrypto'
    ) THEN
      RAISE EXCEPTION 'Reviewed pgcrypto digest dependency is missing';
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',digest_function::regprocedure,ledger_owner_name);
    IF NOT has_function_privilege(ledger_owner,digest_function,'EXECUTE') OR EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=digest_function AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,ledger_owner)
    ) OR has_function_privilege('orio_ledger_runtime',digest_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Digest grants must remain confined to the provider and ledger owner';
    END IF;
  END LOOP;
END $$;
COMMIT;
