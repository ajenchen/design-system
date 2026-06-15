// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useState } from 'react'
import type { Meta } from '@storybook/react'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogClose,
} from './dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldDescription } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Switch } from '@/design-system/components/Switch/switch'
import { MenuItem } from '@/design-system/components/Menu/menu-item'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * 通知設定 — flush 中 item(title + desc + right-side Switch)
 * in-modal 直接設定 pattern(對齊 Gmail 通知設定 / macOS Sys Prefs / Notion prefs)
 *
 * **Item-anatomy Family 2 reading mode 套用(2026-04-22 v3 修正,user 指出 Switch 是 suffix)**:
 * - Row 結構 = Family 2 reading(無 prefix、content: title+desc、suffix: Switch)
 * - Switch **包 `<ItemSuffix>`**:suffix h-[1lh] 對齊 **title 第一行**(≤ 24px suffix 的 canonical,
 *   見 item-anatomy.spec.md「24px 閾值對齊規則」)—— 不是 items-center 對齊文字塊中心
 *   世界級對照:macOS System Prefs / iOS Settings / Gmail notif / Notion 皆 suffix control
 *   對齊 title 第一行(不 center 文字塊)
 * - 外層 flex 用 `items-start`(讓 content 自然 flow,suffix 由 h-[1lh] 對齊第一行)
 * - title / description gap = `--item-gap-label-desc-scanning`(2px)
 * - description 色 = `text-fg-secondary`(neutral-8)
 * - **無 row hover**:只有 Switch 互動
 */
function NotificationSettings() {
  const [email, setEmail] = useState(true)
  const [push, setPush] = useState(false)
  const [slack, setSlack] = useState(true)
  const items = [
    { key: 'email', title: '電子郵件通知', desc: '接收每日摘要到信箱', checked: email, onChange: setEmail },
    { key: 'push', title: '推播通知', desc: '即時推送到桌面與手機', checked: push, onChange: setPush },
    { key: 'slack', title: 'Slack 整合', desc: '提及時自動發送到 #notifications', checked: slack, onChange: setSlack },
  ]
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="tertiary">開啟通知設定(中 item:title+desc+Switch)</Button>
      </DialogTrigger>
      <DialogContent autoHeight maxWidth={480}>
        <DialogHeader>
          <DialogTitle>通知設定</DialogTitle>
        </DialogHeader>
        <DialogBody className="!px-0 !pt-0 !pb-0">
          <div className="flex flex-col py-2">
            {items.map((n) => (
              // item-anatomy Family 2:[content: title + desc(--item-gap-label-desc-scanning gap)] [ItemSuffix: Switch]
              // items-start(let content flow);suffix h-[1lh] 對齊 title 第一行(24px 閾值 canonical)
              // px-loose:content 對齊 header/footer 的 loose padding(body flush 無水平 padding)
              <div
                key={n.key}
                className="flex items-start gap-3 py-2 px-[var(--layout-space-loose)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-body font-medium">{n.title}</div>
                  {/* --item-gap-label-desc-scanning = 2px title↔desc gap(item-anatomy canonical);neutral-8 = fg-secondary */}
                  <div className="mt-[var(--item-gap-label-desc-scanning)] text-caption text-fg-secondary">{n.desc}</div>
                </div>
                {/* Suffix: Switch — ItemSuffix h-[1lh] 對齊 title 第一行(≤ 24px suffix 的設計準則) */}
                <ItemSuffix>
                  <Switch checked={n.checked} onCheckedChange={n.onChange} />
                </ItemSuffix>
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">關閉</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 成員列 demo 共用 data + row —「長內容」與「主體放清單」大 item 共用同一 anatomy,
 * 避免兩份重複 markup(EXAMPLE_REDUNDANT 收斂,2026-06-11)。
 * - item-anatomy Family 2 reading:[prefix Avatar 40] [content: title + description(--item-gap-label-desc-scanning gap)]
 * - list-as-region canonical:item 自帶 `px-loose rounded-md` → hover bg flush 到 chrome 邊
 * - Person avatar canonical:hover 必出現 ProfileCard(DS-wide rule,見 avatar.spec.md)
 * - description = 「職稱｜員編｜工號」(full-width 「｜」separator;世界級成員卡以職稱辨識工作身份)
 */
const MEMBER_ROLES = ['Design', 'Engineering', 'Product', 'Research'] as const
const MEMBERS = [
  { name: 'Alan Chen', empId: 'D-0042', empNum: 'EMP-1001' },
  { name: 'Betty Wu', empId: 'E-0183', empNum: 'EMP-1002' },
  { name: 'Charlie Lee', empId: 'D-0127', empNum: 'EMP-1003' },
  { name: 'Diana Kim', empId: 'M-0055', empNum: 'EMP-1004' },
  { name: 'Ethan Park', empId: 'E-0210', empNum: 'EMP-1005' },
  { name: 'Fiona Lin', empId: 'D-0098', empNum: 'EMP-1006' },
  { name: 'George Ho', empId: 'E-0271', empNum: 'EMP-1007' },
  { name: 'Hana Yu', empId: 'M-0019', empNum: 'EMP-1008' },
  { name: 'Ivan Sun', empId: 'D-0145', empNum: 'EMP-1009' },
  { name: 'Julia Shen', empId: 'E-0302', empNum: 'EMP-1010' },
  { name: 'Kevin Hsu', empId: 'D-0076', empNum: 'EMP-1011' },
  { name: 'Lydia Cao', empId: 'M-0088', empNum: 'EMP-1012' },
  { name: 'Mark Tseng', empId: 'E-0154', empNum: 'EMP-1013' },
  { name: 'Nina Pan', empId: 'D-0031', empNum: 'EMP-1014' },
  { name: 'Oscar Lo', empId: 'E-0249', empNum: 'EMP-1015' },
  { name: 'Peggy Qin', empId: 'M-0067', empNum: 'EMP-1016' },
  { name: 'Ray Tang', empId: 'D-0192', empNum: 'EMP-1017' },
  { name: 'Sophia Fei', empId: 'E-0115', empNum: 'EMP-1018' },
  { name: 'Tom Liang', empId: 'D-0234', empNum: 'EMP-1019' },
  { name: 'Uma Jiang', empId: 'M-0043', empNum: 'EMP-1020' },
  { name: 'Victor Ren', empId: 'E-0168', empNum: 'EMP-1021' },
  { name: 'Wendy Xia', empId: 'D-0059', empNum: 'EMP-1022' },
  { name: 'Xavier Ma', empId: 'E-0296', empNum: 'EMP-1023' },
  { name: 'Yuki Du', empId: 'D-0081', empNum: 'EMP-1024' },
  { name: 'Zach Feng', empId: 'M-0024', empNum: 'EMP-1025' },
  { name: 'Amy Zhao', empId: 'D-0163', empNum: 'EMP-1026' },
  { name: 'Brad Fan', empId: 'E-0207', empNum: 'EMP-1027' },
  { name: 'Cathy Miao', empId: 'M-0102', empNum: 'EMP-1028' },
  { name: 'Derek Qu', empId: 'D-0140', empNum: 'EMP-1029' },
  { name: 'Elena Xu', empId: 'E-0318', empNum: 'EMP-1030' },
]

function MemberRow({ member, index }: { member: (typeof MEMBERS)[number]; index: number }) {
  const role = MEMBER_ROLES[index % MEMBER_ROLES.length]
  return (
    <div
      role="listitem"
      className="flex items-center gap-3 py-2 px-[var(--layout-space-loose)] rounded-md hover:bg-neutral-hover"
    >
      <Avatar
        size={40}
        src={`https://i.pravatar.cc/80?u=${member.empNum}`}
        alt={member.name}
        hoverCard={
          <ProfileCard
            name={member.name}
            avatar={{ src: `https://i.pravatar.cc/80?u=${member.empNum}`, alt: member.name }}
            subtitle={`${role}｜${member.empId}`}
            status={(['online', 'busy', 'away', 'offline'] as const)[index % 4]}
            statusMessage="Out of Office: Back on Monday!"
            actions={<ProfileCardDefaultActions />}
            fields={[
              { label: 'ID', value: member.empNum },
              { label: 'Employee number', value: member.empId },
            ]}
            onViewMore={() => {}}
          />
        }
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-body font-medium truncate">{member.name}</span>
        <span className="mt-[var(--item-gap-label-desc-scanning)] text-caption text-fg-secondary truncate">
          {role}｜{member.empId}｜{member.empNum}
        </span>
      </div>
    </div>
  )
}

const meta: Meta = {
  title: 'Design System/Components/Dialog/展示',
  parameters: { layout: 'centered' },
}
export default meta

export const Default = {
  name: '基本',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>邀請成員加入專案</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>邀請成員到「Q3 設計改版」</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">輸入 Email 即可邀請。被邀請者會收到通知信並自動加入專案。</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary">寄出邀請</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const WithForm = {
  name: '表單',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>開啟 Modal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>建立專案</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Field>
              <FieldLabel>專案名稱</FieldLabel>
              <Input placeholder="例:Q3 設計改版" />
            </Field>
            <Field>
              <FieldLabel>描述</FieldLabel>
              <Input placeholder="一句話介紹專案目標..." />
              <FieldDescription>選填，簡述專案用途</FieldDescription>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary">建立</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const LongContent = {
  name: '長內容',
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>開啟成員列表</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>成員列表</DialogTitle>
        </DialogHeader>
        {/* Body 放 list canonical(2026-05-01):body 撤 chrome padding(`!px-0 !pt-0 !pb-0`)+ list outer
            wrapper 自帶 `py-2`(menu group 8px breathing)+ item 自帶 `px-loose rounded-md`
            (hover bg flush 到 chrome 邊)。30 筆超出 viewport → 驗證預設高度(填滿)+ body 區捲動。 */}
        <DialogBody className="!px-0 !pt-0 !pb-0">
          <div role="list" className="flex flex-col py-2">
            {MEMBERS.map((m, i) => (
              <MemberRow key={m.empNum} member={m} index={i} />
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">關閉</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const Destructive = {
  name: '危險操作',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" danger>刪除</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認刪除</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">此操作無法復原。確定要刪除嗎？</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" danger>刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

/**
 * ListBody — body 放 list 的 canonical pattern(Material / Polaris / Atlassian / Linear /
 * GitHub Primer 共識:overlay body 裝 list 時 body 不加 vertical padding,節奏源 = item 自己的 py)。
 * 我方 canonical(2026-05-01):`<DialogBody className="!px-0 !pt-0 !pb-0">` + list wrapper `py-2`
 * + item 自帶 `px-loose rounded-md`。不加 `flush` variant — 加 1 row(search / banner)就破功,
 * 保留 chrome padding 較穩。以下三個範例對應不同 list-item tier(item-anatomy Family 2 / MenuItem)。
 */
export const ListBody = {
  name: '主體放清單',
  render: () => (
    <div className="flex flex-col gap-6 items-start">
      {/* 大 item:avatar 40 + title + description(對齊 user 期望 + Material M3 + FileItem rich) */}
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button variant="tertiary">開啟成員列表(大 item:avatar+desc)</Button>
        </DialogTrigger>
        <DialogContent autoHeight maxWidth={520}>
          <DialogHeader>
            <DialogTitle>成員列表</DialogTitle>
          </DialogHeader>
          <DialogBody className="!px-0 !pt-0 !pb-0">
            <div role="list" className="flex flex-col py-2">
              {MEMBERS.slice(0, 6).map((m, i) => (
                <MemberRow key={m.empNum} member={m} index={i} />
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">關閉</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 中 item:title+desc + 右側直接 Switch 設定(in-modal 操作,不 navigate)
          user Image 9 指出 modal 內 list item 通常可直接被設定 — 對齊 Gmail 通知設定 /
          macOS System Preferences / Notion preferences 的 in-modal pattern */}
      <NotificationSettings />

      {/* 小 item:純文字 label(對齊 Linear Cmd+K 密集) */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="tertiary">開啟標籤選擇(小 item:text only)</Button>
        </DialogTrigger>
        <DialogContent autoHeight maxWidth={360}>
          <DialogHeader>
            <DialogTitle>選擇標籤</DialogTitle>
          </DialogHeader>
          <DialogBody className="!px-0 !pt-0 !pb-0">
            <div role="list" className="flex flex-col py-2">
              {['Bug', 'Feature', 'Improvement', 'Research', 'Documentation', 'Refactor', 'Test'].map((t) => (
                // 小 item 純文字 label → 用 **MenuItem** primitive(世界級 Linear Cmd+K / Polaris OptionList
                // / Atlassian Modal+Menu 共通 pattern:menu-like 內容在 dialog 內用 menu primitive)
                // className 覆蓋 px-3 為 px-loose → 對齊 dialog header/footer(tailwind-merge 吃掉預設 px-3)
                // list outer wrapper 已 `py-2`(menu group 8px breathing)+ body 撤 chrome padding,
                // MenuItem 不需再外包 py-2
                <MenuItem key={t} className="px-[var(--layout-space-loose)]">
                  {t}
                </MenuItem>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">關閉</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ),
}

/**
 * 標頭內含分頁(2026-05-18 從 patterns/header-canonical/header-canonical.stories.tsx 整合過來
 * per user「應該整合進去 dialog 吧?目前應該不需要獨立的 header canonical 資料夾來說明這些東西」)
 *
 * 對應 `header-canonical.spec.md` W1-W4:
 *   W1 Tabs 自畫 full-width border-divider 接管 chrome separator
 *   W2 TabsList 全 dialog 寬 + 內 px-loose padding 對齊 title left
 *   W4 header content row + tabs row flush stack(gap = 0)
 *
 * Anatomy(consumer 寫法):`<Tabs>` wrap 整 DialogContent → `<DialogHeader tabsSlot={<TabsList>}>` →
 *   `<DialogBody><TabsContent>...</TabsContent></DialogBody>`
 *
 * 注意:TabsContent 必放 DialogBody 內(scroll + chrome padding 由 DialogBody 自管),不要自加 padding。
 */
export const WithTabsInHeader = {
  name: '標頭內含分頁',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">專案設定</Button>
      </DialogTrigger>
      <DialogContent>
        <Tabs defaultValue="general">
          <DialogHeader
            tabsSlot={
              <TabsList>
                <TabsTrigger value="general">一般</TabsTrigger>
                <TabsTrigger value="members">成員</TabsTrigger>
                <TabsTrigger value="integrations">整合</TabsTrigger>
              </TabsList>
            }
          >
            <DialogTitle>專案設定</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <TabsContent value="general">
              <div className="flex flex-col gap-[var(--layout-space-loose)]">
                <Field>
                  <FieldLabel>專案名稱</FieldLabel>
                  <Input defaultValue="Q3 設計改版" />
                </Field>
                <Field>
                  <FieldLabel>專案簡介</FieldLabel>
                  <Input defaultValue="改善結帳流程體驗與轉換率" />
                </Field>
              </div>
            </TabsContent>
            <TabsContent value="members">
              <div className="flex flex-col gap-3">
                {[
                  ['Alan Chen', '管理員'],
                  ['Betty Wu', '編輯者'],
                  ['Charlie Lee', '檢視者'],
                ].map(([name, role]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-body">{name}</span>
                    <span className="text-caption text-fg-secondary">{role}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="integrations">
              <div className="flex flex-col gap-3">
                {[
                  { key: 'slack', label: 'Slack 通知', on: true },
                  { key: 'github', label: 'GitHub PR 同步', on: true },
                  { key: 'linear', label: 'Linear issue 連動', on: false },
                ].map((it) => (
                  <div key={it.key} className="flex items-center justify-between">
                    <span className="text-body">{it.label}</span>
                    <Switch defaultChecked={it.on} aria-label={it.label} />
                  </div>
                ))}
              </div>
            </TabsContent>
          </DialogBody>
        </Tabs>
      </DialogContent>
    </Dialog>
  ),
}

/**
 * OpenSnapshot — visual-audit 專用 story(非 consumer-facing 教學範例)。
 *
 * 用 `defaultOpen` 讓 overlay 在 render 當下就開著,Playwright 截圖才抓得到
 * Dialog chrome(Header/Body/Footer)。不用 play() + userEvent,是因為
 * Radix `defaultOpen` 對 Portal 自動生效,不需額外互動觸發 — 世界級 DS
 * (Polaris / Atlassian)的 chromatic 稽核也走同 pattern。
 *
 * 情境選用「確認刪除專案」— Jira / Linear 常見的 destructive confirmation,
 * 涵蓋 title + description + footer 雙 action 的完整 chrome。
 */
export const OpenSnapshot = {
  name: '開啟狀態',
  tags: ['!autodocs'],
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>打開 Dialog</Button>
      </DialogTrigger>
      <DialogContent autoHeight maxWidth={480}>
        <DialogHeader>
          <DialogTitle>確認刪除專案</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">這個操作無法復原。專案內的所有 task、討論與附件都會被永久刪除。</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" danger>確認刪除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
