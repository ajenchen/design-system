#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 表格裡每一條「一般非 frozen 欄邊界」的表頭短線,長度與垂直位置彼此完全一致;任何一條缺席或長度不同就紅。
 *         story 沒渲染完成、或渲染了卻一條可比較的線都沒量到 → 以「儀器失效」紅(INSTRUMENT-FAIL),絕不印成「全部合規」
 *   紅: 把選取欄的 dtHeaderColDivider 拿掉(缺線)、或把線高改成整格高(長度不同)→ 本閘必須指名該欄並紅;
 *       不存在的 story id / story 檔缺(同源 404)/ 等不到表頭 / 比到 0 條線 → INSTRUMENT-FAIL 點名該 story 並紅
 *   綠: 所有一般欄邊界的短線同高同位時必須綠;--selftest 以合成幾何雙向驗(缺一條 / 長一條 各一格,
 *       以及「一條都沒比到」必須判儀器失效、正常表格不得誤判)
 *
 * ── 為什麼有這支 ──
 *
 * 2026-09-24:選取欄在「有格線」的表格裡**整條欄間線都不存在**,勾選框跟第一個資料欄在視覺上
 * 併成同一個盒。實測當時全表 325 個格有格線,選取格是唯一沒有的那一個。
 *
 * **Root cause 不是漏寫一行 class,是畫線的責任掛錯地方**:
 * 規格用「這是哪一種邊界」定義線(`data-table.spec.md`「Header vs Body 的視覺區隔」),
 * 程式卻用「這裡剛好渲染了哪個元件」畫線 —— 表頭短線是 `ResizeHandle` 附帶畫的,
 * 而**選取欄是 `headerCellEl` 裡唯一有自己 early-return 分支的欄**,到不了畫線那一段
 * —— 與可不可調寬無關(進入條件是 `if (!showDivider && !isResizable) return null`,
 * 實測 `with-bulk-actions` 全部欄位不可調寬卻有 5 條線);凍結線由面板畫;
 * 列身線由 cell 自己的 class 畫,而選取欄的 render 分支在套上那個 class 之前就 early-return。
 * **三種線三個主人,選取欄三個都碰不到,於是靜默沒有線。**
 * 這是 M37:要保證的是「這是一個欄邊界」,實際判的是「這裡有沒有 ResizeHandle」。
 *
 * 同一天修這條線時我自己又踩了三次(整高 / 撐滿 / 內縮量算錯),三次都是**照抄隔壁而不是先讀規格**。
 * 所以這支閘不驗「class 有沒有寫」(那又是一個代理),直接量**渲染出來的線**:
 * 所有一般欄邊界的線必須同高、同垂直位置。缺一條 → 高度 0 → 紅;畫成整高 → 高度不同 → 紅。
 *
 * ── 2026-09-25:「沒量到」曾被印成「全部合規」(M37)──
 * 舊版用 gotoStory 等 `[data-column-id="__select__"]` 再固定睡 900ms 開 story,**丟掉回傳值**、
 * 也不驗渲染狀態:不存在的 story id 實測印「0 條線全部同高同位 … 共 0 條線全部合規」、exit 0。
 * 而且五則裡 row-actions / pinned-columns / inline-edit 根本沒有選取欄,那個 waitFor 永遠等不到 ——
 * 等於三段 20 秒的固定睡眠(整支 72 秒,其中 60 秒在等一個不存在的元素)。
 * 現在:story 一律由共用的 openStory(lib/launch-browser.mjs)開 —— Storybook 回報渲染完成、畫面健康、
 * **被量的東西(表頭格)**出現、版面連續靜止 10 個影格,並在最後一個靜止影格的同一個 task 裡量線;
 * 開不起來 → INSTRUMENT-FAIL(點名 story、列同源 404);渲染了卻沒有任何表頭列 ≥ 2 條線可比較 →
 * 同樣是 INSTRUMENT-FAIL —— 「零條被比較」永遠不是「全部合規」。
 *
 * 用法: node scripts/data-table-column-divider-invariant.mjs [--selftest] [--static=<Storybook 建置>]
 *       DT_DIVIDER_STORY=<story id> 只量那一則(預設五則)
 */
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const STATIC = resolve(ROOT, staticArg ?? 'storybook-static')
// 掃多則—— 只掃一則的覆蓋是假的。這五則涵蓋:選取欄 + 格線 + 釘選、選取欄無格線、
// 有格線無選取欄、列動作欄(合法無線的那一欄)、一則兩張表。
const STORIES = process.env.DT_DIVIDER_STORY
  ? [process.env.DT_DIVIDER_STORY]
  : [
    'design-system-components-datatable-展示--roadmap-all-in-one',
    'design-system-components-datatable-展示--with-bulk-actions',
    'design-system-components-datatable-展示--row-actions',
    'design-system-components-datatable-展示--pinned-columns',
    'design-system-components-datatable-展示--inline-edit',
  ]

/**
 * 純判定。輸入是每個「一般欄邊界」量到的線 {col, height, top}(top 相對表頭列頂)。
 * 允差 0.51px:不同來源的線一個畫在 cell 的 ::after、一個畫在 ResizeHandle 的 span,
 * 子像素捨入可能差半格;超過半個像素就是真的不一樣。
 */
export function findDividerDrift(lines, tolerance = 0.51) {
  const problems = []
  // 按表頭列分組:一則故事可能有多張表,不同表的列頂 y 當然不同。
  const rows = new Map()
  for (const l of lines) {
    if (!rows.has(l.row)) rows.set(l.row, [])
    rows.get(l.row).push(l)
  }
  for (const [rowKey, group] of rows) {
    const present = group.filter((l) => l.height > 0)
    // 選取欄是這支閘的原點:它後面還有欄位,就一定要有線。
    for (const l of group) {
      if (l.col === '__select__' && !l.isLastInRow && !(l.height > 0)) {
        problems.push({ kind: 'missing', col: l.col, row: rowKey, detail: '選取欄後面還有欄位卻沒有欄間線' })
      }
    }
    if (present.length < 2) continue
    const counts = new Map()
    for (const l of present) counts.set(l.height.toFixed(2), (counts.get(l.height.toFixed(2)) || 0) + 1)
    const baseH = Number([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
    const topCounts = new Map()
    for (const l of present) {
      if (Math.abs(l.height - baseH) > tolerance) continue
      topCounts.set(l.top.toFixed(2), (topCounts.get(l.top.toFixed(2)) || 0) + 1)
    }
    const baseTop = Number([...topCounts.entries()].sort((a, b) => b[1] - a[1])[0][0])
    for (const l of present) {
      if (Math.abs(l.height - baseH) > tolerance) {
        problems.push({ kind: 'height', col: l.col, row: rowKey, detail: `線高 ${l.height.toFixed(2)},同列基準 ${baseH.toFixed(2)}` })
      } else if (Math.abs(l.top - baseTop) > tolerance) {
        problems.push({ kind: 'position', col: l.col, row: rowKey, detail: `線頂 ${l.top.toFixed(2)},同列基準 ${baseTop.toFixed(2)}` })
      }
    }
  }
  return problems
}

/**
 * 這則故事**真的被比較到**的線數:findDividerDrift 只比「同一表頭列裡 ≥ 2 條有線」的那些列,
 * 單獨一條(例:只釘一欄的左面板)或整列沒線的列一條都沒進比較。
 * 0 = 這則故事什麼都沒比到 —— 不論是線整排消失還是偵測器認不得新的畫法,都不是「全部合規」(M37)。
 */
export function countComparedLines(lines) {
  const perRow = new Map()
  for (const l of lines) if (l.height > 0) perRow.set(l.row, (perRow.get(l.row) || 0) + 1)
  let compared = 0
  for (const n of perRow.values()) if (n >= 2) compared += n
  return compared
}

/**
 * 頁面端量測(openStory 的 probe:在最後一個靜止影格的同一個 task 裡執行)。
 * **以原始碼序列化傳入頁面,不得引用外部變數。**
 */
const MEASURE_LINES = () => {
  const headers = [...document.querySelectorAll('[role="columnheader"]')]
  const rows = new Map()
  for (const h of headers) {
    const parent = h.parentElement
    if (!rows.has(parent)) rows.set(parent, [])
    rows.get(parent).push(h)
  }
  const out = []
  let rowIndex = 0
  for (const [parent, cells] of rows) {
    // 每一列自己的頂 —— 一則故事可能有多張表,拿第一張的頂當全場基準會讓第二張整排誤紅。
    const rowTop = parent.getBoundingClientRect().top
    cells.forEach((h, i) => {
      if (h.hasAttribute('data-dt-last-col')) return
      const col = h.getAttribute('data-column-id') || '?'
      const isLastInRow = i === cells.length - 1
      const hr = h.getBoundingClientRect()
      const a = getComputedStyle(h, '::after')
      if (a.content && a.content !== 'none') {
        const hgt = parseFloat(a.height)
        if (hgt > 0) {
          out.push({ col, row: rowIndex, isLastInRow, height: hgt, top: hr.top - rowTop + (hr.height - hgt) / 2 })
          return
        }
      }
      const span = [...h.querySelectorAll('span,div')].find((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.width <= 2 && r.height > 4
      })
      if (span) {
        const r = span.getBoundingClientRect()
        out.push({ col, row: rowIndex, isLastInRow, height: r.height, top: r.top - rowTop })
      } else {
        out.push({ col, row: rowIndex, isLastInRow, height: 0, top: 0 })
      }
    })
    rowIndex += 1
  }
  return out
}

function selftest() {
  const L = (col, height, top, row = 0, isLastInRow = false) => ({ col, height, top, row, isLastInRow })
  const ok = [L('__select__', 21, 9.5), L('id', 21, 9.5), L('title', 21, 9.5)]
  const missing = [L('__select__', 0, 0), L('id', 21, 9.5), L('title', 21, 9.5)]
  const tooTall = [L('__select__', 30, 5), L('id', 21, 9.5), L('title', 21, 9.5)]
  const offset = [L('__select__', 21, 6), L('id', 21, 9.5), L('title', 21, 9.5)]
  // 誤紅對照組一:同一則故事兩張表,第二張的列頂當然不同—— 不得報錯。
  const twoTables = [
    L('sku', 21, 9, 0), L('name', 21, 9, 0),
    L('sku', 21, 379.6, 1), L('name', 21, 379.6, 1),
  ]
  // 誤紅對照組二:列動作欄前面那一欄合法沒有線—— 不得報錯。
  const legitNoLine = [L('sku', 21, 9), L('name', 21, 9), L('updatedAt', 0, 0)]
  const cases = [
    ['所有一般欄邊界同高同位 → 必須綠', ok, 0, null],
    ['選取欄整條線缺席(2026-09-24 實況)→ 必須指名它並紅', missing, 1, '__select__'],
    ['選取欄畫成整格高(我第一次修錯的樣子)→ 必須紅', tooTall, 1, '__select__'],
    ['高度對但垂直位置差(撐滿造成的偏移)→ 必須紅', offset, 1, '__select__'],
    ['一則故事兩張表,列頂不同 → **不得誤紅**(第一版就是這樣紅的)', twoTables, 0, null],
    ['列動作欄前一欄合法無線 → **不得誤紅**(第一版就是這樣紅的)', legitNoLine, 0, null],
  ]
  let failed = 0
  for (const [name, input, expected, mustName] of cases) {
    const got = findDividerDrift(input)
    const pass = got.length === expected && (!mustName || got.some((g) => g.col === mustName))
    if (pass) console.log(`  ✓ ${name}`)
    else { failed += 1; console.error(`  ✗ ${name} — 實得 ${got.length} 筆: ${JSON.stringify(got)}`) }
  }
  // 「比到幾條」的兩面:0 條必須被認出來(主流程據此判儀器失效),正常表格不得被誤判成 0。
  // 舊版就是在「0 條」這一格上印「共 0 條線全部合規」、exit 0(不存在的 story id 實測)。
  const onlySingles = [L('sku', 21, 9, 0), L('name', 21, 9, 1)] // 每列各一條(只釘一欄的左面板 × 兩張表):沒有任何一條進得了比較
  const allGone = [L('sku', 0, 0), L('name', 0, 0), L('price', 0, 0)] // 無選取欄的表格線整排消失:findDividerDrift 看不到任何問題
  const compareCases = [
    ['一條線都沒量到(story 沒渲染 / 偵測器瞎了)→ 比到 0 條(主流程判儀器失效,不是全部合規)', [], 0],
    ['無選取欄的表格線整排消失 → 比到 0 條(漂移判定本身零問題,這一格是它唯一的訊號)', allGone, 0],
    ['每列只有一條線 → 比到 0 條(單獨一條沒有東西可比)', onlySingles, 0],
    ['正常表格 → 比到 3 條(不得被誤判成沒量到)', ok, 3],
    ['列動作欄前一欄合法無線 → 比到 2 條(不得被誤判成沒量到)', legitNoLine, 2],
    ['一則兩張表 → 比到 4 條', twoTables, 4],
  ]
  for (const [name, input, expected] of compareCases) {
    const got = countComparedLines(input)
    // 0 條那幾格同時確認漂移判定對它們回「零問題」—— 證明「比到 0 條」是這種情況唯一的訊號,不是重複防線
    const pass = got === expected && (expected !== 0 || findDividerDrift(input).length === 0)
    if (pass) console.log(`  ✓ ${name}`)
    else { failed += 1; console.error(`  ✗ ${name} — 實得比到 ${got} 條(預期 ${expected})`) }
  }
  if (failed) { console.error(`\nselftest 失敗 ${failed} 格`); process.exit(1) }
  console.log('\nselftest 全過(綠側、三種紅側、兩種誤紅對照組,以及「一條都沒比到 ≠ 合規」的兩面都驗到)')
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  // 瀏覽器相關一律延後載入:--selftest 是純函式,不需要 Playwright。
  const { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireStorybookBuild, StoryRenderInstrumentError } = await import('./lib/launch-browser.mjs')
  // 缺前置 ≠ 產品壞了:gate-meta lane 的拋棄式快照裡沒有 storybook-static → MISSING-BUILD(略過),不是「現況紅」。
  requireStorybookBuild(join(STATIC, 'iframe.html'))
  // 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
  // 五則故事共用同一台伺服器 = 同一份快照(原本每則各起一台、各讀活目錄,五則可能量到不同的建置)。
  const { startA11yStaticServer } = await import('./lib/a11y-static-server.mjs')
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
  let total = 0
  let failed = 0
  /** 沒量到的故事:儀器失效,不是產品裁決,也絕不算通過 */
  const instrumentFails = []
  // 一個瀏覽器、一個分頁依序開五則(--single-process 下多 context / 多分頁不穩;openStory 已處理換頁時上一則的殘留請求)
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    for (const story of STORIES) {
      const label = story.split('--').pop()
      let lines
      try {
        // 等**被量的東西**:表頭格(五則都有;舊版等選取欄,三則沒有選取欄 → 每則白等 20 秒)。
        // 欄寬在渲染完成後還會分配幾個影格 → 連續靜止 10 個影格,並在同一個 task 裡量線(probe)。
        const opened = await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(story)}&viewMode=story`, {
          waitFor: '[role="columnheader"]', settleFrames: 10, probe: MEASURE_LINES, notFound: server.notFound,
        })
        lines = opened.probe
      } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        console.error(`  ✗ ${label}:${error.message}`)
        instrumentFails.push({ story, detail: error.detail })
        continue
      }
      const problems = findDividerDrift(lines)
      const compared = countComparedLines(lines)
      const present = lines.filter((l) => l.height > 0)
      if (compared === 0) {
        // 渲染完成、表頭也在,卻沒有任何一列 ≥ 2 條線可比較:findDividerDrift 對它回「零問題」,
        // 舊版就把這種情況印成「全部合規」。這裡不裁決它是產品還是量具的錯,只拒絕把它當成通過。
        console.error(`  ✗ ${label}:${INSTRUMENT_FAIL_MARKER} story「${story}」渲染完成,但一條可比較的表頭欄間線都沒量到`
          + `(${lines.length} 個欄邊界、有線 ${present.length} 條,沒有任何表頭列 ≥ 2 條)。`
          + '這是儀器失效(沒量到),不是產品裁決,也絕不算合規 —— 可能是線整排消失,也可能是偵測器認不得新的畫法,兩者都要人看')
        console.error(`      量到的全部: ${JSON.stringify(lines)}`)
        instrumentFails.push({ story, detail: `比到 0 條線(${lines.length} 個欄邊界、有線 ${present.length} 條)` })
      }
      if (!problems.length) {
        if (compared > 0) {
          console.log(`  ✓ ${label}: ${present.length} 條線全部同高同位(同列比較 ${compared} 條)`)
          total += present.length
        }
        continue
      }
      failed += 1
      console.error(`  ✗ ${label}:`)
      for (const p of problems) console.error(`      [${p.kind}] ${p.col ?? ''} ${p.detail}`)
      console.error(`      量到的全部: ${JSON.stringify(lines)}`)
    }
  } finally {
    await browser.close()
    await server.stop()
  }
  if (instrumentFails.length) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length}/${STORIES.length} 則故事沒量到 —— 不是產品裁決,但這次不能宣稱表頭欄間線合規:`)
    for (const f of instrumentFails) console.error(`  · ${f.story}:${f.detail}`)
  }
  if (!failed && !instrumentFails.length) {
    console.log(`\n表頭欄間線一致性: ${STORIES.length} 則故事、共 ${total} 條線全部合規`)
    process.exit(0)
  }
  if (failed) {
    console.error('\n規格 `data-table.spec.md`「Header vs Body 的視覺區隔」要求一般非 frozen 欄邊界是同一種短線。')
    console.error('表頭短線由 `ResizeHandle` 附帶畫,而系統欄(選取 / 拖拉 / 列動作)不渲染它 ——')
    console.error('這正是 2026-09-24 選取欄整條線消失的根因。系統欄要自己掛 `dtHeaderColDivider`。')
  }
  process.exit(1)
}
