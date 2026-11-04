# ORIO SPC 3 engineering

Preserve legacy source and Git history. Place new SPC 3 code in separate modules until migration is verified. Never run legacy wallet code or copy historical credentials into new environments.

Use exact integer monetary units at every persistence/API boundary. Reject JavaScript number inputs for money. Corrections to accounting are compensating journals, never edits. No real-money operation is enabled by local test results.

New modules must document their authorization boundary, failure behavior, meaningful verification, and remaining integration work. Use strict TypeScript and parameterized database queries. Keep dependency versions locked. Avoid logging customer data, keys, or credentials.

## Agent skills

### Issue tracker

GitHub repository `wilkont/orio`; external PRs are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical five-role vocabulary; this setup does not create remote labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
