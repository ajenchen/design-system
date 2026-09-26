#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: TreeView 的鍵盤路線(共用判定 lib/roving-list-keyboard.ts `resolveRovingKey`,以樹的輸入形狀呼叫)對每一種狀態都回
 *        tree-view.spec.md「鍵盤導覽」表寫的那個動作:列上 ↑↓ 換列、Home/End 首尾;→ 收著的資料夾先展開、展開的資料夾或葉節點
 *        進第一顆按鈕、沒有按鈕不動;← 展開的收合、否則回上一層、最外層不動;按鈕上 → / ← 在按鈕間走、第一顆再 ← 回列、
 *        最後一顆再 → 不動、↑↓ / Home / End 換列(選單鈕也一樣,X4 / X6);Tab / Shift+Tab 一下離開整棵樹(按鈕上也是,X7)。
 *        決定來源:governance/planning/2026-09-25-interaction-and-hover-remediation.md B9 + 〇節「09-26 同意清單回覆」。
 *   紅: 判定表任一格與純函式輸出不符即 exit 1(判定表列的是**期望值**,不是抄輸出);
 *        `--selftest` 用改動前的舊路線(→ 在展開的資料夾上跳第一個子項、按鈕不在方向鍵路上)當對照組,
 *        判定表必須抓到 ≥ 8 格不符,抓不到 = 判定表沒在驗這條規則 → exit 1。
 *   綠: 全部相符時綠;純函式無時鐘、無隨機、無 DOM,重複跑結果恆等。
 *
 * 2026-09-26:判定由 TreeView 自己的 tree-keyboard-route.ts 併入 lib/roving-list-keyboard.ts(與 Sidebar / FileUpload / Command
 * 同一份;平面清單與三處統一的格在 scripts/test-roving-list-keyboard.mjs)。本檔保留樹專屬的判定表。
 * 呼叫端必須真的消費這支純函式(tree-view.tsx handleKeyDownCapture → resolveRovingKey),否則判定表測的是平行實作(M37)——
 * 本檔最後一段直接讀 tree-view.tsx 驗這件事。
 *
 * Run: `node scripts/test-tree-keyboard-route.mjs`(`--selftest` 跑對照組)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveRovingKey } from '../packages/design-system/src/lib/roving-list-keyboard.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

// 樹的輸入形狀(tree-view.tsx 從 DOM 讀出來的就是這幾個值)
const base = {
  key: '', focus: 'row', hasChildren: false, expanded: false, hasParent: true,
  actionCount: 0, actionIndex: -1, draggable: true, defaultPrevented: false,
  metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
}
/** tree-view.tsx 呼叫共用判定時的對應(列 = item、列上的按鈕 = control;樹的三個狀態放 tree;draggable → reorderable) */
const resolveTree = (t) => resolveRovingKey({
  key: t.key,
  focus: t.focus === 'row' ? 'item' : 'control',
  controlCount: t.actionCount,
  controlIndex: t.actionIndex,
  tree: { hasChildren: t.hasChildren, expanded: t.expanded, hasParent: t.hasParent },
  reorderable: t.draggable,
  defaultPrevented: t.defaultPrevented,
  metaKey: t.metaKey, ctrlKey: t.ctrlKey, altKey: t.altKey, shiftKey: t.shiftKey,
})
const row = (key, extra = {}) => ({ ...base, key, ...extra })
const act = (key, actionIndex, actionCount, extra = {}) => ({ ...base, key, focus: 'action', actionIndex, actionCount, ...extra })
const show = (a) => (a.type === 'control' ? `action#${a.index}` : a.type === 'reorder' ? `reorder:${a.key}` : a.type)

// [名稱, 輸入, 期望]
const TABLE = [
  // ── 列上 ──
  ['列上 ↓ → 下一列', row('ArrowDown'), 'item-next'],
  ['列上 ↑ → 上一列', row('ArrowUp'), 'item-prev'],
  ['列上 Home → 第一列', row('Home'), 'item-first'],
  ['列上 End → 最後一列', row('End'), 'item-last'],
  ['收著的資料夾(有 2 顆按鈕)按 → → 先展開,不進按鈕', row('ArrowRight', { hasChildren: true, expanded: false, actionCount: 2 }), 'expand'],
  ['展開的資料夾(有 2 顆按鈕)按 → → 進第一顆按鈕', row('ArrowRight', { hasChildren: true, expanded: true, actionCount: 2 }), 'action#0'],
  ['葉節點(有 1 顆按鈕)按 → → 進第一顆按鈕', row('ArrowRight', { actionCount: 1 }), 'action#0'],
  ['葉節點(沒有按鈕)按 → → 不動', row('ArrowRight', { actionCount: 0 }), 'consume'],
  ['展開的資料夾(沒有按鈕)按 → → 不動(不再跳到第一個子項;↓ 落點相同)', row('ArrowRight', { hasChildren: true, expanded: true, actionCount: 0 }), 'consume'],
  ['展開的資料夾按 ← → 收合', row('ArrowLeft', { hasChildren: true, expanded: true, actionCount: 2 }), 'collapse'],
  ['收著的資料夾按 ← → 回上一層', row('ArrowLeft', { hasChildren: true, expanded: false }), 'parent'],
  ['葉節點按 ← → 回上一層', row('ArrowLeft', { actionCount: 1 }), 'parent'],
  ['最外層的葉節點按 ← → 不動', row('ArrowLeft', { hasParent: false }), 'consume'],
  ['列上 Enter → 選取', row('Enter'), 'activate-item'],
  ['列上空白鍵 → 選取', row(' '), 'activate-item'],
  ['列上 Tab → 一下離開整棵樹', row('Tab', { actionCount: 2 }), 'leave'],
  ['列上 Shift+Tab → 一下離開整棵樹', row('Tab', { shiftKey: true }), 'leave'],
  ['列上 Cmd+Shift+↑ → 重排', row('ArrowUp', { metaKey: true, shiftKey: true }), 'reorder:ArrowUp'],
  ['列上 Ctrl+Shift+→ → 重排(不是進按鈕)', row('ArrowRight', { ctrlKey: true, shiftKey: true, actionCount: 2 }), 'reorder:ArrowRight'],
  ['不可拖曳的樹:列上 Cmd+Shift+↑ → 不處理', row('ArrowUp', { metaKey: true, shiftKey: true, draggable: false }), 'none'],
  // ── 按鈕上 ──
  ['第 1 顆(共 2 顆)按 → → 第 2 顆', act('ArrowRight', 0, 2), 'action#1'],
  ['最後一顆(共 2 顆)按 → → 不動', act('ArrowRight', 1, 2), 'consume'],
  ['唯一一顆按 → → 不動', act('ArrowRight', 0, 1), 'consume'],
  ['第 2 顆按 ← → 第 1 顆', act('ArrowLeft', 1, 2), 'action#0'],
  ['第 1 顆按 ← → 回到列', act('ArrowLeft', 0, 2), 'item'],
  ['按鈕上 ↓ → 下一列', act('ArrowDown', 0, 2), 'item-next'],
  ['按鈕上 ↑ → 上一列', act('ArrowUp', 1, 2), 'item-prev'],
  ['選單觸發鈕上 ↓ → 下一列(X6:同側欄,開選單用 Enter / 空白鍵)', act('ArrowDown', 0, 2), 'item-next'],
  ['選單觸發鈕上 ↑ → 上一列', act('ArrowUp', 0, 2), 'item-prev'],
  ['外層已 preventDefault 的 ↓ → 不搶', act('ArrowDown', 0, 2, { defaultPrevented: true }), 'none'],
  ['按鈕上 Alt+↓ → 不搶', act('ArrowDown', 0, 2, { altKey: true }), 'none'],
  ['按鈕上 Enter → 交給按鈕(原生啟動)', act('Enter', 0, 2), 'activate-control'],
  ['按鈕上空白鍵 → 交給按鈕', act(' ', 0, 2), 'activate-control'],
  ['按鈕上 Tab → 一下離開整棵樹', act('Tab', 0, 2), 'leave'],
  ['按鈕上 Shift+Tab → 一下離開整棵樹(X7:先回列再由瀏覽器往外走,不再要按兩下)', act('Tab', 1, 2, { shiftKey: true }), 'leave'],
  ['按鈕上 Home → 第一列(X4:同側欄)', act('Home', 1, 2), 'item-first'],
  ['按鈕上 End → 最後一列(X4:同側欄)', act('End', 0, 2), 'item-last'],
  ['按鈕上 Cmd+Shift+↑ → 不重排(重排只從列上發動)', act('ArrowUp', 0, 2, { metaKey: true, shiftKey: true }), 'none'],
]

// 對照組:改動前的舊路線(tree-view.tsx 2026-09-24 版):→ 在展開的資料夾上跳第一個子項、
// 按鈕是各自的 Tab 停靠點(方向鍵對按鈕不做事)。判定表必須認得出它是錯的。
const legacyResolve = (input) => {
  if (input.focus === 'action') return { type: 'none' }
  const r = resolveTree(input)
  if (input.key === 'ArrowRight' && !(input.metaKey || input.ctrlKey)) {
    if (input.hasChildren && !input.expanded) return { type: 'expand' }
    return input.hasChildren ? { type: 'item-next' } : { type: 'consume' }
  }
  return r
}

const run = (resolve) => TABLE.map(([name, input, expected]) => {
  const got = show(resolve(input))
  return { name, expected, got, ok: got === expected }
})

if (SELFTEST) {
  const results = run(legacyResolve)
  const caught = results.filter((r) => !r.ok)
  for (const r of caught) console.log(`  ✗(對照組如預期被抓)${r.name} | 舊路線回 ${r.got},期望 ${r.expected}`)
  if (caught.length >= 8) {
    console.log(`\n✓ selftest:舊路線在判定表上 ${caught.length} 格不符 —— 判定表真的在驗 B9 的路線`)
    process.exit(0)
  }
  console.log(`\n✗ selftest:舊路線只被抓到 ${caught.length} 格(期望 ≥ 8)—— 判定表沒有在驗這條規則`)
  process.exit(1)
}

const results = run(resolveTree)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` | 得到 ${r.got},期望 ${r.expected}`}`)

// 呼叫端真的消費這支純函式(否則判定表驗的是平行實作)
const tsx = readFileSync(join(ROOT, 'packages/design-system/src/components/TreeView/tree-view.tsx'), 'utf8')
const consumed = /from '@\/design-system\/lib\/roving-list-keyboard'/.test(tsx) && /resolveRovingKey\(/.test(tsx) && /tree: \{ hasChildren/.test(tsx)
console.log(`${consumed ? '✓' : '✗'} tree-view.tsx 的按鍵處理以樹的狀態呼叫共用的 resolveRovingKey(判定表驗的就是實際在跑的那一份)`)

const failed = results.filter((r) => !r.ok).length + (consumed ? 0 : 1)
if (failed) { console.log(`\n✗ ${failed} 格不符`); process.exit(1) }
console.log(`\n✓ TreeView 鍵盤路線:${results.length} 格全部相符`)
