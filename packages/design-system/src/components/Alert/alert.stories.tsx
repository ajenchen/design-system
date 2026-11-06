// @story-baseline: packages/design-system/src/patterns/header-canonical/header-canonical.stories.tsx#WithTabs(「固定顯示」的頁首 = 公開的 ChromeHeader,標題 h2 text-body-lg font-medium —— 嵌在 docs 頁裡的示範頁首不得再出一個 h1)
// @story-history: hasVariants/hasInteractiveStates 的 canonical core stories(AllVariants / States)
//   集中在 anatomy.stories.tsx 的 ColorMatrix + StateBehavior(Inspector 互動);本 showcase
//   提供真實業務 scenario(部署 / 系統警示)而非 trait grid 重複展示。
import { useState } from 'react'
import type { Meta } from '@storybook/react'
import { RefreshCw, Share2 } from 'lucide-react'
import { Alert } from './alert'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'

const meta: Meta = {
  title: 'Design System/Components/Alert/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '在頁面內容中持續呈現重要狀態、警告、錯誤或成功訊息，並可附帶操作。訊息需要留在閱讀脈絡供使用者處理時用 Alert；短暫回饋改用 Toast。' } },
  },
}
export default meta

// 2026-10-28(稽核 M103 / M025):展示層每則只放一個真實情境 —— 原本「單行」「含說明文字」「固定顯示」都是 5 種 variant × 低調 / 實心直疊
// (一頁 10 條 Alert、5 條 solid),違反 alert.spec.md「❌ Alert 不疊 Alert」「一個頁面最多一個 solid Alert」;
// variant × 低調 / 實心的對照由設計規格頁「色彩對照表」擁有。每條都掛著的「查看詳情」沒有規格說要去哪 → 不放(不做假動作)。
export const SingleLine = {
  name: '單行',
  render: () => (
    <div className="max-w-xl">
      <Alert variant="warning" title="免費額度剩 3 天,到期後專案會轉為唯讀" />
    </div>
  ),
}

export const WithDescription = {
  name: '含說明文字',
  render: () => (
    <div className="max-w-xl">
      <Alert variant="error" title="付款失敗" description="這個月的訂閱扣款沒有成功,請檢查卡號或改用其他付款方式。" />
    </div>
  ),
}

// 右上角操作群組:關閉鈕左邊有其他操作時,分隔線由 DS 自動放(誤觸保護);使用端只要傳 endContent。
// 2026-10-28 前三顆都沒有作用(× 接空函式、重新整理 / 分享沒有 onClick)→ × 真的移除這條、重新整理 = 同步完成後移除並跳 Toast、
// 分享 = 複製連結跳 Toast(複製類 neutral、不帶 action,toast.spec.md 變體表)。原本畫在展示頁的 ✅ / ❌ 對照搬到設計原則頁(稽核 L113)。
function DeployCommitAlert() {
  const [shown, setShown] = useState(true)
  if (!shown) return null
  return (
    <Alert
      variant="warning"
      appearance="subtle"
      title="部署管線偵測到新的 commit"
      description="點「重新整理」同步最新狀態,或忽略此訊息繼續目前作業。"
      onDismiss={() => setShown(false)}
      endContent={
        <>
          <Button iconOnly size="xs" variant="text" startIcon={RefreshCw} aria-label="重新整理" onClick={() => { setShown(false); toast({ title: '已同步到最新的部署狀態' }) }} />
          <Button iconOnly size="xs" variant="text" startIcon={Share2} aria-label="分享連結" onClick={() => toast({ title: '已複製連結' })} />
        </>
      }
    />
  )
}

export const CornerActionGroup = {
  name: '右上角操作群組',
  parameters: { docs: { description: { story: 'Alert 右上角是操作按鈕群組:關閉鈕左側可以並排重新整理、分享等按鈕,全部用同一種最小尺寸的純圖示按鈕;關閉鈕左邊有其他操作時,分隔線由 DS 自動放。' } } },
  render: () => (
    <div className="max-w-lg">
      <Toaster />
      <DeployCommitAlert />
    </div>
  ),
}

// 固定顯示:頁首底下只放一條真實的全域警告(同設計原則頁「系統維護中」);原本 5 條 subtle + 5 條 solid 疊在頁首下(稽核 M103)
export const Fixed = {
  name: '固定顯示',
  parameters: { docs: { description: { story: '固定在頁首底下,無圓角、滿版寬度,用於全站層級的公告。' } } },
  render: () => (
    <div className="border border-divider rounded-lg overflow-hidden">
      <ChromeHeader className="bg-surface">
        <h2 className="flex-1 truncate text-body-lg font-medium text-foreground">專案設定</h2>
      </ChromeHeader>
      <Alert variant="info" placement="fixed" title="系統維護中" description="2026-04-20 02:00-04:00 進行系統升級,部分功能暫停" />
      <div className="p-[var(--layout-space-loose)] text-fg-muted text-caption">調整此專案的權限與通知偏好。變更會立刻套用到所有成員。</div>
    </div>
  ),
}
