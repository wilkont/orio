> Current-state update: public read-only deployment completed November 17, 2026; concurrency is now one. Earlier private-phase pause or pending-approval descriptions below are historical. See [actual public report](PUBLIC_METADATA_DEPLOYMENT_REPORT_2026-11-17.md). Do not replay completed bootstrap steps.

# Next proposal: public protocol metadata only

Prepared locally; no public endpoint has been created or authorized by the private deployment approval. Target AWS account 720232346199, us-east-1. The existing private service exposes only fixed protocol metadata and cannot execute financial operations.

## Concrete change

Deploy the eleven-resource `metadata-public-api.json` template: an HTTP API, one integration, four GET routes, four route-specific Lambda invocation permissions and one stage. The public paths are `/health`, `/ready`, `/v1/protocol/policy` and `/v1/protocol/master`. Anyone can request this public metadata. CORS allows the two ORIO.IO website origins and no cookies; CORS is not access control.

Each invocation permission is restricted to API Gateway, this account, the newly created API ID, GET and one exact path. No wildcard wallet/settlement route, customer record access, new database grant, signing permission, secret access, new application role or function URL is included. Integration invokes the already qualified existing function with HTTP event format 2.0. Throttle at one request per second with a burst of two, retain function concurrency one and its one-connection database pool. Keep the existing seven-day Lambda logs and standard API metrics; do not log request bodies, headers, query strings or IP addresses.

Before publication, verify the exact deployed package and three-table database authority, current backups, database health and financially paused state. Update only the existing function's reserved concurrency from zero to one through a non-replacement change preview. Do not replace code, role or network configuration. Deploy the gateway only after reviewing the exact eleven additions. Use the provider's HTTPS endpoint; no domain/DNS/mail or legacy website changes are part of this phase.

## Acceptance and rollback

Verify real HTTPS GET responses for all four paths, generic failures, denied write/settlement paths, ORIO origin CORS and the absence of customer/signing routes. Require truthful paused master state and financial execution disabled. Record source, gateway ID, endpoint, deployment/permission checks and public response hashes. Keep database metrics healthy and verify no unexpected grants. This is public information infrastructure, not financial launch acceptance.

If qualification fails or traffic/cost is unacceptable, set function concurrency to zero and remove only the new gateway stage/API and four invocation permissions. Preserve the qualified private service, database, account history and retained artifact. A failed or ambiguous deployment requires inspection before retrying.

## Approval and costs

Request up to $5 additional verification cost and up to $5/month additional API/function usage. The previously approved $1/month storage/log allowance remains separate. Metered public traffic can incur charges, including rejected traffic; throttling and concurrency protect backend capacity but are not provider-enforced spending caps. Check usage and pause/remove public access when the allowance is approached. No paid third-party plan, mainnet, financial transaction, reserve movement or customer activation is included.

Publishing this new access requires a separate confirmation because the private approval expressly excluded public endpoints. All independent engineering work can continue without financial activation. External review remains advisory.

References: [HTTP API resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-api.html), [stage and throttle settings](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-stage.html), [Lambda integration](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-integration.html).
