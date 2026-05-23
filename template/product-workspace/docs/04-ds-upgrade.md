# 04 — DS upgrade(auto-update propagation)

`@qijenchen/design-system` 改版時,product-workspace **自動跟上**的流程。

## Auto-update 機制(本 workspace 自動 receive)

| Mechanism | 角色 |
|---|---|
| **npm semver caret**(`"^0.1.0"`)| package.json 設 caret → `npm install` 自動拉 minor/patch 內最新 |
| **Renovate(`renovate.json`)** | 每週一 6am 掃 `@qijenchen/*` 新版 → 開 PR(label `ds-bump`)|
| **`.github/workflows/audit.yml`** | Renovate PR 自動跑 audit → 全綠才能 merge |
| **Pre-release `@beta` dist-tag** | DS 端 ship beta 後 consumer 可手動 `npm install @qijenchen/design-system@beta` 試 |
| **Codemod**(`codemods/`)| Major bump 自動 migration script |

## 流程圖

```
DS repo:dev push → tag v0.2.0 → CI publish npm
  ↓
npm registry:@qijenchen/design-system@0.2.0 available
  ↓
product-workspace renovate(週一 6am):
  - 開 PR "chore(deps): bump @qijenchen/design-system to 0.2.0"
  - Label:ds-bump,minor-bump
  ↓
CI audit.yml 跑:tsc / content / code / build / storybook
  ├── 全綠 → team review 看 diff + storybook preview → merge
  └── 紅 → fix forward(用 DS docs 看 changelog / 跑 codemod)
  ↓
Main branch updated → deploy.yml per-app Vercel re-deploy preview
```

## Patch / Minor / Major 處理差異

### Patch(0.1.0 → 0.1.1)

DS bug fix,無 API 改動。Renovate auto-PR,CI 全綠 → team 看 changelog 描述 → merge。**通常 5-min review**。

### Minor(0.1.0 → 0.2.0)

DS 新功能 / 新元件 / 新 prop(向後相容)。Renovate auto-PR + CI 跑 audit。
- 新元件 consumer 不用動就可 `import { NewComponent } from '@qijenchen/design-system'`
- 新 prop 是 optional,既有 code 不破

### Major(0.x.x → 1.0.0)

DS breaking change(API rename / prop semantic change / 元件移除)。Renovate auto-PR + 加 label `major-bump` `needs-codemod`。

Steps:
1. DS owner 寫好 codemod 在 `@qijenchen/design-system/codemods/v0-to-v1/`
2. Consumer 跑:
   ```bash
   npx @qijenchen/design-system codemod v0-to-v1 apps/*/src
   ```
3. Test:`npm run audit:all && npm run build`
4. Manual fix codemod 漏的(複雜 case)
5. Merge PR(team review必要)

## Pre-release(@beta / @next)— consumer 試版

新 product idea 想先試 DS 下一版 feature:

```bash
# 試 beta
npm install @qijenchen/design-system@beta --save

# 試 next(下一 major 預發)
npm install @qijenchen/design-system@next --save

# Pin specific pre-release
npm install @qijenchen/design-system@0.2.0-beta.3 --save-exact
```

只 install 到**單一 app**(`apps/<name>/`),不污染 workspace shared。Renovate 不會跟 beta(`respectLatest: false` per `renovate.json`)。

## 看 DS changelog

```bash
npm view @qijenchen/design-system versions    # 全版本
npx changelog @qijenchen/design-system        # 詳細 changelog(per changesets)
```

Or browse `qijenchen/design-system` GitHub Releases。

## 不要做的

- ❌ 改 `node_modules/@qijenchen/design-system/` 的 .tsx — 下次 install 被覆蓋
- ❌ Pin 死版本(`"@qijenchen/design-system": "0.1.0"`)— 失去 auto-update,security patch 收不到
- ❌ Major bump 不跑 codemod 直接手改 — 易漏 case
