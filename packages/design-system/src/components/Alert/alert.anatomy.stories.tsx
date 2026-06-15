// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   SizeMatrix N/A — Alert 固定 md tier(由消費的 Notice primitive 決定),
//     不隨 density 縮放(僅 placement="fixed" 的水平 px 走 --layout-space-loose,density-aware)。Placement(inline / fixed)取代 size 作為佈局決策,
//     已由 PlacementMatrix 涵蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { Alert, type AlertProps } from './alert'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Alert/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<AlertProps>

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Alert 跟 Toast 共用同一套排版、圖示與主題策略。結構:圖示 + 標題 + 說明文字 + 右側操作區(endContent)+ 右上角關閉鈕。</Desc>
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
                ['endContent', 'ReactNode', '—', '右側操作區（CTA 按鈕等）'],
                ['dismissible', 'boolean', 'true', '是否顯示右上角關閉按鈕'],
                ['onDismiss', '() => void', '—', '按下關閉按鈕時觸發'],
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

export const Inspector: InspectorStory = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story: '在右側 Controls 面板切換 variant / appearance / placement / dismissible,即時查看 render 結果。世界級 DS 的 Inspector = Figma inspect 替代,讓 designer 直接在 Storybook 試出各種組合。',
      },
    },
  },
  args: {
    variant: 'warning',
    appearance: 'subtle',
    placement: 'inline',
    title: '方案即將到期',
    description: '您的 Pro 方案將在 3 天後到期,請及時續訂以維持服務',
    dismissible: true,
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['neutral', 'info', 'success', 'warning', 'error'],
      description: '語意類型(決定 icon + 色彩)',
    },
    appearance: {
      control: 'radio',
      options: ['subtle', 'solid'],
      description: '視覺重量:subtle(淺底邊框,預設)/ solid(飽和底色,全站警告)',
    },
    placement: {
      control: 'radio',
      options: ['inline', 'fixed'],
      description: 'inline(預設,圓角嵌入)/ fixed(頂部全域,無圓角無邊框)',
    },
    title: { control: 'text', description: '主要訊息' },
    description: { control: 'text', description: '補充說明' },
    dismissible: { control: 'boolean', description: '是否顯示關閉按鈕' },
  },
  render: (args) => <Alert {...args} />,
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
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
              <tr><Td mono>neutral</Td><Td mono>bg-muted + border-border;無 status icon(VARIANT_ICON.neutral = null)</Td><Td>bg-surface-raised + data-theme inverse(跟頁面反)</Td></tr>
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

export const PlacementMatrix: Story = {
  name: '出現位置（內嵌 vs 固定）',
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

export const StateBehavior: Story = {
  name: '狀態行為',
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
          Chrome corner close 用 **Button iconOnly `dismiss` size="xs"**(notification banner family 設計準則,見 `overlay-surface.spec.md`「Chrome dismiss size canonical」)。現行 canonical 為兩分:notification banner family(Notice / Alert / Toast,px-4 py-3 固定)dismiss 用 `xs`;overlay surface(Dialog / Sheet / Popover)另走 `sm` + unbounded 負 margin trick。corner 屬 action group region,實務上可與 refresh / share 等 Button 並排(用 ButtonDivider 分群),必須統一 Button primitive + 同 family 全 xs。`dismiss` prop 自動套 `variant="text"` + icon `fg-muted` 弱化,hover 時恢復 foreground。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>視覺</Th><Th>Token</Th></tr></thead>
            <tbody>
              <tr><Td>default</Td><Td>Button xs iconOnly(24×24),X icon 16,fg-muted</Td><Td mono>text-fg-muted(`dismiss` override)</Td></tr>
              <tr><Td>hover</Td><Td>Button bg 套 neutral-hover,icon 升 foreground</Td><Td mono>bg-neutral-hover / text-foreground</Td></tr>
              <tr><Td>focus</Td><Td>2px ring(鍵盤導航)</Td><Td mono>ring-ring ring-offset-1</Td></tr>
              <tr><Td>solid appearance</Td><Td>icon 隨 variant 的 data-theme:info / success / error(dark theme)白字,warning(light theme)深字</Td><Td mono>text-fg-muted → hover text-foreground(隨 data-theme 翻轉)</Td></tr>
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

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"無障礙朗讀行為依 variant 自動切換：\n\n-   一般提示（neutral / info / success）  ： role=\"status\"  +  aria-live=\"polite\" ——螢幕報讀器在使用者空閒時才讀出內容，不打斷目前動作\n-   緊急提示（warning / error）  ： role=\"alert\"  +  aria-live=\"assertive\" ——立即中斷目前朗讀讀出內容，因為使用者必須馬上知道\n-   關閉按鈕  ：必須有  aria-label （如「關閉通知」）\n-   行動按鈕  ：放在 Alert 內的操作按鈕用最小尺寸、低調樣式，文字直接描述動作（「前往設定」「立即更新」）"}</p>
    </div>
  ),
}
