// @story-trait-rationale: isOverlay OpenSnapshot / hasInteractiveStates Disabled 由 anatomy.stories.tsx StateBehavior + Inspector auto-compile owns(2026-05-15 F-migration);showcase 展示真實多選 / 角色切換 / Checkbox 整合情境。
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Settings, User, LogOut, Trash2, Copy, Pencil, ExternalLink, Moon, Sun, Monitor, ChevronDown, FileText } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
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

export const Default: StoryObj = {
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
        {/* Group auto-separation canonical(spec):相鄰 Group 自動 border-divider 分隔,
            不手動加 Separator(手動 Separator 保留給群組內子分組 / 破壞性動作前的強調) */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
          <DropdownMenuItem startIcon={User}>
            個人資料
          </DropdownMenuItem>
          <DropdownMenuItem startIcon={Settings}>
            設定
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem startIcon={LogOut}>
            登出
          </DropdownMenuItem>
        </DropdownMenuGroup>
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
        {/* disabled state 由 anatomy StateBehavior / Inspector owns(檔頭 trait-rationale),不在後綴 story 重複 */}
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
            {/* RadioGroup 內必用 RadioItem(spec 結構表):Radix 給 menuitemradio 語義 +
                aria-checked,選中底色與「選後保持開啟」由元件內建,不用手動 selected / onSelect */}
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              {(['light', 'dark', 'system'] as const).map((t) => (
                <DropdownMenuRadioItem key={t} value={t} startIcon={themeIcons[t]}>
                  {themeLabels[t]}
                </DropdownMenuRadioItem>
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
  name: '勾選項',
  render: () => <CheckboxDemo />,
}

// ── 單選（RadioGroup + selected + bg-neutral-selected）──

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
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
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

// ── OpenSnapshot(視覺稽核用) ──
// 用 `defaultOpen` 讓 overlay 在 render 當下就開著,Playwright 截圖才抓得到
// Dropdown chrome(item / icon / shortcut / separator)。不用 play() + userEvent,
// 是因為 Radix `defaultOpen` 對 Portal 自動生效 — 世界級 DS 的 chromatic 稽核
// 也走同 pattern。
//
// 情境用 Basic 複製模板(複製 / 編輯 / 刪除),涵蓋 startIcon / shortcut /
// separator / danger item 等 row-anatomy 核心 slot。

export const OpenSnapshot: StoryObj = {
  name: '開啟狀態',
  tags: ['!autodocs'],
  render: () => (
    <DropdownMenu defaultOpen>
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

// ── ItemHover(視覺稽核用 — 互動狀態 pilot)──
// defaultOpen 展開後,play() hover 第一個 item,讓 Playwright 截圖抓到
// hover highlight(bg-neutral-hover)+ 相鄰未 hover item 的視覺對比。
// 這是 Layer A 預設抓不到的 post-interaction state。
// 詳見 .claude/skills/visual-audit/SKILL.md 的「Layer A interactive state coverage」。

export const ItemHover: StoryObj = {
  name: '選項懸停高亮',
  tags: ['!autodocs'],
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>操作</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={Copy} shortcut="⌘C" data-testid="item-hover-target">
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
  play: async () => {
    const { userEvent } = await import('@storybook/test')
    // Radix DropdownMenu 走 Portal 到 document.body,不在 canvasElement 內;
    // 用 document.querySelector 找 menu item。
    // 等 Radix 動畫 + Portal render 完畢(~300ms)。
    await new Promise((r) => setTimeout(r, 400))
    const target = document.querySelector<HTMLElement>('[data-testid="item-hover-target"]')
    if (target) {
      await userEvent.hover(target)
      // 等 hover bg transition 完成
      await new Promise((r) => setTimeout(r, 300))
    }
  },
}

// @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
