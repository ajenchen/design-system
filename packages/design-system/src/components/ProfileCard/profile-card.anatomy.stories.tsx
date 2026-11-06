// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @overlay-open-skip: 本檔絕大多數 story 直接 render ProfileCard(內容不藏在浮層,snapshot 可見);
//   唯一 HoverCard demo 只示範「hover 整合」消費方式,open-state 內容已由同檔直接 render 的
//   stories 完整快照,forced defaultOpen 反而讓浮層蓋住旁邊的說明。
// @anatomy-rationale:
//   SizeMatrix N/A — ProfileCard 是固定寬度(320px)hover content template,
//     不提供 size prop;所有尺寸 token 已於 Overview「Layout Token」段列出
//     (avatar 64px / padding / gap)。ProfileCard 只有一種結構(spec「取消「精簡版」變體」),
//     SectionMatrix 只畫那一種完整結構。
import type { Meta, StoryObj } from '@storybook/react'
import { ProfileCard, ProfileCardDefaultActions } from './profile-card'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { SAMPLE_PEOPLE, demoPersonActions, samplePersonCard } from '@/design-system/stories-helpers/scene/person-card'

// 範例人員一律讀共用名錄(stories-helpers/scene/person-card.tsx):同一個人在全 DS 範例同一組部門 / ID / 員工編號
// (2026-10-28 前本頁的 Ada Chen 是 EMP-2101,HoverCard 頁是 ADACHEN / 1048217)
const ada = SAMPLE_PEOPLE.ada

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
  title: 'Design System/Components/ProfileCard/設計規格',
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
          ProfileCard 是人員 HoverCard 的內容元件——提供統一的人員資訊展示格式。本身不含觸發或定位邏輯
          (那是 HoverCard 的職責),只是 HoverCard content 的標準人員模板。固定寬度 320px。
        </Desc>
        <div className="border border-border rounded-lg p-4">
          {samplePersonCard(ada)}
        </div>
      </div>

      <div>
        <H3>5 個 Section 結構</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Section</Th><Th>內容</Th><Th>觸發條件</Th><Th>分隔</Th></tr></thead>
            <tbody>
              <tr><Td>Profile header</Td><Td>Avatar 64px + Name + Subtitle</Td><Td>永遠顯示</Td><Td>—</Td></tr>
              <tr><Td>Action buttons</Td><Td>預設動作:傳訊息 + 語音通話</Td><Td mono>actions 有值</Td><Td>無(貼在 profile 下)</Td></tr>
              <tr><Td>Status 區</Td><Td>狀態標籤 + 可選 statusMessage</Td><Td mono>status 有值</Td><Td mono>border-t border-divider</Td></tr>
              <tr><Td>Info fields</Td><Td>DescriptionList cols=2</Td><Td>永遠顯示(always-render,缺值顯「-」佔位)</Td><Td mono>border-t border-divider</Td></tr>
              <tr><Td>View more</Td><Td>Button variant=link, 填滿寬度</Td><Td mono>onViewMore 有值</Td><Td mono>border-t border-divider</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Section 之間用 <code>border-t border-divider</code> 分隔(元件固定結構,consumer 不決定是否分隔)。
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
                ['avatar', 'AvatarData', '—', '{ src?, alt, color?, hoverCard? }(alt 必填;未傳 avatar 時以 name 作 fallback alt);size/status 由 ProfileCard 覆寫,hoverCard 不 forward'],
                ['status', "'online' | 'away' | 'busy' | 'offline'", '—', '觸發 Status section + Avatar 狀態點'],
                ['statusMessage', 'ReactNode', '—', '狀態說明文字(完整顯示,內容多時 Body 區捲動)'],
                ['actions', 'ReactNode', '—', 'CTA buttons(通常 2 個 sm Button)'],
                ['fields', '{ label: string; value: ReactNode }[]', '—', 'Consumer 自訂 info fields(email / phone / 團隊 等),append 在 default 之後,走 DescriptionList cols=2'],
                ['defaultFieldValues', "Partial<Record<'id' | 'employeeNumber', ReactNode>>", '—', '填 default field(id / 員工編號)真實值的正規入口,缺值顯「-」佔位;優於用 fields 傳同名 label(後者 dev mode 會 console.warn)'],
                ['onViewMore', '() => void', '—', 'View more callback(有值才顯示該 section)'],
                ['viewMoreLabel', 'string', "'查看更多'", '查看更多按鈕文字'],
                ['labels', "Partial<ProfileCardLabels>(status 可只給部分)", '線上 / 離開 / 忙碌 / 離線、狀態訊息、ID / 員工編號', '卡片文案覆寫(狀態四種、狀態訊息欄名、兩個預設欄名),與 DS 預設合併;預設動作的文案在 ProfileCardDefaultActions 的 labels'],
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
              <tr><Td>Avatar 大小</Td><Td mono>64px(profile-card.tsx 元件級常數 AVATAR_SIZE;非 item-anatomy AVATAR_SIZE.block tier — block 為 32/32/40)</Td></tr>
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
        story: '在右側 Controls 面板切換 status / 各 section 的開關,即時查看 ProfileCard 在不同組合下的呈現。',
      },
    },
  },
  args: {
    name: ada.name,
    subtitle: ada.subtitle,
    status: ada.status,
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
    withActions: { control: 'boolean', description: '是否顯示「傳訊息 + 語音通話」預設動作列' },
    withFields: { control: 'boolean', description: '是否加上自訂欄位 fields(Email / 時區);ID 與員工編號兩個預設欄位永遠顯示' },
    withViewMore: { control: 'boolean', description: '是否顯示 View more 連結' },
  },
  render: (args) => {
    const status = args.status === 'none' ? undefined : args.status
    const { onChat, onCall, onViewProfile } = demoPersonActions(args.name)
    return (
      <div className="border border-dashed border-divider rounded-md p-4 inline-block">
        <ProfileCard
          name={args.name}
          subtitle={args.subtitle}
          status={status}
          avatar={{ src: ada.avatarSrc, alt: args.name }}
          statusMessage={args.withStatusMessage && status ? ada.statusMessage : undefined}
          actions={args.withActions ? <ProfileCardDefaultActions onChat={onChat} onCall={onCall} /> : undefined}
          fields={
            args.withFields
              ? [
                  { label: 'Email', value: 'ada.chen@example.com' },
                  { label: '時區', value: 'UTC+8' },
                ]
              : undefined
          }
          defaultFieldValues={{ id: ada.id, employeeNumber: ada.employeeNumber }}
          onViewMore={args.withViewMore ? onViewProfile : undefined}
        />
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. SectionMatrix — ProfileCard 只有一種結構:五個區段每張卡都有
   ═══════════════════════════════════════════════════════════════════════════ */

// 2026-10-28 前這裡是「最小 → 完整」五張逐步加區段的卡(稽核 H06):規格已取消「精簡版」變體、
// 人員資料預設展示一致(spec「取消「精簡版」變體」「DS-wide PersonData 預設展示一致 canonical」;登記簿 B22
// 「所有地方的namecard預設都是秀一樣的資訊的」),所以只畫那一種完整結構。唯一會暫時少一塊的情況
// (狀態還沒讀到)放在「狀態行為」。
export const SectionMatrix: Story = {
  name: '完整結構',
  render: () => (
    <div>
      <H3>五個區段每張卡都有</H3>
      <Desc>
        頭像與姓名、預設動作(傳訊息 + 語音通話)、狀態、資訊欄位(ID / 員工編號)、查看更多。副標固定寫「部門｜ID｜員工編號」,
        ID 與員工編號和下方欄位同值。唯一會暫時少一塊的情況是狀態還沒讀到,見「狀態行為」。
      </Desc>
      <div className="border border-dashed border-divider rounded-md p-4 inline-block">
        {samplePersonCard(ada)}
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
          狀態點顏色語意對齊 Slack / Teams / Linear 業界共識。Status 區的標籤底色一律 <code>bg-muted</code> 保持中性
          (狀態是展示資訊,不可點擊,避免暗示互動性)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>status</Th><Th>顯示文字</Th><Th>Avatar dot 色</Th><Th>Status 區 bg</Th><Th>語意</Th></tr></thead>
            <tbody>
              <tr><Td mono>online</Td><Td>線上</Td><Td><TokenCell token="--status-online" /></Td><Td><TokenCell token="--muted" /></Td><Td>正常可聯絡</Td></tr>
              <tr><Td mono>away</Td><Td>離開</Td><Td><TokenCell token="--status-away" /></Td><Td><TokenCell token="--muted" /></Td><Td>暫時離開</Td></tr>
              <tr><Td mono>busy</Td><Td>忙碌</Td><Td><TokenCell token="--status-busy" /></Td><Td><TokenCell token="--muted" /></Td><Td>勿打擾</Td></tr>
              <tr><Td mono>offline</Td><Td>離線</Td><Td><TokenCell token="--status-offline" /></Td><Td><TokenCell token="--muted" /></Td><Td>離線</Td></tr>
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
              <ProfileCard name={ada.name} subtitle={ada.subtitle} avatar={{ src: ada.avatarSrc, alt: ada.name }} status={s} defaultFieldValues={{ id: ada.id, employeeNumber: ada.employeeNumber }} />
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
          人員頭像的標準寫法:名片交給 Avatar 的 hoverCard(Avatar 規格「Avatar HoverCard 原則」的消費者寫法)。
          觸發、定位、進退場與鍵盤可達都由 Avatar 內建的 HoverCard 處理,ProfileCard 只管內容。
        </Desc>
        <div className="border border-border rounded-lg p-6 flex items-center gap-8">
          {/* 2026-10-28 前這裡手組 HoverCard + 可聚焦 span + ProfileCard(稽核 M078):Avatar hoverCard 已內建同一組
              (可聚焦、外殼、延遲),手組一份就多一個會漂的地方;名片內容走全 DS 同一支建構器 */}
          {[SAMPLE_PEOPLE.ada, SAMPLE_PEOPLE.alice, SAMPLE_PEOPLE.bob].map((p) => (
            <Avatar key={p.id} src={p.avatarSrc} alt={p.name} size={40} status={p.status} hoverCard={samplePersonCard(p)} />
          ))}
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          滑過或 Tab 到任一頭像 → 名片在頭像旁展開,含狀態、資訊欄位與查看更多。
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

const loadingActions = demoPersonActions(ada.name)

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>長 name 自動換行,avatar 不變形</H3>
        <Desc>
          頭像右側文字欄的最小高度等於頭像大小:短文字垂直置中於頭像,
          多行姓名自然撐高(不截斷,姓名是識別主體)。頭像不縮,永遠 64px。
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
        <H3>狀態還沒讀到 → 整個狀態區先不出現</H3>
        <Desc>
          每個人都有在線狀態,所以 status 沒有值只代表資料還在載入:這段時間整個狀態區不畫,也不寫「未設定」之類的字,
          資料到了才補上。其餘區段照常。
        </Desc>
        {/* 2026-10-28 前這則是「無 status、只有 actions」+ 自訂「傳訊 / 加入團隊」(稽核 H06):規格說 status 沒值只會是載入空檔,
            動作一律用預設的傳訊息 + 語音通話(spec「Status section v12 conditional rule」「Action 行」) */}
        <div className="border border-dashed border-divider rounded-md p-4 inline-block">
          <ProfileCard
            name={ada.name}
            subtitle={ada.subtitle}
            avatar={{ src: ada.avatarSrc, alt: ada.name }}
            actions={<ProfileCardDefaultActions onChat={loadingActions.onChat} onCall={loadingActions.onCall} />}
            defaultFieldValues={{ id: ada.id, employeeNumber: ada.employeeNumber }}
            onViewMore={loadingActions.onViewProfile}
          />
        </div>
      </div>

      <div>
        <H3>未傳資訊欄位 → 仍顯示預設欄位佔位</H3>
        <Desc>
          資訊欄位區永遠渲染。<code>fields</code> 未傳或為空時,仍會顯示 ID 與 員工編號 兩個
          預設欄位,缺資料的欄位顯示佔位符「-」(半形連字號,與 Field 空值同一個符號)。固定結構確保同一個人在不同畫面看起來一致,
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
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-[var(--layout-space-tight)]">無障礙設計</h3>
      {/* 原本一整段 whitespace-pre-line 字串(開頭「詳 profile-card.spec.md」是內部檔名、清單是 markdown 字、還夾一段改名紀錄)→ 改成真的清單 */}
      <ul className="list-disc pl-5">
        <li>頭像是名片的觸發點:滑鼠移入 / 移出與鍵盤聚焦 / 離開都會開關名片;Tab 到頭像就會顯示,Esc 關閉</li>
        <li>名片是滑過預覽,不把焦點搬進浮層:名片裡的動作鈕與「查看更多」不在 Tab 順序裡(Radix HoverCard 刻意把浮層內可聚焦的節點設成 <code>tabindex="-1"</code>)。鍵盤要能按到動作的情境改用 Popover / Dialog</li>
        <li>名片是展示內容,不是通知,不設 <code>aria-live</code></li>
        <li>資訊欄位用 DescriptionList(<code>{'<dl> / <dt> / <dd>'}</code>),讀屏器讀成「欄名、值」</li>
        <li>只有圖示的動作鈕必帶讀屏名稱(例:「傳訊息給 Ada Chen」)</li>
        <li>狀態標籤與頭像狀態點都過 WCAG AA,並配文字標籤,不只靠顏色</li>
      </ul>
    </div>
  ),
}
