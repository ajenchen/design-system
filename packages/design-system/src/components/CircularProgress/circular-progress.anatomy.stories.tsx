// @anatomy-rationale:
//   Inspector N/A — size 為自由 number prop,互動決策點少(僅 value / size /
//     affix),由 Overview + UsageInButton + UsageInline 三個 consumer-context
//     story 直接示範比建 inspector 更實用。
//   ColorMatrix N/A — arc 預設固定 text-info;consumer 傳 className="text-current"
//     才繼承 host(如 Button loading),無 own variant × state 色彩;不會隨狀態變色
//     (完成 / 失敗由 consumer swap 整個元件,見 spec「不設 status prop」)。
//   SizeMatrix N/A — size 為自由 number,Button / Input 等 consumer 內部依規
//     則程式化縮放(field iconSize),由 UsageInButton / UsageInline 涵蓋。
//   StateBehavior N/A — 無 hover / focus / active 狀態(載入中是唯一狀態)。
import type { Meta, StoryObj } from '@storybook/react'
import { CircularProgress } from './circular-progress'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

/**
 * CircularProgress 是整個設計系統「圓形進度」的單一來源——同時支援兩種模式:
 * 不傳 value 時是旋轉的載入動畫(indeterminate),傳了 value 時是固定弧長的
 * 進度圈(determinate,有底圈 + 進度弧)。
 *
 * 這頁只放四個範例:元件總覽、在 Button 載入狀態內、行內使用、無障礙。
 * 沒有另外做尺寸對照、顏色對照、互動狀態等示範,原因是:
 * - 尺寸是自由數值(非 sm/md/lg 階),由 Button / Input 等容器內部依規則自動縮放,
 *   範例裡直接示範比列舉一堆尺寸更實用。
 * - 顏色不隨狀態變色,預設固定 text-info(傳 text-current 才繼承容器文字色),沒有需要對照的色彩組合。
 * - 元件本身沒有 hover / focus / active 等互動狀態,唯一會變的是進度值本身。
 */

const meta: Meta = {
  title: 'Design System/Components/CircularProgress/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          SVG 雙 circle:底 track(<span className="font-mono">var(--secondary)</span>)+ 進度 arc
          (<span className="font-mono">currentColor</span>)。indeterminate 模式 arc 固定 25%,外層
          <span className="font-mono">animate-spin</span> 旋轉;determinate 模式 arc 長度 = value/100。
          strokeWidth 動態 scale = <span className="font-mono">max(2, size/10)</span>。
        </Desc>
        <div className="flex items-center gap-6 border border-border rounded-lg p-6">
          {/* CircularProgress 只有一種預設尺寸(24)。其他尺寸 **不**示範 —
              consumer 在 Button / Input / Empty 等 context 內由這些元件自動依原則縮放
              (見 spec.md「Size canonical」+ UsageInButton / UsageInline 兩個 context story)。
              Overview 只展示 indeterminate + determinate 兩種模式。 */}
          <CircularProgress />
          <CircularProgress value={60} />
          <span className="text-caption text-fg-muted font-mono">
            indeterminate(不傳 value)· determinate(value=60)
          </span>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['value', 'number (0-100)', '—', '有值 → determinate(arc 固定)/ 無值 → indeterminate(旋轉)'],
                ['size', 'number', '24', '直徑 px,≤ 64 建議;Button / Input 內部程式化'],
                ['label', 'string', '—', 'inline label,font-size 繼承 parent,色鎖 text-fg-muted'],
                ['affix', "'value' | ReactNode", '—', 'Determinate 右側附加(indeterminate 忽略);「已完成」不走此 prop,由 consumer 端 swap 整個元件'],
                ['className', 'string', '—', '常用 text-current 讓 arc 色繼承父層(Button loading)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          色彩策略:固定 <span className="font-mono">text-info</span>;Button loading 傳
          <span className="font-mono"> className="text-current" </span>讓 arc 繼承 button
          foreground(常為白色)。**不隨狀態變色**——「完成 / 失敗」由 consumer 端 swap 整個元件
          呈現(見 spec「不設 status prop」)。
        </p>
      </div>
    </div>
  ),
}

export const UsageInButton: Story = {
  name: '在 Button 載入中 狀態內',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Button loading</H3>
        <Desc>
          Button 的 <span className="font-mono">loading</span> prop 內部渲染 CircularProgress
          (indeterminate 模式)替代 startIcon——是最常見的 CircularProgress 消費場景。
          color 透過 <span className="font-mono">className="text-current"</span> 繼承 Button 的 foreground。
        </Desc>
        <div className="flex items-center gap-3">
          <Button variant="primary" loading>儲存中</Button>
          <Button variant="secondary" loading>處理中</Button>
          <Button variant="tertiary" loading>載入中</Button>
        </div>
      </div>

      <div>
        <H3>Icon-only loading</H3>
        <div className="flex items-center gap-3">
          <Button variant="tertiary" size="sm" iconOnly loading aria-label="儲存中" />
          <Button variant="tertiary" size="md" iconOnly loading aria-label="處理中" />
          <Button variant="tertiary" size="lg" iconOnly loading aria-label="載入中" />
        </div>
      </div>
    </div>
  ),
}

export const UsageInline: Story = {
  name: '行內使用',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Cell / Table row 局部 loading</H3>
        <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 max-w-xs">
          <CircularProgress size={16} />
          <span className="text-body text-fg-muted">載入訂單資料...</span>
        </div>
      </div>

      <div>
        <H3>Field loading state(Input `loading` prop)</H3>
        <Desc>
          Input 的 <span className="font-mono">loading</span> prop 內部自動在 endAction slot 塞
          CircularProgress,size 對齊 field iconSize(sm/md=16,lg=20)。consumer 不手刻 absolute 對齊。
        </Desc>
        <Input
          startIcon={undefined}
          loading
          defaultValue="cq@example.com"
          placeholder="驗證 email 中..."
          className="max-w-sm"
        />
      </div>

      <div>
        <H3>Determinate inline(檔案上傳 %)</H3>
        <Desc>
          有進度資訊時傳 <span className="font-mono">value</span>,CircularProgress 切換為
          determinate 模式(fixed arc + track)。可搭配 <span className="font-mono">affix</span>
          顯示百分比;完成時 consumer 端 swap 為 Check icon / 結果內容,**不做 success morph**
          (見 spec「不設 status prop」)。
        </Desc>
        <div className="flex items-center gap-4">
          <CircularProgress value={25} />
          <CircularProgress value={60} affix="value" />
          <CircularProgress value={90} affix="value" />
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"本元件不可聚焦、無鍵盤互動(載入指示不接收鍵盤),但會依模式自動輸出對的 ARIA 給輔助技術:\n\n• 有 value(determinate)→ role=\"progressbar\",並帶 aria-valuenow / aria-valuemin=0 / aria-valuemax=100,螢幕報讀器會念出目前進度。\n• 無 value(indeterminate)+ 有傳 label 或 aria-label → role=\"status\",把 label 當作 aria-label 念出(例如「載入訂單資料中」)。\n• 無 value 且沒給任何 label → 標記 aria-hidden,交由外層容器(如 Button 的 aria-busy)負責語義。\n\n當把 CircularProgress 包進互動容器(Button / Card / Link)時,聚焦與鍵盤行為由容器決定。"}</p>
    </div>
  ),
}
