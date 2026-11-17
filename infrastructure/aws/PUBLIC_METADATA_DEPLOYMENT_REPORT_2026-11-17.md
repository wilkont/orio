# Public read-only metadata deployment — November 17, 2026

Completed under the owner's specific public-access and budget approval in AWS account 720232346199, us-east-1.

Endpoint: https://0yer5gvdw3.execute-api.us-east-1.amazonaws.com

GET /health, /ready, /v1/protocol/policy and /v1/protocol/master returned 200 over external HTTPS. POST to the master route and GET /v1/settlement returned 404. ORIO-origin preflight returned 204; an unrelated origin received no CORS grant, while public information remained readable. All eight checks passed. CORS is not authentication.

The eleven-resource gateway has four exact GET invocation permissions, a one-request-per-second rate, burst two and backend concurrency one. The existing verified Lambda code, execution role, private database network and three-table database authority were preserved. Its only resume change was concurrency zero to one. No administrator secret was retrieved in this phase. No signing, financial activation, website, DNS or mail changes occurred. The master remains DEPOSIT_PAUSED with no elected asset.

The sanitized receipt records actual stack/API identity, checks, evidence hashes and budgets. Private reports were downloaded, hash-verified and retained locally with owner/SYSTEM access. Temporary CloudShell working directory and archive were removed at 20:32:37 UTC; the approved public service remains active. Historical private-phase pause records describe that earlier phase and must not be replayed.

Verification allowance: up to $5; additional API/service usage: $5/month; existing storage/log allowance: $1/month separately. These are approved allowances, not measured final charges.

Next: the separately proposed five disabled production-purpose keys in PRODUCTION_DISABLED_KEYS_PROPOSAL.md. That template was syntax-validated and the actual operator identity checked; no keys were created. Production signing, reserve arrangements, provider/paymaster admission, recovery and accountable financial qualification remain unfinished. External review remains advisory.
