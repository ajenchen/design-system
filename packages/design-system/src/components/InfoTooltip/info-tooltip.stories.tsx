import type { Meta, StoryObj } from '@storybook/react-vite'
import { InfoTooltip } from './info-tooltip'
import { Switch } from '@/design-system/components/Switch/switch'

const meta: Meta<typeof InfoTooltip> = {
  title: 'Design System/Components/InfoTooltip/展示',
  component: InfoTooltip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '標題或數值旁的 ⓘ:滑過或用 Tab 聚焦時顯示一句補充說明,點下去不做事。欄位標籤旁不用自己放,FieldLabel 的 info 已內建。預設 16,放在不可點的列裡跟著列的尺寸;覺得不夠大再自己傳 size。與旁邊文字的距離 4px 由放它的行內容器給。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof InfoTooltip>

// 區塊標題旁:帳單設定頁的兩個區塊,標題旁的 ⓘ 都用預設尺寸(16,info-tooltip.spec.md「尺寸」)。
// 標題 ↔ ⓘ 4px:行內容器 inline-flex items-center gap-1(同 FieldLabel 那一行的寫法;元件本身不帶外距,spec「與旁邊文字的距離」)。
// ⓘ 放在標題元素外面:放進 <h3> 裡,標題的讀屏名稱會連說明一起念(spec「A11y 預設」)。
export const SectionHeading: Story = {
  name: '區塊標題旁',
  render: () => (
    <div className="flex max-w-md flex-col gap-[var(--layout-space-loose)]">
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <div className="inline-flex items-center gap-1">
          <h3 className="text-body-lg font-medium text-foreground">帳單資訊</h3>
          <InfoTooltip info="每月 1 號結算上個月的用量,帳單寄到帳單聯絡人信箱" />
        </div>
        <p className="text-body text-fg-secondary">Acme 設計團隊 · 年繳方案 · 下次結算 2026-12-01</p>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <div className="inline-flex items-center gap-1">
          <h4 className="text-body font-medium text-foreground">付款方式</h4>
          <InfoTooltip info="信用卡到期前 30 天會寄信提醒更新" />
        </div>
        <p className="text-body text-fg-secondary">Visa 末四碼 4242 · 2027/08 到期</p>
      </div>
    </div>
  ),
}

// 設定區塊標題旁:下面「自動封存已完成任務」是 Switch 設定列(標題 + 說明 + 開關,switch.spec.md「設定列 vs 水平 Field」),
// ⓘ 放在這一組設定的小標「任務封存」旁,不放進 Switch 的 label:Switch 的標題是 <label>,HTML 不准 <label> 裡再放按鈕
// (info-tooltip.spec.md「A11y 預設」;同 FieldLabel 把 ⓘ 放在 <label> 外的理由)。小標 ↔ 設定列 = tight(標題區 → 內容,layoutSpace.spec.md)。
export const SettingsGroupHeading: Story = {
  name: '設定區塊標題旁',
  render: () => (
    <div className="flex max-w-md flex-col gap-[var(--layout-space-tight)]">
      <div className="inline-flex items-center gap-1">
        <h4 className="text-body font-medium text-foreground">任務封存</h4>
        <InfoTooltip info="封存的任務不會出現在看板與搜尋結果,可以在「封存區」找回" />
      </div>
      <Switch label="自動封存已完成任務" description="完成滿 30 天的任務會移到封存區" defaultChecked />
    </div>
  ),
}

// 單一數值旁:儀表板的用量卡片,ⓘ 說明數字怎麼算(一句話;要兩句以上改寫在卡片說明裡,spec「何時不用」)。
export const MetricLabel: Story = {
  name: '數值標籤旁',
  render: () => (
    <div className="flex w-64 flex-col rounded-md border border-border p-[var(--layout-space-loose)]">
      {/* 文字 ↔ ⓘ 4px:同 FieldLabel 那一行的行內寫法(span inline-flex gap-1,layoutSpace 的行內微距) */}
      <span className="inline-flex items-center gap-1">
        <span className="text-body text-fg-secondary">本月 API 呼叫次數</span>
        <InfoTooltip info="只算成功的呼叫;重試的那一次不重複計算" />
      </span>
      <span className="text-h4 text-foreground">12,840</span>
    </div>
  ),
}
