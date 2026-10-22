import type { Meta, StoryObj } from '@storybook/react'
import { Notice, useInverseTheme, SUBTLE_ICON_COLOR, type NoticeVariant } from './notice'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof Notice> = {
  title: 'Design System/Internal/Notice/展示',
  component: Notice,
  tags: ['!dev'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Notice 是 Toast / Alert 共用的視覺佈局 primitive——只負責 layout 與 icon 選擇,色彩由 consumer 透過 `data-theme` + `text-foreground` 控制。App 層級不直接使用 `<Notice>`,而是透過 `<Alert>` / `<Toast>`。以下情境展示 Notice 被 consumer 包成兩種視覺風格(subtle / solid)後的樣貌。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof Notice>

/* ═══════════════════════════════════════════════════════════════════════════
   共用:模擬 Alert 的 subtle / solid 外殼
   ─ Notice 本身不含 bg / border——這裡補上 consumer 才會加的 surface
   ═══════════════════════════════════════════════════════════════════════════ */

const SUBTLE_CONTAINER: Record<NoticeVariant, string> = {
  neutral: 'bg-muted border border-border',
  info: 'bg-info-subtle border border-[var(--info-text)]',
  success: 'bg-success-subtle border border-[var(--success-text)]',
  warning: 'bg-warning-subtle border border-[var(--warning-text)]',
  error: 'bg-error-subtle border border-[var(--error-text)]',
}

const SOLID_BG: Record<Exclude<NoticeVariant, 'neutral'>, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
}

const SOLID_THEME: Record<Exclude<NoticeVariant, 'neutral'>, 'dark' | 'light'> = {
  info: 'dark',
  success: 'dark',
  warning: 'light',
  error: 'dark',
}

function SubtleShell({
  variant,
  children,
}: {
  variant: NoticeVariant
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-md overflow-hidden text-foreground ${SUBTLE_CONTAINER[variant]}`}>
      {children}
    </div>
  )
}

function SolidShell({
  variant,
  children,
}: {
  variant: NoticeVariant
  children: React.ReactNode
}) {
  const inverse = useInverseTheme()
  if (variant === 'neutral') {
    return (
      <div
        data-theme={inverse}
        className="rounded-md overflow-hidden bg-surface-raised text-foreground"
      >
        {children}
      </div>
    )
  }
  const hue = variant as Exclude<NoticeVariant, 'neutral'>
  return (
    <div className={`rounded-md overflow-hidden ${SOLID_BG[hue]}`}>
      <div data-theme={SOLID_THEME[hue]} className="text-foreground">
        {children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 1:部署成功通知(單行 subtle success)
   ═══════════════════════════════════════════════════════════════════════════ */

export const DeploymentSuccess: Story = {
  name: '部署成功 橫幅',
  render: () => (
    <div className="max-w-2xl">
      <SubtleShell variant="success">
        <Notice
          variant="success"
          iconClassName={SUBTLE_ICON_COLOR.success}
          title="專案已成功部署到 production 環境"
          endContent={
            <Button variant="tertiary" size="xs">
              查看部署紀錄
            </Button>
          }
        />
      </SubtleShell>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 2:Workspace 付款失敗(solid error + 補救 action)
   ═══════════════════════════════════════════════════════════════════════════ */

export const BillingFailed: Story = {
  name: '工作區付款失敗',
  render: () => (
    <div className="max-w-2xl">
      <SolidShell variant="error">
        <Notice
          variant="error"
          title="本月訂閱付款失敗"
          description="你的信用卡發卡行拒絕扣款。請在 7 天內更新付款方式,否則工作區將被暫停。"
          endContent={
            <Button variant="tertiary" size="xs">
              更新付款方式
            </Button>
          }
        />
      </SolidShell>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:功能限定於進階方案(subtle info + 多變體對照)
   ═══════════════════════════════════════════════════════════════════════════ */

export const InlineVariants: Story = {
  name: '行內通知變體對照',
  render: () => {
    const items: { variant: NoticeVariant; title: string; description?: string }[] = [
      {
        variant: 'info',
        title: 'Audit log 僅限 Business 方案',
        description: '升級後可回溯 90 天內所有成員的操作紀錄。',
      },
      {
        variant: 'warning',
        title: '此環境剩餘儲存空間不足 10%',
        description: '建議清理舊版本或升級儲存方案,避免上傳中斷。',
      },
      {
        variant: 'success',
        title: '兩步驟驗證已啟用',
      },
      {
        variant: 'error',
        title: '無法連線到 GitHub integration',
        description: '過去 24 小時有 3 次同步失敗,請重新授權 GitHub App。',
      },
      {
        variant: 'neutral',
        title: '維護視窗 4/25 02:00 – 04:00 (UTC+8)',
        description: '期間 Dashboard 可能暫時無法存取,CI pipelines 不受影響。',
      },
    ]
    return (
      <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-2xl">
        {items.map((item) => (
          <SubtleShell key={item.variant} variant={item.variant}>
            <Notice
              variant={item.variant}
              iconClassName={SUBTLE_ICON_COLOR[item.variant]}
              title={item.title}
              description={item.description}
              endContent={
                <Button variant="tertiary" size="xs">
                  了解更多
                </Button>
              }
            />
          </SubtleShell>
        ))}
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:Toast 短暫通知(solid,不可 dismiss — sonner 自動關)
   ═══════════════════════════════════════════════════════════════════════════ */

export const ToastLikeSolid: Story = {
  name: 'Toast 樣式',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-md">
      <p className="text-caption text-fg-muted">
        浮動自動消失的 toast 通常不需要 dismiss 按鈕——關閉由計時器控制。
      </p>
      <div className="flex flex-col gap-[var(--layout-space-loose)]">
        <SolidShell variant="success">
          <Notice
            variant="success"
            title="變更已儲存"
            dismissible={false}
          />
        </SolidShell>
        <SolidShell variant="info">
          <Notice
            variant="info"
            title="已複製連結到剪貼簿"
            dismissible={false}
          />
        </SolidShell>
        <SolidShell variant="error">
          <Notice
            variant="error"
            title="上傳失敗"
            description="檔案超過 25 MB 上限。"
            dismissible={false}
            endContent={
              <Button variant="tertiary" size="xs">
                重試
              </Button>
            }
          />
        </SolidShell>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 5:只有 title(neutral 無 icon)
   ═══════════════════════════════════════════════════════════════════════════ */

export const NeutralTitleOnly: Story = {
  name: '中性 純文字',
  render: () => (
    <div className="max-w-2xl">
      <SubtleShell variant="neutral">
        <Notice
          variant="neutral"
          title="5 個成員已收到邀請 email,尚未加入工作區。"
          endContent={
            <Button variant="tertiary" size="xs">
              重發邀請
            </Button>
          }
        />
      </SubtleShell>
    </div>
  ),
}
