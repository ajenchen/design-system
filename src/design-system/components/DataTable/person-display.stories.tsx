import type { Meta, StoryObj } from '@storybook/react'
import { PersonDisplay } from './person-display'

const meta: Meta<typeof PersonDisplay> = {
  title: 'Design System/Components/Fields/PersonField',
  component: PersonDisplay,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '人員顯示元件，支援 avatar 圖片或 neutral 底色 initials。用於 DataTable cell 和 SelectField-like 的 PersonField。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof PersonDisplay>

/* ── 基本用法 ── */
export const Basic: Story = {
  name: '基本用法',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">字串（name）</span>
        <PersonDisplay value="Alice Chen" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">物件（有 avatar）</span>
        <PersonDisplay value={{ name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/48?u=bob' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">物件（無 avatar）</span>
        <PersonDisplay value={{ name: 'Charlie Wu' }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">null</span>
        <PersonDisplay value={null} />
      </div>
    </div>
  ),
}

/* ── 尺寸 ── */
export const Sizes: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-3">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex items-center gap-3">
          <span className="text-caption text-fg-muted w-8">{size}</span>
          <PersonDisplay value="Alice Chen" size={size} />
          <PersonDisplay value={{ name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/48?u=bob' }} size={size} />
        </div>
      ))}
    </div>
  ),
}

/* ── Initials ── */
export const Initials: Story = {
  name: 'Initials（neutral 底色）',
  render: () => (
    <div className="flex flex-col gap-2">
      {['Alice Chen', 'Bob Lin', 'Charlie Wu', 'Diana Huang', 'Eric Tsai', 'Fiona Lee'].map(name => (
        <PersonDisplay key={name} value={name} />
      ))}
      <p className="text-caption text-fg-muted mt-2">無 avatar 圖片時顯示 initials，統一 neutral 底色</p>
    </div>
  ),
}
