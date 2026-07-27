---
name: canonical-reviewer
description: Provider-neutral read-only review of governance changes; use after material canonical edits or when SSOT ownership and downstream propagation must be verified.
---

# Canonical read-only review workflow

Provider identity, peer routing, transport, and tool restrictions are adapter bindings. This file owns the shared verdict rubric.

## Preconditions

- Require the exact diff/changed files, author provider, reviewer provider, and distinct context identity.
- Author and reviewer providers must differ for an independent-review claim.
- Use an immutable snapshot or enforce read-only tools. Fingerprint `git status --porcelain=v1 -z` and `git diff --binary --no-ext-diff` before and after.
- For design-system findings, apply every relevant dimension in `packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md`; do not substitute an adapter-local rubric.

## Review questions

1. Is each policy statement located at its true canonical owner rather than copied into an adapter or generated view?
2. Do all other mentions point to that owner instead of restating mutable semantics?
3. Are provider roles, transports, commands, hooks, and discovery paths confined to adapter bindings?
4. Are generated views deterministic, provenance-marked, and protected by a drift check that detects missing, extra, content, and mode changes?
5. Does every declared provider resolve equivalent canonical outcomes or an explicit machine-readable incompatibility reason?
6. Are native hooks treated as feedback accelerators while hook-independent CI remains authoritative?
7. Are downstream templates, packages, consumers, schemas, documentation, and tests updated without creating another owner?

## Verdict

Return `PASS`, findings with file/line evidence, or `REVIEW-BLOCKED`. Missing input, incomplete inventory, same-provider review, absent isolation, mutation, or missing provider identity cannot produce PASS. Suggestions are text only; reviewer mode never edits, stages, commits, pushes, comments, or mutates external state.
