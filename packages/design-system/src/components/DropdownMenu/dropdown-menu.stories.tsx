// @story-history: isOverlay OpenSnapshot / hasInteractiveStates Disabled 由 anatomy.stories.tsx StateBehavior + Inspector auto-compile owns(2026-05-15 F-migration);showcase 展示真實多選 / 角色切換 / Checkbox 整合情境。
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Trash2, Copy, Pencil, ExternalLink, ChevronDown, FileText, FileSpreadsheet, CalendarClock, MessageSquare, ListCollapse, Rows3, RotateCcw, FolderInput, Link, Share2, UserPlus, Eye, Hash, MoveHorizontal, Languages } from 'lucide-react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { WORK_ITEM_STATUSES, WORK_ITEM_TYPES, workItemTypeBadge } from '@/design-system/stories-helpers/scene/work-item-type'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuGroup, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from './dropdown-menu'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { Badge } from '@/design-system/components/Badge/badge'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta = {
  title: 'Design System/Components/DropdownMenu/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '由 trigger 開啟的浮層動作選單，支援一般、勾選、單選與巢狀項目。當操作需要節省畫面空間且不必持續可見時使用；主要 CTA 不應藏入選單。' } },
  },
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
// 一般動作選單用 raw DropdownMenu(account-menu.spec.md「何時不用」:排序 / 匯出 / row actions);帳號選單由 AccountMenu 負責

export const Groups: StoryObj = {
  name: '群組',
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>匯出</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* Group auto-separation canonical(spec):相鄰 Group 自動 border-divider 分隔,
            不手動加 Separator(手動 Separator 保留給群組內子分組 / 破壞性動作前的強調) */}
        {/* 選了就做:下載與開設定在範例裡記到 Storybook「Actions」面板 */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>下載目前檢視</DropdownMenuLabel>
          <DropdownMenuItem startIcon={FileText} onSelect={fn().mockName('下載 CSV')}>
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem startIcon={FileSpreadsheet} onSelect={fn().mockName('下載 Excel')}>
            Excel (.xlsx)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem startIcon={CalendarClock} onSelect={fn().mockName('開啟排程匯出設定')}>
            排程匯出…
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
        <Button variant="tertiary" endIcon={ChevronDown}>檔案操作</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={MessageSquare} badge={<Badge count={3} />} onSelect={fn().mockName('開啟留言')}>
          留言
        </DropdownMenuItem>
        <DropdownMenuItem startIcon={FileText} endIcon={ExternalLink} onSelect={fn().mockName('前往 雲端硬碟')}>
          在雲端硬碟開啟
        </DropdownMenuItem>
        {/* disabled state 由 anatomy StateBehavior / Inspector owns(檔頭 trait-rationale),不在後綴 story 重複 */}
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

// ── 子選單 ──

const SubMenuDemo = () => {
  const [density, setDensity] = useState('standard')
  const densityLabels: Record<string, string> = { compact: '精簡', standard: '標準', comfortable: '寬鬆' }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>檢視</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={ListCollapse} onSelect={fn().mockName('全部收合')}>
          全部收合
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger startIcon={Rows3} value={densityLabels[density]}>
            列密度
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {/* RadioGroup 內必用 RadioItem(spec 結構表):Radix 給 menuitemradio 語義 +
                aria-checked,選中底色與「選後保持開啟」由元件內建,不用手動 selected / onSelect */}
            <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
              {(['compact', 'standard', 'comfortable'] as const).map((d) => (
                <DropdownMenuRadioItem key={d} value={d}>
                  {densityLabels[d]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem startIcon={RotateCcw} onSelect={() => setDensity('standard')}>
          重設檢視
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const SubMenu: StoryObj = {
  name: '子選單',
  render: () => <SubMenuDemo />,
}

// ── 多層子選單:Esc 一次只關一層、Tab 收起全部往下走(2026-09-25,待辦總帳 B10 / B11)──
// 情境:工作項目頁首的工具列「指派給我 / 更多動作 / 分享」,更多動作 → 移動到 → 專案 → 欄位,共三層。
// 觸發鈕前後各一顆真按鈕,Tab / Shift+Tab 的落點看得見也量得到(dropdown-menu-keyboard-invariant 的量測對象)。
// @overlay-open-skip: 本則教的是鍵盤開關行為(每按一次 Esc 少一層、Tab 收起往下走),要從「關著」開始操作;
//   浮層開著的視覺快照由同檔 OpenSnapshot(defaultOpen)負責。
const MOVE_TARGETS = [
  { project: '行動 App 改版', columns: ['待辦', '進行中', '完成'] },
  { project: '官網重構', columns: ['待辦', '設計審查', '完成'] },
] as const

// 前後兩顆按鈕與每個選項都有結果:做完的事跳 Toast、開分享設定記到 Actions 面板
const NestedSubMenuDemo = () => (
  <>
  <ButtonGroup>
    <Button variant="tertiary" startIcon={UserPlus} onClick={() => toast({ variant: 'success', title: '已指派給你' })}>指派給我</Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>更多動作</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={Link} onSelect={() => toast({ title: '已複製連結' })}>複製連結</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger startIcon={FolderInput}>移動到</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {MOVE_TARGETS.map(({ project, columns }) => (
              <DropdownMenuSub key={project}>
                <DropdownMenuSubTrigger>{project}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {columns.map((column) => (
                    <DropdownMenuItem key={column} onSelect={() => toast({ variant: 'success', title: `已移到「${project}」的「${column}」` })}>{column}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem startIcon={Trash2} className="text-error" onSelect={() => toast({ variant: 'success', title: '工作項目已刪除', action: { label: '復原', onClick: () => toast({ title: '已復原工作項目' }) } })}>刪除</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button variant="tertiary" startIcon={Share2} onClick={fn().mockName('開啟分享設定')}>分享</Button>
  </ButtonGroup>
  <Toaster />
  </>
)

export const NestedSubMenu: StoryObj = {
  name: '多層子選單',
  parameters: {
    docs: {
      description: {
        story:
          '用鍵盤從「更多動作」一路按 → 開到第三層(移動到 → 專案 → 欄位)。' +
          '按 Esc 每次只關最內層的那一層,焦點回到上一層打開它的那一項(跟 ← 一樣);三層要按三次才全部關掉、回到「更多動作」。' +
          '選單開著時按 Tab,不論在第幾層都一次收起全部,焦點落在「分享」;按 Shift+Tab 則落在「指派給我」。',
      },
    },
  },
  render: () => <NestedSubMenuDemo />,
}

// ── Checkbox Items ──

const CheckboxDemo = () => {
  const [showStatus, setShowStatus] = useState(true)
  const [showActivity, setShowActivity] = useState(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* 同 DataTable 正式元件的「欄位顯示」(Eye 圖示、同一個詞;獨立驗證 OV-V07) */}
        <Button variant="tertiary" startIcon={Eye} endIcon={ChevronDown}>欄位顯示</Button>
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
  parameters: {
    docs: { description: { story: '從一組裡挑幾個(這裡是表格要顯示哪幾欄)用勾選外觀:每一項都是同一組的成員。判準住 checkbox.spec.md「與 Switch 的分界」的「選單裡」。' } },
  },
  render: () => <CheckboxDemo />,
}

// ── 開關項:單獨一個即時生效的設定 → indicator="switch"(2026-11-27 H41;判準 checkbox.spec.md「選單裡」)──

const SwitchDemo = () => {
  const [fullWidth, setFullWidth] = useState(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* 聊天室標題列的頻道名 = 開聊天室選單 */}
        <Button variant="tertiary" startIcon={Hash} endIcon={ChevronDown}>行動 App 改版</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem startIcon={Link}>複製聊天室連結</DropdownMenuItem>
          <DropdownMenuItem startIcon={UserPlus}>邀請成員</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem indicator="switch" startIcon={MoveHorizontal} checked={fullWidth} onCheckedChange={setFullWidth}>
            全寬顯示
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem indicator="switch" startIcon={Languages} checked disabled description="工作區管理員已統一開啟">
            自動翻譯訊息
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const SwitchItems: StoryObj = {
  name: '開關項',
  parameters: {
    docs: {
      description: {
        story:
          '單獨一個點了就生效的設定(全寬顯示)跟一般動作並列時用開關外觀:`<DropdownMenuCheckboxItem indicator="switch">`。' +
          '整列點了就切換、選單不關;列尾的開關只是畫面(不能單獨點、不會拿到焦點),讀屏念的是整列的「已勾選 / 未勾選」。' +
          '一組裡挑幾個(上一則「勾選項」)仍用勾選外觀。',
      },
    },
  },
  render: () => <SwitchDemo />,
  // 打開選單給截圖與讀者看到開關外觀;整列點擊切換 / 選單不關 / 開關不可聚焦的量測在 scripts/dropdown-menu-keyboard-invariant.mjs 的 W 情境
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: /行動 App 改版/ }))
    const row = await body.findByRole('menuitemcheckbox', { name: /全寬顯示/ })
    await expect(row).toHaveAttribute('aria-checked', 'false')
  },
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

// ── 選項前綴:工作項類型方塊 + 狀態色(2026-11-26,workspace F 組 F4-2)──
// 工作項詳情頁的「變更類型」選單:類型項目前面是類型方塊(`startContent`);同一個選單下半段以「設定狀態」標題分組的項目是圖示 + 語意色
//(`startIcon` + `startIconClassName`)。play 斷言:類型每一項都有自訂前綴節點、「已完成」的圖示是 success 色 —— 轉發一斷就紅,並點名是哪一項。
function WorkItemTypeMenuDemo() {
  const [type, setType] = useState('bug')
  const [status, setStatus] = useState('in_progress')
  const current = WORK_ITEM_TYPES.find((t) => t.value === type)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>類型:{current?.label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>變更類型</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={type} onValueChange={setType}>
          {WORK_ITEM_TYPES.map((t) => (
            <DropdownMenuRadioItem key={t.value} value={t.value} startContent={workItemTypeBadge(t.value)} description={t.description}>{t.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>設定狀態</DropdownMenuLabel>
        {WORK_ITEM_STATUSES.map((s) => (
          <DropdownMenuItem key={s.value} startIcon={s.icon} startIconClassName={s.iconClassName} selected={status === s.value}
            onSelect={() => { setStatus(s.value); toast({ variant: 'success', title: `狀態已改為「${s.label}」` }) }}>{s.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const OptionPrefix: StoryObj = {
  name: '選項前綴:工作項類型',
  parameters: { docs: { description: { story: '工作項詳情頁的「變更類型」選單:類型項目前面是類型方塊(`startContent`),狀態項目是圖示加語意色(`startIcon` + `startIconClassName`)。' } } },
  render: () => (<><WorkItemTypeMenuDemo /><Toaster /></>),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const probe = canvasElement.ownerDocument.createElement('span')
    probe.className = 'text-success'
    canvasElement.appendChild(probe)
    const successColor = getComputedStyle(probe).color
    probe.remove()
    await userEvent.click(canvas.getByRole('button', { name: /類型/ }))
    const typeItems = await body.findAllByRole('menuitemradio')
    await expect(typeItems).toHaveLength(WORK_ITEM_TYPES.length)
    for (const item of typeItems) {
      await expect(item.querySelector('[data-prefix-type="content"]'), `類型項目「${item.textContent}」沒有前綴節點`).not.toBeNull()
    }
    const done = body.getByRole('menuitem', { name: /已完成/ })
    // MenuItem 的前綴圖示本身就是帶 data-prefix-type="icon" 的 svg(menu-item.tsx)
    const doneIcon = done.querySelector('[data-prefix-type="icon"]')
    await expect(doneIcon, '「已完成」沒有前綴圖示').not.toBeNull()
    await expect(getComputedStyle(doneIcon!).color, '「已完成」的圖示沒有套 startIconClassName').toBe(successColor)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryAllByRole('menuitemradio')).toHaveLength(0))
  },
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
  tags: ['test-only'],
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
// defaultOpen 建立 Portal；visual-audit 的真實 Playwright pointer 負責
// 第一個 item 的 CSS :hover，截圖同時保留相鄰未 hover item 作對照。
// 詳見 .claude/skills/visual-audit/SKILL.md 的「Layer A interactive state coverage」。

export const ItemHover: StoryObj = {
  name: '選項懸停高亮',
  tags: ['test-only'],
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="tertiary" endIcon={ChevronDown}>操作</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem startIcon={Copy} shortcut="⌘C" data-testid="item-hover-target" data-visual-hover-target>
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

// @story-history: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
