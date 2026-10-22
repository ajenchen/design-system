// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from './dialog'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Dialog/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


// 範例多半是一顆打開對話框的按鈕:範例維持自然寬度(naturalWidth),不再逐顆寫 self-start(T15)
const TutorialRule = createTutorialRule({ examples: true, naturalWidth: true, examplesClassName: 'max-w-md' })

// ── WhenToUse — 何時使用 Dialog ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>需要使用者專注完成、而且要先擋住背景互動的流程:建立 / 編輯複雜表單、多步驟精靈、付款結帳、破壞性動作的確認、必須看到才能繼續的重要公告。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/Dialog/展示" name="表單">表單</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Dialog/展示" name="長內容">長內容</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Dialog/展示" name="危險操作">危險操作</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Dialog/展示" name="主體放清單">主體放清單</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
          title="Dialog 的 sweet spot — 需要使用者聚焦的操作流程、阻斷背景互動"
          note="建立 / 編輯複雜表單、破壞性動作確認、重要公告。Overlay + 居中 modal 強制使用者完成或取消才能回到頁面"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">建立新專案</Button>
            </DialogTrigger>
            <DialogContent height="hug" maxWidth={480}>
              <DialogHeader>
                <DialogTitle>建立新專案</DialogTitle>
              </DialogHeader>
              <DialogBody>
                {/* 表單欄位堆疊 = FieldGroup(欄位之間 loose,field.spec.md);欄位名稱由 FieldLabel 承擔,不拿 placeholder 當名稱 */}
                <FieldGroup>
                  <Field>
                    <FieldLabel>專案名稱</FieldLabel>
                    <Input />
                  </Field>
                  <Field>
                    <FieldLabel>專案描述</FieldLabel>
                    <Input />
                  </Field>
                </FieldGroup>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary">取消</Button>
                <Button variant="primary">建立</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TutorialRule>

        <TutorialRule
          title="✅ 破壞性動作確認（Dialog 的典型用途）"
          note="刪除、登出多裝置、放棄變更等動作必須 Dialog 確認——這種動作不該用 Toast（沒有確認流程）、不該用 Sheet（視覺不夠強調）、必須 modal 強制聚焦"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary" danger startIcon={Trash2}>永久刪除專案</Button>
            </DialogTrigger>
            <DialogContent height="hug" maxWidth={440}>
              <DialogHeader>
                <DialogTitle>確定要永久刪除此專案？</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="text-body">此動作無法復原，所有相關資料將一併刪除。</p>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary">取消</Button>
                <Button variant="primary" danger>永久刪除</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 操作結果短暫回饋：用 Toast"
          note="儲存成功 / 刪除失敗等結果回饋是「短暫非阻斷」的——使用者不需要按「確定」關閉，也不該被流程打斷。Dialog 會阻斷流程，Toast 自動消失"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">儲存變更</Button>
            </DialogTrigger>
            <DialogContent height="hug" maxWidth={400}>
              <DialogHeader>
                <DialogTitle>儲存成功</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="text-body">您的變更已儲存至伺服器</p>
              </DialogBody>
              <DialogFooter>
                <Button variant="primary">確定</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ExampleCaption warn>↑ 儲存成功應該 Toast 閃一下就消失，不該打斷使用者再按「確定」</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 持久性頁面通知：用 Alert"
          note="「方案即將到期」「帳號未驗證」這類需要 persistent 顯示 + 使用者主動處理的訊息，Alert 嵌入在頁面中，不阻斷流程但持續可見"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">前往首頁</Button>
            </DialogTrigger>
            <DialogContent height="hug" maxWidth={420}>
              <DialogHeader>
                <DialogTitle>方案即將到期</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="text-body">您的方案將在 3 天後到期</p>
              </DialogBody>
            </DialogContent>
          </Dialog>
          <ExampleCaption warn>↑ 到期提示每次進首頁都跳 Dialog → 反覆阻斷；應該用 Alert 持久 inline 通知</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 側邊工作流程：用 Sheet"
          note="檢視某項目詳情、側邊 filter panel、編輯 inspector——這類與主頁面平行的工作，使用者仍需看到主頁 context。Sheet 從邊緣滑入、較輕，不完全阻斷視線"
        >
          <ExampleCaption>例:任務詳情的側邊編輯 → 用 Sheet,不用 Dialog 把主清單整個擋住</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li>貼著按鈕的精簡選單 / 設定 → DropdownMenu 或 Popover:輕量浮層,不需要擋住整頁</li>
          <li>滑過才出現的輔助資訊 → Tooltip 或 HoverCard:滑過不該打開會擋住畫面的對話框</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Sheet</strong> —— 從側邊滑入、主頁仍看得到:看詳情、側邊編輯、篩選面板這類和主頁平行的工作</li>
          <li><strong>Popover</strong> —— 貼著觸發點的輕量浮層,點外面就關;內容短、不需要擋住整頁</li>
          <li><strong>Alert / Toast</strong> —— 只是告知:Alert 留在頁面裡等人處理,Toast 閃一下就消失;都不需要使用者按「確定」</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const HeightBehaviorRule: Story = {
  name: '高度行為選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="內容會載入、展開或變化：使用預設高度"
        note="預先穩定 dialog 的可用高度，讓 body 獨立捲動，可避免異步資料或展開區塊使整個浮層上下跳動。設定面板、動態清單與未知長度的內容應保留預設值。"
      >
        <ExampleCaption>判斷關鍵是「開啟後內容高度還會不會變」，不是當下看起來有幾行。</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title='內容已知且穩定：使用 height="hug"'
        note="確認框、短表單與固定文案可讓浮層貼合內容，避免少量資訊佔滿視窗。若未來會加入異步 section，應回到預設高度，不要為當前快照選 hug。（舊名 autoHeight 已停用，見 dialog.spec.md「高度軸」）"
      >
        <ExampleCaption>「刪除專案？」這類單一決策適合 hug；會增減區塊的設定流程不適合。</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="內容長度不只是高度問題"
        note="超過三步、需長時間停留，或使用者必須同時參照背景頁面的流程，應改用獨立頁面或 Sheet。Dialog 的 modal 阻斷成本不會因為可捲動就消失。"
      >
        <ExampleCaption>高度 mode 只解決佈局穩定性；工作流載體仍要先在 Dialog、Sheet 與獨立頁面之間做選擇。</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const FooterActionRule: Story = {
  name: '頁尾按鈕配對',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Primary + Tertiary 是預設配對（儲存 + 取消 / 確認 + 取消）"
        note="確認類動作用 primary，取消類動作用 tertiary。按鈕靠右對齊（justify-end），primary 在最右（使用者動線終點）"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">標準配對</Button>
          </DialogTrigger>
          <DialogContent height="hug" maxWidth={420}>
            <DialogHeader>
              <DialogTitle>儲存變更</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">變更將儲存到雲端，其他協作者將看到更新。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TutorialRule>

      <TutorialRule
        title="破壞性動作：Primary + danger"
        note="刪除 / 永久移除等動作用 primary + danger（立即且不可逆）。必須搭配 Cancel button 讓使用者反悔"
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary" startIcon={AlertTriangle}>刪除動作確認</Button>
          </DialogTrigger>
          <DialogContent height="hug" maxWidth={420}>
            <DialogHeader>
              <DialogTitle>確定要刪除？</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">此動作無法復原。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TutorialRule>

      <TutorialRule
        title="❌ 只有一顆「確定」按鈕的 Dialog 是反模式"
        note="單一「確定」按鈕的 Dialog 等於強迫使用者 acknowledge 訊息——這類訊息應該用 Toast（短暫非阻斷）或 Alert（持久顯示）。Dialog 的阻斷成本太高"
      >
        <ExampleCaption warn>↑ 改用 Toast 或 Alert，Dialog 保留給有決策 / 動作選擇的場景</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
