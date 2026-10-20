// @principles-rationale: UsageGuidance merges WhenToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import type { Meta, StoryObj } from '@storybook/react'
import { Settings, Bell, Home } from 'lucide-react'
import { Avatar } from './avatar'
import { MenuItem, MenuGroup } from '@/design-system/components/Menu/menu-item'
import { ProfileCard } from '@/design-system/components/ProfileCard/profile-card'
import { samplePersonCard } from '@/design-system/stories-helpers/scene/person-card'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Avatar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>Avatar 代表「誰」——人、團隊、組織、專案的視覺身份。適合的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li>留言者、指派者、團隊成員列表的人員識別;workspace / 組織 / App 的身份標識 —— 見 <StoryLink kind="Design System/Components/Avatar/展示" name="四模式">四模式</StoryLink></li>
            <li>成員沒上傳照片、或頭像圖片載入失敗時,以名字首字 + 色彩維持可辨識 —— 見 <StoryLink kind="Design System/Components/Avatar/展示" name="備援顯示">備援顯示</StoryLink></li>
            <li>通訊錄、成員選單、chat 列表等列表項目的主視覺 prefix —— 見 <StoryLink kind="Design System/Components/Avatar/展示" name="情境用例">情境用例</StoryLink></li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 代表抽象概念:用 Lucide Icon"
          note="「設定」「通知」「首頁」這類功能 / 動作 / 概念不是「誰」,是「做什麼」。Icon 更適合——Avatar 用在這裡會讓使用者以為是某個人的頭像"
        >
          <div className="border border-divider rounded-lg bg-surface">
            <MenuGroup aria-label="Avatar 誤用範例">
              {/* 真實誤用:把功能名「設定」直接當 avatar 的 alt,fallback 渲染首字「設」的色塊,看起來像某個成員或群組 */}
              <MenuItem role="presentation" avatar={{ alt: '設定' }}>設定</MenuItem>
            </MenuGroup>
          </div>
          <ExampleCaption warn>↑ ❌ 「設定」是功能不是「誰」,套 Avatar 後 fallback 渲染首字「設」的色塊,使用者誤以為是某位成員或群組。功能導覽應用 Lucide icon</ExampleCaption>
          <div className="border border-divider rounded-lg bg-surface">
            <MenuGroup aria-label="功能圖示正確用法">
              <MenuItem role="presentation" startIcon={Settings}>設定</MenuItem>
            </MenuGroup>
          </div>
          <ExampleCaption>↑ ✅ 功能 / 動作 / 概念用 Lucide icon,語義清楚不會誤認身份</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ src 壞掉又沒 name → 空 avatar(不可辨識)"
          note="Avatar 的核心是識別身份,沒 name 又沒 src 等於失去意義。必須至少有 name"
        >
          <Avatar alt="" size={40} src="https://invalid-url.example/fail.jpg" />
          <ExampleCaption warn>↑ 空 avatar → 使用者不知道是誰</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Avatar 代表身份,Icon 代表概念"
          note="判斷法:「這代表『誰』還是『做什麼』?」誰 / 什麼實體 → Avatar;做什麼 / 某個概念 → Icon"
        >
          {/* 選單 → 解讀它的圖例 = labeling(tight);兩者成一組,與 Rule 內其他範例並列(loose 由 Rule 擁有) */}
          <div className="flex flex-col gap-[var(--layout-space-tight)]">
            <div className="border border-divider rounded-lg bg-surface">
              <MenuGroup aria-label="身份與功能圖示對照">
                {/* 人員 → 真實人像;團隊 / 組織 → 首字 + 色彩(非人臉,letter mark 是 Slack workspace idiom)*/}
                <MenuItem role="presentation" avatar={{ src: 'https://i.pravatar.cc/48?u=ada-chen', alt: 'Ada Chen' }}>Ada Chen 的留言</MenuItem>
                <MenuItem role="presentation" avatar={{ alt: 'Engineering Team', color: 'blue' }}>Engineering Team 專案</MenuItem>
              </MenuGroup>
            </div>
            {/* 視覺圖例(legend),非 list item;四個並列圖例 → loose */}
            <div className="flex items-center gap-[var(--layout-space-loose)] flex-wrap">
              {/* @anatomy-exempt-next  @layout-space-magic-ok: 頭像 / 圖示 ↔ 名稱(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-2">
                <Avatar src="https://i.pravatar.cc/48?u=ada-chen" alt="Ada Chen" size={24} />
                <span className="text-footnote text-fg-muted">人員</span>
              </div>
              {/* @layout-space-magic-ok: 頭像 / 圖示 ↔ 名稱(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-2">
                <Home size={16} />
                <span className="text-footnote text-fg-muted">首頁(概念)</span>
              </div>
              {/* @anatomy-exempt-next  @layout-space-magic-ok: 頭像 / 圖示 ↔ 名稱(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-2">
                <Avatar alt="ABC Corp" size={24} color="purple" />
                <span className="text-footnote text-fg-muted">組織</span>
              </div>
              {/* @layout-space-magic-ok: 頭像 / 圖示 ↔ 名稱(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-2">
                <Bell size={16} />
                <span className="text-footnote text-fg-muted">通知(動作)</span>
              </div>
            </div>
          </div>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const FallbackRule: Story = {
  name: '後備順序',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="有 src → 顯示圖片;沒有 src / 圖片載入失敗 → 顯示 initials"
        note={<>Fallback 用 <code>alt</code> 取首字母(一律取第一個字元並轉大寫,不分中英)。背景色由 <code>color</code> prop 決定</>}
      >
        {/* 刻意示範 initials fallback:後三顆**必須**無 src(fallback 順序示範,
            2026-07-08 demo 人像真實化 sweep 豁免保留) */}
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          <Avatar alt="Ada Chen" size={40} src="https://i.pravatar.cc/80?img=1" />
          <Avatar alt="Ada Chen" size={40} />
          <Avatar alt="Alice Wang" size={40} />
          <Avatar alt="ABC Corp" size={40} color="blue" />
        </div>
        <ExampleCaption>↑ 依序:有圖 / 無 src 取首字母 / 英文取首字母 / 組織首字 + 色彩</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const WithBadgeOverlayRule: Story = {
  name: '頭像疊加層:在線小點 / 計數徽章',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Avatar 右下角 status dot — presence(在線 / 忙碌 / 離開 / 離線)"
        note={<>用 Avatar 的 <code>status</code> prop(不是手刻 <code>&lt;Badge dot&gt;</code>)—— 顏色走 presence semantic token(<code>--status-online</code> 等,獨立於 success / error / warning),位置固定 avatar 右下角,尺寸程式化 28%</>}
      >
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada" size={40} status="online" />
          <Avatar src="https://i.pravatar.cc/80?u=alex-wang" alt="Alex" size={40} status="busy" />
          <Avatar src="https://i.pravatar.cc/80?u=ben-liu" alt="Ben" size={40} status="away" />
          <Avatar src="https://i.pravatar.cc/80?u=bella-wu" alt="Bella" size={40} status="offline" />
        </div>
        <ExampleCaption>↑ online / busy / away / offline ── 狀態點本身不另發語音標籤,在線狀態整合進頭像的 alt 文字(例 alt="Ada(在線)"),避免一長串成員名單同時朗讀造成讀屏洪水</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="Avatar 右上角 count badge — 未讀訊息(chat / messenger 場景)"
        note={<>用 Avatar 的 <code>badgeCount</code> prop(不是手刻 <code>&lt;Badge count&gt;</code>)—— 內部消費 DS Badge critical variant,與頭像之間的縫從圓上挖出來(不畫外圈),max=99 自動處理 99+</>}
      >
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada" size={40} badgeCount={3} />
          <Avatar src="https://i.pravatar.cc/80?u=alex-wang" alt="Alex" size={40} badgeCount={12} />
          <Avatar src="https://i.pravatar.cc/80?u=ben-liu" alt="Ben" size={40} badgeCount={128} />
        </div>
        <ExampleCaption>↑ count 3 / 12 / 128(超過 99 顯示 "99+")</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="✅ status(右下 presence)+ badgeCount(右上 count)可並存"
        note="兩者是不同角、不同語義的 slot(presence=這個人的線上狀態,右下;count=此對話未讀量,右上),與 Badge 的「Avatar 可疊狀態點 + 計數」一致,也是 Slack / Teams / iMessage / LINE 標配。signal crowding 只禁「同一角疊兩個同類 indicator」(如右上同時 count + dot),不禁不同角不同語義的兩個訊號"
      >
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          <Avatar src="https://i.pravatar.cc/80?u=ada-chen" alt="Ada" size={40} status="online" badgeCount={3} />
          <Avatar src="https://i.pravatar.cc/80?u=alex-wang" alt="Alex" size={40} status="busy" />
          <Avatar src="https://i.pravatar.cc/80?u=ben-liu" alt="Ben" size={40} badgeCount={12} />
        </div>
        <ExampleCaption>↑ Ada 同時 presence(右下)+ count(右上)並存;Alex 只 presence;Ben 只 count</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const HoverCardIntegrationRule: Story = {
  name: 'Avatar + ProfileCard 整合',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="人員 Avatar 的 hover 預覽必須用 ProfileCard"
        note="ProfileCard 是 DS 設計準則 人員 hover 內容元件(avatar + name + subtitle + actions + status + fields 統一佈局)。Avatar 的 hoverCard prop 接 ProfileCard,不可手刻 JSX — 手刻會漂移出 ProfileCard 對齊 / 間距 / status token 規則"
      >
        <Avatar
          src="https://i.pravatar.cc/80?u=ada-chen"
          alt="Ada Chen"
          size={40}
          hoverCard={
            samplePersonCard({ name: 'Ada Chen', subtitle: 'Design Engineer · 台北', avatarSrc: 'https://i.pravatar.cc/80?u=ada-chen', id: 'ADACHEN', employeeNumber: '1048217' })
          }
        />
        <ExampleCaption>↑ hover avatar 彈出 ProfileCard(action 列:傳訊息 + 語音通話 設計準則)</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 關鍵資訊只靠 hover 顯示(觸控裝置看不到)"
        note="ProfileCard hover 本身用法沒錯,問題是「資訊的唯一出口」。觸控裝置無 hover 能力,若必看資訊(狀態角色、是否離職、權限等)只出現在 hover 浮層裡,平板 / 手機使用者完全錯過。hover 是補充資訊管道,不是關鍵資訊唯一載體"
      >
        <div className="flex items-start gap-[var(--layout-space-loose)]">
          <ExampleGroup>
            <Avatar src="https://i.pravatar.cc/96?u=alex-wang" alt="Alex Wang" size={48}
              hoverCard={
                <ProfileCard name="Alex Wang" subtitle="Engineer · 已離職" onViewMore={() => {}} />
              }
            />
            <ExampleCaption warn>❌ 「已離職」只出現在 hover 內 — 觸控使用者看不到,可能誤發訊息給已離職成員</ExampleCaption>
          </ExampleGroup>
          <ExampleGroup>
            {/* 主畫面呈現關鍵狀態:Family 2 row 結構(avatar + label + description)由 MenuItem
                承載——size=lg 觸發 block 對齊(avatar 跨越 label + description 中心)。
                這正是 item-anatomy.spec.md 的 Family 2 設計準則,不手刻 flex row。 */}
            <div className="border border-divider rounded-lg bg-surface w-full">
              <MenuGroup aria-label="成員狀態列表">
                <MenuItem role="presentation"
                  size="lg"
                  avatar={{ src: 'https://i.pravatar.cc/64?u=alex-wang', alt: 'Alex Wang' }}
                  description={<span className="text-error">已離職</span>}
                >
                  Alex Wang
                </MenuItem>
              </MenuGroup>
            </div>
            <ExampleCaption>✅ 關鍵狀態直接在主畫面呈現(Family 2 MenuItem 的 description slot 標示),hover 只補充細節</ExampleCaption>
          </ExampleGroup>
        </div>
      </TutorialRule>
    </TutorialPage>
  ),
}
