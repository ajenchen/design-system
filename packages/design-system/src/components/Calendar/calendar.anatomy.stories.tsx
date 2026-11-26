// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   SizeMatrix N/A — Calendar 是單一 month canvas，沒有 size variant。
//   StateBehavior 已存在(today / outside month / hover / event tile 等狀態
//     已由 StateBehavior 5. 涵蓋)。
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from '@storybook/test'
import { Calendar, type CalendarEvent } from './calendar'
import { CalendarDemo } from './_calendar-demo'
import { CATEGORICAL_HUES, type CategoricalColor } from '@/design-system/tokens/categorical-color'
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

// 事件資料照 calendar.spec.md「資料語意」:end 一律不含(全天寫到隔天,有時段寫真的時間)。
// 「機房搬遷」週五到週一跨過週末:元件檢閱器開隱藏週末時,長條在被藏的週末切成兩段、內側兩端直角(Cell 規則「隱藏週末」)。
const sampleEvents: CalendarEvent[] = [
  { id: 'e1', title: '設計審查', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue' },
  { id: 'e2', title: '衝刺規劃會議', start: `${thisMonth}-08T14:00`, end: `${thisMonth}-08T15:30`, color: 'blue' },
  { id: 'e3', title: '版本發布截止', start: `${thisMonth}-12T18:00`, end: `${thisMonth}-12T18:00`, color: 'red' },
  { id: 'e4', title: '季度檢討', start: `${thisMonth}-18T14:00`, end: `${thisMonth}-18T16:00`, color: 'green' },
  { id: 'e5', title: 'Alex 休假', start: `${thisMonth}-20`, end: `${thisMonth}-23`, color: 'yellow', allDay: true },
  { id: 'e6', title: '機房搬遷', start: `${thisMonth}-24`, end: `${thisMonth}-28`, color: 'red', allDay: true },
]

// 日期格二擇一、事件方塊三擇一:可點就接回調(型別層必填;事件方塊是 eventDetail 內建詳情或 onEventClick),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」)。右上角「新事件」是全域新增入口、恆渲染,onCreateEvent 必填(同段末條,M23(f))。
// 規格頁的可點範例也給**真的結果**(CalendarDemo:點事件開內建詳情、點日期 / 新事件開「新增事件」對話框、送出跳 Toast),與展示頁同一個示範殼。

// Keep dynamic-token documentation readable without presenting Tailwind's
// source scanner with an invalid literal arbitrary-value candidate.
// 事件列 = Tag md(calendar.spec.md「間距」):高 h-tag-md 24、text-body 14px font-normal;字左緣 8(兩種長相同一條線)
// 長條(全天 / 跨日):文字內距 8 = 外層 4 + 文字 4(兩層都讀 --calendar-gap)
const BAR_EVENT_CLASS_GUIDE = [
  'bg-[var(--color-', '{color}', '-1)] · text-[var(--color-', '{color}',
  '-7)] · rounded-md · h-tag-md · 外層 px-[var(--calendar-gap)] + 文字 px-[var(--calendar-gap)] · text-body · font-normal · truncate',
].join('')
// 有時段:透明列 + 色條(寬 --calendar-accent-w 4、高 --font-body-size 字高、rounded-sm 圓頭)+ 間隔 4 + 時間 + 標題
const TIMED_EVENT_CLASS_GUIDE = [
  '無底 · 色條 bg-[var(--color-', '{color}', '-6)] w-[var(--calendar-accent-w)] h-[var(--font-body-size)] rounded-sm · gap-[var(--calendar-gap)] · 時間 text-fg-secondary · 標題 text-foreground',
].join('')
const BAR_HOVER_CLASS_GUIDE = [
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
  // readOnlyEvents:事件方塊整個唯讀(長條與有時段的列都不亮、不是按鈕;calendar.spec.md「日期格與事件方塊:可點或唯讀」)。
  args: {
    locale: LOCALE,
    events: sampleEvents,
    today: now,
    hideWeekends: false,
    showWeekNumbers: false,
    loading: false,
    readOnlyEvents: false,
  },
  argTypes: {
    readOnlyEvents: { control: 'boolean' },
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
        readOnlyEvents={args.readOnlyEvents}
      />
    </div>
  ),
}

// ── 3. 色彩對照表(事件 color 類別 + Cell / Event tile token)─────────────────────
// 跳過 4. SizeMatrix：元件沒有 size API。
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => {
    // 兩種長相 × 12 色相 + neutral(calendar.spec.md「事件的兩種長相」):7/2 起每天一個顏色,上一列全天(淡底長條,end 不含 → 隔天)、
    // 下一列有時段(10:00–11:00,透明列 + 色條 + 時間 + 標題)。標題 = 色名,讀者對得上是哪個顏色。
    const colors: CategoricalColor[] = ['neutral', ...CATEGORICAL_HUES]
    const day = (i: number) => `${thisMonth}-${String(i + 2).padStart(2, '0')}`
    const colorEvents: CalendarEvent[] = colors.flatMap((c, i) => [
      { id: `bar-${c}`, title: c, start: day(i), end: day(i + 1), color: c, allDay: true },
      { id: `timed-${c}`, title: c, start: `${day(i)}T10:00`, end: `${day(i)}T11:00`, color: c },
    ])
    return (
      <div className="p-4 bg-canvas flex flex-col gap-10">
        <div>
          <H3>事件類別色</H3>
          <Desc>
            事件顏色用 12 種類別色,和 Tag / Avatar 共用同一套色盤
            (blue / green / deep-orange / yellow / red / orange / amber / lime / turquoise / indigo / purple / magenta),
            另有不屬於任何類別的 neutral(中性灰,例:全公司的假日)。
            顏色代表「這是哪一類事件」(同一個團隊 / 同一個專案),不是嚴重程度。每個色名對應一個色相,紅與橘各自獨立、可清楚區分。
            每一天上面是全天事件(類別淡底長條、字是同色深一階),下面是有時段事件(無底、左側類別色條 + 灰色的開始時間 + 主色標題);
            neutral 的長條是 --secondary 底 + 主色字,色條是 --color-neutral-9。
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
                  <Td>每一週等高、平分格陣高度,不被內容撐高;格最小高 = 上內距 4 + 日期框 24 + 4 + 一列 24 + 下內距 4 + 格線 1(底線畫在格高裡面)。每格放幾列依量到的格高算,放不下的由最後一列的「+N」取代,列不壓扁(事件列一律 24)。容器比「週數 × 61」還矮時週列在格陣裡捲,工具列與星期列不捲</Td>
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
                  <Td mono>data-[hovered]:bg-neutral-hover</Td>
                  <Td>提示可點擊新增入口(日期格可點時)。亮的是指標底下那一格:指在跨日長條上亮指標所在的那一天(不是長條起點那一天),指在可點的事件上格子照亮、事件自己的滑過疊上去;指在唯讀的事件上格子不亮</Td>
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
                  <Td>星期縮成一個字(Intl weekday narrow,zh-TW「日」)、每月 1 號只顯示「1」、有時段事件拿掉開始時間(只留色條與標題);只看欄寬、不看視窗寬</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>Event tile 視覺 token</H3>
          <Desc>事件的長相由「全天 / 跨日」或「有時段」決定,顏色由 event <code>color</code> 欄位決定(categorical-color.ts:長條 CAT_EVENT、唯讀長條 CAT_SUBTLE、色條 CAT_ACCENT、neutral CAT_EVENT_NEUTRAL)。兩種長相的字左緣都離列左緣 8,在同一條線上。</Desc>
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
                  <Td>全天 / 跨日長條</Td>
                  <Td mono>{BAR_EVENT_CLASS_GUIDE}</Td>
                  <Td>類別淡底(step-1)+ 同色深一階的字(step-7),不帶色條;同一天排在有時段事件之前;多日事件畫成一條橫跨多格的長條,換週切段、第二段起重複標題,斷開那一端直角(只有真正的起點與終點圓角)。只有日期、沒寫 allDay 的事件也當全天。有時段但滿 24 小時的事件也畫成長條,含開始那天的那一段標題前加開始時間。色名必須 1:1 對應 <code>--color-{'{hue}'}-*</code>,零 offset(2026-06-04 修:原 red / orange 都誤接 deep-orange,改後 red→<code>--color-red-*</code>、orange→<code>--color-orange-*</code> 各自獨立)。2026-11-25 前全天事件左側另有 3px 實心色條</Td>
                </tr>
                <tr>
                  <Td>有時段事件(未滿 24 小時)</Td>
                  <Td mono>{TIMED_EVENT_CLASS_GUIDE}</Td>
                  <Td>無底的一列:左側類別色條(寬 4、高 = 字高 14、上下置中、圓頭)、間隔 4,接開始時間(灰,text-fg-secondary)與標題(主色,text-foreground);時間依 locale(zh-TW「上午10:00」)、可用 eventTimeFormat 換格式。欄寬 ≤ 60 時拿掉時間。圓角只在滑過 / 焦點時看得見。2026-11-25 前是淡底、時間寫在標題裡</Td>
                </tr>
                <tr>
                  <Td>neutral(不屬於任何類別)</Td>
                  <Td mono>長條 bg-secondary · text-foreground · hover:bg-secondary-hover;色條 bg-[var(--color-neutral-9)]</Td>
                  <Td>例:全公司的假日。長條用 --secondary 底(與 Tag neutral 同),滑過換它自己的下一階 --secondary-hover;唯讀時只有底與字</Td>
                </tr>
                <tr>
                  <Td>滑過(可點時)</Td>
                  <Td mono>長條 {BAR_HOVER_CLASS_GUIDE} · 有時段 hover:bg-neutral-hover</Td>
                  <Td>長條換同色濃一階(淺色變深、深色變亮);有時段的透明列換透明底的配對 --neutral-hover,疊在格子的滑過色上;瞬間切換、不做過渡</Td>
                </tr>
                <tr>
                  <Td>唯讀的事件(readOnlyEvents / 單筆 readOnly)</Td>
                  <Td mono>長條同上色、不帶 hover(CAT_SUBTLE)· 有時段列不亮 · 無 cursor-pointer</Td>
                  <Td>事件沒有詳情可開時宣告:方塊不亮、不是按鈕、不進格內導覽(F2 找不到它);指在它上面時格子也不亮(點了什麼都不發生);截斷時仍有提示</Td>
                </tr>
                <tr>
                  <Td>放不下的格</Td>
                  <Td mono>「+N」原生按鈕 · 第 k 列 · h-tag-md · px-[var(--calendar-text-inset)] · rounded-md · text-body · text-fg-secondary · hover:bg-neutral-hover · cursor-pointer</Td>
                  <Td>每格放幾列(k)依格高;放不下時最後一列換成「+N」(N = 這一格沒畫出來的筆數,看車道不看筆數),與事件列同高 24。點它以那一格為中心展開當天全部事件,不會在這天新增;鍵盤從日期按 F2 進格,方向鍵走到「+N」(排在這一天的事件之後)再按 Enter</Td>
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
        <div>• <b>放不下的 cell</b>:每格放幾列依格高;放不下時最後一列換成「+N」,點它展開當天清單(見下一則「「+N」清單開著」)</div>
        <div>• <b>跨日事件</b>:一條橫跨多格的長條,換週切段,斷開那一端直角(「Alex 休假」7/20–7/22、「機房搬遷」7/24–7/27)</div>
        <div>• <b>event hover</b>:長條切同色濃一階(淺色變深、深色變亮)<code>hover:bg-{'{color}'}-2</code>(如 blue → <code>--color-blue-2</code>);有時段的透明列換 <code>--neutral-hover</code>;都帶 <code>cursor-pointer</code></div>
        <div>• <b>兩種長相</b>:全天 / 跨日 = 類別淡底長條;有時段 = 無底一列「色條 + 開始時間 + 標題」(「設計審查」7/5 上午10:00)</div>
        <div>• <b>empty cell</b>:無事件保持純底色,點擊觸發 onDateClick</div>
        <div>• <b>cell hover</b>:只亮指標底下那一格 —— 指在「Alex 休假」7/22 那段亮 7/22;指在可點的事件上格子照亮;指在唯讀的事件上(例:展示頁「團隊行事曆」7/3 的公司創立紀念日)格子不亮</div>
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

// ── 5b. 狀態行為:「+N」清單開著(M15:需要點一下才看得到的狀態,用 play 打開)────────────────────
// 年度使用者大會那天一天 12 場:格子放不下 → 「+N」;點開 = 以那一格為中心的當天完整清單(calendar.spec.md「「+N」清單浮層」)。
// 清單超過上限(標題列 + 9 列 + 半列)→ 最後一列切在一半、只有清單捲、標題列不動。「場地布置」是場館排的、唯讀:照樣列出、是純文字。
const CONFERENCE_DAY = `${thisMonth}-22`
const conferenceEvents: CalendarEvent[] = [
  { id: 'c0', title: '大會週', start: `${thisMonth}-20`, end: `${thisMonth}-25`, color: 'purple', allDay: true },
  { id: 'c1', title: '場地布置(場館排定)', start: CONFERENCE_DAY, end: `${thisMonth}-23`, color: 'neutral', allDay: true, readOnly: true },
  { id: 'c2', title: '來賓報到', start: `${CONFERENCE_DAY}T08:30`, end: `${CONFERENCE_DAY}T09:00`, color: 'lime' },
  { id: 'c3', title: '開幕致詞', start: `${CONFERENCE_DAY}T09:00`, end: `${CONFERENCE_DAY}T09:20`, color: 'blue' },
  { id: 'c4', title: '主題演講:下一代工作流程', start: `${CONFERENCE_DAY}T09:30`, end: `${CONFERENCE_DAY}T10:30`, color: 'blue' },
  { id: 'c5', title: '產品新功能展示', start: `${CONFERENCE_DAY}T10:45`, end: `${CONFERENCE_DAY}T11:30`, color: 'green' },
  { id: 'c6', title: '午餐交流', start: `${CONFERENCE_DAY}T12:00`, end: `${CONFERENCE_DAY}T13:00`, color: 'orange' },
  { id: 'c7', title: '分組 A:自動化實戰', start: `${CONFERENCE_DAY}T13:30`, end: `${CONFERENCE_DAY}T14:30`, color: 'turquoise' },
  { id: 'c8', title: '分組 B:資料治理', start: `${CONFERENCE_DAY}T13:30`, end: `${CONFERENCE_DAY}T14:30`, color: 'turquoise' },
  { id: 'c9', title: '客戶座談', start: `${CONFERENCE_DAY}T15:00`, end: `${CONFERENCE_DAY}T16:00`, color: 'yellow' },
  { id: 'c10', title: '合作夥伴論壇', start: `${CONFERENCE_DAY}T16:15`, end: `${CONFERENCE_DAY}T17:00`, color: 'yellow' },
  { id: 'c11', title: '閉幕', start: `${CONFERENCE_DAY}T17:15`, end: `${CONFERENCE_DAY}T17:30`, color: 'blue' },
  { id: 'c12', title: '晚宴', start: `${CONFERENCE_DAY}T18:30`, end: `${CONFERENCE_DAY}T21:00`, color: 'red' },
  { id: 'c13', title: '媒體專訪', start: `${thisMonth}-23T10:00`, end: `${thisMonth}-23T11:00`, color: 'purple' },
]

export const MoreListOpen: Story = {
  name: '狀態行為:「+N」清單開著',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <div className="mb-2 text-body text-fg-muted space-y-1">
        <div>• <b>位置</b>:以「+N」那一格為中心(水平 + 垂直)蓋在格子上,碰到視窗邊推回、留 8;寬 = 格寬與浮層預設寬取大</div>
        <div>• <b>內容</b>:當天全部事件(含格內已畫出來的),順序與格內相同;跨日的「大會週」兩端都斷開、直角;唯讀的「場地布置」照樣列出、是純文字</div>
        <div>• <b>高度</b>:標題列 + 9 列 + 半列;超過時最後一列切在一半,只有清單捲,標題列不動。Esc 關清單、焦點回「+N」</div>
      </div>
      <CalendarDemo events={conferenceEvents} defaultReferenceDate={now} today={now} locale={LOCALE} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 「+N」剛掛上時 Radix 會把它換成新的節點一次:PopoverAnchor 的 effect 把 hasCustomAnchor 翻成 true 之後,Trigger 不再包 PopperAnchor,
    // 元素型別變了、React 重掛(@radix-ui/react-popover 1.1.15 dist/index.mjs:39 / :99;同一次提交裡換,畫面不閃)。先抓到的若是被換掉的舊節點,
    // 點擊送不到 → 每一輪重抓「當下在畫面上的那一顆」點,點到清單開出來為止;清單已開就不再點(不會點第二次把它關掉)。
    const more = `[data-calendar-more="${CONFERENCE_DAY}"]`
    const opened = `[data-calendar-more-list="${CONFERENCE_DAY}"]`
    await waitFor(async () => {
      if (document.querySelector(opened)) return
      const button = canvasElement.querySelector<HTMLElement>(more)
      await expect(button?.isConnected).toBe(true)
      await userEvent.click(button as HTMLElement)
      await expect(document.querySelector(opened)).not.toBeNull()
    })
    // 清單 = role=dialog(Popover),名稱 = 標題日期;列數 = 當天全部 13 筆(大會週 + 場地布置 + 11 場)。
    // 期望名稱在瀏覽器裡用規格的同一組 Intl 選項現算(calendar.spec.md「「+N」清單浮層」外殼):月日與星期之間有沒有空白隨 ICU 版本變
    //(Node ICU 78.2「7月22日週三」、Chromium 1217「7月22日 週三」),寫死字串會讓這則範例在另一個 ICU 上丟錯。
    const [y, m, d] = CONFERENCE_DAY.split('-').map(Number)
    const title = new Intl.DateTimeFormat(LOCALE, { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(y, m - 1, d))
    const list = await within(document.body).findByRole('dialog', { name: title })
    await expect(within(list).getAllByRole('listitem')).toHaveLength(13)
    // 唯讀的那一筆不是按鈕;沒有變成「新增事件」
    await expect(within(list).queryByRole('button', { name: /^場地布置/ })).toBeNull()
    await expect(within(document.body).queryByRole('dialog', { name: /^新增/ })).toBeNull()
  },
}

// ── 5c. 狀態行為:事件詳情開著(M15:點一下才看得到的狀態,用 play 打開)──────────────────────────────
// 點「設計審查」= 內建詳情浮層(calendar.spec.md「事件詳情浮層」):開在事件側邊、頂端對齊(7/5 在左半邊 → 往右開);標題就地改、
// 欄位垂直排(閱讀情境:標籤次要色);被點的那一段在詳情開著時維持滑過色。
const detailEvents: CalendarEvent[] = [
  { id: 'd1', title: '設計審查', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue', categoryId: 'meeting', location: '台北辦公室 3F 大會議室', description: '結帳頁改版第二輪:確認信用卡分期的金額顯示與錯誤訊息。' },
  { id: 'd2', title: 'Alex 休假', start: `${thisMonth}-20`, end: `${thisMonth}-23`, color: 'yellow', allDay: true, categoryId: 'leave' },
  { id: 'd3', title: '客戶會議', start: `${thisMonth}-25T15:00`, end: `${thisMonth}-25T16:00`, color: 'orange', categoryId: 'customer', location: '宏達工業 新竹廠' },
]
const DETAIL_CATEGORIES = [
  { id: 'meeting', name: '內部會議', color: 'blue' },
  { id: 'leave', name: '休假', color: 'yellow' },
  { id: 'customer', name: '客戶會議', color: 'orange' },
] as const satisfies readonly { id: string; name: string; color: CalendarEvent['color'] }[]

export const DetailOpen: Story = {
  name: '狀態行為:事件詳情開著',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <div className="mb-2 text-body text-fg-muted space-y-1">
        <div>• <b>位置</b>:開在事件側邊、頂端對齊;那一天在星期的左半邊 → 往右開、右半邊 → 往左開(放不下自動翻面);與事件隔 8</div>
        <div>• <b>標題列</b>:標題就地改(點標題進編輯),右側〔⋯〕〔×〕;沒有儲存鈕,每一欄自己提交</div>
        <div>• <b>欄位</b>:時間(同一天合併成一段)、全天(開關直接切)、地點、說明、類別,標籤在上;Esc 一次關一層,焦點回打開它的那一段</div>
      </div>
      <CalendarDemo events={detailEvents} defaultReferenceDate={now} today={now} locale={LOCALE} categories={DETAIL_CATEGORIES} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tile = within(canvasElement).getByRole('button', { name: /^設計審查,/ })
    await userEvent.click(tile)
    // 浮層的名字 = 事件標題本身(不是「編輯 事件標題」)
    const detail = await within(document.body).findByRole('dialog', { name: '設計審查' })
    await expect(within(detail).getByText('時間')).toBeTruthy()
    await expect(within(detail).getByText('台北辦公室 3F 大會議室')).toBeTruthy()
    await expect(tile).toHaveAttribute('data-detail-open')
  },
}

// ── 型別層:事件方塊三擇一(calendar.spec.md「日期格與事件方塊:可點或唯讀」;typecheck:stories 量,不是範例、不匯出)──
// 每一行少了 @ts-expect-error 就是型別層沒擋(三者同時傳 / 唯讀又有詳情 / 詳情缺必填的 onEventChange 都要是型別錯)。
const noopTypeProbe = () => {}
void [
  // @ts-expect-error eventDetail 與 onEventClick 不能同時傳
  <Calendar key="both" onCreateEvent={noopTypeProbe} onDateClick={noopTypeProbe} eventDetail={{ onEventChange: noopTypeProbe }} onEventClick={noopTypeProbe} />,
  // @ts-expect-error readOnlyEvents 與 eventDetail 不能同時傳
  <Calendar key="readonly" onCreateEvent={noopTypeProbe} onDateClick={noopTypeProbe} readOnlyEvents eventDetail={{ onEventChange: noopTypeProbe }} />,
  // @ts-expect-error eventDetail 缺必填的 onEventChange(M23(f))
  <Calendar key="missing" onCreateEvent={noopTypeProbe} onDateClick={noopTypeProbe} eventDetail={{ isEditable: () => true }} />,
  // 三擇一的正常寫法要能過
  <Calendar key="ok" onCreateEvent={noopTypeProbe} onDateClick={noopTypeProbe} eventDetail={{ onEventChange: noopTypeProbe }} />,
]

// ── 5d. 狀態行為:從「+N」清單開詳情(清單留著、詳情開在旁邊)──────────────────────────────────────
export const DetailFromMoreList: Story = {
  name: '狀態行為:從清單開詳情',
  render: () => (
    <div className="h-screen p-4 bg-canvas">
      <div className="mb-2 text-body text-fg-muted space-y-1">
        <div>• <b>兩層並存</b>:點清單裡的事件,詳情開在清單旁、水平貼著清單外緣、上緣對齊那一列;清單不關,那一列維持滑過色</div>
        <div>• <b>Esc 一次一層</b>:第一下關詳情(焦點回那一列),第二下關清單(焦點回「+N」);點清單上 = 只關詳情,點頁面 = 兩層都關</div>
      </div>
      <CalendarDemo events={conferenceEvents} defaultReferenceDate={now} today={now} locale={LOCALE} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const more = `[data-calendar-more="${CONFERENCE_DAY}"]`
    const opened = `[data-calendar-more-list="${CONFERENCE_DAY}"]`
    // 「+N」剛掛上時會被 Radix 換成新節點一次(見上一則 MoreListOpen 的註解):每一輪重抓當下那一顆點,點到清單開出來為止
    await waitFor(async () => {
      if (document.querySelector(opened)) return
      const button = canvasElement.querySelector<HTMLElement>(more)
      await expect(button?.isConnected).toBe(true)
      await userEvent.click(button as HTMLElement)
      await expect(document.querySelector(opened)).not.toBeNull()
    })
    const list = document.querySelector<HTMLElement>(opened) as HTMLElement
    // 點捲在頂端就看得到的那一列(清單上限 9 列 + 半列)
    const row = within(list).getByRole('button', { name: /^開幕致詞,/ })
    await userEvent.click(row)
    await within(document.body).findByRole('dialog', { name: '開幕致詞' })
    // 清單還在
    await expect(document.querySelector(opened)).not.toBeNull()
    await expect(row).toHaveAttribute('data-detail-open')
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
        <p><b>Grid role</b>:月格容器 <code>role="grid"</code> + <code>aria-label</code>(月份)。星期列是格陣的第一個 <code>role="row"</code>,每格 <code>role="columnheader"</code>(看得見「週日」,讀屏名稱是完整星期名「星期日」);其後每一週一個 <code>role="row"</code>(<code>display:contents</code> 保 CSS grid 佈局),每格 <code>role="gridcell"</code>(非互動容器),日期數字按鈕帶 <code>aria-label</code>(完整日期 + 事件數,例「2026年7月12日 星期日,1 個事件」;1 號畫面上寫「7月1日」不影響名稱);今天另加 <code>aria-current="date"</code>、名稱前加「今天,」。這些讀屏字串都可經 <code>labels</code> 逐鍵覆寫。事件 tile <code>role="button"</code> + <code>aria-label</code>{'「{標題},{開始時間 或 起訖日期}{,全天}」'}(例「設計審查,上午10:00」「Alex 休假,7月20日 – 7月22日,全天」;<code>labels.event</code> 可覆寫);唯讀的事件不是按鈕、不命名,標題與時間就是格子內容的一部分。週列在捲動區裡捲,捲動區本身不是 Tab 停靠點。工具列的 ‹ / 今天 / › 包在 <code>{'<nav aria-label>'}</code> 裡(預設「行事曆月份導覽」)。</p>
        <p><b>Keyboard 行為</b>(實作現況,2026-09-24 補齊 W3C APG Data Grid):</p> {/* 來源:https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/grid/grid-pattern.html#L205-L221 */}
        <ul className="list-disc pl-5 space-y-1">
          <li>Tab — 整個月格陣只停一次(roving tabindex:只有目前焦點日的日期鈕進 Tab 序列,其餘日期鈕與全部事件方塊都不進);進來時停在今天,今天不在本月則停在該月 1 號</li>
          <li>←/→ — 前一天 / 後一天;↑/↓ — 上一週 / 下一週的同一天</li>
          <li>Home / End — 該週的第一天 / 最後一天(依 weekStartsOn)</li>
          <li>隱藏週末(hideWeekends)時 — ←/→ 跳過被藏的日子(週五按 → 到下週一);Home / End 落在該列第一 / 最後一個看得見的日子;PageUp / PageDown 落在被藏的日子時往同方向找、跑出目標月就往反方向;今天被藏時停靠點在同一週下一個看得見的日子(沒有就前一個),今天不在本月而 1 號被藏時停在 1 號之後第一個看得見的日子</li>
          <li>PageUp / PageDown — 上個月 / 下個月的同一個日號(該日號不存在則落當月最後一天);加 Shift 變成去年 / 明年</li>
          <li>Enter / Space — 日期數字按鈕觸發 <code>onDateClick</code></li>
          <li>F2 — 進到這一天的事件方塊(含從前幾天橫跨過來的長條,依列由上而下);格內用 ↑↓←→ 換方塊(到底不繞回)、Enter / Space 觸發 <code>onEventClick</code>(第二個參數 <code>{'{ anchor }'}</code> = 那一列 / 那一段)、Escape 或 F2 回到進格那一天的日期數字按鈕(從長條的第 3 天進格就回第 3 天,不是長條起點那一天)</li>
          <li>Toolbar 的 ◀ / 今天 / ▶ 在格陣外,是各自獨立的 Tab 停靠點</li>
          <li>日期格唯讀(readOnlyDates)時:格子裡只剩文字,焦點停在格子本身,方向鍵照常;格子的名稱由格內的字組成 —— 先念日期、今天與事件數(同一段字,只給讀屏),再念格內每個事件的標題(看得見的日期數字不重念);格子沒有主要動作,Enter 與 F2 都是進格</li>
          <li>事件方塊唯讀(readOnlyEvents,或單筆事件的 readOnly)時:方塊不是按鈕、不進格內導覽,點了什麼都不發生</li>
        </ul>
        <p><b>週數欄與載入中</b>:週數欄(showWeekNumbers)的欄頭是星期列的第一個 <code>columnheader</code>(文字「週」),每一週的週數格是該列的 <code>rowheader</code>(讀屏名稱「第 27 週」,看得見的只有數字);兩者都不是操作目標、不進 Tab 順序。載入中(loading)格陣帶 <code>aria-busy="true"</code>,骨架 <code>aria-hidden</code>;日期的讀屏名稱先不念事件數。這幾段字串(欄頭、週數格名稱)可經 <code>labels</code> 覆寫。</p>
        <p><b>刻意不做</b>:Ctrl+Home / Ctrl+End、Shift+方向鍵切月切年(APG 把 Shift+方向鍵定義為延伸選取,本元件無選取模型)。</p>
        <p><b>Focus</b>:鍵盤焦點一律畫 outline 框(對齊 DS 焦點 canonical)。日期數字按鈕、預設事件 tile(跨日長條的框畫在整段上)與 <code>renderEventTile</code> 自訂 tile 的外層 wrapper 都走全域 <code>:focus-visible</code> 外描邊(往外 2px;元件不寫任何 class):列距 4、格內距 4,四周淨空 ≥ 4,往外放得下。日期格唯讀(readOnlyDates)時焦點在格子本身,格與格之間零間距 → 內描邊 <code>focus-visible:focus-ring-inset</code>。</p>
        <p><b>驗證</b>:Storybook a11y addon panel 應 0 critical violation。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。</p>
      </div>
    </div>
  ),
}
