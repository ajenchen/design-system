// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
// @anatomy-exempt: Dialog footer Cancel/Delete buttons are action cancel (not overlay dismiss); preserved verbatim from pre-refactor structure
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Bot, Sparkles, Users, FolderPlus, Filter, Trash2, AlertCircle } from 'lucide-react'
import { Coachmark } from './coachmark'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverHeader,
  PopoverTitle,
} from '@/design-system/components/Popover/popover'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/design-system/components/Dialog/dialog'
import { Button } from '@/design-system/components/Button/button'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'

const meta: Meta = {
  title: 'Design System/Components/Coachmark/設計原則',
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

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

const DemoMedia = ({
  from = '#6366f1', to = '#8b5cf6', icon: Icon = Sparkles, label = 'Feature',
}: {
  from?: string; to?: string; icon?: React.ComponentType<{ className?: string }>; label?: string
}) => (
  <div
    className="w-full h-full flex items-center justify-center"
    style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
  >
    <div className="flex flex-col items-center gap-1.5 text-white/90">
      <Icon className="w-8 h-8" />
      <span className="text-footnote font-medium">{label}</span>
    </div>
  </div>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>適合 Coachmark 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/Coachmark/展示" name="單步驟新功能介紹"><span className="text-primary hover:underline font-medium cursor-pointer">單步驟新功能介紹</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Coachmark/展示" name="多步 Onboarding Tour"><span className="text-primary hover:underline font-medium cursor-pointer">多步 Onboarding Tour</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Coachmark/展示" name="多步 Tips"><span className="text-primary hover:underline font-medium cursor-pointer">多步 Tips</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 不用 Coachmark 做錯誤提示"
          note="錯誤訊息是使用者動作的回饋(表單驗證失敗、API 錯誤、權限不足)— 應該用 Notice / Alert / Toast 呈現事件。Coachmark 是主動推送教學,語意完全相反"
        >
          <div className="flex items-center gap-2 p-3 border border-error/30 bg-error/5 rounded-md text-caption">
            <AlertCircle className="w-4 h-4 text-error" />
            <span className="text-foreground">這是錯誤訊息的樣子 — 應該用 Notice / Alert / Toast,不是 Coachmark</span>
          </div>
          <Label warn>錯誤 → Notice / Alert / Toast;Coachmark 只用於主動推送教學</Label>
        </Rule>

        <Rule
          title="❌ 不用 Coachmark 做確認框"
          note="確認破壞性動作必須阻斷流程(Dialog)。Coachmark 是 non-modal,使用者可忽略 — 讓破壞性動作變成「可忽略」等於沒確認"
        >
          <Label warn>刪除 / 取消訂閱 / 重置資料 → Dialog(必須阻斷),不用 Coachmark</Label>
        </Rule>

        <Rule
          title="❌ 不強迫完成 tour(無 Skip 選項)"
          note="使用者的本能是「我想自己試試」。沒 Skip = 綁架,使用者找關閉方式或直接關閉整個頁面。永遠提供 Skip 反而提升完成率 — 信任使用者會選擇"
        >
          <Label warn>❌ 只提供 Next 沒有 Skip — 使用者 frustration 增加,產品印象變差</Label>
        </Rule>

        <Rule
          title="❌ Description 塞超過 3 行"
          note="Coachmark 是快速提示不是完整教學。長文案使用者不讀,反而浪費了「主動彈出」的機會。長內容:拆多步 / 改 Dialog / 連結到文件"
        >
          <Label warn>❌ 5+ 行 description — 使用者掃一眼就點 Skip</Label>
          <Label>✅ 2-3 行精準說明,需要深入 → 「了解更多」連結到 help doc</Label>
        </Rule>

        <Rule
          title="❌ 在 Coachmark 內放 nested Popover / Dialog"
          note="浮層嵌套浮層 = 層級混亂 + 焦點管理崩壞 + Esc 不知道關哪個。複雜互動結束 tour 後再開啟;tour 的角色是「指向功能」不是「讓使用者在 tour 內完成任務」"
        >
          <Label warn>❌ Coachmark 內放 Popover / Dialog — 焦點管理崩壞</Label>
        </Rule>

        <Rule
          title="❌ 自包視覺 token(bg / shadow / radius)"
          note="Coachmark 是 Popover 的 composition — 浮層視覺完全繼承 Popover。自己寫 bg-* / shadow-* 會讓 Coachmark 和其他浮層漂移,改 Popover 視覺時 Coachmark 不跟進"
        >
          <Label warn>❌ 在 Coachmark 外殼加 className=&quot;bg-*&quot; / shadow-*;視覺改動一律改 Popover</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="Popover — 使用者主動點擊才出現的互動面板"
          note="filter、設定、快速切換等補充 UI。使用者知道自己要什麼、主動點擊 trigger。典型案例:Jira filter、Linear view settings、Notion 頁面設定"
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="tertiary" startIcon={Filter}>依狀態篩選</Button>
            </PopoverTrigger>
            <PopoverContent align="start">
              <PopoverHeader><PopoverTitle>依狀態篩選</PopoverTitle></PopoverHeader>
              <PopoverBody>
                <div className="grid">
                  <Checkbox defaultChecked label="進行中" />
                  <Checkbox label="已完成" />
                </div>
              </PopoverBody>
            </PopoverContent>
          </Popover>
          <Label>↑ 使用者主動點擊 trigger,面板才出現——這是 Popover 的觸發模型</Label>
        </Rule>

        <Rule
          title="Coachmark — 系統主動推送的功能介紹,anchor 到某個 UI 元素"
          note="使用者不知道新功能存在、不會主動點擊。系統判斷時機(首次進入 / 新版上線)主動出現 Coachmark,anchor 到要介紹的 feature 上。典型案例:Intercom feature discovery、Linear onboarding tour、Slack 新功能提示"
        >
          <Coachmark
            open
            image={<DemoMedia icon={Bot} label="AI 助理" />}
            title="試試新的 AI 助理"
            description="在任何文件中按下 AI 按鈕,讓 Claude 幫你摘要、翻譯或改寫內容。"
            onSkip={() => {}}
            onNext={() => {}}
            side="bottom"
            align="start"
          >
            <Button variant="primary" startIcon={Bot}>AI 助理</Button>
          </Coachmark>
          <Label>↑ 系統主動出現,使用者不需事先知道有這個功能</Label>
        </Rule>

        <Rule
          title="Dialog — modal 阻斷,使用者必須處理才能繼續"
          note="破壞性動作(刪除)、必填表單、重要決策用 Dialog。Overlay 強制聚焦,使用者不能忽略,必須完成或取消。Coachmark 是 non-modal 輔助,使用者可忽略繼續主流程"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary" danger startIcon={Trash2}>永久刪除專案</Button>
            </DialogTrigger>
            <DialogContent autoHeight maxWidth="440px">
              <DialogHeader><DialogTitle>確定要永久刪除此專案?</DialogTitle></DialogHeader>
              <DialogBody><p className="text-body">此動作無法復原,所有相關任務、評論、附件都會一併刪除。</p></DialogBody>
              <DialogFooter>
                <Button variant="tertiary">取消</Button>
                <Button variant="primary" danger>永久刪除</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Label>↑ 破壞性決策必須完整處理,不能讓使用者點旁邊跳過</Label>
        </Rule>

        <Rule
          title="判準 — 問「不看這個資訊會怎樣?」"
          note="不看也能用 → Coachmark(介紹 / 提示 / onboarding)。不看就做不下去(破壞性動作、必要資訊輸入、多步表單)→ Dialog。視覺上 Coachmark 共用 overlay-surface(bg / border / shadow / radius 完全繼承 Popover),差別僅:觸發模型(主動 vs 被動)+ 結構(Coachmark 無 Header / 有 Media / Footer 是 justify-between)"
        >
          <Label>Coachmark:新功能介紹、onboarding tour、版本更新提示</Label>
          <Label>Dialog:刪除確認、建立 project 表單、付款資訊輸入、多步 wizard</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const MultiStepBestPracticesRule: Story = {
  name: '多步 Tour 最佳實踐',
  render: () => (
    <div>
      <Rule
        title="每步 anchor 到對應 feature"
        note="Coachmark 的核心價值是「在 UI 元素旁邊介紹它」。anchor 到無關位置 = 失去精準性,變成一般 onboarding modal。使用者看完要能「記得這個功能在畫面的哪裡」"
      >
        <Coachmark
          open
          image={<DemoMedia icon={Users} from="#f59e0b" to="#ef4444" label="團隊" />}
          title="邀請成員"
          description="輸入 email 寄送邀請,新成員自動加入這個 Workspace。"
          step={{ current: 2, total: 3 }}
          onPrev={() => {}}
          onSkip={() => {}}
          onNext={() => {}}
          side="bottom"
          align="start"
        >
          <Button variant="tertiary" size="sm" startIcon={Users}>邀請成員</Button>
        </Coachmark>
        <Label>↑ Coachmark anchor 到「邀請成員」按鈕,使用者看完就知道去哪找</Label>
      </Rule>

      <Rule
        title="≤ 5 步 — 超過使用者疲勞"
        note="onboarding 的黃金比例是 3 步(Linear / Notion / Figma 都是 3 步)。超過 5 步使用者流失率大幅上升。內容多就拆多次 tour(首次 / 進階 / 專家)而非一次塞完"
      >
        <Label>✅ 3 步:建立 workspace → 邀請成員 → 建立專案(Notion)</Label>
        <Label>✅ 4 步:選模板 → 命名 → 邀協作 → 開始編輯(Figma)</Label>
        <Label warn>❌ 8+ 步 — 使用者 Skip 率 &gt; 60%</Label>
      </Rule>

      <Rule
        title="永遠提供 Skip — 尊重退出意願"
        note="沒 Skip 的 onboarding = 綁架使用者。使用者的本能是「我想自己試試」,強迫看完反而留下負面印象。Skip 是對自主權的尊重,真正有用的 tour 使用者會主動看完"
      >
        <Label warn>❌ 隱藏 Skip、只提供 Next — user 會找關閉方式或直接離開產品</Label>
        <Label>✅ Skip 放在中間位置(Previous / Skip / Next),tertiary variant 不搶焦點但隨時可用</Label>
      </Rule>

      <Rule
        title="最後一步 isLastStep = Next 變 Done"
        note="語意切換告訴使用者「這是最後一步」。如果最後步仍寫 Next,使用者不知道 tour 是否結束,體驗斷裂。Done 的語意收斂明確,讓使用者知道「我完成了」"
      >
        <div className="flex gap-6">
          <Coachmark
            open
            image={<DemoMedia icon={Sparkles} from="#10b981" to="#059669" label="完成" />}
            title="建立你的第一個專案"
            description="專案用來組織相關的任務、文件和討論。"
            step={{ current: 3, total: 3 }}
            isLastStep
            onPrev={() => {}}
            onSkip={() => {}}
            onNext={() => {}}
            side="bottom"
            align="start"
          >
            <Button variant="primary" size="sm" startIcon={Sparkles}>建立專案</Button>
          </Coachmark>
        </div>
        <Label>↑ 最後步 Next 文字 → Done,使用者知道「完成了」</Label>
      </Rule>

      <Rule
        title="Footer 順序 — Previous / Skip / Next"
        note="對齊 Ant Tour / Intercom convention:Previous 最左(回退,視覺權重低)、Skip 中間(退出,tertiary)、Next 最右(推進,primary)。語意由左往右「回退 / 退出 / 推進」,符合使用者的閱讀動線"
      >
        <Label>Previous 第 2+ 步才出現;第 1 步只有 Skip / Next</Label>
      </Rule>

      <Rule
        title="non-modal 設計尊重使用者自主探索"
        note="onboarding 的精神是「幫忙介紹但不強迫」。使用者點 Skip / 按 Esc / 點擊別處都能關閉,不影響主流程。把 onboarding 包在 Dialog 裡 — 使用者第一反應是找 X 關掉,根本沒讀內容"
      >
        <Coachmark
          open
          image={<DemoMedia icon={FolderPlus} from="#0ea5e9" to="#06b6d4" label="Workspace" />}
          title="建立你的第一個 Workspace"
          description="Workspace 是團隊協作的主要空間,所有專案、文件、成員都在這裡集中管理。"
          step={{ current: 1, total: 3 }}
          onSkip={() => {}}
          onNext={() => {}}
          side="bottom"
          align="start"
        >
          <Button variant="primary" startIcon={FolderPlus}>建立 Workspace</Button>
        </Coachmark>
        <Label>↑ 使用者可按 Skip 退出 tour,繼續自己探索 — 不強迫完成</Label>
      </Rule>
    </div>
  ),
}

export const MediaContentRule: Story = {
  name: 'Media 內容原則',
  render: () => (
    <div>
      <Rule
        title="Media = 純視覺說明,幫助理解功能價值"
        note="最佳內容:(1) Illustration / 概念圖(抽象功能最適合)、(2) Screenshot 功能畫面、(3) Animated GIF / Lottie 示範操作。目的是讓使用者「一眼看懂這個功能在做什麼」"
      >
        <Coachmark
          open
          image={<DemoMedia icon={Bot} from="#6366f1" to="#8b5cf6" label="AI Illustration" />}
          title="AI 助理"
          description="illustration 傳達概念,比純文字更快被理解"
          onNext={() => {}}
          side="bottom"
          align="start"
        >
          <Button variant="primary" size="sm">Anchor</Button>
        </Coachmark>
        <Label>↑ Illustration 適合抽象功能(AI / 協作 / 自動化)</Label>
      </Rule>

      <Rule
        title="❌ Media 區不放互動元件"
        note="按鈕 / 輸入 / checkbox 一律走 footer。Media 是「看」的區塊不是「做」的區塊。放互動元素會讓使用者搞不清楚「這個按鈕是示範還是真的能點」,破壞 Coachmark 的教學角色"
      >
        <Label warn>❌ Media 區放 &lt;Button onClick=...&gt; — 使用者分不清示範 vs 實際操作</Label>
        <Label>✅ Media 顯示 static screenshot / illustration,互動一律透過 footer 的 Next 推進</Label>
      </Rule>

      <Rule
        title="Description 不超過 3 行"
        note="Coachmark 是快速說明不是完整教學。超過 3 行使用者沒耐心讀,體驗反而變差。需要詳細說明:(a) 連結到 help doc,(b) 改用 Dialog + scrollable body,(c) 拆成多步 tour"
      >
        <Coachmark
          open
          image={<DemoMedia icon={Sparkles} label="簡潔" />}
          title="簡潔的 description"
          description="兩行說明足以傳達核心價值 — 使用者能快速掃完並理解功能用途。"
          onNext={() => {}}
          side="bottom"
          align="start"
        >
          <Button variant="tertiary" size="sm">Anchor</Button>
        </Coachmark>
        <Label>↑ 2 行精準說明,不超過 3 行</Label>
      </Rule>

      <Rule
        title="Media aspect-video 固定 — 視覺一致"
        note="多步 tour 每步的 media 都是 16:9,確保整個 tour 視覺節奏一致。使用者看到第二步不會因為 media 變高/變矮而分心,教學節奏穩定"
      >
        <Label>所有 Coachmark media 都是 aspect-video(16:9),consumer 準備素材時遵守此比例</Label>
      </Rule>
    </div>
  ),
}
