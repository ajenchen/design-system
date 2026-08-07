import * as React from 'react'
import { cn } from '@/lib/utils'
import { ButtonGroupContext } from './button'

/**
 * ButtonGroup — 按鈕群組容器
 *
 * 負責群組內的間距（gap 8px）與對齊方式。
 * 垂直排列時透過 ButtonGroupContext 讓所有直接子 Button 自動套用 fullWidth，
 * 無需 cloneElement — 符合 shadcn 的 Context 慣例。
 *
 * @example
 * // 水平排列（預設）
 * <ButtonGroup>
 *   <Button variant="primary">確認</Button>
 *   <Button variant="tertiary">取消</Button>
 * </ButtonGroup>
 *
 * // 靠右對齊（primary 放右側）
 * <ButtonGroup align="end">
 *   <Button variant="tertiary">取消</Button>
 *   <Button variant="primary">確認</Button>
 * </ButtonGroup>
 *
 * // 垂直排列（fullWidth 自動套用）
 * <ButtonGroup orientation="vertical">
 *   <Button variant="primary">確認</Button>
 *   <Button variant="tertiary">取消</Button>
 * </ButtonGroup>
 */
interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 排列方向，預設 horizontal */
  orientation?: 'horizontal' | 'vertical'
  /** 水平對齊，預設 start */
  align?: 'start' | 'center' | 'end'
}

// Module-level 常數(2026-04-22 D3 perf audit):provider value 為 2 狀態 boolean,hoist 避免 render 重建
const BUTTON_GROUP_CTX_VERTICAL = { fullWidth: true } as const
const BUTTON_GROUP_CTX_HORIZONTAL = { fullWidth: false } as const

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ orientation = 'horizontal', align = 'start', className, children, ...props }, ref) => {
    const isVertical = orientation === 'vertical'

    return (
      <ButtonGroupContext.Provider value={isVertical ? BUTTON_GROUP_CTX_VERTICAL : BUTTON_GROUP_CTX_HORIZONTAL}>
        <div
          ref={ref}
          className={cn(
            'flex gap-2',
            isVertical ? 'flex-col items-stretch' : 'flex-row items-center flex-wrap',
            !isVertical && align === 'center' && 'justify-center',
            !isVertical && align === 'end'    && 'justify-end',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </ButtonGroupContext.Provider>
    )
  }
)
ButtonGroup.displayName = 'ButtonGroup'

export interface ButtonDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 群組排列方向。橫排群組畫直線（預設），直排群組畫橫線。寫死方向會讓
   * `<ButtonGroup orientation="vertical">` 出現方向錯誤的線。
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * 是否對輔助科技宣告語意。預設 `true`（純視覺）→ `role="none"`，與 Separator primitive
   * 預設一致（separator.spec.md:102「純視覺分隔，SR 不朗讀」）。動作群組的分組語意已由排列
   * 順序與間距表達，線本身不切分內容，故不朗讀。
   */
  decorative?: boolean
}

/**
 * ButtonDivider — action region 群組分隔線
 *
 * **幾何 SSOT** → `patterns/action-bar/action-bar.spec.md`「分隔線幾何」：
 * 線長 = 所在那一列**最高元件**的高度 − `--action-divider-inset`（8px），不短於
 * `--action-divider-min`（16px），垂直置中。
 *
 * 兩層構造是必要的而非包裝：外層 `self-stretch` 取「該列最高元件」當基準——同一列的每條線
 * 因此必然等長、不會參差；內層畫線並套 inset 與地板，置中由外層 `items-center` 負責，所以
 * 地板生效時線仍置中。單層寫法（`self-stretch` + `min-h`）會被釘在行首，地板一啟動線就歪掉。
 * 外層佔位與舊寫法完全相同，改動不位移任何同列元素。
 *
 * **前提**：必須放在自動高度的 cluster 內。直接置於固定高度容器（如 48px chrome header）時
 * 基準會退化成容器高——CSS 無法在容器有明確高度時看見「最高手足」。由
 * `scripts/test-action-divider-placement.mjs` 機械把關。
 *
 * **水平間距**：自身兩端各 4px，與 `gap-2` 容器合成 12px 視覺距離。
 *
 * @example
 * <ButtonGroup>
 *   <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
 *   <ButtonDivider />
 *   <Button variant="primary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
 * </ButtonGroup>
 */
const ButtonDivider = React.forwardRef<HTMLDivElement, ButtonDividerProps>(
  ({ className, orientation = 'vertical', decorative = true, ...props }, ref) => {
    const isVertical = orientation === 'vertical'
    return (
      <div
        ref={ref}
        role={decorative ? 'none' : 'separator'}
        aria-orientation={decorative ? undefined : orientation}
        data-orientation={orientation}
        // 穩定標記:讓像素量測(scripts/measure-action-dividers.mjs)只鎖 action region 群組線,
        // 不會誤抓版面切分家族(DataTable 欄界 / 欄寬把手 / Steps connector — 那些不適用本幾何)。
        data-action-divider=""
        className={cn(
          'flex shrink-0 self-stretch',
          isVertical ? 'w-px mx-1 items-center' : 'h-px my-1 justify-center',
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            'bg-divider',
            isVertical
              ? 'w-px h-[calc(100%-var(--action-divider-inset))] min-h-[var(--action-divider-min)]'
              : 'h-px w-[calc(100%-var(--action-divider-inset))] min-w-[var(--action-divider-min)]',
          )}
        />
      </div>
    )
  },
)
ButtonDivider.displayName = 'ButtonDivider'

export { ButtonGroup, ButtonDivider }
