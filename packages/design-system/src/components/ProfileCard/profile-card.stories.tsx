import type { Meta } from '@storybook/react'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { SAMPLE_PEOPLE, samplePersonCard, type SamplePerson } from '@/design-system/stories-helpers/scene/person-card'

const meta: Meta = {
  title: 'Design System/Components/ProfileCard/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '在 avatar 等 identity mark 上提供他人的角色、狀態、聯絡資訊與相關動作。需要快速理解協作者而不離開當前頁面時使用；自己的帳號操作改用 AccountMenu。' } },
  },
}
export default meta

// ProfileCard canonical(2026-04-23):單一結構(Profile + Actions + Status + Fields + View more);人員頭像走
// `<Avatar hoverCard>`(avatar.spec.md DS-wide rule,Avatar 內部處理 HoverCardTrigger / 外殼 / 鍵盤聚焦)。
// 2026-10-28(稽核 M102):三個人各用自己的部門 / ID / 員工編號,狀態與狀態訊息成對,名字一般長度(原本「花水木雪乃芽」與 Alice 共用同一個副標、
// 三人同一句 OOO);名片走全 DS 同一支建構器與同一份名錄(stories-helpers/scene/person-card.tsx),傳訊息 / 語音通話 / 查看更多都有反應
// (記到 Storybook Actions 面板;profile-card.tsx「預設鈕必可接線,未傳 = dev-warn」)。
function ProfileCardHover({ person }: { person: SamplePerson }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar src={person.avatarSrc} alt={person.name} size={32} hoverCard={samplePersonCard(person)} />
      <span className="text-body">{person.name}</span>
    </span>
  )
}

export const Default = {
  name: '懸停展開 ProfileCard',
  render: () => (
    // @layout-space-magic-ok: 四周 64px 畫布留白是範例原值(與已發布版同值,F-S8),讓開著的人員卡落在 story 畫布內;規格沒寫這個值(放行章 (d))
    <div className="p-16 flex flex-col gap-[var(--layout-space-loose)]">
      <ProfileCardHover person={SAMPLE_PEOPLE.ada} />
      <ProfileCardHover person={SAMPLE_PEOPLE.alice} />
      <ProfileCardHover person={SAMPLE_PEOPLE.bob} />
    </div>
  ),
}
