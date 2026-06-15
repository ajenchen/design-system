// @story-trait-rationale: isInputLike trait — SelectMenu(internal,Select/Combobox 觸發)的 error state 由 Select.stories.tsx + Combobox.stories.tsx WithError 覆蓋(SelectMenu 是 internal popover surface,不直接 own input state)。AllSizes 同理 retired(anatomy auto-compile SizeMatrix owns)per F migration 2026-05-15。
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'

const meta: Meta = {
  title: 'Design System/Internal/SelectMenu/展示',
  tags: ['!dev'],
  parameters: { layout: 'padded' },
}
export default meta

// ── 單選（Select 觸發）──

const statusOptions = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
]

const SingleSelectDemo = () => {
  const [value, setValue] = useState<string>('in_stock')
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      <p className="text-caption text-fg-muted">Select 作為觸發點，點擊開啟 SelectMenu</p>
      <Select options={statusOptions} value={value} onChange={setValue} aria-label="狀態(SelectMenu single-select demo)" />
    </div>
  )
}

export const SingleSelect: StoryObj = {
  name: '單選',
  render: () => <SingleSelectDemo />,
}

// ── 單選 + 搜尋 ──

const countries = [
  { value: 'tw', label: '台灣' }, { value: 'jp', label: '日本' },
  { value: 'us', label: '美國' }, { value: 'gb', label: '英國' },
  { value: 'de', label: '德國' }, { value: 'fr', label: '法國' },
  { value: 'kr', label: '韓國' }, { value: 'sg', label: '新加坡' },
  { value: 'au', label: '澳洲' }, { value: 'ca', label: '加拿大' },
]

const SearchableDemo = () => {
  const [value, setValue] = useState<string>('')
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      <p className="text-caption text-fg-muted">searchable — 觸發點變 input，打字即篩選</p>
      <Select options={countries} value={value} onChange={setValue} searchable clearable placeholder="選擇國家…" />
    </div>
  )
}

export const Searchable: StoryObj = {
  name: '搜尋',
  render: () => <SearchableDemo />,
}

// ── 多選 ──

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
  { value: 'lifestyle', label: 'Lifestyle' },
]

const MultiSelectDemo = () => {
  const [value, setValue] = useState<string[]>(['electronics'])
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <p className="text-caption text-fg-muted">Combobox — checkbox 多選，浮層不關閉</p>
      <Combobox options={categoryOptions} value={value} onChange={setValue} />
    </div>
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
    <div className="flex flex-col gap-4 max-w-sm">
      <p className="text-caption text-fg-muted">searchable — 浮層內搜尋框，關鍵字保留可連續勾選</p>
      <Combobox options={countries} value={value} onChange={setValue} searchable />
    </div>
  )
}

export const MultiSearchable: StoryObj = {
  name: '多選 + 搜尋',
  render: () => <MultiSearchDemo />,
}

// ── 可清除 ──

const ClearableDemo = () => {
  const [value, setValue] = useState<string>('in_stock')
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      <p className="text-caption text-fg-muted">clearable — 有值時右側出現清除按鈕</p>
      <Select options={statusOptions} value={value} onChange={setValue} clearable />
    </div>
  )
}

export const Clearable: StoryObj = {
  name: '可清除',
  render: () => <ClearableDemo />,
}

// @story-trait-rationale: AllSizes retired per F migration 2026-05-15 — anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
// @story-trait-rationale: 原 States(edit/readonly/disabled/error 觸發器狀態)retired 2026-06-11 —
//   trigger field state 由 Select.stories.tsx「四模式」owns(SelectMenu 是 internal popover surface,
//   不 own input state,見檔頭 rationale)。本層改示範浮層自己 own 的選項狀態。
// ── 選項狀態(浮層內)──

const assigneeOptions = [
  { value: 'ada', label: 'Ada Chen', description: 'Design Engineer' },
  { value: 'ben', label: 'Ben Liu', description: 'Frontend' },
  { value: 'cindy', label: 'Cindy Wang', description: '休假中,暫不可指派', disabled: true },
  { value: 'derek', label: 'Derek Kao', description: 'Backend' },
]

const OptionStatesDemo = () => {
  const [value, setValue] = React.useState<string>('ada')
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      <p className="text-caption text-fg-secondary">
        浮層內選項狀態 — 已選中(勾選標記)、disabled(休假成員不可選)、搜尋無結果(輸入不存在的名字)
      </p>
      <Select
        options={assigneeOptions}
        value={value}
        onChange={setValue}
        searchable
        placeholder="指派負責人…"
        aria-label="指派負責人(SelectMenu option-states demo)"
      />
    </div>
  )
}

export const OptionStates: StoryObj = {
  name: '選項狀態',
  render: () => <OptionStatesDemo />,
}
