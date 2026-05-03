// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useState } from 'react'
import type { Meta } from '@storybook/react'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogClose,
} from './dialog'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldDescription } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Switch } from '@/design-system/components/Switch/switch'
import { MenuItem } from '@/design-system/components/Menu/menu-item'
import { NameCard, NameCardDefaultActions } from '@/design-system/components/NameCard/name-card'
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
                {/* Suffix: Switch — ItemSuffix h-[1lh] 對齊 title 第一行(≤ 24px suffix 的 canonical) */}
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
        <Button>開啟 Modal</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modal</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-body">Modal 內容區域</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">Cancel</Button>
          </DialogClose>
          <Button>Next</Button>
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
              <Input placeholder="輸入專案名稱" />
            </Field>
            <Field>
              <FieldLabel>描述</FieldLabel>
              <Input placeholder="輸入描述" />
              <FieldDescription>選填，簡述專案用途</FieldDescription>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button>建立</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const LongContent = {
  name: '長內容',
  render: () => {
    // 30 avatar + title + description(ROLE｜EMP_ID｜EMP_NUM,full-width 「｜」 separator)
    // 對齊 user 要求 + NameCard 資訊量:
    //   - avatar:real photo src(pravatar seed 確保每人不同面孔)
    //   - title:name(body font-medium)
    //   - description:「職稱｜員編｜工號」格式(text-caption text-fg-secondary = neutral-8)
    //     → 世界級 Slack / Linear / Notion 成員卡都用「職稱」而非「公司名」作為 subtitle 核心(辨識工作身份)
    // item-anatomy Family 2 reading mode — prefix Avatar 40 / content title + description 2 行
    // hover bg flush to body padded edge(無 item px)—— 2026-04-22 canonical
    const roles = ['Design', 'Engineering', 'Product', 'Research']
    const members = [
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
    return (
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <Button>開啟 Modal</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>成員列表</DialogTitle>
          </DialogHeader>
          {/* Body 放 list canonical(2026-05-01):body 撤 chrome padding(`!px-0 !pt-0 !pb-0`)+ list outer
              wrapper 自帶 `py-2`(menu group 8px breathing)+ item 自帶 `px-loose rounded-md`
              (hover bg flush 到 chrome 邊,unbounded list-as-region pattern)。
              item 用 Family 2 reading mode(prefix Avatar 40 + content title+description)。 */}
          <DialogBody className="!px-0 !pt-0 !pb-0">
            <div role="list" className="flex flex-col py-2">
              {members.map((m, i) => (
                // item-anatomy Family 2:[prefix Avatar 40] [content: title + description(--item-gap-label-desc-scanning gap)]
                // `px-2 rounded-md` → content(avatar / text)在 hover bg 內有 8px breathing
                // (非背景元素不可直接觸 affordance bg 邊 — 真實 invariant,對齊 Material / Polaris 世界級)
                // description 色 = text-fg-secondary(neutral-8);separator = full-width 「｜」
                <div
                  key={m.empNum}
                  role="listitem"
                  className="flex items-center gap-3 py-2 px-[var(--layout-space-loose)] rounded-md hover:bg-neutral-hover"
                >
                  {/* Person avatar canonical:hover 必出現 NameCard(DS-wide rule,見 avatar.spec.md)
                      世界級 Slack / Figma / Linear / Notion 的 person avatar 全預設 hover → profile popover */}
                  <Avatar
                    size={40}
                    src={`https://i.pravatar.cc/80?u=${m.empNum}`}
                    alt={m.name}
                    hoverCard={
                      <NameCard
                        name={m.name}
                        avatar={{ src: `https://i.pravatar.cc/80?u=${m.empNum}`, alt: m.name }}
                        subtitle={`${roles[i % roles.length]}｜${m.empId}`}
                        status={(['online','busy','away','offline'] as const)[i % 4]}
                        statusMessage="Out of Office: Back on Monday!"
                        actions={<NameCardDefaultActions />}
                        fields={[
                          { label: 'ID', value: m.empNum },
                          { label: 'Employee number', value: m.empId },
                        ]}
                        onViewMore={() => {}}
                      />
                    }
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-body font-medium truncate">{m.name}</span>
                    <span className="mt-[var(--item-gap-label-desc-scanning)] text-caption text-fg-secondary truncate">
                      {roles[i % roles.length]}｜{m.empId}｜{m.empNum}
                    </span>
                  </div>
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
  },
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
 * ListBody — body 放 list 的 canonical pattern。
 *
 * **世界級對照**(每家 benchmark,對齊 CLAUDE.md Meta-Pattern M8):
 * - Material M3 Dialog with List:body 移除 pt/pb,item py-3 (48-56px row)
 *   ref https://m3.material.io/components/dialogs/specs
 * - Polaris Modal + ResourceList:body px only,list 接頂接底 flush,item 44-52px
 *   ref https://polaris.shopify.com/components/overlays/modal
 * - Atlassian Modal + OptionList:body padding 全移除,item 40-56px
 * - Linear Cmd+K:body 0 padding,item dense py-1 (密集 palette)
 * - GitHub Primer ActionList in Dialog:body 0 vertical padding
 *
 * **共識**:overlay body 裝 list 時,**body 不加 vertical padding**;list item 自己的
 * py 是節奏源。我方 canonical(2026-05-01):`<DialogBody className="!px-0 !pt-0 !pb-0">`
 * 配 list outer wrapper(`<div className="py-2">`)+ item 自帶 `px-loose rounded-md`。
 * 不加 `flush` variant — 對齊 Material/Atlassian/Mantine/shadcn 主流(無 universal flush);
 * Polaris 有 flush API 但 scope 極窄。原因:加 1 row(search/banner)就破功 → 不如保留
 * chrome padding;新增 prop 不解決底層脆弱(consumer 仍要管 list py + item px-loose)。
 *
 * 以下三個 item-size 範例對應不同 list-item tier(item-anatomy Family 1 reading mode):
 */
export const ListBody = {
  name: 'Body 放 list',
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
              {[
                { name: 'Alan Chen', role: 'Design', empId: 'D-0042', empNum: 'EMP-1001' },
                { name: 'Betty Wu', role: 'Engineering', empId: 'E-0183', empNum: 'EMP-1002' },
                { name: 'Charlie Lee', role: 'Design', empId: 'D-0127', empNum: 'EMP-1003' },
                { name: 'Diana Kim', role: 'Product', empId: 'M-0055', empNum: 'EMP-1004' },
                { name: 'Ethan Park', role: 'Engineering', empId: 'E-0210', empNum: 'EMP-1005' },
                { name: 'Fiona Lin', role: 'Design', empId: 'D-0098', empNum: 'EMP-1006' },
              ].map((m, i) => (
                // list-as-region canonical:item `px-loose rounded-md` → hover bg flush 到 chrome 邊
                <div
                  key={m.empNum}
                  role="listitem"
                  className="flex items-center gap-3 py-2 px-[var(--layout-space-loose)] rounded-md hover:bg-neutral-hover"
                >
                  {/* Person avatar canonical:hover 必出現 NameCard */}
                  <Avatar
                    size={40}
                    src={`https://i.pravatar.cc/80?u=${m.empNum}`}
                    alt={m.name}
                    hoverCard={
                      <NameCard
                        name={m.name}
                        avatar={{ src: `https://i.pravatar.cc/80?u=${m.empNum}`, alt: m.name }}
                        subtitle={`${m.role}｜${m.empId}`}
                        status={(['online','busy','away','offline'] as const)[i % 4]}
                        statusMessage="Out of Office: Back on Monday!"
                        actions={<NameCardDefaultActions />}
                        fields={[
                          { label: 'ID', value: m.empNum },
                          { label: 'Employee number', value: m.empId },
                        ]}
                        onViewMore={() => {}}
                      />
                    }
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-body font-medium truncate">{m.name}</span>
                    <span className="mt-[var(--item-gap-label-desc-scanning)] text-caption text-fg-secondary truncate">
                      {m.role}｜{m.empId}｜{m.empNum}
                    </span>
                  </div>
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

      {/* 中 item:title+desc + 右側直接 Switch 設定(in-modal 操作,不 navigate)
          user Image 9 指出 modal 內 list item 通常可直接被設定 — 對齊 Gmail 通知設定 /
          macOS System Preferences / Notion preferences 的 in-modal pattern */}
      <NotificationSettings />

      {/* 小 item:純文字 label(對齊 Linear Cmd+K 密集) */}

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
