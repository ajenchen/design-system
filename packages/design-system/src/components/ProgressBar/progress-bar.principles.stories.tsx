// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: Merged WhenToUse + WhenNotToUse + VsCircularProgressRule
// + FileItemBoundaryRule into a single `UsageGuidance` story (3 sections — 何時用 /
// 何時不用 + 替代 / vs 近親) per 2026-04-26 user mandate. StatusRule + AffixRule kept.
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Paperclip, X } from 'lucide-react'
import { ProgressBar } from './progress-bar'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { FileItem } from '@/design-system/components/FileItem/file-item'
import { Button } from '@/design-system/components/Button/button'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'
import { ItemPrefix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta = {
  title: 'Design System/Components/ProgressBar/設計原則',
  parameters: { layout: 'padded' },
  // Toaster 是 app 層 Provider(toast.spec.md:consumer 在 app root 放一次)—— 放在 story 外層,不當成教學頁裡的一塊(同 Toast 設計原則頁)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, naturalWidth: true })

// 範例欄寬(只限寬、不畫框):2026-10-27 前這裡是手刻的卡片(邊框 + 底色 + 內距)—— DS 沒有這個元件,每一則都包同一種假卡片
//(稽核 L051 / D14「不應該亂造新的元件」、F-S3;批次匯入真正的樣子見「展示 / 批次任務進度」:對話框裡的進度)。
const Frame = ({ children, width = 400 }: { children: React.ReactNode; width?: number }) => <div style={{ width }}>{children}</div>

/** 一列進度:名稱 → 進度條 = tight(名稱替這條進度命名 = labeling,layoutSpace.spec.md「親疏 3 級」functional 交互) */
const LabeledProgress = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-[var(--layout-space-tight)]">
    <span className="text-body">{label}</span>
    {children}
  </div>
)

/** AffixRule 的取消鈕:真的取消(稽核 Q-specimen:看得到的按鈕都要能動,user 2026-09-08 F-S2) */
function CancellableExport() {
  const [cancelled, setCancelled] = React.useState(false)
  if (cancelled) return <p className="text-body text-fg-secondary">已取消匯出 2026 年訂單</p>
  return (
    <LabeledProgress label="匯出 2026 年訂單 CSV">
      <ProgressBar
        value={42}
        status="inProgress"
        aria-label="匯出 2026 年訂單進度"
        affix={<Button variant="text" size="xs" iconOnly startIcon={X} aria-label="取消匯出" onClick={() => setCancelled(true)} />}
      />
    </LabeledProgress>
  )
}

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 ProgressBar 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li>
              <StoryLink kind="Design System/Components/ProgressBar/展示" name="批次任務進度">批次任務進度</StoryLink>
              <span className="text-fg-secondary"> — CSV 匯入 1,250 筆客戶資料、批次寄送:總量已知,單一 prominent 進度條讓使用者掌握整體完成比例</span>
            </li>
            <li>
              <StoryLink kind="Design System/Components/ProgressBar/展示" name="DataTable 儲存格內進度">DataTable 儲存格內進度</StoryLink>
              <span className="text-fg-secondary"> — 列表中每列各自的配額使用率 / 任務完成度,4px 細線不搶走主要欄位的閱讀重量</span>
            </li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 未知進度不要用 ProgressBar(永遠卡 0% 或亂跳)"
          note="使用者看到進度條預期會推進。若無法量化,任何假進度(隨機加 % 撐場面)都會讓使用者懷疑 app 壞掉。未知進度一律改用 CircularProgress(indeterminate)。"
        >
          <Frame>
            {/* @layout-space-magic-ok: 行內 進度 ↔ 文字(layoutSpace.spec.md:166 micro) */}
            <div className="flex items-center gap-3">
              <CircularProgress aria-label="計算中" />
              <span className="text-body">計算統計報表中...</span>
            </div>
          </Frame>
          <ExampleCaption>✅ 未知時長用 CircularProgress(indeterminate),不假裝有進度</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ < 1 秒的短暫操作不要用 ProgressBar"
          note="ProgressBar fill 有 300ms transition,在極短操作反而閃爍不自然。< 1 秒的非同步通常不需要任何 loading 視覺(結果直接呈現即可)。"
        >
          <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '設定已儲存' })}>儲存設定</Button>
          <ExampleCaption>✅ 極短操作:完成後跳 Toast,畫面上不插入任何進度視覺(送出成功一律 Toast,keyboard-model-canonical.md)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不要在多檔上傳列表上方再加「總進度」bar"
          note="每個檔案一條 ProgressBar 已足夠表達整體狀態(使用者自然從完成數量推算),再加一條總 bar 會造成視覺重複與同步邏輯漂移。Dropbox / Google Drive 都只顯示每檔 bar。"
        >
          <Frame width={480}>
            {/* 上傳列表載體 = FileItem(compact list gap-1 canonical;內部消費 ProgressBar)—
                不手組 Paperclip + 檔名 + ProgressBar(見下方「檔案上傳 UI → 用 FileItem」rule) */}
            {/* @layout-space-magic-ok: compact FileItem 清單 gap 4px(file-item.spec.md:264)(layoutSpace.spec.md:113 同範疇 spec-own) */}
            <div className="flex flex-col gap-1">
              <FileItem mode="compact" name="會議記錄_0418.docx" status="completed" />
              <FileItem mode="compact" name="簡報素材.zip" status="uploading" progress={62} />
              <FileItem mode="compact" name="截圖.png" status="uploading" progress={0} />
            </div>
          </Frame>
          <ExampleCaption>✅ 每檔一條(FileItem 內建),整體進度由使用者自然感知(1 檔完成、2 檔進行中)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不要硬寫色值繞過 status"
          note="status 三選一是系統決定的語意。consumer 要紅、綠、藍以外的色 → 提到系統層討論是否新增 status,不要每個消費者自己用 className override fill 色。"
        >
          <Frame>
            <ProgressBar value={55} status="inProgress" aria-label="標準進度色示範" />
          </Frame>
          <ExampleCaption>✅ 走 status token(info / success / error),不 override 色值</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="能告訴使用者「剩下 X%」嗎?能 + 大區塊 → ProgressBar;不能或小空間 → CircularProgress"
          note="determinate(已知進度) vs indeterminate(不知時長)是最核心的分界。使用者對這兩種視覺的預期不同:ProgressBar 暗示「可估算完成時間 + 大區塊水平」,CircularProgress(無 value)暗示「等一下,我也不知道要多久」。選錯會讓使用者一直盯著看以為快好了,或以為卡住。"
        >
          <Frame>
            <LabeledProgress label="匯出客戶名單 CSV">
              <ProgressBar value={65} status="inProgress" affix="value" aria-label="匯出客戶名單進度" />
            </LabeledProgress>
          </Frame>
          <ExampleCaption>✅ CSV 匯出 / 批次處理:總量已知 → ProgressBar(檔案上傳改用 FileItem,見下方)</ExampleCaption>

          <Frame>
            {/* 轉圈 24 ≤ 24 → 住前綴槽 ItemPrefix(h-[1lh])對齊標題第一行(item-anatomy.spec.md「24px 閾值對齊規則」);容器 text-body 建立 1lh */}
            {/* @layout-space-magic-ok: 行內 進度 ↔ 文字(layoutSpace.spec.md:166 micro) */}
            <div className="flex items-start gap-3 text-body">
              <ItemPrefix>
                <CircularProgress aria-label="驗證信用卡中" />
              </ItemPrefix>
              <div className="flex flex-col">
                <span className="text-body">驗證信用卡中...</span>
                <span className="text-caption text-fg-muted">連線至金流服務商</span>
              </div>
            </div>
          </Frame>
          <ExampleCaption>✅ 第三方金流驗證:不知道要多久,無進度可量化 → CircularProgress(indeterminate)</ExampleCaption>

          <Frame>
            <LabeledProgress label="產生季度報表中...">
              <ProgressBar value={0} status="inProgress" aria-label="無法量化的報表產生進度（誤用）" />
            </LabeledProgress>
          </Frame>
          <ExampleCaption warn>❌ 若無法量化卻硬用 ProgressBar(永遠卡 0% 或亂跳):使用者會以為壞掉 → 改用 CircularProgress(indeterminate)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="檔案上傳 UI → 用 FileItem,不直接組 ProgressBar + 檔名 + icon"
          note="FileItem 是檔案情境的 標準消費端 primitive(檔名 / icon / 進度 / status / actions 一條龍),內部自己會消費 ProgressBar。自組 raw ProgressBar + 檔名 + Paperclip + 狀態 icon 會讓 consumer 每次重覆發明一套檔案列表 layout,視覺/行為漂移無可避免。世界級對照:Ant Design Upload 內部用 Progress,consumer 不直接拼裝。"
        >
          <Frame>
            {/* @layout-space-magic-ok: 卡片標頭列內 圖示 / 名稱 ↔ 讀數(行內 micro)(layoutSpace.spec.md:166 micro) */}
            <div className="flex items-center gap-2 mb-[var(--layout-space-tight)]">
              <Paperclip size={16} className="text-fg-muted" />
              <span className="text-body flex-1">附件_會議記錄.docx</span>
              <span className="text-caption text-fg-muted">58%</span>
            </div>
            <ProgressBar value={58} status="inProgress" aria-label="附件上傳進度（自組誤用）" />
          </Frame>
          <ExampleCaption warn>❌ Consumer 自組檔名 + Paperclip + ProgressBar 做上傳列表 → 應該用 FileItem</ExampleCaption>

          <Frame>
            <FileItem mode="compact" name="附件_會議記錄.docx" status="uploading" progress={58} />
          </Frame>
          <ExampleCaption>✅ 上傳列表用 FileItem(檔名、進度、狀態一條龍,內部自己消費 ProgressBar)</ExampleCaption>

          <Frame>
            <LabeledProgress label="匯入客戶名單">
              <ProgressBar value={65} status="inProgress" affix="value" aria-label="匯入客戶名單進度" />
            </LabeledProgress>
          </Frame>
          <ExampleCaption>✅ CSV 批次匯入 / 報表生成 → 直接用 ProgressBar(非檔案情境,FileItem 不適用;完整流程見「展示 / 批次任務進度」)</ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const StatusRule: Story = {
  name: '狀態語意',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="inProgress = 進行中 / 未完成;success = 完成;error = 失敗"
        note="三種 status 是進度的完整生命週期:在途(inProgress,fill 用 --info)→ 終態二選一(success / error)。不要用 status 表達「警示」或「接近上限」等中間語意——那是 Notice / Alert 的職責。"
      >
        <Frame>
          <LabeledProgress label="匯出客戶名單 CSV">
            <ProgressBar value={42} status="inProgress" affix="value" aria-label="匯出客戶名單進度" />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 進行中用 inProgress,affix 顯示進度百分比</ExampleCaption>

        <Frame>
          <LabeledProgress label="產生第三季營收報表">
            <ProgressBar value={100} status="success" affix="status-icon" aria-label="第三季營收報表產生完成" />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 完成用 success + 勾 icon(終態指示)</ExampleCaption>

        <Frame>
          <LabeledProgress label="同步門市訂單(連線逾時,停在 68%)">
            <ProgressBar value={68} status="error" affix="status-icon" aria-label="同步門市訂單失敗" />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 失敗用 error + 叉 icon,名稱旁補上具體原因</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 不要為了「配額快滿」之類的警示自創 warning status"
        note="ProgressBar 語意是進度三態(進行中 / 完成 / 失敗)。配額超標屬業務規則,由 consumer 決定在多少 % 切換到 error,不要在 ProgressBar 加中間色。上方若要提示,用 Notice / Alert。"
      >
        <Frame>
          <LabeledProgress label="儲存空間">
            <ProgressBar value={95} status="error" affix="value" aria-label="儲存空間使用率" />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 配額快滿:consumer 判斷「95% 以上顯示警示」後自行把 status 切成 error</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const AffixRule: Story = {
  name: 'Affix 選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="affix=value 適合需持續更新的場景,status-icon 適合終態(完成 / 失敗)"
        note="value 讓使用者讀到確切數字,適合配額、完成比例等需要精確資訊的情境。status-icon 只在完成或失敗時呈現,讓終態一眼可辨。"
      >
        <Frame>
          <LabeledProgress label="儲存空間">
            <ProgressBar value={78} status="inProgress" affix="value" aria-label="儲存空間使用率" />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 配額顯示:affix=value,使用者要知道確切百分比</ExampleCaption>

        <Frame>
          <LabeledProgress label="產生年度稅務報表">
            <ProgressBar value={100} status="success" affix="status-icon" aria-label="年度稅務報表產生完成" />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 已完成:affix=status-icon,終態不需要再看百分比</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="ReactNode affix — 進行中提供取消,或顯示 bytes 進度"
        note="Enum 涵蓋不了的客製需求用 ReactNode。例如匯出中提供「取消」按鈕,或下載時顯示 2.3 / 5.0 MB 等具體 bytes。"
      >
        <Frame>
          <CancellableExport />
        </Frame>
        <ExampleCaption>✅ 進行中附取消按鈕,使用者可中斷</ExampleCaption>

        <Frame>
          <LabeledProgress label="下載第三季報表備份">
            <ProgressBar
              value={66}
              status="inProgress"
              aria-label="第三季報表備份下載進度"
              affix={<span className="text-caption text-fg-muted tabular-nums shrink-0">3.3 / 5.0 MB</span>}
            />
          </LabeledProgress>
        </Frame>
        <ExampleCaption>✅ 顯示實際 bytes 進度,讓使用者判斷速度</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="in-flight 若上下文已有進度資訊,可不傳 affix"
        note="FileItem compact mode 檔名那行已經提供足夠情境,bar 本身不需再重複百分比,此時不傳 affix(純 bar)。"
      >
        <Frame>
          <FileItem mode="compact" name="附件.zip" status="uploading" progress={55} />
        </Frame>
        <ExampleCaption>✅ FileItem compact:檔名那行已有情境 → 內部的 bar 不加 affix,避免重複</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
