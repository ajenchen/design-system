// preset.cjs — hand-written CommonJS preset to bypass ESM/CJS evaluation conflict.
//
// Why .cjs instead of .ts → .js compilation:
//   package.json has `"type": "module"` → Node treats .js as ESM。esbuild-register
//   transpiles ESM imports → CJS `require()` calls,但 Node 已 lock 為 ESM scope →
//   ReferenceError: require is not defined。
//
//   .cjs extension **overrides** package.json type field → Node 強制 CJS evaluation
//   → require 可用,esbuild-register 不需 transpile,直接 evaluate。
//
// 對齊:@storybook/addon-essentials 等官方 addon 也用 .cjs / .js with conditional
// package type 模式(see Storybook source code packages/addons/* preset.js)。
//
// Anchor:beta.27/.28/.29/.30 連 4 ship 死 — require.resolve 各種變形都被 esbuild-
// register ESM/CJS conflict 攔。Static string 也炸(Vite URL escape)。.cjs 是
// world-class Storybook addon 通用 pattern。
const path = require('path')

// preset.cjs sits in addons/ds-devmode/(source path)but compiled output is in
// dist/addons/ds-devmode/(.js files)。Resolve up 2 levels then into dist/。
const distDir = path.join(__dirname, '..', '..', 'dist', 'addons', 'ds-devmode')

module.exports = {
  managerEntries: (entry = []) => [...entry, path.join(distDir, 'manager.js')],
  previewAnnotations: (entry = []) => [...entry, path.join(distDir, 'preview.js')],
}
