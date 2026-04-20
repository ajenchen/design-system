import type { Meta, StoryObj } from '@storybook/react'
import { PeoplePicker } from './people-picker'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/PeoplePicker/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const SAMPLE_PEOPLE = [
  { name: '陳麒仁', avatarUrl: 'https://i.pravatar.cc/80?img=1' },
  { name: 'Alice Wang', avatarUrl: 'https://i.pravatar.cc/80?img=5' },
  { name: 'Bob Chen', avatarUrl: 'https://i.pravatar.cc/80?img=12' },
  { name: 'Diana Lin', avatarUrl: 'https://i.pravatar.cc/80?img=20' },
]

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>PeoplePicker 是組合元件——Popover(浮層)+ Command(cmdk 搜尋)+ SelectMenu(選單)+ PersonDisplay(Avatar + Name)。外觀對齊 Select / Combobox,差異在選項前綴有 Avatar 視覺。</Desc>
        <div className="max-w-md border border-border rounded-lg p-4">
          <PeoplePicker
            people={SAMPLE_PEOPLE}
            value={SAMPLE_PEOPLE[0]}
            onChange={() => {}}
          />
        </div>
      </div>

      <div>
        <H3>單選 vs 多選</H3>
        <Desc>透過 `value` prop 的類型決定:`PersonValue | null`(單選)或 `PersonValue[]`(多選)。多選 field 顯示 Avatar 陣列(同 Combobox)。</Desc>
        <div className="flex flex-col gap-3 max-w-md">
          <div>
            <div className="text-caption text-fg-muted mb-2">單選(assignee 場景)</div>
            <PeoplePicker
              people={SAMPLE_PEOPLE}
              value={SAMPLE_PEOPLE[0]}
              onChange={() => {}}
            />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2">多選(reviewers 場景)</div>
            <PeoplePicker
              people={SAMPLE_PEOPLE}
              value={[SAMPLE_PEOPLE[0], SAMPLE_PEOPLE[1]]}
              onChange={() => {}}
            />
          </div>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['mode', "'edit' | 'readonly' | 'disabled'", "'edit'", 'Field mode'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '對齊 field-height tier'],
                ['value', 'PersonValue | PersonValue[] | null', '—', '單選 / 多選(類型決定模式)'],
                ['onChange', '(value: PersonValue[]) => void', '—', '值變更 callback'],
                ['people', 'PersonValue[]', '[]', '可選人員清單(dropdown 顯示)'],
                ['searchPlaceholder', 'string', "'搜尋人員…'", '搜尋框 placeholder'],
                ['emptyText', 'string', "'沒有符合的人員'", '空結果提示'],
                ['disabled', 'boolean', 'false', '停用'],
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

export const ModeMatrix: Story = {
  name: 'Mode 對照',
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      <div>
        <H3>edit(預設)</H3>
        <Desc>Field 樣式 + 展開觸發 Popover + Command 搜尋。</Desc>
        <PeoplePicker people={SAMPLE_PEOPLE} value={SAMPLE_PEOPLE[0]} onChange={() => {}} />
      </div>
      <div>
        <H3>readonly</H3>
        <Desc>顯示選中人員(Avatar + Name),無 dropdown trigger、無搜尋。</Desc>
        <PeoplePicker mode="readonly" people={SAMPLE_PEOPLE} value={SAMPLE_PEOPLE[0]} />
      </div>
      <div>
        <H3>disabled</H3>
        <PeoplePicker mode="disabled" people={SAMPLE_PEOPLE} value={SAMPLE_PEOPLE[0]} />
      </div>
      <div>
        <H3>readonly(empty)</H3>
        <PeoplePicker mode="readonly" people={SAMPLE_PEOPLE} value={null} />
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: 'Size 對照(sm / md / lg)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種 Size — 對齊 field-height tier</H3>
        <Desc>
          PeoplePicker 作為 Field Control,高度對齊 `--field-height-*` tier(sm=28/32、md=32/36、lg=36/40
          density-aware)。Avatar 尺寸跟 icon 尺寸依 tier 變化,保持視覺重量均衡。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>Field 高度</Th>
                <Th>內部 Avatar</Th>
                <Th>Icon(Chevron)</Th>
                <Th>字體</Th>
                <Th>使用場景</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>sm</Td><Td mono>h-field-sm</Td><Td mono>20px</Td><Td mono>16px</Td><Td mono>text-body</Td><Td>Dense filter bar、DataTable cell edit</Td></tr>
              <tr><Td mono>md ★default</Td><Td mono>h-field-md</Td><Td mono>24px</Td><Td mono>16px</Td><Td mono>text-body</Td><Td>一般表單、assignee picker</Td></tr>
              <tr><Td mono>lg</Td><Td mono>h-field-lg</Td><Td mono>28px</Td><Td mono>20px</Td><Td mono>text-body-lg</Td><Td>主要 CTA form、onboarding</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-6 max-w-md">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size}>
              <div className="text-caption text-fg-muted mb-2 font-mono">size="{size}" — assignee picker</div>
              <PeoplePicker
                size={size}
                people={SAMPLE_PEOPLE}
                value={SAMPLE_PEOPLE[0]}
                onChange={() => {}}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照(field border / avatar / dropdown 狀態)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Field Control 色彩(對齊 Input / Select 同一套)</H3>
        <Desc>
          PeoplePicker 的 field 外觀跟 Select / Combobox 完全一致——共用 `fieldWrapperStyles`。差別只在
          prefix 多出 Avatar 視覺。所有 field-level 色彩對齊 `field-controls.spec.md`。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>Field bg</Th>
                <Th>Field border</Th>
                <Th>Text</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>edit default</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--border" /></Td>
                <Td><TokenCell token="--foreground" /></Td>
              </tr>
              <tr>
                <Td mono>edit hover</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--border-hover" display="border-hover" /></Td>
                <Td><TokenCell token="--foreground" /></Td>
              </tr>
              <tr>
                <Td mono>edit focus(open)</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--ring" display="ring" /></Td>
                <Td><TokenCell token="--foreground" /></Td>
              </tr>
              <tr>
                <Td mono>readonly</Td>
                <Td><TokenCell token="--muted" display="muted(緊湊底)" /></Td>
                <Td>—(no border)</Td>
                <Td><TokenCell token="--foreground" /></Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td><TokenCell token="--bg-disabled" display="bg-disabled" /></Td>
                <Td><TokenCell token="--border" /></Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
              </tr>
              <tr>
                <Td mono>invalid</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--error" display="error" /></Td>
                <Td><TokenCell token="--foreground" /></Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Dropdown 內 MenuItem 色彩(消費 MenuItem pattern)</H3>
        <Desc>
          Dropdown 的 row 色彩走 item-layout canonical——跟 Select / Combobox / DropdownMenu 同一套
          (hover = neutral-hover / selected 加 Check icon)。不使用自訂 token。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>MenuItem 狀態</Th>
                <Th>Bg</Th>
                <Th>Avatar prefix</Th>
                <Th>Text</Th>
                <Th>Selected icon</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>default</Td><Td>—</Td><Td>Avatar 24/32(由 description 有無決定)</Td><Td><TokenCell token="--foreground" /></Td><Td>—</Td></tr>
              <tr><Td mono>hover</Td><Td><TokenCell token="--neutral-hover" display="neutral-hover" /></Td><Td>—</Td><Td><TokenCell token="--foreground" /></Td><Td>—</Td></tr>
              <tr><Td mono>selected</Td><Td>—</Td><Td>—</Td><Td><TokenCell token="--foreground" display="foreground(medium)" /></Td><Td>Check 16px fg-muted</Td></tr>
              <tr><Td mono>selected + hover</Td><Td><TokenCell token="--neutral-hover" display="neutral-hover" /></Td><Td>—</Td><Td><TokenCell token="--foreground" display="foreground(medium)" /></Td><Td>Check 16px foreground</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Dropdown row 高度用 MenuItem block tier(avatar 24/32 時,row 高度拉高到 40/56)——閱讀模式,
          讓 avatar + name + description 兩行舒適呈現。
        </p>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為(open / search / selected / empty)',
  render: () => (
    <div className="flex flex-col gap-10 max-w-md">
      <div>
        <H3>真實場景:Assignee picker(單選)</H3>
        <Desc>
          Jira / Linear 的 task assignee 場景——單選、有搜尋、選擇後 field 顯示 Avatar + Name。
          點開 dropdown,打字搜尋,按 Enter 或點擊選取。
        </Desc>
        <PeoplePicker
          people={SAMPLE_PEOPLE}
          value={SAMPLE_PEOPLE[0]}
          onChange={() => {}}
          searchPlaceholder="搜尋指派對象…"
        />
      </div>

      <div>
        <H3>真實場景:Reviewers(多選)</H3>
        <Desc>
          GitHub PR reviewers 場景——多選、field 顯示 Avatar 陣列(限定顯示前幾個 + overflow count),
          點開 dropdown 可勾多個 reviewer。
        </Desc>
        <PeoplePicker
          people={SAMPLE_PEOPLE}
          value={[SAMPLE_PEOPLE[0], SAMPLE_PEOPLE[1], SAMPLE_PEOPLE[2]]}
          onChange={() => {}}
          searchPlaceholder="加入 reviewers…"
        />
      </div>

      <div>
        <H3>空狀態 — no match found</H3>
        <Desc>
          搜尋無結果時 dropdown 顯示 `emptyText`,走共用 `Empty` primitive。Consumer 可自訂提示語。
        </Desc>
        <PeoplePicker
          people={SAMPLE_PEOPLE}
          value={null}
          onChange={() => {}}
          searchPlaceholder="試試搜尋 xyz"
          emptyText="找不到符合的組員 — 試試輸入 email 邀請外部"
        />
      </div>

      <div>
        <H3>空 value(尚未指派)</H3>
        <Desc>
          value = null 時 field 顯示 placeholder(「指派對象」)而非 Avatar——暗示可點擊新增。
        </Desc>
        <PeoplePicker
          people={SAMPLE_PEOPLE}
          value={null}
          onChange={() => {}}
          searchPlaceholder="指派對象…"
        />
      </div>

      <div>
        <H3>Readonly — DataTable cell 或 detail panel 顯示</H3>
        <Desc>
          Readonly 呈現:緊湊底(muted)+ Avatar + Name,無 dropdown trigger。適合 DataTable cell、
          detail panel 的 assignee 顯示,不需要 edit 時用。
        </Desc>
        <PeoplePicker
          mode="readonly"
          people={SAMPLE_PEOPLE}
          value={SAMPLE_PEOPLE[0]}
        />
      </div>
    </div>
  ),
}

export const PersonValueType: Story = {
  name: 'PersonValue 型別',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>兩種 PersonValue 格式</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>格式</Th><Th>Type</Th><Th>用途</Th></tr></thead>
            <tbody>
              <tr><Td>簡單字串</Td><Td mono>string</Td><Td>只有名字(fallback 顯示 initials)</Td></tr>
              <tr><Td>完整物件</Td><Td mono>{'{ name: string; avatarUrl?: string; description?: string }'}</Td><Td>含 avatar URL 和 description(role / email)</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 max-w-md mt-4">
          <div>
            <div className="text-caption text-fg-muted mb-1">字串 value(顯示 initials)</div>
            <PeoplePicker
              people={['陳麒仁', 'Alice Wang', 'Bob Chen']}
              value="陳麒仁"
              onChange={() => {}}
            />
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-1">物件 value(顯示 avatar)</div>
            <PeoplePicker
              people={SAMPLE_PEOPLE}
              value={SAMPLE_PEOPLE[0]}
              onChange={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  ),
}
