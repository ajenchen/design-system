// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   SizeMatrix N/A — ProfileCard 是固定寬度(320px)hover content template,
//     不提供 size prop;所有尺寸 token 已於 Overview「Layout Token」段列出
//     (avatar 64px / padding / gap)。SectionMatrix 已涵蓋 minimal → full 五
//     種組合的視覺差異。
import type { Meta, StoryObj } from '@storybook/react'
import { MessageCircle, UserPlus } from 'lucide-react'
import { ProfileCard, ProfileCardDefaultActions } from './profile-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/design-system/components/HoverCard/hover-card'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

type InspectorArgs = {
  name: string
  subtitle: string
  status: 'none' | 'online' | 'away' | 'busy' | 'offline'
  withStatusMessage: boolean
  withActions: boolean
  withFields: boolean
  withViewMore: boolean
}

const meta: Meta = {
  title: 'Design System/Internal/ProfileCard/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<InspectorArgs>

/* ═══════════════════════════════════════════════════════════════════════════
   1. Overview — anatomy + structure + props + layout tokens
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          ProfileCard 是人員 HoverCard 的**內容元件**——提供統一的人員資訊展示格式。本身不含觸發或定位邏輯
          (那是 HoverCard 的職責),只是 HoverCard content 的標準人員模板。固定寬度 320px。
        </Desc>
        <div className="border border-border rounded-lg p-4">
          <ProfileCard
            name="Ada Chen"
            subtitle="Design Engineer · Engineering"
            status="online"
            statusMessage="目前 Sprint 23 衝刺中,訊息可能稍慢回覆"
            actions={
              <>
                <Button variant="primary" size="sm" startIcon={MessageCircle}>傳訊</Button>
                <Button variant="tertiary" size="sm" startIcon={UserPlus}>追蹤</Button>
              </>
            }
            fields={[
              { label: 'Email', value: 'ada.chen@example.com' },
              { label: '團隊', value: 'Engineering' },
              { label: '時區', value: 'UTC+8' },
              { label: '員工編號', value: '#E-2048' },
            ]}
            onViewMore={() => {}}
          />
        </div>
      </div>

      <div>
        <H3>5 個 Section 結構</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Section</Th><Th>內容</Th><Th>觸發條件</Th><Th>分隔</Th></tr></thead>
            <tbody>
              <tr><Td>Profile header</Td><Td>Avatar 64px + Name + Subtitle</Td><Td>永遠顯示</Td><Td>—</Td></tr>
              <tr><Td>Action buttons</Td><Td>CTA(Message / Follow / Invite)</Td><Td mono>actions 有值</Td><Td>無(貼在 profile 下)</Td></tr>
              <tr><Td>Status 區</Td><Td>狀態標籤 + 可選 statusMessage</Td><Td mono>status 有值</Td><Td mono>border-t border-divider</Td></tr>
              <tr><Td>Info fields</Td><Td>DescriptionList cols=2</Td><Td>永遠顯示(always-render,缺值顯 — 佔位)</Td><Td mono>border-t border-divider</Td></tr>
              <tr><Td>View more</Td><Td>Button variant=link, 填滿寬度</Td><Td mono>onViewMore 有值</Td><Td mono>border-t border-divider</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Section 之間用 `border-t border-divider` 分隔(元件固定結構,consumer 不決定是否分隔,見
          `separator.spec.md`「元件固定結構 → CSS border-t/b」)。
        </p>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['name', 'string', '必填', '姓名(profile header)'],
                ['subtitle', 'string', '—', '職稱 / 位置 / 描述'],
                ['avatar', 'AvatarData', '—', '{ src?, alt?, color? };size/status 由 ProfileCard 覆寫'],
                ['status', "'online' | 'away' | 'busy' | 'offline'", '—', '觸發 Status section + Avatar 狀態點'],
                ['statusMessage', 'ReactNode', '—', '狀態說明文字(完整顯示,內容多時 Body 區捲動)'],
                ['actions', 'ReactNode', '—', 'CTA buttons(通常 2 個 sm Button)'],
                ['fields', '{ label: string; value: ReactNode }[]', '—', 'Consumer 自訂 info fields(email / phone / 團隊 等),append 在 default 之後,走 DescriptionList cols=2'],
                ['defaultFieldValues', "Partial<Record<'id' | 'employeeNumber', ReactNode>>", '—', '填 default field(id / Employee number)真實值的正規入口,缺值顯 — 佔位;優於用 fields 傳同名 label(後者 dev mode 會 console.warn)'],
                ['onViewMore', '() => void', '—', 'View more callback(有值才顯示該 section)'],
                ['viewMoreLabel', 'string', "'View more'", 'View more button 文字'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Layout Token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>位置</Th><Th>Token / Value</Th></tr></thead>
            <tbody>
              <tr><Td>Card 寬度</Td><Td mono>w-[320px](元件級常數,不抽 token)</Td></tr>
              <tr><Td>Profile header padding</Td><Td mono>px-4 py-3</Td></tr>
              <tr><Td>Profile avatar / text gap</Td><Td mono>gap-3</Td></tr>
              <tr><Td>Avatar 大小</Td><Td mono>64px(對齊 Avatar.block tier)</Td></tr>
              <tr><Td>Actions padding</Td><Td mono>px-4 pb-3 + gap-2</Td></tr>
              <tr><Td>Status / Info padding</Td><Td mono>px-4 py-3</Td></tr>
              <tr><Td>View more padding</Td><Td mono>px-4 py-3</Td></tr>
              <tr><Td>Section 分隔</Td><Td mono>border-t border-divider</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Inspector — interactive Storybook Controls inspector
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: InspectorStory = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story: '在右側 Controls 面板切換 status / 各 section 的開關,即時查看 ProfileCard 在不同組合下的呈現。世界級 DS 的 Inspector = Figma inspect 替代。',
      },
    },
  },
  args: {
    name: 'Ada Chen',
    subtitle: 'Design Engineer · Engineering',
    status: 'online',
    withStatusMessage: true,
    withActions: true,
    withFields: true,
    withViewMore: true,
  },
  argTypes: {
    name: { control: 'text', description: '姓名' },
    subtitle: { control: 'text', description: '職稱 / 描述' },
    status: {
      control: 'select',
      options: ['none', 'online', 'away', 'busy', 'offline'],
      description: 'Avatar presence + Status section(none = 不渲染 status 區)',
    },
    withStatusMessage: { control: 'boolean', description: '是否顯示 status message(需搭配 status)' },
    withActions: { control: 'boolean', description: '是否顯示 Chat + Audio call 預設動作列' },
    withFields: { control: 'boolean', description: '是否顯示 Info fields(DescriptionList)' },
    withViewMore: { control: 'boolean', description: '是否顯示 View more 連結' },
  },
  render: (args) => {
    const status = args.status === 'none' ? undefined : args.status
    return (
      <div className="border border-dashed border-divider rounded-md p-4 inline-block">
        <ProfileCard
          name={args.name}
          subtitle={args.subtitle}
          status={status}
          statusMessage={args.withStatusMessage && status ? '目前 Sprint 23 衝刺中,訊息可能稍慢回覆' : undefined}
          actions={args.withActions ? <ProfileCardDefaultActions /> : undefined}
          fields={
            args.withFields
              ? [
                  { label: 'Email', value: 'ada@example.com' },
                  { label: '團隊', value: 'Engineering' },
                  { label: '時區', value: 'UTC+8' },
                  { label: '員工編號', value: '#E-2048' },
                ]
              : undefined
          }
          onViewMore={args.withViewMore ? () => {} : undefined}
        />
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. SectionMatrix — show 5 sections in combinations (minimal → full)
   ═══════════════════════════════════════════════════════════════════════════ */

export const SectionMatrix: Story = {
  name: '區段 組合（最小 → 完整）',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Minimal — profile header + View more</H3>
        <Desc>最小形式:avatar + name + subtitle + **View more**(hover context 必含,見 spec「View more canonical」)。@mention hover 場景 user 點 View more 跳完整 profile。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard name="Alice Wang" subtitle="Frontend Engineer" onViewMore={() => {}} />
        </div>
      </div>

      <div>
        <H3>+ Status 區</H3>
        <Desc>加上即時狀態——Slack / Teams 類即時溝通場景必要,讓使用者知道現在是否方便聯絡。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Bob Chen"
            subtitle="PM, Growth"
            status="busy"
            statusMessage="開會中,下午 3 點後回覆"
          />
        </div>
      </div>

      <div>
        <H3>+ Actions</H3>
        <Desc>加上快速動作——留言區 hover 顯示「傳訊」/「追蹤」,減少跳轉 profile 頁的摩擦。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Diana Lin"
            subtitle="Engineering Manager"
            status="online"
            actions={
              <>
                <Button variant="primary" size="sm" startIcon={MessageCircle}>傳訊</Button>
                <Button variant="tertiary" size="sm" startIcon={UserPlus}>追蹤</Button>
              </>
            }
          />
        </div>
      </div>

      <div>
        <H3>+ Info fields</H3>
        <Desc>加上結構化資訊——組織頁成員列表 hover 看到聯絡方式,不用跳去 profile。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Ada Chen"
            subtitle="Design Engineer"
            status="online"
            fields={[
              { label: 'Email', value: 'ada.chen@example.com' },
              { label: '團隊', value: 'Engineering' },
              { label: '時區', value: 'UTC+8' },
              { label: '員工編號', value: '#E-2048' },
            ]}
          />
        </div>
      </div>

      <div>
        <H3>Full — 所有 section 都有</H3>
        <Desc>完整資訊卡(profile + actions + status + fields + view more)。適合公司內部組織工具的成員 hover,一次看到所有重要資訊。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Ada Chen"
            subtitle="Design Engineer · Engineering"
            status="online"
            statusMessage="目前專案 Sprint 23 衝刺中"
            actions={
              <>
                <Button variant="primary" size="sm" startIcon={MessageCircle}>傳訊</Button>
                <Button variant="tertiary" size="sm" startIcon={UserPlus}>追蹤</Button>
              </>
            }
            fields={[
              { label: 'Email', value: 'ada.chen@example.com' },
              { label: '團隊', value: 'Engineering' },
              { label: '時區', value: 'UTC+8' },
              { label: '員工編號', value: '#E-2048' },
            ]}
            onViewMore={() => {}}
          />
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. ColorMatrix — 4 status × avatar dot + bg color mapping
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>四種狀態對應色彩(Avatar 狀態點 + Status 區)</H3>
        <Desc>
          狀態點顏色語意對齊 Slack / Teams / Linear 業界共識。Status 區的標籤底色一律 `bg-muted` 保持中性
          (狀態是**展示資訊**,不可點擊,避免暗示互動性)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>status</Th><Th>顯示文字</Th><Th>Avatar dot 色</Th><Th>Status 區 bg</Th><Th>語意</Th></tr></thead>
            <tbody>
              <tr><Td mono>online</Td><Td mono>Online</Td><Td><TokenCell token="--status-online" /></Td><Td><TokenCell token="--muted" /></Td><Td>正常可聯絡</Td></tr>
              <tr><Td mono>away</Td><Td mono>Away</Td><Td><TokenCell token="--status-away" /></Td><Td><TokenCell token="--muted" /></Td><Td>暫時離開</Td></tr>
              <tr><Td mono>busy</Td><Td mono>Busy</Td><Td><TokenCell token="--status-busy" /></Td><Td><TokenCell token="--muted" /></Td><Td>勿打擾</Td></tr>
              <tr><Td mono>offline</Td><Td mono>Offline</Td><Td><TokenCell token="--status-offline" /></Td><Td><TokenCell token="--muted" /></Td><Td>離線</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>四種狀態實際渲染</H3>
        <div className="grid grid-cols-2 gap-4">
          {(['online', 'away', 'busy', 'offline'] as const).map(s => (
            <div key={s} className="border border-dashed border-divider rounded-md p-3">
              <div className="text-caption text-fg-muted mb-2 font-mono">status="{s}"</div>
              <ProfileCard name="Ada Chen" subtitle="Design Engineer" status={s} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <H3>Typography Token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>區域</Th><Th>Token / Class</Th><Th>色彩</Th></tr></thead>
            <tbody>
              <tr><Td>Name</Td><Td mono>text-body-lg font-medium</Td><Td><TokenCell token="--foreground" /></Td></tr>
              <tr><Td>Subtitle</Td><Td mono>text-body</Td><Td><TokenCell token="--fg-secondary" /></Td></tr>
              <tr><Td>Status 文字</Td><Td mono>text-body</Td><Td><TokenCell token="--foreground" /></Td></tr>
              <tr><Td>Info label</Td><Td mono>text-body(via DescriptionList)</Td><Td><TokenCell token="--fg-secondary" /></Td></tr>
              <tr><Td>Info value</Td><Td mono>text-body(via DescriptionList)</Td><Td><TokenCell token="--foreground" /></Td></tr>
              <tr><Td>View more</Td><Td mono>Button variant=link size=sm</Td><Td><TokenCell token="--primary" /></Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. HoverCardIntegration — 標準用法範例
   ═══════════════════════════════════════════════════════════════════════════ */

export const HoverCardIntegration: Story = {
  name: 'HoverCard 整合（觸發行為）',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Avatar hover → ProfileCard 展開</H3>
        <Desc>
          ProfileCard 的設計準則 消費方式:放進 HoverCardContent 內。HoverCard 負責觸發 / 定位 / 進退場,
          ProfileCard 只專注內容。align="start" 讓 card 左邊對齊 avatar 左邊(視覺動線穩定)。
        </Desc>
        <div className="border border-border rounded-lg p-6 flex items-center gap-8">
          {[
            { name: 'Ada Chen（範例人名）', subtitle: 'Design Engineer', status: 'online' as const },
            { name: 'Alice Wang', subtitle: 'Frontend Engineer', status: 'busy' as const },
            { name: 'Bob Chen', subtitle: 'PM, Growth', status: 'away' as const },
          ].map(p => (
            <HoverCard key={p.name}>
              <HoverCardTrigger asChild>
                <span className="inline-block cursor-pointer">
                  <Avatar alt={p.name} size={40} status={p.status} />
                </span>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="p-0" sideOffset={8}>
                <ProfileCard
                  name={p.name}
                  subtitle={p.subtitle}
                  status={p.status}
                  fields={[
                    { label: 'Email', value: `${p.name.split(' ')[0].toLowerCase()}@example.com` },
                    { label: '團隊', value: 'Engineering' },
                  ]}
                  onViewMore={() => {}}
                />
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Hover 任一 avatar → ProfileCard 從左上展開,含狀態點 + 資訊 + View more。
        </p>
      </div>

      <div>
        <H3>互動分工</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>行為</Th><Th>負責元件</Th></tr></thead>
            <tbody>
              <tr><Td>Hover 觸發 / 關閉延遲</Td><Td mono>HoverCard(openDelay / closeDelay)</Td></tr>
              <tr><Td>浮層定位(align / side / sideOffset)</Td><Td mono>HoverCardContent</Td></tr>
              <tr><Td>進退場動畫(fade + zoom)</Td><Td mono>HoverCardContent</Td></tr>
              <tr><Td>內容佈局(5 sections)</Td><Td mono>ProfileCard</Td></tr>
              <tr><Td>固定 320px 寬</Td><Td mono>ProfileCard</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          ProfileCard 和 HoverCard 嚴格分工:ProfileCard 不管浮層行為,HoverCard 不管人員內容。
        </p>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. StateBehavior — edge cases (empty, overflow, multiline)
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>長 name 自動換行,avatar 不變形</H3>
        <Desc>
          Profile header 的 text column `minHeight = avatar size`:短文字垂直置中於 avatar,
          多行 name 自然撐高(不截斷,name 是識別主體)。Avatar `shrink-0` 永遠 64px square。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Alexander Benjamin Christopher Davidson-Williams III"
            subtitle="Senior Staff Principal Engineer"
          />
        </div>
      </div>

      <div>
        <H3>長 status message 完整顯示,卡片不無限撐高</H3>
        <Desc>
          statusMessage 完整顯示不截斷。內容變長時,Body 區（status + 資訊欄位）會在
          固定高度內出現捲軸,不會把整張卡片撐到超出畫面。Header 與 View more 始終固定可見。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Ada Chen"
            subtitle="Design Engineer"
            status="busy"
            statusMessage="目前正在衝刺 Sprint 23 的 design system audit,預計 4/25 完成,期間除 P0 issue 外不處理新功能需求,緊急事項請聯絡 @alice 或 @bob 代理"
          />
        </div>
      </div>

      <div>
        <H3>無 status、只有 actions(profile header + actions)</H3>
        <Desc>
          actions 可獨立存在不需 status——例如目錄類場景只想讓使用者「快速傳訊」/「加入團隊」,
          不關心即時狀態。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name="Diana Lin"
            subtitle="External Partner"
            actions={
              <>
                <Button variant="primary" size="sm" startIcon={MessageCircle}>傳訊</Button>
                <Button variant="tertiary" size="sm" startIcon={UserPlus}>加入團隊</Button>
              </>
            }
          />
        </div>
      </div>

      <div>
        <H3>未傳資訊欄位 → 仍顯示預設欄位佔位</H3>
        <Desc>
          資訊欄位區永遠渲染。`fields` 未傳或為空時,仍會顯示 ID 與 Employee number 兩個
          預設欄位,缺資料的欄位顯示佔位符 `—`。固定結構確保同一個人在不同畫面看起來一致,
          不會因為少傳資料就整個區段消失造成視覺漂移。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard name="Bob Chen" subtitle="Guest User" status="offline" fields={[]} />
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `profile-card.spec.md` 「A11y 預設」段。摘要:\n\n> 命名對齊 DS 設計準則(2026-05-18,per  # 命名與語言一致性 )。本節原標題「無障礙」,改「A11y 預設」與其他 spec 一致。\n\n-   Trigger 整合  :Avatar 作為 HoverCard trigger 時, onFocus  /  onBlur  與 mouseenter/leave 同時觸發由 Radix HoverCard 管理——鍵盤使用者 Tab 到 avatar 可自動顯示 card,Escape 關閉\n-   Focus 順序  :Radix  HoverCard  預設不抓取 focus 進入浮層——HoverCardContent 每次 render 把浮層內所有 tabIndex>=0 節點 set tabindex=-1(@radix-ui/react-hover-card dist index.js L217-222),刻意把 action / view more 移出 tab order。hover-integrated 路徑下鍵盤使用者 Tab 只停在 trigger(Avatar),無法 Tab 聚焦浮層內 action / view more(與 Popover 的 focus trap 截然不同)。需要鍵盤可達 action 改用 Popover / Dialog\n-   Live region 語意  :ProfileCard 是展示內容,非 announcement,不套  aria-live \n-   DL 語意  :Info Fields 使用 DescriptionList(<dl>/<dt>/<dd>),screen reader 讀「term X, description Y」(詳 description-list.spec.md「無障礙」段)\n-   CTA button aria-label  :icon-only action button 必帶  aria-label (「傳訊息給 {name}」),不只 icon 視覺\n-   色彩對比  :Status badge / Avatar status 圓點均過 WCAG AA,不依賴單一色彩載體(搭配文字標籤)"}</p>
    </div>
  ),
}
