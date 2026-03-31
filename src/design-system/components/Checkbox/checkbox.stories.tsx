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
    <div className="flex flex-col gap-6">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-3">{size}</p>
          <div className="flex items-center gap-6">
            <Checkbox size={size} />
            <Checkbox size={size} defaultChecked />
            <Checkbox size={size} disabled />
            <Checkbox size={size} disabled defaultChecked />
          </div>
        </div>
      ))}
    </div>
  ),
}

/* ── 垂直 Group（對齊 TextField 高度）── */
export const VerticalGroup: Story = {
  name: '垂直 Group',
  render: () => (
    <div className="flex flex-col gap-8 max-w-md">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-2">size="{size}" — 單行高度對齊 TextField {size}</p>
          <div className="grid">
            <SelectionItem
              size={size}
              control={<Checkbox id={`${size}-a`} size={size} />}
              label="Electronics"
              htmlFor={`${size}-a`}
            />
            <SelectionItem
              size={size}
              control={<Checkbox id={`${size}-b`} size={size} />}
              label="Furniture"
              description="桌椅、收納、辦公家具"
              htmlFor={`${size}-b`}
            />
            <SelectionItem
              size={size}
              control={<Checkbox id={`${size}-c`} size={size} />}
              label="Food & Beverage"
              description="包含有機食品、茶葉、咖啡等健康飲品與零食類商品"
              htmlFor={`${size}-c`}
            />
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
    <div className="max-w-md">
      <p className="text-caption text-fg-muted mb-2">水平 — gap 24px</p>
      <div className="flex gap-6">
        <SelectionItem
          control={<Checkbox id="h-a" />}
          label="Electronics"
          htmlFor="h-a"
        />
        <SelectionItem
          control={<Checkbox id="h-b" />}
          label="Furniture"
          htmlFor="h-b"
        />
        <SelectionItem
          control={<Checkbox id="h-c" />}
          label="Food"
          htmlFor="h-c"
        />
      </div>
    </div>
  ),
}

/* ── Disabled ── */
export const DisabledGroup: Story = {
  name: 'Disabled',
  render: () => (
    <div className="grid max-w-sm">
      <SelectionItem
        control={<Checkbox id="dis-a" disabled defaultChecked />}
        label="已選取但不可更改"
        htmlFor="dis-a"
        disabled
      />
      <SelectionItem
        control={<Checkbox id="dis-b" disabled />}
        label="此選項不可用"
        htmlFor="dis-b"
        disabled
      />
    </div>
  ),
}
