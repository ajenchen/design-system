import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Search, Eye, EyeOff, X } from 'lucide-react'
import { Input } from './input'
import { Field, FieldLabel, FieldError } from '@/design-system/components/Field/field'
import { Button } from '@/design-system/components/Button/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

const meta: Meta<typeof Input> = {
  title: 'Design System/Components/Input/展示',
  component: Input,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Input>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-sm">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <p className="text-caption text-fg-muted mb-3">Focus 時邊框變 primary</p>
        <Input defaultValue="Wireless Bluetooth Headphones" placeholder="輸入商品名稱" aria-label="商品名稱(edit mode demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">display</h3>
        <p className="text-caption text-fg-muted mb-3">純展示（read-only 內容）— 無 input chrome / 無互動 affordance</p>
        <Input mode="display" value="Wireless Bluetooth Headphones" aria-label="商品名稱(display mode demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <p className="text-caption text-fg-muted mb-3">neutral-2 底色、無邊框、文字正常色</p>
        <Input mode="readonly" defaultValue="Wireless Bluetooth Headphones" aria-label="商品名稱(readonly mode demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <p className="text-caption text-fg-muted mb-3">停用原因用 Tooltip 或 Form help text 說明</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Input mode="disabled" defaultValue="Wireless Bluetooth Headphones" aria-label="商品名稱(disabled mode demo)" />
            </div>
          </TooltipTrigger>
          <TooltipContent>此欄位在免費方案中不可用</TooltipContent>
        </Tooltip>
      </div>
    </div>
  ),
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸與 Button 對齊',
  render: () => (
    <div className="flex flex-col gap-4">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex items-center gap-3">
          <Input size={size} defaultValue="Wireless Bluetooth Headphones" className="max-w-xs" />
          <Button variant="primary" size={size}>送出</Button>
          <span className="text-caption text-fg-muted">size="{size}"</span>
        </div>
      ))}
    </div>
  ),
}

/* @story-trait-rationale: WithIcon retired per F migration 2026-05-15 — anatomy.stories.tsx auto-compile owns icon slot showcase。 */
/* ── endAction（Inline Action 宣告式 API） ── */
export const EndAction: Story = {
  name: '尾端操作',
  render: () => {
    const [showPwd, setShowPwd] = React.useState(false)
    const [query, setQuery] = React.useState('Bluetooth')
    const [queryLg, setQueryLg] = React.useState('Bluetooth')

    return (
      <div className="flex flex-col gap-6 max-w-sm">
        <div>
          <p className="text-caption text-fg-muted mb-1">顯示/隱藏密碼 — 宣告式 API，Field 自動決定 icon 尺寸和 hover 背景</p>
          <Input
            type={showPwd ? 'text' : 'password'}
            defaultValue="my-secret-123"
            endAction={{
              icon: showPwd ? EyeOff : Eye,
              label: showPwd ? '隱藏密碼' : '顯示密碼',
              onClick: () => setShowPwd(!showPwd),
            }}
          />
        </div>
        <div>
          <p className="text-caption text-fg-muted mb-1">清除 — 有值時出現，清空後消失，不佔位</p>
          <Input
            startIcon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
          />
        </div>
        <div>
          <p className="text-caption text-fg-muted mb-1">Size lg — endAction icon 自動放大到 20px，與 startIcon 對稱</p>
          <Input
            size="lg"
            startIcon={Search}
            value={queryLg}
            onChange={(e) => setQueryLg(e.target.value)}
            endAction={queryLg ? { icon: X, label: '清除搜尋', onClick: () => setQueryLg('') } : undefined}
          />
        </div>
      </div>
    )
  },
}

/* ── Error ── */
// 2026-07-04 audit Dim 24/M23(d):錯誤訊息改消費 Field + FieldError primitive(對齊 Textarea / TimePicker /
// Rating showcase idiom),不手刻 <p text-error>(重複 FieldError 內部樣式 = drift 來源)。
export const ErrorState: Story = {
  name: '錯誤狀態',
  render: () => (
    <div className="flex flex-col gap-4 max-w-sm">
      <p className="text-caption text-fg-muted">Error 以紅色邊框表示。錯誤訊息由 FieldError 提供，不在 input 內放狀態 icon</p>
      {/* Field invalid 自動 cascade 到 Input(useResolvedFieldInvalid),不需重複傳 error;
          standalone <Input error> 用法由 anatomy「+ error prop」section 展示 */}
      <Field invalid>
        <FieldLabel>Email</FieldLabel>
        <Input defaultValue="invalid-email@" />
        <FieldError>請輸入有效的 email 地址</FieldError>
      </Field>
    </div>
  ),
}

// @story-trait-rationale: BorderStates retired 2026-05-17 per audit Dim 24/25 strict re-run —
//   anatomy.stories.tsx StateBehavior「Focus — border-primary」section 已 cover hover/focus 邊框互動
//   (同 2 inputs 同 placeholder「點擊或 Tab 觀察 focus 邊框」)。Showcase tier 展示 anatomy 已覆蓋
//   不教新原則 = retire。ErrorState 已滿足 isInputLike + hasInteractiveStates trait mandate。
