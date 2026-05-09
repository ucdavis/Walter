# AGENTS.md

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `ucdavis/Walter`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout with `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Comment strategy

- Use XML summary comments on persisted domain model properties and public service methods when the name alone does not capture the business or operational meaning.
- Use simple XML summary comments on private helper methods that encode concurrency, locking, retry, security, or data-retention invariants.
- Add short inline comments before concurrency, locking, retry, security, or data-retention logic that would be easy to misread.
- Prefer comments that explain why a rule exists or what invariant it protects; do not narrate obvious assignments or framework boilerplate.
- Keep comments current when changing behavior. A stale comment is worse than no comment.
