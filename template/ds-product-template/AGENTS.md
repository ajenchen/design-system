# Product consumer AI governance (provider-neutral)

> **Generated view**: upstream `build-fork-governance.mjs` publishes this role-specific source as
> `AGENTS.md`. Do not edit the generated copy. Claude loads it through `CLAUDE.md`; Codex and other
> AGENTS-compatible agents load it directly.

## Authority and trust boundary

- This repository builds a product with exact versions of `@qijenchen/design-system` and
  `@qijenchen/storybook-config`; it does not author or publish those packages.
- Merge enforcement comes from protected `main` requiring exactly one `Verify consumer` check. That
  check runs the locked install, typecheck, import lint, and build against the exact candidate head.
- Native Claude/Codex hooks are fast feedback only; hookless operation is judged by the same
  hooks-off checker. Generated hook commands scrub inherited startup injection before repository
  launchers, and the running provider host stays an external trust boundary, so hooks never
  replace protected CI.
- Run `npm run setup:all` in every fresh local checkout and hosted setup/cache-refresh lifecycle. It
  installs the committed lock, verifies signatures, and runs the exact checker; SessionStart only verifies.
- `governance/lock.json`, managed provider adapters, and managed skills are generated upstream.
  Product-specific, provider-neutral policy belongs in `governance/overlay.md`; read it when present.
  It may add stricter product rules but must never replace or weaken upstream controls.
- Never install a mutable tag or semver range for internal packages. Upgrades are reviewed pull
  requests that pin an exact version and include the regenerated lock/adapters.
<!-- canonical-decision-authority:start -->
**Decision／Engineering Authority**:user 只拍板產品／UI／UX SSOT 真取捨及可感知／產品語意變更（behavior/interaction/IA/visual/token/layout/content/a11y/canonical rules）；核准須同 scope 綁 exact target/choice/operation digest，引用/條件/舊 scope/跨 target 無效。其餘工程/external writes 皆 Standing Authorization AUTO，含已核准 UI／UX 實作/機械 generation/sync 與 source→commit/PR/merge→canonical `infra/governance/release-workflow.json` 的 `pr-checks → merge → publish → readback → consumer`；依 frozen scope、SSOT、required checks、security、least privilege、rollback/readback 收斂，不逐 milestone 重問。Certification、rollout、staged rollout、preview/canary 與 independent review 是明確要求時的附加 assurance，不得進入標準 five-step release blocking graph；peer 不可用只阻擋明確要求的 independent-review claim。

**Visual baseline**:user 對 exact image set／UI／UX 語意說「可以改」即拍板；Agent 自動 apply/generate/test/commit/PR/CI/merge，禁再核准/key enrollment/簽章。僅 user 明確要求 independent cryptographic review 才啟用 `visual-baseline-review-policy.json`，否則不阻擋。

**Human-only boundaries**:僅 login/MFA/OAuth/owner/billing、缺 credential reference（只問 vault/Environment/Secret Manager reference，禁 secret）、plan 外付費、法律/帳號/組織權限/商業承諾及上述產品決策。Agent 完成唯一方案/preflight，只問一個 exact action，readback 後續跑；technical failure fail-closed，非 human decision。Release 常見的 login/MFA/OAuth/credential reference 完成後一律 AUTO resume，不另問核准。
<!-- canonical-decision-authority:end -->

## Six working principles

1. **World-class, no shortcuts**: visual and interaction decisions must be defensible against at
   least three relevant systems such as Polaris, Material, Atlassian, Ant, Carbon, or Apple HIG.
2. **Consume before inventing**: search the installed public API, nearest component spec, token, and
   pattern before adding a value, wrapper, variant, or layout primitive.
3. **Change all affected surfaces**: product code, tests/stories, and product documentation move
   together. A DS defect is reported upstream with a minimal reproduction; never patch `node_modules`.
4. **Use real product scenarios**: examples must represent recognizable business work, not Option
   A/B/C placeholders or minimal mocks that conceal composition problems.
5. **Ask only for a genuine product decision**: first search current product usage and the nearest
   shipped DS spec. Stop only when the remaining choice changes product UX or canonical meaning.
6. **Fix the invariant, not one symptom**: search for sibling occurrences, add a regression proof,
   and route reusable DS/template defects to their canonical upstream owner.

## Before changing product UI

Record the canonical inputs you inspected:

- public component/pattern exports from `@qijenchen/design-system`;
- the nearest shipped `*.spec.md` under
  `node_modules/@qijenchen/design-system/src/`;
- relevant token docs under
  `node_modules/@qijenchen/design-system/src/tokens/`;
- a nearest shipped story or a real product precedent;
- any product-specific exception and its concrete rationale.

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

For every change, run the checks that exist in this product and report their real outcome. The
minimum repository-wide contract is:

1. `npm run governance:check` (exact installed, hooks-off authority);
2. `npm run typecheck`;
3. `npm run build`;
4. product lint/test/a11y scripts when present;
5. browser or Storybook visual verification for user-visible changes.

Never replace a check with `true`, an empty script, a notice-only waiver, or an unverified claim.
Missing required tooling is a failure, not a pass. Evidence must bind the checked source snapshot.

## Claude, Codex, and future agents

- Registry materializers project one skill source into every enabled provider view; no view is SSOT.
- Native events enter one immutable hook corpus; unsupported events use the exact checker/protected-CI
  fallback and are never presented as native parity.
- Future providers read `AGENTS.md` and use the same checks; adapters cannot redefine semantics.
- When an independent-review deliverable is explicitly requested, it requires a distinct certified
  peer and immutable read-only evidence or reports that claim `REVIEW-BLOCKED`. Peer availability never
  blocks ordinary engineering or the standard five-step release. Product review cannot authorize
  DS/template/release changes; route reusable defects upstream.

## Git and release flow

- The upstream design-system authority owns the machine-readable release SSOT at
  `infra/governance/release-workflow.json`: `pr-checks → merge → publish → readback → consumer`.
  Every engineering step is AUTO; only an unresolved product/UI/UX SSOT choice is ASK. Login,
  MFA, OAuth, or a missing credential reference pauses only the affected action, then execution resumes AUTO.
- One task uses one working branch and one PR into protected `main`; never direct-push `main`.
- The required `Verify consumer` check, conversations, and protected-main exact readback must be clear.
  Then merge and verify under Standing Authorization—no self-approval or chat trigger. Preview, a11y,
  visual, canary, and independent-peer evidence are scheduled or optional unless the user explicitly
  requests them or an unresolved product/UI/UX SSOT choice requires a decision; they never block the
  standard release by default.
- Product repos never publish the DS; exact-version upgrade PRs merge after `Verify consumer` passes.

## Pilot and upstream feedback

This product may serve as a canary for the DS/product template. When a failure is reusable:

1. preserve a minimal product reproduction and evidence;
2. classify the owner as product, DS, template, governance corpus, or deployment infrastructure;
3. fix the canonical owner first;
4. release an immutable upstream version;
5. upgrade this product by exact-version PR and rerun the required `Verify consumer` check;
6. remove any temporary product workaround after the upstream fix lands.

WM is a pilot consumer, not an alternative governance authority. Its local checks may add product
coverage but may not replace or weaken the shipped lock/checker/provider surfaces.
