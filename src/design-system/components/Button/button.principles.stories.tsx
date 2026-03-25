import type { Meta, StoryObj } from '@storybook/react'
import {
  Plus, Trash2, Settings, Share2, RefreshCw,
  MoreHorizontal, Save, Maximize2, Pin,
  List, LayoutGrid, GanttChart,
  ChevronDown, Download, Bell,
} from 'lucide-react'
import { Button } from './button'
import { ButtonGroup, ButtonDivider } from './button-group'

const meta: Meta = {
  title: 'Design System/Button/使用原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helper ────────────────────────────────────────────────────────────────────

const Rule = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <p className="text-footnote font-bold uppercase tracking-wider text-fg-muted mb-1">
      {title}
    </p>
    {note && (
      <p className="text-caption text-fg-muted mb-3">{note}</p>
    )}
    <div className="flex flex-wrap gap-2 items-center">
      {children}
    </div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <span className={`text-footnote ml-1 ${warn ? 'text-error' : 'text-fg-muted'}`}>
    {children}
  </span>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const VariantRule: Story = {
  name: 'Variant 選擇',
  render: () => (
    <div>
      <Rule
        title="primary — 最高視覺重量，每個操作區最多一個"
        note="藍底白字。這個畫面或操作區最重要的單一主要動作，超過一個主要動作時改用 secondary"
      >
        <Button variant="primary" startIcon={Plus}>新增</Button>
      </Rule>

      <Rule
        title="secondary — 正面與負面選項並存時的配對"
        note="藍框藍字。當選項有正面與負面之分，正面那個用 secondary；若同時有 primary，secondary 表示「另一個重要選項」"
      >
        <Button variant="secondary">儲存草稿</Button>
        <Button variant="secondary" danger>放棄變更</Button>
      </Rule>

      <Rule
        title="tertiary — 最常用的非主要按鈕（日常預設選擇）"
        note="灰框灰字。確認/取消配對的取消方、工具列輔助操作、卡片 CTA 幾乎都用 tertiary"
      >
        <Button variant="primary">確認</Button>
        <Button variant="tertiary">取消</Button>
        <Button variant="tertiary" startIcon={Settings}>設定</Button>
      </Rule>

      <Rule
        title="text — 低視覺重量輔助動作"
        note="透明無框。不需特別強調的操作；工具列 icon-only 按鈕常用 text"
      >
        <Button variant="text" startIcon={RefreshCw}>重新整理</Button>
        <Button variant="text">查看更多</Button>
        <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
      </Rule>

      <Rule
        title="checked — 單一功能目前啟用中（binary toggle）"
        note="淡藍底藍字。功能關閉時可以是 secondary 以下任何 variant（text、tertiary 等），功能開啟後換成 checked。僅描述「這個按鈕自己的功能是否開啟」"
      >
        <div className="flex items-center gap-2">
          <Button variant="text" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（關閉）" />
          <span className="text-footnote text-fg-muted">→ 啟用後 →</span>
          <Button variant="checked" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
        </div>
      </Rule>

      <Rule
        title="link — 樣式像連結的按鈕"
        note="藍色文字，無底色無邊框。本質仍是 button（保留鍵盤與無障礙行為）。不嵌入段落文字（用 HTML <a> 或 React Router <Link> 代替）"
      >
        <Button variant="link">前往設定</Button>
        <Button variant="link">了解更多</Button>
      </Rule>
    </div>
  ),
}

export const PrimaryRule: Story = {
  name: 'Primary 限制',
  render: () => (
    <div>
      <Rule title="✅ 正確 — 唯一的 primary">
        <Button variant="primary">確認</Button>
        <Button variant="tertiary">取消</Button>
      </Rule>

      <Rule title="❌ 錯誤 — 兩個 primary 同時出現，使用者無法判斷優先順序">
        <Button variant="primary">儲存</Button>
        <Button variant="primary">另存新檔</Button>
        <Label warn>視覺重量相同 → 無法分辨主次</Label>
      </Rule>

      <Rule
        title="✅ 卡片清單 CTA 用 tertiary"
        note="重複出現的 CTA（如每張卡片上的按鈕）應使用 tertiary，避免頁面充斥藍色填滿按鈕"
      >
        {['專案 A', '專案 B', '專案 C'].map(name => (
          <div key={name} className="border border-border rounded-lg px-4 py-3 flex items-center gap-3 min-w-40">
            <span className="text-body flex-1">{name}</span>
            <Button variant="tertiary" size="xs">開啟</Button>
          </div>
        ))}
      </Rule>
    </div>
  ),
}

export const DangerRule: Story = {
  name: 'Danger 時機',
  render: () => (
    <div>
      <Rule
        title="primary + danger — 立即且不可逆，點下去就發生"
        note="必須是最後一道關卡，沒有後續確認"
      >
        <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
        <Button variant="tertiary">取消</Button>
      </Rule>

      <Rule
        title="secondary + danger — 有警示意圖但點下去還可反悔"
        note="通常後面還有一層確認提示"
      >
        <Button variant="secondary">儲存草稿</Button>
        <Button variant="secondary" danger>放棄變更</Button>
      </Rule>

      <Rule title="❌ 錯誤 — 在有後續確認的流程中使用 primary danger">
        <Button variant="primary" danger>移至垃圾桶</Button>
        <Label warn>移至垃圾桶還可以復原 → 不應用 primary danger</Label>
      </Rule>
    </div>
  ),
}

export const OrderRule: Story = {
  name: '按鈕排序',
  render: () => (
    <div>
      <Rule
        title="排序優先順序 — 視覺重量高的在前"
        note="primary / primary+danger  >  secondary  >  tertiary  >  secondary+danger  >  text"
      >
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="secondary" danger>Secondary danger</Button>
        <Button variant="text">Text</Button>
      </Rule>

      <Rule title="靠左對齊 — 主按鈕在最左">
        <ButtonGroup align="start">
          <Button variant="primary">確認</Button>
          <Button variant="tertiary">取消</Button>
        </ButtonGroup>
      </Rule>

      <Rule title="靠右對齊 — 主按鈕在最右">
        <div className="w-full flex justify-end">
          <ButtonGroup align="end">
            <Button variant="tertiary">取消</Button>
            <Button variant="primary">確認</Button>
          </ButtonGroup>
        </div>
      </Rule>

      <Rule
        title="Toolbar — 全部置右，左側放標題；由右至左：溢出 › 固定工具 › 業務邏輯"
        note="業務邏輯（主按鈕、次按鈕）排在固定工具的左側，優先順序仍然適用"
      >
        <div className="flex items-center justify-between w-full px-4 h-[52px] border border-border rounded-lg bg-surface">
          <span className="text-body font-bold text-foreground">專案名稱</span>
          <ButtonGroup>
            <Button variant="primary" startIcon={Plus}>新增</Button>
            <Button variant="tertiary" startIcon={Save}>儲存</Button>
            <ButtonDivider />
            <Button variant="checked" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
            <ButtonDivider />
            <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="刷新" />
            <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
            <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
            <ButtonDivider />
            <Button variant="text" size="sm" iconOnly startIcon={MoreHorizontal} aria-label="更多" />
          </ButtonGroup>
        </div>
      </Rule>
    </div>
  ),
}

export const GroupRule: Story = {
  name: '群組與分隔線',
  render: () => (
    <div>
      <Rule title="群組間距 — 8px，用 ButtonGroup 包裹">
        <ButtonGroup>
          <Button variant="primary" startIcon={Plus}>新增</Button>
          <Button variant="tertiary" startIcon={Save}>儲存</Button>
        </ButtonGroup>
      </Rule>

      <Rule
        title="分隔線 — 群組內視覺分類，分隔線與按鈕距離 12px"
        note="群組內 icon-only 按鈕應統一是否帶有線框（此處全部使用 text），避免有框與無框混用造成視覺雜亂"
      >
        <ButtonGroup>
          <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
          <ButtonDivider />
          <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        </ButtonGroup>
      </Rule>

      <Rule
        title="垂直排列 — 最希望被點擊的按鈕放最上方，所有按鈕撐滿容器寬度"
        note="視覺動線由上往下，primary 放第一個，使用者最先看到"
      >
        <div className="w-[200px]">
          <ButtonGroup direction="vertical">
            <Button variant="primary">確認送出</Button>
            <Button variant="tertiary">取消</Button>
          </ButtonGroup>
        </div>
      </Rule>
    </div>
  ),
}

export const CheckedRule: Story = {
  name: 'Checked 開關',
  render: () => (
    <div>
      <Rule
        title="checked — 單一功能的開/關（binary toggle）"
        note="未啟用 = text，啟用中 = checked。描述「這個按鈕自己的功能是否開啟」"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-20">全螢幕關閉</span>
            <Button variant="text" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-20">全螢幕開啟</span>
            <Button variant="checked" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-20">釘選關閉</span>
            <Button variant="text" size="sm" iconOnly startIcon={Pin} aria-label="釘選" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-20">釘選開啟</span>
            <Button variant="checked" size="sm" iconOnly startIcon={Pin} aria-label="釘選（開啟中）" />
          </div>
        </div>
      </Rule>

      <Rule
        title="❌ checked 不適合用於多選一（視圖切換）"
        note="list / board / timeline 三選一是 radio group 語意，應使用 Segmented Control，不是 Button checked"
      >
        <div className="flex gap-1">
          <Button variant="checked" size="sm" iconOnly startIcon={List} aria-label="清單（誤用）" />
          <Button variant="text" size="sm" iconOnly startIcon={LayoutGrid} aria-label="看板" />
          <Button variant="text" size="sm" iconOnly startIcon={GanttChart} aria-label="時間軸" />
        </div>
        <Label warn>↑ 看起來像 checked，實際上是 radio group → 用 Segmented Control</Label>
      </Rule>
    </div>
  ),
}

export const IconRule: Story = {
  name: 'Icon 語意',
  render: () => (
    <div>
      <Rule
        title="startIcon — 描述這個按鈕做什麼（動詞圖示）"
        note="icon 是 label 的圖示說明，與文字傳達同一個動作。選用動詞性圖示：Plus、Save、Download、Trash2"
      >
        <Button variant="primary" startIcon={Plus}>新增</Button>
        <Button variant="tertiary" startIcon={Save}>儲存</Button>
        <Button variant="tertiary" startIcon={Download}>匯出</Button>
        <Button variant="tertiary" startIcon={RefreshCw}>重新整理</Button>
      </Rule>

      <Rule
        title="endIcon — 指示按鈕會開啟下一層（展開 / 選單）"
        note="icon 不描述動作，而是告訴使用者「點這裡還有更多」。通常是 ChevronDown、ChevronRight"
      >
        <Button variant="secondary" endIcon={ChevronDown}>更多選項</Button>
        <Button variant="tertiary" endIcon={ChevronDown}>展開選單</Button>
      </Rule>

      <Rule
        title="startIcon + endIcon 同時使用"
        note="startIcon 描述功能，endIcon 說明可以展開。兩者語意不同，互不衝突"
      >
        <Button variant="primary" startIcon={Bell} endIcon={ChevronDown}>通知</Button>
        <Button variant="tertiary" startIcon={Settings} endIcon={ChevronDown}>偏好設定</Button>
      </Rule>

      <Rule
        title="❌ endIcon 不應使用動詞性圖示"
        note="endIcon 的位置傳達「這裡可以展開」，放動詞圖示會讓使用者以為有第二個操作"
      >
        <Button variant="tertiary" endIcon={Download}>匯出</Button>
        <Label warn>↑ 右側 Download icon 讓人以為有獨立的下載動作，語意混淆</Label>
      </Rule>
    </div>
  ),
}