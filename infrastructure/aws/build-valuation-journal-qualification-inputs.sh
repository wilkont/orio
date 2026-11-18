#!/usr/bin/env bash
# Credential-free preparation only. No AWS API, database access or deployment.
set -euo pipefail
umask 077
orio_journal_commit=${1:-}
[[ $orio_journal_commit =~ ^[a-f0-9]{40}$ ]] || { printf 'Supply the reviewed full source commit\n' >&2; exit 1; }
orio_journal_build=$(mktemp -d /tmp/orio-journal-inputs-XXXXXX)
orio_journal_service="$orio_journal_build/services/control-foundation"
orio_journal_source="https://raw.githubusercontent.com/wilkont/orio/$orio_journal_commit"
mkdir -p "$orio_journal_service"/{src,scripts,config,pending-migrations} "$orio_journal_build/infrastructure/aws"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 120 \
 https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o "$orio_journal_build/node.tar.xz"
curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
 https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem -o "$orio_journal_build/rds-ca.pem"
cd "$orio_journal_build"
printf '%s\n' '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6  node.tar.xz' \
 'b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77  rds-ca.pem' | sha256sum -c -
tar -xJf node.tar.xz
for orio_journal_file in package.json package-lock.json src/hosted-upgrade.ts src/schema-audit.ts \
 src/restore-qualification-target.ts src/qualification-session.ts src/valuation-journal-qualification-session.ts \
 src/valuation-journal-bootstrap.ts scripts/qualify-valuation-journal.ts scripts/prepare-valuation-journal-context.ts \
 config/valuation-journal-bootstrap-checksums.json pending-migrations/020_reserve_valuation_signing.sql pending-migrations/021_valuation_runtime_functions.sql; do
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_journal_source/services/control-foundation/$orio_journal_file" -o "$orio_journal_service/$orio_journal_file"
done
for orio_journal_file in sql-qualification.json valuation-journal-bootstrap.sql; do
 curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --silent --show-error --location --max-time 30 \
  "$orio_journal_source/infrastructure/aws/$orio_journal_file" -o "$orio_journal_build/infrastructure/aws/$orio_journal_file"
done
cd "$orio_journal_service"
touch "$orio_journal_build/npm-user-empty" "$orio_journal_build/npm-global-empty"
"$orio_journal_build/node-v24.22.1-linux-x64/bin/node" "$orio_journal_build/node-v24.22.1-linux-x64/lib/node_modules/npm/bin/npm-cli.js" \
 --userconfig "$orio_journal_build/npm-user-empty" --globalconfig "$orio_journal_build/npm-global-empty" ci \
 --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/
"$orio_journal_build/node-v24.22.1-linux-x64/bin/node" --input-type=module -e \
 'import{reviewedValuationJournalPlan}from"./src/valuation-journal-bootstrap.ts";console.log("REVIEWED_JOURNAL_SOURCES_VERIFIED",(await reviewedValuationJournalPlan()).length)'
cd "$orio_journal_build"
find services infrastructure -type f -print0 | sort -z | xargs -0 sha256sum > source-sha256.txt
printf 'ORIO_JOURNAL_BUILD=%s\n' "$orio_journal_build"
# Only after separate approval: create a NEW private snapshot/clone/maintenance
# environment, capture fresh clone-only context outside this source tree, and
# transfer the bounded package through the owner-only encrypted rehearsal bucket.
