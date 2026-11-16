#!/usr/bin/env bash
# Credential-free preparation in PUBLIC CloudShell only. This script never
# retrieves a secret, connects to PostgreSQL, creates AWS resources or calls S3.
set -euo pipefail
umask 077

orio_audit_build=$(mktemp -d /tmp/orio-public-audit-XXXXXX)
orio_audit_service="$orio_audit_build/services/control-foundation"
orio_audit_source=https://raw.githubusercontent.com/wilkont/orio/32bc7ca0359f1f46f1fae258b11cfb382cf64659/services/control-foundation
mkdir -p "$orio_audit_service/src" "$orio_audit_service/scripts"

curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 120 \
  https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz \
  -o "$orio_audit_build/node-v24.22.1-linux-x64.tar.xz"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem \
  -o "$orio_audit_build/rds-ca.pem"
cd "$orio_audit_build"
printf '%s\n' \
 '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6  node-v24.22.1-linux-x64.tar.xz' \
 'b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77  rds-ca.pem' | sha256sum -c -
tar -xJf node-v24.22.1-linux-x64.tar.xz

for orio_audit_file in package.json package-lock.json scripts/audit-hosted-schema.ts \
 scripts/audit-hosted-from-secrets.ts src/schema-audit.ts src/hosted-audit-identity.ts; do
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_audit_source/$orio_audit_file" -o "$orio_audit_service/$orio_audit_file"
done
cd "$orio_audit_service"
printf '%s\n' \
 'ef3a2212677e028edbd11bc182e8d7bc2f0b5450c9062bfdc6ad73d9eca47bc2  package.json' \
 'b6cf06adbf17e8672cb2be0688306225388111059d67d381f1283931a8d846c0  package-lock.json' \
 '22fc140b6fe0963a36680a19bf554ee21241f0755bfd7ff629205705464c213a  scripts/audit-hosted-schema.ts' \
 '7f2a7f18de79390cfcf906acc6f4c4b287e8e4cfa6fbc1023f61cc5fae27a531  scripts/audit-hosted-from-secrets.ts' \
 '113e90dc875b6229c53f5ea2f62fdff54e9b3093550a22e68000d9e108bd19df  src/schema-audit.ts' \
 '2cc8bc7deecdee564899fbf33984fbf09240c6378b55e0619280befab61cdfe0  src/hosted-audit-identity.ts' | sha256sum -c -

touch "$orio_audit_build/npm-user-empty" "$orio_audit_build/npm-global-empty"
"$orio_audit_build/node-v24.22.1-linux-x64/bin/node" \
 "$orio_audit_build/node-v24.22.1-linux-x64/lib/node_modules/npm/bin/npm-cli.js" \
 --userconfig "$orio_audit_build/npm-user-empty" --globalconfig "$orio_audit_build/npm-global-empty" \
 ci --omit=dev --ignore-scripts --no-audit --no-fund

cd "$orio_audit_build"
"$orio_audit_build/node-v24.22.1-linux-x64/bin/node" --input-type=module -e \
 'await import("./services/control-foundation/src/schema-audit.ts");console.log("AWS_LINUX_AUDIT_IMPORT_VERIFIED")'
find services -type f -print0 | sort -z | xargs -0 sha256sum > audit-source-sha256.txt
tar -cf inputs.tar services audit-source-sha256.txt node-v24.22.1-linux-x64.tar.xz rds-ca.pem
printf 'ORIO_AUDIT_BUILD=%s\n' "$orio_audit_build"
sha256sum inputs.tar

# The tar archive digest can vary with timestamps. Record and verify the new
# digest at the private destination; do not reuse a prior archive's digest.
# A missing/changed source, runtime, CA or dependency fails before packaging.
