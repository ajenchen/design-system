import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Notice } from './notice'
import { Alert } from '@/design-system/components/Alert/alert'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta<typeof Notice> = {
  title: 'Design System/Internal/Notice/展示',
  component: Notice,
  tags: ['!dev'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Notice 是 Toast / Alert 共用的視覺佈局 primitive——只負責 layout 與 icon 選擇,色彩由 consumer 透過 `data-theme` + `text-foreground` 控制。App 層級不直接使用 `<Notice>`,而是透過 `<Alert>` / `<Toast>`。以下情境直接用真的消費者 `<Alert>`(低調 / 實心兩種外觀)呈現 Notice 的樣貌;浮動的短暫通知看 Toast 展示。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof Notice>

// 2026-10-28(稽核 L042 / M044 / M045):
// - 原本本檔手抄一份 Alert 的低調 / 實心外殼(SUBTLE_CONTAINER / SOLID_BG / SOLID_THEME)把 Notice 包起來示範 → 直接用 <Alert>(登記簿 B07 有元件就用元件、B18 同一種東西一套樣式);
// - 「Toast 樣式」那則拿掉:Notice 是內部 primitive,Toast 的長相由 Toast 展示頁負責(本檔還畫錯了 —— 成功用實心綠底、說 Toast 不需要 ×);
// - 每則只放業務上真的會有的那一個動作:成功類不放動作;要跳到別頁的動作(查看部署紀錄、更新付款方式、了解更多)在範例裡沒有去處,不放;
//   能在原地做完的動作(重發邀請)接上看得見的結果。

export const DeploymentSuccess: Story = {
  name: '部署成功橫幅',
  render: () => (
    <div className="max-w-2xl">
      <Alert variant="success" title="專案已成功部署到 production 環境" />
    </div>
  ),
}

export const BillingFailed: Story = {
  name: '工作區付款失敗',
  render: () => (
    <div className="max-w-2xl">
      <Alert
        variant="error"
        appearance="solid"
        title="本月訂閱付款失敗"
        description="你的信用卡發卡行拒絕扣款。請在 7 天內更新付款方式,否則工作區將被暫停。"
      />
    </div>
  ),
}

export const InlineVariants: Story = {
  name: '行內通知變體對照',
  render: () => {
    const items: { variant: 'info' | 'warning' | 'success' | 'error' | 'neutral'; title: string; description?: string }[] = [
      { variant: 'info', title: 'Audit log 僅限 Business 方案', description: '升級後可回溯 90 天內所有成員的操作紀錄。' },
      { variant: 'warning', title: '此環境剩餘儲存空間不足 10%', description: '建議清理舊版本或升級儲存方案,避免上傳中斷。' },
      { variant: 'success', title: '兩步驟驗證已啟用' },
      { variant: 'error', title: '無法連線到 GitHub integration', description: '過去 24 小時有 3 次同步失敗,請重新授權 GitHub App。' },
      { variant: 'neutral', title: '維護視窗 4/25 02:00 – 04:00 (UTC+8)', description: '期間 Dashboard 可能暫時無法存取,CI pipelines 不受影響。' },
    ]
    return (
      <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-2xl">
        {items.map((item) => (
          <Alert key={item.variant} variant={item.variant} title={item.title} description={item.description} />
        ))}
      </div>
    )
  },
}

function PendingInviteNotice() {
  const [shown, setShown] = useState(true)
  if (!shown) return null
  return (
    <Alert
      variant="neutral"
      title="5 個成員已收到邀請 email,尚未加入工作區。"
      endContent={
        <Button variant="tertiary" size="xs" onClick={() => { setShown(false); toast({ variant: 'success', title: '已重新寄出 5 封邀請' }) }}>
          重發邀請
        </Button>
      }
    />
  )
}

export const NeutralTitleOnly: Story = {
  name: '中性純文字',
  render: () => (
    <div className="max-w-2xl">
      <Toaster />
      <PendingInviteNotice />
    </div>
  ),
}
