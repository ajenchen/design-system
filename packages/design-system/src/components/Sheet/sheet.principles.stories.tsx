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
  SheetBody,
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
          <LinkTo kind="Design System/Components/Sheet/展示" name="建立新專案（右側滑入）"><span className="text-primary hover:underline font-medium cursor-pointer">建立新專案（右側滑入）</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Sheet/展示" name="編輯成員詳情（右側滑入）"><span className="text-primary hover:underline font-medium cursor-pointer">編輯成員詳情（右側滑入）</span></LinkTo>
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
            {/* Body 必用 SheetBody(內建 ScrollArea + 浮層 padding SSOT px-loose/pt-tight/pb-bottom);
                自組 ScrollArea + py-4 = 水平 0 padding 歷史 bug,詳 sheet.tsx SheetBody comment。 */}
            <SheetBody className="flex flex-col gap-4">
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
            </SheetBody>
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

      {/* 何時不用 / 替代元件 — 原 WhenNotSheetRule。
          短確認 → Dialog 的完整 live 對照已在上方「Dialog — 居中 modal」段示範,此處不重複(2026-06-11 精簡)。 */}
      <Rule
        title="何時不用 / 替代元件 — 短確認 / 不可逆動作 → Dialog"
        note="「刪除 / 登出 / 放棄變更」這類要使用者完全停下做決定的場景,用 Dialog 的居中 modal 強制聚焦。Sheet 側滑視覺不夠強,使用者可能點旁邊就跳過(live 對照見上方「Dialog — 居中 modal」段)"
      >
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
  name: 'Side 屬性：消費者用 right（其餘內部基建）',
  render: () => (
    <div>
      <Rule
        title="right（消費者唯一合法 side，預設）— detail / 編輯 / 建立"
        note="消費者 Sheet API 只能用 side=&quot;right&quot;。世界級 SaaS 一致的 convention:Jira issue drawer、Linear issue detail、GitHub PR file diff drawer、Stripe customer drawer、Notion database row expand 都在右側。理由是:使用者視線「從左(清單)看到右(詳情)」,右側 Sheet 符合自然閱讀動線"
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
            <SheetBody className="text-body text-fg-secondary">
              登入頁在連續輸入錯誤密碼 3 次後未顯示鎖定提示,使用者反覆嘗試仍無回饋。建議補上鎖定倒數與重設連結。
            </SheetBody>
          </SheetContent>
        </Sheet>
        <Label>↑ 列表點 row → 右側滑入編輯,左側列表仍可見</Label>
      </Rule>

      <Rule
        title="left（DS 內部基建，非消費者 API）— Sidebar 小視口 left-slide"
        note="left 保留 DS 內部基建用（例:Sidebar 在小視口從 left 滑入）,消費者 code 禁止傳 side=&quot;left&quot;,需 user 授權。世界級 mobile nav convention(Slack / Gmail hamburger / Material navigation drawer 在左)是此變體的設計來源,但本 DS 的 mobile navigation 應走專屬 navigation 元件,不混在消費者 Sheet。以下為內部能力示範。"
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
        title="bottom（DS 內部基建，非消費者 API）"
        note="bottom 保留 DS 內部基建用,消費者 code 禁止傳 side=&quot;bottom&quot;。iOS / Material Bottom Sheet convention(手機拇指操作區在螢幕下半)是此變體來源,但本 DS 若需 mobile bottom sheet 應走專屬 BottomSheet 元件,不混在消費者 Sheet 的 side prop。以下為內部能力示範。"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">分享選項(mobile 常用 bottom)</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-w-full">
            <SheetHeader>
              <SheetTitle>分享</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-2">
              {['複製連結', '傳送到 Email', '加入我的最愛', '匯出 PDF'].map(name => (
                <button key={name} type="button" className="px-3 py-2 text-body text-left hover:bg-neutral-hover rounded-md">
                  {name}
                </button>
              ))}
            </SheetBody>
          </SheetContent>
        </Sheet>
        <Label>↑ 手機拇指操作區 → bottom Sheet</Label>
      </Rule>

      <Rule
        title="top（DS 內部基建，非消費者 API）"
        note="top 保留 DS 內部基建用,消費者 code 禁止傳 side=&quot;top&quot;。一般產品極少用(視線從頭頂滑入不自然),僅系統層級的內部情境保留。"
      >
        <Label>↑ 消費者不用 top;為 DS 內部保留變體</Label>
      </Rule>

      <Rule
        title="❌ 消費者傳 side=&quot;left&quot; / &quot;bottom&quot; / &quot;top&quot;"
        note="消費者 Sheet API 只能用 right。傳其他方向 = 越權使用 DS 內部基建變體(需 user 授權)。需 mobile navigation / bottom sheet 請用專屬元件,不要借 Sheet 的內部 side。"
      >
        <Label warn>↑ 消費者只用 side=&quot;right&quot;;left / bottom / top 是內部基建,不可直接傳</Label>
      </Rule>
    </div>
  ),
}

export const HeaderFooterStructureRule: Story = {
  name: '頁首 / 頁尾 結構',
  render: () => (
    <div>
      <Rule
        title="標準結構 — Header(標題 + 描述) + 主內容 + Footer(按鈕列)"
        note="與 Dialog 共用 overlay-surface 視覺語言(bg-surface-raised / elevation-200;容器邊框用較淡的 border-divider,Dialog 用 border-border)。Header 放 SheetTitle + SheetDescription,Footer 放按鈕列;主內容區用 SheetBody(內建 ScrollArea 跨 OS 一致捲軸 + 浮層 padding SSOT)吃長內容"
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
            {/* Body 必用 SheetBody(內建 ScrollArea + 浮層 padding SSOT) */}
            <SheetBody className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>公司名稱</FieldLabel>
                  <Input placeholder="輸入公司名稱" />
                </Field>
                <Field>
                  <FieldLabel>聯絡人 Email</FieldLabel>
                  <Input placeholder="contact@example.com" />
                </Field>
            </SheetBody>
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

