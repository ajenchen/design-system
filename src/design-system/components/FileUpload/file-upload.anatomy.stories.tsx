import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FileUpload } from './file-upload'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/FileUpload/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

type StateKey = 'idle' | 'drag-over' | 'disabled'

const STATE_DESC: Record<StateKey, string> = {
  idle: '使用者未互動(預設)',
  'drag-over': '使用者拖檔進入區塊內',
  disabled: 'disabled prop 為 true',
}

// ── Inspector 的「假」state 版本 ── 直接用 data-state 覆寫,避免真的要拖檔才能看
const MockDropzone = ({ state }: { state: StateKey }) => (
  <FileUpload
    data-state={state}
    disabled={state === 'disabled'}
    onUpload={() => {}}
  />
)

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          自建 dropzone — 外層拖放 wrapper + 隱藏 `&lt;input type="file"&gt;` + 預設 icon / title /
          description 三段結構。consumer 可傳 children 整個覆寫內部結構。
        </Desc>
        <div className="max-w-lg">
          <FileUpload onUpload={() => {}} />
        </div>
        <ul className="text-caption text-fg-muted mt-3 list-disc pl-5 space-y-1">
          <li>
            <span className="font-mono">wrapper</span> — dashed border + rounded-md + px-6 py-10,
            `role="button"` + `tabIndex=0`,承載 drag events
          </li>
          <li>
            <span className="font-mono">default children</span> — 消費 <code>&lt;Empty&gt;</code> 元件
            (`../Empty/empty.spec.md` SSOT),icon 走 Empty 的 `Avatar 48px neutral`,
            title `text-body-lg font-medium`,description `text-body`,gap `mb-4` / `mt-0.5`。
            改視覺去 Empty 改,FileUpload 自動跟進。
          </li>
          <li>
            <span className="font-mono">custom children</span> — consumer 傳 children 整個覆寫 Empty,
            自行掌控內部結構(品牌 logo / 自訂排版)
          </li>
          <li>
            <span className="font-mono">&lt;input type="file"&gt;</span> — `hidden`,經由 click /
            Enter / Space 觸發
          </li>
        </ul>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Prop</Th>
                <Th>Type</Th>
                <Th>Default</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              {[
                ['onUpload', '(files: File[]) => void', '—', '使用者選取或拖放檔案時觸發(已經過 accept / maxSize 過濾)'],
                ['onReject', "(files: File[], reason: 'size' | 'type') => void", '—', '被 maxSize / accept 擋下的檔案,consumer 可據此顯示 Toast'],
                ['multiple', 'boolean', 'false', '允許多檔。false 時拖多檔只取第一個(Ant 慣例)'],
                ['accept', 'string', '—', 'MIME filter,支援 .pdf / image/* / application/pdf'],
                ['maxSize', 'number', '—', '單檔最大 bytes;超過進 onReject'],
                ['disabled', 'boolean', 'false', '完全停用(pointer-events-none + cursor-not-allowed)'],
                ['title', 'string', "'Click or drag file here to upload'", '預設結構(Empty)的主標題'],
                ['description', 'string', '單/多檔字串自動切換', '預設結構(Empty)的副標題'],
                ['children', 'ReactNode', '—', '傳入則整個覆寫預設 Empty 結構(consumer 完全客製)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}>
                  <Td mono>{p}</Td>
                  <Td mono>{t}</Td>
                  <Td mono>{d}</Td>
                  <Td>{desc}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const Inspector: Story = {
  name: '元件檢閱器',
  render: function InspectorRender() {
    const [state, setState] = React.useState<StateKey>('idle')
    return (
      <div className="flex flex-col gap-6">
        <div>
          <H3>State 切換</H3>
          <Desc>
            FileUpload 有 3 個 `data-state`:idle / drag-over / disabled。預覽切換狀態後可對照右側
            token 面板。
          </Desc>
          <div className="flex gap-2 mb-4">
            {(['idle', 'drag-over', 'disabled'] as StateKey[]).map((s) => (
              <button
                key={s}
                onClick={() => setState(s)}
                className={`px-3 py-1.5 text-caption rounded-md border ${
                  state === s
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border bg-surface text-foreground hover:bg-neutral-hover'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-caption text-fg-muted mb-2">預覽 ({STATE_DESC[state]})</div>
            <MockDropzone state={state} />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2">Layout + Token 藍圖</div>
            <div className="border border-border rounded-md p-4 text-caption font-mono flex flex-col gap-1">
              <div>wrapper: px-6 py-10 rounded-md border-2 border-dashed</div>
              <div>default children: &lt;Empty icon={'{Upload}'} title description /&gt;</div>
              <div>&nbsp;&nbsp;icon: Avatar 48px neutral (via Empty)</div>
              <div>&nbsp;&nbsp;title: text-body-lg font-medium (via Empty)</div>
              <div>&nbsp;&nbsp;description: text-body (via Empty)</div>
              <div>&nbsp;&nbsp;gaps: mb-4 / mt-0.5 (via Empty)</div>
              <hr className="my-2 border-divider" />
              <div className="flex items-center gap-1.5">
                bg: <TokenCell token={state === 'drag-over' ? '--primary-subtle' : '--surface'} />
              </div>
              <div className="flex items-center gap-1.5">
                border:{' '}
                <TokenCell token={state === 'drag-over' ? '--primary' : '--divider'} />
              </div>
              <div className="flex items-center gap-1.5">
                icon:{' '}
                <TokenCell token={state === 'drag-over' ? '--primary' : '--fg-muted'} />
              </div>
              <div className="flex items-center gap-1.5">
                text(title): <TokenCell token="--foreground" />
              </div>
              <div className="flex items-center gap-1.5">
                text(desc): <TokenCell token="--fg-secondary" />
              </div>
              {state === 'disabled' && (
                <div className="text-error mt-1">+ opacity-disabled + pointer-events-none</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  },
}

export const ColorMatrix: Story = {
  name: '色彩對照',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>State × Token 矩陣</H3>
        <Desc>
          三個狀態的顏色 token 對照。dashed border 在三個狀態下都維持(世界級 dropzone 共識),
          state 差異只落在「color」而不加 scale / shadow(見 spec「不用 color 以外的 state 信號」)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>State</Th>
                <Th>Border</Th>
                <Th>Background</Th>
                <Th>Icon color</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>idle ★default</Td>
                <Td>
                  <TokenCell token="--divider" />
                </Td>
                <Td>
                  <TokenCell token="--surface" />
                </Td>
                <Td>
                  <TokenCell token="--fg-muted" />
                </Td>
                <Td>hover 另加 `bg-neutral-hover`</Td>
              </tr>
              <tr>
                <Td mono>drag-over</Td>
                <Td>
                  <TokenCell token="--primary" />
                </Td>
                <Td>
                  <TokenCell token="--primary-subtle" />
                </Td>
                <Td>
                  <TokenCell token="--primary" />
                </Td>
                <Td>使用者拖檔進入區塊時</Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td>
                  <TokenCell token="--divider" />
                </Td>
                <Td>
                  <TokenCell token="--surface" />
                </Td>
                <Td>
                  <TokenCell token="--fg-muted" />
                </Td>
                <Td>整體套 `opacity-disabled` + `pointer-events-none`</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>視覺預覽</H3>
        <div className="grid grid-cols-1 gap-4 max-w-lg">
          <div>
            <div className="text-caption text-fg-muted mb-2">idle</div>
            <MockDropzone state="idle" />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2">drag-over</div>
            <MockDropzone state="drag-over" />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2">disabled</div>
            <MockDropzone state="disabled" />
          </div>
        </div>
      </div>
    </div>
  ),
}

export const SizeSpec: Story = {
  name: '尺寸(本元件無 size)',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>本元件不提供 `size` 變體</H3>
        <Desc>
          FileUpload 是 self-contained primitive(獨立拖放區),不參與 field-height family。
          內部 padding 固定為 `px-6 py-10`,預設 children 的 icon / title / description 尺寸
          由 Empty 元件 SSOT 擁有(`../Empty/empty.spec.md`)。
          <br />
          <strong>空間大小由 consumer 以 wrapper width / min-height 控制</strong>
          ——如需窄版擺在表單欄位旁,改用小 Button + hidden input 模式
          (見「設計原則 / 何時用大 Dropzone vs 小 Button」)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Token</Th>
                <Th>值</Th>
                <Th>作用</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>px-6</Td>
                <Td mono>24px 左右 padding</Td>
                <Td>固定,不隨 density 變化</Td>
              </tr>
              <tr>
                <Td mono>py-10</Td>
                <Td mono>40px 上下 padding</Td>
                <Td>垂直鬆散感 = 拖放區視覺邀請性</Td>
              </tr>
              <tr>
                <Td mono>default children</Td>
                <Td mono>&lt;Empty /&gt;</Td>
                <Td>icon (Avatar 48px) / title / desc gap 由 Empty SSOT 擁有</Td>
              </tr>
              <tr>
                <Td mono>rounded-md</Td>
                <Td mono>4px</Td>
                <Td>對齊其他 surface 容器</Td>
              </tr>
              <tr>
                <Td mono>border-2</Td>
                <Td mono>2px dashed</Td>
                <Td>dashed 暗示「暫時可放下」(spec 禁止改 solid)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>上傳流程事件</H3>
        <Desc>拖放 / 點擊 / 鍵盤三種觸發路徑,全部匯聚到同一個 `filterAndDispatch`。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>事件</Th>
                <Th>觸發</Th>
                <Th>結果</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>dragenter</Td>
                <Td>檔案拖入區塊</Td>
                <Td>`data-state="drag-over"`(border-primary + bg-primary-subtle)</Td>
              </tr>
              <tr>
                <Td mono>dragleave</Td>
                <Td>檔案拖出區塊</Td>
                <Td>回 `data-state="idle"`</Td>
              </tr>
              <tr>
                <Td mono>drop</Td>
                <Td>放開檔案</Td>
                <Td>filter(accept / maxSize)→ `onUpload(accepted)` + `onReject(rejected, reason)`</Td>
              </tr>
              <tr>
                <Td mono>click / Enter / Space</Td>
                <Td>鍵盤或點擊</Td>
                <Td>觸發隱藏 input → 瀏覽器開檔案選取浮窗</Td>
              </tr>
              <tr>
                <Td mono>change(input)</Td>
                <Td>使用者從浮窗選定檔案</Td>
                <Td>同 drop 的 filter 流程</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>過濾規則</H3>
        <Desc>
          單一檔案同時通過 `accept` 和 `maxSize` 才進 accepted。拒絕原因分 `'size'` / `'type'`
          兩類,consumer 可據此顯示不同錯誤訊息(e.g., Toast「檔案超過 5 MB」vs「不支援此格式」)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀況</Th>
                <Th>進 onUpload</Th>
                <Th>進 onReject</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>通過 accept + maxSize</Td>
                <Td>✓</Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td>超過 maxSize</Td>
                <Td>—</Td>
                <Td mono>reason='size'</Td>
              </tr>
              <tr>
                <Td>不符 accept</Td>
                <Td>—</Td>
                <Td mono>reason='type'</Td>
              </tr>
              <tr>
                <Td>multiple=false 但拖入多檔</Td>
                <Td>只取第一個(其餘靜默忽略)</Td>
                <Td>—</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Disabled 時的行為</H3>
        <Desc>
          disabled 時整塊 `pointer-events-none`——drag / click / Enter / Space 全部無反應,hidden
          input 也帶 `disabled`,避免 screen reader 聚焦。
        </Desc>
      </div>
    </div>
  ),
}
