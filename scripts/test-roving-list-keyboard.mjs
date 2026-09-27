#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「列上有小按鈕的一串」的共用鍵盤判定(lib/roving-list-keyboard.ts `resolveRovingKey` / `pickRovingTarget` /
 *        `pickRovingTabStop` / `applyRovingAction`)對四個宿主(側欄、檔案清單、樹、Command)的每一種狀態都回
 *        keyboard-model-canonical.md「列上有小按鈕的一串」按鍵表寫的那個動作;X4(按鈕上 Home / End 換到頭尾項)、
 *        X6(列上選單鈕按 ↓ 換下一項)、X7(按鈕上 Shift+Tab 一下離開)三處統一成側欄做法。
 *        決定來源:governance/planning/2026-09-25-interaction-and-hover-remediation.md B9 + 〇節「09-26 同意清單回覆」。
 *   紅: 判定表任一格與輸出不符即 exit 1(判定表列的是**期望值**,不是抄輸出);呼叫端(四個宿主)任一個沒有真的呼叫
 *        共用判定、或舊的平行實作(TreeView/tree-keyboard-route.ts)還在 → exit 1;
 *        `--selftest` 用合併前三處不一致的舊行為當對照組(樹:按鈕上 Home / End 不處理、選單鈕 ↓ 讓給按鈕、Shift+Tab 交給瀏覽器),
 *        判定表必須抓到 ≥ 5 格不符,抓不到 = 判定表沒在驗 X4 / X6 / X7 → exit 1。
 *   綠: 全部相符時綠;純函式與假元素(只有 focus / preventDefault 兩個方法),無時鐘、無隨機、無瀏覽器,重複跑結果恆等。
 *
 * 樹專屬的格(展開 / 收合 / 回上一層 / 重排)另在 scripts/test-tree-keyboard-route.mjs(同一支純函式,以樹的輸入形狀驗)。
 * 瀏覽器實按:scripts/sidebar-menu-keyboard-invariant.mjs / scripts/tree-view-keyboard-route-invariant.mjs。
 *
 * Run: `node scripts/test-roving-list-keyboard.mjs`(`--selftest` 跑對照組)
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyRovingAction,
  pickRovingTabStop,
  pickRovingTarget,
  resolveRovingKey,
} from '../packages/design-system/src/lib/roving-list-keyboard.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

const base = {
  key: '', focus: 'item', controlCount: 0, controlIndex: -1, defaultPrevented: false,
  metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
}
const item = (key, extra = {}) => ({ ...base, key, ...extra })
const ctl = (key, controlIndex, controlCount, extra = {}) => ({ ...base, key, focus: 'control', controlIndex, controlCount, ...extra })
const tree = (hasChildren, expanded, hasParent = true) => ({ tree: { hasChildren, expanded, hasParent } })
const show = (a) => (a.type === 'control' ? `control#${a.index}` : a.type === 'reorder' ? `reorder:${a.key}` : a.type)

// [名稱, 輸入, 期望] —— 期望值照 keyboard-model-canonical.md「列上有小按鈕的一串」與各宿主 spec 的按鍵表逐格寫
const TABLE = [
  // ── 平面清單(側欄 / 檔案清單):焦點在項目上 ──
  ['項目上 ↓ → 下一項', item('ArrowDown'), 'item-next'],
  ['項目上 ↑ → 上一項', item('ArrowUp'), 'item-prev'],
  ['項目上 Home → 第一項(X2)', item('Home'), 'item-first'],
  ['項目上 End → 最後一項(X2)', item('End'), 'item-last'],
  ['項目上 → → 進第一顆按鈕', item('ArrowRight', { controlCount: 2 }), 'control#0'],
  ['項目上 →(沒有按鈕)→ 不動', item('ArrowRight'), 'consume'],
  ['平面清單項目上 ← → 不動', item('ArrowLeft', { controlCount: 2 }), 'consume'],
  ['項目上 Tab → 一下離開', item('Tab', { controlCount: 2 }), 'leave'],
  ['項目上 Shift+Tab → 一下離開', item('Tab', { shiftKey: true }), 'leave'],
  ['項目上 Enter → 項目自己的預設動作', item('Enter'), 'activate-item'],
  ['項目上空白鍵 → 項目自己的預設動作', item(' '), 'activate-item'],
  ['項目上 Alt+↓ → 不搶', item('ArrowDown', { altKey: true }), 'none'],
  ['項目上 Ctrl+↓ → 不搶(修飾鍵層留給瀏覽器 / 輔助科技)', item('ArrowDown', { ctrlKey: true }), 'none'],
  ['外層已 preventDefault → 不搶', item('ArrowDown', { defaultPrevented: true }), 'none'],
  ['項目上打字 → 不處理', item('a'), 'none'],
  // ── 焦點在這一項的按鈕上 ──
  ['第 1 顆(共 2 顆)按 → → 第 2 顆', ctl('ArrowRight', 0, 2), 'control#1'],
  ['最後一顆按 → → 不動', ctl('ArrowRight', 1, 2), 'consume'],
  ['第 2 顆按 ← → 第 1 顆', ctl('ArrowLeft', 1, 2), 'control#0'],
  ['第 1 顆按 ← → 回項目', ctl('ArrowLeft', 0, 2), 'item'],
  ['按鈕上 ↓ → 下一項(X3)', ctl('ArrowDown', 0, 2), 'item-next'],
  ['按鈕上 ↑ → 上一項(X3)', ctl('ArrowUp', 1, 2), 'item-prev'],
  ['按鈕上 Home → 第一項(X4 統一成側欄做法)', ctl('Home', 1, 2), 'item-first'],
  ['按鈕上 End → 最後一項(X4 統一成側欄做法)', ctl('End', 0, 2), 'item-last'],
  ['選單鈕(aria-haspopup)上 ↓ → 下一項,不開選單(X6 統一成側欄做法)', ctl('ArrowDown', 0, 2, { actionHasPopup: true }), 'item-next'],
  ['按鈕上 Tab → 一下離開(先回項目,不擋預設)', ctl('Tab', 0, 2), 'leave'],
  ['按鈕上 Shift+Tab → 一下離開(X7 統一成側欄做法)', ctl('Tab', 1, 2, { shiftKey: true }), 'leave'],
  ['按鈕上 Enter → 那顆按鈕自己的動作', ctl('Enter', 0, 2), 'activate-control'],
  ['按鈕上空白鍵 → 那顆按鈕自己的動作', ctl(' ', 0, 2), 'activate-control'],
  ['按鈕上 Alt+↓ → 不搶', ctl('ArrowDown', 0, 2, { altKey: true }), 'none'],
  ['按鈕上 Cmd+Shift+↑ → 不重排(重排只從項目上發動)', ctl('ArrowUp', 0, 2, { metaKey: true, shiftKey: true, reorderable: true }), 'none'],
  ['列裡的輸入框上 ← → 屬於插入點', ctl('ArrowLeft', 0, 2, { controlIsTextEntry: true }), 'none'],
  ['列裡的輸入框上 ↓ → 屬於它自己', ctl('ArrowDown', 0, 2, { controlIsTextEntry: true }), 'none'],
  ['列裡的輸入框上 空白鍵 → 打字', ctl(' ', 0, 2, { controlIsTextEntry: true }), 'none'],
  ['列裡的輸入框上 Tab → 仍一下離開', ctl('Tab', 0, 2, { controlIsTextEntry: true }), 'leave'],
  // ── 樹(只列跟平面清單不同的格;完整樹表在 test-tree-keyboard-route.mjs)──
  ['收著的資料夾按 → → 先展開', item('ArrowRight', { controlCount: 2, ...tree(true, false) }), 'expand'],
  ['展開的資料夾按 → → 進第一顆按鈕', item('ArrowRight', { controlCount: 2, ...tree(true, true) }), 'control#0'],
  ['展開的資料夾按 ← → 收合', item('ArrowLeft', tree(true, true)), 'collapse'],
  ['葉節點按 ← → 回上一層', item('ArrowLeft', tree(false, false)), 'parent'],
  ['最外層葉節點按 ← → 不動', item('ArrowLeft', tree(false, false, false)), 'consume'],
  ['可拖曳的樹:項目上 Ctrl+Shift+↓ → 重排', item('ArrowDown', { ctrlKey: true, shiftKey: true, reorderable: true }), 'reorder:ArrowDown'],
  ['不可拖曳的樹:項目上 Cmd+Shift+↓ → 不處理', item('ArrowDown', { metaKey: true, shiftKey: true }), 'none'],
  // ── Command(焦點在 home = 搜尋框,反白在這一列)──
  ['搜尋框、插入點在字尾按 → → 進反白列的第一個東西', item('ArrowRight', { itemIsTextEntry: true, caretAtEnd: true, controlCount: 2 }), 'control#0'],
  ['搜尋框、插入點不在字尾按 → → 移插入點', item('ArrowRight', { itemIsTextEntry: true, caretAtEnd: false, controlCount: 2 }), 'none'],
  ['搜尋框 Shift+→ → 選取文字', item('ArrowRight', { itemIsTextEntry: true, caretAtEnd: true, controlCount: 2, shiftKey: true }), 'none'],
  ['搜尋框、反白列沒有東西按 → → 照舊', item('ArrowRight', { itemIsTextEntry: true, caretAtEnd: true }), 'none'],
  ['搜尋框 ← → 移插入點', item('ArrowLeft', { itemIsTextEntry: true, controlCount: 2 }), 'none'],
  ['搜尋框 Home → 屬於搜尋框 / 清單函式庫', item('Home', { itemIsTextEntry: true }), 'none'],
  ['搜尋框空白鍵 → 打字', item(' ', { itemIsTextEntry: true }), 'none'],
  ['搜尋框 ↓ → 換項(cmdk 自己搬反白)', item('ArrowDown', { itemIsTextEntry: true }), 'item-next'],
]

// 對照組:合併前三處不一致的舊行為 = 樹的 tree-keyboard-route.ts(2026-09-25 版)在按鈕上的三格。
// 判定表必須認得出它們是錯的(X4 / X6 / X7)。
const legacyResolve = (input) => {
  if (input.focus === 'control' && !input.controlIsTextEntry) {
    if (input.key === 'Home' || input.key === 'End') return { type: 'none' } // X4 前:樹不處理
    if (input.key === 'ArrowDown' && input.actionHasPopup) return { type: 'none' } // X6 前:讓給選單鈕開選單
    if (input.key === 'Tab') return { type: 'none' } // X7 前:Shift+Tab 先落回本列
  }
  return resolveRovingKey(input)
}

const run = (resolve) => TABLE.map(([name, input, expected]) => {
  const got = show(resolve(input))
  return { name, expected, got, ok: got === expected }
})

if (SELFTEST) {
  const caught = run(legacyResolve).filter((r) => !r.ok)
  for (const r of caught) console.log(`  ✗(對照組如預期被抓)${r.name} | 舊行為回 ${r.got},期望 ${r.expected}`)
  if (caught.length >= 5) {
    console.log(`\n✓ selftest:合併前的舊行為在判定表上 ${caught.length} 格不符 —— 判定表真的在驗 X4 / X6 / X7`)
    process.exit(0)
  }
  console.log(`\n✗ selftest:舊行為只被抓到 ${caught.length} 格(期望 ≥ 5)—— 判定表沒有在驗這三處統一`)
  process.exit(1)
}

const results = run(resolveRovingKey)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` | 得到 ${r.got},期望 ${r.expected}`}`)
let failed = results.filter((r) => !r.ok).length
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` | ${detail}`}`); if (!ok) failed++ }

// ── 落點:不繞回、跳過走不到的項目(X2)──
const L = ['a', 'b', 'c', 'd', 'e']
const nav = (x) => x !== 'b' && x !== 'd'
ck('pickRovingTarget:下一項跳過走不到的', pickRovingTarget('item-next', L, 'a', nav) === 'c')
ck('pickRovingTarget:最後一項再往下 → 不繞回(null)', pickRovingTarget('item-next', L, 'e', nav) === null)
ck('pickRovingTarget:第一項再往上 → 不繞回(null)', pickRovingTarget('item-prev', L, 'a', nav) === null)
ck('pickRovingTarget:目前這一項本身走不到(樹 ← 回到停用的上一層)仍從它的位置找', pickRovingTarget('item-next', L, 'b', nav) === 'c')
ck('pickRovingTarget:第一 / 最後一項只算走得到的', pickRovingTarget('item-first', ['b', 'c', 'd'], 'c', nav) === 'c' && pickRovingTarget('item-last', L, 'a', (x) => x !== 'e') === 'd')

// ── Tab 停靠點:上次停的 → 目前這一頁 / 選中 → 第一個可用項(X1)──
const cur = (x) => x === 'd'
ck('pickRovingTabStop:上次停的優先', pickRovingTabStop(L, { remembered: 'c', isCurrent: cur }) === 'c')
ck('pickRovingTabStop:沒停過 → 目前這一頁', pickRovingTabStop(L, { remembered: null, isCurrent: cur }) === 'd')
ck('pickRovingTabStop:都沒有 → 第一個可用項', pickRovingTabStop(L, { isNavigable: (x) => x !== 'a' }) === 'b')
ck('pickRovingTabStop:上次停的已被移除 → 退回下一順位', pickRovingTabStop(L, { remembered: 'z', isCurrent: cur }) === 'd')
ck('pickRovingTabStop:上次停的變成走不到 → 退回下一順位', pickRovingTabStop(L, { remembered: 'b', isCurrent: (x) => x === 'c', isNavigable: nav }) === 'c')
ck('pickRovingTabStop:canHoldFocus 恆真(樹的停用列仍拿得住焦點)', pickRovingTabStop(L, { remembered: 'b', isNavigable: nav, canHoldFocus: () => true }) === 'b')
ck('pickRovingTabStop:目前這一頁走不到時不選它', pickRovingTabStop(L, { isCurrent: (x) => x === 'b', isNavigable: nav }) === 'a')

// ── 執行器:真焦點宿主(側欄 / 檔案清單 / 樹)要不要擋預設、焦點搬到哪 ──
const fake = (name) => { const el = { name, focused: 0, focus() { el.focused++ } }; return el }
const harness = (action, extra = {}) => {
  const items = ['r1', 'r2', 'r3'].map(fake)
  const controls = ['c1', 'c2'].map(fake)
  const event = { prevented: false, preventDefault() { this.prevented = true } }
  const calls = []
  applyRovingAction(action, {
    event, item: items[1], controls, items,
    onExpand: () => calls.push('expand'), onCollapse: () => calls.push('collapse'), onParent: () => calls.push('parent'),
    ...extra,
  })
  return { items, controls, event, calls }
}
{
  const h = harness({ type: 'leave' })
  ck('leave:焦點回項目、**不擋預設**(瀏覽器接著往外走一站 = 一下離開)', h.items[1].focused === 1 && !h.event.prevented)
}
{
  const h = harness({ type: 'item-next' })
  ck('item-next:擋預設、焦點到下一項', h.event.prevented && h.items[2].focused === 1)
}
{
  const h = harness({ type: 'item-first' })
  ck('item-first:焦點到第一項', h.event.prevented && h.items[0].focused === 1)
}
{
  const h = harness({ type: 'control', index: 1 })
  ck('control:擋預設、焦點到那顆按鈕', h.event.prevented && h.controls[1].focused === 1)
}
{
  const h = harness({ type: 'consume' })
  ck('consume:擋預設、焦點不動', h.event.prevented && h.items.every((i) => i.focused === 0) && h.controls.every((c) => c.focused === 0))
}
{
  const h = harness({ type: 'activate-item' })
  ck('activate-item(項目是原生按鈕,宿主不接):不擋預設 —— 交給瀏覽器點', !h.event.prevented)
}
{
  let selected = 0
  const h = harness({ type: 'activate-item' }, { onActivateItem: () => { selected++ } })
  ck('activate-item(樹 = 選取):擋預設、呼叫宿主', h.event.prevented && selected === 1)
}
{
  const h = harness({ type: 'activate-control' })
  ck('activate-control:不擋、不代點(原生按鈕自己處理)', !h.event.prevented && h.controls.every((c) => c.focused === 0))
}
{
  const h = harness({ type: 'expand' })
  ck('expand / collapse / parent 交給宿主(樹)', h.event.prevented && h.calls.join() === 'expand')
}

// ── 呼叫端真的消費這支共用判定(否則判定表驗的是平行實作,M37)──
const HOSTS = [
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  'packages/design-system/src/components/FileUpload/file-upload.tsx',
  'packages/design-system/src/components/TreeView/tree-view.tsx',
  'packages/design-system/src/components/Command/command.tsx',
]
for (const host of HOSTS) {
  const src = readFileSync(join(ROOT, host), 'utf8')
  const imports = /from ["']@\/design-system\/lib\/roving-list-keyboard["']/.test(src)
  const calls = /resolveRovingKey\(/.test(src)
  ck(`${host} 的按鍵處理呼叫共用的 resolveRovingKey`, imports && calls, `import=${imports} call=${calls}`)
}
const legacy = 'packages/design-system/src/components/TreeView/tree-keyboard-route.ts'
ck(`舊的平行實作 ${legacy} 已移除(合併進 lib/roving-list-keyboard.ts)`, !existsSync(join(ROOT, legacy)))

if (failed) { console.log(`\n✗ ${failed} 格不符`); process.exit(1) }
console.log(`\n✓ 列上有小按鈕的一串:${results.length} 格判定 + 落點 / 停靠點 / 執行器 / 四個呼叫端全部相符`)
