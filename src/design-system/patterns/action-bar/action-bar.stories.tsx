import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Plus, Trash2, Settings, RefreshCw, MoreVertical,
  Save, Maximize2, Upload, Download, Filter,
  ArrowUpDown, Layers, HelpCircle, X, Share2, Edit,
  Bold, Italic, Underline, ChevronDown, CheckSquare,
  ImageIcon, AtSign, Smile, Link2, Undo2, Redo2,
} from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup, ButtonDivider } from '@/design-system/components/Button/button-group'

const meta: Meta = {
  title: 'Design System/Patterns/操作列',
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
    <div className="flex flex-col gap-3">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const ToolbarFrame = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between w-full px-4 min-h-[52px] border border-border rounded-lg bg-surface">
    <span className="text-body font-bold text-foreground shrink-0 mr-4">{title}</span>
    {children}
  </div>
)

function ConfigurableDemo() {
  const [filterActive, setFilterActive] = useState(false)
  const [sortActive, setSortActive] = useState(false)
  const [groupActive, setGroupActive] = useState(false)

  return (
    <ButtonGroup>
      <Button
        variant={filterActive ? 'checked' : 'text'}
        size="sm" startIcon={Filter} iconOnly aria-label="篩選"
        onClick={() => setFilterActive(v => !v)}
      />
      <Button
        variant={sortActive ? 'checked' : 'text'}
        size="sm" startIcon={ArrowUpDown} iconOnly aria-label="排序"
        onClick={() => setSortActive(v => !v)}
      />
      <Button
        variant={groupActive ? 'checked' : 'text'}
        size="sm" startIcon={Layers} iconOnly aria-label="分組"
        onClick={() => setGroupActive(v => !v)}
      />
    </ButtonGroup>
  )
}

// ── Stories ───────────────────────────────────────────────────────────────────

export const RoleIdentification: Story = {
  name: '角色識別',
  render: () => (
    <div>
      <Rule
        title="業務操作（Operations）— 使用者完成目標所需"
        note="判斷：移除這個操作，使用者是否無法完成他來這裡要做的事？是 → 業務操作。允許所有 variant（primary、secondary、tertiary、text、checked），決定位置與視覺重量"
      >
        <ToolbarFrame title="文件管理">
          <ButtonGroup>
            <Button variant="text" size="sm" danger iconOnly startIcon={Trash2} aria-label="刪除" />
            <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
            <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
            <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
          </ButtonGroup>
        </ToolbarFrame>
        <Label>移除任一個，使用者就無法完成任務</Label>
      </Rule>

      <Rule
        title="工具操作（Utilities）— 服務環境，與任務本身無關"
        note="判斷：這個操作跟「現在在做什麼任務」無關，任何頁面都可能有它？是 → 工具操作。工具層必須是操作列中視覺重量最低的一層，否則會搶走業務操作的焦點，所以只用 text（預設）與 checked（啟用中）。⚙ ↺ ⤢ ? 等 icon 跨頁面意義固定，使用者靠位置記憶辨識，不需要 label"
      >
        <ToolbarFrame title="文件管理">
          <ButtonGroup>
            <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
            <Button variant="text" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
            <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            <Button variant="text" size="sm" iconOnly startIcon={HelpCircle} aria-label="說明" />
          </ButtonGroup>
        </ToolbarFrame>
        <Label>與當前任務無關，一律 text icon-only，永遠在業務層右側末端</Label>
      </Rule>

      <Rule
        title="可配置資料操作（篩選 / 排序 / 分組）— 業務操作，Toolbar 全程 icon-only"
        note="篩選、排序、分組是業務操作，但在資料表格脈絡下 Filter、ArrowUpDown、Layers 已是約定成俗的圖示，使用者不需要讀 label 就能確定功能，因此 Toolbar 場景可全程 icon-only。未配置用 text，配置啟用後換 checked——底色 + 藍色 icon 已足夠傳達「目前有生效的條件」"
      >
          <div className="flex items-center gap-2">
            <ConfigurableDemo />
            <Label>點擊切換配置狀態</Label>
          </div>
          <div className="flex items-center gap-2">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
            </ButtonGroup>
            <Label>text — 預設，適合密集表格 toolbar</Label>
          </div>
          <div className="flex items-center gap-2">
            <ButtonGroup>
              <Button variant="tertiary" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="tertiary" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
            </ButtonGroup>
            <Label>tertiary — 有框，可操作感更強，適合較空曠的場景</Label>
          </div>
      </Rule>
    </div>
  ),
}

export const Structure: Story = {
  name: '排列與結構',
  render: () => (
    <div>
      <Rule
        title="全局排序 — 先對全部業務按鈕排序，再決定功能分群"
        note="按視覺重量由高至低：primary > secondary > tertiary > text。靠右對齊時，primary 在業務層最右端（使用者視線最先落到的位置）。danger 是顏色疊加，不影響跨 variant 排序；同 variant 內 danger 排在非 danger 之後（遠離主要焦點，減少誤觸——NNGroup Fitts' Law：危險選項與安全選項之間要有空間距離）。排序完成後，再在功能域切換處加分隔線形成群組。不要先定義群組再各組內各自排序——這樣會讓多個 primary 彼此競爭焦點"
      >
          <ToolbarFrame title="文件">
            <ButtonGroup>
              <Button variant="text" size="sm" danger iconOnly startIcon={Trash2} aria-label="刪除" />
              <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>靠右對齊 → primary 在業務層最右；刪除（低強調）在業務操作最左端，遠離主按鈕降低誤觸風險；工具操作收尾</Label>
      </Rule>

      <Rule
        title="靠右對齊（最常見）— 業務層由右至左，主按鈕最右；工具層在末端"
        note="使用者視線落在右側。主按鈕放最右，視覺重量依序向左遞減。工具操作集中在右側末端，與業務層形成自然的視覺分層"
      >
        <ToolbarFrame title="專案列表">
          <ButtonGroup>
            <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
            <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
            <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
            <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          </ButtonGroup>
        </ToolbarFrame>
        <Label>業務操作由右至左排列，primary 在最右 → 直接接工具操作，不加分隔線</Label>
      </Rule>

      <Rule
        title="無工具層 — 不加任何分隔線，溢出屬同層"
        note="操作列只有業務操作時，沒有角色邊界需要標記。末端溢出屬於業務層的一部分，直接接在末端，不加分隔線"
      >
        <ToolbarFrame title="文件">
          <ButtonGroup>
            <Button variant="tertiary" size="sm" startIcon={Save}>儲存草稿</Button>
            <Button variant="primary" size="sm">發佈</Button>
            <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
          </ButtonGroup>
        </ToolbarFrame>
        <Label>有框按鈕結尾（tertiary + primary）→ 接無框工具操作，視覺差異已標記邊界，不加分隔線</Label>
      </Rule>
    </div>
  ),
}

export const Dividers: Story = {
  name: '分隔線',
  render: () => (
    <div>
      <Rule
        title="分隔線標記認知邊界，不是視覺裝飾"
        note="分隔線告訴使用者「這裡開始是不同性質的操作」。類別相同的操作靠間距（8px）聚合即可；只有在使用者需要明確感知「類別轉換」時才加分隔線"
      >
          <ToolbarFrame title="檔案操作">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Edit} aria-label="編輯" />
              <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="匯出" />
              <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 同類別操作 — 間距即可，不加分隔線</Label>
          <ToolbarFrame title="檔案操作">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Edit} aria-label="編輯" />
              <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="匯出" />
              <ButtonDivider />
              <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 不同類別（一般 vs 危險）— 分隔線標記邊界</Label>
      </Rule>

      <Rule
        title="關閉保護（必加）"
        note="關閉 / 解除按鈕排在群組最末，左側必加分隔線防止誤觸。這是唯一強制的業務層內分隔線"
      >
        <ToolbarFrame title="面板">
          <ButtonGroup>
            <Button variant="text" size="sm" iconOnly startIcon={Edit} aria-label="編輯" />
            <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
            <ButtonDivider />
            <Button variant="text" size="sm" iconOnly startIcon={X} aria-label="關閉" />
          </ButtonGroup>
        </ToolbarFrame>
        <Label>關閉排最末，左側必加分隔線</Label>
      </Rule>

      <Rule
        title="同視覺類型功能分群（可選）"
        note="同為有框或同為無框時，若需要標記功能域的轉換，可加分隔線。danger 按鈕視同普通按鈕，功能域與其他操作有明顯差距時才加，不強制"
      >
          <ToolbarFrame title="文件">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Edit} aria-label="編輯" />
              <Button variant="text" size="sm" iconOnly startIcon={Save} aria-label="儲存" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>編輯操作 vs 協作操作，功能域不同，分隔線可選</Label>
          <ToolbarFrame title="檔案">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Edit} aria-label="編輯" />
              <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
              <ButtonDivider />
              <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>danger 是普通按鈕，功能域差距夠大時可選加分隔線</Label>
      </Rule>

      <Rule
        title="不觸發 — 有框 ↔ 無框接壤"
        note="有框（primary / secondary / tertiary / checked）接無框（text），視覺差異本身已是邊界信號，不需分隔線疊加"
      >
        <ToolbarFrame title="專案列表">
          <ButtonGroup>
            <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
            <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
            <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
          </ButtonGroup>
        </ToolbarFrame>
        <Label>有框按鈕（primary）直接接無框按鈕（text）— 視覺差異已足夠，不需分隔線</Label>
      </Rule>

      <Rule
        title="角色邊界 — 群組溢出邊界：群組溢出（···）右側必加，覆蓋 角色接壤"
        note="群組溢出是某個業務群組的末端標記。右側必須加分隔線，無論右側是另一個業務群組還是工具層，也無論視覺類型為何。群組溢出邊界 優先於 角色接壤"
      >
        <ToolbarFrame title="資料管理">
          <ButtonGroup>
            <Button variant="text" size="sm" startIcon={Upload}>上傳</Button>
            <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多上傳操作" />
            <ButtonDivider />
            <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
            <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          </ButtonGroup>
        </ToolbarFrame>
        <Label>···（群組溢出）右側必加分隔線，即使右側是同為無框的工具層</Label>
      </Rule>

      <Rule
        title="角色邊界 — 角色接壤：無群組溢出時，業務層以什麼結尾？"
        note="業務層直接以真實按鈕結尾（沒有群組溢出）時：有框結尾 → 不加（視覺差異已足夠）；無框 text 結尾 → 必加（邊界不可見）"
      >
          <ToolbarFrame title="專案">
            <ButtonGroup>
              <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>有框結尾 → 視覺差異已足夠，不加分隔線</Label>
          <ToolbarFrame title="資料表">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>無框結尾 → 邊界不可見，必加分隔線</Label>
      </Rule>

      <Rule
        title="對齊方向影響業務層與工具層的距離，但不影響分隔線規則"
        note="工具層靠的是操作列的右端（位置記憶），不是業務層的右端。靠右對齊時業務層與工具層自然緊挨；靠左對齊時中間有空間，空間本身已足夠標記邊界。分隔線規則（角色接壤）只看按鈕接壤處，有空間隔開時不需要分隔線"
      >
          <ToolbarFrame title="專案列表">
            <ButtonGroup>
              <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>靠右對齊 — 有框業務操作接無框工具操作，視覺差異已足夠，不加分隔線</Label>
          <div className="flex items-center w-full px-4 h-[52px] border border-border rounded-lg bg-surface">
            <ButtonGroup>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
            </ButtonGroup>
            <div className="flex-1" />
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </div>
          <Label>靠左對齊 — 工具層固定在操作列右端，空間本身已標記邊界</Label>
      </Rule>

      <Rule
        title="··· 本身不構成工具層 — 有固定工具才有角色邊界"
        note="工具層的存在取決於是否有固定工具按鈕（⚙ 設定、↺ 刷新、⤢ 全螢幕等）。沒有固定工具時，··· 是業務層末端，不存在角色邊界，不加角色邊界分隔線"
      >
          <ToolbarFrame title="資料表">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="全部操作" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>有固定工具 → 業務操作（無框）接工具操作（無框），邊界不可見 → 在第一個工具按鈕 ↺ 左側加分隔線</Label>
          <ToolbarFrame title="篩選列">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="全部操作" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={X} aria-label="關閉" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>無固定工具 → ··· 是業務層末端；✕ 的關閉保護是唯一一條分隔線</Label>
      </Rule>

      <Rule
        title="❌ 常見錯誤：把 ··· 誤當成工具層而多加一條分隔線"
        note="沒有固定工具按鈕時，··· 是業務層末端，不存在角色邊界。在 ··· 左側加分隔線是把它誤當成工具層的結果，這條分隔線沒有語意，應移除"
      >
          <ToolbarFrame title="篩選列">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={X} aria-label="關閉" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label warn>❌ ··· 左側的分隔線沒有語意（沒有工具層），移除它</Label>
          <ToolbarFrame title="篩選列">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={X} aria-label="關閉" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ ··· 是業務層末端，只有關閉保護這一條分隔線</Label>
      </Rule>
    </div>
  ),
}

export const Overflow: Story = {
  name: '溢出機制',
  render: () => (
    <div>
      <Rule
        title="末端溢出（預設）— 一個溢出在操作列末端，收納所有低頻操作"
        note="溢出按鈕（MoreVertical）永遠是 text 無框、排除在全局排序之外、放在所屬層末端。預設用末端溢出：只要低頻操作放進同一個選單不會讓使用者困惑，就用這種。若不確定要不要分開，就不要分開"
      >
          <ToolbarFrame title="專案">
            <ButtonGroup>
              <Button variant="tertiary" size="sm" startIcon={Download}>匯出</Button>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="全部操作" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>有框結尾 → 無分隔 → 工具 ↺ ⚙ ···</Label>
          <ToolbarFrame title="資料表">
            <ButtonGroup>
              <Button variant="text" size="sm" iconOnly startIcon={Filter} aria-label="篩選" />
              <Button variant="text" size="sm" iconOnly startIcon={ArrowUpDown} aria-label="排序" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="全部操作" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>無框結尾 → 分隔線（業務接工具，同為無框）→ 固定工具 ↺ ···</Label>
      </Rule>

      <Rule
        title="群組溢出（例外）— 各群組各自管理，只在合併選單會讓使用者困惑時才用"
        note="當多個群組的低頻操作領域差異大到「放進同一個選單使用者會搞不清這是哪個群組的」時，才讓各群組各自管理溢出。每個群組溢出的右側必須加分隔線（群組溢出邊界）。以 Rich Text Editor 為例：文字格式、插入元素、歷史操作三個群組功能差異極大，合併選單語意混亂"
      >
        <div className="flex items-center w-full px-3 h-[52px] border border-border rounded-lg bg-surface">
          <ButtonGroup>
            {/* 群組 A：文字格式 + 溢出 */}
            <Button variant="text" size="sm" iconOnly startIcon={Bold} aria-label="粗體" />
            <Button variant="text" size="sm" iconOnly startIcon={Italic} aria-label="斜體" />
            <Button variant="text" size="sm" iconOnly startIcon={Underline} aria-label="底線" />
            <Button variant="text" size="sm" iconOnly startIcon={ChevronDown} aria-label="更多格式" />
            <ButtonDivider />
            {/* 群組 B：插入元素（無溢出，全部攤開） */}
            <Button variant="text" size="sm" iconOnly startIcon={CheckSquare} aria-label="核取方塊" />
            <Button variant="text" size="sm" iconOnly startIcon={ImageIcon} aria-label="圖片" />
            <Button variant="text" size="sm" iconOnly startIcon={AtSign} aria-label="提及" />
            <Button variant="text" size="sm" iconOnly startIcon={Smile} aria-label="表情" />
            <Button variant="text" size="sm" iconOnly startIcon={Link2} aria-label="連結" />
            <Button variant="text" size="sm" iconOnly startIcon={Plus} aria-label="更多插入" />
            <ButtonDivider />
            {/* 群組 C：歷史操作（無溢出） */}
            <Button variant="text" size="sm" iconOnly startIcon={Undo2} aria-label="復原" />
            <Button variant="text" size="sm" iconOnly startIcon={Redo2} aria-label="重做" />
          </ButtonGroup>
        </div>
        <Label>格式（有溢出）┆ 插入（全部攤開）┆ 歷史（無溢出）— 各群組獨立決定是否需要溢出</Label>
      </Rule>
    </div>
  ),
}

export const CommonMistakes: Story = {
  name: '常見錯誤',
  render: () => (
    <div>
      <Rule
        title="❌ 工具操作混入業務層（最常見錯誤）"
        note="↺ 重新載入是工具操作——與任何任務無關，任何頁面都可能有它。把它放進業務層會導致角色邊界錯亂，分隔線規則失效。常見案例：[儲存|複製]┆[↺|🗑]┆[···]┆[✕]——↺ 和 🗑 角色混用，正確做法是分層"
      >
          <ToolbarFrame title="工具列">
            <ButtonGroup>
              {/* ↺ 是工具操作，放在業務層是錯的 */}
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" danger iconOnly startIcon={Trash2} aria-label="刪除" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label warn>❌ ↺（工具）與 🗑（業務）混在業務層，角色邊界失效</Label>
          <ToolbarFrame title="工具列">
            <ButtonGroup>
              {/* 業務層：危險操作在 text 群組末尾 */}
              <Button variant="text" size="sm" danger iconOnly startIcon={Trash2} aria-label="刪除" />
              <ButtonDivider />
              {/* 工具層：↺ 在業務層右側末端 */}
              <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新載入" />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 業務（刪除）┆ 工具（↺ + ⚙）— 角色清楚分離</Label>
      </Rule>

      <Rule
        title="❌ 工具操作使用 primary 或 secondary"
        note="工具層必須是視覺重量最低的一層，不可搶業務操作的視覺主角地位"
      >
          <ToolbarFrame title="專案">
            <ButtonGroup>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="primary" size="sm" startIcon={Settings}>設定</Button>
            </ButtonGroup>
          </ToolbarFrame>
          <Label warn>❌ 設定是工具操作，不應搶 primary 視覺重量</Label>
          <ToolbarFrame title="專案">
            <ButtonGroup>
              <Button variant="primary" size="sm" startIcon={Plus}>新增</Button>
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 有框→無框，視覺差異已標記邊界，不加分隔線</Label>
      </Rule>

      <Rule
        title="❌ 工具層內多加分隔線造成孤立"
        note="業務層以 text 結尾，角色邊界已加一條分隔線（角色接壤）。若再在工具層內部加分隔線，固定工具按鈕兩側都有分隔線，形成孤立"
      >
          <ToolbarFrame title="工具列">
            <ButtonGroup>
              <Button variant="text" size="sm" startIcon={Plus}>新增</Button>
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label warn>❌ ⚙ 兩側都有分隔線，被孤立</Label>
          <ToolbarFrame title="工具列">
            <ButtonGroup>
              <Button variant="text" size="sm" startIcon={Plus}>新增</Button>
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 一條分隔線標記角色邊界，工具層內不再加</Label>
      </Rule>

      <Rule
        title="❌ 無工具層卻在溢出前加分隔線"
        note="沒有角色邊界，分隔線沒有語意意義，反而讓溢出按鈕顯得像獨立的第二層"
      >
          <ToolbarFrame title="文件">
            <ButtonGroup>
              <Button variant="text" size="sm" startIcon={Upload}>上傳</Button>
              <Button variant="text" size="sm" startIcon={Download}>匯出</Button>
              <ButtonDivider />
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label warn>❌ 無角色邊界，分隔線無意義</Label>
          <ToolbarFrame title="文件">
            <ButtonGroup>
              <Button variant="text" size="sm" startIcon={Upload}>上傳</Button>
              <Button variant="text" size="sm" startIcon={Download}>匯出</Button>
              <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多" />
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 無工具層，溢出直接接在末端</Label>
      </Rule>

      <Rule
        title="❌ 同優先等級業務操作，icon 處理不一致"
        note="同為 text variant 的操作，一個有 startIcon 一個沒有，視覺節奏不均。同優先等級建議一致：同時有 startIcon 或同時沒有"
      >
          <ToolbarFrame title="檔案">
            <ButtonGroup>
              <Button variant="text" size="sm" startIcon={Upload}>上傳</Button>
              <Button variant="text" size="sm">匯出</Button>
            </ButtonGroup>
          </ToolbarFrame>
          <Label warn>❌ 同優先等級，一個有 icon 一個沒有</Label>
          <ToolbarFrame title="檔案">
            <ButtonGroup>
              <Button variant="text" size="sm" startIcon={Upload}>上傳</Button>
              <Button variant="text" size="sm" startIcon={Download}>匯出</Button>
            </ButtonGroup>
          </ToolbarFrame>
          <Label>✅ 同優先等級，icon 處理一致</Label>
      </Rule>
    </div>
  ),
}
