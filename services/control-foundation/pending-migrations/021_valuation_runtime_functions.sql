-- Pending qualification extension. No login, membership or execution grant is
-- created here; the hosted bootstrap and its access must be separately approved.
BEGIN;
CREATE TABLE orio_signing.runtime_authority_bindings (
 login_name text PRIMARY KEY CHECK(login_name ~ '^[a-z][a-z0-9_]{0,62}$'),
 authority_id text NOT NULL REFERENCES orio_signing.authorities
);
CREATE TRIGGER immutable_binding BEFORE UPDATE OR DELETE ON orio_signing.runtime_authority_bindings
 FOR EACH ROW EXECUTE FUNCTION orio_ledger.reject_mutation();
CREATE TRIGGER immutable_binding_truncate BEFORE TRUNCATE ON orio_signing.runtime_authority_bindings
 FOR EACH STATEMENT EXECUTE FUNCTION orio_ledger.reject_mutation();
REVOKE ALL ON orio_signing.runtime_authority_bindings FROM PUBLIC;

CREATE FUNCTION orio_signing.assert_runtime_valuation(p_id text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 i orio_signing.valuation_intents%ROWTYPE;
 d orio_monetary.deployments%ROWTYPE;
 s jsonb; k text; label text; expected text; actual text; account_id text;
 now_seconds numeric;
BEGIN
 SELECT v.* INTO i FROM orio_signing.valuation_intents v
 JOIN orio_signing.runtime_authority_bindings b ON b.authority_id=v.authority_id
 WHERE v.id=p_id AND b.login_name=session_user::text;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unrecognized scoped valuation intent'; END IF;
 PERFORM 1 FROM orio_signing.authorities WHERE id=i.authority_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM orio_signing.revocations WHERE authority_id=i.authority_id)
 THEN RAISE EXCEPTION 'Reserve authority revoked'; END IF;
 SELECT * INTO STRICT d FROM orio_monetary.deployments WHERE id=i.deployment_id FOR UPDATE;
 s=i.evidence->'observations'->0;
 IF d.configuration->>'chainId' IS DISTINCT FROM '84532'
 OR s->>'chainId' IS DISTINCT FROM '84532'
 OR jsonb_typeof(s) IS DISTINCT FROM 'object'
 OR s->'finalized' IS DISTINCT FROM 'true'::jsonb
 OR NOT coalesce(d.state->>'phase' IN ('GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'),false)
 OR i.evidence->>'deploymentId' IS DISTINCT FROM i.deployment_id
 OR d.version::text IS DISTINCT FROM i.evidence->>'ledgerVersion'
 OR d.state IS DISTINCT FROM i.evidence->'ledgerState'
 THEN RAISE EXCEPTION 'Committed qualification state changed'; END IF;
 FOREACH k IN ARRAY ARRAY['controller','currency','vault','registry','master','registryEpoch','masterDecimals'] LOOP
  IF k IN ('controller','currency','vault','registry','master') AND
   (d.configuration->>k IS NULL OR d.configuration->>k !~ '^0x[0-9a-fA-F]{40}$')
  THEN RAISE EXCEPTION 'Missing deployment identity'; END IF;
  IF lower(d.configuration->>k) IS DISTINCT FROM lower(s->>k)
  THEN RAISE EXCEPTION 'Committed deployment mismatch'; END IF;
 END LOOP;
 IF d.state->>'masterAssetId' IS DISTINCT FROM
  ('erc20:84532:'||lower(d.configuration->>'master'))
 THEN RAISE EXCEPTION 'Committed master identity mismatch'; END IF;
 FOREACH label IN ARRAY ARRAY['reserve_cash','company_cash'] LOOP
  expected=CASE WHEN label='reserve_cash' THEN d.state->>'reserveMasterUnits' ELSE i.evidence->>'companyMasterUnits' END;
  IF expected IS NULL OR expected !~ '^(0|[1-9][0-9]{0,77})$'
  THEN RAISE EXCEPTION 'Missing committed reserve cash'; END IF;
  -- Identical ASCII JSON array encoding to gasDigest([deployment,asset,label]).
  account_id='mon_'||encode(sha256(convert_to(format('[%s,%s,%s]',to_json(i.deployment_id),
   to_json(d.state->>'masterAssetId'),to_json(label)),'UTF8')),'hex');
  SELECT units::text INTO actual FROM orio_ledger.balances WHERE id=account_id;
  IF actual IS DISTINCT FROM expected AND NOT
   (actual IS NULL AND expected='0' AND d.version=0 AND (d.state->>'phase' IS NOT DISTINCT FROM 'GENESIS'))
  THEN RAISE EXCEPTION 'Committed reserve cash mismatch'; END IF;
 END LOOP;
 now_seconds=floor(extract(epoch FROM clock_timestamp()));
 IF now_seconds<i.prepared_at::numeric OR now_seconds>=i.valid_until::numeric
 THEN RAISE EXCEPTION 'Reserve intent expired'; END IF;
END $$;

CREATE FUNCTION orio_signing.valuation_runtime_load(p_id text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM orio_signing.assert_runtime_valuation(p_id);
 IF EXISTS(SELECT 1 FROM orio_signing.claims WHERE intent_id=p_id)
 THEN RAISE EXCEPTION 'Signing claim already consumed'; END IF;
 SELECT jsonb_build_object('evidence',i.evidence,'preparedAt',i.prepared_at,
  'typedDigest',i.typed_digest,'policyDigest',a.policy_digest,'keyArn',a.key_arn,'signer',a.signer)
 INTO STRICT result FROM orio_signing.valuation_intents i
 JOIN orio_signing.authorities a ON a.id=i.authority_id WHERE i.id=p_id;
 RETURN result;
END $$;
CREATE FUNCTION orio_signing.valuation_runtime_claim(p_id text,p_digest text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM orio_signing.assert_runtime_valuation(p_id);
 IF NOT EXISTS(SELECT 1 FROM orio_signing.valuation_intents WHERE id=p_id AND typed_digest=p_digest)
 THEN RAISE EXCEPTION 'Unrecognized valuation digest'; END IF;
 INSERT INTO orio_signing.claims(intent_id) VALUES(p_id);
END $$;
CREATE FUNCTION orio_signing.valuation_runtime_complete(p_id text,p_digest text,p_signature text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM orio_signing.assert_runtime_valuation(p_id);
 IF NOT EXISTS(SELECT 1 FROM orio_signing.valuation_intents WHERE id=p_id AND typed_digest=p_digest)
 THEN RAISE EXCEPTION 'Unrecognized valuation digest'; END IF;
 -- The private KMS worker must verify ECDSA before this receipt. SQL does not
 -- claim to independently prove a signature; all consumers must verify it too.
 INSERT INTO orio_signing.completions(intent_id,signature) VALUES(p_id,p_signature);
END $$;
REVOKE ALL ON FUNCTION orio_signing.assert_runtime_valuation(text),
 orio_signing.valuation_runtime_load(text),orio_signing.valuation_runtime_claim(text,text),
 orio_signing.valuation_runtime_complete(text,text,text) FROM PUBLIC;
COMMIT;
