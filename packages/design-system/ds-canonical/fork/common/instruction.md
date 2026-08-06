# Product consumer AI governance (provider-neutral)

> **Generated view**: upstream `build-fork-governance.mjs` publishes this source as `AGENTS.md`; never
> edit the generated copy. Claude loads it via `CLAUDE.md`, Codex and other agents load it directly.

## Authority and trust boundary

- This repository builds a product against exact versions of `@qijenchen/design-system` and
  `@qijenchen/storybook-config`; it never authors or publishes them.
- Merge enforcement is protected `main` requiring exactly one `Verify consumer` check, which runs the
  locked install, typecheck, import lint, and build against the exact candidate head.
- Native Claude/Codex hooks are fast feedback only; hookless operation is judged by the same hooks-off
  checker. Hook commands scrub inherited startup injection before repository launchers, and the provider
  host stays an external trust boundary — hooks never replace protected CI.
- Run `npm run setup:all` in every fresh local checkout and hosted setup/cache-refresh lifecycle: it
  installs the committed lock, verifies signatures, and runs the exact checker. SessionStart only verifies.
- `governance/lock.json`, managed provider adapters, and managed skills are generated upstream.
  Product-specific, provider-neutral policy belongs in `governance/overlay.md` (read it when present);
  it may add stricter product rules but never replaces or weakens upstream controls.
- Never install a mutable tag or semver range for internal packages. Upgrades are reviewed pull
  requests pinning an exact version with the regenerated lock/adapters.
<!-- canonical-decision-authority:start -->
**Decision／Engineering Authority**:user 只拍板產品／UI／UX SSOT 真取捨及可感知／產品語意變更（behavior/interaction/IA/visual/token/layout/content/a11y/canonical rules）；核准 = user 在對話中對 exact target + choice 說可（**「我說可以就是可以，就是授權」— user 2026-08-04 verbatim**；最新一則 user 訊息的明確 blanket 授權即核准當下 pending 的 exact 提案）。operation digest 為可選佐證——有引且相符可加強、有引但不符 fail-closed、未引不阻擋（強制引 digest 屬已拆除的 per-PR 簽章同族儀式，835b519e 先例）。引用/條件/舊 scope/跨 target 無效。其餘工程/external writes 皆 Standing Authorization AUTO，含已核准 UI／UX 實作/機械 generation/sync 與 source→commit/PR/merge→canonical `infra/governance/release-workflow.json` 的 `pr-checks → merge → publish → readback → consumer`；依 frozen scope、SSOT、required checks、security、least privilege、rollback/readback 收斂，不逐 milestone 重問。Deep Audit 必須在單一 branch／PR 完成 remediation 與 local/CI candidate validation，禁止把 immutable publish 當 iteration/test loop，每次 audit 最多一次 final release；只有另有 evidence ref 綁定 incident ID、failure class、published version 的 post-publish blocker 或 security incident 才可額外 release。Certification、rollout、staged rollout、preview/canary 與 independent review 是明確要求時的附加 assurance，不得進入標準 five-step release blocking graph；peer 不可用只阻擋明確要求的 independent-review claim。

**Visual baseline**:user 對 exact image set／UI／UX 語意說「可以改」即拍板；Agent 自動 apply/generate/test/commit/PR/CI/merge，禁再核准/key enrollment/簽章。僅 user 明確要求 independent cryptographic review 才啟用 `visual-baseline-review-policy.json`，否則不阻擋。

**Human-only boundaries**:僅 login/MFA/OAuth/owner/billing、缺 credential reference（只問 vault/Environment/Secret Manager reference，禁 secret）、plan 外付費、法律/帳號/組織權限/商業承諾及上述產品決策。Agent 完成唯一方案/preflight，只問一個 exact action，readback 後續跑；technical failure fail-closed，非 human decision。Release 常見的 login/MFA/OAuth/credential reference 完成後一律 AUTO resume，不另問核准。
<!-- canonical-decision-authority:end -->

## Six working principles

1. **World-class, no shortcuts**: visual and interaction decisions must be defensible against at least
   three relevant systems (Polaris, Material, Atlassian, Ant, Carbon, Apple HIG).
2. **Consume before inventing**: search the installed public API, nearest component spec, token, and
   pattern before adding a value, wrapper, variant, or layout primitive.
3. **Change all affected surfaces**: product code, tests/stories, and docs move together. A DS defect is
   reported upstream with a minimal reproduction; never patch `node_modules`.
4. **Use real product scenarios**: examples show recognizable business work, not Option A/B/C
   placeholders or minimal mocks that conceal composition problems.
5. **Ask only for a genuine product decision**: first search current product usage and the nearest
   shipped DS spec; stop only when the remaining choice changes product UX or canonical meaning.
6. **Fix the invariant, not one symptom**: search sibling occurrences, add a regression proof, and route
   reusable DS/template defects to their canonical upstream owner.

## Before changing product UI

Record the canonical inputs you inspected: public component/pattern exports; the nearest shipped
`*.spec.md` and token docs under `node_modules/@qijenchen/design-system/src/`; a nearest shipped story
or real product precedent; and any product-specific exception with its concrete rationale.

Only import public package exports. Deep imports, copied DS source, raw primitive reimplementations,
magic visual values, and undocumented escape markers are governance failures.

## Layout and composition model

Every new product composition identifies its closest family before implementation:

| Family | Use | Canonical owner |
|---|---|---|
| Menu/list item | Scanning and reading rows | shipped `patterns/element-anatomy` spec |
| Pill | One-line action or state pill | shipped `components/Button` spec |
| Field control | Editable input and display state | shipped `components/Field` specs |
| Self-contained | No shared row/field anatomy | nearest public component spec, with rationale |

Macro spacing consumes `--layout-space-{tight,loose,bottom}` as specified. Fixed micro geometry is
allowed only when the shipped spec makes it intentional and the exception is narrowly documented.

## Verification contract

Run every check this product has and report its real outcome. The minimum repository-wide contract is
`npm run governance:check` (exact installed, hooks-off authority), `npm run typecheck`, `npm run build`,
product lint/test/a11y scripts when present, and browser or Storybook visual verification for
user-visible changes.

Never replace a check with `true`, an empty script, a notice-only waiver, or an unverified claim.
Missing required tooling is a failure, not a pass. Evidence must bind the checked source snapshot.

## Claude, Codex, and future agents

- Registry materializers project one skill source into every enabled provider view; no view is SSOT.
- Native events enter one immutable hook corpus; unsupported events use the exact checker/protected-CI
  fallback and are never presented as native parity.
- Future providers read `AGENTS.md` and use the same checks; adapters cannot redefine semantics.
- An explicitly requested independent-review deliverable needs a distinct certified peer and immutable
  read-only evidence, or the report claims `REVIEW-BLOCKED`. Peer availability never blocks ordinary
  engineering or the standard five-step release. Product review cannot authorize DS/template/release
  changes; route reusable defects upstream.

## Git and release flow

- The upstream design-system authority owns the machine-readable release SSOT at
  `infra/governance/release-workflow.json`: `pr-checks → merge → publish → readback → consumer`. Every
  engineering step is AUTO; only an unresolved product/UI/UX SSOT choice is ASK. Login, MFA, OAuth, or a
  missing credential reference pauses only the affected action, then execution resumes AUTO.
- One task uses one working branch and one PR into protected `main`; never direct-push `main`.
- The required `Verify consumer` check, conversations, and protected-main exact readback must be clear;
  then merge and verify under Standing Authorization — no self-approval or chat trigger. Preview, a11y,
  visual, canary, and independent-peer evidence are scheduled or optional unless the user explicitly
  requests them, and never block the standard release by default.
- Product repos never publish the DS; exact-version upgrade PRs merge after `Verify consumer` passes.

## Pilot and upstream feedback

This product may serve as a canary for the DS/product template. When a failure is reusable: preserve a
minimal reproduction and evidence; classify the owner as product, DS, template, governance corpus, or
deployment infrastructure; fix the canonical owner first; release an immutable upstream version;
upgrade by exact-version PR and rerun `Verify consumer`; then remove any temporary workaround.

WM is a pilot consumer, not an alternative governance authority. Its local checks may add product
coverage but may not replace or weaken the shipped lock/checker/provider surfaces.
