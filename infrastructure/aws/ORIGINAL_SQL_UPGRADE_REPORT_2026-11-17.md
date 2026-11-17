# Original hosted SQL upgrade

The owner-approved original database maintenance committed migrations 003-019 in one transaction on 2026-11-17T18:34:56.649Z. The original private PostgreSQL 17.9 ledger in AWS account 720232346199, us-east-1, now has the qualified control schemas. Financial operations were not activated, and no application login, signing permission, reserve transfer or mainnet operation was created.

## Actual acceptance evidence

The original-only executor used pinned source commit `52ed00fc72b0bd14b499d2c35c598085a85ea564`, the reviewed seventeen migration checksums and exact original endpoint/secret identity. Its baseline catalog matched `8374196a216470ba79eb63c908ed801d8b0b04ba9a19859ae08919ca58a4f09d`. Strict RDS certificate/hostname verification was enabled. The administrator password was obtained only in process memory through the original-secret-specific private endpoint; CLI response history was disabled and no password was printed or persisted.

The transaction verified existing journal history, compared server-side preservation hashes/counts before and after all migrations, and exercised large-integer/idempotent journal posting as the restricted runtime role. Its synthetic probe was rolled back. Issuance remained paused with no monetary deployment or signing-preparation configuration. An affirmative COMMIT acknowledgement and post-commit audit established the successful result. The resulting catalog fingerprint is `c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db`, matching the actual disposable RDS rehearsal. Historical 001/002 installation versions were not inferred or rewritten.

The successful private report SHA256 is `93f21bb0b0ef56d8a107bbc92172e1699d1d9b21c7777f1c5fa825d4a5462e5e`. Its exact committed filenames/checksums and safe acceptance flags are published in [the sanitized receipt](ORIGINAL_SQL_UPGRADE_RECEIPT_2026-11-17.json). Customer records, financial preservation counts/hashes and credentials are excluded from Git.

## Authentication gap and fresh recovery checkpoint

AWS expired the administrator session during the earlier private-session startup, before password retrieval or SQL execution. After the owner signed in again, authenticated resource checks confirmed the exact owned ten-resource maintenance stack, unchanged source protections and absence of SQL progress/result objects. The advertised automated recovery window covered the old unused checkpoint.

The unused checkpoint was then replaced with a fresh encrypted snapshot of the original. Once it was available, the original-only metadata capture validated the source, narrow maintenance ingress, fresh snapshot, deployed-template equivalence and managed-secret identity. The existing stale input object was replaced conditionally using its authenticated ETag, only after confirming that no SQL receipt existed. All source, runtime, CA, context and archive checksums were verified again inside the approved private environment before execution. No uncertain SQL transaction was replayed.

The fresh context SHA256 is `5e0b8292df7d98d4395df01c62ab18b4d2e0d850360fc6213601561e9b49abba`; the private input archive SHA256 is `91e6fd211682762747685668235c848fdd0209f8a5ade8a6ab5d11a441229d9b`. The retained four-file evidence archive SHA256 is `62a1745a673821ad38c1e4ed3f0a08126c7946996ac6b14376a6b8c0ed22b64c`. Its members and individual report/context hashes were verified on the owner's computer. The retained directory and files permit only the owner and Windows SYSTEM. Privileged OS administrators can override these controls; no hardware secrecy claim is made.

## Recovery coverage and cleanup

Cleanup completed at 2026-11-17T18:47:24.700406+00:00. AWS confirmed DELETE_COMPLETE and absence of the temporary snapshot, groups, interfaces, endpoints, bucket and gateway route. The private CloudShell environment was deleted without forced interface detachment. Original ingress returned to empty; the available/private/encrypted/Multi-AZ/deletion-protected original database, managed-secret identity, required TLS and 14-day automated recovery protection were preserved. Before the disposable manual checkpoint was deleted, the checked recovery window covered its 2026-11-17T18:28:03.021Z creation and the 2026-11-17T18:34:56.649Z accepted upgrade. The final check confirmed continued coverage after cleanup. Provider-advertised recovery metadata is not a claim that a new point-in-time restore was exercised. The earlier successful physical restore rehearsal remains separate evidence.

The USD5 additional limit is the owner's authorization ceiling, not a measured invoice or technical billing cap. No further spending approval was inferred from authentication refresh. All temporary access/storage resources and the disposable checkpoint must be checked absent after cleanup; permanent protections, original secret identity, empty ingress and automated backups must be preserved.

## Remaining production work

The schema upgrade is complete; hosted application identities/private workloads, operational provider integration, actual reserve arrangements, production signing and accountable financial release qualification remain unfinished. Existing test-network contracts and the informational website do not constitute a live financial service. External review remains advisory.

Cleanup report SHA256: `c3fffa8e29078dc0219fa7154b482ac508554c81e16c2dd0f227e7ce2d59d3a1`. Recovery-coverage report SHA256: `c83d7b71c9ad2e9c0c1e9bf513f27aa1c5354b5ffc099c30f8d36af80906c028`. The four-file cleanup archive SHA256 is `784338843ae1d41d1fbb19dc9ef32e311abefea5da8eb23210b9d0ff13d3f9d5`; its members/hashes were verified on the owner's computer and retained privately. All 235 control-foundation local tests and strict TypeScript pass on the prepared source; the hosted receipt independently records the actual accepted RDS execution.
