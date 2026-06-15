// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite(DatePicker single + Range + showTime + format/ISO helpers + TimePickerSidePanel sub-components),拆 sub-file 會 (a) 增 cross-file context binding 複雜度 (b) M21 過度抽象(每 helper 1 consumer)。等 inline filter UI 真接入第 2 consumer 再拆。
import * as React from 'react'
import { X, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, EMPTY_DISPLAY, nakedCellRowModeAlign, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { ItemInlineAction, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/design-system/components/Popover/popover'
import { DateGrid } from '@/design-system/components/DateGrid/date-grid'
import { Button } from '@/design-system/components/Button/button'
import { SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import {
  TimeColumns,
  isoToTimeParts,
  timePartsToString,
  type TimeParts,
  type TimeStep,
} from '@/design-system/components/TimePicker/time-columns'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

// ── Format ──────────────────────────────────────────────────────────────────

export interface DateFormatOptions {
  /** Intl.DateTimeFormat options（預設 { year: 'numeric', month: '2-digit', day: '2-digit' }） */
  formatOptions?: Intl.DateTimeFormatOptions
  /** locale（預設 'en-US'） */
  locale?: string
}

/**
 * Default format:**YYYY/MM/DD**(對齊 Ant Design 順序,year-first ISO-like)。
 * 棄 `en-US` `MM/DD/YYYY`(month-first 美式)— 美式順序在 international DS 反直覺
 * (跟 ISO date 視覺對不上,跟 sort 順序也對不上)。Ant / Material X / Apple HIG
 * 一致 year-first。Consumer 想自訂可傳 `formatOptions` + `locale`。
 */
function formatDate(
  value: string | number | Date,
  options: DateFormatOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  // 若 consumer 顯式傳 formatOptions / locale → 走 Intl.DateTimeFormat
  if (options.formatOptions || options.locale) {
    return new Intl.DateTimeFormat(options.locale ?? 'en-US', options.formatOptions ?? { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }
  // 預設:YYYY/MM/DD(直接組,locale-independent + 視覺穩定)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

/** 顯示用:date 或 datetime,根據 showTime / showSeconds 切換 */
function formatDateOrDateTime(
  iso: string | null | undefined,
  showTime: boolean,
  showSeconds: boolean,
  options: DateFormatOptions = {},
): string {
  if (!iso) return ''
  const dateText = formatDate(iso, options)
  if (!showTime) return dateText
  const time = isoToTimeParts(iso)
  if (!time) return dateText
  return `${dateText} ${timePartsToString(time, showSeconds)}`
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
 *   - `YYYY-MM-DD` / `YYYY/MM/DD` / `YYYY.MM.DD`(ISO + 慣例 separator)
 *   - `MM/DD/YYYY` / `MM-DD-YYYY`(US locale)
 *   - `DD/MM/YYYY` / `DD-MM-YYYY`(EU locale)
 *   - `YYYY-MM-DD HH:MM[:SS]` / `YYYY-MM-DDTHH:MM[:SS]`(datetime,showTime 才接)
 *   - native `Date.parse()` fallback(handle 'Mar 12 2025' 等英文 RFC)
 *
 * Return:`{ iso, valid }`。Invalid → `valid=false` + `iso=null`,UI 顯 aria-invalid。
 * Partial input(打到一半)→ valid=false 但不顯 error UI(consumer 用 onBlur / Enter 才檢驗)。
 *
 * 對齊 Material X-DatePicker `formats` parser + Ant DatePicker `format` array + dayjs.parse。
 */
function parseDateInput(input: string, opts: { allowTime: boolean }): { iso: string | null; valid: boolean } {
  const trimmed = input.trim()
  if (trimmed === '') return { iso: null, valid: true }  // empty = no value, OK
  // 1. ISO date YYYY-MM-DD or with separators / . /(可選 time YYYY-MM-DD[T| ]HH:MM[:SS])
  const isoDateMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (isoDateMatch) {
    const [, y, m, d, hh, mm, ss] = isoDateMatch
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0))
    if (isNaN(date.getTime()) || date.getMonth() !== Number(m) - 1) return { iso: null, valid: false }
    const datePart = dateToIso(date)
    if (hh != null && opts.allowTime) {
      const h2 = String(Number(hh)).padStart(2, '0')
      const m2 = String(Number(mm)).padStart(2, '0')
      const s2 = String(Number(ss ?? 0)).padStart(2, '0')
      return { iso: `${datePart}T${h2}:${m2}:${s2}`, valid: true }
    }
    return { iso: datePart, valid: true }
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
//   - panel root pt-3 = 12px top 對齊 DateGrid p-3 top
//   - h-field-xs = 24px header,title 純 flex items-center justify-center → 真正水平+垂直置中
//   - mb-3 = 12px gap 對齊 DateGrid month_caption mb-3
//   → title text center Y = 12 + 12 = 24px(from CalendarTimeContainer top)
//   → calendar caption text center Y = 12(p-3 top)+ 12(caption row half)= 24px ✓ 同一 Y
// ⚠️ 若改 DateGrid p-3(例如 p-2)→ 必同步改 TimePicker pt-3,否則 caption 行錯位。
// 兩處共識在 spec.md「Spacing canonical」段 + 本 comment 雙鎖。
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
}

function TimePickerSidePanel({
  value,
  onChange,
  showSeconds = false,
  minuteStep = 1,
  secondStep = 1,
  className,
}: TimePickerSidePanelProps & { className?: string }) {
  // Dynamic header text — 顯示當前選擇的 HH:MM(對齊 user Q4 + Ant idiom)
  const headerText = value
    ? timePartsToString(value, showSeconds)
    : (showSeconds ? '--:--:--' : '--:--')

  return (
    <div className={cn('flex flex-col h-full pt-3', className)}>
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
        />
      </div>
    </div>
  )
}

/**
 * showTime panel container — 包 DateGrid + TimePicker side panel,DateGrid 主導 row 高度,
 * TimePicker absolute 撐滿同高,不影響 layout。Spacer div 留 layout 寬度給 absolute panel。
 */
const TIME_PANEL_WIDTH = (showSeconds: boolean) => showSeconds ? 'w-60' : 'w-40'

interface CalendarTimeContainerProps {
  showTime: boolean
  showSeconds: boolean
  calendar: React.ReactNode
  timePanel?: React.ReactNode
}

function CalendarTimeContainer({ showTime, showSeconds, calendar, timePanel }: CalendarTimeContainerProps) {
  if (!showTime) return <>{calendar}</>
  return (
    <div className="relative">
      <div className="flex flex-row">
        {calendar}
        {/* Spacer 佔 layout 寬度給 absolute TimePicker;border-l 在這層,不在 absolute 層
            (避免 stacking + border 雙繪) */}
        <div className={cn('shrink-0 border-l border-divider', TIME_PANEL_WIDTH(showSeconds))} />
      </div>
      {/* TimePicker absolute 撐滿 DateGrid 高度(top-0 bottom-0),right-0 對齊 spacer */}
      <div className={cn('absolute top-0 right-0 bottom-0', TIME_PANEL_WIDTH(showSeconds))}>
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
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
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
   * 是否需 OK 確認才提交,預設 showTime=true 時為 true(對齊 Ant DatePicker showTime)
   * — datetime picker user 習慣編完才 commit,避免 calendar 點到就關。
   */
  needConfirm?: boolean
  /**
   * Display 是否渲 Calendar icon + Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell display↔edit 像素級對齊用。預設 false(裸 span,backward compat)。
   * 設 true 時 display 走 fieldWrapperStyles(naked variant)+ ItemSuffix CalendarIcon,
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
   * 預設 false(backward-compat)— trigger 仍是 `<div role="combobox">` + `<span>` 文字。
   *
   * Behavior(opt-in `typeable=true`):
   *   - `<input>` 取代 `<span>` displayValue,user 可直接打字
   *   - Partial input(打到一半,如 "2025-")allow,**不**即時驗證
   *   - `Enter` / `Blur` → `parseDateInput` 解析 → 合法 commit `onChange`;不合法 set
   *     aria-invalid + keep draft visible(user 可繼續修)
   *   - `Esc` → reset draft 回 committed value
   *   - IME composition 期間不觸發驗證(中日韓輸入法 onCompositionStart/End 攔截)
   *   - Calendar pick → 同步 input draft + commit(走原 path)
   *   - Calendar icon 仍 click 開 popover(Material/Ant idiom)
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
      showDisplayEndIcon = false,
      defaultOpen = false,
      onOpenChange,
      typeable = false,
      id: idProp,
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
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="display"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    const isEditable = resolvedMode === 'edit'
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const needConfirm = needConfirmProp ?? showTime  // datetime 預設需確認
    const [open, setOpenState] = React.useState(defaultOpen)
    const setOpen = React.useCallback((next: boolean) => { setOpenState(next); onOpenChange?.(next) }, [onOpenChange])
    const [draft, setDraft] = React.useState<string | null>(value ?? null)
    const resolvedPlaceholder = placeholder ?? (showTime ? 'YYYY/MM/DD HH:MM' : 'YYYY/MM/DD')
    // a11y:role="combobox" 必須有 accessible name(aria-label / labelledby / fieldCtx label)
    const accessibleName = ariaLabelProp ?? (ariaLabelledByProp ? undefined : (fieldCtx?.id ? undefined : resolvedPlaceholder))

    // Sync draft from value ONLY on open false→true(避免 popover 開啟期間 value 改變
    // clobber user 的編輯。Popover 關閉後下次再開時自動同步最新 value。)
    const lastOpenRef = React.useRef(open)
    React.useEffect(() => {
      if (!lastOpenRef.current && open) setDraft(value ?? null)
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
    const composingRef = React.useRef(false)
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
      const { iso, valid } = parseDateInput(raw, { allowTime: showTime })
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
    }, [onChange, showTime])

    // mode='display'(Phase B2 2026-05-05):純內容輸出 — 對齊原 DatePickerDisplay sub-component(retired)。
    //   Default(showDisplayEndIcon=false):無 Field wrapper / 無 Calendar icon — backward compat 裸 span。
    //   Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper + ItemSuffix Calendar,
    //   與 edit 同結構消除 cell display↔edit 像素偏移(Layer-B padding mismatch)。
    if (resolvedMode === 'display') {
      if (!showDisplayEndIcon) {
        // 2026-05-14 I2 fix(spec contract (e) display typography canonical):bare span 套
        // `fieldDisplayTextClass(size)`(sm/md→text-body,lg→text-body-lg)— 對齊 Field family 統一。
        if (!value) return <span className={cn(fieldDisplayTextClass(size), 'text-fg-muted', className)}>{EMPTY_DISPLAY}</span>
        return <span className={cn(fieldDisplayTextClass(size), 'truncate', className)}>{displayCommitted}</span>
      }
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'display', variant, size }), className)}
          data-field-mode="display"
        >
          <span className={cn(bareInputStyles, 'flex-1 min-w-0 truncate', !value && 'text-fg-muted')}>
            {value ? displayCommitted : EMPTY_DISPLAY}
          </span>
          <ItemSuffix className="pointer-events-none">
            <CalendarIcon size={iconSize} className="text-fg-muted" aria-hidden />
          </ItemSuffix>
        </div>
      )
    }

    // readonly / disabled
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: variant, size }), className)}
          data-field-mode={resolvedMode}
          aria-disabled={resolvedMode === 'disabled' ? true : undefined}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        >
          <span className={cn('flex-1 min-w-0 truncate', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {value
              ? displayCommitted
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
          {/* 2026-06-10 類型身份 indicator:readonly/disabled 保留(naked cell 依 showDisplayEndIcon=isEditable,
              並修掉原「disabled cell 無視 gate 漏顯」之 2026-05-10 cell canonical 違反);disabled → fg-disabled(spec L213)*/}
          {(variant === 'naked' ? showDisplayEndIcon : true) && (
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
        <PopoverTrigger asChild>
          <div
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={accessibleName}
            aria-labelledby={ariaLabelledByProp ?? fieldCtx?.labelId}
            aria-invalid={error || undefined}
            aria-required={fieldCtx?.required || undefined}
            aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
            aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
            // Radix PopoverTrigger 只 compose onClick(onOpenToggle),`<div>` trigger 無
            // native Enter/Space→click → 自建 onKeyDown 開 popover(對齊 select.tsx desktop
            // trigger canonical:Enter/Space → 開;Esc → 關)。typeable 模式不攔 — 內層
            // <input> 自有 Enter/Esc 語意(commit / reset draft),Calendar icon click 開
            // popover(Material/Ant typed-date idiom),避免 div 層 keydown 與 input 衝突。
            onKeyDown={typeable ? undefined : (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) }
              if (e.key === 'Escape') setOpen(false)
            }}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', variant: variant, size }),
              'text-left cursor-pointer',
              'focus-visible:outline-none',
              error && [
                'border-error hover:border-error-hover',
                'focus-within:border-error focus-within:hover:border-error',
              ],
              className,
            )}
            {...props}
          >
            {typeable ? (
              // Issue 10 typed input(2026-05-10):real `<input>` 接 user 鍵盤打字。
              // Click 在 input 上不 propagate 給外層 popover trigger(避免每次打字都開 popover)。
              // Calendar icon `<ItemSuffix>` 點才開 popover(Material/Ant typed-date idiom)。
              <input
                type="text"
                className={cn(bareInputStyles, 'truncate', !inputDraft && 'placeholder:text-fg-muted')}
                value={inputDraft}
                placeholder={resolvedPlaceholder}
                aria-invalid={inputInvalid || error || undefined}
                onChange={(e) => { setInputDraft(e.target.value); setInputInvalid(false) }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={(e) => {
                  if (composingRef.current) return
                  if (e.key === 'Enter') { e.preventDefault(); handleInputCommit(inputDraft) }
                  if (e.key === 'Escape') { setInputDraft(displayLive); setInputInvalid(false); e.preventDefault() }
                }}
                onBlur={() => { if (!composingRef.current) handleInputCommit(inputDraft) }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={cn(bareInputStyles, 'truncate', !displayValue && 'text-fg-muted')}>
                {triggerText}
              </span>
            )}
            {showClear && (
              <ItemInlineAction
                size={size ?? 'md'}
                action={{
                  icon: X,
                  label: '清除日期', // i18n-allow: DS default inline-action label
                  // Clear = 立刻 commit + 同步 draft(對齊 user 體感 / Ant trigger X 慣例)
                  // 不走 needConfirm「等確定」語義 — X 在 trigger 上是 standard clear affordance,
                  // 應立刻清空。dual-state 必同步:value('') + draft(null),否則 popover 開
                  // 著時 displayValue=draft 仍顯示舊值(see line 318: displayValue = needConfirm ? draft : value)。
                  onClick: (e) => {
                    e?.stopPropagation()
                    onChange?.('')
                    setDraft(null)
                  },
                }}
              />
            )}
            <ItemSuffix className="pointer-events-none">
              <CalendarIcon size={iconSize} className="text-fg-muted" aria-hidden />
            </ItemSuffix>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* role="dialog" 為 flex item of PopoverContent(flex flex-col overflow-hidden)。
              2026-05-06 v9.1:加 `flex flex-col flex-1 min-h-0` 完成 M25 chain — viewport
              壓縮時 dialog 縮 + 內 calendar/footer 排序;原無 chain 致 calendar 末行被
              overflow-hidden 切掉、footer 推出 popover(user 報「位置改變就壞掉」根因)。 */}
          <div role="dialog" className="flex flex-col flex-1 min-h-0">
            {/* Calendar 區包 overflow-y-auto:viewport 壓縮時 calendar 內滾(Material / Carbon
                date picker idiom)。footer 永遠 in-view(SurfaceFooter shrink-0)。 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <CalendarTimeContainer
                showTime={showTime}
                showSeconds={showSeconds}
                calendar={
                  <DateGrid
                    mode="single"
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
                  />
                }
              />
            </div>
            {showTime && (
              // Footer:消費 SurfaceFooter SSOT(border-t + canonical px-loose py-tight padding,
              // 不再 hand-coded p-2 / Separator / ml-auto wrapper 三層垃圾)。
              // 「此刻」加 mr-auto 把後面 button 推右(對齊 Ant `marginInlineStart: auto` on OK)。
              <SurfaceFooter>
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
// **Trigger**:2 input button,active end blue underline 標示

export interface DatePickerRangeProps
  extends DateFormatOptions,
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      'value' | 'onChange' | 'placeholder' | 'defaultValue'
    > {
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
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
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const DatePickerRange = React.forwardRef<HTMLDivElement, DatePickerRangeProps>(
  (
    {
      mode,
      variant: variantProp,
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
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="display"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    const isEditable = resolvedMode === 'edit'
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const needConfirm = needConfirmProp ?? showTime
    const resolvedPlaceholder: [string, string] = placeholder ?? (
      showTime ? ['Start date time', 'End date time'] : ['Start date', 'End date']
    )

    const [open, setOpen] = React.useState(false)
    const [draft, setDraft] = React.useState<[string | null, string | null]>(value ?? [null, null])
    const [activeEnd, setActiveEnd] = React.useState<'start' | 'end'>('start')

    // Sync draft from value ONLY on open false→true(canonical 2026-05-02 v3):
    // 之前用 `[value, open]` 雙 dep,popover 開啟期間 value 任何 reference 變更 → useEffect
    // 觸發 → 直接 clobber user 的 draft 編輯。改成只在 open 從 false→true 同步。
    const lastOpenRef = React.useRef(open)
    React.useEffect(() => {
      if (!lastOpenRef.current && open) setDraft(value ?? [null, null])
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
    const handleClearRange = (e?: React.MouseEvent) => {
      e?.stopPropagation()
      // Clear = 立刻 commit + 同步 draft(對齊 single mode + user 體感)
      // dual-state 同步,否則 popover 開著時 displayValue=draft 仍顯示舊 [start, end]
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

    // mode='display'(Phase B2 2026-05-05):純內容輸出 — 無 Field wrapper / 無 Calendar icon。
    if (resolvedMode === 'display') {
      const hasAny = !!(startIso || endIso)
      if (!hasAny) return <span className={cn('text-fg-muted', className)}>{EMPTY_DISPLAY}</span>
      return (
        <span className={cn('inline-flex items-center min-w-0', nakedCellRowModeAlign, className)}>
          <span className={cn('truncate', !startIso && 'text-fg-muted')}>
            {startIso ? formatDateOrDateTime(startIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[0]}
          </span>
          <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
          <span className={cn('truncate', !endIso && 'text-fg-muted')}>
            {endIso ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[1]}
          </span>
        </span>
      )
    }

    // readonly / disabled view — plain wrapper,no popover
    if (!isEditable) {
      return (
        <div
          ref={ref}
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: variant, size }), className)}
          data-field-mode={resolvedMode}
          aria-disabled={resolvedMode === 'disabled' ? true : undefined}
          {...props}
        >
          <span className={cn('flex-1 min-w-0 truncate', !startIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {startIso ? formatDateOrDateTime(startIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[0]}
          </span>
          <ArrowRight size={iconSize} className={cn('shrink-0 mx-2', resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted')} aria-hidden />
          <span className={cn('flex-1 min-w-0 truncate', !endIso && 'text-fg-muted', resolvedMode === 'disabled' && 'text-fg-disabled')}>
            {endIso ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[1]}
          </span>
          <ItemSuffix className="pointer-events-none">
            <CalendarIcon size={iconSize} className={resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'} aria-hidden />
          </ItemSuffix>
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
            data-state={open ? 'open' : 'closed'}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', size }),
              'cursor-text',
              error && [
                'border-error hover:border-error-hover',
                'focus-within:border-error focus-within:hover:border-error',
              ],
              className,
            )}
            {...props}
          >
            <button
              type="button"
              onClick={() => openWithActive('start')}
              data-active-end={open && activeEnd === 'start' ? 'true' : undefined}
              aria-label={resolvedPlaceholder[0]}
              aria-haspopup="dialog"
              aria-expanded={open && activeEnd === 'start'}
              className={cn(
                bareInputStyles,
                'truncate text-left cursor-pointer focus-visible:outline-none',
                'data-[active-end=true]:underline decoration-primary underline-offset-4 decoration-2',
                !startIso && 'text-fg-muted',
              )}
            >
              {startText}
            </button>
            <ArrowRight size={iconSize} className="shrink-0 text-fg-muted mx-2" aria-hidden />
            <button
              type="button"
              onClick={() => openWithActive('end')}
              data-active-end={open && activeEnd === 'end' ? 'true' : undefined}
              aria-label={resolvedPlaceholder[1]}
              aria-haspopup="dialog"
              aria-expanded={open && activeEnd === 'end'}
              className={cn(
                bareInputStyles,
                'truncate text-left cursor-pointer focus-visible:outline-none',
                'data-[active-end=true]:underline decoration-primary underline-offset-4 decoration-2',
                !endIso && 'text-fg-muted',
              )}
            >
              {endText}
            </button>
            {showClear && (
              <ItemInlineAction
                size={size ?? 'md'}
                action={{
                  icon: X,
                  label: '清除日期區間', // i18n-allow: DS default inline-action label
                  onClick: handleClearRange,
                }}
              />
            )}
            <ItemSuffix className="pointer-events-none">
              <CalendarIcon size={iconSize} className="text-fg-muted" aria-hidden />
            </ItemSuffix>
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-auto p-0" align="start">
          {/* 2026-05-06 v9.1 M25 chain — 同 single DatePicker 修法,viewport 壓縮 calendar 內滾 + footer 永遠 in-view */}
          <div role="dialog" aria-label="日期區間選擇" className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto">
            <CalendarTimeContainer
              showTime={showTime}
              showSeconds={showSeconds}
              calendar={
                <DateGrid
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
                  // showTime Range:不渲 range visualization(對齊 Ant — 整個 popup 等同 single
                  // DateTimePicker,沒 range 視覺概念);date-only Range 才顯示
                  modifiers={showTime ? {} : rangeModifiers}
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
                      '[&>button]:!bg-primary [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                      "before:content-[''] before:absolute before:inset-y-0",
                      'before:left-0 before:-right-[2px]',
                      'before:bg-neutral-selected before:pointer-events-none',
                      'before:rounded-l-full',  // ← stadium 左半圓 matches button 圓的左半弧
                    ),
                    rangeEnd: cn(
                      '[&>button]:!bg-primary [&>button]:!text-on-emphasis [&>button]:hover:!ring-0',
                      "before:content-[''] before:absolute before:inset-y-0",
                      'before:-left-[2px] before:right-0',
                      'before:bg-neutral-selected before:pointer-events-none',
                      'before:rounded-r-full',  // ← 鏡像
                    ),
                    rangeMiddle: cn(
                      "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px]",
                      'before:bg-neutral-selected before:pointer-events-none',
                      '[&>button]:!bg-transparent [&>button]:!text-foreground',
                    ),
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
                />
              }
            />
            </div>
            {(showTime || needConfirm) && (
            // Footer 消費 SurfaceFooter SSOT(border-t + canonical px-loose py-tight)。
            // showTime Range 無「此刻」(對齊 Ant `showNow={multiple ? false : showNow}`)→ 只有 確定 走 justify-end。
            // date-only Range needConfirm:左 此刻(mr-auto)+ 右 確定。
            <SurfaceFooter>
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
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export {
  DatePickerWithRange as DatePicker,
  DatePickerRange,
  formatDate,
}
