#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 表頭排序的判定(components/DataTable/lib/sort-cycle.ts `nextSorting`)對每一種狀態轉移都回
 *        data-table.spec.md「Multi-sort header」列寫的那個結果(user 2026-11-11 R16 定案):
 *        循環兩態 —— 點已排序的欄只在升冪 ↔ 降冪之間切,點表頭永遠不會變成沒排序;第一下一律升冪、不分欄型;
 *        已排序的欄:一般點擊 = Shift+點擊 = 只翻這一欄,其他欄與順位不動(多重排序第 1 / 中間 / 最後一欄各驗);
 *        沒排序的欄:一般點擊取代全部、Shift+點擊加到最後;
 *        ⌄ 選單「取消排序」只拿掉這一欄、後面順位往前補;已排序的欄選另一方向只翻這一欄;沒排序的欄選方向取代全部;
 *        「取消排序」這一欄在排序裡就出現;「升冪 / 降冪排序」只列這一欄目前不是的那個方向;
 *        順位數字只在 ≥2 欄排序時出現、1–9 照寫、第 10 個以後「9+」;讀屏描述照實說第幾;
 *        播報 = 「這一欄發生了什麼」+「結果」(拿掉 / 換方向 / 加入 / 取代全部各一格)。
 *        另驗呼叫端(data-table.tsx)四個入口(點擊、Enter / Space、Shift 版、⌄ 三項)都只呼叫 `nextSorting` 一支,
 *        而且交給它與交給播報的「之前」是同一個值、`additive` 由 Shift + 表 / 欄允許多重排序算出(M32:值是誰算的)。
 *        **排序面板的字**(2026-11-15 A11;data-table.spec.md「Multi-sort header」列的字串那一句):`DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS`
 *        = 開放之前寫死在面板裡的 13 個字(一字未改 = 畫面不變)、升冪 / 降冪與表頭那一份同值;`resolveDataTableSortManagerLabels`
 *        不給 = 預設、只給一個鍵只換那一個、給全部全換(形狀同篩選面板 `labels`);面板(data-table-sort-manager.tsx)收
 *        `labels?: Partial<DataTableSortManagerLabels>`、把它交給 resolve、13 個鍵每個都有被讀,而且原始碼的字串 / JSX 文字裡
 *        **沒有任何寫死的中文**(註解不算;唯一例外 `'排序條件'` 是交給全 DS 共用拖曳播報的名詞,那一份還沒有換字管道)。
 *   紅: 判定表任一格與純函式輸出不符即 exit 1(判定表列的是**期望值**,不是抄輸出);
 *        `--selftest` 換上兩份修前的行為當對照組,判定表對每一份都必須抓到 ≥ 4 格不符,抓不到 = 判定表沒在驗這條規則 → exit 1:
 *        (1) 2026-11-03 → 11-11 的三態版(升冪 → 降冪 → 清除、一般點擊清掉其他欄、⌄「取消排序」清掉全部;5db512f2 的 sort-cycle.ts 原樣搬進來);
 *        (2) 2026-11-03 以前的 TanStack v8.21.3 `toggleSorting`(add / toggle / replace / remove 分支原樣搬進來)。
 *        面板的字另有六個對照組(每一個都必須至少紅一格):resolve 不理 labels / resolve 不墊預設值 / 預設值改一個字 /
 *        面板把「加排序」寫回死字 / 面板不把 labels 交給 resolve / 拖曳把手的讀屏名稱寫回死字。
 *        `--manager-src=<檔>` 改讀另一份面板原始碼(拿 2026-11-15 前那份來跑,面板那幾格必須紅)。
 *   綠: 全部相符時綠;純函式無時鐘、無隨機、無 DOM,重複跑結果恆等。
 *
 * 規格來源:user 2026-11-11 R16 定案(「循環:兩態」;已排序的欄一般點擊 = Shift+點擊;⌄ 選單「取消排序」只拿掉這一欄),
 * 原話逐字住 data-table.spec.md「Multi-sort header」列;2026-10-30 的「1. 就用ds的字眼就好」「4. 不要限制欄數,超過一律9+」仍有效。
 *
 * Run: `node scripts/test-data-table-sort-cycle.mjs`(`--selftest` 跑對照組)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import * as real from '../packages/design-system/src/components/DataTable/lib/sort-cycle.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const MANAGER_PATH = 'packages/design-system/src/components/DataTable/data-table-sort-manager.tsx'
const managerSrcArg = process.argv.find((a) => a.startsWith('--manager-src='))?.slice('--manager-src='.length)

// ── 對照組 (1):2026-11-03 → 11-11 的三態版(5db512f2 lib/sort-cycle.ts)──────────────────────────────
const legacyTriState = (() => {
  const dirOf = (sorting, id) => { const e = sorting.find((s) => s.id === id); return e ? (e.desc ? 'desc' : 'asc') : false }
  const nextDir = (cur) => (cur === false ? 'asc' : cur === 'asc' ? 'desc' : false)
  const activate = (sorting, id, additive) => {
    const next = nextDir(dirOf(sorting, id))
    if (!additive) return next === false ? [] : [{ id, desc: next === 'desc' }]
    const index = sorting.findIndex((s) => s.id === id)
    if (index < 0) return [...sorting, { id, desc: false }]
    if (next === false) return sorting.filter((_, i) => i !== index)
    return sorting.map((s, i) => (i === index ? { ...s, desc: next === 'desc' } : s))
  }
  return {
    ...real,
    nextSorting: (sorting, id, action) => {
      if (action.kind === 'activate') return activate(sorting, id, action.additive)
      if (action.kind === 'set') return [{ id, desc: action.direction === 'desc' }]
      return [] // 修前「取消排序」清掉全部
    },
    sortChangeAnnouncement: (_prev, next, _id, labelOf) => {
      if (next.length === 0) return '已取消排序'
      const d = (s) => (s.desc ? '降冪' : '升冪')
      if (next.length === 1) return `已依 ${labelOf(next[0].id)} ${d(next[0])}排序`
      return `排序:${next.map((s, i) => `${i + 1} ${labelOf(s.id)} ${d(s)}`).join(',')}`
    },
  }
})()

// ── 對照組 (2):2026-11-03 以前 TanStack v8.21.3 RowSorting.ts toggleSorting 的分支,只保留本 DS 會走到的部分 ──
// 第一下方向:字串欄升冪、其他(數字 / 物件)降冪(getAutoSortDir);sortDescFirst 本 DS 沒設。
const legacyTanstack = (() => {
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
  const menu = (old, id, dir) => {
    const existing = old.find((d) => d.id === id)
    const existingIndex = old.findIndex((d) => d.id === id)
    if (old.length && existingIndex !== old.length - 1) return [{ id, desc: dir === 'desc' }]
    if (existing) return old.map((d) => (d.id === id ? { ...d, desc: dir === 'desc' } : d))
    return [{ id, desc: dir === 'desc' }]
  }
  return {
    nextSorting: (old, id, action, kind = 'string') => {
      if (action.kind === 'activate') return toggle(old, id, action.additive, kind)
      if (action.kind === 'set') return menu(old, id, action.direction)
      return old.filter((d) => d.id !== id)
    },
    // 修前 ⌄ 選單:`sortDir && !isMultiSort` 才出「取消排序」(多重排序時不出)
    columnMenuShowsCancelSort: (old, id) => old.length === 1 && old[0].id === id,
    // 修前(2e1f2e27 以前)⌄ 選單:「升冪排序」「降冪排序」兩項永遠都列
    columnMenuShowsSortDirection: () => true,
    // 修前:多重排序時表頭不顯示任何東西(K7)
    sortPriorityLabel: () => null,
    sortPriorityDescription: () => null,
    sortChangeAnnouncement: () => '',
  }
})()

const S = (str) => (str === '' ? [] : str.split(' ').map((t) => ({ id: t.slice(0, -1), desc: t.endsWith('↓') })))
const show = (sorting) => (sorting.length ? sorting.map((s) => `${s.id}${s.desc ? '↓' : '↑'}`).join(' ') : '(無)')
const ACT = (additive) => ({ kind: 'activate', additive })
const SET = (direction) => ({ kind: 'set', direction })
const REMOVE = { kind: 'remove' }
const labelOf = (id) => ({ title: '標題', status: '狀態', priority: '優先級', owner: '負責人' }[id] ?? id)

/** 跑一遍全部判定表;回傳不符的格數。`quiet` = 對照組模式只印不符的格 */
function runTables(impl, { quiet = false } = {}) {
  let fail = 0
  const row = (name, got, want) => {
    if (got !== want) { fail++; console.log(`✗ ${name}:期望 ${want} 實得 ${got}`) } else if (!quiet) console.log(`✓ ${name}`)
  }
  const next = (from, col, action, kind = 'string') => impl.nextSorting(S(from), col, action, kind)

  // ── 判定表 1:表頭點擊 / Enter / Space(additive=false)與 Shift 版(additive=true)
  //    [名稱, 目前排序, 點哪一欄, Shift?, 欄型別(TanStack 對照組用), 期望] ──
  const HEADER = [
    ['一般點擊 / 沒有排序 → 升冪', '', 'title', false, 'string', 'title↑'],
    ['一般點擊 / 數字欄第一下也是升冪', '', 'progress', false, 'number', 'progress↑'],
    ['一般點擊 / 人員欄第一下也是升冪', '', 'owner', false, 'number', 'owner↑'],
    ['一般點擊 / 升冪 → 降冪', 'title↑', 'title', false, 'string', 'title↓'],
    ['一般點擊 / 降冪 → 升冪(兩態:點不回沒排序)', 'title↓', 'title', false, 'string', 'title↑'],
    ['一般點擊 / 沒排序的欄 → 只剩這一欄、升冪', 'title↑', 'status', false, 'string', 'status↑'],
    ['一般點擊 / 多重排序裡沒排序的欄 → 取代全部、升冪', 'title↑ status↓', 'priority', false, 'string', 'priority↑'],
    ['一般點擊 / 多重排序第 1 欄(升冪)→ 只翻這欄,其他欄與順位不動', 'title↑ status↑ priority↑', 'title', false, 'string', 'title↓ status↑ priority↑'],
    ['一般點擊 / 多重排序中間欄(升冪)→ 只翻這欄', 'title↑ status↑ priority↑', 'status', false, 'string', 'title↑ status↓ priority↑'],
    ['一般點擊 / 多重排序中間欄(降冪)→ 升冪,不清除', 'title↑ status↓ priority↑', 'status', false, 'string', 'title↑ status↑ priority↑'],
    ['一般點擊 / 多重排序最後一欄(升冪)→ 只翻這欄', 'title↑ status↑ priority↑', 'priority', false, 'string', 'title↑ status↑ priority↓'],
    ['一般點擊 / 多重排序最後一欄(降冪)→ 升冪,不清除', 'title↑ status↓', 'status', false, 'string', 'title↑ status↑'],
    ['Shift / 沒有排序 → 加入、升冪', '', 'title', true, 'string', 'title↑'],
    ['Shift / 加第二欄 → 接在最後、升冪', 'title↑', 'status', true, 'string', 'title↑ status↑'],
    ['Shift / 數字欄加入也是升冪', 'title↑', 'progress', true, 'number', 'title↑ progress↑'],
    ['Shift / 多重排序第 1 欄(升冪)→ 降冪,順位不動', 'title↑ status↑', 'title', true, 'string', 'title↓ status↑'],
    ['Shift / 多重排序第 1 欄(降冪)→ 升冪,不清除', 'title↓ status↑', 'title', true, 'string', 'title↑ status↑'],
    ['Shift / 多重排序中間欄(升冪)→ 降冪,順位不動', 'title↑ status↑ priority↑', 'status', true, 'string', 'title↑ status↓ priority↑'],
    ['Shift / 多重排序中間欄(降冪)→ 升冪,不清除', 'title↑ status↓ priority↑', 'status', true, 'string', 'title↑ status↑ priority↑'],
    ['Shift / 多重排序最後一欄(降冪)→ 升冪,不清除', 'title↑ status↑ priority↓', 'priority', true, 'string', 'title↑ status↑ priority↑'],
    ['Shift / 只剩一欄、降冪 → 升冪', 'title↓', 'title', true, 'string', 'title↑'],
    ['Shift / 不限欄數:第 10 欄照樣加入', 'a↑ b↑ c↑ d↑ e↑ f↑ g↑ h↑ i↑', 'j', true, 'string', 'a↑ b↑ c↑ d↑ e↑ f↑ g↑ h↑ i↑ j↑'],
    ['Shift 但不允許多重排序(additive=false 傳進來)/ 沒排序的欄 → 取代全部', 'title↑', 'status', false, 'string', 'status↑'],
  ]
  for (const [name, from, col, shift, kind, want] of HEADER) row(`表頭 ${name}`, show(next(from, col, ACT(shift), kind)), want)

  // ── 判定表 1b:已排序的欄,一般點擊 = Shift+點擊(每個狀態 × 每一欄)/ 點已排序的欄不改欄數與順位 ──
  for (const from of ['title↑', 'title↓', 'title↑ status↓', 'title↓ status↑ priority↑', 'title↑ status↓ priority↓ owner↑']) {
    for (const s of S(from)) {
      const plain = show(next(from, s.id, ACT(false))); const shift = show(next(from, s.id, ACT(true)))
      row(`表頭 已排序的欄 一般點擊 = Shift+點擊(「${from}」點 ${s.id})`, plain, shift)
      const order = (str) => (str === '(無)' ? str : str.split(' ').map((t) => t.slice(0, -1)).join(' '))
      row(`表頭 點已排序的欄不改欄數與順位(「${from}」點 ${s.id})`, order(plain), order(from))
    }
  }

  // ── 判定表 2:序列(不只測靜態格)──
  const seq = (from, col, action, times, kind = 'string') => {
    let s = S(from); const seen = []
    for (let i = 0; i < times; i++) { s = impl.nextSorting(s, col, action, kind); seen.push(show(s)) }
    return seen.join(' ⇒ ')
  }
  row('序列 Shift×3 在「優先級」:加入並升冪 → 降冪 → 升冪(不會被點掉)', seq('title↑ status↑', 'priority', ACT(true), 3), 'title↑ status↑ priority↑ ⇒ title↑ status↑ priority↓ ⇒ title↑ status↑ priority↑')
  row('序列 一般點擊×3 在數字欄:升冪 → 降冪 → 升冪', seq('', 'progress', ACT(false), 3, 'number'), 'progress↑ ⇒ progress↓ ⇒ progress↑')
  row('序列 一般點擊×4 在多重排序中間欄:只來回翻這一欄', seq('title↑ status↑ priority↑', 'status', ACT(false), 4), 'title↑ status↓ priority↑ ⇒ title↑ status↑ priority↑ ⇒ title↑ status↓ priority↑ ⇒ title↑ status↑ priority↑')

  // ── 判定表 3:⌄ 欄位選單 [名稱, 目前排序, 開哪一欄的選單, 動作, 期望] ──
  const MENU = [
    ['升冪排序 / 多重排序最後一欄(降冪)→ 只翻這欄', 'title↑ status↓', 'status', SET('asc'), 'title↑ status↑'],
    ['降冪排序 / 多重排序最後一欄(升冪)→ 只翻這欄', 'title↑ status↑', 'status', SET('desc'), 'title↑ status↓'],
    ['升冪排序 / 多重排序第 1 欄(降冪)→ 只翻這欄', 'title↓ status↑', 'title', SET('asc'), 'title↑ status↑'],
    ['降冪排序 / 多重排序中間欄(升冪)→ 只翻這欄、順位不動', 'title↑ status↑ priority↑', 'status', SET('desc'), 'title↑ status↓ priority↑'],
    ['升冪排序 / 沒排序的欄(單欄排序中)→ 取代全部', 'title↑', 'status', SET('asc'), 'status↑'],
    ['降冪排序 / 多重排序中沒排序的欄 → 取代全部', 'title↑ status↓ priority↑', 'owner', SET('desc'), 'owner↓'],
    ['升冪排序 / 沒有排序 → 只有這一欄', '', 'status', SET('asc'), 'status↑'],
    ['取消排序 / 唯一一欄 → 沒有排序', 'title↑', 'title', REMOVE, '(無)'],
    ['取消排序 / 多重排序第 1 欄 → 只拿掉這欄、後面往前補', 'title↑ status↓', 'title', REMOVE, 'status↓'],
    ['取消排序 / 多重排序中間欄 → 只拿掉這欄、後面往前補', 'title↑ status↓ priority↑', 'status', REMOVE, 'title↑ priority↑'],
    ['取消排序 / 多重排序最後一欄 → 只拿掉這欄', 'title↑ status↓ priority↑', 'priority', REMOVE, 'title↑ status↓'],
    ['取消排序 / 這一欄不在排序裡 → 不變', 'title↑', 'status', REMOVE, 'title↑'],
  ]
  for (const [name, from, col, action, want] of MENU) row(`選單 ${name}`, show(next(from, col, action)), want)

  // ── 判定表 3b:⌄ 選單要不要出「取消排序」(這一欄在排序裡就出,多重排序也出)──
  const MENU_CANCEL = [
    ['唯一一欄排序、就是這欄 → 出', 'title↑', 'title', 'true'],
    ['唯一一欄排序、不是這欄 → 不出', 'title↑', 'status', 'false'],
    ['沒有排序 → 不出', '', 'title', 'false'],
    ['多重排序、這欄在裡面 → 出', 'title↑ status↓', 'status', 'true'],
    ['多重排序、這欄是第一欄 → 出', 'title↑ status↓', 'title', 'true'],
    ['多重排序、這欄不在裡面 → 不出', 'title↑ status↓', 'priority', 'false'],
  ]
  for (const [name, from, col, want] of MENU_CANCEL) row(`選單「取消排序」${name}`, String(impl.columnMenuShowsCancelSort(S(from), col)), want)

  // ── 判定表 3c:⌄ 選單要不要列「升冪排序」/「降冪排序」(只列這一欄目前不是的那個方向;user 2026-11-10 PR #172 留言)──
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

  // ── 判定表 5:播報 = 這一欄發生了什麼 + 結果。「之後」由 nextSorting 算(與呼叫端同一條路)[名稱, 之前, 欄, 動作, 期望] ──
  const ANNOUNCE = [
    ['一欄 / 沒有排序 → 點標題', '', 'title', ACT(false), '已依 標題 升冪排序'],
    ['一欄 / 翻方向', 'title↑', 'title', ACT(false), '已依 標題 降冪排序'],
    ['一般點擊沒排序的欄 → 取代全部', 'title↑ status↓', 'priority', ACT(false), '已依 優先級 升冪排序,其他欄的排序已清除'],
    ['多重排序翻中間欄', 'title↑ status↑ priority↑', 'status', ACT(false), '已依 狀態 降冪排序,共 3 欄排序:1 標題 升冪,2 狀態 降冪,3 優先級 升冪'],
    ['Shift 加入第三欄', 'title↑ status↓', 'priority', ACT(true), '已依 優先級 升冪排序,共 3 欄排序:1 標題 升冪,2 狀態 降冪,3 優先級 升冪'],
    ['選單取消中間欄 → 剩兩欄', 'title↑ status↓ priority↑', 'status', REMOVE, '已取消 狀態 的排序,共 2 欄排序:1 標題 升冪,2 優先級 升冪'],
    ['選單取消第 1 欄 → 剩一欄', 'title↑ status↓', 'title', REMOVE, '已取消 標題 的排序,目前依 狀態 降冪排序'],
    ['選單取消唯一一欄 → 沒有排序', 'title↑', 'title', REMOVE, '已取消 標題 的排序,目前沒有排序'],
    ['選單在沒排序的欄選降冪 → 取代全部', 'title↑ status↓ priority↑', 'owner', SET('desc'), '已依 負責人 降冪排序,其他欄的排序已清除'],
  ]
  for (const [name, from, col, action, want] of ANNOUNCE) {
    const previous = S(from)
    const after = impl.nextSorting(previous, col, action)
    row(`播報 ${name}`, impl.sortChangeAnnouncement(previous, after, col, labelOf), want)
  }
  return fail
}

// ── 判定表 6:排序面板的字(2026-11-15 A11:面板收 `labels`,形狀照抄篩選面板)──────────────────────────────
// 期望值 = 開放之前寫死在 data-table-sort-manager.tsx 的字(9d3c4736:80-81 方向選項、:173-176 標題列、:216-219 加排序那一排、
// :257 / :263 / :266 / :269 每一列的讀屏名稱),一字未改 = 不傳 labels 時畫面與讀屏都不變。
const SORT_MANAGER_LABELS_BEFORE = {
  title: '排序', resetToDefault: '恢復預設', resetToDefaultDone: '已恢復預設排序', clearAll: '清除全部', clearAllDone: '已清除全部排序',
  close: '關閉', addSort: '加排序', fieldAriaLabel: '排序欄位', directionAriaLabel: '排序方向', ascending: '升冪', descending: '降冪',
  deleteCondition: '刪除', dragToReorder: '拖曳重排',
}
const SORT_MANAGER_LABELS_ENGLISH = {
  title: 'Sort', resetToDefault: 'Reset to default', resetToDefaultDone: 'Sorting reset to default', clearAll: 'Clear all', clearAllDone: 'All sorting cleared',
  close: 'Close', addSort: 'Add sort', fieldAriaLabel: 'Sort field', directionAriaLabel: 'Sort direction', ascending: 'Ascending', descending: 'Descending',
  deleteCondition: 'Delete', dragToReorder: 'Drag to reorder',
}
/** 面板原始碼裡唯一准許的中文字串:交給全 DS 共用拖曳播報(lib/drag-announcements.ts)的名詞,那一份還沒有換字管道(spec 同句寫明)。 */
const MANAGER_CJK_ALLOWED = new Set(['排序條件'])
const CJK = /[㐀-鿿豈-﫿]/

/** 面板原始碼裡(註解以外)每一段字串 / 模板字串 / JSX 文字中含中文的,排除准許清單;回傳 [{ text, line }] */
function hardCodedCjk(src) {
  const sf = ts.createSourceFile('data-table-sort-manager.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits = []
  const add = (node, text) => {
    const t = String(text).trim()
    if (t && CJK.test(t) && !MANAGER_CJK_ALLOWED.has(t)) hits.push({ text: t, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 })
  }
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) add(node, node.text)
    else if (ts.isTemplateExpression(node)) { add(node, node.head.text); for (const span of node.templateSpans) add(span, span.literal.text) }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/** 跑面板的字;回傳不符的格數。impl = sort-cycle 模組(或對照組換過的版本),managerSrc = 面板原始碼字串 */
function checkManagerLabels(impl, managerSrc, { quiet = false } = {}) {
  let fail = 0
  const row = (name, ok, detail = '') => {
    if (!ok) { fail++; console.log(`✗ 面板字 ${name}${detail ? ` | ${detail}` : ''}`) } else if (!quiet) console.log(`✓ 面板字 ${name}`)
  }
  const keys = Object.keys(SORT_MANAGER_LABELS_BEFORE)
  const defaults = impl.DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS ?? {}
  const sameKeys = JSON.stringify(Object.keys(defaults).sort()) === JSON.stringify([...keys].sort())
  const changed = keys.filter((k) => defaults[k] !== SORT_MANAGER_LABELS_BEFORE[k])
  row(`預設值 = 開放前寫死的 ${keys.length} 個字(鍵一樣、字一樣)`, sameKeys && changed.length === 0, `鍵 ${JSON.stringify(Object.keys(defaults))};不一樣的 ${JSON.stringify(changed.map((k) => `${k}=${defaults[k]}`))}`)
  row('升冪 / 降冪與表頭那一份(DATA_TABLE_SORT_DEFAULT_LABELS)同一個值', defaults.ascending === impl.DATA_TABLE_SORT_DEFAULT_LABELS?.ascending && defaults.descending === impl.DATA_TABLE_SORT_DEFAULT_LABELS?.descending)
  const resolve = impl.resolveDataTableSortManagerLabels
  if (typeof resolve !== 'function') row('有 resolveDataTableSortManagerLabels', false, '沒有這支 —— 面板的字沒有合併入口')
  else {
    const none = resolve(undefined)
    row('不給 labels → 全部是預設值', keys.every((k) => none[k] === defaults[k]) && none !== defaults, none === defaults ? '回傳的是預設值物件本身(呼叫端改它會改到預設值)' : JSON.stringify(none))
    const partial = resolve({ title: SORT_MANAGER_LABELS_ENGLISH.title })
    const partialWrong = keys.filter((k) => partial[k] !== (k === 'title' ? SORT_MANAGER_LABELS_ENGLISH.title : defaults[k]))
    row('只給一個鍵 → 只換那一個、其餘照預設(Partial 合併)', partialWrong.length === 0, `不對的鍵 ${JSON.stringify(partialWrong)}`)
    const full = resolve(SORT_MANAGER_LABELS_ENGLISH)
    const fullWrong = keys.filter((k) => full[k] !== SORT_MANAGER_LABELS_ENGLISH[k])
    row('給全部 → 全部換掉', fullWrong.length === 0, `沒換掉的鍵 ${JSON.stringify(fullWrong)}`)
    row('合併之後預設值本身沒被改到', defaults.title === SORT_MANAGER_LABELS_BEFORE.title)
  }
  // 呼叫端:面板真的從 labels 取字(M37:預設值對了不等於面板用的是它;值由誰算 —— M32)
  row('面板收 `labels?: Partial<DataTableSortManagerLabels>`', /\blabels\?: Partial<DataTableSortManagerLabels>/.test(managerSrc))
  row('面板把 consumer 給的 labels 交給 resolveDataTableSortManagerLabels', /labels: labelsOverride,/.test(managerSrc) && /resolveDataTableSortManagerLabels\(labelsOverride\)/.test(managerSrc))
  // 這裡只查「鍵有被讀」,不查字畫在哪(對調兩個讀屏名稱照樣綠 —— 審查 A 第 2 輪);每個字畫在對的元素 / 屬性上由
  // scripts/data-table-panel-reset-clear-invariant.mjs 的 sort-labels-* 列在瀏覽器裡量(突變 sort-labels-swap-aria 必紅)
  const unread = keys.filter((k) => !new RegExp(`\\blabels\\.${k}\\b`).test(managerSrc))
  row(`面板讀了全部 ${keys.length} 個鍵(沒讀 = 那個字還寫死在別處或沒畫出來)`, unread.length === 0, `沒讀的鍵 ${JSON.stringify(unread)}`)
  const cjk = hardCodedCjk(managerSrc)
  row('面板原始碼(註解以外)沒有寫死的中文', cjk.length === 0, cjk.slice(0, 6).map((h) => `:${h.line}「${h.text}」`).join('、'))
  row('預設值與型別由面板出口(進 root barrel,同篩選面板)', /export \{ DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS \}/.test(managerSrc) && /export type \{ DataTableSortManagerLabels \}/.test(managerSrc))
  return fail
}

const readManagerSrc = () => readFileSync(managerSrcArg ?? join(ROOT, MANAGER_PATH), 'utf8')

if (SELFTEST) {
  // 對照組:兩份修前行為在判定表上都必須大量不符(各 ≥ 4 格);全綠 = 判定表沒在驗規則
  let ok = true
  for (const [name, impl] of [['2026-11-03 → 11-11 三態版(5db512f2)', legacyTriState], ['2026-11-03 以前 TanStack toggleSorting', legacyTanstack]]) {
    console.log(`── 對照組:${name}`)
    const caught = runTables(impl, { quiet: true })
    console.log(caught >= 4 ? `✅ 對照組 ${name}:被判定表抓到 ${caught} 格不符(≥ 4)` : `✗ 對照組 ${name}:只被抓到 ${caught} 格(< 4),判定表沒在驗這條規則`)
    if (caught < 4) ok = false
  }
  // 面板的字:現況必綠(前提),六個破法各至少紅一格;破法套不上(要換的那段字不在)= 對照組不成立,也算失敗
  const managerSrc = readManagerSrc()
  const base = checkManagerLabels(real, managerSrc, { quiet: true })
  console.log(base === 0 ? '✅ 面板的字:現況全綠(對照組的前提)' : `✗ 面板的字:現況就有 ${base} 格不符,對照組的紅燈無法歸因`)
  if (base !== 0) ok = false
  const swap = (from, to) => (managerSrc.includes(from) ? managerSrc.replace(from, to) : null)
  const controls = [
    ['resolve 不理 consumer 給的 labels', { ...real, resolveDataTableSortManagerLabels: () => ({ ...real.DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS }) }, managerSrc],
    ['resolve 不墊預設值(只回 consumer 給的)', { ...real, resolveDataTableSortManagerLabels: (overrides) => ({ ...overrides }) }, managerSrc],
    ['預設值改了一個字(「加排序」→「新增排序」)', { ...real, DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS: { ...real.DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS, addSort: '新增排序' } }, managerSrc],
    ['面板把「加排序」寫回死字', real, swap('{labels.addSort}', '加排序')],
    ['面板不把 labels 交給 resolve', real, swap('resolveDataTableSortManagerLabels(labelsOverride)', 'resolveDataTableSortManagerLabels()')],
    ['拖曳把手的讀屏名稱寫回死字', real, swap('aria-label={labels.dragToReorder}', 'aria-label="拖曳重排"')],
  ]
  for (const [name, impl, src] of controls) {
    if (src === null) { console.log(`✗ 面板字對照組「${name}」:要改的那段原始碼不在了,對照組不成立`); ok = false; continue }
    const caught = checkManagerLabels(impl, src, { quiet: true })
    console.log(caught >= 1 ? `✅ 面板字對照組「${name}」:紅 ${caught} 格` : `✗ 面板字對照組「${name}」:0 格紅 —— 這一格的綠燈是零證據`)
    if (caught < 1) ok = false
  }
  process.exit(ok ? 0 : 1)
}

let fail = runTables(real)
fail += checkManagerLabels(real, readManagerSrc())

// ── 呼叫端真的消費這支判定、值由誰算(M37 / M32:判定表測的若是平行實作,或呼叫端交的值另外推,等於沒測)──
// `--src=<檔>`:改讀另一份 data-table.tsx(對照組用:拿修前那份來跑,呼叫端這段必須紅)
const srcArg = process.argv.find((a) => a.startsWith('--src='))?.slice('--src='.length)
const src = readFileSync(srcArg ?? join(ROOT, 'packages/design-system/src/components/DataTable/data-table.tsx'), 'utf8')
const must = [
  ['「之前」= 表格此刻的排序,交給 nextSorting 與播報的是同一個值', /const previous = table\.getState\(\)\.sorting \?\? \[\]\s*\n\s*const next = nextSorting\(previous, columnId, action\)\s*\n\s*table\.setSorting\(next\)\s*\n\s*setSortAnnouncement\(sortChangeAnnouncement\(previous, next, columnId,/],
  ['additive 由 Shift + 表允許 + 欄允許多重排序算出,表頭點擊 / 鍵盤經 nextSorting', /const additive = shiftKey && enableMultiSort && header\.column\.getCanMultiSort\(\)\s*\n\s*applyHeaderSorting\(header\.column\.id, \{ kind: 'activate', additive \}\)/],
  ['點擊帶 Shift', /onClick=\{canSort \? \(e\) => activateSort\(e\.shiftKey\)/],
  ['Enter / Space 帶 Shift(與點擊同一支)', /if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ e\.preventDefault\(\); activateSort\(e\.shiftKey\) \}/],
  ['⌄ 選單「升冪排序」:出不出經 columnMenuShowsSortDirection、按了經 nextSorting set asc', /\{columnMenuShowsSortDirection\(sortingState, header\.column\.id, 'asc'\) && <DropdownMenuItem startIcon=\{ArrowUp\} onClick=\{\(\) => applyHeaderSorting\(header\.column\.id, \{ kind: 'set', direction: 'asc' \}\)\}>/],
  ['⌄ 選單「降冪排序」:出不出經 columnMenuShowsSortDirection、按了經 nextSorting set desc', /\{columnMenuShowsSortDirection\(sortingState, header\.column\.id, 'desc'\) && <DropdownMenuItem startIcon=\{ArrowDown\} onClick=\{\(\) => applyHeaderSorting\(header\.column\.id, \{ kind: 'set', direction: 'desc' \}\)\}>/],
  ['⌄ 選單「取消排序」:出不出經 columnMenuShowsCancelSort、按了經 nextSorting remove', /\{columnMenuShowsCancelSort\(sortingState, header\.column\.id\) && <DropdownMenuItem startIcon=\{XIcon\} onClick=\{\(\) => applyHeaderSorting\(header\.column\.id, \{ kind: 'remove' \}\)\}>/],
  ['選單項字串走 DATA_TABLE_SORT_DEFAULT_LABELS', /\{DATA_TABLE_SORT_DEFAULT_LABELS\.sortAscending\}[\s\S]*\{DATA_TABLE_SORT_DEFAULT_LABELS\.sortDescending\}[\s\S]*\{DATA_TABLE_SORT_DEFAULT_LABELS\.cancelSort\}/],
  ['數字經 sortPriorityLabel', /sortPriorityLabel\(sortingState, header\.column\.id\)/],
]
for (const [name, re] of must) { const ok = re.test(src); if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 呼叫端 ${name}`) }
const forbid = [
  ['表頭不再用 TanStack getToggleSortingHandler', /getToggleSortingHandler\(/],
  ['表頭不再用 column.toggleSorting / clearSorting', /header\.column\.(toggleSorting|clearSorting)\(/],
  ['多重排序不再藏箭頭(isMultiSort)', /isMultiSort/],
  ['舊的兩支判定(sortingAfterHeaderActivate / sortingFromColumnMenu)不再出現 = 只有 nextSorting 一支', /sortingAfterHeaderActivate|sortingFromColumnMenu/],
]
for (const [name, re] of forbid) { const hit = re.test(src); if (hit) fail++; console.log(`${hit ? '✗' : '✓'} 呼叫端 ${name}`) }
const setSortingCalls = (src.match(/table\.setSorting\(/g) || []).length
if (setSortingCalls !== 1) fail++
console.log(`${setSortingCalls === 1 ? '✓' : '✗'} 呼叫端 table.setSorting 只有一處(applyHeaderSorting),沒有繞過 nextSorting 的入口 | 實得 ${setSortingCalls} 處`)

console.log(fail ? `✗ ${fail} 項不符` : '✅ 表頭排序判定表 PASS')
process.exit(fail ? 1 : 0)
