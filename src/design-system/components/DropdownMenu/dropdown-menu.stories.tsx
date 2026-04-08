import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Settings, User, LogOut, Plus, Trash2, Copy, Pencil, ExternalLink, Moon, Sun, Monitor, ChevronDown, FileText } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup,
  DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuGroup, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from './dropdown-menu'
import { Button } from '@/design-system/components/Button/button'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta = {
  title: 'Design System/Components/DropdownMenu/展示',
  parameters: { layout: 'padded' },
}
export default meta

// ── 基本 ──

export const Basic: StoryObj = {
  name: '基本',
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>操作</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={Copy} shortcut="⌘C">
          複製
        </DropdownMenuItem>
        <DropdownMenuItem startIcon={Pencil} shortcut="⌘E">
          編輯
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem startIcon={Trash2} shortcut="⌘⌫" className="text-error">
          刪除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

// ── 群組 + Label ──

export const Groups: StoryObj = {
  name: '群組',
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>帳號</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
          <DropdownMenuItem startIcon={User}>
            個人資料
          </DropdownMenuItem>
          <DropdownMenuItem startIcon={Settings}>
            設定
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem startIcon={LogOut}>
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

// ── Suffix（badge + endIcon）──

export const WithSuffix: StoryObj = {
  name: '後綴',
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>操作</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={Mail} badge={<Badge count={12} />}>
          收件匣
        </DropdownMenuItem>
        <DropdownMenuItem startIcon={FileText} endIcon={ExternalLink}>
          說明文件
        </DropdownMenuItem>
        <DropdownMenuItem startIcon={Plus} disabled>
          新增（已停用）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

// ── 子選單 ──

const SubMenuDemo = () => {
  const [theme, setTheme] = useState('dark')
  const themeLabels: Record<string, string> = { light: '淺色', dark: '深色', system: '跟隨系統' }
  const themeIcons: Record<string, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>設定</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={User}>
          個人資料
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger startIcon={Monitor} value={themeLabels[theme]}>
            主題
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              {(['light', 'dark', 'system'] as const).map((t) => (
                <DropdownMenuItem
                  key={t}
                  startIcon={themeIcons[t]}
                  selected={theme === t}
                  onSelect={() => setTheme(t)}
                >
                  {themeLabels[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem startIcon={LogOut}>
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const SubMenu: StoryObj = {
  name: '子選單',
  render: () => <SubMenuDemo />,
}

// ── Checkbox Items ──

const CheckboxDemo = () => {
  const [showStatus, setShowStatus] = useState(true)
  const [showActivity, setShowActivity] = useState(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>顯示欄位</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>可見欄位</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={showStatus} onCheckedChange={setShowStatus}>
          狀態
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showActivity} onCheckedChange={setShowActivity}>
          最近活動
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked disabled>
          名稱（必要）
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const CheckboxItems: StoryObj = {
  name: 'Checkbox',
  render: () => <CheckboxDemo />,
}

// ── 單選（RadioGroup + selected + bg-neutral-active）──

const RadioDemo = () => {
  const [sort, setSort] = useState('name')
  const options = [
    { value: 'name', label: '名稱' },
    { value: 'date', label: '日期' },
    { value: 'size', label: '大小' },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>排序</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>排序方式</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              selected={sort === opt.value}
              onSelect={() => setSort(opt.value)}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const RadioItems: StoryObj = {
  name: '單選',
  render: () => <RadioDemo />,
}

// ── 尺寸 ──

export const Sizes: StoryObj = {
  name: '尺寸',
  render: () => (
    <div className="flex items-center gap-4">
      {(['sm', 'md', 'lg'] as const).map((sz) => (
        <DropdownMenu key={sz}>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" size={sz} endIcon={ChevronDown}>{sz}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent size={sz}>
            <DropdownMenuItem startIcon={Copy}>
              複製
            </DropdownMenuItem>
            <DropdownMenuItem startIcon={Pencil}>
              編輯
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem startIcon={Trash2} className="text-error">
              刪除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  ),
}
