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
 *         · 後來才顯示出來的內容(heading-reveal,2026-11-15 A11;產品 tutorial-page.tsx `useHeadingContent` 第 2 點「看不到 ↔ 看得到時重判」):
 *           四種標題區各一列(都是上面已經判 many 的同一個標題區)—— 把整個 story 藏起來(#storybook-root display:none)請產品判一次
 *           (內容量起來全是 0 → 判成一塊),再顯示、**不再請產品重判**,「標題區底 → 內容頂」要回到 loose(= 產品自己重判了),而且過程中頁面
 *           不得發出「ResizeObserver loop」錯誤。開頁時不是 many、藏著也判 many(這一列量不到有沒有重判)、沒裝錯誤收集器 = 儀器失效。
 *           歷史紅燈:A11 改之前的建置(9d3c4736 + 當時工作樹)四列兩種密度顯示後都停在 tight(md 12 / lg 16)。
 *           這四列的「不得出現 loop」分不出產品是下一格才寫還是在觀察者回呼裡直接寫(審查 A 實測直接寫照樣全綠)—— 另加夾具列
 *           (REVEAL_FIXTURES;直接打包 DS 原始碼、不經 storybook、只量標準密度):兩列巢狀(外層區段裡放一個藏起來會翻面的內層區段,
 *           回呼裡直接寫在這兩列會引發 loop —— 2026-11-15 fix-1 實測)、兩列「排版容器裡的內容晚顯示」(ExampleSection / H3 → 只帶 class 的容器 →
 *           第二塊從 display:none 顯示,要自己重判成 loose —— 2026-11-15 審查 A 第 2 輪:修前產品只觀察標題區之後那幾個節點本身,停在 tight)、
 *           一列兩段式顯示(heading-reveal-staged-es:ExampleSection → 只帶 class 的容器 → 一開始 display:none 的排版容器先顯示 —— 數法這下才往它裡面數 ——
 *           它裡面的第二塊再顯示;第二塊不在開頁時的觀察範圍裡,只有重判後把觀察範圍換到新路徑才看得到 —— 2026-11-15 審查 F5:那一支原本沒有任何一列守)。
 *           夾具沒有 storybook 的重畫通道,藏起來 / 顯示那一刻的判定都是產品自己做的 → 判錯是產品紅(exit 1),只有夾具沒掛上 / 沒照設計排出來 /
 *           讀不到標記才是儀器失效(同日審查 A 第 2 輪:修前把「藏起來沒重判」判成儀器失效、exit 2)。
 *   紅: 任一處距離與期望差 > 0.6px(subpixel)→ 指名 case / 密度 / 數字並 exit 1。
 *       歷史紅燈(修前 main 8eb473c7 建置實測):FileViewer 資訊面板 md 16 / lg 24(= 只有一份 loose,標題比離自己的清單還近上一塊)。
 *       量不到(找不到那個標題 / 按鈕 / 線、讀不到 loose / tight、兩種密度同一個 loose、story 開不起來、等不到被量的元素、夾具打包不起來或
 *       突變錨點對不到)= 儀器失效:印 INSTRUMENT-FAIL、exit 2(不是產品裁決,也不算通過;同一趟另有產品紅時照印,結束碼仍是 2 —— exitCodeFor)。
 *   綠: 修後 FileViewer md 32 / lg 48;Separator 兩側 md 16 / 16、lg 24 / 24。純幾何,無動畫;重複跑恆等。
 *   量法: 靜態站開 story(globals density),等被量的元素本身出現(FileViewer 先按「展開詳細資訊面板」、等「檔案資訊」標題出現)再等版面靜止,
 *         讀 getBoundingClientRect(M32:量像素,不看 class);loose 的值從被量容器的 computed `--layout-space-loose` 讀,
 *         並要求 md ≠ lg —— 兩種密度讀到同一個 loose = 密度沒套上 = 儀器失效(不讀成通過)。
 *         `--selftest` 兩層:(1) 判定函式 —— 修前實測(16 / 24)必紅、修後形狀必綠、線一側縮回必紅、沒量到判儀器失效;
 *         **每一列標題區各餵一次「相反判定的距離」必紅並指名那一列**;(2) 在頁面上弄壞(要建置)—— 四種標題區(單獨 H3、H3 + Desc、
 *         ExampleSection、TutorialRule)各挑一列,把那個標題區的 data-heading-content 翻成另一種、等版面靜止,用主跑同一支量法再量 →
 *         那一列必紅、量到的數字正好是另一個 token(證明量的是對的那一段,不只是判定函式會紅);(3) 後來才顯示的兩個對照(要建置)——
 *         頁面上故意造一個必然引發「ResizeObserver loop」的觀察者,收集器必須收到;每份文件第一支腳本之前把 ResizeObserver 換成空殼
 *         (= 修前只在 render 後判的產品),heading-reveal 四列都必紅、顯示後量到的正好是 tight;(4) 夾具列的原始碼突變(現行原始碼先跑一次必綠,
 *         當歸因基準)—— 回呼裡直接寫(SYNC_WRITE)→ 巢狀兩列只因 ResizeObserver loop 紅;拿掉重判(NO_REJUDGE)→ 五列全是產品紅、結束碼 1;
 *         只觀察直屬節點(WATCH_DIRECT_ONLY = 修前)→ 剛好容器三列(含兩段式)紅、正好停在 tight;拿掉 rAF 重判後那一次重新觀察(NO_REOBSERVE,
 *         開頁時的觀察保留)→ 剛好兩段式那一列紅、正好停在 tight、結束碼 1;夾具畫不出來 → InstrumentError。判定表另有:修前距離必紅
 *         並講「沒有重判」、前提不成立 / 沒裝收集器判儀器失效、收到 ResizeObserver loop 必紅、夾具「藏起來沒重判」是產品紅而真頁同一件事是儀器失效、
 *         結束碼(exitCodeFor)兩面。
 *         兩層之間另有一格:經符號連結叫自己、給不存在的建置 → 必須以缺建置標記 + 結束碼 2 結束(「是不是被直接執行」比真實路徑,
 *         lib/direct-run.mjs;只比字串時經 /tmp 這類連結叫它會 0 行、exit 0)。
 *         `--static=<dir>` 指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛(呼叫端自己說明那是哪一份建置)。夾具列不跟 `--static`
 *         (它們不經 storybook):預設打包本 repo 原始碼,`--root=<dir>` 改打包另一棵(同 data-table-panel-reset-clear 的用法)。
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
  DOC_HEADING_SETTLE_FRAMES, HEADING_ZONE_SELECTOR, findHeadingZone, installResizeLoopRecorder, installResizeLoopRecorderInPage, listHeadingZonesAfterSettle, listHeadingZonesInPage,
  provokeResizeLoop, readResizeLoopErrors, revealHeadingZones,
} from './lib/doc-heading-zones.mjs'
import { bundleDsHarness, compileDsCss, InstrumentError, mountHarness, mutantFor, replaceOnce, resolveSourceRoot } from './lib/ds-source-harness.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 夾具列打包的原始碼(`--root=<dir>`,同 data-table-panel-reset-clear 的用法;沒給 = 本 repo)。不跟 `--static`:那是 storybook 建置。 */
const SOURCE_ROOT = resolveSourceRoot()
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
  // 後來才顯示出來的內容(2026-11-15 A11;tutorial-page.tsx `useHeadingContent` 第 2 點):先把整個 story 藏起來(display:none)請產品判一次 ——
  // 內容量起來全是 0 → 判成一塊 —— 再顯示、不再請產品重判,量「標題區底 → 內容頂」要回到兩塊以上的 loose(= 產品自己重判了)。
  // 四種標題區各挑一列「靠距離數出兩塊以上」的(結構上就是並列的那種藏起來也判 many,量不到有沒有重判);都是上面已經量過、判 many 的同一個標題區。
  // 歷史紅燈:A11 改之前的建置(9d3c4736 + A12 / A13 工作樹)四列兩種密度都停在 tight(藏著時判的一塊)。
  { id: 'heading-reveal-es', kind: 'heading-reveal', story: 'design-system-components-button-設計規格--state-behavior', at: 'es', text: '狀態行為', label: 'Button 設計規格「狀態行為」藏起來判一次 → 顯示(ExampleSection)' },
  { id: 'heading-reveal-rule', kind: 'heading-reveal', story: 'design-system-components-badge-設計原則--default-low-rule', at: 'rule', text: '選 level 時問', label: 'Badge 設計原則「選 level 時問…」藏起來判一次 → 顯示(TutorialRule)' },
  { id: 'heading-reveal-h3', kind: 'heading-reveal', story: 'design-system-components-progressbar-設計規格--overview', at: 'h3', text: 'Status 一覽', label: 'ProgressBar 設計規格「Status 一覽」藏起來判一次 → 顯示(單獨的 H3)' },
  { id: 'heading-reveal-desc', kind: 'heading-reveal', story: 'design-system-components-tabs-設計規格--size-matrix', at: 'h3+desc', text: '三種 Size', label: 'Tabs 設計規格「三種 Size」藏起來判一次 → 顯示(H3 + Desc)' },
]

/** 頁面上把標記翻面的對照組:四種標題區各一列(兩列 one → many、兩列 many → one)。 */
export const FLIP_CASES = ['heading-h3-one-table', 'heading-h3-one-demo-prose', 'heading-es-many-sections', 'heading-rule-many-examples']

/**
 * 「後來才顯示」的夾具列(直接打包 DS 原始碼 —— lib/ds-source-harness.mjs,不經 storybook;`--root=` 可指到另一棵原始碼;只量標準密度,
 * 這幾列要看的是「什麼時候判、怎麼寫回」,跟密度無關)。兩種:
 * (一)巢狀(kind heading-reveal,2026-11-15 fix-1,審查 A 第 1 輪 should-fix):上面四列 heading-reveal 的「不得出現 ResizeObserver loop」
 *   分不出產品是「下一格才寫」還是「觀察者回呼裡直接寫」—— 2026-11-15 審查 A 把產品改成回呼裡直接寫、重建後跑本閘,四列照樣綠;
 *   同日 fix-1 在頁面上模擬直接寫,跑 59 則有巢狀標題區的候選 story 也一則都沒有引發。原因【推測;量到的是送通知的順序 = 內層在前,與外層收到的大小 = 內層寫回之後的】:內層的觀察者先建
 *   (React 子層 effect 先跑)、先送通知,它寫回造成的外層變大被外層稍後那一次通知吸收;並排的內層各自變大時外層高度取最大值,也可能不變。
 *   所以另做一個**會**分得出來的幾何:外層 ExampleSection(內容 = 一個容器)裡放一個內層 ExampleSection(內容 = 一個容器裡隔 24 的兩塊 → 兩塊以上),
 *   藏起來 → 顯示時內層從 one 翻回 many、變高,而外層正在觀察的那個容器跟著變高。late = 外層先掛、內層後掛(外層的觀察者先建);
 *   together = 同時掛。量法與判定同 heading-reveal 四列(judge),差在 `selfRejudge`:夾具沒有 storybook 的重畫通道,藏起來那一刻
 *   (內容全是 0)的判定**本身就是產品**「看不到 ↔ 看得到時重判」在做的事 —— 停在 many = 產品紅(指名那一列),不是儀器失效
 *   (2026-11-15 審查 A 第 2 輪:修前判成 INSTRUMENT-FAIL、exit 2,產品拿掉重判時被讀成「量不到」)。
 * (二)排版容器裡的內容晚顯示(kind heading-reveal-inner,2026-11-15 審查 A 第 2 輪 should-fix):標題區 → 只帶 class 的容器 →
 *   [一塊, 一塊(display:none)],直接改 style 顯示第二塊(不經 React,共用元件不重畫)。數法會往這種容器裡數,所以顯示前判 one、
 *   顯示後要自己重判成 many(loose);容器本身的框沒跨過 0,只觀察標題區之後那幾個節點本身的產品(修前)停在 one(tight)。
 *   ExampleSection 與設計規格頁 H3 各一列(兩種 `watch`)。
 * (三)兩段式顯示(kind heading-reveal-inner + `staged`,2026-11-15 審查 F5):tutorial-page.tsx useHeadingContent 的 rAF 回呼在重判之後
 *   重新設定觀察範圍(observeHeadingContent),那一支原本沒有任何一列守。它必要的情境【AI 推導 2026-11-15,本列的突變對照量過】:
 *   第一次顯示讓數法改走另一條路,之後的變化落在新路上 —— 標題區 → 只帶 class 的容器 W(一開始沒有看得到的子節點)→ 一開始 display:none 的
 *   排版容器 C → [一塊, 一塊(display:none)]。開頁時數法數到 W 就停(W 裡沒有佔位置的節點 → one),觀察的節點只到 C 這一層
 *   (標題區、W、W 的子節點 C),C 裡面那兩塊不在範圍裡。第一段顯示 C:C 跨過 0 → 重判,數法這下往 C 裡數(只有第一塊 → 仍 one),觀察範圍要跟著換成含 C 的子節點;
 *   第二段顯示第二塊:只有它跨過 0(W、C 只是變高),觀察範圍沒換的產品看不到 → 停在 one(tight)。兩層容器都不帶 data-*(帶了就是元件的根、
 *   數法不往裡數),量測端從 [data-fixture-late] 往上找 C。只做 ExampleSection 一列:重新觀察那一支 ExampleSection 與 H3 共用,`watch` 的差別
 *   已由(二)兩列守。
 * 只有「夾具沒掛上 / 找不到被量的元素 / 夾具沒照設計排出來(`premise`,例:樣式沒編進來、兩塊貼在一起)/ 讀不到判定標記」是儀器失效。
 * 對照組(--selftest,原始碼突變):回呼裡直接寫(SYNC_WRITE)→ 巢狀兩列只因 ResizeObserver loop 紅(fix-1 實測:每列 1–2 則,則數各次不同;
 * 判定只看有沒有);拿掉重判(NO_REJUDGE)→ 五列全是產品紅、沒有儀器失效;只觀察直屬節點(WATCH_DIRECT_ONLY = 審查 A 第 2 輪之前的產品)
 * → 容器三列(含兩段式)紅、巢狀兩列綠;拿掉 rAF 回呼裡重判後那一次重新觀察(NO_REOBSERVE,開頁時的觀察保留)→ 剛好兩段式那一列紅、
 * 正好停在 tight、產品紅結束碼 1,其他四列綠;夾具畫不出來 → InstrumentError(本閘 exit 2)。
 */
export const REVEAL_FIXTURES = [
  { id: 'heading-reveal-nested-late', kind: 'heading-reveal', fixture: 'nested-late', at: 'es', text: '內層區段', markSel: '[data-fixture-inner]', label: '巢狀夾具:外層 ExampleSection 先掛、內層後掛 → 藏起來 → 顯示' },
  { id: 'heading-reveal-nested-together', kind: 'heading-reveal', fixture: 'nested-together', at: 'es', text: '內層區段', markSel: '[data-fixture-inner]', label: '巢狀夾具:內外層同時掛 → 藏起來 → 顯示' },
  { id: 'heading-reveal-in-wrapper-es', kind: 'heading-reveal-inner', fixture: 'in-wrapper-es', at: 'es', text: '容器裡的區段', markSel: '[data-fixture-outer]', label: '排版容器裡的內容晚顯示:ExampleSection → 只帶 class 的容器 → 第二塊從 display:none 顯示' },
  { id: 'heading-reveal-in-wrapper-h3', kind: 'heading-reveal-inner', fixture: 'in-wrapper-h3', at: 'h3', text: '容器裡的小標', markSel: '[data-fixture-outer] [data-spec-heading]', label: '排版容器裡的內容晚顯示:設計規格頁 H3 → 只帶 class 的容器 → 第二塊從 display:none 顯示' },
  { id: 'heading-reveal-staged-es', kind: 'heading-reveal-inner', staged: true, fixture: 'staged-es', at: 'es', text: '兩段式顯示的區段', markSel: '[data-fixture-outer]', label: '兩段式顯示:ExampleSection → 只帶 class 的容器 → 藏著的排版容器先顯示(數法這下才往它裡面數)→ 它裡面的第二塊再顯示' },
]
const REVEAL_FIXTURE_HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { ExampleSection } from '@/design-system/stories-helpers/examples/tutorial-page'
import { H3 } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

// 有框的一塊示範;兩塊彼此隔 24(gap-6,≥ tight)= 兩塊以上的幾何
const Block = (props) => <div className="h-10 border border-border" data-fixture-block="" {...props} />

function Nested({ order }) {
  const [inner, setInner] = React.useState(order === 'together')
  window.__mountInner = () => setInner(true)
  return (
    <ExampleSection title="外層區段" data-fixture-outer="">
      <div>
        {inner ? (
          <ExampleSection title="內層區段" data-fixture-inner="">
            <div className="flex flex-col gap-6">
              <Block />
              <Block />
            </div>
          </ExampleSection>
        ) : null}
      </div>
    </ExampleSection>
  )
}

function InWrapper({ at }) {
  // 只帶 class 的排版容器(數法會往裡數);第二塊一開始 display:none,由量測端直接改 style 顯示
  const wrapper = (
    <div className="flex flex-col gap-6">
      <Block />
      <Block data-fixture-late="" style={{ display: 'none' }} />
    </div>
  )
  if (at === 'h3') return <div data-fixture-outer=""><H3>容器裡的小標</H3>{wrapper}</div>
  return <ExampleSection title="容器裡的區段" data-fixture-outer="">{wrapper}</ExampleSection>
}

function Staged() {
  // 兩段式:只帶 class 的容器 W(一開始沒有看得到的子節點)→ 一開始 display:none 的排版容器 C → [一塊, 一塊(display:none)]。
  // W、C 都不帶 data-*(帶了就是元件的根,數法不往裡數);量測端先顯示 C、再顯示第二塊,都直接改 style(不經 React)
  return (
    <ExampleSection title="兩段式顯示的區段" data-fixture-outer="">
      <div className="flex flex-col">
        <div className="flex flex-col gap-6" style={{ display: 'none' }}>
          <Block />
          <Block data-fixture-late="" style={{ display: 'none' }} />
        </div>
      </div>
    </ExampleSection>
  )
}

function Fixture({ name }) {
  return (
    <main data-fixture="" style={{ padding: 24, width: 600 }}>
      {name === 'nested-late' ? <Nested order="late" /> : name === 'nested-together' ? <Nested order="together" /> : name === 'staged-es' ? <Staged /> : <InWrapper at={name === 'in-wrapper-h3' ? 'h3' : 'es'} />}
    </main>
  )
}
// 先畫一個看得到的就緒標記(mountHarness 等的是「看得到」),再由量測端指定要哪一個夾具
const root = createRoot(document.getElementById('root'))
root.render(<p data-fixture-ready="">夾具</p>)
window.__renderFixture = (name) => root.render(<Fixture name={name} />)
`
const TUTORIAL_PAGE_SRC = 'stories-helpers/examples/tutorial-page.tsx'
/** 根因突變:觀察者回呼裡直接寫(把「排到下一格」換成當場執行)—— tutorial-page.tsx useHeadingContent 註解說下一格才寫是為了避免的那種寫法。 */
const SYNC_WRITE = (src) => replaceOnce(src, /w\.frame = requestAnimationFrame\(/, 'w.frame = ((write: () => void) => { write(); return 0 })(')
/** 根因突變:拿掉「看不到 ↔ 看得到時重判」(不建觀察者;只剩每次 render 後判 = A11 之前的產品)。 */
const NO_REJUDGE = (src) => replaceOnce(src, /if \(typeof ResizeObserver === 'undefined'\) return/, 'return')
/** 根因突變:只觀察 `watch` 的直屬節點、不跟著數法往排版容器裡看(= 2026-11-15 審查 A 第 2 輪之前的產品)。 */
const WATCH_DIRECT_ONLY = (src) => replaceOnce(src, /const next = new Set\(\[\.\.\.watch\(el\), \.\.\.descentWatched\(nodes\)\]\)/, 'const next = new Set(watch(el))')
/** 根因突變(2026-11-15 審查 F5):拿掉 rAF 回呼裡重判之後那一次重新觀察,layout effect 裡的初次觀察保留 —— 重判後數法改走另一條路時,觀察範圍停在舊路。 */
const NO_REOBSERVE = (src) => replaceOnce(src, /observeHeadingContent\(w, current, watchRef\.current, nodes\)/, 'void nodes')
export const FIXTURE_MUTANTS = { SYNC_WRITE, NO_REJUDGE, WATCH_DIRECT_ONLY, NO_REOBSERVE }

/** 頁面端:被量的標題區有沒有找到、它的判定標記、tight、夾具裡每一塊的框(純讀,不改東西)。 */
const readFixture = (markSel) => {
  const zone = document.querySelector(markSel)
  const blocks = [...document.querySelectorAll('[data-fixture-block]')].map((b) => {
    const r = b.getBoundingClientRect()
    return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, late: b.hasAttribute('data-fixture-late') }
  })
  return {
    found: Boolean(zone),
    mark: zone?.getAttribute('data-heading-content') ?? null,
    tight: zone ? parseFloat(getComputedStyle(zone).getPropertyValue('--layout-space-tight')) : NaN,
    blocks,
  }
}
const waitFixtureMark = (page, markSel, value) => page.waitForFunction(([sel, v]) => document.querySelector(sel)?.getAttribute('data-heading-content') === v, [markSel, value], { timeout: 10_000, polling: 'raf' })
  .then(() => true, () => false)

/**
 * 純函式:夾具有沒有照設計排出來(不成立 = 儀器失效,不是產品裁決)。`lateHidden`:第二塊應該還藏著(容器那幾列顯示第二塊之前);
 * `allHidden`:兩塊都應該還看不到(兩段式那一列開頁時:包著兩塊的排版容器整個藏著);
 * 否則兩塊都要看得到、彼此至少隔 tight(兩塊以上的幾何 —— 樣式沒編進來時兩塊會貼在一起)。回傳 null = 前提成立。
 */
export function fixturePremise({ blocks, tight }, { lateHidden = false, allHidden = false } = {}) {
  if (!Array.isArray(blocks) || blocks.length !== 2) return `應有 2 塊示範,實得 ${Array.isArray(blocks) ? blocks.length : '無'}`
  if (!(tight > 0)) return '讀不到 --layout-space-tight'
  const box = (b) => b.w > 0 && b.h > 0
  if (allHidden) return blocks.some(box) ? '包著兩塊的那層排版容器一開始就看得到(display:none 沒套上)' : null
  if (lateHidden) {
    const first = blocks.find((b) => !b.late)
    const late = blocks.find((b) => b.late)
    if (!first || !late) return '找不到「一開始就看得到」與「後來才顯示」各一塊'
    if (!box(first)) return '第一塊看不到'
    if (box(late)) return '後來才顯示的那一塊一開始就看得到(display:none 沒套上)'
    return null
  }
  if (!blocks.every(box)) return '有一塊看不到'
  const gap = blocks[1].top - blocks[0].bottom
  if (gap < tight - 0.5) return `兩塊之間 ${Math.round(gap * 10) / 10}px,比 tight ${tight} 近 —— 不是兩塊以上的幾何(樣式沒編進來?)`
  return null
}

/** 打包夾具(現行原始碼或一個原始碼突變)。錨點對不到 / 打包不起來由共用 bundleDsHarness 丟 InstrumentError(本閘 exit 2)。 */
async function bundleRevealFixture({ mutation = null, harness = REVEAL_FIXTURE_HARNESS } = {}) {
  const mutate = mutation ? mutantFor(SOURCE_ROOT, TUTORIAL_PAGE_SRC, mutation) : undefined
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness, harnessName: 'section-gap-reveal-fixture.tsx', mutate })
  mutate?.assertApplied()
  return code
}

/**
 * 量一列夾具。巢狀:掛上(late 再掛內層)→ 等內層判 many → 藏(#root display:none)→ 等產品自己重判成 one → 顯示 → 等版面靜止 → 量內層標題區。
 * 藏起來時**不**請產品重判:「看不到 → 判 one」本身就是被量的產品行為(judge 的 selfRejudge)。
 * 容器裡晚顯示:掛上 → 等判 one → 直接改 style 顯示第二塊 → 等判 many → 等版面靜止 → 量。
 * 兩段式(`staged`):掛上 → 等判 one → 先直接改 style 顯示包著兩塊的那層容器 → 等第一塊有高度、等版面靜止(產品下一格重判、換觀察範圍)
 * → 之後同容器裡晚顯示(此時讀的判定 = visibleMark)。
 * 等不到標記 = 不丟例外,讀到什麼交給 judge;夾具畫不出來、等不到靜止、頁面例外 = InstrumentError。
 */
async function measureRevealFixture(page, code, style, fx) {
  const { pageErrors, dispose } = await mountHarness(page, code, '[data-fixture-ready]')
  try {
    await page.addStyleTag({ content: style })
    await installResizeLoopRecorderInPage(page)
    await page.evaluate((name) => window.__renderFixture(name), fx.fixture)
    await page.waitForSelector('[data-fixture-outer]', { timeout: 10_000 }).catch(() => { throw new InstrumentError(`${fx.id}:夾具沒有渲染出來(等不到 [data-fixture-outer])`) })
    const settle = async (what) => { const s = await settleAfterInteraction(page, { frames: DOC_HEADING_SETTLE_FRAMES }); if (!s.ok) throw new InstrumentError(`${fx.id}:${what}版面等不到靜止`) }
    const read = async (what) => {
      const r = await page.evaluate(readFixture, fx.markSel)
      if (!r.found) throw new InstrumentError(`${fx.id}:${what}找不到被量的標題區 ${fx.markSel}`)
      return r
    }
    let visibleMark, hiddenMark = null, premise
    if (fx.kind === 'heading-reveal-inner') {
      await waitFixtureMark(page, fx.markSel, 'one')
      await settle('開頁後')
      if (fx.staged) {
        // 第一段:顯示包著兩塊的那層排版容器 —— 數法這下才往它裡面數;第二段(下面)顯示的第二塊落在這條新路上
        premise = fixturePremise(await read('開頁後'), { allHidden: true })
        if (!premise) {
          await page.evaluate(() => document.querySelector('[data-fixture-late]').parentElement.style.removeProperty('display'))
          const stageOk = await page.waitForFunction(() => (document.querySelector('[data-fixture-block]:not([data-fixture-late])')?.getBoundingClientRect().height ?? 0) > 0, null, { timeout: 10_000, polling: 'raf' }).then(() => true, () => false)
          if (!stageOk) throw new InstrumentError(`${fx.id}:拿掉中間那層容器的 display:none 之後第一塊仍量不到高度`)
          await settle('顯示中間那層容器後')
        }
      }
      const before = premise ? null : await read(fx.staged ? '顯示中間那層容器後' : '開頁後')
      visibleMark = before?.mark
      if (before) premise = fixturePremise(before, { lateHidden: true })
      if (!premise) {
        await page.evaluate(() => document.querySelector('[data-fixture-late]').style.removeProperty('display'))
        const shownOk = await page.waitForFunction(() => (document.querySelector('[data-fixture-late]')?.getBoundingClientRect().height ?? 0) > 0, null, { timeout: 10_000, polling: 'raf' }).then(() => true, () => false)
        if (!shownOk) throw new InstrumentError(`${fx.id}:拿掉第二塊的 display:none 之後仍量不到高度`)
        await waitFixtureMark(page, fx.markSel, 'many')
        await settle('顯示第二塊後')
        premise = fixturePremise(await read('顯示第二塊後'))
      }
    } else {
      if (fx.fixture === 'nested-late') await page.evaluate(() => window.__mountInner())
      await waitFixtureMark(page, fx.markSel, 'many')
      await settle('開頁後')
      const visible = await read('開頁後')
      visibleMark = visible.mark
      premise = fixturePremise(visible)
      await page.evaluate(() => document.getElementById('root').style.setProperty('display', 'none'))
      await waitFixtureMark(page, fx.markSel, 'one')
      await settle('藏起來後')
      hiddenMark = (await read('藏起來後')).mark
      await page.evaluate(() => document.getElementById('root').style.removeProperty('display'))
      const shownOk = await page.waitForFunction((sel) => (document.querySelector(sel)?.getBoundingClientRect().height ?? 0) > 0, fx.markSel, { timeout: 10_000, polling: 'raf' }).then(() => true, () => false)
      if (!shownOk) throw new InstrumentError(`${fx.id}:拿掉 display:none 之後被量的標題區仍量不到高度`)
      await settle('顯示後')
    }
    const zones = await page.evaluate(listHeadingZonesInPage, { selector: HEADING_ZONE_SELECTOR })
    const resizeLoop = await readResizeLoopErrors(page)
    if (pageErrors.length) throw new InstrumentError(`${fx.id}:頁面例外 ${pageErrors.join(' | ')}`)
    return { ...headingRowFrom(zones, fx), visibleMark, hiddenMark, premise, selfRejudge: true, resizeLoop, ...(fx.staged ? { staged: true } : {}) }
  } finally {
    dispose()
  }
}

const fixtureStyles = new Map()
/** 夾具列(一個瀏覽器;不需要 storybook 建置)。`only` = 只量這幾列;`harness` 只給 selftest 造「夾具畫不出來」的對照。 */
async function measureRevealFixtures({ mutation = null, only = null, harness = REVEAL_FIXTURE_HARNESS } = {}) {
  if (!fixtureStyles.has(harness)) fixtureStyles.set(harness, compileDsCss({ root: SOURCE_ROOT, extraSources: [harness] }))
  const style = await fixtureStyles.get(harness)
  const code = await bundleRevealFixture({ mutation, harness })
  const browser = await launchBrowserOrSkip({}, { hint: '夾具列不需要 storybook 建置,只需要 Chromium' })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const rows = []
    for (const fx of REVEAL_FIXTURES.filter((f) => !only || only.includes(f.id))) rows.push({ id: fx.id, kind: fx.kind, density: 'md', ...(await measureRevealFixture(page, code, style, fx)) })
    return rows
  } finally { await browser.close() }
}

const isHeading = (c) => c.kind === 'heading-one' || c.kind === 'heading-many'
const isReveal = (c) => c.kind === 'heading-reveal'
const MARKS = ['one', 'many']
const opposite = (kind) => (kind === 'heading-one' ? 'heading-many' : 'heading-one')
/** 標題區種類 → 開頁時要等的元素(那一種共用元件本身)。 */
const zoneSelector = (at) => (at === 'rule' ? '[data-tutorial-rule]' : at === 'es' ? '[data-example-section]:not([data-tutorial-rule])' : at === 'h3+desc' ? '[data-spec-desc]' : '[data-spec-heading]')

/**
 * 純函式:[{ id, kind, density, loose, tight?, gaps:[數字], missing? }] → 不符合的訊息清單(呼叫端與 selftest 共用)。含 INSTRUMENT-FAIL 的行 = 量不到。
 * heading-reveal 列另帶 visibleMark(開頁時的判定)、hiddenMark(藏起來那一次的判定)、resizeLoop(過程中收到的「ResizeObserver loop」錯誤,
 * null = 沒裝收集器;有東西 = 紅)。真頁那四列(hiddenMark 是請 storybook 重畫、產品判的):前兩個不是 many / one = 這一列量不到
 * 「顯示後有沒有重判」(儀器失效)。夾具列(`selfRejudge`,REVEAL_FIXTURES):夾具沒有重畫通道,藏起來那一次的判定**就是**產品自己重判的結果 ——
 * 停在 many = 產品紅(指名那一列);夾具沒照設計排出來(`premise`)/ 讀不到標記才是儀器失效(2026-11-15 審查 A 第 2 輪)。
 * heading-reveal-inner 列(排版容器裡的內容晚顯示):visibleMark = 顯示第二塊之前的判定(應 one),之後距離要回到 loose;
 * 帶 `staged` 的(兩段式)紅燈另講「第一次顯示後重判時觀察範圍有沒有換到新路徑」。
 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (r.missing) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.missing}`); continue }
    if (!(r.loose > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose`); continue }
    if (r.kind === 'heading-one' && !(r.tight > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-tight`); continue }
    if (r.kind === 'heading-reveal' || r.kind === 'heading-reveal-inner') {
      if (r.selfRejudge) {
        if (r.premise) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 夾具沒照設計排出來:${r.premise}`); continue }
        if (!MARKS.includes(r.visibleMark) || (r.kind === 'heading-reveal' && !MARKS.includes(r.hiddenMark))) {
          failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到判定標記(開頁 ${r.visibleMark}${r.kind === 'heading-reveal' ? ` / 藏起來 ${r.hiddenMark}` : ''})`)
          continue
        }
        if (r.kind === 'heading-reveal') {
          if (r.visibleMark !== 'many') failures.push(`${where} 開頁時判成 ${r.visibleMark}(夾具是彼此隔 ≥ tight 的兩塊 → 應為 many)—— 產品數錯(tutorial-page.tsx headingContentOf)`)
          if (r.hiddenMark !== 'one') failures.push(`${where} 藏起來(內容量起來全是 0)時產品沒有自己重判:判定停在 ${r.hiddenMark}(應為 one)—— tutorial-page.tsx useHeadingContent「看不到 ↔ 看得到時重判」`)
        } else if (r.visibleMark !== 'one') {
          failures.push(`${where} 排版容器裡只有一塊看得到時判成 ${r.visibleMark}(應為 one)—— 產品往排版容器裡數的那一步數錯(tutorial-page.tsx headingContentOf 第 1 步)`)
        }
      } else {
        if (r.visibleMark !== 'many') { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 開頁時這個標題區判的是 ${r.visibleMark}(這一列要的是判 many 的標題區)—— 量不到「顯示後有沒有重判」`); continue }
        if (r.hiddenMark !== 'one') { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 藏起來請產品判的那一次是 ${r.hiddenMark}(應為 one:內容量起來全是 0)—— 藏著與顯示判得一樣,量不到「顯示後有沒有重判」`); continue }
      }
      if (!Array.isArray(r.resizeLoop)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 頁面上沒有「ResizeObserver loop」收集器 —— 量不到有沒有引發那個錯誤`); continue }
      if (r.resizeLoop.length) failures.push(`${where} ${r.kind === 'heading-reveal' ? '藏起來再顯示' : '顯示第二塊'}的過程中頁面發了 ${r.resizeLoop.length} 次「ResizeObserver loop」錯誤(${String(r.resizeLoop[0]).slice(0, 80)})—— 重判不得在觀察者回呼裡改版面`)
    }
    const expected = r.kind === 'line' ? [r.loose, r.loose] : r.kind === 'heading-one' ? [r.tight] : (r.kind === 'heading-many' || r.kind === 'heading-reveal' || r.kind === 'heading-reveal-inner') ? [r.loose] : [r.loose * 2]
    if (!Array.isArray(r.gaps) || r.gaps.length !== expected.length || r.gaps.some((g) => !Number.isFinite(g))) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到區塊(應 ${expected.length} 段距離,實得 ${JSON.stringify(r.gaps)})`)
      continue
    }
    r.gaps.forEach((g, i) => {
      if (Math.abs(g - expected[i]) > TOL) {
        if (r.kind === 'heading-reveal') {
          failures.push(`${where} 顯示之後 標題區底 → 內容頂 = ${g}px,應 ${expected[i]}(loose:標題底下兩塊以上)—— 藏著時判成一塊,顯示後沒有重判(tutorial-page.tsx useHeadingContent「看不到 ↔ 看得到」)`)
          return
        }
        if (r.kind === 'heading-reveal-inner' && r.staged) {
          failures.push(`${where} 排版容器先顯示(數法這下才往它裡面數)、它裡面的第二塊再顯示之後 標題區底 → 內容頂 = ${g}px,應 ${expected[i]}(loose:兩塊以上)—— 第二塊出現時產品沒有重判:沒有重判,或第一次顯示後重判時沒把觀察範圍換到新路徑(tutorial-page.tsx useHeadingContent rAF 回呼裡的 observeHeadingContent;範圍 descentWatched)`)
          return
        }
        if (r.kind === 'heading-reveal-inner') {
          failures.push(`${where} 排版容器裡的第二塊後來才顯示之後 標題區底 → 內容頂 = ${g}px,應 ${expected[i]}(loose:兩塊以上)—— 排版容器裡的節點從看不到變看得到時產品沒有重判(tutorial-page.tsx useHeadingContent 的重判與觀察範圍 descentWatched)`)
          return
        }
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

/** 純函式:judge 的結果 → 結束碼(主跑用;selftest 判定表也測它)。0 = 全綠;有任何一行量不到 = 2(不是產品裁決,也不算通過);只有產品紅 = 1。 */
export function exitCodeFor(failures) {
  if (!failures.length) return 0
  return failures.some((s) => s.includes(INSTRUMENT_FAIL_MARKER)) ? 2 : 1
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
  // 後來才顯示(2026-11-15 A11):四種標題區各一列,而且都是上面已經量過、判 many 的同一個標題區;修後(顯示後 = loose)綠;
  // 修前(顯示後停在藏著時判的 tight)每一列兩種密度都紅、講出「沒有重判」;前提不成立 / 沒裝收集器 = 儀器失效;收到 ResizeObserver loop = 紅
  const revealCases = CASES.filter(isReveal)
  expect(['h3', 'h3+desc', 'es', 'rule'].every((at) => revealCases.some((c) => c.at === at)), 'heading-reveal 要四種標題區各一列')
  expect(revealCases.every((c) => CASES.some((x) => x.kind === 'heading-many' && x.story === c.story && x.at === c.at && x.text === c.text)),
    'heading-reveal 每一列都要是上面已經量過、判 many 的同一個標題區(開頁時的距離由那一列守)')
  const rrow = (c, density, gap, extra = {}) => ({ id: c.id, kind: c.kind, density, loose: density === 'md' ? 16 : 24, tight: density === 'md' ? 12 : 16, gaps: [gap], visibleMark: 'many', hiddenMark: 'one', resizeLoop: [], ...extra })
  const revealGood = revealCases.flatMap((c) => [rrow(c, 'md', 16), rrow(c, 'lg', 24)])
  expect(judge(revealGood).length === 0, `heading-reveal 修後形狀應綠,實得 ${JSON.stringify(judge(revealGood))}`)
  const revealBefore = judge(revealCases.flatMap((c) => [rrow(c, 'md', 12), rrow(c, 'lg', 16)]))
  expect(revealBefore.length === revealCases.length * 2 && revealBefore.every((s) => s.includes('顯示後沒有重判')) && revealCases.every((c) => revealBefore.some((s) => s.startsWith(`${c.id} @md`)) && revealBefore.some((s) => s.startsWith(`${c.id} @lg`))),
    `heading-reveal 修前(顯示後停在 tight)應 ${revealCases.length * 2} 格紅並指名「沒有重判」,實得 ${JSON.stringify(revealBefore)}`)
  const r0 = revealCases[0]
  expect(judge([rrow(r0, 'md', 16, { hiddenMark: 'many' })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('藏起來')), '藏著也判 many → 儀器失效(量不到有沒有重判)')
  expect(judge([rrow(r0, 'md', 16, { visibleMark: 'one' })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('開頁時')), '開頁時不是 many → 儀器失效')
  expect(judge([rrow(r0, 'md', 16, { resizeLoop: null })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('收集器')), '沒裝收集器 → 儀器失效')
  const loopRed = judge([rrow(r0, 'md', 16, { resizeLoop: ['ResizeObserver loop completed with undelivered notifications.'] })])
  expect(loopRed.length === 1 && loopRed[0].startsWith(`${r0.id} @md`) && loopRed[0].includes('ResizeObserver loop') && !loopRed[0].includes(INSTRUMENT_FAIL_MARKER), '收到「ResizeObserver loop」→ 紅(不是儀器失效)並指名那一列')
  // 夾具列(2026-11-15 fix-1 巢狀兩列 + 審查 A 第 2 輪容器兩列 + 審查 F5 兩段式一列):走同一支 judge;id 不跟 CASES 撞;
  // 巢狀 late / together 各一、容器 es / h3 各一、兩段式(staged)一列
  expect(REVEAL_FIXTURES.length === 5 && REVEAL_FIXTURES.every((f) => !CASES.some((c) => c.id === f.id))
    && ['nested-late', 'nested-together'].every((n) => REVEAL_FIXTURES.some((f) => f.fixture === n && f.kind === 'heading-reveal'))
    && ['es', 'h3'].every((at) => REVEAL_FIXTURES.some((f) => f.kind === 'heading-reveal-inner' && f.at === at && !f.staged))
    && REVEAL_FIXTURES.filter((f) => f.staged).length === 1 && REVEAL_FIXTURES.some((f) => f.staged && f.kind === 'heading-reveal-inner' && f.fixture === 'staged-es'),
  '夾具列:巢狀 late / together 各一(heading-reveal)、容器 es / h3 各一(heading-reveal-inner)、兩段式一列(heading-reveal-inner + staged)、id 不跟 CASES 撞')
  // 夾具的「藏起來那一刻」是產品行為(selfRejudge):兩面對照 —— 拿掉重判(停在 many)= 產品紅、結束碼 1;夾具沒排好 / 讀不到標記 = 儀器失效、結束碼 2
  const frow = (fx, extra = {}) => ({ id: fx.id, kind: fx.kind, density: 'md', loose: 16, tight: 12, gaps: [16], visibleMark: fx.kind === 'heading-reveal' ? 'many' : 'one', hiddenMark: fx.kind === 'heading-reveal' ? 'one' : null, premise: null, selfRejudge: true, resizeLoop: [], ...(fx.staged ? { staged: true } : {}), ...extra })
  const nestedFx = REVEAL_FIXTURES.filter((f) => f.kind === 'heading-reveal')
  const innerFx = REVEAL_FIXTURES.filter((f) => f.kind === 'heading-reveal-inner')
  const fixtureGood = judge(REVEAL_FIXTURES.map((f) => frow(f)))
  expect(fixtureGood.length === 0 && exitCodeFor(fixtureGood) === 0, `夾具列修後形狀應綠,實得 ${JSON.stringify(fixtureGood)}`)
  const noRejudge = judge(nestedFx.map((f) => frow(f, { hiddenMark: 'many' })))
  expect(noRejudge.length === nestedFx.length && nestedFx.every((f) => noRejudge.some((s) => s.startsWith(`${f.id} @md`) && s.includes('沒有自己重判'))) && !noRejudge.some((s) => s.includes(INSTRUMENT_FAIL_MARKER)) && exitCodeFor(noRejudge) === 1,
    `夾具藏起來停在 many(產品拿掉重判)應是產品紅、指名那一列、結束碼 1(不是儀器失效),實得 ${JSON.stringify(noRejudge)}`)
  const storyNoRejudge = judge([rrow(r0, 'md', 16, { hiddenMark: 'many' })])
  expect(exitCodeFor(storyNoRejudge) === 2, '真頁那四列藏著也判 many → 仍是儀器失效(請 storybook 重畫、產品判的;量不到有沒有重判),結束碼 2')
  const premiseBad = judge([frow(nestedFx[0], { premise: '兩塊之間 0px,比 tight 12 近' })])
  expect(premiseBad.length === 1 && premiseBad[0].includes(INSTRUMENT_FAIL_MARKER) && premiseBad[0].includes('夾具沒照設計排出來') && exitCodeFor(premiseBad) === 2, '夾具沒照設計排出來 → 儀器失效、結束碼 2')
  expect(judge([frow(nestedFx[0], { hiddenMark: null })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('讀不到判定標記')), '夾具讀不到判定標記 → 儀器失效')
  expect(judge([frow(nestedFx[0], { visibleMark: 'one' })]).some((s) => s.startsWith(`${nestedFx[0].id} @md`) && s.includes('產品數錯') && !s.includes(INSTRUMENT_FAIL_MARKER)), '夾具開頁就判 one(幾何是兩塊以上)→ 產品紅')
  expect(exitCodeFor([...noRejudge, ...premiseBad]) === 2, '產品紅與儀器失效同時出現 → 結束碼 2(這一趟不算數;產品紅照樣印出)')
  // 容器裡晚顯示(F5):修後顯示後 loose 綠;修前(只觀察直屬節點)停在 tight → 每一列產品紅、講觀察範圍;開頁就判 many → 產品紅
  const innerBefore = judge(innerFx.map((f) => frow(f, { gaps: [12] })))
  expect(innerBefore.length === innerFx.length && innerFx.every((f) => innerBefore.some((s) => s.startsWith(`${f.id} @md`) && s.includes('descentWatched'))) && exitCodeFor(innerBefore) === 1,
    `排版容器裡晚顯示:修前停在 tight 應每列產品紅並講觀察範圍,實得 ${JSON.stringify(innerBefore)}`)
  expect(judge([frow(innerFx[0], { visibleMark: 'many' })]).some((s) => s.includes('排版容器裡只有一塊看得到時判成 many') && !s.includes(INSTRUMENT_FAIL_MARKER)), '容器裡只有一塊看得到卻判 many → 產品紅')
  // 兩段式(F5):停在 tight 的紅燈要講到 rAF 回呼裡的重新觀察;其他容器列不講(訊息分得出是哪一支)
  const stagedFx = innerFx.filter((f) => f.staged)
  expect(stagedFx.length === 1 && innerBefore.filter((s) => s.includes('observeHeadingContent')).length === 1 && innerBefore.some((s) => s.startsWith(`${stagedFx[0].id} @md`) && s.includes('observeHeadingContent')),
    `兩段式停在 tight → 指名那一列並講 rAF 回呼裡的 observeHeadingContent,其他容器列不講,實得 ${JSON.stringify(innerBefore)}`)
  // 夾具前提(純函式):照設計 → null;樣式沒編進來(兩塊貼著)/ 第二塊沒藏起來 / 少一塊 → 指名
  const blk = (top, h = 40, late = false) => ({ w: 500, h, top, bottom: top + h, late })
  expect(fixturePremise({ blocks: [blk(0), blk(64)], tight: 12 }) === null, '夾具前提:兩塊隔 24 → 成立')
  expect(/比 tight/.test(fixturePremise({ blocks: [blk(0), blk(40)], tight: 12 }) ?? ''), '夾具前提:兩塊貼著(樣式沒編進來)→ 不成立')
  expect(fixturePremise({ blocks: [blk(0), { w: 0, h: 0, top: 0, bottom: 0, late: true }], tight: 12 }, { lateHidden: true }) === null, '夾具前提(顯示前):第二塊藏著 → 成立')
  expect(/一開始就看得到/.test(fixturePremise({ blocks: [blk(0), blk(64, 40, true)], tight: 12 }, { lateHidden: true }) ?? ''), '夾具前提(顯示前):第二塊沒藏起來 → 不成立')
  expect(/應有 2 塊/.test(fixturePremise({ blocks: [blk(0)], tight: 12 }) ?? ''), '夾具前提:少一塊 → 不成立')
  const hiddenBlk = (late = false) => ({ w: 0, h: 0, top: 0, bottom: 0, late })
  expect(fixturePremise({ blocks: [hiddenBlk(), hiddenBlk(true)], tight: 12 }, { allHidden: true }) === null, '夾具前提(兩段式開頁):兩塊都藏著 → 成立')
  expect(/一開始就看得到/.test(fixturePremise({ blocks: [blk(0), hiddenBlk(true)], tight: 12 }, { allHidden: true }) ?? ''), '夾具前提(兩段式開頁):包著兩塊的容器沒藏起來 → 不成立')
  if (ok) printSelftestLine('✓ section-gap 判定表 PASS(修前實測必紅、修後必綠、每一列標題區餵相反距離都指名紅、四種標題區 × 一塊 / 兩塊以上都有列、量不到判沒量到;後來才顯示四列:修前停在 tight 必紅、前提不成立判儀器失效、ResizeObserver loop 必紅;夾具列:拿掉重判 = 產品紅結束碼 1、夾具沒排好 = 儀器失效結束碼 2、容器裡晚顯示修前必紅、兩段式停在 tight 指名 rAF 回呼裡的重新觀察)')
  else console.log('❌ section-gap 判定表 FAIL')
  return ok
}

const instrumentFrom = (page, label, what, error) => new StoryRenderInstrumentError({
  storyId: label, url: page.url(), kind: 'wait-for-timeout', reason: `${what}:${String(error?.message ?? error).split('\n')[0]}`,
})

async function measureCase(page, origin, c, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  const label = `${c.story} @${density}`
  if (isHeading(c) || isReveal(c)) {
    // 等被量的那一種標題區本身出現 → 版面靜止 → 在最後一個靜止影格裡列出全部標題區(lib/doc-heading-zones.mjs,全站盤點閘同一份量法)
    const { probe: zones } = await openStory(page, url, {
      waitFor: zoneSelector(c.at), label, settleFrames: DOC_HEADING_SETTLE_FRAMES, probe: listHeadingZonesInPage, probeArg: { selector: HEADING_ZONE_SELECTOR },
    })
    if (!isReveal(c)) return headingRowFrom(zones, c)
    // 後來才顯示:藏起來請產品判一次 → 顯示、不再請它重判 → 量(lib/doc-heading-zones.mjs revealHeadingZones)
    const visibleMark = findHeadingZone(zones, c)?.zone.mark ?? null
    const { hidden, shown } = await revealHeadingZones(page, { label })
    const resizeLoop = await readResizeLoopErrors(page)
    return { ...headingRowFrom(shown, c), visibleMark, hiddenMark: findHeadingZone(hidden, c)?.zone.mark ?? null, resizeLoop }
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

/**
 * 開一個瀏覽器、一個分頁(開頁前裝好「ResizeObserver loop」收集器)。
 * `blindResizeObserver`:對照組用 —— 每份文件第一支腳本之前把 ResizeObserver 換成什麼都不做的空殼(產品因此看不到「看不到 ↔ 看得到」,
 * 等於 2026-11-15 前只在 render 後判的產品),heading-reveal 那幾列必須紅。
 */
async function withBrowser(fn, { blindResizeObserver = false } = {}) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await installResizeLoopRecorder(page)
    if (blindResizeObserver) {
      await page.addInitScript(() => {
        window.ResizeObserver = class BlindResizeObserver { observe() {} unobserve() {} disconnect() {} }
      })
    }
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

/**
 * --selftest 第 2 層之二(2026-11-15 A11):「後來才顯示」那幾列的兩個對照組 ——
 * (1) 收集器看得到:頁面上故意造一個必然引發「ResizeObserver loop」的觀察者,收集器必須收到(否則「沒有引發錯誤」是零證據);
 * (2) 產品看不到「看不到 ↔ 看得到」:每份文件第一支腳本之前把 ResizeObserver 換成空殼(= 修前只在 render 後判的產品),
 *     heading-reveal 每一列都必須紅、指名那一列、講「沒有重判」,而且顯示後量到的正好是 tight(藏著時判的一塊)。
 * (3) 產品在觀察者回呼裡直接寫(原始碼突變 SYNC_WRITE,2026-11-15 fix-1):巢狀夾具兩列都必須只因 ResizeObserver loop 紅
 *     ((1) 只證明收集器看得到頁面上人造的迴圈;這一格證明「不得出現 loop」那一欄抓得到產品自己的那種退化)。
 *     同一段另有 NO_REJUDGE / WATCH_DIRECT_ONLY / NO_REOBSERVE 三個原始碼突變(見下方註解)。
 */
async function revealControls() {
  const problems = []
  const reveal = CASES.filter(isReveal)
  await withBrowser(async (page, origin) => {
    const c = reveal[0]
    const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent('theme:light;density:md')}`
    await openStory(page, url, { waitFor: zoneSelector(c.at), label: `${c.story} @md(收集器對照)`, settleFrames: DOC_HEADING_SETTLE_FRAMES })
    const caught = await provokeResizeLoop(page)
    if (caught > 0) printSelftestLine(`✓ 收集器對照:頁面上故意造的 ResizeObserver 迴圈被收到 ${caught} 則(heading-reveal 的「沒有引發錯誤」有對照)`)
    else problems.push('收集器對照:頁面上故意造的「ResizeObserver loop」一則都沒收到 —— heading-reveal 那幾列「沒有引發錯誤」的綠燈是零證據')
  })
  await withBrowser(async (page, origin) => {
    for (const c of reveal) {
      const row = { id: c.id, kind: c.kind, density: 'md', ...(await measureCase(page, origin, c, 'md')) }
      const red = judge([row])
      const exact = row.gaps.length === 1 && Math.abs(row.gaps[0] - row.tight) <= TOL
      if (red.length === 1 && red[0].startsWith(`${c.id} @md`) && red[0].includes('顯示後沒有重判') && exact) {
        printSelftestLine(`✓ 空殼觀察者對照 ${c.at}「${c.text}」:顯示後 ${row.gaps[0]}(正好是 tight ${row.tight},停在藏著時判的一塊)→ 紅並指名這一列`)
      } else {
        problems.push(`${c.id}:ResizeObserver 換成空殼後應紅、而且顯示後正好是 tight(${row.tight});實得距離 ${JSON.stringify(row.gaps)}、判定 ${JSON.stringify(red).replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')}`)
      }
    }
  }, { blindResizeObserver: true })
  // (3) 夾具列:現行原始碼必綠(歸因的基準)→ 各原始碼突變必須剛好紅它負責的列、而且都是**產品紅**(不是儀器失效):
  //     SYNC_WRITE(2026-11-15 fix-1)→ 巢狀兩列只因 ResizeObserver loop 紅(距離照樣回到 loose)——「不得出現 loop」這一欄抓得到產品那種退化;
  //     NO_REJUDGE(審查 A 第 2 輪)→ 五列全紅:巢狀兩列講「沒有自己重判」、容器三列停在 tight;結束碼 1(修前判成儀器失效、exit 2);
  //     WATCH_DIRECT_ONLY(審查 A 第 2 輪之前的產品)→ 只有容器三列(含兩段式)紅、停在 tight,巢狀兩列綠(證明那幾列量的是觀察範圍,不是重判本身);
  //     NO_REOBSERVE(審查 F5)→ 全部五列跑一次,剛好兩段式那一列紅、停在 tight、產品紅結束碼 1,其他四列綠(證明那一列量的是 rAF 重判後的重新觀察)
  const fixtureBase = await measureRevealFixtures()
  const baseRed = judge(fixtureBase)
  const nestedIds = REVEAL_FIXTURES.filter((f) => f.kind === 'heading-reveal').map((f) => f.id)
  const innerIds = REVEAL_FIXTURES.filter((f) => f.kind === 'heading-reveal-inner').map((f) => f.id)
  if (baseRed.length) problems.push(`夾具列:現行原始碼就不綠 —— 突變的紅燈無法歸因(${baseRed.join(' ; ').replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')})`)
  else {
    printSelftestLine(`✓ 夾具列現行原始碼 ${fixtureBase.length} 列全綠(${fixtureBase.map((r) => `${r.id} ${r.gaps[0]}`).join('、')})`)
    const syncWrite = await measureRevealFixtures({ mutation: SYNC_WRITE, only: nestedIds })
    for (const row of syncWrite) {
      const red = judge([row])
      const loopOnly = red.length === 1 && red[0].startsWith(`${row.id} @md`) && red[0].includes('ResizeObserver loop') && !red[0].includes(INSTRUMENT_FAIL_MARKER)
      if (loopOnly) printSelftestLine(`✓ 回呼裡直接寫對照 ${row.id}:收到 ${row.resizeLoop.length} 則 ResizeObserver loop、顯示後距離 ${row.gaps[0]}(loose ${row.loose},重判照樣有)→ 只因 loop 紅並指名這一列`)
      else problems.push(`${row.id}:產品改成回呼裡直接寫後應只因 ResizeObserver loop 紅;實得 loop ${JSON.stringify(row.resizeLoop)}、判定 ${JSON.stringify(red).replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')}`)
    }
    const noRejudge = await measureRevealFixtures({ mutation: NO_REJUDGE })
    const noRejudgeRed = judge(noRejudge)
    const noRejudgeOk = noRejudge.every((row) => {
      const red = judge([row])
      const want = nestedIds.includes(row.id) ? '沒有自己重判' : 'descentWatched'
      return red.length >= 1 && red.every((s) => s.startsWith(`${row.id} @md`) && !s.includes(INSTRUMENT_FAIL_MARKER)) && red.some((s) => s.includes(want))
    }) && exitCodeFor(noRejudgeRed) === 1
    if (noRejudgeOk) printSelftestLine(`✓ 拿掉重判對照(NO_REJUDGE):${noRejudge.length} 列全是產品紅、各自指名(巢狀:藏起來停在 ${noRejudge.filter((r) => nestedIds.includes(r.id)).map((r) => r.hiddenMark).join(' / ')};容器:顯示後 ${noRejudge.filter((r) => innerIds.includes(r.id)).map((r) => r.gaps[0]).join(' / ')}),結束碼 1、不是儀器失效`)
    else problems.push(`拿掉重判(NO_REJUDGE)後 ${noRejudge.length} 列應全是產品紅(巢狀講「沒有自己重判」、容器講觀察範圍)、結束碼 1;實得 ${JSON.stringify(noRejudgeRed).replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')}`)
    const direct = await measureRevealFixtures({ mutation: WATCH_DIRECT_ONLY })
    const directRedIds = [...new Set(judge(direct).map((s) => s.split(' @')[0]))].sort()
    const directExact = direct.filter((r) => innerIds.includes(r.id)).every((r) => r.gaps.length === 1 && Math.abs(r.gaps[0] - r.tight) <= TOL)
    if (JSON.stringify(directRedIds) === JSON.stringify([...innerIds].sort()) && directExact && !judge(direct).some((s) => s.includes(INSTRUMENT_FAIL_MARKER))) {
      printSelftestLine(`✓ 只觀察直屬節點對照(WATCH_DIRECT_ONLY = 修前):容器 ${innerIds.length} 列停在 tight(${direct.filter((r) => innerIds.includes(r.id)).map((r) => r.gaps[0]).join(' / ')})→ 紅並指名,巢狀 ${nestedIds.length} 列綠`)
    } else {
      problems.push(`只觀察直屬節點(WATCH_DIRECT_ONLY)後應剛好紅容器 ${innerIds.length} 列(${innerIds.join(' / ')})、而且顯示後正好是 tight;實得紅 [${directRedIds.join(', ')}]、距離 ${JSON.stringify(direct.map((r) => [r.id, r.gaps]))}`)
    }
    // NO_REOBSERVE:全部列都跑(不用 only),紅的集合必須剛好是兩段式那一列 —— 「其他列不受影響」是量出來的,不是假設的
    const stagedIds = REVEAL_FIXTURES.filter((f) => f.staged).map((f) => f.id)
    const noReobserve = await measureRevealFixtures({ mutation: NO_REOBSERVE })
    const noReobserveRed = judge(noReobserve)
    const noReobserveIds = [...new Set(noReobserveRed.map((s) => s.split(' @')[0]))].sort()
    const stagedRows = noReobserve.filter((r) => stagedIds.includes(r.id))
    const stagedExact = stagedRows.length === stagedIds.length && stagedRows.every((r) => r.gaps.length === 1 && Math.abs(r.gaps[0] - r.tight) <= TOL)
    if (noReobserve.length === REVEAL_FIXTURES.length && JSON.stringify(noReobserveIds) === JSON.stringify([...stagedIds].sort()) && stagedExact
      && noReobserveRed.every((s) => s.includes('observeHeadingContent')) && exitCodeFor(noReobserveRed) === 1) {
      printSelftestLine(`✓ 拿掉 rAF 重判後的重新觀察對照(NO_REOBSERVE):${noReobserve.length} 列裡剛好 ${stagedIds.join(' / ')} 紅、顯示第二塊後停在 tight(${stagedRows.map((r) => r.gaps[0]).join(' / ')})、指名 observeHeadingContent,結束碼 1;其他 ${noReobserve.length - stagedRows.length} 列綠(${noReobserve.filter((r) => !stagedIds.includes(r.id)).map((r) => `${r.id} ${r.gaps[0]}`).join('、')})`)
    } else {
      problems.push(`拿掉 rAF 重判後的重新觀察(NO_REOBSERVE)後應剛好紅 ${stagedIds.join(' / ')}、停在 tight、產品紅結束碼 1;實得紅 [${noReobserveIds.join(', ')}]、結束碼 ${exitCodeFor(noReobserveRed)}、距離 ${JSON.stringify(noReobserve.map((r) => [r.id, r.gaps]))}、判定 ${JSON.stringify(noReobserveRed).replaceAll(INSTRUMENT_FAIL_MARKER, '[標記]')}`)
    }
  }
  // (4) 夾具畫不出來 → 必須是 InstrumentError(本閘接住 → INSTRUMENT-FAIL、exit 2),不是產品紅、也不是未捕捉例外
  const brokenHarness = REVEAL_FIXTURE_HARNESS.replace('window.__renderFixture = (name) => root.render(<Fixture name={name} />)', 'window.__renderFixture = () => root.render(<p data-fixture-ready="">夾具壞了</p>)')
  if (brokenHarness === REVEAL_FIXTURE_HARNESS) problems.push('夾具畫不出來的對照組:替換錨點沒對到 —— 對照組是空的')
  else {
    const broken = await measureRevealFixtures({ harness: brokenHarness, only: [REVEAL_FIXTURES[0].id] }).then(() => null, (error) => error)
    if (broken instanceof InstrumentError && broken.message.includes('夾具沒有渲染出來')) printSelftestLine(`✓ 夾具畫不出來對照:InstrumentError(${broken.message.slice(0, 60)})→ 本閘 exit 2`)
    else problems.push(`夾具畫不出來時應丟 InstrumentError(「夾具沒有渲染出來」),實得 ${broken ? `${broken.constructor?.name}:${String(broken.message).split('\n')[0]}` : '量完沒有出錯'}`)
  }
  return problems
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
      const revealProblems = await revealControls()
      if (revealProblems.length) { console.log(`❌ section-gap selftest FAIL(後來才顯示的對照):\n  ${revealProblems.join('\n  ')}`); process.exit(1) }
      printSelftestLine('✅ section-gap selftest PASS(判定表 + 四種標題區在頁面上翻面都指名紅、數字正好是另一個 token + 後來才顯示:收集器看得到 ResizeObserver 迴圈、觀察者換空殼後四列都紅;夾具列:回呼裡直接寫 → 巢狀兩列因 loop 紅、拿掉重判 → 五列產品紅(不是儀器失效)、只觀察直屬節點 → 容器三列紅、拿掉 rAF 重判後的重新觀察 → 剛好兩段式一列紅、夾具畫不出來 → 儀器失效)')
      process.exit(0)
    }
    requireFreshBuildForCases()
    const rows = await measure()
    // 夾具列(直接打包 DS 原始碼,不經 storybook;見 REVEAL_FIXTURES)
    rows.push(...(await measureRevealFixtures()))
    const awaiting = new Set(CASES.filter((c) => c.awaitingProductFix).map((c) => c.id))
    for (const r of rows) console.log(`  ${r.id.padEnd(40)} ${r.density}  loose ${r.loose}  距離 ${r.gaps.join(' / ')}${awaiting.has(r.id) ? '(等產品修正,未計入紅綠)' : ''}`)
    for (const c of CASES.filter((x) => x.awaitingProductFix)) {
      const pending = judge(rows.filter((r) => r.id === c.id))
      console.log(`  · ${c.id}(未計入):${pending.length ? pending.map((s) => s.replaceAll(INSTRUMENT_FAIL_MARKER, '[量不到]')).join(' ; ') : '已經符合,可以拿掉 awaitingProductFix 打開這一列'} —— ${c.awaitingProductFix}`)
    }
    const failures = judge(rows.filter((r) => !awaiting.has(r.id)))
    const instrument = failures.filter((s) => s.includes(INSTRUMENT_FAIL_MARKER))
    const code = exitCodeFor(failures)
    if (code) {
      console.error('❌ section-gap FAIL:\n  ' + failures.join('\n  '))
      if (code === 2) console.error(`✗ section-gap:${instrument.length} 處量不到 —— 儀器失效(exit 2;不是產品裁決,也不算通過)${failures.length > instrument.length ? `;另有 ${failures.length - instrument.length} 處產品紅(上面照印)` : ''}`)
      process.exit(code)
    }
    console.log('✅ section-gap PASS(區塊 ↔ 區塊 = 一條分隔線的位置、上下各 loose;不畫線 = loose × 2;標題區 → 內容 一塊 tight / 兩塊以上 loose)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError || error instanceof InstrumentError) {
      console.error(`✗ ${error instanceof InstrumentError ? `${INSTRUMENT_FAIL_MARKER}:` : ''}${error.message}`)
      console.error(`✗ section-gap${SELFTEST ? '(selftest)' : ''}:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)`)
      process.exit(2)
    }
    throw error
  }
}
