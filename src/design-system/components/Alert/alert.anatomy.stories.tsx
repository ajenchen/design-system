import type { Meta, StoryObj } from '@storybook/react'
import { Alert } from './alert'
import { H3, Desc, Td, Th } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Alert/設計規格',
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
        <Desc>Alert 消費 Notice primitive(跟 Toast 共用 layout + icon + theme 策略)。結構:Icon + Title + Description + 可選 actions。</Desc>
        <Alert
          variant="warning"
          title="方案即將到期"
          description="您的 Pro 方案將在 3 天後到期,請及時續訂以維持服務"
        />
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['variant', "'neutral' | 'info' | 'success' | 'warning' | 'error'", "'neutral'", '語意類型(決定 icon + 色彩)'],
                ['appearance', "'subtle' | 'solid'", "'subtle'", '視覺重量(淺底邊框 vs 飽和底色)'],
                ['placement', "'inline' | 'fixed'", "'inline'", 'inline 嵌內容 vs fixed 頂部全域警告'],
                ['title', 'ReactNode', '必填', '主要訊息'],
                ['description', 'ReactNode', '—', '補充說明'],
                ['actions', 'ReactNode', '—', 'CTA buttons'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表(Variant × Appearance)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Subtle(淺底 + 邊框,預設)</H3>
        <Desc>視覺重量適中,99% 的 Alert 用 subtle。不搶頁面焦點,使用者注意但可繼續主要任務。</Desc>
        <div className="flex flex-col gap-3 max-w-xl">
          <Alert variant="neutral" title="新功能上線" description="我們推出了 Dark Mode,請前往設定啟用" />
          <Alert variant="info" title="系統維護中" description="部分功能暫停服務,預計 30 分鐘內恢復" />
          <Alert variant="success" title="驗證通過" description="您的電子郵件已成功驗證" />
          <Alert variant="warning" title="額度即將用完" description="您本月 API 額度已使用 90%" />
          <Alert variant="error" title="付款失敗" description="您上次的訂閱付款失敗,請更新付款方式" />
        </div>
      </div>

      <div>
        <H3>Solid(飽和底色)</H3>
        <Desc>視覺重量高,用於真的很重要的全站警告。一個頁面最多一個 solid Alert。</Desc>
        <div className="flex flex-col gap-3 max-w-xl">
          <Alert variant="info" appearance="solid" title="系統升級" description="本站將於 02:00 進行升級" />
          <Alert variant="warning" appearance="solid" title="配額用盡" description="請立即升級方案以繼續使用" />
          <Alert variant="error" appearance="solid" title="服務中斷" description="API 服務暫時不可用,工程團隊正在修復" />
        </div>
      </div>

      <div>
        <H3>Variant × Theme 策略</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Variant</Th><Th>Subtle</Th><Th>Solid</Th></tr></thead>
            <tbody>
              <tr><Td mono>neutral</Td><Td mono>bg-muted + border-border + text-fg-muted icon</Td><Td>bg-surface-raised + data-theme inverse(跟頁面反)</Td></tr>
              <tr><Td mono>info</Td><Td mono>bg-info-subtle + border-info-hover + text-info-text</Td><Td mono>bg-info + data-theme="dark"(藍底白字)</Td></tr>
              <tr><Td mono>success</Td><Td mono>bg-success-subtle + border-success-hover + text-success-text</Td><Td mono>bg-success + data-theme="dark"(綠底白字)</Td></tr>
              <tr><Td mono>warning</Td><Td mono>bg-warning-subtle + border-warning-hover + text-warning-text</Td><Td mono>bg-warning + data-theme="light"(黃底深字)</Td></tr>
              <tr><Td mono>error</Td><Td mono>bg-error-subtle + border-error-hover + text-error-text</Td><Td mono>bg-error + data-theme="dark"(橘底白字)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為(dismiss / static)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Dismissible(右側 close icon)</H3>
        <Desc>
          Alert 預設 `dismissible=true`,右上角顯示 close button。按 close 觸發 `onDismiss` 由 consumer 控制移除(Alert 本身不 own unmount 狀態——inline 通知通常需要 consumer 記住「使用者已關閉」狀態)。
        </Desc>
        <div className="flex flex-col gap-3 max-w-xl">
          <Alert variant="info" title="可關閉" description="右上角有 close icon,按下觸發 onDismiss" />
          <Alert variant="warning" title="不可關閉" description="永久性警告,設 dismissible={false} 隱藏 close icon" dismissible={false} />
        </div>
      </div>

      <div>
        <H3>Close button 互動狀態</H3>
        <Desc>
          Close icon 使用 Inline Action pattern(16px icon + 24px hover bg)——對齊 `item-anatomy.spec.md`「Inline Action 設計規格」。hover 時 bg `neutral-hover`,focus 時 ring。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>視覺</Th><Th>Token</Th></tr></thead>
            <tbody>
              <tr><Td>default</Td><Td>16px X icon, fg-muted</Td><Td mono>text-fg-muted</Td></tr>
              <tr><Td>hover</Td><Td>24px bg circle + icon fg 變 foreground</Td><Td mono>bg-neutral-hover / text-foreground</Td></tr>
              <tr><Td>focus</Td><Td>2px ring(鍵盤導航)</Td><Td mono>ring-ring ring-offset-1</Td></tr>
              <tr><Td>solid appearance</Td><Td>icon 用白字(繼承 data-theme foreground)</Td><Td mono>text-foreground(inverse)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>非互動 Alert(無內建 open/close state)</H3>
        <Desc>
          Alert 本身無 open/closed state——它是 inline 容器,「顯示」= consumer 把 Alert render 進 tree,「關閉」= consumer 從 tree 移除。與 Toast(有 open 動畫 + auto-dismiss timer)語意不同。
        </Desc>
      </div>
    </div>
  ),
}

export const PlacementMatrix: Story = {
  name: 'Placement(inline vs fixed)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Inline(預設) — 嵌入頁面內容</H3>
        <Desc>`rounded-md`(4px)圓角 + 邊框,像一張 card 嵌在內容區塊裡。Settings 頁的方案提示、表單內的注意事項。</Desc>
        <Alert
          variant="warning"
          title="即將到期"
          description="您的方案將在 3 天後到期"
        />
      </div>

      <div>
        <H3>Fixed — 頂部全域警告</H3>
        <Desc>無圓角無邊框,頁面寬度橫條。系統維護、服務降級、全站重要公告。</Desc>
        <Alert
          variant="info"
          placement="fixed"
          title="系統維護中"
          description="2026-04-20 02:00-04:00 進行系統升級,部分功能暫停"
        />
      </div>

      <div>
        <H3>Placement 對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Placement</Th><Th>圓角</Th><Th>Border</Th><Th>用途</Th></tr></thead>
            <tbody>
              <tr><Td mono>inline ★default</Td><Td mono>rounded-md(4px)</Td><Td>有</Td><Td>頁面內嵌</Td></tr>
              <tr><Td mono>fixed</Td><Td>無(rounded-none)</Td><Td>無</Td><Td>header 底下全域警告</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">Alert 是 inline 容器(不是浮層),用 `rounded-md`(4px)。Toast 是浮層用 `rounded-lg`(8px)。</p>
      </div>
    </div>
  ),
}
