# Scenario Definition — Monorepo 2-Scenario Architecture(SSOT)

> **2026-05-29 ship**:本 file 為 Scenario A / Scenario B 定義 + 互動方式 + verify checkpoints 的**唯一 SSOT**。所有 skill / hook / spec / CLAUDE.md 文字 reference 此 file,**不重述定義**(per user「無多餘重複 SSOT」directive)。

> **設計起源**:user 2026-05-29 verbatim「實際上會有兩種場景,一種是直接 fork ds repo 用的一種是 fork template repo 用的使用者,兩種情境都要確保完整沒有斷點又能確保 SSOT」+ codex r5 synthesize verdict(8 gap fix)。

## 1. 兩 Scenario 定義

### Scenario A — Direct fork DS repo

**用戶**:DS 共同維護者 / 想看 DS source 一起改 DS + 寫 product 的人
**入口**:fork `ajenchen/design-system` GitHub repo
**他拿到**:DS source(`packages/design-system/`)+ 治理(`.claude/`)native readable + scaffold(`apps/template/`)+ scripts
**DS 取得方式**:`packages/*` npm workspace link(local resolution)
**Governance 取得**:`.claude/` 直接讀,**不需 `/plugin install`**(他有 source)
**E2E 流程**:`fork → npm install → claude → npm run create-app order-dashboard → npm install(workspace re-link)→ npm run storybook → git push`
**禁**:edit `packages/design-system/src/**` 沒 user approval(`check_substantive_edit_approval_preflight.sh` 攔)

### Scenario B — Fork published template repo

**用戶**:純做產品 / 不需看 DS source 的人
**入口**:`ajenchen/ds-product-template` GitHub「Use this template」(該 repo 內容 = mirror artifact,**非 SSOT**,by 自動 mirror workflow auto-generate from DS repo)
**他拿到**:scaffold + 治理 via C-prime committed-config(.claude hooks + SessionStart preamble 注入)+ DS + 治理本體 via npm
**DS 取得方式**:`@qijenchen/design-system` npm registry(`^X.Y.Z`)
**Governance 取得**:committed `.claude/settings.json`(dispatcher hooks + fail-open bootstrap)+ SessionStart 注入 npm-current preamble;本體在 npm `ds-canonical/fork`(`npm install` / `npm run sync-all` 同步)。**不需 /plugin install**(雲端不可靠 #62174/#63028)
**E2E 流程**:`fork → npm install(治理本體隨 npm + committed hook 自動生效,免 plugin)→ claude → npm run setup:netlify(自動 site create/link + 引導在 Netlify dashboard 設 STORYBOOK_BASIC_AUTH = user:password env var — CLI 不提供 one-shot setup,script 印 dashboard URL + step-by-step;免費機制走 edge function basic-auth)→ npm run create-app order-dashboard → npm install → npm run storybook → git push`
**禁**:import `@qijenchen/design-system/src/**` 或 `/dist/**`(`lint:imports` 攔)

## 2. SSOT Architecture

```
ajenchen/design-system (DS repo) ── SSOT ───────────────────────────┐
├── packages/design-system/       ← DS library source                │
├── apps/template/                ← Product app seed                 │
├── scripts/                      ← Shared workflow scripts          │
│   ├── create-app.mjs            ← copy apps/template → apps/<name> │
│   ├── setup-netlify-access.mjs                                      │
│   ├── build-published-template-mirror.mjs ← mirror builder         │
│   └── (4 other consumer scripts)                                    │
├── .devcontainer/                ← Codespaces cloud-dev path        │
├── .storybook/main.ts            ← globs sharedStoryGlobs + apps/** │
├── .claude/                      ← Governance(skills/hooks/rules)   │
├── template/ds-product-template/ ← Consumer-specific scaffold       │
│   ├── CLAUDE.md / README.md     ← Scenario B onboarding docs       │
│   ├── .storybook/main.ts        ← apps-only glob(no DS internal)  │
│   ├── package.json              ← consumer workspaces + npm deps   │
│   └── (.github / .gitignore / .npmrc / netlify.toml / docs / ...)  │
└── .github/workflows/                                                │
    └── mirror-to-published-template.yml ← auto sync on push main    │
                                                                      │
                              ↓ (workflow + CROSS_REPO_TOKEN PAT)    │
                                                                      │
ajenchen/ds-product-template (published repo) ← Mirror artifact ─────┘
(Scenario B fork users land here via「Use this template」)
```

## 3. Mirror Workflow Chain(Scenario B 自動同步)

**Trigger**(雙觸發,2026-06-16 起):
- `workflow_run: Release completed` = **發版主路徑**(Release 成功 → npm 已有新版本 → mirror 內部 poll 第一輪即過,零等待)
- DS push main + template-affecting paths(scaffold 改動路徑;版本未上 npm 時 graceful skip 不長等)— path 列表以 `.github/workflows/mirror-to-published-template.yml` `paths:` 為準(含 apps/template、consumer scripts、.devcontainer、template/ds-product-template、package.json 等),不在此逐條複寫

**Build**:`scripts/build-published-template-mirror.mjs` 用 ALLOWLIST(non denylist,per codex r5)+ transform:
- Flatten `template/ds-product-template/*` → mirror root
- Transform `package.json`:`workspaces=["apps/*"]` + DS dep `^X.Y.Z`
- Transform `apps/template/package.json`:`@qijenchen/design-system: "*"` → `^X.Y.Z`
- 4 integrity scans:DS source residue / secret leak / Storybook glob / package dep

**Push**:`workflow + CROSS_REPO_TOKEN PAT(user one-time setup,workflow 印中文指引若 missing + fail-loud exit 1)` clone-and-overlay push to `ajenchen/ds-product-template` main — git clone + `rsync --checksum --delete --exclude='.github/workflows'`(保留 published repo 既有 workflows)+ fetch-rebase-retry 迴圈(非 force-push;2026-06-07 競態修)

## 4. Test Cases(Claude 19 + codex 18 union → 20 canonical)

### Scenario A(6 cases)

| # | Test | Verify cmd |
|---|---|---|
| A1 | Workspace link resolution(apps/template DS dep `*` → packages/design-system local)| `jq '.dependencies' apps/template/package.json` |
| A2 | DS source edit attempt → approval-preflight hook BLOCKER + 中文訊息 | `echo '{...}' \| bash .claude/hooks/check_substantive_edit_approval_preflight.sh` |
| A3 | `.claude/` native readable(無需 /plugin install)| `ls .claude/{skills,hooks,rules}/` |
| A4 | `npm run create-app <name>` → `apps/<name>/` 從 `apps/template/` 複製 + story title patched `Apps/<name>/...` | run + ls + grep |
| A5 | DS root `npm run storybook` 含 DS internal stories + `apps/**` stories,namespace 不撞 | grep `.storybook/main.ts` stories glob + 跑 storybook |
| A6 | Workspaces 含 `apps/*` | `jq '.workspaces' package.json` |

### Scenario B(7 cases,via mirror artifact)

| # | Test | Verify cmd |
|---|---|---|
| B1 | Mirror artifact npm deps `^X.Y.Z`(not workspace `*`)| `jq '.dependencies' /tmp/mirror/package.json` |
| B2 | Mirror 0 DS source(`packages/design-system/src/` 不存在)| `! -d /tmp/mirror/packages/design-system` |
| B3 | Mirror workspaces apps-only | `jq '.workspaces' /tmp/mirror/package.json` |
| B4 | Mirror `.storybook/main.ts` apps-only glob | grep stories |
| B5 | Mirror 含 `check-plugin-installed.mjs` + `setup-netlify-access.mjs` + `create-app.mjs` | ls /tmp/mirror/scripts/ |
| B6 | C-prime committed 治理(免 plugin):`npm install` 後 `ds-canonical/fork` 本體就位 + SessionStart 注入設計紀律 preamble + dispatcher 跑 fork hooks;既有 fork `sync-all` 移除 obsolete plugin-era hook | `node scripts/test-fork-governance.mjs` + `node scripts/dogfood-prepublish-verify.mjs` |
| B7 | `npm run create-app` 同 Scenario A | run + ls |

### Mirror integrity(7 cases)

| # | Test | Verify cmd |
|---|---|---|
| M1 | Trigger on DS push main with template-affecting paths(workflow path filter)| workflow log |
| M2 | DS source residue scan 0 leak(8 paths checked)| build script integrity scan 1 |
| M3 | Secret leak scan 0 leak(6 paths checked)| build script integrity scan 2 |
| M4 | Storybook glob apps-only(no `../packages/**`)| build script integrity scan 3 |
| M5 | package.json workspaces apps-only + DS dep transformed | build script integrity scan 4 |
| M6 | `apps/template/package.json` DS dep `*` → `^X.Y.Z` | build script auto transform |
| M7 | Clone-and-overlay push idempotent(reproducible)| `node scripts/build-published-template-mirror.mjs --out=/tmp/x` 多次 = 相同 output |

## 5. Verify Checkpoints — 後續增刪改 reference 此 SSOT

任何 future edit:
- 動 `apps/template/` → 影響兩 scenario 的 seed,測 A4 + B7
- 動 `scripts/{create-app,setup-netlify-access,check-plugin-installed,...}.mjs` → 測 A4 + B5 + mirror integrity scan
- 動 `.storybook/main.ts`(DS root)→ 測 A5
- 動 `template/ds-product-template/.storybook/main.ts` → 測 B4 + M4
- 動 mirror script `build-published-template-mirror.mjs` → 重跑 4 integrity scans + M2-M5
- 動 mirror workflow `.yml` → workflow_dispatch dry-run

## 6. Cross-references(其他 file 該 pointer 到本 SSOT,不重述定義)

| File | Reference type |
|---|---|
| `.claude/skills/deep-audit-cross-codex/SKILL.md` Phase 0 cwd detection | 已 reference(2-mode based on cwd structure)|
| `.claude/skills/design-system-audit/SKILL.md` dim 83 | 該砍重述部分,改 pointer here |
| DS root `CLAUDE.md` task nav row「建產品 / 開新 product app」 | 該 pointer here |
| `template/ds-product-template/CLAUDE.md` `# Fork-and-go onboarding` 段 | 該 pointer here for Scenario B specifics |
| `template/README.md` 命名 SSOT 段 | 該 pointer here for 3-layer naming |

## 7. Anti-pattern(永久 ban)

- ❌ Scenario A 文件叫 user `/plugin install`(他有 .claude/ native)
- ❌ Scenario B 文件假設 user 看得到 `packages/design-system/src/`
- ❌ Mirror 用 denylist `rm -rf packages/design-system/src`(per codex「太 narrow 會漏 governance/log/planning leak」)
- ❌ Mirror 漏 CROSS_REPO_TOKEN secret 時 silent succeed(必 fail + 印中文指引)
- ❌ `apps/template/package.json` DS dep `"beta"` 字串(Gap 3,scenario A workspace resolution vs scenario B npm version 行為不同)
- ❌ DS root `.storybook/main.ts` 漏 `apps/**` glob(Scenario A 看不到自己 product apps)
- ❌ Mirror `.storybook/main.ts` 含 `../packages/**` glob(Gap 4,published mirror 不該 leak DS trait grid)

## 8. 對齊上游 canonical

- CLAUDE.md 6 mindset 全 + meta-patterns 31 M-rules + 治理 8-home + 自主執行 7 軸 + 命名 SSOT 3-test(per deep-audit-cross-codex SKILL.md「上游 canonical 全繼承」段 2026-05-29)
- M17 SSOT 鐵律(本 file 就是 example:single canonical home,其他 file pointer)
- M19 trigger phrase auto-pipeline + M28 solo-work canonical
- 命名 SSOT 3 層(per `template/README.md`「命名 SSOT」段)
