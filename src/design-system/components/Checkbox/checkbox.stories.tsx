import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './checkbox'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'

const meta: Meta<typeof Checkbox> = {
  title: 'Design System/Components/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Checkbox>

/* ── 狀態 ── */
export const States: Story = {
  name: '狀態',
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-caption text-fg-muted mb-2">md（16px，預設）</p>
        <div className="flex items-center gap-4">
          <Checkbox />
          <Checkbox defaultChecked />
          <Checkbox disabled />
          <Checkbox disabled defaultChecked />
        </div>
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">lg（20px）</p>
        <div className="flex items-center gap-4">
          <Checkbox size="lg" />
          <Checkbox size="lg" defaultChecked />
          <Checkbox size="lg" disabled />
          <Checkbox size="lg" disabled defaultChecked />
        </div>
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
          <div className="grid">
            <SelectionItem size={size} control={<Checkbox id={`${size}-a`} size={size} />} label="Electronics" htmlFor={`${size}-a`} />
            <SelectionItem size={size} control={<Checkbox id={`${size}-b`} size={size} />} label="Furniture" description="桌椅、收納、辦公家具" htmlFor={`${size}-b`} />
            <SelectionItem size={size} control={<Checkbox id={`${size}-c`} size={size} />} label="Food & Beverage" htmlFor={`${size}-c`} />
          </div>
        </div>
      ))}
    </div>
  ),
}

/* ── 水平排列 ── */
export const Horizontal: Story = {
  name: '水平排列',
  render: () => (
    <div className="flex gap-6 max-w-md">
      <SelectionItem control={<Checkbox id="h-a" />} label="Electronics" htmlFor="h-a" />
      <SelectionItem control={<Checkbox id="h-b" />} label="Furniture" htmlFor="h-b" />
      <SelectionItem control={<Checkbox id="h-c" />} label="Food" htmlFor="h-c" />
    </div>
  ),
}

/* ── Disabled ── */
export const DisabledGroup: Story = {
  name: 'Disabled',
  render: () => (
    <div className="grid max-w-sm">
      <SelectionItem control={<Checkbox id="dis-a" disabled defaultChecked />} label="已選取但不可更改" htmlFor="dis-a" disabled />
      <SelectionItem control={<Checkbox id="dis-b" disabled />} label="此選項不可用" htmlFor="dis-b" disabled />
    </div>
  ),
}
