#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable / TreeView 的規格、程式註解與 story 不再出現 r1b(2026-10-21)抓到的八種「文件說的跟程式不一樣」:
 *         P1 指向 data-table.tsx / tree-view.tsx 的行號指標(DS 原始碼、ds-canonical、scripts 全掃 —— 一律改成符號指法);
 *         P2 虛擬捲動門檻寫的數字 ≠ data-table.tsx 的 VIRTUAL_THRESHOLD;P3 規格說列拖曳「無客製 live region」而程式其實渲染了 drag.liveRegion;
 *         P4 tree-view 把 indicator 寫成畫步驟結果的位置(退役說法 stepper status dot);P5 data-table.stories.tsx 在 Section 以外手抄區段標題;
 *         P6 DataTable 設計規格「無障礙與鍵盤」沒寫格內鍵盤(F2)與編輯器名稱;它指回的 data-table.spec.md「Keyboard 行為」沒有
 *            一般模式 Enter / F2 那一條(頁面寫了、規格段落沒有),或那一條指的 `cellIsTabStop` 已不在 data-table.tsx;
 *         P7 兩個元件的 story 名稱有中文字之間的機翻空格;
 *         P8 進版控的檔案指向不進版控的東西(「交付報告」、`tmp/wip-…`、invention-audit 的 decisions.json、只存在那裡的「待決題 D12」編號)。
 *   紅: 任一條命中 → 指名 file:line 與修法,exit 1;`--selftest` 用修前逐字原文做成的合成檔證明八條各在指定行紅,
 *       同時證明修後的寫法 0 筆(兩面對照,M32)。
 *   綠: 現況 0 筆時綠。純靜態(讀檔 + 正規表示式)、不讀時間、不開瀏覽器,同一份工作樹重複跑結果相同;
 *       掃到 0 個檔、讀不到 VIRTUAL_THRESHOLD、讀不到「無障礙與鍵盤」那則 story、讀不到規格「Keyboard 行為」段 = 儀器失效(exit 2),不讀成通過。
 *
 * 為什麼一支閘收八條:八條都是同一個病 —— 一件事寫在兩個住所(程式 + 文件 / 註解 / 範例),改了一邊另一邊不會紅(M17、M37 第四形狀
 * 「閘存在 ≠ 有人量」)。r1b 驗證時 14 個指向這兩支檔的行號全部過期、教學頁四個門檻數字彼此矛盾、規格把已經有的播報寫成缺口。
 * 各條的規則住所:
 *   P1 符號指法 —— `DataTable/active-editor-controller.ts` 檔頭「符號指法免行號漂移」;只收這兩支檔(全 family 最大、改最勤的兩支,
 *      r1b 實測指向它們的行號 100% 過期)。指向其他檔的行號不在本閘範圍(數百處,另題)。
 *   P2 `data-table.spec.md`「二、高度模式」→「虛擬捲動什麼時候啟用」(數字只住那一句與常數)。
 *   P3 `data-table.spec.md`「拖曳播報(已有,不是待補)」。
 *   P4 `tree-view.spec.md` 禁止事項「❌ 不得用 indicator 畫步驟結果——用 status」。
 *   P5 `data-table.stories.tsx` 檔頭「範例區段」(M17:同一段標題 markup 不准再手抄)。
 *   P6 `data-table.spec.md`「Keyboard 行為」與「試算表模式」(規格頁要指得到,不重抄按鍵細節;頁面寫的規則,指回的段落裡必須有 ——
 *      2026-10-21 r1b NEW-2 複驗缺陷 4:頁面寫「可就地編輯的格本身就是 Tab 停靠點,Enter / F2 進編輯」,規格段落 Enter / F2 只寫試算表)。
 *   P7 AGENTS.md「命名與語言一致性」(story 名稱是給人讀的中文,中文字之間不留機翻空格)。全 DS 還有 61 則同病的 story 名,屬各自的元件家族,
 *      轉交登記在待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` R1b-DT4(用本閘 P7 的正規式對全 DS 重跑即得清單);本閘只守這兩個元件(已清零)。
 *   P8 `.gitignore`「tmp/」(整個 tmp/ 不進版控,clone 下來沒有):進版控的程式 / 規格 / 閘指向它 = 死指標,與 DT-08「見 Vs*Rule stories」同一種病
 *      (2026-10-21 r1b 複驗缺陷 3:四處指向「交付報告」與只存在 tmp/ 的待決題編號)。轉交 / 待決改指待辦總帳(進版控)的列,或直接寫出題目本身。
 *
 * 用法:node scripts/data-table-tree-view-doc-invariant.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const SELF = 'scripts/data-table-tree-view-doc-invariant.mjs'
const META = 'scripts/test-data-table-tree-view-doc-invariant.mjs'

const DT = 'packages/design-system/src/components/DataTable'
const TV = 'packages/design-system/src/components/TreeView'
const FILES = {
  dataTableTsx: `${DT}/data-table.tsx`,
  dataTableSpec: `${DT}/data-table.spec.md`,
  dataTableStories: `${DT}/data-table.stories.tsx`,
  dataTableAnatomy: `${DT}/data-table.anatomy.stories.tsx`,
  treeViewTsx: `${TV}/tree-view.tsx`,
  treeViewSpec: `${TV}/tree-view.spec.md`,
}

// ── P1:行號指標 ─────────────────────────────────────────────────────────────────────────────
/** 指向這兩支檔的「檔名:行號」。`data-table.tsx#Symbol` / 「data-table.tsx 的 `Symbol`」是對的寫法,不算 */
const LINE_POINTER = /\b(data-table|tree-view)\.tsx:\d+/g
export function linePointerHits(path, text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(LINE_POINTER)) hits.push({ rule: 'P1', path, line: i + 1, found: m[0], fix: '改成符號指法(`data-table.tsx` 的 `函式名 / 常數名` 或「某段」),行號會隨每次改檔漂移' })
  })
  return hits
}

// ── P2:虛擬捲動門檻 ───────────────────────────────────────────────────────────────────────────
export function readVirtualThreshold(tsx) {
  const m = tsx.match(/const VIRTUAL_THRESHOLD = (\d+)/)
  return m ? Number(m[1]) : null
}
/** 只看講虛擬捲動 / height 的那幾行(「超過 3 層的巢狀分組」之類不相干的數字不收) */
const THRESHOLD_CONTEXT = /虛擬|virtuali[sz]|height/i
const THRESHOLD_CLAIMS = [
  /[<>≤≥]\s*(\d+)\s*筆/g, // < 50 筆、> 100 筆
  /(\d+)\s*\+\s*筆/g, // 100+ 筆
  /超過\s*(\d+)\s*筆/g, // 超過 30 筆
  /穩定超過\s*(\d+)/g, // 穩定超過 50
  /(\d+)\s*筆以內/g, // 30 筆以內
]
export function thresholdHits(path, text, threshold) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    if (!THRESHOLD_CONTEXT.test(line)) return
    for (const re of THRESHOLD_CLAIMS) {
      for (const m of line.matchAll(re)) {
        if (Number(m[1]) !== threshold) hits.push({ rule: 'P2', path, line: i + 1, found: m[0], fix: `虛擬捲動門檻是 ${threshold}(data-table.tsx VIRTUAL_THRESHOLD;data-table.spec.md「虛擬捲動什麼時候啟用」),文件只准引這一個數字` })
      }
    }
  })
  return hits
}

// ── P3:拖曳播報 ───────────────────────────────────────────────────────────────────────────────
export function liveRegionClaimHits(path, specText, tsxText) {
  if (!/\{drag\.liveRegion\}/.test(tsxText)) return []
  const hits = []
  specText.split('\n').forEach((line, i) => {
    if (/無客製 live region|落回 dnd-kit 英文預設/.test(line)) hits.push({ rule: 'P3', path, line: i + 1, found: line.trim().slice(0, 60), fix: 'data-table.tsx 已渲染 drag.liveRegion(lib/drag-announcements.ts useDragAccessibility,繁中 polite):規格不得再寫成缺口' })
  })
  return hits
}

// ── P4:退役說法 ───────────────────────────────────────────────────────────────────────────────
const RETIRED_TREE_PHRASES = [/stepper status dot/i]
export function retiredPhraseHits(path, text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    for (const re of RETIRED_TREE_PHRASES) if (re.test(line)) hits.push({ rule: 'P4', path, line: i + 1, found: line.trim().slice(0, 60), fix: '步驟結果走 status(列尾),indicator 只是 consumer 自訂的前方記號(tree-view.spec.md 禁止事項)' })
  })
  return hits
}

// ── P5:手抄區段標題 ───────────────────────────────────────────────────────────────────────────
const SECTION_HEADING = '<h3 className="text-h6 font-semibold'
export function handCopiedHeadingHits(path, text) {
  const lines = text.split('\n')
  const at = lines.flatMap((line, i) => (line.includes(SECTION_HEADING) ? [i + 1] : []))
  // 唯一合法的一份:Section 小元件自己(它的 JSX 裡用 {title})
  const own = at.filter((n) => lines[n - 1].includes('{title}'))
  return at.filter((n) => !own.includes(n)).map((n) => ({ rule: 'P5', path, line: n, found: lines[n - 1].trim().slice(0, 60), fix: '改用本檔的 <Section title note>(檔頭「範例區段」),標題 / 說明 / 間距只住一份' }))
    .concat(own.length === 1 ? [] : [{ rule: 'P5', path, line: own[0] ?? 1, found: `Section 小元件 ${own.length} 份`, fix: 'Section 小元件只准一份' }])
}

// ── P6:無障礙頁 ───────────────────────────────────────────────────────────────────────────────
export function a11yStoryText(anatomyText) {
  const start = anatomyText.indexOf("name: '無障礙與鍵盤'")
  if (start < 0) return null
  const end = anatomyText.indexOf('\n}\n', start)
  return anatomyText.slice(start, end < 0 ? undefined : end)
}
export function a11yPageHits(path, anatomyText) {
  const story = a11yStoryText(anatomyText)
  if (story == null) return null
  const missing = [['F2', '格內鍵盤(Enter / F2 進到格裡的控件、F2 / Esc 回格導覽)'], ['編輯器名稱', '格內編輯器的名字 = 欄標題']].filter(([needle]) => !story.includes(needle))
  return missing.map(([needle, what]) => ({ rule: 'P6', path, line: anatomyText.slice(0, anatomyText.indexOf("name: '無障礙與鍵盤'")).split('\n').length, found: `缺「${needle}」`, fix: `「無障礙與鍵盤」要寫${what},並指回 data-table.spec.md「Keyboard 行為」` }))
}

/** 規格「Keyboard 行為」段(到「**Focus**」為止) */
export function keyboardSectionText(specText) {
  const start = specText.indexOf('**Keyboard 行為**')
  if (start < 0) return null
  const end = specText.indexOf('\n**Focus**', start)
  return { text: specText.slice(start, end < 0 ? undefined : end), line: specText.slice(0, start).split('\n').length }
}
/** 頁面寫了一般模式「可編輯的格是 Tab 停靠點、Enter / F2 進編輯」→ 規格段落必須有那一條,而且它指的符號還在程式裡 */
export function specKeyboardHits(path, specText, tsxText) {
  const sec = keyboardSectionText(specText)
  if (sec == null) return null
  const bullet = sec.text.split('\n').find((l) => /^- Enter \/ F2\(一般模式/.test(l))
  if (!bullet || !/Tab 停靠點/.test(bullet) || !/`cellIsTabStop`/.test(bullet)) {
    return [{ rule: 'P6', path, line: sec.line, found: '「Keyboard 行為」缺一般模式 Enter / F2 那一條(可編輯格是 Tab 停靠點、Enter / F2 進編輯,指向 `cellIsTabStop`)', fix: '補那一條;「無障礙與鍵盤」頁寫的規則,它指回的段落裡必須找得到' }]
  }
  if (!/\bcellIsTabStop\b/.test(tsxText)) {
    return [{ rule: 'P6', path, line: sec.line, found: '一般模式 Enter / F2 那一條指的 `cellIsTabStop` 已不在 data-table.tsx', fix: '符號指標過期:改指現在決定「格是不是 Tab 停靠點」的那個符號' }]
  }
  return []
}

// ── P7:story 名稱的機翻空格 ───────────────────────────────────────────────────────────────────
const CJK_SPACE_CJK = /[一-鿿] [一-鿿]/
export function storyNameHits(path, text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*name:\s*'([^']*)'/)
    if (m && CJK_SPACE_CJK.test(m[1])) hits.push({ rule: 'P7', path, line: i + 1, found: m[1], fix: '中文字之間不留空格(英文、數字、符號兩側的空格照留)' })
  })
  return hits
}

// ── P8:指向不進版控的東西 ─────────────────────────────────────────────────────────────────────
const UNVERSIONED_POINTER = /交付報告|tmp\/wip-|invention-audit\/|decisions\.json|待決題 D\d+/g
export function unversionedPointerHits(path, text) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(UNVERSIONED_POINTER)) hits.push({ rule: 'P8', path, line: i + 1, found: m[0], fix: 'tmp/ 不進版控(.gitignore「tmp/」),clone 下來找不到:改指待辦總帳 governance/planning/2026-09-25-interaction-and-hover-remediation.md 的列,或直接寫出題目本身' })
  })
  return hits
}

// ── 掃描 ───────────────────────────────────────────────────────────────────────────────────────
const SCAN_ROOTS = ['packages/design-system/src', 'packages/design-system/ds-canonical', 'scripts']
const SCAN_EXT = /\.(md|ts|tsx|mjs|css|json)$/
const SKIP_DIR = new Set(['node_modules', 'test-fixtures', 'storybook-static', 'dist'])
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (SCAN_EXT.test(name)) out.push(p)
  }
  return out
}

export function analyze(files, read) {
  const hits = []
  const instrument = []
  // P1
  const scanned = files.filter((f) => f !== SELF && f !== META)
  if (scanned.length === 0) instrument.push('P1 掃到 0 個檔')
  for (const f of scanned) hits.push(...linePointerHits(f, read(f)))
  // P2
  const tsx = read(FILES.dataTableTsx)
  const threshold = readVirtualThreshold(tsx)
  if (threshold == null) instrument.push('P2 在 data-table.tsx 讀不到 VIRTUAL_THRESHOLD')
  else {
    const dtDocs = files.filter((f) => f.startsWith(`${DT}/`) && (/\.stories\.tsx$/.test(f) || /\.spec\.md$/.test(f)))
    if (dtDocs.length === 0) instrument.push('P2 掃到 0 個 DataTable story / spec')
    for (const f of dtDocs) hits.push(...thresholdHits(f, read(f), threshold))
  }
  // P3
  hits.push(...liveRegionClaimHits(FILES.dataTableSpec, read(FILES.dataTableSpec), tsx))
  // P4
  for (const f of [FILES.treeViewTsx, FILES.treeViewSpec]) hits.push(...retiredPhraseHits(f, read(f)))
  // P5
  hits.push(...handCopiedHeadingHits(FILES.dataTableStories, read(FILES.dataTableStories)))
  // P6
  const p6 = a11yPageHits(FILES.dataTableAnatomy, read(FILES.dataTableAnatomy))
  if (p6 == null) instrument.push('P6 讀不到 DataTable 設計規格「無障礙與鍵盤」那則 story')
  else hits.push(...p6)
  const p6spec = specKeyboardHits(FILES.dataTableSpec, read(FILES.dataTableSpec), tsx)
  if (p6spec == null) instrument.push('P6 讀不到 data-table.spec.md「Keyboard 行為」段')
  else hits.push(...p6spec)
  // P7
  const named = files.filter((f) => (f.startsWith(`${DT}/`) || f.startsWith(`${TV}/`)) && /\.stories\.tsx$/.test(f))
  if (named.length === 0) instrument.push('P7 掃到 0 個 story 檔')
  for (const f of named) hits.push(...storyNameHits(f, read(f)))
  // P8(與 P1 同一份檔案清單)
  for (const f of scanned) hits.push(...unversionedPointerHits(f, read(f)))
  return { hits, instrument, scanned: scanned.length, threshold }
}

// ── selftest:a6390356(修前)逐字原文 → 七條各在指定行紅;修後寫法 → 0 筆 ─────────────────────────
function selftest() {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }
  // P1
  expect(linePointerHits('x', '正解是修 wrapper(`data-table.tsx:2085` 的 `isKnownCompound` 補 `boolean`),').length === 1, 'P1 修前 focus-canonical.md:514 應紅')
  expect(linePointerHits('x', '    // (tree-view.tsx:1244-1266),不再用 `ChevronDown` 反轉').length === 1, 'P1 修前 data-table.tsx 的 tree-view 範圍指標應紅')
  expect(linePointerHits('x', '正解是修 wrapper(`data-table.tsx` 的 `isKnownCompound` 補 `boolean`),').length === 0, 'P1 符號指法應 0 筆')
  // P2(a6390356 data-table.principles.stories.tsx「虛擬捲動時機」的四句)
  const before = [
    `          title="height='auto' — 少量資料(< 50 筆),全部渲染"`,
    `          title="固定 height 數字 — 大量資料(> 100 筆),啟用 virtualization"`,
    `          title="❌ 100+ 筆資料用 height='auto'"`,
    `          <ExampleCaption warn>判斷法:資料筆數會穩定超過 50 就用固定 height</ExampleCaption>`,
  ].join('\n')
  const p2 = thresholdHits('x', before, 30).map((h) => h.line).join(',')
  expect(p2 === '1,2,3,4', `P2 修前四句應各紅一次(:1 :2 :3 :4),實得 ${p2}`)
  const after = [
    `          title="height='auto' — 少量資料(30 筆以內),全部渲染"`,
    `          title="固定 height — 超過 30 筆時自動虛擬捲動"`,
    `          <ExampleCaption warn>判斷法:資料會超過 30 筆、或筆數會隨使用者資料成長,就用固定 height</ExampleCaption>`,
    `          50 筆(超過虛擬門檻 30);捲動時被撐高的列進出視窗`,
    `        title="❌ 不用 DataTable 做超過 3 層的巢狀分組"`,
  ].join('\n')
  expect(thresholdHits('x', after, 30).length === 0, `P2 修後寫法(含資料筆數、與虛擬捲動無關的「超過 3 層」)應 0 筆,實得 ${JSON.stringify(thresholdHits('x', after, 30))}`)
  // P3
  const specBefore = '  (c) 列拖曳無客製 live region,落回 dnd-kit 英文預設字串(TreeView 有自己的,`tree-view.tsx:374-378`)。'
  expect(liveRegionClaimHits('x', specBefore, '{drag.liveRegion}').length === 1, 'P3 修前規格句應紅')
  expect(liveRegionClaimHits('x', specBefore, 'no live region here').length === 0, 'P3 程式真的沒渲染播報時,規格寫缺口是對的,應 0 筆')
  expect(liveRegionClaimHits('x', '- **拖曳播報(已有,不是待補)**:列與欄位拖曳的播報走 useDragAccessibility', '{drag.liveRegion}').length === 0, 'P3 修後寫法應 0 筆')
  // P4
  expect(retiredPhraseHits('x', '                  indicator 是 escape hatch(stepper status dot 等客製內容),消費 `<ItemPrefix>` 鎖 chevron 槽寬;').length === 1, 'P4 修前 tree-view.tsx 註解應紅')
  expect(retiredPhraseHits('x', '                  indicator = consumer 自訂的前方記號,步驟結果不走這裡(走 `status`)').length === 0, 'P4 修後註解應 0 筆')
  // P5
  const storiesBefore = [
    'const Section = ({ title }) => (',
    '    <h3 className="text-h6 font-semibold mb-[var(--layout-space-tight)]">{title}</h3>',
    ')',
    '      <div>',
    '        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">固定行高（預設）</h3>',
  ].join('\n')
  const p5 = handCopiedHeadingHits('x', storiesBefore).map((h) => h.line).join(',')
  expect(p5 === '5', `P5 修前手抄的那一行(:5)應紅、Section 自己那一行不算,實得 ${p5}`)
  expect(handCopiedHeadingHits('x', storiesBefore.split('\n').slice(0, 3).join('\n')).length === 0, 'P5 只剩 Section 一份時應 0 筆')
  // P6
  const a11yBefore = "export const Accessibility = {\n  name: '無障礙與鍵盤',\n  render: () => (<p>{\"  鍵盤  :一般表格模式下,用 Tab 進入表格後可操作排序與勾選;方向鍵在儲存格之間移動是試算表模式才開啟的功能\"}</p>),\n}\n"
  expect((a11yPageHits('x', a11yBefore) ?? []).length === 2, 'P6 修前(沒有 F2、沒有編輯器名稱)應紅兩筆')
  const a11yAfter = a11yBefore.replace('功能', '功能;連結格與開關格按 Enter / F2 焦點進到格裡的控件。\\n\\n  編輯器名稱  :以欄標題當名字')
  expect((a11yPageHits('x', a11yAfter) ?? ['x']).length === 0, 'P6 修後應 0 筆')
  expect(a11yPageHits('x', 'no story here') === null, 'P6 讀不到那則 story 應回報儀器失效(null)')
  // P6 規格段落(a6390356 的「Keyboard 行為」:Enter / F2 只寫試算表、Tab 只寫排序與勾選)
  const kbBefore = [
    '**Keyboard 行為**(目前實作 — `tableKeyboardHandler`):',
    '- Enter / F2:spreadsheet 模式下進 cell editing(cell 可編輯、且不是連結格 / 開關格時)',
    '- Tab:進入表格後操作排序與勾選',
    '',
    '**Focus**:table root `tabIndex=0`',
  ].join('\n')
  expect((specKeyboardHits('x', kbBefore, 'const cellIsTabStop = true') ?? []).length === 1, 'P6 修前規格段落(沒有一般模式那一條)應紅')
  const kbAfter = kbBefore.replace('- Tab:', '- Enter / F2(一般模式,`inlineEdit` 的可編輯格):**格本身是 Tab 停靠點**(`data-table.tsx` 的 `cellIsTabStop`),Enter / F2 進編輯\n- Tab:')
  expect((specKeyboardHits('x', kbAfter, 'const cellIsTabStop = true') ?? ['x']).length === 0, 'P6 修後規格段落應 0 筆')
  expect((specKeyboardHits('x', kbAfter, 'const somethingElse = true') ?? []).length === 1, 'P6 規格指的 cellIsTabStop 不在程式裡(符號指標過期)應紅')
  expect(specKeyboardHits('x', 'no keyboard section', '') === null, 'P6 讀不到「Keyboard 行為」段應回報儀器失效(null)')
  // P7
  expect(storyNameHits('x', "  name: '用 欄類型 自動渲染,不手寫 儲存格',\n  name: '展開 與 Select 語意分離',\n  name: '空 / 錯誤 / 載入中 的對應元件',").length === 3, 'P7 修前三則 story 名應紅')
  expect(storyNameHits('x', "  name: '用欄類型自動渲染,不手寫儲存格',\n  name: '展開與 Select 語意分離',\n  name: '空 / 錯誤 / 載入中的對應元件',\n  name: '進階篩選 — 各種狀態',").length === 0, 'P7 修後(英文 / 符號兩側的空格照留)應 0 筆')
  // P8(複驗抓到的四處原文)
  const p8Before = [
    '//   (這兩段間距是照抄前的原值;「標題 ↔ 說明」該是多少,layoutSpace.spec.md 目前沒有明文 —— 見交付報告的逐段推導表,未拍板前不改。)',
    '            代價照實記:滑鼠點過排序區後 ⌄ 會留到焦點離開(r1b DT-06 同族,交付報告)。',
    ' *      清單在 r1b datatable 交付報告;本閘只守這兩個元件(已清零)。',
    ' *  (而且「DS 只做桌機」的前提另有待決題 D12 / D18),本閘不替它決定。',
    '見 tmp/wip-2026-10-13/invention-audit/decisions/decisions.json',
  ].join('\n')
  const p8 = unversionedPointerHits('x', p8Before).map((h) => h.line).join(',')
  expect(p8 === '1,2,3,4,5,5,5', `P8 修前四處 + 一行 tmp 路徑應各紅(:1 :2 :3 :4 與 :5 三個),實得 ${p8}`)
  const p8After = [
    '//   沒講標題 ↔ 它自己的說明 —— 規範缺口,待 user 拍板,登記在待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` R1b-DT7;拍板前不改。)',
    ' *  (而且「DS 只做桌機」這個前提還有兩題等 user 決定:「lg 密度給什麼情境用」「Tooltip 規格裡的觸控理由怎麼改」),本閘不替它決定。',
    "const ESCAPE_KEY = 'Escape' // D12 不是待決題編號的寫法不算",
  ].join('\n')
  expect(unversionedPointerHits('x', p8After).length === 0, `P8 修後寫法應 0 筆,實得 ${JSON.stringify(unversionedPointerHits('x', p8After))}`)
  return problems
}

if (SELFTEST) {
  const problems = selftest()
  if (problems.length) {
    console.log(`✗ data-table-tree-view-doc selftest:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log('✓ data-table-tree-view-doc selftest:P1–P8 各自在修前原文紅、修後寫法 0 筆(兩面對照)')
  process.exit(0)
}

const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r))).map((p) => relative(ROOT, p))
const cache = new Map()
const read = (f) => { if (!cache.has(f)) cache.set(f, readFileSync(join(ROOT, f), 'utf8')); return cache.get(f) }
const { hits, instrument, scanned, threshold } = analyze(files, read)
if (instrument.length) {
  console.log(`✗ INSTRUMENT-FAIL data-table-tree-view-doc:${instrument.join(';')} —— 沒有量到,不讀成通過`)
  process.exit(2)
}
for (const h of hits) console.log(`✗ ${h.rule} ${h.path}:${h.line} 「${h.found}」\n    修法:${h.fix}`)
if (hits.length) {
  console.log(`\n✗ data-table-tree-view-doc:${hits.length} 筆(掃 ${scanned} 檔;VIRTUAL_THRESHOLD = ${threshold})`)
  process.exit(1)
}
console.log(`✓ data-table-tree-view-doc:P1–P8 0 筆(掃 ${scanned} 檔;VIRTUAL_THRESHOLD = ${threshold})`)
