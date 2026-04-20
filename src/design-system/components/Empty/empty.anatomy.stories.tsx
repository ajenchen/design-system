import type { Meta, StoryObj } from '@storybook/react'
import { Inbox, Search, FileText } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Empty/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Empty 是 layout pattern——排列 Icon + Title + Description + Action 成居中垂直堆疊。預設只有 description,icon / title / action 全部可選。</Desc>
        <div className="border border-border rounded-lg p-8">
          <Empty
            icon={Inbox}
            title="沒有訊息"
            description="當您收到新訊息時,會在這裡顯示"
            action={<Button variant="primary" size="sm">發送第一則訊息</Button>}
          />
        </div>
      </div>

      <div>
        <H3>Slot 與 Spacing</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Slot</Th><Th>可選</Th><Th>Typography</Th><Th>上方間距</Th></tr></thead>
            <tbody>
              <tr><Td mono>icon</Td><Td>選填</Td><Td>Avatar 48px neutral + icon</Td><Td>—</Td></tr>
              <tr><Td mono>title</Td><Td>選填</Td><Td>16px font-medium centered</Td><Td mono>--layout-space-tight</Td></tr>
              <tr><Td mono>description</Td><Td>必有(預設唯一 slot)</Td><Td>14px fg-secondary centered</Td><Td mono>mt-0.5(2px,跟 item-layout 一致)</Td></tr>
              <tr><Td mono>action</Td><Td>選填</Td><Td>CTA Button</Td><Td mono>--layout-space-loose</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['icon', 'LucideIcon', '—', 'Avatar 48px 內的 icon'],
                ['title', 'string', '—', '主要標題(16px medium)'],
                ['description', 'string', '必填(預設唯一 slot)', '說明文字(14px fg-secondary)'],
                ['action', 'ReactNode', '—', 'CTA button / 操作區'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const ScenarioMatrix: Story = {
  name: '常見場景',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Table 空資料</H3>
        <div className="border border-border rounded-lg p-8">
          <Empty description="無資料" className="py-12" />
        </div>
      </div>

      <div>
        <H3>SelectMenu 搜尋無結果</H3>
        <div className="border border-border rounded-lg p-4 max-w-xs">
          <Empty icon={Search} description="找不到符合的項目" className="py-6" />
        </div>
      </div>

      <div>
        <H3>Page section 初次引導</H3>
        <div className="border border-border rounded-lg p-8">
          <Empty
            icon={FileText}
            title="還沒有專案"
            description="建立第一個專案開始追蹤您的任務"
            action={<Button variant="primary">建立專案</Button>}
          />
        </div>
      </div>
    </div>
  ),
}

export const SlotCombinations: Story = {
  name: 'Slot 組合(description only → full)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>四種 slot 組合 — 從最小到最完整</H3>
        <Desc>
          Empty 是純 layout 元件——consumer 依 context 決定要顯示多少 slot。**最少只要 `description`**
          (預設唯一必填 slot),icon / title / action 全部是 opt-in。選擇時問自己:「使用者需要多強的
          引導?」——越初次 / 越重要的空狀態,slot 越多。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>場景強度</Th>
                <Th>Slot 組合</Th>
                <Th>適合情境</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>最低(僅提示)</Td><Td mono>description</Td><Td>DataTable 無資料、篩選無結果</Td></tr>
              <tr><Td>輕引導</Td><Td mono>icon + description</Td><Td>Dropdown 搜尋無結果</Td></tr>
              <tr><Td>中引導</Td><Td mono>icon + title + description</Td><Td>收件匣空、無留言</Td></tr>
              <tr><Td>初次引導(full)</Td><Td mono>icon + title + description + action</Td><Td>第一次使用功能、onboarding empty</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>組合 1:僅 description(DataTable 空)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty description="無符合條件的訂單" className="py-6" />
        </div>
      </div>

      <div>
        <H3>組合 2:icon + description(Dropdown 搜尋無結果)</H3>
        <div className="border border-border rounded-lg p-4 max-w-xs">
          <Empty icon={Search} description="找不到符合的項目" className="py-6" />
        </div>
      </div>

      <div>
        <H3>組合 3:icon + title + description(收件匣空)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty
            icon={Inbox}
            title="收件匣已清空"
            description="所有訊息都處理完畢,可以好好休息了"
          />
        </div>
      </div>

      <div>
        <H3>組合 4:Full slots(onboarding empty)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty
            icon={FileText}
            title="還沒有專案"
            description="建立第一個專案,邀請團隊成員協作追蹤進度"
            action={<Button variant="primary">建立專案</Button>}
          />
        </div>
      </div>

      <div>
        <H3>Slot 間距規則</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>關係</Th>
                <Th>Spacing token</Th>
                <Th>數值</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>icon → title</Td><Td mono>--layout-space-tight</Td><Td>12/16 px(density)</Td></tr>
              <tr><Td>title → description</Td><Td mono>mt-0.5</Td><Td>2px(緊密配對,跟 item-layout 一致)</Td></tr>
              <tr><Td>description → action</Td><Td mono>--layout-space-loose</Td><Td>24/32 px(density)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}
