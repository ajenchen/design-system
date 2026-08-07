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

// ── (4) 幾何:線長只能由「該列最高元件 − inset」算出,不得寫死 ──────────────
// 2026-08-07 事故:同一條 canonical 底下實測跑出 13 / 16 / 24px 三種長度。根因是兩套機制
// 並存(ButtonDivider 撐滿容器 / Separator 寫死 h-6),而規範只鎖了左右間距、對長度零約束。
const dividerSource = read('packages/design-system/src/components/Button/button-group.tsx')
const GEOMETRY_REQUIRED = [
  // 外層取「該列最高元件」當基準。少了它,長度就不再跟控件走。
  { pattern: /'flex shrink-0 self-stretch'/, label: '外層 flex shrink-0 self-stretch(取該列基準 + 防壓縮)' },
  // 內層套 inset 與地板,兩者都必須讀 token,不得寫死 px。
  { pattern: /h-\[calc\(100%-var\(--action-divider-inset\)\)\]/, label: '內層垂直線 inset 讀 token' },
  { pattern: /min-h-\[var\(--action-divider-min\)\]/, label: '內層垂直線地板讀 token' },
  { pattern: /w-\[calc\(100%-var\(--action-divider-inset\)\)\]/, label: '內層水平線 inset 讀 token' },
  { pattern: /min-w-\[var\(--action-divider-min\)\]/, label: '內層水平線地板讀 token' },
  // 置中必須由外層負責:單層 self-stretch + min-height 會把線釘在行首,地板一生效就歪。
  { pattern: /items-center/, label: '垂直線由外層 items-center 置中' },
]
for (const { pattern, label } of GEOMETRY_REQUIRED) {
  if (!pattern.test(dividerSource)) {
    fail(`button-group.tsx: ButtonDivider 缺少「${label}」—— 幾何 SSOT 見 action-bar.spec.md「分隔線幾何」`)
  }
}
if (/self-stretch[^']*\bmy-1\b|\bh-full\b/.test(dividerSource)) {
  fail('button-group.tsx: ButtonDivider 用了 h-full 或把 margin 當內縮 —— 內縮必須落在內層並讀 --action-divider-inset')
}

// ── (5) token 必須由公式推導,不得退化成兩個孤立常數 ──────────────────────
const uiSize = read('packages/design-system/src/tokens/uiSize/uiSize.css')
if (!/--action-divider-inset:\s*0\.5rem/.test(uiSize)) {
  fail('uiSize.css: 缺 --action-divider-inset(8px)')
}
if (!/--action-divider-min:\s*calc\(var\(--field-height-xs\)\s*-\s*var\(--action-divider-inset\)\)/.test(uiSize)) {
  fail('uiSize.css: --action-divider-min 必須由 calc(--field-height-xs − --action-divider-inset) 推導 —— 寫死常數會讓地板脫離公式,變成可獨立漂移的第二個值')
}

// ── (6) action region 群組線不得再用 Separator 手寫高度 ────────────────────
const SEPARATOR_HEIGHT = /<Separator[^>]*orientation="vertical"[^>]*className="[^"]*\bh-\d/
for (const rel of HANDCRAFT_SCOPE) {
  if (SEPARATOR_HEIGHT.test(read(rel))) {
    fail(`${rel}: action region 群組線仍用 <Separator> 手寫高度 —— 唯一實作是 <ButtonDivider />(action-bar.spec.md「分隔線幾何」)`)
  }
}

if (failures) {
  console.error(`\n❌ action region 分隔線契約失敗 ${failures} 項`)
  process.exit(1)
}
console.log(`Action divider PASS (${AUTO_PLACERS.length} 自動落點 + 2 共用消費端 + ${HANDCRAFT_SCOPE.length} 手刻掃描 + ${GEOMETRY_REQUIRED.length} 幾何斷言 + token 公式 + Separator 高度掃描)`)
