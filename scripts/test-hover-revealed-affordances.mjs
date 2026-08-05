#!/usr/bin/env node
/**
 * test-hover-revealed-affordances.mjs — hover-reveal 可見性 gating 的機械防線。
 *
 * Anchor(2026-08-05):撤回「touch 恆顯」實驗時,連同 `AvatarDismissOverlay` 的整條
 * `opacity-0 group-hover/…` gating class 一起刪除 → 桌機 PeoplePicker stack 的每個 avatar
 * 移除鈕變成無條件恆顯(user 抓「為何還是把所有 avatar 的 x 都秀出來」)。純視覺 regression,
 * tsc / lint / content-quality 全部照綠 —— 只有機械斷言擋得住。
 *
 * 契約:登記在此的 hover-reveal affordance,其 className 必須同時含
 *   (a) `opacity-0` 初始隱藏
 *   (b) 至少一個 `group-hover/<scope>:opacity-100` 揭示條件
 *   (c) 至少一個 focus 類揭示條件(keyboard 可達 — a11y,不得只靠 hover)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// 每筆 = 一個 hover-reveal affordance:檔案 + 定位它的函式/註解錨點
const REGISTRY = [
  {
    label: 'PeoplePicker AvatarDismissOverlay(stack 移除鈕)',
    file: 'packages/design-system/src/components/PeoplePicker/person-display.tsx',
    anchor: 'function AvatarDismissOverlay',
    scope: 'avatar',
  },
  {
    label: 'FileItem hover action',
    file: 'packages/design-system/src/components/FileItem/file-item.tsx',
    anchor: 'hoverAction &&',
    scope: 'row',
  },
  {
    label: 'ItemInlineAction menu-item / tree-item / row 三 scope',
    file: 'packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx',
    anchor: 'opacity-0 group-hover/menu-item:opacity-100',
    scope: 'menu-item',
  },
  {
    label: 'Sidebar menu-item action',
    file: 'packages/design-system/src/components/Sidebar/sidebar.tsx',
    anchor: 'opacity-0 group-hover/menu-item:opacity-100',
    scope: 'menu-item',
  },
  {
    label: 'Carousel arrow wrapper',
    file: 'packages/design-system/src/components/Carousel/carousel.tsx',
    anchor: 'const arrowWrapperClass',
    scope: 'carousel',
  },
  {
    label: 'DataTable url cell 編輯連結',
    file: 'packages/design-system/src/components/DataTable/cell-registry.tsx',
    anchor: "aria-label=\"編輯連結\"",
    scope: 'cell',
  },
]

let failures = 0
for (const entry of REGISTRY) {
  const source = readFileSync(join(ROOT, entry.file), 'utf8')
  const start = source.indexOf(entry.anchor)
  if (start < 0) {
    console.error(`✗ ${entry.label}: anchor ${JSON.stringify(entry.anchor)} not found in ${entry.file}`)
    failures += 1
    continue
  }
  // 取錨點後一段(涵蓋該 affordance 的 className 區塊)
  const block = source.slice(start, start + 2500)
  const hasHidden = /opacity-0\b/.test(block)
  const hasHoverReveal = new RegExp(`group-hover/${entry.scope}:opacity-100`).test(block)
    || /group-hover(?:\/[a-z-]+)?:opacity-100/.test(block)
  const hasFocusReveal = /group-focus-within(?:\/[a-z-]+)?:opacity-100|group-has-\[:focus-visible\](?:\/[a-z-]+)?:opacity-100|focus-visible:opacity-100|(?:^|[\s'"`])focus-within:opacity-100/m.test(block)
  const problems = []
  if (!hasHidden) problems.push('缺 `opacity-0` 初始隱藏 → 會無條件恆顯')
  if (!hasHoverReveal) problems.push('缺 `group-hover/…:opacity-100` 揭示條件')
  if (!hasFocusReveal) problems.push('缺 focus 類揭示條件(keyboard 不可達)')
  if (problems.length) {
    console.error(`✗ ${entry.label} (${entry.file}):\n    - ${problems.join('\n    - ')}`)
    failures += 1
  } else {
    console.log(`✓ ${entry.label}`)
  }
}

if (failures) {
  console.error(`\n❌ hover-reveal gating 契約失敗 ${failures} 項 — 見上方檔案`)
  process.exit(1)
}
console.log(`Hover-revealed affordance gating PASS (${REGISTRY.length} registered)`)
