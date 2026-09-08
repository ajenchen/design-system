import type { Meta, StoryObj } from '@storybook/react'
import { useState, useEffect } from 'react'
import {
  Search,
  FileText,
  Folder,
  Settings,
  User,
  LogOut,
  Plus,
  MoonStar,
  Sun,
  Inbox,
  Star,
  Archive,
  GitBranch,
  Terminal,
} from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  CommandDialog,
} from './command'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Internal/Command/展示',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Command 是 cmdk 的搜尋 + 鍵盤導覽清單 primitive。搜尋列、項目、分組標題都消費 SelectMenu / MenuItem 同一份 SSOT,所以 Select / Combobox 的下拉、Cmd+K 指令面板、嵌在頁面裡的清單三種形態長得一樣。',
      },
    },
  },
}

export default meta
type Story = StoryObj

/* ═══════════════════════════════════════════════════════════════════════════
   Story 1:全域指令面板(Cmd+K)— Linear / Notion / Figma 風格
   ═══════════════════════════════════════════════════════════════════════════ */
const PaletteDemo = () => {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <div className="flex flex-col gap-3 max-w-xl">
      <Button variant="secondary" startIcon={Search} onClick={() => setOpen(true)}>搜尋或輸入指令…(⌘K)</Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="搜尋 issue、人員,或輸入指令…" />
        <CommandList>
          <CommandEmpty>找不到符合的結果</CommandEmpty>
          <CommandGroup heading="最近開啟">
            <CommandItem startIcon={FileText} description="上次開啟:2 天前" onSelect={() => setOpen(false)}>PRD:多工作區切換 v2</CommandItem>
            <CommandItem startIcon={FileText} description="上次開啟:3 天前" onSelect={() => setOpen(false)}>Q2 OKR roadmap</CommandItem>
            <CommandItem startIcon={Folder} description="上次開啟:今天" onSelect={() => setOpen(false)}>Platform / 監控</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="快速動作">
            <CommandItem startIcon={Plus} shortcut="⌘N" onSelect={() => setOpen(false)}>建立 issue</CommandItem>
            <CommandItem startIcon={GitBranch} shortcut="⌘B" onSelect={() => setOpen(false)}>切換分支…</CommandItem>
            <CommandItem startIcon={Terminal} shortcut="⌃`" onSelect={() => setOpen(false)}>開啟終端機</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="帳號">
            <CommandItem startIcon={User} onSelect={() => setOpen(false)}>個人資料</CommandItem>
            <CommandItem startIcon={Settings} shortcut="⌘," onSelect={() => setOpen(false)}>偏好設定</CommandItem>
            <CommandItem startIcon={LogOut} onSelect={() => setOpen(false)}>登出</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}

export const CommandPalette: Story = {
  name: '全域指令面板',
  parameters: { docs: { description: { story: '按 ⌘K / Ctrl+K 或點按鈕開啟。面板內容 = SelectMenu 的搜尋列 + MenuItem 項目 + 分組標題,只是外面套了 Dialog 殼。' } } },
  render: () => <PaletteDemo />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 2:嵌在頁面裡的清單(不在 Dialog 內)—— 次要用法,必須自帶邊框容器(spec「禁止事項」)
   ═══════════════════════════════════════════════════════════════════════════ */
export const InlineCommand: Story = {
  name: '行內搜尋清單',
  parameters: { docs: { description: { story: 'Gmail 式左側資料夾清單直接嵌在頁面上,沒有 Dialog 外殼;依規格必須自帶邊框容器。' } } },
  render: () => (
    <div className="max-w-md rounded-lg border border-border bg-surface-raised overflow-hidden" style={{ boxShadow: 'var(--elevation-100)' }}>
      <Command>
        <CommandInput placeholder="搜尋信件或資料夾…" />
        <CommandList>
          <CommandEmpty>沒有符合的項目</CommandEmpty>
          <CommandGroup heading="資料夾">
            <CommandItem startIcon={Inbox} endContent={<span className="text-caption text-fg-muted tabular-nums">124</span>}>收件匣</CommandItem>
            <CommandItem startIcon={Star} endContent={<span className="text-caption text-fg-muted tabular-nums">8</span>}>已加星號</CommandItem>
            <CommandItem startIcon={Archive} endContent={<span className="text-caption text-fg-muted tabular-nums">2,340</span>}>封存</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="動作">
            <CommandItem startIcon={Plus} shortcut="C">撰寫新信</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:純動作指令(選中立即執行,不保留 form value)
   ═══════════════════════════════════════════════════════════════════════════ */
const ActionCommandDemo = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [lastAction, setLastAction] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <div className="rounded-lg border border-border bg-surface-raised overflow-hidden" style={{ boxShadow: 'var(--elevation-100)' }}>
        <Command>
          <CommandInput placeholder="輸入指令…" />
          <CommandList>
            <CommandEmpty>沒有符合的指令</CommandEmpty>
            <CommandGroup heading="外觀">
              <CommandItem startIcon={Sun} selected={theme === 'light'} onSelect={() => { setTheme('light'); setLastAction('切換淺色模式') }}>淺色模式</CommandItem>
              <CommandItem startIcon={MoonStar} selected={theme === 'dark'} onSelect={() => { setTheme('dark'); setLastAction('切換深色模式') }}>深色模式</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="快速動作">
              <CommandItem startIcon={Plus} shortcut="⌘N" onSelect={() => setLastAction('建立新文件')}>建立新文件</CommandItem>
              <CommandItem startIcon={Inbox} onSelect={() => setLastAction('開啟收件匣')}>開啟收件匣</CommandItem>
              <CommandItem startIcon={Star} onSelect={() => setLastAction('加入我的最愛')}>加入我的最愛</CommandItem>
              <CommandItem startIcon={Archive} onSelect={() => setLastAction('封存目前頁面')}>封存目前頁面</CommandItem>
              <CommandItem startIcon={Settings} shortcut="⌘," onSelect={() => setLastAction('開啟設定')}>開啟設定</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
      {lastAction && <p className="text-caption text-fg-muted">已執行:{lastAction}</p>}
    </div>
  )
}

export const ActionCommand: Story = {
  name: '純動作指令',
  parameters: { docs: { description: { story: '選中立即執行(切換外觀、觸發動作),不保留表單值。少於 6 項的短選單用 DropdownMenu(spec「與 DropdownMenu 的分界」)。' } } },
  render: () => <ActionCommandDemo />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:空結果狀態
   ═══════════════════════════════════════════════════════════════════════════ */
export const EmptyState: Story = {
  name: '無結果狀態',
  parameters: { docs: { description: { story: '在搜尋列輸入不存在的字(例如「zzz」)看空狀態文案。' } } },
  render: () => (
    <div className="max-w-md rounded-lg border border-border bg-surface-raised overflow-hidden" style={{ boxShadow: 'var(--elevation-100)' }}>
      <Command>
        <CommandInput placeholder="試著輸入「zzz」看空狀態…" />
        <CommandList>
          <CommandEmpty>找不到符合「zzz」的結果,試試別的關鍵字。</CommandEmpty>
          <CommandGroup heading="可用指令">
            <CommandItem startIcon={FileText}>新增文件</CommandItem>
            <CommandItem startIcon={Settings}>開啟設定</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
}
