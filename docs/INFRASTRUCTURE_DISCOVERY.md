# Authenticated infrastructure discovery — November 3, 2026

## GCP

Created `orio-spc-3-prod` (project number `501960627141`) under the ColomboAI organization `465218971713`, using the requested account. The user authorized a dedicated project and infrastructure spending without a set cap. No spending cap has been configured.

Attempted to link the open Colomboai_newBilling account `013DC6-1EB2DF-81B97A`. Google rejected the operation with `FAILED_PRECONDITION`, `DEGRADATION_STAGE_FRICTION`, stating that a billing account has an overdue balance. A subsequent billing-info read confirmed `billingEnabled: false` and no billing account association. Do not report deployed services or retry through another account to bypass this restriction. The user must resolve the billing issue. No payment was attempted.

## AWS

The user-provided Chrome session is authenticated to ORIO account `710096437887`. Read-only EC2 inventory in us-east-1 found:

| Name | Instance | Type | State | Zone |
|---|---|---|---|---|
| ETHMnode0 | i-0269fb073656c0a16 | t2.micro | Stopped | us-east-1b |
| HVAM | i-0c954bcab1a7d5b05 | t2.micro | Stopped | us-east-1a |
| oriodapp | i-0340aae6120fa916b | t2.medium | Stopped | us-east-1a |

The regional dashboard showed 3 volumes, 3 Elastic IPs, 10 security groups, 8 key pairs, 0 snapshots, 0 load balancers, and 0 running instances. These observations apply only to that region and time. The account has EC2 cost activity in other regions. No instances were started, stopped, or modified.

Ohio (us-east-2) inventory found:

| Name | Instance | Type | State |
|---|---|---|---|
| 1_Wilknot | i-04e8fd9c71577e7a6 | t2.xlarge | Stopped |
| 3_Wilknot_DB | i-0a2d74343f3e3c3ea | t2.xlarge | Stopped |
| 2_Wilknot_Node | i-08ddda719b6cb86c4 | t2.xlarge | Stopped |
| Debain Instance | i-02adea1fba64ea0f5 | t2.medium | Stopped |
| DebianHFC | i-0784ca9343554db81 | t2.medium | Running |
| OrioApp | i-0fcfe4df90cc95d29 | t2.medium | Running |
| OrioWebDapp | i-06cba5386fba3841b | c5.xlarge | Stopped |

`OrioApp` has Elastic IP `52.14.199.108`, matching the apex and www DNS A records. This establishes a concrete migration dependency; application behavior and data are not yet verified. Both running Ohio instances displayed 2/2 checks passed. A complete cross-region inventory and database/backups/secrets assessment remain pending.

Route 53 contains the public `orio.io` zone `Z10370061YQMEZGKU5P4Y` with ten records. The complete observed values and TTLs are preserved in ORIO_DNS_SNAPSHOT.json, including SES, DKIM, autodiscover, and ACM validation records. No records were changed.

## Namecheap

The authorized Chrome session can access ORIO.IO domain management. Domain status ACTIVE; expiration August 7, 2027; domain auto-renew enabled; domain privacy protection enabled. Custom DNS delegates to the four previously observed AWS nameservers. The Advanced DNS page displays an unchecked DNSSEC control. Namecheap indicates host and mail records are managed outside its DNS editor. No domain, DNS, security, billing, contact, or renewal settings were changed.

Account dashboard displayed two-factor authentication OFF. Security enrollment requires the account owner and should be addressed before production domain changes. No authentication configuration was changed.

## Next steps

Complete Route 53 zone and cross-region resource inventory. Preserve all mail and verification records. Resolve GCP billing before deploying billable infrastructure. Continue engineering and local verification independently of that deployment blocker.
