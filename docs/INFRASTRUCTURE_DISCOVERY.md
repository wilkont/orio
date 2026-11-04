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

## Additional authenticated discovery

### ORIO application server

Read-only details for `OrioApp` (`i-0fcfe4df90cc95d29`) confirm:

- Ubuntu Jammy 22.04 AMI name dated December 6, 2022; the running guest patch level is not verified by its launch image.
- VPC `vpc-380b8e53`, subnet `subnet-85fa56ee`, no displayed IAM instance role or Auto Scaling group.
- IMDSv2 optional; detailed monitoring, termination protection, and stop protection disabled.
- Root volume `vol-0ea68e0edb175d630`, `/dev/sda1`, 8 GiB, unencrypted, delete-on-termination enabled.
- Security group `sg-0a04f4f3d3750ffe9` (`launch-wizard-12`) permits TCP 22, 80, 443, and 5000 from `0.0.0.0/0`; outbound permits all traffic to `0.0.0.0/0`. These are configured network rules, not evidence that every port has a listening service.

The EC2 snapshot inventory scoped to **Owned by me** in us-east-2 displayed no snapshots. The RDS database inventory in us-east-2 displayed zero databases. These observations do not rule out self-managed databases, other regions/accounts, shared snapshots, external database providers, or other backup systems. Do not assume a migration rollback exists.

### S3 inventory

The account-wide general-purpose bucket list contained ten buckets:

| Bucket | Region |
|---|---|
| backup.3494230185 | us-east-2 |
| backup.db.25.236.31.117 | us-east-2 |
| backup.node.352362926 | us-east-2 |
| codepipeline-us-east-2-476319253477 | us-east-2 |
| db3523631117 | us-east-2 |
| elasticbeanstalk-us-east-2-710096437887 | us-east-2 |
| nftsorio | us-east-2 |
| node352362926 | us-east-2 |
| realfiles | ap-south-1 |
| wilknot3494230185 | us-east-2 |

Inspected bucket `backup.db.25.236.31.117`: its root listing showed 26 entries, including server configuration directories, SSH/AWS-related directories, application directories, and archives. Listed root-file timestamps were January 21, 2021; nested content freshness was not assessed. No sensitive directory contents or object bodies were opened. Bucket settings showed Block all public access **On**, versioning **Disabled**, MFA delete **Disabled**, Object Lock **Disabled**, server access logging **Disabled**, default encryption **SSE-S3**, and Object Ownership **Object writer** with ACLs enabled. Default encryption for new objects does not prove encryption of every historical object. No successful restore or database consistency evidence exists yet.

### DNSSEC

The Route 53 DNSSEC tab explicitly displayed **Not signing** and no key-signing keys, corroborating the unchecked Namecheap DNSSEC control. No DNS/security settings were changed.

### Access boundary

GitHub repository reads/fetches and AWS console reads are working. No SSH/SSM session to an instance has been established; access to deployed source, service configuration, application logs, guest patch state, and live database contents remains unverified. No cloud data or resources were modified during this follow-up discovery.
