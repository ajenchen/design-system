#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Field 家族裡有 `showDisplayEndIcon` 的六個元件(Select / Combobox / DatePicker / TimePicker / LinkInput / PeoplePicker),
 *        在 `<Field mode="view">` 裡,`showDisplayEndIcon` 兩值 × sm / md / lg × 有值 / 空值,值文字的字級**等於規格值**:
 *        sm / md = 14px、lg = 16px(field-controls.spec.md「(e) View typography canonical」:「sm/md → text-body(14px line-height 1.5)
 *        / lg → text-body-lg(16px)」)。每一列放在兩種外層裡量:頁面預設(= body 的字級,住在 base.css、吃 `--font-body-size`,
 *        現為 14px;使用者實際看到的情形)與故意設成 23px 的外層 —— 值的字級是元件自己給的,不是從外面繼承的(規格值剛好等於頁面預設的
 *        size —— 現在是 sm / md —— 在頁面預設外層裡分不出「自己給」與「繼承」,只有 23px 外層分得出;lg 兩種外層都分得出)。
 *        量兩個數:值文字所在元素的 computed font-size,與值文字字形框(Range.getBoundingClientRect)的高度 ——
 *        後者必須等於同一段字放進 `text-body` / `text-body-lg` 參考 span 量到的高度(像素,±0.5)。
 *   紅: 任一列不符 → 逐列點名(元件 / showDisplayEndIcon / size / 有值空值 / 外層,量到幾 px)exit 1。`--selftest` 在 DS 原始碼上造八個
 *        單一根因突變(MUTANTS),每個突變必須**剛好**紅它負責的那幾列(判定式寫在突變旁,由 fontLayers 與頁面預設推出),契約列每一條都要被某個突變弄紅過;
 *        第一個突變就是 A100 修前的樣子(PeoplePicker 預設檢視態沒套字級)。拿掉字級的突變在頁面預設外層裡只紅「規格值 ≠ 頁面預設」的 size,
 *        其餘 size 的頁面預設列靠「給錯值」的突變(*-lg-as-body / *-body-as-lg 兩兩對稱)弄紅。`--root=<修改前的整棵原始碼>` = 天然對照組
 *       (main 上 A100 修前 8eb473c7 的樹:PeoplePicker 預設檢視態 sm / md 兩種外層、lg 23px 外層共 10 列紅,另有對照列 C-plain-page 紅 ——
 *        那棵樹的 body 還沒吃 `--font-body-size`,頁面預設是瀏覽器的 16px;main 上 body 設字級前 2e5c1b0c 的樹:契約列全綠、只有 C-plain-page 紅)。
 *   綠: 現行原始碼 144 列全部等於規格值;對照列(23px 外層裡沒有任何字級 class 的純文字量到 23px、頁面預設外層裡的量到
 *        `--font-body-size` 解析出的字級)在現行原始碼與每個突變上都綠 —— 證明「繼承外層」在這支量具裡看得見,綠燈不是因為外層沒生效。
 *        頁面預設的期望值不寫死:在頁面上用 `font-size: var(--font-body-size)` 的探針量出來(探針放在 23px 外層裡,token 沒定義時
 *        會繼承成 23px,當儀器失效);「哪幾列拿掉字級在頁面預設外層裡看得見」(inheritsVisibly)也由這個值推出。
 *        harness 載不起來 / 參考 span 不是規格字級(樣式沒編進來)/ 找不到值文字 / `--font-body-size` 解析不出來
 *        = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-11-17 新增(A100)。根因:PeoplePicker `mode="view"` 預設(`showDisplayEndIcon=false`)那條路回傳裸 `PersonDisplay`,
 *        root 沒有任何字級 class,名字吃外層字級(當時 body 沒設字級,Field 裡 = 瀏覽器預設 16px);同一顆控件 `showDisplayEndIcon=true` 走 `fieldWrapperStyles`
 *        的 size 字級(14px)。另外五個元件的預設路徑早就套了 `fieldDisplayTextClass`(2026-05-14 I2),PeoplePicker 不在當時的清單上。
 *        既有的 `field-view-typography-invariant.mjs` 比的是「四模式 story(`-展示--modes`)的 view = edit」:PeoplePicker 沒有四模式 story,
 *        那支從來沒量到它(2026-11-17 實跑:量到 8 則,沒有 peoplepicker);而且它只看 `showDisplayEndIcon` 預設值、只比 view 與 edit 相等,
 *        外層剛好是規格字級時繼承也會相等。本閘補「六個元件 × 兩個值都量、等於規格值、而且放在字級不同的外層裡」這一半。
 *        CI:`npm run test:field-view-typography` 會接著跑 `npm run test:field-view-font-size`(現況 + --selftest),
 *        在 ci.yml 的 verify-browser-field-dialog-steps job 裡。
 *
 * 用法:
 *   node scripts/field-view-font-size-invariant.mjs                判定(現行原始碼)
 *   node scripts/field-view-font-size-invariant.mjs --selftest     對照組(全部單一根因突變)
 *   node scripts/field-view-font-size-invariant.mjs --root=<dir>   改量另一棵原始碼(例:修改前的基準樹)
 *   node scripts/field-view-font-size-invariant.mjs --shot=<dir>   另存示範區塊(頁面預設外層、md、淺色、2 倍)的畫面(前後圖用;不影響判定)
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip } from './lib/launch-browser.mjs'
import {
  InstrumentError,
  REPO_ROOT,
  bundleDsHarness,
  compileDsCss,
  mountHarness,
  mutantFor,
  replaceOnce,
  resolveSourceRoot,
} from './lib/ds-source-harness.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SHOT_DIR = process.argv.find((a) => a.startsWith('--shot='))?.slice('--shot='.length)
const SOURCE_ROOT = resolveSourceRoot()

/** 規格值:field-controls.spec.md「(e) View typography canonical」 */
const SPEC_PX = { sm: 14, md: 14, lg: 16 }
/** 故意與任何規格值都不同的外層字級 —— 「繼承外層」在這裡一定看得見 */
const SENTINEL_PX = 23
/** 字形框高度與參考 span 的容許差(像素) */
const HEIGHT_TOLERANCE_PX = 0.5

const COMPONENTS = ['select', 'combobox', 'datepicker', 'timepicker', 'linkinput', 'peoplepicker']
const SIZES = ['sm', 'md', 'lg']
const ICONS = [false, true]
const CONTENTS = ['value', 'empty']
const CONTEXTS = ['page', 'sentinel']

/**
 * 每一列的字級由哪幾層給(由內而外)—— 突變的「該紅的列」由這張表推出來,不另手抄一份清單。
 *   helper  = `fieldDisplayTextClass(size)`(field-wrapper.tsx;預設檢視態的裸 span / root)
 *   wrapper = `fieldWrapperStyles` 的 size 字級(`showDisplayEndIcon=true` 的外殼;裡面的值文字繼承它)
 *   combobox-shell = Combobox 外殼裡「不限」那顆 span 自己的 `fieldDisplayTextClass(sz)`(外面還有 wrapper 一層,兩層都給同一個字級;
 *     拿掉任一層,另一層照樣給對 —— 所以這幾列要靠「給錯值」的突變才紅得起來)
 */
const fontLayers = (row) => {
  if (!row.icon) return ['helper']
  if (row.comp === 'combobox' && row.content === 'value') return ['combobox-shell', 'wrapper']
  return ['wrapper']
}
/** 拿掉這一層之後外面沒有別層頂上 */
const onlyLayer = (row, layer) => fontLayers(row).length === 1 && fontLayers(row)[0] === layer
/** 最內層 = 給錯值時會直接顯示出來的那一層 */
const innermost = (row) => fontLayers(row)[0]
/**
 * 突變把字級拿掉(變成繼承)時會紅的列:23px 外層一定紅;頁面預設外層只有「規格值 ≠ 頁面預設」的 size 紅。
 * `pageDefaultPx` = 這一趟在頁面上量到的 `--font-body-size`(runVariant 的探針)—— 現為 14px,所以只有 lg 紅,
 * sm / md 只能靠 23px 外層那一列抓(拿掉字級的突變)與 *-body-as-lg(給錯值的突變)。
 */
const inheritsVisibly = (row, pageDefaultPx) => row.ctx === 'sentinel' || SPEC_PX[row.size] !== pageDefaultPx

const ROWS = []
for (const comp of COMPONENTS) for (const icon of ICONS) for (const size of SIZES) for (const content of CONTENTS) for (const ctx of CONTEXTS) {
  ROWS.push({ id: `${comp}-${icon ? 'icon' : 'bare'}-${size}-${content}-${ctx}`, comp, icon, size, content, ctx })
}

const PP_BARE_ROOT = /cn\('flex w-full min-w-0', fieldDisplayTextClass\(size\), className\)/
const HELPER_BODY = /size === 'lg' \? 'text-body-lg' : 'text-body'/
const WRAPPER_SM = /sm: 'text-body h-field-sm /
const WRAPPER_MD = /md: 'text-body h-field-md /
const WRAPPER_LG = /lg: 'text-body-lg h-field-lg /
const COMBOBOX_SHELL_UNRESTRICTED = /<span className=\{cn\('flex-1 min-w-0', fieldDisplayTextClass\(sz\)\)\}>\{unrestrictedLabel\}<\/span>/

// redWhen(row, env):env.pageDefaultPx = 這一趟量到的頁面預設字級(見 inheritsVisibly)
const MUTANTS = [
  {
    id: 'peoplepicker-bare-no-font-class',
    what: 'PeoplePicker 預設檢視態的 root 拿掉 fieldDisplayTextClass(A100 修前的樣子)',
    file: 'components/PeoplePicker/people-picker.tsx',
    redWhen: (row, env) => row.comp === 'peoplepicker' && !row.icon && inheritsVisibly(row, env.pageDefaultPx),
    apply: (src) => replaceOnce(src, PP_BARE_ROOT, "cn('flex w-full min-w-0', className)"),
  },
  {
    id: 'helper-returns-nothing',
    what: 'fieldDisplayTextClass 不回傳任何 class(預設檢視態全部改吃外層)',
    file: 'components/Field/field-wrapper.tsx',
    redWhen: (row, env) => onlyLayer(row, 'helper') && inheritsVisibly(row, env.pageDefaultPx),
    apply: (src) => replaceOnce(src, HELPER_BODY, "''"),
  },
  {
    id: 'helper-lg-as-body',
    what: 'fieldDisplayTextClass 的 lg 給成 text-body(14px)',
    file: 'components/Field/field-wrapper.tsx',
    // helper 是 fieldDisplayTextClass 本身:預設檢視態與 Combobox 外殼裡那顆 span 用的是同一支
    redWhen: (row) => (innermost(row) === 'helper' || innermost(row) === 'combobox-shell') && row.size === 'lg',
    apply: (src) => replaceOnce(src, HELPER_BODY, "'text-body'"),
  },
  {
    // 與 helper-lg-as-body 對稱:頁面預設 = text-body 之後,sm / md 拿掉字級在頁面預設外層裡看不出來(繼承到的剛好是規格值),
    // 那幾列要靠「給錯值」才紅得起來 —— 否則它們的綠燈沒有任何突變證明過(覆蓋檢查會點名)
    id: 'helper-body-as-lg',
    what: 'fieldDisplayTextClass 的 sm / md 給成 text-body-lg(16px)',
    file: 'components/Field/field-wrapper.tsx',
    redWhen: (row) => (innermost(row) === 'helper' || innermost(row) === 'combobox-shell') && row.size !== 'lg',
    apply: (src) => replaceOnce(src, HELPER_BODY, "'text-body-lg'"),
  },
  {
    id: 'wrapper-no-size-font',
    what: 'fieldWrapperStyles 三個 size 都拿掉字級(showDisplayEndIcon=true 的外殼改吃外層)',
    file: 'components/Field/field-wrapper.tsx',
    redWhen: (row, env) => onlyLayer(row, 'wrapper') && inheritsVisibly(row, env.pageDefaultPx),
    apply: (src) => replaceOnce(replaceOnce(replaceOnce(src, WRAPPER_SM, "sm: 'h-field-sm "), WRAPPER_MD, "md: 'h-field-md "), WRAPPER_LG, "lg: 'h-field-lg "),
  },
  {
    id: 'wrapper-lg-as-body',
    what: 'fieldWrapperStyles 的 lg 字級給成 text-body(14px)',
    file: 'components/Field/field-wrapper.tsx',
    redWhen: (row) => innermost(row) === 'wrapper' && row.size === 'lg',
    apply: (src) => replaceOnce(src, WRAPPER_LG, "lg: 'text-body h-field-lg "),
  },
  {
    // 與 wrapper-lg-as-body 對稱(理由同 helper-body-as-lg)
    id: 'wrapper-body-as-lg',
    what: 'fieldWrapperStyles 的 sm / md 字級給成 text-body-lg(16px)',
    file: 'components/Field/field-wrapper.tsx',
    redWhen: (row) => innermost(row) === 'wrapper' && row.size !== 'lg',
    apply: (src) => replaceOnce(replaceOnce(src, WRAPPER_SM, "sm: 'text-body-lg h-field-sm "), WRAPPER_MD, "md: 'text-body-lg h-field-md "),
  },
  {
    id: 'combobox-shell-caption',
    what: 'Combobox 外殼(showDisplayEndIcon=true)裡「不限」那顆 span 給成 text-caption(12px)',
    file: 'components/Combobox/combobox.tsx',
    redWhen: (row) => innermost(row) === 'combobox-shell',
    apply: (src) => replaceOnce(src, COMBOBOX_SHELL_UNRESTRICTED, "<span className={cn('flex-1 min-w-0', 'text-caption')}>{unrestrictedLabel}</span>"),
  },
]

// 值文字怎麼認:有值 = 下表的字(日期 / 時間的格式由元件決定,只認數字);空值 = 檢視態空值符號 `-`(field-wrapper.tsx EMPTY_DISPLAY)
const VALUE_TEXT = {
  select: { exact: '進行中' },
  combobox: { exact: '不限' },
  datepicker: { pattern: '2026' },
  timepicker: { pattern: '14:30' },
  linkinput: { exact: 'Q4 產品路線圖' },
  peoplepicker: { exact: '王小明' },
}

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'

const STATUS = [{ value: 'in-progress', label: '進行中' }, { value: 'done', label: '已完成' }]
const REGIONS = [{ value: 'tw', label: '台灣' }, { value: 'jp', label: '日本' }]
const TEAM = ['王小明', '陳怡君', '林志豪']

const LABEL = { select: '狀態', combobox: '出貨地區', datepicker: '截止日', timepicker: '開會時間', linkinput: '規格文件', peoplepicker: '負責人' }
function Control({ comp, filled, icon }) {
  switch (comp) {
    case 'select': return <Select options={STATUS} value={filled ? 'in-progress' : null} showDisplayEndIcon={icon} />
    case 'combobox': return <Combobox options={REGIONS} unrestricted value={filled ? ['__unrestricted__'] : []} showDisplayEndIcon={icon} />
    case 'datepicker': return <DatePicker value={filled ? '2026-11-20' : null} showDisplayEndIcon={icon} />
    case 'timepicker': return <TimePicker value={filled ? '14:30' : null} showDisplayEndIcon={icon} />
    case 'linkinput': return <LinkInput value={filled ? 'https://example.com/specs/q4-roadmap' : null} label="Q4 產品路線圖" showDisplayEndIcon={icon} />
    case 'peoplepicker': return <PeoplePicker people={TEAM} value={filled ? '王小明' : null} showDisplayEndIcon={icon} />
  }
  return null
}
function Row({ row }) {
  return (
    <div data-row={row.id} style={{ width: 320 }}>
      <Field mode="view" size={row.size}>
        <FieldLabel>{LABEL[row.comp]}</FieldLabel>
        <Control comp={row.comp} filled={row.content === 'value'} icon={row.icon} />
      </Field>
    </div>
  )
}
const ROWS = ${JSON.stringify(ROWS)}
function App() {
  return (
    <TooltipProvider>
      <main data-scene style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--canvas)' }}>
        <section data-shot style={{ width: 720, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, background: 'var(--canvas)' }}>
          {[false, true].map((icon) => (
            <div key={String(icon)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="text-caption text-fg-muted">{icon ? 'showDisplayEndIcon=true' : 'showDisplayEndIcon=false(預設)'}</p>
              <Field mode="view" size="md"><FieldLabel>負責人</FieldLabel><PeoplePicker people={TEAM} value="王小明" showDisplayEndIcon={icon} /></Field>
              <Field mode="view" size="md"><FieldLabel>截止日</FieldLabel><DatePicker value="2026-11-20" showDisplayEndIcon={icon} /></Field>
              <Field mode="view" size="md"><FieldLabel>狀態</FieldLabel><Select options={STATUS} value="in-progress" showDisplayEndIcon={icon} /></Field>
            </div>
          ))}
        </section>
        <section data-ctx="page" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <span data-control-plain="page">不帶字級的純文字</span>
          {ROWS.filter((r) => r.ctx === 'page').map((r) => <Row key={r.id} row={r} />)}
        </section>
        <section data-ctx="sentinel" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '${SENTINEL_PX}px', lineHeight: '40px' }}>
          <span data-control-plain="sentinel">不帶字級的純文字</span>
          {ROWS.filter((r) => r.ctx === 'sentinel').map((r) => <Row key={r.id} row={r} />)}
        </section>
        <section data-ref-box style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }} />
      </main>
    </TooltipProvider>
  )
}
createRoot(document.getElementById('root')).render(<App />)
`

/** 頁面端:逐列找值文字、量 computed font-size 與字形框高度,並用同一段字的參考 span 量規格高度 */
const MEASURE = ({ rows, valueText }) => {
  const refBox = document.querySelector('[data-ref-box]')
  const refCache = new Map()
  const glyphHeight = (node) => { const r = document.createRange(); r.selectNodeContents(node); return r.getBoundingClientRect().height }
  const reference = (text, cls) => {
    const key = `${cls}|${text}`
    if (!refCache.has(key)) {
      const span = document.createElement('span'); span.className = cls; span.textContent = text; refBox.appendChild(span)
      refCache.set(key, { font: parseFloat(getComputedStyle(span).fontSize), height: glyphHeight(span.firstChild) })
      span.remove()
    }
    return refCache.get(key)
  }
  const out = {}
  for (const row of rows) {
    const box = document.querySelector(`[data-row="${row.id}"]`)
    if (!box) { out[row.id] = { missing: '找不到這一列的容器' }; continue }
    const want = row.content === 'empty' ? { exact: '-' } : valueText[row.comp]
    const hits = []
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim()
      if (!t || n.parentElement?.closest('label')) continue
      if (want.exact ? t === want.exact : t.includes(want.pattern)) hits.push(n)
    }
    if (!hits.length) { out[row.id] = { missing: `找不到值文字(${want.exact ?? want.pattern})` }; continue }
    out[row.id] = {
      samples: hits.map((n) => {
        const ref = reference(n.textContent, row.size === 'lg' ? 'text-body-lg' : 'text-body')
        return { text: n.textContent.trim().slice(0, 20), font: parseFloat(getComputedStyle(n.parentElement).fontSize), height: glyphHeight(n), refFont: ref.font, refHeight: ref.height }
      }),
    }
  }
  const plain = (ctx) => parseFloat(getComputedStyle(document.querySelector(`[data-control-plain="${ctx}"]`)).fontSize)
  // 頁面預設的期望值 = `--font-body-size` 解析出的字級(body 吃這個 token,base.css)。探針放在 23px 外層裡:
  // token 沒定義時 var() 失效、字級改為繼承 → 量到 23,呼叫端判儀器失效,不會被讀成某個看似合理的數字
  const probe = document.createElement('span'); probe.style.fontSize = 'var(--font-body-size)'; probe.textContent = '探'
  document.querySelector('[data-ctx="sentinel"]').appendChild(probe)
  const bodyToken = { raw: getComputedStyle(document.documentElement).getPropertyValue('--font-body-size').trim(), px: parseFloat(getComputedStyle(probe).fontSize) }
  probe.remove()
  return { rows: out, plain: { page: plain('page'), sentinel: plain('sentinel') }, bodyToken }
}

const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })

async function runVariant(page, label, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'field-view-font-size-harness.tsx', mutate })
  mutate?.assertApplied?.()
  const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene] [data-row]')
  try {
    await page.addStyleTag({ content: STYLE })
    await page.evaluate(() => document.fonts.ready)
    const m = await page.evaluate(MEASURE, { rows: ROWS, valueText: VALUE_TEXT })
    if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
    const { raw: tokenRaw, px: pageDefaultPx } = m.bodyToken
    if (!tokenRaw || !Number.isFinite(pageDefaultPx) || pageDefaultPx === SENTINEL_PX) {
      throw new InstrumentError(`--font-body-size 在 harness 頁面上解析不出來(值「${tokenRaw}」、探針量到 ${pageDefaultPx}px)—— 頁面預設的期望值無從推導`)
    }
    const checks = []
    for (const row of ROWS) {
      const r = m.rows[row.id]
      if (r.missing) throw new InstrumentError(`${row.id}:${r.missing}`)
      const spec = SPEC_PX[row.size]
      for (const s of r.samples) {
        // 參考 span 不是規格字級 = 樣式沒編進來或 token 與規格文字不一致 → 量具不能用,不是產品裁決
        if (s.refFont !== spec) throw new InstrumentError(`${row.id}:參考 span(${row.size === 'lg' ? 'text-body-lg' : 'text-body'})量到 ${s.refFont}px,不是規格的 ${spec}px`)
      }
      const pass = r.samples.every((s) => s.font === spec && Math.abs(s.height - s.refHeight) <= HEIGHT_TOLERANCE_PX)
      checks.push({ id: row.id, kind: 'contract', row, pass, detail: r.samples.map((s) => `「${s.text}」${s.font}px、字形框高 ${s.height.toFixed(2)}(規格 ${spec}px、參考高 ${s.refHeight.toFixed(2)})`).join(';') })
    }
    checks.push({ id: 'C-plain-page', kind: 'control', pass: m.plain.page === pageDefaultPx, detail: `頁面預設外層裡的純文字 ${m.plain.page}px(應 = --font-body-size ${tokenRaw} = ${pageDefaultPx}px;body 的字級住在 base.css)` })
    checks.push({ id: 'C-plain-sentinel', kind: 'control', pass: m.plain.sentinel === SENTINEL_PX, detail: `${SENTINEL_PX}px 外層裡的純文字 ${m.plain.sentinel}px(應 ${SENTINEL_PX};證明繼承外層在這裡看得見)` })
    if (SHOT_DIR) {
      mkdirSync(SHOT_DIR, { recursive: true })
      const file = resolve(SHOT_DIR, `field-view-font-size-${mutate ? 'mutant' : 'current'}.png`)
      await page.locator('[data-shot]').screenshot({ path: file })
      console.log(`  (畫面:${file})`)
    }
    return { label, checks, pageDefaultPx }
  } finally {
    dispose()
  }
}

const groupKey = (c) => `${c.row.comp} ${c.row.icon ? 'showDisplayEndIcon=true ' : 'showDisplayEndIcon=false'}`
function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  const groups = new Map()
  for (const c of checks.filter((x) => x.kind === 'contract')) {
    const k = groupKey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c)
  }
  for (const [k, cs] of groups) {
    const red = cs.filter((c) => !c.pass)
    console.log(`  ${red.length ? '✗' : '✓'} ${k.padEnd(40)} ${cs.length - red.length}/${cs.length} 列 = 規格(sm/md ${SPEC_PX.md}px、lg ${SPEC_PX.lg}px)`)
    for (const c of red) console.log(`      ✗ ${c.row.size} ${c.row.content === 'value' ? '有值' : '空值'} ${c.row.ctx === 'page' ? '頁面預設外層' : `${SENTINEL_PX}px 外層`}:${c.detail}`)
  }
  for (const c of checks.filter((x) => x.kind === 'control')) console.log(`  ${c.pass ? '✓' : '✗'} [對照] ${c.id}:${c.detail}`)
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()
/** 判定紅的那一行 —— 判定模式與 selftest 基準共用(npm 別名與 CI 只跑 --selftest,基準紅就是產品裁決,不能只印「量具不可信」) */
const verdictRedLine = (red) => `\n✗ Field 檢視態字級:${red.length} 列不等於規格值(${red.join(' / ')})—— SSOT field-controls.spec.md「(e) View typography canonical」`

let browser
try {
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: SHOT_DIR ? 2 : 1, colorScheme: 'light', reducedMotion: 'reduce' })
  const page = await context.newPage()
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(page, `原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(verdictRedLine(red))
      process.exitCode = 1
    } else {
      console.log(`\n✓ Field 檢視態字級:${result.checks.filter((c) => c.kind === 'contract').length} 列全部等於規格值(6 元件 × showDisplayEndIcon 兩值 × 3 size × 有值 / 空值 × 2 種外層),對照 ${result.checks.filter((c) => c.kind === 'control').length} 列綠`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) {
      console.log(verdictRedLine(redIds(baseline.checks)))
      problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    }
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    for (const m of MUTANTS) {
      let result
      try {
        result = await runVariant(page, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
      } catch (error) {
        if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
        throw error
      }
      report(result)
      const red = redIds(result.checks)
      // 突變只改元件原始碼,頁面預設不該跟著變;變了 = 突變碰到的是量具
      if (result.pageDefaultPx !== baseline.pageDefaultPx) problems.push(`${m.id}:頁面預設從 ${baseline.pageDefaultPx}px 變成 ${result.pageDefaultPx}px —— 突變弄壞的是量具,不是契約`)
      const want = ROWS.filter((r) => m.redWhen(r, { pageDefaultPx: result.pageDefaultPx })).map((r) => r.id).sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) {
        const extra = red.filter((id) => !want.includes(id)); const lack = want.filter((id) => !red.includes(id))
        problems.push(`${m.id}:紅了 ${red.length} 列、應剛好 ${want.length} 列(多紅:${extra.join(', ') || '無'};該紅沒紅:${lack.join(', ') || '無'})`)
      } else {
        console.log(`  → 突變 ${m.id} 剛好紅了該紅的 ${want.length} 列`)
      }
      for (const id of red) covered.add(id)
    }
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 列全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  await browser?.close()
}
