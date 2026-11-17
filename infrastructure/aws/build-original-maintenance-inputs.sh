#!/usr/bin/env bash
# Credential-free PUBLIC CloudShell preparation; no AWS API or SQL operation.
set -euo pipefail
umask 077
orio_sql_commit=${1:-}
[[ $orio_sql_commit =~ ^[a-f0-9]{40}$ ]] || { printf 'Supply the reviewed full source commit\n' >&2; exit 1; }
orio_sql_build=$(mktemp -d /tmp/orio-original-inputs-XXXXXX)
orio_sql_service="$orio_sql_build/services/control-foundation"
orio_sql_source="https://raw.githubusercontent.com/wilkont/orio/$orio_sql_commit"
mkdir -p "$orio_sql_service/src" "$orio_sql_service/scripts" "$orio_sql_service/config" "$orio_sql_service/migrations" "$orio_sql_build/infrastructure/aws"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 120 \
 https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o "$orio_sql_build/node.tar.xz"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
 https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem -o "$orio_sql_build/rds-ca.pem"
cd "$orio_sql_build"
printf '%s\n' '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6  node.tar.xz' \
 'b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77  rds-ca.pem' | sha256sum -c -
tar -xJf node.tar.xz
for orio_sql_file in package.json package-lock.json src/hosted-upgrade.ts src/schema-audit.ts src/restore-qualification-target.ts src/qualification-session.ts src/hosted-maintenance-session.ts \
 scripts/upgrade-original-hosted-sql.ts scripts/prepare-original-maintenance-context.ts config/hosted-upgrade-checksums.json; do
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_sql_source/services/control-foundation/$orio_sql_file" -o "$orio_sql_service/$orio_sql_file"
done
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
 "$orio_sql_source/infrastructure/aws/hosted-sql-maintenance.json" -o "$orio_sql_build/infrastructure/aws/hosted-sql-maintenance.json"
cd "$orio_sql_service"
printf '%s\n' '94eb5ab25c6bcbdd90d3fa3344e33d2bd166d25ae53d19422a1f614acbcc8224  config/hosted-upgrade-checksums.json' | sha256sum -c -
while IFS= read -r orio_sql_migration; do
 [[ $orio_sql_migration =~ ^[0-9]{3}_[a-z_]+\.sql$ ]] || exit 1
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_sql_source/services/control-foundation/migrations/$orio_sql_migration" -o "$orio_sql_service/migrations/$orio_sql_migration"
done < <("$orio_sql_build/node-v24.22.1-linux-x64/bin/node" --input-type=module -e \
 'import fs from "node:fs";console.log(Object.keys(JSON.parse(fs.readFileSync("config/hosted-upgrade-checksums.json","utf8"))).join("\n"))')
touch "$orio_sql_build/npm-user-empty" "$orio_sql_build/npm-global-empty"
"$orio_sql_build/node-v24.22.1-linux-x64/bin/node" "$orio_sql_build/node-v24.22.1-linux-x64/lib/node_modules/npm/bin/npm-cli.js" \
 --userconfig "$orio_sql_build/npm-user-empty" --globalconfig "$orio_sql_build/npm-global-empty" ci --omit=dev --ignore-scripts --no-audit --no-fund
"$orio_sql_build/node-v24.22.1-linux-x64/bin/node" --input-type=module -e \
 'import{ReviewedUpgrade}from"./src/hosted-upgrade.ts";console.log("REVIEWED_QUALIFICATION_SOURCES_VERIFIED",(await ReviewedUpgrade.load(new URL("./migrations/",import.meta.url),new URL("./config/hosted-upgrade-checksums.json",import.meta.url))).entries.length)'
cd "$orio_sql_build"
find services infrastructure -type f -print0 | sort -z | xargs -0 sha256sum > source-sha256.txt
printf 'ORIO_SQL_BUILD=%s\n' "$orio_sql_build"
# After the separately approved stack is ready, capture fresh context outside
# this source tree, retain its digest, then package the context with these exact
# sources/runtime/CA and verify the complete tar digest at its private destination.
