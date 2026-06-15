// @story-trait-rationale: SelectionControl 是 isInternal primitive,被 Checkbox / RadioGroup 消費;hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration);Default 由 NotificationPreferences / PlanPicker 等真實 consumer 情境覆蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { Mail, Bell, Folder, Shield } from 'lucide-react'
import { SelectionItem } from './selection-item'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'

const meta: Meta<typeof SelectionItem> = {
  title: 'Design System/Internal/SelectionControl/展示',
  component: SelectionItem,
  tags: ['!dev'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'SelectionItem 是 Checkbox 與 RadioGroup 共用的 item 佈局 primitive——提供 control + optional prefix(icon/avatar) + content(label/description) 的 3-slot 結構,並處理 `py = (field-height - 1lh) / 2` 的 padding 公式讓單行高度對齊同 size 的 Input。App 層級應使用 Checkbox / RadioGroup,不直接使用 SelectionItem——前兩個情境展示 primitive 被 Checkbox / RadioGroup 包出的樣貌;後兩個(前綴圖示 / 前綴頭像)直接以 primitive 展示 prefix slot 結構(docs 結構展示用,非 App 層用法)。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof SelectionItem>

/* ═══════════════════════════════════════════════════════════════════════════
   Story 1:Checkbox consumer — 通知偏好設定
   ═══════════════════════════════════════════════════════════════════════════ */

export const NotificationPreferences: Story = {
  name: '通知偏好',
  render: () => (
    <div className="flex flex-col gap-2 max-w-md">
      <p className="text-caption text-fg-muted mb-2">
        帳號設定頁 — 勾選要接收的通知類型。由 Checkbox 消費 SelectionItem 提供結構。
      </p>
      <Checkbox defaultChecked label="產品更新電子報" description="每兩週寄送,可隨時取消訂閱" />
      <Checkbox label="安全性警告" description="登入裝置變動、密碼變更等重要事件" />
      <Checkbox defaultChecked label="Workspace 邀請通知" />
      <Checkbox label="行銷活動優惠" description="我想收到優惠碼與限時活動資訊" />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 2:RadioGroup consumer — 計畫方案選擇
   ═══════════════════════════════════════════════════════════════════════════ */

export const PlanPicker: Story = {
  name: '方案選擇',
  render: () => (
    <div className="flex flex-col gap-2 max-w-md">
      <p className="text-caption text-fg-muted mb-2">
        帳單頁切換付款週期 — RadioGroup 消費 SelectionItem。
      </p>
      <RadioGroup defaultValue="annual" className="flex flex-col gap-2">
        <RadioGroupItem value="monthly" label="月繳" description="$12 / 月 · 可隨時取消" />
        <RadioGroupItem value="annual" label="年繳(省 20%)" description="$115 / 年 · 相當於 $9.6 / 月" />
        <RadioGroupItem value="lifetime" label="終身買斷" description="$299 一次付款 · 僅限 Pro plan" />
      </RadioGroup>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:Prefix icon(Checkbox + icon)
   ═══════════════════════════════════════════════════════════════════════════ */

export const WithPrefixIcon: Story = {
  name: '前綴圖示',
  render: () => (
    <div className="flex flex-col gap-2 max-w-md">
      <p className="text-caption text-fg-muted mb-2">
        Figma-like permission scope picker — control + icon(24px 閾值內 inline)+ label + description。
      </p>
      <SelectionItem
        control={<Checkbox defaultChecked />}
        icon={Mail}
        label="讀取 email 信箱"
        description="僅用於通知,永遠不會外流"
      />
      <SelectionItem
        control={<Checkbox />}
        icon={Folder}
        label="存取 Drive 檔案"
        description="讀取並修改你授權的資料夾"
      />
      <SelectionItem
        control={<Checkbox defaultChecked />}
        icon={Bell}
        label="推播通知權限"
      />
      <SelectionItem
        control={<Checkbox />}
        icon={Shield}
        label="Admin 層級操作"
        description="僅限 workspace owner 開啟"
        disabled
      />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:Prefix avatar block(Checkbox + avatar + description)
   ═══════════════════════════════════════════════════════════════════════════ */

export const WithPrefixAvatarBlock: Story = {
  name: '前綴頭像',
  render: () => (
    <div className="flex flex-col gap-2 max-w-md">
      <p className="text-caption text-fg-muted mb-2">
        多選 reviewer — control + avatar(32px block 模式,跟 control 一起對齊 text block center)+ name +
        role。
      </p>
      <SelectionItem
        control={<Checkbox defaultChecked />}
        avatar={{ alt: 'Ada Chen', color: 'indigo' }}
        label="Ada Chen"
        description="Design Engineer · Frontend team"
      />
      <SelectionItem
        control={<Checkbox />}
        avatar={{ alt: '張美真', color: 'magenta' }}
        label="張美真"
        description="Product Designer · Platform team"
      />
      <SelectionItem
        control={<Checkbox defaultChecked />}
        avatar={{ alt: '林伯彥', color: 'green' }}
        label="林伯彥"
        description="Staff Engineer · Infra team"
      />
    </div>
  ),
}

/* @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。 */
