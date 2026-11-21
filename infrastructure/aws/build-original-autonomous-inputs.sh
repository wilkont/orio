#!/usr/bin/env bash
# Credential-free preparation only. No AWS API, database access or deployment.
set -euo pipefail
umask 077
orio_autonomous_commit=${1:-}
[[ $orio_autonomous_commit =~ ^[a-f0-9]{40}$ ]] || { printf 'Supply the reviewed full source commit\n' >&2; exit 1; }
orio_autonomous_build=$(mktemp -d /tmp/orio-original-autonomous-inputs-XXXXXX)
orio_autonomous_service="$orio_autonomous_build/services/control-foundation"
orio_autonomous_source="https://raw.githubusercontent.com/wilkont/orio/$orio_autonomous_commit"
mkdir -p "$orio_autonomous_service"/{src,scripts,config,pending-migrations} "$orio_autonomous_build/infrastructure/aws"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 120 \
 https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o "$orio_autonomous_build/node.tar.xz"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
 https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem -o "$orio_autonomous_build/rds-ca.pem"
cd "$orio_autonomous_build"
printf '%s\n' '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6  node.tar.xz' \
 'b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77  rds-ca.pem' | sha256sum -c -
tar -xJf node.tar.xz
for orio_autonomous_file in package.json package-lock.json src/hosted-upgrade.ts src/schema-audit.ts \
 src/restore-qualification-target.ts src/qualification-session.ts src/autonomous-qualification-session.ts \
 src/journal-original-context.ts src/autonomous-bootstrap.ts src/autonomous-original-context.ts scripts/install-original-autonomous-ledger.ts scripts/prepare-original-autonomous-context.ts \
 pending-migrations/022_autonomous_settlement.sql; do
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_autonomous_source/services/control-foundation/$orio_autonomous_file" -o "$orio_autonomous_service/$orio_autonomous_file"
done
for orio_autonomous_file in hosted-sql-maintenance.json; do
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_autonomous_source/infrastructure/aws/$orio_autonomous_file" -o "$orio_autonomous_build/infrastructure/aws/$orio_autonomous_file"
done
cd "$orio_autonomous_service"
touch "$orio_autonomous_build/npm-user-empty" "$orio_autonomous_build/npm-global-empty"
"$orio_autonomous_build/node-v24.22.1-linux-x64/bin/node" "$orio_autonomous_build/node-v24.22.1-linux-x64/lib/node_modules/npm/bin/npm-cli.js" \
 --userconfig "$orio_autonomous_build/npm-user-empty" --globalconfig "$orio_autonomous_build/npm-global-empty" ci \
 --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/
"$orio_autonomous_build/node-v24.22.1-linux-x64/bin/node" --input-type=module -e \
 'import{reviewedAutonomousSql}from"./src/autonomous-bootstrap.ts";await reviewedAutonomousSql();console.log("REVIEWED_AUTONOMOUS_SQL_VERIFIED")'
cd "$orio_autonomous_build"
find services infrastructure -type f -print0 | sort -z | xargs -0 sha256sum > source-sha256.txt
printf 'ORIO_AUTONOMOUS_BUILD=%s\n' "$orio_autonomous_build"
# Only after specific original approval: create a NEW recovery checkpoint/maintenance
# environment, capture fresh original-only context outside this source tree, and
# transfer the bounded package through the owner-only encrypted rehearsal bucket.
