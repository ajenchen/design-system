#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 說明頁(設計原則頁、展示頁、設計規格頁)**每一個**標題區 —— 建置裡全部 story 逐則開、不抽樣 —— 「標題底下幾塊」的判定:
 *         A1 一般密度(md)與大密度(lg)判得一樣。依據 packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md:133
 *            「『一格版面間距』的門檻是固定值、不跟密度走」與 :143「兩塊以上 → loose(md、lg 相同)」;:126 記 user 2026-11-12 採的選項頁上寫
 *            「兩種密度結果一致」(user 逐字見 :124)。「幾塊怎麼數」本身是【AI 推導】(:127),只住在產品 tutorial-page.tsx `headingContentOf`,本閘不抄。
 *         A2 頁面第一次畫出來時標的 = 版面穩定後產品自己再判一次的。【AI 推導】—— 規格沒有逐字寫這句;依據是產品每次 render 後重判的設計
 *            (stories-helpers/examples/tutorial-page.tsx `useHeadingContent` 的註解「每次 render 後…重判」):畫面上的距離不會因為任何一次重畫而跳動。
 *         A3 判定 → 距離:每個看得到、後面有內容的標題區,重判後「標題區底 → 內容頂」= 一塊 / 段落 tight、兩塊以上 loose(容許 0.6px;
 *            layoutSpace.spec.md:121)。**A3 2026-11-14 起計入紅綠**(檔內 GAP_CHECK_COUNTS = true):之前不計入,因為 Pagination 設計規格三則
 *            會紅;那三則與 tutorial-page.tsx 的數法同一批修好、重建後全站 --enforce-gap 0 筆,才打開。改回 false 時照樣量、照樣印(標「未計入紅綠」)。
 *         量法(scripts/lib/doc-heading-zones.mjs,section-gap 共用):每則 story 開 md 取「首次」標記 → 把標記全部打亂成 pending、送 Storybook
 *         `forceReRender`,等產品自己把每個標記寫回(頁面上沒有 pending)再等版面靜止 → 「重判」;有標題區的再開 lg 做同一件事。
 *         為什麼要重判:Storybook 把密度寫到 <html> 晚於標題判定(packages/storybook-config/preview.tsx 的 useEffect),用 lg 開頁時首次判定
 *         用的仍是一般密度的版面 —— 只比首次標記,A1 要抓的那種錯一個也看不到(--selftest 對照組 α 兩面都印)。
 *   紅: A1 / A2(A3 打開後也算)任一個標題區不符 → 逐個指名 story、共用元件、標題字、兩邊的判定(或量到的距離與應有值),exit 1。
 *       量不到 = 儀器失效(印 INSTRUMENT-FAIL、exit 2;不是產品裁決,也不算通過):index.json 0 則、任一則開不起來 / 沒輪到、找不到 Storybook
 *       channel、重畫後還有 pending(點名)、等不到靜止、重畫後出現錯誤頁、同一則 md 與 lg(或首次與重判)的標題區對不上、讀不到 loose / tight、
 *       兩種密度讀到同一個 loose(密度沒套上);完整掃描(沒有 --limit)時有判定的標題區 0 個、H3 / Desc / ExampleSection / TutorialRule 任一種 0 個、
 *       一塊 / 兩塊以上任一種 0 個。
 *       --selftest(同一支量法、同一個判定函式):判定表(不開瀏覽器);真頁面 Avatar 設計原則「使用指引」—— 現況三條全綠(前提);
 *       α 文件一開始就把一般密度的 tight 改成 8px → 紅的集合必須正好是 A1「Avatar 代表身份…」md one / lg many + A2 lg「Avatar 代表身份…」首次 one / 重判 many,
 *       同時印「只比首次標記:md one / lg one(看不到)」當量法的兩面對照;β 首次量完才把兩種密度的 tight 都改成 8px → 正好 A2 md、lg 各一筆
 *       「Avatar 代表身份…」首次 many / 重判 one,A1 必綠;γ 重判之後把每個 ExampleSection 的內容下推 4px → 正好那一頁每個有內容的標題區 A3 紅、
 *       數字正好多 4,A1 / A2 必綠;channel 的 emit 換成空函式 → 重判丟儀器失效;不存在的 story → 儀器失效;假建置子行程 → 結束碼 2 + 標記;
 *       經符號連結叫自己、給不存在的建置 → 缺建置標記 + 結束碼 2(「是不是被直接執行」比真實路徑,lib/direct-run.mjs;只比字串時這裡 0 行、exit 0)。
 *   綠: 全部 story 量完,A1 / A2 零筆、沒有儀器失效 → exit 0(A3 打開後也要零筆)。同一份建置重複跑結果恆等(無取樣、無時鐘、
 *       只等被量的東西本身與版面靜止,不睡固定毫秒)。
 *
 * Run: node scripts/doc-heading-inventory-invariant.mjs [--limit=N] [--concurrency=4] [--dump=<檔>] [--enforce-gap] [--static=<dir>] [--selftest]
 *   --concurrency  同時開幾個**瀏覽器**(每個瀏覽器一個分頁;沙箱下 Chromium 是 --single-process,見 story-demo-focus-invariant.mjs runScan 的註解)
 *   --dump         把每個標題區(story、共用元件、標題字、md / lg 的首次與重判、量到的距離、應有值)寫成 JSON —— 給工程比對「改前改後哪些標題翻面」用
 *   --enforce-gap  這一次把 A3 計入紅綠(GAP_CHECK_COUNTS = false 時打開之前先驗用;2026-11-14 起它是 true,這個旗標沒有額外作用)
 *   --static       指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛(呼叫端自己說明那是哪一份建置)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { isDirectRun, missingBuildViaSymlinkControl } from './lib/direct-run.mjs'
import { printSelftestLine } from './lib/gate-selftest-meta.mjs'
import {
  BROWSER_REQUIRED_MARKER, INSTRUMENT_FAIL_MARKER, SKIPPED_ENV_MARKER,
  launchBrowser, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, requireStorybookBuild, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import {
  DOC_HEADING_GAP_TOL_PX, DOC_HEADING_SETTLE_FRAMES, HEADING_ZONE_SELECTOR,
  describeHeadingZone, expectedHeadingGap, headingZoneKey, listHeadingZonesAfterSettle, listHeadingZonesInPage, rejudgeHeadingZones,
} from './lib/doc-heading-zones.mjs'

const GATE_NAME = 'doc-heading-inventory'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const SELFTEST = ARGS.includes('--selftest')
const argValue = (name) => ARGS.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
const LIMIT = Number(argValue('--limit') ?? 0) || 0
const CONCURRENCY = Math.max(1, Number(argValue('--concurrency') ?? 4) || 4)
const DUMP = argValue('--dump')
const STATIC_ARG = argValue('--static')
const STATIC = path.resolve(STATIC_ARG ?? path.join(REPO, 'storybook-static'))
const VIEWPORT = { width: 1280, height: 900 }
const DENSITIES = ['md', 'lg']
/** 開一則 story 的上限(只是「等不到」的天花板)。 */
const DOC_HEADING_OPEN_TIMEOUT_MS = 45_000

/**
 * A3(判定 → 距離)要不要計入紅綠。**2026-11-14 起 true,Pagination 三則與數法已修**:之前是 false,因為 Pagination 設計規格三則
 * (inspector / color-matrix / state-behavior)把 <Desc> 放進 flex 容器當第一個子節點,說明自己的下方距離跟容器的 gap 相加(md 24 / 40 / 36、
 * lg 28 / 48 / 40)會紅。那三則把 Desc 移到容器外、tutorial-page.tsx 量最小距離改成只量扣掉說明文字之後的那幾塊,重建後全站 `--enforce-gap`
 * A1 / A2 / A3 / 儀器失效都是 0(改前改後 --dump 比對:判定翻面正好 FileViewer 設計規格「互動預覽」一個、距離變了正好 Pagination 那三則)。
 */
const GAP_CHECK_COUNTS = true
const ENFORCE_GAP = GAP_CHECK_COUNTS || ARGS.includes('--enforce-gap')

/** 新鮮度守衛:全站掃描 = 全部 story 與它們用的元件 + 決定密度怎麼套的預覽層。 */
const FRESH_SOURCES = ['packages/design-system/src', 'packages/storybook-config/preview.tsx']

const storyUrl = (origin, id, density) => `${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`

// selftest 的正常輸出經過 printSelftestLine(含機讀標記字樣 → 丟例外);主跑照常印
const out = SELFTEST ? printSelftestLine : (line) => console.log(line)

// ═══════════════════════════════════════════════════════════════════════════
// 判定(純函式;主跑與 --selftest 共用)
// ═══════════════════════════════════════════════════════════════════════════

/** 共用元件的家族(地板用):後面緊接 Desc 的 H3 與單獨的 Desc 都算「Desc」。 */
const familyOf = (kind) => (kind === 'h3+desc' ? 'desc' : kind)
const FAMILIES = ['h3', 'desc', 'es', 'rule']

/**
 * @param {Array<{ id: string, md?: { first: object[], rejudged: object[] }, lg?: { first: object[], rejudged: object[] } }>} stories
 *   只放「md 有標題區」的 story(主跑:md 那一趟 0 個標題區的 story 不進來)
 * @param {{ full?: boolean, enforceGap?: boolean }} [options] full = 完整掃描(才檢查地板)
 * @returns {{ findings: { A1: object[], A2: object[], A3: object[] }, instrument: string[], counts: object, enforceGap: boolean }}
 */
export function judgeInventory(stories, { full = false, enforceGap = false } = {}) {
  const findings = { A1: [], A2: [], A3: [] }
  const instrument = []
  const counts = { stories: stories.length, zones: 0, judged: 0, byFamily: Object.fromEntries(FAMILIES.map((f) => [f, 0])), byMark: { one: 0, many: 0 }, gaps: 0 }
  const aligned = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((z, i) => headingZoneKey(z) === headingZoneKey(b[i]))
  for (const s of stories) {
    if (!s.md || !s.lg) { instrument.push(`${s.id}:缺 ${s.md ? 'lg' : 'md'} 那一趟的量測 —— 比不了兩種密度`); continue }
    let comparable = true
    for (const d of DENSITIES) {
      const m = s[d]
      if (!aligned(m.first, m.rejudged)) { instrument.push(`${s.id} @${d}:首次與重判的標題區對不上(首次 ${m.first?.length} 個、重判 ${m.rejudged?.length} 個)—— 比不了`); comparable = false }
      const stuck = (m.rejudged ?? []).filter((z) => z.mark === 'pending')
      if (stuck.length) { instrument.push(`${s.id} @${d}:重判後還有 ${stuck.length} 個標題區停在 pending(${stuck.slice(0, 3).map(describeHeadingZone).join('、')})—— 產品沒有重判`); comparable = false }
    }
    if (!aligned(s.md.rejudged, s.lg.rejudged)) { instrument.push(`${s.id}:md 與 lg 的標題區對不上(md ${s.md.rejudged?.length} 個、lg ${s.lg.rejudged?.length} 個,或共用元件 / 標題字不同)—— 比不了`); comparable = false }
    if (!comparable) continue
    // 密度有沒有套上:兩種密度讀到同一個 loose = 沒套上(不讀成通過)
    const [mdFirst, lgFirst] = [s.md.rejudged[0], s.lg.rejudged[0]]
    if (mdFirst && lgFirst && mdFirst.loose === lgFirst.loose) instrument.push(`${s.id}:兩種密度讀到同一個 --layout-space-loose(${mdFirst.loose})—— 密度沒套上`)
    s.md.rejudged.forEach((z, i) => {
      counts.zones += 1
      if (z.mark === 'one' || z.mark === 'many') { counts.judged += 1; counts.byMark[z.mark] += 1; counts.byFamily[familyOf(z.kind)] += 1 }
      const lgMark = s.lg.rejudged[i].mark
      if (z.mark !== lgMark) findings.A1.push({ check: 'A1', story: s.id, zone: z, md: z.mark, lg: lgMark })
    })
    for (const d of DENSITIES) {
      s[d].first.forEach((z, i) => {
        const r = s[d].rejudged[i]
        if (z.mark !== r.mark) findings.A2.push({ check: 'A2', story: s.id, density: d, zone: r, first: z.mark, rejudged: r.mark })
      })
      for (const z of s[d].rejudged) {
        const exp = expectedHeadingGap(z)
        if (!exp) continue
        if (exp.unjudged) { findings.A3.push({ check: 'A3', story: s.id, density: d, zone: z, unjudged: true }); continue }
        if (!(exp.px > 0)) { instrument.push(`${s.id} @${d} ${describeHeadingZone(z)}:讀不到 --layout-space-${exp.token}(${exp.px})`); continue }
        if (!Number.isFinite(z.gap)) { instrument.push(`${s.id} @${d} ${describeHeadingZone(z)}:看得到、後面有內容,卻量不到距離(${z.gap})`); continue }
        counts.gaps += 1
        if (Math.abs(z.gap - exp.px) > DOC_HEADING_GAP_TOL_PX) findings.A3.push({ check: 'A3', story: s.id, density: d, zone: z, gap: z.gap, expected: exp.px, token: exp.token })
      }
    }
  }
  if (full) {
    if (counts.judged === 0) instrument.push('完整掃描卻沒有任何一個有判定的標題區 —— 量具沒量到東西(選擇器 / 標記名換了?),不當綠燈')
    for (const f of FAMILIES) if (counts.byFamily[f] === 0) instrument.push(`完整掃描卻沒有任何一個有判定的「${f}」標題區 —— 那一種共用元件整個沒量到,不當綠燈`)
    for (const m of ['one', 'many']) if (counts.byMark[m] === 0) instrument.push(`完整掃描卻沒有任何一個判成「${m}」的標題區 —— 判定的一半整個沒出現,不當綠燈`)
  }
  return { findings, instrument, counts, enforceGap }
}

/** 判定 → 結論:'instrument'(有任何量不到)> 'red'(A1 / A2,A3 計入時也算)> 'green'。 */
export function verdictOf(result) {
  if (result.instrument.length) return 'instrument'
  const counted = result.findings.A1.length + result.findings.A2.length + (result.enforceGap ? result.findings.A3.length : 0)
  return counted ? 'red' : 'green'
}

/** 一筆不符的人話(主跑與 selftest 印的是同一份)。 */
export function describeFinding(f) {
  const z = describeHeadingZone(f.zone)
  if (f.check === 'A1') return `[A1] ${f.story} ${z} 兩種密度判定不同:md ${f.md ?? '(無)'} / lg ${f.lg ?? '(無)'}`
  if (f.check === 'A2') return `[A2] ${f.story} @${f.density} ${z} 首次 ${f.first ?? '(無)'} / 重判 ${f.rejudged ?? '(無)'}`
  if (f.unjudged) return `[A3] ${f.story} @${f.density} ${z} 區塊模式、後面有內容,卻沒有判定(產品該標 one / many 沒標)`
  return `[A3] ${f.story} @${f.density} ${z} 標題區底 → 內容頂 = ${f.gap}px,應 ${f.expected}(${f.token};判定 ${f.zone.mark ?? '段落'})`
}

/** 紅的集合的身分(selftest 比「紅的集合 = 期望的集合」用)。 */
export const findingKey = (f) => `${f.check}|${f.story}|${f.density ?? '*'}|${f.zone.title}`

// ═══════════════════════════════════════════════════════════════════════════
// 量測(主跑與 --selftest 共用)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 一則 story、一種密度:首次標記 → (afterFirst)→ 請產品重判 → (afterRejudge → 等靜止再列一次)。
 * 0 個標題區 → { first: [], rejudged: [] }(不重判)。量不到 = 丟 StoryRenderInstrumentError。
 */
async function measureStory(page, server, id, density, { afterFirst = null, afterRejudge = null } = {}) {
  const label = `${id} @${density}`
  const { probe: first } = await openStory(page, storyUrl(server.origin, id, density), {
    settleFrames: DOC_HEADING_SETTLE_FRAMES, probe: listHeadingZonesInPage, probeArg: { selector: HEADING_ZONE_SELECTOR },
    notFound: server.notFound, timeoutMs: DOC_HEADING_OPEN_TIMEOUT_MS, label,
  })
  if (!Array.isArray(first)) throw new StoryRenderInstrumentError({ storyId: label, url: page.url(), kind: 'heading-rerender', reason: `列標題區的頁面函式沒有回清單(得 ${typeof first})` })
  if (first.length === 0) return { first, rejudged: [] }
  if (afterFirst) await afterFirst(page)
  let rejudged = await rejudgeHeadingZones(page, { label })
  if (afterRejudge) { await afterRejudge(page); rejudged = await listHeadingZonesAfterSettle(page, { label }) }
  return { first, rejudged }
}

/** 一個 Playwright 例外 → 儀器失效的一行(帶標記;StoryRenderInstrumentError 自己的訊息已帶)。 */
const instrumentLine = (id, error) => {
  const message = String(error?.message ?? error).split('\n')[0]
  return message.includes(INSTRUMENT_FAIL_MARKER) ? message : `${INSTRUMENT_FAIL_MARKER} story「${id}」沒有量到 —— ${message.slice(0, 240)}`
}

async function runScan(firstBrowser, server) {
  const index = readServedStorybookIndex(server)
  let ids = Object.values(index.entries ?? {}).filter((e) => e.type === 'story').map((e) => e.id)
  if (LIMIT) ids = ids.slice(0, LIMIT)
  if (ids.length === 0) return { instrument: [`${INSTRUMENT_FAIL_MARKER}:建置的 index.json 裡沒有任何 story —— 儀器失效,不當綠燈`] }
  const browsers = [firstBrowser]
  for (let k = 1; k < CONCURRENCY; k++) {
    try { browsers.push(await launchBrowser()) } catch (error) {
      console.log(`  · 第 ${k + 1} 個瀏覽器起不來(${String(error?.message || error).split('\n')[0]}),以 ${browsers.length} 個 worker 繼續`)
      break
    }
  }
  const pages = []
  for (const b of browsers) {
    try { pages.push(await b.newPage({ viewport: VIEWPORT })) } catch (error) {
      console.log(`  · 有一個瀏覽器開不了分頁(${String(error?.message || error).split('\n')[0]}),少一個 worker`)
    }
  }
  const t0 = Date.now()
  const records = new Map()
  const failed = []
  const pass = async (density, list) => {
    const queue = list.slice()
    let done = 0
    let measured = 0
    const worker = async (page) => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const r = await measureStory(page, server, id, density)
          measured += 1
          if (density === 'md') { if (r.first.length) records.set(id, { id, md: r }) } else records.get(id).lg = r
        } catch (error) {
          failed.push(instrumentLine(`${id} @${density}`, error))
          if (page.isClosed() || !page.context().browser()?.isConnected()) break
        }
        done += 1
        if (done % 100 === 0) console.log(`  … ${density} ${done}/${list.length}(${Math.round((Date.now() - t0) / 1000)} 秒)`)
      }
    }
    await Promise.all(pages.map(worker))
    return { measured, total: list.length }
  }
  try {
    const md = await pass('md', ids)
    const lg = await pass('lg', [...records.keys()])
    const instrument = [...failed]
    for (const [density, p] of [['md', md], ['lg', lg]]) {
      const unmeasured = p.total - p.measured - failed.filter((line) => line.includes(` @${density}`)).length
      if (unmeasured > 0) instrument.push(`${INSTRUMENT_FAIL_MARKER}:${density} 那一趟有 ${unmeasured} 則沒輪到(worker 掛了)—— 儀器失效`)
    }
    console.log(`掃了 ${ids.length} 則(${pages.length} 個瀏覽器,${Math.round((Date.now() - t0) / 1000)} 秒):有標題區 ${records.size} 則;md 量到 ${md.measured}、lg 量到 ${lg.measured};儀器失效 ${failed.length}`)
    return { stories: [...records.values()], instrument, total: ids.length }
  } finally {
    await Promise.all(browsers.slice(1).map((b) => b.close().catch(() => {})))
  }
}

function writeDump(file, stories) {
  const rows = []
  for (const s of stories) {
    (s.md?.rejudged ?? []).forEach((z, i) => {
      const lg = s.lg?.rejudged?.[i]
      const side = (d, r, first) => {
        const exp = r ? expectedHeadingGap(r) : null
        return { first: first?.mark ?? null, mark: r?.mark ?? null, gap: r?.gap ?? null, expected: exp && !exp.unjudged ? exp.px : null, expectedToken: exp?.token ?? null }
      }
      rows.push({
        story: s.id, kind: z.kind, title: z.title, mode: z.mode, hasContent: z.hasContent, visible: z.visible,
        verdict: z.mark === 'many' ? '兩塊以上' : z.mark === 'one' ? '一塊' : '(段落 / 不判)',
        md: side('md', z, s.md.first[i]), lg: side('lg', lg, s.lg?.first?.[i]),
      })
    })
  }
  writeFileSync(file, `${JSON.stringify({ gate: GATE_NAME, stories: stories.length, zones: rows.length, rows }, null, 1)}\n`)
  console.log(`寫出 ${file}(${rows.length} 個標題區)`)
}

function printResult(result, { prefix = '' } = {}) {
  const { findings, instrument, counts } = result
  for (const f of [...findings.A1, ...findings.A2]) console.log(`✗ ${prefix}${describeFinding(f)}`)
  for (const f of findings.A3) console.log(`${result.enforceGap ? '✗' : '·'} ${prefix}${describeFinding(f)}${result.enforceGap ? '' : '(A3 未計入紅綠)'}`)
  for (const line of instrument) console.log(`✗ ${line.includes(INSTRUMENT_FAIL_MARKER) ? '' : `${INSTRUMENT_FAIL_MARKER}:`}${line}`)
  console.log(`${prefix}標題區 ${counts.zones} 個(有判定 ${counts.judged}:H3 ${counts.byFamily.h3} / Desc ${counts.byFamily.desc} / ExampleSection ${counts.byFamily.es} / TutorialRule ${counts.byFamily.rule};一塊 ${counts.byMark.one} / 兩塊以上 ${counts.byMark.many});量了 ${counts.gaps} 段距離 × 密度`)
  console.log(`${prefix}A1 兩種密度不同 ${findings.A1.length} / A2 首次 ≠ 重判 ${findings.A2.length} / A3 判定 → 距離不符 ${findings.A3.length}${result.enforceGap ? '' : '(未計入紅綠)'} / 儀器失效 ${instrument.length}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// --selftest
// ═══════════════════════════════════════════════════════════════════════════

const CONTROL_STORY = 'design-system-components-avatar-設計原則--usage-guidance'
/**
 * 對照組 α、β 指名的那個標題:Avatar 設計原則「Avatar 代表身份,Icon 代表概念」—— 底下是一個只負責排版的容器,裡面兩塊(有框的選單、一排圖例)
 * 彼此隔 --layout-space-tight、中間沒有說明文字,所以「兩塊以上」只靠 tight ≥ 門檻 12 成立,tight 改成 8 就翻成一塊。
 * 2026-11-14 前是 Chip 設計原則「互斥單選…」(兩則示範各帶一段說明):tutorial-page.tsx `headingContentOf` 改成只量扣掉說明文字之後的那幾塊以後,
 * 那兩則示範之間夾著說明文字,塊與塊的距離不再跟 tight 一起變 → α / β 打不到它(該紅沒紅)。換之前用 α 的注入跑過 --limit=400:
 * 修後仍會翻面的只剩這一則與 DataTable 展示「分頁」的兩個 ExampleSection。
 */
const CONTROL_TITLE = 'Avatar 代表身份'
const ALPHA_CSS = 'html:not([data-density="lg"]) { --layout-space-tight: 8px !important; }'
const BETA_CSS = 'html { --layout-space-tight: 8px !important; }'
const GAMMA_PUSH_PX = 4
const GAMMA_CSS = `[data-example-section] > :nth-child(2) { margin-top: ${GAMMA_PUSH_PX}px !important; }`

function judgeTable() {
  const failures = []
  let rows = 0
  const check = (cond, msg) => { rows += 1; if (!cond) failures.push(msg) }
  const zone = (title, mark, { kind = 'rule', mode = 'block', gap, loose = 16, tight = 12, hasContent = true, visible = true } = {}) => ({
    kind, title, mark, mode, loose, tight, hasContent, visible, gap: gap === undefined ? (mark === 'many' ? loose : tight) : gap,
  })
  const lgOf = (z) => ({ ...z, loose: 24, tight: 16, gap: z.gap === null ? null : (z.mark === 'many' ? 24 : 16) })
  const story = (id, mdZones, { lgZones = mdZones.map(lgOf), mdFirst = mdZones, lgFirst = lgZones } = {}) => ({ id, md: { first: mdFirst, rejudged: mdZones }, lg: { first: lgFirst, rejudged: lgZones } })
  const clean = [story('s1', [zone('甲', 'one'), zone('乙', 'many'), zone('段落', null, { mode: 'paragraph' }), zone('沒有內容', null, { hasContent: false, gap: null })])]
  const keys = (r) => [...r.findings.A1, ...r.findings.A2, ...r.findings.A3].map(findingKey).sort()
  const r0 = judgeInventory(clean)
  check(verdictOf(r0) === 'green' && keys(r0).length === 0 && r0.instrument.length === 0, `乾淨的 → 綠、0 筆(實得 ${verdictOf(r0)}、${JSON.stringify(keys(r0))}、${JSON.stringify(r0.instrument)})`)
  // A1:md one / lg many → 只紅 A1(那一個)
  const a1 = judgeInventory([story('s1', [zone('甲', 'one')], { lgZones: [lgOf(zone('甲', 'many'))] })])
  check(JSON.stringify(keys(a1)) === JSON.stringify(['A1|s1|*|甲']) && verdictOf(a1) === 'red', `兩種密度判定不同 → 只紅 A1「甲」(實得 ${JSON.stringify(keys(a1))})`)
  // A2:md 首次 many / 重判 one(lg 首次重判都 one)→ 只紅 A2 md;A1 綠
  const a2 = judgeInventory([story('s1', [zone('甲', 'one')], { mdFirst: [zone('甲', 'many')] })])
  check(JSON.stringify(keys(a2)) === JSON.stringify(['A2|s1|md|甲']) && verdictOf(a2) === 'red', `首次 ≠ 重判 → 只紅 A2 md「甲」(實得 ${JSON.stringify(keys(a2))})`)
  // A3:距離多 4 → 只紅 A3;不計入時結論綠、計入時紅
  const off = [story('s1', [zone('甲', 'one', { gap: 16 })], { lgZones: [{ ...lgOf(zone('甲', 'one')), gap: 20 }] })]
  const a3off = judgeInventory(off)
  const a3on = judgeInventory(off, { enforceGap: true })
  check(JSON.stringify(keys(a3on)) === JSON.stringify(['A3|s1|lg|甲', 'A3|s1|md|甲']) && verdictOf(a3on) === 'red', `距離不符 + A3 計入 → 只紅 A3 md、lg(實得 ${JSON.stringify(keys(a3on))}、${verdictOf(a3on)})`)
  check(keys(a3off).length === 2 && verdictOf(a3off) === 'green', `距離不符 + A3 不計入 → 照樣列出兩筆,但結論綠(實得 ${keys(a3off).length} 筆、${verdictOf(a3off)})`)
  check(describeFinding(a3on.findings.A3.find((f) => f.density === 'md')).includes('= 16px,應 12'), 'A3 的訊息講出量到的與應有的數字')
  // 段落一律 tight;兩塊以上被縮成 tight → 紅
  check(judgeInventory([story('s1', [zone('段', null, { mode: 'paragraph', gap: 16 })], { lgZones: [{ ...lgOf(zone('段', null, { mode: 'paragraph' })), gap: 16 }] })], { enforceGap: true }).findings.A3.length === 1, '段落模式量到 loose → A3 紅(段落一律 tight)')
  check(judgeInventory([story('s1', [zone('乙', 'many', { gap: 12 })])], { enforceGap: true }).findings.A3.some((f) => f.density === 'md' && f.token === 'loose'), '兩塊以上卻只隔 tight → A3 紅、指名 loose')
  check(judgeInventory([story('s1', [zone('無', null)])], { enforceGap: true }).findings.A3.some((f) => f.unjudged), '區塊模式、後面有內容卻沒有判定 → A3 紅(沒判定)')
  // 不量的:看不到 / 沒有內容
  check(judgeInventory([story('s1', [zone('隱', 'one', { visible: false, gap: null }), zone('空', null, { hasContent: false, gap: null })])], { enforceGap: true }).findings.A3.length === 0, '看不到 / 後面沒有內容 → 不量')
  // 儀器失效(結論 instrument,不是 red 也不是 green)
  const instrumentCases = [
    ['重判後還有 pending', [story('s1', [zone('甲', 'pending')], { mdFirst: [zone('甲', 'pending')], lgZones: [lgOf(zone('甲', 'pending'))] })]],
    ['md 與 lg 的標題區數量不同', [story('s1', [zone('甲', 'one'), zone('乙', 'one')], { lgZones: [lgOf(zone('甲', 'one'))] })]],
    ['md 與 lg 的標題字不同', [story('s1', [zone('甲', 'one')], { lgZones: [lgOf(zone('丙', 'one'))] })]],
    ['首次與重判的標題區數量不同', [story('s1', [zone('甲', 'one')], { mdFirst: [] })]],
    ['缺 lg 那一趟', [{ id: 's1', md: { first: [zone('甲', 'one')], rejudged: [zone('甲', 'one')] } }]],
    ['兩種密度讀到同一個 loose', [story('s1', [zone('甲', 'one')], { lgZones: [zone('甲', 'one')] })]],
    ['讀不到 tight', [story('s1', [zone('甲', 'one', { tight: NaN })])]],
    ['看得到、有內容卻量不到距離', [story('s1', [zone('甲', 'one', { gap: null })])]],
  ]
  for (const [name, input] of instrumentCases) {
    const r = judgeInventory(input, { enforceGap: true })
    check(verdictOf(r) === 'instrument' && r.instrument.length > 0, `${name} → 儀器失效(實得 ${verdictOf(r)}:${JSON.stringify(r.instrument)})`)
  }
  // 地板:只在完整掃描時檢查
  const onlyRules = [story('s1', [zone('甲', 'one'), zone('乙', 'many')])]
  check(verdictOf(judgeInventory(onlyRules)) === 'green', '沒有 --limit 以外的地板:部分掃描少了某種共用元件 → 不算儀器失效')
  const floors = judgeInventory(onlyRules, { full: true })
  check(verdictOf(floors) === 'instrument' && ['h3', 'desc', 'es'].every((f) => floors.instrument.some((line) => line.includes(`「${f}」`))) && !floors.instrument.some((line) => line.includes('「rule」')),
    `完整掃描少了 H3 / Desc / ExampleSection → 三種各一行儀器失效、TutorialRule 有量到不列(實得 ${JSON.stringify(floors.instrument)})`)
  const noMany = judgeInventory([story('s1', ['h3', 'h3+desc', 'es', 'rule'].map((kind, i) => zone(`t${i}`, 'one', { kind })))], { full: true })
  check(noMany.instrument.length === 1 && noMany.instrument[0].includes('「many」'), `完整掃描沒有任何一個兩塊以上 → 儀器失效(實得 ${JSON.stringify(noMany.instrument)})`)
  const allFour = judgeInventory([story('s1', ['h3', 'h3+desc', 'es', 'rule'].flatMap((kind, i) => [zone(`a${i}`, 'one', { kind }), zone(`b${i}`, 'many', { kind })]))], { full: true })
  check(verdictOf(allFour) === 'green', `完整掃描四種共用元件、兩種判定都有 → 綠(實得 ${JSON.stringify(allFour.instrument)})`)
  return { failures, rows }
}

/** 紅的集合 = 期望的集合(多紅、少紅都指名)。 */
function compareRedSet(label, result, expectedKeys) {
  const actual = [...result.findings.A1, ...result.findings.A2, ...result.findings.A3].map(findingKey).sort()
  const expected = [...expectedKeys].sort()
  const extra = actual.filter((k) => !expected.includes(k))
  const missing = expected.filter((k) => !actual.includes(k))
  const problems = []
  if (result.instrument.length) problems.push(`${label}:不該有儀器失效,實得 ${result.instrument.length} 筆(第一筆:${result.instrument[0].replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')})`)
  if (extra.length) problems.push(`${label}:多紅了 ${extra.length} 筆:${extra.slice(0, 6).join(' ; ')}`)
  if (missing.length) problems.push(`${label}:該紅沒紅 ${missing.length} 筆:${missing.slice(0, 6).join(' ; ')}`)
  return problems
}

function runFakeBuildControl() {
  const dir = mkdtempSync(path.join(tmpdir(), 'doc-heading-inventory-fake-build-'))
  if (!dir || !existsSync(dir)) return { made: false }
  try {
    // 只有一個「無預覽」頁 + 一則 story 的清單:openStory 第一次輪詢就認得出來(不靠逾時)
    writeFileSync(path.join(dir, 'iframe.html'), '<!doctype html><html><head><meta charset="utf-8"><title>doc-heading fake build</title></head><body class="sb-show-nopreview"></body></html>\n')
    writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ v: 5, entries: { [CONTROL_STORY]: { type: 'story', id: CONTROL_STORY, title: 'fake', name: 'fake', importPath: './fake.stories.tsx' } } })}\n`)
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--static=${dir}`, '--concurrency=1'], { cwd: REPO, encoding: 'utf8' })
    const text = `${child.stdout ?? ''}${child.stderr ?? ''}`
    return { made: true, status: child.status, text, marked: text.includes(INSTRUMENT_FAIL_MARKER), noBrowser: text.includes(SKIPPED_ENV_MARKER) || text.includes(BROWSER_REQUIRED_MARKER) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

async function runSelftest(firstBrowser, server) {
  const problems = []
  const table = judgeTable()
  if (table.failures.length) {
    console.log(`✗ 判定表 ${table.failures.length} 列不符(純函式,不開瀏覽器):\n  ${table.failures.join('\n  ')}`)
    return { problems: ['判定表不符 —— 判定本身就不對,後面的瀏覽器對照不用跑'] }
  }
  out(`✓ 判定表 ${table.rows} 列全部符合(不開瀏覽器:A1 / A2 / A3 各自只紅自己、A3 不計入時照列但結論綠、量不到一律判成儀器失效、地板只在完整掃描檢查)`)

  const both = async (page, hooks = {}) => {
    const s = { id: CONTROL_STORY }
    for (const d of DENSITIES) s[d] = await measureStory(page, server, CONTROL_STORY, d, hooks[d] ?? hooks.all ?? {})
    return s
  }
  const titleOf = (s) => s.md.rejudged.find((z) => z.title.startsWith(CONTROL_TITLE))?.title ?? null

  // 現況(前提)+ β + γ + channel 換空函式 + 不存在的 story:同一個瀏覽器、同一個分頁(每次都重新導覽,注入的樣式 / 改掉的函式跟著舊文件消失)
  const page = await firstBrowser.newPage({ viewport: VIEWPORT })
  const base = await both(page)
  const target = titleOf(base)
  const baseResult = judgeInventory([base], { enforceGap: true })
  if (!target) return { problems: [`對照組頁面 ${CONTROL_STORY} 上找不到「${CONTROL_TITLE}…」這個標題區 —— 對照組不成立`] }
  if (verdictOf(baseResult) !== 'green') return { problems: [`前提不成立:未破壞的 ${CONTROL_STORY} 就不綠(A3 計入):${[...baseResult.findings.A1, ...baseResult.findings.A2, ...baseResult.findings.A3].map(describeFinding).join(' ; ')}${baseResult.instrument.join(' ; ')}`] }
  const mdTarget = base.md.rejudged.find((z) => z.title === target)
  out(`✓ 現況:${CONTROL_STORY} ${base.md.rejudged.length} 個標題區,A1 / A2 / A3 全綠(前提成立;「${target.slice(0, 20)}…」md ${mdTarget.mark} 距離 ${mdTarget.gap})`)

  // β:首次量完才把兩種密度的 tight 都改成 8px → 重判 one;正好 A2 md、lg 兩筆,A1 綠
  const beta = await both(page, { all: { afterFirst: (p) => p.addStyleTag({ content: BETA_CSS }) } })
  const betaProblems = compareRedSet('β', judgeInventory([beta]), [`A2|${CONTROL_STORY}|md|${target}`, `A2|${CONTROL_STORY}|lg|${target}`])
  problems.push(...betaProblems)
  if (!betaProblems.length) {
    const z = (d) => beta[d].first.find((x) => x.title === target)?.mark + ' → ' + beta[d].rejudged.find((x) => x.title === target)?.mark
    out(`✓ 對照組 β(首次量完才把 tight 改成 8px):紅 = 期望 —— 只有 A2「${target.slice(0, 20)}…」md ${z('md')}、lg ${z('lg')};A1 綠(兩種密度重判都一樣)`)
  }

  // γ:重判之後把每個 ExampleSection 的內容下推 4px → 那一頁每個有內容的標題區 A3 紅、正好多 4;A1、A2 綠
  const gamma = await both(page, { all: { afterRejudge: (p) => p.addStyleTag({ content: GAMMA_CSS }) } })
  const gammaResult = judgeInventory([gamma], { enforceGap: true })
  const gammaExpected = DENSITIES.flatMap((d) => gamma[d].rejudged.filter((z) => expectedHeadingGap(z)).map((z) => `A3|${CONTROL_STORY}|${d}|${z.title}`))
  const gammaProblems = compareRedSet('γ', gammaResult, gammaExpected)
  if (gammaExpected.length === 0) gammaProblems.push('γ:對照組頁面上沒有任何「看得到、後面有內容」的標題區 —— 對照組是空的')
  const offBy = gammaResult.findings.A3.filter((f) => Number.isFinite(f.gap) && Math.abs(f.gap - f.expected - GAMMA_PUSH_PX) > 0.1)
  if (offBy.length) gammaProblems.push(`γ:紅了,但差的不是正好 ${GAMMA_PUSH_PX}px —— 量的不是那一段:${offBy.slice(0, 3).map(describeFinding).join(' ; ')}`)
  problems.push(...gammaProblems)
  if (!gammaProblems.length) out(`✓ 對照組 γ(重判後內容下推 ${GAMMA_PUSH_PX}px):紅 = 期望 —— 那一頁 ${gammaExpected.length} 格(標題區 × 密度)A3 全紅、每格正好多 ${GAMMA_PUSH_PX};A1 / A2 綠。例:${describeFinding(gammaResult.findings.A3[0])}`)

  // channel 的 emit 換成空函式 → 標記留在 pending → 重判必須丟儀器失效(不得讀成 one / many)
  await openStory(page, storyUrl(server.origin, CONTROL_STORY, 'md'), { settleFrames: DOC_HEADING_SETTLE_FRAMES, notFound: server.notFound, timeoutMs: DOC_HEADING_OPEN_TIMEOUT_MS })
  await page.evaluate(() => { const c = window.__STORYBOOK_ADDONS_CHANNEL__ ?? window.__STORYBOOK_PREVIEW__?.channel; if (c) c.emit = () => true })
  let deafKind = null
  try { await rejudgeHeadingZones(page, { label: `${CONTROL_STORY} @md(channel 換空函式)`, capMs: 3000 }) } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    deafKind = error.kind
    if (!error.reason.includes('pending')) problems.push(`channel 換空函式:丟了儀器失效,但原因沒講到「停在 pending」(原因:${error.reason.slice(0, 120)})`)
  }
  if (deafKind === null) problems.push('channel 換空函式:重判沒有丟儀器失效 —— 產品沒重判卻被讀成有結果')
  else out(`✓ 對照組 channel 換空函式:標記停在 pending → 重判判成沒量到(種類 ${deafKind}),不讀成任何判定`)

  // 不存在的 story → 主跑用的同一支 measureStory 必須丟 StoryRenderInstrumentError(不得回空清單 = 「沒有標題區」= 假綠)
  const ghostId = 'design-system-components-chip-設計原則--no-such-story-for-doc-heading-selftest'
  let ghostKind = null
  try { await measureStory(page, server, ghostId, 'md') } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    ghostKind = error.storyId?.startsWith(ghostId) && error.message.includes('不是產品裁決') ? error.kind : null
  }
  if (ghostKind === null) problems.push('不存在的 story:沒有落進儀器失效(或沒點名該 id)—— 會被讀成「這則沒有標題區」')
  else out(`✓ 對照組 不存在的 story:落進儀器失效、點名該 id(種類 ${ghostKind}),不讀成「沒有標題區」`)
  await page.close().catch(() => {})

  // α:另起一個瀏覽器(init script 跟著分頁一輩子):文件一開始就把一般密度的 tight 改成 8px、大密度不變
  const alphaBrowser = await launchBrowser()
  try {
    const alphaPage = await alphaBrowser.newPage({ viewport: VIEWPORT })
    await alphaPage.addInitScript((css) => {
      const attach = () => { if (!document.documentElement) return false; const s = document.createElement('style'); s.setAttribute('data-selftest-break', 'alpha'); s.textContent = css; document.documentElement.appendChild(s); return true }
      if (!attach()) { const mo = new MutationObserver(() => { if (attach()) mo.disconnect() }); mo.observe(document, { childList: true }) }
    }, ALPHA_CSS)
    const alpha = await both(alphaPage)
    const alphaProblems = compareRedSet('α', judgeInventory([alpha], { enforceGap: true }), [`A1|${CONTROL_STORY}|*|${target}`, `A2|${CONTROL_STORY}|lg|${target}`])
    // 量法的兩面:只比首次標記的話 md、lg 一樣(看不到);重判後不一樣(看得到)
    const firstMd = alpha.md.first.find((z) => z.title === target)?.mark
    const firstLg = alpha.lg.first.find((z) => z.title === target)?.mark
    const reMd = alpha.md.rejudged.find((z) => z.title === target)?.mark
    const reLg = alpha.lg.rejudged.find((z) => z.title === target)?.mark
    if (firstMd !== firstLg) alphaProblems.push(`α:只比首次標記就看得到 md ${firstMd} / lg ${firstLg} —— 「Storybook 晚於標題判定才寫密度」這個前提變了,重判這一步的理由要重寫`)
    problems.push(...alphaProblems)
    if (!alphaProblems.length) {
      out(`✓ 對照組 α(文件一開始就把一般密度的 tight 改成 8px):紅 = 期望 —— A1「${target.slice(0, 20)}…」md ${reMd} / lg ${reLg},A2 lg 首次 ${firstLg} / 重判 ${reLg}`)
      out(`    兩面:只比首次標記 md ${firstMd} / lg ${firstLg}(看不到);重判後 md ${reMd} / lg ${reLg}(看得到)`)
    }
  } finally { await alphaBrowser.close().catch(() => {}) }
  return { problems }
}

// ═══════════════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════════════

// 比真實路徑(lib/direct-run.mjs):經符號連結叫的時候只比字串會什麼都不跑、exit 0
if (isDirectRun(import.meta.url)) {
  if (STATIC_ARG) requireStorybookBuild(path.join(STATIC, 'index.json'))
  else requireFreshStorybookBuild(STATIC, FRESH_SOURCES)
  const t0 = Date.now()
  let server = null
  let browser = null
  let exitCode = 1
  try {
    server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
    browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
    if (SELFTEST) {
      const { problems } = await runSelftest(browser, server)
      await browser.close().catch(() => {})
      browser = null
      // 假建置:自己的瀏覽器已經關了才跑(同一時間只有一個 Chromium)
      if (!problems.length) {
        const fake = runFakeBuildControl()
        if (!fake.made) problems.push('假建置:暫存目錄建立失敗,這一格沒有跑')
        else if (fake.noBrowser) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER} 對照組(假建置):子行程起不了瀏覽器(本行程剛剛起得來)—— 這一格沒量到\n${fake.text}`); exitCode = 2 }
        else if (fake.status === 2 && fake.marked) out('✓ 對照組(假建置):整支閘吃一份只有「無預覽」頁的建置 → 以儀器失效的標記與結束碼 2 結束(不是通過,也不是產品紅)')
        else problems.push(`假建置:應該以儀器失效的標記與結束碼 2 結束;實得結束碼 ${String(fake.status)}、輸出${fake.marked ? '有' : '沒有'}標記。子行程輸出(標記字樣已遮):\n${fake.text.replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')}`)
      }
      // 經符號連結叫自己(審查 A 2026-11-14 的 s01:只比字串時 0 行、exit 0,連不存在的建置都是綠)
      if (!problems.length && exitCode !== 2) {
        const link = missingBuildViaSymlinkControl(import.meta.url)
        if (link.ok) out(`✓ 對照組(${link.line})`)
        else problems.push(link.line)
      }
      if (exitCode !== 2) {
        if (problems.length) { console.log(`\n✗ ${GATE_NAME}(selftest):\n  ${problems.join('\n  ')}\n  —— 量具沒有在該紅的地方紅(或紅到不該紅的地方),綠燈不能當證據`); exitCode = 1 }
        else { out(`\n✓ ${GATE_NAME} selftest 通過(${Math.round((Date.now() - t0) / 1000)} 秒):判定表、現況、α / β / γ 三種破法的紅集合、channel 空函式 / 不存在的 story / 假建置三種「必須判成沒量到」、經符號連結叫自己也真的跑,全部成立`); exitCode = 0 }
      }
    } else {
      const scan = await runScan(browser, server)
      if (scan.instrument && !scan.stories) {
        for (const line of scan.instrument) console.log(`✗ ${line}`)
        exitCode = 2
      } else {
        const result = judgeInventory(scan.stories, { full: !LIMIT, enforceGap: ENFORCE_GAP })
        result.instrument.unshift(...scan.instrument)
        if (DUMP) writeDump(path.resolve(DUMP), scan.stories)
        printResult(result)
        const verdict = verdictOf(result)
        const seconds = Math.round((Date.now() - t0) / 1000)
        if (verdict === 'instrument') { console.log(`✗ ${GATE_NAME}:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過;${seconds} 秒)`); exitCode = 2 }
        else if (verdict === 'red') { console.log(`\n✗ ${GATE_NAME}:${scan.total} 則 story 裡有標題區判定不一致(逐筆見上;${seconds} 秒)`); exitCode = 1 }
        else { console.log(`\n✅ ${GATE_NAME}:${scan.total} 則 story${LIMIT ? `(--limit=${LIMIT})` : ''},每個標題區兩種密度判定相同、首次 = 重判${ENFORCE_GAP ? '、判定 → 距離相符' : ''}(${seconds} 秒)`); exitCode = 0 }
      }
    }
  } catch (error) {
    // 閘自己的程式錯照舊往外丟(finally 先收尾);只有「沒量到」走儀器失效的出口
    if (!(error instanceof StoryRenderInstrumentError) && !String(error?.message ?? '').includes(INSTRUMENT_FAIL_MARKER)) throw error
    const notFound = server ? [...new Set(server.notFound)] : []
    console.error(`✗ ${instrumentLine(SELFTEST ? `${GATE_NAME}(selftest)` : GATE_NAME, error)}${notFound.length ? `;同源 404 帳本:${notFound.join(', ')}` : ''}`)
    console.error(`✗ ${GATE_NAME}${SELFTEST ? '(selftest)' : ''}:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)`)
    exitCode = 2
  } finally {
    await browser?.close().catch(() => {})
    await server?.stop().catch(() => {})
  }
  process.exit(exitCode)
}
