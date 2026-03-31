import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { RadioGroup, RadioGroupItem } from './radio'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'

const meta: Meta<typeof RadioGroupItem> = {
  title: 'Design System/Components/Radio',
  component: RadioGroupItem,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof RadioGroupItem>

/* ── 狀態 ── */
export const States: Story = {
  name: '狀態',
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-caption text-fg-muted mb-2">md（16px，預設）</p>
        <RadioGroup defaultValue="a" className="flex items-center gap-4">
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
          <RadioGroupItem value="c" disabled />
        </RadioGroup>
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">lg（20px）</p>
        <RadioGroup defaultValue="a" className="flex items-center gap-4">
          <RadioGroupItem value="a" size="lg" />
          <RadioGroupItem value="b" size="lg" />
          <RadioGroupItem value="c" size="lg" disabled />
        </RadioGroup>
      </div>
    </div>
  ),
}

/* ── 垂直 Group ── */
export const VerticalGroup: Story = {
  name: '垂直 Group',
  render: () => (
    <div className="flex flex-col gap-4 max-w-md">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-1">size="{size}"</p>
          <RadioGroup defaultValue="monthly">
            <SelectionItem size={size} control={<RadioGroupItem value="monthly" id={`${size}-monthly`} size={size} />} label="月付方案" htmlFor={`${size}-monthly`} />
            <SelectionItem size={size} control={<RadioGroupItem value="yearly" id={`${size}-yearly`} size={size} />} label="年付方案" description="每年 $2,990，省下兩個月" htmlFor={`${size}-yearly`} />
            <SelectionItem size={size} control={<RadioGroupItem value="lifetime" id={`${size}-lifetime`} size={size} />} label="終身方案" htmlFor={`${size}-lifetime`} />
          </RadioGroup>
        </div>
      ))}
    </div>
  ),
}

/* ── 水平排列 ── */
export const Horizontal: Story = {
  name: '水平排列',
  render: () => (
    <RadioGroup defaultValue="light" className="flex gap-6 max-w-md">
      <SelectionItem control={<RadioGroupItem value="light" id="h-light" />} label="淺色" htmlFor="h-light" />
      <SelectionItem control={<RadioGroupItem value="dark" id="h-dark" />} label="深色" htmlFor="h-dark" />
      <SelectionItem control={<RadioGroupItem value="system" id="h-system" />} label="系統" htmlFor="h-system" />
    </RadioGroup>
  ),
}

/* ── Disabled ── */
export const Disabled: Story = {
  name: 'Disabled',
  render: () => (
    <RadioGroup defaultValue="a" className="max-w-sm">
      <SelectionItem control={<RadioGroupItem value="a" id="dis-a" disabled />} label="已選取但不可更改" htmlFor="dis-a" disabled />
      <SelectionItem control={<RadioGroupItem value="b" id="dis-b" disabled />} label="此選項不可用" htmlFor="dis-b" disabled />
    </RadioGroup>
  ),
}
