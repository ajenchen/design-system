import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Bot, Sparkles, Users } from 'lucide-react'
import { Coachmark } from './coachmark'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Coachmark/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Inline media helper ──────────────────────────────────────────────────────

const DemoMedia = ({
  from = '#6366f1', to = '#8b5cf6', icon: Icon = Bot, label = 'Feature',
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

// ── 1. Overview ──────────────────────────────────────────────────────────────

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          Coachmark 是 Popover 的 composition pattern——消費 Popover 的浮層外殼 + overlay-surface Body/Footer padding,自己擁有的差異僅三點:(1) 無 Header,(2) 有 Media 區,(3) Footer 為 justify-between。改 Popover 視覺 Coachmark 自動跟進。
        </Desc>
        <div className="flex items-start gap-8">
          <Coachmark
            open
            image={<DemoMedia icon={Bot} label="AI 助理" />}
            title="試試新的 AI 助理"
            description="在任何文件中按下 AI 按鈕,讓 Claude 幫你摘要、翻譯或改寫內容。"
            step={{ current: 2, total: 3 }}
            onPrev={() => {}}
            onSkip={() => {}}
            onNext={() => {}}
            side="right"
            align="start"
          >
            <Button variant="primary" startIcon={Bot}>AI 助理</Button>
          </Coachmark>
          <div className="text-caption text-fg-secondary max-w-[280px] leading-relaxed">
            <ul className="list-disc pl-4 space-y-1.5">
              <li><b>Media</b> — 可選,aspect-video,邊緣對齊 rounded-t-lg</li>
              <li><b>Body</b> — Title(text-body-lg font-medium) + Description(text-body text-fg-secondary)</li>
              <li><b>Footer</b> — justify-between;左 step 計數 / 右 actions(Previous / Skip / Next)</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <H3>Structure breakdown</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>區塊</Th><Th>條件渲染</Th><Th>Padding</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td>Media</Td><Td mono>image != null</Td><Td mono>aspect-video(無 inner padding)</Td><Td>full-width bg-muted,overflow-hidden</Td></tr>
              <tr><Td>Body</Td><Td mono>title || description</Td><Td mono>PopoverBody(px-loose py-tight)</Td><Td>consumer 控制 Body flex-col gap-1</Td></tr>
              <tr><Td>Footer</Td><Td mono>step || onSkip || onNext || onPrev</Td><Td mono>PopoverFooter(px-loose py-tight)</Td><Td>justify-between(不是 justify-end)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td mono>children</Td><Td mono>ReactNode</Td><Td mono>—</Td><Td>anchor trigger element(Popover asChild)</Td></tr>
              <tr><Td mono>open / onOpenChange</Td><Td mono>boolean / (o) =&gt; void</Td><Td mono>—</Td><Td>controlled 控制(多步 tour 必用)</Td></tr>
              <tr><Td mono>image</Td><Td mono>ReactNode</Td><Td mono>—</Td><Td>頂部 media 區;不傳則不渲染</Td></tr>
              <tr><Td mono>title</Td><Td mono>ReactNode</Td><Td mono>—</Td><Td>標題(text-body-lg font-medium)</Td></tr>
              <tr><Td mono>description</Td><Td mono>ReactNode</Td><Td mono>—</Td><Td>說明文字(text-body text-fg-secondary)</Td></tr>
              <tr><Td mono>step</Td><Td mono>{'{ current, total }'}</Td><Td mono>—</Td><Td>步驟計數;有值 footer 左顯示「2 of 3」</Td></tr>
              <tr><Td mono>onSkip</Td><Td mono>() =&gt; void</Td><Td mono>—</Td><Td>Skip 按鈕;不傳則不渲染</Td></tr>
              <tr><Td mono>onNext</Td><Td mono>() =&gt; void</Td><Td mono>—</Td><Td>Next 按鈕;不傳則不渲染</Td></tr>
              <tr><Td mono>onPrev</Td><Td mono>() =&gt; void</Td><Td mono>—</Td><Td>Previous 按鈕(第 2+ 步);不傳則不渲染</Td></tr>
              <tr><Td mono>isLastStep</Td><Td mono>boolean</Td><Td mono>false</Td><Td>true 時 Next 文字改 Done</Td></tr>
              <tr><Td mono>side</Td><Td mono>'top' | 'right' | 'bottom' | 'left'</Td><Td mono>'bottom'</Td><Td>對齊 Popover props</Td></tr>
              <tr><Td mono>align</Td><Td mono>'start' | 'center' | 'end'</Td><Td mono>'center'</Td><Td>對齊 Popover props</Td></tr>
              <tr><Td mono>sideOffset</Td><Td mono>number</Td><Td mono>8</Td><Td>比 Popover 預設 4 大(Coachmark 要更明顯的斷離)</Td></tr>
              <tr><Td mono>className</Td><Td mono>string</Td><Td mono>'w-80 p-0 overflow-hidden'</Td><Td>預設寬 320px(比 Popover 的 w-72 寬,因放 media + 多行文字)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── 2. Inspector ─────────────────────────────────────────────────────────────

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => {
    const [hasImage, setHasImage] = React.useState(true)
    const [hasStep, setHasStep] = React.useState(true)
    const [isLast, setIsLast] = React.useState(false)
    const [hasPrev, setHasPrev] = React.useState(true)
    const [hasSkip, setHasSkip] = React.useState(true)

    const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
      <label className="flex items-center gap-2 text-caption">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-mono">{label}</span>
      </label>
    )

    return (
      <div className="grid grid-cols-2 gap-8">
        <div>
          <H3>預覽</H3>
          <div className="flex flex-col gap-4 items-start">
            <div className="flex flex-wrap gap-3 p-3 bg-muted rounded-md text-caption">
              <Toggle label="hasImage" value={hasImage} onChange={setHasImage} />
              <Toggle label="hasStep" value={hasStep} onChange={setHasStep} />
              <Toggle label="hasPrev" value={hasPrev} onChange={setHasPrev} />
              <Toggle label="hasSkip" value={hasSkip} onChange={setHasSkip} />
              <Toggle label="isLastStep" value={isLast} onChange={setIsLast} />
            </div>
            <Coachmark
              open
              image={hasImage ? <DemoMedia icon={Sparkles} label="功能介紹" /> : undefined}
              title="試試新功能"
              description="這是 Coachmark 的說明文字;多行內容會自動換行並保持 leading 一致。"
              step={hasStep ? { current: 2, total: 3 } : undefined}
              onPrev={hasPrev ? () => {} : undefined}
              onSkip={hasSkip ? () => {} : undefined}
              onNext={() => {}}
              isLastStep={isLast}
              side="right"
              align="start"
            >
              <Button variant="primary" size="sm" startIcon={Sparkles}>Anchor</Button>
            </Coachmark>
          </div>
        </div>

        <div>
          <H3>Inspect 面板</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse w-full">
              <thead><tr><Th>類別</Th><Th>Token / 值</Th></tr></thead>
              <tbody>
                <tr><Td>外殼 bg</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised" /></Td></tr>
                <tr><Td>外殼 border</Td><Td><TokenCell token="--border" display="border-border" /></Td></tr>
                <tr><Td>外殼 radius</Td><Td mono>rounded-lg(8px)</Td></tr>
                <tr><Td>外殼 shadow</Td><Td mono>--elevation-200</Td></tr>
                <tr><Td>Width</Td><Td mono>w-80(320px)</Td></tr>
                <tr><Td>Media 背景</Td><Td><TokenCell token="--muted" display="bg-muted" /></Td></tr>
                <tr><Td>Media 比例</Td><Td mono>aspect-video(16:9)</Td></tr>
                <tr><Td>Body padding</Td><Td mono>px-[--layout-space-loose] py-[--layout-space-tight]</Td></tr>
                <tr><Td>Body gap</Td><Td mono>gap-1(Title / Description 間)</Td></tr>
                <tr><Td>Title typography</Td><Td mono>text-body-lg font-medium text-foreground</Td></tr>
                <tr><Td>Description typography</Td><Td mono>text-body text-fg-secondary</Td></tr>
                <tr><Td>Footer padding</Td><Td mono>px-[--layout-space-loose] py-[--layout-space-tight]</Td></tr>
                <tr><Td>Footer layout</Td><Td mono>justify-between(左 step / 右 actions)</Td></tr>
                <tr><Td>Footer actions gap</Td><Td mono>gap-2</Td></tr>
                <tr><Td>Step typography</Td><Td mono>text-caption text-fg-secondary tabular-nums</Td></tr>
                <tr><Td>Button size</Td><Td mono>sm(Previous / Skip / Next 全 sm)</Td></tr>
                <tr><Td>Previous / Skip variant</Td><Td mono>tertiary</Td></tr>
                <tr><Td>Next variant</Td><Td mono>primary</Td></tr>
                <tr><Td>sideOffset</Td><Td mono>8px(預設;Popover 預設 4px)</Td></tr>
                <tr><Td>Density</Td><Td mono>繼承 Popover(鎖 md)</Td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

// ── 3. Color ─────────────────────────────────────────────────────────────────

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>區塊色彩對照</H3>
        <Desc>
          Coachmark 外殼 token 完全繼承 Popover(`--surface-raised` / `--border` / `--elevation-200`);自己擁有的色彩決策僅 Media bg 和 Step 計數。改 Popover 外殼 token 連動,不在此 override。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>區塊</Th><Th>Token</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td>外殼 bg(繼承 Popover)</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised" /></Td><Td>浮層背景,比 surface 高一階</Td></tr>
              <tr><Td>外殼 border</Td><Td><TokenCell token="--border" display="border-border" /></Td><Td>標準邊框</Td></tr>
              <tr><Td>Media bg(Coachmark own)</Td><Td><TokenCell token="--muted" display="bg-muted" /></Td><Td>illustration / 透明 PNG 底色</Td></tr>
              <tr><Td>Title</Td><Td><TokenCell token="--foreground" display="text-foreground" /></Td><Td>主文字色</Td></tr>
              <tr><Td>Description</Td><Td><TokenCell token="--fg-secondary" display="text-fg-secondary" /></Td><Td>次要說明文字</Td></tr>
              <tr><Td>Step 計數</Td><Td><TokenCell token="--fg-secondary" display="text-fg-secondary" /></Td><Td>footer 左側數字(tabular-nums)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── 4. Size ──────────────────────────────────────────────────────────────────

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>預設 w-80(320px)</H3>
        <Desc>
          Coachmark 預設寬 320px,比 Popover 預設 w-72(288px)寬 32px——因為 Coachmark 主動推送,必須容納 media + 多行 description。Popover 多用於篩選 / 設定的短文字所以較窄。Coachmark 無 size variants(不像 Family 3 / 4 的 sm/md/lg)——單一預設寬符合「固定說明密度」的定位;特殊情境 consumer 用 className 覆寫。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元件</Th><Th>預設寬</Th><Th>px</Th><Th>為什麼</Th></tr></thead>
            <tbody>
              <tr><Td>Popover</Td><Td mono>w-72</Td><Td mono>288px</Td><Td>篩選 / 設定面板,內容短</Td></tr>
              <tr><Td>Coachmark</Td><Td mono>w-80</Td><Td mono>320px</Td><Td>需放 media + 多行 description</Td></tr>
              <tr><Td>Dialog</Td><Td mono>maxWidth 變動</Td><Td mono>360–720px</Td><Td>modal 內容量級別最大</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Media 固定 aspect-video(16:9)</H3>
        <Desc>
          Media 區高度由寬度 × 9/16 決定(w-80 → media 高約 180px)——確保不同 tour 步驟視覺一致,consumer 不需自己算高度。若 media 內容比例不是 16:9,`overflow-hidden` 會裁切超出部分。
        </Desc>
      </div>

      <div>
        <H3>固定 width 的理由(無 sm/md/lg variant)</H3>
        <Desc>
          Coachmark 定位是「標準化教學卡片」,每個 tour 步驟應該視覺一致,讓使用者學會「Coachmark = 320px 說明卡」的 pattern。提供 size variant 會讓不同步驟大小不一造成視覺跳動,反而降低可用性。特殊情境(寬 media)由 consumer 傳 className 覆寫。
        </Desc>
      </div>
    </div>
  ),
}

// ── 5. State / Multi-step Behavior ───────────────────────────────────────────

export const StateBehavior: Story = {
  name: '狀態與多步行為',
  render: () => {
    const [singleOpen, setSingleOpen] = React.useState(true)

    const [tourStep, setTourStep] = React.useState(0)
    const [tourOpen, setTourOpen] = React.useState(true)
    const tourTotal = 3
    const isLast = tourStep === tourTotal - 1

    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>單步 Coachmark(無 step,僅 Skip / Next)</H3>
          <Desc>
            最簡 Coachmark:`onSkip` + `onNext`,無 step 計數。按 Skip 或 Next 都關閉;Esc 等同 Skip。
          </Desc>
          <div className="flex items-start gap-6">
            <Coachmark
              open={singleOpen}
              onOpenChange={setSingleOpen}
              image={<DemoMedia icon={Bot} label="AI" />}
              title="試試 AI 助理"
              description="單步 Coachmark,僅 Skip / Next,無 step 計數。"
              onSkip={() => setSingleOpen(false)}
              onNext={() => setSingleOpen(false)}
              side="right"
              align="start"
            >
              <Button variant="primary" size="sm">Anchor</Button>
            </Coachmark>
            <Button variant="tertiary" size="sm" onClick={() => setSingleOpen(true)}>重新開啟</Button>
          </div>
        </div>

        <div>
          <H3>多步 Tour(current of total,含 Previous)</H3>
          <Desc>
            Consumer 管理 `step` state;每步傳不同 `current`。第 2+ 步顯示 Previous,最後步 Next 文字變 Done(isLastStep)。Footer 左側 step 計數使用 `tabular-nums` 讓數字等寬,切換步驟時不跳動。
          </Desc>
          <div className="flex items-start gap-6">
            <Coachmark
              open={tourOpen}
              onOpenChange={setTourOpen}
              image={<DemoMedia icon={Users} label={`Step ${tourStep + 1}`} />}
              title={`步驟 ${tourStep + 1}:${['建立 Workspace', '邀請成員', '建立專案'][tourStep]}`}
              description="多步 tour 由 consumer 管理 current step,每步渲染一個 Coachmark anchor 到對應 feature。"
              step={{ current: tourStep + 1, total: tourTotal }}
              onPrev={tourStep > 0 ? () => setTourStep(tourStep - 1) : undefined}
              onSkip={() => setTourOpen(false)}
              onNext={() => (isLast ? setTourOpen(false) : setTourStep(tourStep + 1))}
              isLastStep={isLast}
              side="right"
              align="start"
            >
              <Button variant="primary" size="sm" startIcon={Users}>Step {tourStep + 1}</Button>
            </Coachmark>
            <div className="flex flex-col gap-2 text-caption">
              <span>目前:step {tourStep + 1} / {tourTotal}</span>
              <span className="text-fg-muted">{isLast ? 'isLastStep = true → Next 變 Done' : 'isLastStep = false → Next'}</span>
              <Button variant="tertiary" size="sm" onClick={() => { setTourStep(0); setTourOpen(true) }}>重設</Button>
            </div>
          </div>
        </div>

        <div>
          <H3>Footer 按鈕渲染規則</H3>
          <Desc>
            每個 callback 有傳才渲染對應按鈕;無任何 footer callback 且無 step 時整個 Footer 不渲染(Body-only Coachmark)。
          </Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead><tr><Th>情境</Th><Th>Footer 渲染</Th></tr></thead>
              <tbody>
                <tr><Td>無 step、無 callback</Td><Td>Footer 不渲染(僅 media + body)</Td></tr>
                <tr><Td>只 onNext</Td><Td>Footer 有 Next;左側保留 space(justify-between)</Td></tr>
                <tr><Td>step + onSkip + onNext</Td><Td>左 step 計數 / 右 Skip + Next</Td></tr>
                <tr><Td>step + onPrev + onSkip + onNext</Td><Td>左 step 計數 / 右 Previous + Skip + Next</Td></tr>
                <tr><Td>isLastStep + onNext</Td><Td>Next 文字 → Done</Td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>Focus / Esc / Click-outside(繼承 Popover)</H3>
          <Desc>
            Coachmark 行為完全繼承 Popover(Radix):開啟時焦點移進 content,關閉 return to trigger;Esc 關閉(= Skip 語意);預設 non-modal,使用者可忽略繼續主流程。
          </Desc>
        </div>
      </div>
    )
  },
}
