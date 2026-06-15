import type { Meta } from '@storybook/react'
import { Notice, type NoticeVariant } from '@/design-system/components/Notice/notice'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from './toast'

const meta: Meta = {
  title: 'Design System/Components/Toast/展示',
  parameters: { layout: 'padded' },
}
export default meta

const VARIANTS: NoticeVariant[] = ['neutral', 'success', 'warning', 'error']
const LABELS: Record<string, string> = {
  neutral: '檔案已複製到剪貼簿',
  success: '專案已儲存',
  warning: '即將到期的訂閱',
  error: '無法連線伺服器',
}
const ACTIONS: Record<string, string> = {
  neutral: '復原',
  success: '查看',
  warning: '續訂',
  error: '重試',
}
const DESCRIPTIONS: Record<string, string> = {
  neutral: '「Q3 營收報表.xlsx」已加入剪貼簿',
  success: '變更已同步到所有成員',
  warning: '7 天後將停用,請前往結算頁續訂',
  error: '請檢查網路後再試一次',
}

/**
 * 靜態 Toast 展示——完全複製 Toast.tsx 的三層結構:
 * 1. Shadow wrapper: rounded-lg + elevation-200
 * 2. Bg layer: bg-{color}
 * 3. Theme layer: data-theme + text-foreground
 *
 * pageTheme 模擬頁面 theme,用來計算 inverse。
 */
function StaticToast({ variant, title, description, pageTheme }: {
  variant: NoticeVariant; title: string; description?: string; pageTheme: 'light' | 'dark'
}) {
  const inverse = pageTheme === 'light' ? 'dark' : 'light'
  const isInverse = variant === 'neutral' || variant === 'success'
  const actionBtn = <Button variant="tertiary" size="xs">{ACTIONS[variant]}</Button>

  // ── inverse: bg + theme 同層 ──
  if (isInverse) {
    return (
      <div className="rounded-lg overflow-hidden w-[360px]" style={{ boxShadow: 'var(--elevation-200)' }}>
        <div data-theme={inverse} className="bg-surface-raised text-foreground">
          <Notice variant={variant} title={title} description={description}
            iconClassName={variant === 'success' ? 'text-success' : undefined}
            endContent={actionBtn} />
        </div>
      </div>
    )
  }

  // ── 有色相: bg outer + theme inner ──
  const bg = variant === 'warning' ? 'bg-warning' : variant === 'error' ? 'bg-error' : 'bg-info'
  const theme = variant === 'warning' ? 'light' : 'dark'

  return (
    <div className="rounded-lg overflow-hidden w-[360px]" style={{ boxShadow: 'var(--elevation-200)' }}>
      <div className={bg}>
        <div data-theme={theme} className="text-foreground">
          <Notice variant={variant} title={title} description={description} endContent={actionBtn} />
        </div>
      </div>
    </div>
  )
}

function modeLabel(variant: NoticeVariant, pageTheme: 'light' | 'dark') {
  if (variant === 'warning') return 'light'
  if (variant === 'neutral' || variant === 'success') return pageTheme === 'light' ? 'dark' : 'light'
  return 'dark'
}

export const WithDescription = {
  name: '有標題與描述',
  render: () => (
    <div className="flex gap-16">
      <div className="flex flex-col gap-4">
        <span className="text-caption text-fg-secondary font-medium">light mode</span>
        <div className="flex flex-col gap-3 p-8 rounded-lg bg-canvas border border-divider">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-4">
              <span className="text-caption text-fg-secondary w-24 shrink-0">套 {modeLabel(v, 'light')} theme</span>
              <StaticToast variant={v} title={LABELS[v]} description={DESCRIPTIONS[v]} pageTheme="light" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4" data-theme="dark">
        <span className="text-caption text-fg-secondary font-medium">dark mode</span>
        <div className="flex flex-col gap-3 p-8 rounded-lg bg-canvas border border-divider">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-4">
              <span className="text-caption text-fg-secondary w-24 shrink-0">套 {modeLabel(v, 'dark')} theme</span>
              <StaticToast variant={v} title={LABELS[v]} description={DESCRIPTIONS[v]} pageTheme="dark" />
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const Interactive = {
  name: '互動測試',
  render: () => (
    <div className="flex flex-col gap-4">
      <span className="text-caption text-fg-muted">點按鈕觸發 Toast</span>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => toast({ title: '檔案已複製到剪貼簿', action: { label: '復原', onClick: () => {} } })}>複製檔案</Button>
        <Button variant="secondary" onClick={() => toast({ variant: 'success', title: '專案已儲存', description: '變更已同步到所有成員', action: { label: '查看', onClick: () => {} } })}>儲存專案</Button>
        <Button variant="secondary" onClick={() => toast({ variant: 'warning', title: '即將到期的訂閱', description: '7 天後將停用,請前往結算頁續訂', action: { label: '續訂', onClick: () => {} } })}>訂閱提醒</Button>
        <Button variant="secondary" onClick={() => toast({ variant: 'error', title: '無法連線伺服器', description: '請檢查網路後再試一次', action: { label: '重試', onClick: () => {} } })}>斷線示範</Button>
      </div>
      <Toaster />
    </div>
  ),
}
