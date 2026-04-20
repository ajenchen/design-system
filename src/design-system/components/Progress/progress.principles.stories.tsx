import type { Meta, StoryObj } from '@storybook/react'
import { Paperclip, X, FileText } from 'lucide-react'
import { Progress } from './progress'
import { Spinner } from '@/design-system/components/Spinner/spinner'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Progress/設計原則',
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

// ── Rules ─────────────────────────────────────────────────────────────────────

export const VsSpinnerRule: Story = {
  name: 'Progress vs Spinner',
  render: () => (
    <div>
      <Rule
        title="能告訴使用者「剩下 X%」嗎?能 → Progress,不能 → Spinner"
        note="determinate(已知進度) vs indeterminate(不知時長)是最核心的分界。使用者對這兩種視覺的預期不同:Progress 暗示「可估算完成時間」,Spinner 暗示「等一下,我也不知道要多久」。選錯會讓使用者一直盯著看以為快好了,或以為卡住。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">產品路線圖.pdf</span>
            <span className="text-caption text-fg-muted tabular-nums">1.4 / 3.0 MB</span>
          </div>
          <Progress value={47} status="inProgress" size="md" />
        </Frame>
        <Label>✅ 檔案上傳:bytes 已知 / 總大小已知 → Progress</Label>

        <Frame>
          <div className="flex items-center gap-3">
            <Spinner size={20} aria-label="驗證信用卡中" />
            <div className="flex flex-col">
              <span className="text-body">驗證信用卡中...</span>
              <span className="text-caption text-fg-muted">連線至金流服務商</span>
            </div>
          </div>
        </Frame>
        <Label>✅ 第三方金流驗證:不知道要多久,無進度可量化 → Spinner</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-fg-muted" />
            <span className="text-body flex-1">產生季度報表中...</span>
          </div>
          <Progress value={0} status="inProgress" size="md" />
        </Frame>
        <Label warn>❌ 若無法量化卻硬用 Progress(永遠卡 0% 或亂跳):使用者會以為壞掉 → 改用 Spinner</Label>
      </Rule>
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
          <Progress value={42} status="inProgress" size="md" affix="value" />
        </Frame>
        <Label>✅ 上傳中用 primary,affix 顯示進度百分比</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">簡報_final.pptx</span>
          </div>
          <Progress value={100} status="success" size="md" affix="status-icon" />
        </Frame>
        <Label>✅ 完成用 success + 勾 icon(終態指示)</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">影片素材.mp4</span>
            <span className="text-caption text-error">檔案過大</span>
          </div>
          <Progress value={68} status="error" size="md" affix="status-icon" />
        </Frame>
        <Label>✅ 失敗用 error + 叉 icon,旁邊可補上具體錯誤說明</Label>
      </Rule>

      <Rule
        title="❌ 不要為了「配額快滿」之類的警示自創 warning status"
        note="Progress 語意是進度三態(進行中 / 完成 / 失敗)。配額超標屬業務規則,由 consumer 決定在多少 % 切換到 error,不要在 Progress 加中間色。上方若要提示,用 Notice / Alert。"
      >
        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-body flex-1">儲存空間</span>
            <span className="text-caption text-error tabular-nums">95% 使用</span>
          </div>
          <Progress value={95} status="error" size="md" />
        </Frame>
        <Label>✅ 配額快滿:consumer 判斷「95% 以上顯示警示」後自行把 status 切成 error</Label>
      </Rule>
    </div>
  ),
}

export const SizeRule: Story = {
  name: 'Size 選擇',
  render: () => (
    <div>
      <Rule
        title="sm(2px)= table cell / 密集列表,md(4px)= 一般用途,lg(6px)= prominent card"
        note="判斷標準:進度是主要資訊還是附屬指標?使用者會盯著看 → 大;只是一行資料的次要欄位 → 小。"
      >
        <Frame width={520}>
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-fg-muted shrink-0" />
            <span className="text-body flex-1">Acme Corp 客戶報表</span>
            <div className="w-[180px]">
              <Progress value={72} status="inProgress" size="sm" affix="value" />
            </div>
          </div>
        </Frame>
        <Label>✅ DataTable cell「配額使用率」用 sm,不搶走專案名稱的閱讀重量</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">附件_會議記錄.docx</span>
          </div>
          <Progress value={58} status="inProgress" size="md" affix="value" />
        </Frame>
        <Label>✅ 上傳列表每筆用 md(預設),一般資訊密度</Label>

        <Frame width={440}>
          <div className="flex items-center gap-2 mb-3">
            <FileText size={18} className="text-primary" />
            <span className="text-body-lg font-medium flex-1">匯入客戶名單</span>
            <span className="text-caption text-fg-muted tabular-nums">812 / 1,250</span>
          </div>
          <Progress value={65} status="inProgress" size="lg" affix="value" />
          <p className="text-footnote text-fg-muted mt-2">處理中,預計剩餘 28 秒</p>
        </Frame>
        <Label>✅ 整頁的 prominent import 流程用 lg,使用者正在盯著看</Label>
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
          <Progress value={78} status="inProgress" size="md" affix="value" />
        </Frame>
        <Label>✅ 配額顯示:affix=value,使用者要知道確切百分比</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">提案書_終版.pdf</span>
          </div>
          <Progress value={100} status="success" size="md" affix="status-icon" />
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
          <Progress
            value={42}
            status="inProgress"
            size="md"
            affix={<Button variant="text" size="xs" iconOnly startIcon={X} aria-label="取消上傳" />}
          />
        </Frame>
        <Label>✅ 上傳中附取消按鈕,使用者可中斷</Label>

        <Frame>
          <div className="flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-fg-muted" />
            <span className="text-body flex-1">影片素材.mp4</span>
          </div>
          <Progress
            value={66}
            status="inProgress"
            size="md"
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
          <Progress value={55} status="inProgress" size="sm" />
        </Frame>
        <Label>✅ 上方已有 55% 文字 → bar 不加 affix,避免重複</Label>
      </Rule>
    </div>
  ),
}

export const DontRule: Story = {
  name: '禁止事項',
  render: () => (
    <div>
      <Rule
        title="❌ 未知進度不要用 Progress(永遠卡 0% 或亂跳)"
        note="使用者看到進度條預期會推進。若無法量化,任何假進度(隨機加 % 撐場面)都會讓使用者懷疑 app 壞掉。未知進度一律改用 Spinner。"
      >
        <Frame>
          <div className="flex items-center gap-3">
            <Spinner size={20} aria-label="計算中" />
            <span className="text-body">計算統計報表中...</span>
          </div>
        </Frame>
        <Label>✅ 未知時長用 Spinner,不假裝有進度</Label>
      </Rule>

      <Rule
        title="❌ < 1 秒的短暫操作不要用 Progress"
        note="Progress fill 有 300ms transition,在極短操作反而閃爍不自然。< 1 秒的非同步通常不需要任何 loading 視覺(結果直接呈現即可)。"
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
        note="每個檔案一條 Progress 已足夠表達整體狀態(使用者自然從完成數量推算),再加一條總 bar 會造成視覺重複與同步邏輯漂移。Dropbox / Google Drive 都只顯示每檔 bar。"
      >
        <Frame width={480}>
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Paperclip size={16} className="text-fg-muted" />
                <span className="text-body flex-1 truncate">會議記錄_0418.docx</span>
              </div>
              <Progress value={100} status="success" size="md" affix="status-icon" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Paperclip size={16} className="text-fg-muted" />
                <span className="text-body flex-1 truncate">簡報素材.zip</span>
              </div>
              <Progress value={62} status="inProgress" size="md" affix="value" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Paperclip size={16} className="text-fg-muted" />
                <span className="text-body flex-1 truncate">截圖.png</span>
              </div>
              <Progress value={0} status="inProgress" size="md" />
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
          <Progress value={55} status="inProgress" size="md" />
        </Frame>
        <Label>✅ 走 status token(primary / success / error),不 override 色值</Label>
      </Rule>
    </div>
  ),
}
