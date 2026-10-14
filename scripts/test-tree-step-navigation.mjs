#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: TreeView 步驟導覽樹的判定(packages/design-system/src/components/TreeView/tree-step-navigation.ts)對每一種情境、
 *        以及每一串連續手勢(序列),都回 tree-view.spec.md「步驟導覽樹」「步驟結果」寫的結果:點大步驟的文字會換位置 → 去那裡並只展開、
 *        什麼都不會變 → 開合(D);同一列的連點(瀏覽器次數 ≥ 2 或離上一下 < 500ms)只處理選取、不開合,焦點回到這一串第一下留下的位置
 *        (雙擊 = 單擊);鍵盤只「到那一步」;
 *        列尾結果與灰底代顯照表;而且 tree-view.tsx 真的呼叫這幾支函式(不是平行實作)。決定來源:待辦總帳 T1–T5。
 *   紅: 判定表任一格(期望值手寫,不是抄輸出)與實作不符 → exit 1;tree-view.tsx 沒有呼叫判定、或舊的「expandOnSelect 一律開合」還在 → exit 1;
 *       `--selftest` 換上 12 個改壞版(不擋連點、只看次數、只看時間 300ms、舊的一律開合、鍵盤也開合、有頁面的大步驟代顯灰底、
 *       只畫全對、沒結果算成功、展開也代顯、鍵盤不展開、焦點不跟過去、連點後焦點留在點的那一列),每一個都必須讓它指定的那幾格紅,
 *       少一格 = 判定表沒在驗那條規則 → exit 1。
 *   綠: 全部相符時綠;純函式無時鐘、無隨機、無 DOM,重複跑結果恆等(序列的時間是表裡寫死的毫秒數)。
 *
 * 為什麼測**序列**而不只測單格(M37):連點保護的毛病只在「第一下改了狀態、第二下讀到新狀態」時才出現 ——
 * 從別處雙擊沒有自己頁面的大步驟,第一下到第一個子步驟並展開,第二下讀到「目前那一步在裡面、看得到」,沒擋就收起來。
 * 單格表永遠看不到這一下。所以這裡有一個最小的狀態機(樹的形狀 + 選取 + 展開 + 上一下點擊),
 * 它算「輸入」的方式與 tree-view.tsx 相同:沒有自己頁面的大步驟用同一支 `pagelessStepContext`,連點用同一支 `isRepeatClick`,
 * 每一下點擊的紀錄(含焦點留在哪)與 TreeView `clickRowText` 同形。
 *
 * Run: `node scripts/test-tree-step-navigation.mjs`(`--selftest` 跑改壞版)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as real from '../packages/design-system/src/components/TreeView/tree-step-navigation.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

// ── 樹的形狀(與 tree-view.stories.tsx「步驟導覽契約夾具」同形)──
const P_TREE = [
  { id: 'p1', selectable: false, children: [{ id: 'p1a', status: 'completed' }, { id: 'p1b', status: 'completed' }] },
  { id: 'p2', selectable: false, children: [{ id: 'p2a', status: 'error' }, { id: 'p2b' }] },
  { id: 'p3', selectable: false, children: [
    { id: 'p3n', selectable: false, children: [{ id: 'p3n1', status: 'completed' }, { id: 'p3n2' }] },
    { id: 'p3c', status: 'completed' },
  ] },
]
const H_TREE = [
  { id: 'h1', status: 'error', children: [{ id: 'h1a', status: 'completed' }, { id: 'h1b', status: 'error' }] },
  { id: 'h2', status: 'completed', children: [{ id: 'h2a', status: 'completed' }] },
  { id: 'h3' },
]
const F_TREE = [{ id: 'f1', children: [{ id: 'f1a' }] }, { id: 'f2' }]
const node = (n) => ({ id: n.id, selectable: n.selectable !== false, disabled: !!n.disabled, status: n.status, children: (n.children ?? []).map(node) })
const TREES = {
  P: { nodes: P_TREE.map(node), selectionMode: 'single', expandOnSelect: true },
  H: { nodes: H_TREE.map(node), selectionMode: 'single', expandOnSelect: true },
  F: { nodes: F_TREE.map(node), selectionMode: 'single', expandOnSelect: false },
  N: { nodes: F_TREE.map(node), selectionMode: 'none', expandOnSelect: true },
  M: { nodes: F_TREE.map(node), selectionMode: 'multiple', expandOnSelect: true },
}
const index = (nodes, parent = null, depthMap = new Map()) => {
  for (const n of nodes) { depthMap.set(n.id, { node: n, parent }); index(n.children, n.id, depthMap) }
  return depthMap
}

// ── 最小狀態機(輸入的算法與 tree-view.tsx TreeItem 一致)──
function simulate(impl, treeKey, start, events) {
  const tree = TREES[treeKey]
  const info = index(tree.nodes)
  let selected = new Set(start.selected ? [start.selected] : [])
  const expanded = new Set(start.expanded ?? [])
  let last = null // 上一次點在列的文字上(isRepeatClick;{ rowId, at, focus } 與 TreeView clickRowText 同形)
  let focus = null
  let toggles = 0
  const outcomes = []
  const branchOpen = (id) => { let p = info.get(id).parent; while (p) { if (!expanded.has(p)) return false; p = info.get(p).parent } return true }
  const activate = (id, source, repeatOf) => {
    const { node: n } = info.get(id)
    const hasChildren = n.children.length > 0
    const currentId = tree.selectionMode === 'single' ? ([...selected][0] ?? null) : null
    const ctx = !n.selectable && hasChildren ? impl.pagelessStepContext(id, n.children, currentId, (x) => expanded.has(x)) : null
    const a = impl.resolveStepActivation({
      source, selectionMode: tree.selectionMode, expandOnSelect: tree.expandOnSelect, id, hasChildren, selectable: n.selectable,
      isCurrent: n.selectable && selected.has(id), expanded: expanded.has(id),
      currentInside: ctx?.currentInside ?? false, collapsedOnPathToCurrent: ctx?.collapsedOnPathToCurrent ?? [], firstTarget: ctx?.firstTarget ?? null,
      repeatOf,
    })
    outcomes.push(a.outcome)
    if (a.select !== null) {
      if (tree.selectionMode === 'single') selected = new Set([a.select])
      else if (tree.selectionMode === 'multiple') { if (selected.has(a.select)) selected.delete(a.select); else selected.add(a.select) }
    }
    for (const x of a.expand) expanded.add(x)
    if (a.toggle) { toggles++; if (expanded.has(id)) expanded.delete(id); else expanded.add(id) }
    focus = a.focus ?? id
    return a
  }
  for (const ev of events) {
    if (ev.type === 'click') {
      const repeatOf = impl.isRepeatClick(last, ev.id, ev.t, ev.detail ?? 1) ? last : null
      const a = activate(ev.id, 'pointer', repeatOf)
      last = { rowId: ev.id, at: ev.t, focus: a.focus }
    } else if (ev.type === 'key') {
      activate(ev.id, 'keyboard', null)
    } else if (ev.type === 'chevron') {
      last = null
      if (expanded.has(ev.id)) expanded.delete(ev.id); else expanded.add(ev.id)
    }
  }
  // 灰底與列尾(步驟導覽樹才算)
  const markers = {}
  const results = {}
  if (tree.expandOnSelect && tree.selectionMode === 'single') {
    for (const [id, { node: n }] of info) {
      if (!branchOpen(id)) continue
      const hasChildren = n.children.length > 0
      const currentId = [...selected][0] ?? null
      const ctx = !n.selectable && hasChildren ? impl.pagelessStepContext(id, n.children, currentId, (x) => expanded.has(x)) : null
      const m = impl.stepMarker({ selectable: n.selectable, hasChildren, isCurrent: n.selectable && selected.has(id), currentInside: ctx?.currentInside ?? false, expanded: expanded.has(id), branchOpen: true })
      if (m) markers[id] = m
      const r = impl.stepRowResult({ selectable: n.selectable, hasChildren, expanded: expanded.has(id), ownResult: n.status, descendantResults: ctx?.descendantResults ?? [] })
      if (r.result) results[id] = `${r.proxy ? 'proxy' : 'own'}:${r.result}`
    }
  }
  return { selected: [...selected].sort().join(','), expanded: [...expanded].sort().join(','), focus, toggles, outcomes, markers, results }
}

const click = (id, t, detail = 1) => ({ type: 'click', id, t, detail })
const key = (id) => ({ type: 'key', id })
const chevron = (id) => ({ type: 'chevron', id })

// [代號, 名稱, 樹, 起點, 事件, 期望(只列要驗的欄位)]
const TABLE = [
  // ── A2:沒有自己頁面的大步驟 ──
  ['A1', '從別處點收著的沒頁面大步驟 → 到第一個子步驟、展開、焦點跟過去', 'P', { selected: 'p2a', expanded: ['p2'] }, [click('p1', 0)], { selected: 'p1a', expanded: 'p1,p2', focus: 'p1a', toggles: 0 }],
  ['A2', '從別處點已展開的沒頁面大步驟 → 到第一個子步驟,不收起', 'P', { selected: 'p2a', expanded: ['p1', 'p2'] }, [click('p1', 0)], { selected: 'p1a', expanded: 'p1,p2', toggles: 0 }],
  ['A3', '目前那一步在裡面但收著 → 只展開,選取不變', 'P', { selected: 'p1b', expanded: [] }, [click('p1', 0)], { selected: 'p1b', expanded: 'p1', toggles: 0, outcomes: 'reveal-current' }],
  ['A4', '巢狀:到第一個子步驟要穿過收著的巢狀大步驟 → 沿路都展開', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p3', 0)], { selected: 'p3n1', expanded: 'p1,p3,p3n', focus: 'p3n1' }],
  ['A5', '巢狀:目前那一步在更深一層收著 → 展開到看得到', 'P', { selected: 'p3n2', expanded: [] }, [click('p3', 0)], { selected: 'p3n2', expanded: 'p3,p3n', toggles: 0 }],
  // ── D:什麼都不會變 → 開合 ──
  ['D1', '沒頁面大步驟、目前那一步在裡面而且看得到 → 收起', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0)], { expanded: '', toggles: 1, outcomes: 'toggle' }],
  ['D2', '收起之後隔 1 秒再點 → 展開讓目前那一步露出來(兩下都是動作)', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0), click('p1', 1000)], { expanded: 'p1', toggles: 1, outcomes: 'toggle,reveal-current' }],
  ['D3', '有頁面大步驟自己就是目前那一步 → 開合', 'H', { selected: 'h1', expanded: ['h1'] }, [click('h1', 0)], { selected: 'h1', expanded: '', toggles: 1 }],
  ['D4', '有頁面大步驟從別處點(收著)→ 選它並展開', 'H', { selected: 'h3', expanded: [] }, [click('h1', 0)], { selected: 'h1', expanded: 'h1', toggles: 0 }],
  ['D5', '有頁面大步驟從它的子步驟點(展開著)→ 選它,不收起(T5)', 'H', { selected: 'h1a', expanded: ['h1'] }, [click('h1', 0)], { selected: 'h1', expanded: 'h1', toggles: 0 }],
  ['D6', '子步驟已是目前那一步 → 不動', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1a', 0)], { selected: 'p1a', expanded: 'p1', toggles: 0 }],
  // ── 連點保護 ──
  ['G1', '從別處雙擊沒頁面大步驟(瀏覽器次數 1,2)→ 停在第一個子步驟、展開著', 'P', { selected: 'p2a', expanded: ['p2'] }, [click('p1', 0, 1), click('p1', 120, 2)], { selected: 'p1a', expanded: 'p1,p2', focus: 'p1a', toggles: 0, outcomes: 'go-first-child,guarded' }],
  ['G2', '從別處三擊(1,2,3)→ 同上(焦點也在第一個子步驟)', 'P', { selected: 'p2a', expanded: ['p2'] }, [click('p1', 0, 1), click('p1', 120, 2), click('p1', 240, 3)], { selected: 'p1a', expanded: 'p1,p2', focus: 'p1a', toggles: 0 }],
  ['G3', '原地雙擊(1,2)→ 只收起一次,不閃;焦點在大步驟(與單擊相同)', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0, 1), click('p1', 130, 2)], { expanded: '', focus: 'p1', toggles: 1 }],
  ['G4', '兩下都回報第 1 下(iPhone / iPad 單點的樣子)隔 300ms → 靠時間擋;焦點在第一個子步驟', 'P', { selected: 'p2a', expanded: ['p2'] }, [click('p1', 0, 1), click('p1', 300, 1)], { selected: 'p1a', expanded: 'p1,p2', focus: 'p1a', toggles: 0 }],
  ['G5', 'Chromium 觸控快點四下(1,2,3,1)→ 第四下也擋', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0, 1), click('p1', 150, 2), click('p1', 300, 3), click('p1', 450, 1)], { expanded: '', toggles: 1 }],
  ['G6', '使用者把雙擊速度調慢(隔 700ms、次數 2)→ 照系統算雙擊,擋', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0, 1), click('p1', 700, 2)], { expanded: '', toggles: 1 }],
  ['G7', '隔 700ms、次數 1(系統不算雙擊)→ 兩個動作(照實記下的殘留)', 'P', { selected: 'p2a', expanded: ['p2'] }, [click('p1', 0, 1), click('p1', 700, 1)], { selected: 'p1a', expanded: 'p2', toggles: 1 }],
  ['G8', '換列的快點(p1 之後 100ms 點 p2,次數 2)→ p2 照常處理', 'P', { selected: 'p3c', expanded: ['p3'] }, [click('p1', 0, 1), click('p2', 100, 2)], { selected: 'p2a', expanded: 'p1,p2,p3', toggles: 0 }],
  ['G9', '換列之後再回到 p2 的連點 → 擋;焦點在 p2 的第一個子步驟', 'P', { selected: 'p3c', expanded: ['p3'] }, [click('p1', 0, 1), click('p2', 100, 1), click('p2', 200, 1)], { selected: 'p2a', expanded: 'p1,p2,p3', focus: 'p2a', toggles: 0 }],
  ['G10', '中間點過展開箭頭 → 下一下點文字不算連點', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0, 1), chevron('p1'), click('p1', 200, 1)], { expanded: '', toggles: 2 }],
  ['G11', '有頁面大步驟從別處雙擊 → 選它、展開著、焦點在它', 'H', { selected: 'h3', expanded: [] }, [click('h1', 0, 1), click('h1', 120, 2)], { selected: 'h1', expanded: 'h1', focus: 'h1', toggles: 0 }],
  ['G13', '原地(收著、目前那一步在裡面)雙擊 → 第一下只展開,第二下不收回;焦點在大步驟(與單擊相同)', 'P', { selected: 'p1b', expanded: [] }, [click('p1', 0, 1), click('p1', 120, 2)], { selected: 'p1b', expanded: 'p1', focus: 'p1', toggles: 0, outcomes: 'reveal-current,guarded' }],
  ['G12', '箭頭雙擊 → 開合兩次(箭頭不受保護)', 'P', { selected: 'p1a', expanded: ['p1'] }, [chevron('p1'), chevron('p1')], { expanded: 'p1', toggles: 0 }],
  // ── 鍵盤 ──
  ['K1', 'Enter 從別處到沒頁面大步驟 → 到第一個子步驟、展開、焦點跟過去', 'P', { selected: 'p2a', expanded: ['p2'] }, [key('p1')], { selected: 'p1a', expanded: 'p1,p2', focus: 'p1a', toggles: 0 }],
  ['K2', 'Enter:目前那一步在裡面但收著 → 不動(原地開合走 →)', 'P', { selected: 'p1b', expanded: [] }, [key('p1')], { selected: 'p1b', expanded: '', toggles: 0 }],
  ['K3', 'Enter:D 的那一格 → 不開合', 'P', { selected: 'p1a', expanded: ['p1'] }, [key('p1')], { expanded: 'p1', toggles: 0 }],
  ['K4', 'Enter 按三下(從別處)→ 永不收起', 'P', { selected: 'p2a', expanded: ['p2'] }, [key('p1'), key('p1'), key('p1')], { selected: 'p1a', expanded: 'p1,p2', toggles: 0 }],
  ['K5', 'Enter 到有頁面大步驟(從別處)→ 只選它,不展開', 'H', { selected: 'h3', expanded: [] }, [key('h1')], { selected: 'h1', expanded: '', toggles: 0 }],
  ['K6', 'Enter 在有頁面大步驟自己 → 不開合', 'H', { selected: 'h1', expanded: ['h1'] }, [key('h1')], { expanded: 'h1', toggles: 0 }],
  // ── 其他樹不變 ──
  ['F1', '一般樹(沒開 expandOnSelect)點資料夾的文字 → 只選取、不展開', 'F', { selected: 'f2', expanded: [] }, [click('f1', 0)], { selected: 'f1', expanded: '', toggles: 0 }],
  ['F2', '一般樹點已選的列 → 照舊再選一次(onSelectedChange 照發)、不開合', 'F', { selected: 'f1', expanded: [] }, [click('f1', 0)], { selected: 'f1', expanded: '', outcomes: 'none' }],
  ['F3', '不選取模式 + expandOnSelect:點文字 = 開合;雙擊只開合一次', 'N', { selected: null, expanded: [] }, [click('f1', 0, 1), click('f1', 120, 2)], { expanded: 'f1', toggles: 1 }],
  ['F4', '多選 + expandOnSelect:點收著的資料夾 → 選它並只展開', 'M', { selected: null, expanded: [] }, [click('f1', 0)], { selected: 'f1', expanded: 'f1', toggles: 0 }],
  // ── 灰底 ──
  ['R1', '沒頁面大步驟收起、目前那一步在裡面 → 灰底代顯在它身上', 'P', { selected: 'p1a', expanded: ['p1'] }, [click('p1', 0)], { markers: 'p1:proxy' }],
  ['R2', '巢狀:兩層都收著 → 灰底在看得到的最外層', 'P', { selected: 'p3n1', expanded: [] }, [], { markers: 'p3:proxy' }],
  ['R3', '巢狀:外層展開、內層收著 → 灰底在內層', 'P', { selected: 'p3n1', expanded: ['p3'] }, [], { markers: 'p3n:proxy' }],
  ['R4', '目前那一步看得到 → 灰底在它自己', 'P', { selected: 'p3n1', expanded: ['p3', 'p3n'] }, [], { markers: 'p3n1:own' }],
  ['R5', '有頁面大步驟收起、目前那一步在裡面 → 哪裡都不灰', 'H', { selected: 'h1b', expanded: ['h1'] }, [chevron('h1')], { markers: '' }],
  ['R6', '有頁面大步驟自己是目前那一步、收起 → 灰底仍在它自己', 'H', { selected: 'h1', expanded: [] }, [], { markers: 'h1:own' }],
  // ── 列尾結果 ──
  ['S1', '沒頁面大步驟展開時不畫;子步驟畫自己的', 'P', { selected: 'p2a', expanded: ['p1', 'p2'] }, [], { results: 'p1a:own:completed,p1b:own:completed,p2a:own:error' }],
  ['S2', '收起時代顯:全部成功 → 成功;任一失敗 → 失敗;有沒結果的 → 不畫(巢狀只算有頁面的子孫)', 'P', { selected: 'p2a', expanded: [] }, [], { results: 'p1:proxy:completed,p2:proxy:error' }],
  ['S3', '巢狀:內層收著(只算有頁面子孫:p3n1 成功、p3n2 沒結果)→ 內層不畫;外層兩個照代顯', 'P', { selected: null, expanded: ['p3'] }, [], { results: 'p1:proxy:completed,p2:proxy:error,p3c:own:completed' }],
  ['S4', '有頁面大步驟:展開 / 收起都只畫自己的(建置 = 失敗,部署 = 成功)', 'H', { selected: 'h3', expanded: [] }, [], { results: 'h1:own:error,h2:own:completed' }],
  ['S5', '有頁面大步驟展開:自己的 + 子步驟各自的', 'H', { selected: 'h3', expanded: ['h1'] }, [], { results: 'h1:own:error,h1a:own:completed,h1b:own:error,h2:own:completed' }],
]

// summarizeStepResults 單格(代顯算法)
const SUMMARY = [
  ['Y1', [], undefined], ['Y2', ['completed', 'completed'], 'completed'], ['Y3', ['completed', undefined], undefined],
  ['Y4', ['completed', 'error'], 'error'], ['Y5', [undefined, 'error'], 'error'], ['Y6', [undefined], undefined],
]

function runTable(impl) {
  const rows = []
  for (const [code, name, tree, start, events, expect] of TABLE) {
    const got = simulate(impl, tree, start, events)
    const view = {
      selected: got.selected, expanded: got.expanded, focus: got.focus, toggles: got.toggles, outcomes: got.outcomes.join(','),
      markers: Object.entries(got.markers).map(([k, v]) => `${k}:${v}`).sort().join(','),
      results: Object.entries(got.results).map(([k, v]) => `${k}:${v}`).sort().join(','),
    }
    const bad = Object.entries(expect).filter(([k, v]) => String(view[k]) !== String(v))
    rows.push({ code, name, ok: bad.length === 0, detail: bad.map(([k, v]) => `${k}: 期望 ${v} / 實得 ${view[k]}`).join(';') })
  }
  for (const [code, input, want] of SUMMARY) {
    const got = impl.summarizeStepResults(input)
    rows.push({ code, name: `代顯算法 ${JSON.stringify(input)} → ${want ?? '不畫'}`, ok: got === want, detail: `實得 ${got}` })
  }
  return rows
}

// ── 改壞版(selftest):每一個只改一處,必須讓指定的格紅 ──
// 代顯算法的改壞版要連 stepRowResult 一起換(真的 stepRowResult 呼叫的是模組內的 summarizeStepResults,只換匯出的那支 S 格看不到)
const withSummary = (summarize) => ({
  summarizeStepResults: summarize,
  stepRowResult: (i) => {
    if (i.selectable) return { result: i.ownResult, proxy: false }
    if (!i.hasChildren || i.expanded) return { result: undefined, proxy: false }
    const result = summarize(i.descendantResults)
    return { result, proxy: result !== undefined }
  },
})
const mutants = [
  ['不擋連點', { isRepeatClick: () => false }, ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G9', 'G11', 'G13']],
  ['只看瀏覽器次數(兩下都回報第 1 下時等於沒擋)', { isRepeatClick: (p, id, at, detail) => p !== null && p.rowId === id && detail >= 2 }, ['G4', 'G5', 'G9']],
  ['只看時間、窗 300ms(VS Code 的數字)', { isRepeatClick: (p, id, at) => p !== null && p.rowId === id && at - p.at < 300 }, ['G4', 'G6']],
  ['舊的一律開合(expandOnSelect 點了就切換)', { resolveStepActivation: (i) => { const a = real.resolveStepActivation(i); return i.source === 'pointer' && i.expandOnSelect && i.hasChildren && i.selectable && a.outcome === 'go-self' ? { ...a, expand: [], toggle: true, outcome: 'toggle' } : a } }, ['D4', 'D5', 'G11']],
  ['鍵盤也開合', { resolveStepActivation: (i) => { const a = real.resolveStepActivation({ ...i, source: 'pointer' }); return i.source === 'keyboard' ? { ...a, focus: a.focus } : a } }, ['K2', 'K3', 'K6']],
  ['有頁面的大步驟也代顯灰底', { stepMarker: (i) => (i.selectable && i.hasChildren && !i.expanded && !i.isCurrent ? 'proxy' : real.stepMarker(i)) }, ['R5']],
  ['只畫全對(有失敗也不畫)', withSummary((r) => (r.length > 0 && r.every((x) => x === 'completed') ? 'completed' : undefined)), ['S2', 'Y4', 'Y5']],
  ['沒結果算成功', withSummary((r) => (r.some((x) => x === 'error') ? 'error' : r.length > 0 ? 'completed' : undefined)), ['Y3', 'Y6', 'S3']],
  ['展開時也代顯', { stepRowResult: (i) => (!i.selectable && i.hasChildren && i.expanded ? { result: real.summarizeStepResults(i.descendantResults), proxy: true } : real.stepRowResult(i)) }, ['S1']],
  ['鍵盤到第一個子步驟卻不展開', { resolveStepActivation: (i) => { const a = real.resolveStepActivation(i); return i.source === 'keyboard' && a.outcome === 'go-first-child' ? { ...a, expand: [] } : a } }, ['K1', 'K4']],
  ['焦點不跟過去', { resolveStepActivation: (i) => ({ ...real.resolveStepActivation(i), focus: null }) }, ['A1', 'A4', 'K1']],
  // 2026-10-07 複審前的寫法:被擋下的那一下焦點留在點的那一列(第二下的按下搶走的焦點沒還回去)
  ['連點後焦點留在點的那一列', { resolveStepActivation: (i) => { const a = real.resolveStepActivation(i); return a.outcome === 'guarded' ? { ...a, focus: null } : a } }, ['G1', 'G2', 'G4', 'G9']],
]

const results = runTable(real)
const failed = results.filter((r) => !r.ok)

// ── 呼叫端必須真的消費這幾支(M37:否則判定表測的是平行實作)──
const tsx = readFileSync(join(ROOT, 'packages/design-system/src/components/TreeView/tree-view.tsx'), 'utf8')
const consumption = [
  ['C1', 'tree-view.tsx 從 ./tree-step-navigation 匯入判定', /from '\.\/tree-step-navigation'/.test(tsx)],
  ['C2', 'TreeItem 的指標與鍵盤都走 resolveStepActivation', /resolveStepActivation\(\{/.test(tsx) && /activateRef\.current\('pointer'/.test(tsx) && /step\.activate\('keyboard'\)/.test(tsx)],
  ['C3', '連點走 isRepeatClick,每一下的紀錄含焦點落點(clickRowText)', /isRepeatClick\(previous, id, at, detail\) \? previous : null/.test(tsx) && /lastRowClickRef\.current = \{ rowId: id, at, focus: action\.focus \}/.test(tsx) && /clickRowText\(id, e\.detail,/.test(tsx)],
  ['C4', '列尾 / 灰底 / 沒頁面大步驟的輸入走 stepRowResult / stepMarker / pagelessStepContext', /stepRowResult\(\{/.test(tsx) && /stepMarker\(\{/.test(tsx) && /pagelessStepContext\(id,/.test(tsx)],
  ['C5', '舊的「expandOnSelect 一律開合」不在了', !/if \(expandOnSelect && hasChildren\) \{\s*toggleExpand\(id\)/.test(tsx)],
]
for (const [code, name, ok] of consumption) results.push({ code, name, ok, detail: ok ? '' : '原始碼沒有這個呼叫' })

if (SELFTEST) {
  const missed = []
  for (const [name, patch, mustFail] of mutants) {
    const impl = { ...real, ...patch }
    const red = new Set(runTable(impl).filter((r) => !r.ok).map((r) => r.code))
    const notRed = mustFail.filter((c) => !red.has(c))
    if (notRed.length) missed.push(`「${name}」沒讓 ${notRed.join(', ')} 紅(實際紅:${[...red].join(', ') || '無'})`)
    else console.log(`✓ 改壞版「${name}」→ ${mustFail.join(', ')} 紅`)
  }
  if (failed.length) { console.log(`\n✗ selftest 前提不成立:現行實作本身就有 ${failed.length} 格不符`); process.exit(1) }
  if (missed.length) { console.log(`\n✗ selftest:\n  ${missed.join('\n  ')}`); process.exit(1) }
  console.log(`\n✓ selftest:${mutants.length} 個改壞版各自讓指定的格紅了,判定表會紅`)
  process.exit(0)
}

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.code} ${r.name}${r.ok ? '' : ' | ' + r.detail}`)
const bad = results.filter((r) => !r.ok)
if (bad.length) { console.log(`\n✗ ${bad.length} 格不符`); process.exit(1) }
console.log(`\n✓ TreeView 步驟導覽判定:${TABLE.length} 個序列 + ${SUMMARY.length} 格代顯 + ${consumption.length} 條呼叫端檢查全部相符`)
process.exit(0)
