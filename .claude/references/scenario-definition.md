# Scenario Definition — Monorepo 2-Scenario Architecture(SSOT)

> **2026-05-29 ship**:本 file 為 Scenario A / Scenario B 定義 + 互動方式 + verify checkpoints 的**唯一 SSOT**。所有 skill / hook / spec / AGENTS.md 文字 reference 此 file,**不重述定義**(per user「無多餘重複 SSOT」directive)。

> **設計起源**:user 2026-05-29 verbatim「實際上會有兩種場景,一種是直接 fork ds repo 用的一種是 fork template repo 用的使用者,兩種情境都要確保完整沒有斷點又能確保 SSOT」+ codex r5 synthesize verdict(8 gap fix)。

## 1. 兩 Scenario 定義

### Scenario A — Direct fork DS repo

**用戶**:DS 共同維護者 / 想看 DS source 一起改 DS + 寫 product 的人
**入口**:fork `ajenchen/design-system` GitHub repo
**他拿到**:DS source(`packages/design-system/`)+ canonical 治理(`packages/design-system/ds-canonical/`)+ registry-generated provider adapters + scaffold(`apps/template/`)+ scripts
**DS 取得方式**:`packages/*` npm workspace link(local resolution)
**Governance 取得**:共同 authority 直接讀 `packages/design-system/ds-canonical/`；provider registry/materializer 另產生原生 discovery views(例如 Claude 的 `.claude/`)。這些 view 可刪除重建、不是 owner；**不需 `/plugin install`**。
**E2E 流程**:`fork → npm install → claude → npm run create-app order-dashboard → npm install(workspace re-link)→ npm run storybook → git push`
**決策邊界**:`check_substantive_edit_approval_preflight.sh` 以 canonical target-bound classifier 區分變更；純工程 bug／refactor／test／governance remediation 依 Standing Authorization AUTO，只有會改變產品／UI／UX SSOT 且存在真實選擇的 edit 才需 exact user decision，未知情況 fail closed。

### Scenario B — Fork published template repo

**用戶**:純做產品 / 不需看 DS source 的人
**入口**:`ajenchen/ds-product-template` GitHub「Use this template」(該 repo 內容 = mirror artifact,**非 SSOT**,by 自動 mirror workflow auto-generate from DS repo)
**他拿到**:scaffold + committed `AGENTS.md` 共用指令 + Claude/Codex adapters + Agent Skills generated views；exact DS version 內含同版治理 payload
**DS 取得方式**:`@qijenchen/design-system` npm registry(exact `X.Y.Z`;升級只走 reviewed PR)
**Governance 取得**:Day-0 committed provider views + exact npm `ds-canonical/fork` payload。SessionStart 只做 read-only verification，不安裝、不解析 dist-tag、不改 workspace。**不需 plugin**；native hooks 只是回饋加速器，provider-neutral check + CI 是 hard authority。
**E2E 流程**:`fork → npm run setup:all(依 lock 安裝、驗簽、執行 hooks-off check，並建立受控 peer CLI)→ Claude/Codex/其他已登錄 agent → npm run setup:netlify(唯讀診斷、Dashboard/manual、exit 2 fail-closed) → 人在 Dashboard import GitHub repo → npm run create-app order-dashboard → npm install → npm run storybook → upgrade 透過 branch/PR → git push`
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
├── packages/design-system/ds-canonical/ ← Governance canonical     │
├── .claude/ / .agents/ / .codex/ ← Generated provider adapters     │
├── template/ds-product-template/ ← Consumer-specific scaffold       │
│   ├── Claude adapter / README   ← Scenario B onboarding docs       │
│   ├── .storybook/main.ts        ← apps-only glob(no DS internal)  │
│   ├── package.json              ← consumer workspaces + npm deps   │
│   └── (.github / .gitignore / .npmrc / netlify.toml / docs / ...)  │
└── .github/workflows/                                                │
    └── mirror-to-published-template.yml ← protected merge/release  │
                                                                      │
                              ↓ (GitHub App + generated review PR)   │
                                                                      │
ajenchen/ds-product-template (published repo) ← Mirror artifact ─────┘
(Scenario B fork users land here via「Use this template」)
```

## 3. Mirror Workflow Chain(Scenario B 自動同步)

**Trigger**(雙觸發,2026-06-16 起):
- `workflow_run: Release completed` = **發版主路徑**(Release 成功 → npm 已有新版本 → mirror 內部 poll 第一輪即過,零等待)
- protected PR merge 產生的 `main` push + template-affecting paths(scaffold 改動路徑；版本未上 npm 時 graceful skip 不長等)— path 列表以 `.github/workflows/mirror-to-published-template.yml` `paths:` 為準，不在此逐條複寫

**Build**:`scripts/build-published-template-mirror.mjs` 用 ALLOWLIST(non denylist,per codex r5)+ transform:
- Flatten `template/ds-product-template/*` → mirror root
- Transform `package.json`:`workspaces=["apps/*"]` + DS/Storybook deps exact `X.Y.Z`
- Transform `apps/template/package.json`:`@qijenchen/design-system: "*"` → exact `X.Y.Z`
- 4 integrity scans:DS source residue / secret leak / Storybook glob / package dep
- `product-template-scaffold.lock.json` 在 provider/fork 生成完成後對 mirror 的每個靜態發布檔案鎖定 path/mode/size/SHA-256，並將唯一發布後生成路徑 `package-lock.json` 連同 pinned npm generator contract 關閉。該 lock 本身是 BOM-bound immutable Release asset；最終 lockfile bytes 再由 mirror receipt 的 full-tree digest 綁定。

**Promotion**:credential-free job 先重驗 immutable BOM → scaffold-lock exact bytes → 最終 full-tree receipt，fresh writer 再對解壓樹與 rsync 後 checkout 重驗。workflow 以短效 GitHub App token clone + checksum overlay **完整 allowlisted tree(含 workflows)**，重生 lockfile後推 dedicated branch、開 PR。published `main` 禁直推；required checks + review 通過才 merge。缺 App credentials 時 fail-closed，禁止退回 long-lived PAT 或靜默保留 stale workflow。

## 4. Test Cases(Claude 19 + codex 18 union → 20 canonical)

### Scenario A(6 cases)

| # | Test | Verify cmd |
|---|---|---|
| A1 | Workspace link resolution(apps/template DS dep `*` → packages/design-system local)| `jq '.dependencies' apps/template/package.json` |
| A2 | DS source edit → canonical classifier：工程 remediation PASS；未具 current-scope exact target + operation-digest decision 的產品／UI／UX SSOT 取捨 BLOCK + 中文訊息 | `bash packages/design-system/ds-canonical/hooks/tests/test_check_substantive_edit_approval_preflight.sh` |
| A3 | Canonical corpus 可讀且所有 enabled provider adapter 與它一致(無需 /plugin install)| `node scripts/sync-ds-canonical.mjs --check` |
| A4 | `npm run create-app <name>` → `apps/<name>/` 從 `apps/template/` 複製 + story title patched `Apps/<name>/...` | run + ls + grep |
| A5 | DS root `npm run storybook` 含 DS internal stories + `apps/**` stories,namespace 不撞 | grep `.storybook/main.ts` stories glob + 跑 storybook |
| A6 | Workspaces 含 `apps/*` | `jq '.workspaces' package.json` |

### Scenario B(7 cases,via mirror artifact)

| # | Test | Verify cmd |
|---|---|---|
| B1 | Mirror artifact npm deps exact `X.Y.Z`(not range/tag/workspace `*`)| `jq '.dependencies' /tmp/mirror/package.json` |
| B2 | Mirror 0 DS source(`packages/design-system/src/` 不存在)| `! -d /tmp/mirror/packages/design-system` |
| B3 | Mirror workspaces apps-only | `jq '.workspaces' /tmp/mirror/package.json` |
| B4 | Mirror `.storybook/main.ts` apps-only glob | grep stories |
| B5 | Mirror 含 `check-plugin-installed.mjs` + `setup-netlify-access.mjs` + `create-app.mjs` | ls /tmp/mirror/scripts/ |
| B6 | Day-0 provider parity(免 plugin):AGENTS + Claude/Codex adapters + 全分類 skills 已 committed；SessionStart zero-write；dispatcher/hard gates 行為一致 | `node scripts/test-fork-governance.mjs` + clean-room provider probes |
| B7 | `npm run create-app` 同 Scenario A | run + ls |

### Mirror integrity(7 cases)

| # | Test | Verify cmd |
|---|---|---|
| M1 | Trigger on protected DS PR merge/main event with template-affecting paths(workflow path filter)| workflow log |
| M2 | DS source residue scan 0 leak(8 paths checked)| build script integrity scan 1 |
| M3 | Secret leak scan 0 leak(6 paths checked)| build script integrity scan 2 |
| M4 | Storybook glob apps-only(no `../packages/**`)| build script integrity scan 3 |
| M5 | package.json workspaces apps-only + DS dep transformed | build script integrity scan 4 |
| M6 | `apps/template/package.json` DS dep `*` → exact `X.Y.Z` | build script auto transform |
| M7 | Clone-and-overlay output reproducible；live path 只開 App-authored PR、不直推 main | local double-build diff + workflow run/PR evidence |

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
| `packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md` Phase 0 cwd detection | 已 reference(2-mode based on cwd structure)|
| `packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md` dim 83 | 該砍重述部分,改 pointer here |
| DS root `AGENTS.md` task nav row「建產品 / 開新 product app」 | 該 pointer here |
| provider-specific generated adapter `template/ds-product-template/CLAUDE.md` `# Fork-and-go onboarding` 段 | 該 pointer here for Scenario B specifics |
| `template/README.md` 命名 SSOT 段 | 該 pointer here for 3-layer naming |

## 7. Anti-pattern(永久 ban)

- ❌ Scenario A 文件叫 user `/plugin install`(repo 已含 canonical corpus + generated native adapters)
- ❌ Scenario B 文件假設 user 看得到 `packages/design-system/src/`
- ❌ Mirror 用 denylist `rm -rf packages/design-system/src`(per codex「太 narrow 會漏 governance/log/planning leak」)
- ❌ Mirror 使用 long-lived PAT、直推 main、或排除 `.github/workflows` 造成 receiver drift
- ❌ GitHub App credentials 缺失時 silent succeed / fallback PAT(必 fail-closed)
- ❌ `apps/template/package.json` DS dep `"beta"` 字串(Gap 3,scenario A workspace resolution vs scenario B npm version 行為不同)
- ❌ DS root `.storybook/main.ts` 漏 `apps/**` glob(Scenario A 看不到自己 product apps)
- ❌ Mirror `.storybook/main.ts` 含 `../packages/**` glob(Gap 4,published mirror 不該 leak DS trait grid)

## 8. 對齊上游 canonical

- AGENTS.md 6 mindset 全 + canonical `packages/design-system/ds-canonical/rules/meta-patterns.md` 31 M-rules + 治理 8-home + 自主執行 7 軸 + 命名 SSOT 3-test(per deep-audit-cross-codex SKILL.md「上游 canonical 全繼承」段 2026-05-29)
- M17 SSOT 鐵律(本 file 就是 example:single canonical home,其他 file pointer)
- M19 trigger phrase auto-pipeline + M28 solo-work canonical
- 命名 SSOT 3 層(per `template/README.md`「命名 SSOT」段)
