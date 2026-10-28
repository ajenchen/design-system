import type { Meta } from '@storybook/react'
import { ProfileCard, ProfileCardDefaultActions } from './profile-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'

const meta: Meta = {
  title: 'Design System/Components/ProfileCard/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '在 avatar 等 identity mark 上提供他人的角色、狀態、聯絡資訊與相關動作。需要快速理解協作者而不離開當前頁面時使用；自己的帳號操作改用 AccountMenu。' } },
  },
}
export default meta

const noop = () => {}

// ProfileCard canonical(2026-04-23):
// - 單一結構(Profile + Actions + Status + Fields + View more),consumer 僅傳 subset props
// - 透過 `<Avatar hoverCard={<ProfileCard.../>} />` canonical path(avatar.spec.md DS-wide rule)
//   Avatar 內部已處理 HoverCardTrigger + HoverCardContent + keyboard focus + ProfileCard wrapping chrome,
//   不需在 story 層手刻 HoverCard / HoverCardTrigger / HoverCardContent → 避免 raw button UA default
//   chrome(padding / border)污染視覺 + 對齊世界級 Slack / GitHub / LinkedIn hover-profile canonical。
// 名片資料前後一致(2026-10-20,獨立驗證 OV-V01 同族):狀態「離開」配休假訊息(原為「線上」配 Out of Office);
// 員工編號欄與副標裡的員工編號同一個值(原為副標 EMP-1001、欄位 1234567;兩個人共用 EMP-1001)
function ProfileCardHover({ name, src, subtitle, employeeNumber }: { name: string; src: string; subtitle: string; employeeNumber: string }) {
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
            status="away"
            statusMessage="Out of Office: Back on Monday! For urgent matters please contact @Wei-Lun Cheng in the meantime."
            actions={<ProfileCardDefaultActions onChat={noop} onCall={noop} />}
            defaultFieldValues={{ id: 'YHANAX', employeeNumber }}
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
    // @layout-space-magic-ok: 展開快照在四周保留 64px 畫布留白,讓開著的人員卡落在 story 畫布內(畫布留白,不是元素間距;layoutSpace.spec.md:176 判準)
    <div className="p-16 flex flex-col gap-[var(--layout-space-loose)]">
      <ProfileCardHover name="Hanamizuki Yukinome 花水木雪乃芽" src="https://i.pravatar.cc/128?u=hana" subtitle="Design｜D-0042｜EMP-1003" employeeNumber="EMP-1003" />
      <ProfileCardHover name="Alice Chen" src="https://i.pravatar.cc/128?u=alice" subtitle="Design｜D-0042｜EMP-1001" employeeNumber="EMP-1001" />
      <ProfileCardHover name="Bob Lin" src="https://i.pravatar.cc/128?u=bob" subtitle="Engineering｜E-0087｜EMP-1002" employeeNumber="EMP-1002" />
    </div>
  ),
}
