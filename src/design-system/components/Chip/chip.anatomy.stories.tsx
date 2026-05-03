// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
import type { Meta, StoryObj } from '@storybook/react'
import { Star, Tag as TagIcon } from 'lucide-react'
import { Chip, ChipGroup } from './chip'
import { H3, Desc, Td, Th, TokenCell, Swatch } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

type InspectorArgs = {
  type: 'single' | 'multiple'
  selected: boolean
  disabled: boolean
  withStartIcon: boolean
  layout: 'wrap' | 'scroll' | 'menu'
}

const meta: Meta = {
  title: 'Design System/Components/Chip/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<InspectorArgs>

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Chip 是 **Material Design Filter Chip** 實作——多選(預設)或單選的 pill 控件。基於 Radix ToggleGroup,橋接 DS token。視覺上是一排獨立的 `rounded-full` pill,各自有 `gap-2` 間距(非連體,這是跟 SegmentedControl 的主要差異)。</Desc>
        <ChipGroup type="multiple" defaultValue={['electronics', 'food']}>
          <Chip value="electronics">電子產品</Chip>
          <Chip value="furniture">家具</Chip>
          <Chip value="food">食品</Chip>
          <Chip value="clothing">服飾</Chip>
          <Chip value="books">書籍</Chip>
        </ChipGroup>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元件</Th><Th>主要 Props</Th></tr></thead>
            <tbody>
              <tr><Td mono>ChipGroup</Td><Td mono>type: 'single' | 'multiple'(必填,Radix ToggleGroup 要求),value / onValueChange,size,layout</Td></tr>
              <tr><Td mono>Chip</Td><Td mono>value(必填),startIcon,disabled</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>與 SegmentedControl 的差異</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th></Th><Th>Chip</Th><Th>SegmentedControl</Th></tr></thead>
            <tbody>
              <tr><Td>選擇語意</Td><Td>多選為主,可選單選</Td><Td>固定單選(radio)</Td></tr>
              <tr><Td>視覺連接</Td><Td mono>各自獨立 pill,gap-2</Td><Td mono>Items 連體,-ml-px border 重疊</Td></tr>
              <tr><Td>圓角</Td><Td mono>rounded-full(M3 身份特徵)</Td><Td mono>rounded-md</Td></tr>
              <tr><Td>溢出處理</Td><Td>layout="scroll" / "menu"(共用 horizontal-overflow pattern)</Td><Td>不支援 overflow</Td></tr>
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
        story: '在右側 Controls 面板切換 type / selected / disabled / startIcon / layout,即時查看 Chip 狀態。世界級 DS 的 Inspector = Figma inspect 替代。',
      },
    },
  },
  args: {
    type: 'multiple',
    selected: true,
    disabled: false,
    withStartIcon: false,
    layout: 'wrap',
  },
  argTypes: {
    type: {
      control: 'radio',
      options: ['single', 'multiple'],
      description: 'ToggleGroup 選擇模式:multiple(多選,預設)/ single(單選互斥)',
    },
    selected: {
      control: 'boolean',
      description: '「精選」chip 是否選中(預覽選中態視覺)',
    },
    disabled: {
      control: 'boolean',
      description: '「下架」chip 是否停用',
    },
    withStartIcon: {
      control: 'boolean',
      description: '是否在 chip 加 startIcon(Tag / Star)',
    },
    layout: {
      control: 'radio',
      options: ['wrap', 'scroll', 'menu'],
      description: 'overflow 行為:wrap(換行,預設)/ scroll(fade mask)/ menu(收入 Dropdown)',
    },
  },
  render: (args) => {
    const groupProps =
      args.type === 'multiple'
        ? ({ type: 'multiple' as const, defaultValue: args.selected ? ['featured'] : [] })
        : ({ type: 'single' as const, defaultValue: args.selected ? 'featured' : '' })
    return (
      <div className="max-w-md border border-border rounded-md p-3">
        <ChipGroup layout={args.layout} {...groupProps}>
          <Chip value="featured" startIcon={args.withStartIcon ? Star : undefined}>精選</Chip>
          <Chip value="new" startIcon={args.withStartIcon ? TagIcon : undefined}>新品</Chip>
          <Chip value="sale">特價</Chip>
          <Chip value="limited">限量</Chip>
          <Chip value="discontinued" disabled={args.disabled}>下架</Chip>
        </ChipGroup>
      </div>
    )
  },
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>狀態 × 色彩 Token 矩陣</H3>
        <Desc>
          Chip 採 pill-canonical 選中規則(跟 SegmentedControl 共用):selected 時 `--primary-hover` 同時染 border 和 text,
          **底色維持 `--surface` 不變**——不用 primary-subtle 底色(那是 Button subtle 的視覺語言,跟 filter chip 不同)。
          視覺輕量是 filter 語意必要條件,避免 chip 群組喧賓奪主壓過資料表格。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse min-w-[640px]">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>Background</Th>
                <Th>Border</Th>
                <Th>Text</Th>
                <Th>Icon</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>default(unselected)</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--surface" size="sm" /><span className="font-mono">--surface</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--border" size="sm" /><span className="font-mono">--border</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--fg-secondary" size="sm" /><span className="font-mono">--fg-secondary</span></span></Td>
                <Td mono>currentColor</Td>
              </tr>
              <tr>
                <Td mono>hover(unselected)</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--surface" size="sm" /><span className="font-mono">--surface</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--border-hover" size="sm" /><span className="font-mono">--border-hover</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--foreground" size="sm" /><span className="font-mono">--foreground</span></span></Td>
                <Td mono>currentColor</Td>
              </tr>
              <tr>
                <Td mono>selected</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--surface" size="sm" /><span className="font-mono">--surface(不變)</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--primary-hover" size="sm" /><span className="font-mono">--primary-hover</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--primary-hover" size="sm" /><span className="font-mono">--primary-hover</span></span></Td>
                <Td mono>currentColor</Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--surface" size="sm" /><span className="font-mono">--surface</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--border" size="sm" /><span className="font-mono">--border(不升階)</span></span></Td>
                <Td><span className="inline-flex items-center gap-1.5"><Swatch value="--fg-disabled" size="sm" /><span className="font-mono">--fg-disabled</span></span></Td>
                <Td mono>currentColor</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>視覺並列對照</H3>
        <Desc>左 default / 中 selected / 右 disabled,觀察 border 同時升階到 primary-hover 的視覺變化(非 bg 變化)。</Desc>
        <div className="flex items-center gap-8 px-6 py-5 rounded-lg bg-canvas border border-divider">
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-mono">default</span>
            <ChipGroup type="multiple" defaultValue={[]}>
              <Chip value="electronics">電子產品</Chip>
            </ChipGroup>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-mono">selected</span>
            <ChipGroup type="multiple" defaultValue={['electronics']}>
              <Chip value="electronics">電子產品</Chip>
            </ChipGroup>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-mono">disabled</span>
            <ChipGroup type="multiple" defaultValue={[]}>
              <Chip value="electronics" disabled>電子產品</Chip>
            </ChipGroup>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-mono">selected + disabled</span>
            <ChipGroup type="multiple" defaultValue={['electronics']}>
              <Chip value="electronics" disabled>電子產品</Chip>
            </ChipGroup>
          </div>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          世界級對照:Material 3 Filter Chip / Atlassian Chip / Polaris Filter 全部採「border + text 同步染 primary」而非 bg 染色——保持 filter row 的視覺輕量。
        </p>
      </div>

      <div>
        <H3>為什麼不用 primary-subtle 底色</H3>
        <Desc>
          `--primary-subtle` 的 bg 染色是 Button subtle variant 的視覺語言,適用於「行為選項」(如 pagination hover);
          Chip 是「篩選條件」,多選時可能同時亮 5-10 個——若每個都填底色,filter row 會蓋過主內容表格,破壞資訊層次。
          只染 border + text 保持背景通透,對齊 SegmentedControl / Tabs 未選 hover 的 pill-canonical。
        </Desc>
      </div>
    </div>
  ),
}

export const SelectionMatrix: Story = {
  name: 'Multi vs Single 選擇',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Multiple(預設)</H3>
        <Desc>選取任意數量——filter panel 的 tag 選取、toolbar 多選過濾。</Desc>
        <ChipGroup type="multiple" defaultValue={['zh', 'en']}>
          <Chip value="zh">中文</Chip>
          <Chip value="en">英文</Chip>
          <Chip value="ja">日文</Chip>
          <Chip value="ko">韓文</Chip>
        </ChipGroup>
      </div>

      <div>
        <H3>Single(單選)</H3>
        <Desc>互斥單選——當需要 chip 的視覺感(rounded-full, 獨立 pill)但語意是互斥時使用。若需 compact 連體,改用 SegmentedControl。</Desc>
        <ChipGroup type="single" defaultValue="all">
          <Chip value="all">全部</Chip>
          <Chip value="active">進行中</Chip>
          <Chip value="done">已完成</Chip>
        </ChipGroup>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>單一 size = h-field-sm(28 / 32 density-aware)</H3>
        <Desc>
          Chip 故意**只有一種尺寸**——對齊 Material 3 / Atlassian / Polaris 的 filter chip
          canonical 共識。Chip 是 filter 語意,filter 列的視覺重量應該固定;如果需要多 tier,那是
          Button 或 Tabs 的領域。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>項目</Th><Th>值</Th><Th>Token / 對齊</Th></tr></thead>
            <tbody>
              <tr><Td>高度</Td><Td mono>h-field-sm</Td><Td>28px (md) / 32px (lg) — density-aware</Td></tr>
              <tr><Td>水平 padding</Td><Td mono>px-3</Td><Td>12px(對齊 Button sm)</Td></tr>
              <tr><Td>內部 gap</Td><Td mono>gap-1</Td><Td>4px(icon → label → suffix)</Td></tr>
              <tr><Td>Label 左右留白</Td><Td mono>px-1</Td><Td>4px 貼合視覺中心</Td></tr>
              <tr><Td>Chip 之間 gap</Td><Td mono>gap-2</Td><Td>8px(獨立 pill 間距)</Td></tr>
              <tr><Td>Icon size</Td><Td mono>16px</Td><Td>對齊 Button sm icon</Td></tr>
              <tr><Td>Border radius</Td><Td mono>rounded-full</Td><Td>M3 身份特徵</Td></tr>
              <tr><Td>Typography</Td><Td mono>text-body font-medium</Td><Td>14px 500 leading-compact</Td></tr>
            </tbody>
          </table>
        </div>
        <ChipGroup type="single" defaultValue="all">
          <Chip value="all">全部</Chip>
          <Chip value="active">進行中</Chip>
          <Chip value="done">已完成</Chip>
        </ChipGroup>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>四種狀態 × 色彩 Token</H3>
        <Desc>
          選中態走 pill-canonical 規則(跟 SegmentedControl 完全一致):
          **primary-hover 同時染 border 和 text**,底色維持 bg-surface 不變——不用 primary-subtle
          底色(那是 Button subtle 的視覺語言,跟 chip 不同)。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>狀態</Th><Th>Background</Th><Th>Border</Th><Th>Text</Th></tr></thead>
            <tbody>
              <tr>
                <Td mono>default</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--border" /></Td>
                <Td><TokenCell token="--fg-secondary" /></Td>
              </tr>
              <tr>
                <Td mono>hover(未選)</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--border-hover" display="border-hover" /></Td>
                <Td><TokenCell token="--foreground" /></Td>
              </tr>
              <tr>
                <Td mono>selected (data-state=on)</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--primary-hover" display="primary-hover" /></Td>
                <Td><TokenCell token="--primary-hover" display="primary-hover" /></Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td><TokenCell token="--surface" /></Td>
                <Td><TokenCell token="--border" /></Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className="text-caption text-fg-muted mb-2">四種狀態並存(hover 可在 Storybook 上試)</div>
          <ChipGroup type="multiple" defaultValue={['selected']}>
            <Chip value="default">Default(未選)</Chip>
            <Chip value="hover">Hover 我 ↓</Chip>
            <Chip value="selected">Selected</Chip>
            <Chip value="disabled" disabled>Disabled</Chip>
          </ChipGroup>
        </div>
      </div>

      <div>
        <H3>Selected 色彩跟 SegmentedControl 完全一致</H3>
        <Desc>
          兩者都是 pill 選擇語意(filter / 單選 radio),選中態視覺語言統一:
          primary-hover 染 border + text,底色不變。只有「連體 vs 獨立」的視覺差異,選中規則是同一套。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4">
          <div className="text-caption text-fg-muted mb-2">Chip(獨立 pill)</div>
          <ChipGroup type="single" defaultValue="active">
            <Chip value="all">全部</Chip>
            <Chip value="active">進行中</Chip>
            <Chip value="done">已完成</Chip>
          </ChipGroup>
        </div>
      </div>
    </div>
  ),
}

export const LayoutMatrix: Story = {
  name: 'Layout(wrap / scroll / menu)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>wrap(預設)</H3>
        <Desc>超出容器自然換行。適合空間充裕的 filter panel。</Desc>
        <div className="max-w-md border border-border rounded-md p-3">
          <ChipGroup type="multiple" defaultValue={['a']}>
            {['電子產品', '家具', '食品', '服飾', '書籍', '運動', '玩具', '美妝', '家電'].map(label => (
              <Chip key={label} value={label}>{label}</Chip>
            ))}
          </ChipGroup>
        </div>
      </div>

      <div>
        <H3>scroll</H3>
        <Desc>水平捲動 + fade mask(共用 `horizontal-overflow` pattern,跟 Tabs 一致)。適合空間受限但希望保留 chip 視覺的場景。</Desc>
        <div className="max-w-md border border-border rounded-md p-3">
          <ChipGroup type="multiple" layout="scroll" defaultValue={['a']}>
            {['電子產品', '家具', '食品', '服飾', '書籍', '運動', '玩具', '美妝', '家電'].map(label => (
              <Chip key={label} value={label}>{label}</Chip>
            ))}
          </ChipGroup>
        </div>
      </div>

      <div>
        <H3>menu(overflow 收入 DropdownMenu)</H3>
        <Desc>隱藏溢出到下拉選單(類似 Tabs overflow="menu")。適合 chip 很多但使用者不常切後面的場景。</Desc>
        <div className="max-w-md border border-border rounded-md p-3">
          <ChipGroup type="multiple" layout="menu" defaultValue={['a']}>
            {['電子產品', '家具', '食品', '服飾', '書籍', '運動', '玩具', '美妝', '家電'].map(label => (
              <Chip key={label} value={label}>{label}</Chip>
            ))}
          </ChipGroup>
        </div>
      </div>
    </div>
  ),
}
