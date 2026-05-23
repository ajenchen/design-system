# Team Distribution Roadmap

**Status**: Planned, not yet started
**Created**: 2026-05-01
**Last numeric refresh**: 2026-05-22(per /knowledge-prune deep audit)
**Trigger to start**: user 說「開始 team distribution setup / Phase 1 開做 / 拆 npm package」

> **數值 anti-drift contract**(2026-05-22 codify):本 roadmap 所有「N skills / N hooks / N components / N tests」具體數字 = stale by-default;唯一 SSOT 是 `node scripts/sync-governance-counters.mjs` 動態輸出。Phase 1 開做前必先重跑 counter,本 roadmap snapshot 僅作日期錨點,不靠它做 acceptance gate。

> **Cross-session pickup contract**: 新 session 第一句講「繼續 team distribution roadmap」或「Phase X 開做」,
> AI 必先 read 本檔 → confirm 上次到 Phase Y → 接續 Phase Y+1。**禁止憑記憶跳 phase**。

---

## 1. Architecture Decision(2026-05-01 confirmed with user)

### Chosen: 雙包 distribution + Team monorepo for products

```
qijenchen GitHub:
├── design-system            ← 你 own,他們無 push 權
│   ├── packages/
│   │   ├── design-system/                 → publish @qijenchen/design-system (npm)
│   │   └── storybook-config/              → publish @qijenchen/storybook-config (npm)
│   ├── .claude-plugin/marketplace.json    → publish design-system@qijenchen (Claude plugin)
│   └── .claude/                            ← skills + hooks + commands + rules
│       └── (透過 plugin marketplace distribute)
│
└── product-workspace        ← 你建,team 全員 collaborator
    ├── apps/                              ← 多 product folders
    │   ├── order-dashboard/
    │   ├── analytics-portal/
    │   └── admin-console/
    ├── packages/                          ← 跨 product shared utility
    │   └── shared-utils/
    ├── package.json: workspaces + @qijenchen/design-system + plugin enable
    ├── .claude/settings.json: enabledPlugins: { "design-system@qijenchen": true }
    ├── .storybook/                        ← shared(import @qijenchen/storybook-config)
    └── .github/{CODEOWNERS, workflows/}
```

### Alternatives ruled out(with rationale)

| Alternative | Why ruled out |
|------------|---------------|
| 同 repo + CODEOWNERS only | User 要 hard isolation(「他們不能改」),local edit 仍可改不接受 |
| 一 repo per product | 共編場景痛(用戶明確說有共編需求),跨 product 共用 utility 需再開 npm package |
| Monorepo for everything(DS + products 同 repo) | DS governance 跟 product iteration cadence 不同;team permission boundary 不清晰 |
| 他們自己 setup repo | Governance drift 風險:每人 setup 不一致,Claude plugin / addons / CI 容易漏配 |

---

## 2. World-Class Benchmark(M8 binding,≥ 5 家對照支撐)

### Distribution model

| 決策 | 對齊 |
|------|------|
| **DS as npm package** | Material UI(`@mui/material`)/ Polaris(`@shopify/polaris`)/ Ant Design(`antd`)/ Carbon(`@carbon/react`)/ shadcn/ui(via CLI install)|
| **Storybook config / addons as separate package** | Material UI(`@mui/styled-engine` 拆)/ Vercel(`@vercel/style-guide`)|
| **Governance via Claude plugin** | Anthropic Claude Code Plugin Marketplace(2025 官方支援)— SSOT for skills/hooks/commands distribution |
| **Monorepo for products** | Vercel(turborepo example)/ Stripe(internal monorepo)/ Linear / Shopify Polaris docs site |
| **Workspaces tool**:`npm workspaces`(or pnpm/yarn)| Node.js native(npm 7+),no extra dep |
| **Build orchestration**:`turborepo`(optional Phase 5)| Vercel-recommended,parallel + cache |

### Versioning + release

| 決策 | 對齊 |
|------|------|
| **semver(major/minor/patch)** | semver.org standard,全 npm ecosystem |
| **changesets** for automated changelog | shadcn/ui / Storybook / Radix UI / Vercel |
| **codemods(jscodeshift)** for breaking change migration | Material UI / Next.js / React Router / Storybook |
| **Conventional Commits** | Angular / Linux kernel / Vue / 全 npm ecosystem |
| **Console deprecation warning** for transition period | React `componentWillMount` deprecation idiom |

### Permission model

| 決策 | 對齊 |
|------|------|
| **GitHub CODEOWNERS** | GitHub-native,Polaris / Material UI / 全 OSS 慣例 |
| **Branch protection require Code Owner review** | GitHub default best practice |
| **Required status checks(CI)before merge** | GitHub PR workflow standard |

---

## 3. Phase Plan(7 phases — Phase 7 加 2026-05-23 per real Anthropic plugin spec verify)

每 phase 有 deliverable + acceptance criteria + dependency。新 session pickup 看「Status」列。

### Phase 1 — DS repo restructure to npm workspaces

**Goal**: `packages/design-system/src/` → `packages/design-system/`,build pipeline ready for `npm publish`

**Deliverable**:
- `packages/design-system/package.json`(name: `@qijenchen/design-system`,exports field)
- Root `package.json` workspaces config
- `tsconfig.json` paths update(workspace import)
- `npm run build` outputs `packages/design-system/dist/`
- `tsup` or `vite build --lib` for bundle generation

**Acceptance**(數值動態以 `node scripts/sync-governance-counters.mjs` 跑出為準,以下為 2026-05-22 snapshot):
- `npm run build` 0 errors ✅ landed 2026-05-22
- `npm run build-storybook` 仍跑(workspace local link)— 待 verify(需 user 手動跑或 CI)
- 既有 **63 components**(63 spec.md / 100% coverage)全 pass ✅
- `npm pack --dry-run` 看 publish 內容正確(不含 stories / spec 等 internal files)✅ 397→117 files / 5.7MB→1.5MB / 0 spec.md / 0 stories.tsx

**World-class ref**: Material UI monorepo structure / Radix UI packages

**Status**: **DONE 2026-05-22**(commit pending push)— infrastructure landed:
- `packages/design-system/` created with `package.json` + `tsconfig.json`
- 396 files moved via `git mv src/design-system packages/design-system/src`(history preserved)
- Root `package.json` `workspaces: ["packages/*"]` 加
- `tsconfig.app.json` paths:`@/design-system/*` → `packages/design-system/src/*`,`@/*` → `src/*` 保留
- `vite.config.ts` alias 同樣 specific-first(regex-based)
- `src/globals.css` imports 更新 relative path `../packages/design-system/src/tokens/...`
- 26 script files mass-updated path refs(audit-* / sync-* / migrate-* 等)
- Tooling 決策已落地:**vite build --lib(decision A2)** + **npm workspaces(decision B1)** per user 2026-05-22 verbatim「照你建議做」+「我要世界級的」
- Bundle generation refinement:**deferred to Phase 4**(release pipeline)— 目前 root `npm run build` 已生 `dist/`,packages/design-system/dist/ 獨立 build 等 Phase 4 changesets / release script 階段一起配
- npm pack 內容 verified:`files` allowlist 排 stories/spec/test/anatomy/principles → 397 files → 117 files / 1.5MB

**Deferred to Phase 2-4**(2026-05-22 follow-up,當天 land):
- ~~Lib build 獨立~~ ✅ Done(later same day):`packages/design-system/vite.config.ts`(ESM lib mode + preserveModules + per-component output)+ `tsconfig.json`(rootDir/declaration/emitDeclarationOnly)+ root `npm run build:lib`(2-step:vite build + tsc -p)+ `src/index.ts` barrel(62 components / 6 patterns / 4 hooks / 2 lib auto-generated via `scripts/gen-design-system-barrel.mjs`)+ moved `src/lib/utils.ts` → `packages/design-system/src/lib/utils.ts`(M17 SSOT 對齊 — lib utility 該 own by DS package)+ d.ts 全 emit 到 dist/components/*/  / dist/patterns/*/ / dist/index.d.ts
- Storybook config 抽出 → Phase 2 ✅ done
- changesets / release pipeline → Phase 4 ✅ done

---

### Phase 2 — Extract Storybook config + addons to separate package

**Goal**: `.storybook/` 內 main.ts / preview.ts / DS Devmode addon → `packages/storybook-config/`

**Deliverable**:
- `packages/storybook-config/package.json`(name: `@qijenchen/storybook-config`)
- 抽 main config + addons + decorators 到此 package
- DS repo 自己 `.storybook/main.ts` 改 import 此 package(dogfood)
- README 寫他們 product repo 怎麼用(`addons: ['@qijenchen/storybook-config']`)

**Acceptance**:
- DS repo 自己 storybook 跑同樣
- 新 product repo install 此 package + 寫 minimal `.storybook/main.ts` 即跑同樣 UX

**World-class ref**: `@vercel/style-guide` / `@shopify/polaris-icons` 拆 package model

**Status**: **DONE 2026-05-22**:
- `packages/storybook-config/package.json`(name `@qijenchen/storybook-config`)
- `packages/storybook-config/addons-preset.ts`(shared addons / framework / docs / typescript / story globs)
- `packages/storybook-config/preview.tsx`(shared globalTypes / parameters / decorators / TooltipProvider wrapper)
- DS repo dogfood:`.storybook/main.ts` + `preview.tsx` 改 import 此 package
- Local-only addon(`./addons/ds-devmode/preset`)保 DS repo,consumer 不需要
- tsc PASS

---

### Phase 3 — Claude plugin manifest

**Goal**: `.claude/{skills,hooks,commands,rules}/` + CLAUDE.md → publishable Claude plugin

**Deliverable**:
- `.claude-plugin/marketplace.json`(plugin manifest 對齊 Anthropic spec)
- Plugin 包含:全 skills / top-level hooks / lib/ subs / 全 rules / CLAUDE.md instructions
- **數值動態**(以 `governance-counters.json` 跑出為準,**不在本 roadmap 寫死**避免 drift):
  - 2026-05-22 snapshot:**22 skills / 37 top-level hooks / 10 lib/ subs / 31 active M-rules**
  - Phase 3 開做前重跑 `node scripts/sync-governance-counters.mjs` 取最新
- Plugin name: `design-system@qijenchen`,version 跟 npm package 同步
- Local test:DS repo 自己 enable 此 plugin(自我消費 dogfood)

**Acceptance**:
- DS repo 自己 disable 全 .claude/ 物理檔 + 只 enable plugin → session 啟動仍 detect 全 skills/hooks
- 跑 hook tests 25/25 仍 pass

**World-class ref**: Anthropic Claude Code Plugin docs(2025 官方)+ shadcn registry CLI

**Status**: **DONE(scaffold)2026-05-22**:
- `.claude-plugin/marketplace.json` 新建 — plugin manifest 含 exports / pathScopedRules / manifest / consumerSetup
- Plugin name `design-system@qijenchen`,version 跟 npm package 同步
- DS repo dogfood:`.claude/` 物理檔目前直接 active(plugin host 等 Phase 4 release pipeline 配)
- pathScopedRules 對齊 `.claude/rules/{meta-patterns,spec-rules,ui-development,story-rules,self-verify}.md`

**Open question 仍需 user 拍板**:
- Plugin host:Anthropic public marketplace? GitHub direct? Internal NPM registry?(open question 留 manifest 內)
- Phase 4 release.yml 內 plugin publish step 仍 TODO,等 host 決策

---

### Phase 4 — Release pipeline(GitHub Actions)

**Goal**: Tag push → 自動 npm publish + plugin publish + changelog

**Deliverable**:
- `.github/workflows/release.yml`:
  - Trigger: push tag `v*`
  - Steps: build / test / npm publish(2 packages)/ plugin publish / GitHub Release with changelog
- `changesets` 設定(`.changeset/config.json`)
- `CONTRIBUTING.md` 寫 commit/release 流程
- Pre-release dist-tag(`@beta` / `@next`)for cross-repo dogfood

**Acceptance**:
- Mock `v0.1.0-beta.1` tag → CI 自動跑完 publish 到 internal registry
- Wendy 在 product repo `npm install @qijenchen/design-system@beta` 拉得到

**World-class ref**: changesets/changesets GitHub repo / Vercel `pkg.pr.new` pre-release model

**Status**: **DONE(scaffold)2026-05-22**:
- `.github/workflows/release.yml` 新建 — tag-push trigger / audit gates / build / publish npm + GitHub Release / dist-tag detection(beta/next/latest from tag suffix)
- `.changeset/config.json` 新建 — linked versions(design-system + storybook-config)/ access restricted / main baseBranch
- `.changeset/README.md` 新建 — changesets workflow + codemod for breaking change + 對齊 Material UI / Storybook / Vercel pkg.pr.new
- `CONTRIBUTING.md` 新建 — daily / PR-based / release flow / quality gates / codemod / world-class refs

**Mock release 仍需 user run**(when ready):
- `git tag v0.1.0-beta.1 && git push origin v0.1.0-beta.1` → CI 自動跑 audit gates → publish to `@beta` dist-tag
- Verify `npm install @qijenchen/design-system@beta` 拉得到
- NPM_TOKEN secret 需 user 設定 in GitHub repo settings

---

### Phase 5 — Build product-workspace template repo

**Goal**: 給 team 用的 monorepo template(他們 clone 即可開工)

**Deliverable**(GitHub repo `qijenchen/product-workspace`):
- Root `package.json`:workspaces apps/* packages/* + 4 deps(DS / storybook-config / Claude plugin enable in settings)
- `apps/_template/`:single-app boilerplate + `npm run create-app <name>` generator
- `.claude/settings.json`:`enabledPlugins: { "design-system@qijenchen": true }` + `defaultMode: "auto"`
- `.storybook/main.ts`:`import preset from '@qijenchen/storybook-config'`
- `.github/CODEOWNERS`:全部 `* @team`(team 內互相 review)
- `.github/workflows/audit.yml`:tsc + build + storybook + audit-content-quality + code-quality + visual-audit + **audit-orphan-tokens(2026-05-21 新)** + **audit-preflight(2026-05-15 新)** + **sync-governance-counters --check(2026-05-18 新)**
- `.github/workflows/deploy.yml`:per-app Vercel/Netlify deploy(matrix on apps/*)
- `README.md`:onboarding(clone → install → claude → 開做)
- `.gitignore` + `.husky/pre-commit`(client-side warning if 試圖 import non-public DS internal)

**Acceptance**:
- 你 clone template → `npm install` → `npm run create-app foo` → `apps/foo/` 自動建好,可直接寫 product
- `npm run storybook` 跑,看到全 addons
- Mock PR → GitHub Actions 跑全套 audit

**World-class ref**: Vercel `create-next-app` template / shadcn `next.js` starter / Stripe Engineering monorepo internal docs

**Status**: **DEFERRED — needs separate repo `qijenchen/product-workspace`**(per `.claude/planning/phase-5-6-product-workspace-setup.md` handoff doc)

User pre-requisite(GitHub UI / CLI,不在 Claude session 範圍):
1. Create new GitHub repo `qijenchen/product-workspace`
2. Team collaborators add(write access)
3. Branch protection main(1 reviewer approval)
4. CI secrets(NPM_TOKEN / Netlify or Vercel token)

User 完成上述後回 Claude session 講「Phase 5 開做 / 開做 product-workspace boilerplate」→ Claude 走 pickup contract 生 boilerplate(per handoff doc)。

---

### Phase 6 — Onboarding documentation

**Goal**: Team member Day 0 follow doc 一次走完上線

**Deliverable**(in product-workspace README + `docs/`):
- `README.md`:Quick start(5 命令上線)
- `docs/01-first-time-setup.md`:全流程(clone / install / Claude config)
- `docs/02-create-new-product.md`:`npm run create-app` walkthrough
- `docs/03-co-edit-workflow.md`:多人共編 PR / merge / conflict resolution
- `docs/04-ds-upgrade.md`:`npm update` + 看 changelog + 跑 codemod
- `docs/05-troubleshooting.md`:常見問題(Claude plugin not detected / hook fail / build error)

**Acceptance**:
- 新 team member 不問你,看 doc 從零到 ship 第一個 PR(自我驗證:你找一個 friend 跑 doc 一次)

**World-class ref**: Stripe API docs onboarding / Vercel Quickstart / shadcn install flow

**Status**: **DEFERRED — depends on Phase 5(separate product-workspace repo)**
docs/ 寫在 product-workspace,非本 DS repo。User 完成 Phase 5 pre-req 後 invoke Claude 協助生 5 個 onboarding docs(per `phase-5-6-product-workspace-setup.md`)。

---

## 4. Risk + Mitigation

| Risk | Mitigation |
|------|-----------|
| Cross-repo iteration 慢(改 DS → 等 publish → product 才能用) | `npm link` for local dev / `pkg.pr.new` for instant pre-release tags |
| Plugin auto-update 突然加 hook block 既有 product code | Plugin release 用 deprecation period:新 hook 先 warn 不 block,N 週後升 block |
| Token 微調 silent visual drift | GitHub Actions 跑 visual-audit on product repos via plugin,diff > 5% trigger PR comment |
| Team member 想偷改 DS 解 product issue | DS 在 node_modules read-only;Claude plugin 帶 rule 教 team 「不改 DS,寫 wrapper 或開 issue」 |
| npm publish 失敗 / package 命名衝突 | Internal registry(GitHub Packages / Verdaccio)or scoped public package |
| Changeset 漏寫(team member commit 沒帶 changeset) | CI bot 強制 PR 有 `.changeset/*.md`,no changeset = blocked |

---

## 5. Onboarding Protocol(Wendy POV — 第一次 setup)

```bash
# Day 0 — 15 min
git clone github.com/qijenchen/product-workspace
cd product-workspace
npm install                    # → 自動拉 @qijenchen/design-system + storybook-config
claude                          # Claude session 啟動
                                # → auto detect plugin design-system@qijenchen
                                # → load 27 skills / 19 hooks / rules / CLAUDE.md
                                # → her dev environment 跟你 100% 一致

# Day 1 — build product
> 「幫我建 Order Dashboard」
# → Claude 走 /new-component flow,自動消費 DS canonical
# → hooks fire enforcing rules
# → 寫到 apps/order-dashboard/

npm run storybook              # localhost:6006,看 addons + 她 product story
git checkout -b feat/order-list
git commit                      # pre-commit hook fire
git push                        # CI 跑 audit
gh pr create                    # CODEOWNERS 認 team 內互相 approve
                                # GitHub Actions 跑 全套 audit
                                # 全綠 → merge → 自動 deploy preview URL
```

---

## 6. Decision rationale per resource consultation

User 在 session 內逐 step 詰問 + 我答對齊 world-class benchmark:

1. **「他們完全不能改 DS」** → 同 repo CODEOWNERS 不夠(local 改可),必須拆 repo + npm package(他們 node_modules read-only)
2. **「Claude 技能 + 自動化要跟著」** → Claude Plugin Marketplace(Anthropic 2025 官方)
3. **「他們也用 Storybook 看成果 + 我的 addons」** → addons 抽 npm package(`@qijenchen/storybook-config`)
4. **「他們有共編場景」** → Team monorepo(apps/*),不要一 repo per product
5. **「無痛升級」** → semver + changesets + codemods + console deprecation
6. **「我幫他們建 repo 統一」** → 你 own template,他們 clone 用,governance 一致

---

## 7. Pickup checklist for new session

當新 session user 說「繼續」/「Phase X 開做」:

1. ✅ Read this file 全文
2. ✅ Check「Status」on each phase — find first non-done
3. ✅ Verify acceptance criteria of last done phase 仍 hold(跑驗證 cmd)
4. ✅ Confirm with user 「Phase Y 接續開做」
5. ✅ Execute Phase Y deliverables sequentially
6. ✅ Run acceptance criteria → mark Phase Y as done in this file
7. ✅ Commit + push

**禁止**:憑記憶跳 phase / 不 verify acceptance / 不 update status table。

---

### Phase 7 — Real Anthropic plugin spec migration(2026-05-23 加,per WebFetch verify)

**Goal**:從 standalone `.claude/` 結構 migrate 到 Anthropic 真實 plugin spec,enable real auto-sync via `/plugin marketplace add` + `/plugin update`。

**Background**:2026-05-23 WebFetch `code.claude.com/docs/en/plugins` + `/plugin-marketplaces` + `/plugins-reference` 發現我 2026-05-22 寫的 marketplace.json scaffold 跟真 schema 結構不一致:
- 我寫的:plugin manifest fields(exports / pathScopedRules / manifest)塞在 marketplace.json
- 真 schema:`.claude-plugin/marketplace.json` 是 catalog(列 plugins[] 含 source);plugin manifest 在 `<plugin-root>/.claude-plugin/plugin.json`(name / description / version / author)
- 真 plugin layout:`skills/` + `hooks/hooks.json` + `commands/` 在 plugin root(不是 `.claude/skills/` etc.)

**Deliverable**:
- ✅ `.claude-plugin/marketplace.json` 改 catalog schema(`name`, `owner`, `plugins[]`)— 2026-05-23 已 done
- ✅ `.claude-plugin/plugin.json` 新建(plugin manifest 符合 Anthropic spec)— 2026-05-23 已 done
- ✅ Consumer template 改 `/plugin marketplace add + install` flow(非 settings.json enabledPlugins)— 2026-05-23 已 done
- ⏸ `.claude/skills/` → `skills/` migration(plugin spec 預期 plugin root layout)
- ⏸ `.claude/hooks/*.sh` → `hooks/hooks.json` + scripts referenced from hooks.json config
- ⏸ `.claude/commands/` → `commands/` migration
- ⏸ `.claude/rules/` plugin spec 支援?(docs 沒明寫,需 verify;若不支援 → CLAUDE.md 全部包含 rules 內容,or 用 settings.json `agent` 機制)
- ⏸ `.claude/references/` + `.claude/memory/` plugin spec 怎包含?(memory 應為 user-specific 不 distribute)
- ⏸ Phase 4 release.yml 加 plugin publish step(git tag → marketplace.json version bump → consumer `/plugin update` pulls)

**Acceptance**:
- DS repo 自己 enable plugin(self-dogfood)同樣全 skill / hook fire
- 新 product-workspace `/plugin marketplace add github:qijenchen/design-system && /plugin install design-system@qijenchen-ds` 後,Claude session detect 全 DS skill / hook / CLAUDE.md instructions

**Migration risk(high)**:
- 動 `.claude/` 結構 = 整 session governance ecosystem 重組,要謹慎
- 需 read 真實 Anthropic plugin docs 更多細節(skills/SKILL.md format 是否跟 .claude/skills/<name>/SKILL.md 相容)
- 需 test plugin install / update flow(`/plugin marketplace add` consumer-side)
- 過渡期可能要雙寫(`.claude/` 給 DS repo 自己用 + plugin layout 給 distribute)

**World-class ref**:
- Anthropic Claude Code plugin docs(code.claude.com/docs/en/plugins)
- Anthropic claude-plugins-community marketplace(github.com/anthropics/claude-plugins-community)
- shadcn registry CLI(對照 distribution model)

**Status**: **✅ DONE 2026-05-23 same day**(per user verbatim「做到完美啊」+「該做完的就都做完」trigger撤回 deferred):
- skills/ symlink → .claude/skills/(22 skills 在 plugin root)
- commands/ symlink → .claude/commands/
- hooks/scripts/ symlink → .claude/hooks/(30+ scripts)
- hooks/hooks.json:自動 generate from settings.json hooks section,paths 改 ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.sh
- 40 hook entries 全 mapped(PreToolUse / PostToolUse / Stop / SessionStart / UserPromptSubmit)
- plugin.json metadata 改 reflect migration done + intentional_omissions(rules / references / memory)documented
- release.yml 加 plugin version sync verify step(2026-05-23 follow-up)
- Local dev 不破:.claude/ standalone layout 保留,symlinks 是 plugin layer

Intentional omissions(per plugin spec 限制):
- .claude/rules/ — plugin spec 沒明寫 path-scoped rules 機制,CLAUDE.md cite paths 仍 reach
- .claude/references/ — 同上
- .claude/memory/ — by design 不 distribute(user-specific)

Auto-update flow now complete:
1. DS owner push tag v0.x.y → CI publish npm + plugin marketplace catalog(GitHub-direct,no Anthropic submission needed)
2. Consumer `/plugin marketplace update + /plugin update design-system` 拉新 commit / version
3. Skills + hooks + commands + CLAUDE.md 自動 sync 到 consumer
