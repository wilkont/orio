# Initial security risk register

| Risk | Evidence or uncertainty | Required control |
|---|---|---|
| Monetary incompatibility | Legacy appreciation multiplier differs | Characterize legacy behavior; exact reference and contract differential checks |
| Precision loss | Number balances and toFixed pricing | Approved fixed-point arithmetic and explicit residual accounting |
| Unsafe legacy execution | Historical integrations and credentials not assessed | Inspect source without starting services or installing legacy lifecycle scripts |
| Infrastructure inventory incomplete | AWS and registrar access unavailable | Read-only authenticated inventory and backup verification |
| DNS/mail disruption | AWS nameservers and AWS inbound mail observed | Preserve zone, email records, and rollback plan |
| Unresolved economic policy | Bootstrap, rounding, epochs, dust | Explicit policy records; keep affected execution disabled |
| Unqualified financial release | Independent evidence not supplied | Legal, reserve, custody, security, and operational release gates |

This is an initial register, not a penetration test or an independent audit.

## Follow-up evidence

| Priority | Finding | Scope and required next step |
|---|---|---|
| High | OrioApp SSH and TCP 5000 permitted from all IPv4 sources | Review actual service bindings and administrative access dependencies before restricting the existing security group; no network change performed |
| High | OrioApp root disk unencrypted and deleted on termination; no owned Ohio EC2 snapshots visible | Establish recoverable application/database backups and rehearse restore before migration; do not terminate the server |
| High | Source transaction queries reachable before router authentication | Trace deployed version and upstream controls; implement owner authorization in the new service; do not probe customer records |
| Medium | Backup bucket lacks versioning/Object Lock/server access logging | Existing bucket public access is blocked; assess backup freshness and immutable independent recovery design |
| Medium | Backup root includes AWS/SSH/configuration directories; devnet key files tracked in Git | Treat historical material as sensitive, classify keys without printing them, and do not reuse legacy/devnet keys for production |
| Medium | DNSSEC not signing in Route 53 | Design coordinated registrar/zone signing change with rollback; no unilateral nameserver or security changes |
| Medium | IMDSv2 optional; no IAM instance role displayed | Assess software dependencies and workload identity before hardening or migrating |

These findings are configuration/source observations, not proof of compromise or successful exploitation.
