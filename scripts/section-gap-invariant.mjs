#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 產品畫面「區塊 ↔ 區塊」= 一條分隔線的位置,上下各 loose(layoutSpace.spec.md 規則 3「組 ↔ 組」;user 2026-11-06 #18)——
 *         · 不畫線(區塊感夠):上一塊底 → 下一塊頂 = loose × 2(標準密度 32 / 寬鬆 48);
 *         · 畫 Separator(區塊感不夠):上一塊底 → 線頂 = loose、線底 → 下一塊頂 = loose(間距不變,只是線看得見)。
 *         盤點出的兩類各量一處:FileViewer 資訊面板「說明」輸入框 → 「檔案資訊」標題(不畫線)、
 *         Separator「在 DescriptionList 區塊之間」的「基本資料」→ 線 → 「團隊資訊」(畫線);md 與 lg 兩種密度。
 *         · 表單欄位 → 跟在後面的表單按鈕列(不在浮層 footer 裡)也是這一級(user 2026-11-10 PR #172 留言):全 DS 盤點出的 8 處
 *           (Field 表單驗證 2、Rating 包在 Field 內、Select 隨 form 送出、Field 不放 form 動作、Checkbox 同意條款與 ❌ Switch 同意、Steps 精靈)
 *           各量「最後一個欄位底 → 按鈕列頂」= loose × 2。歷史紅燈:2e1f2e27 建置 8 處都是 md 16 / lg 24(只有一份 loose)。
 *         · 標題區 → 內容(2026-11-11,layoutSpace.spec.md 規則 3「標題區 → 內容」;user 2026-11-11「我覺得主要取決於那個標題和說明是否是
 *           完完全全在描述下方的東西？若是的話，那就是親近吧？如果是描述下方的多個東西，那確實是用loose沒錯？…」+ 決策頁「說明頁:甲」):
 *           底下只有一塊 = tight(heading-one)、兩塊以上 = loose(heading-many)。四種標題區(設計規格頁單獨的 H3、H3 + Desc、ExampleSection、
 *           TutorialRule)× 一塊 / 兩塊以上,每一格至少一列真頁(2026-11-14 A7 ⑤ 補齊「H3 + Desc × 兩塊以上」那一格),量「標題區底 → 第一個內容頂」。
 *           「一塊 / 兩塊以上是怎麼數出來的」(tutorial-page.tsx `headingContentOf`)每一條路至少一列:只有一個節點(一張表 / 一個元件 /
 *           一段說明文字)、一則示範 + 說明它的文字、彼此比 12 近 → 一塊(一列按鈕)、彼此 ≥ 12 → 兩塊以上、全是說明文字(隔 ≥ loose 兩塊以上 /
 *           比 loose 近一塊)、ExampleSection 直接放兩個以上子節點(結構上就是並列)。歷史紅燈:3d7f8ae6 建置一塊的也是 md 16 / lg 24。
 *           好幾個示範塊彼此只隔 tight 也算兩塊以上(user 2026-11-12「第四批成品的問題都照你建議，但清除全部的按鈕用TERTIARY」,第四批成品頁
 *           「多塊緊排」題標「建議」的選項 =「乙：有兩塊以上就維持遠的距離」):三種共用元件各挑一頁「彼此只隔 tight 的好幾塊」量 = loose
 *           (H3:ProgressBar「Status 一覽」三列;ExampleSection:Checkbox「尺寸一覽」三列;TutorialRule:Avatar「Avatar 代表身份…」選單框 + 圖例列兩塊 ——
 *           2026-11-14 前 TutorialRule 那一格是 Chip「互斥單選…」,數法修正後它的兩則示範中間隔著說明文字、已不是這種幾何,換掉);
 *           「一則示範 + 一段說明它的文字」= 一塊 = tight、一個元件(一個 Field)= 一塊(這兩條與上面各條路的數法都是【AI 推導】,見 tutorial-page.tsx
 *           `headingContentOf`、layoutSpace.spec.md「幾塊怎麼數」)。歷史紅燈:ada83612 建置(2026-11-11 那版數法)翻面的四格是反過來的 ——
 *           緊排的好幾塊 md 12 / lg 16、示範 + 說明 md 16 / lg 24。
 *           標題區的列舉與量法住 scripts/lib/doc-heading-zones.mjs(全站盤點 doc-heading-inventory-invariant.mjs 共用同一份);每一列寫明要量的是哪一種
 *           標題區(at),量到別種 = 量的不是那一段 = 儀器失效。
 *   紅: 任一處距離與期望差 > 0.6px(subpixel)→ 指名 case / 密度 / 數字並 exit 1。
 *       歷史紅燈(修前 main 8eb473c7 建置實測):FileViewer 資訊面板 md 16 / lg 24(= 只有一份 loose,標題比離自己的清單還近上一塊)。
 *       量不到(找不到那個標題 / 按鈕 / 線、讀不到 loose / tight、兩種密度同一個 loose、story 開不起來、等不到被量的元素)= 儀器失效:
 *       印 INSTRUMENT-FAIL、exit 2(不是產品裁決,也不算通過)。
 *   綠: 修後 FileViewer md 32 / lg 48;Separator 兩側 md 16 / 16、lg 24 / 24。純幾何,無動畫;重複跑恆等。
 *   量法: 靜態站開 story(globals density),等被量的元素本身出現(FileViewer 先按「展開詳細資訊面板」、等「檔案資訊」標題出現)再等版面靜止,
 *         讀 getBoundingClientRect(M32:量像素,不看 class);loose 的值從被量容器的 computed `--layout-space-loose` 讀,
 *         並要求 md ≠ lg —— 兩種密度讀到同一個 loose = 密度沒套上 = 儀器失效(不讀成通過)。
 *         `--selftest` 兩層:(1) 判定函式 —— 修前實測(16 / 24)必紅、修後形狀必綠、線一側縮回必紅、沒量到判儀器失效;
 *         **每一列標題區各餵一次「相反判定的距離」必紅並指名那一列**;(2) 在頁面上弄壞(要建置)—— 四種標題區(單獨 H3、H3 + Desc、
 *         ExampleSection、TutorialRule)各挑一列,把那個標題區的 data-heading-content 翻成另一種、等版面靜止,用主跑同一支量法再量 →
 *         那一列必紅、量到的數字正好是另一個 token(證明量的是對的那一段,不只是判定函式會紅)。
 *         兩層之間另有一格:經符號連結叫自己、給不存在的建置 → 必須以缺建置標記 + 結束碼 2 結束(「是不是被直接執行」比真實路徑,
 *         lib/direct-run.mjs;只比字串時經 /tmp 這類連結叫它會 0 行、exit 0)。
 *         `--static=<dir>` 指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛(呼叫端自己說明那是哪一份建置)。
 *         新鮮度守衛的 story 檔從建置的 index.json 依 CASES 推(2026-11-14 前是手寫清單,漏了 Notice / Button 設計規格、Badge 設計原則、
 *         FileViewer 展示四個 story 檔 —— Separator 那一則是整個目錄列進去才剛好有)。
 *   等產品修正才計入的列(`awaitingProductFix`):主跑照量照印、不計入紅綠;拿掉那個欄位就開。目前 0 列。曾有一列 —— FileViewer 設計規格「互動預覽」
 *         (規格 layoutSpace.spec.md「幾塊怎麼數」第 2 步字面 = 兩塊以上;產品 tutorial-page.tsx `headingContentOf` 量最小距離用的是沒扣掉說明文字
 *         的那一串 → 判一塊,修前 md 12 / lg 16);2026-11-14 產品改成只量扣掉說明文字之後的那幾塊、重建後量到 md 16 / lg 24,欄位已拿掉、這一列計入。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDirectRun, missingBuildViaSymlinkControl } from './lib/direct-run.mjs'
import { printSelftestLine } from './lib/gate-selftest-meta.mjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, requireStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  DOC_HEADING_SETTLE_FRAMES, HEADING_ZONE_SELECTOR, findHeadingZone, listHeadingZonesAfterSettle, listHeadingZonesInPage,
} from './lib/doc-heading-zones.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const TOL = 0.6
const DENSITIES = ['md', 'lg']
/** 表單 / 分隔線 / FileViewer 資訊面板:被量的元素出現之後再等這麼多格靜止才量。 */
const SECTION_GAP_SETTLE_FRAMES = 5

export const CASES = [
  { id: 'fileviewer-info-panel', kind: 'no-line', story: 'design-system-components-fileviewer-展示--open-snapshot', label: 'FileViewer 資訊面板 說明 → 檔案資訊' },
  { id: 'separator-between-sections', kind: 'line', story: 'design-system-components-separator-展示--between-sections', label: 'Separator 基本資料 → 線 → 團隊資訊' },
  // 表單欄位 → 跟在後面的表單按鈕列(不在浮層 footer 裡的全部;user 2026-11-10 PR #172 留言;盤點見 comments-fix/report.md)
  { id: 'form-field-update', kind: 'form', story: 'design-system-components-field-展示--form-validation', button: '儲存變更', label: 'Field 表單驗證(更新)欄位 → 儲存變更' },
  { id: 'form-field-create', kind: 'form', story: 'design-system-components-field-展示--form-validation', button: '建立專案', label: 'Field 表單驗證(建立)欄位 → 建立專案' },
  { id: 'form-rating-in-field', kind: 'form', story: 'design-system-components-rating-展示--in-field', button: '送出評分', label: 'Rating 包在 Field 內 → 送出評分' },
  { id: 'form-select-submit', kind: 'form', story: 'design-system-components-select-設計原則--immediate-vs-submit-rule', button: '儲存', label: 'Select 隨 form 送出 → 儲存 / 取消' },
  { id: 'form-field-not-for-form-actions', kind: 'form', story: 'design-system-components-field-設計原則--not-for-form-actions-rule', button: '儲存', label: 'Field 不放 form 動作 → 儲存 / 取消' },
  { id: 'form-checkbox-consent', kind: 'form', story: 'design-system-components-checkbox-設計原則--usage-guidance', button: '儲存', label: 'Checkbox 同意條款 → 儲存 / 取消' },
  { id: 'form-checkbox-switch-consent', kind: 'form', story: 'design-system-components-checkbox-設計原則--usage-guidance', button: '送出', label: 'Checkbox ❌ 用 Switch 同意 → 送出' },
  { id: 'form-steps-wizard', kind: 'form', story: 'design-system-components-steps-展示--default', button: '下一步', label: 'Steps 精靈這一步的欄位 → 下一步' },
  // 標題區 → 內容(2026-11-11):at = 要量的標題區種類 —— h3 = 設計規格頁單獨的 H3、h3+desc = H3 後面緊接 Desc(標題區的尾巴是 Desc)、
  // es = ExampleSection、rule = TutorialRule;text = 標題字樣(開頭比對),一塊 → tight、兩塊以上 → loose。各挑一頁實際的設計規格 / 設計原則頁。
  { id: 'heading-h3-one-table', kind: 'heading-one', story: 'design-system-internal-notice-設計規格--overview', at: 'h3', text: 'Slot 對照', label: 'Notice 設計規格「Slot 對照」→ 一張表(外包一層捲動容器)' },
  { id: 'heading-es-many-sections', kind: 'heading-many', story: 'design-system-components-button-設計規格--state-behavior', at: 'es', text: '狀態行為', label: 'Button 設計規格「狀態行為」→ 一個容器裡隔 32 的三段' },
  { id: 'heading-rule-many-examples', kind: 'heading-many', story: 'design-system-components-badge-設計原則--default-low-rule', at: 'rule', text: '選 level 時問', label: 'Badge 設計原則「選 level 時問…」→ 四則範例' },
  { id: 'heading-rule-one-example', kind: 'heading-one', story: 'design-system-components-badge-設計原則--default-low-rule', at: 'rule', text: '❌ 把 passive count 當 critical', label: 'Badge 設計原則「❌ 把 passive count 當 critical」→ 一則範例 + 說明' },
  // 好幾個示範塊彼此只隔 tight 也是兩塊以上 → loose(user 2026-11-12 第四批成品頁「多塊緊排」= 乙);三種共用元件各一頁。
  // `flippedFrom` = 2026-11-11 那版數法給這一格的判定(這一格是 2026-11-12 翻面的;selftest 拿它造「修前距離必紅」的對照組)。
  { id: 'heading-h3-many-tight-rows', kind: 'heading-many', flippedFrom: 'heading-one', story: 'design-system-components-progressbar-設計規格--overview', at: 'h3', text: 'Status 一覽', label: 'ProgressBar 設計規格「Status 一覽」→ 彼此隔 12 的三列示範' },
  { id: 'heading-es-many-tight-rows', kind: 'heading-many', flippedFrom: 'heading-one', story: 'design-system-components-checkbox-設計規格--overview', at: 'es', text: '尺寸一覽', label: 'Checkbox 設計規格「尺寸一覽」→ 彼此隔 12 的三列示範' },
  // rule 這一格 2026-11-14 前是 Chip 設計原則「互斥單選…」:數法改成只量扣掉說明文字之後的那幾塊以後,那兩則示範中間夾著一段
  // ExampleCaption(<p>,算說明文字),量到的是 ChipGroup ↔ SegmentedControl、遠超過 12 —— 已經不是「彼此只隔 tight」的幾何(審查 A)。
  // 換成 Avatar:TutorialRule 裡一個 flex-col gap-tight 容器放兩塊(有框的選單、圖例列),兩塊正好隔 tight;
  // 2026-11-11 那版數法(a20d5a3b tutorial-page.tsx headingContentOf:兩塊隔得比 loose 近 → one)判一塊 → flippedFrom = heading-one。
  { id: 'heading-rule-many-tight-demos', kind: 'heading-many', flippedFrom: 'heading-one', story: 'design-system-components-avatar-設計原則--usage-guidance', at: 'rule', text: 'Avatar 代表身份', label: 'Avatar 設計原則「Avatar 代表身份,Icon 代表概念」→ 彼此只隔 tight 的兩塊(有框的選單 + 圖例列)' },
  // 一則示範 + 一段說明它的文字 = 一塊 → tight(說明文字不算一塊;【AI 推導】;2026-11-11 那版因為兩者隔 16 判成兩塊)。
  { id: 'heading-h3-one-demo-prose', kind: 'heading-one', flippedFrom: 'heading-many', story: 'design-system-components-tabs-設計規格--color-matrix', at: 'h3+desc', text: 'TabsTrigger 四態色彩', label: 'Tabs 設計規格「TabsTrigger 四態色彩」→ 一張表 + 一段說明' },
  // 一個元件 = 一塊(元件裡面怎麼排是元件自己的事,不往裡數);好幾個欄位 = 兩塊以上。【AI 推導】的「只負責排版的容器」判斷;
  // 這兩格 2026-11-12 前後判定相同,守的是數法改寫時沒有把一個 Field 的 label 與輸入框數成兩塊。
  { id: 'heading-es-one-component', kind: 'heading-one', story: 'design-system-components-field-展示--horizontal-label-alignment', at: 'es', text: '驗證：單行 label 與 input 中線對齊', label: 'Field 展示「驗證：單行 label 與 input 中線對齊」→ 一個 Field' },
  { id: 'heading-es-many-fields', kind: 'heading-many', story: 'design-system-components-field-展示--mixed-control-alignment', at: 'es', text: '水平並排', label: 'Field 展示「水平並排…」→ 三個欄位' },
  // 2026-11-14(A7 ⑤):把「幾塊怎麼數」沒有列在量的路補起來(design-doc-headings.md 三之 B 的 R1–R7;每一列加之前在現行建置量過符合)。
  // 哪一頁算哪一種都是照 layoutSpace.spec.md「幾塊怎麼數」與邊角表 —— 數法是【AI 推導】,不是 user 的決定。
  { id: 'heading-desc-many-demos', kind: 'heading-many', story: 'design-system-components-tabs-設計規格--size-matrix', at: 'h3+desc', text: '三種 Size', label: 'Tabs 設計規格「三種 Size」→ 三則示範(H3 + Desc × 兩塊以上)' },
  { id: 'heading-desc-one-table', kind: 'heading-one', story: 'design-system-components-progressbar-設計規格--color-matrix', at: 'h3+desc', text: 'Status × Token 對照', label: 'ProgressBar 設計規格「Status × Token 對照」→ 一張表(H3 + Desc × 一塊)' },
  { id: 'heading-rule-one-button-row', kind: 'heading-one', story: 'design-system-components-button-設計原則--primary-rule', at: 'rule', text: '✅ 正確 — 唯一的 primary', label: 'Button 設計原則「✅ 正確 — 唯一的 primary」→ 一列按鈕(彼此比 12 近 = 元件的微距 → 一塊)' },
  { id: 'heading-rule-many-paragraphs', kind: 'heading-many', story: 'design-system-components-accordion-設計原則--content-rule', at: 'rule', text: '判斷法 —', label: 'Accordion 設計原則「判斷法 —」→ 全是說明文字、段落隔 ≥ loose(兩塊以上)' },
  { id: 'heading-rule-one-paragraphs', kind: 'heading-one', story: 'design-system-components-scrollarea-設計原則--out-of-scope-rule', at: 'rule', text: '❌ 全頁捲動不用 ScrollArea', label: 'ScrollArea 設計原則「❌ 全頁捲動不用 ScrollArea」→ 全是說明文字、段落比 loose 近(一塊)' },
  { id: 'heading-es-many-direct-children', kind: 'heading-many', story: 'design-system-components-tag-設計規格--overview', at: 'es', text: '結構（Anatomy）', label: 'Tag 設計規格「結構（Anatomy）」→ ExampleSection 直接放兩個以上子節點(結構上就是並列)' },
  { id: 'heading-es-one-datatable', kind: 'heading-one', story: 'design-system-components-datatable-展示--empty-state', at: 'es', text: '預設空狀態', label: 'DataTable 展示「預設空狀態」→ 一張 DataTable(一個元件 = 一塊,不往裡數)' },
  { id: 'heading-rule-one-paragraph', kind: 'heading-one', story: 'design-system-components-badge-設計原則--default-low-rule', at: 'rule', text: '自我檢查：一個畫面最多 1-2 個 critical badge', label: 'Badge 設計原則「自我檢查…」→ 只有一個節點(一段說明)' },
  // 兩塊(有底色的控制面板、一顆按鈕,彼此隔 12)+ 離按鈕 8 的一段尾註 = 兩塊以上(規格字面;2026-11-14 產品數法修好後計入,見檔頭「等產品修正才計入的列」)。
  { id: 'heading-desc-many-blocks-and-footnote', kind: 'heading-many', story: 'design-system-components-fileviewer-設計規格--inspector', at: 'h3+desc', text: '互動預覽', label: 'FileViewer 設計規格「互動預覽」→ 控制面板 + 按鈕 + 尾註(兩塊以上)' },
]

/** 頁面上把標記翻面的對照組:四種標題區各一列(兩列 one → many、兩列 many → one)。 */
export const FLIP_CASES = ['heading-h3-one-table', 'heading-h3-one-demo-prose', 'heading-es-many-sections', 'heading-rule-many-examples']

const isHeading = (c) => c.kind === 'heading-one' || c.kind === 'heading-many'
const opposite = (kind) => (kind === 'heading-one' ? 'heading-many' : 'heading-one')

/** 純函式:[{ id, kind, density, loose, tight?, gaps:[數字], missing? }] → 不符合的訊息清單(呼叫端與 selftest 共用)。含 INSTRUMENT-FAIL 的行 = 量不到。 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (r.missing) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.missing}`); continue }
    if (!(r.loose > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose`); continue }
    if (r.kind === 'heading-one' && !(r.tight > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-tight`); continue }
    const expected = r.kind === 'line' ? [r.loose, r.loose] : r.kind === 'heading-one' ? [r.tight] : r.kind === 'heading-many' ? [r.loose] : [r.loose * 2]
    if (!Array.isArray(r.gaps) || r.gaps.length !== expected.length || r.gaps.some((g) => !Number.isFinite(g))) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到區塊(應 ${expected.length} 段距離,實得 ${JSON.stringify(r.gaps)})`)
      continue
    }
    r.gaps.forEach((g, i) => {
      if (Math.abs(g - expected[i]) > TOL) {
        if (r.kind === 'heading-one' || r.kind === 'heading-many') {
          failures.push(`${where} 標題區底 → 內容頂 = ${g}px,應 ${expected[i]}(${r.kind === 'heading-one' ? 'tight:標題底下只有一塊' : 'loose:標題底下兩塊以上'},layoutSpace 規則 3「標題區 → 內容」)`)
          return
        }
        const what = r.kind === 'form' ? '最後一個欄位底 → 表單按鈕列頂' : r.kind === 'no-line' ? '上一塊底 → 下一塊頂' : (i === 0 ? '上一塊底 → 線頂' : '線底 → 下一塊頂')
        failures.push(`${where} ${what} = ${g}px,應 ${expected[i]}(${r.kind === 'line' ? 'loose:線的上下各 loose' : 'loose × 2:一條隱形分隔線、上下各 loose'})`)
      }
    })
  }
  for (const id of new Set(rows.map((r) => r.id))) {
    const looses = rows.filter((r) => r.id === id).map((r) => r.loose)
    if (looses.length === DENSITIES.length && new Set(looses).size === 1) failures.push(`${INSTRUMENT_FAIL_MARKER}:${id} 兩種密度讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  }
  return failures
}

/**
 * 純函式:標題區清單(lib/doc-heading-zones.mjs listHeadingZonesInPage 的回傳)→ 這一列的量測。
 * 找不到那個標題、或找到了但種類不對 → missing(judge 判儀器失效,並說清楚是哪一種);看不到 / 後面沒有內容 → gaps 空(judge 判沒量到)。
 */
export function headingRowFrom(zones, c) {
  const hit = findHeadingZone(zones, c)
  if (!hit) {
    const other = zones.find((z) => String(z.title).startsWith(c.text))
    const base = { loose: zones[0]?.loose ?? NaN, tight: zones[0]?.tight ?? NaN, gaps: [] }
    return { ...base, missing: other ? `頁面上「${c.text}」是 ${other.kind} 標題區,這一列要量的是 ${c.at} —— 量的不是那一段` : `頁面上找不到 ${c.at} 標題區「${c.text}…」` }
  }
  const z = hit.zone
  return { loose: z.loose, tight: z.tight, gaps: Number.isFinite(z.gap) ? [z.gap] : [], zoneIndex: hit.index, mark: z.mark }
}

function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const row = (id, kind, density, loose, gaps) => ({ id, kind, density, loose, gaps })
  const good = [
    row('fileviewer-info-panel', 'no-line', 'md', 16, [32]), row('fileviewer-info-panel', 'no-line', 'lg', 24, [48]),
    row('separator-between-sections', 'line', 'md', 16, [16, 16]), row('separator-between-sections', 'line', 'lg', 24, [24, 24]),
  ]
  expect(judge(good).length === 0, `修後形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  // 修前 main 8eb473c7 建置實測:資訊面板只有一份 loose
  const before = [row('fileviewer-info-panel', 'no-line', 'md', 16, [16]), row('fileviewer-info-panel', 'no-line', 'lg', 24, [24])]
  const f1 = judge(before)
  expect(f1.length === 2 && f1.some((s) => s.includes('@md') && s.includes('16px')) && f1.some((s) => s.includes('@lg') && s.includes('24px')), `修前 16 / 24 應兩密度都紅,實得 ${JSON.stringify(f1)}`)
  expect(judge([row('separator-between-sections', 'line', 'md', 16, [16, 8]), row('separator-between-sections', 'line', 'lg', 24, [24, 24])]).some((s) => s.includes('線底 → 下一塊頂 = 8px')), '線下側縮成 8 應紅')
  expect(judge([row('fileviewer-info-panel', 'no-line', 'md', 16, [])]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '沒量到應判儀器失效')
  expect(judge([row('fileviewer-info-panel', 'no-line', 'md', 16, [32]), row('fileviewer-info-panel', 'no-line', 'lg', 16, [32])]).some((s) => s.includes('密度沒套上')), '兩密度同 loose 應判儀器失效')
  // 表單欄位 → 表單按鈕列:修後 32 / 48 綠;2e1f2e27 以前只有一份 loose(16 / 24)兩密度都紅
  const formIds = CASES.filter((c) => c.kind === 'form').map((c) => c.id)
  const formGood = formIds.flatMap((id) => [row(id, 'form', 'md', 16, [32]), row(id, 'form', 'lg', 24, [48])])
  expect(judge(formGood).length === 0, `表單修後形狀應綠,實得 ${JSON.stringify(judge(formGood))}`)
  const formBefore = judge(formIds.flatMap((id) => [row(id, 'form', 'md', 16, [16]), row(id, 'form', 'lg', 24, [24])]))
  expect(formBefore.length === formIds.length * 2 && formBefore.every((s) => s.includes('最後一個欄位底 → 表單按鈕列頂')), `表單修前 16 / 24 應 ${formIds.length * 2} 格都紅,實得 ${formBefore.length}`)
  // 標題區 → 內容(2026-11-11):一塊 tight(md 12 / lg 16)、兩塊以上 loose(16 / 24)綠;3d7f8ae6 建置一塊的也是 loose → 紅;
  // 兩塊以上被縮成 tight → 紅;讀不到 tight → 儀器失效
  const hrow = (id, kind, density, loose, tight, gaps) => ({ id, kind, density, loose, tight, gaps })
  const headingCases = CASES.filter(isHeading)
  const headingGood = headingCases.flatMap((c) => [hrow(c.id, c.kind, 'md', 16, 12, [c.kind === 'heading-one' ? 12 : 16]), hrow(c.id, c.kind, 'lg', 24, 16, [c.kind === 'heading-one' ? 16 : 24])])
  expect(headingCases.length >= 4 && judge(headingGood).length === 0, `標題區 → 內容修後形狀應綠,實得 ${JSON.stringify(judge(headingGood))}`)
  const oneIds = headingCases.filter((c) => c.kind === 'heading-one').map((c) => c.id)
  const headingBefore = judge(oneIds.flatMap((id) => [hrow(id, 'heading-one', 'md', 16, 12, [16]), hrow(id, 'heading-one', 'lg', 24, 16, [24])]))
  expect(oneIds.length >= 2 && headingBefore.length === oneIds.length * 2 && headingBefore.every((s) => s.includes('tight:標題底下只有一塊')), `一塊的修前 16 / 24 應 ${oneIds.length * 2} 格都紅,實得 ${headingBefore.length}`)
  const manyId = headingCases.find((c) => c.kind === 'heading-many').id
  expect(judge([hrow(manyId, 'heading-many', 'md', 16, 12, [12]), hrow(manyId, 'heading-many', 'lg', 24, 16, [24])]).some((s) => s.includes('@md') && s.includes('loose:標題底下兩塊以上')), '兩塊以上被縮成 tight 應紅')
  expect(judge([hrow(oneIds[0], 'heading-one', 'md', 16, NaN, [12])]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('tight')), '讀不到 tight 應判儀器失效')
  // 2026-11-14:**每一列**標題區各餵一次「相反判定的距離」(md / lg 各一)→ 那一列兩種密度都紅、而且指名那一列(不只翻面過的那幾列)
  const unflagged = headingCases.filter((c) => {
    const red = judge([hrow(c.id, c.kind, 'md', 16, 12, [opposite(c.kind) === 'heading-one' ? 12 : 16]), hrow(c.id, c.kind, 'lg', 24, 16, [opposite(c.kind) === 'heading-one' ? 16 : 24])])
    return !(red.length === 2 && red.every((s) => s.startsWith(`${c.id} @`)))
  })
  expect(unflagged.length === 0, `每一列餵相反判定的距離都應紅並指名該列,這幾列沒有:${unflagged.map((c) => c.id).join('、')}`)
  // 每一列要量的標題區種類寫得清楚;四種標題區 × 一塊 / 兩塊以上每一格至少一列(檔頭的矩陣句靠這個成立)
  expect(headingCases.every((c) => ['h3', 'h3+desc', 'es', 'rule'].includes(c.at) && typeof c.text === 'string' && c.text.length > 0), '每一列標題區都要寫 at(h3 / h3+desc / es / rule)與 text')
  const counted = headingCases.filter((c) => !c.awaitingProductFix)
  const holes = ['h3', 'h3+desc', 'es', 'rule'].flatMap((at) => ['heading-one', 'heading-many'].filter((kind) => !counted.some((c) => c.at === at && c.kind === kind)).map((kind) => `${at} × ${kind}`))
  expect(holes.length === 0, `四種標題區 × 一塊 / 兩塊以上應每一格至少一列(計入紅綠的),缺:${holes.join('、')}`)
  // 找標題區:種類不對 = 找不到(量的不是那一段)、找不到 = 判儀器失效(由 judge 的 missing 出口)
  const zoneOf = (kind, title, gap = 12) => ({ kind, title, mark: 'one', mode: 'block', loose: 16, tight: 12, gap, hasContent: true, visible: true })
  const c0 = { id: 'x', kind: 'heading-one', at: 'h3', text: 'Slot 對照' }
  const wrongKind = headingRowFrom([zoneOf('h3+desc', 'Slot 對照')], c0)
  expect(Boolean(wrongKind.missing) && wrongKind.missing.includes('h3+desc') && judge([{ id: 'x', kind: 'heading-one', density: 'md', ...wrongKind }]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '標題字對、種類不對 → 判儀器失效並講出量到的是哪一種')
  expect(judge([{ id: 'x', kind: 'heading-one', density: 'md', ...headingRowFrom([zoneOf('h3', '別的')], c0) }]).some((s) => s.includes('找不到')), '找不到那個標題 → 判儀器失效')
  expect(judge([{ id: 'x', kind: 'heading-one', density: 'md', ...headingRowFrom([zoneOf('h3', 'Slot 對照', null)], c0) }]).some((s) => s.includes('沒量到區塊')), '找到了但量不到距離 → 判儀器失效')
  expect(JSON.stringify(headingRowFrom([zoneOf('h3', 'Slot 對照 — 表')], c0).gaps) === '[12]', '找到了 → 那一段距離')
  // 2026-11-12 翻面的格子(多塊緊排 = 乙;示範 + 說明 = 一塊):三種共用元件各要有一格「緊排的好幾塊」;
  // 把 2026-11-11 那版數法會給的距離(ada83612 建置實測:緊排的好幾塊 md 12 / lg 16、示範 + 說明 md 16 / lg 24)餵進去,每格兩種密度都要紅
  const flipped = headingCases.filter((c) => c.flippedFrom)
  expect(flipped.length >= 4 && flipped.every((c) => c.flippedFrom !== c.kind && (c.flippedFrom === 'heading-one' || c.flippedFrom === 'heading-many')), '`flippedFrom` 必須是另一種判定(相同 = 這一格沒有翻面,對照組是空的)')
  const tightMany = flipped.filter((c) => c.kind === 'heading-many')
  // 注意:這一句只看欄位(at / kind / flippedFrom),不看那一頁的幾何 —— 量具沒有記「塊與塊之間隔多少」。那一頁是不是真的「彼此只隔 tight」
  // 靠換列時人工核對(2026-11-14 Chip → Avatar 就是這樣抓到的:欄位都對、幾何已經變了);要機械化得讓 doc-heading-zones 記下塊間距
  expect(['h3', 'es', 'rule'].every((at) => tightMany.some((c) => c.at === at)), '「緊排的好幾塊」三種共用元件(h3 / es / rule)各要有一格')
  expect(flipped.some((c) => c.kind === 'heading-one'), '「一則示範 + 一段說明」至少要有一格')
  const gapBefore = (c, density) => (c.flippedFrom === 'heading-one' ? (density === 'md' ? 12 : 16) : (density === 'md' ? 16 : 24))
  const flippedBefore = judge(flipped.flatMap((c) => [hrow(c.id, c.kind, 'md', 16, 12, [gapBefore(c, 'md')]), hrow(c.id, c.kind, 'lg', 24, 16, [gapBefore(c, 'lg')])]))
  expect(flippedBefore.length === flipped.length * 2, `2026-11-12 翻面的格子用修前距離應 ${flipped.length * 2} 格都紅,實得 ${flippedBefore.length}:${JSON.stringify(flippedBefore)}`)
  expect(tightMany.every((c) => flippedBefore.some((s) => s.startsWith(`${c.id} @md`) && s.includes('loose:標題底下兩塊以上'))), '緊排的好幾塊被縮成 tight 應指名「兩塊以上」')
  // 翻面對照組的選列:四種標題區各一列、兩個方向都有
  const flipCases = FLIP_CASES.map((id) => CASES.find((c) => c.id === id))
  expect(flipCases.every(Boolean) && ['h3', 'h3+desc', 'es', 'rule'].every((at) => flipCases.some((c) => c.at === at)) && flipCases.some((c) => c.kind === 'heading-one') && flipCases.some((c) => c.kind === 'heading-many') && flipCases.every((c) => !c.awaitingProductFix),
    '頁面翻面的對照組要四種標題區各一列、one → many 與 many → one 都有、而且不能是等產品修正的列')
  if (ok) printSelftestLine('✓ section-gap 判定表 PASS(修前實測必紅、修後必綠、每一列標題區餵相反距離都指名紅、四種標題區 × 一塊 / 兩塊以上都有列、量不到判沒量到)')
  else console.log('❌ section-gap 判定表 FAIL')
  return ok
}

const instrumentFrom = (page, label, what, error) => new StoryRenderInstrumentError({
  storyId: label, url: page.url(), kind: 'wait-for-timeout', reason: `${what}:${String(error?.message ?? error).split('\n')[0]}`,
})

async function measureCase(page, origin, c, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  const label = `${c.story} @${density}`
  if (isHeading(c)) {
    // 等被量的那一種標題區本身出現 → 版面靜止 → 在最後一個靜止影格裡列出全部標題區(lib/doc-heading-zones.mjs,全站盤點閘同一份量法)
    const sel = c.at === 'rule' ? '[data-tutorial-rule]' : c.at === 'es' ? '[data-example-section]:not([data-tutorial-rule])' : c.at === 'h3+desc' ? '[data-spec-desc]' : '[data-spec-heading]'
    const { probe: zones } = await openStory(page, url, {
      waitFor: sel, label, settleFrames: DOC_HEADING_SETTLE_FRAMES, probe: listHeadingZonesInPage, probeArg: { selector: HEADING_ZONE_SELECTOR },
    })
    return headingRowFrom(zones, c)
  }
  if (c.kind === 'form') {
    // 等被量的按鈕本身出現(openStory 的 waitFor:等不到 = 儀器失效);按鈕列 = 從按鈕往上第一個「有前一個兄弟」的節點(ButtonGroup / 包按鈕的 div),
    // 前一個兄弟 = 最後一個欄位(或欄位群組)
    await openStory(page, url, {
      label, settleFrames: SECTION_GAP_SETTLE_FRAMES, waitForArg: c.button,
      waitFor: (name) => [...document.querySelectorAll('#storybook-root button')].some((b) => b.textContent.trim() === name && b.getBoundingClientRect().height > 0),
    })
    return page.evaluate((name) => {
      const button = [...document.querySelectorAll('#storybook-root button')].find((b) => b.textContent.trim() === name)
      let rowEl = button
      for (let i = 0; i < 4 && rowEl && !rowEl.previousElementSibling; i++) rowEl = rowEl.parentElement
      const prev = rowEl?.previousElementSibling
      const loose = parseFloat(getComputedStyle(rowEl?.parentElement ?? document.documentElement).getPropertyValue('--layout-space-loose'))
      const round = (v) => Math.round(v * 10) / 10
      return { loose, gaps: prev ? [round(rowEl.getBoundingClientRect().top - prev.getBoundingClientRect().bottom)] : [] }
    }, c.button)
  }
  if (c.id === 'fileviewer-info-panel') {
    await openStory(page, url, { waitFor: 'button[aria-label="展開詳細資訊面板"]', label, settleFrames: SECTION_GAP_SETTLE_FRAMES })
    // 點開面板 → 等「檔案資訊」標題本身出現 → 版面靜止;任一步等不到 = 儀器失效(2026-11-14 前這兩步沒接住,逾時會以沒有標記的例外結束、被讀成產品紅)
    await page.click('button[aria-label="展開詳細資訊面板"]').catch((error) => { throw instrumentFrom(page, label, '點不到「展開詳細資訊面板」', error) })
    await page.waitForFunction(() => [...document.querySelectorAll('aside span')].some((s) => s.textContent === '檔案資訊' && s.getBoundingClientRect().height > 0))
      .catch((error) => { throw instrumentFrom(page, label, '點開資訊面板後等不到「檔案資訊」標題', error) })
    const settle = await settleAfterInteraction(page, { frames: SECTION_GAP_SETTLE_FRAMES })
    if (!settle.ok) throw instrumentFrom(page, label, '點開資訊面板後版面等不到靜止', `等了 ${settle.framesWaited} 格`)
    return page.evaluate(() => {
      const heading = [...document.querySelectorAll('aside span')].find((s) => s.textContent === '檔案資訊')
      const group = heading.parentElement
      const stack = group.parentElement
      const textarea = group.previousElementSibling?.querySelector('textarea')
      const loose = parseFloat(getComputedStyle(stack).getPropertyValue('--layout-space-loose'))
      const round = (v) => Math.round(v * 10) / 10
      return { loose, gaps: textarea ? [round(heading.getBoundingClientRect().top - textarea.getBoundingClientRect().bottom)] : [] }
    })
  }
  await openStory(page, url, { waitFor: '[data-orientation="horizontal"]', label, settleFrames: SECTION_GAP_SETTLE_FRAMES })
  return page.evaluate(() => {
    const line = document.querySelector('#storybook-root [data-orientation="horizontal"]')
    const prev = line?.previousElementSibling, next = line?.nextElementSibling
    const loose = parseFloat(getComputedStyle(line.parentElement).getPropertyValue('--layout-space-loose'))
    const round = (v) => Math.round(v * 10) / 10
    if (!prev || !next) return { loose, gaps: [] }
    const l = line.getBoundingClientRect()
    return { loose, gaps: [round(l.top - prev.getBoundingClientRect().bottom), round(next.getBoundingClientRect().top - l.bottom)] }
  })
}

/** 被量的原始碼(新鮮度守衛):不是 story 的那幾個寫在這裡,story 檔從建置的 index.json 依 CASES 推(不再手寫,手寫的清單漏過四個檔)。 */
const NON_STORY_SOURCES = [
  'packages/design-system/src/components/FileViewer/file-viewer.tsx',
  'packages/design-system/src/components/Separator',
  'packages/design-system/src/tokens/layoutSpace/layoutSpace.css',
  'packages/design-system/src/stories-helpers/examples/tutorial-page.tsx',
  'packages/design-system/src/stories-helpers/anatomy/anatomy-utils.tsx',
]
function requireFreshBuildForCases() {
  if (staticArg) { requireStorybookBuild(path.join(STATIC, 'index.json')); return }
  requireStorybookBuild(path.join(STATIC, 'index.json'))
  const entries = JSON.parse(readFileSync(path.join(STATIC, 'index.json'), 'utf8')).entries ?? {}
  const storyFiles = new Set()
  const missing = []
  for (const story of new Set(CASES.map((c) => c.story))) {
    const importPath = entries[story]?.importPath
    if (typeof importPath === 'string' && importPath) storyFiles.add(importPath.replace(/^\.\//, ''))
    else missing.push(story)
  }
  if (missing.length) {
    // 先看是不是建置太舊(新增的 story 還沒建進去 = 缺前置,STALE-BUILD exit 2);建置不舊卻沒有 = CASES 寫錯(閘自己的錯,exit 1)
    requireFreshStorybookBuild(STATIC, ['packages/design-system/src'])
    console.error(`✗ section-gap 設定錯:建置的 index.json 裡沒有 ${missing.join('、')} —— story 改名了就改 CASES(不是缺前置、不是產品裁決)`)
    process.exit(1)
  }
  requireFreshStorybookBuild(STATIC, [...NON_STORY_SOURCES, ...storyFiles])
}

async function withBrowser(fn) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    return await fn(page, server.origin)
  } finally { await browser.close(); await server.stop() }
}

/** 主跑:每一列 × 兩種密度。 */
async function measure() {
  return withBrowser(async (page, origin) => {
    const rows = []
    for (const c of CASES) for (const density of DENSITIES) rows.push({ id: c.id, kind: c.kind, density, ...(await measureCase(page, origin, c, density)) })
    return rows
  })
}

/**
 * --selftest 第 2 層:在頁面上把標記翻面。四種標題區各一列(FLIP_CASES),開 md、量現況(必綠)→ 把那個標題區的 data-heading-content 改成另一種、
 * 等版面靜止 → 用主跑同一支量法再量 → 那一列必紅,而且量到的距離正好是另一個 token(證明量的是對的那一段)。產品若把標記寫回 = 對照組不成立。
 */
async function flipControls() {
  return withBrowser(async (page, origin) => {
    const problems = []
    for (const id of FLIP_CASES) {
      const c = CASES.find((x) => x.id === id)
      const density = 'md'
      const label = `${c.story} @${density}(翻面對照)`
      const base = await measureCase(page, origin, c, density)
      const baseRed = judge([{ id: c.id, kind: c.kind, density, ...base }])
      if (baseRed.length) { problems.push(`${c.id}:翻面之前就不綠 —— 前提不成立(${baseRed.join(' ; ').replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')})`); continue }
      const to = base.mark === 'one' ? 'many' : 'one'
      const zones = await listHeadingZonesAfterSettle(page, { label, setMark: { index: base.zoneIndex, value: to } })
      const flipped = headingRowFrom(zones, c)
      if (flipped.mark !== to) { problems.push(`${c.id}:翻成 ${to} 之後版面靜止時標記是 ${flipped.mark} —— 產品把它寫回了,這一格的對照組不成立`); continue }
      const red = judge([{ id: c.id, kind: c.kind, density, ...flipped }])
      const otherToken = c.kind === 'heading-one' ? flipped.loose : flipped.tight
      const exact = flipped.gaps.length === 1 && Math.abs(flipped.gaps[0] - otherToken) <= TOL
      if (red.length === 1 && red[0].startsWith(`${c.id} @${density}`) && exact) {
        printSelftestLine(`✓ 翻面對照 ${c.at}「${c.text}」:${base.mark} → ${to},距離 ${base.gaps[0]} → ${flipped.gaps[0]}(正好是 ${c.kind === 'heading-one' ? 'loose' : 'tight'} ${otherToken})→ 紅並指名這一列`)
      } else {
        problems.push(`${c.id}:翻成 ${to} 之後應紅、而且距離正好是另一個 token(${otherToken});實得距離 ${JSON.stringify(flipped.gaps)}、判定 ${JSON.stringify(red).replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')}`)
      }
    }
    return problems
  })
}

// 比真實路徑(lib/direct-run.mjs):經符號連結叫的時候只比字串會什麼都不跑、exit 0
if (isDirectRun(import.meta.url)) {
  try {
    if (SELFTEST) {
      if (!selftest()) process.exit(1)
      // 經符號連結叫自己、給不存在的建置 → 必須真的跑(缺建置標記 + 結束碼 2);審查 A 2026-11-14 的 s01
      const link = missingBuildViaSymlinkControl(import.meta.url)
      if (!link.ok) { console.log(`❌ section-gap selftest FAIL:${link.line}`); process.exit(1) }
      printSelftestLine(`✓ 對照組(${link.line})`)
      requireFreshBuildForCases()
      const problems = await flipControls()
      if (problems.length) { console.log(`❌ section-gap selftest FAIL(頁面翻面對照):\n  ${problems.join('\n  ')}`); process.exit(1) }
      printSelftestLine('✅ section-gap selftest PASS(判定表 + 四種標題區在頁面上翻面都指名紅、數字正好是另一個 token)')
      process.exit(0)
    }
    requireFreshBuildForCases()
    const rows = await measure()
    const awaiting = new Set(CASES.filter((c) => c.awaitingProductFix).map((c) => c.id))
    for (const r of rows) console.log(`  ${r.id.padEnd(40)} ${r.density}  loose ${r.loose}  距離 ${r.gaps.join(' / ')}${awaiting.has(r.id) ? '(等產品修正,未計入紅綠)' : ''}`)
    for (const c of CASES.filter((x) => x.awaitingProductFix)) {
      const pending = judge(rows.filter((r) => r.id === c.id))
      console.log(`  · ${c.id}(未計入):${pending.length ? pending.map((s) => s.replaceAll(INSTRUMENT_FAIL_MARKER, '[量不到]')).join(' ; ') : '已經符合,可以拿掉 awaitingProductFix 打開這一列'} —— ${c.awaitingProductFix}`)
    }
    const failures = judge(rows.filter((r) => !awaiting.has(r.id)))
    const instrument = failures.filter((s) => s.includes(INSTRUMENT_FAIL_MARKER))
    if (failures.length) {
      console.error('❌ section-gap FAIL:\n  ' + failures.join('\n  '))
      if (instrument.length) { console.error(`✗ section-gap:${instrument.length} 處量不到 —— 儀器失效(exit 2;不是產品裁決,也不算通過)`); process.exit(2) }
      process.exit(1)
    }
    console.log('✅ section-gap PASS(區塊 ↔ 區塊 = 一條分隔線的位置、上下各 loose;不畫線 = loose × 2;標題區 → 內容 一塊 tight / 兩塊以上 loose)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) {
      console.error(`✗ ${error.message}`)
      console.error(`✗ section-gap${SELFTEST ? '(selftest)' : ''}:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)`)
      process.exit(2)
    }
    throw error
  }
}
