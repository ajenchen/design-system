// @anatomy-rationale:
//   ColorMatrix represented as ModeMatrix — SelectMenu 是 Internal composite
//     primitive(Popover + Command + MenuItem),本身無色彩變體——容器色彩
//     固定(surface-raised + border + elevation-200 + divider),items 色彩由
//     消費的 MenuItem 決定(見 menu-item.anatomy「State 色彩對照」)。實際決策
//     面向是 4 個功能 flag 的組合(multiple / searchable / creatable / groups)
//     × consumer 場景,由 ModeMatrix(3.)6 種模式對照涵蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Folder, Users, Settings } from 'lucide-react'
import { SelectMenu, type SelectMenuOption, type SelectMenuGroupConfig } from './select-menu'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Internal/SelectMenu/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

type SizeKey = 'sm' | 'md' | 'lg'
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

/* ═══════════════════════════════════════════════════════════════════════════
   Shared options
   ═══════════════════════════════════════════════════════════════════════════ */

const statusOptions: SelectMenuOption[] = [
  { value: 'todo', label: 'To do', description: '尚未開始' },
  { value: 'in_progress', label: 'In progress', description: '進行中' },
  { value: 'in_review', label: 'In review', description: '等待 reviewer' },
  { value: 'done', label: 'Done' },
]

const reviewerOptions: SelectMenuOption[] = [
  { value: 'alice', label: 'Ada Chen', avatar: { alt: 'Ada Chen', color: 'indigo' }, description: 'Frontend' },
  { value: 'bob', label: '張美真', avatar: { alt: '張美真', color: 'magenta' }, description: 'Platform' },
  { value: 'carol', label: '林伯彥', avatar: { alt: '林伯彥', color: 'green' }, description: 'Infra' },
  { value: 'dave', label: '黃怡君', avatar: { alt: '黃怡君', color: 'turquoise' }, description: 'QA' },
]

const labelOptions: SelectMenuOption[] = [
  { value: 'bug', label: 'bug', group: 'type' },
  { value: 'feature', label: 'feature', group: 'type' },
  { value: 'chore', label: 'chore', group: 'type' },
  { value: 'p0', label: 'P0', group: 'priority' },
  { value: 'p1', label: 'P1', group: 'priority' },
  { value: 'p2', label: 'P2', group: 'priority' },
]

const labelGroups: SelectMenuGroupConfig[] = [
  { key: 'type', label: '類型' },
  { key: 'priority', label: '優先度' },
]

/* ═══════════════════════════════════════════════════════════════════════════
   1. Overview
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => {
    const [value, setValue] = useState<string>('in_progress')
    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>Anatomy</H3>
          <Desc>
            SelectMenu 是 Popover + Command + MenuItem 組成的完整下拉選單 primitive。由 Select / Combobox /
            PeoplePicker 消費,App 不直接使用。結構:Popover(浮動)→ Command(搜尋 + 鍵盤導覽)→ CommandList →
            CommandGroup → MenuItem(item 佈局)。
          </Desc>
          <div className="flex items-start gap-4">
            <SelectMenu
              options={statusOptions}
              value={value}
              onValueChange={(v) => setValue(v as string)}
            >
              <Button variant="tertiary">
                {statusOptions.find((o) => o.value === value)?.label ?? '選擇狀態'}
              </Button>
            </SelectMenu>
            <span className="text-caption text-fg-muted">點擊 Button 觸發 SelectMenu</span>
          </div>
        </div>

        <div>
          <H3>結構層</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>層</Th>
                  <Th>角色</Th>
                  <Th>來源</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td mono>Popover</Td>
                  <Td>浮動容器、定位、展開 / 關閉</Td>
                  <Td mono>shadcn Popover</Td>
                </tr>
                <tr>
                  <Td mono>Command</Td>
                  <Td>搜尋過濾 + 鍵盤導覽(↑↓ 移動 / Enter 選取)</Td>
                  <Td mono>cmdk</Td>
                </tr>
                <tr>
                  <Td mono>CommandPrimitive.Input</Td>
                  <Td>搜尋框(raw cmdk input + 自建 wrapper,searchable 模式,高度對齊 field-height)</Td>
                  <Td mono>cmdk</Td>
                </tr>
                <tr>
                  <Td mono>CommandList</Td>
                  <Td>捲動區(自然 fit content;空狀態 minHeight 由 CommandEmpty 撐起)</Td>
                  <Td mono>cmdk</Td>
                </tr>
                <tr>
                  <Td mono>CommandGroup + CommandItem</Td>
                  <Td>分組容器 + 單項</Td>
                  <Td mono>cmdk → 包 MenuItem</Td>
                </tr>
                <tr>
                  <Td mono>MenuItem</Td>
                  <Td>item 佈局(icon/avatar + label + description + checkbox/select indicator)</Td>
                  <Td mono>Menu primitive</Td>
                </tr>
                <tr>
                  <Td mono>CommandEmpty + Empty</Td>
                  <Td>無結果的空狀態</Td>
                  <Td mono>Empty primitive</Td>
                </tr>
                <tr>
                  <Td mono>MenuFooter</Td>
                  <Td>多選時的全選列(footer)</Td>
                  <Td mono>Menu primitive</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>Props 速查(核心)</H3>
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
                <tr>
                  <Td mono>options</Td>
                  <Td mono>SelectMenuOption[]</Td>
                  <Td>—(必填)</Td>
                  <Td>選項清單(value / label / description / icon / avatar / disabled / group)</Td>
                </tr>
                <tr>
                  <Td mono>value</Td>
                  <Td mono>string | string[] | null</Td>
                  <Td mono>undefined</Td>
                  <Td>當前值（單選 string / 多選 string[]）；單 / 多選由 `multiple` prop 決定，非 value 型別</Td>
                </tr>
                <tr>
                  <Td mono>multiple</Td>
                  <Td mono>boolean</Td>
                  <Td mono>false</Td>
                  <Td>多選模式(選中不關閉,顯示全選 footer)</Td>
                </tr>
                <tr>
                  <Td mono>searchable</Td>
                  <Td mono>boolean</Td>
                  <Td mono>false</Td>
                  <Td>顯示搜尋框(選項 {'>'} 5 時建議開啟)</Td>
                </tr>
                <tr>
                  <Td mono>creatable</Td>
                  <Td mono>boolean</Td>
                  <Td mono>false</Td>
                  <Td>無結果時顯示「直接使用「xxx」」option(createLabel 可自訂文案)</Td>
                </tr>
                <tr>
                  <Td mono>groups</Td>
                  <Td mono>SelectMenuGroupConfig[]</Td>
                  <Td mono>undefined</Td>
                  <Td>分組 key + label(options 的 group 欄位對應)</Td>
                </tr>
                <tr>
                  <Td mono>size</Td>
                  <Td mono>'sm' | 'md' | 'lg'</Td>
                  <Td mono>'md'</Td>
                  <Td>影響 MenuItem / searchInput 的高度</Td>
                </tr>
                <tr>
                  <Td mono>minRows</Td>
                  <Td mono>number</Td>
                  <Td mono>3</Td>
                  <Td>list 最少顯示幾行 item 高度(空狀態最小高)</Td>
                </tr>
                <tr>
                  <Td mono>minWidth</Td>
                  <Td mono>number</Td>
                  <Td>跟隨 trigger（下限 240px）</Td>
                  <Td>浮層最小寬度</Td>
                </tr>
                <tr>
                  <Td mono>align</Td>
                  <Td mono>'start' | 'end'</Td>
                  <Td mono>'start'</Td>
                  <Td>相對 trigger 的對齊方向</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Inspector
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => <SelectMenuInspector />,
}

function SelectMenuInspector() {
  const [size, setSize] = useState<SizeKey>('md')
  const [multiple, setMultiple] = useState(false)
  const [searchable, setSearchable] = useState(true)
  const [creatable, setCreatable] = useState(false)
  const [value, setValue] = useState<string | string[]>('in_progress')

  // 切換 multiple 時重置 value
  const handleMultipleChange = (m: boolean) => {
    setMultiple(m)
    setValue(m ? [] : 'in_progress')
  }

  return (
    <div className="grid grid-cols-[1fr_320px] gap-8 max-w-5xl">
      <div className="flex flex-col gap-6">
        <div>
          <H3>即時預覽</H3>
          <div className="flex items-start gap-4">
            <SelectMenu
              options={statusOptions}
              value={value}
              onValueChange={setValue}
              multiple={multiple}
              searchable={searchable}
              creatable={creatable}
              size={size}
              onCreate={(v) => alert(`建立新選項:${v}`)}
            >
              <Button variant="tertiary" size={size}>
                {multiple
                  ? Array.isArray(value) && value.length > 0
                    ? `已選 ${value.length} 項`
                    : '選擇狀態(多選)'
                  : (statusOptions.find((o) => o.value === value)?.label ?? '選擇狀態')}
              </Button>
            </SelectMenu>
            <span className="text-caption text-fg-muted">點擊打開</span>
          </div>
        </div>

        <div>
          <H3>浮層藍圖</H3>
          <div className="border border-divider rounded-md p-4 bg-muted">
            <pre className="text-footnote font-mono text-fg-secondary leading-relaxed whitespace-pre">
{`size=${size}   multiple=${multiple}   searchable=${searchable}   creatable=${creatable}

┌─ Popover (bg-surface-raised · elevation-200 · rounded-lg) ──────────┐
│ ┌─ Command ────────────────────────────────────────────────────┐    │
│ │${searchable ? ' ┌─ CommandInput ───────────────────────────────────────┐ │' : ''}
│ │${searchable ? ' │ [🔍] 搜尋…                                           │ │' : ''}
│ │${searchable ? ' │ min-h = field-height(${size}) + 8px / border-b              │ │' : ''}
│ │${searchable ? ' └─────────────────────────────────────────────────────┘ │' : ''}
│ │ ┌─ CommandList — fit content (empty min-h=field×3+16px) ─┐  │
│ │ │ CommandGroup (p-0 py-2)                                 │  │
│ │ │ ▸ MenuItem size=${size} [checkbox=${multiple}] label + desc       │  │
│ │ │ ▸ MenuItem ...                                           │  │
│ │ └─────────────────────────────────────────────────────────┘  │
│ ${multiple ? '│ ┌─ MenuFooter (border-t) ─────────────────────────────────┐ │' : '│'}
│ ${multiple ? '│ │ [☐] 全部                                                │ │' : '│'}
│ ${multiple ? '│ └─────────────────────────────────────────────────────────┘ │' : '│'}
│ └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘

RowSizeProvider value=${size} 傳遞到所有 item slot (MenuItem / ItemIcon / ItemAvatar 自動讀)`}
            </pre>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <H3>Size</H3>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`px-2.5 py-1 text-caption rounded-md font-mono cursor-pointer ${
                  s === size
                    ? 'bg-primary text-white'
                    : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <H3>Mode</H3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={multiple}
                onChange={(e) => handleMultipleChange(e.target.checked)}
              />
              <span className="font-mono">multiple</span>
            </label>
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={searchable}
                onChange={(e) => setSearchable(e.target.checked)}
              />
              <span className="font-mono">searchable</span>
            </label>
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={creatable}
                onChange={(e) => setCreatable(e.target.checked)}
              />
              <span className="font-mono">creatable</span>
            </label>
          </div>
        </div>

        <div>
          <H3>Inspect</H3>
          <table className="text-caption border-collapse w-full">
            <tbody>
              <tr>
                <Td mono>bg</Td>
                <Td mono>--surface-raised</Td>
              </tr>
              <tr>
                <Td mono>border</Td>
                <Td mono>1px --border</Td>
              </tr>
              <tr>
                <Td mono>radius</Td>
                <Td mono>rounded-lg</Td>
              </tr>
              <tr>
                <Td mono>elevation</Td>
                <Td mono>--elevation-200</Td>
              </tr>
              <tr>
                <Td mono>sideOffset</Td>
                <Td mono>8px</Td>
              </tr>
              <tr>
                <Td mono>input border</Td>
                <Td mono>border-b --divider</Td>
              </tr>
              <tr>
                <Td mono>footer border</Td>
                <Td mono>border-t --divider</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. ModeMatrix — 元件特有(取代 ColorMatrix,見 spec「為何無 ColorMatrix」)
   ═══════════════════════════════════════════════════════════════════════════ */

export const ModeMatrix: Story = {
  name: '功能模式對照表',
  render: () => {
    const [single, setSingle] = useState<string>('todo')
    const [multi, setMulti] = useState<string[]>(['bug'])
    const [search, setSearch] = useState<string>('')
    const [multiSearch, setMultiSearch] = useState<string[]>([])
    const [grouped, setGrouped] = useState<string[]>(['bug', 'p0'])
    const [creatable, setCreatable] = useState<string[]>([])
    const [createdOptions, setCreatedOptions] = useState<string[]>([])

    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>功能組合矩陣</H3>
          <Desc>
            SelectMenu 的核心決策面向不是色彩,而是四個功能 flag 的組合:
            <code className="font-mono text-footnote mx-1">multiple</code> /
            <code className="font-mono text-footnote mx-1">searchable</code> /
            <code className="font-mono text-footnote mx-1">creatable</code> /
            <code className="font-mono text-footnote mx-1">groups</code>。每個組合對應不同 consumer 場景。
          </Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>模式</Th>
                  <Th>multiple</Th>
                  <Th>searchable</Th>
                  <Th>creatable</Th>
                  <Th>groups</Th>
                  <Th>典型 consumer</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Simple single select</Td>
                  <Td mono>false</Td>
                  <Td mono>false</Td>
                  <Td mono>false</Td>
                  <Td mono>—</Td>
                  <Td>Select(小清單固定選項,如 status)</Td>
                </tr>
                <tr>
                  <Td>Searchable single select</Td>
                  <Td mono>false</Td>
                  <Td mono>true</Td>
                  <Td mono>false</Td>
                  <Td mono>—</Td>
                  <Td>Country picker / assignee 單選</Td>
                </tr>
                <tr>
                  <Td>Multi with select-all</Td>
                  <Td mono>true</Td>
                  <Td mono>false</Td>
                  <Td mono>false</Td>
                  <Td mono>—</Td>
                  <Td>Combobox(類別多選)</Td>
                </tr>
                <tr>
                  <Td>Searchable multi</Td>
                  <Td mono>true</Td>
                  <Td mono>true</Td>
                  <Td mono>false</Td>
                  <Td mono>—</Td>
                  <Td>PeoplePicker(reviewer 多選)</Td>
                </tr>
                <tr>
                  <Td>Creatable multi</Td>
                  <Td mono>true</Td>
                  <Td mono>true</Td>
                  <Td mono>true</Td>
                  <Td mono>—</Td>
                  <Td>Tag input / 允許邀請外部成員</Td>
                </tr>
                <tr>
                  <Td>Grouped multi</Td>
                  <Td mono>true</Td>
                  <Td mono>true</Td>
                  <Td mono>false</Td>
                  <Td mono>✓</Td>
                  <Td>Issue labels(type / priority 分組)</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>六種模式實例</H3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-w-4xl">
            <div className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">Simple single</span>
              <SelectMenu options={statusOptions} value={single} onValueChange={(v) => setSingle(v as string)}>
                <Button variant="tertiary" size="md">
                  {statusOptions.find((o) => o.value === single)?.label}
                </Button>
              </SelectMenu>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">Searchable single</span>
              <SelectMenu
                options={reviewerOptions}
                value={search}
                onValueChange={(v) => setSearch(v as string)}
                searchable
              >
                <Button variant="tertiary" size="md">
                  {search ? reviewerOptions.find((o) => o.value === search)?.label : '選擇 reviewer'}
                </Button>
              </SelectMenu>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">Multi + select-all</span>
              <SelectMenu
                options={labelOptions.filter((o) => o.group === 'type')}
                value={multi}
                onValueChange={(v) => setMulti(v as string[])}
                multiple
              >
                <Button variant="tertiary" size="md">
                  已選 {multi.length} 項
                </Button>
              </SelectMenu>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">Searchable multi</span>
              <SelectMenu
                options={reviewerOptions}
                value={multiSearch}
                onValueChange={(v) => setMultiSearch(v as string[])}
                multiple
                searchable
              >
                <Button variant="tertiary" size="md">
                  Reviewer {multiSearch.length > 0 ? `(${multiSearch.length})` : ''}
                </Button>
              </SelectMenu>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">Creatable multi</span>
              <SelectMenu
                options={[
                  { value: 'bug', label: 'bug' },
                  { value: 'feature', label: 'feature' },
                  ...createdOptions.map((v) => ({ value: v, label: v })),
                ]}
                value={creatable}
                onValueChange={(v) => setCreatable(v as string[])}
                multiple
                searchable
                creatable
                onCreate={(v) => {
                  setCreatedOptions((prev) => [...prev, v])
                  setCreatable((prev) => [...prev, v])
                }}
              >
                <Button variant="tertiary" size="md">
                  Tags {creatable.length > 0 ? `(${creatable.length})` : ''}
                </Button>
              </SelectMenu>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-footnote text-fg-muted font-mono">Grouped multi</span>
              <SelectMenu
                options={labelOptions}
                groups={labelGroups}
                value={grouped}
                onValueChange={(v) => setGrouped(v as string[])}
                multiple
                searchable
              >
                <Button variant="tertiary" size="md">
                  Labels ({grouped.length})
                </Button>
              </SelectMenu>
            </div>
          </div>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. SizeMatrix
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => {
    const [sm, setSm] = useState<string>('todo')
    const [md, setMd] = useState<string>('todo')
    const [lg, setLg] = useState<string>('todo')
    const byKey: Record<SizeKey, [string, (v: string) => void]> = {
      sm: [sm, setSm],
      md: [md, setMd],
      lg: [lg, setLg],
    }

    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>Size token 對照</H3>
          <Desc>
            size 傳遞到浮層內的 CommandInput / MenuItem,三者統一尺寸。RowSizeProvider 確保所有 slot 自動讀取正確
            size,不需在每個 item 重設。size prop 決定 tier(sm/md/lg);實際像素隨 page density(2026-06-15:
            PopoverContent 改鎖 `layout-space=md`、ui-size 繼承 page → 下拉項目跟觸發點 / 頁面 density 一致,
            不再被鎖死 md-scale)。下表為 md page 的 field-height 值。
          </Desc>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead>
                <tr>
                  <Th>Size</Th>
                  <Th>Search input min-h</Th>
                  <Th>Search font</Th>
                  <Th>Search icon</Th>
                  <Th>MenuItem field</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td mono>sm</Td>
                  <Td mono>calc(--field-height-sm + 8px) · 36px</Td>
                  <Td mono>text-body · 14px</Td>
                  <Td mono>16px</Td>
                  <Td mono>--field-height-sm · 28px</Td>
                </tr>
                <tr>
                  <Td mono>md</Td>
                  <Td mono>calc(--field-height-md + 8px) · 40px</Td>
                  <Td mono>text-body · 14px</Td>
                  <Td mono>16px</Td>
                  <Td mono>--field-height-md · 32px</Td>
                </tr>
                <tr>
                  <Td mono>lg</Td>
                  <Td mono>calc(--field-height-lg + 8px) · 44px</Td>
                  <Td mono>text-body-lg · 16px</Td>
                  <Td mono>20px</Td>
                  <Td mono>--field-height-lg · 36px</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <H3>三 size 實例</H3>
          <div className="flex flex-col gap-4">
            {SIZES.map((s) => {
              const [v, setV] = byKey[s]
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-caption text-fg-muted font-mono w-8">{s}</span>
                  <SelectMenu
                    options={statusOptions}
                    value={v}
                    onValueChange={(nv) => setV(nv as string)}
                    size={s}
                    searchable
                  >
                    <Button variant="tertiary" size={s}>
                      {statusOptions.find((o) => o.value === v)?.label}
                    </Button>
                  </SelectMenu>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. StateBehavior
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => {
    const [empty, setEmpty] = useState<string[]>([])
    const [grouped, setGrouped] = useState<string[]>([])

    return (
      <div className="flex flex-col gap-10">
        <div>
          <H3>搜尋 empty state</H3>
          <Desc>
            搜尋無結果時顯示 Empty primitive,以 flex items-center justify-center + minHeight 撐高並垂直水平置中。
            Creatable 模式會額外顯示「建立 xxx」option。
          </Desc>
          <div className="flex items-center gap-4">
            <SelectMenu options={reviewerOptions} value="" onValueChange={() => {}} searchable>
              <Button variant="tertiary" size="md">
                點擊後搜尋不存在的字(如 "zzz")
              </Button>
            </SelectMenu>
          </div>
        </div>

        <div>
          <H3>多選 footer「全部」三態</H3>
          <Desc>
            多選時 footer 顯示全選 checkbox。狀態:全空(false)→ 部分(indeterminate)→ 全選(true)。
            有搜尋文字時 footer 隱藏(搜尋中「全選」沒意義)。
          </Desc>
          <div className="flex items-center gap-4">
            <SelectMenu
              options={labelOptions.filter((o) => o.group === 'priority')}
              value={empty}
              onValueChange={(v) => setEmpty(v as string[])}
              multiple
            >
              <Button variant="tertiary" size="md">
                優先度 ({empty.length})
              </Button>
            </SelectMenu>
            <span className="text-caption text-fg-muted">→ 勾選時 footer 進 indeterminate / all</span>
          </div>
        </div>

        <div>
          <H3>分組 + selected 狀態</H3>
          <Desc>
            groups prop 開啟時,CommandGroup 顯示 header(用 MenuItem header mode),不同 group 間用
            CommandSeparator 分隔。單選時已選項顯示 selected 背景;多選時用 checkbox 指示。
          </Desc>
          <div className="flex items-center gap-4">
            <SelectMenu
              options={labelOptions}
              groups={labelGroups}
              value={grouped}
              onValueChange={(v) => setGrouped(v as string[])}
              multiple
              searchable
            >
              <Button variant="tertiary" size="md">
                Labels ({grouped.length})
              </Button>
            </SelectMenu>
          </div>
        </div>

        <div>
          <H3>Disabled option</H3>
          <Desc>
            option.disabled=true 時進 disabled 狀態(MenuItem disabled 樣式),鍵盤導覽會跳過。
          </Desc>
          <div className="flex items-center gap-4">
            <SelectMenu
              options={[
                { value: 'free', label: 'Free plan' },
                { value: 'pro', label: 'Pro plan' },
                { value: 'business', label: 'Business plan', disabled: true, description: '需 admin 邀請' },
                { value: 'enterprise', label: 'Enterprise', disabled: true, description: '聯繫業務取得報價' },
              ]}
              value="free"
              onValueChange={() => {}}
            >
              <Button variant="tertiary" size="md">
                Free plan
              </Button>
            </SelectMenu>
          </div>
        </div>

        <div>
          <H3>Icon / Avatar / Settings option</H3>
          <Desc>option 支援 icon(LucideIcon)或 avatar(AvatarData)prefix,由 MenuItem 統一渲染。</Desc>
          <div className="flex items-center gap-4">
            <SelectMenu
              options={[
                { value: 'mail', label: 'Email 設定', icon: Mail, description: '通知 / 訂閱管理' },
                { value: 'folder', label: '檔案權限', icon: Folder },
                { value: 'users', label: '成員管理', icon: Users, description: 'Workspace 成員與角色' },
                { value: 'settings', label: '一般設定', icon: Settings },
              ]}
              value="mail"
              onValueChange={() => {}}
              searchable
            >
              <Button variant="tertiary" size="md">
                設定項目
              </Button>
            </SelectMenu>
          </div>
        </div>
      </div>
    )
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `select-menu.spec.md` 「A11y 預設」段。摘要:\n\n  ARIA / Pattern  :基於  cmdk  library a11y(combobox / listbox / option role + aria-activedescendant)。詳 [cmdk a11y](https://cmdk.paco.me/#accessibility)。\n\n  Keyboard 行為  :\n\n- Tab — focus trigger\n- Enter / Space — 開啟 menu(trigger 由 consumer 經 PopoverTrigger asChild 提供:Select / Combobox 的 trigger 是 role=\"combobox\" 容器自綁 Enter / Space handler;若 consumer 用 DS Button 則由 native click 觸發)\n- ↑/↓ — 導覽 options(menu 開啟後)\n- Enter — 選擇\n- 字母鍵 — type-ahead 過濾(search 模式)\n- Esc — 關閉\n\n  Focus  :menu 開啟時 active-descendant 虛擬焦點落在第一個 / 已選 option(aria-activedescendant 高亮,非 DOM focus);searchable 時 DOM focus 給搜尋 input;option 無 tabIndex,DOM focus 不落在 option 上。關閉時 focus 回 trigger。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}
