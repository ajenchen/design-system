#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 欄位自己的浮層開著時,外框**畫出來的顏色**就是它聚焦時的顏色 —— 一般欄位 = --primary、驗證錯誤的欄位 = --error(不是 error-hover);
 *        而且只認欄位**自己的**浮層(規則住 field.spec.md「Field state machine」表,2026-11-12 AI 建議、user 採納,原話「我覺得可以照你建議」;
 *        樣式住 components/Field/field-wrapper.tsx,記號 `data-field-open` 的唯一寫入者住 lib/composite-field-focus.ts,各欄位外框自己掛)。量的是 getComputedStyle 的四邊 border-*-color
 *        (併排欄位組另量四邊中點的像素),不是量屬性在不在;期望色從頁面上的 token 取(--primary / --error 在欄位所在位置算出來的值),不寫死。
 *        F 欄位矩陣(19 種 × 滑鼠點開 / 鍵盤打開 = 38 格):Select(不可搜尋 / 可搜尋)、Combobox(多選;浮層內搜尋;欄位內搜尋)、
 *          PeoplePicker(單人 / 多人)、DatePicker(不可打字 / 可打字)、日期區間、TimePicker,各自的一般與驗證錯誤。每格:
 *          K0(鍵盤那一格)Tab 進來還沒開 → 期望色(同一個欄位「鍵盤聚焦、沒開」當基準,證明 token 取值與欄位真的畫的是同一個顏色);
 *          O1 開著、滑鼠在空白處 / O2 開著、滑鼠停在欄位上 / O3 開著、滑鼠停在浮層裡 → 四邊 = 期望色;
 *          C1 關掉並離開欄位 → 四邊回到開之前靜止時的顏色。
 *        N 表格格內(無框款)Select / DatePicker:點進編輯(浮層跟著開)→ O1–O3 同上;關掉後格子上不留那個顏色的框。
 *        G 併排欄位組中間那一格,兩組各量一遍:story「篩選列」(欄位 / 欄位 / 欄位,期望色 --primary)與夾具「欄位 / 欄位[驗證錯誤] / 欄位」
 *          (期望色 --error:驗證錯誤的成員聚焦 / 開著時四邊紅、鄰居被滑過時共用那條線仍是紅)。每一組分兩段量:
 *          鍵盤聚焦、沒開(K1–K6):K1 滑鼠在空白處 → 四邊 computed 與四邊中點**像素** = 期望色(沒被鄰居蓋住);滑鼠停在左、右鄰居上各量兩列 ——
 *            兩格共用的那條線的像素 = 期望色(K2 左 / K4 右);同一刻中間那格 computed z-index = 4、被滑過的鄰居 = 3(K3 左 / K5 右);
 *            K6 滑鼠停在中間那格**自己**上面 → 它的 z-index 仍是 4(守 field-control-group.spec.md States 表「同一格又被滑過仍是 4」)。
 *          滑鼠點開(G1–G7):G1 開著、滑鼠在空白處 → 四邊 computed = 期望色;G2 同一刻四邊中點像素也是(沒被鄰居蓋住);
 *            G3–G6 = 開著時滑鼠停在左、右鄰居上,量法同 K2–K5;G7 = 開著時滑鼠停在它自己上面,量法同 K6。
 *          規則「聚焦或自己的浮層開著的那一格壓過鄰居的滑過」住 field-control-group.spec.md「States」(AI 建議、user 2026-11-13 採納,
 *          原話「你問我的問題，照你建議」);2026-11-13 前滑過鄰居的列只印數字、不判紅(那時還沒有規定)。量像素前先確認滑鼠真的在鄰居上、
 *          不在中間那格上,並等兩格的框色都停下來(鄰居滑過的框色有過渡);開頭先確認三格真的相鄰、各重疊 1px(共用一條線)。
 *          驗證錯誤那一組的限制:錯誤欄位靜止時 computed 就是 --error,所以它的 computed(K1 的前半、G1)分不出有沒有聚焦 / 開著;
 *          分得出的是像素列與層級列(沒抬高時右邊那條線被右鄰居蓋住 —— 破法 (d) 下 K1 / G2 紅的就是這一邊)。
 *        X 外面包一層浮層、直接把欄位當觸發點(夾具:導覽提示 × Select、Popover × 日期區間、Tooltip × TimePicker):
 *          X1 外面那層開著、欄位自己沒開 → 外框 = 開之前靜止時的顏色(不是 --primary);X2 同一個欄位自己的浮層開著 → --primary。
 *        Z 欄位裡的小按鈕開選單(FileViewer 縮放):選單開著 → 外框 = 開之前的顏色。
 *        每次量色前先等版面靜止(settleAfterInteraction),再等四邊顏色連 3 幀同值、宿主沒有進行中的過渡(transition-colors 含 border-color)。
 *   紅: 沒有「開著 = 聚焦的框」的建置(c55c3786:開著 = hover 灰框 / error-hover;2026-11-13 實跑,當時這支閘 192 列、其中 83 列紅)→ 開著而焦點不在欄位裡的 O 列
 *        (夾具的驗證錯誤三種欄位除外:夾具是這次的原始碼配舊 CSS,只有滑鼠停在欄位上那一列 O2 紅)、表格格內兩格、G 的 computed 與像素列、夾具的 X2 列紅;
 *        焦點留在欄位裡的格(靠 focus-within)與 K0 / C1 / X1 / Z 綠。
 *        沒有「聚焦 / 開著壓過滑過」的建置(2026-11-13 改之前:滑過、聚焦、開著的 z-index 同是 3)→ story 那一組照規則推得:滑過右鄰居的像素列(K4 / G5)、
 *        四列層級(K3 / K5 / G4 / G6)與停在自己上面的兩列(K6 / G7)紅;滑過左鄰居的像素列(K2 / G3)與 K1、G1、G2 綠 —— 同值時 DOM 順序較後的在上,
 *        中間那格本來就蓋得住左邊。與破法 (e) 是同一張表。夾具那一組在改前的建置上量到的**不是**改前的行為:夾具 = 這次的原始碼配那份建置的 CSS,
 *        這次的 class(聚焦 / 開著 z-index 4)在舊 CSS 裡沒有規則 → 聚焦 / 開著完全不抬高(停在預設的 2,比改前的 3 還低)→ 與破法 (d) 同一張表
 *        (只有 G1 與 C1 綠),只能當「沒抬高會紅」的旁證,不能當「改前長這樣」的證據。
 *        `--selftest` 在真建置上跑六種破法,每一列照表該紅的紅、該綠的綠,破法拿掉之後同一格當場回綠:
 *        (a) css:開著的框改回 hover 色(--border-hover / --error-hover)→ 全部 O 列、G1 / G2、滑過鄰居的像素列 G3 / G5(中間那格還在最上面,但它的框已不是
 *            期望色)、X2 紅;K0 / C1 / X1 / Z、G 的層級列 G4 / G6 / G7、鍵盤聚焦那一段 K1–K6(沒開,破法碰不到)綠。
 *        (b) mark:記號一出現就拿掉(= 元件漏接記號)→ 開著而焦點不在欄位裡的 O 列紅(錯誤欄位只有滑鼠停在欄位上那一列紅 —— 靜止時本來就是 --error);
 *            焦點留在欄位裡的格(可搜尋的 Select、欄位內搜尋、滑鼠點開的可打字 DatePicker)靠 focus-within 照樣是期望色 → 綠。
 *            G 開著那一段:story 那一組 G1–G7 全紅(記號沒了 → 不是聚焦色、也不再抬高);驗證錯誤那一組 G1 綠(靜止時本來就是 --error)、
 *            G2–G7 紅(不再抬高 → 被鄰居蓋住、層級不是 4)。兩組的鍵盤聚焦那一段 K1–K6 綠。
 *        (c) reach:外框改認通用的 data-state="open" / 裡面任何開著的東西 → X1(導覽提示、Popover)與 Z 紅;Tooltip 的 X1(值是 instant-open)、
 *            全部 X2 與對照的欄位格綠。
 *        (d) stack:併排欄位組裡**聚焦或開著**的那格不再浮到鄰居上面(z-index 壓到 2)→ K1–K6 與 G2–G7 紅、G1(computed)綠(證明像素列量的是
 *            「有沒有被蓋住」,不是框自己的顏色)。K1 / G2 紅的是右邊那條線:同在 2 時 DOM 順序較後的右鄰居蓋上來。
 *            2026-11-13 審查前這一種只壓「開著」的那格,碰不到鍵盤聚焦 → K1 / K2 在任何破法與改前建置下都沒紅過;所以擴成聚焦也壓。
 *        (e) tie:併排欄位組裡聚焦 / 開著的那格壓回跟滑過同一層(z-index 3 = 2026-11-13 改之前的行為)→ 滑過右鄰居的像素列 K4 / G5、四列層級
 *            K3 / K5 / G4 / G6、停在自己上面的 K6 / G7 紅;滑過左鄰居的像素列 K2 / G3、K1、G1、G2 綠 —— 證明滑過右鄰居的像素列量的是
 *            「聚焦 / 開著有沒有壓過滑過」,不是 (d) 的「有沒有浮到鄰居上面」;層級列則兩邊都紅(破法動的就是那個數字)。
 *        (f) self:只把「聚焦 / 開著又被滑過」的那格壓回 3 → 只有 K6 / G7 紅,其餘列全綠 —— 證明 K6 / G7 量的是「停在自己上面仍是 4」,
 *            不是 (d)(e) 的事(滑鼠在鄰居上或空白處時,中間那格沒被滑過,這個破法碰不到)。聚焦那一半(K6)= field-control-group.tsx 少了第一條
 *            補的規則時的實際樣子;開著那一半(G7)在現行樣式表順序下不補也是 4,第二條補的規則是不靠排序的保險,單獨拿掉它這支閘不會紅。
 *        (d)(e)(f) 只跑併排欄位組那一段(兩組都跑),而且都動到鍵盤聚焦那一段 → 那一段另有一列「還原」。
 *        找不到欄位 / 浮層沒開 / 滑鼠不在該在的地方 / 顏色一直在變 / 實際量的列數 ≠ 排定的列數 = INSTRUMENT-FAIL(exit 2),不當成通過也不當成紅。
 *   綠: 有這條規則的建置全部相符;重複跑同一份建置結果相同(每一格重新開頁、等的是值穩定不是固定毫秒,機器慢只會等久一點 ——
 *        `--cpu-throttle=6` 把頁面 CPU 放慢 6 倍重跑,列數與結果必須與不放慢時相同)。
 *   node scripts/field-open-border-invariant.mjs [--build=<storybook 建置目錄>] [--selftest] [--cpu-throttle=<倍數>]
 *
 * 夾具(scripts/test-fixtures/field-open-border/fixture.tsx,由 lib/storybook-css-fixture.mjs 打包):X 三格、「驗證錯誤 × 可搜尋的 Select /
 * 可打字的 DatePicker / 日期區間」三種欄位、併排欄位組「欄位 / 欄位[驗證錯誤] / 欄位」一組 —— 第一種不該寫成 story、後兩種展示頁湊不出來
 * (理由寫在夾具檔頭)。夾具列量到的是「這次 checkout 的元件原始碼 + 指定建置的 CSS」;其餘各列量的是指定建置裡的 story。
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, ownSurfacePosition, parkPointer,
  requireFreshStorybookBuild, requireStorybookBuild, settleAfterInteraction,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'

const STARTED_AT = Date.now()
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const throttleArg = process.argv.find((a) => a.startsWith('--cpu-throttle='))?.slice('--cpu-throttle='.length)
const CPU_THROTTLE = throttleArg === undefined ? 1 : Number(throttleArg)
if (!Number.isFinite(CPU_THROTTLE) || CPU_THROTTLE < 1) { console.error(`✗ --cpu-throttle 要是 ≥ 1 的數字,實得 ${JSON.stringify(throttleArg)}`); process.exit(1) }
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
const FIXTURE_SOURCE = 'scripts/test-fixtures/field-open-border/fixture.tsx'
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) {
  requireFreshStorybookBuild(STATIC, [
    'packages/design-system/src/components/Field', 'packages/design-system/src/lib/composite-field-focus.ts',
    'packages/design-system/src/components/FieldControlGroup', 'packages/design-system/src/components/SelectMenu',
    'packages/design-system/src/components/Select', 'packages/design-system/src/components/Combobox', 'packages/design-system/src/components/PeoplePicker',
    'packages/design-system/src/components/DatePicker', 'packages/design-system/src/components/TimePicker',
  ])
}

// ── 要量的格子(盤點出來的;找不到 = 儀器失效,不是「少量幾格也算過」)──────────────────────────────────
const HOST_EDIT = '[data-field-mode="edit"]:not([data-field-orientation])'
const story = (name) => `design-system-components-${name}`
/** 欄位矩陣:一列 = 一種欄位 × 一般 / 驗證錯誤;每列跑「滑鼠點開」「鍵盤打開」兩格。key = Tab 進來之後打開浮層的鍵(各元件自己支援的) */
const FIELDS = [
  { kind: 'Select(不可搜尋)', error: false, story: story('select-展示--modes'), nth: 0, key: 'ArrowDown' },
  { kind: 'Select(不可搜尋)', error: true, story: story('select-展示--with-error'), nth: 0, key: 'ArrowDown' },
  { kind: 'Select(可搜尋)', error: false, story: story('select-展示--searchable'), nth: 0, key: 'ArrowDown' },
  { kind: 'Select(可搜尋)', error: true, fixture: 'error-select-searchable', key: 'ArrowDown' },
  { kind: 'Combobox(多選)', error: false, story: story('combobox-展示--modes'), nth: 0, key: 'ArrowDown' },
  { kind: 'Combobox(多選)', error: true, story: story('combobox-展示--with-error'), nth: 0, key: 'ArrowDown' },
  { kind: 'Combobox(多選,浮層內搜尋)', error: false, story: story('combobox-展示--searchable'), nth: 0, key: 'ArrowDown' },
  { kind: 'Combobox(多選,欄位內搜尋)', error: false, story: story('combobox-展示--searchable'), nth: 1, key: 'ArrowDown' },
  { kind: 'PeoplePicker(單人)', error: false, story: story('peoplepicker-展示--single'), nth: 0, key: 'ArrowDown' },
  { kind: 'PeoplePicker(單人)', error: true, story: story('peoplepicker-展示--with-error'), nth: 0, key: 'ArrowDown' },
  { kind: 'PeoplePicker(多人)', error: false, story: story('peoplepicker-展示--multi'), nth: 0, key: 'ArrowDown' },
  { kind: 'DatePicker(不可打字)', error: false, story: story('datepicker-展示--default'), nth: 0, key: 'Enter' },
  { kind: 'DatePicker(不可打字)', error: true, story: story('datepicker-展示--with-error'), nth: 0, key: 'Enter' },
  { kind: 'DatePicker(可打字)', error: false, story: story('datepicker-展示--typed-input'), nth: 0, key: 'ArrowDown' },
  { kind: 'DatePicker(可打字)', error: true, fixture: 'error-date-typeable', key: 'ArrowDown' },
  { kind: '日期區間', error: false, story: story('datepicker-展示--range-picker'), nth: 0, key: 'Enter' },
  { kind: '日期區間', error: true, fixture: 'error-date-range', key: 'Enter' },
  { kind: 'TimePicker', error: false, story: story('timepicker-展示--modes'), nth: 0, key: 'ArrowDown' },
  { kind: 'TimePicker', error: true, story: story('timepicker-展示--with-error'), nth: 0, key: 'ArrowDown' },
]
const NAKED_STORY = story('datatable-展示--inline-edit')
const NAKED = [
  { kind: '表格格內 Select(無框款)', col: 'category' },
  { kind: '表格格內 DatePicker(無框款)', col: 'releaseDate' },
]
/**
 * 併排欄位組要量的兩組(都是「可編輯欄位 / 可編輯欄位 / 可編輯欄位」,量中間那一格):
 * story「篩選列」(一般欄位,期望色 --primary)與夾具裡中間那格驗證錯誤的一組(期望色 --error;為什麼是夾具寫在夾具檔頭)。
 * scope = 找欄位組的範圍;error = 中間那格是不是驗證錯誤(盤點值,開頁後對 DOM 核一次)。
 */
const GROUPS = [
  { title: 'G 併排欄位組中間那一格(Select)', target: { story: story('fieldcontrolgroup-展示--filter-row') }, scope: '#storybook-root', error: false },
  { title: 'G 併排欄位組中間那一格(Select · 驗證錯誤;夾具)', target: { fixture: 'group-error-mid' }, scope: '[data-fob-cell="group-error-mid"]', error: true },
]
/** reachRed:外面那層開著時,欄位外框上的 data-state 會不會是 "open"(Tooltip 寫的是 instant-open,破法 (c) 選不到它) */
const WRAPPED = [
  { kind: '導覽提示 × Select', cell: 'wrap-coachmark-select', reachRed: true },
  { kind: 'Popover × 日期區間', cell: 'wrap-popover-range', reachRed: true },
  { kind: 'Tooltip × TimePicker', cell: 'wrap-tooltip-time', reachRed: false },
]
const INNER_STORY = story('fileviewer-展示--open-snapshot')
// 破法 (c) 的對照格:量的是「一般的欄位格不受這個破法影響」(一般與驗證錯誤各一種)
const REACH_CONTROLS = FIELDS.filter((field) => field.kind === 'Select(不可搜尋)')

// ── 判定與計數 ────────────────────────────────────────────────────────────────────────
let failCount = 0
let instrumentFail = false
let planned = 0
let judged = 0
const seen = {} // mode → { red: 應紅且真的紅, redWant: 應紅, green: 應綠且真的綠, greenWant: 應綠 }
class InstrumentError extends Error {}
const instrument = (name, detail) => { instrumentFail = true; console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`) }

/**
 * 每一列在各種跑法下該紅還是該綠。family:
 *   open    開著的欄位該是期望色的列(O1–O3、表格格內、併排的 computed G1、X2)
 *   pixel   併排欄位組開著時四邊中點的像素(G2)
 *   foreign 不該變色的列(X1 外面那層開著、Z 欄位裡的小按鈕開選單)
 *   closed  沒開浮層的列(K0、C1)/ restore 破法拿掉之後當場重量
 *   併排欄位組另外四種(when = 'focus' 鍵盤聚焦沒開 | 'open' 自己的浮層開著):
 *   kbase   鍵盤聚焦、滑鼠在空白處:四邊 computed + 四邊中點像素(K1;when 固定是 'focus')
 *   nbpx    滑鼠停在鄰居上,兩格共用那條線的像素(K2 / K4 / G3 / G5;side = 'left' | 'right')
 *   layer   同一刻的層級:中間那格 z-index 4、被滑過的鄰居 3(K3 / K5 / G4 / G6;side 同上)
 *   selfz   滑鼠停在中間那格自己上面時,它的 z-index 4(K6 / G7)
 * 表的來源(不是猜的,field-wrapper.tsx fieldDefaultChromeCompounds 的 class):一般欄位沒有記號時只剩 `focus-within:!border-primary` →
 * 焦點在欄位裡才是 --primary;錯誤欄位靜止就是 `border-error`、`hover:border-error-hover`、`focus-within:!border-error` →
 * 沒有記號時只有「滑鼠停在欄位上而且焦點不在欄位裡」才不是 --error。像素(pixel)不看這個:沒有記號、焦點又不在欄位裡 → 不抬高 →
 * 右邊那條線被右鄰居蓋住,錯誤欄位也一樣(框是紅的,但畫不出完整四邊)。
 * 併排欄位組四種的來源(field-control-group.tsx 的 z-index 那幾條 + CSS「同值時 DOM 順序較後的在上」;與期望色是 --primary 還是 --error 無關):
 *   stack 聚焦 / 開著壓到 2 → 滑鼠在空白處時右鄰居(同在 2、DOM 較後)蓋住右邊那條線;被滑過的鄰居(3)蓋住共用線;層級不是 4 → 四種全紅。
 *   tie   聚焦 / 開著壓回 3 → 滑鼠在空白處時仍高過鄰居的 2 → kbase 綠;與被滑過的鄰居同值:右鄰居(DOM 較後)蓋住共用線 → 右像素紅;
 *         左鄰居蓋不住 → 左像素綠;層級(4 變 3)兩邊都紅;停在自己上面也是 3 → selfz 紅。
 *   self  只有「聚焦 / 開著又被滑過」壓回 3 → selfz 紅;其餘三種量的時候中間那格沒被滑過 → 綠。
 *   css / mark 只動「開著」的那格,鍵盤聚焦那一段(when = 'focus')一律綠。開著那一段:
 *   css   框色改掉、層級沒動 → 像素紅、層級與 selfz 綠;mark 記號沒了(焦點又不在欄位裡)→ 不抬高 → 都紅(停在自己上面只剩滑過的 3)。
 */
const GROUP_FAMILIES = new Set(['kbase', 'nbpx', 'layer', 'selfz'])
function expectOf(mode, family, { m, error = false, reachRed = false, side, when } = {}) {
  if (mode === 'real' || family === 'closed' || family === 'restore') return 'green'
  if (family === 'foreign') return mode === 'reach' && reachRed ? 'red' : 'green'
  if (GROUP_FAMILIES.has(family)) {
    if ((family === 'nbpx' || family === 'layer') && side !== 'left' && side !== 'right') throw new TypeError(`expectOf:${family} 要給 side(left / right),實得 ${side}`)
    if (when !== 'focus' && when !== 'open') throw new TypeError(`expectOf:${family} 要給 when(focus / open),實得 ${when}`)
    if (family === 'kbase' && when !== 'focus') throw new TypeError('expectOf:kbase 只有鍵盤聚焦那一段(when = focus)')
    if (mode === 'stack') return 'red'
    if (mode === 'tie') return family === 'kbase' || (family === 'nbpx' && side === 'left') ? 'green' : 'red'
    if (mode === 'self') return family === 'selfz' ? 'red' : 'green'
    if (when === 'focus') return 'green'
    if (mode === 'css') return family === 'nbpx' ? 'red' : 'green'
    if (mode === 'mark') return m.fw ? 'green' : 'red'
    return 'green'
  }
  if (family !== 'open' && family !== 'pixel') throw new TypeError(`expectOf:未知的 family ${family}`)
  if (mode === 'css' || (mode === 'stack' && family === 'pixel')) return 'red'
  if (mode === 'mark') return (family === 'pixel' ? m.fw : error ? (m.fw || !m.hover) : m.fw) ? 'green' : 'red'
  return 'green'
}
const check = (mode, name, pass, detail, expect) => {
  judged += 1
  const wantRed = expect === 'red'
  const ok = wantRed ? !pass : pass
  const tally = (seen[mode] ??= { red: 0, redWant: 0, green: 0, greenWant: 0 })
  if (wantRed) { tally.redWant += 1; if (ok) tally.red += 1 } else { tally.greenWant += 1; if (ok) tally.green += 1 }
  const tag = mode === 'real' ? '' : `[${mode}${wantRed ? ' 應紅' : ' 應綠'}] `
  console.log(`${ok ? '✓' : '✗'} ${tag}${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failCount++
}

// ── 啟動:建置快照、夾具、瀏覽器 ──────────────────────────────────────────────────────────
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
let fixture
try {
  fixture = await startStorybookCssFixture(server.servedRoot, { source: FIXTURE_SOURCE, label: '欄位開啟外框夾具', title: '欄位開啟外框夾具' })
} catch (error) {
  await server.stop()
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${FIXTURE_SOURCE})—— 夾具掛不起來是儀器失效,不是產品裁決`)
  process.exit(2)
}
const stopServers = async () => { await fixture.stop(); await server.stop() }
const browser = await launchBrowserOrSkip({}, { cleanup: stopServers })
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
// --cpu-throttle=<倍數>:把頁面的 CPU 放慢(CDP),用來證明「機器慢的時候還會綠」——等的都是訊號(版面靜止、顏色連 3 幀同值),不是固定毫秒
if (CPU_THROTTLE > 1) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
  console.log(`CPU 放慢 ${CPU_THROTTLE} 倍(--cpu-throttle)`)
}

// ── 頁面端函式(evaluate 序列化傳入,不得引用外部變數)────────────────────────────────────────
/** 等四邊框色連 3 幀同值、宿主沒有進行中的過渡,再回報 */
const measureInPage = (hostSel) => new Promise((resolve) => {
  const h = document.querySelector(hostSel)
  if (!h) { resolve({ error: '欄位不見了' }); return }
  const SIDES = ['top', 'right', 'bottom', 'left']
  const read = () => { const cs = getComputedStyle(h); return SIDES.map((s) => ({ color: cs.getPropertyValue(`border-${s}-color`), width: cs.getPropertyValue(`border-${s}-width`), style: cs.getPropertyValue(`border-${s}-style`) })) }
  let last = null; let same = 0; let n = 0
  const tick = () => {
    const sides = read()
    const now = sides.map((s) => `${s.color} ${s.width} ${s.style}`).join('|')
    const moving = h.getAnimations().some((a) => a.playState === 'running')
    same = now === last && !moving ? same + 1 : 0; last = now; n += 1
    if (same >= 3) {
      const a = document.activeElement
      resolve({ sides, hover: h.matches(':hover'), fw: h.matches(':focus-within'), mark: h.hasAttribute('data-field-open'), state: h.getAttribute('data-state'),
        z: getComputedStyle(h).zIndex, active: a ? `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''}` : '(無)' })
    } else if (n > 180) resolve({ error: `外框 180 幀一直在變(最後 ${now})` })
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
/** 在欄位所在的位置把 token 算成顏色(深色區的值不一樣,所以探針掛在宿主裡面;量完當場拿掉) */
const tokensInPage = (hostSel) => {
  const h = document.querySelector(hostSel)
  const p = document.createElement('span')
  p.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden'
  h.appendChild(p)
  const out = {}
  for (const name of ['--primary', '--error', '--border', '--border-hover', '--error-hover']) { p.style.color = `var(${name})`; out[name] = getComputedStyle(p).color }
  p.remove()
  return out
}
/** 浮層真的開了嗎(不靠記號):aria-expanded + Radix 浮層容器;own = 不是外面那層的浮層,ext = 夾具裡外面那層 */
const evidenceInPage = (hostSel) => {
  const h = document.querySelector(hostSel)
  if (!h) return { expanded: false, own: 0, ext: 0, spot: null }
  const wrappers = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')]
  const isExt = (w) => !!w.querySelector('[data-fob-ext-content]')
  const own = wrappers.filter((w) => !isExt(w))
  // 欄位自己的浮層:先照 aria-controls 找(外面那層的 aria-controls 也可能落在外框上,所以排除外面那層),找不到就取最後開的那一個
  const controlled = [h, ...h.querySelectorAll('[aria-controls]')].map((n) => document.getElementById(n.getAttribute('aria-controls') || '')?.closest('[data-radix-popper-content-wrapper]')).find((w) => w && !isExt(w))
  const popup = controlled || own[own.length - 1] || null
  let spot = null
  if (popup) {
    const r = popup.getBoundingClientRect()
    const xs = [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => r.left + r.width * f)
    const ys = [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => r.top + r.height * f)
    outer: for (const y of ys) for (const x of xs) {
      if (x < 1 || y < 1 || x > innerWidth - 2 || y > innerHeight - 2) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && popup.contains(hit)) { spot = { x, y }; break outer }
    }
  }
  return { expanded: h.matches('[aria-expanded="true"]') || !!h.querySelector('[aria-expanded="true"]'), own: own.length, ext: wrappers.length - own.length, spot }
}
/**
 * 對照組的破法(--selftest):用行內 !important 蓋(Tailwind 的 utilities 在 @layer 裡,一般樣式表的 !important 贏不了分層的 !important)。
 * window.__fobBreakStop() = 拿掉破法並把動過的東西還原。
 */
const installBreakInPage = (mode) => {
  const hosts = () => [...document.querySelectorAll('[data-field-mode]')]
  const force = (h, value) => { h.style.setProperty('border-color', value, 'important'); h.setAttribute('data-fob-forced', '') }
  const release = (h) => { if (h.hasAttribute('data-fob-forced')) { h.style.removeProperty('border-color'); h.removeAttribute('data-fob-forced') } }
  let apply = null
  let filter = []
  if (mode === 'css') {
    // (a) 開著的框改回 hover 色
    filter = ['data-field-open']
    apply = () => hosts().forEach((h) => (h.hasAttribute('data-field-open') ? force(h, h.hasAttribute('data-error') ? 'var(--error-hover)' : 'var(--border-hover)') : release(h)))
  } else if (mode === 'mark') {
    // (b) 記號一出現就拿掉(元件漏接記號)
    filter = ['data-field-open']
    apply = () => document.querySelectorAll('[data-field-open]').forEach((h) => { h.removeAttribute('data-field-open'); h.setAttribute('data-fob-stripped', '') })
  } else if (mode === 'reach') {
    // (c) 外框改認通用的 data-state="open" / 裡面任何開著的東西
    filter = ['data-state', 'aria-expanded']
    apply = () => hosts().forEach((h) => {
      if (h.hasAttribute('data-error')) return
      const on = h.getAttribute('data-state') === 'open' || !!h.querySelector('[data-state="open"], [aria-expanded="true"]')
      if (on) force(h, 'var(--primary)'); else release(h)
    })
  } else if (mode === 'stack' || mode === 'tie' || mode === 'self') {
    // 併排欄位組的三種破法都用樣式表:聚焦不會改任何屬性,MutationObserver 追不到。元件的 z-index 那幾條 utility 都不帶 !important,
    // 所以這裡帶了就一定贏(上面說的「贏不了」只發生在對方是分層而且也帶 !important 的宣告)。
    // (d) stack:聚焦或開著的那格不再浮到鄰居上面(壓到跟靜止的鄰居同一層 2)。2026-11-13 審查前只壓「開著」的那格(行內樣式),碰不到鍵盤聚焦
    // (e) tie:聚焦 / 開著的那格壓回跟滑過同一層(z-index 3 = 2026-11-13 改之前的行為)
    // (f) self:只有「聚焦 / 開著又被滑過」的那格壓回 3(聚焦那一半 = 少了第一條補的規則的樣子:滑過那條排在聚焦那條後面,會蓋回 3;開著那一半不補也是 4)
    const MEMBER = '[data-field-control-group] > :is(:focus-within, [data-field-open])'
    const rule = { stack: `${MEMBER} { z-index: 2 !important; }`, tie: `${MEMBER} { z-index: 3 !important; }`, self: `${MEMBER}:hover { z-index: 3 !important; }` }[mode]
    filter = ['data-field-open']
    apply = () => {}
    const style = document.createElement('style')
    style.id = 'fob-break-style'
    style.textContent = rule
    document.head.appendChild(style)
  } else throw new Error(`未知的破法 ${mode}`)
  const observer = new MutationObserver(apply)
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: filter })
  apply()
  window.__fobBreakStop = () => {
    observer.disconnect()
    document.getElementById('fob-break-style')?.remove()
    hosts().forEach(release)
    // 記號:只還給現在真的開著的(拿掉之後浮層若已關,React 不會再寫它,也就不該還)
    document.querySelectorAll('[data-fob-stripped]').forEach((h) => { h.removeAttribute('data-fob-stripped'); h.setAttribute('data-field-open', '') })
    return true
  }
}

// ── 量測流程共用 ──────────────────────────────────────────────────────────────────────
const HOST = '[data-fob-host]'
const TOKEN_NAMES = ['--primary', '--error', '--border', '--border-hover', '--error-hover']
let tokens = {}
const nameOf = (color) => { const t = TOKEN_NAMES.find((n) => tokens[n] === color); return t ? `${t} ${color}` : color }
const colorsOf = (m) => m.sides.map((s) => s.color)
const all4 = (m, color) => m.sides.every((s) => s.color === color && parseFloat(s.width) > 0 && s.style !== 'none' && s.style !== 'hidden')
const sameAs = (m, rest) => colorsOf(m).every((c, i) => c === rest[i]) && m.sides.every((s) => parseFloat(s.width) > 0)
const show = (m) => {
  const c = colorsOf(m)
  const sides = c.every((x) => x === c[0]) ? `四邊 ${nameOf(c[0])}` : `上 ${nameOf(c[0])} / 右 ${nameOf(c[1])} / 下 ${nameOf(c[2])} / 左 ${nameOf(c[3])}`
  return `${sides}(${m.sides[0].width});滑鼠在欄位上=${m.hover} 焦點在欄位裡=${m.fw}(焦點 ${m.active}) 記號=${m.mark ? '有' : '無'} data-state=${m.state}`
}

async function settle(what) {
  const s = await settleAfterInteraction(page, { frames: 6, capMs: 8000 })
  if (!s.ok) throw new InstrumentError(`${what}:8 秒內版面沒有連續靜止 6 格(等了 ${s.framesWaited} 格,變動 ${s.lateChanges} 次)`)
}
async function measure(what) {
  await settle(what)
  const m = await page.evaluate(measureInPage, HOST)
  if (m.error) throw new InstrumentError(`${what}:${m.error}`)
  return m
}
async function openTarget(target, waitFor, mode) {
  const url = target.fixture ? fixture.url : `${server.origin}/iframe.html?id=${encodeURIComponent(target.story)}&viewMode=story`
  await openStory(page, url, { waitFor, settleFrames: 6, notFound: target.fixture ? fixture.notFound : server.notFound, label: target.fixture ? `夾具 ${target.fixture}` : target.story })
  await parkPointer(page)
  if (mode !== 'real') await page.evaluate(installBreakInPage, mode)
}
/** 在指定範圍裡挑第 nth 個可編輯欄位外框,標成量測對象;回它的描述 */
async function markHost(scope, nth = 0) {
  const info = await page.evaluate(({ scope, nth, HOST_EDIT }) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return { ok: false, why: `找不到範圍 ${scope}` }
    const all = [...(root.matches?.(HOST_EDIT) ? [root] : []), ...root.querySelectorAll(HOST_EDIT)]
    const h = all[nth]
    if (!h) return { ok: false, why: `範圍裡可編輯的欄位外框只有 ${all.length} 個,要第 ${nth + 1} 個` }
    document.querySelectorAll('[data-fob-host]').forEach((x) => x.removeAttribute('data-fob-host'))
    h.setAttribute('data-fob-host', '')
    h.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    const inner = h.querySelector('input[role="combobox"]')
    return { ok: true, error: h.hasAttribute('data-error'), who: (h.getAttribute('aria-label') || inner?.getAttribute('aria-label') || h.textContent || '').trim().slice(0, 18) }
  }, { scope, nth, HOST_EDIT })
  if (!info.ok) throw new InstrumentError(info.why)
  return info
}
/** 焦點回到 body、滑鼠停到空白處,讀靜止時的四邊顏色 */
async function rest(what, { click = true } = {}) {
  const spot = await parkPointer(page)
  if (click) await page.mouse.click(spot.x, spot.y)
  const m = await measure(what)
  if (m.fw || m.hover) throw new InstrumentError(`${what}:要量靜止的顏色,但焦點在欄位裡=${m.fw}、滑鼠在欄位上=${m.hover}(焦點 ${m.active})`)
  return m
}
async function readTokens() {
  tokens = await page.evaluate(tokensInPage, HOST)
  const distinct = new Set(TOKEN_NAMES.map((n) => tokens[n]))
  if (distinct.size !== TOKEN_NAMES.length || TOKEN_NAMES.some((n) => !tokens[n])) throw new InstrumentError(`token 取不到可分辨的顏色:${JSON.stringify(tokens)}`)
}
async function evidence() { return page.evaluate(evidenceInPage, HOST) }
/** 滑鼠點欄位自己的表面(不落在 Tag / 頭像 / 按鈕上) */
async function clickOwn(what) {
  const handle = await page.$(HOST)
  const at = await ownSurfacePosition(handle)
  if (!at.ok) throw new InstrumentError(`${what}:找不到欄位自己的表面(${at.why})`)
  await handle.click({ position: at.position, timeout: 8000 })
}
async function hoverOwn(what) {
  const handle = await page.$(HOST)
  const at = await ownSurfacePosition(handle)
  if (!at.ok) throw new InstrumentError(`${what}:找不到欄位自己的表面(${at.why})`)
  await page.mouse.move(at.x, at.y)
}
/** 哨兵放在欄位正前方(絕對定位,不佔版面),程式聚焦哨兵後按 Tab = 真的用鍵盤進到欄位(同 readonly-focus-pointer-invariant) */
async function tabInto(what) {
  await page.evaluate((hostSel) => {
    const h = document.querySelector(hostSel)
    const s = document.createElement('button')
    s.setAttribute('data-fob-sentinel', '')
    s.setAttribute('aria-hidden', 'true')
    s.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;margin:0;padding:0;border:0'
    h.before(s)
    s.focus()
  }, HOST)
  await page.keyboard.press('Tab')
  const inHost = await page.evaluate((hostSel) => { document.querySelectorAll('[data-fob-sentinel]').forEach((s) => s.remove()); return !!document.querySelector(hostSel)?.contains(document.activeElement) }, HOST)
  if (!inHost) throw new InstrumentError(`${what}:按 Tab 之後焦點沒有進到欄位`)
}
const stopBreak = () => page.evaluate(() => window.__fobBreakStop?.() ?? false)

/**
 * 開著時的三個時刻(O1 空白處 / O2 欄位上 / O3 浮層裡):先確認浮層真的開了(不靠記號),每一刻四邊都要是期望色;
 * 對照組跑法另加一列「還原」(破法拿掉、同一刻重量必須回到期望色)。ctx.error = 這是不是驗證錯誤的欄位(決定破法 (b) 下的期望)。
 */
async function openMoments(mode, name, expected, ctx) {
  const ev = await evidence()
  if (!ev.own || !ev.expanded) throw new InstrumentError(`浮層沒有開(aria-expanded=${ev.expanded}、欄位自己的浮層 ${ev.own} 個)`)
  await parkPointer(page)
  const m1 = await measure('O1')
  if (m1.hover) throw new InstrumentError('O1:滑鼠已停到空白處,欄位卻還在 :hover')
  check(mode, `${name} | O1 開著、滑鼠在空白處 → 四邊 ${expected.name}`, all4(m1, expected.color), show(m1), expectOf(mode, 'open', { ...ctx, m: m1 }))
  await hoverOwn('O2')
  const m2 = await measure('O2')
  if (!m2.hover) throw new InstrumentError('O2:滑鼠移到欄位上,欄位卻不在 :hover')
  check(mode, `${name} | O2 開著、滑鼠停在欄位上 → 四邊 ${expected.name}`, all4(m2, expected.color), show(m2), expectOf(mode, 'open', { ...ctx, m: m2 }))
  const spot = (await evidence()).spot
  if (!spot) throw new InstrumentError('O3:在浮層裡找不到可以停滑鼠的點')
  await page.mouse.move(spot.x, spot.y)
  const m3 = await measure('O3')
  const still = await evidence()
  if (m3.hover || !still.own) throw new InstrumentError(`O3:滑鼠移進浮層之後,欄位 :hover=${m3.hover}、欄位自己的浮層 ${still.own} 個`)
  check(mode, `${name} | O3 開著、滑鼠停在浮層裡 → 四邊 ${expected.name}`, all4(m3, expected.color), show(m3), expectOf(mode, 'open', { ...ctx, m: m3 }))
  if (mode !== 'real') {
    await stopBreak()
    const r = await measure('還原')
    check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 ${expected.name}`, all4(r, expected.color), show(r), expectOf(mode, 'restore'))
  }
}
async function closeOwn(what) {
  await parkPointer(page)
  await page.keyboard.press('Escape')
  await settle(what)
  const ev = await evidence()
  if (ev.own) throw new InstrumentError(`${what}:按 Esc 之後欄位自己的浮層還在(${ev.own} 個)`)
}
const rowsOf = (mode, base) => base + (mode === 'real' ? 0 : 1)

// ── F:欄位矩陣 ────────────────────────────────────────────────────────────────────────
async function runField(field, opener, mode) {
  const name = `F ${field.kind} · ${field.error ? '驗證錯誤' : '一般'} · ${opener === 'mouse' ? '滑鼠點開' : `鍵盤 ${field.key} 打開`}`
  planned += rowsOf(mode, opener === 'mouse' ? 4 : 5)
  try {
    const scope = field.fixture ? `[data-fob-cell="${field.fixture}"]` : '#storybook-root'
    await openTarget(field, `${scope} ${HOST_EDIT}`, mode)
    const info = await markHost(scope, field.nth ?? 0)
    if (info.error !== field.error) throw new InstrumentError(`「${info.who}」的驗證錯誤狀態是 ${info.error},盤點是 ${field.error}(story 改了?)`)
    const z = await rest('開之前')
    await readTokens()
    const expected = field.error ? { name: '--error', color: tokens['--error'] } : { name: '--primary', color: tokens['--primary'] }
    if (!field.error && colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)}),這一格分不出開沒開`)
    const ctx = { error: field.error }
    if (opener === 'keyboard') {
      await tabInto('K0')
      const k = await measure('K0')
      if (!k.fw || k.mark) throw new InstrumentError(`K0:Tab 進來之後焦點在欄位裡=${k.fw}、記號=${k.mark}`)
      check(mode, `${name} | K0 鍵盤聚焦、還沒開 → 四邊 ${expected.name}(基準)`, all4(k, expected.color), show(k), expectOf(mode, 'closed'))
      await page.keyboard.press(field.key)
    } else {
      await clickOwn('滑鼠點開')
    }
    await settle('打開之後')
    await openMoments(mode, name, expected, ctx)
    await closeOwn('關掉')
    const c = await rest('關掉之後')
    check(mode, `${name} | C1 關掉並離開欄位 → 四邊回到開之前(${nameOf(colorsOf(z)[0])})`, sameAs(c, colorsOf(z)), show(c), expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── N:表格格內(無框款)────────────────────────────────────────────────────────────────
async function runNaked(cell, mode) {
  const name = `N ${cell.kind} · 滑鼠點進編輯`
  planned += rowsOf(mode, 4)
  try {
    const cellSel = `[data-cell-id$=":${cell.col}"]`
    await openTarget({ story: NAKED_STORY }, cellSel, mode)
    const at = await page.evaluate((cellSel) => {
      const c = document.querySelector(cellSel)
      c.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const r = c.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, cellSel)
    await settle('捲到格子')
    await page.mouse.click(at.x, at.y)
    await settle('點進編輯')
    // 編輯器在格子裡,或浮在表格的編輯層上
    const scope = await page.evaluate(({ cellSel, HOST_EDIT }) => (document.querySelector(`${cellSel} ${HOST_EDIT}`) ? cellSel : document.querySelector(`[data-active-editor-host] ${HOST_EDIT}`) ? '[data-active-editor-host]' : null), { cellSel, HOST_EDIT })
    if (!scope) throw new InstrumentError('點了格子之後沒有出現編輯器')
    await markHost(scope, 0)
    await readTokens()
    const expected = { name: '--primary', color: tokens['--primary'] }
    await openMoments(mode, name, expected, { error: false })
    await closeOwn('關掉')
    const spot = await parkPointer(page)
    await page.mouse.click(spot.x, spot.y)
    await settle('關掉之後')
    const left = await page.evaluate(({ hostSel, primary }) => {
      const h = document.querySelector(hostSel)
      if (!h) return { gone: true }
      const cs = getComputedStyle(h)
      return { gone: false, blue: ['top', 'right', 'bottom', 'left'].some((s) => cs.getPropertyValue(`border-${s}-color`) === primary), color: cs.borderTopColor }
    }, { hostSel: HOST, primary: tokens['--primary'] })
    check(mode, `${name} | C1 關掉並離開格子 → 格子上不留 --primary 的框`, left.gone || !left.blue, left.gone ? '編輯器已收起' : `編輯器還在,上邊 ${nameOf(left.color)}`, expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── G:併排欄位組 ──────────────────────────────────────────────────────────────────────
const px = (png, x, y) => { if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null; const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const near = (a, b) => !!a && !!b && Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= 2
const rgb = (c) => (c ? `rgb(${c[0]},${c[1]},${c[2]})` : '(畫面外)')
/**
 * 四邊中點的像素(各往垂直方向多看前後 1px:邊框那一格一定在這 3 格裡),與期望色那顆 token 畫出來的色塊像素比。
 * token = '--primary'(一般欄位)| '--error'(驗證錯誤的欄位)。
 */
async function edgePixels(token) {
  if (token !== '--primary' && token !== '--error') throw new TypeError(`edgePixels:token 只能是 --primary / --error,實得 ${token}`)
  const box = await page.evaluate(({ hostSel, token }) => {
    const r = document.querySelector(hostSel).getBoundingClientRect()
    const s = document.createElement('div')
    s.id = 'fob-swatch'
    s.style.cssText = `position:fixed;left:0;bottom:0;width:12px;height:12px;z-index:2147483647;pointer-events:none;background:var(${token})`
    document.body.appendChild(s)
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vh: innerHeight }
  }, { hostSel: HOST, token })
  const png = PNG.sync.read(await page.screenshot())
  await page.evaluate(() => document.getElementById('fob-swatch')?.remove())
  const want = px(png, 6, box.vh - 6)
  const L = Math.round(box.left), R = Math.round(box.right) - 1, T = Math.round(box.top), B = Math.round(box.bottom) - 1
  const mx = Math.round((box.left + box.right) / 2), my = Math.round((box.top + box.bottom) / 2)
  const side = (label, at, scan) => ({ label, at, pixel: px(png, at[0], at[1]), hit: scan.some(([x, y]) => near(px(png, x, y), want)) })
  return {
    token,
    want,
    sides: [
      side('上', [mx, T], [[mx, T - 1], [mx, T], [mx, T + 1]]),
      side('右', [R, my], [[R - 1, my], [R, my], [R + 1, my]]),
      side('下', [mx, B], [[mx, B - 1], [mx, B], [mx, B + 1]]),
      side('左', [L, my], [[L - 1, my], [L, my], [L + 1, my]]),
    ],
  }
}
const showPixels = (p) => `${p.token} 色塊 ${rgb(p.want)};${p.sides.map((s) => `${s.label}(${s.at}) ${rgb(s.pixel)}${s.hit ? '' : ' ✗'}`).join(' / ')}`
/** 鄰居在 edgePixels().sides(上 / 右 / 下 / 左)裡對應的那一邊 = 兩格共用的那條線 */
const NEIGHBOURS = [
  { side: 'left', label: '左', edge: 3 },
  { side: 'right', label: '右', edge: 1 },
]
const neighbourSel = (side) => `[data-fob-neighbour="${side}"]`
/** 要停滑鼠的那一刻才算鄰居的中心點(不沿用開頁時算的:中途點欄位會先把它捲到畫面中央,頁面若捲了,舊座標就不準) */
const centreOf = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
/**
 * 滑鼠停在併排欄位組某一邊的鄰居上:先確認滑鼠真的在鄰居上、不在中間那格上,等兩格的框色都停下來(鄰居滑過的框色有過渡),
 * 再量四邊中點的像素(與 expected 那顆 token 的色塊比)與兩格的層級。
 */
async function neighbourMoment(nb, expected) {
  const at = await centreOf(neighbourSel(nb.side))
  await page.mouse.move(at.x, at.y)
  const m = await measure(`滑鼠停在${nb.label}鄰居上`)
  const n = await page.evaluate(measureInPage, neighbourSel(nb.side))
  if (n.error) throw new InstrumentError(`${nb.label}鄰居:${n.error}`)
  if (!n.hover || m.hover) throw new InstrumentError(`滑鼠應該停在${nb.label}鄰居上、不在中間那格上,實際${nb.label}鄰居 :hover=${n.hover}、中間那格 :hover=${m.hover}`)
  const p = await edgePixels(expected.name)
  return { m, n, p, shared: p.sides[nb.edge] }
}
/** 「這一刻真的是要量的那個狀態」:when = 'focus'(鍵盤聚焦、沒開)| 'open'(自己的浮層開著);不是 → 儀器失效 */
async function assertGroupState(id, when, m) {
  if (when === 'focus' && (!m.fw || m.mark)) throw new InstrumentError(`${id}:要量的是「鍵盤聚焦、沒開」,實際焦點在欄位裡=${m.fw}、記號=${m.mark}`)
  if (when === 'open') {
    const ev = await evidence()
    if (!ev.own || !ev.expanded) throw new InstrumentError(`${id}:要量的是「自己的浮層開著」,實際 aria-expanded=${ev.expanded}、欄位自己的浮層 ${ev.own} 個`)
  }
}
/**
 * 滑鼠依序停在左、右鄰居上,各判兩列:兩格共用那條線的像素 = 期望色;同一刻中間那格 z-index 4、被滑過的鄰居 3。
 * ids = 四列的編號(左像素 / 左層級 / 右像素 / 右層級)。
 */
async function neighbourRows(mode, name, ids, when, expected) {
  for (const [i, nb] of NEIGHBOURS.entries()) {
    const t = await neighbourMoment(nb, expected)
    await assertGroupState(ids[i * 2], when, t.m)
    const ctx = { m: t.m, side: nb.side, when }
    check(mode, `${name} | ${ids[i * 2]} 滑鼠停在${nb.label}鄰居上 → 兩格共用的${nb.label}邊那條線像素 = ${expected.name}`, t.shared.hit,
      `共用線(${t.shared.at})${rgb(t.shared.pixel)},${expected.name} 色塊 ${rgb(t.p.want)};中間那格 ${show(t.m)}`, expectOf(mode, 'nbpx', ctx))
    check(mode, `${name} | ${ids[i * 2 + 1]} 同一刻的層級 → 中間那格 z-index 4、${nb.label}鄰居 3`, t.m.z === '4' && t.n.z === '3',
      `中間那格 z-index=${t.m.z}、${nb.label}鄰居 z-index=${t.n.z}`, expectOf(mode, 'layer', ctx))
  }
}
/**
 * 滑鼠停在中間那格自己上面 → 它的 z-index 仍是 4(K6 / G7;States 表「同一格又被滑過仍是 4」)。K6(聚焦)靠 field-control-group.tsx 第一條補的規則:
 * 少了它,滑過那條(3)在樣式表裡排在聚焦那條後面,會把這一格蓋回 3。G7(開著)在現行樣式表順序下不補也是 4,第二條補的規則是保險。結束時滑鼠停在中間那格上。
 */
async function selfHoverRow(mode, name, id, when) {
  await hoverOwn(id)
  const m = await measure(id)
  if (!m.hover) throw new InstrumentError(`${id}:滑鼠移到中間那格上,它卻不在 :hover`)
  await assertGroupState(id, when, m)
  check(mode, `${name} | ${id} 滑鼠停在中間那格自己上面 → 它的 z-index 仍是 4`, m.z === '4', `中間那格 z-index=${m.z};${show(m)}`, expectOf(mode, 'selfz', { m, when }))
}
/**
 * 「還原」列:破法拿掉之後當場重量兩刻 —— 滑鼠還停在中間那格自己上面 → z-index 4;再停到右鄰居上 → 四邊 computed 與像素 = 期望色、
 * 中間那格 4 / 右鄰居 3。
 */
async function groupRestore(mode, name, expected) {
  await stopBreak()
  const self = await measure('還原(滑鼠停在中間那格上)')
  if (!self.hover) throw new InstrumentError(`還原:滑鼠應該還停在中間那格上,實際 :hover=${self.hover}`)
  const right = NEIGHBOURS.find((nb) => nb.side === 'right')
  const r = await neighbourMoment(right, expected)
  check(mode, `${name} | 還原(破法拿掉、當場重量)→ 滑鼠停在自己上面 z-index 4;停在右鄰居上四邊 computed 與像素 ${expected.name}、中間那格 z-index 4 / 右鄰居 3`,
    self.z === '4' && all4(r.m, expected.color) && r.p.sides.every((s) => s.hit) && r.m.z === '4' && r.n.z === '3',
    `停在自己上面 z-index=${self.z};停在右鄰居上 ${show(r.m)} z-index=${r.m.z}、右鄰居 z-index=${r.n.z};${showPixels(r.p)}`, expectOf(mode, 'restore'))
}
/** 動到「鍵盤聚焦、沒開」那一段的破法(其餘破法只動開著的那格)—— 這幾種在那一段多一列「還原」 */
const KEYBOARD_BREAKS = new Set(['stack', 'tie', 'self'])
/** 併排欄位組一組要量幾列:K1–K6 + G1–G7 + C1 = 14;對照組跑法多一列開著那一段的「還原」;動到鍵盤聚焦那一段的破法再多一列 */
const groupRows = (mode) => 14 + (mode === 'real' ? 0 : 1) + (KEYBOARD_BREAKS.has(mode) ? 1 : 0)
async function runGroup(group, mode) {
  const kName = `${group.title}· 鍵盤聚焦(沒開)`
  const name = `${group.title}· 滑鼠點開`
  planned += groupRows(mode)
  try {
    const groupSel = `${group.scope} [data-field-control-group]`
    await openTarget(group.target, `${groupSel} > ${HOST_EDIT}`, mode)
    const found = await page.evaluate(({ groupSel, HOST_EDIT }) => {
      const kids = [...document.querySelector(groupSel).children]
      if (kids.length < 3 || !kids.slice(0, 3).every((k) => k.matches(HOST_EDIT))) return { ok: false, why: '併排欄位組的前三個成員不是「可編輯欄位 / 可編輯欄位 / 可編輯欄位」' }
      kids[0].setAttribute('data-fob-neighbour', 'left')
      kids[1].setAttribute('data-fob-host', '')
      kids[2].setAttribute('data-fob-neighbour', 'right')
      kids[1].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
      const [a, b, c] = kids.slice(0, 3).map((k) => k.getBoundingClientRect())
      // 「共用一條線」的前提:三格在同一列,相鄰兩格各重疊 1px(-ml-px)
      const adjacent = Math.abs(a.top - b.top) < 0.5 && Math.abs(b.top - c.top) < 0.5 && Math.abs(a.right - b.left - 1) < 0.5 && Math.abs(b.right - c.left - 1) < 0.5
      if (!adjacent) return { ok: false, why: `三格沒有相鄰重疊 1px(左 ${a.left}–${a.right}、中 ${b.left}–${b.right}、右 ${c.left}–${c.right};上緣 ${a.top} / ${b.top} / ${c.top})` }
      return { ok: true, errors: kids.slice(0, 3).map((k) => k.hasAttribute('data-error')) }
    }, { groupSel, HOST_EDIT })
    if (!found.ok) throw new InstrumentError(found.why)
    if (found.errors[0] || found.errors[2] || found.errors[1] !== group.error) throw new InstrumentError(`三格的驗證錯誤狀態是 ${found.errors.join(' / ')},盤點是 false / ${group.error} / false(story 或夾具改了?)`)
    const z = await rest('開之前')
    await readTokens()
    const expected = group.error ? { name: '--error', color: tokens['--error'] } : { name: '--primary', color: tokens['--primary'] }
    if (!group.error && colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)}),這一格分不出聚焦 / 開著`)

    // ── 鍵盤聚焦、沒開(K1–K6)──
    await tabInto('K1')
    const k = await measure('K1')
    if (!k.fw || k.mark || k.hover) throw new InstrumentError(`K1:Tab 進來之後焦點在欄位裡=${k.fw}、記號=${k.mark}、滑鼠在欄位上=${k.hover}`)
    const kp = await edgePixels(expected.name)
    check(mode, `${kName} | K1 滑鼠在空白處 → 四邊 computed 與四邊中點的像素 ${expected.name}(沒被鄰居蓋住)`, all4(k, expected.color) && kp.sides.every((s) => s.hit), `${show(k)} z-index=${k.z};${showPixels(kp)}`, expectOf(mode, 'kbase', { m: k, when: 'focus' }))
    await neighbourRows(mode, kName, ['K2', 'K3', 'K4', 'K5'], 'focus', expected)
    await selfHoverRow(mode, kName, 'K6', 'focus')
    if (KEYBOARD_BREAKS.has(mode)) {
      await groupRestore(mode, kName, expected)
      await page.evaluate(installBreakInPage, mode) // 開著那一段也要在破法底下量
    }
    await rest('鍵盤那一段之後') // 焦點離開欄位、滑鼠回到空白處,再開始滑鼠點開那一段

    // ── 滑鼠點開(G1–G7)──
    await clickOwn('滑鼠點開')
    await settle('打開之後')
    const ev = await evidence()
    if (!ev.own || !ev.expanded) throw new InstrumentError(`浮層沒有開(aria-expanded=${ev.expanded}、欄位自己的浮層 ${ev.own} 個)`)
    await parkPointer(page)
    const m = await measure('G1')
    if (m.hover) throw new InstrumentError('G1:滑鼠已停到空白處,欄位卻還在 :hover')
    check(mode, `${name} | G1 開著、滑鼠在空白處 → 四邊 computed ${expected.name}`, all4(m, expected.color), `${show(m)} z-index=${m.z}`, expectOf(mode, 'open', { m, error: group.error }))
    const p = await edgePixels(expected.name)
    check(mode, `${name} | G2 同一刻四邊中點的像素 = ${expected.name}(沒被鄰居蓋住)`, p.sides.every((s) => s.hit), showPixels(p), expectOf(mode, 'pixel', { m }))
    await neighbourRows(mode, name, ['G3', 'G4', 'G5', 'G6'], 'open', expected)
    await selfHoverRow(mode, name, 'G7', 'open')
    if (mode !== 'real') await groupRestore(mode, name, expected)
    await closeOwn('關掉')
    const c = await rest('關掉之後')
    check(mode, `${name} | C1 關掉並離開欄位 → 四邊回到開之前(${nameOf(colorsOf(z)[0])})`, sameAs(c, colorsOf(z)), show(c), expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── X:外面包一層浮層、直接把欄位當觸發點(夾具)────────────────────────────────────────────────
async function runWrapped(w, mode) {
  const name = `X ${w.kind}(外面那層把欄位當觸發點)`
  planned += rowsOf(mode, 3)
  try {
    const scope = `[data-fob-cell="${w.cell}"]`
    await openTarget({ fixture: w.cell }, `${scope} ${HOST_EDIT}`, mode)
    await markHost(scope, 0)
    const z = await rest('開之前')
    await readTokens()
    if (colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)})`)
    const toggle = async (want) => {
      const btn = await page.$(`${scope} [data-fob-toggle] button`)
      if (!btn) throw new InstrumentError('找不到切換外面那層的按鈕')
      await btn.click({ timeout: 8000 })
      await settle(`外面那層${want}`)
      const st = await page.evaluate((scope) => document.querySelector(scope)?.getAttribute('data-fob-ext'), scope)
      const ev = await evidence()
      if (want === '開' ? (st !== 'open' || !ev.ext) : (st !== 'closed' || ev.ext)) throw new InstrumentError(`外面那層應該${want}著,實際 data-fob-ext=${st}、畫面上外面那層 ${ev.ext} 個`)
      if (ev.own) throw new InstrumentError(`切換外面那層時,欄位自己的浮層不該開著(${ev.own} 個)`)
    }
    await toggle('開')
    await parkPointer(page)
    const x1 = await measure('X1')
    if (x1.hover || x1.fw) throw new InstrumentError(`X1:外面那層開著時要量的是「沒碰欄位」,實際滑鼠在欄位上=${x1.hover}、焦點在欄位裡=${x1.fw}`)
    check(mode, `${name} | X1 外面那層開著、欄位自己沒開 → 四邊 = 開之前(${nameOf(colorsOf(z)[0])}),不是 --primary`, sameAs(x1, colorsOf(z)) && !colorsOf(x1).includes(tokens['--primary']), show(x1), expectOf(mode, 'foreign', { reachRed: w.reachRed }))
    if (mode === 'reach') {
      await stopBreak()
      const r = await measure('還原')
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 = 開之前`, sameAs(r, colorsOf(z)), show(r), expectOf(mode, 'restore'))
    }
    await toggle('關')
    await rest('外面那層關掉之後') // Radix 關閉時把焦點還給觸發點(= 這個欄位),先讓焦點離開
    await clickOwn('滑鼠點開欄位自己的浮層')
    await settle('打開之後')
    const ev = await evidence()
    if (!ev.own || ev.ext) throw new InstrumentError(`要的是「只有欄位自己的浮層開著」,實際自己的 ${ev.own} 個、外面那層 ${ev.ext} 個`)
    await parkPointer(page)
    const x2 = await measure('X2')
    if (x2.hover) throw new InstrumentError('X2:滑鼠已停到空白處,欄位卻還在 :hover')
    check(mode, `${name} | X2 同一個欄位自己的浮層開著、滑鼠在空白處 → 四邊 --primary`, all4(x2, tokens['--primary']), show(x2), expectOf(mode, 'open', { m: x2 }))
    if (mode === 'css' || mode === 'mark') {
      await stopBreak()
      const r = await measure('還原')
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 --primary`, all4(r, tokens['--primary']), show(r), expectOf(mode, 'restore'))
    }
    await closeOwn('關掉')
    const c = await rest('關掉之後')
    check(mode, `${name} | C1 關掉並離開欄位 → 四邊回到開之前(${nameOf(colorsOf(z)[0])})`, sameAs(c, colorsOf(z)), show(c), expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── Z:欄位裡的小按鈕開選單(FileViewer 縮放)──────────────────────────────────────────────
async function runInner(mode) {
  const name = 'Z 欄位裡的小按鈕開選單(FileViewer 縮放比例)'
  planned += mode === 'reach' ? 2 : 1 // Z1;只有破法 (c) 會動到這一格,所以只有它多一列「還原」
  try {
    const BUTTON = 'button[aria-haspopup="menu"]'
    await openTarget({ story: INNER_STORY }, `${HOST_EDIT} ${BUTTON}`, mode)
    const found = await page.evaluate(({ HOST_EDIT, BUTTON }) => {
      const h = [...document.querySelectorAll(HOST_EDIT)].find((x) => x.querySelector(BUTTON))
      if (!h) return false
      h.setAttribute('data-fob-host', '')
      return true
    }, { HOST_EDIT, BUTTON })
    if (!found) throw new InstrumentError('找不到「裡面有選單按鈕」的欄位')
    // 檢視器是整頁浮層:不點空白處(會關掉檢視器),只把滑鼠移開
    const z = await rest('開之前', { click: false })
    await readTokens()
    if (colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)})`)
    const btn = await page.$(`${HOST} ${BUTTON}`)
    await btn.click({ timeout: 8000 })
    await settle('選單打開之後')
    const opened = await page.evaluate(({ hostSel, BUTTON }) => ({ expanded: document.querySelector(`${hostSel} ${BUTTON}`)?.getAttribute('aria-expanded'), menus: document.querySelectorAll('[role="menu"]').length }), { hostSel: HOST, BUTTON })
    if (opened.expanded !== 'true' || !opened.menus) throw new InstrumentError(`小按鈕的選單沒有開(aria-expanded=${opened.expanded}、選單 ${opened.menus} 個)`)
    await parkPointer(page)
    const m = await measure('Z1')
    if (m.hover || m.fw) throw new InstrumentError(`Z1:要量的是「選單開著、沒碰欄位」,實際滑鼠在欄位上=${m.hover}、焦點在欄位裡=${m.fw}`)
    check(mode, `${name} | Z1 選單開著、滑鼠在空白處 → 四邊 = 開之前(${nameOf(colorsOf(z)[0])}),不是 --primary`, sameAs(m, colorsOf(z)) && !colorsOf(m).includes(tokens['--primary']), show(m), expectOf(mode, 'foreign', { reachRed: true }))
    if (mode === 'reach') {
      await stopBreak()
      const r = await measure('還原')
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 = 開之前`, sameAs(r, colorsOf(z)), show(r), expectOf(mode, 'restore'))
    }
    await page.keyboard.press('Escape')
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────────────
const MODE_TITLE = {
  css: '(a) css:開著的框改回 hover 色',
  mark: '(b) mark:記號一出現就拿掉(元件漏接記號)',
  reach: '(c) reach:外框改認通用的 data-state="open" / 裡面任何開著的東西',
  stack: '(d) stack:併排欄位組裡聚焦或開著的那格不再浮到鄰居上面(z-index 壓到 2)',
  tie: '(e) tie:併排欄位組裡聚焦 / 開著的那格壓回跟滑過同一層(z-index 3 = 2026-11-13 改之前的行為)',
  self: '(f) self:併排欄位組裡只有「聚焦 / 開著又被滑過」的那格壓回 3(停在自己上面不再是 4)',
}
const BREAK_MODES = Object.keys(MODE_TITLE)
async function runMode(mode) {
  if (mode !== 'real') console.log(`\n── 破法 ${MODE_TITLE[mode]} ──`)
  // (d)(e)(f) 只動併排欄位組的 z-index,別的格不受影響 → 只跑那一段(兩組都跑)
  if (KEYBOARD_BREAKS.has(mode)) { for (const group of GROUPS) await runGroup(group, mode); return }
  if (mode === 'reach') {
    for (const w of WRAPPED) await runWrapped(w, mode)
    await runInner(mode)
    for (const field of REACH_CONTROLS) for (const opener of ['mouse', 'keyboard']) await runField(field, opener, mode)
    return
  }
  for (const field of FIELDS) for (const opener of ['mouse', 'keyboard']) await runField(field, opener, mode)
  for (const cell of NAKED) await runNaked(cell, mode)
  for (const group of GROUPS) await runGroup(group, mode)
  for (const w of WRAPPED) await runWrapped(w, mode)
  await runInner(mode)
}

try {
  if (buildArg) console.log(`建置:${STATIC}(--build 指定;story 的列量這份建置,夾具的列 = 這次 checkout 的元件原始碼 + 這份建置的 CSS)`)
  for (const mode of SELFTEST ? BREAK_MODES : ['real']) await runMode(mode)
} catch (error) {
  instrument('執行', String(error?.message ?? error).slice(0, 300))
}

await browser.close()
await stopServers()
const missing = [...new Set([...server.notFound, ...fixture.notFound])]
if (missing.length) console.log(`同源 404:${missing.join(', ')}`)
if (!instrumentFail && judged !== planned) instrument('列數', `排定 ${planned} 列,實際量了 ${judged} 列 —— 有格子沒量到`)
if (!instrumentFail && SELFTEST) {
  for (const mode of BREAK_MODES) {
    const t = seen[mode]
    if (!t || t.redWant === 0 || t.greenWant === 0) instrument(`破法 ${mode}`, `這個破法沒有同時量到「該紅」與「該綠」的列(該紅 ${t?.redWant ?? 0}、該綠 ${t?.greenWant ?? 0})—— 對照組沒有兩面`)
  }
}
const took = `耗時 ${Math.round((Date.now() - STARTED_AT) / 1000)} 秒`
if (instrumentFail) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:有量不到的項目(見上),不當成通過(${took})`); process.exit(2) }
if (SELFTEST) {
  const line = BREAK_MODES.map((mode) => `${mode} 該紅 ${seen[mode].red}/${seen[mode].redWant}、該綠 ${seen[mode].green}/${seen[mode].greenWant}`).join(';')
  console.log(failCount === 0 ? `✓ field-open-border-invariant --selftest:${judged} 列全部照表(${line};${took})` : `✗ field-open-border-invariant --selftest:${failCount} 列不照表(${line};${took})—— 這支閘量的不是它宣稱的東西`)
} else {
  console.log(failCount === 0 ? `✓ field-open-border-invariant:${judged} 列全部相符(${took})` : `✗ field-open-border-invariant:${judged} 列裡 ${failCount} 列不符(${took})`)
}
process.exit(failCount === 0 ? 0 : 1)
