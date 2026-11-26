// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite(DatePicker single + Range + showTime + format/ISO helpers + TimePickerSidePanel sub-components),拆 sub-file 會 (a) 增 cross-file context binding 複雜度 (b) M21 過度抽象(每 helper 1 consumer)。等 inline filter UI 真接入第 2 consumer 再拆。
/**
 * ── 消費的 SSOT ──(本段只列日期時間的文字寫法;其餘見各 import 旁的註解)
 * - 日期 / 時間的預設寫法、合併顯示、打字解析的上下午: `./range-format.ts`(DATE-TIME(定)2026-11-26:日期一律補零、時間 12 / 24 跟語系;
 *   date-picker.spec.md「格式化」「區間檢視合併(formatRange)」「Typed input」)
 * - showTime 面板的 12 / 24 小時(上下午欄、時欄 12 / 01…11、面板標題)與空白提示字: `./range-format.ts` `resolveTimePanelFormat` /
 *   `formatPanelTime` / `timePlaceholder`(TIME-12H-PANEL(定)2026-11-26,與欄位裡的字同一份判斷);面板寬
 *   `../TimePicker/time-columns.tsx` `timeColumnsWidthClass`(date-picker.spec.md「showTime」)
 * - 預設語系與週起始日: `../../lib/date-locale.ts`
 * - Range 作用端那條線(RANGE-FOCUS-BAR(定)2026-11-26;date-picker.spec.md「Active-end 機制」視覺指示,見 RANGE_END_BAR_CLASS 註解):
 *   畫法 = `../Tabs/tabs.tsx` 選中線(`::after` 絕對定位、`after:h-0.5`、壓住下面那條 1px 框線 —— tabs.spec.md「這兩條線視覺上必須是同一條」);
 *   位置 = `tokens/uiSize/uiSize.css` 的 `--field-control-py-{sm,md,lg}` + `--field-border-width`(文字行盒下緣 → 框外緣);
 *   顏色 = 框的同一組顏色 token `--color-primary` / `--color-error`(`../Field/field-wrapper.tsx` 聚焦 `!border-primary`、錯誤 `border-error`);
 *   高對比模式(forced-colors)改用 CSS 系統色 `Highlight`(DS 沒有高對比 token;見 RANGE_END_BAR_CLASS 註解)
 */
import * as React from 'react'
import { escapeLayerProps, isEscapeForControl, isEscapeTakenElsewhere } from '@/design-system/lib/overlay-escape'
import { useCompositeFieldBlur, fieldOpenProps } from '@/design-system/lib/composite-field-focus'
import { Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant, FieldVariantInternal, FieldWidth } from '@/design-system/components/Field/field-types'
import { readonlyTabStopProps, fieldWrapperStyles, fieldWidthVariant, fieldWidthStyle, bareInputStyles, nakedCellRowModeAlign, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { FieldClearButton } from '@/design-system/components/Field/field-clear-button'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/design-system/components/Popover/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { useTruncated } from '@/design-system/hooks/use-truncated'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { DateGrid, EMPHASIS_FOCUS_RING_CLASSNAME, RANGE_PREVIEW_ARMED_CLASSNAME, RANGE_PREVIEW_CLASSNAMES, RANGE_TRACK_CLASSNAMES } from '@/design-system/components/DateGrid/date-grid'
import { computeRangePreview, rangePreviewModifiers } from './range-preview'
// 合併顯示 + 日期 / 時間的預設寫法 + 打字解析的上下午(DATE-TIME(定)2026-11-26:日期一律補零、時間 12 / 24 跟語系;date-picker.spec.md「格式化」)
import { formatDateRange, formatDateRangeEndpoint, DATE_RANGE_DEFAULT_DATE_OPTIONS, resolveDateRangeFormatOptions, parseTimeText, resolveTimePanelFormat, formatPanelTime, timePlaceholder, type TimePanelFormat } from './range-format'
import { Button } from '@/design-system/components/Button/button'
import { SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid, useFieldEmptyDisplay, fieldEmptyColorClass } from '@/design-system/components/Field/field-context'
import {
  TimeColumns,
  isoToTimeParts,
  timePartsToString,
  timeColumnsWidthClass,
  type TimeParts,
  type TimeStep,
} from '@/design-system/components/TimePicker/time-columns'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
import { returnFocusToOpener } from '@/design-system/lib/overlay-focus-return'
import { isImeComposing } from '@/design-system/lib/ime-composition'
import { DEFAULT_DATE_LOCALE, resolveWeekStartsOn, type WeekStartsOn } from '@/design-system/lib/date-locale'

// ── Format ──────────────────────────────────────────────────────────────────

export interface DateFormatOptions {
  /**
   * Intl.DateTimeFormat options(預設 { year: 'numeric', month: '2-digit', day: '2-digit' };`showTime` 時再補時、分 ——
   * 12 / 24 小時跟語系,zh-TW「2026/07/05 下午2:30」)。自己寫了時間欄位(例 `hourCycle: 'h23'`)就照它;規則見 date-picker.spec.md「格式化」。
   */
  formatOptions?: Intl.DateTimeFormatOptions
  /**
   * 語系(BCP 47,預設 'zh-TW' = `DEFAULT_DATE_LOCALE`)。傳了 `formatOptions` / `locale` 才走 `Intl.DateTimeFormat`;
   * 日曆面一週從哪天開始也由它推(沒傳 `weekStartsOn` 時,語系 → CLDR,`lib/date-locale.ts`)。
   */
  locale?: string
}

/**
 * Default format:**YYYY/MM/DD**(對齊 Ant Design 順序,year-first ISO-like)。
 * 棄 `en-US` `MM/DD/YYYY`(month-first 美式)— 美式順序在 international DS 反直覺
 * (跟 ISO date 視覺對不上,跟 sort 順序也對不上)。Ant / Material X / Apple HIG
 * 一致 year-first。Consumer 想自訂可傳 `formatOptions` + `locale`。
 */
// 2026-07-06 D3 perf:formatOptions/locale 顯式傳入時走 Intl.DateTimeFormat(貴 constructor)。
// DataTable date 欄轉發此 config → 每 cell × 每次表格 re-render 重建。module-level cache 重用實例
// (無狀態可安全重用),key = locale|JSON.stringify(options)。行為 Δ=0。
const dtfCache = new Map<string, Intl.DateTimeFormat>()
function getDateTimeFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + '|' + JSON.stringify(options)
  let fmt = dtfCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options)
    dtfCache.set(key, fmt)
  }
  return fmt
}

function formatDate(
  value: string | number | Date,
  options: DateFormatOptions = {},
): string {
  // TZ-safe:date-only / datetime ISO string 走 isoToDate(local-time 語意,new Date(y,m-1,d))
  // 而非 new Date('YYYY-MM-DD')(ECMAScript 以 UTC 解析 → 負時區 off-by-one,如 LA 顯前一天)。
  // 非 ISO string(RFC 'Mar 12 2025' 等)fallback new Date();number timestamp 直接 new Date()。
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? (isoToDate(value) ?? new Date(value))
        : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  // 若 consumer 顯式傳 formatOptions / locale → 走 Intl.DateTimeFormat
  if (options.formatOptions || options.locale) {
    return getDateTimeFormatter(options.locale ?? DEFAULT_DATE_LOCALE, options.formatOptions ?? DATE_RANGE_DEFAULT_DATE_OPTIONS).format(date)
  }
  // 預設:YYYY/MM/DD(直接組,locale-independent + 視覺穩定;與預設語系 zh-TW 走 Intl 兩位數年月日的輸出字面相同)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

/**
 * 顯示用:date 或 datetime,根據 showTime / showSeconds 切換。
 * 帶時間時日期段與時間段一次交給 Intl,選項與合併顯示同一支(range-format.ts `resolveDateRangeFormatOptions`):
 * 日期兩位數月日、時間 12 / 24 跟語系(zh-TW「2026/07/05 下午2:30」、en-US「07/05/2026, 2:30 PM」、en-GB「05/07/2026, 14:30」);
 * `formatOptions` 寫了時間欄位就照它。DATE-TIME(定)2026-11-26;改前時間一律接 24 小時 `HH:MM`(不看語系也不看 formatOptions)。
 */
function formatDateOrDateTime(
  iso: string | null | undefined,
  showTime: boolean,
  showSeconds: boolean,
  options: DateFormatOptions = {},
): string {
  if (!iso) return ''
  if (!showTime || !isoToTimeParts(iso)) return formatDate(iso, options)
  const date = isoToDate(iso)
  if (!date || Number.isNaN(date.getTime())) return formatDate(iso, options)
  return getDateTimeFormatter(
    options.locale ?? DEFAULT_DATE_LOCALE,
    resolveDateRangeFormatOptions(true, showSeconds, options.formatOptions),
  ).format(date)
}

// ── ISO <-> Date conversion ─────────────────────────────────────────────────
// date-only:'YYYY-MM-DD'(local-time 語意,不帶時區)
// datetime  :'YYYY-MM-DDTHH:MM:SS'(同 local-time 語意)

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  const time = isoToTimeParts(iso)
  if (time) {
    date.setHours(time.hours, time.minutes, time.seconds)
  }
  return date
}

/**
 * Issue 10 typed input parser(2026-05-10):接 user 自由輸入字串,parse 出 ISO date(YYYY-MM-DD)
 * 或 ISO datetime(YYYY-MM-DDTHH:MM[:SS])。
 *
 * 支援 format(per Material X DatePicker / Ant DatePicker typed input idiom):
 *   - `YYYY-MM-DD` / `YYYY/MM/DD` / `YYYY.MM.DD`(ISO + 慣例 separator,明確 parse branch)
 *   - `YYYY-MM-DD HH:MM[:SS]` / `YYYY-MM-DDTHH:MM[:SS]`(datetime,showTime 才接)
 *   - 時間段也認這個語系的上下午(`YYYY/MM/DD 下午2:30`、`2026/07/05 2:30 PM`):顯示跟語系之後輸入框裡就是這種寫法,
 *     解析交給 range-format.ts `parseTimeText`(上下午的字從 Intl formatToParts 反推,不寫死;DATE-TIME(定)2026-11-26)
 *   - native `Date.parse()` fallback(handle 'Mar 12 2025' 等英文 RFC;US `MM/DD/YYYY` 亦由此判讀,ambiguous)
 *   ⚠️ 不支援 EU `DD/MM/YYYY`:無專屬 parser branch;native Date.parse 把 slash 日期當 US MM/DD,
 *      `31/12/2026`(月 > 12)直接 Invalid。v1 known-gap,需 EU 請走 formatOptions/locale 或另加 parser branch。
 *
 * Return:`{ iso, valid }`。Invalid → `valid=false` + `iso=null`,UI 顯 aria-invalid。
 * Partial input(打到一半)→ valid=false 但不顯 error UI(consumer 用 onBlur / Enter 才檢驗)。
 *
 * 對齊 Material X-DatePicker `formats` parser + Ant DatePicker `format` array + dayjs.parse。
 */
function parseDateInput(input: string, opts: { allowTime: boolean; locale: string }): { iso: string | null; valid: boolean } {
  const trimmed = input.trim()
  if (trimmed === '') return { iso: null, valid: true }  // empty = no value, OK
  // 1. ISO date YYYY-MM-DD or with separators / . /(可選時間段:24 小時 HH:MM[:SS],或這個語系的上下午 + 時:分)
  const isoDateMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]\s*(.+))?$/)
  if (isoDateMatch) {
    const [, y, m, d, timeText] = isoDateMatch
    // 時間段:越界(25:99、下午13:00)或認不得的字 → 不合法(JS Date 會把越界的時分默默進位,不能交給它判)
    const time = timeText === undefined ? null : parseTimeText(timeText, opts.locale, getDateTimeFormatter)
    if (timeText !== undefined && time === null) return { iso: null, valid: false }
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (isNaN(date.getTime()) || date.getMonth() !== Number(m) - 1) return { iso: null, valid: false }
    if (time && opts.allowTime) return { iso: combineDateAndTime(date, time), valid: true }
    return { iso: dateToIso(date), valid: true }
  }
  // 2. US / EU locale MM/DD/YYYY or DD/MM/YYYY — ambiguous;v1 fallback Date.parse 並接受結果
  // 3. native Date.parse fallback(RFC-style 'Mar 12 2025')
  const parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    const datePart = dateToIso(parsed)
    if (opts.allowTime && (trimmed.includes(':') || trimmed.includes('T'))) {
      const h2 = String(parsed.getHours()).padStart(2, '0')
      const m2 = String(parsed.getMinutes()).padStart(2, '0')
      const s2 = String(parsed.getSeconds()).padStart(2, '0')
      return { iso: `${datePart}T${h2}:${m2}:${s2}`, valid: true }
    }
    return { iso: datePart, valid: true }
  }
  return { iso: null, valid: false }
}

function dateToIso(date: Date | undefined): string {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function combineDateAndTime(date: Date, time: TimeParts): string {
  const datePart = dateToIso(date)
  const hh = String(time.hours).padStart(2, '0')
  const mi = String(time.minutes).padStart(2, '0')
  const ss = String(time.seconds).padStart(2, '0')
  return `${datePart}T${hh}:${mi}:${ss}`
}

function nowIsoDateTime(): string {
  const d = new Date()
  return combineDateAndTime(d, {
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
  })
}

function addDays(date: Date, n: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

// ── TimePickerSidePanel ────────────────────────────────────────────────
//
// DatePicker showTime / Range showTime 共用的右側時間 panel(canonical 2026-05-03 v8)。
//
// ── Caption row alignment canonical(永遠跟 calendar 年月對齊)──
// 結構必須符合 DateGrid month_caption 同樣的 pt-3 + h-field-xs + mb-3 規格,讓 title
// 跟 calendar 「April 2026」字 baseline 在同一 Y 座標(垂直對齊)。
// Y 座標推導:
//   - panel root 的上內距**讀跟 DateGrid 根一樣的運算式**,所以「對齊」是綁定的、不是靠人記得同步
//   - h-field-xs = 24px header,title 純 flex items-center justify-center → 真正水平+垂直置中
//   - mb-3 = 12px gap 對齊 DateGrid month_caption mb-3
//   → title text center Y = 12 + 12 = 24px(from CalendarTimeContainer top)
//   → calendar caption text center Y = 12(p-3 top)+ 12(caption row half)= 24px ✓ 同一 Y
// 2026-09-18:原本兩邊各寫死 `p-3` / `pt-3`(都是字面 12),靠這行 ⚠️ 註解提醒人「改一邊要記得改另一邊」。
// DateGrid 的根已改讀 `var(--item-px,var(--field-px))`,這裡跟著讀同一個運算式 ——
// **任何容器覆寫 `--item-px`,兩邊會一起動**,不再有「其中一邊忘了跟」的空間(先前那種靠註解的雙鎖是紙老虎)。
// 下方 `mb-3`(caption → 星期列的 12px)兩邊仍是字面值,但它不受根內距影響,維持原樣。
//
// ── Header divider canonical(無 border-b)──
// Header 下方無 divider,對齊 DateGrid month_caption(無 border-b,只 mb-3 gap)。
// DS internal canonical(M23)優先於 Ant time-picker header divider 慣例 — 兩 panel
// 同層級 caption 視覺對稱,引入 divider 會破對稱。
//
// ── Bottom padding canonical(0)──
// Root 用 pt-3 而非 py-3:bottom = 0,讓 columns 連續延伸到 SurfaceFooter border-t。
// Ant / Material time picker idiom — time list 視覺感「continuous scroll」延伸到 footer
// divider,bottom padding 12px 反而讓 list 看起來「截斷」。
// 此處與 DateGrid p-3(bottom 12)有意 asymmetric:Calendar cells 不該撞 footer divider
// (cells 是離散 grid),time list 是 scroll list 撞 divider 反而合理。

interface TimePickerSidePanelProps {
  value?: TimeParts
  onChange: (next: TimeParts) => void
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
  /**
   * 面板的時間寫法(`range-format.ts` `resolveTimePanelFormat`,與欄位裡的字同一份判斷)。必填:單日與 Range 兩處呼叫端都得算好傳進來,
   * 不傳 = 面板與欄位各說各的 12 / 24(M23(f):沒有內建 fallback 的就必填)
   */
  panelFormat: TimePanelFormat
}

function TimePickerSidePanel({
  value,
  onChange,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  panelFormat,
  className,
}: TimePickerSidePanelProps & { className?: string }) {
  // Dynamic header text — 顯示當前選擇的時間(對齊 user Q4 + Ant idiom)。
  // 12 小時語系:標題與欄位同一份時間寫法(zh-TW「下午2:30」)、面板多一欄上下午 —— TIME-12H-PANEL(定)2026-11-26;
  // 24 小時語系照舊 HH:MM(`formatPanelTime` 回 null)。空值的「--:--」不變【AI 推導】
  const headerText = value
    ? (formatPanelTime(value, panelFormat, getDateTimeFormatter) ?? timePartsToString(value, showSeconds))
    : (showSeconds ? '--:--:--' : '--:--')

  return (
    <div className={cn('flex flex-col h-full pt-[var(--item-px,var(--field-px))]', className)}>
      {/* Header 純結構:h-field-xs (24px) + flex 水平+垂直置中 + mb-3 (12px gap) */}
      <div className="h-field-xs flex items-center justify-center mb-3">
        <span className="text-body font-medium tabular-nums">{headerText}</span>
      </div>
      {/* Columns:flex-1 填滿剩餘 height,無 horizontal padding(填滿容器寬度) */}
      <div className="flex-1 min-h-0 flex">
        <TimeColumns
          value={value}
          onChange={onChange}
          showSeconds={showSeconds}
          minuteStep={minuteStep}
          secondStep={secondStep}
          clock={panelFormat.clock}
        />
      </div>
    </div>
  )
}

/**
 * showTime panel container — 包 DateGrid + TimePicker side panel,DateGrid 主導 row 高度,
 * TimePicker absolute 撐滿同高,不影響 layout。Spacer div 留 layout 寬度給 absolute panel。
 * 寬度讀 TimeColumns 同一支 `timeColumnsWidthClass`(欄數 × 約 80px;12 小時制多上下午一欄),佔位與面板不會一寬一窄。
 */
interface CalendarTimeContainerProps {
  showTime: boolean
  showSeconds: boolean
  /** 面板的時間寫法(與 `TimePickerSidePanel` 同一份);決定有沒有上下午欄 = 面板多寬 */
  panelFormat: TimePanelFormat
  calendar: React.ReactNode
  timePanel?: React.ReactNode
}

function CalendarTimeContainer({ showTime, showSeconds, panelFormat, calendar, timePanel }: CalendarTimeContainerProps) {
  if (!showTime) return <>{calendar}</>
  const panelWidth = timeColumnsWidthClass(showSeconds, panelFormat.clock)
  return (
    <div className="relative">
      <div className="flex flex-row">
        {calendar}
        {/* Spacer 佔 layout 寬度給 absolute TimePicker;border-l 在這層,不在 absolute 層
            (避免 stacking + border 雙繪) */}
        <div className={cn('shrink-0 border-l border-divider', panelWidth)} />
      </div>
      {/* TimePicker absolute 撐滿 DateGrid 高度(top-0 bottom-0),right-0 對齊 spacer */}
      <div className={cn('absolute top-0 right-0 bottom-0', panelWidth)}>
        {timePanel}
      </div>
    </div>
  )
}

// ── DatePicker(single)──────────────────────────────────────────────────

export interface DatePickerProps
  extends DateFormatOptions,
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      'value' | 'onChange' | 'placeholder' | 'defaultValue'
    > {
  mode?: FieldMode
  /** 表單欄位名稱(`useFormValidation` 規則 8 以它定位、聚焦;掛在可聚焦的那一個:可打字時是 `<input>`,否則是觸發欄位)。 */
  name?: string
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  /** 寬度軸 — `fill` 填滿容器(default)/ `hug` 依內容收縮(value 寬 + slot 寬 + gap + 內 padding)/ 數字 = 固定寬(px,
   *  窄容器裡不超出容器);chrome 與互動不變。SSOT → field-controls.spec.md「寬度軸(width: fill / hug)」。 */
  width?: FieldWidth
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** ISO date(YYYY-MM-DD)或 ISO datetime(YYYY-MM-DDTHH:MM:SS,當 showTime=true) */
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 允許清空已選值 */
  clearable?: boolean
  /** 啟用時間欄位(時 / 分 [/ 秒]),Ant idiom — value 變 ISO datetime */
  showTime?: boolean
  /** showTime 時是否顯示秒 */
  showSeconds?: boolean
  /** showTime 分鐘步進(會議常用 15) */
  minuteStep?: TimeStep
  /** showTime 秒鐘步進 */
  secondStep?: TimeStep
  /**
   * 日曆面一週從哪天開始(0 = 週日 … 6 = 週六)。沒傳 = 由 `locale` 推(語系 → CLDR;預設 zh-TW = 週日)。
   * 產品有「一週從週一開始」這類使用者偏好時,app 層把同一個值傳給每一個日期元件(不在個別元件寫死數字);規則與出處 → date-picker.spec.md「週起始日」。
   */
  weekStartsOn?: WeekStartsOn
  /**
   * 是否需 OK 確認才提交,預設 showTime=true 時為 true(對齊 Ant DatePicker showTime)
   * — datetime picker user 習慣編完才 commit,避免 calendar 點到就關。
   */
  needConfirm?: boolean
  /**
   * View 態是否渲 Calendar icon + Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell view↔edit 像素級對齊用。預設 false(檢視態只畫值:裸 span,不畫欄位外框 / 圖示;
   *   理由:檢視態只顯示值,跟表格 2026-07-08 A 案同一方向,見 field-controls.spec.md「LinkInput / PeoplePicker 預設 view 路徑不包 wrapper」)。
   * 設 true 時 view 走 fieldWrapperStyles(naked variant)+ ItemSuffix CalendarIcon,
   * 與 edit 同 DOM 結構,消除 Layer-B padding mismatch。
   */
  showDisplayEndIcon?: boolean
  /** Initial open state(uncontrolled)— DataTable cell-as-input 1-step open canonical */
  defaultOpen?: boolean
  /** open state 變更 callback。DataTable cell-as-input 用:open=false → cell exit edit */
  onOpenChange?: (open: boolean) => void
  /**
   * Issue 10 typed input(2026-05-10):trigger 內渲 real `<input>` 接 user 鍵盤輸入,
   * 同時保持 Calendar icon trigger 開啟 calendar 選擇(對齊 Material X DatePicker / Ant
   * DatePicker / Notion typed-date idiom)。
   *
   * 預設 false — trigger 是 `<div role="combobox">` + `<span>` 文字,要直接打字的欄位才開(理由:開不開由消費者依情境決定,
   * 預設可打字不是所有情境都比較方便 —— user 2026-11-17 選甲維持,原話見 date-picker.spec.md「Typed input」)。
   *
   * Behavior(opt-in `typeable=true`):
   *   - `<input>` 取代 `<span>` displayValue,user 可直接打字
   *   - Partial input(打到一半,如 "2025-")allow,**不**即時驗證
   *   - `Enter` / `Blur` → `parseDateInput` 解析 → 合法 commit `onChange`;不合法 set
   *     aria-invalid + keep draft visible(user 可繼續修)
   *   - `Esc` → reset draft 回 committed value
   *   - IME 組字中不觸發驗證:鍵盤那一側(Enter / Esc / ↓)走全 DS 一支 `lib/ime-composition.ts` `isImeComposing`,
   *     失焦那一側(不是鍵盤事件)仍靠 onCompositionStart/End 的 ref(2026-09-30)
   *   - Calendar pick → 同步 input draft + commit(走原 path)
   *   - **點欄位任何地方都開日曆,焦點留在輸入框可繼續打字**(2026-09-07;Ant 官方文件
   *     「By clicking the input box, you can select a date from a popup calendar」+ inputReadOnly:false)
   *   - **鍵盤 ArrowDown / Alt+ArrowDown 開啟時焦點進日曆** —— W3C APG date-picker combobox 逐字
   *     「opened by activating the choose date button or by moving keyboard focus to the combobox and
   *     pressing Down Arrow or Alt + Down Arrow」;焦點不進去就走不了日期格,那條不能為了打字犧牲
   *
   * **v1 limits**:
   *   - format detection ISO YYYY-MM-DD / YYYY/MM/DD / Date.parse fallback(`parseDateInput`)
   *   - US `MM/DD/YYYY` vs EU `DD/MM/YYYY` ambiguous → fallback native parser
   *   - 未支援 locale-aware format prop(v2 加 `dateFormat?: string`)
   *
   * 對齊 Material X-DatePicker `format` prop / Ant DatePicker `format` array / Notion typed-input。
   */
  typeable?: boolean
}

// Trigger uses `<div role="combobox" tabIndex={...}>` instead of `<button>` —
// 對齊 Combobox / Select / TimePicker 同 pattern,避免 ItemInlineAction(內部 button)
// 構成 nested-interactive(axe serious)。Radix PopoverTrigger 只 compose onClick(非
// native button → 無 Enter/Space→click),Enter/Space 開 popover 由本檔自建 onKeyDown 補
// (對齊 select.tsx desktop trigger canonical);typeable 模式交由內層 <input> 自管鍵盤。
// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  (
    {
      mode,
      variant: variantProp,
      width,
      error: errorProp = false,
      size: sizeProp,
      value,
      onChange,
      placeholder,
      className,
      disabled: disabledProp,
      clearable = false,
      formatOptions,
      locale,
      showTime = false,
      showSeconds = false,
      minuteStep = 1,
      secondStep = 1,
      needConfirm: needConfirmProp,
      weekStartsOn,
      showDisplayEndIcon = false,
      defaultOpen = false,
      onOpenChange,
      typeable = false,
      id: idProp,
      name,
      onBlur: onBlurProp,
      onKeyDown: onKeyDownProp,
      'aria-label': ariaLabelProp,
      'aria-labelledby': ariaLabelledByProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    const fieldCtx = useFieldContext()
    const size = useResolvedFieldSize(sizeProp)  // B 組 cascade fix:<Field size>/cell surface-size 對 DatePicker 生效
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="view"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const emptyDisplay = useFieldEmptyDisplay()
    const variant: FieldVariantInternal = useResolvedFieldVariant(variantProp)
    const isEditable = resolvedMode === 'edit'
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const needConfirm = needConfirmProp ?? showTime  // datetime 預設需確認
    // 日曆面週起始日:有傳 weekStartsOn 就用,沒傳由 locale 推(語系 → CLDR;lib/date-locale.ts,date-picker.spec.md「週起始日」)
    const resolvedWeekStartsOn = React.useMemo(() => resolveWeekStartsOn(locale, weekStartsOn), [locale, weekStartsOn])
    const [open, setOpenState] = React.useState(defaultOpen)
    const setOpen = React.useCallback((next: boolean) => { setOpenState(next); onOpenChange?.(next) }, [onOpenChange])
    // Radix Popover 的預設 contentId 在 content 未掛載時仍會留在 trigger。
    // DatePicker 改用穩定 ID，且只在 dialog 已掛載(open)時輸出 aria-controls，
    // 避免 closed state 的懸空 IDREF；typeable 模式則把關聯放到真正的 combobox input。
    const popupId = React.useId()
    const [draft, setDraft] = React.useState<string | null>(value ?? null)
    // showTime 面板的時間寫法:欄位寫法(resolveDateRangeFormatOptions,與欄位裡的字同一支)交給 Intl 讀回 12 / 24(TIME-12H-PANEL(定)2026-11-26)
    const timePanelFormat = React.useMemo(
      () => resolveTimePanelFormat(locale ?? DEFAULT_DATE_LOCALE, resolveDateRangeFormatOptions(true, showSeconds, formatOptions), showSeconds, getDateTimeFormatter),
      [locale, formatOptions, showSeconds],
    )
    // 空白提示字的時間段跟面板同一份 12 / 24:24 小時照舊「YYYY/MM/DD HH:MM」,12 小時 zh-TW「YYYY/MM/DD 上午/下午HH:MM」【AI 推導】
    // (時間段沿用改前不寫秒的寫法)
    const resolvedPlaceholder = placeholder ?? (showTime ? `YYYY/MM/DD ${timePlaceholder(timePanelFormat, false, getDateTimeFormatter)}` : 'YYYY/MM/DD')
    // a11y:role="combobox" 必須有 accessible name(aria-label / labelledby / fieldCtx label)
    const accessibleName = ariaLabelProp ?? (ariaLabelledByProp ? undefined : (fieldCtx?.id ? undefined : resolvedPlaceholder))

    // Sync draft from value:closed 期間恆跟隨 + open false→true 同步(避免 popover 開啟期間
    // value 改變 clobber user 的編輯)。
    // 2026-07-14 audit Dim 26(V4 state shadow):needConfirm trigger 讀 draft,原「只在 false→true
    // 同步」使 controlled value 於關閉期間更新後,trigger 仍顯示舊值直到再次開啟 —— 改為
    // 只要 open=false 就同步(與 range picker 分支 L83x 同款 canonical)。
    const lastOpenRef = React.useRef(open)
    React.useEffect(() => {
      if (!open || !lastOpenRef.current) setDraft(value ?? null)
      lastOpenRef.current = open
    }, [open, value])

    // Display value canonical(2026-05-02 fix):
    //   needConfirm=true(showTime 預設)→ trigger 讀 draft,user 點 calendar 看到 input 即時更新
    //   needConfirm=false → trigger 讀 value(committed,符合非確認流程)
    const displayValue = needConfirm ? draft : (value ?? null)
    const displayDate = React.useMemo(() => isoToDate(displayValue), [displayValue])
    const draftDate = React.useMemo(() => isoToDate(draft), [draft])
    const draftTime = isoToTimeParts(draft) ?? { hours: 0, minutes: 0, seconds: 0 }
    const showClear = clearable && (needConfirm ? draft : value) && isEditable

    const displayCommitted = formatDateOrDateTime(value, showTime, showSeconds, { formatOptions, locale })
    const displayLive = formatDateOrDateTime(displayValue, showTime, showSeconds, { formatOptions, locale })

    // Issue 10 typed input(2026-05-10):draft string + invalid flag + IME composition guard。
    const [inputDraft, setInputDraft] = React.useState<string>(displayLive)
    const [inputInvalid, setInputInvalid] = React.useState(false)
    // 只給 onBlur 用:組字中失焦不提交半截(失焦不是鍵盤事件,isImeComposing 判不了;鍵盤那一側走 isImeComposing)
    const composingRef = React.useRef(false)
    // 2026-09-07:記住浮層是**怎麼被打開的**。
    // 指標開啟 → 焦點留在輸入框(使用者正在用滑鼠,可能還想打字;日曆用點的即可)
    // 鍵盤開啟 → 焦點進日曆(否則鍵盤使用者 navigate 不了日期格,那是 W3C APG
    //            date-picker combobox 明文要求「focus moves into the dialog」的理由)
    // 兩條路各自成立,不是二選一 —— 這也是 user 2026-09-07 問同時出現是不是更好用的正解:
    // 好用的是**滑鼠那條**,鍵盤那條不能為了它犧牲可操作性。
    const openedByPointerRef = React.useRef(false)
    const typedInputRef = React.useRef<HTMLInputElement | null>(null)
    // 指標開啟時把焦點送回輸入框。
    // **不用 `onOpenAutoFocus` 攔截**:實測那個事件在本組合下根本沒被派發
    //(探針顯示 handler 從未執行,焦點卻仍被移到日曆內的按鈕),追 Radix 內部只會愈追愈深。
    // 這裡改成「開啟後下一幀把焦點要回來」—— 不依賴任何第三方內部行為,而且驗得到。
    React.useEffect(() => {
      if (!open || !typeable || !openedByPointerRef.current) return
      const id = requestAnimationFrame(() => typedInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }, [open, typeable])
    // Sync input draft from committed displayLive(value change from outside)— 不要在 user
    // 打字期間覆寫。透過 ref 比較:committed vs current draft 是否從相同 source。
    const lastDisplayLiveRef = React.useRef(displayLive)
    React.useEffect(() => {
      if (lastDisplayLiveRef.current !== displayLive) {
        setInputDraft(displayLive)
        setInputInvalid(false)
        lastDisplayLiveRef.current = displayLive
      }
    }, [displayLive])
    const handleInputCommit = React.useCallback((raw: string) => {
      const { iso, valid } = parseDateInput(raw, { allowTime: showTime, locale: locale ?? DEFAULT_DATE_LOCALE })
      if (!valid) { setInputInvalid(true); return }
      setInputInvalid(false)
      if (iso === null) {
        // empty input = clear value
        onChange?.('')
        setDraft(null)
      } else {
        onChange?.(iso)
        setDraft(iso)
      }
    }, [onChange, showTime, locale])

    // 截斷 tooltip(tooltip.spec.md:32 截斷 → 顯完整內容,僅實際截斷時):非 typeable edit
    // trigger 的值 span(bareInputStyles + truncate)是截斷元素;trigger = 整個 field wrapper
    // (interactive host,hover 直達)、量測內層值 span — useTruncated 自組 pattern
    // (truncated-text.spec.md「兩層架構(對齊世界級聯集)」:trigger ≠ 量測元素時只用 hook 自組;範本 inline-edit.tsx:258)。
    // typeable 走 <input>(可捲動編輯,無截斷補救需求);popover 開啟時靜默(open 是 hover 之外的 reveal 路徑)。
    // ⚠️ hook 必在下方 view / readonly early return 之前(React #310 hook-count 鐵律,同 select.tsx 教訓)。
    const { ref: triggerTruncationRef, isTruncated: triggerTruncated } = useTruncated<HTMLSpanElement>({
      deps: [!typeable && displayValue ? displayLive : ''],
    })
    const triggerTooltipActive = !typeable && !!displayValue && triggerTruncated && !open
    // 觸發欄位(可打字時 = 包著輸入框的那一圈欄位)+ 它的日曆浮層 = 同一個欄位(lib/composite-field-focus.ts,待辦總帳 N83):
    // 焦點搬進日曆不算離開;從欄位離開、從日曆直接離開(開著點空白處 / 點下一格)都算,consumer 的 onBlur 只跑一次(2026-10-21 r1b fields F1:
    // 修前只掛在觸發欄位,從日曆直接離開時收不到 blur)。兩邊都掛:觸發欄位經 PopoverTrigger、日曆經 PopoverContent。hook 必在下方 early return 之前
    const fieldTriggerRef = React.useRef<HTMLButtonElement>(null) // 型別跟 PopoverTrigger(Radix Trigger 的 ref 型別);asChild 時拿到的是欄位的 div(同 select-menu-keyboard.ts triggerRef)
    const fieldFocus = useCompositeFieldBlur<React.FocusEvent<HTMLDivElement>>({
      onBlur: onBlurProp, popupId, triggerRef: fieldTriggerRef,
    })

    // mode='view'(Phase B2 2026-05-05):純內容輸出 — 對齊原 DatePickerDisplay sub-component(retired)。
    //   Default(showDisplayEndIcon=false):無 Field wrapper / 無 Calendar icon —— 裸 span(理由:檢視態只顯示值,見 prop docblock)。
    //   Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper + ItemSuffix Calendar,
    //   與 edit 同結構消除 cell view↔edit 像素偏移(Layer-B padding mismatch)。
    if (resolvedMode === 'view') {
      if (!showDisplayEndIcon) {
        // 2026-05-14 I2 fix(spec contract (e) view typography canonical):bare span 套
        // `fieldDisplayTextClass(size)`(sm/md→text-body,lg→text-body-lg)— 對齊 Field family 統一。
        if (!value) return <span className={cn(fieldDisplayTextClass(size), fieldEmptyColorClass(resolvedMode), className)}>{emptyDisplay}</span>
        // 截斷必附 tooltip(tooltip.spec.md:32)— 改消費 truncated-text primitive(同 input.tsx:198 同型修)
        return <TruncatedText className={cn(fieldDisplayTextClass(size), className)}>{displayCommitted}</TruncatedText>
      }
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'view', variant, width: fieldWidthVariant(width), size }), className)}
          style={fieldWidthStyle(width)}
          data-field-mode="view"
        >
          {/* 截斷必附 tooltip(tooltip.spec.md:32;data-table.spec.md「十一、Cell 單行截斷原則」view 態元件自管 truncation) */}
          <TruncatedText className={cn(bareInputStyles, 'flex-1 min-w-0', !value && fieldEmptyColorClass(resolvedMode))}>
            {value ? displayCommitted : emptyDisplay}
          </TruncatedText>
          <ItemSuffix className="pointer-events-none">
            <CalendarIcon size={iconSize} className="text-fg-muted" aria-hidden />
          </ItemSuffix>
        </div>
      )
    }

    // readonly / disabled(唯讀 = 可 Tab、不可開,field-controls.spec.md「Focus 行為」readonly 那段)
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: variant, width: fieldWidthVariant(width), size }), className)}
          data-field-mode={resolvedMode}
          aria-disabled={resolvedMode === 'disabled' ? true : undefined}
          {...readonlyTabStopProps(resolvedMode, 'combobox', { ariaLabel: accessibleName, labelledBy: ariaLabelledByProp ?? fieldCtx?.labelId })}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
          style={fieldWidthStyle(width, props.style)}
        >
          {/* 截斷必附 tooltip(tooltip.spec.md:32)— readonly/disabled 無編輯入口,tooltip 是唯一補救路徑(同 Range readonly 分支同型) */}
          <TruncatedText className={cn('flex-1', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {value
              ? displayCommitted
              : <span className={fieldEmptyColorClass(resolvedMode)}>{emptyDisplay}</span>
            }
          </TruncatedText>
          {/* 2026-06-26 類型身份 indicator:edit 顯示 / readonly 不顯示(純值、不可開) / disabled 保留(fg-disabled,對齊原生 <select disabled>);
              naked cell 依 showDisplayEndIcon=isEditable(維持 2026-05-10 cell canonical「非可編欄不顯」)*/}
          {(variant === 'naked' ? showDisplayEndIcon : resolvedMode === 'disabled') && (
            <ItemSuffix className="pointer-events-none">
              <CalendarIcon size={iconSize} className={resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'} aria-hidden />
            </ItemSuffix>
          )}
        </div>
      )
    }

    const triggerText = displayValue
      ? displayLive
      : <span className="text-fg-muted">{resolvedPlaceholder}</span>

    const commitDraft = (next: string | null) => {
      if (needConfirm) setDraft(next)
      else onChange?.(next ?? '')
    }
    const handleConfirm = () => { onChange?.(draft ?? ''); setOpen(false) }
    const handleNow = () => {
      const now = showTime ? nowIsoDateTime() : dateToIso(new Date())
      commitDraft(now)
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        {/* 截斷 tooltip:恆 wrap(truncated-text.spec.md always-wrap),未截斷或 popover 開啟時
            open={false} 靜默。TooltipTrigger 放最內側(緊貼 div):PopoverTrigger 注入的
            data-state 在 TooltipTrigger 內以 triggerProps 後 spread 勝出;反序會被 tooltip 的 data-state 蓋掉。
            (外框「開著 = 聚焦的框」不靠 data-state,認欄位自己的 `data-field-open`,見下方外框上的 fieldOpenProps。) */}
        <Tooltip open={triggerTooltipActive ? undefined : false}>
          <PopoverTrigger asChild type={undefined} ref={fieldTriggerRef} {...fieldFocus.trigger}>
            <TooltipTrigger asChild>
              <div
                ref={ref}
                // a11y(2026-07-14 dim-10 修):typeable 模式 combobox 語意(name / state / 鍵盤)
                // 集中在內層 <input>(APG editable-combobox idiom)— 外層 div 移除 role / tabIndex
                // / aria-*,否則形成「關掉鍵盤 handler 的假 combobox tab stop」+ 內層 input 變成
                // 第二個未命名 tab stop(雙重焦點站)。非 typeable 維持原 div-as-combobox canonical。
                id={typeable ? undefined : (idProp ?? fieldCtx?.id)}
                role={typeable ? undefined : 'combobox'}
                tabIndex={typeable ? undefined : (disabled ? -1 : 0)}
                aria-disabled={typeable ? undefined : (disabled || undefined)}
                aria-label={typeable ? undefined : accessibleName}
                aria-labelledby={typeable ? undefined : (ariaLabelledByProp ?? fieldCtx?.labelId)}
                aria-invalid={typeable ? undefined : (error || undefined)}
                aria-required={typeable ? undefined : (fieldCtx?.required || undefined)}
                aria-describedby={typeable ? undefined : (ariaDescribedByProp ?? fieldCtx?.descriptionId)}
                aria-errormessage={typeable ? undefined : (ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined))}
                aria-haspopup={typeable ? undefined : 'dialog'}
                aria-expanded={typeable ? undefined : open}
                aria-controls={typeable || !open ? undefined : popupId}
                data-field-mode="edit"
                data-error={error ? '' : undefined}
                className={cn(
                  fieldWrapperStyles({ mode: 'edit', variant: variant, width: fieldWidthVariant(width), size, error }),
                  'text-left cursor-pointer',
                  // @focus-suppress B — B Field 家族輸入控件;承擔者:欄位邊框轉 primary(field-wrapper.tsx#fieldDefaultChromeCompounds)
                  'focus-visible:outline-none',
                  className,
                )}
                // consumer 的 data-* / id 等先 spread;元件自己的 handler 列在後面、在 handler 內先呼叫 consumer 的
                // (2026-10-01 前 `{...props}` 在後 → `useFormValidation` getInputProps 帶來的 onKeyDown 整支蓋掉元件的,鍵盤打不開日曆)
                {...props}
                style={fieldWidthStyle(width, props.style)}
                // 表單欄位名稱掛在可聚焦的那一個(規則 8 以 name 定位、聚焦):不可打字時是這個觸發欄位(tabIndex 0)
                // 轉型:div 的型別沒有 name(規則 8 = form-validation.spec.md;68d7860d 加,2026-10-14 複查)
                {...(!typeable && name ? ({ name } as unknown as React.HTMLAttributes<HTMLDivElement>) : null)}
                // 「自己的浮層開著」的記號(外框維持聚焦的樣子):外框自己掛、寫在 `{...props}` 之後(lib/composite-field-focus.ts 檔頭「誰掛記號」)
                {...fieldOpenProps(open)}
                // Radix PopoverTrigger 只 compose onClick(onOpenToggle),`<div>` trigger 無
                // native Enter/Space→click → 自建 onKeyDown 開 popover(對齊 select.tsx desktop
                // trigger canonical:Enter/Space → 開;Esc → 關)。typeable 模式不攔 — 內層
                // <input> 自有 Enter/Esc 語意(commit / reset draft),Calendar icon click 開
                // popover(Material/Ant typed-date idiom),避免 div 層 keydown 與 input 衝突。
                onKeyDown={typeable ? undefined : (e) => {
                  // consumer 先跑(getInputProps 的 Esc 回復:只在這一下歸它時,lib/overlay-escape.ts),擋了預設就不走元件的
                  onKeyDownProp?.(e)
                  if (e.defaultPrevented) return
                  // 事件來自欄位裡的按鈕(「清除日期」)時照按鈕自己的行為走 —— 否則下面的 preventDefault 取消按鈕的啟動、
                  // 反而打開日曆,鍵盤永遠清不掉(2026-09-30 實測 Enter / 空白都是;Select / Combobox / TimePicker 2026-07-14 已修同一條,本檔漏了)
                  if (e.target !== e.currentTarget && (e.target as HTMLElement).closest?.('button')) return
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) }
                  if (e.key === 'Escape') setOpen(false)
                }}
              >
                {typeable ? (
                  // Issue 10 typed input(2026-05-10):real `<input>` 接 user 鍵盤打字。
                  // 2026-09-07 訂正:原本這裡寫「Click 在 input 上不 propagate…Calendar icon 點才開
                  // popover(Material/**Ant** typed-date idiom)」—— **對 Ant 而言是反的**。
                  // Ant Design 官方文件逐字:「By clicking the input box, you can select a date from a
                  // popup calendar」,且 `inputReadOnly` 預設 false(可同時打字)。
                  // 現行:點欄位任何地方都開,焦點留在輸入框(見上方 openedByPointerRef)。
                  // a11y(2026-07-14 dim-10 修):input 持完整 combobox 語意(id/name/state,APG
                  // editable-combobox)— 外層 div 已讓位(見上方 role/tabIndex 註解);ArrowDown
                  // 開 popover 補鍵盤開啟路徑(原僅 icon click 可開,鍵盤 user 無入口)。
                  <input
                    ref={typedInputRef}
                    type="text"
                    id={idProp ?? fieldCtx?.id}
                    name={name}
                    role="combobox"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? popupId : undefined}
                    aria-label={accessibleName}
                    aria-labelledby={ariaLabelledByProp ?? fieldCtx?.labelId}
                    aria-required={fieldCtx?.required || undefined}
                    aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
                    aria-errormessage={ariaErrorMessageProp ?? ((inputInvalid || error) ? fieldCtx?.errorId : undefined)}
                    disabled={disabled}
                    className={cn(bareInputStyles, 'truncate', !inputDraft && 'placeholder:text-fg-muted')}
                    value={inputDraft}
                    placeholder={resolvedPlaceholder}
                    aria-invalid={inputInvalid || error || undefined}
                    onChange={(e) => { setInputDraft(e.target.value); setInputInvalid(false) }}
                    onCompositionStart={() => { composingRef.current = true }}
                    onCompositionEnd={() => { composingRef.current = false }}
                    // Esc 層(keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」):草稿 ≠ 顯示值、或格式錯時,這一下 Esc 歸輸入框還原草稿;
                    // 放在 Dialog 裡第一下只還原草稿、不關對話框。日曆開著時日曆才是最內層(它在這個欄位外面,守門不留)→ 只關日曆、草稿不動
                    {...escapeLayerProps(inputDraft !== displayLive || inputInvalid)}
                    onKeyDown={(e) => {
                      // 輸入法選字的 Enter / Esc / ↓ 不提交、不還原、不開日曆(判準 lib/ime-composition.ts,全 DS 一支;2026-09-30 前這裡
                      // 只看 compositionstart/end 的 ref —— Safari 注音按 Enter 選字時 compositionend 先到,那一下 Enter 被當成提交)
                      if (isImeComposing(e)) return
                      // 自己的草稿是同一個 `<input>` 上更內層的那一層:Esc 先歸它(consumer 那一層 —— 表單的回復 —— 下一下才輪到);
                      // 這一下已被 Radix 用來關日曆就不還原(一下只少一層;2026-10-01 前同一下又關日曆又還原草稿)。
                      // 草稿乾淨時只「看」這一下還在不在、不認領(isEscapeTakenElsewhere):要不要處理是 consumer 的事 —— 在這裡認領了,
                      // consumer 若沒處理,浮層守門的「沒人認領就照常關」也被擋掉(lib/overlay-escape.ts 檔頭「宣告 ≠ 處理」)
                      if (e.key === 'Escape') {
                        if (inputDraft !== displayLive || inputInvalid) {
                          if (!isEscapeForControl(e)) return
                          setInputDraft(displayLive); setInputInvalid(false); e.preventDefault(); return
                        }
                        if (isEscapeTakenElsewhere(e)) return
                      }
                      // 其餘鍵 consumer 先跑、擋了預設就不走元件的(2026-10-01 前 `{...props}` 在外層 div,consumer 的 onKeyDown 到不了輸入框)
                      onKeyDownProp?.(e)
                      if (e.defaultPrevented) return
                      if (e.key === 'Enter') { e.preventDefault(); handleInputCommit(inputDraft) }
                      if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openedByPointerRef.current = false; setOpen(true) }
                    }}
                    // 失焦提交草稿;consumer 的 onBlur 由外層欄位的 PopoverTrigger 轉(輸入框 + 日曆浮層 = 同一個欄位,見上方 fieldFocus),排在提交之後
                    onBlur={() => { if (!composingRef.current) handleInputCommit(inputDraft) }}
                    // 2026-09-07(user 問點下去為何不是直接開日曆同時可以打字):
                    // 原本這裡 `stopPropagation` 把點擊吞掉,所以只有點到圖示那一小塊才會開。
                    // Ant Design 官方文件逐字:「By clicking the input box, you can select a date
                    // from a popup calendar」,而且 `inputReadOnly` 預設 false(可同時打字)——
                    // 我們原本註解寫「Calendar icon 仍 click 開 popover(Material/**Ant** idiom)」
                    // 對 Ant 而言是**反的**。現在點欄位任何地方都開,焦點留在輸入框。
                    onPointerDown={() => { openedByPointerRef.current = true }}
                  />
                ) : (
                  // ref = 截斷量測點(值 span 是截斷元素;tooltip trigger 在外層 host div,見 triggerTruncationRef 註解)
                  <span ref={triggerTruncationRef} className={cn(bareInputStyles, 'truncate', !displayValue && 'text-fg-muted')}>
                    {triggerText}
                  </span>
                )}
                {showClear && (
                  <FieldClearButton
                    size={size ?? 'md'}
                    label="清除日期" // i18n-allow: DS default inline-action label
                    stopPropagation
                    // 按鈕隨清空卸載:焦點在它身上先交回欄位(可打字 → 輸入框;否則觸發欄位),不掉到 body
                    //(Field 共用的 × ../Field/field-clear-button.tsx,交接 = field-wrapper.tsx keepFieldFocusBeforeUnmount)
                    focusOwner={(button) => typedInputRef.current ?? button.closest<HTMLElement>('[role="combobox"]')}
                    // Clear = 立刻 commit + 同步 draft(對齊 user 體感 / Ant trigger X 慣例)
                    // 不走 needConfirm「等確定」語義 — X 在 trigger 上是 standard clear affordance,
                    // 應立刻清空。dual-state 必同步:value('') + draft(null),否則 popover 開
                    // 著時 displayValue=draft 仍顯示舊值(see line 318: displayValue = needConfirm ? draft : value)。
                    onClear={() => {
                      onChange?.('')
                      setDraft(null)
                    }}
                  />
                )}
                <ItemSuffix className="pointer-events-none">
                  <CalendarIcon size={iconSize} className="text-fg-muted" aria-hidden />
                </ItemSuffix>
              </div>
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent>{triggerTooltipActive ? displayLive : null}</TooltipContent>
        </Tooltip>
        <PopoverContent
          id={popupId}
          {...fieldFocus.popup}
          className="w-auto p-0"
          align="start"
          aria-label="日期選擇" // i18n-allow: DS default dialog label
          // 可打字時觸發點(外層 div)不可聚焦,Radix 關閉時還給它 = 什麼都沒還 → 鍵盤開日曆(焦點進日曆)再按 Esc 收起,焦點掉到 body
          //(2026-10-01 實測;Range 同型早已自接,見下方 RangeDatePicker)。改還給輸入框 —— 全 DS 一支 lib/overlay-focus-return.ts:
          // 鍵盤收起 / 在日曆裡挑日期 → 回輸入框(指標挑的不畫鍵盤框);點外面收起不搶;焦點已被別處接走不搶。不可打字時觸發欄位本身可聚焦,照 Radix 原樣
          // 關掉的那一下補量欄位的 blur(fieldFocus.popupClosed):排在還焦點之後
          onCloseAutoFocus={(e) => { if (typeable) returnFocusToOpener(e, typedInputRef.current, { noTrigger: true }); fieldFocus.popupClosed() }}
        >
          {/* a11y(2026-07-14 dim-10 修):Radix PopoverContent 自帶 role="dialog"(popover.tsx#PopoverContent)
              — 內層 div 原本重複 role="dialog" 形成雙層 nested unnamed dialog,改為純 layout div,
              accessible name 收斂到外層 PopoverContent aria-label(單一 dialog 層)。
              2026-05-06 v9.1:`flex flex-col flex-1 min-h-0` 完成 M25 chain — viewport
              壓縮時 dialog 縮 + 內 calendar/footer 排序;原無 chain 致 calendar 末行被
              overflow-hidden 切掉、footer 推出 popover(user 回報位置改變就壞掉的根因)。 */}
          <div className="flex flex-col flex-1 min-h-0">
            {/* Calendar 區包 ScrollArea(2026-08-12 自 raw overflow-y-auto 遷移,跨 OS 一致 overlay 捲軸;M25 chain 由 flex-1 min-h-0 照傳):viewport 壓縮時 calendar 內滾(Material / Carbon
                date picker idiom)。footer 永遠 in-view(SurfaceFooter shrink-0)。 */}
            <ScrollArea className="flex-1 min-h-0">
              <CalendarTimeContainer
                showTime={showTime}
                showSeconds={showSeconds}
                panelFormat={timePanelFormat}
                calendar={
                  <DateGrid
                    mode="single"
                    weekStartsOn={resolvedWeekStartsOn}
                    selected={displayDate}
                    onSelect={(date) => {
                      if (!date) return
                      if (showTime) {
                        commitDraft(combineDateAndTime(date, draftTime))
                      } else {
                        commitDraft(dateToIso(date))
                        if (!needConfirm) setOpen(false)
                      }
                    }}
                    defaultMonth={displayDate ?? undefined}
                    autoFocus
                  />
                }
                timePanel={
                  <TimePickerSidePanel
                    value={draftTime}
                    onChange={(time) => {
                      const target = draftDate ?? new Date()
                      commitDraft(combineDateAndTime(target, time))
                    }}
                    showSeconds={showSeconds}
                    minuteStep={minuteStep}
                    secondStep={secondStep}
                    panelFormat={timePanelFormat}
                  />
                }
              />
            </ScrollArea>
            {(showTime || needConfirm) && (
              // Footer:消費 SurfaceFooter SSOT(border-t + py-tight;左右內距不覆寫 = 預設 loose 16px,
              // 對齊的是第一個日期格左緣(DateGrid p-3 12 + border-spacing-1 4 = 16),實測差 0。
              // 判準 owner:patterns/overlay-surface/overlay-surface.spec.md「要對齊誰」;
              // ⚠️ 兩個 16 是不相干的字面值剛好相等,改 DateGrid p-3 時 footer 不會跟著動,
              // 不再 hand-coded p-2 / Separator / ml-auto wrapper 三層垃圾)。
              // 「此刻」加 mr-auto 把後面 button 推右(對齊 Ant `marginInlineStart: auto` on OK)。
              // 2026-07-05 D4:gate 由 `showTime` 改 `(showTime || needConfirm)` 對齊 Range(:1068)—
              // date-only `needConfirm` 時 onSelect 只寫 draft 且不關 popover,footer「確定」是唯一
              // commit 路徑,原 gate 漏渲 footer = draft 永遠無法 commit 的死路。
              <SurfaceFooter className="px-[var(--item-px,var(--field-px))]">
                <Button variant="tertiary" size="sm" onClick={handleNow} className="mr-auto">此刻</Button>
                {needConfirm ? (
                  <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!draft}>確定</Button>
                ) : (
                  <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
                )}
              </SurfaceFooter>
            )}
          </div>
        </PopoverContent>
      </Popover>
    )
  }
)
DatePicker.displayName = 'DatePicker'

// ── DatePickerRange ─────────────────────────────────────────────────────────
//
// Canonical 2026-05-02 v4 — 全對齊 Ant Design RangePicker(WebFetch 實證):
//
// **showTime Range**(rc-picker `multiplePanel = false` 證實):
//   - **1 calendar + 1 time panel**(等同 single DateTimePicker layout)
//   - 沒 range track 視覺(計算上跟 single 一樣)
//   - footer **無「此刻」按鈕**(rc-picker `showNow={multiple ? false : showNow}` 證實)
//   - Click flow:click input → open popup for activeEnd → 編 → 點「確定」commit activeEnd
//     → if start: switch activeEnd='end' + popup 維持 open;if end: close popup
//   - Cell disable(rc-picker useRangeDisabledDate 證實):
//     activeEnd='end' + start 已選 → date < start disabled
//     activeEnd='start' + end 已選 → date > end disabled
//
// **date-only Range**(rc-picker `multiplePanel = true`):
//   - **2 calendars 並列**(showTime=false 時)
//   - Full range track 視覺(start / middle / end)
//   - 走原 RDP mode='range' 配對 click 邏輯 + auto-swap
//
// **Trigger**:2 input button,作用端那條線壓在欄位框的下邊上(見下方 RANGE_END_BAR_CLASS)

// 起訖兩顆按鈕裡的文字:**只裁水平**(長日期照樣「…」截斷),垂直不裁 —— 作用端那條線從文字往下伸到欄位框外緣(見下方),
// 雙軸裁切(`truncate`)會把它整條裁掉(2026-11-17 A50 是同一類:當時文字底線的下半被裁、2px 只畫出 1px)。
// 同一招與理由見 combobox.tsx `tagRowOverflowClass`:`clip` 不建捲動容器;**不可**改成 overflow-x-hidden(另一軸會算成 auto,變得可捲)。
// 截斷提示(useTruncated 量 scrollWidth > clientWidth)在 `overflow-x: clip` 下照常量得到。
// 文字段**不撐滿按鈕**(按鈕是 flex、文字段沒有 flex-1):文字段的寬 = 文字寬(放不下時 = 看得到的那一段),線長跟著它。
const RANGE_END_TEXT_CLASS = 'relative min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap'

// 作用端那條線(RANGE-FOCUS-BAR(定)2026-11-26;date-picker.spec.md「Active-end 機制」視覺指示):
//   · 壓在欄位框的下邊上 —— 線的下緣 = 框外緣、粗 2px,蓋住那一段 1px 框線,與框線合成一條(不是框線上方再一條)。
//     畫法照 Tabs 選中線(tabs.tsx `after:absolute … after:h-0.5`,tabs.spec.md「這兩條線視覺上必須是同一條」);
//     Ant RangePicker 的 active bar 同向:`bottom: -lineWidth`、`height: lineWidthBold`、`background: colorPrimary`
//     (https://github.com/ant-design/ant-design/blob/master/components/date-picker/style/index.ts 約 L272-L290)。
//   · 線長 = 該端文字寬(user 第四輪卡留言,逐字:「應該是甲，但是你的圖片的底線長度應該要等同於上方的時間吧？」)—— 掛在文字段上、左右貼齊文字段。
//   · 下緣位置 = 文字行盒下緣往下「欄位上下內距 + 框寬」:欄位高度固定、內容垂直置中,行盒下緣到框內緣正好是 `--field-control-py-*`
//     (uiSize.css 的定義就是 (欄位高 − 1lh) / 2 − 框寬;`lh` 在這條線自己身上解析 = 文字的行高),再加一條框寬就到框外緣。
//     全部讀 token,換尺寸 / 換密度都跟著走,不寫死 px。
//   · 顏色 = 框當下的顏色:外框掛 `--range-end-bar-color`(一般主色、欄位錯誤時紅,同 field-wrapper.tsx 聚焦 `!border-primary` / 錯誤 `border-error`
//     那兩個 token);作用端(面板開著那一端 / 鍵盤聚焦那一顆)才把它交給 `--range-end-bar`,其餘時候沒設 = 背景透明、看不到線。
//     高對比模式(forced-colors)下 background-color 會被強制換成底色(W3C css-color-adjust-1,只有系統色不換),
//     所以外框在該模式把 `--range-end-bar-color` 換成系統色 `Highlight`(框線在該模式由瀏覽器換成 CanvasText,線用 Highlight 才分得出作用端)。
//   閘:scripts/datepicker-range-active-underline-invariant.mjs(像素量:線下緣 = 框外緣、線長 = 文字寬、線色 = 框色)。
const RANGE_END_BAR_CLASS = 'after:absolute after:inset-x-0 after:h-0.5 after:bg-[color:var(--range-end-bar,transparent)]'
const RANGE_END_BAR_BOTTOM = {
  sm: 'after:bottom-[calc(-1*(var(--field-control-py-sm)_+_var(--field-border-width)))]',
  md: 'after:bottom-[calc(-1*(var(--field-control-py-md)_+_var(--field-border-width)))]',
  lg: 'after:bottom-[calc(-1*(var(--field-control-py-lg)_+_var(--field-border-width)))]',
} as const

export interface DatePickerRangeProps
  extends DateFormatOptions,
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      'value' | 'onChange' | 'placeholder' | 'defaultValue'
    > {
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  /** 寬度軸 — `fill` 填滿容器(default)/ `hug` 依內容收縮(value 寬 + slot 寬 + gap + 內 padding)/ 數字 = 固定寬(px,
   *  窄容器裡不超出容器);chrome 與互動不變。SSOT → field-controls.spec.md「寬度軸(width: fill / hug)」。 */
  width?: FieldWidth
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** 區間值:[start ISO, end ISO]。任一 null 代表尚未選。 */
  value?: [string | null, string | null] | null
  onChange?: (value: [string | null, string | null]) => void
  /** Placeholder:[start placeholder, end placeholder] */
  placeholder?: [string, string]
  className?: string
  disabled?: boolean
  clearable?: boolean
  /** 啟用時間欄位 — value 兩端皆變 ISO datetime */
  showTime?: boolean
  showSeconds?: boolean
  minuteStep?: TimeStep
  secondStep?: TimeStep
  needConfirm?: boolean
  /** 日曆面一週從哪天開始(0 = 週日 … 6 = 週六);沒傳 = 由 `locale` 推。同單日 DatePicker 的 `weekStartsOn`。 */
  weekStartsOn?: WeekStartsOn
  /**
   * 檢視模式(`mode="view"`)把區間寫成一段文字,用標準 `Intl.DateTimeFormat.prototype.formatRange`:同一天自動合併
   * (`2026/07/15 上午10:00至11:00`)、跨日寫兩端(`2026/07/15至2026/07/17`)、起訖相同只寫一個值。預設 `false` = 起 → 終兩段各自格式化。
   * 日期一律兩位數月日(ICU 在區間丟掉的零補回)、時間 12 / 24 跟語系(DATE-TIME(定)2026-11-26)。
   * 只管 view;edit / readonly / disabled 仍是兩段(兩端各是一個欄位值)。只有一端有值等合併不了時照兩段版面,每一端的日期寫法與合併時相同。
   * 結束日照舊是「含」,不做全天換算。日期寫法與判定表 → date-picker.spec.md「區間檢視合併(formatRange)」。
   */
  formatRange?: boolean
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DatePickerRange = React.forwardRef<HTMLDivElement, DatePickerRangeProps>(
  (
    {
      mode,
      variant: variantProp,
      width,
      error: errorProp = false,
      size: sizeProp,
      value,
      onChange,
      placeholder,
      className,
      disabled: disabledProp,
      clearable = false,
      formatOptions,
      locale,
      showTime = false,
      showSeconds = false,
      minuteStep = 1,
      secondStep = 1,
      needConfirm: needConfirmProp,
      weekStartsOn,
      formatRange = false,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref,
  ) => {
    const fieldCtx = useFieldContext()
    const size = useResolvedFieldSize(sizeProp)  // B 組 cascade fix:<Field size>/cell surface-size 對 DatePicker 生效
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="view"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const emptyDisplay = useFieldEmptyDisplay()
    const variant: FieldVariantInternal = useResolvedFieldVariant(variantProp)
    const isEditable = resolvedMode === 'edit'
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const needConfirm = needConfirmProp ?? showTime
    // 日曆面週起始日:同單日 DatePicker(date-picker.spec.md「週起始日」)
    const resolvedWeekStartsOn = React.useMemo(() => resolveWeekStartsOn(locale, weekStartsOn), [locale, weekStartsOn])
    const resolvedPlaceholder: [string, string] = placeholder ?? (
      showTime ? ['Start date time', 'End date time'] : ['Start date', 'End date'] // i18n-allow: DS default; consumer override via placeholder prop
    )
    // showTime 面板的時間寫法:同單日 DatePicker(TIME-12H-PANEL(定)2026-11-26;與欄位裡的字同一份判斷)
    const timePanelFormat = React.useMemo(
      () => resolveTimePanelFormat(locale ?? DEFAULT_DATE_LOCALE, resolveDateRangeFormatOptions(true, showSeconds, formatOptions), showSeconds, getDateTimeFormatter),
      [locale, formatOptions, showSeconds],
    )

    const [open, setOpen] = React.useState(false)
    const [draft, setDraft] = React.useState<[string | null, string | null]>(value ?? [null, null])
    const [activeEnd, setActiveEnd] = React.useState<'start' | 'end'>('start')

    // 2026-07-05 D4 focus 回復:Range 只用 PopoverAnchor(start/end button 自行 onClick 開啟),
    // Radix triggerRef 恆 null → 內建 onCloseAutoFocus 的 triggerRef.focus() no-op 後又
    // preventDefault 掉 FocusScope fallback → Esc/確定/選完自動關閉後焦點掉到 document.body
    // (WCAG 2.4.3)。改由 PopoverContent 的 onCloseAutoFocus 回焦 active 端 button(對齊 Ant RangePicker);outside-click 關閉
    // 依 Radix non-modal 慣例不搶焦 —— 判斷住全 DS 一支 lib/overlay-focus-return.ts(2026-09-30 前本檔自己記 hasInteractedOutside)。
    const startBtnRef = React.useRef<HTMLButtonElement>(null)
    const endBtnRef = React.useRef<HTMLButtonElement>(null)

    // Draft sync canonical(2026-07-14 dim-26 V4 修,升級 2026-05-02 v3):
    // - open=false(關閉期間):controlled value 變更**必**同步 draft — needConfirm 顯示層讀
    //   draft(startIso/endIso),不同步會讓 trigger 持續顯示 stale 舊區間(外部 controlled
    //   update 被凍結)。關閉期間無編輯進行,直接鏡射無 clobber 風險。
    // - open=true(開啟期間):只在 false→true 轉換時 seed 一次;開啟中 value reference 變更
    //   不覆寫,保護 user 尚未確認的 draft 編輯(原 v3 canonical 保留)。
    const lastOpenRef = React.useRef(open)
    React.useEffect(() => {
      if (!open || !lastOpenRef.current) setDraft(value ?? [null, null])
      lastOpenRef.current = open
    }, [open, value])

    const startIso = (needConfirm ? draft[0] : value?.[0]) ?? null
    const endIso = (needConfirm ? draft[1] : value?.[1]) ?? null
    const startDate = React.useMemo(() => isoToDate(startIso), [startIso])
    const endDate = React.useMemo(() => isoToDate(endIso), [endIso])
    const hasValue = !!(value?.[0] || value?.[1])
    const showClear = clearable && hasValue && isEditable

    const startText = startIso
      ? formatDateOrDateTime(startIso, showTime, showSeconds, { formatOptions, locale })
      : resolvedPlaceholder[0]
    const endText = endIso
      ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale })
      : resolvedPlaceholder[1]

    // 截斷 tooltip(tooltip.spec.md:32 截斷 → 顯完整內容,僅實際截斷時):Range 兩端 edit
    // trigger button 各自截斷、各自量測顯示 — trigger = button 本體(interactive host,hover
    // 直達)、量測內層文字 span,useTruncated 自組 pattern(truncated-text.spec.md「trigger 需
    // 自控」指定解;範本 inline-edit.tsx:258)。popover 開啟時靜默;hook 必在 view / readonly
    // early return 之前(React #310 hook-count 鐵律,同 select.tsx 教訓)。
    const { ref: startTruncationRef, isTruncated: startTruncated } = useTruncated<HTMLSpanElement>({
      deps: [startIso ? startText : ''],
    })
    const { ref: endTruncationRef, isTruncated: endTruncated } = useTruncated<HTMLSpanElement>({
      deps: [endIso ? endText : ''],
    })
    const startTooltipActive = !!startIso && startTruncated && !open
    const endTooltipActive = !!endIso && endTruncated && !open

    const activeIso = activeEnd === 'start' ? startIso : endIso
    const activeDate = activeEnd === 'start' ? startDate : endDate
    const activeTime = isoToTimeParts(activeIso) ?? { hours: 0, minutes: 0, seconds: 0 }

    // Range visual modifiers(自管,不靠 RDP mode='range'):
    //   rangeStart:start 那天 → 圓底白字
    //   rangeEnd:end 那天 → 圓底白字
    //   rangeMiddle:start+1 ~ end-1 之間的所有天 → 灰底矩形 track
    const rangeModifiers = React.useMemo(() => {
      const mods: Record<string, Date | { from: Date; to: Date } | undefined> = {}
      if (startDate) mods.rangeStart = startDate
      if (endDate) mods.rangeEnd = endDate
      if (startDate && endDate) {
        const middleStart = addDays(startDate, 1)
        const middleEnd = addDays(endDate, -1)
        if (middleEnd >= middleStart) {
          mods.rangeMiddle = { from: middleStart, to: middleEnd }
        }
      }
      return mods
    }, [startDate, endDate])

    // ── 區間預覽(2026-09-23 user 拍板;規則表與原話見 date-picker.spec.md「區間預覽」)──
    // 停留日只有一個,**最後一個輸入贏**:滑鼠移進某格 → 它;鍵盤把看得見的焦點移到某格 → 它。
    // 清除只由同一種來源做(滑鼠離開只清滑鼠設的、blur 只清鍵盤設的):點某一天時 mousedown 會先把前一個焦點格 blur 掉,
    // 若 blur 也能清掉滑鼠剛設的停留日,框會在指標還停在格子上時消失。滑鼠離開格子時不是消失、而是退回仍帶著鍵盤焦點的那一天。
    // 第一版是「滑鼠恆優先」的兩個變數 —— 滑鼠停著不動、用方向鍵移焦點時框不跟著走(user 2026-09-23:
    // 「滑鼠和鍵盤沒有搶走彼此的焦點」)。
    // 焦點只在「看得見的焦點」時算(:focus-visible):浮層開啟時 autoFocus 是程式搬焦點,滑鼠使用者不會先看到整段框;
    // 鍵盤使用者用方向鍵移動時 :focus-visible 為真,框跟著焦點走(Q6)。
    // 判定本身是純函式(range-preview.ts),這裡只接線;showTime 一樣預覽(Q7),track 是否顯示另管。
    type PreviewAnchor = { day: Date; source: 'pointer' | 'keyboard' }
    const [previewAnchor, setPreviewAnchor] = React.useState<PreviewAnchor | null>(null)
    // 目前帶著看得見的鍵盤焦點的那一天:滑鼠離開格子時框退回這裡
    const keyboardDayRef = React.useRef<Date | null>(null)
    React.useEffect(() => {
      if (!open) { setPreviewAnchor(null); keyboardDayRef.current = null }
    }, [open])
    const previewFor = React.useCallback(
      (anchor: Date | null) => computeRangePreview({ activeEnd, start: startDate, end: endDate, anchor }),
      [activeEnd, startDate, endDate],
    )
    const previewModifiers = React.useMemo(
      () => ({
        // 上膛:這一天停留會有框 → 停留前就靜態壓掉它的單格 hover 圈(理由見 DateGrid RANGE_PREVIEW_ARMED_CLASSNAME)
        previewArmed: (day: Date) => previewFor(day) !== null,
        ...rangePreviewModifiers(previewFor(previewAnchor?.day ?? null)),
      }),
      [previewFor, previewAnchor],
    )

    const commitRange = (next: [string | null, string | null]) => {
      if (needConfirm) setDraft(next)
      else { onChange?.(next); setDraft(next) }
    }
    const setActive = (iso: string | null) => {
      const nextDraft = activeEnd === 'start'
        ? ([iso, draft[1]] as [string | null, string | null])
        : ([draft[0], iso] as [string | null, string | null])
      commitRange(nextDraft)
    }
    /**
     * Click「確定」canonical(2026-05-02 v4,對齊 Ant Design 序列流程):
     *   showTime Range:
     *     - activeEnd='start' → commit start to draft + switch activeEnd='end' + popup 維持 open
     *     - activeEnd='end'   → commit final draft to value + close popup
     *   date-only Range(沒有 footer,不會走這 path):— N/A
     */
    const handleConfirm = () => {
      if (showTime && activeEnd === 'start' && draft[0]) {
        // Start 已填 → switch to end,popup 維持 open
        setActiveEnd('end')
      } else {
        // End 也填好(or non-showTime needConfirm)→ final commit + close
        onChange?.(draft)
        setOpen(false)
      }
    }
    const handleNow = () => {
      setActive(showTime ? nowIsoDateTime() : dateToIso(new Date()))
    }
    // 按鈕隨清空卸載:焦點在它身上先交給起始日那顆鈕,不掉到 body(Field 共用的 × ../Field/field-clear-button.tsx 先交接再呼叫這支)。
    // Clear = 立刻 commit + 同步 draft(對齊 single mode + user 體感)
    // dual-state 同步,否則 popover 開著時 displayValue=draft 仍顯示舊 [start, end]
    const handleClearRange = () => {
      onChange?.([null, null])
      setDraft([null, null])
    }
    const openWithActive = (which: 'start' | 'end') => {
      setActiveEnd(which)
      setOpen(true)
    }
    /**
     * Cell disable(對齊 Ant rc-picker `useRangeDisabledDate`):
     *   activeEnd='end' + start 已選 → date < start 被 disable(同日 OK)
     *   activeEnd='start' + end 已選 → date > end 被 disable(同日 OK)
     * 防 user 點下違反順序的日期(start > end / end < start)。
     */
    const isOutOfRangeOrder = React.useCallback((date: Date): boolean => {
      // ⚠️ 必先 clone(new Date(...)),否則 setHours 會 mutate useMemo'd date 物件
      if (activeEnd === 'end' && startDate) {
        const startMidnight = new Date(startDate.getTime())
        startMidnight.setHours(0, 0, 0, 0)
        return date.getTime() < startMidnight.getTime()
      }
      if (activeEnd === 'start' && endDate) {
        const endEndOfDay = new Date(endDate.getTime())
        endEndOfDay.setHours(23, 59, 59, 999)
        return date.getTime() > endEndOfDay.getTime()
      }
      return false
    }, [activeEnd, startDate, endDate])

    // mode='view'(Phase B2 2026-05-05):純內容輸出 — 無 Field wrapper / 無 Calendar icon。
    if (resolvedMode === 'view') {
      const hasAny = !!(startIso || endIso)
      if (!hasAny) return <span className={cn(fieldEmptyColorClass(resolvedMode), className)}>{emptyDisplay}</span>
      // formatRange(選填,預設關):兩端都有值 → 一段文字(Intl formatRange:同一天合併、跨日寫兩端、起訖相同只寫一個值)。
      // 合併不了(一端空 / 解析不了 / 起點晚於終點 / showTime 但只有一端帶時間 / 環境沒有 formatRange)回 null → 照下方兩段版面,
      // 每一端仍用合併的同一套寫法(兩位數月日、時間跟語系;同一頁不會一列 07、一列 7)。
      // 判定住 range-format.ts(判定表 scripts/test-date-range-format.mjs),規則 date-picker.spec.md「區間檢視合併(formatRange)」
      const rangeTextOptions = {
        showTime,
        showSeconds,
        formatOptions,
        locale: locale ?? DEFAULT_DATE_LOCALE,
        getFormatter: getDateTimeFormatter,
      }
      const mergedText = formatRange
        ? formatDateRange({
            start: startDate,
            end: endDate,
            startHasTime: !!isoToTimeParts(startIso),
            endHasTime: !!isoToTimeParts(endIso),
            ...rangeTextOptions,
          })
        : null
      if (mergedText !== null) {
        return (
          <span className={cn('inline-flex items-center min-w-0', nakedCellRowModeAlign, className)}>
            {/* 截斷必附 tooltip(tooltip.spec.md:32)— 合併後只有一段,一個 TruncatedText */}
            <TruncatedText>{mergedText}</TruncatedText>
          </span>
        )
      }
      // 一端的文字:開了 formatRange → 合併的同一套寫法;沒開,或這一端解析不了(回 null)→ 照原本的兩段寫法
      const viewEndpointText = (iso: string, date: Date | undefined) =>
        (formatRange ? formatDateRangeEndpoint({ date, hasTime: !!isoToTimeParts(iso), ...rangeTextOptions }) : null)
        ?? formatDateOrDateTime(iso, showTime, showSeconds, { formatOptions, locale })
      return (
        <span className={cn('inline-flex items-center min-w-0', nakedCellRowModeAlign, className)}>
          {/* 截斷必附 tooltip(tooltip.spec.md:32)— start / end 各自獨立截斷、各自量測 */}
          <TruncatedText className={cn(!startIso && 'text-fg-muted')}>
            {startIso ? viewEndpointText(startIso, startDate) : resolvedPlaceholder[0]}
          </TruncatedText>
          <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
          <TruncatedText className={cn(!endIso && 'text-fg-muted')}>
            {endIso ? viewEndpointText(endIso, endDate) : resolvedPlaceholder[1]}
          </TruncatedText>
        </span>
      )
    }

    // readonly / disabled view — plain wrapper,no popover(唯讀 = 可 Tab、不可開,field-controls.spec.md「Focus 行為」readonly 那段)
    if (!isEditable) {
      return (
        <div
          ref={ref}
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: variant, width: fieldWidthVariant(width), size }), className)}
          data-field-mode={resolvedMode}
          aria-disabled={resolvedMode === 'disabled' ? true : undefined}
          {...readonlyTabStopProps(resolvedMode, 'combobox', { ariaLabel: (props as { 'aria-label'?: string })['aria-label'], labelledBy: fieldCtx?.labelId })}
          {...props}
          style={fieldWidthStyle(width, props.style)}
        >
          {/* 截斷必附 tooltip(tooltip.spec.md:32)— readonly/disabled 無編輯入口,tooltip 是唯一補救路徑 */}
          <TruncatedText className={cn('flex-1', !startIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {startIso ? formatDateOrDateTime(startIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[0]}
          </TruncatedText>
          <ArrowRight size={iconSize} className={cn('shrink-0 mx-2', resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted')} aria-hidden />
          <TruncatedText className={cn('flex-1', !endIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {endIso ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[1]}
          </TruncatedText>
          {/* 2026-06-26 類型身份 indicator:readonly 不顯示 / disabled 保留(fg-disabled)— 對齊單一 DatePicker(:488)+ SSOT;Range 無 naked-cell 變體故 gate = resolvedMode==='disabled' */}
          {resolvedMode === 'disabled' && (
            <ItemSuffix className="pointer-events-none">
              <CalendarIcon size={iconSize} className="text-fg-disabled" aria-hidden />
            </ItemSuffix>
          )}
        </div>
      )
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            aria-invalid={error || undefined}
            aria-required={fieldCtx?.required || undefined}
            aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
            aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', width: fieldWidthVariant(width), size, error }),
              // 外框本身就是點擊目標(下方 onMouseDown),點了會開面板 → 手形(hit-area-canonical.md 一-3);
              // 2026-09-27 前寫 `cursor-text`,但起訖是兩顆按鈕、不能打字,文字游標是錯的
              'cursor-pointer',
              // 作用端那條線的顏色 = 這圈框的顏色(見 RANGE_END_BAR_CLASS 註解)
              error ? '[--range-end-bar-color:var(--color-error)]' : '[--range-end-bar-color:var(--color-primary)]',
              // 高對比模式(forced-colors):背景色會被強制換成底色、線就消失(起訖兩顆又分不出焦點在哪一顆);換成系統色 Highlight 才畫得出來
              'forced-colors:[--range-end-bar-color:Highlight]',
              className,
            )}
            // 外框的內距與 1px 邊框底下沒有按鈕:指到那裡外框會亮(hover:border-border-hover),2026-09-27 前點下去
            // 什麼都不發生 = 「亮著卻點不到」(hit-area-canonical.md 一-1)。同家族 Select / Combobox / TimePicker /
            // PeoplePicker 的外框本身就是點擊目標(field-wrapper.tsx「點外框 = 點輸入處」註解),這裡補齊:
            // 點在外框裡、不是任何控件上 → 開離指標最近的那一段(起訖兩顆鈕中線為界)。規則與出處住 date-picker.spec.md「結構」段。
            // 用 mousedown + preventDefault 而非 click:click 之前焦點會先落到外框、再跳到按鈕,閃一下(同 field-wrapper.tsx 的理由)。
            onMouseDown={(e) => {
              if (e.button !== 0) return
              const target = e.target as HTMLElement
              if (target.closest('button, a, input, [role="button"]')) return
              const s = startBtnRef.current?.getBoundingClientRect()
              const en = endBtnRef.current?.getBoundingClientRect()
              const mid = s && en ? (s.right + en.left) / 2 : Number.POSITIVE_INFINITY
              const which = e.clientX <= mid ? 'start' : 'end'
              e.preventDefault()
              ;(which === 'start' ? startBtnRef : endBtnRef).current?.focus()
              openWithActive(which)
            }}
            {...props}
            style={fieldWidthStyle(width, props.style)}
            // 「自己的浮層開著」的記號(外框維持聚焦的樣子):外框自己掛、寫在 `{...props}` 之後(lib/composite-field-focus.ts 檔頭「誰掛記號」)
            {...fieldOpenProps(open)}
          >
            {/* 兩端截斷 tooltip:恆 wrap、未截斷 open={false} 靜默(truncated-text.spec.md
                always-wrap);TooltipTrigger asChild 只合併 handler / data-state 到 button,
                零多餘 DOM → wrapper flex 佈局不變。內層 span = 量測點(見 startTruncationRef 註解)。 */}
            <Tooltip open={startTooltipActive ? undefined : false}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  ref={startBtnRef}
                  onClick={() => openWithActive('start')}
                  data-active-end={open && activeEnd === 'start' ? 'true' : undefined}
                  aria-label={resolvedPlaceholder[0]}
                  aria-haspopup="dialog"
                  aria-expanded={open && activeEnd === 'start'}
                  className={cn(
                    bareInputStyles,
                    // `flex` + `overflow-visible`(蓋掉 bareInputStyles 的 truncate):按鈕本身不裁,截斷交給裡面的文字段(RANGE_END_TEXT_CLASS)——
                    // 作用端那條線從文字段往下伸到欄位框外緣,按鈕一裁就沒了;`flex` 讓文字段收成文字寬(線長 = 文字寬)。寬度仍由 bareInputStyles 的 min-w-0 收
                    // @focus-suppress C — button 不是 input 故無 caret;承擔者:外層欄位邊框 focus-within 轉 primary(field-wrapper.tsx#fieldDefaultChromeCompounds);起訖兩顆靠作用端那條線區分(見下一行)
                    'flex overflow-visible text-left cursor-pointer focus-visible:outline-none',
                    // 起訖兩顆共用同一圈欄位邊框,邊框分不出焦點在哪一顆,所以作用端另有一條線(畫在文字段上,RANGE_END_BAR_CLASS):
                    // 面板開著的那一端(data-active-end)與面板關著用 Tab 到的那一顆(focus-visible,2026-09-08 補)是同一條線,不是第二種指示。
                    'data-[active-end=true]:[--range-end-bar:var(--range-end-bar-color)] focus-visible:[--range-end-bar:var(--range-end-bar-color)]',
                    !startIso && 'text-fg-muted',
                  )}
                >
                  <span ref={startTruncationRef} className={cn(RANGE_END_TEXT_CLASS, RANGE_END_BAR_CLASS, RANGE_END_BAR_BOTTOM[size ?? 'md'])}>{startText}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{startTooltipActive ? startText : null}</TooltipContent>
            </Tooltip>
            <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
            <Tooltip open={endTooltipActive ? undefined : false}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  ref={endBtnRef}
                  onClick={() => openWithActive('end')}
                  data-active-end={open && activeEnd === 'end' ? 'true' : undefined}
                  aria-label={resolvedPlaceholder[1]}
                  aria-haspopup="dialog"
                  aria-expanded={open && activeEnd === 'end'}
                  className={cn(
                    bareInputStyles,
                    // `flex` + `overflow-visible`:同起始端那顆(按鈕不裁、文字段收成文字寬)
                    // @focus-suppress C — button 不是 input 故無 caret;承擔者:外層欄位邊框 focus-within 轉 primary(field-wrapper.tsx#fieldDefaultChromeCompounds);起訖兩顆靠作用端那條線區分(見下一行)
                    'flex overflow-visible text-left cursor-pointer focus-visible:outline-none',
                    // 起訖兩顆共用同一圈欄位邊框,邊框分不出焦點在哪一顆,所以作用端另有一條線(畫在文字段上,RANGE_END_BAR_CLASS):
                    // 面板開著的那一端(data-active-end)與面板關著用 Tab 到的那一顆(focus-visible,2026-09-08 補)是同一條線,不是第二種指示。
                    'data-[active-end=true]:[--range-end-bar:var(--range-end-bar-color)] focus-visible:[--range-end-bar:var(--range-end-bar-color)]',
                    !endIso && 'text-fg-muted',
                  )}
                >
                  <span ref={endTruncationRef} className={cn(RANGE_END_TEXT_CLASS, RANGE_END_BAR_CLASS, RANGE_END_BAR_BOTTOM[size ?? 'md'])}>{endText}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{endTooltipActive ? endText : null}</TooltipContent>
            </Tooltip>
            {showClear && (
              <FieldClearButton
                size={size ?? 'md'}
                label="清除日期區間" // i18n-allow: DS default inline-action label
                stopPropagation
                focusOwner={() => startBtnRef.current}
                onClear={handleClearRange}
              />
            )}
            <ItemSuffix className="pointer-events-none">
              <CalendarIcon size={iconSize} className="text-fg-muted" aria-hidden />
            </ItemSuffix>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          aria-label="日期區間選擇" // i18n-allow: DS default dialog label
          // 2026-07-05 D4 focus 回復(機制詳 startBtnRef 上方註解):Esc / 確定 / 選完自動關 → 回焦 active 端 button
          // (Anchor-only 時 Radix 內建的 triggerRef.focus() 恆 null no-op)— 對齊 Ant RangePicker 關閉後焦點回 active 端輸入格;
          // 點外面收起不搶。還法全 DS 一支(lib/overlay-focus-return.ts:沒有觸發點 + 非 modal;2026-09-30 前這裡自己記 hasInteractedOutside)
          onCloseAutoFocus={(e) => returnFocusToOpener(e, (activeEnd === 'start' ? startBtnRef : endBtnRef).current, { noTrigger: true })}
        >
          {/* a11y(2026-07-14 dim-10 修):accessible name 收斂到外層 PopoverContent(Radix 自帶
              role="dialog")— 原內層第二個 role="dialog" 移除,避免 nested dialog 且外層 dialog 無名。
              2026-05-06 v9.1 M25 chain — 同 single DatePicker 修法,viewport 壓縮 calendar 內滾 + footer 永遠 in-view */}
          <div className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="flex-1 min-h-0">
            <CalendarTimeContainer
              showTime={showTime}
              showSeconds={showSeconds}
              panelFormat={timePanelFormat}
              calendar={
                <DateGrid
                  weekStartsOn={resolvedWeekStartsOn}
                  // mode='single' + manual modifiers(canonical 2026-05-02 v3):
                  // 不用 RDP 內建 mode='range'(它的 click 配對邏輯跟我們的 activeEnd 衝突,
                  // 造成「點一次沒反應 / 要點兩次」bug)。改自管 modifiers 控視覺。
                  // showTime Range:rangeModifiers 為空(不顯示 range track,對齊 Ant)
                  mode="single"
                  selected={activeDate}
                  onSelect={(date) => {
                    if (!date) return
                    if (isOutOfRangeOrder(date)) return  // 防護:disable 邏輯內 click 已被 RDP 擋,但雙保險
                    const preservedTime = isoToTimeParts(activeEnd === 'start' ? draft[0] : draft[1]) ?? activeTime
                    const nextIso = showTime
                      ? combineDateAndTime(date, preservedTime)
                      : dateToIso(date)
                    const nextDraft: [string | null, string | null] = activeEnd === 'start'
                      ? [nextIso, draft[1]]
                      : [draft[0], nextIso]
                    commitRange(nextDraft)
                    // Auto-advance / close logic:
                    if (!showTime) {
                      // date-only Range:選完 start 自動切 end;兩端皆填 + 不需確認 → 關閉
                      if (activeEnd === 'start') {
                        setActiveEnd('end')
                        if (!needConfirm && nextDraft[0] && nextDraft[1]) setOpen(false)
                      } else if (!needConfirm && nextDraft[0] && nextDraft[1]) {
                        setOpen(false)
                      }
                    }
                    // showTime Range:不 auto-advance,讓 user 編 time 後手動按確定 commit
                    // (對齊 Ant 序列流程 — 確定 button 切 activeEnd)
                  }}
                  // showTime Range:不渲 range track(對齊 Ant — 整個 popup 等同 single
                  // DateTimePicker,沒 range 視覺概念);date-only Range 才顯示。
                  // 停留預覽框不分 showTime(user 2026-09-23 答 Q7:用同一套規則)。
                  modifiers={{ ...(showTime ? {} : rangeModifiers), ...previewModifiers }}
                  modifiersClassNames={{
                    // ── Range visual canonical(2026-05-03 v8 stadium pattern)──
                    // v5 修「白色破圖」用 pseudo 蓋全 cell 矩形,但新副作用:button 圓比矩形小,
                    // 4 corner triangle 區域 grey 凸出圓外(user 2026-05-03 抓到「凸出去」)。
                    // v8 對齊 Ant `cell-range-start::before { border-radius: 9999px 0 0 9999px }`:
                    // rangeStart pseudo 加 `rounded-l-full` → pseudo 變「左半圓 + 右矩形」stadium
                    // 左半圓 EXACTLY OVERLAY button 圓的左半弧(同 center 同 radius 14)→ 無縫
                    // 右側矩形 bridge 2px to middle → 跟 middle pseudo 連續
                    // Cell 的 top-left + bottom-left corner triangle:pseudo 不蓋 + button 不蓋 →
                    // popover white 顯露(乾淨 breathing)
                    rangeStart: cn(
                      // 2026-08-11 修偏移:!bg-primary 連 hover 也壓死 → 端點 hover 零回饋,違反
                      // date-grid.spec.md「選中日 hover 底色升階」(端點可再點
                      // 重選範圍 = 可取消家族,依 user 原則該有回饋)。補顯式 hover 升階(同 !important,
                      // hover 變體更特定故 hover 時勝出;ring-0 壓制照舊,spec:120)。
                      '[&>button]:!bg-primary [&>button]:hover:!bg-primary-hover [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                      // 藍底上的鍵盤焦點 = 1px 白線退 3px(同 DateGrid selected;端點不掛 RDP selected,要自己帶)
                      EMPHASIS_FOCUS_RING_CLASSNAME,
                      // track 的 stadium class 只住在 DateGrid(2026-09-23 收斂;先前這裡各抄一份 = 假 SSOT)
                      RANGE_TRACK_CLASSNAMES.start,
                    ),
                    rangeEnd: cn(
                      // 2026-08-11:同 rangeStart — 補 hover 升階(spec:121),鏡像。
                      '[&>button]:!bg-primary [&>button]:hover:!bg-primary-hover [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                      EMPHASIS_FOCUS_RING_CLASSNAME,
                      RANGE_TRACK_CLASSNAMES.end,
                    ),
                    rangeMiddle: cn(
                      RANGE_TRACK_CLASSNAMES.middle,
                      // 2026-09-23 拿掉 `!text-foreground`:它是 2026-04-21 為了壓過 RDP range 模式中段自帶的 selected 白字而加,
                      // 2026-05-03 改成 mode="single" 自管區間時原封抄來 —— 這條路徑的中段不掛 selected,!important 沒有任務,
                      // 卻讓鄰月淡字永遠輸給它(全 repo 從沒定義過 outside × range;兩月時鄰月現已不渲染)。字色回到 day_button 預設。
                      '[&>button]:!bg-transparent',
                    ),
                    // ── 停留預覽框(2026-09-23 user 拍板)── 四種格由 range-preview.ts 算出,畫法住在 DateGrid
                    previewArmed: RANGE_PREVIEW_ARMED_CLASSNAME,
                    previewSingle: RANGE_PREVIEW_CLASSNAMES.single,
                    previewStart: RANGE_PREVIEW_CLASSNAMES.start,
                    previewMiddle: RANGE_PREVIEW_CLASSNAMES.middle,
                    previewEnd: RANGE_PREVIEW_CLASSNAMES.end,
                  }}
                  // 停留來源:滑鼠與看得見的鍵盤焦點,最後一個輸入贏;各自只清自己設的(理由見上方 previewAnchor 註解)
                  onDayMouseEnter={(day) => setPreviewAnchor({ day, source: 'pointer' })}
                  onDayMouseLeave={() => setPreviewAnchor((prev) => {
                    if (prev?.source !== 'pointer') return prev
                    return keyboardDayRef.current ? { day: keyboardDayRef.current, source: 'keyboard' } : null
                  })}
                  onDayFocus={(day, _modifiers, event) => {
                    if (!event.currentTarget.matches(':focus-visible')) return
                    keyboardDayRef.current = day
                    setPreviewAnchor({ day, source: 'keyboard' })
                  }}
                  onDayBlur={() => {
                    keyboardDayRef.current = null
                    setPreviewAnchor((prev) => (prev?.source === 'keyboard' ? null : prev))
                  }}
                  // Cell disable:防 user 點下違反順序的日期(對齊 Ant useRangeDisabledDate)
                  disabled={isOutOfRangeOrder}
                  // showTime → 1 cal(對齊 Ant `multiplePanel=false`);date-only → 2 cal(`multiplePanel=true`)
                  numberOfMonths={showTime ? 1 : 2}
                  defaultMonth={activeDate ?? startDate ?? endDate ?? undefined}
                  autoFocus
                />
              }
              timePanel={
                <TimePickerSidePanel
                  value={activeTime}
                  onChange={(time) => {
                    const target = activeDate ?? new Date()
                    setActive(combineDateAndTime(target, time))
                  }}
                  showSeconds={showSeconds}
                  minuteStep={minuteStep}
                  secondStep={secondStep}
                  panelFormat={timePanelFormat}
                />
              }
            />
            </ScrollArea>
            {(showTime || needConfirm) && (
            // Footer 消費 SurfaceFooter SSOT(border-t + py-tight;左右內距不覆寫,理由見上方 764 行同款註解
            // 與 patterns/overlay-surface/overlay-surface.spec.md「要對齊誰」)。
            // showTime Range 無「此刻」(對齊 Ant `showNow={multiple ? false : showNow}`)→ 只有 確定 走 justify-end。
            // date-only Range needConfirm:左 此刻(mr-auto)+ 右 確定。
            <SurfaceFooter className="px-[var(--item-px,var(--field-px))]">
              {!showTime && (
                <Button variant="tertiary" size="sm" onClick={handleNow} className="mr-auto">此刻</Button>
              )}
              {needConfirm ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirm}
                  // showTime Range serial flow:start mode 只需 start filled;end mode 兩端皆 filled
                  disabled={
                    showTime
                      ? (activeEnd === 'start' ? !draft[0] : !draft[0] || !draft[1])
                      : !draft[0] || !draft[1]
                  }
                >
                  確定
                </Button>
              ) : (
                <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>關閉</Button>
              )}
            </SurfaceFooter>
          )}
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
DatePickerRange.displayName = 'DatePickerRange'

// Attach Range as namespace:consumer 用 <DatePicker.Range ...>(Ant-style)
// 走 Object.assign 確保 TS 型別帶上 Range 屬性,而非只做 runtime 附掛
const DatePickerWithRange = Object.assign(DatePicker, { Range: DatePickerRange })

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const datePickerMeta = {
  component: 'DatePicker',
  family: 4,
  variants: {

  },
  sizes: {

  },
  // 'selected' = range 帶持續選中(before:bg-neutral-selected,本檔自有);'active' 移除 — 全檔無按壓
  // 視覺(data-active-end 是定位 attr 非按壓 token;2026-07-07 詞彙統一 DS-wide 交叉掃補修)。
  states: ['default', 'hover', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-selected'],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export {
  DatePickerWithRange as DatePicker,
  DatePickerRange,
  formatDate,
}
