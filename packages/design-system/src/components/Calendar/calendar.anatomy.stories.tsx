// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   SizeMatrix N/A — Calendar 是單一 month canvas，沒有 size variant。
//   StateBehavior 已存在(today / outside month / hover / event tile 等狀態
//     已由 StateBehavior 5. 涵蓋)。
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import { Calendar, type CalendarEvent } from './calendar'
import { CalendarDemo } from './_calendar-demo'
import { CATEGORICAL_HUES } from '@/design-system/tokens/categorical-color'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { StoryLink } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta<typeof Calendar> = {
  title: 'Design System/Components/Calendar/設計規格',
  component: Calendar,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof Calendar>

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
// 月份標題 / 星期名照讀者的中文產品排(同展示頁 calendar.stories.tsx 的 LOCALE;元件預設 2026-11-24 起也是 'zh-TW',之前是 'en-US')。2026-11-21 前本頁沒傳 locale、
// 事件也是英文(Design review…),跟中文的「新事件」「今天」並排 —— PV2 交出的同族尾巴(SIB-PV,AGENTS.md「單一檔案不中英夾雜」)。
const LOCALE = 'zh-TW'

const sampleEvents: CalendarEvent[] = [
  { id: 'e1', title: '設計審查', start: `${thisMonth}-05`, end: `${thisMonth}-05`, color: 'blue' },
  { id: 'e2', title: '衝刺規劃會議', start: `${thisMonth}-08`, end: `${thisMonth}-08`, color: 'blue' },
  { id: 'e3', title: '版本發布截止', start: `${thisMonth}-12`, end: `${thisMonth}-12`, color: 'red' },
  { id: 'e4', title: '季度檢討', start: `${thisMonth}-18`, end: `${thisMonth}-18`, color: 'green' },
  { id: 'e5', title: 'Alex 休假', start: `${thisMonth}-20`, end: `${thisMonth}-22`, color: 'yellow', allDay: true },
]

// 日期格 / 事件方塊各自二擇一:可點就接回調(型別層必填),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」)。右上角「新事件」是全域新增入口、恆渲染,onCreateEvent 必填(同段末條,M23(f))。
// 規格頁的可點範例也給**真的結果**(CalendarDemo:點事件開 Popover、點日期 / 新事件開「新增事件」對話框、送出跳 Toast),與展示頁同一個示範殼。

// Keep dynamic-token documentation readable without presenting Tailwind's
// source scanner with an invalid literal arbitrary-value candidate.
// 事件列 = Tag md(calendar.spec.md「間距」):高 h-tag-md 24、text-body 14px font-normal;文字內距 8 = 外層 4 + 文字 4(兩層都讀 --calendar-gap)
const TIMED_EVENT_CLASS_GUIDE = [
  'bg-[var(--color-', '{color}', '-1)] · text-[var(--color-', '{color}',
  '-7)] · rounded-md · h-tag-md · 外層 px-[var(--calendar-gap)] + 文字 px-[var(--calendar-gap)] · text-body · font-normal · truncate',
].join('')
const ALL_DAY_EVENT_CLASS_GUIDE = [
  '同上 + border-l-[3px] border-[var(--color-', '{color}', '-6)]',
].join('')
const HOVER_EVENT_CLASS_GUIDE = [
  'hover:bg-[var(--color-', '{color}', '-2)]',
].join('')

// 元件檢閱器的週起始日選項(0 = 週日 … 6 = 週六;不選 = 從語系推)
const WEEK_START_LABELS: Record<string, string> = { 0: '0 週日', 1: '1 週一', 2: '2 週二', 3: '3 週三', 4: '4 週四', 5: '5 週五', 6: '6 週六' }
const WEEK_START_OPTIONS = [0, 1, 2, 3, 4, 5, 6]

// ── 1. 元件總覽 ────────────────────────────────────────────────────────────────
export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <CalendarDemo events={sampleEvents} defaultReferenceDate={now} today={now} locale={LOCALE} />
    </div>
  ),
}

// ── 2. 元件檢閱器 ────────────────────────────────────────────────────────────
export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切換 month canvas 的已實作 props；未實作的週/日與 size API 不暴露。' } },
    layout: 'fullscreen',
  },
  // weekStartsOn 預設不傳 = 從語系推(zh-TW / en-US / ja-JP / en-IL 週日、en-GB 週一;calendar.spec.md「資料語意」週起始日【WS(定)】)。
  // 三個選用設定預設關(calendar.spec.md「API(第一段)」);en-IL = 週末是週五、週六的語系(CLDR),開 hideWeekends 時藏的是那兩天。
  args: {
    locale: LOCALE,
    events: sampleEvents,
    today: now,
    hideWeekends: false,
    showWeekNumbers: false,
    loading: false,
  },
  argTypes: {
    // 帶 mapping(數字對數字):沒有 mapping 時 Storybook 依元件型別轉換網址參數(?args=weekStartsOn:1),這個聯集型別轉不過去、整個參數被丟掉(實測)
    weekStartsOn: { control: { type: 'select', labels: WEEK_START_LABELS }, options: WEEK_START_OPTIONS, mapping: Object.fromEntries(WEEK_START_OPTIONS.map((n) => [n, n])) },
    locale: { control: 'select', options: ['en-US', 'en-GB', 'en-IL', 'zh-TW', 'ja-JP'] },
    hideWeekends: { control: 'boolean' },
    showWeekNumbers: { control: 'boolean' },
    loading: { control: 'boolean' },
    titleAs: { control: 'radio', options: ['h1', 'h2', 'h3'] },
    events: { control: 'object' },
  },
  // 可點模式的三個回調由示範殼接上(點得出真的結果);Controls 只切外觀與資料
  render: (args) => (
    <div className="h-screen p-4 bg-canvas">
      <CalendarDemo
        defaultReferenceDate={now}
        today={args.today}
        events={args.events}
        weekStartsOn={args.weekStartsOn}
        locale={args.locale}
        titleAs={args.titleAs}
        hideWeekends={args.hideWeekends}
        showWeekNumbers={args.showWeekNumbers}
        loading={args.loading}
      />
    </div>
  ),
}

// ── 3. 色彩對照表(事件 color 類別 + Cell / Event tile token)─────────────────────
// 跳過 4. SizeMatrix：元件沒有 size API。
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => {
    const colorEvents: CalendarEvent[] = CATEGORICAL_HUES.map((c, i) => ({
      id: `c-${c}`,
      title: `${c} 類別`,
      start: `${thisMonth}-${String(i + 2).padStart(2, '0')}`,
      end: `${thisMonth}-${String(i + 2).padStart(2, '0')}`,
      color: c,
    }))
    return (
      <div className="p-4 bg-canvas flex flex-col gap-10">
        <div>
          <H3>事件類別色</H3>
          <Desc>
            事件顏色用 12 種類別色,和 Tag / Avatar 共用同一套色盤
            (blue / green / deep-orange / yellow / red / orange / amber / lime / turquoise / indigo / purple / magenta)。
            顏色代表「這是哪一類事件」(同一個團隊 / 同一個專案),不是嚴重程度。每個色名對應一個色相,紅與橘各自獨立、可清楚區分。
          </Desc>
          {/* 給明確高度(同設計原則「唯讀的日期格與事件」的整月示範):不給高度時週列照內容排開,每格只有格最小高 61、很擠;
              560 時整月五週都看得到、不用捲 */}
          <div className="h-[560px]">
            <CalendarDemo events={colorEvents} defaultReferenceDate={now} today={now} locale={LOCALE} />
          </div>
        </div>

        <div>
          <H3>Cell 視覺 token</H3>
          <Desc>月 view cell 的狀態色彩與幾何。格內所有空隙 = 4(元件內變數 --calendar-gap)、事件列 = Tag md 24;每一週等高、平分格陣高度,格最小高 61;7 欄等分。</Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>區塊</Th>
                  <Th>Token / Class</Th>
                  <Th>說明</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Cell 高度</Td>
                  <Td mono>grid-template-rows: repeat(週數, minmax(var(--calendar-cell-min-h), 1fr))(最小 61px)</Td>
                  <Td>每一週等高、平分格陣高度,不被內容撐高;格最小高 = 上內距 4 + 日期框 24 + 4 + 一列 24 + 下內距 4 + 格線 1(底線畫在格高裡面)。格子比內容矮時,放不下的列被格子裁掉、不壓扁(事件列一律 24)。容器比「週數 × 61」還矮時週列在格陣裡捲,工具列與星期列不捲</Td>
                </tr>
                <tr>
                  <Td>Cell 內距 / 列距</Td>
                  <Td mono>p-[var(--calendar-gap)] · gap-[var(--calendar-gap)](4px)</Td>
                  <Td>格邊到事件列 = 事件列到事件列 = 日期框到第一列 = 4(四邊等距)</Td>
                </tr>
                <tr>
                  <Td>星期列</Td>
                  <Td mono>role=row(格陣第一列)· columnheader p-[var(--calendar-gap)] · 內容 h-tag-md · text-body font-medium · bg-muted</Td>
                  <Td>列高 32 = 4 + 24 + 4(與日期列同一個列高單位);看得見的字「週日」,讀屏名稱「星期日」</Td>
                </tr>
                <tr>
                  <Td>Cell 寬度</Td>
                  <Td mono>grid-template-columns: [週數欄] repeat(看得見的日子數, minmax(0, 1fr))</Td>
                  <Td>看得見的日子等分(平常 7 欄;隱藏週末時少那幾欄)。星期列與週列讀同一個欄設定,欄寬一致</Td>
                </tr>
                <tr>
                  <Td>日期框</Td>
                  <Td mono>h-tag-md · min-w-tag-md · rounded-full · text-body · font-medium(左上)</Td>
                  <Td>左上角,高 24(= 一列的高)、離格頂 4、離格左 4;每月 1 號顯示「7月1日」(Intl month short + day),其他日子只寫數字</Td>
                </tr>
                <tr>
                  <Td>Today cell(日期數字)</Td>
                  <Td mono>bg-info · text-on-emphasis · rounded-full · h-tag-md min-w-tag-md · px-[var(--calendar-text-inset)] · text-body font-medium</Td>
                  <Td>info 實心底,高 24;比 24 寬(今天、「7月1日」)時左右內距 8 = 4 + 4;今天剛好是 1 號時實心底包住整段字</Td>
                </tr>
                <tr>
                  <Td>Outside day cell</Td>
                  <Td mono>text-fg-muted · 無底色</Td>
                  <Td>上/下月溢出日期只用淡字區分;格子跟當月一樣可點、一樣的滑過色(同 DateGrid 鄰月日子)</Td>
                </tr>
                <tr>
                  <Td>Hover cell</Td>
                  <Td mono>hover:bg-neutral-hover</Td>
                  <Td>提示可點擊新增入口(日期格可點時)</Td>
                </tr>
                <tr>
                  <Td>唯讀的格(readOnlyDates)</Td>
                  <Td mono>無 hover 底色 · 日期數字為 span(同字級、同今天 pill)· 格子 focus-visible:focus-ring-inset</Td>
                  <Td>沒有「點日子新增」時宣告:格子不亮、日期數字不是按鈕、游標不變;鍵盤停靠點改為格子本身,方向鍵照常</Td>
                </tr>
                <tr>
                  <Td>週末(hideWeekends)</Td>
                  <Td mono>週末不加底;hideWeekends → 那幾欄不畫</Td>
                  <Td>週末 = 語系的週末(zh-TW 週六、週日;en-IL 週五、週六),開了以後那幾欄與星期列一起拿掉,只落在週末的事件不畫;鍵盤跳過被藏的日子</Td>
                </tr>
                <tr>
                  <Td>週數欄(showWeekNumbers)</Td>
                  <Td mono>寬 calc(2 × var(--calendar-gap) + 2ch) · text-body font-normal text-fg-secondary tabular-nums · pt-[var(--calendar-gap)] · h-tag-md</Td>
                  <Td>左側獨立窄欄,寬 = 2 × 格子內距 + 最寬兩位數;週數水平置中、上邊距與高度同日期框;欄頭「週」上下左右置中,灰底條延伸過去;格線同日期格。週數格是 rowheader,不是操作目標</Td>
                </tr>
                <tr>
                  <Td>載入中(loading)</Td>
                  <Td mono>Skeleton · h-tag-md · w-full · aria-hidden;格陣 aria-busy</Td>
                  <Td>每格事件區換成一條與事件列同高的骨架,不畫事件與「+N」;日期數字照畫、仍可點空白新增</Td>
                </tr>
                <tr>
                  <Td>窄寬度</Td>
                  <Td mono>欄寬 ≤ 60(calendar-geometry.ts CALENDAR_NARROW_COLUMN_MAX_PX)</Td>
                  <Td>星期縮成一個字(Intl weekday narrow,zh-TW「日」)、每月 1 號只顯示「1」;只看欄寬、不看視窗寬</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>Event tile 視覺 token</H3>
          <Desc>事件 tile 的色彩由 event <code>color</code> 欄位決定,bg / text 走 subtle / text tier。</Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>情境</Th>
                  <Th>Token / Class</Th>
                  <Th>說明</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>一般 event(timed)</Td>
                  <Td mono>{TIMED_EVENT_CLASS_GUIDE}</Td>
                  <Td>單行 tile,color 依事件類別(12 categorical 色相,消費 categorical-color SSOT,與 Tag / Avatar 共用)。對齊 Tag 色階(step-1 淺底 / step-7 文字)。色名必須 1:1 對應 <code>--color-{'{hue}'}-*</code>,零 offset(2026-06-04 修:原 red / orange 都誤接 deep-orange,改後 red→<code>--color-red-*</code>、orange→<code>--color-orange-*</code> 各自獨立)</Td>
                </tr>
                <tr>
                  <Td>All-day event</Td>
                  <Td mono>{ALL_DAY_EVENT_CLASS_GUIDE}</Td>
                  <Td>2026-06-01 補實作:淡底 + 左側實心 accent 條,排序在有時間事件之前(cell 頂端);多日全天事件以日精度 filter 在每個涵蓋日各顯示一條。字重同事件列 font-normal(2026-11-25 前另加 font-medium)</Td>
                </tr>
                <tr>
                  <Td>Hover tile</Td>
                  <Td mono>{HOVER_EVENT_CLASS_GUIDE}</Td>
                  <Td>同色濃一階(淺色變深、深色變亮)表示可點擊(事件方塊可點時)</Td>
                </tr>
                <tr>
                  <Td>唯讀的事件(readOnlyEvents)</Td>
                  <Td mono>同上色、不帶 hover(CAT_SUBTLE)· 無 cursor-pointer</Td>
                  <Td>事件沒有詳情可開時宣告:方塊不亮、不是按鈕、不進格內導覽(F2 找不到它);截斷時仍有提示</Td>
                </tr>
                <tr>
                  <Td>超出 tile 限制</Td>
                  <Td mono>「+N more」純文字 · h-tag-md · px-[var(--calendar-text-inset)] · text-caption · text-fg-muted</Td>
                  <Td>每格最多顯示 3 筆事件,超出顯示「+N more」弱化計數文字,與事件列同高 24,目前不可點擊(展開列表為後續增量)</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

// ── 5. 狀態行為 ─────────────────────────────────────────────────────────────
export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <div className="mb-2 text-body text-fg-muted space-y-1">
        <div>• <b>today</b> cell:date 數字加 <code>bg-info text-on-emphasis rounded-full</code> 圓</div>
        <div>• <b>outside month</b>:前後月日期數字走淡字 <code>text-fg-muted</code>,cell 不加底色(跟當月格一樣可點、一樣的滑過色)</div>
        <div>• <b>多事件 cell</b>:超出 3 則的 event 顯示「+N more」</div>
        <div>• <b>event hover</b>:tile 切同色濃一階(淺色變深、深色變亮)<code>hover:bg-{'{color}'}-2</code>(如 blue → <code>--color-blue-2</code>)+ <code>cursor-pointer</code></div>
        <div>• <b>empty cell</b>:無事件保持純底色,點擊觸發 onDateClick</div>
        <div>• <b>唯讀</b>(<code>readOnlyDates</code> / <code>readOnlyEvents</code>,各自宣告):格子 / 事件方塊不亮、不是按鈕、游標不變;鍵盤仍可在格陣內走動(見<StoryLink kind="Design System/Components/Calendar/設計原則" name="唯讀的日期格與事件">設計原則 — 唯讀的日期格與事件</StoryLink>);右上角「新事件」是全域新增入口,唯讀時照樣在</div>
      </div>
      <CalendarDemo events={sampleEvents} defaultReferenceDate={now} today={now} locale={LOCALE} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 今天的日期鈕:名稱 = 「今天,」+ 完整日期 + 筆數(calendar.spec.md「A11y 預設」),帶 aria-current="date"、實心底
    const today = canvas.getByRole('button', { name: /^今天,2026年7月15日 星期三,/ })
    await expect(today).toHaveClass('bg-info')
    await expect(today).toHaveAttribute('aria-current', 'date')
    await userEvent.click(canvas.getByRole('button', { name: '下個月' }))
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent('2026年8月')
    await userEvent.click(canvas.getByRole('button', { name: '今天' }))
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent('2026年7月')
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-[var(--layout-space-tight)]">無障礙設計</h3>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p><b>Grid role</b>:月格容器 <code>role="grid"</code> + <code>aria-label</code>(月份)。星期列是格陣的第一個 <code>role="row"</code>,每格 <code>role="columnheader"</code>(看得見「週日」,讀屏名稱是完整星期名「星期日」);其後每一週一個 <code>role="row"</code>(<code>display:contents</code> 保 CSS grid 佈局),每格 <code>role="gridcell"</code>(非互動容器),日期數字按鈕帶 <code>aria-label</code>(完整日期 + 事件數,例「2026年7月12日 星期日,1 個事件」;1 號畫面上寫「7月1日」不影響名稱);今天另加 <code>aria-current="date"</code>、名稱前加「今天,」。這些讀屏字串都可經 <code>labels</code> 逐鍵覆寫。事件 tile <code>role="button"</code> + <code>aria-label</code>(事件標題)。週列在捲動區裡捲,捲動區本身不是 Tab 停靠點。工具列的 ‹ / 今天 / › 包在 <code>{'<nav aria-label>'}</code> 裡(預設「行事曆月份導覽」)。</p>
        <p><b>Keyboard 行為</b>(實作現況,2026-09-24 補齊 W3C APG Data Grid):</p> {/* 來源:https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/grid/grid-pattern.html#L205-L221 */}
        <ul className="list-disc pl-5 space-y-1">
          <li>Tab — 整個月格陣只停一次(roving tabindex:只有目前焦點日的日期鈕進 Tab 序列,其餘日期鈕與全部事件方塊都不進);進來時停在今天,今天不在本月則停在該月 1 號</li>
          <li>←/→ — 前一天 / 後一天;↑/↓ — 上一週 / 下一週的同一天</li>
          <li>Home / End — 該週的第一天 / 最後一天(依 weekStartsOn)</li>
          <li>隱藏週末(hideWeekends)時 — ←/→ 跳過被藏的日子(週五按 → 到下週一);Home / End 落在該列第一 / 最後一個看得見的日子;PageUp / PageDown 落在被藏的日子時往同方向找、跑出目標月就往反方向;今天被藏時停靠點在同一週下一個看得見的日子(沒有就前一個),今天不在本月而 1 號被藏時停在 1 號之後第一個看得見的日子</li>
          <li>PageUp / PageDown — 上個月 / 下個月的同一個日號(該日號不存在則落當月最後一天);加 Shift 變成去年 / 明年</li>
          <li>Enter / Space — 日期數字按鈕觸發 <code>onDateClick</code></li>
          <li>F2 — 進到這一格的事件方塊;格內用 ↑↓←→ 換方塊、Enter / Space 觸發 <code>onEventClick</code>、Escape 或 F2 回到日期數字按鈕</li>
          <li>Toolbar 的 ◀ / 今天 / ▶ 在格陣外,是各自獨立的 Tab 停靠點</li>
          <li>日期格唯讀(readOnlyDates)時:格子裡只剩文字,焦點停在格子本身,方向鍵照常;格子的名稱由格內的字組成 —— 先念日期、今天與事件數(同一段字,只給讀屏),再念格內每個事件的標題(看得見的日期數字不重念);格子沒有主要動作,Enter 與 F2 都是進格</li>
          <li>事件方塊唯讀(readOnlyEvents)時:方塊不是按鈕、不進格內導覽</li>
        </ul>
        <p><b>週數欄與載入中</b>:週數欄(showWeekNumbers)的欄頭是星期列的第一個 <code>columnheader</code>(文字「週」),每一週的週數格是該列的 <code>rowheader</code>(讀屏名稱「第 27 週」,看得見的只有數字);兩者都不是操作目標、不進 Tab 順序。載入中(loading)格陣帶 <code>aria-busy="true"</code>,骨架 <code>aria-hidden</code>;日期的讀屏名稱先不念事件數。這幾段字串(欄頭、週數格名稱)可經 <code>labels</code> 覆寫。</p>
        <p><b>刻意不做</b>:Ctrl+Home / Ctrl+End、Shift+方向鍵切月切年(APG 把 Shift+方向鍵定義為延伸選取,本元件無選取模型)。</p>
        <p><b>Focus</b>:鍵盤焦點一律畫 outline 框(對齊 DS 焦點 canonical)。日期數字按鈕、預設事件 tile 與 <code>renderEventTile</code> 自訂 tile 的外層 wrapper 都走全域 <code>:focus-visible</code> 外描邊(往外 2px;元件不寫任何 class):列距 4、格內距 4,四周淨空 ≥ 4,往外放得下。日期格唯讀(readOnlyDates)時焦點在格子本身,格與格之間零間距 → 內描邊 <code>focus-visible:focus-ring-inset</code>。</p>
        <p><b>驗證</b>:Storybook a11y addon panel 應 0 critical violation。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。</p>
      </div>
    </div>
  ),
}
