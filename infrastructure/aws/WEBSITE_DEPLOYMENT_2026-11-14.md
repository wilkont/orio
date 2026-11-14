# ORIO.IO public website deployment

Completed November14,2026. https://orio.io and https://www.orio.io now serve the26-page informational release using the owner's existing white/blue Dot preview design, original ORIO logo and circular USDC artwork. The website does not collect credentials or funds and does not present financial services as launched.

## Verified delivery

- Target: account710096437887, us-east-2, OrioApp i-0fcfe4df90cc95d29,52.14.199.108. This is the legacy website account, separate from the new platform account720232346199.
- Existing AWS Instance Connect authenticated a non-root Ubuntu shell. No IAM grant, network-rule change, long-lived SSH key, endpoint resource or password was created. The shell was logged out after verification.
- Static source: wilkont/orio-website commit85efad56b66d010f9b3b76751c0776912054887c. Guarded deployment helper:059d96a8fb8bf59df1498d419f9c280164a1d635, SHA2565d85b494441dd175464fe5385e8bb0bb27481fa155423b3d6bbe8fd5f557086a.
- Backup:59 original regular files matched the archive before and after backup. The existing /var/www/html/orio/build directory was not changed. Root-owned archive SHA256438e76f6a2b92565fb930e83797d15a03a2006810dfbec564ad629784e0632da.
- Backup/state: /var/backups/orio-spc/20261114T202641Z-85efad56b66d/stage.json. Its directory is administrator-only; configuration/archive/state files are mode0600.
- Active candidate: /var/www/orio-spc/releases/85efad56b66d010f9b3b76751c0776912054887c. Nginx configuration SHA2562b1c970d426b481da28953b82944eb60f5af822cfc4557c48b90c3fcbc01d752.
- Nginx syntax passed before reload. Every32-file release object matched the source over HTTPS on both domains, including MIME types. Independent public HTTPS checks matched the same64 responses at2026-11-14T20:28:42.314857+00:00. Browser confirmed the Dot presentation and zero-holder fee calculation.

## Boundaries and rollback

The /api proxy location and TLS/redirect configuration were preserved. Only static website root/routing, JavaScript-module MIME handling and static response headers changed. No database, custody, financial transaction, contract, DNS, IAM, package upgrade or server reboot operation occurred. This does not qualify the legacy API or make it an SPC3 API.

The deployment helper refuses configuration drift, validates candidate membership/hashes and restores/reloads the exact original configuration if syntax, reload or HTTPS checks fail. Six tests cover those guards, the observed commented Nginx example block, and rollback control flow. The original config and build archive remain under the root-owned backup path. Any later rollback must first compare the active configuration identity and account for intervening operator changes; do not blindly overwrite a newer config. The byte-verified static backup is not a database backup or full disaster-recovery drill.

The login banner reported124 available updates,6 standard security updates and a required reboot. Its update-cache freshness was not independently established. No upgrades or reboot were performed during website deployment; this remains operational qualification work before a financial release.

## Remaining platform work

The live informational website is separate from the financial platform. Hosted application/database upgrades, consumer authorization and recovery, custody/reserve arrangements, complete network-cost attribution, custom bundler/paymaster admission, production contracts and release-specific acceptance remain outstanding. Qualification contracts still reject Base mainnet. External review remains advisory, not a waiting requirement. The source merges and passing tests do not manufacture financial authorization or reserve evidence.
