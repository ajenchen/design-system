import type { Meta, StoryObj } from '@storybook/react'
import { DescriptionList, DescriptionItem } from './description-list'

const meta: Meta<typeof DescriptionList> = {
  title: 'Design System/Components/DescriptionList/展示',
  component: DescriptionList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '唯讀 label + value 展示(HTML `dl / dt / dd`)。層級靠色彩區分而非字體大小。`cols` 控制欄數(1 / 2 / 3)。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof DescriptionList>

/* ── User profile(Email / Role / Team)─────────────────────────────── */
export const UserProfile: Story = {
  name: '使用者個資',
  render: () => (
    <div className="border border-border rounded-lg p-4 max-w-md">
      <DescriptionList cols={1}>
        <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
        <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
        <DescriptionItem label="職稱">Design Engineer</DescriptionItem>
        <DescriptionItem label="團隊">Design Systems</DescriptionItem>
        <DescriptionItem label="時區">UTC+8(台北)</DescriptionItem>
      </DescriptionList>
    </div>
  ),
}

/* ── Product spec(iPhone 規格對照風格)─────────────────────────────── */
export const ProductSpec: Story = {
  name: '產品規格',
  render: () => (
    <div className="border border-border rounded-lg p-4 max-w-2xl">
      <DescriptionList cols={2}>
        <DescriptionItem label="螢幕尺寸">6.7 吋 Super Retina XDR</DescriptionItem>
        <DescriptionItem label="處理器">A18 Pro</DescriptionItem>
        <DescriptionItem label="儲存容量">256GB / 512GB / 1TB</DescriptionItem>
        <DescriptionItem label="主相機">48MP 廣角 + 12MP 超廣角</DescriptionItem>
        <DescriptionItem label="電池續航">最長 29 小時影片播放</DescriptionItem>
        <DescriptionItem label="防水等級">IP68</DescriptionItem>
      </DescriptionList>
    </div>
  ),
}

/* ── 訂單明細(Stripe checkout 風格)────────────────────────────────── */
export const OrderSummary: Story = {
  name: '訂單明細',
  render: () => (
    <div className="border border-border rounded-lg p-4 max-w-md">
      <div className="text-body font-medium mb-3">訂單摘要</div>
      <DescriptionList cols={1}>
        <DescriptionItem label="訂單編號">#20260418-A241</DescriptionItem>
        <DescriptionItem label="商品">Pro 年費方案 × 5 人</DescriptionItem>
        <DescriptionItem label="小計">NT$ 12,000</DescriptionItem>
        <DescriptionItem label="折扣(首年 20% off)">−NT$ 2,400</DescriptionItem>
        <DescriptionItem label="稅金(5%)">NT$ 480</DescriptionItem>
        <DescriptionItem label="付款方式">Visa ending 4242</DescriptionItem>
        <DescriptionItem label="總金額">
          <span className="font-medium">NT$ 10,080</span>
        </DescriptionItem>
      </DescriptionList>
    </div>
  ),
}

/* ── Detail panel(三欄 dense)────────────────────────────────────── */
export const DetailPanel: Story = {
  name: '詳情面板',
  render: () => (
    <div className="border border-border rounded-lg p-4 max-w-3xl">
      <DescriptionList cols={3}>
        <DescriptionItem label="訂單狀態">已出貨</DescriptionItem>
        <DescriptionItem label="建立時間">2026-04-18 10:35</DescriptionItem>
        <DescriptionItem label="預計送達">2026-04-20</DescriptionItem>
        <DescriptionItem label="配送方式">宅配</DescriptionItem>
        <DescriptionItem label="付款方式">信用卡</DescriptionItem>
        <DescriptionItem label="追蹤編號">FX-1234567890</DescriptionItem>
      </DescriptionList>
    </div>
  ),
}

/* ── Horizontal direction(label 左 / value 右,divided=false)──────── */
export const Horizontal: Story = {
  name: '水平佈局',
  render: () => (
    <div className="border border-border rounded-lg p-4 max-w-md">
      {/* title 到第一個 item 的間距 = item 之間間距(Gestalt proximity canonical,見 spec) */}
      <div className="text-body font-medium mb-[var(--layout-space-tight)]">檔案資訊</div>
      <DescriptionList direction="horizontal">
        <DescriptionItem label="檔名">Q1-roadmap.pdf</DescriptionItem>
        <DescriptionItem label="類型">application/pdf</DescriptionItem>
        <DescriptionItem label="大小">2.4 MB</DescriptionItem>
        <DescriptionItem label="修改時間">2026-04-18</DescriptionItem>
      </DescriptionList>
    </div>
  ),
}

// @story-trait-rationale: HorizontalDivided retired 2026-05-17 per audit Dim 24/25 strict re-run —
//   違 story-rules.md L42「同 affordance 內 prop variations 用 Controls 不另開」。Horizontal direction
//   已展示;divided 是單一 prop toggle,anatomy Inspector 已 expose Controls (L85-86)。
//   原本內容 archive 於 git history(若要看 divided 視覺,進 anatomy Inspector 開 divided=true)。
//   2026-06-12:刪除 zombie export _RETIRED_HorizontalDivided,對齊 DS-wide comment-only 退役慣例(deep-audit dim25)。
