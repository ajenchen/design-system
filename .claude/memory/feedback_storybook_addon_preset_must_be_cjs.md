---
name: Storybook addon preset 必用 `.cjs` extension(ESM/CJS interop canonical)
description: Storybook preset(managerEntries/previewAnnotations 函式)在 `"type":"module"` package 內必用 `.cjs` 副檔名,不能寫 `.ts→.js`。.cjs override package type → Node 強制 CJS evaluation → esbuild-register 不衝突。
type: feedback
originSessionId: 2026-05-28-deploy-5-fail-anchor
---

# Storybook addon preset MUST be `.cjs` — 5 連敗 anchor

## Core rule(永久 canonical)

當 storybook-config / 任何 storybook-addon package 滿足:
- `package.json` 含 `"type": "module"`
- 且要 export Storybook addon preset(`managerEntries` / `previewAnnotations`)

**preset 必用 hand-written `.cjs` 副檔名,不可走 `.ts → tsc → .js`**。

## Why(2026-05-28 beta.27-.31 5 連敗 root cause)

Storybook 的 preset loader 走 `esbuild-register` CJS path:
```
loadESMFromCJS → ModuleLoader.importSyncForRequire → ModuleJobSync.runSync
```

但 package.json `"type": "module"` 強制 Node 把 `.js` 當 ESM。

任何 dynamic resolution 都死:
- `createRequire(import.meta.url) + require.resolve('./manager')` → `require` undefined in ESM scope
- `fileURLToPath(import.meta.url) + path.resolve(...)` → esbuild-register CJS-mode 注入 `require` → 同 ReferenceError
- static string `'@scope/pkg/dist/.../preview.js'` → Vite/Rollup 加 leading `/` 變 URL → fail resolve

**`.cjs` 副檔名 override package.json type field** → Node 強制 CJS evaluation → `require` + `__dirname` 可用 + esbuild-register 不需 transpile → 直接 evaluate。

## Canonical pattern

```js
// preset.cjs(hand-written CommonJS)
const path = require('path')

// Compile output sits at dist/addons/<name>/ — adjust path accordingly
const distDir = path.join(__dirname, '..', '..', 'dist', 'addons', '<name>')

module.exports = {
  managerEntries: (entry = []) => [...entry, path.join(distDir, 'manager.js')],
  previewAnnotations: (entry = []) => [...entry, path.join(distDir, 'preview.js')],
}
```

For source-mode addon(not compiled):
```js
// .storybook/addons/<name>/preset.cjs — pointed to raw .tsx/.ts via esbuild-register
const path = require('path')

module.exports = {
  managerEntries: (entry = []) => [...entry, path.join(__dirname, 'manager.tsx')],
  previewAnnotations: (entry = []) => [...entry, path.join(__dirname, 'preview.ts')],
}
```

## How to apply

1. **package.json**:`exports['./preset']` 指 preset.cjs(非 .ts / .js)
2. **package.json `files`**:`addons/<name>/preset.cjs` 加進 ship list(否則 npm pack 漏)
3. **如有 preset.ts**:留作 type-check reference,內容改 no-op + DEPRECATED comment
4. **本機 verify**:`npm run build-storybook` from DS root + template packed-tgz install 雙 verify
5. **release.yml audit gates**:tsc + plugin-structure-validate + dogfood-prepublish-verify 必跑

## Anti-pattern(永久 ban)

- ❌ `import { createRequire } from 'node:module'` + `require.resolve(...)` 在 ESM preset.ts
- ❌ `fileURLToPath(import.meta.url) + path.resolve(...)` 在 ESM preset.ts
- ❌ static string `'@scope/pkg/path/...'` 作 manager/preview entry(Vite URL escape)
- ❌ tsc 編譯 preset.ts 到 dist/preset.js + 依賴 Node 直接 evaluate(被 esbuild-register 攔)
- ❌ 改 storybook-addon preset 不本機跑完整 `npm run build-storybook` 就 push tag

## 世界級對照

- `@storybook/addon-essentials` preset.js + non-module package.json
- `@storybook/addon-a11y` preset.js + non-module package.json
- `@storybook/addon-docs` preset.js + non-module package.json

Storybook 官方 addon 全部用 `.js` + CJS 包(no `"type":"module"`)。我們因為 `@qijenchen/storybook-config` 也需要 ESM preview.tsx export,只能保 type:module + addon 走 `.cjs` 雙模式。

## Anchor(2026-05-28 全天 5 連敗序)

| beta | 我用的招 | 死法 |
|---|---|---|
| .27 | exports 點 raw `.ts` | Node 22 不能在 node_modules type-strip |
| .28 | `require.resolve('./manager.tsx')` 寫死副檔名 | tsc 不改字面字串,compiled .js 找不到 .tsx |
| .29 | extensionless `require.resolve('./manager')` | exports map enforcement 攔 raw dist path |
| .30 | 5 manifest sync | preset.js 仍 require.resolve → ESM scope undefined |
| .31 | `fileURLToPath + path.resolve` absolute path | 同 esbuild-register/ESM 衝突 |
| **.32 fix** | **`preset.cjs` hand-written** | ✅ PASS |

## Mechanical enforcement(hook)

`check_storybook_addon_packaging.sh(r2,2026-06-11 merge)`(per `.claude/hooks/`)PreToolUse Edit/Write 偵測:
- `*storybook-config/addons/*/preset.ts` 含 `require.resolve` / `createRequire` / `fileURLToPath` → BLOCKER 提示用 `.cjs` 替代
- `*storybook-config/addons/*/preset.cjs` 不存在 + package.json exports 點 `.ts` → WARN
