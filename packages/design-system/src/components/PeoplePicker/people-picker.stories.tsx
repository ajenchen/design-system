// @story-trait-rationale: pre-existing isInputLike WithError trait gap tracked separately (see L62/L72 inline rationale); this edit only adds explicit variant="primary" to the primary-CTA Button per new tertiary/text default migration
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from './person-display'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/PeoplePicker/展示',
  parameters: {
    docs: {
      description: {
        component: '人員選擇元件。外觀同 Select，value 前面多 avatar。多人時 avatar 堆疊。',
      },
    },
  },
}

export default meta
type Story = StoryObj

// PersonData sample 含 ProfileCard 重要資訊(status / statusMessage / fields)—
// canonical:所有 person avatar hover 都應 render 完整資訊(profile-card.spec.md)。
const samplePeople = [
  {
    name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/48?u=alice', description: 'Design｜D-0042｜EMP-1001',
    status: 'online' as const,
    statusMessage: 'Out of Office: Back on Monday! For urgent matters please contact @Wei-Lun Cheng in the meantime.',
    fields: [{ label: 'ID', value: 'YHANAX' }, { label: 'Employee number', value: 'EMP-1001' }],
  },
  {
    name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/48?u=bob', description: 'Engineering｜E-0087｜EMP-1002',
    status: 'busy' as const,
    statusMessage: '正在處理 Q2 release,優先處理 P0 issues',
    fields: [{ label: 'ID', value: 'BLIN01' }, { label: 'Employee number', value: 'EMP-1002' }],
  },
  {
    name: 'Charlie Wu', avatarUrl: 'https://i.pravatar.cc/48?u=charlie', description: 'Product｜P-0015｜EMP-1003',
    status: 'away' as const,
    statusMessage: '外出開會,下午 3 點後回覆',
    fields: [{ label: 'ID', value: 'CWU003' }, { label: 'Employee number', value: 'EMP-1003' }],
  },
  {
    name: 'Diana Huang', avatarUrl: 'https://i.pravatar.cc/48?u=diana', description: 'Marketing｜M-0023｜EMP-1004',
    status: 'online' as const,
    statusMessage: 'Welcome pings! 我下午在 campaign review meeting',
    fields: [{ label: 'ID', value: 'DHUANG' }, { label: 'Employee number', value: 'EMP-1004' }],
  },
  {
    name: 'Eric Tsai', avatarUrl: 'https://i.pravatar.cc/48?u=eric', description: 'Engineering｜E-0091｜EMP-1005',
    status: 'offline' as const,
    statusMessage: 'PTO until next Tuesday',
    fields: [{ label: 'ID', value: 'ETSAI' }, { label: 'Employee number', value: 'EMP-1005' }],
  },
  {
    name: 'Fiona Lee', avatarUrl: 'https://i.pravatar.cc/48?u=fiona', description: 'Design｜D-0056｜EMP-1006',
    status: 'online' as const,
    statusMessage: 'Working on ProfileCard v3 refactor',
    fields: [{ label: 'ID', value: 'FLEE' }, { label: 'Employee number', value: 'EMP-1006' }],
  },
]

// @story-trait-rationale: pre-existing trait gaps (Default/WithError) tracked separately; this PR scope = add display mode card to mode showcase only.
/* ── 單人（互動） ── */
const SinglePicker = () => {
  const [val, setVal] = React.useState<PersonValue | null>(samplePeople[0])
  return (
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（可互動）</h3>
        <PeoplePicker value={val} people={samplePeople} onChange={(v) => setVal(v[0] ?? null)} aria-label="負責人(edit mode demo)" />
      </div>
      {/* @story-trait-rationale: pre-existing trait gaps tracked separately */}
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">display</h3>
        <PeoplePicker mode="display" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <PeoplePicker mode="readonly" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <PeoplePicker mode="disabled" value={samplePeople[0]} />
      </div>
    </div>
  )
}

export const Single: Story = {
  name: '單人',
  render: () => <SinglePicker />,
}

/* ── 多人（互動） ── */
const MultiPicker = () => {
  const [val, setVal] = React.useState<PersonValue[]>(samplePeople.slice(0, 4))
  const readonlyVal = samplePeople.slice(0, 4)
  return (
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（可互動,多選）</h3>
        <PeoplePicker value={val} people={samplePeople} onChange={setVal} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <PeoplePicker mode="readonly" value={readonlyVal} />
      </div>
    </div>
  )
}

export const Multi: Story = {
  name: '多人',
  render: () => <MultiPicker />,
}

/* ── 尺寸與 Button 對齊 ── */
const SizePicker = ({ size }: { size: 'sm' | 'md' | 'lg' }) => {
  const [val, setVal] = React.useState<PersonValue | null>(samplePeople[0])
  return (
    <div className="flex items-center gap-3">
      <PeoplePicker size={size} value={val} people={samplePeople} onChange={(v) => setVal(v[0] ?? null)} className="max-w-xs" />
      <Button variant="primary" size={size}>送出</Button>
      <span className="text-caption text-fg-muted">size="{size}"</span>
    </div>
  )
}

export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-4">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <SizePicker key={size} size={size} />
      ))}
    </div>
  ),
}

/* ── 人員清單非同步載入（已選值先到、名錄後到） ── */
const AsyncDirectoryPicker = () => {
  const [people, setPeople] = React.useState<PersonValue[]>([])
  const [val, setVal] = React.useState<PersonValue[]>([samplePeople[0], samplePeople[2]])
  React.useEffect(() => {
    const timer = window.setTimeout(() => setPeople(samplePeople), 1500)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div className="flex flex-col gap-2 max-w-xs">
      <PeoplePicker value={val} people={people} onChange={setVal} aria-label="任務協作者" />
      <p className="text-caption text-fg-secondary">
        Jira 任務「協作者」欄位場景：已選成員隨任務資料先抵達，組織人員名錄約 1.5 秒後才從 API 回來——已選的 avatar 與姓名立即顯示，不等名錄載入。
      </p>
    </div>
  )
}

export const AsyncDirectoryLoad: Story = {
  name: '人員清單非同步載入',
  render: () => <AsyncDirectoryPicker />,
}
