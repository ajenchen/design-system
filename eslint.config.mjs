// ESLint 只開兩條 React hooks 規則(2026-09-29,待辦總帳 N40):`rules-of-hooks` 與 `exhaustive-deps`。
// 這是 repo 第一份 eslint 設定,範圍刻意只到 DS 原始碼與 apps;其他規則不開(型別由 build:lib / tsc 守,格式由既有閘守)。
// 為什麼要:exhaustive-deps 抓的是 effect / callback / memo 漏掉相依造成的過期閉包 —— 那種 bug 在畫面上是「有時候不更新」,
// 沒有任何像素閘量得到。stale-closure 的修法要逐處判斷(補相依 / 改成 ref / 真的刻意只跑一次要寫理由),不准整批 disable。
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['packages/design-system/src/**/*.{ts,tsx}', 'apps/**/src/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.tsx', '**/dist/**', '**/storybook-static/**'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
]
