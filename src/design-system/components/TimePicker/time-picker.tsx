import * as React from 'react'
import { X, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/Field/field-types'
import {
  fieldWrapperStyles,
  bareInputStyles,
  EMPTY_DISPLAY,
} from '@/design-system/components/Field/field-wrapper'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Button } from '@/design-system/components/Button/button'
import {
  TimeColumns,
  isoToTimeParts,
  timePartsToString,
  type TimeParts,
  type TimeStep,
  type TimeColumnsDisabled,
} from '@/design-system/components/TimePicker/time-columns'

/**
 * TimePicker — 單一時間(時/分/秒)輸入與顯示元件
 *
 * ── 定位(同 DatePicker 家族)──
 * Value 以 ISO time string 儲存("HH:mm" 或 "HH:mm:ss"),local-time 語義(不帶時區)。
 * Edit 用本 DS 自建 time column panel + Popover 呈現,視覺與 DatePicker 一致。
 * Display 用 Intl.DateTimeFormat 格式化(跨 locale / 12h-24h 統一經過此 API)。
 *
 * ── Layout Family ──
 * CLAUDE.md 4-Family Model Family 4(Field control layout)消費者。結構繼承
 * `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]`,視覺對齊
 * Family 1(Menu item layout)。
 *
 * ── 實作基礎 ──
 * Trigger:`<button>` + `fieldWrapperStyles`(視覺仍是 Input wrapper,改為可點擊觸發浮層)
 * Popup:`Popover`(消費 overlay-surface pattern)
 * Panel 主體:自建 column picker(三欄 scrollable list),不引入第三方 time library
 *
 * ── 共用規則 ──
 * Mode / size / disabled / error 等詳見 `../Field/field-controls.spec.md`。
 */

// ── Time ISO <-> parts conversion ───────────────────────────────────────────
// Value 用 ISO time string(HH:mm 或 HH:mm:ss),local-time 語義(不帶時區/日期)。
// 跟 DatePicker 的 ISO date string 策略一致。
// `isoToTimeParts` / `timePartsToString` 改 import from time-columns(M17 SSOT)。

// ── Display formatting ──────────────────────────────────────────────────────

export interface TimeFormatOptions {
  /** Intl.DateTimeFormat options(預設 { hour: '2-digit', minute: '2-digit', hour12: false }) */
  formatOptions?: Intl.DateTimeFormatOptions
  /** locale(預設 'en-US') */
  locale?: string
}

function formatTime(
  iso: string,
  options: TimeFormatOptions = {},
): string {
  const parts = isoToTimeParts(iso)
  if (!parts) return iso
  const {
    formatOptions = { hour: '2-digit', minute: '2-digit', hour12: false },
    locale = 'en-US',
  } = options
  // 借用 Date 讓 Intl.DateTimeFormat 處理 locale / 12h-24h
  const d = new Date()
  d.setHours(parts.hours, parts.minutes, parts.seconds, 0)
  return new Intl.DateTimeFormat(locale, formatOptions).format(d)
}

// ── Display sub-component(DataTable cell 用)────────────────────────────────

export interface TimePickerDisplayProps extends TimeFormatOptions {
  value?: string | null
}

function TimePickerDisplay({ value, ...formatOptions }: TimePickerDisplayProps) {
  if (value == null || value === '')
    return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  return <>{formatTime(value, formatOptions)}</>
}
TimePickerDisplay.displayName = 'TimePickerDisplay'

// ── Disabled time callback ──────────────────────────────────────────────────
// `Step` / `buildRange` / `TimeColumn`(內部欄位實作)拔掉,改 import `TimeColumns` primitive。

// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export interface DisabledTimeResult {
  disabledHours?: number[]
  disabledMinutes?: number[]
  disabledSeconds?: number[]
}

// ── Component props ─────────────────────────────────────────────────────────

export interface TimePickerProps
  extends TimeFormatOptions,
    Omit<
      React.HTMLAttributes<HTMLDivElement>,
      'onChange' | 'placeholder'
    > {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** ISO time string("HH:mm" 或 "HH:mm:ss") */
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 允許清空已選值 */
  clearable?: boolean
  /**
   * 是否顯示秒欄(三欄 picker)。預設 false(兩欄:時/分)。
   * format 自動對應:false → "HH:mm",true → "HH:mm:ss"。
   */
  showSeconds?: boolean
  /** 分鐘步進(會議常用 15)。預設 1 */
  minuteStep?: TimeStep
  /** 秒步進。預設 1。僅 showSeconds=true 有效 */
  secondStep?: TimeStep
  /** 動態 disabled 某些時/分/秒(基於已選其他欄位)。 */
  disabledTime?: (parts: TimeParts) => DisabledTimeResult
  /** 左側 startIcon,預設 Clock。傳 null 可關閉 */
  startIcon?: LucideIcon | null
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const TimePicker = React.forwardRef<HTMLDivElement, TimePickerProps>(
  (
    {
      mode = 'edit',
      error: errorProp = false,
      size = 'md',
      value,
      onChange,
      placeholder,
      className,
      disabled: disabledProp,
      clearable = false,
      showSeconds = false,
      minuteStep = 1,
      secondStep = 1,
      disabledTime,
      startIcon,
      formatOptions,
      locale,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref,
  ) => {
    const fieldCtx = useFieldContext()
    const error = errorProp || (fieldCtx?.invalid ?? false)
    const disabled = disabledProp ?? fieldCtx?.disabled
    const resolvedMode = disabled ? 'disabled' : mode
    const isEditable = resolvedMode === 'edit'
    const iconSize = size === 'lg' ? 20 : 16
    const StartIconCmp: LucideIcon | null =
      startIcon === null ? null : (startIcon ?? Clock)
    const defaultPlaceholder = showSeconds ? 'HH:MM:SS' : 'HH:MM'
    const resolvedPlaceholder = placeholder ?? defaultPlaceholder
    const showClear = clearable && !!value && isEditable
    const [open, setOpen] = React.useState(false)

    const currentParts = React.useMemo(() => isoToTimeParts(value), [value])
    // draft 僅在 panel 開啟時用來處理 commit(OK button)的暫存
    const [draft, setDraft] = React.useState<TimeParts>(
      () => currentParts ?? { hours: 0, minutes: 0, seconds: 0 },
    )

    // 每次 popover 開啟時以當前 value 初始化 draft
    React.useEffect(() => {
      if (open) {
        setDraft(currentParts ?? { hours: 0, minutes: 0, seconds: 0 })
      }
    }, [open, currentParts])

    const disabledForColumns: TimeColumnsDisabled | undefined = React.useMemo(() => {
      if (!disabledTime) return undefined
      const res = disabledTime(draft)
      return {
        hours: res.disabledHours,
        minutes: res.disabledMinutes,
        seconds: res.disabledSeconds,
      }
    }, [disabledTime, draft])

    const commitDraft = (next: TimeParts) => {
      setDraft(next)
      onChange?.(timePartsToString(next, showSeconds))
    }

    const handleNow = () => {
      const now = new Date()
      // 按照 minuteStep / secondStep 對齊
      const m = Math.round(now.getMinutes() / minuteStep) * minuteStep
      const s = showSeconds
        ? Math.round(now.getSeconds() / secondStep) * secondStep
        : 0
      const next: TimeParts = {
        hours: now.getHours(),
        minutes: Math.min(m, 59),
        seconds: Math.min(s, 59),
      }
      commitDraft(next)
      setOpen(false)
    }

    // readonly / disabled
    if (!isEditable) {
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, size }), className)}
          data-field-mode={resolvedMode}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        >
          {StartIconCmp && (
            <StartIconCmp
              size={iconSize}
              className={cn(
                'shrink-0 pointer-events-none',
                resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted',
              )}
              aria-hidden
            />
          )}
          <span
            className={cn(
              'flex-1 min-w-0',
              resolvedMode === 'disabled' && 'text-fg-disabled',
            )}
          >
            {value
              ? formatTime(value, { formatOptions, locale })
              : <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            }
          </span>
        </div>
      )
    }

    const displayText = value
      ? formatTime(value, { formatOptions, locale })
      : <span className="text-fg-muted">{resolvedPlaceholder}</span>

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* a11y(2026-04-25 nested-interactive fix):trigger 改 <div role='combobox'>
              (對齊 Select / Combobox 同 pattern),原 <button> 會與內層 ItemInlineAction
              清除 button 構成 nested-interactive。Radix Popover 在 trigger asChild 下會
              自動 inject keyboard handler(Enter / Space 開啟)+ 正確 aria attributes。 */}
          <div
            ref={ref}
            id={idProp ?? fieldCtx?.id}
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-labelledby={fieldCtx?.labelId}
            aria-invalid={error || undefined}
            aria-required={fieldCtx?.required || undefined}
            aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
            aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
            className={cn(
              fieldWrapperStyles({ mode: 'edit', size }),
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
            {StartIconCmp && (
              <StartIconCmp
                size={iconSize}
                className="shrink-0 text-fg-muted pointer-events-none"
                aria-hidden
              />
            )}
            <span className={cn(bareInputStyles, 'truncate', !value && 'text-fg-muted')}>
              {displayText}
            </span>
            {showClear && (
              <ItemInlineAction
                size={size ?? 'md'}
                action={{
                  icon: X,
                  label: '清除時間', // i18n-allow: DS default inline-action label
                  onClick: (e) => {
                    e?.stopPropagation()
                    onChange?.('')
                  },
                }}
              />
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Panel 對齊 ref/timepicker.png:2-3 個 SelectMenu 式欄位並排,分隔線分開。
              Width 依欄數由 TimeColumns 決定:2 欄 w-40 / 3 欄 w-60。
              Height 由 wrapper 控:216px 預設(~7 items)。
              TimeColumns 本身 h-full,parent 控 height — 讓 DatePicker showTime / Range 可
              用 flex-row items-stretch 自動同 calendar 高。 */}
          <div className="flex flex-col h-[216px]">
            <TimeColumns
              value={draft}
              onChange={commitDraft}
              showSeconds={showSeconds}
              minuteStep={minuteStep}
              secondStep={secondStep}
              disabled={disabledForColumns}
            />
            {/* Footer:Now + OK */}
            <div
              className={cn(
                'flex items-center justify-between gap-2',
                'border-t border-divider',
                'px-[var(--layout-space-tight)] py-[var(--layout-space-tight)]',
              )}
            >
              <Button variant="text" size="sm" onClick={handleNow}>
                此刻
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                確定
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
TimePicker.displayName = 'TimePicker'

// code-quality-allow: dead-export — sub-component (display variant) — consumer 可 compose 自行渲染
// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const timePickerMeta = {
  component: 'TimePicker',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-primary', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-foreground'],
    ring: [],
  },
} as const

// code-quality-allow: dead-export — sub-component (display variant) — consumer 可 compose 自行渲染
export { TimePicker, TimePickerDisplay, formatTime }
