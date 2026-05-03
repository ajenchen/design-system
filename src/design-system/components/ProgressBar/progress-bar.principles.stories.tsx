// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: Merged WhenToUse + WhenNotToUse + VsCircularProgressRule
// + FileItemBoundaryRule into a single `UsageGuidance` story (3 sections — 何時用 /
// 何時不用 + 替代 / vs 近親) per 2026-04-26 user mandate. StatusRule + AffixRule kept.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { Paperclip, X, FileText, Table as TableIcon } from 'lucide-react'
import { ProgressBar } from './progress-bar'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/ProgressBar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>
    {children}
  </p>
)

// 情境展示容器——讓例子有真實產品感
const Frame = ({ children, width = 400 }: { children: React.ReactNode; width?: number }) => (
  <div className="border border-border rounded-md bg-surface px-4 py-3" style={{ width }}>
    {children}
  </div>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>適合 ProgressBar 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/ProgressBar/展示" name="批次任務進度"><span className="text-primary hover:underline font-medium cursor-pointer">批次任務進度</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/ProgressBar/展示" name="DataTable cell 內進度"><span className="text-primary hover:underline font-medium cursor-pointer">DataTable cell 內進度</span></LinkTo>
            </li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 未知進度不要用 ProgressBar(永遠卡 0% 或亂跳)"
          note="使用者看到進度條預期會推進。若無法量化,任何假進度(隨機加 % 撐場面)都會讓使用者懷疑 app 壞掉。未知進度一律改用 CircularProgress(indeterminate)。"
        >
          <Frame>
            <div className="flex items-center gap-3">
              <CircularProgress aria-label="計算中" />
              <span className="text-body">計算統計報表中...</span>
            </div>
          </Frame>
          <Label>✅ 未知時長用 CircularProgress(indeterminate),不假裝有進度</Label>
        </Rule>

        <Rule
          title="❌ < 1 秒的短暫操作不要用 ProgressBar"
          note="ProgressBar fill 有 300ms transition,在極短操作反而閃爍不自然。< 1 秒的非同步通常不需要任何 loading 視覺(結果直接呈現即可)。"
        >
          <Frame>
            <div className="flex items-center gap-2">
              <span className="text-body">已儲存</span>
              <span className="text-footnote text-fg-muted">· 剛才</span>
            </div>
          </Frame>
          <Label>✅ 極短操作完成後直接顯示結果,不插入進度視覺</Label>
        </Rule>

        <Rule
          title="❌ 不要在多檔上傳列表上方再加「總進度」bar"
          note="每個檔案一條 ProgressBar 已足夠表達整體狀態(使用者自然從完成數量推算),再加一條總 bar 會造成視覺重複與同步邏輯漂移。Dropbox / Google Drive 都只顯示每檔 bar。"
        >
          <Frame width={480}>
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Paperclip size={16} className="text-fg-muted" />
                  <span className="text-body flex-1 truncate">會議記錄_0418.docx</span>
                </div>
                <ProgressBar value={100} status="success" affix="status-icon" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Paperclip size={16} className="text-fg-muted" />
                  <span className="text-body flex-1 truncate">簡報素材.zip</span>
                </div>
                <ProgressBar value={62} status="inProgress" affix="value" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Paperclip size={16} className="text-fg-muted" />
                  <span className="text-body flex-1 truncate">截圖.png</span>
                </div>
                <ProgressBar value={0} status="inProgress" />
              </div>
            </div>
          </Frame>
          <Label>✅ 每檔一條,整體進度由使用者自然感知(2/3 完成)</Label>
        </Rule>

        <Rule
          title="❌ 不要硬寫色值繞過 status"
          note="status 三選一是系統決定的語意。consumer 要紅、綠、藍以外的色 → 提到系統層討論是否新增 status,不要每個消費者自己用 className override fill 色。"
        >
          <Frame>
            <ProgressBar value={55} status="inProgress" />
          </Frame>
          <Label>✅ 走 status token(primary / success / error),不 override 色值</Label>
        </Rule>
      </Section>

      <Section title="vs 近親 — ProgressBar vs CircularProgress vs FileItem">
        <Rule
          title="能告訴使用者「剩下 X%」嗎?能 + 大區塊 → ProgressBar;不能或小空間 → CircularProgress"
          note="determinate(已知進度) vs indeterminate(不知時長)是最核心的分界。使用者對這兩種視覺的預期不同:ProgressBar 暗示「可估算完成時間 + 大區塊水平」,CircularProgress(無 value)暗示「等一下,我也不知道要多久」。選錯會讓使用者一直盯著看以為快好了,或以為卡住。"
        >
          <Frame>
            <div className="flex items-center gap-2 mb-2">
              <TableIcon size={16} className="text-fg-muted" />
              <span className="text-body flex-1">匯出客戶名單 CSV</span>
              <span className="text-caption text-fg-muted tabular-nums">812 / 1,250 筆</span>
            </div>
            <ProgressBar value={65} status="inProgress" />
          </Frame>
          <Label>✅ CSV 匯出 / 批次處理:總量已知 → ProgressBar(檔案上傳改用 FileItem,見下方)</Label>

          <Frame>
            <div className="flex items-center gap-3">
              <CircularProgress aria-label="驗證信用卡中" />
              <div className="flex flex-col">
                <span className="text-body">驗證信用卡中...</span>
                <span className="text-caption text-fg-muted">連線至金流服務商</span>
              </div>
            </div>
          </Frame>
          <Label>✅ 第三方金流驗證:不知道要多久,無進度可量化 → CircularProgress(indeterminate)</Label>

          <Frame>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={16} className="text-fg-muted" />
              <span className="text-body flex-1">產生季度報表中...</span>
            </div>
            <ProgressBar value={0} status="inProgress" />
          </Frame>
          <Label warn>❌ 若無法量化卻硬用 ProgressBar(永遠卡 0% 或亂跳):使用者會以為壞掉 → 改用 CircularProgress(indeterminate)</Label>
        </Rule>

        <Rule
          title="檔案上傳 UI → 用 FileItem,不直接組 ProgressBar + 檔名 + icon"
          note="FileItem 是檔案情境的 canonical consumer-facing primitive(檔名 / icon / 進度 / status / actions 一條龍),內部自己會消費 ProgressBar。自組 raw ProgressBar + 檔名 + Paperclip + 狀態 icon 會讓 consumer 每次重覆發明一套檔案列表 layout,視覺/行為漂移無可避免。世界級對照:Ant Design Upload 內部用 Progress,consumer 不直接拼裝。"
        >
          <Frame>
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={16} className="text-fg-muted" />
              <span className="text-body flex-1">附件_會議記錄.docx</span>
              <span className="text-caption text-fg-muted">58%</span>
            </div>
            <ProgressBar value={58} status="inProgress" />
          </Frame>
          <Label warn>❌ Consumer 自組檔名 + Paperclip + ProgressBar 做上傳列表 → 應該用 FileItem</Label>

          <Frame width={440}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-primary" />
              <span className="text-body-lg font-medium flex-1">匯入客戶名單</span>
              <span className="text-caption text-fg-muted tabular-nums">812 / 1,250 筆</span>
            </div>
            <ProgressBar value={65} status="inProgress" affix="value" />
            <p className="text-footnote text-fg-muted mt-2">處理中,預計剩餘 28 秒</p>
          </Frame>
          <Label>✅ CSV 批次匯入 / 報表生成 → 直接用 ProgressBar(非檔案情境,FileItem 不適用)</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const StatusRule: Story = {
  name: 'Status 語意',
  render: () => (
    <div>
      <Rule
        title="primary = 進行中 / 未完成;success = 完成;error = 失敗"
        note="三種 status 是進度的完整生命週期:在途(primary)→ 終態二選一(success / error)。不要用 status 表達「警示」或「接近上限」等中間語意——那是 Notice / Alert 的職責。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">Q1_財報.xlsx</span>
          </div>
          <ProgressBar value={42} status="inProgress" affix="value" />
        </Frame>
        <Label>✅ 上傳中用 primary,affix 顯示進度百分比</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">簡報_final.pptx</span>
          </div>
          <ProgressBar value={100} status="success" affix="status-icon" />
        </Frame>
        <Label>✅ 完成用 success + 勾 icon(終態指示)</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">影片素材.mp4</span>
            <span className="text-caption text-error">檔案過大</span>
          </div>
          <ProgressBar value={68} status="error" affix="status-icon" />
        </Frame>
        <Label>✅ 失敗用 error + 叉 icon,旁邊可補上具體錯誤說明</Label>
      </Rule>

      <Rule
        title="❌ 不要為了「配額快滿」之類的警示自創 warning status"
        note="ProgressBar 語意是進度三態(進行中 / 完成 / 失敗)。配額超標屬業務規則,由 consumer 決定在多少 % 切換到 error,不要在 ProgressBar 加中間色。上方若要提示,用 Notice / Alert。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-body flex-1">儲存空間</span>
            <span className="text-caption text-error tabular-nums">95% 使用</span>
          </div>
          <ProgressBar value={95} status="error" />
        </Frame>
        <Label>✅ 配額快滿:consumer 判斷「95% 以上顯示警示」後自行把 status 切成 error</Label>
      </Rule>
    </div>
  ),
}

export const AffixRule: Story = {
  name: 'Affix 選擇',
  render: () => (
    <div>
      <Rule
        title="affix=value 適合靜態 / poll 場景,status-icon 適合 final state"
        note="value 讓使用者讀到確切數字,適合配額、完成比例等需要精確資訊的情境。status-icon 只在完成或失敗時呈現,讓終態一眼可辨。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-body flex-1">儲存空間</span>
          </div>
          <ProgressBar value={78} status="inProgress" affix="value" />
        </Frame>
        <Label>✅ 配額顯示:affix=value,使用者要知道確切百分比</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">提案書_終版.pdf</span>
          </div>
          <ProgressBar value={100} status="success" affix="status-icon" />
        </Frame>
        <Label>✅ 上傳完成:affix=status-icon,終態不需要再看百分比</Label>
      </Rule>

      <Rule
        title="ReactNode affix — 上傳中提供取消,或顯示 bytes 進度"
        note="Enum 涵蓋不了的客製需求用 ReactNode。例如上傳中提供「取消」按鈕,或顯示 2.3 / 5.0 MB 等具體 bytes(Dropbox / Google Drive 做法)。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">設計規範_v2.pdf</span>
          </div>
          <ProgressBar
            value={42}
            status="inProgress"
            affix={<Button variant="text" size="xs" iconOnly startIcon={X} aria-label="取消上傳" />}
          />
        </Frame>
        <Label>✅ 上傳中附取消按鈕,使用者可中斷</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">影片素材.mp4</span>
          </div>
          <ProgressBar
            value={66}
            status="inProgress"
            affix={<span className="text-caption text-fg-muted tabular-nums shrink-0">3.3 / 5.0 MB</span>}
          />
        </Frame>
        <Label>✅ 顯示實際 bytes 進度,讓使用者判斷速度</Label>
      </Rule>

      <Rule
        title="in-flight 若上下文已有進度資訊,可不傳 affix"
        note="FileItem compact mode 檔名那行已經提供足夠情境,bar 本身不需再重複百分比,此時不傳 affix(純 bar)。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-1">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">附件.zip</span>
            <span className="text-caption text-fg-muted tabular-nums">55%</span>
          </div>
          <ProgressBar value={55} status="inProgress" />
        </Frame>
        <Label>✅ 上方已有 55% 文字 → bar 不加 affix,避免重複</Label>
      </Rule>
    </div>
  ),
}
