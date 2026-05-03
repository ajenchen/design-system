// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, Filter } from 'lucide-react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from './sheet'
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
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
} from '@/design-system/components/Popover/popover'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'

const meta: Meta = {
  title: 'Design System/Components/Sheet/設計原則',
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

// ── WhenToUse — 何時使用 Sheet ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsDialogRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Sheet 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Sheet/展示" name="右側建立 project"><span className="text-primary hover:underline font-medium cursor-pointer">右側建立 project</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Sheet/展示" name="右側編輯 user detail"><span className="text-primary hover:underline font-medium cursor-pointer">右側編輯 user detail</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsDialogRule — 原 VsDialogRule */}
      <div>
      <Rule
        title="Sheet — 從邊緣滑入,側邊工作流程 / 複雜表單 / 長時間編輯"
        note="使用者在主頁看清單、點擊某一項 → Sheet 從右側滑入編輯。Sheet 較輕、較長,讓使用者可以「看到 context 同時編輯」。典型案例:Jira issue drawer、Linear issue detail、Stripe customer detail panel、Notion database 單列展開編輯"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">編輯專案設定</Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>專案設定</SheetTitle>
              <SheetDescription>修改此專案的基本資訊與通知偏好</SheetDescription>
            </SheetHeader>
            {/* Overlay body 長內容必用 ScrollArea 而非 native overflow-y-auto,對齊 DS
                跨 OS 一致 canonical(避免 Windows/Linux 右側被吃 15-17px)。 */}
            <ScrollArea className="flex-1">
              <div className="py-4 flex flex-col gap-4">
                <Field>
                  <FieldLabel>名稱</FieldLabel>
                  <Input defaultValue="產品路線圖" />
                </Field>
                <Field>
                  <FieldLabel>描述</FieldLabel>
                  <Input defaultValue="Q1 / Q2 產品開發重點" />
                </Field>
                <Field>
                  <FieldLabel>通知</FieldLabel>
                  <div className="grid">
                    <Checkbox defaultChecked label="新任務" />
                    <Checkbox label="每日摘要" />
                  </div>
                </Field>
              </div>
            </ScrollArea>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="tertiary">取消</Button>
              </SheetClose>
              <Button variant="primary">儲存</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <Label>↑ 多欄位編輯 + 仍想看主頁 context → Sheet(側滑不完全遮蔽主頁)</Label>
      </Rule>

      <Rule
        title="Dialog — 居中 modal,短確認 / 重要決策 / 不可逆動作"
        note="視覺完全聚焦,overlay 遮住主頁。適合需要使用者完全停下、做決定的場景。典型案例:Stripe 永久刪除客戶、Notion workspace 轉移、Linear 刪除 project、Figma 放棄未儲存變更"
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
              <p className="text-body">此動作無法復原。所有任務、評論、附件都將一併刪除。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label>↑ 短決策 + 不可逆 → Dialog(完全聚焦,不讓使用者漏掉)</Label>
      </Rule>

      <Rule
        title="判準 — Sheet 做「工作」,Dialog 做「決定」"
        note="Sheet 用於需要 context 的多欄位編輯(使用者會花時間填,想看主頁資料)。Dialog 用於聚焦決策(確認 / 取消,不需要看主頁)。Sheet 可長、可複雜;Dialog 短、視線聚集"
      >
        <Label>Sheet:建立 issue、編輯成員、filter 面板、detail drawer</Label>
        <Label>Dialog:刪除確認、放棄變更、登入、付款確認</Label>
      </Rule>

      {/* 何時不用 / 替代元件 — 原 WhenNotSheetRule */}
      <Rule
        title="何時不用 / 替代元件 — 短確認 / 不可逆動作 → Dialog"
        note="「刪除 / 登出 / 放棄變更」這類要使用者完全停下做決定的場景,用 Dialog 的居中 modal 強制聚焦。Sheet 側滑視覺不夠強,使用者可能點旁邊就跳過"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="primary" danger startIcon={Trash2}>刪除帳號</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth="420px">
            <DialogHeader>
              <DialogTitle>確定要刪除帳號?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">所有資料將於 30 天後永久移除,此動作無法復原。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger>確認刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Label>↑ 短決策應該用 Dialog(Sheet 太長太輕)</Label>
      </Rule>

      <Rule
        title="何時不用 / 替代元件 — 輕量提示 / 設定 mini panel → Popover"
        note="filter 條件、快速切換設定、小型操作面板 — 不需要 Sheet 的龐大篇幅。Popover 附在 trigger 旁邊、更輕量、使用者可忽略繼續主流程"
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="tertiary" startIcon={Filter}>篩選</Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <PopoverBody>
              <div className="grid">
                <Checkbox defaultChecked label="進行中" />
                <Checkbox label="已完成" />
              </div>
            </PopoverBody>
          </PopoverContent>
        </Popover>
        <Label>↑ 少量選項 + 輕量補充 UI → Popover(別用 Sheet 的整面篇幅)</Label>
      </Rule>

      <Rule
        title="何時不用 / 替代元件 — Mobile 大量內容、沉浸編輯 → full Dialog 或專屬頁面"
        note="Sheet 在 mobile 預設占 75% 寬,若內容複雜需全螢幕,改用 fullscreen Dialog 或導航到獨立頁面。Mobile 上硬塞大量欄位到 right Sheet 會變得難滑、難看"
      >
        <Label>↑ 手機上大量欄位 + 複雜表單 → 獨立頁面或 fullscreen Dialog</Label>
      </Rule>

      <Rule
        title="何時不用 / 替代元件 — 短暫回饋(成功 / 失敗)→ Toast"
        note="「已儲存」「刪除失敗」這類短暫非阻斷的回饋,用 Toast 自動消失。Sheet 需要使用者明確關閉,給短訊息用 Sheet 是過度阻斷"
      >
        <Label>↑ 操作結果回饋 → Toast(不用 Sheet 讓使用者手動關)</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const SidePropRule: Story = {
  name: 'side prop 的世界級 convention',
  render: () => (
    <div>
      <Rule
        title="right(預設)— detail / 編輯 / 建立"
        note="世界級 SaaS 一致的 convention:Jira issue drawer、Linear issue detail、GitHub PR file diff drawer、Stripe customer drawer、Notion database row expand 都在右側。理由是:使用者視線「從左(清單)看到右(詳情)」,右側 Sheet 符合自然閱讀動線"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">右側編輯</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>任務詳情</SheetTitle>
              <SheetDescription>#PROJ-234 · 指派給Ada Chen</SheetDescription>
            </SheetHeader>
            <div className="flex-1 py-4 text-body text-fg-secondary">
              (詳情內容)
            </div>
          </SheetContent>
        </Sheet>
        <Label>↑ 列表點 row → 右側滑入編輯,左側列表仍可見</Label>
      </Rule>

      <Rule
        title="left — navigation / filter / 主選單"
        note="世界級 convention:Slack mobile nav、Gmail mobile hamburger、Material Design navigation drawer 都在左側。理由是:導覽的「回到哪裡」概念,視線從左開始自然找得到。Desktop 有 persistent Sidebar 的產品通常不用 left Sheet,mobile 才用"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">☰ 左側目錄</Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>目錄</SheetTitle>
            </SheetHeader>
            <div className="flex-1 py-2 flex flex-col">
              {['總覽', '任務', '成員', '設定'].map(name => (
                <button key={name} type="button" className="px-3 py-2 text-body text-left hover:bg-neutral-hover rounded-md">
                  {name}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <Label>↑ 主導覽 / 目錄 → 左側(mobile hamburger 展開)</Label>
      </Rule>

      <Rule
        title="bottom — mobile action sheet / picker"
        note="iOS / Material Bottom Sheet convention。手機拇指操作範圍集中在螢幕下半部,bottom Sheet 讓操作觸及成本低。桌機用 bottom Sheet 較少見(視線要向下掃,不自然)"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">分享選項(mobile 常用 bottom)</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-w-full">
            <SheetHeader>
              <SheetTitle>分享</SheetTitle>
            </SheetHeader>
            <div className="flex-1 py-4 flex flex-col gap-2">
              {['複製連結', '傳送到 Email', '加入我的最愛', '匯出 PDF'].map(name => (
                <button key={name} type="button" className="px-3 py-2 text-body text-left hover:bg-neutral-hover rounded-md">
                  {name}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <Label>↑ 手機拇指操作區 → bottom Sheet</Label>
      </Rule>

      <Rule
        title="top — 少見,notification center / system announcement"
        note="iOS Control Center 的 top pull-down 是少數案例。一般產品很少用,因為視線從頭頂滑入不自然。只在「系統層級通知」的極少數情境使用"
      >
        <Label>↑ 一般業務流程不用 top(視線動線不自然)</Label>
      </Rule>

      <Rule
        title="❌ 錯亂 side 對應 — 編輯用 left、目錄用 right"
        note="違反世界級 convention 會讓使用者不知道浮層是什麼類型。編輯 / 詳情永遠 right,導覽永遠 left"
      >
        <Label warn>↑ 不要用 left 放編輯表單(使用者以為是目錄,打開驚訝是表單)</Label>
      </Rule>
    </div>
  ),
}

export const HeaderFooterStructureRule: Story = {
  name: 'Header / Footer 結構',
  render: () => (
    <div>
      <Rule
        title="標準結構 — Header(標題 + 描述) + 主內容 + Footer(按鈕列)"
        note="與 Dialog 共用 overlay-surface 視覺語言(bg-surface-raised / border-border)。Header 放 SheetTitle + SheetDescription,Footer 放按鈕列;主內容區 flex-1 + overflow-y-auto 吃長內容"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">標準結構範例</Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>建立新客戶</SheetTitle>
              <SheetDescription>填寫基本資料後可進行付款設定</SheetDescription>
            </SheetHeader>
            {/* Overlay body 長內容必用 ScrollArea,對齊 DS 跨 OS 一致 canonical */}
            <ScrollArea className="flex-1">
              <div className="py-4 flex flex-col gap-4">
                <Field>
                  <FieldLabel>公司名稱</FieldLabel>
                  <Input placeholder="輸入公司名稱" />
                </Field>
                <Field>
                  <FieldLabel>聯絡人 Email</FieldLabel>
                  <Input placeholder="contact@example.com" />
                </Field>
              </div>
            </ScrollArea>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="tertiary">取消</Button>
              </SheetClose>
              <Button variant="primary">建立</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <Label>↑ Header(why)+ Body(do what)+ Footer(finalize),三段式結構</Label>
      </Rule>

      <Rule
        title="Footer 按鈕順序 — 取消在左(或起點),Primary 在右(終點)"
        note="與 Dialog 一致。使用者動線從左到右、從起點到終點,Primary 放終點符合「完成動作」的位置。破壞性動作加 danger,不改位置"
      >
        <Label>✅ 左:取消 / 右:儲存</Label>
        <Label>✅ 左:取消 / 右:永久刪除(danger 顏色疊加,位置不變)</Label>
      </Rule>
    </div>
  ),
}

