// Static package-string paths — let Storybook's module resolver handle path lookup
// via package.json `exports` map(wildcard `./dist/addons/ds-devmode/*` maps to
// compiled .js files)。
//
// Why NOT dynamic resolution:
// - `createRequire(import.meta.url) + require.resolve('./manager')` → esbuild-register
//   transpiles ESM-import to CJS-require but package.json `"type":"module"` makes Node
//   treat output as ESM → ReferenceError: require not defined(beta.27/.28/.29/.30 fails)
// - `fileURLToPath(import.meta.url)` → 同樣被 esbuild-register CJS transpile 干擾
//
// Static strings are the ONLY pattern that works in both:
// (a) Node 22 ESM scope(this file evaluated as pure ESM)
// (b) esbuild-register CJS wrapping(Storybook's internal preset loader)
//
// Anchor:beta.27-30 4 連敗 + 連 1 commit 死(2026-05-28 全天炸 5 次)— root cause = mixed
// CJS/ESM evaluation。Static strings 是 Storybook 自家 addon(@storybook/addon-essentials
// 等)的 canonical pattern,世界級對照。

export const managerEntries = (entry: string[] = []) => [
  ...entry,
  '@qijenchen/storybook-config/dist/addons/ds-devmode/manager.js',
]
export const previewAnnotations = (entry: string[] = []) => [
  ...entry,
  '@qijenchen/storybook-config/dist/addons/ds-devmode/preview.js',
]
