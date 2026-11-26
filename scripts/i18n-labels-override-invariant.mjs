#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 照 `packages/design-system/src/lib/i18n/README.md`「Fallback chain」(1 consumer prop → 2 I18nProvider → 3 DS 預設中文)開放換字的元件,
 *         傳進去的字**真的畫到畫面 / 讀屏名稱上**,不傳時是 DS 預設(= 開放前寫死的字,一字未改)。2026-11-26 E10 / E11 開放的三支:
 *         (P) Pagination `labels.range(start, end, total)` / `labels.pageSizeOption(size)`(帶數字的句子,函式;I18nProvider 只收字串 → 只經 prop,
 *             同 Coachmark `labels.step`):完整形態左側 range 資訊與「N 筆/頁」選單觸發鈕上的字;DataTable 的 `pagination` 設定原樣轉發
 *             `labels` / `prevAriaLabel` / `nextAriaLabel`(pagination.spec.md「完整形態」、data-table.spec.md「L5:分頁」);
 *         AgentPanel 家族共用 I18nProvider 的 componentKey `agent-panel`(同一支檔、同一個 namespace;2026-11-26 核對必修,原本兩個 key 已收掉):
 *         (T) AgentThinking 標題兩種字(進行中 / 完成):`labels` prop → I18nProvider `agent-panel.titleThinking` / `.titleDone` → 預設「思考中 / 思考過程」,prop 勝過 provider;
 *         (D) AgentDecisionCard 補中間那一層:I18nProvider `agent-panel.decision*`(`decision` + `AgentDecisionCardLabels` 的鍵首字大寫)→ 原本的 `labels` prop 照舊勝過它。
 *             13 個鍵各一格:第一次渲染就看得到的 9 個(× 的名字、下一題、送出、清除選取、「其他」、其他輸入格的 placeholder 與讀屏名稱、(建議)、(選填))
 *             用 react-dom/server 量;要按過才出現的 4 個(上一題、三句錯誤訊息)在瀏覽器裡真的按:先包 I18nProvider,按「下一題」→ 量上一題鈕的字,
 *             按「送出」→ 量 role="alert" 錯誤訊息(複選沒勾 / 不預選單選沒選 / 選了「其他」沒打字),不包的那一份量預設中文。
 *             找按鈕只靠結構(區塊裡最後一顆 button = 主鈕、最後一個 radio =「其他」),不靠被驗的字 —— 突變把字弄回中文時照樣按得到、紅在格上。
 *   紅: 任一格不符 → 逐格點名 exit 1。`--selftest` 在 DS 原始碼上各造一個根因突變(含修前寫法:Pagination 兩段字寫死、DataTable 不轉發、
 *       AgentThinking 標題寫死、AgentDecisionCard 不讀 I18nProvider),每個突變必須**剛好**紅它負責的那幾格,而且每一條契約格都被某個突變弄紅過。
 *   綠: 現行原始碼每格都量到且符合。打包 / 執行失敗、任一場景渲染出空字串、突變錨點對不到、瀏覽器裡按不到 / 等不到錯誤訊息 = 儀器失效
 *       (INSTRUMENT-FAIL,exit 2),不讀成通過。起不了 Chromium:必需瀏覽器的 lane(GOVERNANCE_BROWSER_REQUIRED=1)紅,其餘印 SKIPPED-ENV(= 沒驗)。
 *   註: 2026-11-26 新增(E9 / E10 / E11 同根因:畫面字或讀屏名稱寫死)。E9(DataTable 欄位顯示面板 `labels`)住 data-table-panel-reset-clear-invariant.mjs
 *       (5b),跟排序面板 `labels` 同一個入口、同一支閘;這支只收那支閘不量的元件 —— 在此之前沒有任何閘量「I18nProvider / labels 傳進去真的換字」
 *       (overlay-story-contract S10 只靜態比對文件與程式),所以新寫,不是重複。量法 = esbuild 把 DS **原始碼**打包(lib/ds-source-harness.mjs
 *       bundleDsHarness,同一份突變外掛):node CJS 給 react-dom/server 靜態渲染每個場景;瀏覽器 IIFE(預設模式)給決策卡要按過才出現的 4 個鍵。
 *       2026-11-26 前那 4 個鍵只有一格靜態代理(D-state-keys:讀原始碼確認它們從解析後的 labels 讀),核對必修要求每個新鍵一格「傳入 → 畫面換字」,
 *       換成上面的瀏覽器量法;因此本閘在 CI 跑在有 Chromium 的 job(.github/workflows/ci.yml 的 verify-browser-control-groups 那一步)。
 *
 * 用法:
 *   node scripts/i18n-labels-override-invariant.mjs              判定(現行原始碼;需要 Chromium,不需要 storybook 建置)
 *   node scripts/i18n-labels-override-invariant.mjs --selftest   對照組(全部單一根因突變;基準 = 一趟完整判定)
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip } from './lib/launch-browser.mjs'
import { InstrumentError, REPO_ROOT, bundleDsHarness, makeDriver, mountHarness, mutantFor, replaceOnce, resolveSourceRoot } from './lib/ds-source-harness.mjs'

const SOURCE_ROOT = resolveSourceRoot()
const PAGINATION = 'components/Pagination/pagination.tsx'
const DATA_TABLE = 'components/DataTable/data-table.tsx'
const AGENT = 'components/AgentPanel/agent-panel.tsx'

/** Pagination 的自訂字(彼此不同、與預設不同;range 帶三個數字 → 參數順序錯一個就量得到) */
const P_LABELS_SRC = '{ range: (s: number, e: number, t: number) => `Showing ${s}–${e} of ${t}`, pageSizeOption: (n: number) => `${n} per page` }'
const P_TOTAL = 128
const DT_TOTAL = 45
const T_PROP = { titleThinking: 'Thinking', titleDone: 'Thought process' }
const T_I18N = { titleThinking: 'Working it out', titleDone: 'How I got here' }
/**
 * 決策卡 13 個鍵全換(彼此不同、與預設不同)。左邊是 `AgentDecisionCardLabels` 的鍵(判定用),I18nProvider 裡的鍵是公開契約
 * `decision` + 首字大寫,下面 D_I18N_KEYS 逐字寫出來(不從元件匯入換算函式 —— 鍵名本身就是被驗的東西)。
 */
const D_I18N = {
  cancel: 'Dismiss card', previous: 'Back', next: 'Continue', submit: 'Send answers', clearSelection: 'Clear choice', other: 'Something else',
  otherPlaceholder: 'Type another option', otherAriaLabel: 'Other (free text)', recommendedSuffix: ' (suggested)', optionalSuffix: ' (optional)',
  errorSingle: 'Pick one option', errorMulti: 'Pick at least one option', errorOther: 'Type the other option',
}
const D_I18N_KEYS = {
  cancel: 'decisionCancel', previous: 'decisionPrevious', next: 'decisionNext', submit: 'decisionSubmit', clearSelection: 'decisionClearSelection',
  other: 'decisionOther', otherPlaceholder: 'decisionOtherPlaceholder', otherAriaLabel: 'decisionOtherAriaLabel', recommendedSuffix: 'decisionRecommendedSuffix',
  optionalSuffix: 'decisionOptionalSuffix', errorSingle: 'decisionErrorSingle', errorMulti: 'decisionErrorMulti', errorOther: 'decisionErrorOther',
}
/** I18nProvider 的 labels:{ 'agent-panel': { decisionCancel: …, … } } */
const D_PROVIDER = { 'agent-panel': Object.fromEntries(Object.entries(D_I18N).map(([k, v]) => [D_I18N_KEYS[k], v])) }
const D_PROP = { cancel: 'Close card', next: 'Next question' }
/** 兩題步進(第一題 = 選填單選、預選建議 →「(建議)」「(選填)」「清除選取」「其他」與輸入格、footer「下一題」都在第一次渲染) */
const Q_STEPS = [
  { id: 'scope', label: '這次要同步哪些專案的待辦?', optional: true, options: [
    { value: 'mine', label: '只有我的', description: '只同步你負責的 12 筆' },
    { value: 'team', label: '整個團隊', description: '同步團隊的 48 筆待辦' },
  ] },
  { id: 'notify', label: '同步完要通知哪些人?', multiSelect: true, options: [
    { value: 'owner', label: '負責人', description: '每筆待辦的負責人' },
    { value: 'watcher', label: '關注者', description: '有按關注的同事' },
  ] },
]
/** 單題卡(footer =「送出」) */
const Q_SINGLE = [
  { id: 'when', label: '要在什麼時候發布這次的版本說明?', options: [
    { value: 'now', label: '現在發布', description: '版本說明立刻寄給訂閱者' },
    { value: 'friday', label: '週五發布', description: '跟每週電子報一起寄出' },
  ] },
]
/** 不預選的必答單選(`noDefault`;沒選就按「送出」→ errorSingle) */
const Q_NODEFAULT = [
  { id: 'signer', label: '這份採購單要用誰的名義送出?', noDefault: true, options: [
    { value: 'me', label: '用我的名義', description: '簽核紀錄記在你名下' },
    { value: 'dept', label: '用部門名義', description: '簽核紀錄記在採購部' },
  ] },
]

const PROBE = `
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from '@/design-system/lib/i18n/i18n-context'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Pagination } from '@/design-system/components/Pagination/pagination'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { AgentThinking, AgentDecisionCard } from '@/design-system/components/AgentPanel/agent-panel'

const P_LABELS = ${P_LABELS_SRC}
const COLS = [{ accessorKey: 'title', header: '標題' }, { accessorKey: 'owner', header: '負責人' }]
const ROWS = Array.from({ length: ${DT_TOTAL} }, (_, i) => ({ id: String(i + 1), title: '工單 ' + (i + 1), owner: i % 2 ? '王小明' : '林雅婷' }))
const T_PROP = ${JSON.stringify(T_PROP)}
const T_I18N = { 'agent-panel': ${JSON.stringify(T_I18N)} }
const D_I18N = ${JSON.stringify(D_PROVIDER)}
const D_PROP = ${JSON.stringify(D_PROP)}
const Q_STEPS = ${JSON.stringify(Q_STEPS)}
const Q_SINGLE = ${JSON.stringify(Q_SINGLE)}
const noop = () => {}
const pg = { pageSize: 20, showTotal: true, pageSizeOptions: [10, 20, 50] }

const SCENES: Record<string, React.ReactElement> = {
  'pagination-default': <Pagination total={${P_TOTAL}} pageSize={20} showTotal pageSizeOptions={[10, 20, 50]} />,
  'pagination-labels': <Pagination total={${P_TOTAL}} pageSize={20} showTotal pageSizeOptions={[10, 20, 50]} labels={P_LABELS} />,
  'datatable-default': <DataTable columns={COLS} data={ROWS} pagination={pg} />,
  'datatable-labels': <DataTable columns={COLS} data={ROWS} pagination={{ ...pg, labels: P_LABELS, prevAriaLabel: 'Previous page', nextAriaLabel: 'Next page' }} />,
  'thinking-default-on': <AgentThinking thinking />,
  'thinking-default-off': <AgentThinking />,
  'thinking-prop-on': <AgentThinking thinking labels={T_PROP} />,
  'thinking-prop-off': <AgentThinking labels={T_PROP} />,
  'thinking-i18n-on': <I18nProvider labels={T_I18N}><AgentThinking thinking /></I18nProvider>,
  'thinking-i18n-off': <I18nProvider labels={T_I18N}><AgentThinking /></I18nProvider>,
  'thinking-both-on': <I18nProvider labels={T_I18N}><AgentThinking thinking labels={T_PROP} /></I18nProvider>,
  'decision-default-steps': <AgentDecisionCard questions={Q_STEPS} onSubmit={noop} onCancel={noop} />,
  'decision-default-single': <AgentDecisionCard questions={Q_SINGLE} onSubmit={noop} onCancel={noop} />,
  'decision-i18n-steps': <I18nProvider labels={D_I18N}><AgentDecisionCard questions={Q_STEPS} onSubmit={noop} onCancel={noop} /></I18nProvider>,
  'decision-i18n-single': <I18nProvider labels={D_I18N}><AgentDecisionCard questions={Q_SINGLE} onSubmit={noop} onCancel={noop} /></I18nProvider>,
  'decision-prop': <AgentDecisionCard questions={Q_STEPS} onSubmit={noop} onCancel={noop} labels={D_PROP} />,
  'decision-both': <I18nProvider labels={D_I18N}><AgentDecisionCard questions={Q_STEPS} onSubmit={noop} onCancel={noop} labels={D_PROP} /></I18nProvider>,
}
const out: Record<string, string> = {}
for (const [name, el] of Object.entries(SCENES)) out[name] = renderToStaticMarkup(<TooltipProvider>{el}</TooltipProvider>)
process.stdout.write(JSON.stringify(out))
`

/**
 * 瀏覽器那一半:決策卡要按過才出現的 4 個鍵。三種卡(兩題步進 / 不預選單選 / 單題)各兩份 —— 包 I18nProvider(i18n-*)與不包(default-*)。
 * 每份放在自己的 <section data-probe>,量具只在那一塊裡找東西。
 */
const BROWSER_PROBE = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@/design-system/lib/i18n/i18n-context'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { AgentDecisionCard } from '@/design-system/components/AgentPanel/agent-panel'

const D_I18N = ${JSON.stringify(D_PROVIDER)}
const noop = () => {}
const QUESTIONS = { steps: ${JSON.stringify(Q_STEPS)}, nodefault: ${JSON.stringify(Q_NODEFAULT)}, other: ${JSON.stringify(Q_SINGLE)} }
const card = (kind: 'steps' | 'nodefault' | 'other', i18n: boolean) => {
  const el = <AgentDecisionCard questions={QUESTIONS[kind]} onSubmit={noop} onCancel={noop} />
  return <section key={(i18n ? 'i18n-' : 'default-') + kind} data-probe={(i18n ? 'i18n-' : 'default-') + kind}>{i18n ? <I18nProvider labels={D_I18N}>{el}</I18nProvider> : el}</section>
}
createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <div data-probe-ready="">
      {card('steps', true)}{card('nodefault', true)}{card('other', true)}
      {card('steps', false)}{card('nodefault', false)}{card('other', false)}
    </div>
  </TooltipProvider>,
)
`

/** 區塊裡的按鈕 / radio / 錯誤訊息(頁面端);找東西只靠結構,不靠被驗的字 */
const readSection = (page, name) => page.evaluate((name) => {
  const root = document.querySelector(`[data-probe="${name}"]`)
  if (!root) return null
  const buttons = [...root.querySelectorAll('button:not([role="radio"]):not([role="checkbox"])')]
  const primary = buttons.at(-1)
  const group = primary?.parentElement
  const footerButtons = group ? [...group.querySelectorAll(':scope > button')] : []
  const alert = root.querySelector('[role="alert"]')
  return {
    footerTexts: footerButtons.map((b) => (b.textContent ?? '').trim()),
    alert: alert ? (alert.textContent ?? '').trim() : null,
  }
}, name)

/** 按區塊裡的主鈕(最後一顆非選項的 button)/ 最後一個 radio(=「其他」);按不到 = 儀器失效 */
async function pressIn(page, driver, name, what) {
  const sel = what === 'other'
    ? `[data-probe="${name}"] [role="radio"] >> nth=-1`
    : `[data-probe="${name}"] button:not([role="radio"]):not([role="checkbox"]) >> nth=-1`
  try { await page.click(sel, { timeout: 10_000 }) } catch (error) { throw new InstrumentError(`${name}:按不到${what === 'other' ? '「其他」' : '主鈕'}(${String(error?.message ?? error).split('\n')[0]})`) }
  await driver.settle()
}

/** 決策卡互動後的字:{ 區塊: { previous?, error } } */
async function measureInteractive(page, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: BROWSER_PROBE, harnessName: 'i18n-labels-override-browser-probe.tsx', mutate })
  const { pageErrors, dispose } = await mountHarness(page, code, '[data-probe-ready]')
  const driver = makeDriver(page)
  const out = {}
  try {
    for (const prefix of ['i18n', 'default']) {
      // 兩題步進:按「下一題」→ 第二題 footer 有兩顆(上一題 + 送出);再按「送出」(複選一項都沒勾)→ errorMulti
      const steps = `${prefix}-steps`
      await pressIn(page, driver, steps, 'primary')
      await driver.waitFor(`!!document.querySelector('[data-probe="${steps}"] [role="checkbox"]')`, `${steps} 進到第二題(複選)`)
      const afterNext = await readSection(page, steps)
      await pressIn(page, driver, steps, 'primary')
      await driver.waitFor(`!!document.querySelector('[data-probe="${steps}"] [role="alert"]')`, `${steps} 出現錯誤訊息`)
      const afterSubmit = await readSection(page, steps)
      out[steps] = { previous: afterNext?.footerTexts.length === 2 ? afterNext.footerTexts[0] : null, error: afterSubmit?.alert ?? null }
      // 不預選單選:沒選就按「送出」→ errorSingle
      const nodefault = `${prefix}-nodefault`
      await pressIn(page, driver, nodefault, 'primary')
      await driver.waitFor(`!!document.querySelector('[data-probe="${nodefault}"] [role="alert"]')`, `${nodefault} 出現錯誤訊息`)
      out[nodefault] = { error: (await readSection(page, nodefault))?.alert ?? null }
      // 單題:選「其他」、不打字就按「送出」→ errorOther
      const other = `${prefix}-other`
      await pressIn(page, driver, other, 'other')
      await pressIn(page, driver, other, 'primary')
      await driver.waitFor(`!!document.querySelector('[data-probe="${other}"] [role="alert"]')`, `${other} 出現錯誤訊息`)
      out[other] = { error: (await readSection(page, other))?.alert ?? null }
    }
    if (pageErrors.length) throw new InstrumentError(`瀏覽器頁面例外:${pageErrors[0]}`)
  } finally { dispose() }
  for (const [name, v] of Object.entries(out)) if (!v.error) throw new InstrumentError(`${name} 的錯誤訊息是空的 —— 量具沒在看`)
  return out
}

/** 打包(可帶突變)→ node 執行 → { 場景: html };任何一步失敗 = 儀器失效 */
async function measure(mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: PROBE, harnessName: 'i18n-labels-override-probe.tsx', mutate, platform: 'node', format: 'cjs' })
  mutate?.assertApplied?.()
  const dir = mkdtempSync(path.join(tmpdir(), 'i18n-labels-override-'))
  if (!dir || !existsSync(dir)) throw new InstrumentError('mkdtemp 失敗(回空)')
  const file = path.join(dir, 'probe.cjs')
  writeFileSync(file, code)
  const run = spawnSync(process.execPath, [file], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, NODE_PATH: path.join(REPO_ROOT, 'node_modules') } })
  if (run.status !== 0) throw new InstrumentError(`探針執行失敗:${String(run.stderr).split('\n').find((l) => l.trim()) ?? '(沒有輸出)'}`)
  let out
  try { out = JSON.parse(run.stdout.trim()) } catch { throw new InstrumentError('探針沒有輸出 JSON(儀器失效)') }
  for (const [name, html] of Object.entries(out)) if (!html || !text(html)) throw new InstrumentError(`場景 ${name} 渲染出空字串 —— 量具沒在看`)
  return out
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** 畫面上的字(標籤拿掉、空白收成一格) */
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
/** 某個屬性的所有值(已解碼) */
const attrs = (html, name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => decode(m[1]))
const has = (html, s) => text(html).includes(s)
const hasAttr = (html, name, v) => attrs(html, name).includes(v)

/** 契約格:id → (場景輸出, 原始碼) → 通過與否 + 細節。判定只有這一份(基準與每個突變共用,M37) */
const ROWS = [
  // ── (P) Pagination ──
  ['P-range', 'Pagination labels.range → 左側 range 資訊換字(帶對三個數字)', (o) => has(o['pagination-labels'], `Showing 1–20 of ${P_TOTAL}`) && !has(o['pagination-labels'], '筆,共')],
  ['P-size', 'Pagination labels.pageSizeOption → 每頁筆數選單觸發鈕上的字換掉', (o) => has(o['pagination-labels'], '20 per page') && !has(o['pagination-labels'], '筆/頁')],
  ['P-defaults', 'Pagination 不傳 labels → 預設「第 1–20 筆,共 128 筆」「20 筆/頁」', (o) => has(o['pagination-default'], `第 1–20 筆,共 ${P_TOTAL} 筆`) && has(o['pagination-default'], '20 筆/頁')],
  ['DT-range', 'DataTable pagination.labels.range 轉發到分頁列', (o) => has(o['datatable-labels'], `Showing 1–20 of ${DT_TOTAL}`)],
  ['DT-size', 'DataTable pagination.labels.pageSizeOption 轉發到分頁列', (o) => has(o['datatable-labels'], '20 per page')],
  ['DT-prev', 'DataTable pagination.prevAriaLabel 轉發 → 上一頁鈕讀屏名稱', (o) => hasAttr(o['datatable-labels'], 'aria-label', 'Previous page')],
  ['DT-next', 'DataTable pagination.nextAriaLabel 轉發 → 下一頁鈕讀屏名稱', (o) => hasAttr(o['datatable-labels'], 'aria-label', 'Next page')],
  ['DT-defaults', 'DataTable 分頁不傳字 → 預設 range、「20 筆/頁」、上一頁 / 下一頁', (o) => has(o['datatable-default'], `第 1–20 筆,共 ${DT_TOTAL} 筆`) && has(o['datatable-default'], '20 筆/頁')
    && hasAttr(o['datatable-default'], 'aria-label', '上一頁') && hasAttr(o['datatable-default'], 'aria-label', '下一頁')],
  // ── (T) AgentThinking ──
  ['T-prop-thinking', 'AgentThinking labels.titleThinking → 進行中的標題', (o) => has(o['thinking-prop-on'], T_PROP.titleThinking) && !has(o['thinking-prop-on'], '思考中')],
  ['T-prop-done', 'AgentThinking labels.titleDone → 完成後的標題', (o) => has(o['thinking-prop-off'], T_PROP.titleDone) && !has(o['thinking-prop-off'], '思考過程')],
  ['T-i18n-thinking', 'I18nProvider agent-panel.titleThinking → 進行中的標題', (o) => has(o['thinking-i18n-on'], T_I18N.titleThinking)],
  ['T-i18n-done', 'I18nProvider agent-panel.titleDone → 完成後的標題', (o) => has(o['thinking-i18n-off'], T_I18N.titleDone)],
  ['T-prop-over-i18n', 'AgentThinking 兩層都給 → labels prop 勝過 I18nProvider', (o) => has(o['thinking-both-on'], T_PROP.titleThinking) && !has(o['thinking-both-on'], T_I18N.titleThinking)],
  ['T-defaults', 'AgentThinking 都不給 → 預設「思考中」/「思考過程」', (o) => has(o['thinking-default-on'], '思考中') && has(o['thinking-default-off'], '思考過程')],
  // ── (D) AgentDecisionCard:I18nProvider 那一層(第一次渲染看得到的 9 個鍵)──
  ['D-i18n-cancel', 'I18nProvider agent-panel.decisionCancel → 標題列 × 的讀屏名稱', (o) => hasAttr(o['decision-i18n-steps'], 'aria-label', D_I18N.cancel)],
  ['D-i18n-next', 'I18nProvider agent-panel.decisionNext → footer 推進鈕', (o) => has(o['decision-i18n-steps'], D_I18N.next)],
  ['D-i18n-submit', 'I18nProvider agent-panel.decisionSubmit → 單題卡 footer 送出鈕', (o) => has(o['decision-i18n-single'], D_I18N.submit)],
  ['D-i18n-clear', 'I18nProvider agent-panel.decisionClearSelection → footer 左側清除鈕', (o) => has(o['decision-i18n-steps'], D_I18N.clearSelection)],
  ['D-i18n-other', 'I18nProvider agent-panel.decisionOther → 附加的「其他」選項', (o) => has(o['decision-i18n-steps'], D_I18N.other)],
  ['D-i18n-other-placeholder', 'I18nProvider agent-panel.decisionOtherPlaceholder → 其他輸入格的 placeholder', (o) => hasAttr(o['decision-i18n-steps'], 'placeholder', D_I18N.otherPlaceholder)],
  ['D-i18n-other-aria', 'I18nProvider agent-panel.decisionOtherAriaLabel → 其他輸入格的讀屏名稱', (o) => hasAttr(o['decision-i18n-steps'], 'aria-label', D_I18N.otherAriaLabel)],
  ['D-i18n-recommended', 'I18nProvider agent-panel.decisionRecommendedSuffix → 預選項 label 後的標記', (o) => has(o['decision-i18n-steps'], `${Q_STEPS[0].options[0].label}${D_I18N.recommendedSuffix}`)],
  ['D-i18n-optional', 'I18nProvider agent-panel.decisionOptionalSuffix → 選填題題目後的標記', (o) => has(o['decision-i18n-steps'], `${Q_STEPS[0].label}${D_I18N.optionalSuffix}`)],
  // ── (D) labels prop 照舊相容、兩層的先後 ──
  ['D-prop', 'AgentDecisionCard labels prop(沒包 provider)照舊換字', (o) => hasAttr(o['decision-prop'], 'aria-label', D_PROP.cancel) && has(o['decision-prop'], D_PROP.next)],
  ['D-prop-over-i18n', 'AgentDecisionCard 兩層都給 → prop 的鍵勝過 I18nProvider,prop 沒給的鍵照 I18nProvider', (o) => hasAttr(o['decision-both'], 'aria-label', D_PROP.cancel) && has(o['decision-both'], D_PROP.next)
    && !hasAttr(o['decision-both'], 'aria-label', D_I18N.cancel) && !has(o['decision-both'], D_I18N.next) && has(o['decision-both'], D_I18N.other)],
  ['D-defaults', 'AgentDecisionCard 都不給 → 預設中文(取消 / 下一題 / 送出 / 清除選取 / 其他 / 輸入其他選項 / 其他(自由輸入)/(建議)/(選填))', (o) => {
    const s = o['decision-default-steps']
    return hasAttr(s, 'aria-label', '取消') && has(s, '下一題') && has(o['decision-default-single'], '送出') && has(s, '清除選取') && has(s, '其他')
      && hasAttr(s, 'placeholder', '輸入其他選項') && hasAttr(s, 'aria-label', '其他(自由輸入)') && has(s, `${Q_STEPS[0].options[0].label}(建議)`) && has(s, `${Q_STEPS[0].label}(選填)`)
  }],
  // ── (D) 要按過才出現的 4 個鍵:瀏覽器裡真的按(見檔頭)──
  ['D-i18n-previous', 'I18nProvider agent-panel.decisionPrevious → 第二題 footer 的上一題鈕', (o) => o.ui['i18n-steps'].previous === D_I18N.previous],
  ['D-i18n-error-multi', 'I18nProvider agent-panel.decisionErrorMulti → 複選一項都沒勾就送出的錯誤訊息(role="alert")', (o) => o.ui['i18n-steps'].error === D_I18N.errorMulti],
  ['D-i18n-error-single', 'I18nProvider agent-panel.decisionErrorSingle → 不預選單選沒選就送出的錯誤訊息', (o) => o.ui['i18n-nodefault'].error === D_I18N.errorSingle],
  ['D-i18n-error-other', 'I18nProvider agent-panel.decisionErrorOther → 選了「其他」沒打字就送出的錯誤訊息', (o) => o.ui['i18n-other'].error === D_I18N.errorOther],
  ['D-state-defaults', 'AgentDecisionCard 都不給 → 按過之後是預設中文(上一題 / 請至少選擇一個選項 / 請選擇一個選項 / 請輸入其他選項)', (o) =>
    o.ui['default-steps'].previous === '上一題' && o.ui['default-steps'].error === '請至少選擇一個選項'
      && o.ui['default-nodefault'].error === '請選擇一個選項' && o.ui['default-other'].error === '請輸入其他選項'],
]
const ROW_IDS = ROWS.map(([id]) => id)

const MUTANTS = [
  { id: 'pagination-labels-ignored', what: 'Pagination 不理 labels(= 2026-11-26 前兩段字寫死)', file: PAGINATION,
    expectRed: ['P-range', 'P-size', 'DT-range', 'DT-size'],
    apply: (src) => replaceOnce(src, /const labels = \{ \.\.\.DEFAULT_PAGINATION_LABELS, \.\.\.labelsOverride \}/, 'const labels = { ...DEFAULT_PAGINATION_LABELS }') },
  { id: 'pagination-range-args', what: 'Pagination range 第三個參數傳錯(傳成這一頁最後一筆)', file: PAGINATION,
    expectRed: ['P-range', 'P-defaults', 'DT-range', 'DT-defaults'],
    apply: (src) => replaceOnce(src, /labels\.range\(rangeStart, rangeEnd, total\)/, 'labels.range(rangeStart, rangeEnd, rangeEnd)') },
  { id: 'datatable-not-forwarded', what: 'DataTable 不轉發 pagination 的 labels / prevAriaLabel / nextAriaLabel(= 2026-11-26 前)', file: DATA_TABLE,
    expectRed: ['DT-range', 'DT-size', 'DT-prev', 'DT-next'],
    apply: (src) => replaceOnce(src, /\s+labels=\{paginationOpts\?\.labels\}\s+prevAriaLabel=\{paginationOpts\?\.prevAriaLabel\}\s+nextAriaLabel=\{paginationOpts\?\.nextAriaLabel\}/, '') },
  { id: 'thinking-hardcoded', what: 'AgentThinking 標題寫死(= 2026-11-26 前)', file: AGENT,
    expectRed: ['T-prop-thinking', 'T-prop-done', 'T-i18n-thinking', 'T-i18n-done', 'T-prop-over-i18n'],
    apply: (src) => replaceOnce(src, /\{thinking \? titleThinking : titleDone\}/, "{thinking ? '思考中' : '思考過程'}") },
  { id: 'thinking-no-i18n', what: 'AgentThinking 只接 labels prop、不讀 I18nProvider', file: AGENT,
    expectRed: ['T-i18n-thinking', 'T-i18n-done'],
    apply: (src) => replaceOnce(replaceOnce(src, /t\('agent-panel', 'titleThinking', DEFAULT_THINKING_LABELS\.titleThinking\)/, 'DEFAULT_THINKING_LABELS.titleThinking'),
      /t\('agent-panel', 'titleDone', DEFAULT_THINKING_LABELS\.titleDone\)/, 'DEFAULT_THINKING_LABELS.titleDone') },
  { id: 'thinking-i18n-wins', what: 'AgentThinking 先後顛倒:I18nProvider 勝過 labels prop', file: AGENT,
    expectRed: ['T-prop-over-i18n'],
    apply: (src) => replaceOnce(src, /labelsOverride\?\.titleThinking \?\? t\('agent-panel', 'titleThinking', DEFAULT_THINKING_LABELS\.titleThinking\)/,
      "t('agent-panel', 'titleThinking', labelsOverride?.titleThinking ?? DEFAULT_THINKING_LABELS.titleThinking)") },
  { id: 'thinking-swapped', what: 'AgentThinking 兩種狀態的字對調', file: AGENT,
    expectRed: ['T-prop-thinking', 'T-prop-done', 'T-i18n-thinking', 'T-i18n-done', 'T-prop-over-i18n', 'T-defaults'],
    apply: (src) => replaceOnce(src, /\{thinking \? titleThinking : titleDone\}/, '{thinking ? titleDone : titleThinking}') },
  { id: 'decision-no-i18n', what: 'AgentDecisionCard 不讀 I18nProvider(= 2026-11-26 前只吃 labels prop)', file: AGENT,
    expectRed: ['D-i18n-cancel', 'D-i18n-next', 'D-i18n-submit', 'D-i18n-clear', 'D-i18n-other', 'D-i18n-other-placeholder', 'D-i18n-other-aria', 'D-i18n-recommended', 'D-i18n-optional', 'D-prop-over-i18n',
      'D-i18n-previous', 'D-i18n-error-multi', 'D-i18n-error-single', 'D-i18n-error-other'],
    apply: (src) => replaceOnce(src, /override\?\.\[key\] \?\? t\('agent-panel', decisionI18nKey\(key\), DEFAULT_DECISION_LABELS\[key\]\)/, 'override?.[key] ?? DEFAULT_DECISION_LABELS[key]') },
  { id: 'decision-unprefixed-key', what: '決策卡讀 I18nProvider 時用沒有 decision 前綴的鍵(會跟面板其他零件撞名;鍵名契約錯)', file: AGENT,
    expectRed: ['D-i18n-cancel', 'D-i18n-next', 'D-i18n-submit', 'D-i18n-clear', 'D-i18n-other', 'D-i18n-other-placeholder', 'D-i18n-other-aria', 'D-i18n-recommended', 'D-i18n-optional', 'D-prop-over-i18n',
      'D-i18n-previous', 'D-i18n-error-multi', 'D-i18n-error-single', 'D-i18n-error-other'],
    apply: (src) => replaceOnce(src, /t\('agent-panel', decisionI18nKey\(key\), DEFAULT_DECISION_LABELS\[key\]\)/, "t('agent-panel', key, DEFAULT_DECISION_LABELS[key])") },
  { id: 'decision-i18n-wins', what: 'AgentDecisionCard 先後顛倒:I18nProvider 勝過 labels prop', file: AGENT,
    expectRed: ['D-prop-over-i18n'],
    apply: (src) => replaceOnce(src, /override\?\.\[key\] \?\? t\('agent-panel', decisionI18nKey\(key\), DEFAULT_DECISION_LABELS\[key\]\)/, "t('agent-panel', decisionI18nKey(key), override?.[key] ?? DEFAULT_DECISION_LABELS[key])") },
  { id: 'decision-prop-ignored', what: 'AgentDecisionCard 補了 I18nProvider 卻丟掉原本的 labels prop(不相容)', file: AGENT,
    expectRed: ['D-prop', 'D-prop-over-i18n'],
    apply: (src) => replaceOnce(src, /override\?\.\[key\] \?\? t\('agent-panel', decisionI18nKey\(key\), DEFAULT_DECISION_LABELS\[key\]\)/, "t('agent-panel', decisionI18nKey(key), DEFAULT_DECISION_LABELS[key])") },
  { id: 'decision-cancel-wrong-key', what: '決策卡 × 的讀屏名稱讀錯鍵(讀成送出;鍵都有接、字放錯位置)', file: AGENT,
    expectRed: ['D-i18n-cancel', 'D-prop', 'D-prop-over-i18n', 'D-defaults'],
    apply: (src) => replaceOnce(src, /aria-label=\{labels\.cancel\}/, 'aria-label={labels.submit}') },
  { id: 'decision-previous-bypass', what: '決策卡「上一題」繞過解析後的 labels、直接讀預設常數(換字管道對它無效)', file: AGENT,
    expectRed: ['D-i18n-previous'],
    apply: (src) => replaceOnce(src, /\{labels\.previous\}/, '{DEFAULT_DECISION_LABELS.previous}') },
  { id: 'decision-error-other-bypass', what: '決策卡「其他」空白的錯誤訊息繞過解析後的 labels、直接讀預設常數', file: AGENT,
    expectRed: ['D-i18n-error-other'],
    apply: (src) => replaceOnce(src, /errorKind === 'other' \? labels\.errorOther/, "errorKind === 'other' ? DEFAULT_DECISION_LABELS.errorOther") },
  { id: 'decision-error-kinds-swapped', what: '決策卡單選 / 複選沒選的兩句錯誤訊息對調(鍵都有接、字放錯情況)', file: AGENT,
    expectRed: ['D-i18n-error-multi', 'D-i18n-error-single', 'D-state-defaults'],
    apply: (src) => replaceOnce(src, /\(multi \? labels\.errorMulti : labels\.errorSingle\)/, '(multi ? labels.errorSingle : labels.errorMulti)') },
]

/** 判定:回傳每一格 { id, pass } */
function judge(out) {
  return ROWS.map(([id, title, fn]) => ({ id, title, pass: !!fn(out) }))
}

/** 一趟:同一份突變套在 node(SSR 場景)與瀏覽器(決策卡互動)兩個打包上 */
async function runOnce(page, mutant) {
  const mutate = mutant ? mutantFor(SOURCE_ROOT, mutant.file, mutant.apply) : undefined
  const out = await measure(mutate)
  out.ui = await measureInteractive(page, mutate)
  return judge(out)
}

let browser
async function main() {
  const SELFTEST = process.argv.includes('--selftest')
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage()
  const baseline = await runOnce(page, null)
  const baseRed = baseline.filter((r) => !r.pass)
  if (!SELFTEST) {
    for (const r of baseline) console.log(`${r.pass ? '✅' : '❌'} ${r.id} ${r.title}`)
    if (baseRed.length) { console.error(`\n✗ i18n-labels-override:${baseRed.length} 格不符(${baseRed.map((r) => r.id).join(' / ')})`); process.exit(1) }
    console.log(`\n✓ i18n-labels-override:${baseline.length} 格全符合 —— Pagination / DataTable 分頁 / AgentThinking / AgentDecisionCard 傳進去的字真的換上,不傳是 DS 預設`)
    return
  }
  const problems = []
  if (baseRed.length) problems.push(`基準(現行原始碼)就紅:${baseRed.map((r) => r.id).join(' / ')}`)
  const covered = new Set()
  for (const m of MUTANTS) {
    const rows = await runOnce(page, m)
    const red = rows.filter((r) => !r.pass).map((r) => r.id).sort()
    const want = [...m.expectRed].sort()
    red.forEach((id) => covered.add(id))
    const ok = JSON.stringify(red) === JSON.stringify(want)
    console.log(`${ok ? '✅' : '❌'} 突變 ${m.id}(${m.what}):紅 ${red.join(' / ') || '(無)'}`)
    if (!ok) problems.push(`突變 ${m.id} 應剛好紅 ${want.join(' / ')},實際紅 ${red.join(' / ') || '(無)'}`)
  }
  const phantom = [...new Set(MUTANTS.flatMap((m) => m.expectRed))].filter((id) => !ROW_IDS.includes(id))
  if (phantom.length) problems.push(`突變的 expectRed 寫了不是契約格的 ${phantom.join(' / ')}`)
  const uncovered = ROW_IDS.filter((id) => !covered.has(id))
  if (uncovered.length) problems.push(`契約格 ${uncovered.join(' / ')} 沒被任何突變弄紅過 —— 它的綠燈是零證據`)
  if (problems.length) { console.error(`\n✗ selftest:\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的格(契約 ${ROW_IDS.length} 格全被覆蓋)—— 量具會紅`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().then(() => browser?.close()).catch(async (error) => {
    await browser?.close().catch(() => {})
    if (error instanceof InstrumentError) { console.error(`${INSTRUMENT_FAIL_MARKER} i18n-labels-override:${error.message}`); process.exit(2) }
    console.error(error)
    process.exit(1)
  })
}
