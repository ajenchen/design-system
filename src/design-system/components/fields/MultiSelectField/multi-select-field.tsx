import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode } from '@/design-system/components/fields/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Badge } from '@/design-system/components/Badge/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── constants ───────────────────────────────────────────────────────────────

const GAP = 4

const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

export interface SelectOption { value: string; label: string }

// ── useOverflowCount ────────────────────────────────────────────────────────
// 量測容器可用寬度與每個 badge 的自然寬度，計算多少個放得下。
// badge 全部渲染為 shrink-0，容器 overflow-hidden 裁切。
// 初次量測前 opacity:0，量測後 opacity:1，避免閃爍。

function useOverflowCount(
  containerRef: React.RefObject<HTMLDivElement | null>,
  badgeEls: React.MutableRefObject<(HTMLDivElement | null)[]>,
  overflowEl: React.RefObject<HTMLDivElement | null>,
  totalCount: number,
  enabled: boolean,
): { visibleCount: number; ready: boolean } {
  const [state, setState] = React.useState({ visibleCount: totalCount, ready: !enabled })

  React.useEffect(() => {
    if (!enabled || totalCount === 0) {
      setState({ visibleCount: totalCount, ready: true })
      return
    }
    const container = containerRef.current
    if (!container) return

    const calc = () => {
      const cs = getComputedStyle(container)
      const available = container.clientWidth
        - (parseFloat(cs.paddingLeft) || 0)
        - (parseFloat(cs.paddingRight) || 0)

      // 讓所有 badge 可見以量測自然寬度
      for (const el of badgeEls.current) if (el) el.hidden = false

      // overflow 指示器：暫時可見以量測
      const ofEl = overflowEl.current
      if (ofEl) ofEl.hidden = false
      const overflowW = ofEl?.offsetWidth || 60

      let used = 0
      let count = 0
      for (let i = 0; i < totalCount; i++) {
        const el = badgeEls.current[i]
        if (!el) continue
        const w = el.offsetWidth
        const next = used + (count > 0 ? GAP : 0) + w
        const remaining = totalCount - count - 1
        if (remaining > 0 && next + GAP + overflowW > available && count > 0) break
        if (remaining === 0 && next > available && count > 0) break
        used = next
        count++
      }

      // 套用結果：隱藏超出的 badge，控制 overflow 指示器
      for (let i = 0; i < badgeEls.current.length; i++) {
        const el = badgeEls.current[i]
        if (el) el.hidden = i >= count
      }
      if (ofEl) ofEl.hidden = count >= totalCount

      setState({ visibleCount: count, ready: true })
    }

    requestAnimationFrame(calc)
    const obs = new ResizeObserver(calc)
    obs.observe(container)
    return () => obs.disconnect()
  }, [containerRef, totalCount, enabled])

  return state
}

// ── DismissButton ───────────────────────────────────────────────────────────

function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/action relative grid place-content-center text-fg-muted hover:text-foreground active:text-foreground transition-colors"
      style={{ width: 16, height: 16 }}
      aria-label={`移除 ${label}`}
    >
      <span
        className="absolute rounded-sm pointer-events-none bg-transparent group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active transition-colors"
        style={{ width: 18, height: 18, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        aria-hidden
      />
      <X size={16} className="relative" aria-hidden />
    </button>
  )
}

// ── OverflowBadgeList ───────────────────────────────────────────────────────
// 單行：所有 badge 渲染為 shrink-0，DOM hidden 控制超出的。
// wrap：全部顯示，不量測。

interface OverflowBadgeListProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  items: { value: string; label: string }[]
  size: 'sm' | 'md' | 'lg'
  wrap: boolean
  renderBadge: (item: { value: string; label: string }, index: number) => React.ReactNode
  trailing?: React.ReactNode
}

function OverflowBadgeList({ containerRef, items, size, wrap, renderBadge, trailing }: OverflowBadgeListProps) {
  const badgeEls = React.useRef<(HTMLDivElement | null)[]>([])
  const overflowEl = React.useRef<HTMLDivElement>(null)
  const { visibleCount, ready } = useOverflowCount(containerRef, badgeEls, overflowEl, items.length, !wrap)

  // 清理舊 refs
  badgeEls.current.length = items.length

  if (wrap) {
    return <>{items.map((item, i) => renderBadge(item, i))}{trailing}</>
  }

  const overflow = items.length - visibleCount
  const hiddenItems = items.slice(visibleCount)

  return (
    <>
      {/* opacity:0 直到量測完成 */}
      <span className="contents" style={{ opacity: ready ? 1 : 0 }}>
        {items.map((item, i) => (
          <div key={item.value} ref={el => { badgeEls.current[i] = el }} className="shrink-0">
            {renderBadge(item, i)}
          </div>
        ))}
        <div ref={overflowEl} className="shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Badge size={size} className="shrink-0 cursor-default">+ {overflow} …</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-wrap gap-1">
                {hiddenItems.map(item => (
                  <Badge key={item.value} size="sm" className="max-w-none">{item.label}</Badge>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        {trailing}
      </span>
    </>
  )
}

// ── Display ─────────────────────────────────────────────────────────────────

function MultiSelectFieldDisplay({
  value, options, badgeSize = 'md', wrap = false,
  containerRef: externalRef, disabled = false,
}: {
  value?: string[] | null
  options?: SelectOption[]
  badgeSize?: 'sm' | 'md' | 'lg'
  wrap?: boolean
  containerRef?: React.RefObject<HTMLDivElement | null>
  disabled?: boolean
}) {
  const ownRef = React.useRef<HTMLDivElement>(null)

  if (!value || value.length === 0) {
    return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  }

  const items = value.map(v => ({
    value: v,
    label: options?.find(o => o.value === v)?.label ?? v,
  }))

  // disabled: bg-disabled(neutral-2) + text-fg-disabled(neutral-6)
  const disabledClass = disabled ? 'bg-disabled text-fg-disabled' : undefined

  const content = (
    <OverflowBadgeList
      containerRef={externalRef ?? ownRef}
      items={items}
      size={badgeSize}
      wrap={wrap}
      renderBadge={(item) => (
        <Badge size={badgeSize} className={cn('shrink-0', disabledClass)}>{item.label}</Badge>
      )}
    />
  )

  if (externalRef) return content

  return (
    <div ref={ownRef} className={cn('flex items-center min-w-0', wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: GAP }}>
      {content}
    </div>
  )
}
MultiSelectFieldDisplay.displayName = 'MultiSelectFieldDisplay'

// ── Types ───────────────────────────────────────────────────────────────────

export interface MultiSelectFieldProps {
  mode?: FieldMode
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  wrap?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

function MultiSelectField({
  mode = 'edit',
  error = false,
  size = 'md',
  options,
  value = [],
  onChange,
  placeholder,
  className,
  disabled,
  wrap = false,
}: MultiSelectFieldProps) {
  const resolvedMode = disabled ? 'disabled' : mode
  const isEditable = resolvedMode === 'edit'
  const containerRef = React.useRef<HTMLDivElement>(null)

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))
  const handleAdd = (v: string) => {
    if (!value.includes(v)) onChange?.([...value, v])
  }

  const items = value.map(v => ({
    value: v,
    label: options.find(o => o.value === v)?.label ?? v,
  }))

  // readonly / disabled
  if (!isEditable) {
    const hasTags = value.length > 0
    return (
      <div
        ref={containerRef}
        className={cn(
          fieldWrapperStyles({ mode: resolvedMode, size }),
          hasTags && tagPadding[size],
          wrap ? 'flex-wrap py-1' : 'overflow-hidden',
          className,
        )}
        style={{ gap: GAP, ...(wrap ? { height: 'auto' } : undefined) }}
        data-field-mode={resolvedMode}
      >
        {hasTags ? (
          <MultiSelectFieldDisplay
            value={value}
            options={options}
            badgeSize={size}
            wrap={wrap}
            containerRef={containerRef}
            disabled={resolvedMode === 'disabled'}
          />
        ) : (
          <span className={cn('text-fg-muted', resolvedMode === 'disabled' && 'opacity-disabled')}>
            {EMPTY_DISPLAY}
          </span>
        )}
      </div>
    )
  }

  // edit
  const unselected = options.filter(o => !value.includes(o.value))
  const selectDropdown = unselected.length > 0 ? (
    <select
      value=""
      onChange={(e) => handleAdd(e.target.value)}
      className={cn(
        'bg-transparent outline-none border-none p-0 text-[inherit] font-[inherit] leading-[inherit] text-fg-muted cursor-pointer appearance-none',
        value.length > 0 ? 'flex-1 min-w-0 opacity-0' : 'flex-1 min-w-20',
      )}
    >
      <option value="" disabled>{placeholder ?? '選擇...'}</option>
      {unselected.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  ) : null

  return (
    <div
      ref={containerRef}
      className={cn(
        fieldWrapperStyles({ mode: 'edit', size }),
        tagPadding[size],
        wrap ? 'flex-wrap py-1' : 'overflow-hidden',
        error && [
          'border-error hover:border-error-hover',
          'focus-within:border-error focus-within:hover:border-error',
        ],
        className,
      )}
      style={{ gap: GAP, ...(wrap ? { height: 'auto' } : undefined) }}
      data-field-mode="edit"
      data-error={error ? '' : undefined}
    >
      <OverflowBadgeList
        containerRef={containerRef}
        items={items}
        size={size}
        wrap={wrap}
        renderBadge={(item) => (
          <Badge
            size={size}
            className="shrink-0"
            suffix={<DismissButton label={item.label} onClick={() => handleRemove(item.value)} />}
          >
            {item.label}
          </Badge>
        )}
        trailing={selectDropdown}
      />
    </div>
  )
}

MultiSelectField.displayName = 'MultiSelectField'

export { MultiSelectField, MultiSelectFieldDisplay }
