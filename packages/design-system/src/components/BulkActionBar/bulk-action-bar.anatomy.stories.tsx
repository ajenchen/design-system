// @anatomy-rationale:
//   ColorMatrix N/A — BulkActionBar 無 contrast 底色 / 無顏色變體(spec「無底色 contrast」)。
//   SizeMatrix N/A — 高度 padding-based(`px-loose py-tight`)+ md Buttons 自然撐高,本元件無 size prop。
//   StateBehavior 集中在 Overview 「selection state-driven 渲染」段;獨立 StateBehavior 會跟 Overview 重複。
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, Archive, Download } from 'lucide-react'
import { BulkActionBar } from './bulk-action-bar'
import { Alert } from '@/design-system/components/Alert/alert'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/BulkActionBar/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground mb-1">{children}</h3>
)
const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted max-w-[720px] mb-3">{children}</p>
)

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8 max-w-3xl">
      <section>
        <H3>結構:[X] [count] [ButtonDivider] [actions]</H3>
        <Desc>
          全 md Buttons(close X 與 actions 同尺寸,維持同一列視覺一致)+ gap-2(8px)+ <code>ButtonDivider</code>(自帶 mx-1 = 12px 視覺距離)。
          Padding 對齊 SurfaceFooter / DataTable toolbar 設計準則:
          <code> px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]</code>。
          自然高度 56md / 68lg(md Button 32/36 + py-tight 12/16 ×2)。
          Action variant 採 <code>tertiary</code>(主)/ <code>tertiary danger</code>(destructive)— <strong>不用 primary</strong>(留給 dialog 確認最終 action)。
        </Desc>
        <div className="border border-divider rounded-md">
          <BulkActionBar
            selection={['a', 'b', 'c']}
            actions={
              <>
                <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
                <Button variant="tertiary" size="md" startIcon={Download}>匯出</Button>
                <Button variant="tertiary" size="md" startIcon={Trash2} danger>刪除</Button>
              </>
            }
            onClear={() => {}}
          />
        </div>
      </section>

      <section>
        <H3>Selection state-driven 渲染(0 / N)</H3>
        <Desc>
          <code>selection.length === 0</code> 且無 <code>totalSelected</code> → null(不佔 layout);
          有選取(含反向選取 <code>totalSelected {'>'} 0</code>,見 spec「Extend dataset pattern」)→ 主 bar 浮現。
          擴 dataset 的 hint banner 由 consumer 用 <code>Alert</code> 元件包在 BulkActionBar 上方/下方,
          不在 BulkActionBar 內部 hardcode(對齊 ref 圖)。
        </Desc>
        <SelectionStateDemo />
      </section>

      <section>
        <H3>Hint banner(Alert + ReactNode title 帶 inline link CTA)</H3>
        <Desc>
          擴 dataset 的提示用 <code>Alert variant="info" placement="fixed"</code> 黏在 BulkActionBar 上方,
          inline link CTA 用 <code>title</code> 接 ReactNode 包入 <code>{`<button>`}</code> 自然 inline 顯示
          (Alert 本身 padding 不變,跟段落文字一行流動)。
        </Desc>
        <div className="border border-divider rounded-md overflow-hidden">
          <Alert
            variant="info"
            placement="fixed"
            dismissible={false}
            title={
              <>
                已選取本頁全部 50 個。{' '}
                <button type="button" className="text-primary hover:text-primary-hover">
                  點此選取全部 5370 個項目
                </button>
              </>
            }
          />
          <div className="border-t border-divider">
            <BulkActionBar
              selection={Array.from({ length: 50 }, (_, i) => `f-${i}`)}
              actions={<Button variant="tertiary" size="md" startIcon={Download}>下載</Button>}
              onClear={() => {}}
            />
          </div>
        </div>
      </section>
    </div>
  ),
}

function SelectionStateDemo() {
  const [count, setCount] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-caption">
        <span className="text-fg-muted">selection.length:</span>
        <Button variant="tertiary" size="sm" onClick={() => setCount(0)}>0</Button>
        <Button variant="tertiary" size="sm" onClick={() => setCount(3)}>3</Button>
        <Button variant="tertiary" size="sm" onClick={() => setCount(15)}>15</Button>
      </div>
      <div className="border border-dashed border-border-muted rounded-md min-h-[60px]">
        <BulkActionBar
          selection={Array.from({ length: count }, (_, i) => `x-${i}`)}
          actions={
            <>
              <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
              <Button variant="tertiary" size="md" startIcon={Trash2} danger>刪除</Button>
            </>
          }
          onClear={() => setCount(0)}
        />
        {count === 0 && <span className="text-caption text-fg-muted italic px-3 py-2 inline-block">↑ count=0 → BulkActionBar 不渲染</span>}
      </div>
    </div>
  )
}

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => <InspectorInner />,
}

function InspectorInner() {
  const [selectionCount, setSelectionCount] = useState(3)
  const [hidden, setHidden] = useState(0)

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 max-w-4xl">
      <div className="flex flex-col gap-4 text-caption">
        <ControlGroup label="selection.length">
          {[0, 3, 15, 50].map(n => (
            <Button key={n} variant={selectionCount === n ? 'primary' : 'tertiary'} size="sm" onClick={() => setSelectionCount(n)}>
              {n}
            </Button>
          ))}
        </ControlGroup>

        <ControlGroup label="hiddenByFilter">
          {[0, 2, 10].map(n => (
            <Button key={n} variant={hidden === n ? 'primary' : 'tertiary'} size="sm" onClick={() => setHidden(n)}>
              {n}
            </Button>
          ))}
        </ControlGroup>
      </div>

      <div className="border border-divider rounded-md bg-canvas">
        <BulkActionBar
          selection={Array.from({ length: selectionCount }, (_, i) => `r-${i}`)}
          hiddenByFilter={hidden || undefined}
          actions={
            <>
              <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
              <Button variant="tertiary" size="md" startIcon={Trash2} danger>刪除</Button>
            </>
          }
          onClear={() => setSelectionCount(0)}
        />
        {selectionCount === 0 && <span className="text-caption text-fg-muted italic px-3 py-2 inline-block">selection=0 → 不渲染</span>}
      </div>
    </div>
  )
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-muted">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

export const Accessibility: Story = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="flex flex-col gap-6 max-w-3xl text-body">
      <section>
        <H3>ARIA roles</H3>
        <ul className="list-disc list-inside text-caption text-fg-secondary space-y-1">
          <li><code>role="group"</code> on root + <code>aria-label="批次操作"</code>(可 i18n override;2026-07-06 自 toolbar 降級——未實作 APG toolbar 方向鍵契約,group 語意誠實,Gmail / Linear 同款)</li>
          <li>Clear icon:<code>aria-label="清除選取"</code></li>
          <li>actions slot 內各 button 由 consumer 提供 aria-label / 文字</li>
          <li>Hint banner 用 Alert(自帶 <code>role="status"</code> + <code>aria-live="polite"</code>)</li>
        </ul>
      </section>

      <section>
        <H3>鍵盤(預期 consumer 在 page 層級監聽)</H3>
        <ul className="list-disc list-inside text-caption text-fg-secondary space-y-1">
          <li><kbd>Esc</kbd> → 觸發 <code>onClear()</code>(consumer 在 page-level keydown 監聽)</li>
          <li>Tab 序:close → actions(count 是純文字 / aria 朗讀對象,非 tab stop)</li>
          <li>Hint CTA 是 <code>{`<button>`}</code>,鍵盤可達</li>
        </ul>
      </section>

      <section>
        <H3>Disabled action 處理</H3>
        <Desc>
          無權限的 batch action <strong>顯示 disabled 不藏</strong>。User 看到 disabled 知道有此能力但目前不可用。
        </Desc>
        <div className="border border-divider rounded-md">
          <BulkActionBar
            selection={['a', 'b', 'c']}
            actions={
              <>
                <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
                <Button variant="tertiary" size="md" startIcon={Trash2} danger disabled>刪除(無權限)</Button>
              </>
            }
            onClear={() => {}}
          />
        </div>
      </section>
    </div>
  ),
}
