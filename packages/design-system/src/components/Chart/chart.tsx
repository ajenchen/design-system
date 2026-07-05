import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import { cn } from '@/lib/utils'

/**
 * Chart — shadcn-style wrapper over Recharts + 本 DS token
 *
 * 結構對齊 shadcn chart(ChartContainer / ChartTooltipContent / ChartLegendContent),
 * 但所有視覺(tooltip / legend / grid / axis)改用本 DS token。
 *
 * ── Color mapping ──
 * ChartConfig.{key}.color 接受 2 種形式:
 *   1. CSS var 字串('var(--chart-1)' 等)
 *   2. 任何合法 CSS color
 * 預設建議使用 --chart-1..5(本 DS 提供的 5 色類別 token)
 *
 * ── 視覺 token ──
 * Tooltip: bg-surface-raised / border-border / shadow-[var(--elevation-200)] / rounded-md
 * Legend text: text-fg-secondary / text-caption
 * Grid: stroke-divider
 * Axis tick: text-fg-muted / text-caption
 */

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<'light' | 'dark', string> }
  )
}

type ChartContextProps = { config: ChartConfig }

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error('useChart 必須在 <ChartContainer> 內使用')
  return ctx
}

// ── ChartContainer ─────────────────────────────────────────────────────────

interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const uniqueId = React.useId()
    const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`
    // Memoize provider value(2026-04-22 D3 perf audit):避免 render 重建 wrapper object
    const ctxValue = React.useMemo(() => ({ config }), [config])

    return (
      <ChartContext.Provider value={ctxValue}>
        <div
          ref={ref}
          data-chart={chartId}
          className={cn(
            // 整體視覺套用本 DS typography + token
            // 預設 aspect-video(16:9)— Recharts ResponsiveContainer 需 parent 有高度。
            // Consumer 若需其他比例,包 <AspectRatio ratio={n}> 覆寫(AspectRatio 的 padding-bottom 高度會蓋過此 class)。
            'flex aspect-video justify-center text-caption',
            // recharts 內部預設樣式覆寫:grid / axis / tooltip shadow 等
            "[&_.recharts-cartesian-grid_line]:stroke-divider",
            "[&_.recharts-cartesian-axis-tick_text]:fill-fg-muted",
            "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-divider",
            "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-divider",
            "[&_.recharts-dot[stroke='#fff']]:stroke-transparent",
            "[&_.recharts-layer]:outline-none",
            "[&_.recharts-sector[stroke='#fff']]:stroke-transparent",
            "[&_.recharts-sector]:outline-none",
            "[&_.recharts-surface]:outline-none",
            className,
          )}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  },
)
ChartContainer.displayName = 'ChartContainer'

// ── ChartStyle ──────────────────────────────────────────────────────────────
// 將 config 內每個 key 的 color 注入 scoped CSS variable(`--color-{key}`),
// 供 Recharts `fill={`var(--color-${key})`}` 直接消費。

const THEMES = { light: '', dark: '[data-theme=dark] ' } as const

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const entries = Object.entries(config).filter(([, v]) => 'color' in v || 'theme' in v)
  if (entries.length === 0) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => {
            const vars = entries
              .map(([key, item]) => {
                const color =
                  'theme' in item ? item.theme?.[theme as keyof typeof item.theme] : item.color
                return color ? `  --color-${key}: ${color};` : null
              })
              .filter(Boolean)
              .join('\n')
            return `${prefix}[data-chart=${id}] {\n${vars}\n}`
          })
          .join('\n'),
      }}
    />
  )
}

// ── ChartTooltip / ChartTooltipContent ─────────────────────────────────────

const ChartTooltip = RechartsPrimitive.Tooltip

type RechartsTooltipPayloadItem = {
  value?: string | number
  name?: string | number
  dataKey?: string | number
  color?: string
  payload?: unknown
  [key: string]: unknown
}

interface ChartTooltipContentProps extends Omit<React.ComponentProps<'div'>, 'color'> {
  active?: boolean
  payload?: RechartsTooltipPayloadItem[]
  label?: unknown
  labelFormatter?: (value: unknown, payload: RechartsTooltipPayloadItem[]) => React.ReactNode
  labelClassName?: string
  formatter?: (
    value: unknown,
    name: unknown,
    item: RechartsTooltipPayloadItem,
    index: number,
    payload: unknown,
  ) => React.ReactNode
  color?: string
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: 'line' | 'dot' | 'dashed'
  nameKey?: string
  labelKey?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      className,
      indicator = 'dot',
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref,
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) return null
      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || 'value'}`
      const itemConfig = getPayloadConfig(config, item, key)
      const value =
        !labelKey && typeof label === 'string'
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label
      if (labelFormatter) return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>
      if (!value) return null
      return <div className={cn('font-medium', labelClassName)}>{value}</div>
    }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey])

    if (!active || !payload?.length) return null

    const nestLabel = payload.length === 1 && indicator !== 'dot'

    return (
      <div
        ref={ref}
        // 2026-05-31 #5:自訂 tooltip 補 role=status + aria-live,保留 Recharts 原生 SR 朗讀(spec L146 宣稱鍵盤可達+讀屏)
        role="status"
        aria-live="polite"
        className={cn(
          'grid min-w-32 items-start gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-caption shadow-[var(--elevation-200)]',
          className,
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || 'value'}`
            const itemConfig = getPayloadConfig(config, item, key)
            const indicatorColor = color || (item.payload as { fill?: string })?.fill || item.color

            return (
              <div
                key={item.dataKey || index}
                className={cn(
                  'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-fg-muted',
                  indicator === 'dot' && 'items-center',
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn('shrink-0 rounded-xs border-(--color-border) bg-(--color-bg)', {
                            'h-2.5 w-2.5': indicator === 'dot',
                            'w-1': indicator === 'line',
                            'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                            'my-0.5': nestLabel && indicator === 'dashed',
                          })}
                          style={
                            {
                              '--color-bg': indicatorColor,
                              '--color-border': indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        'flex flex-1 justify-between leading-none',
                        nestLabel ? 'items-end' : 'items-center',
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-fg-secondary">{itemConfig?.label || item.name}</span>
                      </div>
                      {/* 2026-07-04 修:falsy check 會讓合法資料值 0 不渲染(shadcn 上游同病)→ null check */}
                      {item.value != null && (
                        <span className="text-foreground font-mono font-medium tabular-nums">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)
ChartTooltipContent.displayName = 'ChartTooltipContent'

// ── ChartLegend / ChartLegendContent ───────────────────────────────────────

const ChartLegend = RechartsPrimitive.Legend

type RechartsLegendPayloadItem = {
  value?: unknown
  dataKey?: string | number
  color?: string
  payload?: unknown
  [key: string]: unknown
}

interface ChartLegendContentProps extends React.ComponentProps<'div'> {
  payload?: RechartsLegendPayloadItem[]
  verticalAlign?: 'top' | 'middle' | 'bottom'
  hideIcon?: boolean
  nameKey?: string
}

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
    const { config } = useChart()
    if (!payload?.length) return null

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-4',
          verticalAlign === 'top' ? 'pb-3' : 'pt-3',
          className,
        )}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || 'value'}`
          const itemConfig = getPayloadConfig(config, item, key)
          return (
            <div
              key={String(item.value)}
              className="flex items-center gap-1.5 text-fg-secondary [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-fg-muted"
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div className="h-2 w-2 shrink-0 rounded-xs" style={{ backgroundColor: item.color }} />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
      </div>
    )
  },
)
ChartLegendContent.displayName = 'ChartLegendContent'

// ── helpers ────────────────────────────────────────────────────────────────

function getPayloadConfig(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== 'object' || payload === null) return undefined
  const payloadPayload =
    'payload' in payload && typeof payload.payload === 'object' && payload.payload !== null
      ? payload.payload
      : undefined
  let configLabelKey: string = key
  if (key in (payload as Record<string, unknown>) && typeof (payload as Record<string, unknown>)[key] === 'string') {
    configLabelKey = (payload as Record<string, string>)[key]
  } else if (payloadPayload && key in payloadPayload && typeof (payloadPayload as Record<string, unknown>)[key] === 'string') {
    configLabelKey = (payloadPayload as Record<string, string>)[key]
  }
  return configLabelKey in config ? config[configLabelKey] : config[key]
}

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const chartMeta = {
  component: 'Chart',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    bg: ['bg-surface-raised', 'bg-transparent'],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
