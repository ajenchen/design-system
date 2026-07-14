import type { Meta } from '@storybook/react'
import { Notice, type NoticeVariant } from '@/design-system/components/Notice/notice'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from './toast'

const meta: Meta = {
  title: 'Design System/Components/Toast/展示',
  parameters: { layout: 'padded' },
}
export default meta

// 2026-07-04 audit:補 'info'(NoticeVariant 5 值,原漏 → 靜態雙 theme 對照未涵蓋全 variant)
// 2026-07-14 Dim 68 修:原 warning =「訂閱 7 天後停用 + 續訂 CTA」= 持久帳務狀態 + 強制 CTA,
// 違反 toast.spec.md「持久性系統狀態(方案過期)→ Alert」+「❌ 不把需要 user action 的內容
// 放 Toast(action 僅限復原類非必要後手)」。改為短暫操作回饋(匯入部分完成)+ 非必要「查看」後手。
const VARIANTS: NoticeVariant[] = ['neutral', 'info', 'success', 'warning', 'error']
const LABELS: Record<string, string> = {
  neutral: '檔案已複製到剪貼簿',
  info: '新版本 v2.4 可用',
  success: '專案已儲存',
  warning: '匯入部分完成',
  error: '無法連線伺服器',
}
const ACTIONS: Record<string, string> = {
  neutral: '復原',
  info: '查看更新',
  success: '查看',
  warning: '查看',
  error: '重試',
}
const DESCRIPTIONS: Record<string, string> = {
  neutral: '「Q3 營收報表.xlsx」已加入剪貼簿',
  info: '重新整理頁面即可套用新功能',
  success: '變更已同步到所有成員',
  warning: '120 筆已匯入,3 筆格式錯誤被略過',
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
        <Button variant="secondary" onClick={() => toast({ variant: 'warning', title: '匯入部分完成', description: '120 筆已匯入,3 筆格式錯誤被略過', action: { label: '查看', onClick: () => {} } })}>匯入資料</Button>
        <Button variant="secondary" onClick={() => toast({ variant: 'error', title: '無法連線伺服器', description: '請檢查網路後再試一次', action: { label: '重試', onClick: () => {} } })}>斷線示範</Button>
      </div>
      <Toaster />
    </div>
  ),
}
