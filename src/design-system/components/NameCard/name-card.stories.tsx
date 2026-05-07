import type { Meta } from '@storybook/react'
import { NameCard, NameCardDefaultActions } from './name-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'

const meta: Meta = {
  title: 'Design System/Components/NameCard/展示',
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// NameCard canonical(2026-04-23):
// - 單一結構(Profile + Actions + Status + Fields + View more),consumer 僅傳 subset props
// - 透過 `<Avatar hoverCard={<NameCard.../>} />` canonical path(avatar.spec.md DS-wide rule)
//   Avatar 內部已處理 HoverCardTrigger + HoverCardContent + keyboard focus + NameCard wrapping chrome,
//   不需在 story 層手刻 HoverCard / HoverCardTrigger / HoverCardContent → 避免 raw button UA default
//   chrome(padding / border)污染視覺 + 對齊世界級 Slack / GitHub / LinkedIn hover-profile canonical。
function NameCardHover({ name, src, subtitle }: { name: string; src: string; subtitle: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar
        src={src}
        alt={name}
        size={32}
        hoverCard={
          <NameCard
            name={name}
            avatar={{ src, alt: name }}
            subtitle={subtitle}
            status="online"
            statusMessage="Out of Office: Back on Monday! For urgent matters please contact @Wei-Lun Cheng in the meantime."
            actions={<NameCardDefaultActions />}
            defaultFieldValues={{ id: 'YHANAX', employeeNumber: '1234567' }}
            onViewMore={noop}
          />
        }
      />
      <span className="text-body">{name}</span>
    </span>
  )
}

export const Default = {
  name: 'Hover 展開 NameCard',
  render: () => (
    <div className="p-16 flex flex-col gap-6">
      <NameCardHover name="Hanamizuki Yukinome 花水木雪乃芽" src="https://i.pravatar.cc/128?u=hana" subtitle="Design｜D-0042｜EMP-1001" />
      <NameCardHover name="Alice Chen" src="https://i.pravatar.cc/128?u=alice" subtitle="Design｜D-0042｜EMP-1001" />
      <NameCardHover name="Bob Lin" src="https://i.pravatar.cc/128?u=bob" subtitle="Engineering｜E-0087｜EMP-1002" />
    </div>
  ),
}
