// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { X, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import {
  fieldWrapperStyles,
  bareInputStyles,
  EMPTY_DISPLAY,
  fieldDisplayTextClass,
} from '@/design-system/components/Field/field-wrapper'
import { ItemInlineAction, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import { Button } from '@/design-system/components/Button/button'
import {
  TimeColumns,
  isoToTimeParts,
  timePartsToString,
  type TimeParts,
  type TimeStep,
  type TimeColumnsDisabled,
} from '@/design-system/components/TimePicker/time-columns'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

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
 * `fieldWrapperStyles + [<editable>] [endIcon=Clock]`,視覺對齊 DatePicker(同
 * 「點擊觸發浮層」role:indicator 在 suffix slot,對齊 Material `endAdornment` /
 * Ant DatePicker / Polaris Picker 共識)。
 *
 * ── 實作基礎 ──
 * Trigger:`<div role="combobox">` + `fieldWrapperStyles`(視覺仍是 Input wrapper,改為可點擊觸發浮層;
 *   2026-04-25 由 `<button>` 改 div 避 nested-interactive,對齊 Select / Combobox,鍵盤靠顯式 onKeyDown)
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
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
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
  /**
   * Suffix indicator(2026-05-05 v9 canonical fix):「點擊觸發浮層」indicator 一律 suffix
   * (對齊 DatePicker calendar / Material endAdornment)。預設 Clock,傳 null 可關閉。
   */
  endIcon?: LucideIcon | null
  /**
   * Display 是否渲 endIcon + Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell display↔edit 像素級對齊用。預設 false(裸 span,backward compat)。
   * 設 true 時 display 也走 fieldWrapperStyles(naked variant)+ ItemSuffix Clock,
   * 與 edit 同 DOM 結構,消除 Layer-B padding mismatch。
   */
  showDisplayEndIcon?: boolean
  /** Initial open state(uncontrolled)— DataTable cell-as-input 1-step open canonical */
  defaultOpen?: boolean
  /** open state 變更 callback。DataTable cell-as-input 用:open=false → cell exit edit */
  onOpenChange?: (open: boolean) => void
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const TimePicker = React.forwardRef<HTMLDivElement, TimePickerProps>(
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
      showSeconds = false,
      minuteStep = 1,
      secondStep = 1,
      disabledTime,
      endIcon,
      showDisplayEndIcon = false,
      formatOptions,
      locale,
      defaultOpen = false,
      onOpenChange,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref,
  ) => {
    const fieldCtx = useFieldContext()
    const size = useResolvedFieldSize(sizeProp)  // B 組 cascade fix
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="display"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariant = useResolvedFieldVariant(variantProp)
    const isEditable = resolvedMode === 'edit'
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    const EndIconCmp: LucideIcon | null =
      endIcon === null ? null : (endIcon ?? Clock)
    const defaultPlaceholder = showSeconds ? 'HH:MM:SS' : 'HH:MM'
    const resolvedPlaceholder = placeholder ?? defaultPlaceholder
    const showClear = clearable && !!value && isEditable
    const [open, setOpenState] = React.useState(defaultOpen)
    const setOpen = React.useCallback((next: boolean) => { setOpenState(next); onOpenChange?.(next) }, [onOpenChange])

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

    // mode='display'(Phase B2 2026-05-05):純內容輸出 — 對齊原 TimePickerDisplay sub-component(retired)。
    //   Default(showDisplayEndIcon=false):無 Field wrapper / 無 Clock icon — backward compat 裸 span。
    //   Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper + ItemSuffix Clock,
    //   與 edit 同結構消除 cell display↔edit 像素偏移(Layer-B padding mismatch)。
    if (resolvedMode === 'display') {
      if (!showDisplayEndIcon) {
        // 2026-05-14 I2 fix(spec contract (e) display typography canonical):bare span 套
        // `fieldDisplayTextClass(size)`(sm/md→text-body,lg→text-body-lg)— 對齊 Field family 統一。
        if (!value) return <span className={cn(fieldDisplayTextClass(size), 'text-fg-muted', className)}>{EMPTY_DISPLAY}</span>
        return <span className={cn(fieldDisplayTextClass(size), 'truncate', className)}>{formatTime(value, { formatOptions, locale })}</span>
      }
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'display', variant, size }), className)}
          data-field-mode="display"
        >
          <span className={cn(bareInputStyles, 'flex-1 min-w-0 truncate', !value && 'text-fg-muted')}>
            {value ? formatTime(value, { formatOptions, locale }) : EMPTY_DISPLAY}
          </span>
          {EndIconCmp && (
            <ItemSuffix className="pointer-events-none">
              <EndIconCmp size={iconSize} className="text-fg-muted" aria-hidden />
            </ItemSuffix>
          )}
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
          {/* 2026-06-10 類型身份 indicator gate:naked cell 依 showDisplayEndIcon=isEditable(修 disabled cell 漏顯 bug)*/}
          {EndIconCmp && (variant === 'naked' ? showDisplayEndIcon : true) && (
            <ItemSuffix className="pointer-events-none">
              <EndIconCmp
                size={iconSize}
                className={resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'}
                aria-hidden
              />
            </ItemSuffix>
          )}
        </div>
      )
    }

    const displayText = value
      ? formatTime(value, { formatOptions, locale })
      : <span className="text-fg-muted">{resolvedPlaceholder}</span>

    return (
      <Popover open={open} onOpenChange={setOpen}>
        {/* a11y(2026-04-25 nested-interactive fix):trigger 改 <div role='combobox'>
            (對齊 Select / Combobox 同 pattern),原 <button> 會與內層 ItemInlineAction
            清除 button 構成 nested-interactive。
            2026-06-01 鍵盤開啟修正:Radix PopoverTrigger 只 compose onClick
            (@radix-ui/react-popover index.js:145),不 inject 任何 onKeyDown。原生 <button>
            靠瀏覽器在 Enter/Space 自動派發 click 才能開;但本 trigger 是 <div role=combobox>,
            div 不會自動派發 click → 鍵盤使用者打不開 panel。故顯式加 onKeyDown
            (對齊 select.tsx:593-598 既有 canonical + WAI-ARIA APG combobox required keys)。 */}
        <PopoverTrigger asChild>
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
            onKeyDown={(e) => {
              if (disabled) return
              // Enter / Space / ArrowDown / Alt+ArrowDown → 開 panel(APG combobox required + Select canonical)
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault()
                setOpen(true)
              }
              // Escape → 關(Radix Content 已自帶,trigger 補位對齊 select.tsx:597)
              if (e.key === 'Escape') setOpen(false)
            }}
            data-field-mode="edit"
            data-error={error ? '' : undefined}
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
            {EndIconCmp && (
              <ItemSuffix className="pointer-events-none">
                <EndIconCmp size={iconSize} className="text-fg-muted" aria-hidden />
              </ItemSuffix>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Panel 對齊 ref/timepicker.png:2-3 個 SelectMenu 式欄位並排,分隔線分開。
              Width 依欄數由 TimeColumns 決定:2 欄 w-40 / 3 欄 w-60。
              Height 由 wrapper 控:216px 預設(扣 footer 後 list 約可見 5-6 items)。
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
              // 2026-05-06 v9.1 M25 chain fix:TimeColumns 自然高 = 24 buttons × ~28.7px = 688px
              // 會撐破 parent h-[216px]。flex-1 + min-h-0 讓 TimeColumns 取 parent 剩餘空間
              // (216 − footer ≈53px ≈ 163px)→ ScrollArea h-full 才能正確收斂 →
              // listbox scrollIntoView 找對 nearest scrollable ancestor(內部 viewport),
              // 不會走到 document body 把 popover 內容推出畫面(user 報「hours 欄空白」根因)。
              className="flex-1 min-h-0"
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

export { TimePicker }
