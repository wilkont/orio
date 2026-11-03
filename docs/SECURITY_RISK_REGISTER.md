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
