#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 表頭排序的判定(components/DataTable/lib/sort-cycle.ts)對每一種狀態轉移都回
 *        data-table.spec.md「Multi-sort header」列寫的那個結果:循環 = 升冪 → 降冪 → 清除;一般點擊清掉其他欄、這一欄從目前方向切下一個;
 *        Shift+點擊只動這一欄(不在排序裡 → 加到最後、升冪;在排序裡 → 循環下一步、順位不動;清除 → 後面順位往前補);
 *        ⌄ 選單升冪 / 降冪 = 只用這一欄;「取消排序」這一欄在排序裡就出現(多重排序也出)、按了清掉全部排序(與升冪 / 降冪同一套);
 *        ⌄ 選單「升冪 / 降冪排序」只列這一欄目前不是的那個方向(這一欄升冪 → 不列升冪;降冪 → 不列降冪;沒排序 → 兩項都列;多重排序看這一欄自己;
 *        user 2026-11-10 PR #172 留言,判定表 3c;修前兩項永遠都列 → 對照組在 3c 紅);
 *        順位數字只在 ≥2 欄排序時出現、1–9 照寫、第 10 個以後「9+」;
 *        讀屏描述照實說第幾;播報句型。另驗呼叫端(data-table.tsx)真的消費這支判定,而不是 TanStack 內建的切換。
 *   紅: 判定表任一格與純函式輸出不符即 exit 1(判定表列的是**期望值**,不是抄輸出);
 *        `--selftest` 以修前的行為(TanStack v8.21.3 `toggleSorting` 的 add / toggle / replace / remove 分支,原樣搬進來)當對照組,
 *        判定表必須抓到 ≥ 4 格不符,抓不到 = 判定表沒在驗這條規則 → exit 1。
 *   綠: 全部相符時綠;純函式無時鐘、無隨機、無 DOM,重複跑結果恆等。
 *
 * 規格來源:user 2026-10-30 15:26 / 17:08(台灣時間)對話;規範與原話住 data-table.spec.md「Multi-sort header」列。本表直接驗的幾句原話:
 *   「依序為'把此column加入sort並 first->last', 'last->first', '清除排序'」「1. 就用ds的字眼就好」「2. a」「3. 對」「4. 不要限制欄數,超過一律9+」
 * Shift+點擊排序中的欄「順位不動」與「第一下一律升冪、不分欄型」是 AI 推導(前者依排序面板,後者依 DS 文件一直寫的 asc → desc → none),推導寫在 sort-cycle.ts 檔頭。
 *
 * Run: `node scripts/test-data-table-sort-cycle.mjs`(`--selftest` 跑對照組)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as real from '../packages/design-system/src/components/DataTable/lib/sort-cycle.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

// ── 修前的行為(對照組):TanStack v8.21.3 RowSorting.ts toggleSorting 的分支,只保留本 DS 會走到的部分 ──
// 第一下方向:字串欄升冪、其他(數字 / 物件)降冪(getAutoSortDir);sortDescFirst 本 DS 沒設。
const legacy = (() => {
  const firstDir = (kind) => (kind === 'number' ? 'desc' : 'asc')
  const next = (cur, kind) => {
    const first = firstDir(kind)
    if (!cur) return first
    if (cur !== first) return false
    return cur === 'desc' ? 'asc' : 'desc'
  }
  const toggle = (old, id, multi, kind) => {
    const existing = old.find((d) => d.id === id)
    const existingIndex = old.findIndex((d) => d.id === id)
    const cur = existing ? (existing.desc ? 'desc' : 'asc') : false
    const n = next(cur, kind)
    let action
    const nextDesc = n === 'desc'
    if (old.length && multi) action = existing ? 'toggle' : 'add'
    else if (old.length && existingIndex !== old.length - 1) action = 'replace'
    else if (existing) action = 'toggle'
    else action = 'replace'
    if (action === 'toggle' && !n) action = 'remove'
    if (action === 'add') return [...old, { id, desc: nextDesc }]
    if (action === 'toggle') return old.map((d) => (d.id === id ? { ...d, desc: nextDesc } : d))
    if (action === 'remove') return old.filter((d) => d.id !== id)
    return [{ id, desc: nextDesc }]
  }
  return {
    sortingAfterHeaderActivate: (old, id, additive, kind = 'string') => toggle(old, id, additive, kind),
    // 修前 ⌄ 選單:toggleSorting(desc, false)(有手動值 → 不會走 remove)
    sortingFromColumnMenu: (old, id, dir) => {
      if (dir === null) return old.filter((d) => d.id !== id)
      const existing = old.find((d) => d.id === id)
      const existingIndex = old.findIndex((d) => d.id === id)
      if (old.length && existingIndex !== old.length - 1) return [{ id, desc: dir === 'desc' }]
      if (existing) return old.map((d) => (d.id === id ? { ...d, desc: dir === 'desc' } : d))
      return [{ id, desc: dir === 'desc' }]
    },
    // 修前 ⌄ 選單:`sortDir && !isMultiSort` 才出「取消排序」(多重排序時不出);修前按了只拿掉這一欄(上方 dir === null 那行)
    columnMenuShowsCancelSort: (old, id) => old.length === 1 && old[0].id === id,
    // 修前(2e1f2e27 以前)⌄ 選單:「升冪排序」「降冪排序」兩項永遠都列,不看這一欄目前的方向
    columnMenuShowsSortDirection: () => true,
    // 修前:多重排序時表頭不顯示任何東西(K7)
    sortPriorityLabel: () => null,
    sortPriorityDescription: () => null,
    sortChangeAnnouncement: () => '',
  }
})()

const impl = SELFTEST ? legacy : real
const S = (str) => (str === '' ? [] : str.split(' ').map((t) => ({ id: t.slice(0, -1), desc: t.endsWith('↓') })))
const show = (sorting) => (sorting.length ? sorting.map((s) => `${s.id}${s.desc ? '↓' : '↑'}`).join(' ') : '(無)')

let fail = 0
const row = (name, got, want) => {
  if (got !== want) { fail++; console.log(`✗ ${name}:期望 ${want} 實得 ${got}`) } else console.log(`✓ ${name}`)
}

// ── 判定表 1:表頭點擊 / Shift+點擊的狀態轉移 [名稱, 目前排序, 點哪一欄, Shift?, 欄型別(對照組用), 期望] ──
const HEADER = [
  ['一般點擊 / 沒有排序 → 升冪', '', 'title', false, 'string', 'title↑'],
  ['一般點擊 / 數字欄第一下也是升冪(循環 = 升冪 → 降冪 → 清除)', '', 'progress', false, 'number', 'progress↑'],
  ['一般點擊 / 人員欄第一下也是升冪', '', 'owner', false, 'number', 'owner↑'],
  ['一般點擊 / 升冪 → 降冪', 'title↑', 'title', false, 'string', 'title↓'],
  ['一般點擊 / 降冪 → 清除', 'title↓', 'title', false, 'string', '(無)'],
  ['一般點擊 / 換一欄 → 只剩新的那欄、升冪', 'title↑', 'status', false, 'string', 'status↑'],
  ['一般點擊 / 多重排序裡不在排序的欄 → 清掉其他、升冪', 'title↑ status↓', 'priority', false, 'string', 'priority↑'],
  ['一般點擊 / 多重排序的第一欄(升冪)→ 清掉其他、這欄降冪', 'title↑ status↑ priority↑', 'title', false, 'string', 'title↓'],
  ['一般點擊 / 多重排序的最後一欄(升冪)→ 清掉其他、這欄降冪', 'title↑ status↑ priority↑', 'priority', false, 'string', 'priority↓'],
  ['一般點擊 / 多重排序的中間欄(降冪)→ 下一步是清除 → 全清', 'title↑ status↓ priority↑', 'status', false, 'string', '(無)'],
  ['一般點擊 / 多重排序的最後一欄(降冪)→ 全清', 'title↑ status↓', 'status', false, 'string', '(無)'],
  ['Shift / 沒有排序 → 加入、升冪', '', 'title', true, 'string', 'title↑'],
  ['Shift / 加第二欄 → 接在最後、升冪', 'title↑', 'status', true, 'string', 'title↑ status↑'],
  ['Shift / 數字欄加入也是升冪', 'title↑', 'progress', true, 'number', 'title↑ progress↑'],
  ['Shift / 排序中的欄升冪 → 降冪,順位不動', 'title↑ status↑ priority↑', 'status', true, 'string', 'title↑ status↓ priority↑'],
  ['Shift / 第一欄升冪 → 降冪,順位不動', 'title↑ status↑', 'title', true, 'string', 'title↓ status↑'],
  ['Shift / 排序中的欄降冪 → 清除,後面順位往前補', 'title↑ status↓ priority↑', 'status', true, 'string', 'title↑ priority↑'],
  ['Shift / 第一欄降冪 → 清除,第二欄變第一', 'title↓ status↑', 'title', true, 'string', 'status↑'],
  ['Shift / 只剩一欄、降冪 → 清除 → 沒有排序', 'title↓', 'title', true, 'string', '(無)'],
  ['Shift / 不限欄數:第 10 欄照樣加入', 'a↑ b↑ c↑ d↑ e↑ f↑ g↑ h↑ i↑', 'j', true, 'string', 'a↑ b↑ c↑ d↑ e↑ f↑ g↑ h↑ i↑ j↑'],
  ['Shift / 不允許多重排序(additive=false 傳進來)= 一般點擊', 'title↑', 'status', false, 'string', 'status↑'],
]
for (const [name, from, col, shift, kind, want] of HEADER) {
  row(`表頭 ${name}`, show(impl.sortingAfterHeaderActivate(S(from), col, shift, kind)), want)
}

// ── 判定表 2:Shift+點擊同一欄三下 = 加入並升冪 → 降冪 → 清除(user 規格的序列,不只測靜態格)──
{
  let s = S('title↑ status↑')
  const seen = []
  for (let i = 0; i < 3; i++) { s = impl.sortingAfterHeaderActivate(s, 'priority', true, 'string'); seen.push(show(s)) }
  row('序列 Shift×3 在「優先級」:加入並升冪 → 降冪 → 清除', seen.join(' ⇒ '), 'title↑ status↑ priority↑ ⇒ title↑ status↑ priority↓ ⇒ title↑ status↑')
}
{
  let s = S('')
  const seen = []
  for (let i = 0; i < 3; i++) { s = impl.sortingAfterHeaderActivate(s, 'progress', false, 'number'); seen.push(show(s)) }
  row('序列 一般點擊×3 在數字欄:升冪 → 降冪 → 清除', seen.join(' ⇒ '), 'progress↑ ⇒ progress↓ ⇒ (無)')
}

// ── 判定表 3:⌄ 欄位選單 ──
const MENU = [
  ['升冪排序 / 多重排序裡的最後一欄 → 只用這一欄', 'title↑ status↓', 'status', 'asc', 'status↑'],
  ['降冪排序 / 多重排序裡的最後一欄 → 只用這一欄', 'title↑ status↑', 'status', 'desc', 'status↓'],
  ['升冪排序 / 多重排序裡的第一欄 → 只用這一欄', 'title↓ status↑', 'title', 'asc', 'title↑'],
  ['升冪排序 / 沒排序的欄 → 只用這一欄', 'title↑', 'status', 'asc', 'status↑'],
  ['取消排序 / 唯一一欄 → 沒有排序', 'title↑', 'title', null, '(無)'],
  ['取消排序 / 多重排序裡的一欄 → 清掉全部(不是只拿掉這一欄)', 'title↑ status↓ priority↑', 'status', null, '(無)'],
  ['取消排序 / 多重排序裡的第一欄 → 清掉全部', 'title↑ status↓', 'title', null, '(無)'],
]
for (const [name, from, col, dir, want] of MENU) {
  row(`選單 ${name}`, show(impl.sortingFromColumnMenu(S(from), col, dir)), want)
}
// ── 判定表 3b:⌄ 選單要不要出「取消排序」(這一欄在排序裡就出,多重排序也出)──
const MENU_CANCEL = [
  ['唯一一欄排序、就是這欄 → 出', 'title↑', 'title', 'true'],
  ['唯一一欄排序、不是這欄 → 不出', 'title↑', 'status', 'false'],
  ['沒有排序 → 不出', '', 'title', 'false'],
  ['多重排序、這欄在裡面 → 出', 'title↑ status↓', 'status', 'true'],
  ['多重排序、這欄是第一欄 → 出', 'title↑ status↓', 'title', 'true'],
  ['多重排序、這欄不在裡面 → 不出', 'title↑ status↓', 'priority', 'false'],
]
for (const [name, from, col, want] of MENU_CANCEL) {
  row(`選單「取消排序」${name}`, String(impl.columnMenuShowsCancelSort(S(from), col)), want)
}
// ── 判定表 3c:⌄ 選單要不要列「升冪排序」/「降冪排序」(只列這一欄目前不是的那個方向;user 2026-11-10 PR #172 留言)
//    [名稱, 目前排序, 開哪一欄的選單, 期望「升冪排序」出不出, 期望「降冪排序」出不出] ──
const MENU_DIRECTION = [
  ['沒有排序 → 兩項都列', '', 'title', 'true', 'true'],
  ['唯一一欄、這欄升冪 → 不列升冪、列降冪', 'title↑', 'title', 'false', 'true'],
  ['唯一一欄、這欄降冪 → 列升冪、不列降冪', 'title↓', 'title', 'true', 'false'],
  ['唯一一欄排序、不是這欄 → 兩項都列', 'title↑', 'status', 'true', 'true'],
  ['多重排序、這欄升冪(中間)→ 不列升冪、列降冪', 'title↑ status↑ priority↑', 'status', 'false', 'true'],
  ['多重排序、這欄降冪(第一欄)→ 列升冪、不列降冪', 'title↓ status↑', 'title', 'true', 'false'],
  ['多重排序、別欄降冪而這欄升冪 → 只看這欄:不列升冪', 'title↓ status↑', 'status', 'false', 'true'],
  ['多重排序、這欄不在裡面 → 兩項都列', 'title↑ status↓', 'priority', 'true', 'true'],
]
for (const [name, from, col, wantAsc, wantDesc] of MENU_DIRECTION) {
  row(`選單「升冪排序」${name}`, String(impl.columnMenuShowsSortDirection(S(from), col, 'asc')), wantAsc)
  row(`選單「降冪排序」${name}`, String(impl.columnMenuShowsSortDirection(S(from), col, 'desc')), wantDesc)
}

// ── 判定表 4:順位數字 / 讀屏描述 ──
const TEN = S('a↑ b↑ c↑ d↑ e↑ f↑ g↑ h↑ i↑ j↑ k↓')
const LABEL = [
  ['只有一欄排序 → 不顯示數字', S('title↑'), 'title', 'null', 'null'],
  ['沒排序的欄 → 不顯示', S('title↑ status↑'), 'priority', 'null', 'null'],
  ['兩欄排序的第一欄 → 1', S('title↑ status↑'), 'title', '1', '排序順位 1'],
  ['兩欄排序的第二欄 → 2', S('title↑ status↓'), 'status', '2', '排序順位 2'],
  ['第 9 個 → 9', TEN, 'i', '9', '排序順位 9'],
  ['第 10 個 → 9+(讀屏照實說 10)', TEN, 'j', '9+', '排序順位 10'],
  ['第 11 個 → 9+(讀屏照實說 11)', TEN, 'k', '9+', '排序順位 11'],
]
for (const [name, sorting, col, wantLabel, wantDesc] of LABEL) {
  row(`數字 ${name}`, String(impl.sortPriorityLabel(sorting, col)), wantLabel)
  row(`讀屏 ${name}`, String(impl.sortPriorityDescription(sorting, col)), wantDesc)
}

// ── 判定表 5:播報句型 ──
const labelOf = (id) => ({ title: '標題', status: '狀態', priority: '優先級' }[id] ?? id)
row('播報 / 清空', impl.sortChangeAnnouncement([], labelOf), '已取消排序')
row('播報 / 一欄', impl.sortChangeAnnouncement(S('title↓'), labelOf), '已依 標題 降冪排序')
row('播報 / 多欄照順位全唸', impl.sortChangeAnnouncement(S('title↑ status↓ priority↑'), labelOf), '排序:1 標題 升冪,2 狀態 降冪,3 優先級 升冪')

// ── 呼叫端真的消費這支判定(M37:判定表測的若是平行實作,等於沒測)──
if (!SELFTEST) {
  const src = readFileSync(join(ROOT, 'packages/design-system/src/components/DataTable/data-table.tsx'), 'utf8')
  const must = [
    ['表頭點擊 / 鍵盤經 sortingAfterHeaderActivate', /applyHeaderSorting\(\(current\) => sortingAfterHeaderActivate\(current, header\.column\.id, additive\)\)/],
    ['點擊帶 Shift', /onClick=\{canSort \? \(e\) => activateSort\(e\.shiftKey\)/],
    ['Enter / Space 帶 Shift', /if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ e\.preventDefault\(\); activateSort\(e\.shiftKey\) \}/],
    ['⌄ 選單三項經 sortingFromColumnMenu', /sortingFromColumnMenu\(current, header\.column\.id, 'asc'\)[\s\S]*sortingFromColumnMenu\(current, header\.column\.id, 'desc'\)[\s\S]*sortingFromColumnMenu\(current, header\.column\.id, null\)/],
    ['⌄ 選單「取消排序」出不出經 columnMenuShowsCancelSort', /\{columnMenuShowsCancelSort\(sortingState, header\.column\.id\) && <DropdownMenuItem startIcon=\{XIcon\}/],
    ['⌄ 選單「升冪排序」出不出經 columnMenuShowsSortDirection', /\{columnMenuShowsSortDirection\(sortingState, header\.column\.id, 'asc'\) && <DropdownMenuItem startIcon=\{ArrowUp\}/],
    ['⌄ 選單「降冪排序」出不出經 columnMenuShowsSortDirection', /\{columnMenuShowsSortDirection\(sortingState, header\.column\.id, 'desc'\) && <DropdownMenuItem startIcon=\{ArrowDown\}/],
    ['數字經 sortPriorityLabel', /sortPriorityLabel\(sortingState, header\.column\.id\)/],
    ['播報經 sortChangeAnnouncement', /setSortAnnouncement\(sortChangeAnnouncement\(next,/],
  ]
  for (const [name, re] of must) row(`呼叫端 ${name}`, re.test(src) ? '有' : '沒有', '有')
  const forbid = [
    ['表頭不再用 TanStack getToggleSortingHandler', /getToggleSortingHandler\(/],
    ['表頭不再用 column.toggleSorting / clearSorting', /header\.column\.(toggleSorting|clearSorting)\(/],
    ['多重排序不再藏箭頭(isMultiSort)', /isMultiSort/],
  ]
  for (const [name, re] of forbid) row(`呼叫端 ${name}`, re.test(src) ? '還在' : '沒有', '沒有')
}

if (SELFTEST) {
  // 對照組:修前行為在判定表上必須大量不符(≥ 4 格);全綠 = 判定表沒在驗規則
  const caught = fail
  console.log(caught >= 4 ? `✅ 對照組:修前行為被判定表抓到 ${caught} 格不符(≥ 4)` : `✗ 對照組:修前行為只被抓到 ${caught} 格(< 4),判定表沒在驗這條規則`)
  process.exit(caught >= 4 ? 0 : 1)
}
console.log(fail ? `✗ ${fail} 項不符` : '✅ 表頭排序判定表 PASS')
process.exit(fail ? 1 : 0)
