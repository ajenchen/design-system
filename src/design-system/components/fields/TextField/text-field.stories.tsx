import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Search, Mail, Eye, EyeOff, X } from 'lucide-react'
import { TextField } from './text-field'
import { Button } from '@/design-system/components/Button/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

const meta: Meta<typeof TextField> = {
  title: 'Design System/Components/Fields/TextField',
  component: TextField,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof TextField>

/* ── 三種模式 ── */
export const Modes: Story = {
  name: '三種模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-sm">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <p className="text-caption text-fg-muted mb-3">Focus 時邊框變 primary</p>
        <TextField defaultValue="Wireless Bluetooth Headphones" placeholder="輸入商品名稱" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <p className="text-caption text-fg-muted mb-3">neutral-2 底色、無邊框、文字正常色</p>
        <TextField mode="readonly" defaultValue="Wireless Bluetooth Headphones" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <p className="text-caption text-fg-muted mb-3">停用原因用 Tooltip 或 Form help text 說明</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <TextField mode="disabled" defaultValue="Wireless Bluetooth Headphones" />
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
          <TextField size={size} defaultValue="Wireless Bluetooth Headphones" className="max-w-xs" />
          <Button size={size}>送出</Button>
          <span className="text-caption text-fg-muted">size="{size}"</span>
        </div>
      ))}
    </div>
  ),
}

/* ── startIcon ── */
export const WithStartIcon: Story = {
  name: 'startIcon',
  render: () => (
    <div className="flex flex-col gap-4 max-w-sm">
      <TextField startIcon={Search} placeholder="搜尋商品..." />
      <TextField startIcon={Mail} defaultValue="alice@example.com" />
    </div>
  ),
}

/* ── endAction ── */
export const EndAction: Story = {
  name: 'endAction',
  render: () => {
    const [showPwd, setShowPwd] = React.useState(false)
    const [query, setQuery] = React.useState('Bluetooth')

    return (
      <div className="flex flex-col gap-4 max-w-sm">
        <div>
          <p className="text-caption text-fg-muted mb-1">顯示/隱藏密碼</p>
          <TextField
            type={showPwd ? 'text' : 'password'}
            defaultValue="my-secret-123"
            endAction={
              <Button
                variant="text"
                size="xs"
                iconOnly
                startIcon={showPwd ? EyeOff : Eye}
                aria-label={showPwd ? '隱藏密碼' : '顯示密碼'}
                onClick={() => setShowPwd(!showPwd)}
              />
            }
          />
        </div>
        <div>
          <p className="text-caption text-fg-muted mb-1">清除 — 有值時出現，清空後消失，不佔位</p>
          <TextField
            startIcon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            endAction={
              query ? (
                <Button
                  variant="text"
                  size="xs"
                  iconOnly
                  startIcon={X}
                  aria-label="清除搜尋"
                  onClick={() => setQuery('')}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    )
  },
}

/* ── Error ── */
export const ErrorState: Story = {
  name: 'Error',
  render: () => (
    <div className="flex flex-col gap-4 max-w-sm">
      <p className="text-caption text-fg-muted">Error 以紅色邊框表示。錯誤訊息由 Form help text 提供，不在 input 內放狀態 icon</p>
      <div>
        <TextField error defaultValue="invalid-email@" />
        <p className="text-caption text-error mt-1">請輸入有效的 email 地址</p>
      </div>
    </div>
  ),
}

/* ── 邊框互動狀態 ── */
export const BorderStates: Story = {
  name: '邊框互動狀態',
  render: () => (
    <div className="flex flex-col gap-4 max-w-sm">
      <p className="text-caption text-fg-muted">Default → Hover（深一階）→ Focus（primary）</p>
      <TextField placeholder="hover、點擊觀察邊框" />
      <TextField placeholder="第二個，測試 Tab 切換" />
    </div>
  ),
}
