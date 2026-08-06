#!/usr/bin/env node
/**
 * test-action-divider-placement.mjs — 分隔線「落點歸 DS」的結構防線。
 *
 * 語意 SSOT = patterns/action-bar/action-bar.spec.md 第五節(四個理由)。
 * 語意本身(功能域切換是否成立)無法從程式碼判定,本檔只鎖**結構可判定**的三件事:
 *
 *  (1) 誤觸保護的分隔線由元件自動放,不是 consumer 自刻 —— Dialog / Notice 家族兩個基座
 *      必須各自渲染 ButtonDivider,且渲染條件是「有其他操作 && 有關閉鈕」。
 *      少了條件 = 只有關閉鈕時也畫線(規範明訂不加);少了渲染 = consumer 又得自刻(漂移根因)。
 *  (2) Alert 與 Toast 共用同一基座,因此不得任一方自己再放一條(會變兩條)。
 *  (3) 分隔線元件本身不得手刻 —— 禁止 `w-px` / `h-px` 的裸 div 充當 action region 分隔線,
 *      必須用 <Separator> 或 <ButtonDivider>(M23(d) 消費既有 primitive)。
 *
 * Anchor(2026-08-06):Alert 規範要求 action 與關閉鈕之間有分隔線,Toast 規範卻完全沒提,
 * 兩者共用 Notice 基座與同一顆關閉鈕 —— 同結構卻行為分歧。改為基座自動放後,本檔鎖住它。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const read = rel => readFileSync(join(ROOT, rel), 'utf8')

let failures = 0
const fail = msg => { console.error(`✗ ${msg}`); failures += 1 }

// ── (1) 兩個基座都要「有條件地」自動放分隔線 ─────────────────────────────
const AUTO_PLACERS = [
  {
    label: 'Dialog 標題列',
    file: 'packages/design-system/src/components/Dialog/dialog.tsx',
    // actions 存在才渲染
    condition: /actions\s*!=\s*null\s*\?/,
  },
  {
    label: 'Notice 家族(Alert / Toast 共用)',
    file: 'packages/design-system/src/components/Notice/notice.tsx',
    // endContent 與關閉鈕同時存在才渲染
    condition: /endContent\s*!=\s*null\s*&&\s*showDismiss\s*&&\s*<ButtonDivider\s*\/>/,
  },
]

for (const placer of AUTO_PLACERS) {
  const source = read(placer.file)
  if (!source.includes('<ButtonDivider')) {
    fail(`${placer.file}: ${placer.label} 沒有自動渲染 ButtonDivider —— 誤觸保護的分隔線會退回 consumer 自刻(action-bar.spec.md 第五節「落點歸屬」)`)
    continue
  }
  if (!placer.condition.test(source)) {
    fail(`${placer.file}: ${placer.label} 的分隔線缺少「有其他操作才畫」的條件 —— 只有關閉鈕時也會畫線,違反第五節理由 3 的邊界情況`)
  }
}

// ── (2) 共用基座的兩個消費端不得再自刻一條 ───────────────────────────────
for (const rel of [
  'packages/design-system/src/components/Alert/alert.tsx',
  'packages/design-system/src/components/Toast/toast.tsx',
]) {
  if (read(rel).includes('<ButtonDivider')) {
    fail(`${rel}: 自己又放了一條分隔線 —— Notice 基座已自動放,重複會變兩條`)
  }
}

// ── (3) 禁手刻分隔線(action region scope)───────────────────────────────
const HANDCRAFT = /className="[^"]*\b(?:w-px|h-px)\b[^"]*bg-divider[^"]*"|className="[^"]*bg-divider[^"]*\b(?:w-px|h-px)\b[^"]*"/
const HANDCRAFT_SCOPE = [
  'packages/design-system/src/components/Dialog/dialog.tsx',
  'packages/design-system/src/components/Notice/notice.tsx',
  'packages/design-system/src/components/Alert/alert.tsx',
  'packages/design-system/src/components/Toast/toast.tsx',
  'packages/design-system/src/components/BulkActionBar/bulk-action-bar.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.tsx',
  'packages/design-system/src/patterns/header-canonical/chrome-header.tsx',
]
for (const rel of HANDCRAFT_SCOPE) {
  const source = read(rel)
  if (HANDCRAFT.test(source)) {
    fail(`${rel}: 手刻 w-px/h-px + bg-divider 當分隔線 —— 必須用 <Separator> 或 <ButtonDivider>(M23(d) 消費既有 primitive)`)
  }
}

if (failures) {
  console.error(`\n❌ action region 分隔線落點契約失敗 ${failures} 項`)
  process.exit(1)
}
console.log(`Action divider placement PASS (${AUTO_PLACERS.length} 個自動落點 + 2 個共用消費端 + ${HANDCRAFT_SCOPE.length} 個手刻掃描)`)
