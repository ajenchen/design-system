---
name: Storybook addon preset 必為合法 ESM(Storybook 10;取代 8.x 的 .cjs 規則)
description: Storybook 10 起 preset 一律以 ESM 載入(官方:CJS preset 不再支援)。storybook-config 的 ds-devmode preset 由 preset.ts 經 tsc 編成 dist/…/preset.js,用 fileURLToPath(import.meta.resolve()) 回傳絕對路徑;8.x 時代的 preset.cjs 已退場。
type: feedback
originSessionId: 2026-11-25-storybook10-upgrade(前身 2026-05-28-deploy-5-fail-anchor)
---

# Storybook addon preset 必為合法 ESM(Storybook 10)

## Core rule

`@qijenchen/storybook-config`(`"type": "module"`)或任何 storybook addon 套件要 export preset(`managerEntries` / `previewAnnotations`)時:

- preset 寫成 **ESM**:`packages/storybook-config/addons/ds-devmode/preset.ts` → tsc → `dist/addons/ds-devmode/preset.js`;
  `exports["./addons/ds-devmode/preset"]` 指向該檔(`import` / `default`)。
- 回傳**解析好的絕對路徑**:`fileURLToPath(import.meta.resolve('./manager.js'))`。
- preset 裡**不准出現 CJS 全域**(`require` / `require.resolve` / `__dirname` / `__filename` / `module.exports`)—— ESM 裡它們不存在;
  真的需要就照官方寫法自己定義(`createRequire(import.meta.url)`、`fileURLToPath(import.meta.url)`)。
- 不再寫 `.cjs` preset。

## Why(官方出處)

storybookjs/storybook `MIGRATION.md`「From version 9.x to 10.0.0」:
- 「The `.storybook/main.*` file and other presets must be valid ESM」:「Storybook will load the `.storybook/main.*` file and any custom
  preset files as ESM files. Thus CJS constants (`require`, `__dirname`, `__filename`) will not be defined.」「A `main.ts` file that's CJS
  is no longer supported. The same applies to any custom preset files.」
- 「Local addons must be fully resolved」:managerEntries 範例即 `fileURLToPath(import.meta.resolve('./iframe.js'))`。
- 「Node.js 20.19+ or 22.12+ required」(為了不帶旗標的 `require(esm)`)。

## 2026-11-25 兩面實測(storybook 10.6.9、Node 24.14.0)

| 情境 | `.cjs`(舊 preset.cjs,exports 指它) | ESM(preset.ts → dist/…/preset.js) |
|---|---|---|
| DS repo dogfood:`npm run build-storybook` | ✅ 建置成功;`sb-addons/packages-storybook-config-addons-ds-devmode-4` 在、preview bundle 含 `__ds_devmode_overlay__` | ✅ 同左,iframe bundle 雜湊相同(`iframe-CxofqWNk.js`) |
| consumer:published template 鏡像 + 兩包 `npm pack` tgz 安裝後 `storybook build` | ✅ `qijenchen-storybook-config-addons-ds-devmode-4` 在 | ✅ 同左,iframe bundle 雜湊相同 |
| 對照組(弄壞會紅):ESM preset 指向不存在的 `./manager-missing.js` | — | ❌ 建置 exit 1:`Could not resolve …/manager-missing.js` |

兩種寫法 10.6.9 都建得起來,原因是 10.x 的 preset loader 改成原生 `import()`(`storybook/dist/_node-chunks` 的 `importModule`:先 `import()`,
失敗才退回 `createRequire`),而 8.x 的 esbuild-register 已整個不在 `storybook/dist` 裡 —— Node 的 `import()` 本來就讀得了 `.cjs`。
**選 ESM 的依據是官方支援格式**:`.cjs` 只是「目前剛好能跑」,官方已明文不支援(M37:能跑 ≠ 被保證)。

## 8.x 時代(歷史,不再適用)

2026-05-28 beta.27–.31 五連敗:8.x preset loader 走 esbuild-register(CJS 轉譯),跟 `"type":"module"` 衝突 ——
`createRequire` / `require.resolve` / `fileURLToPath(import.meta.url)` 全被攔,.32 改 hand-written `preset.cjs` 才過。
這條根因只存在於 8.x 的 loader;10.x 已無 esbuild-register,當時的「反 pattern」清單在 10.x 裡反而是官方寫法,不得再拿來擋。

| beta | 招 | 死法(8.x) |
|---|---|---|
| .27 | exports 點 raw `.ts` | Node 22 不能在 node_modules type-strip |
| .28 | `require.resolve('./manager.tsx')` | tsc 不改字面字串 |
| .29 | extensionless `require.resolve('./manager')` | exports map 攔 raw dist path |
| .30 | 5 manifest sync | preset.js 仍 require.resolve → ESM scope undefined |
| .31 | `fileURLToPath + path.resolve` | esbuild-register/ESM 衝突 |
| .32 | hand-written `preset.cjs` | ✅(8.x) |

## How to apply

1. 改 preset 一律改 `preset.ts`(ESM),`npm -w @qijenchen/storybook-config run build` 後才有 dist。
2. 本機兩面驗:DS root `npm run build-storybook` + published template 鏡像(`scripts/build-published-template-mirror.mjs`)裝兩包 tgz 後 `storybook build`;
   以 `storybook-static/sb-addons/*ds-devmode*` 存在與 preview bundle 含 `__ds_devmode_overlay__` 為準,工具列開關由 `npm run devmode:test` 驗。
3. peerDependencies 跟 dependencies 的 addon 版號對齊(10.6.9 的 addon 本身要求 `storybook ^10.6.9`)。

## Mechanical enforcement(hook)

canonical `packages/design-system/ds-canonical/hooks/check_storybook_addon_packaging.sh` 的 r2(PostToolUse Write|Edit|MultiEdit):
- `addons/<name>/preset.cjs` 寫入 → BLOCKER(CJS preset 10.x 不支援)
- `addons/<name>/preset.{ts,js,mjs}` 的程式碼(剝掉註解後)用 CJS 全域而沒有自行定義(`require(` / `require.resolve` 沒有 `createRequire`、
  `__dirname` / `__filename` 沒有宣告、`module.exports` / `exports.x =`)→ BLOCKER
- 官方寫法(`import.meta.resolve`、`createRequire(import.meta.url)`、`fileURLToPath(import.meta.url)`)不擋;escape `@preset-cjs-skip:`
