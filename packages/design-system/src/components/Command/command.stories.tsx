import type { Meta, StoryObj } from '@storybook/react'
import { useState, useEffect, type ReactNode } from 'react'
import { fn } from '@storybook/test'
import {
  Search,
  FileText,
  Folder,
  Settings,
  User,
  LogOut,
  Plus,
  Inbox,
  Star,
  Archive,
  GitBranch,
  Terminal,
  Hash,
  Link,
} from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandLoading,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandDialog,
} from './command'
import { Button } from '@/design-system/components/Button/button'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

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

// 嵌在頁面裡(不在浮層內)的 Command 外框:規格只要求自己包一層「rounded + border」(command.spec.md「禁止事項」Inline 那條,
// 對齊 shadcn 同款),跟設計規格頁「元件總覽」同一個樣子 —— 不加浮層的底色與陰影(它不是浮層)。下面四則共用這一份。
function InlineFrame({ children }: { children: ReactNode }) {
  return <div className="max-w-md rounded-lg border border-border overflow-hidden">{children}</div>
}

// 範例裡「選了就跳到那一頁」:讀者不會真的離開 Storybook,改在 Actions 面板記一筆要去哪
const openPage = fn().mockName('前往')

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
    <div className="flex flex-col max-w-xl">
      {/* 開對話框的按鈕宣告彈出型別與開合(Radix DialogTrigger 會自動帶;指令面板沒有 DialogTrigger,由按鈕自己寫) */}
      <Button className="self-start" variant="tertiary" startIcon={Search} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>搜尋或輸入指令…(⌘K)</Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="搜尋 issue、人員,或輸入指令…" />
        <CommandEmpty>沒有結果</CommandEmpty>
        <CommandList>
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
// 選項要多到需要打字找(command.spec.md「與 DropdownMenu 的分界」:超過 10 項或需要搜尋過濾才用 Command)
const CHANNELS: { name: string; members: number }[] = [
  { name: 'general', members: 248 }, { name: 'announcements', members: 248 }, { name: 'design-system', members: 42 },
  { name: 'frontend', members: 37 }, { name: 'backend', members: 29 }, { name: 'mobile-app', members: 18 },
  { name: 'data-platform', members: 15 }, { name: 'infra-oncall', members: 12 }, { name: 'release-train', members: 54 },
  { name: 'qa', members: 21 }, { name: 'product-feedback', members: 63 }, { name: 'customer-success', members: 33 },
  { name: 'sales-apac', members: 26 }, { name: 'marketing', members: 31 }, { name: 'hiring', members: 14 },
  { name: 'security', members: 9 }, { name: 'finance', members: 11 }, { name: 'legal', members: 6 },
  { name: 'random', members: 197 }, { name: 'office-taipei', members: 88 }, { name: 'office-tokyo', members: 41 },
  { name: 'book-club', members: 23 }, { name: 'lunch', members: 76 }, { name: 'help-it', members: 152 },
]

export const InlineCommand: Story = {
  name: '行內搜尋清單',
  parameters: { docs: { description: { story: 'Slack「瀏覽頻道」頁:24 個頻道直接列在頁面上,打字過濾,選了就進那個頻道。沒有 Dialog 外殼,依規格自帶邊框容器。' } } },
  render: () => (
    <InlineFrame>
      <Command label="搜尋頻道">
        <CommandInput placeholder="搜尋頻道…" />
        <CommandEmpty>沒有符合的頻道</CommandEmpty>
        <CommandList>
          <CommandGroup heading="所有頻道">
            {CHANNELS.map((c) => (
              <CommandItem key={c.name} startIcon={Hash} description={`${c.members} 位成員`} onSelect={() => openPage(`#${c.name}`)}>{c.name}</CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </InlineFrame>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 3:純動作指令(選中立即執行,不保留 form value)
   ═══════════════════════════════════════════════════════════════════════════ */
// 每一項選了都有看得到的結果:做完的事跳 Toast、要換頁的記到 Actions 面板;不在畫面上另寫「已執行」字樣
const ActionCommandDemo = () => (
  <>
    <InlineFrame>
      <Command label="指令">
        <CommandInput placeholder="輸入指令…" />
        <CommandEmpty>沒有結果</CommandEmpty>
        <CommandList>
          <CommandGroup heading="目前頁面">
            <CommandItem startIcon={Star} onSelect={() => toast({ variant: 'success', title: '已加入我的最愛' })}>加入我的最愛</CommandItem>
            <CommandItem startIcon={Link} onSelect={() => toast({ title: '已複製頁面連結' })}>複製頁面連結</CommandItem>
            <CommandItem startIcon={Archive} onSelect={() => toast({ variant: 'success', title: '頁面已封存', action: { label: '復原', onClick: () => toast({ title: '已復原頁面' }) } })}>封存目前頁面</CommandItem>
          </CommandGroup>
          <CommandGroup heading="快速動作">
            <CommandItem startIcon={Plus} shortcut="⌘N" onSelect={() => openPage('新文件')}>建立新文件</CommandItem>
            <CommandItem startIcon={Inbox} onSelect={() => openPage('收件匣')}>開啟收件匣</CommandItem>
            <CommandItem startIcon={Settings} shortcut="⌘," onSelect={() => openPage('設定')}>開啟設定</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </InlineFrame>
    <Toaster />
  </>
)

export const ActionCommand: Story = {
  name: '純動作指令',
  parameters: { docs: { description: { story: '選中立即執行(收藏、複製連結、封存目前頁面,或前往某一頁),不保留表單值;做完的事跳 Toast 告知。少於 6 項的短選單用 DropdownMenu(spec「與 DropdownMenu 的分界」)。' } } },
  render: () => <ActionCommandDemo />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 4:無結果(搜尋字預設就打到 0 筆,不用點擊就看得到訊息列)
   ═══════════════════════════════════════════════════════════════════════════ */
// @story-history: EmptyState(要 user 自己輸入「zzz」才看得到空狀態)retired 2026-09-08 → NoResults
//   (M15:stakeholder 看得到的狀態必須有不用點擊就看得到的 story;搜尋字預設就命中 0 筆)。
const PROJECTS = ['設計系統', '行動 App', '資料平台', '客服中心', '計費系統', '搜尋改版', '新手引導', '權限管理', '報表中心', '開放 API', '桌面版', '國際化']

const NoResultsDemo = () => {
  const [search, setSearch] = useState('行銷活動')
  return (
    <InlineFrame>
      <Command label="搜尋專案">
        <CommandInput placeholder="搜尋專案…" value={search} onValueChange={setSearch} />
        <CommandEmpty>沒有結果</CommandEmpty>
        <CommandList>
          <CommandGroup heading="專案">
            {PROJECTS.map((name) => (
              <CommandItem key={name} startIcon={Folder} onSelect={() => openPage(`專案「${name}」`)}>{name}</CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </InlineFrame>
  )
}

export const NoResults: Story = {
  name: '無結果狀態',
  parameters: { docs: { description: { story: 'Linear 專案切換清單搜尋「行銷活動」,但工作區沒有這個專案:清單只剩一列「沒有結果」訊息列(與一筆結果等高、次要色、置中);清掉關鍵字就回到全部 12 個專案。' } } },
  render: () => <NoResultsDemo />,
}

/* ═══════════════════════════════════════════════════════════════════════════
   Story 5:載入中(首次開啟:清單裡一列載入訊息列;搜尋列不轉圈)
   ═══════════════════════════════════════════════════════════════════════════ */
export const LoadingFirstOpen: Story = {
  name: '載入中(首次開啟)',
  parameters: { docs: { description: { story: 'Linear 專案切換清單剛打開,專案還沒從 API 回來:清單裡只有一列「載入專案中」訊息列——與一筆結果等高,不用大轉圈撐高;搜尋列照常可打字、不另外轉圈(載入指示只在清單內)。' } } },
  render: () => (
    <InlineFrame>
      <Command label="搜尋專案">
        <CommandInput placeholder="搜尋專案…" />
        <CommandEmpty><CommandLoading label="載入專案中" /></CommandEmpty>
        <CommandList>
        </CommandList>
      </Command>
    </InlineFrame>
  ),
}
