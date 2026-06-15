import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Folder, FileText, Image, Users, User, Pencil, Trash2 } from 'lucide-react'
import { TreeView, TreeItem } from './tree-view'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/TreeView/設計規格',
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
        <Desc>TreeView 是**階層結構的遞迴元件**——一個 TreeItem 就是一個 node,有 children 就可展開,沒有就是 leaf。基於 Radix Collapsible 實作展開/收合,自建 tree 結構 + ARIA tree 鍵盤導覽(Radix 沒有 Tree primitive)。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <TreeView defaultExpandedIds={['docs', 'photos']}>
            <TreeItem id="docs" label="Documents" icon={Folder}>
              <TreeItem id="resume" label="Resume.pdf" icon={FileText} />
              <TreeItem id="photos" label="Photos" icon={Folder}>
                <TreeItem id="beach" label="beach.jpg" icon={Image} />
                <TreeItem id="trip" label="trip.jpg" icon={Image} />
              </TreeItem>
            </TreeItem>
            <TreeItem id="downloads" label="Downloads" icon={Folder}>
              <TreeItem id="installer" label="installer.dmg" icon={FileText} />
            </TreeItem>
          </TreeView>
        </div>
      </div>

      <div>
        <H3>TreeItem 內部結構</H3>
        <Desc>[chevron placeholder] [icon?] [label] [suffix? (hover inline action / badge)] ——遵循 item-layout pattern。葉節點(無 children)自動填入透明 chevron placeholder 保持 column 對齊。</Desc>
      </div>

      <div>
        <H3>TreeView 的三項職責(不超出此範圍)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>職責</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td>1. 遞迴渲染 + indent</Td><Td mono>indentStep = chevronSize + gap-2(跟 item-layout 一致)</Td></tr>
              <tr><Td>2. 展開 / 收合狀態管理</Td><Td>TreeView 自管 expand state(受控 expandedIds / 非受控 defaultExpandedIds);Radix Collapsible 僅負責子節點高度動畫</Td></tr>
              <tr><Td>3. 鍵盤導覽 + ARIA tree</Td><Td>↑↓ 移動 / → 展開 / ← 收合 / Enter 選取</Td></tr>
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
              {[
                ['TreeView', '', '', ''],
                ['  selectedIds', 'Set<string>', '—', '選取的 node id(受控)'],
                ['  onSelectedChange', '(ids: Set<string>) => void', '—', '選取變更 callback'],
                ['  selectionMode', "'single' | 'multiple' | 'none'", "'single'", "multiple 模式自動顯示 checkbox;none=純展開展示不可選(JSON viewer)"],
                ['  expandedIds / onExpandedChange', 'Set<string> / handler', '—', '展開狀態受控'],
                ['  defaultExpandedIds', 'string[]', '—', '初始展開(uncontrolled)'],
                ['  draggable / onDragEnd', 'boolean / handler', 'false', '拖曳重排'],
                ['  size', "'sm' | 'md' | 'lg'", "'md'", 'font-size tier'],
                ['TreeItem', '', '', ''],
                ['  id', 'string', '必填', '唯一識別碼'],
                ['  label', 'ReactNode', '必填', 'node 名稱'],
                ['  icon', 'LucideIcon', '—', 'Prefix icon(資料夾 / 檔案類型)'],
                ['  checkbox', 'ReactNode', '—', 'multiple 模式 selection checkbox(通常自動帶入)'],
                ['  inlineActions', 'InlineActionConfig[]', '—', '右側 inline actions(宣告式 config,內部用 <ItemInlineAction> 渲染)'],
                ['  inlineActionsSlot', 'ReactNode', '—', 'escape-hatch slot(放自訂元素,跟 inlineActions 互斥)'],
                ['  disabled', 'boolean', 'false', '停用該 node'],
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


// ── Inspector ─────────────────────────────────────────────────────────────

interface InspectorArgs {
  size: 'sm' | 'md' | 'lg'
  context: 'sidebar' | 'menu'
  selectionMode: 'single' | 'multiple' | 'none'
  expandOnSelect: boolean
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story:
          '右側 Controls 切 TreeView props 即時 render,取代 Figma inspect。切 `size` 看 row height tier 與 indentStep(sm/md=24 / lg=28);切 `context` 看水平 padding 差異(sidebar=16px / menu=12px);切 `selectionMode` 觀察單選 / 多選互動差異。使用真實的 Engineering 團隊檔案樹。',
      },
    },
  },
  args: {
    size: 'md',
    context: 'sidebar',
    selectionMode: 'single',
    expandOnSelect: false,
  },
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'sm=Dialog / Sidebar dense / md★default / lg=閱讀舒適(doc outline)',
    },
    context: {
      control: 'radio',
      options: ['sidebar', 'menu'],
      description: 'sidebar=頁面側邊欄(layout-space-loose)/ menu=浮層(px-3 對齊 MenuItem)',
    },
    selectionMode: {
      control: 'radio',
      options: ['single', 'multiple', 'none'],
      description: 'single=sidebar nav / multiple=批次選取 / none=純展示',
    },
    expandOnSelect: {
      control: 'boolean',
      description: '點 label 同時展開 children(預設 false,chevron 是展開的唯一控件)',
    },
  },
  render: (args) => {
    const { size, context, selectionMode, expandOnSelect } = args as InspectorArgs
    return (
      <div className="border border-border rounded-lg p-4 max-w-md">
        <TreeView
          size={size}
          context={context}
          selectionMode={selectionMode}
          expandOnSelect={expandOnSelect}
          defaultExpandedIds={['src', 'components']}
          defaultSelectedIds={['button']}
          aria-label="Project file tree"
        >
          <TreeItem id="src" label="src" icon={Folder}>
            <TreeItem id="components" label="components" icon={Folder}>
              <TreeItem id="button" label="Button.tsx" icon={FileText} />
              <TreeItem id="input" label="Input.tsx" icon={FileText} />
              <TreeItem id="avatar" label="Avatar.tsx" icon={FileText} />
            </TreeItem>
            <TreeItem id="hooks" label="hooks" icon={Folder}>
              <TreeItem id="use-theme" label="useTheme.ts" icon={FileText} />
            </TreeItem>
            <TreeItem id="assets" label="assets" icon={Folder}>
              <TreeItem id="logo" label="logo.svg" icon={Image} />
            </TreeItem>
          </TreeItem>
          <TreeItem id="docs" label="docs" icon={Folder}>
            <TreeItem id="readme" label="README.md" icon={FileText} />
          </TreeItem>
        </TreeView>
      </div>
    )
  },
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種 Size — 對齊 item-layout row-height tier</H3>
        <Desc>
          TreeView 的 size 傳給每個 TreeItem,決定 row 高度 / 字體 / icon 尺寸。對齊 item-layout
          pattern(MenuItem / SidebarMenuButton 用同一套 tier),tree indent 公式也跟著調整。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>Row 高度</Th>
                <Th>字體</Th>
                <Th>Icon size</Th>
                <Th>indentStep</Th>
                <Th>使用場景</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>sm</Td><Td mono>h-field-sm</Td><Td mono>text-body</Td><Td mono>16px</Td><Td mono>24px(chevron + gap-2)</Td><Td>Sidebar / Dialog 內 dense tree</Td></tr>
              <tr><Td mono>md ★default</Td><Td mono>h-field-md</Td><Td mono>text-body</Td><Td mono>16px</Td><Td mono>24px</Td><Td>一般檔案瀏覽器、設定樹</Td></tr>
              <tr><Td mono>lg</Td><Td mono>h-field-lg</Td><Td mono>text-body-lg</Td><Td mono>20px</Td><Td mono>28px(chevron + gap-2)</Td><Td>需閱讀舒適的場景(doc outline)</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-6">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size} className="border border-dashed border-divider rounded-md p-4 max-w-md">
              <div className="text-caption text-fg-muted mb-2 font-mono">size="{size}"</div>
              <TreeView size={size} defaultExpandedIds={['docs', 'photos']}>
                <TreeItem id="docs" label="Documents" icon={Folder}>
                  <TreeItem id="resume" label="Resume.pdf" icon={FileText} />
                  <TreeItem id="photos" label="Photos" icon={Folder}>
                    <TreeItem id="beach" label="beach.jpg" icon={Image} />
                  </TreeItem>
                </TreeItem>
              </TreeView>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set(['beach']))
    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>Row 四態色彩 Token</H3>
          <Desc>
            TreeItem 每一行的色彩沿用列表項目的「選取 / 狀態視覺規則」——樹、選單、側邊欄共用同一套狀態色彩,
            這樣使用者在不同地方看到的 hover、選取效果都一致。
          </Desc>
          <div className="overflow-x-auto mb-4">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>狀態</Th>
                  <Th>Row bg</Th>
                  <Th>Text</Th>
                  <Th>Icon / Chevron</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td mono>default</Td>
                  <Td>—(transparent)</Td>
                  <Td><TokenCell token="--fg-secondary" display="fg-secondary(muted)" /></Td>
                  <Td>icon 跟 label 同色;chevron <TokenCell token="--fg-muted" display="fg-muted" /></Td>
                </tr>
                <tr>
                  <Td mono>hover</Td>
                  <Td><TokenCell token="--neutral-hover" display="neutral-hover" /></Td>
                  <Td><TokenCell token="--foreground" display="foreground" /></Td>
                  <Td>icon 隨 label 變 foreground;chevron 不變(hover chevron 本身才變)</Td>
                </tr>
                <tr>
                  <Td mono>selected(single)</Td>
                  <Td><TokenCell token="--neutral-selected" display="neutral-selected" /></Td>
                  <Td><TokenCell token="--foreground" display="foreground" /></Td>
                  <Td>icon 隨 label;chevron 不變(multi mode text / bg 皆不變,信號在 checkbox)</Td>
                </tr>
                <tr>
                  <Td mono>disabled</Td>
                  <Td>—</Td>
                  <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
                  <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-footnote text-fg-muted mt-3">
            selected 用 `--neutral-selected`(不是 primary 色)——tree 的選取是「當前導航位置」的標記,
            不是「重要強調項」。用 primary 會讓使用者誤以為是可互動操作。
          </p>
        </div>

        <div>
          <H3>Hover + Selected 並存的實際渲染</H3>
          <Desc>以下 `Documents/Photos/beach.jpg` 為 selected row,可 hover 任一其他 row 觀察 neutral-hover。</Desc>
          <div className="border border-border rounded-lg p-4 max-w-md">
            <TreeView selectedIds={selected} onSelectedChange={setSelected} defaultExpandedIds={['docs', 'photos']}>
              <TreeItem id="docs" label="Documents(hover 試試)" icon={Folder}>
                <TreeItem id="resume" label="Resume.pdf" icon={FileText} />
                <TreeItem id="photos" label="Photos" icon={Folder}>
                  <TreeItem id="beach" label="beach.jpg(selected)" icon={Image} />
                  <TreeItem id="trip" label="trip.jpg" icon={Image} />
                </TreeItem>
              </TreeItem>
            </TreeView>
          </div>
        </div>
      </div>
    )
  },
}

export const IndentMatrix: Story = {
  name: '縮排與樹狀導引',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>indentStep = chevronSize + gap-2</H3>
        <Desc>每層 indent 剛好是 chevron(16 / 20px)+ gap-2(8px)的距離——跟 item-layout 的 prefix-content gap 一致。讓 tree indent 視覺跟 item-layout 融為一體,不是獨立數字系統。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <TreeView defaultExpandedIds={['l1', 'l2', 'l3']}>
            <TreeItem id="l1" label="L1 (depth 0)" icon={Folder}>
              <TreeItem id="l2" label="L2 (depth 1)" icon={Folder}>
                <TreeItem id="l3" label="L3 (depth 2)" icon={Folder}>
                  <TreeItem id="l4" label="L4 (depth 3)" icon={FileText} />
                </TreeItem>
              </TreeItem>
            </TreeItem>
          </TreeView>
        </div>
      </div>

      <div>
        <H3>葉節點 chevron placeholder</H3>
        <Desc>同層有展開 icon、有的沒有 → label 不會對齊。TreeView 自動給葉節點留透明 chevron placeholder,label 永遠對齊 column。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <TreeView defaultExpandedIds={['folder']}>
            <TreeItem id="folder" label="Folder(可展開)" icon={Folder}>
              <TreeItem id="leaf-1" label="Leaf 1(無 children)" icon={FileText} />
              <TreeItem id="folder-2" label="Folder 2(可展開)" icon={Folder} />
              <TreeItem id="leaf-3" label="Leaf 3(無 children)" icon={FileText} />
            </TreeItem>
          </TreeView>
        </div>
        <p className="text-footnote text-fg-muted mt-3">↑ 葉 / 資料夾 label 左側對齊 — 不會因有無 chevron 位移</p>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set(['resume']))
    return (
      <div className="flex flex-col gap-8">
        <div>
          <H3>Selected vs Expanded 語意分離</H3>
          <Desc>Chevron 負責展開/收合,label 負責選取——兩者獨立(除非 consumer 顯式 opt-in `expandOnSelect`)。世界級 tree 的共識(VS Code / Finder / Linear)。</Desc>
          <div className="border border-border rounded-lg p-4 max-w-md">
            <TreeView selectedIds={selected} onSelectedChange={setSelected} defaultExpandedIds={['docs', 'photos']}>
              <TreeItem id="docs" label="Documents(可點展開)" icon={Folder}>
                <TreeItem id="resume" label="Resume.pdf(選取中)" icon={FileText} />
                <TreeItem id="photos" label="Photos(可點展開)" icon={Folder}>
                  <TreeItem id="beach" label="beach.jpg" icon={Image} />
                </TreeItem>
              </TreeItem>
            </TreeView>
          </div>
          <p className="text-footnote text-fg-muted mt-3">↑ 點 chevron 只展開 / 點 label 只選取,兩個獨立互動區</p>
        </div>

        <div>
          <H3>Hover inline actions(suffix)</H3>
          <Desc>hover node 時 suffix 顯示 inline action(重新命名、刪除等)。non-hover 時 suffix 隱藏。</Desc>
          <div className="border border-border rounded-lg p-4 max-w-md">
            <TreeView defaultExpandedIds={['eng', 'frontend']}>
              <TreeItem id="eng" label="Engineering" icon={Users}>
                <TreeItem id="frontend" label="Frontend" icon={Users}>
                  <TreeItem
                    id="alice"
                    label="Alice"
                    icon={User}
                    inlineActions={[
                      { icon: Pencil, label: '重新命名', onClick: () => {} },
                      { icon: Trash2, label: '刪除', onClick: () => {} },
                    ]}
                  />
                  <TreeItem
                    id="bob"
                    label="Bob"
                    icon={User}
                    inlineActions={[
                      { icon: Pencil, label: '重新命名', onClick: () => {} },
                      { icon: Trash2, label: '刪除', onClick: () => {} },
                    ]}
                  />
                </TreeItem>
              </TreeItem>
            </TreeView>
          </div>
        </div>
      </div>
    )
  },
}

export const KeyboardMatrix: Story = {
  name: '鍵盤導覽（ARIA tree）',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>鍵盤操作對照</H3>
        <Desc>TreeView 的 ARIA tree 鍵盤導覽是自建實作(Radix 沒有 Tree primitive)。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>按鍵</Th><Th>行為</Th></tr></thead>
            <tbody>
              <tr><Td mono>↑ / ↓</Td><Td>在可見 nodes 之間移動焦點(跳過已收合的 children)</Td></tr>
              <tr><Td mono>→</Td><Td>若 collapsed 則展開;若 expanded 則移到第一個 child</Td></tr>
              <tr><Td mono>←</Td><Td>若 expanded 則收合;若 collapsed 或 leaf 則移到 parent</Td></tr>
              <tr><Td mono>Enter / Space</Td><Td>選取當前 focus 的 node</Td></tr>
              <tr><Td mono>Home / End</Td><Td>跳到第一個 / 最後一個可見 node</Td></tr>
            </tbody>
          </table>
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
      <p className="whitespace-pre-line">{"TreeView 的無障礙是元件自建的,不是沿用第三方套件的預設。\n\n  角色與屬性  :外層容器標記為 role=\"tree\",每個節點標記為 role=\"treeitem\",並逐一寫上目前展開狀態、是否選取、所在層級;多選時容器再加上「允許多選」標記。展開/收合的動畫是借用 Radix Collapsible,但樹的角色、屬性、鍵盤導覽都是元件自己實作的(Radix 沒有 Tree 元件)。\n\n  鍵盤操作  :\n\n- Tab — 焦點進入整棵樹\n- 上 / 下 — 在可見節點之間移動\n- 右 — 展開資料夾,已展開時移到第一個子節點\n- 左 — 收合資料夾,葉節點時跳回上層\n- Home / End — 跳到第一個 / 最後一個可見節點\n- Enter / 空白鍵 — 選取目前節點\n\n  焦點  :焦點由元件自己管理——整棵樹是單一 Tab 停靠點,鍵盤移動時用一圈內描邊高亮(ring-2 ring-ring)標示目前位置。沒有焦點鎖定、也沒有焦點還原,因為樹不是浮層。\n\n  驗證  :Storybook a11y 面板應為 0 項嚴重問題;不靠滑鼠也能完整操作。文字對比度達 WCAG AA(內文 4.5:1、介面元素 3:1)。"}</p>
    </div>
  ),
}
