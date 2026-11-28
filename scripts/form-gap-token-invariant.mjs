#!/usr/bin/env node
/**
 * 表單欄位垂直間距 = `--layout-space-loose`,不開放逐一選檔(2026-09-12;出處 = AI 建議、user 採納,
 * user 當天原話「照你建議並確保整個 ds 都有 ssot,不要有任何偏移」—— `components/Field/field-group.spec.md`「欄位垂直間距」的出處更正)
 *
 * SSOT:`tokens/layoutSpace/layoutSpace.spec.md`「親疏 3 級」表逐字把
 * 「跨範疇 + parallel / independent」的例子列為「form fields stack(parallel inputs)」→ 規則 3 = loose。
 * 表單間距是**系統級**設定:要調就整個 density 一起調,不是每個表單各自挑一檔。
 *
 * 閱讀組不歸這支量(2026-11-28 CIFIX):範圍(最外層 FieldGroup,含自己)裡有就地編輯(`data-field-reading`)的組是閱讀區塊、
 * 不是表單,列距 = `--layout-space-tight`(`components/Field/field.spec.md`「閱讀情境」效果 ④;2026-11-27 user 定 T2 甲 ——
 * 留白草案頁 T2 沒留言,user 原話「我沒回應的就是沒有意見」→ 照 AI 建議甲,草案頁 T2 列明現有閱讀型欄位組一般密度 16 → 12)。
 * 這條由 `scripts/reading-context-invariant.mjs` G10 守(閱讀組 tight、表單與純顯示組 loose、內層組照範圍);本閘照同一個判法
 * (G10 的 outer / reading)把閱讀組略過,其餘組(含純顯示組)照舊期望 loose。對照組另驗兩面:閱讀組真的被認出來(略過數 > 0)、
 * 有閱讀組的那則 story 裡其他組注入後照樣紅(逐組略過,不是整則跳過)。
 *
 * 為什麼型別擋不住:`FieldGroup` 的 `gap` prop 已經移除(傳 `gap=` 會被 tsc 擋),
 * 但 `className="gap-4"` 仍然會蓋掉元件自己的 `gap-[var(--layout-space-loose)]` —— 那是 runtime 才看得到的漂移。
 * 所以這支閘量真實的 computed `row-gap`,兩個 density 都驗。
 *
 * 兩段式(2026-09-12 為了 CI 預算重構,覆蓋反而更完整):
 *   S(靜態,零成本):掃全部 `.tsx` 原始碼,`<FieldGroup ... className="... gap-N ...">` 一律違規。
 *     這段連 consumer 程式碼都蓋得到,而且不需要那支 story 存在才驗得到。
 *   R(瀏覽器):只在三種 canonical story 上驗元件自己渲染出來的 computed `row-gap`(兩個 density)。
 *     全掃 1033 支要 2 分 22 秒(CI 約 5 分),而 R 要證明的只是「元件的值對」——
 *     「有人用 className 蓋掉」那條已經由 S 全面覆蓋,不需要用 6 倍的瀏覽器時間再驗一次。
 *
 * 對照組(`--selftest`):注入 `[data-field-group]{row-gap:12px}` 模擬「有人把它改回固定值」,必須紅。
 *
 * 載入(2026-09-25):每則 story 由共用的 openStory(lib/launch-browser.mjs)開 —— 等 Storybook 回報渲染完成
 * (含 play)、畫面健康才判斷「這則有沒有 FieldGroup」。舊版導覽失敗與「根節點 5 秒內沒內容」都被 `.catch(() => {})`
 * 吞掉,接著 `[data-field-group]` 數到 0 就 `continue` —— **沒開起來的 story 被當成「沒有 FieldGroup」靜默略過**。
 * 現在開不起來 = 儀器失效(點名 story、列同源 404,exit 2,不是產品裁決;selftest 亦同);只有「確定渲染完成、
 * 而且真的沒有 FieldGroup」才略過(那是確定性的理由:這則 story 不含表單)。
 *
 *   node scripts/form-gap-token-invariant.mjs [--build=<dir>] [--selftest]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const EXPECTED = { md: '16px', lg: '24px' } // = --layout-space-loose 的兩個 density 檔位

// ── S:靜態掃 className 覆寫 ──
const SRC_ROOTS = ['packages/design-system/src', 'apps', 'src', 'template'].map((r) => join(REPO, r)).filter((d) => existsSync(d))
const tsxFiles = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full)
    else if (name.endsWith('.tsx')) tsxFiles.push(full)
  }
}
for (const root of SRC_ROOTS) walk(root)
const staticViolations = []
for (const file of tsxFiles) {
  const src = readFileSync(file, 'utf8')
  // `<FieldGroup` 開標籤內出現 gap- utility(className 覆寫)或 gap= prop(已移除的舊 API)
  for (const m of src.matchAll(/<FieldGroup\b[^>]*>/g)) {
    const tag = SELFTEST ? m[0] + ' className="gap-4"' : m[0]
    if (/\bgap-\d/.test(tag) || /\bgap=/.test(tag)) {
      staticViolations.push({ file: relative(REPO, file), tag: tag.replace(/\s+/g, ' ').slice(0, 90) })
    }
  }
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const violations = []
const instrumentFailures = []
let seen = 0
let readingSkipped = 0 // 閱讀組 × density(G10 守,這裡不量)
const readingStories = new Set()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  if (SELFTEST) {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style')
        s.textContent = '[data-field-group]{row-gap:12px !important}'
        document.head.appendChild(s)
      })
    })
  }
  const index = JSON.parse(await (await fetch(`${server.origin}/index.json`)).text())
  // R 段只跑三種 canonical story(每個元件都有的固定三支)+ 任何 id 含 field 的 story。
  // 「某支 story 用 className 蓋掉 gap」由 S 段靜態掃全部原始碼覆蓋,不靠這裡。
  const ids = Object.entries(index.entries)
    .filter(([id, e]) => e.type === 'story' && (/--(state-behavior|overview|size-matrix|anatomy)$/.test(id) || /field/i.test(id)))
    .map(([id]) => id)
  for (const id of ids) {
    try {
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { notFound: server.notFound })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrumentFailures.push(error)
      continue
    }
    // 渲染完成後仍沒有 FieldGroup = 這則 story 不含表單(確定性的略過理由,不是「沒開起來」)
    if (await page.locator('[data-field-group]').count() === 0) continue
    for (const density of ['md', 'lg']) {
      await page.evaluate((d) => document.documentElement.setAttribute('data-density', d), density)
      // 元素早已在畫面上;給 density 切換後可能的 JS 端重算一小段時間(純 CSS 變數本身在 getComputedStyle 時就已同步生效)
      await page.waitForTimeout(90)
      const groups = await page.evaluate(() => [...document.querySelectorAll('[data-field-group]')].map((g) => {
        // 範圍 = 最外層 FieldGroup(含自己);範圍裡有就地編輯 = 閱讀組(同 reading-context-invariant.mjs G10 的 outer / reading)
        let outer = g
        for (let n = g.parentElement; n; n = n.parentElement) if (n.hasAttribute('data-field-group')) outer = n
        return { gap: getComputedStyle(g).rowGap, reading: Boolean(outer.querySelector('[data-field-reading]')) }
      }))
      for (const { gap, reading } of groups) {
        if (reading) { readingSkipped += 1; readingStories.add(id); continue }
        seen += 1
        if (gap !== EXPECTED[density]) violations.push({ id, density, gap, 期望: EXPECTED[density] })
      }
    }
  }
} finally {
  await browser.close()
  await server.stop()
}

console.log(`S 段:掃了 ${tsxFiles.length} 個 .tsx,找到 ${staticViolations.length} 處 className / prop 覆寫`)
console.log(`R 段:量了 ${seen} 個 (FieldGroup × density) 組合;閱讀組 ${readingSkipped} 個組合(${readingStories.size} 則 story)交給 reading-context-invariant G10`)
if (instrumentFailures.length) {
  // 沒量到 ≠ 沒有 FieldGroup:任何一則開不起來,這次的綠燈就不成立(一般與 selftest 皆同)
  console.error(`✗ 儀器失效:${instrumentFailures.length} 則 story 開不起來 —— 它們有沒有 FieldGroup、間距對不對,這次都沒量到(exit 2,不是產品裁決,也不算通過):`)
  for (const e of instrumentFailures.slice(0, 12)) console.error(`  ${e.message}`)
  if (instrumentFailures.length > 12) console.error(`  …另 ${instrumentFailures.length - 12} 則`)
  if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  process.exit(2)
}
if (seen === 0) { console.error('✗ 一個 FieldGroup 都沒量到 —— 這次什麼都沒驗到,視同紅燈'); process.exit(1) }
if (SELFTEST) {
  if (staticViolations.length === 0) { console.error('✗ 對照組:S 段注入 className="gap-4" 之後仍然沒抓到 —— 靜態那半失效'); process.exit(1) }
  if (violations.length === 0) { console.error('✗ 對照組:注入固定 row-gap 之後仍然綠 —— 儀器失效'); process.exit(1) }
  console.log(`✓ 對照組:如預期紅(${violations.length} 個組合被抓到)`)
  // 閱讀組略過的兩面:認得出來(否則「略過」這半從沒被驗過)、只略過那一組(同一則裡的表單 / 純顯示組照量)
  if (readingSkipped === 0) { console.error('✗ 對照組:一個閱讀組都沒認出來 —— 略過閱讀組那一半沒驗到(field.stories.tsx 的閱讀情境夾具應該有)'); process.exit(1) }
  const sameStory = violations.filter((v) => readingStories.has(v.id))
  if (sameStory.length === 0) { console.error(`✗ 對照組:有閱讀組的 ${readingStories.size} 則 story 裡,其他組注入後沒有一個紅 —— 略過範圍過寬(整則跳過,不是逐組)`); process.exit(1) }
  console.log(`✓ 對照組:閱讀組認出 ${readingSkipped} 個組合並略過;同一則 story 裡的其他組照樣紅 ${sameStory.length} 個組合(逐組略過)`)
  process.exit(0)
}
if (staticViolations.length > 0) {
  console.error(`✗ ${staticViolations.length} 處 FieldGroup 被 className / prop 覆寫間距(表單間距是系統級設定,要調走 density):`)
  for (const v of staticViolations.slice(0, 12)) console.error(`  ${v.file}  ${v.tag}`)
}
if (violations.length > 0) {
  console.error(`✗ ${violations.length} 個 FieldGroup 的間距不是 --layout-space-loose:`)
  for (const v of violations.slice(0, 12)) console.error(`  ${v.id} [${v.density}] 實際 ${v.gap} ≠ 期望 ${v.期望}`)
  process.exit(1)
}
if (staticViolations.length > 0 || violations.length > 0) process.exit(1)
console.log('✓ 全 DS 的表單欄位間距都等於 --layout-space-loose(md 16px / lg 24px),且沒有任何 className 覆寫(閱讀組的 tight 由 reading-context-invariant G10 驗)')
