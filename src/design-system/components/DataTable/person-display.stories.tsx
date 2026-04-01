import type { Meta, StoryObj } from '@storybook/react'
import { PersonField } from '@/design-system/components/fields/PersonField/person-field'
import { PersonDisplay, MultiPersonDisplay } from './person-display'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Fields/PersonField',
  parameters: {
    docs: {
      description: {
        component: '人員選擇元件。外觀同 SelectField，value 前面多 avatar。多人時 avatar 堆疊。',
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
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（有值）</h3>
        <PersonField value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（無 avatar）</h3>
        <PersonField value="Bob Lin" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（空）</h3>
        <PersonField value={null} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <PersonField mode="readonly" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <PersonField mode="disabled" value={samplePeople[0]} />
      </div>
    </div>
  ),
}

/* ── 多人 ── */
export const Multi: Story = {
  name: '多人',
  render: () => (
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（3 人）</h3>
        <PersonField value={samplePeople.slice(0, 3)} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（6 人，溢出 +3）</h3>
        <PersonField value={samplePeople} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <PersonField mode="readonly" value={samplePeople} />
      </div>
    </div>
  ),
}

/* ── 尺寸與 Button 對齊 ── */
export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-4">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} className="flex items-center gap-3">
          <PersonField size={size} value={samplePeople[0]} className="max-w-xs" />
          <Button size={size}>送出</Button>
          <span className="text-caption text-fg-muted">size="{size}"</span>
        </div>
      ))}
    </div>
  ),
}
