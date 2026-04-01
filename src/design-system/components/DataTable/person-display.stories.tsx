import type { Meta, StoryObj } from '@storybook/react'
import { PersonDisplay, MultiPersonDisplay } from './person-display'

const meta: Meta = {
  title: 'Design System/Components/Fields/PersonField',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '人員顯示元件。單人顯示 avatar + 名字；多人堆疊 avatar（-2px overlap），溢出 +N 可 hover 查看。',
      },
    },
  },
}

export default meta
type Story = StoryObj

const samplePeople = [
  { name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/48?u=alice' },
  { name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/48?u=bob' },
  { name: 'Charlie Wu', avatarUrl: 'https://i.pravatar.cc/48?u=charlie' },
  { name: 'Diana Huang', avatarUrl: 'https://i.pravatar.cc/48?u=diana' },
  { name: 'Eric Tsai' },
  { name: 'Fiona Lee', avatarUrl: 'https://i.pravatar.cc/48?u=fiona' },
]

/* ── 單人 ── */
export const Single: Story = {
  name: '單人',
  render: () => (
    <div className="flex flex-col gap-4">
      <PersonDisplay value={{ name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/48?u=alice' }} />
      <PersonDisplay value="Bob Lin" />
      <PersonDisplay value={null} />
    </div>
  ),
}

/* ── 多人堆疊 ── */
export const Multi: Story = {
  name: '多人堆疊',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-caption text-fg-muted mb-2">2 人（不溢出，不堆疊人名）</p>
        <MultiPersonDisplay value={samplePeople.slice(0, 2)} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">3 人（max=3，剛好不溢出）</p>
        <MultiPersonDisplay value={samplePeople.slice(0, 3)} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">4 人（max=3，溢出 +1）— hover +1 查看</p>
        <MultiPersonDisplay value={samplePeople.slice(0, 4)} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">6 人（max=3，溢出 +3）</p>
        <MultiPersonDisplay value={samplePeople} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">1 人 — 自動回退為單人模式（顯示名字）</p>
        <MultiPersonDisplay value={samplePeople.slice(0, 1)} />
      </div>
    </div>
  ),
}

/* ── 尺寸 ── */
export const Sizes: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-4">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex items-center gap-4">
          <span className="text-caption text-fg-muted w-8">{size}</span>
          <PersonDisplay value={{ name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/48?u=alice' }} size={size} />
          <MultiPersonDisplay value={samplePeople.slice(0, 4)} size={size} />
        </div>
      ))}
    </div>
  ),
}

/* ── Max 控制 ── */
export const MaxVisible: Story = {
  name: 'Max 控制',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">max=2</span>
        <MultiPersonDisplay value={samplePeople} max={2} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">max=3</span>
        <MultiPersonDisplay value={samplePeople} max={3} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-caption text-fg-muted w-16">max=5</span>
        <MultiPersonDisplay value={samplePeople} max={5} />
      </div>
    </div>
  ),
}

/* ── Initials（無 avatar）── */
export const Initials: Story = {
  name: 'Initials（neutral 底色）',
  render: () => (
    <div className="flex flex-col gap-4">
      <PersonDisplay value="Alice Chen" />
      <MultiPersonDisplay value={['Alice Chen', 'Bob Lin', 'Charlie Wu', 'Diana Huang']} />
      <p className="text-caption text-fg-muted">無 avatar 圖片時顯示 initials，統一 neutral 底色</p>
    </div>
  ),
}
