// ds-devmode addon preset —— Storybook 10 起 preset 必須是合法 ESM(2026-11-25 升 10.6.9 改寫)。
//
// tsc 把本檔編成 dist/addons/ds-devmode/preset.js(套件 `"type": "module"` → Node 當 ESM 載入),
// package.json `exports["./addons/ds-devmode/preset"]` 指向它;manager.js / preview.js 是同一個 dist 資料夾裡的兄弟檔。
//
// 依據(官方):storybookjs/storybook MIGRATION.md「From version 9.x to 10.0.0」——
//   ·「The `.storybook/main.*` file and other presets must be valid ESM」:preset 以 ESM 載入,`require` / `__dirname` /
//     `__filename` 不存在;「A `main.ts` file that's CJS is no longer supported. The same applies to any custom preset files.」
//   ·「Local addons must be fully resolved」:managerEntries 要回傳解析好的絕對路徑,官方寫法就是
//     `fileURLToPath(import.meta.resolve('./x.js'))`。
//
// 為什麼不再用 8.x 時代的 preset.cjs:那是為了繞開 8.x preset loader 的 esbuild-register(CJS 轉譯)與
// `"type":"module"` 的衝突(beta.27-.31 五連敗)。10.6.9 的 loader 改成原生 `import()`(storybook/dist 已沒有
// esbuild-register),兩種寫法 2026-11-25 都實測建得起來,但只有 ESM 是官方支援的格式 —— 兩面實測與出處見
// governance/memory/feedback_storybook_addon_preset_esm.md。
import { fileURLToPath } from 'node:url'

export const managerEntries = (entry: string[] = []) => [
  ...entry,
  fileURLToPath(import.meta.resolve('./manager.js')),
]

export const previewAnnotations = (entry: string[] = []) => [
  ...entry,
  fileURLToPath(import.meta.resolve('./preview.js')),
]
