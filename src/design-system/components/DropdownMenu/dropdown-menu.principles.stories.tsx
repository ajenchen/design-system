// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  MoreVertical, Copy, Trash2, Share2, Download,
  ArrowUp, Filter,
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
  DropdownMenuShortcut,
} from './dropdown-menu'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/DropdownMenu/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── WhenToUse — 何時使用 DropdownMenu ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsSelectMenuRule / GroupVsSeparatorRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 DropdownMenu 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/DropdownMenu/展示" name="群組"><span className="text-primary hover:underline font-medium cursor-pointer">群組</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DropdownMenu/展示" name="後綴"><span className="text-primary hover:underline font-medium cursor-pointer">後綴</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DropdownMenu/展示" name="子選單"><span className="text-primary hover:underline font-medium cursor-pointer">子選單</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DropdownMenu/展示" name="Checkbox"><span className="text-primary hover:underline font-medium cursor-pointer">Checkbox</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DropdownMenu/展示" name="單選"><span className="text-primary hover:underline font-medium cursor-pointer">單選</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsSelectMenuRule — 原 VsSelectMenuRule */}
      <div>
      <Rule
        title="DropdownMenu — 執行動作，選完即關閉"
        note="典型場景：卡片右上角 ⋮ 三點選單（複製、刪除、分享）。使用者選一個動作、立即執行、選單消失。value 不保留（沒有「選中狀態」）"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem><Copy size={16} />複製</DropdownMenuItem>
            <DropdownMenuItem><Share2 size={16} />分享</DropdownMenuItem>
            <DropdownMenuItem><Download size={16} />匯出</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-error"><Trash2 size={16} />刪除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Label>↑ 執行動作：複製 / 分享 / 刪除，選完關閉，畫面沒有「選中狀態」</Label>
      </Rule>

      <Rule
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
        <Label warn>↑ 點完選單就關，但「目前選了什麼狀態」沒有視覺保留 → 用 Select</Label>
      </Rule>

      <Rule
        title="判斷法：「選完之後畫面需要保留選中狀態嗎？」"
        note="需要 → Select / SelectMenu；不需要（點完即執行動作）→ DropdownMenu"
      >
        <Label>完整判斷詳見 dropdown-menu.spec.md「與 SelectMenu 的區別」</Label>
      </Rule>
    </div>

      {/* vs 近親 — GroupVsSeparatorRule — 原 GroupVsSeparatorRule */}
      <div>
      <Rule
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
        <Label>↑ 三個 DropdownMenuGroup 自動透過 border-divider 分隔,無需手動 Separator</Label>
      </Rule>

      <Rule
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
        <Label>↑ 同一 Group 內,手動 Separator 在刪除前強調視覺切分</Label>
      </Rule>

      <Rule
        title="❌ 用多個 Separator 手動模擬 Group"
        note="既然 DropdownMenuGroup 自動處理,寫多個 Separator 就是重複勞動 + 容易漏掉或放錯位置"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">❌ 手動 Separator</Button>
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
        <Label warn>↑ 功能等價但每個分隔都要手寫 → 用 Group 更精確表達「語意分組」</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const ItemTypeRule: Story = {
  name: 'Item 類型選擇',
  render: () => {
    const [showStatus, setShowStatus] = React.useState(true)
    const [showAssignee, setShowAssignee] = React.useState(true)
    const [showDue, setShowDue] = React.useState(false)
    const [sortBy, setSortBy] = React.useState('created')
    return (
      <div>
        <Rule
          title="Item — 執行一次性動作（選完關閉）"
          note="複製、刪除、分享、開啟連結等動作。破壞性動作的 prefix icon 和 label 都用 text-error"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="tertiary">檔案操作</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem><Copy size={16} />複製連結<DropdownMenuShortcut>⌘C</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem><Download size={16} />下載<DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-error"><Trash2 size={16} />刪除<DropdownMenuShortcut>⌫</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Rule>

        <Rule
          title="CheckboxItem — 即時生效的 on/off toggle（選單保持開啟）"
          note="顯示 / 隱藏欄位、篩選條件等。選了不關閉選單，讓使用者可一次切多個"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="tertiary" startIcon={Filter}>顯示欄位</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>表格欄位</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showStatus} onCheckedChange={setShowStatus}>狀態</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showAssignee} onCheckedChange={setShowAssignee}>指派者</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showDue} onCheckedChange={setShowDue}>到期日</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Label>↑ 即時套用的設定——改了立刻生效,選單保持開啟可繼續切</Label>
        </Rule>

        <Rule
          title="RadioItem — 從互斥選項選一（選中後關閉）"
          note="排序方式、檢視模式等只能選一個的設定。與 Item 的差異：視覺有 radio 指示器表達「已選中」"
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
          <Label>↑ 互斥選一——視覺上一個 dot 指示當前選項</Label>
        </Rule>
      </div>
    )
  },
}

export const DestructiveRule: Story = {
  name: '破壞性動作規則',
  render: () => (
    <div>
      <Rule
        title="刪除等不可逆動作：prefix icon + label 都用 text-error"
        note="prefix icon 是 label 的視覺延伸，與 label 同色才是一體。suffix shortcut 維持 fg-muted（提示性資訊不需跟 error 同色）"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem><Copy size={16} />複製</DropdownMenuItem>
            <DropdownMenuItem><Share2 size={16} />分享</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-error">
              <Trash2 size={16} />永久刪除
              <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Label>↑ Trash icon + 「永久刪除」都 text-error；shortcut ⌫ 維持 fg-muted</Label>
      </Rule>

      <Rule
        title="❌ 只有 label 變紅，icon 保持 foreground"
        note="icon 和 label 不同色 → 視覺上像兩個東西，破壞 item 的一體感。prefix icon 永遠跟 label 同色"
      >
        <Label warn>（錯誤範例）Trash icon 黑色 + 「刪除」紅色 → 視覺分裂</Label>
      </Rule>

      <Rule
        title="不可逆動作用 Separator 跟一般動作隔開"
        note="刪除 / 取消訂閱等放在選單底部、用 separator 隔開——減少使用者誤觸的可能"
      >
        <Label>見上方範例的 Separator 位置（刪除與其他動作中間）</Label>
      </Rule>
    </div>
  ),
}

export const SuffixRule: Story = {
  name: 'Suffix 使用規則',
  render: () => (
    <div>
      <Rule
        title="DropdownMenuShortcut — 鍵盤快捷鍵（ml-auto 靠右）"
        note="使用者熟悉快捷鍵後可跳過選單直接按快捷鍵。shortcut 用 fg-muted 作為輔助資訊色,不搶 label 注意力"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">檔案</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>新增<DropdownMenuShortcut>⌘N</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem>開啟<DropdownMenuShortcut>⌘O</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem>儲存<DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Rule>

      <Rule
        title="❌ Shortcut 和自訂後綴不混用（同一個 item 只用一種）"
        note="同一個 item 既有 ⌘S 又有 badge 數量 → 視覺負擔過重，使用者無法一眼判斷哪個是重要資訊"
      >
        <Label warn>（錯誤範例）「儲存 [未儲存 3 項] ⌘S」→ 混用造成視覺衝突</Label>
      </Rule>
    </div>
  ),
}
