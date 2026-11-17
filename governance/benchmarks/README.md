# Governance benchmark signals

Provider-neutral external-signal configuration for `/knowledge-prune` Phase 0.5 and `/design-system-audit` world-class checks. Fetched bytes and timestamps are disposable runtime evidence under `infra/governance/runtime/benchmarks/`; they are never policy or SSOT.

## Contents

| File | Purpose | Refresh cadence |
|------|---------|----------------|
| `infra/governance/runtime/benchmarks/claude-code-features.md` | Claude Code release notes / new features | Monthly |
| `infra/governance/runtime/benchmarks/codex-changelog.html` | Codex release notes / new features | Monthly |
| `infra/governance/runtime/benchmarks/external-ds-snapshots/*` | Polaris / Material / Atlassian snapshots | Monthly |
| `infra/governance/runtime/benchmarks/last-fetch.txt` | Timestamp of last successful fetch | Updated by `fetch.sh` |

## Refresh

Run `bash governance/benchmarks/fetch.sh` manually. Freshness is looked at only by `/governance-health` Phase 1 (metric harvest: `last-fetch.txt` older than 30 days = stale). No hook reminds you, and no scheduled refresh workflow exists. (`session_start_governance_check.sh` used to carry a Check 4 for this; it read a different path from the one `fetch.sh` writes, and its result went to a reminder variable the hook never printed. Removed 2026-11-18.)

`fetch.sh` is **fail-silent**: network errors do not block product work; it updates `last-fetch.txt` only after at least one successful fetch and appends failures to runtime evidence.

## Why

Session memory forgets. World-class DS ship changes we should track (new Material 3 tokens, Polaris v13 breaking changes, Claude Code 9.0 feature). Without a local store + refresh cadence, we drift.

Per AGENTS.md `# 治理 canonical` → external signal driving internal governance.
