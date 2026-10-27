#!/usr/bin/env node
// probe-inline-edit-align.mjs — 量「標籤 + 值」的值左緣 vs 標籤左緣(對齊 SSOT 驗證,2026-07-17;2026-10-27 擴)
// 兩組:(一)InlineEdit view 態:委派控件(tag/plain/date)+ 純值 view 左緣都應落 label 左緣(Δ≈0)。
//      (二)`<Field mode="view">` 純顯示 18 種 × 標籤在上 / 標籤在左(Field 展示 test-only「純顯示齊標籤驗證」):
//          值的第一個可見元素左緣 = 控件欄左緣(標籤在上時 = 標籤左緣)、第一行中線 = 控件欄頂 + field-height / 2。
//          規則:field-controls.spec.md「軸一 view mode」(user 2026-10-21 C1 甲「我覺得視覺上全部對齊標籤是肯定的且必須的」)。
//          每次都跑對照組:在同一頁注入「純顯示補回左內距 13px、RadioGroup 拿掉列幾何」的 CSS 再量一次,
//          對照組沒紅 = 量具壞了(exit 2),不准讀成綠(M32「儀器要先有對照組」)。
// 用法:node scripts/probe-inline-edit-align.mjs [--static=<storybook 建置目錄>](預設 ./storybook-static)
// 這是探針(不在 CI),但同樣不准把「沒量到」讀成「對齊」(2026-09-25):
//   開 story 走 lib/launch-browser.mjs 的 openStory(全部瀏覽器腳本共用的唯一實作)—— Storybook 回報渲染完成(含 play)
//   + render-health + 被量的 InlineEdit view 本身出現 + 版面連續 10 影格靜止才量,取代「networkidle + 固定睡 300ms」(M37)。
//   story 開不起來 = 儀器失效(點名 story、附同源 404、exit 2);渲染完成卻一組 label+view 都沒量到 = 零量測,同樣 exit 2 ——
//   以前這種情況只印一行 ⚠️、fail 仍是 0,最後印「✅ 全部對齊」並 exit 0。
import { join } from 'node:path'
import { resolveProvisionedPlaywrightRuntime } from '../infra/governance/lib/playwright-runtime.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = process.cwd()
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = staticArg ? staticArg.slice('--static='.length) : join(ROOT, 'storybook-static')
// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記與退出碼,2026-09-25 統一寫法,待辦總帳 C5)
requireStorybookBuild(join(STATIC, 'index.json'))
const runtime = resolveProvisionedPlaywrightRuntime({ repoRoot: ROOT, environment: process.env })
if (!runtime) throw new Error('[inline-edit-align] exact Playwright Chromium runtime missing; run `npm run setup:playwright`')
process.env.PLAYWRIGHT_BROWSERS_PATH = runtime.environmentValue
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const report404 = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }

const TOL = 1.5 // px 容差(1px 透明 border 等)
let fail = 0
const results = []
/** 沒量到(零量測)的紀錄 —— 不是產品裁決,也絕不算通過 */
const unmeasured = []
const storyUrl = (storyId) => `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`
// 等 Storybook 渲染完成 + 被量的 InlineEdit view([data-editing="false"])本身 + 版面靜止
const open = (page, storyId) => openStory(page, storyUrl(storyId), { waitFor: '[data-editing="false"]', settleFrames: 10, notFound: server.notFound })

try {
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } })

  async function probe(storyId, label) {
    await open(page, storyId)
    // 對每個 Field(有 label 的),量 label 左 vs 該 field InlineEdit view 內容最左緣
    const rows = await page.evaluate(() => {
      const out = []
      // 找所有 FieldLabel(label 元素)+ 其後的 InlineEdit view 內容
      const labels = [...document.querySelectorAll('label')]
      for (const lab of labels) {
        const field = lab.closest('[data-field-orientation],div') || lab.parentElement
        // InlineEdit view root = [data-editing="false"](本身帶 -mx alignBleed → 邊緣在 label 左 field-px)
        const ieView = field?.querySelector('[data-editing="false"]')
        if (!ieView) continue
        // 內容起點 = 值載體(fieldViewGeometry 容器 / Tag / span)的 content-box 左緣。
        // 該容器有 px-[--field-px] padding → 其 rect.left(22)+ paddingLeft(12)= 內容起點(33)= 應對齊 label。
        // 排除 absolute Pressable。找有 text 且 paddingLeft>0 的最內層值容器;無 padding 者取 rect.left。
        const cands = [...ieView.querySelectorAll('*')].filter((el) => {
          const cs = getComputedStyle(el)
          return cs.position !== 'absolute' && (el.textContent || '').trim().length > 0 && el.getBoundingClientRect().width > 0
        })
        if (!cands.length) continue
        // 值內容起點 = 每個候選的 content-box 左緣(rect.left + paddingLeft)取最小(最左的可視值起點)
        const contentLeft = Math.min(...cands.map((el) => {
          const r = el.getBoundingClientRect(); const pl = parseFloat(getComputedStyle(el).paddingLeft) || 0
          return r.left + pl
        }))
        out.push({ label: lab.textContent.trim(), labelLeft: +lab.getBoundingClientRect().left.toFixed(1), contentLeft: +contentLeft.toFixed(1) })
      }
      return out
    })
    for (const r of rows) {
      const delta = +(r.contentLeft - r.labelLeft).toFixed(1)
      const ok = Math.abs(delta) <= TOL
      if (!ok) fail++
      results.push(`  [${label}] ${r.label}: label.left=${r.labelLeft} content.left=${r.contentLeft} Δ=${delta} ${ok ? '✅' : '❌ 未對齊'}`)
    }
    if (!rows.length) {
      results.push(`  [${label}] ✗ 零量測:story 已渲染完成,卻找不到任何 label+view 對(story 無 FieldLabel?)—— 沒量到,不是對齊`)
      unmeasured.push(`${storyId}(零組 label+view)`)
    }
  }

  await probe('design-system-components-inlineedit-展示--vertical-field-form', 'VerticalFieldForm(圖三:plain+tag+多行)')

  // ── blur exit 驗證:點 Status(Select)進 edit → 點別處 blur → 應回 display(無殘留 chrome)──
  async function probeBlurExit() {
    await open(page, 'design-system-components-inlineedit-展示--vertical-field-form')
    // 進 edit:點 Status 欄的 view Pressable(第 2 個 field,Status)
    const statusBtn = page.locator('label:has-text("Status")').locator('..').locator('[data-editing="false"] button')
    await statusBtn.click()
    // 等進入編輯態的切換(掛上編輯控件、焦點移進去);按鈕早已在畫面上,等的是點擊之後的狀態轉換
    await page.waitForTimeout(400)
    const editingCount1 = await page.locator('[data-editing]:not([data-editing="false"])').count()
    // blur:點表單外空白處(body 頂端)
    await page.mouse.click(10, 10)
    // 等 blur 之後回到 display 態的切換走完
    await page.waitForTimeout(500)
    const editingCount2 = await page.locator('[data-editing]:not([data-editing="false"])').count()
    const enteredEdit = editingCount1 >= 1
    const exitedOnBlur = editingCount2 === 0
    results.push(`  [blur-exit] 點 Status 進 edit(editing 元素=${editingCount1})→ ${enteredEdit ? '✅ 進 edit' : '❌ 沒進 edit'}`)
    results.push(`  [blur-exit] blur 後 editing 元素=${editingCount2} → ${exitedOnBlur ? '✅ 回 display 無殘留' : '❌ chrome 殘留(bug 未修)'}`)
    if (!enteredEdit || !exitedOnBlur) fail++
  }
  await probeBlurExit()

  // ── (二)`<Field mode="view">` 純顯示 18 種 × 兩種標籤位置 ──
  const VIEW_STORY = 'design-system-components-field-展示--view-alignment-contract'
  const VIEW_TOL_X = 0.5 // 純顯示左側是 0(不像 InlineEdit 有 1px 透明邊)
  const VIEW_TOL_Y = 1 // 字形外框中線的取整
  // 對照組:把修好的東西弄壞 —— 純顯示補回左內距(修前 Model A 的 13px = 12 內距 + 1 左邊框)、RadioGroup 純顯示拿掉列幾何(修前 5.5px 高差)。
  // 用行內 !important 寫:Tailwind v4 的 `!pl-0` 在 @layer utilities 裡,層內的 !important 贏過任何不在層裡的樣式表,只有行內樣式蓋得過。
  const breakViews = () => page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-view-case="input"] [data-field-slot="control"] > *')) el.style.setProperty('padding-left', '13px', 'important')
    for (const el of document.querySelectorAll('[data-view-case="radio"] [data-field-slot="control"] [role="group"] > span')) { el.style.setProperty('padding-top', '0', 'important'); el.style.setProperty('padding-bottom', '0', 'important') }
  })
  async function measureViews() {
    return page.evaluate(() => {
      const visible = (el) => {
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
        // 色值可能是 rgb() / rgba() / oklch() / color() —— 只認「明確透明」:transparent、rgba(…, 0)、斜線寫法的 / 0
        const clear = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
        const painted = !clear(cs.backgroundColor) || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && !clear(cs[`border${k}Color`]))
        return el.tagName === 'svg' || el.tagName === 'IMG' || painted
      }
      const rows = []
      for (const wrap of document.querySelectorAll('[data-view-orientation]')) {
        for (const f of wrap.querySelectorAll('[data-view-case]')) {
          const label = f.querySelector('[data-field-slot="label"]')
          const ctrl = f.querySelector('[data-field-slot="control"]')
          if (!label || !ctrl) { rows.push({ orient: wrap.dataset.viewOrientation, key: f.dataset.viewCase, missing: true }); continue }
          const rects = []
          const walker = document.createTreeWalker(ctrl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
          for (let n = walker.currentNode; n; n = walker.nextNode()) {
            if (n.nodeType === 3) {
              if (!n.textContent.trim()) continue
              const r = document.createRange(); r.selectNodeContents(n)
              for (const rr of r.getClientRects()) if (rr.width > 0 && rr.height > 0) rects.push(rr)
            } else if (n !== ctrl && visible(n)) {
              const rr = n.getBoundingClientRect(); if (rr.width > 0 && rr.height > 0) rects.push(rr)
            }
          }
          if (!rects.length) { rows.push({ orient: wrap.dataset.viewOrientation, key: f.dataset.viewCase, empty: true }); continue }
          const left = Math.min(...rects.map((r) => r.left))
          const firstTop = Math.min(...rects.map((r) => r.top))
          const firstLine = rects.filter((r) => r.top < firstTop + 4)
          const center = (Math.min(...firstLine.map((r) => r.top)) + Math.max(...firstLine.map((r) => r.bottom))) / 2
          const sizer = document.createElement('div'); sizer.style.height = 'var(--field-height-md)'; ctrl.appendChild(sizer)
          const fieldHeight = sizer.getBoundingClientRect().height; sizer.remove()
          const c = ctrl.getBoundingClientRect(); const l = label.getBoundingClientRect()
          rows.push({ orient: wrap.dataset.viewOrientation, key: f.dataset.viewCase, labelTag: label.tagName,
            dx: +(left - c.left).toFixed(2), labelDx: +(l.left - c.left).toFixed(2), dy: +(center - (c.top + fieldHeight / 2)).toFixed(2) })
        }
      }
      return rows
    })
  }
  function judgeViews(rows, tag) {
    const bad = []
    for (const r of rows) {
      if (r.missing || r.empty) { bad.push(`${r.orient}/${r.key} ${r.missing ? '找不到標籤或控件欄' : '控件欄裡沒有可見內容'}`); continue }
      const errs = []
      if (Math.abs(r.dx) > VIEW_TOL_X) errs.push(`值左緣離控件欄左緣 ${r.dx}px`)
      if (r.orient === 'vertical' && Math.abs(r.labelDx) > VIEW_TOL_X) errs.push(`標籤左緣離控件欄左緣 ${r.labelDx}px`)
      // 多行 Textarea 的第一行由 Textarea 自己的上下內距定位(field-controls.spec.md「InlineEdit 多行 / padding / 零位移契約」),不量中線
      if (r.key !== 'textarea' && Math.abs(r.dy) > VIEW_TOL_Y) errs.push(`第一行中線離 field-height/2 ${r.dy}px`)
      if (r.labelTag !== 'SPAN') errs.push(`純顯示的標籤是 <${r.labelTag.toLowerCase()}>(沒有輸入框可對,應為 span)`)
      if (errs.length) bad.push(`${r.orient}/${r.key} ${errs.join(';')}`)
      results.push(`  [${tag}] ${r.orient}/${r.key}: dx=${r.dx} dy=${r.dy} label=<${r.labelTag?.toLowerCase()}> ${errs.length ? '❌ ' + errs.join(';') : '✅'}`)
    }
    return bad
  }
  await openStory(page, storyUrl(VIEW_STORY), { waitFor: '[data-view-case="radio"] [data-field-slot="control"]', settleFrames: 10, notFound: server.notFound })
  const viewRows = await measureViews()
  if (viewRows.length !== 36) unmeasured.push(`${VIEW_STORY}(量到 ${viewRows.length} 格,應為 18 種 × 2 = 36)`)
  const viewBad = judgeViews(viewRows, 'view')
  fail += viewBad.length
  // 對照組(同一頁、注入破壞後再量):至少要指名 Input 與 RadioGroup 兩種壞法,否則量具不可信
  await breakViews()
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const controlBad = judgeViews(await measureViews(), 'control')
  const controlNamed = ['vertical/input ', 'horizontal/input ', 'vertical/radio ', 'horizontal/radio '].every((k) => controlBad.some((b) => b.startsWith(k)))
  results.push(`  [control] 注入破壞後紅 ${controlBad.length} 格;${controlNamed ? '✅ 有指名 input / radio 兩種壞法(量具有作用)' : '✗ 沒指名 input / radio —— 量具失效'}`)
  if (!controlNamed) unmeasured.push(`${VIEW_STORY} 對照組沒紅`)

  console.log('\n=== InlineEdit 對齊量測(content.left vs label.left,Δ≤%s 容差)==='.replace('%s', TOL))
  console.log(results.join('\n'))
  if (unmeasured.length) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER} 零量測:${unmeasured.join('、')} —— 這是儀器失效(沒量到),不是產品裁決,也不算對齊`)
  } else {
    console.log(fail === 0 ? '\n✅ 全部對齊(Δ≈0)' : `\n❌ ${fail} 欄未對齊`)
  }

  await browser.close()
} catch (error) {
  if (error instanceof StoryRenderInstrumentError) {
    // story 開不起來 ≠ 沒有未對齊的欄:儀器失效(exit 2),點名 story、附同源 404
    console.error(`✗ ${error.message}`)
    report404()
    console.error('✗ probe-inline-edit-align:儀器失效 —— 這次什麼都沒量到')
    await server.stop()
    process.exit(2)
  }
  report404()
  throw error
} finally {
  await server.stop()
}
if (unmeasured.length) { report404(); process.exit(2) }
if (fail) report404()
process.exit(fail === 0 ? 0 : 1)
