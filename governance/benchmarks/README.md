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

Run `bash governance/benchmarks/fetch.sh` manually. (`session_start_governance_check.sh` Check 4 is meant to remind when the receipt is over 30 days old, but it currently reads `$GOVERNANCE_STATE_DIR/benchmarks/last-fetch.txt` and requires an executable `fetch.sh`, while `fetch.sh` is committed as 100644 and writes `infra/governance/runtime/benchmarks/last-fetch.txt` — so it never computes a reminder; and even when it does, session_start puts it in soft `REMINDERS`, which the hook never emits — only BLOCKERs and prune triggers are output. Recorded 2026-11-17 knowledge-prune; there is no automatic freshness reminder today, and no scheduled refresh workflow exists.)

`fetch.sh` is **fail-silent**: network errors do not block product work; it updates `last-fetch.txt` only after at least one successful fetch and appends failures to runtime evidence.

## Why

Session memory forgets. World-class DS ship changes we should track (new Material 3 tokens, Polaris v13 breaking changes, Claude Code 9.0 feature). Without a local store + refresh cadence, we drift.

Per AGENTS.md `# 治理 canonical` → external signal driving internal governance.
