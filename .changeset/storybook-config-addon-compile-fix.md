---
'@qijenchen/design-system': patch
'@qijenchen/storybook-config': patch
---

fix(storybook-config): compile addons/ds-devmode to dist/ — beta.27 shipped raw .ts

beta.27 published with `exports['./addons/ds-devmode/*']` pointing to raw `.ts`
files。Node 22 cannot strip types under `node_modules` (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING)
→ Storybook preset load fails → consumer build dies.

Fix:
- `tsconfig.json` include `addons/**/*.{ts,tsx}` → tsc emits compiled `.js` to `dist/addons/`
- `package.json` exports map points to `dist/addons/ds-devmode/*.js`(not raw)
- `files` removes redundant `"addons"`(dist 已含編譯後版本)
- Fix 3 pre-existing TS errors uncovered by now-broader compile scope:
  - `Panel.tsx` styles.toggleBtn 函式錯放在 CSSProperties record → 抽到 `toggleBtnStyle`
  - `constants.ts` `InspectPayload` 4 fields filled-in-Stage-2 → 改 optional
  - `Panel.tsx` 對應 null-safety `payload.breadcrumb` / `payload.authorCss`

Anchor:2026-05-28 ds-product-template Netlify deploy 連續 2 commit 死(`849f676` + `2391db2` Build script exit 2),local 跑也 reproduce → root cause = node_modules type-stripping。
