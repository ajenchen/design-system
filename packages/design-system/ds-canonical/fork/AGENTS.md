# Product consumer AI governance (provider-neutral)

> **Generated view**: upstream `build-fork-governance.mjs` publishes this role-specific source as
> `AGENTS.md`. Do not edit the generated copy. Claude loads it through `CLAUDE.md`; Codex and other
> AGENTS-compatible agents load it directly.

## Authority and trust boundary

- This repository builds a product with exact versions of `@qijenchen/design-system` and
  `@qijenchen/storybook-config`; it does not author or publish those packages.
- The deterministic local authority is the exact installed hooks-off checker:
  `npm run governance:check`. Merge enforcement is non-bypassable only after protected pull-request
  CI executes that checker directly as a required check and external readback confirms the protection.
- Native Claude/Codex hooks are fast feedback only. Hookless operation must load these locked
  instructions and is judged by the same hooks-off checker when it runs, but the repository must not
  claim full governance until the protected required check and its external enforcement readback are
  active.
- Generated hook commands scrub inherited startup injection before repository launchers; the
  already-running provider host remains an external trust boundary, so hooks never replace protected CI.
- Run `npm run setup:all` in every fresh local checkout and hosted setup/cache-refresh lifecycle. It
  installs the committed lock, verifies signatures, and runs the exact checker; SessionStart only verifies.
- `governance/lock.json`, managed provider adapters, and managed skills are generated upstream.
  Product-specific, provider-neutral policy belongs in `governance/overlay.md`; read it when present.
  It may add stricter product rules but must never replace or weaken upstream controls.
- Never install a mutable tag or semver range for internal packages. Upgrades are reviewed pull
  requests that pin an exact version and include the regenerated lock/adapters.
<!-- canonical-decision-authority:start -->
**Decision／Engineering Authority**:user 保留所有產品／UI／UX SSOT 真取捨，以及任何會改變使用者可感知結果、產品語意或 canonical UI／UX SSOT 的決策權，包含 component behavior／contract、interaction／IA、visual／token／layout／content／a11y 語意、合理設計方案選擇、新增刪改 canonical design rule，以及無法證明維持既有 intent 的變更；positive evidence 必在同一 active scope 綁 exact target、choice、operation digest，引用／條件／舊 scope／target-wide 推定無效。其餘工程治理與 external writes 皆 Standing Authorization AUTO，包含已核准 UI／UX 語意的實作及機械式 generation／sync：由 policy 允許的最高 certified model/reasoning/compute，依 frozen scope、SSOT、repo evidence、tests/Harness、security、independent review、least privilege、staged rollout/rollback/readback 收斂；涵蓋 source→commit/PR/merge→GitHub/package/release→template/WM/certification/rollout/recovery，不逐 milestone 重問。需人類授權紀錄時，本 delegation 綁 target digest 寫入既有 audit record；無 certified peer 則 `REVIEW-BLOCKED`。

**Human-only boundaries**:僅不可代理 login/MFA/OAuth/owner/billing、缺 credential reference(只問 secret/vault/Environment/Secret Manager reference，禁貼 secret)、plan 外付費、法律／帳號／組織權限／商業承諾及上述產品決策。Agent 先定唯一工程方案/preflight，只給一個精確 human action，readback 繼續；retry/evidence 後 technical blocker 可 fail-closed，但非 human engineering decision。
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
- `independent-review` requires a distinct certified peer, immutable read-only evidence, or reports
  `REVIEW-BLOCKED`. Product review cannot authorize DS/template/release/promotion changes; route upstream.

## Git and release flow

- One task uses one working branch and one PR into protected `main`; never direct-push `main`.
- Required checks, conversations, preview/canary evidence, and protection readback must be clear.
  Then merge and verify under Standing Authorization—no self-approval or chat trigger.
- Product repos never publish the DS; exact-version upgrade PRs merge only after product canary gates.

## Pilot and upstream feedback

This product may serve as a canary for the DS/product template. When a failure is reusable:

1. preserve a minimal product reproduction and evidence;
2. classify the owner as product, DS, template, governance corpus, or deployment infrastructure;
3. fix the canonical owner first;
4. release an immutable upstream version;
5. upgrade this product by exact-version PR and rerun all gates;
6. remove any temporary product workaround after the upstream fix lands.

WM is a pilot consumer, not an alternative governance authority. Its local checks may add product
coverage but may not replace or weaken the shipped lock/checker/provider surfaces.
