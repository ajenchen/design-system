// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Filter, Copy, Edit, Trash2, Info } from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverTitle,
} from './popover'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/design-system/components/Dialog/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/design-system/components/Tooltip/tooltip'
import { Button } from '@/design-system/components/Button/button'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'

const meta: Meta = {
  title: 'Design System/Components/Popover/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-wrap gap-3 items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Popover ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsDialogRule / VsDropdownMenuRule / VsTooltipRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Popover 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Popover/展示" name="篩選面板"><span className="text-primary hover:underline font-medium cursor-pointer">篩選面板</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:往下看下方「Popover 與近親元件的分界」三組對照(對上 Dialog、DropdownMenu、Tooltip),確認該用哪個元件。</p>
    </div>

      {/* vs 近親 — VsDialogRule — 原 VsDialogRule */}
      <div>
      <Rule
        title="Popover — non-modal 輕量浮層,使用者可 ignore 繼續主流程"
        note="篩選 / 設定 / 快速切換等補充 UI。背景仍可 scroll、可 click,使用者不需要「處理完」才能繼續工作。典型案例:Jira filter panel、Linear view settings、GitHub file tree 的 branch switcher"
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="tertiary" startIcon={Filter}>依狀態篩選</Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverHeader><PopoverTitle>依狀態篩選</PopoverTitle></PopoverHeader>
            <PopoverBody>
              {/* CheckboxGroup zero-gap canonical(checkbox.spec.md L225)— 非手刻 grid div */}
              <CheckboxGroup>
                <Checkbox defaultChecked label="進行中" />
                <Checkbox label="已完成" />
              </CheckboxGroup>
            </PopoverBody>
          </PopoverContent>
        </Popover>
        <Label>↑ 篩選條件是輔助工具,使用者可選擇不用;不該阻斷背景的列表互動</Label>
      </Rule>

      <Rule
        title="Dialog — modal 阻斷背景,使用者必須處理才能繼續"
        note="建立 / 編輯表單、破壞性確認、重要決策。Overlay 強制聚焦,使用者完成或取消才回到主頁。典型案例:Stripe 建立付款方式、Notion 永久刪除頁面確認、Linear 建立 issue form"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary" danger startIcon={Trash2}>永久刪除專案</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth="440px">
            <DialogHeader>
              <DialogTitle>確定要永久刪除此專案?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">此動作無法復原,所有相關任務、評論、附件都會一併刪除。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label>↑ 破壞性動作必須完整決策,不能讓使用者點旁邊就跳過</Label>
      </Rule>

      <Rule
        title="判準 — 問「使用者可以 ignore 這個浮層、繼續用主介面嗎?」"
        note="可以 ignore → Popover(filter / settings / quick switch)。不能 ignore,必須完成或取消才能繼續 → Dialog(confirm / 表單 wizard / 破壞性動作)"
      >
        <Label>Popover:filter 面板、Linear priority picker、Notion 字體設定</Label>
        <Label>Dialog:建立 project、刪除確認、付款資訊輸入、多步驟 wizard</Label>
      </Rule>
    </div>

      {/* vs 近親 — VsDropdownMenuRule — 原 VsDropdownMenuRule */}
      <div>
      <Rule
        title="DropdownMenu — 固定結構的操作選單(一排 item list)"
        note="語意是「從清單中選一個動作」。鍵盤可上下導覽、Enter 觸發,MenuItem 結構統一。典型案例:Gmail 右鍵選單、Figma layer context menu、GitHub 檔案的 ⋯ 選單"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary">檔案操作 ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem startIcon={Copy}>複製連結</DropdownMenuItem>
            <DropdownMenuItem startIcon={Edit}>重新命名</DropdownMenuItem>
            <DropdownMenuItem startIcon={Trash2}>刪除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Label>↑ 一排可點選的動作 → DropdownMenu,MenuItem 結構鍵盤可直接上下選</Label>
      </Rule>

      <Rule
        title="Popover — 自由組合的 UI 面板(多欄、輸入、圖表皆可)"
        note="語意是「這裡給我一塊可組自訂內容的浮層」。內容完全由 consumer 決定,可放輸入框、多個 section、圖表。典型案例:Jira advanced filter、Notion 屬性編輯、Linear date range picker"
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="tertiary">進階篩選</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <PopoverHeader><PopoverTitle>進階篩選</PopoverTitle></PopoverHeader>
            <PopoverBody>
              <CheckboxGroup>
                <Checkbox defaultChecked label="我指派的" />
                <Checkbox label="我建立的" />
                <Checkbox label="我追蹤的" />
              </CheckboxGroup>
              <div className="border-t border-divider pt-3 mt-1 text-caption text-fg-muted">最多 3 個條件</div>
            </PopoverBody>
            <PopoverFooter>
              <Button variant="tertiary" size="sm" className="flex-1">清除</Button>
              <Button variant="primary" size="sm" className="flex-1">套用</Button>
            </PopoverFooter>
          </PopoverContent>
        </Popover>
        <Label>↑ 多種控制元件並存(checkbox + 說明 + 按鈕列)→ Popover</Label>
      </Rule>

      <Rule
        title="❌ 把 Popover 當 DropdownMenu 用"
        note="一排 MenuItem 塞進 Popover 會失去 menu 語意(鍵盤導覽不完整、role='menu' 缺失、screen reader 不知道這是選單)"
      >
        <Label warn>一排可點選動作應該用 DropdownMenu;Popover 的內容應該是自由組合不只單一 list</Label>
      </Rule>
    </div>

      {/* vs 近親 — VsTooltipRule — 原 VsTooltipRule */}
      <div>
      <Rule
        title="Tooltip — hover 觸發,純文字輔助說明"
        note="解釋 icon 按鈕含義、欄位說明、快捷鍵提示。使用者 hover 看到、移開就消失,內容不可互動。典型案例:Figma toolbar icon tooltip、Slack 按鈕功能提示、Gmail 的快捷鍵說明"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="text" size="sm" iconOnly startIcon={Info} aria-label="說明" />
          </TooltipTrigger>
          <TooltipContent>此欄位只接受英文與數字</TooltipContent>
        </Tooltip>
        <Label>↑ 純文字輔助 → Tooltip(hover 觸發,移開消失)</Label>
      </Rule>

      <Rule
        title="Popover — click 觸發,互動式內容面板"
        note="浮層內可放按鈕、輸入、選擇。使用者點擊才出現,點外部 / Esc 才關閉。典型案例:Linear priority picker、Jira filter panel、Notion 頁面設定"
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="tertiary" size="sm" startIcon={Filter}>篩選</Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverBody>
              <CheckboxGroup>
                <Checkbox defaultChecked label="我的任務" />
                <Checkbox label="全部" />
              </CheckboxGroup>
            </PopoverBody>
          </PopoverContent>
        </Popover>
        <Label>↑ 需要互動 → Popover(click 觸發,內容可點擊)</Label>
      </Rule>

      <Rule
        title="❌ 把 Tooltip 當 Popover 用"
        note="Tooltip 在 hover 離開時就消失,使用者無法把滑鼠移到浮層上點按鈕。放互動元素會失效"
      >
        <Label warn>浮層裡要放按鈕 / checkbox / link → 必須 Popover 或 HoverCard(不是 Tooltip)</Label>
      </Rule>

      <Rule
        title="❌ 把 Popover 當 Tooltip 用"
        note="Popover 必須 click 觸發,「滑到 icon 上看說明」的場景用 Popover 使用者得先點一下才看得到,體驗變重"
      >
        <Label warn>純文字提示應該 hover 就出現 → 用 Tooltip(不要用 Popover)</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const VisualAlignmentRule: Story = {
  name: '視覺對齊 Dialog（浮層視覺語言共用）',
  render: () => (
    <div>
      <Rule
        title="Popover 與 Dialog 共用 overlay-surface 視覺語言"
        note="bg-surface-raised / border-border / rounded-lg / elevation-200 完全一致。Header / Body / Footer 內 padding 來自 overlay-surface pattern 主檔(px-loose py-tight)。差異:(1) Popover 是 non-modal 無 overlay 遮罩,(2) Popover 鎖 layout-space=md(header 精簡)、Dialog 鎖 layout-space=lg(寬鬆呼吸),兩者 ui-size 都繼承 page"
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="tertiary">Popover</Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverHeader><PopoverTitle>Header</PopoverTitle></PopoverHeader>
            <PopoverBody><p className="text-body">Body 區域</p></PopoverBody>
            <PopoverFooter>
              <Button variant="tertiary" size="sm">取消</Button>
              <Button variant="primary" size="sm">套用</Button>
            </PopoverFooter>
          </PopoverContent>
        </Popover>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">Dialog</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth="360px">
            <DialogHeader><DialogTitle>Header</DialogTitle></DialogHeader>
            <DialogBody><p className="text-body">Body 區域</p></DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">套用</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label>↑ 兩個浮層視覺語言一致,consumer 切換不會產生視覺斷層</Label>
      </Rule>

      <Rule
        title="為什麼 density 鎖 md"
        note="頁面 density 大(lg)時,Popover 若跟著放大會失去「輕量補充 UI」的定位 — 使用者會誤以為是主 modal。鎖 md 讓 Popover 永遠比主頁面緊湊,保持「這是補充不是主流程」的視覺暗示"
      >
        <Label>頁面 density = lg,Popover 內部仍是 md — 輕量感不被放大破壞</Label>
      </Rule>
    </div>
  ),
}
