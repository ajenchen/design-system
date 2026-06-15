// @anatomy-rationale:
//   StateBehavior covered by ColorMatrix「四種 mode / state × 色彩 Token」段
//     (5 state:edit default / edit focus / readonly / disabled / error)
//     + ModeMatrix(6.)edit / readonly / disabled / error 視覺對照。Textarea
//     的狀態本質就是 mode × state 的色彩 token 組合,集中於 ColorMatrix 比拆
//     5. 更直觀。
import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from './textarea'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Textarea/設計規格',
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
        <Desc>Textarea 是多行 Input——native `&lt;textarea&gt;` + 橋接 DS token。不同於 Input:沒有 field-height(高度由 rows / min-h 決定)、沒有 startIcon / endAction。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <Textarea rows={3} placeholder="請輸入留言..." />
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['mode', "'edit' | 'display' | 'readonly' | 'disabled'", "'edit'", 'Field mode(display 渲染純文字 div;readonly 用底色 + padding 標示閱讀區)'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", 'sm/md text-body,lg text-body-lg'],
                ['rows', 'number', '3', '預設可見行數'],
                ['placeholder', 'string', '—', '空值提示'],
                ['error', 'boolean', 'false', 'error 視覺(border-error + aria-invalid)'],
                ['...props', 'HTMLTextareaAttributes', '—', 'spread 到 native textarea'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>與 Input 的差異 table</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th></Th><Th>Input</Th><Th>Textarea</Th></tr></thead>
            <tbody>
              <tr><Td>行數</Td><Td>單行</Td><Td>多行(rows 控制)</Td></tr>
              <tr><Td>高度</Td><Td mono>固定 h-field-*</Td><Td>由 rows / min-h 決定 + resize-y</Td></tr>
              <tr><Td>Padding</Td><Td mono>items-center(垂直置中)</Td><Td mono>py-2(上下固定內距)</Td></tr>
              <tr><Td>startIcon / endAction</Td><Td>✓ 支援</Td><Td>❌ 不支援(textarea 慣例無 icon)</Td></tr>
              <tr><Td>Enter 鍵</Td><Td>觸發 form submit</Td><Td>換行</Td></tr>
              <tr><Td>Readonly 呈現</Td><Td>同高度、緊湊底色</Td><Td>保留 padding，改用底色標示閱讀區(多行需閱讀區)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切 props 即時 render,取代 Figma inspect。切 `mode` 看 edit / readonly / disabled 外觀差異,調 `rows` 看高度、切 `error` 看錯誤邊框。' } },
  },
  args: {
    mode: 'edit',
    size: 'md',
    rows: 3,
    error: false,
    placeholder: '寫下您對這個 PR 的 review 意見…',
    defaultValue: '',
  },
  argTypes: {
    mode: { control: 'radio', options: ['edit', 'display', 'readonly', 'disabled'] },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
    rows: { control: { type: 'number', min: 1, max: 20 } },
    error: { control: 'boolean', description: 'error 視覺(border-error + aria-invalid)' },
    placeholder: { control: 'text' },
    defaultValue: { control: 'text' },
  },
  render: (args) => (
    <div className="max-w-md">
      <Textarea {...args} />
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div>
        <H3>Size = sm / md</H3>
        <Desc>`text-body`(14px)。常見 form / comment 場景。</Desc>
        <Textarea size="sm" rows={3} placeholder="寫下您的意見..." />
      </div>
      <div>
        <H3>Size = lg</H3>
        <Desc>`text-body-lg`(16px)。長篇閱讀場景(bio editor、article body)。</Desc>
        <Textarea size="lg" rows={3} placeholder="介紹您自己..." />
      </div>
    </div>
  ),
}

export const ModeMatrix: Story = {
  name: '模式 對照（編輯 / 展示 / 唯讀 / 停用）',
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div>
        <H3>edit(預設)</H3>
        <Textarea
          rows={3}
          defaultValue="我覺得這個專案非常有潛力,建議加強 onboarding 的引導流程..."
        />
      </div>
      <div>
        <H3>display — 純展示(渲 div 取代 textarea,whitespace-pre-wrap 保留多行)</H3>
        <Desc>對齊 Carbon read-only / Cloudscape display mode。常見於檢視已提交的留言 / 評論。</Desc>
        <Textarea
          mode="display"
          rows={3}
          value="我覺得這個專案非常有潛力,建議加強 onboarding 的引導流程..."
        />
      </div>
      <div>
        <H3>readonly — 保留 padding，用底色標示閱讀區(多行需閱讀區邊界)</H3>
        <Desc>不同於 Input 的 readonly(同高度、緊湊底色)。多行內容扁平化會讓使用者誤以為可編輯或混入純文字內容——必須用填色 + 內距標示出明確的閱讀區域。</Desc>
        <Textarea
          mode="readonly"
          rows={3}
          defaultValue="我覺得這個專案非常有潛力,建議加強 onboarding 的引導流程..."
        />
      </div>
      <div>
        <H3>disabled</H3>
        <Textarea
          mode="disabled"
          rows={3}
          defaultValue="尚未開放編輯"
        />
      </div>
      <div>
        <H3>Error state</H3>
        <Textarea
          error
          rows={3}
          defaultValue="留言內容不能為空"
        />
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>四種 mode / state × 色彩 Token</H3>
        <Desc>
          Textarea 作為 Field Control,mode 規則對齊 Input 但 readonly 呈現不同
          (Textarea readonly 保留 padding,用 bg-readonly 底色標示閱讀區;Input readonly 是緊湊底色)。Error border 跟其他
          Field Controls 共用 `--error` 語意色。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>Background</Th>
                <Th>Border</Th>
                <Th>Text</Th>
                <Th>Placeholder</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>edit default</Td>
                <Td><TokenCell token="--surface" display="surface" /></Td>
                <Td><TokenCell token="--border" display="border" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted" /></Td>
              </tr>
              <tr>
                <Td mono>edit focus</Td>
                <Td><TokenCell token="--surface" display="surface" /></Td>
                <Td><TokenCell token="--primary" display="primary(邊框換色，非額外 ring)" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted" /></Td>
              </tr>
              <tr>
                <Td mono>display</Td>
                <Td>透明（zero-chrome，host context 提供邊界）</Td>
                <Td>透明（無邊框）</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td>—（display 無 placeholder；空值顯 — em-dash fg-muted）</Td>
              </tr>
              <tr>
                <Td mono>readonly</Td>
                <Td><TokenCell token="--bg-readonly" display="bg-readonly(填色標示閱讀區)" /></Td>
                <Td>透明（無可見邊框，靠填色 + padding 區隔）</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td><TokenCell token="--bg-disabled" display="bg-disabled" /></Td>
                <Td>透明（無可見邊框，靠填色區隔）</Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
              </tr>
              <tr>
                <Td mono>error(invalid)</Td>
                <Td><TokenCell token="--surface" display="surface" /></Td>
                <Td><TokenCell token="--error" display="error" /></Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--fg-muted" display="fg-muted" /></Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>所有色彩狀態並排</H3>
        <Desc>直接對照五種 state 的視覺差異。</Desc>
        <div className="grid grid-cols-1 gap-4 max-w-md">
          <div>
            <div className="text-caption text-fg-muted mb-1 font-mono">edit default</div>
            <Textarea rows={2} placeholder="開始輸入..." />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1 font-mono">readonly(底色標示閱讀區)</div>
            <Textarea mode="readonly" rows={2} defaultValue="已送出的意見 — 謝謝您的回饋" />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1 font-mono">disabled</div>
            <Textarea mode="disabled" rows={2} defaultValue="尚未開放編輯" />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1 font-mono">error(invalid)</div>
            <Textarea error rows={2} defaultValue="評論內容違反社群規範" />
          </div>
        </div>
      </div>
    </div>
  ),
}

export const RowsResizeMatrix: Story = {
  name: 'Rows 與 縮放',
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div>
        <H3>rows 控制預設可見行數</H3>
        <Desc>`rows` 決定初始高度——使用者可透過右下角 `resize-y` handle 垂直拖拉調整。</Desc>
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-caption text-fg-muted mb-1 font-mono">rows=2</div>
            <Textarea rows={2} placeholder="短留言..." />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1 font-mono">rows=3(預設)</div>
            <Textarea rows={3} placeholder="詳細描述..." />
          </div>
        </div>
      </div>

      <div>
        <H3>resize-y 垂直可調,水平禁止</H3>
        <Desc>永遠 `resize-y`(使用者可垂直拖大 / 拖小)。**禁止** `resize-x` 或 `resize: both`——水平 resize 破壞 form 佈局。</Desc>
      </div>

      <div>
        <H3>min-h-* 覆寫最小高度</H3>
        <Desc>Consumer 可透過 Tailwind utility 覆寫最小高度(如 `min-h-[120px]`)。</Desc>
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
      <p className="whitespace-pre-line">{"ARIA / 語意:採用原生 <textarea> 元素,自帶完整無障礙語意;搭配 Field 使用時,標籤透過原生 <label for> 與欄位關聯,並補上 aria-invalid / aria-describedby 連到對應的錯誤與說明文字。\n\n鍵盤操作:\n\n- Tab — 聚焦進出欄位\n- 字母鍵 — 輸入文字\n- Enter — 換行(不送出表單,與 Input 不同)\n\n聚焦:聚焦時邊框換成主色,清楚標示目前作用中的欄位。\n\n對比要求:文字對背景對比至少 4.5:1,邊框等介面元素至少 3:1,確保弱視使用者也能辨識。整個欄位不靠滑鼠也能完整操作。"}</p>
    </div>
  ),
}
