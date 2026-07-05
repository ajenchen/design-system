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

const meta: Meta = {
  title: 'Design System/Internal/Command/展示',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Command 是 cmdk 的 shadcn passthrough 搜尋 + 鍵盤導覽清單 primitive。主用法是浮層:透過 Select / Combobox / PeoplePicker 的 searchable 模式消費(底層自動切換到 SelectMenu,SelectMenu 包 Command),或用 `CommandDialog` 組 Command Palette(Cmd+K)——跨頁全域搜尋與快速動作入口。Inline 嵌頁面是允許的次要用法,必須自帶邊框容器(rounded + border,見下方行內範例;spec「禁止事項」2026-06-12 拍板)。',
      },
    },
  },
}
export default meta
type Story = StoryObj

/* ═══════════════════════════════════════════════════════════════════════════
   Story 1:Command Palette(Cmd+K)— Linear / Notion / Figma 風格
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
      <p className="text-caption text-fg-muted">
        按下 <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded-md">⌘K</kbd> (Mac) 或{' '}
        <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded-md">Ctrl+K</kbd> (Win) 開啟全域指令面板。
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface text-caption hover:border-border-hover cursor-pointer w-fit"
      >
        <Search size={14} className="text-fg-muted" />
        <span className="text-fg-muted">搜尋或輸入指令…</span>
        <kbd className="ml-4 font-mono text-footnote bg-muted px-1.5 py-0.5 rounded-md">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="搜尋 issue、人員,或輸入指令…" />
        <CommandList>
          <CommandEmpty>找不到符合的結果</CommandEmpty>

          <CommandGroup heading="最近開啟">
            <CommandItem onSelect={() => setOpen(false)}>
              <FileText />
              <span>PRD: 多工作區切換 v2</span>
              <CommandShortcut>2 天前</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <FileText />
              <span>Q2 OKR roadmap</span>
              <CommandShortcut>3 天前</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <Folder />
              <span>Platform / 監控</span>
              <CommandShortcut>今天</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="快速動作">
            <CommandItem onSelect={() => setOpen(false)}>
              <Plus />
              <span>建立 issue</span>
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <GitBranch />
              <span>切換分支…</span>
              <CommandShortcut>⌘B</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <Terminal />
              <span>開啟終端機</span>
              <CommandShortcut>⌃`</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="帳號">
            <CommandItem onSelect={() => setOpen(false)}>
              <User />
              <span>個人資料</span>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <Settings />
              <span>偏好設定</span>
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <LogOut />
              <span>登出</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  )
}

export const CommandPalette: Story = {
  name: '全域指令面板',
  render: () => <PaletteDemo />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 2:Inline Command(不在 Dialog 內,直接嵌入頁面)
   ═══════════════════════════════════════════════════════════════════════════ */

export const InlineCommand: Story = {
  name: '行內搜尋清單',
  render: () => (
    <div className="flex flex-col gap-3 max-w-md">
      <p className="text-caption text-fg-muted">
        Gmail-like 左側 sidebar 頂部搜尋清單——把 Command 直接鑲在頁面上,沒有 Dialog 外殼。
      </p>
      <div
        className="rounded-lg border border-border bg-surface-raised overflow-hidden"
        style={{ boxShadow: 'var(--elevation-100)' }}
      >
        <Command>
          <CommandInput placeholder="搜尋信件或資料夾…" />
          <CommandList>
            <CommandEmpty>沒有符合的項目</CommandEmpty>
            <CommandGroup heading="資料夾">
              <CommandItem>
                <Inbox />
                <span>收件匣</span>
                <CommandShortcut>124</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Star />
                <span>已加星號</span>
                <CommandShortcut>8</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Archive />
                <span>封存</span>
                <CommandShortcut>2,340</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="動作">
              <CommandItem>
                <Plus />
                <span>撰寫新信</span>
                <CommandShortcut>C</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:Theme switcher(純動作 command,無 form value 儲存)
   ═══════════════════════════════════════════════════════════════════════════ */

const ThemeSwitcherDemo = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <p className="text-caption text-fg-muted">
        純 action palette — 選中立即執行(切 theme),不保留 form value。
      </p>
      <div
        className="rounded-lg border border-border bg-surface-raised overflow-hidden"
        style={{ boxShadow: 'var(--elevation-100)' }}
      >
        <Command>
          <CommandInput placeholder="切換外觀…" />
          <CommandList>
            <CommandEmpty>沒有符合的外觀</CommandEmpty>
            <CommandGroup heading="外觀">
              <CommandItem onSelect={() => setTheme('light')}>
                <Sun />
                <span>淺色模式</span>
                {theme === 'light' && <CommandShortcut>當前</CommandShortcut>}
              </CommandItem>
              <CommandItem onSelect={() => setTheme('dark')}>
                <MoonStar />
                <span>深色模式</span>
                {theme === 'dark' && <CommandShortcut>當前</CommandShortcut>}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

export const ThemeSwitcher: Story = {
  name: '外觀切換器',
  render: () => <ThemeSwitcherDemo />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:空結果狀態
   ═══════════════════════════════════════════════════════════════════════════ */

export const EmptyState: Story = {
  name: '無結果狀態',
  render: () => (
    <div className="flex flex-col gap-3 max-w-md">
      <p className="text-caption text-fg-muted">
        搜尋框輸入不存在的字(例:"zzz"),CommandEmpty 顯示空狀態文案。
      </p>
      <div
        className="rounded-lg border border-border bg-surface-raised overflow-hidden"
        style={{ boxShadow: 'var(--elevation-100)' }}
      >
        <Command>
          <CommandInput placeholder="試著輸入「zzz」看空狀態…" />
          <CommandList>
            <CommandEmpty>找不到符合「zzz」的結果,試試別的關鍵字。</CommandEmpty>
            <CommandGroup heading="可用指令">
              <CommandItem>
                <FileText />
                <span>新增文件</span>
              </CommandItem>
              <CommandItem>
                <Settings />
                <span>開啟設定</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  ),
}
