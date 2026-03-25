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
 * <ButtonGroup direction="vertical">
 *   <Button variant="primary">確認</Button>
 *   <Button variant="tertiary">取消</Button>
 * </ButtonGroup>
 */
interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 排列方向，預設 horizontal */
  direction?: 'horizontal' | 'vertical'
  /** 水平對齊，預設 start */
  align?: 'start' | 'center' | 'end'
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ direction = 'horizontal', align = 'start', className, children, ...props }, ref) => {
    const isVertical = direction === 'vertical'

    return (
      <ButtonGroupContext.Provider value={{ fullWidth: isVertical }}>
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

/**
 * ButtonDivider — 按鈕群組內的分隔線
 *
 * 自身左右各 4px，與相鄰按鈕形成 8px（gap）+ 4px（自身）= 12px 的視覺距離。
 *
 * @example
 * <ButtonGroup>
 *   <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
 *   <ButtonDivider />
 *   <Button variant="primary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
 * </ButtonGroup>
 */
const ButtonDivider = ({ className }: { className?: string }) => (
  <div
    aria-hidden
    className={cn(
      'self-stretch w-px mx-1 my-1',
      'bg-border',
      className,
    )}
  />
)
ButtonDivider.displayName = 'ButtonDivider'

export { ButtonGroup, ButtonDivider }
