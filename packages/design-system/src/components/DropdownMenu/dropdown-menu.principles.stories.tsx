// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-trait-allow: missing-opensnapshot — 原則頁多個 inline dropdown demo 只為承載規則說明(rule note),
// forced defaultOpen 會讓 ~10 個浮層互疊;overlay open-state 快照由 dropdown-menu.anatomy.stories.tsx
// StateBehavior(defaultOpen)canonical 涵蓋(對齊 hover-card.principles.stories.tsx 同 rationale)。
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  MoreVertical, Copy, Trash2, Share2, Download,
  ArrowUp, Eye,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from './dropdown-menu'
import { Button } from '@/design-system/components/Button/button'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/DropdownMenu/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


// 範例是一顆打開選單的按鈕:範例維持自然寬度(naturalWidth),不再逐顆寫 self-start(T15)
const TutorialRule = createTutorialRule({ examples: true, naturalWidth: true, examplesClassName: 'max-w-md' })

// ── WhenToUse — 何時使用 DropdownMenu ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsSelectMenuRule / GroupVsSeparatorRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>按鈕打開的動作選單,選了就執行、選單關閉:卡片右上角 ⋮ 的次要動作、工具列放不下的溢出動作、即時生效的設定切換(欄位顯示、排序方式、主題)、需要分組或子選單的動作清單。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/DropdownMenu/展示" name="群組">群組 — 帳號選單(個人資料 / 設定 / 登出分組)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/DropdownMenu/展示" name="後綴">後綴 — 收件匣未讀數 badge、外開連結提示</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/DropdownMenu/展示" name="子選單">子選單 — 主題切換(淺色 / 深色 / 跟隨系統)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/DropdownMenu/展示" name="勾選項">勾選項 — 表格顯示欄位切換</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/DropdownMenu/展示" name="單選">單選 — 檔案清單排序方式</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
          title="DropdownMenu — 執行動作，選完即關閉"
          note="典型場景：卡片右上角 ⋮ 三點選單（複製、刪除、分享）。使用者選一個動作、立即執行、選單消失。value 不保留（沒有「選中狀態」）"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="tertiary" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem startIcon={Copy}>複製</DropdownMenuItem>
              <DropdownMenuItem startIcon={Share2}>分享</DropdownMenuItem>
              <DropdownMenuItem startIcon={Download}>匯出</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem startIcon={Trash2} className="text-error">刪除</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ExampleCaption>↑ 執行動作：複製 / 分享 / 刪除，選完關閉，畫面沒有「選中狀態」</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 選值（值要留下）：用 Select / SelectMenu"
          note="「使用者選某個狀態」「選某個類別」這類選完後值留在 field 裡的場景是選值，用 Select。DropdownMenu 點完就關閉沒有 value 可留"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="tertiary">選擇狀態</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>待處理</DropdownMenuItem>
              <DropdownMenuItem>進行中</DropdownMenuItem>
              <DropdownMenuItem>已完成</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ExampleCaption warn>↑ 點完選單就關，但「目前選了什麼狀態」沒有視覺保留 → 用 Select</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li>主要動作(儲存、送出)→ 直接放 Button:主要動作要看得到,不藏進選單</li>
          <li>切換平行視圖 → Tabs / SegmentedControl:視圖切換要一直看得到,不是一次性動作</li>
          <li>少於 3 個動作 → 直接放 Button:兩個動作收進選單只是多一層</li>
          <li>複雜表單 / 多步驟流程 → Dialog / Sheet:選單項目是點一下的動作,不承載流程</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="判斷法：「選完之後畫面需要保留選中狀態嗎？」"
          note="需要 → Select / SelectMenu；不需要（點完即執行動作）→ DropdownMenu"
        >
          <ExampleCaption>一句話判斷:點完後使用者還需要看到「目前選了什麼」就用 Select / SelectMenu;只是觸發一個動作、選完即關閉就用 DropdownMenu。</ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const GroupVsSeparatorRule: Story = {
  name: '分組 vs 分隔線',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="DropdownMenuGroup — 包裝同類 items 自動分隔（推薦 default）"
        note="相鄰 Group 之間自動出現 border-divider 分隔線,不需手動加 Separator。對齊 MenuGroup 的 auto-separation 理念,consumer 零手動"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">帳號選單</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
              <DropdownMenuItem>個人資料</DropdownMenuItem>
              <DropdownMenuItem>設定</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuLabel>團隊</DropdownMenuLabel>
              <DropdownMenuItem>切換 workspace</DropdownMenuItem>
              <DropdownMenuItem>邀請成員</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuItem className="text-error">登出</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ExampleCaption>↑ 三個 DropdownMenuGroup 自動透過 border-divider 分隔,無需手動 Separator</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="DropdownMenuSeparator — 明確手動插入分隔（特殊強調場景）"
        note="Group 內部需要子分組、或強調某個分隔位置時使用。例:單一 Group 內最後一個破壞性動作前想明確加視覺分隔"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">檔案操作</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem>複製</DropdownMenuItem>
              <DropdownMenuItem>剪下</DropdownMenuItem>
              <DropdownMenuItem>貼上</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-error">永久刪除</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ExampleCaption>↑ 同一 Group 內,手動 Separator 在刪除前強調視覺切分</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 用多個 Separator 手動模擬 Group"
        note="既然 DropdownMenuGroup 自動處理,寫多個 Separator 就是重複勞動 + 容易漏掉或放錯位置"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">帳號選單</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
            <DropdownMenuItem>個人資料</DropdownMenuItem>
            <DropdownMenuItem>設定</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>團隊</DropdownMenuLabel>
            <DropdownMenuItem>切換 workspace</DropdownMenuItem>
            <DropdownMenuItem>邀請成員</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-error">登出</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ExampleCaption warn>↑ 功能等價但每個分隔都要手寫 → 用 Group 更精確表達「語意分組」</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const ItemTypeRule: Story = {
  name: '項目類型選擇',
  render: () => {
    const [showStatus, setShowStatus] = React.useState(true)
    const [showAssignee, setShowAssignee] = React.useState(true)
    const [showDue, setShowDue] = React.useState(false)
    const [sortBy, setSortBy] = React.useState('created')
    return (
      <TutorialPage>
        <TutorialRule
          title="Item — 執行一次性動作（選完關閉）"
          note="複製、刪除、分享、開啟連結等動作。破壞性動作的 prefix icon 和 label 都用 text-error"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="tertiary">檔案操作</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem startIcon={Copy} shortcut="⌘C">複製連結</DropdownMenuItem>
              <DropdownMenuItem startIcon={Download} shortcut="⌘S">下載</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem startIcon={Trash2} shortcut="⌫" className="text-error">刪除</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TutorialRule>

        <TutorialRule
          title="CheckboxItem — 即時生效的 on/off toggle（選單保持開啟）"
          note="顯示 / 隱藏欄位、篩選條件等。選了不關閉選單，讓使用者可一次切多個"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* 欄位顯示 = DataTable 正式元件的同一個動作(data-table-column-visibility-panel.tsx 標題「欄位顯示」、Eye 圖示);
                  2026-10-20 前用漏斗(Filter = 篩選列,不是選欄位)且字是「顯示欄位」(獨立驗證 OV-V07) */}
              <Button variant="tertiary" startIcon={Eye}>欄位顯示</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>表格欄位</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showStatus} onCheckedChange={setShowStatus}>狀態</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showAssignee} onCheckedChange={setShowAssignee}>指派者</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showDue} onCheckedChange={setShowDue}>到期日</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ExampleCaption>↑ 即時套用的設定——改了立刻生效,選單保持開啟可繼續切</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="RadioItem — 從互斥選項選一（選中後選單保持開啟）"
          note="排序方式、檢視模式等只能選一個的設定。選中的那一項以選取底色（neutral-selected 背景）標示，不另畫圓點指示器"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="tertiary" startIcon={ArrowUp}>排序方式</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>依以下排序</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortBy} onValueChange={setSortBy}>
                <DropdownMenuRadioItem value="created">建立時間</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="updated">最後更新</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="priority">優先級</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <ExampleCaption>↑ 互斥選一——目前選中的項目以選取底色標示</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

export const DestructiveRule: Story = {
  name: '破壞性動作規則',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="刪除等不可逆動作：prefix icon + label 都用 text-error"
        note="prefix icon 是 label 的視覺延伸，與 label 同色才是一體。suffix shortcut 維持 fg-muted（提示性資訊不需跟 error 同色）"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem startIcon={Copy}>複製</DropdownMenuItem>
            <DropdownMenuItem startIcon={Share2}>分享</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem startIcon={Trash2} shortcut="⌫" className="text-error">
              永久刪除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ExampleCaption>↑ Trash icon + 「永久刪除」都 text-error；shortcut ⌫ 維持 fg-muted</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 只有 label 變紅，icon 保持 foreground"
        note="icon 和 label 不同色 → 視覺上像兩個東西，破壞 item 的一體感。prefix icon 永遠跟 label 同色"
      >
        <ExampleCaption warn>❌ Trash icon 黑色 + 「刪除」紅色 → 視覺分裂</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="不可逆動作用 Separator 跟一般動作隔開"
        note="刪除 / 取消訂閱等放在選單底部、用 separator 隔開——減少使用者誤觸的可能"
      >
        <ExampleCaption>見上方範例的 Separator 位置（刪除與其他動作中間）</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const SuffixRule: Story = {
  name: '後綴使用規則',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="鍵盤快捷鍵 — canonical shortcut prop（靠右對齊列尾）"
        note={<>使用者熟悉快捷鍵後可跳過選單直接按快捷鍵。shortcut 用 fg-muted 作為輔助資訊色,不搶 label 注意力。標準場景用 <code>shortcut</code> prop（走 MenuItem endContent flex slot,真正靠右對齊列尾);<code>&lt;DropdownMenuShortcut&gt;</code> child 僅為相容 shadcn 的 escape-hatch,會 inline 附加在 label 尾、不會靠右。</>}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">檔案</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem shortcut="⌘N">新增</DropdownMenuItem>
            <DropdownMenuItem shortcut="⌘O">開啟</DropdownMenuItem>
            <DropdownMenuItem shortcut="⌘S">儲存</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TutorialRule>

      <TutorialRule
        title="❌ Shortcut 和自訂後綴不混用（同一個 item 只用一種）"
        note="同一個 item 既有 ⌘S 又有 badge 數量 → 視覺負擔過重，使用者無法一眼判斷哪個是重要資訊"
      >
        <ExampleCaption warn>❌ 「儲存 [未儲存 3 項] ⌘S」→ 混用造成視覺衝突</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
