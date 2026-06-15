// @principles-rationale: UsageGuidance merges WhenToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Settings, Bell, Home } from 'lucide-react'
import { Avatar } from './avatar'
import { MenuItem } from '@/design-system/components/Menu/menu-item'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'

const meta: Meta = {
  title: 'Design System/Components/Avatar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>Avatar 代表「誰」——人、團隊、組織、專案的視覺身份。適合的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>留言者、指派者、團隊成員列表的人員識別;workspace / 組織 / App 的身份標識 —— 見 <LinkTo kind="Design System/Components/Avatar/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">四模式</span></LinkTo></li>
            <li>成員沒上傳照片、或頭像圖片載入失敗時,以名字首字 + 色彩維持可辨識 —— 見 <LinkTo kind="Design System/Components/Avatar/展示" name="備援顯示"><span className="text-primary hover:underline font-medium cursor-pointer">備援顯示</span></LinkTo></li>
            <li>通訊錄、成員選單、chat 列表等列表項目的主視覺 prefix —— 見 <LinkTo kind="Design System/Components/Avatar/展示" name="情境用例"><span className="text-primary hover:underline font-medium cursor-pointer">情境用例</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 代表抽象概念:用 Lucide Icon"
          note="「設定」「通知」「首頁」這類功能 / 動作 / 概念不是「誰」,是「做什麼」。Icon 更適合——Avatar 用在這裡會讓使用者以為是某個人的頭像"
        >
          <div className="border border-divider rounded-lg bg-surface py-1">
            {/* 真實誤用:把功能名「設定」直接當 avatar 的 alt,fallback 渲染首字「設」的色塊,看起來像某個成員或群組 */}
            <MenuItem avatar={{ alt: '設定' }}>設定</MenuItem>
          </div>
          <Label warn>↑ ❌ 「設定」是功能不是「誰」,套 Avatar 後 fallback 渲染首字「設」的色塊,使用者誤以為是某位成員或群組。功能導覽應用 Lucide icon</Label>
          <div className="border border-divider rounded-lg bg-surface py-1">
            <MenuItem startIcon={Settings}>設定</MenuItem>
          </div>
          <Label>↑ ✓ 功能 / 動作 / 概念用 Lucide icon,語義清楚不會誤認身份</Label>
        </Rule>

        <Rule
          title="❌ src 壞掉又沒 name → 空 avatar(不可辨識)"
          note="Avatar 的核心是識別身份,沒 name 又沒 src 等於失去意義。必須至少有 name"
        >
          <Avatar alt="" size={40} src="https://invalid-url.example/fail.jpg" />
          <Label warn>↑ 空 avatar → 使用者不知道是誰</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="Avatar 代表身份,Icon 代表概念"
          note="判斷法:「這代表『誰』還是『做什麼』?」誰 / 什麼實體 → Avatar;做什麼 / 某個概念 → Icon"
        >
          <div className="border border-divider rounded-lg bg-surface py-1">
            <MenuItem avatar={{ alt: 'Ada Chen' }}>Ada Chen 的留言</MenuItem>
            <MenuItem avatar={{ alt: 'Engineering Team', color: 'blue' }}>Engineering Team 專案</MenuItem>
          </div>
          {/* 視覺圖例(legend),非 list item */}
          <div className="flex items-center gap-3 flex-wrap mt-2">
            {/* @anatomy-exempt-next */}
            <div className="flex items-center gap-2">
              <Avatar alt="Ada Chen" size={24} />
              <span className="text-footnote text-fg-muted">人員</span>
            </div>
            <div className="flex items-center gap-2">
              <Home size={16} />
              <span className="text-footnote text-fg-muted">首頁(概念)</span>
            </div>
            {/* @anatomy-exempt-next */}
            <div className="flex items-center gap-2">
              <Avatar alt="ABC Corp" size={24} color="purple" />
              <span className="text-footnote text-fg-muted">組織</span>
            </div>
            <div className="flex items-center gap-2">
              <Bell size={16} />
              <span className="text-footnote text-fg-muted">通知(動作)</span>
            </div>
          </div>
        </Rule>
      </Section>
    </div>
  ),
}

export const FallbackRule: Story = {
  name: '後備順序',
  render: () => (
    <div>
      <Rule
        title="有 src → 顯示圖片;沒有 src / 圖片載入失敗 → 顯示 initials"
        note="Fallback 用 `alt` 取首字母(一律取第一個字元並轉大寫,不分中英)。背景色由 `color` prop 決定"
      >
        <div className="flex items-center gap-3">
          <Avatar alt="Ada Chen" size={40} src="https://i.pravatar.cc/80?img=1" />
          <Avatar alt="Ada Chen" size={40} />
          <Avatar alt="Alice Wang" size={40} />
          <Avatar alt="ABC Corp" size={40} color="blue" />
        </div>
        <Label>↑ 依序:有圖 / 無 src 取首字母 / 英文取首字母 / 組織首字 + 色彩</Label>
      </Rule>
    </div>
  ),
}

export const WithBadgeOverlayRule: Story = {
  name: '頭像疊加層:在線小點 / 計數徽章',
  render: () => (
    <div>
      <Rule
        title="Avatar 右下角 status dot — presence(在線 / 忙碌 / 離開 / 離線)"
        note="用 Avatar 的 `status` prop(不是手刻 `<Badge dot>`)—— 顏色走 presence semantic token(`--status-online` 等,獨立於 success / error / warning),位置固定 avatar 右下角,尺寸程式化 28%"
      >
        <div className="flex items-center gap-4">
          <Avatar alt="Ada" size={40} status="online" />
          <Avatar alt="Alex" size={40} status="busy" />
          <Avatar alt="Ben" size={40} status="away" />
          <Avatar alt="Bella" size={40} status="offline" />
        </div>
        <Label>↑ online / busy / away / offline ── 狀態點本身不另發語音標籤,在線狀態整合進頭像的 alt 文字(例 alt="Ada(在線)"),避免一長串成員名單同時朗讀造成讀屏洪水</Label>
      </Rule>

      <Rule
        title="Avatar 右上角 count badge — 未讀訊息(chat / messenger 場景)"
        note="用 Avatar 的 `badgeCount` prop(不是手刻 `<Badge count>`)—— 內部消費 DS Badge critical variant + surface ring,max=99 自動處理 99+"
      >
        <div className="flex items-center gap-4">
          <Avatar alt="Ada" size={40} badgeCount={3} />
          <Avatar alt="Alex" size={40} badgeCount={12} />
          <Avatar alt="Ben" size={40} badgeCount={128} />
        </div>
        <Label>↑ count 3 / 12 / 128(超過 99 顯示 "99+")</Label>
      </Rule>

      <Rule
        title="✅ status(右下 presence)+ badgeCount(右上 count)可並存"
        note="兩者是**不同角、不同語義**的 slot(presence=這個人的線上狀態,右下;count=此對話未讀量,右上),對齊 `badge.spec.md`「Avatar 可疊 status + count」canonical + Slack / Teams / iMessage / LINE 標配。**signal crowding 只禁「同一角疊兩個同類 indicator」**(如右上同時 count + dot),不禁不同角不同語義的兩個訊號"
      >
        <div className="flex items-center gap-4">
          <Avatar alt="Ada" size={40} status="online" badgeCount={3} />
          <Avatar alt="Alex" size={40} status="busy" />
          <Avatar alt="Ben" size={40} badgeCount={12} />
        </div>
        <Label>↑ Ada 同時 presence(右下)+ count(右上)並存;Alex 只 presence;Ben 只 count</Label>
      </Rule>
    </div>
  ),
}

export const HoverCardIntegrationRule: Story = {
  name: 'Avatar + ProfileCard 整合',
  render: () => (
    <div>
      <Rule
        title="人員 Avatar 的 hover 預覽必須用 ProfileCard"
        note="ProfileCard 是 DS 設計準則 人員 hover 內容元件(avatar + name + subtitle + actions + status + fields 統一佈局)。Avatar 的 hoverCard prop 接 ProfileCard,不可手刻 JSX — 手刻會漂移出 ProfileCard 對齊 / 間距 / status token 規則"
      >
        <Avatar
          alt="Ada Chen"
          size={40}
          hoverCard={
            <ProfileCard
              name="Ada Chen"
              subtitle="Design Engineer · 台北"
              avatar={{ alt: 'Ada Chen' }}
              status="online"
              statusMessage="Out of Office: Back on Monday!"
              actions={<ProfileCardDefaultActions />}
              fields={[
                { label: 'ID', value: 'YHANAX' },
                { label: 'Employee number', value: '1234567' },
              ]}
              onViewMore={() => {}}
            />
          }
        />
        <Label>↑ hover avatar 彈出 ProfileCard(action 列:Chat + Audio call 設計準則)</Label>
      </Rule>

      <Rule
        title="❌ 關鍵資訊只靠 hover 顯示(觸控裝置看不到)"
        note="ProfileCard hover 本身用法沒錯,問題是「資訊的唯一出口」。觸控裝置無 hover 能力,若必看資訊(狀態角色、是否離職、權限等)只出現在 hover 浮層裡,平板 / 手機使用者完全錯過。hover 是**補充資訊**管道,不是**關鍵資訊**唯一載體"
      >
        <div className="flex items-start gap-8">
          <div className="flex flex-col gap-2">
            <Avatar alt="Alex Wang" size={48}
              hoverCard={
                <ProfileCard name="Alex Wang" subtitle="Engineer · 已離職" onViewMore={() => {}} />
              }
            />
            <Label warn>❌ 「已離職」只出現在 hover 內 — 觸控使用者看不到,可能誤發訊息給已離職成員</Label>
          </div>
          <div className="flex flex-col gap-2">
            {/* 主畫面呈現關鍵狀態:Family 2 row 結構(avatar + label + description)由 MenuItem
                承載——size=lg 觸發 block 對齊(avatar 跨越 label + description 中心)。
                這正是 item-anatomy.spec.md 的 Family 2 設計準則,不手刻 flex row。 */}
            <div className="border border-divider rounded-lg bg-surface py-1 w-full">
              <MenuItem
                size="lg"
                avatar={{ alt: 'Alex Wang' }}
                description={<span className="text-error">已離職</span>}
              >
                Alex Wang
              </MenuItem>
            </div>
            <Label>✅ 關鍵狀態直接在主畫面呈現(Family 2 MenuItem 的 description slot 標示),hover 只補充細節</Label>
          </div>
        </div>
      </Rule>
    </div>
  ),
}
