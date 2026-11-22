BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '2s';
DO $$ BEGIN
  IF current_database()<>'orio_control_qualification' THEN
    RAISE EXCEPTION 'Autonomous access requires the isolated qualification database';
  END IF;
  IF NOT pg_try_advisory_xact_lock(1869771119,1903322476) THEN
    RAISE EXCEPTION 'Competing maintenance';
  END IF;
END $$;

-- A separate maintenance step must create and bind an authenticated login.
CREATE ROLE orio_autonomous_import NOLOGIN;
CREATE TABLE orio_autonomous.import_bindings (
  login_role name PRIMARY KEY,
  deployment_id text NOT NULL UNIQUE REFERENCES orio_autonomous.deployments(id)
);
CREATE TABLE orio_autonomous.import_accounts (
  deployment_id text NOT NULL REFERENCES orio_autonomous.deployments(id),
  account_id text PRIMARY KEY REFERENCES orio_ledger.accounts(id)
);

CREATE FUNCTION orio_autonomous.bound_deployment() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT b.deployment_id FROM orio_autonomous.import_bindings b
  JOIN orio_autonomous.deployments d ON d.id=b.deployment_id
  WHERE b.login_role=session_user AND d.configuration->>'chainId'='84532'
$$;

ALTER TABLE orio_autonomous.deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY importer_deployment ON orio_autonomous.deployments TO orio_autonomous_import
  USING (id=orio_autonomous.bound_deployment());
ALTER TABLE orio_autonomous.facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY importer_facts ON orio_autonomous.facts FOR SELECT TO orio_autonomous_import
  USING (deployment_id=orio_autonomous.bound_deployment());

CREATE FUNCTION orio_autonomous.import_claim(p_ref text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE deployment text := orio_autonomous.bound_deployment();
BEGIN
  IF deployment IS NULL OR p_ref IS NULL THEN RAISE EXCEPTION 'Import binding required'; END IF;
  IF p_ref ~ '^eip155:84532/tx:0x[0-9a-f]{64}/log:(0|[1-9][0-9]{0,77})$' THEN
    INSERT INTO orio_settlement.receipt_claims VALUES(p_ref,'monetary','autonomous:'||deployment);
  ELSIF starts_with(p_ref,'eip155:84532/autonomous:'||deployment||'/empty-through:')
    AND split_part(p_ref,'/empty-through:',2) ~ '^(0|[1-9][0-9]{0,77})$' THEN
    INSERT INTO orio_settlement.receipt_claims VALUES(p_ref,'monetary','autonomous-empty:'||deployment);
  ELSE
    RAISE EXCEPTION 'Receipt outside import scope';
  END IF;
END $$;

CREATE FUNCTION orio_autonomous.import_account(p_id text,p_asset text,p_label text,p_side text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE deployment text := orio_autonomous.bound_deployment();
        config jsonb;
        expected_side text;
        expected_id text;
BEGIN
  SELECT configuration INTO STRICT config FROM orio_autonomous.deployments WHERE id=deployment;
  IF p_asset='erc20:84532:'||(config->>'master') THEN
    IF p_label IN ('reserve_cash','company_cash','claim_cash','company_distributions') THEN expected_side := 'debit';
    ELSIF p_label IN ('backing','company_revenue') OR p_label ~ '^claim_due:0x[0-9a-f]{40}$' THEN expected_side := 'credit';
    END IF;
  ELSIF p_asset='erc20:84532:'||(config->>'currency') THEN
    IF p_label='issuance' THEN expected_side := 'debit';
    ELSIF p_label ~ '^wallet:0x[0-9a-f]{40}$' THEN expected_side := 'credit'; END IF;
  ELSIF p_asset='USD54_MONETARY_MEMO' THEN
    IF p_label='rounding_control' THEN expected_side := 'debit';
    ELSIF p_label='restricted_rounding' THEN expected_side := 'credit'; END IF;
  END IF;
  expected_id := 'aut_'||encode(sha256(convert_to(
    replace(jsonb_build_array(deployment,p_asset,p_label)::text, ', ', ','),'UTF8')),'hex');
  IF expected_side IS NULL OR p_side IS DISTINCT FROM expected_side OR p_id IS DISTINCT FROM expected_id THEN
    RAISE EXCEPTION 'Account outside import scope';
  END IF;
  PERFORM orio_ledger.create_account(p_id,p_asset,p_side,false);
  INSERT INTO orio_autonomous.import_accounts VALUES(deployment,p_id) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT FROM orio_autonomous.import_accounts WHERE deployment_id=deployment AND account_id=p_id) THEN
    RAISE EXCEPTION 'Account belongs to another deployment';
  END IF;
END $$;

CREATE FUNCTION orio_autonomous.import_balance(p_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT b.units::text FROM orio_ledger.balances b JOIN orio_autonomous.import_accounts a ON a.account_id=b.id
  WHERE a.deployment_id=orio_autonomous.bound_deployment() AND b.id=p_id
$$;

CREATE FUNCTION orio_autonomous.import_journal(p_ref text,p_postings jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE deployment text := orio_autonomous.bound_deployment();
        receipt text := regexp_replace(p_ref,'/part:[23]$','');
BEGIN
  IF deployment IS NULL OR NOT EXISTS(
    SELECT FROM orio_settlement.receipt_claims WHERE external_ref=receipt AND consumer='monetary'
      AND operation_id='autonomous:'||deployment
  ) OR jsonb_typeof(p_postings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Journal outside import scope';
  END IF;
  IF jsonb_array_length(p_postings) NOT BETWEEN 2 AND 128 OR EXISTS (
    SELECT FROM jsonb_array_elements(p_postings) posting
    WHERE NOT EXISTS (SELECT FROM orio_autonomous.import_accounts
      WHERE deployment_id=deployment AND account_id=posting->>'accountId')
  ) THEN RAISE EXCEPTION 'Journal accounts outside import scope'; END IF;
  RETURN (orio_ledger.post_journal('autonomous:'||p_ref,p_ref,
    'Finalized autonomous reserve, token and funded-claim accounting',p_postings)).sequence::text;
END $$;

CREATE FUNCTION orio_autonomous.import_fact(p_ref text,p_proof jsonb,p_sequence bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE deployment text := orio_autonomous.bound_deployment();
BEGIN
  IF deployment IS NULL OR NOT EXISTS (
    SELECT FROM orio_settlement.receipt_claims WHERE external_ref=p_ref AND consumer='monetary'
      AND operation_id IN ('autonomous:'||deployment,'autonomous-empty:'||deployment)
  ) OR (p_sequence IS NOT NULL AND NOT EXISTS (
    SELECT FROM orio_ledger.journals WHERE sequence=p_sequence AND external_ref=p_ref AND idempotency_key='autonomous:'||p_ref
  )) THEN RAISE EXCEPTION 'Fact outside import scope'; END IF;
  INSERT INTO orio_autonomous.facts VALUES(p_ref,deployment,p_proof,p_sequence);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA orio_autonomous FROM PUBLIC;
GRANT USAGE ON SCHEMA orio_autonomous TO orio_autonomous_import;
GRANT SELECT ON orio_autonomous.deployments,orio_autonomous.facts TO orio_autonomous_import;
GRANT UPDATE(state,version,pending_units,company_units,block_number,log_index) ON orio_autonomous.deployments TO orio_autonomous_import;
GRANT EXECUTE ON FUNCTION orio_autonomous.bound_deployment(),orio_autonomous.import_claim(text),
  orio_autonomous.import_account(text,text,text,text),orio_autonomous.import_balance(text),
  orio_autonomous.import_journal(text,jsonb),orio_autonomous.import_fact(text,jsonb,bigint) TO orio_autonomous_import;
COMMIT;
