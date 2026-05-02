# Team Distribution Roadmap

**Status**: Planned, not yet started
**Created**: 2026-05-01
**Trigger to start**: user 說「開始 team distribution setup / Phase 1 開做 / 拆 npm package」

> **Cross-session pickup contract**: 新 session 第一句講「繼續 team distribution roadmap」或「Phase X 開做」,
> AI 必先 read 本檔 → confirm 上次到 Phase Y → 接續 Phase Y+1。**禁止憑記憶跳 phase**。

---

## 1. Architecture Decision(2026-05-01 confirmed with user)

### Chosen: 雙包 distribution + Team monorepo for products

```
your-org GitHub:
├── design-system            ← 你 own,他們無 push 權
│   ├── packages/
│   │   ├── design-system/                 → publish @your-org/design-system (npm)
│   │   └── storybook-config/              → publish @your-org/storybook-config (npm)
│   ├── .claude-plugin/marketplace.json    → publish design-system@your-org (Claude plugin)
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
    ├── package.json: workspaces + @your-org/design-system + plugin enable
    ├── .claude/settings.json: enabledPlugins: { "design-system@your-org": true }
    ├── .storybook/                        ← shared(import @your-org/storybook-config)
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

## 3. Phase Plan(6 phases,2-3 days total)

每 phase 有 deliverable + acceptance criteria + dependency。新 session pickup 看「Status」列。

### Phase 1 — DS repo restructure to npm workspaces

**Goal**: `src/design-system/` → `packages/design-system/`,build pipeline ready for `npm publish`

**Deliverable**:
- `packages/design-system/package.json`(name: `@your-org/design-system`,exports field)
- Root `package.json` workspaces config
- `tsconfig.json` paths update(workspace import)
- `npm run build` outputs `packages/design-system/dist/`
- `tsup` or `vite build --lib` for bundle generation

**Acceptance**:
- `npm run build` 0 errors
- `npm run build-storybook` 仍跑(workspace local link)
- 既有 50+ component tests 全 pass
- `npm pack --dry-run` 看 publish 內容正確(不含 stories / spec 等 internal files)

**World-class ref**: Material UI monorepo structure / Radix UI packages

**Status**: Not started

---

### Phase 2 — Extract Storybook config + addons to separate package

**Goal**: `.storybook/` 內 main.ts / preview.ts / DS Devmode addon → `packages/storybook-config/`

**Deliverable**:
- `packages/storybook-config/package.json`(name: `@your-org/storybook-config`)
- 抽 main config + addons + decorators 到此 package
- DS repo 自己 `.storybook/main.ts` 改 import 此 package(dogfood)
- README 寫他們 product repo 怎麼用(`addons: ['@your-org/storybook-config']`)

**Acceptance**:
- DS repo 自己 storybook 跑同樣
- 新 product repo install 此 package + 寫 minimal `.storybook/main.ts` 即跑同樣 UX

**World-class ref**: `@vercel/style-guide` / `@shopify/polaris-icons` 拆 package model

**Status**: Not started

---

### Phase 3 — Claude plugin manifest

**Goal**: `.claude/{skills,hooks,commands,rules}/` + CLAUDE.md → publishable Claude plugin

**Deliverable**:
- `.claude-plugin/marketplace.json`(plugin manifest 對齊 Anthropic spec)
- Plugin 包含:全 27 skills / 19 top-level hooks / 16 lib/ subs / 全 rules / CLAUDE.md instructions
- Plugin name: `design-system@your-org`,version 跟 npm package 同步
- Local test:DS repo 自己 enable 此 plugin(自我消費 dogfood)

**Acceptance**:
- DS repo 自己 disable 全 .claude/ 物理檔 + 只 enable plugin → session 啟動仍 detect 全 skills/hooks
- 跑 hook tests 25/25 仍 pass

**World-class ref**: Anthropic Claude Code Plugin docs(2025 官方)+ shadcn registry CLI

**Status**: Not started

**Open question for user**:
- Plugin host:Anthropic public marketplace? GitHub direct? Internal NPM registry?
- 若 internal,需提供 plugin URL pattern(public link)

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
- Wendy 在 product repo `npm install @your-org/design-system@beta` 拉得到

**World-class ref**: changesets/changesets GitHub repo / Vercel `pkg.pr.new` pre-release model

**Status**: Not started

---

### Phase 5 — Build product-workspace template repo

**Goal**: 給 team 用的 monorepo template(他們 clone 即可開工)

**Deliverable**(GitHub repo `your-org/product-workspace`):
- Root `package.json`:workspaces apps/* packages/* + 4 deps(DS / storybook-config / Claude plugin enable in settings)
- `apps/_template/`:single-app boilerplate + `npm run create-app <name>` generator
- `.claude/settings.json`:`enabledPlugins: { "design-system@your-org": true }` + `defaultMode: "auto"`
- `.storybook/main.ts`:`import preset from '@your-org/storybook-config'`
- `.github/CODEOWNERS`:全部 `* @team`(team 內互相 review)
- `.github/workflows/audit.yml`:tsc + build + storybook + audit-content-quality + code-quality + visual-audit
- `.github/workflows/deploy.yml`:per-app Vercel/Netlify deploy(matrix on apps/*)
- `README.md`:onboarding(clone → install → claude → 開做)
- `.gitignore` + `.husky/pre-commit`(client-side warning if 試圖 import non-public DS internal)

**Acceptance**:
- 你 clone template → `npm install` → `npm run create-app foo` → `apps/foo/` 自動建好,可直接寫 product
- `npm run storybook` 跑,看到全 addons
- Mock PR → GitHub Actions 跑全套 audit

**World-class ref**: Vercel `create-next-app` template / shadcn `next.js` starter / Stripe Engineering monorepo internal docs

**Status**: Not started

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

**Status**: Not started

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
git clone github.com/your-org/product-workspace
cd product-workspace
npm install                    # → 自動拉 @your-org/design-system + storybook-config
claude                          # Claude session 啟動
                                # → auto detect plugin design-system@your-org
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
3. **「他們也用 Storybook 看成果 + 我的 addons」** → addons 抽 npm package(`@your-org/storybook-config`)
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
