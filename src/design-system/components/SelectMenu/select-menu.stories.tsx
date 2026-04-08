import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Mail, Bell, Settings, Star, Folder, FileText, BarChart3, ChevronDown, User, Globe, Code, Palette, Zap } from 'lucide-react'
import { SelectMenu, type SelectMenuOption, type SelectMenuGroupConfig } from './select-menu'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/SelectMenu/展示',
  parameters: { layout: 'padded' },
}
export default meta

// ── 基本單選 ──

const frameworks: SelectMenuOption[] = [
  { value: 'react', label: 'React', icon: Code },
  { value: 'vue', label: 'Vue', icon: Code },
  { value: 'angular', label: 'Angular', icon: Code },
  { value: 'svelte', label: 'Svelte', icon: Code },
]

const SingleSelectDemo = () => {
  const [value, setValue] = useState<string | null>(null)
  const selected = frameworks.find((f) => f.value === value)

  return (
    <SelectMenu options={frameworks} value={value} onValueChange={(v) => setValue(v as string)}>
      <Button variant="tertiary" endIcon={ChevronDown}>
        {selected?.label ?? '選擇框架…'}
      </Button>
    </SelectMenu>
  )
}

export const SingleSelect: StoryObj = {
  name: '單選',
  render: () => <SingleSelectDemo />,
}

// ── 單選 + 搜尋 ──

const countries: SelectMenuOption[] = [
  { value: 'tw', label: '台灣', icon: Globe },
  { value: 'jp', label: '日本', icon: Globe },
  { value: 'us', label: '美國', icon: Globe },
  { value: 'gb', label: '英國', icon: Globe },
  { value: 'de', label: '德國', icon: Globe },
  { value: 'fr', label: '法國', icon: Globe },
  { value: 'kr', label: '韓國', icon: Globe },
  { value: 'sg', label: '新加坡', icon: Globe },
]

const SearchableDemo = () => {
  const [value, setValue] = useState<string | null>(null)
  const selected = countries.find((c) => c.value === value)

  return (
    <SelectMenu options={countries} value={value} onValueChange={(v) => setValue(v as string)} searchable>
      <Button variant="tertiary" endIcon={ChevronDown}>
        {selected?.label ?? '選擇國家…'}
      </Button>
    </SelectMenu>
  )
}

export const Searchable: StoryObj = {
  name: '搜尋',
  render: () => <SearchableDemo />,
}

// ── 多選 ──

const notifications: SelectMenuOption[] = [
  { value: 'email', label: '電子郵件', icon: Mail },
  { value: 'push', label: '推播通知', icon: Bell },
  { value: 'slack', label: 'Slack', icon: Settings },
  { value: 'sms', label: 'SMS', icon: Star, disabled: true },
]

const MultiSelectDemo = () => {
  const [value, setValue] = useState<string[]>(['email'])

  return (
    <SelectMenu options={notifications} value={value} onValueChange={(v) => setValue(v as string[])} multiple>
      <Button variant="tertiary" endIcon={ChevronDown}>
        {value.length ? `已選 ${value.length} 項` : '選擇通知方式…'}
      </Button>
    </SelectMenu>
  )
}

export const MultiSelect: StoryObj = {
  name: '多選',
  render: () => <MultiSelectDemo />,
}

// ── 多選 + 搜尋 ──

const MultiSearchDemo = () => {
  const [value, setValue] = useState<string[]>([])

  return (
    <SelectMenu options={countries} value={value} onValueChange={(v) => setValue(v as string[])} multiple searchable>
      <Button variant="tertiary" endIcon={ChevronDown}>
        {value.length ? `已選 ${value.length} 個國家` : '選擇國家…'}
      </Button>
    </SelectMenu>
  )
}

export const MultiSearchable: StoryObj = {
  name: '多選 + 搜尋',
  render: () => <MultiSearchDemo />,
}

// ── 分組 ──

const groupedOptions: SelectMenuOption[] = [
  { value: 'doc-a', label: '文件 A', icon: FileText, group: 'recent' },
  { value: 'doc-b', label: '文件 B', icon: FileText, group: 'recent' },
  { value: 'proj-1', label: '專案一', icon: Folder, group: 'all' },
  { value: 'proj-2', label: '專案二', icon: Folder, group: 'all' },
  { value: 'dashboard', label: '儀表板', icon: BarChart3, group: 'all' },
]

const groupConfigs: SelectMenuGroupConfig[] = [
  { key: 'recent', label: '最近使用' },
  { key: 'all', label: '所有項目' },
]

const GroupDemo = () => {
  const [value, setValue] = useState<string | null>(null)
  const selected = groupedOptions.find((o) => o.value === value)

  return (
    <SelectMenu options={groupedOptions} groups={groupConfigs} value={value} onValueChange={(v) => setValue(v as string)} searchable>
      <Button variant="tertiary" endIcon={ChevronDown}>
        {selected?.label ?? '選擇項目…'}
      </Button>
    </SelectMenu>
  )
}

export const Groups: StoryObj = {
  name: '分組',
  render: () => <GroupDemo />,
}

// ── Creatable ──

const CreatableDemo = () => {
  const [options, setOptions] = useState<SelectMenuOption[]>([
    { value: 'design', label: '設計', icon: Palette },
    { value: 'dev', label: '開發', icon: Code },
    { value: 'marketing', label: '行銷', icon: Zap },
  ])
  const [value, setValue] = useState<string | null>(null)
  const selected = options.find((o) => o.value === value)

  return (
    <SelectMenu
      options={options}
      value={value}
      onValueChange={(v) => setValue(v as string)}
      searchable
      creatable
      onCreate={(label) => {
        const newOpt = { value: label.toLowerCase(), label }
        setOptions((prev) => [...prev, newOpt])
        setValue(newOpt.value)
      }}
    >
      <Button variant="tertiary" endIcon={ChevronDown}>
        {selected?.label ?? '選擇標籤…'}
      </Button>
    </SelectMenu>
  )
}

export const Creatable: StoryObj = {
  name: 'Creatable',
  render: () => <CreatableDemo />,
}

// ── Description ──

const AvatarCircle = ({ bg = '#e0e7ff' }: { bg?: string }) => (
  <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: bg }}>
    <User size={12} className="text-fg-muted" />
  </div>
)

const people: SelectMenuOption[] = [
  { value: 'alice', label: 'Alice Chen', description: '設計部門', avatar: <AvatarCircle /> },
  { value: 'bob', label: 'Bob Wang', description: '工程部門', avatar: <AvatarCircle bg="#fce7f3" /> },
  { value: 'carol', label: 'Carol Lin', description: '行銷部門', avatar: <AvatarCircle bg="#d1fae5" /> },
]

const DescriptionDemo = () => {
  const [value, setValue] = useState<string | null>(null)
  const selected = people.find((p) => p.value === value)

  return (
    <SelectMenu options={people} value={value} onValueChange={(v) => setValue(v as string)} searchable>
      <Button variant="tertiary" endIcon={ChevronDown}>
        {selected?.label ?? '選擇成員…'}
      </Button>
    </SelectMenu>
  )
}

export const WithDescription: StoryObj = {
  name: 'Avatar + Description',
  render: () => <DescriptionDemo />,
}

// ── 尺寸 ──

const SizesDemo = () => {
  const [sm, setSm] = useState<string | null>(null)
  const [md, setMd] = useState<string | null>(null)
  const [lg, setLg] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {([
        { size: 'sm' as const, value: sm, set: setSm },
        { size: 'md' as const, value: md, set: setMd },
        { size: 'lg' as const, value: lg, set: setLg },
      ]).map(({ size, value, set }) => (
        <div key={size} className="flex items-center gap-3">
          <span className="text-caption text-fg-muted font-mono w-8">{size}</span>
          <SelectMenu options={frameworks} value={value} onValueChange={(v) => set(v as string)} size={size} searchable>
            <Button variant="tertiary" size={size} endIcon={ChevronDown}>
              {frameworks.find((f) => f.value === value)?.label ?? '選擇…'}
            </Button>
          </SelectMenu>
        </div>
      ))}
    </div>
  )
}

export const Sizes: StoryObj = {
  name: '尺寸',
  render: () => <SizesDemo />,
}
