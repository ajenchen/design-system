// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @overlay-open-skip: 本檔為 usage-guidance(設計原則)story——每個 Rule 卡片以「關閉的 trigger 按鈕」並排比較 Sheet / Dialog / Popover 何時用;全部 defaultOpen 會讓多個 portal 疊在一起、視覺全毀。overlay 開啟狀態的視覺覆蓋由 sheet.stories.tsx(展示)+ sheet.anatomy.stories.tsx(Inspector defaultOpen)負責。
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, Filter } from 'lucide-react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  DialogClose,
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
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Sheet/設計原則',
  parameters: { layout: 'padded' },
  // 範例裡的「儲存」「建立」「永久刪除」= 完成後跳 Toast 再關閉(同 sheet.stories.tsx 展示層);Toaster 是 app 層 Provider,
  // 放在 story 外層、不當教學頁裡的一塊(同 toast.principles.stories.tsx 的寫法,放進 TutorialPage 會多佔一格塊距)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Sheet ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsDialogRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>從右側滑入、和主頁面平行的工作:看清單時點一筆展開詳情編輯、篩選面板、通知 / 購物車這類暫時性內容;使用者編輯時仍看得到主頁的脈絡。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/Sheet/展示" name="建立新專案（右側滑入）">建立新專案（右側滑入）</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Sheet/展示" name="編輯成員詳情（右側滑入）">編輯成員詳情（右側滑入）</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
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
              </SheetHeader>
              {/* Body 必用 SheetBody(內建 ScrollArea + 浮層 padding SSOT px-loose/pt-tight/pb-bottom);
                  自組 ScrollArea + py-4 = 水平 0 padding 歷史 bug,詳 sheet.tsx SheetBody comment。 */}
              <SheetBody className="flex flex-col gap-[var(--layout-space-loose)]">
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
                    <CheckboxGroup>
                      <Checkbox defaultChecked label="新任務" />
                      <Checkbox label="每日摘要" />
                    </CheckboxGroup>
                  </Field>
              </SheetBody>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="tertiary">取消</Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button variant="primary" onClick={() => toast({ variant: 'success', title: '專案設定已儲存' })}>儲存</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <ExampleCaption>↑ 多欄位編輯 + 仍想看主頁 context → Sheet(側滑不完全遮蔽主頁)</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 短確認 / 不可逆動作:用 Dialog"
          note="「刪除 / 登出 / 放棄變更」這類要使用者完全停下做決定的場景,用 Dialog 的居中 modal 強制聚焦。Sheet 側滑視覺不夠強,使用者可能點旁邊就跳過(live 對照見上方「Dialog — 居中 modal」段)"
        >
          <ExampleCaption>↑ 短決策應該用 Dialog(Sheet 太長太輕)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 輕量提示 / 小型設定面板:用 Popover"
          note="filter 條件、快速切換設定、小型操作面板 — 不需要 Sheet 的龐大篇幅。Popover 附在 trigger 旁邊、更輕量、使用者可忽略繼續主流程"
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="tertiary" startIcon={Filter}>篩選</Button>
            </PopoverTrigger>
            {/* naked popover(無 PopoverTitle)→ 自傳 aria-label 讓 role="dialog" 有 accessible name(popover.spec.md A11y) */}
            <PopoverContent align="start" aria-label="依狀態篩選">
              <PopoverBody>
                <CheckboxGroup>
                  <Checkbox defaultChecked label="進行中" />
                  <Checkbox label="已完成" />
                </CheckboxGroup>
              </PopoverBody>
            </PopoverContent>
          </Popover>
          <ExampleCaption>↑ 少量選項 + 輕量補充 UI → Popover(別用 Sheet 的整面篇幅)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 短暫回饋(成功 / 失敗):用 Toast"
          note="「已儲存」「刪除失敗」這類短暫非阻斷的回饋,用 Toast 自動消失。Sheet 需要使用者明確關閉,給短訊息用 Sheet 是過度阻斷"
        >
          <ExampleCaption>↑ 操作結果回饋 → Toast(不用 Sheet 讓使用者手動關)</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Dialog — 居中 modal,短確認 / 重要決策 / 不可逆動作"
          note="視覺完全聚焦,overlay 遮住主頁。適合需要使用者完全停下、做決定的場景。典型案例:Stripe 永久刪除客戶、Notion workspace 轉移、Linear 刪除 project、Figma 放棄未儲存變更"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary" danger startIcon={Trash2}>永久刪除專案</Button>
            </DialogTrigger>
            <DialogContent height="hug" maxWidth="440px">
              <DialogHeader>
                <DialogTitle>確定要永久刪除此專案?</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="text-body">此動作無法復原。所有任務、評論、附件都將一併刪除。</p>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="tertiary">取消</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary" danger onClick={() => toast({ variant: 'success', title: '專案已永久刪除' })}>永久刪除</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ExampleCaption>↑ 短決策 + 不可逆 → Dialog(完全聚焦,不讓使用者漏掉)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="判準 — Sheet 做「工作」,Dialog 做「決定」"
          note="Sheet 用於需要 context 的多欄位編輯(使用者會花時間填,想看主頁資料)。Dialog 用於聚焦決策(確認 / 取消,不需要看主頁)。Sheet 可長、可複雜;Dialog 短、視線聚集"
        >
          <ExampleCaption>Sheet:建立 issue、編輯成員、filter 面板、detail drawer</ExampleCaption>
          <ExampleCaption>Dialog:刪除確認、放棄變更、登入、付款確認</ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const SidePropRule: Story = {
  name: 'Side 屬性：消費者用 right（其餘內部基建）',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="right（消費者唯一合法 side，預設）— detail / 編輯 / 建立"
        note="消費者 Sheet API 只用 side=&quot;right&quot;;left / top / bottom 是 DS 內部基建,消費者不傳。世界級 SaaS 一致的 convention:Jira issue drawer、Linear issue detail、GitHub PR file diff drawer、Stripe customer drawer、Notion database row expand 都在右側。理由是:使用者視線「從左(清單)看到右(詳情)」,右側 Sheet 符合自然閱讀動線"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">查看任務詳情</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>任務詳情</SheetTitle>
            </SheetHeader>
            <SheetBody className="text-body text-fg-secondary">
              登入頁在連續輸入錯誤密碼 3 次後未顯示鎖定提示,使用者反覆嘗試仍無回饋。建議補上鎖定倒數與重設連結。
            </SheetBody>
          </SheetContent>
        </Sheet>
        <ExampleCaption>↑ 列表點 row → 右側滑入詳情,左側列表仍可見</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const HeaderFooterStructureRule: Story = {
  name: '頁首、內容與頁尾',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="標準結構 — Header(標題)+ Body + Footer"
        note="與 Dialog 共用 overlay-surface 視覺語言(bg-surface-raised / elevation-200;容器邊框用較淡的 border-divider,Dialog 用 border-border)。Header 放 SheetTitle,Footer 放按鈕列;主內容區用 SheetBody(內建 ScrollArea 跨 OS 一致捲軸 + 浮層 padding SSOT)吃長內容"
      >
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">建立新客戶</Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>建立新客戶</SheetTitle>
            </SheetHeader>
            {/* Body 必用 SheetBody(內建 ScrollArea + 浮層 padding SSOT) */}
            <SheetBody className="flex flex-col gap-[var(--layout-space-loose)]">
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
              <SheetClose asChild>
                <Button variant="primary" onClick={() => toast({ variant: 'success', title: '客戶已建立' })}>建立</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <ExampleCaption>↑ Header(why)+ Body(do what)+ Footer(finalize),三段式結構</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="Footer 按鈕順序 — 取消在左(或起點),Primary 在右(終點)"
        note="與 Dialog 一致。使用者動線從左到右、從起點到終點,Primary 放終點符合「完成動作」的位置。破壞性動作加 danger,不改位置"
      >
        <ExampleCaption>✅ 左:取消 / 右:儲存</ExampleCaption>
        <ExampleCaption>✅ 左:取消 / 右:永久刪除(danger 顏色疊加,位置不變)</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

