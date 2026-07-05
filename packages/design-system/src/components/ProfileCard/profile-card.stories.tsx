import type { Meta } from '@storybook/react'
import { ProfileCard, ProfileCardDefaultActions } from './profile-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'

const meta: Meta = {
  title: 'Design System/Components/ProfileCard/展示',
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// ProfileCard canonical(2026-04-23):
// - 單一結構(Profile + Actions + Status + Fields + View more),consumer 僅傳 subset props
// - 透過 `<Avatar hoverCard={<ProfileCard.../>} />` canonical path(avatar.spec.md DS-wide rule)
//   Avatar 內部已處理 HoverCardTrigger + HoverCardContent + keyboard focus + ProfileCard wrapping chrome,
//   不需在 story 層手刻 HoverCard / HoverCardTrigger / HoverCardContent → 避免 raw button UA default
//   chrome(padding / border)污染視覺 + 對齊世界級 Slack / GitHub / LinkedIn hover-profile canonical。
function ProfileCardHover({ name, src, subtitle }: { name: string; src: string; subtitle: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar
        src={src}
        alt={name}
        size={32}
        hoverCard={
          <ProfileCard
            name={name}
            avatar={{ src, alt: name }}
            subtitle={subtitle}
            status="online"
            statusMessage="Out of Office: Back on Monday! For urgent matters please contact @Wei-Lun Cheng in the meantime."
            actions={<ProfileCardDefaultActions />}
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
  name: '懸停展開 ProfileCard',
  render: () => (
    <div className="p-16 flex flex-col gap-6">
      <ProfileCardHover name="Hanamizuki Yukinome 花水木雪乃芽" src="https://i.pravatar.cc/128?u=hana" subtitle="Design｜D-0042｜EMP-1001" />
      <ProfileCardHover name="Alice Chen" src="https://i.pravatar.cc/128?u=alice" subtitle="Design｜D-0042｜EMP-1001" />
      <ProfileCardHover name="Bob Lin" src="https://i.pravatar.cc/128?u=bob" subtitle="Engineering｜E-0087｜EMP-1002" />
    </div>
  ),
}
