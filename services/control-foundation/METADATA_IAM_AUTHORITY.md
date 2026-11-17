# Restricted metadata Lambda

Actual private IAM connectivity, access checks and cleanup passed on November 17, 2026; see [the hosted report](../../infrastructure/aws/METADATA_IAM_DEPLOYMENT_REPORT_2026-11-17.md). The deployed function and current infrastructure default are paused at concurrency zero. The owner-approved private phase is complete; public access remains a separate proposal.

The new transport shares the fixed GET route table with the existing HTTP service. There is no caller-selected SQL, database, provider, signing payload or financial execution. Public metadata is not evidence of financial launch readiness.

`metadata-iam.ts` pins account-specific database endpoint, database/user, Lambda name, region and CA digest. It rejects password/URL overrides and disabled TLS. Each new connection obtains a fresh IAM token from the locked AWS signer dependency. Pool size is one, connection/query timeouts are five seconds, and default transactions are read-only. Read-only defaults supplement actual grants; they cannot replace privilege restrictions.

The role audit rejects administrator/session masking, reachable ownership, dangerous predefined roles, schema creation, non-registry table or column reads, writes, sequences and reachable application functions. `rds_iam` alone is permitted. Every actual master/ready read repeats the audit inside a read-only snapshot. A cached successful startup qualification guards policy/health responses; they do not represent a fresh database readiness assertion. Database/authentication errors return generic unavailable responses without logging credentials.

The bootstrap SQL is a one-shot, separately authorized administrative operation. It does not belong to monetary migrations or the Lambda package. The original master secret never belongs in Lambda. Occupied reader names require inspection, and failed/ambiguous execution must not be blindly replayed.

Verification includes actual PostgreSQL privilege tests for PUBLIC table/column/function exposure, NOINHERIT membership, file/system execution roles, a passwordless IAM-style bootstrap and rejected reapplication. Transport tests cover malformed events, refused execution routes and private-error redaction. The package builder transpiles only entry dependencies, installs locked production modules with scripts disabled, pins CA bytes and smoke-tests the compiled entry without cloud calls. The actual AWS Linux package matched CI byte-for-byte; real Lambda invocations then verified the RDS IAM reader and restricted responses before pausing.

Deployment authority, costs, rollback and remaining integration are specified in [the exact next proposal](../../infrastructure/aws/METADATA_IAM_DEPLOYMENT_PROPOSAL.md). `metadata-private-lambda.json` intentionally creates no public endpoint and grants no financial or secret access. Do not infer production activation from local test success.
