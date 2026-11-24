// 浮層高度上限執行期閘(scripts/overlay-height-cap-invariant.mjs)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 從原始碼打包、配同一份 storybook 建置的 CSS 在本機靜態頁開,
// 量到的是「這次 checkout 的 popover / hover-card / dropdown-menu / command / profile-card + overlay-geometry.ts + 那份建置的樣式」。
//
// 為什麼不是 story:要量的是「傳了 maxHeight 數字 / 字串 / 比可用高還大」與「子選單比可用高還高」這些邊界幾何,
// DS 裡沒有任何範例傳 maxHeight(2026-11-24 盤點 0 處),寫成 story 等於拿量具的極端內容(60 列子選單)當範例。
// 清單(CommandList)另量半列原則的預設上限與它的 maxHeight 參數(2026-11-24 C9)。
// 一次只開一個浮層,參數走網址:?case=<CASES 的 id>。內容一律比可用高還高,才量得到「上限有沒有夾住」。
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import { createRoot } from 'react-dom/client'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverBody } from '@/design-system/components/Popover/popover'
import { HoverCard, HoverCardTrigger, HoverCardContent, HOVER_CARD_SURFACE_CLASS } from '@/design-system/components/HoverCard/hover-card'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { Command, CommandList, CommandGroup, CommandItem } from '@/design-system/components/Command/command'
import { ProfileCard } from '@/design-system/components/ProfileCard/profile-card'
import { SelectMenu } from '@/design-system/components/SelectMenu/select-menu'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'

const params = new URLSearchParams(window.location.search)
const kase = params.get('case') ?? ''
const capParam = params.get('cap')
/** ?cap=<數字> → px;其他字串照原樣(例 12rem) */
const cap = capParam == null ? undefined : /^\d+$/.test(capParam) ? Number(capParam) : capParam

const rows = (n: number, label: (i: number) => string) => Array.from({ length: n }, (_, i) => label(i))
const PROJECTS = rows(60, (i) => `專案 ${String(i + 1).padStart(2, '0')}・行動版改版`)
const ISSUES = rows(40, (i) => `PLAT-${1200 + i} 匯出報表逾時`)
// 觸發點固定在左上附近:可用高 = 視窗高 − 觸發點底 − sideOffset − collisionPadding,夠大才看得出「上限」與「可用高」的差別
const triggerStyle = { position: 'absolute' as const, left: 80, top: 64, padding: '4px 12px' }

function Case() {
  switch (kase) {
    case 'popover':
      return (
        <Popover open>
          <PopoverTrigger style={triggerStyle}>篩選條件</PopoverTrigger>
          <PopoverContent id="oh-content" maxHeight={cap} align="start">
            <PopoverHeader><PopoverTitle>篩選條件</PopoverTitle></PopoverHeader>
            <PopoverBody>{ISSUES.map((t) => <p key={t} style={{ margin: '4px 0' }}>{t}</p>)}</PopoverBody>
          </PopoverContent>
        </Popover>
      )
    case 'hover-card':
      return (
        <HoverCard open>
          <HoverCardTrigger style={triggerStyle} href="#">PLAT-1200</HoverCardTrigger>
          <HoverCardContent id="oh-content" maxHeight={cap} align="start" className={HOVER_CARD_SURFACE_CLASS} style={{ width: 320 }}>
            <div style={{ overflowY: 'auto', padding: 12 }}>{ISSUES.map((t) => <p key={t} style={{ margin: '4px 0' }}>{t}</p>)}</div>
          </HoverCardContent>
        </HoverCard>
      )
    case 'dropdown':
      return (
        <DropdownMenu open>
          <DropdownMenuTrigger style={triggerStyle}>移動到</DropdownMenuTrigger>
          <DropdownMenuContent id="oh-content" maxHeight={cap}>
            {PROJECTS.map((p) => <DropdownMenuItem key={p}>{p}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    case 'submenu':
      return (
        <DropdownMenu open>
          <DropdownMenuTrigger style={triggerStyle}>更多動作</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>複製連結</DropdownMenuItem>
            <DropdownMenuSub open>
              <DropdownMenuSubTrigger>移動到</DropdownMenuSubTrigger>
              <DropdownMenuSubContent id="oh-content">
                {PROJECTS.map((p) => <DropdownMenuItem key={p}>{p}</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    case 'command-list':
    // command-list-plain:沒有群組標題的一組 —— 量「最後一列切在半列」(半列原則的公式以第一組沒有標題為準;command.spec.md「清單捲動上限(半列原則)」)
    case 'command-list-plain':
      return (
        <Popover open>
          <PopoverTrigger style={triggerStyle}>指派給</PopoverTrigger>
          <PopoverContent id="oh-content" align="start">
            <Command>
              <CommandList maxHeight={cap}>
                <CommandGroup heading={kase === 'command-list' ? '最近指派' : undefined}>{ISSUES.map((t) => <CommandItem key={t} value={t}>{t}</CommandItem>)}</CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )
    // 選項帶說明(兩行列,同 PeoplePicker 的人名 + 信箱):SelectMenu 不傳 maxHeight 時用兩行列的半列預設
    case 'select-menu-described':
      return (
        <SelectMenu defaultOpen contentId="oh-content" value={null} onValueChange={() => {}}
          options={ISSUES.map((t, i) => ({ value: t, label: t, description: `owner${i + 1}@acme.example` }))}>
          <button type="button" style={triggerStyle}>指派給</button>
        </SelectMenu>
      )
    case 'profile-card':
      return (
        <Popover open>
          <PopoverTrigger style={triggerStyle}>陳怡君</PopoverTrigger>
          <PopoverContent id="oh-content" align="start" width="hug">
            <ProfileCard
              id="oh-standalone"
              name="陳怡君"
              subtitle="資深產品設計師・平台體驗組"
              defaultFieldValues={{ id: 'chen.yijun', employeeNumber: 'E-10482' }}
              fields={rows(30, (i) => ({ label: `負責專案 ${i + 1}`, value: PROJECTS[i] }))}
            />
          </PopoverContent>
        </Popover>
      )
    default:
      return <p id="oh-unknown-case">未知的 case:{kase}</p>
  }
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('overlay-height-cap fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(TooltipProvider + 畫布底色 / 字色);不開 StrictMode(同 dialog-width 夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)', minHeight: '100svh' }}>
      <Case />
    </div>
  </TooltipProvider>,
)
