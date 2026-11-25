#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 閱讀情境(field.spec.md「閱讀情境」)畫出來照規格 —— 量像素、讀瀏覽器算好的值,不看 class(M32)。期望值一律從同一份建置讀
 *         (表單欄距 = 頁面上 calc(var(--spacing) * 3)、框內字線 = 頁面上解出來的 --field-bleed、三種標籤色 = 頁面上解出來的語意色),不寫死。
 *         靜態段(不開瀏覽器):
 *         B1  欄位家族的框(field-wrapper / Textarea / InlineEdit)不寫裸 `border` 這類寫死寬度的樣式,框寬讀 --field-border-width
 *         B2  框寬補位的算式讀 --field-border-width,不寫死 1px / 2px(tagPadding、fieldViewGeometry、Textarea 行數上限、InlineEdit 命中區、
 *             LinkInput 延伸區、併排欄位組的重疊、--field-control-py-*、DataTable --table-cell-py)
 *         S2  field.tsx 內縮規則寫的屬性名 = field-context.ts 的 FIELD_FRAMELESS_VALUE_ATTR
 *         S3  閱讀情境的判斷只住 components/Field/field.css 一處(該檔每條規則的判斷一字不差),而且由對外彙總檔 styles/tokens.css 匯入
 *         S4  --field-border-width = 1px、--field-bleed = calc(框寬 + --field-px)、InlineEdit 垂直外伸與可編輯標題列讓位都讀 --field-bleed
 *         瀏覽器段(真實情境「閱讀情境:工作項目與行事曆事件詳情」+ 邊界「閱讀情境驗證」,淺 / 深 × 不指定 / sm / md):
 *         G1  值線:閱讀範圍每一列靜止時第一個看得見的東西(字用 DOM 文字範圍、不用字形墨跡;輸入框用內容盒)
 *             標籤在左 = 控件欄左緣 + --field-bleed(框內字線),標籤在上 = 標籤左緣,±0.5;文字列進編輯後字的位置不變 ±0.5(零跳)。
 *             InlineEdit 各範例裡的 Field 也量(取代手動探針 probe-inline-edit-align.mjs 第一組);
 *         G1-V Field 層純顯示「純顯示齊標籤驗證」18 種 × 兩種標籤位置(取代探針第二組;不在閱讀情境,行為不變)
 *         G2  標籤↔框:滑過的底色(截圖差分)與編輯中的輸入框,標籤在左時左緣 ≥ 控件欄左緣(離標籤欄 = 表單欄距 12),標籤在上時離標籤下緣 ≥ 欄內間距
 *         CONT 框(靜止 / 編輯中)不出容器的內緣(容器左右內距 ≥ --field-bleed);InlineEdit 各範例一併掃
 *         G3  三者同色:閱讀標籤 = DescriptionList dt = DataTable 表頭 = --fg-secondary;閱讀範圍裡停用的列 = --fg-disabled
 *         G4  一般表單不變:標籤 = --foreground(停用 --fg-disabled)、欄距 = 表單欄距、開關 / 勾選框在控件欄左緣、輸入框字在框內字線、列高 = 該尺寸
 *             (G3 / G4 的期望色在每一列標籤自己所在的主題下解。主題套層格:夾具裡閱讀與表單各幾列再套一層另一個主題的 data-theme,
 *             標籤色要跟著那一層 —— 格名「主題套層:」;那幾列沒真的換到另一個主題 = 儀器失效)
 *             「對基準圖」那一半不在本閘:像素基準圖只在釘死的容器裡比(本機 / 一般 runner 的字型渲染會浮動,visual-regression.yml 檔頭
 *             2026-09-22),一般表單的基準場景 = scripts/visual-assertions.json 的 field-mixed-control-alignment(淺 / 深;改動前就有的 story,
 *             重拍帶 reference_ref 時同一個容器比改動前後),不是 PR 必過檢查。本閘只比同一份建置算出來的值。
 *         G5  編輯中不翻轉:範圍裡唯一的就地編輯進編輯後,同範圍的標籤色、開關 / 勾選框位置、列高都不變;點外面回到靜止(取代探針的 blur-exit)
 *         G6  同組同高:閱讀範圍裡每一列的控件槽高 = 該尺寸欄位高(不指定 = sm,跟 InlineEdit 的偏好)
 *         G8  首繪:story 第一次把列交進 DOM 的那個微任務就已經是對的列高、標籤色、開關內縮
 *         G9  token:--field-bleed = --field-px + --field-border-width;就地編輯外框與輸入框畫出來的框寬 = --field-border-width;
 *             EDITABLE_TITLE_HEADER_SLOT 的 --surface-title-bleed 解出來 = --field-bleed
 *         SC  範圍 = 最外層 FieldGroup:巢狀組(外層就地編輯、內層只有輸入框 N2)內層與外層同色同高,頁面上沒有範圍套在範圍裡;不在組裡的 Field 範圍是自己
 *   紅: --selftest 逐一注入(每個都必須讓預期的格紅;清單與預期紅的格 = 下方 STATIC_MUTANTS / MUTANTS,本段不寫個數):
 *       靜態段(裸 border、補位寫死、屬性名不同、判斷寫兩處、field.css 兩條判斷不一致、bleed 公式、標題讓位讀 --field-px),
 *       瀏覽器段(某一列字推 4px 只有那列紅、垂直外伸改回 12、沒有框的值不內縮、拿掉標籤判斷、判斷過寬、標籤色在範圍元素上先算好
 *       (主題套層跟不上,沒套層的列照綠)、編輯中跳字、水平框壓進標籤 1px、容器內距 12、記號只掛靜止外框、同組列高跑掉、
 *       列高晚一個計時器才到、bleed 公式只剩內距、框寬 2px、標題讓位斷開、範圍改成最近一層、純顯示補回左內距 13)
 *   綠: 全部照規格時 exit 0。開 story 走 lib/launch-browser.mjs openStory(等 Storybook 回報渲染完成與被量的列本身出現,不睡固定時間);
 *       開不起來 / 回 0 筆 = 儀器失效(INSTRUMENT-FAIL,exit 1 並點名),不讀成通過。
 */
// 用法:node scripts/reading-context-invariant.mjs [--build=<dir>] [--selftest] [--report] [--static-only]
//   --report:另印量測表(水平 / 垂直 × 一般 / 滑過 / 編輯中 × 淺 / 深 × sm / md)
//   --build:量別的建置(例:改動前的建置,拿來證明首繪閘在舊寫法上會紅);不檢查建置新舊
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, parkPointer, requireFreshStorybookBuild, requireStorybookBuild, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const SELFTEST = process.argv.includes('--selftest')
const REPORT = process.argv.includes('--report')
const STATIC_ONLY = process.argv.includes('--static-only')
const DS = 'packages/design-system/src'
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')

const near = (a, b, tol = 0.5) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n))
const results = []
const instrumentFails = []
const check = (id, ok, detail) => { results.push({ id, ok: Boolean(ok), detail }); if (!ok || process.env.READING_CONTEXT_VERBOSE) console.log(`${ok ? '✓' : '✗'} ${id}:${detail}`) }

// ══ 靜態段 ════════════════════════════════════════════════════════════════════════════════
const FRAME_FILES = [`${DS}/components/Field/field-wrapper.tsx`, `${DS}/components/Textarea/textarea.tsx`, `${DS}/components/InlineEdit/inline-edit.tsx`]
const COMPENSATION = [
  { file: `${DS}/components/Field/field-wrapper.tsx`, re: /_-_2px/g, what: 'tagPadding / fieldViewGeometry 的「扣 2px 邊框」寫死' },
  { file: `${DS}/components/Textarea/textarea.tsx`, re: /\+ 2px\)/g, what: 'Textarea 行數上限的「上下兩條框」寫死' },
  { file: `${DS}/components/InlineEdit/inline-edit.tsx`, re: /-inset-px\b/g, what: 'InlineEdit 命中區多蓋的一圈寫死' },
  { file: `${DS}/components/LinkInput/link-input.tsx`, re: /-inset-px\b/g, what: 'LinkInput 延伸區多蓋的一圈寫死' },
  { file: `${DS}/components/FieldControlGroup/field-control-group.tsx`, re: /-ml-px\b/g, what: '併排欄位組的重疊寫死' },
  { file: `${DS}/tokens/uiSize/uiSize.css`, re: /--field-control-py-(?:sm|md|lg):[^;]*- 1px\)/g, what: '--field-control-py-* 的框寬寫死' },
  { file: `${DS}/components/DataTable/data-table.css`, re: /--table-cell-py:[^;]*- 1px\)/g, what: '--table-cell-py 的框寬寫死' },
]
const STATIC_FILES = [...new Set([...FRAME_FILES, ...COMPENSATION.map((c) => c.file),
  `${DS}/components/Field/field.tsx`, `${DS}/components/Field/field-context.ts`, `${DS}/components/Field/field.css`, `${DS}/styles/tokens.css`,
  `${DS}/patterns/overlay-surface/overlay-surface.tsx`])]
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
/** 讀樹裡所有 .tsx / .ts / .css(S3 判斷只住一處用;stories / 測試不算) */
function scanSources(dir = path.join(REPO, DS), out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') scanSources(full, out); continue }
    if (!/\.(tsx|ts|css)$/.test(entry.name) || /\.stories\.tsx$|\.test\./.test(entry.name)) continue
    out.set(path.relative(REPO, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'))
  }
  return out
}
function staticChecks(files) {
  const out = []
  const put = (id, ok, detail) => out.push({ id, ok, detail })
  // B1 裸寬度的 border
  for (const file of FRAME_FILES) {
    const code = stripComments(files.get(file) ?? '')
    const hits = [...code.matchAll(/(?<=['"`\s:!])border(?:-[xytrbl])?(?:-(?:px|0|2|4|8))?(?=['"`\s,\]])/g)].map((m) => m[0])
    const arbitrary = [...code.matchAll(/(?<=['"`\s:!])border(?:-[xytrbl])?-\[(?!length:var\(--field-border-width\)\])[^\]]*\]/g)].map((m) => m[0])
    put(`B1:${path.basename(file)}`, hits.length + arbitrary.length === 0, hits.length + arbitrary.length ? `寫死寬度的 border:${[...hits, ...arbitrary].join(' / ')}(改讀 border-[length:var(--field-border-width)])` : '框寬都讀 --field-border-width')
  }
  // B2 框寬補位寫死
  for (const c of COMPENSATION) {
    const n = [...stripComments(files.get(c.file) ?? '').matchAll(c.re)].length
    put(`B2:${path.basename(c.file)}`, n === 0, n ? `${c.what} ${n} 處(改讀 --field-border-width)` : '讀 --field-border-width')
  }
  // S2 屬性名兩邊同名
  const attr = (files.get(`${DS}/components/Field/field-context.ts`) ?? '').match(/FIELD_FRAMELESS_VALUE_ATTR = '([^']+)'/)?.[1]
  const fieldTsx = files.get(`${DS}/components/Field/field.tsx`) ?? ''
  put('S2:沒有框的值記號同名', Boolean(attr) && fieldTsx.includes(`[&_[${attr}]]:ml-[var(--scope-value-inset,0px)]`),
    attr ? `field-context.ts 記號 ${attr};field.tsx 內縮規則${fieldTsx.includes(`[&_[${attr}]]`) ? '同名' : '不同名'}` : '找不到 FIELD_FRAMELESS_VALUE_ATTR')
  // S3 判斷只住一處 + 進彙總檔。field.css 的效果分兩條規則寫在讀者身上(標籤 / 沒有框的值,理由在該檔檔頭),
  // 每條規則提到 data-field-reading 的選擇器都必須以同一句判斷開頭 —— 兩條各寫各的判斷,改一條漏一條就分岔
  const JUDGE = '[data-field-scope]:has([data-field-reading])'
  const owner = `${DS}/components/Field/field.css`
  const judged = [...stripComments(files.get(owner) ?? '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim())).filter((s) => s.includes('data-field-reading'))
  const drift = judged.filter((s) => !s.startsWith(`${JUDGE} `))
  const elsewhere = [...files].filter(([f, src]) => f !== owner && /(:has\(\[data-field-reading|has-\[\[data-field-reading|:has\(\[data-field-scope)/.test(stripComments(src))).map(([f]) => f)
  const aggregated = (files.get(`${DS}/styles/tokens.css`) ?? '').includes("@import './../components/Field/field.css';")
  put('S3:判斷只住 field.css', judged.length > 0 && drift.length === 0 && elsewhere.length === 0 && aggregated,
    `field.css 用到判斷的選擇器 ${judged.length} 條${drift.length ? `,其中跟「${JUDGE}」不同:${drift.join(' / ')}` : '(同一句判斷)'};別處 ${elsewhere.length ? elsewhere.join(', ') : '0'};彙總檔${aggregated ? '有' : '沒有'}匯入`)
  // S4 token 公式與讀者
  const ui = files.get(`${DS}/tokens/uiSize/uiSize.css`) ?? ''
  const ie = files.get(`${DS}/components/InlineEdit/inline-edit.tsx`) ?? ''
  const os = files.get(`${DS}/patterns/overlay-surface/overlay-surface.tsx`) ?? ''
  const s4 = [
    [/--field-border-width: 1px;/.test(ui), '--field-border-width 不是 1px'],
    [ui.includes('--field-bleed: calc(var(--field-border-width) + var(--field-px));'), '--field-bleed 不是 calc(var(--field-border-width) + var(--field-px))'],
    [ie.includes("'-mx-[var(--field-bleed)] w-[calc(100%_+_2_*_var(--field-bleed))]'"), 'InlineEdit 垂直外伸沒讀 --field-bleed'],
    [/EDITABLE_TITLE_HEADER_SLOT = '[^']*\[--surface-title-bleed:var\(--field-bleed\)\]/.test(os), 'EDITABLE_TITLE_HEADER_SLOT 的標題讓位沒讀 --field-bleed'],
  ].filter(([ok]) => !ok).map(([, why]) => why)
  put('S4:token 公式與讀者', s4.length === 0, s4.length ? s4.join(';') : '框寬 1px、bleed = 框寬 + 內距、外伸與標題讓位都讀 bleed')
  return out
}
function runStatic() {
  const files = new Map(STATIC_FILES.map((f) => [f, read(f)]))
  for (const [f, src] of scanSources()) if (!files.has(f)) files.set(f, src)
  return { files, rows: staticChecks(files) }
}
const STATIC_MUTANTS = [
  { name: '欄位框寫回裸 border', expect: 'B1:field-wrapper.tsx', file: `${DS}/components/Field/field-wrapper.tsx`, from: "'bg-surface border-[length:var(--field-border-width)] border-border'", to: "'bg-surface border border-border'" },
  { name: 'InlineEdit 命中區寫回 -inset-px', expect: 'B2:inline-edit.tsx', file: `${DS}/components/InlineEdit/inline-edit.tsx`, from: '-inset-[var(--field-border-width)]', to: '-inset-px' },
  { name: '--field-control-py-md 寫回 − 1px', expect: 'B2:uiSize.css', file: `${DS}/tokens/uiSize/uiSize.css`, from: '--field-control-py-md: calc((var(--field-height-md) - 1lh) / 2 - var(--field-border-width));', to: '--field-control-py-md: calc((var(--field-height-md) - 1lh) / 2 - 1px);' },
  { name: '內縮規則的屬性名跟記號不同名', expect: 'S2:沒有框的值記號同名', file: `${DS}/components/Field/field.tsx`, from: '[&_[data-field-frameless-value]]', to: '[&_[data-field-frameless]]' },
  { name: '判斷多寫一份在 InlineEdit', expect: 'S3:判斷只住 field.css', file: `${DS}/components/InlineEdit/inline-edit.tsx`, from: "'relative flex min-w-0 rounded-md", to: "'[[data-field-scope]:has([data-field-reading])_&]:text-fg-secondary relative flex min-w-0 rounded-md" },
  { name: 'field.css 兩條規則的判斷不一致(只改了沒有框的值那一條)', expect: 'S3:判斷只住 field.css', file: `${DS}/components/Field/field.css`, from: '[data-field-scope]:has([data-field-reading]) [data-field-frameless-value]', to: '[data-field-scope]:has([data-field-reading][data-editing="false"]) [data-field-frameless-value]' },
  { name: '--field-bleed 只剩內距', expect: 'S4:token 公式與讀者', file: `${DS}/tokens/uiSize/uiSize.css`, from: '--field-bleed: calc(var(--field-border-width) + var(--field-px));', to: '--field-bleed: var(--field-px);' },
  { name: '標題讓位讀回 --field-px', expect: 'S4:token 公式與讀者', file: `${DS}/patterns/overlay-surface/overlay-surface.tsx`, from: '[--surface-title-bleed:var(--field-bleed)]', to: '[--surface-title-bleed:var(--field-px)]' },
]

const staticBase = runStatic()
if (SELFTEST) {
  let staticCaught = 0
  const baseRed = staticBase.rows.filter((r) => !r.ok)
  if (baseRed.length) { console.log(`✗ 靜態段現況就紅(對照組無從比較):${baseRed.map((r) => `${r.id} ${r.detail}`).join(';')}`) }
  for (const m of STATIC_MUTANTS) {
    const files = new Map(staticBase.files)
    const src = files.get(m.file) ?? ''
    if (!src.includes(m.from)) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER} 靜態對照組「${m.name}」的注入點不在(${m.file})—— 先修對照組`); continue }
    files.set(m.file, src.replace(m.from, m.to))
    const red = staticChecks(files).filter((r) => !r.ok).map((r) => r.id)
    const ok = red.includes(m.expect)
    if (ok) staticCaught++
    console.log(`${ok ? '✓' : '✗'} 靜態對照組「${m.name}」:紅的格 ${red.join(' / ') || '(無)'}`)
  }
  if (staticCaught !== STATIC_MUTANTS.length || baseRed.length) { console.log('✗ reading-context selftest:靜態段對照組沒照預期'); process.exit(1) }
} else {
  for (const r of staticBase.rows) check(r.id, r.ok, r.detail)
}
if (STATIC_ONLY) {
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length ? `✗ reading-context 靜態段 ${failed.length} 格失敗` : `✅ reading-context 靜態段 PASS(${staticBase.rows.length} 格)`)
  process.exit(failed.length ? 1 : 0)
}

// ══ 瀏覽器段 ══════════════════════════════════════════════════════════════════════════════
const buildArg = arg('build')
const STATIC = buildArg ? path.resolve(process.cwd(), buildArg) : path.join(REPO, 'storybook-static')
requireStorybookBuild(path.join(STATIC, 'index.json'))
if (!buildArg) {
  requireFreshStorybookBuild(STATIC, [
    `${DS}/components/Field`, `${DS}/components/InlineEdit`, `${DS}/components/Switch/switch.tsx`, `${DS}/components/Checkbox/checkbox.tsx`,
    `${DS}/tokens/uiSize/uiSize.css`, `${DS}/styles/tokens.css`, `${DS}/patterns/overlay-surface/overlay-surface.tsx`,
  ])
}
const TITLE_SLOT_CLASS = (read(`${DS}/patterns/overlay-surface/overlay-surface.tsx`).match(/EDITABLE_TITLE_HEADER_SLOT = '([^']+)'/) ?? [])[1] ?? ''
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const index = JSON.parse(fs.readFileSync(path.join(server.servedRoot ?? STATIC, 'index.json'), 'utf8'))
const entries = Object.values(index.entries).filter((e) => e.type === 'story')
const storyId = (re) => entries.find((e) => re.test(e.id))?.id
const STORY = {
  detail: storyId(/field-展示--reading-context-detail$/u),
  fixture: storyId(/field-展示--reading-context-contract$/u),
  view: storyId(/field-展示--view-alignment-contract$/u),
  table: storyId(/datatable-展示--pinned-columns$/u),
}
const SWEEP = entries.filter((e) => /\/InlineEdit\//.test(e.importPath ?? '') && !/--commit-on-host-unmount$/.test(e.id)).map((e) => e.id)

const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const context = await browser.newContext({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 })
const page = await context.newPage()

// ── 頁面端(evaluate 序列化傳入,不得引用外部變數)────────────────────────────────────────
// 首繪紀錄(網址帶 rcFirstFrame=1 才裝):MutationObserver 第一次看到 RH 卡的列時就量 —— React 交出 DOM 之後的那個微任務
const FIRST_FRAME_INIT = () => {
  if (!location.search.includes('rcFirstFrame=1')) return
  window.__readingFirstFrame = null
  const measure = () => {
    if (window.__readingFirstFrame) return true
    const rows = [...document.querySelectorAll('[data-reading-set="RH"] [data-probe][data-kind]')]
    if (rows.length < 7) return false
    window.__readingFirstFrame = rows.map((f) => {
      const slot = f.querySelector('[data-field-slot="control"]')
      const fv = f.querySelector('[data-field-frameless-value]')
      return { kind: f.dataset.kind, h: slot?.getBoundingClientRect().height ?? NaN, color: getComputedStyle(f.querySelector('[data-field-slot="label"]')).color,
        inset: fv ? fv.getBoundingClientRect().left - slot.getBoundingClientRect().left : null }
    })
    return true
  }
  const mo = new MutationObserver(() => { if (measure()) mo.disconnect() })
  mo.observe(document, { subtree: true, childList: true })
}
// 對照組:開關 / 勾選列的列高晚一個計時器才到(網址帶 rcLate=1 才裝;排在首繪紀錄之前裝 → 同一批回呼裡先跑)
const LATE_INIT = () => {
  if (!location.search.includes('rcLate=1')) return
  const mo = new MutationObserver(() => {
    const slots = [...document.querySelectorAll('[data-reading-set="RH"] [data-kind="switch"] [data-field-slot="control"], [data-reading-set="RH"] [data-kind="checkbox"] [data-field-slot="control"]')]
    if (slots.length < 2) return
    mo.disconnect()
    for (const s of slots) s.style.setProperty('min-height', 'var(--field-height-md)', 'important')
    setTimeout(() => { for (const s of slots) s.style.removeProperty('min-height') }, 0)
  })
  mo.observe(document, { subtree: true, childList: true })
}
await page.addInitScript(LATE_INIT)
await page.addInitScript(FIRST_FRAME_INIT)

const ROWS_READY = () => document.querySelectorAll('[data-reading-set] [data-probe][data-kind]').length >= 7
/** 量一頁:每列的標籤、控件槽、值線、外框、範圍;頁面上的參照值 */
const PROBE = (titleSlotClass) => {
  const body = document.body
  const resolveLen = (expr) => { const el = document.createElement('div'); el.style.cssText = `position:absolute;visibility:hidden;width:${expr}`; body.appendChild(el); const v = parseFloat(getComputedStyle(el).width); el.remove(); return v }
  const resolveColor = (expr) => { const el = document.createElement('span'); el.style.color = expr; body.appendChild(el); const v = getComputedStyle(el).color; el.remove(); return v }
  const rect = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height } }
  const clear = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
  const painted = (el) => {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
    return el.tagName === 'svg' || el.tagName === 'IMG' || !clear(cs.backgroundColor)
      || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && !clear(cs[`border${k}Color`]))
  }
  const contentLeft = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) }
  // 控件槽裡第一個看得見的東西:字 = DOM 文字範圍左緣(不是字形墨跡);輸入框 = 內容盒左緣;元素 = 畫得出來的盒子
  const firstVisible = (slot, kind) => {
    if (kind === 'input') { const i = slot.querySelector('input, textarea'); return i ? contentLeft(i) : null }
    const rects = []
    const walker = document.createTreeWalker(slot, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    for (let n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        if (!n.textContent.trim()) continue
        const r = document.createRange(); r.selectNodeContents(n)
        for (const rr of r.getClientRects()) if (rr.width > 0 && rr.height > 0) rects.push(rr)
      } else if (n !== slot && painted(n)) {
        const rr = n.getBoundingClientRect(); if (rr.width > 1 && rr.height > 1) rects.push(rr)
      }
    }
    return rects.length ? Math.min(...rects.map((r) => r.left)) : null
  }
  // 框的容器 = 最近一個會裁切或畫得出來的祖先(Field / FieldGroup 本身不算);內緣 = padding box
  const containerOf = (el) => {
    for (let n = el.parentElement; n && n !== body; n = n.parentElement) {
      if (n.hasAttribute('data-field-orientation') || n.hasAttribute('data-field-group') || n.hasAttribute('data-field-slot')) continue
      const cs = getComputedStyle(n)
      if (cs.overflowX !== 'visible' || painted(n)) { const r = n.getBoundingClientRect(); return { left: r.left + parseFloat(cs.borderLeftWidth), right: r.right - parseFloat(cs.borderRightWidth), tag: n.dataset.readingSet ?? n.tagName } }
    }
    return { left: 0, right: document.documentElement.clientWidth, tag: 'viewport' }
  }
  // 標籤自己所在主題的三種期望色:在標籤裡放一個暫時的 span 解 var() —— 範圍裡再套一層 data-theme 時,期望色是那一層的
  const themedColors = (label) => {
    const s = document.createElement('span'); label.appendChild(s)
    const at = (expr) => { s.style.color = expr; return getComputedStyle(s).color }
    const out = { fg: at('var(--foreground)'), fgSecondary: at('var(--fg-secondary)'), fgDisabled: at('var(--fg-disabled)') }
    s.remove(); return out
  }
  const rows = [...document.querySelectorAll('[data-reading-set] [data-probe][data-kind]')].map((f) => {
    const label = f.querySelector(':scope > [data-field-slot="label"]')
    const slot = f.querySelector('[data-field-slot="control"]')
    const scope = f.closest('[data-field-scope]')
    const frame = f.querySelector('[data-editing="false"]')
    const fv = f.querySelector('[data-field-frameless-value]')
    const cs = getComputedStyle(f)
    // 範圍與標籤之間(含這一列、含標籤本身,不含範圍)有沒有另一層主題邊界
    let nestedTheme = false
    if (scope && label) for (let n = label; n && n !== scope; n = n.parentElement) if (n.hasAttribute('data-theme')) { nestedTheme = true; break }
    return {
      set: f.closest('[data-reading-set]').dataset.readingSet, probe: f.dataset.probe, kind: f.dataset.kind, orientation: f.dataset.fieldOrientation,
      disabled: f.hasAttribute('data-field-disabled'),
      label: label ? { ...rect(label), color: getComputedStyle(label).color } : null,
      expect: label ? themedColors(label) : null, nestedTheme,
      slot: slot ? rect(slot) : null,
      valueLeft: slot ? firstVisible(slot, f.dataset.kind) : null,
      framelessLeft: fv ? fv.getBoundingClientRect().left : null,
      frame: frame ? { ...rect(frame), borderLeft: parseFloat(getComputedStyle(frame).borderLeftWidth), marginLeft: parseFloat(getComputedStyle(frame).marginLeft), container: containerOf(frame) } : null,
      inputBorder: f.dataset.kind === 'input' && f.querySelector('[data-field-mode="edit"]') ? parseFloat(getComputedStyle(f.querySelector('[data-field-mode="edit"]')).borderLeftWidth) : null,
      columnGap: parseFloat(cs.columnGap), rowGap: parseFloat(cs.rowGap),
      scopeIsGroup: scope ? scope.hasAttribute('data-field-group') : null, scopeIsSelf: scope === f,
      scopeNested: scope ? Boolean(scope.parentElement?.closest('[data-field-scope]')) : null,
    }
  })
  const dt = document.querySelector('[data-reading-set="REF"] dt')
  // 可編輯標題列的讓位:套上 EDITABLE_TITLE_HEADER_SLOT 的 class(同一份建置產生的樣式),量 --surface-title-bleed 解出來多寬
  const slotProbe = document.createElement('div'); slotProbe.setAttribute('data-title-slot-probe', ''); slotProbe.className = titleSlotClass
  const inner = document.createElement('div'); inner.style.cssText = 'position:absolute;visibility:hidden;width:var(--surface-title-bleed, 0px)'
  slotProbe.appendChild(inner); body.appendChild(slotProbe)
  const titleBleed = inner.getBoundingClientRect().width; slotProbe.remove()
  return {
    rows,
    nestedScopes: document.querySelectorAll('[data-field-scope] [data-field-scope]').length,
    refs: {
      formGap: resolveLen('calc(var(--spacing) * 3)'),
      fieldPx: resolveLen('var(--field-px)'), borderWidth: resolveLen('var(--field-border-width)'), bleed: resolveLen('var(--field-bleed)'),
      heights: { sm: resolveLen('var(--field-height-sm)'), md: resolveLen('var(--field-height-md)'), lg: resolveLen('var(--field-height-lg)') },
      fg: resolveColor('var(--foreground)'), fgSecondary: resolveColor('var(--fg-secondary)'), fgDisabled: resolveColor('var(--fg-disabled)'),
      dtColor: dt ? getComputedStyle(dt).color : null, titleBleed,
    },
    firstFrame: window.__readingFirstFrame ?? null,
  }
}

async function open(id, { theme = 'light', size = 'unset', label = id, css = null, dom = null, flags = '', waitFor = ROWS_READY, probe = PROBE, probeArg = TITLE_SLOT_CLASS } = {}) {
  if (!id) { instrumentFails.push({ cell: label, detail: '找不到 story(改名了?)' }); return null }
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent(`theme:${theme};density:md`)}${size !== 'unset' ? `&args=${encodeURIComponent(`size:${size}`)}` : ''}${flags}`
  try {
    const opened = await openStory(page, url, {
      waitFor, settleFrames: 6, notFound: server.notFound, label, probe, probeArg,
      // 指標停到不會觸發滑過的地方再量:導覽不會移動滑鼠,上一頁停的位置換了版面可能剛好落在某個就地編輯框上(滑過底色會被當成值)
      beforeSettle: async (p) => { await parkPointer(p); if (css) await p.addStyleTag({ content: css }); if (dom) await p.evaluate(dom) },
    })
    return opened.probe
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrumentFails.push({ cell: label, detail: error.message })
    return null
  }
}
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
const shot = async (clip) => PNG.sync.read(await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }))
/** 兩張同區域截圖:回傳有變的像素的最左 / 最上(CSS px) */
function diffBounds(a, b, clip, scale = 2) {
  let minX = Infinity, minY = Infinity, count = 0
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 4) { count++; if (x < minX) minX = x; if (y < minY) minY = y }
  }
  return count ? { left: clip.x + minX / scale, top: clip.y + minY / scale, count } : null
}

const READING = ['RH', 'RV', 'ONE', 'WRAP', 'N2', 'S1', 'DIS']
const FORM = ['FH', 'FV']
const RUNS = [
  { theme: 'light', size: 'unset' }, { theme: 'light', size: 'sm' }, { theme: 'light', size: 'md' },
  { theme: 'dark', size: 'unset' }, { theme: 'dark', size: 'sm' }, { theme: 'dark', size: 'md' },
]
const tableHeaderColor = {}
const report = []

/** 靜態量測(每個 run 一次):G1 / G3 / G4 / G6 / G8 / G9 / SC / CONT */
function judgeStatic(p, run, { only = null } = {}) {
  const tag = `${run.theme}/${run.size}`
  const want = (g) => !only || only.includes(g)
  const { rows, refs } = p
  if (rows.length < 7) { instrumentFails.push({ cell: tag, detail: `只量到 ${rows.length} 列` }); return }
  const readingH = refs.heights[run.size === 'md' ? 'md' : 'sm']
  const formH = refs.heights[run.size === 'sm' ? 'sm' : 'md']
  const reading = rows.filter((r) => READING.includes(r.set))
  const form = rows.filter((r) => FORM.includes(r.set))
  const line = (r) => (r.orientation === 'horizontal' ? r.slot.left + refs.bleed : r.label.left)
  if (want('G1')) for (const r of reading) {
    if (!r.slot || !r.label || r.valueLeft == null) { check(`G1:${r.probe}`, false, `${tag} 控件槽 / 標籤 / 值沒量到`); continue }
    check(`G1:${r.probe}`, near(r.valueLeft, line(r)), `${tag} 值左緣 − 值線(${r.orientation === 'horizontal' ? '控件欄左緣 + 框內字線' : '標籤左緣'})= ${f2(r.valueLeft - line(r))}`)
  }
  if (want('G3')) {
    if (p.refs.dtColor != null) check(`G3:dt:${run.theme}`, refs.dtColor === refs.fgSecondary, `${tag} DescriptionList dt ${refs.dtColor} vs --fg-secondary ${refs.fgSecondary}`)
    if (tableHeaderColor[run.theme]) check(`G3:表頭:${run.theme}`, tableHeaderColor[run.theme] === refs.fgSecondary, `${tag} DataTable 表頭 ${tableHeaderColor[run.theme]} vs --fg-secondary ${refs.fgSecondary}`)
    // 期望色在標籤自己所在的主題下解(r.expect);主題套層的列格名多「主題套層:」
    for (const r of reading) {
      const ex = r.expect ?? refs
      const want_ = r.disabled ? ex.fgDisabled : ex.fgSecondary
      check(`G3:${r.nestedTheme ? '主題套層:' : ''}${r.probe}`, r.label?.color === want_,
        `${tag}${r.nestedTheme ? '(這一列套了另一層主題)' : ''} 閱讀${r.disabled ? '(停用)' : ''}標籤 ${r.label?.color} vs ${r.disabled ? '--fg-disabled' : '--fg-secondary'} ${want_}`)
    }
  }
  if (want('G4')) for (const r of form) {
    const ex = r.expect ?? refs
    check(`G4:色:${r.nestedTheme ? '主題套層:' : ''}${r.probe}`, r.label?.color === (r.disabled ? ex.fgDisabled : ex.fg),
      `${tag}${r.nestedTheme ? '(這一列套了另一層主題)' : ''} 表單標籤 ${r.label?.color} vs ${r.disabled ? '--fg-disabled' : '--foreground'} ${r.disabled ? ex.fgDisabled : ex.fg}`)
    if (r.orientation === 'horizontal') check(`G4:欄距:${r.probe}`, near(r.columnGap, refs.formGap), `${tag} 表單欄距 ${f2(r.columnGap)} vs ${f2(refs.formGap)}`)
    const expectLeft = r.kind === 'input' ? r.slot.left + refs.bleed : r.slot.left
    check(`G4:位置:${r.probe}`, near(r.valueLeft, expectLeft), `${tag} 值左緣 − ${r.kind === 'input' ? '框內字線' : '控件欄左緣'} = ${f2(r.valueLeft - expectLeft)}`)
    check(`G4:列高:${r.probe}`, near(r.slot.height, formH), `${tag} 控件槽高 ${f2(r.slot.height)} vs ${run.size === 'sm' ? 'sm' : 'md'} ${f2(formH)}`)
  }
  if (want('G6')) for (const set of READING) {
    const hs = reading.filter((r) => r.set === set).map((r) => r.slot?.height)
    if (!hs.length) continue
    check(`G6:${set}`, hs.every((h) => near(h, readingH)), `${tag} 控件槽高 ${[...new Set(hs.map(f2))].join(' / ')} vs ${run.size === 'md' ? 'md' : 'sm'} ${f2(readingH)}`)
  }
  if (want('SC') && rows.some((r) => r.set === 'N2')) {
    check('SC:不巢狀', p.nestedScopes === 0, `${tag} 套在另一個範圍裡的範圍 ${p.nestedScopes} 個`)
    const n2 = rows.filter((r) => r.set === 'N2')
    const colors = [...new Set(n2.map((r) => r.label?.color))], hs = [...new Set(n2.map((r) => f2(r.slot?.height)))]
    check('SC:N2', n2.length === 3 && n2.every((r) => r.scopeIsGroup && !r.scopeNested) && colors.length === 1 && colors[0] === refs.fgSecondary && hs.length === 1,
      `${tag} 內外層標籤色 ${colors.join(' / ')}、列高 ${hs.join(' / ')}(範圍 = 最外層 FieldGroup:${n2.map((r) => (r.scopeIsGroup ? 'group' : 'self')).join(' ')})`)
    const s1 = rows.find((r) => r.set === 'S1')
    if (s1) check('SC:S1', s1.scopeIsSelf, `${tag} 不在組裡的 Field 範圍 = ${s1.scopeIsSelf ? '自己' : '別人'}`)
  }
  if (want('G9')) {
    check(`G9:公式:${tag}`, near(refs.bleed, refs.fieldPx + refs.borderWidth, 0.01), `--field-bleed ${f2(refs.bleed)} vs --field-px ${f2(refs.fieldPx)} + --field-border-width ${f2(refs.borderWidth)}`)
    const frames = rows.filter((r) => r.frame).map((r) => r.frame.borderLeft)
    const inputs = rows.filter((r) => r.kind === 'input' && Number.isFinite(r.inputBorder)).map((r) => r.inputBorder)
    if (frames.length) check(`G9:框寬:${tag}`, frames.every((w) => near(w, refs.borderWidth, 0.01)) && inputs.every((w) => near(w, refs.borderWidth, 0.01)),
      `就地編輯外框 ${[...new Set(frames.map(f2))].join(' / ')}、輸入框 ${[...new Set(inputs.map(f2))].join(' / ') || '(本頁無)'} vs --field-border-width ${f2(refs.borderWidth)}`)
    check(`G9:標題讓位:${tag}`, near(refs.titleBleed, refs.bleed, 0.01), `EDITABLE_TITLE_HEADER_SLOT 的 --surface-title-bleed ${f2(refs.titleBleed)} vs --field-bleed ${f2(refs.bleed)}`)
  }
  if (want('CONT')) for (const r of rows.filter((x) => x.frame && x.frame.marginLeft < 0)) {
    const c = r.frame.container
    check(`CONT:${r.probe}`, r.frame.left >= c.left - 0.5 && r.frame.right <= c.right + 0.5, `${tag} 框 ${f2(r.frame.left)}–${f2(r.frame.right)} vs 容器(${c.tag})內緣 ${f2(c.left)}–${f2(c.right)}`)
  }
  if (want('G8') && p.firstFrame) {
    const ff = p.firstFrame
    const insets = ff.filter((r) => r.inset != null).map((r) => r.inset)
    const colors = [...new Set(ff.map((r) => r.color))]
    check(`G8:${tag}`, ff.every((r) => near(r.h, readingH)) && colors.length === 1 && colors[0] === refs.fgSecondary && insets.length === 2 && insets.every((x) => near(x, refs.bleed)),
      `第一次交出 DOM 時:控件槽高 ${[...new Set(ff.map((r) => f2(r.h)))].join(' / ')}(應 ${f2(readingH)})、標籤色 ${colors.join(' / ')}、開關 / 勾選框內縮 ${insets.map(f2).join(' / ')}(應 ${f2(refs.bleed)})`)
  }
  if (REPORT && (p.rows.some((r) => r.set === 'RH'))) {
    for (const set of ['RH', 'RV']) for (const r of rows.filter((x) => x.set === set)) {
      report.push({ run: tag, set, row: r.probe.split(':')[1], kind: r.kind, state: '一般', valueLine: r.valueLeft - line(r), height: r.slot.height, color: r.label.color === refs.fgSecondary ? 'fg-secondary' : r.label.color })
    }
  }
}

/** 互動量測(滑過 / 編輯中):G1 進編輯、G2、CONT(編輯中)、G5 */
async function judgeInteractive(p, run, probes, { only = null } = {}) {
  const tag = `${run.theme}/${run.size}`
  const want = (g) => !only || only.includes(g)
  const byProbe = Object.fromEntries(p.rows.map((r) => [r.probe, r]))
  const sel = (probe) => `[data-probe="${probe}"]`
  for (const probe of probes) {
    const r0 = byProbe[probe]
    if (!r0?.frame) { instrumentFails.push({ cell: `互動:${probe}`, detail: `${tag} 找不到這一列或它的就地編輯外框` }); continue }
    const fresh = await page.evaluate((s) => {
      const f = document.querySelector(s); f.scrollIntoView({ block: 'center', inline: 'nearest' })
      const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom } }
      return { label: r(f.querySelector(':scope > [data-field-slot="label"]')), frame: r(f.querySelector('[data-editing="false"]')), slot: r(f.querySelector('[data-field-slot="control"]')) }
    }, sel(probe))
    const dy = fresh.slot.top - r0.slot.top
    const r = { ...r0, label: fresh.label, frame: { ...r0.frame, ...fresh.frame }, slot: { ...r0.slot, ...fresh.slot }, valueLeft: r0.valueLeft }
    const horizontal = r.orientation === 'horizontal'
    const labelColumnRight = r.slot.left - r.columnGap
    const need = horizontal ? p.refs.formGap : r.rowGap
    // 滑過:截圖差分
    if (want('G2')) {
      const clip = { x: Math.max(0, r.label.left - 16), y: Math.max(0, Math.min(r.label.top, r.frame.top) - 4), width: Math.max(r.frame.right, r.label.right) - r.label.left + 32, height: Math.max(r.frame.bottom, r.label.bottom) - Math.min(r.label.top, r.frame.top) + 8 }
      await parkPointer(page); await settle()
      const before = await shot(clip)
      await page.hover(`${sel(probe)} [data-editing="false"]`, { force: true }); await settle()
      const after = await shot(clip)
      await parkPointer(page); await settle()
      const d = diffBounds(before, after, clip)
      if (!d) { check(`G2:滑過:${probe}`, false, `${tag} 滑過前後畫面沒變(滑過底色沒畫出來?)`) } else {
        const gap = horizontal ? d.left - labelColumnRight : d.top - r.label.bottom
        check(`G2:滑過:${probe}`, gap >= need - 0.5, `${tag} 滑過底色離標籤 ${f2(gap)}(${horizontal ? '標籤欄右緣 → 底色左緣' : '標籤下緣 → 底色上緣'},應 ≥ ${f2(need)})`)
        if (REPORT) report.push({ run: tag, set: r.set, row: probe.split(':')[1], kind: r.kind, state: '滑過', labelToFrame: gap, bgLeftMinusLabel: horizontal ? null : d.left - r.label.left })
      }
    }
    // 編輯中:點進去 → 量 → Esc 取消
    if (want('G2') || want('G1') || want('CONT')) {
      const clicked = await page.click(`${sel(probe)} [data-editing="false"] button`, { force: true, timeout: 5000 }).then(() => true, () => false)
      const edit = clicked && await page.waitForSelector(`${sel(probe)} [data-editing="true"]`, { timeout: 5000 }).catch(() => null)
      if (!edit) { instrumentFails.push({ cell: `編輯:${probe}`, detail: `${tag} 點了沒進編輯` }); continue }
      await settle()
      const m = await page.evaluate((s) => {
        const box = document.querySelector(`${s} [data-editing="true"]`)
        const chrome = box?.querySelector('[data-field-mode="edit"]') ?? box?.querySelector('input, textarea')
        const ctl = box?.querySelector('input, textarea')
        if (!chrome) return null
        const f = chrome.getBoundingClientRect()
        let textLeft = null
        if (ctl) { const c = ctl.getBoundingClientRect(), cs = getComputedStyle(ctl); textLeft = c.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) }
        // 容器(同 PROBE containerOf)
        let cont = { left: 0, right: document.documentElement.clientWidth, tag: 'viewport' }
        for (let n = box.parentElement; n && n !== document.body; n = n.parentElement) {
          if (n.hasAttribute('data-field-orientation') || n.hasAttribute('data-field-group') || n.hasAttribute('data-field-slot')) continue
          const cs = getComputedStyle(n), clear = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
          const paintedN = !clear(cs.backgroundColor) || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && !clear(cs[`border${k}Color`]))
          if (cs.overflowX !== 'visible' || paintedN) { const rr = n.getBoundingClientRect(); cont = { left: rr.left + parseFloat(cs.borderLeftWidth), right: rr.right - parseFloat(cs.borderRightWidth), tag: n.dataset.readingSet ?? n.tagName }; break }
        }
        return { textLeft, frame: { left: f.left, top: f.top, right: f.right }, cont }
      }, sel(probe))
      // Esc 一次少一層:自訂控件的選單 / 日曆開著時第一下只關它,下一下才取消編輯(inline-edit.spec.md「退出 edit 態」)
      let restored = null
      for (let i = 0; i < 3 && !restored; i++) {
        await page.keyboard.press('Escape')
        restored = await page.waitForSelector(`${sel(probe)} [data-editing="false"]`, { timeout: 1500 }).catch(() => null)
      }
      await parkPointer(page)
      if (!restored) { instrumentFails.push({ cell: `編輯:${probe}`, detail: `${tag} 按 Esc 三下沒回到靜止` }); return }
      if (!m) { instrumentFails.push({ cell: `編輯:${probe}`, detail: `${tag} 編輯中找不到輸入框` }); continue }
      // 截圖前捲動過:靜態量的值線要換到同一個捲動位置(水平位置不隨垂直捲動改變)
      if (want('G1') && r.kind === 'text' && m.textLeft != null) check(`G1:編輯:${probe}`, near(m.textLeft, r.valueLeft), `${tag} 進編輯後字的左緣 − 靜止時 = ${f2(m.textLeft - r.valueLeft)}(零跳)`)
      if (want('G2')) {
        const gap = horizontal ? m.frame.left - labelColumnRight : m.frame.top - r.label.bottom
        check(`G2:編輯:${probe}`, gap >= need - 0.5, `${tag} 編輯中的框離標籤 ${f2(gap)}(應 ≥ ${f2(need)})`)
        if (REPORT) report.push({ run: tag, set: r.set, row: probe.split(':')[1], kind: r.kind, state: '編輯中', labelToFrame: gap, textJump: m.textLeft != null ? m.textLeft - r.valueLeft : null })
      }
      if (want('CONT')) check(`CONT:編輯:${probe}`, m.frame.left >= m.cont.left - 0.5 && m.frame.right <= m.cont.right + 0.5, `${tag} 編輯中的框 ${f2(m.frame.left)}–${f2(m.frame.right)} vs 容器(${m.cont.tag})內緣 ${f2(m.cont.left)}–${f2(m.cont.right)}`)
      void dy
    }
  }
}

/** G5:範圍裡唯一的就地編輯進編輯 → 同範圍不翻轉;點外面回到靜止 */
async function judgeNoFlip(run, set, probe, { only = null, after = null } = {}) {
  const tag = `${run.theme}/${run.size}`
  if (only && !only.includes('G5')) return
  if (after) await page.evaluate(after)
  const snap = () => page.evaluate((s) => [...document.querySelectorAll(`[data-reading-set="${s}"] [data-probe]`)].map((f) => {
    const slot = f.querySelector('[data-field-slot="control"]'); const fv = f.querySelector('[data-field-frameless-value]')
    return { probe: f.dataset.probe, color: getComputedStyle(f.querySelector(':scope > [data-field-slot="label"]')).color, h: Math.round(slot.getBoundingClientRect().height * 100) / 100,
      inset: fv ? Math.round((fv.getBoundingClientRect().left - slot.getBoundingClientRect().left) * 100) / 100 : null }
  }), set)
  const before = await snap()
  const clicked = await page.click(`[data-probe="${probe}"] [data-editing="false"] button`, { force: true, timeout: 5000 }).then(() => true, () => false)
  const edit = clicked && await page.waitForSelector(`[data-probe="${probe}"] [data-editing="true"]`, { timeout: 5000 }).catch(() => null)
  if (!edit) { instrumentFails.push({ cell: `G5:${probe}`, detail: `${tag} 點了沒進編輯` }); return }
  await settle()
  // 連正在編輯的那一列一起比(範圍裡只有它一列時,翻轉只看得到它自己的標籤色)
  const during = await snap()
  const changed = during.filter((x) => JSON.stringify(x) !== JSON.stringify(before.find((b) => b.probe === x.probe)))
  check(`G5:${set}`, changed.length === 0 && during.length === before.length, `${tag} 進編輯後同範圍各列(含編輯中那列)${changed.length ? `變了:${changed.map((x) => `${x.probe} ${JSON.stringify(before.find((b) => b.probe === x.probe))} → ${JSON.stringify(x)}`).join(';')}` : '標籤色、開關內縮、列高都不變'}`)
  // 點範圍外的空白處(卡片左上角的內距)→ 回到靜止(取代探針的 blur-exit)
  const box = await page.evaluate((s) => { const r = document.querySelector(`[data-reading-set="${s}"]`).getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 } }, set)
  await page.mouse.click(box.x, box.y)
  const back = await page.waitForSelector(`[data-probe="${probe}"] [data-editing="false"]`, { timeout: 5000 }).catch(() => null)
  check(`G5:點外面回靜止:${set}`, Boolean(back), `${tag} 點範圍外空白後 ${back ? '回到靜止' : '仍在編輯(殘留)'}`)
  await parkPointer(page)
}

/** G1-V:Field 層純顯示「純顯示齊標籤驗證」(18 種 × 兩種標籤位置;不在閱讀情境) */
const VIEW_READY = () => Boolean(document.querySelector('[data-view-case="radio"] [data-field-slot="control"]'))
const VIEW_PROBE = () => {
  const visible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
    const clear = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
    return el.tagName === 'svg' || el.tagName === 'IMG' || !clear(cs.backgroundColor) || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && !clear(cs[`border${k}Color`]))
  }
  const rows = []
  for (const wrap of document.querySelectorAll('[data-view-orientation]')) for (const f of wrap.querySelectorAll('[data-view-case]')) {
    const label = f.querySelector('[data-field-slot="label"]'), ctrl = f.querySelector('[data-field-slot="control"]')
    if (!label || !ctrl) { rows.push({ orient: wrap.dataset.viewOrientation, key: f.dataset.viewCase, missing: true }); continue }
    const rects = []
    const walker = document.createTreeWalker(ctrl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    for (let n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.nodeType === 3) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const rr of r.getClientRects()) if (rr.width > 0 && rr.height > 0) rects.push(rr) }
      else if (n !== ctrl && visible(n)) { const rr = n.getBoundingClientRect(); if (rr.width > 0 && rr.height > 0) rects.push(rr) }
    }
    if (!rects.length) { rows.push({ orient: wrap.dataset.viewOrientation, key: f.dataset.viewCase, empty: true }); continue }
    const left = Math.min(...rects.map((r) => r.left)), firstTop = Math.min(...rects.map((r) => r.top))
    const firstLine = rects.filter((r) => r.top < firstTop + 4)
    const center = (Math.min(...firstLine.map((r) => r.top)) + Math.max(...firstLine.map((r) => r.bottom))) / 2
    const sizer = document.createElement('div'); sizer.style.height = 'var(--field-height-md)'; ctrl.appendChild(sizer)
    const fieldHeight = sizer.getBoundingClientRect().height; sizer.remove()
    const c = ctrl.getBoundingClientRect(), l = label.getBoundingClientRect()
    rows.push({ orient: wrap.dataset.viewOrientation, key: f.dataset.viewCase, labelTag: label.tagName, dx: left - c.left, labelDx: l.left - c.left, dy: center - (c.top + fieldHeight / 2) })
  }
  return rows
}
function judgeView(rows) {
  if (!rows || rows.length !== 36) { instrumentFails.push({ cell: 'G1-V', detail: `純顯示齊標籤驗證量到 ${rows?.length ?? 0} 格(應 18 × 2 = 36)` }); return }
  for (const r of rows) {
    const id = `G1-V:${r.orient}/${r.key}`
    if (r.missing || r.empty) { check(id, false, r.missing ? '找不到標籤或控件欄' : '控件欄裡沒有可見內容'); continue }
    const errs = []
    if (Math.abs(r.dx) > 0.5) errs.push(`值左緣離控件欄左緣 ${f2(r.dx)}`)
    if (r.orient === 'vertical' && Math.abs(r.labelDx) > 0.5) errs.push(`標籤左緣離控件欄左緣 ${f2(r.labelDx)}`)
    if (r.key !== 'textarea' && Math.abs(r.dy) > 1) errs.push(`第一行中線離 欄位高 / 2 ${f2(r.dy)}`)
    if (r.labelTag !== 'SPAN') errs.push(`純顯示的標籤是 <${r.labelTag.toLowerCase()}>(應為 span)`)
    check(id, errs.length === 0, errs.join(';') || `dx ${f2(r.dx)} / dy ${f2(r.dy)}`)
  }
}

/** InlineEdit 各範例(取代探針第一組):Field 裡的就地編輯值線 + 框不出容器 */
const SWEEP_PROBE = () => {
  const bleed = (() => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;width:var(--field-bleed)'; document.body.appendChild(el); const v = el.getBoundingClientRect().width; el.remove(); return v })()
  const clear = (c) => !c || c === 'transparent' || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)
  const painted = (el) => { const cs = getComputedStyle(el); return el.tagName === 'svg' || el.tagName === 'IMG' || !clear(cs.backgroundColor) || ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && !clear(cs[`border${k}Color`])) }
  const out = []
  for (const frame of document.querySelectorAll('[data-editing="false"]')) {
    const field = frame.closest('[data-field-orientation]')
    let cont = { left: 0, right: document.documentElement.clientWidth, tag: 'viewport' }
    for (let n = frame.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.hasAttribute('data-field-orientation') || n.hasAttribute('data-field-group') || n.hasAttribute('data-field-slot')) continue
      const cs = getComputedStyle(n)
      if (cs.overflowX !== 'visible' || painted(n)) { const r = n.getBoundingClientRect(); cont = { left: r.left + parseFloat(cs.borderLeftWidth), right: r.right - parseFloat(cs.borderRightWidth), tag: n.tagName }; break }
    }
    const fr = frame.getBoundingClientRect()
    let valueLeft = null, label = null
    if (field) {
      const lab = field.querySelector(':scope > [data-field-slot="label"]'), slot = field.querySelector('[data-field-slot="control"]')
      const rects = []
      const walker = document.createTreeWalker(frame, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      for (let n = walker.currentNode; n; n = walker.nextNode()) {
        if (n.nodeType === 3) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const rr of r.getClientRects()) if (rr.width > 0 && rr.height > 0) rects.push(rr) }
        else if (n !== frame && n.tagName !== 'BUTTON' && painted(n)) { const rr = n.getBoundingClientRect(); if (rr.width > 1 && rr.height > 1) rects.push(rr) }
      }
      valueLeft = rects.length ? Math.min(...rects.map((r) => r.left)) : null
      label = lab ? { left: lab.getBoundingClientRect().left, text: lab.textContent.trim() } : null
      out.push({ orientation: field.dataset.fieldOrientation, label, valueLeft, line: field.dataset.fieldOrientation === 'horizontal' ? slot.getBoundingClientRect().left + bleed : label?.left, frame: { left: fr.left, right: fr.right }, cont, bleeds: parseFloat(getComputedStyle(frame).marginLeft) < 0 })
    } else out.push({ orientation: null, frame: { left: fr.left, right: fr.right }, cont, bleeds: parseFloat(getComputedStyle(frame).marginLeft) < 0 })
  }
  return out
}

async function readTableHeader(theme, css = null) {
  const color = await open(STORY.table, { theme, label: `DataTable 表頭 ${theme}`, css, waitFor: () => Boolean(document.querySelector('[role="columnheader"]')),
    probe: () => { const h = document.querySelector('[role="columnheader"]'); const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim()) return getComputedStyle(n.parentElement).color; return null }, probeArg: null })
  if (!color) instrumentFails.push({ cell: `G3 表頭 ${theme}`, detail: '讀不到 DataTable 表頭的字色' })
  tableHeaderColor[theme] = color
}

const DETAIL_TEXT = ['RH:摘要', 'RV:地點']
const FIXTURE_TEXT = ['ONE:備註', 'WRAP:備註', 'S1:標題']
// 主題套層:這幾列(Field 根)再套一層另一個主題的 data-theme —— 範圍(FieldGroup)與標籤之間多一個主題邊界。
// 閱讀(就地編輯那列、開關那列、停用列)與表單(標籤在左 / 在上、停用列)各取幾列;其餘列不套,當同一頁的對照
const THEME_NEST_ROWS = ['ONE:備註', 'ONE:公開', 'DIS:同步到客服系統', 'FH:專案名稱', 'FH:專案代號', 'FV:專案名稱']
const BLOCKS = {
  async themeNest({ css, runs = [{ theme: 'light', size: 'unset' }, { theme: 'dark', size: 'unset' }] } = {}) {
    for (const run of runs) {
      const other = run.theme === 'light' ? 'dark' : 'light'
      const dom = `(() => { for (const probe of ${JSON.stringify(THEME_NEST_ROWS)}) document.querySelector('[data-probe="' + probe + '"]')?.setAttribute('data-theme', ${JSON.stringify(other)}) })()`
      const p = await open(STORY.fixture, { ...run, label: `邊界夾具(主題套層 ${other})${run.theme}/${run.size}`, css, dom })
      if (!p) continue
      // 儀器:那幾列真的換到另一個主題(期望色跟頁面不同),否則「主題套層」格量的其實是同一個主題
      for (const probe of THEME_NEST_ROWS) {
        const r = p.rows.find((x) => x.probe === probe)
        if (!r?.nestedTheme || !r.expect || r.expect.fg === p.refs.fg) instrumentFails.push({ cell: `主題套層:${probe}`, detail: `${run.theme}/${run.size} 這一列沒套到另一層主題(期望色 ${r?.expect?.fg} vs 頁面 ${p.refs.fg})` })
      }
      judgeStatic(p, run, { only: ['G3', 'G4'] })
    }
  },
  async statics({ css, dom, only, flags = '', runs = RUNS }) {
    for (const run of runs) for (const id of [STORY.detail, STORY.fixture]) {
      const p = await open(id, { ...run, label: `${id === STORY.detail ? '真實情境' : '邊界夾具'} ${run.theme}/${run.size}`, css, dom, flags: id === STORY.detail && run.size === 'unset' ? `&rcFirstFrame=1${flags}` : flags })
      if (p) judgeStatic(p, run, { only })
    }
  },
  async interactive({ css, dom, only, runs = [{ theme: 'light', size: 'unset' }, { theme: 'light', size: 'md' }, { theme: 'dark', size: 'sm' }], fixture = true, after = null }) {
    for (const run of runs) {
      const p = await open(STORY.detail, { ...run, label: `真實情境(互動)${run.theme}/${run.size}`, css, dom })
      if (p) await judgeInteractive(p, run, REPORT ? p.rows.filter((r) => r.frame && ['RH', 'RV'].includes(r.set) && r.kind !== 'locked').map((r) => r.probe) : DETAIL_TEXT, { only })
      if (!fixture) continue
      const q = await open(STORY.fixture, { ...run, label: `邊界夾具(互動)${run.theme}/${run.size}`, css, dom })
      if (!q) continue
      await judgeInteractive(q, run, FIXTURE_TEXT, { only })
      for (const [set, probe] of [['ONE', 'ONE:備註'], ['S1', 'S1:標題']]) {
        await open(STORY.fixture, { ...run, label: `邊界夾具(不翻轉)${run.theme}/${run.size}`, css, dom })
        await judgeNoFlip(run, set, probe, { only, after })
      }
    }
  },
  async view({ dom }) { judgeView(await open(STORY.view, { label: '純顯示齊標籤驗證', dom, waitFor: VIEW_READY, probe: VIEW_PROBE, probeArg: null })) },
  async sweep() {
    if (!SWEEP.length) { instrumentFails.push({ cell: 'InlineEdit 範例', detail: 'index 裡找不到 InlineEdit 的 story' }); return }
    let measured = 0
    for (const id of SWEEP) {
      const rows = await open(id, { label: id, waitFor: () => (document.querySelector('#storybook-root')?.childElementCount ?? 0) > 0, probe: SWEEP_PROBE, probeArg: null })
      if (!rows) continue
      for (const [i, r] of rows.entries()) {
        measured++
        const name = `${id.replace(/^design-system-components-/, '')}#${r.label?.text ?? i}`
        if (r.orientation && r.valueLeft != null) check(`G1-S:${name}`, near(r.valueLeft, r.line), `值左緣 − 值線(${r.orientation === 'horizontal' ? '框內字線' : '標籤左緣'})= ${f2(r.valueLeft - r.line)}`)
        if (r.bleeds) check(`CONT-S:${name}`, r.frame.left >= r.cont.left - 0.5 && r.frame.right <= r.cont.right + 0.5, `框 ${f2(r.frame.left)}–${f2(r.frame.right)} vs 容器(${r.cont.tag})內緣 ${f2(r.cont.left)}–${f2(r.cont.right)}`)
      }
    }
    if (!measured) instrumentFails.push({ cell: 'InlineEdit 範例', detail: `${SWEEP.length} 則都沒量到就地編輯外框` })
  },
}

// ── 對照組 ──────────────────────────────────────────────────────────────────
const ONE_RUN = [{ theme: 'light', size: 'unset' }]
const MUTANTS = [
  { name: '某一列的字推 4px(只有那一列紅)', block: 'statics', only: ['G1'], runs: ONE_RUN, expect: ['G1:RH:摘要'], onlyRed: ['G1:RH:摘要'],
    css: '[data-probe="RH:摘要"] [data-editing="false"] > :not(button) { padding-left: calc(var(--field-px) + 4px) !important; }' },
  { name: '垂直外伸改回 12(只抵內距、漏了框)', block: 'statics', only: ['G1'], runs: ONE_RUN, expect: ['G1:RV:地點', 'G1:RV:類別', 'G1:S1:標題'],
    css: '[data-field-orientation="vertical"] [data-editing] { margin-left: calc(-1 * var(--field-px)) !important; margin-right: calc(-1 * var(--field-px)) !important; width: calc(100% + 2 * var(--field-px)) !important; }' },
  // 兩顆變數設在讀者身上(field.css),所以破法也注入在讀者身上;注入在範圍元素上會被讀者自己的宣告蓋掉、等於沒破
  { name: '沒有框的值不內縮', block: 'statics', only: ['G1'], runs: ONE_RUN, expect: ['G1:RH:需要設計審查', 'G1:RH:已通知客服', 'G1:ONE:公開'],
    css: '[data-field-frameless-value] { --scope-value-inset: 0px !important; }' },
  { name: '拿掉標籤判斷(閱讀標籤留在 foreground)', block: 'statics', only: ['G3'], runs: ONE_RUN, expect: ['G3:RH:摘要', 'G3:RV:地點', 'G3:WRAP:備註'],
    css: '[data-field-slot="label"] { --scope-label-color: var(--foreground) !important; }' },
  { name: '判斷過寬(一般表單也當閱讀情境)', block: 'statics', only: ['G4'], runs: ONE_RUN, expect: ['G4:色:FH:專案名稱', 'G4:位置:FH:公開', 'G4:色:FV:專案名稱'],
    css: '[data-field-scope] [data-field-slot="label"] { --scope-label-color: var(--fg-secondary) !important; } [data-field-scope] [data-field-frameless-value] { --scope-value-inset: var(--field-bleed) !important; }' },
  // 2026-11-25 規格核對抓到的寫法:標籤色在範圍元素上就先代換成顏色,再原樣傳下去 —— 套了另一層主題的列拿到範圍那一層的顏色。
  // 沒套層的列照綠(證明紅的是主題套層,不是整個判斷壞掉)
  { name: '標籤色在範圍元素上先算好(主題套層跟不上)', block: 'themeNest', runs: ONE_RUN,
    expect: ['G4:色:主題套層:FH:專案名稱', 'G4:色:主題套層:FV:專案名稱', 'G3:主題套層:ONE:備註', 'G3:主題套層:ONE:公開'], greenToo: ['G4:色:FV:接收通知', 'G3:ONE:置頂'],
    css: '[data-field-scope] { --rc-scope-pre: var(--foreground); } [data-field-scope]:has([data-field-reading]) { --rc-scope-pre: var(--fg-secondary); } [data-field-slot="label"] { --scope-label-color: var(--rc-scope-pre) !important; }' },
  { name: '編輯中跳字(輸入框內距多 4px)', block: 'interactive', only: ['G1'], runs: ONE_RUN, expect: ['G1:編輯:RH:摘要', 'G1:編輯:RV:地點'],
    css: '[data-editing="true"] input { padding-left: calc(var(--field-px) + 4px) !important; }' },
  { name: '水平的框往左多伸 1px(壓進標籤欄距)', block: 'interactive', only: ['G2'], runs: ONE_RUN, expect: ['G2:滑過:RH:摘要', 'G2:編輯:RH:摘要'],
    css: '[data-field-orientation="horizontal"] [data-editing] { margin-left: -1px !important; }' },
  { name: '容器內距 12(框出界)', block: 'statics', only: ['CONT'], runs: ONE_RUN, expect: ['CONT:RV:地點', 'CONT:S1:標題'],
    css: '[data-reading-set] { padding-left: 12px !important; padding-right: 12px !important; }' },
  { name: '記號只掛靜止外框(編輯容器沒有記號)', block: 'interactive', only: ['G5'], runs: ONE_RUN, expect: ['G5:ONE', 'G5:S1'],
    after: () => {
      const strip = () => { for (const el of document.querySelectorAll('[data-editing="true"]')) el.removeAttribute('data-field-reading') }
      new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-editing', 'data-field-reading'] })
    } },
  { name: '同組列高跑掉(開關 / 勾選列退回 md)', block: 'statics', only: ['G6'], runs: ONE_RUN, expect: ['G6:RH', 'G6:RV', 'G6:ONE'],
    css: '[data-kind="switch"] [data-field-slot="control"], [data-kind="checkbox"] [data-field-slot="control"] { min-height: var(--field-height-md) !important; }' },
  { name: '列高晚一個計時器才到(首繪錯一格)', block: 'statics', only: ['G8', 'G6'], runs: ONE_RUN, flags: '&rcLate=1', expect: ['G8:light/unset'], greenToo: ['G6:RH'] },
  { name: '--field-bleed 公式只剩內距', block: 'statics', only: ['G9'], runs: ONE_RUN, expect: ['G9:公式:light/unset'],
    css: ':root, [data-density], [data-ui-size], [data-layout-space] { --field-bleed: var(--field-px) !important; }' },
  { name: '就地編輯框寬 2px(沒讀 --field-border-width)', block: 'statics', only: ['G9'], runs: ONE_RUN, expect: ['G9:框寬:light/unset'],
    css: '[data-editing="false"] { border-width: 2px !important; }' },
  { name: '標題列讓位斷開連結(讀 --field-px)', block: 'statics', only: ['G9'], runs: ONE_RUN, expect: ['G9:標題讓位:light/unset'],
    css: '[data-title-slot-probe] { --surface-title-bleed: var(--field-px) !important; }' },
  { name: '範圍改成最近一層 FieldGroup', block: 'statics', only: ['SC'], runs: ONE_RUN, expect: ['SC:N2'],
    css: '[data-field-group] [data-field-group] [data-field-slot="label"] { --scope-label-color: var(--foreground) !important; } [data-field-group] [data-field-group] [data-field-frameless-value] { --scope-value-inset: 0px !important; }' },
  { name: '純顯示補回左內距 13(C1 甲之前)', block: 'view', expect: ['G1-V:vertical/input', 'G1-V:horizontal/input'],
    dom: () => { for (const el of document.querySelectorAll('[data-view-case="input"] [data-field-slot="control"] > *')) el.style.setProperty('padding-left', '13px', 'important') } },
]

if (!SELFTEST) {
  await readTableHeader('light'); await readTableHeader('dark')
  await BLOCKS.statics({})
  await BLOCKS.themeNest({})
  await BLOCKS.interactive(REPORT ? { runs: [{ theme: 'light', size: 'sm' }, { theme: 'light', size: 'md' }, { theme: 'dark', size: 'sm' }, { theme: 'dark', size: 'md' }] } : {})
  await BLOCKS.view({})
  await BLOCKS.sweep()
} else {
  let caught = 0
  for (const m of MUTANTS) {
    const from = results.length, fromFails = instrumentFails.length
    console.log(`── 對照組:${m.name}(預期 ${m.expect.join(' / ')} 紅)`)
    if (m.block === 'view') await BLOCKS.view({ dom: m.dom })
    else if (m.block === 'themeNest') await BLOCKS.themeNest({ css: m.css, runs: m.runs })
    else if (m.block === 'interactive') await BLOCKS.interactive({ css: m.css, only: m.only, runs: m.runs, after: m.after, fixture: m.only.includes('G5') || m.only.includes('G2') })
    else await BLOCKS.statics({ css: m.css, dom: m.dom, only: m.only, runs: m.runs, flags: m.flags ?? '' })
    const mine = results.slice(from)
    const red = new Set(mine.filter((x) => !x.ok).map((x) => x.id))
    const expectRed = m.expect.every((id) => red.has(id))
    const onlyOk = !m.onlyRed || [...red].filter((id) => id.startsWith('G1:')).every((id) => m.onlyRed.includes(id))
    const greenOk = !m.greenToo || m.greenToo.every((id) => mine.some((x) => x.id === id && x.ok))
    const ok = expectRed && onlyOk && greenOk && instrumentFails.length === fromFails
    if (ok) caught++
    console.log(`${ok ? '✓' : '✗'} 對照組「${m.name}」:紅的格 ${[...red].slice(0, 12).join(' / ') || '(無)'}${red.size > 12 ? ` …共 ${red.size}` : ''}${onlyOk ? '' : '(多紅了別的列)'}${greenOk ? '' : '(該綠的格沒綠)'}`)
  }
  await browser.close(); await server.stop()
  const ok = caught === MUTANTS.length && instrumentFails.length === 0
  if (instrumentFails.length) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 紅的不全是對照組造成的`); for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`) }
  console.log(ok ? `✅ reading-context selftest:靜態 ${STATIC_MUTANTS.length} + 瀏覽器 ${MUTANTS.length} 個對照組全被抓到` : `✗ reading-context selftest:${MUTANTS.length - caught} 個對照組沒讓預期的格紅 —— 量具無效`)
  process.exit(ok ? 0 : 1)
}

await browser.close()
await server.stop()
if (REPORT) {
  console.log('\n── 量測表(px;值線 = 值左緣 − 值線、標籤↔框 = 標籤欄右緣 / 標籤下緣 → 框)──')
  for (const r of report) console.log(`  ${r.run.padEnd(12)} ${r.set} ${String(r.row).padEnd(8)} ${String(r.kind).padEnd(8)} ${r.state.padEnd(4)}${r.valueLine != null ? ` 值線 ${f2(r.valueLine)}` : ''}${r.height != null ? ` 列高 ${f2(r.height)}` : ''}${r.color ? ` 標籤 ${r.color}` : ''}${r.labelToFrame != null ? ` 標籤↔框 ${f2(r.labelToFrame)}` : ''}${r.textJump != null ? ` 進編輯字位移 ${f2(r.textJump)}` : ''}`)
  fs.mkdirSync(path.join(REPO, 'tmp'), { recursive: true })
  fs.writeFileSync(path.join(REPO, 'tmp', 'reading-context-report.json'), JSON.stringify(report, null, 2))
}
const failed = results.filter((x) => !x.ok)
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 不是產品裁決,但這次不能宣稱閱讀情境合規:`)
  for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`)
}
console.log(failed.length || instrumentFails.length
  ? `✗ reading-context ${failed.length} 格失敗、${instrumentFails.length} 格沒量到(SSOT:field.spec.md「閱讀情境」)`
  : `✅ reading-context PASS(${results.length} 格)`)
process.exit(failed.length || instrumentFails.length ? 1 : 0)
