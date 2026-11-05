// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { ChevronUp, ChevronDown, MoreVertical } from 'lucide-react'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogClose,
} from './dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldDescription, FieldError, useFormValidation } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Switch } from '@/design-system/components/Switch/switch'
import { Command, CommandList, CommandGroup, CommandItem } from '@/design-system/components/Command/command'
import { samplePersonCard } from '@/design-system/stories-helpers/scene/person-card'

/**
 * 通知設定 —— 對話框裡直接改的設定列(對齊 Gmail 通知設定 / macOS 系統設定 / Notion 偏好設定)
 *
 * 一列一個開關 = 自帶標題的 `<Switch label description>`(switch.spec.md「設定列 vs 水平 Field」,2026-10-21 S1 甲):
 * 標題 + 說明在左、開關在列尾對齊標題第一行、整列可點、讀屏名稱只念標題;單行列高 = 欄位高(2026-10-27 Q6 甲),
 * 列與列之間 = loose(layoutSpace.spec.md 規則 3 跨範疇 + parallel:每列各管一件事,不是同一組選項)。
 * 外框走 DialogBody 預設(頂 tight、底 bottom = A-S7:最後一個元素是一般元素);字級由 Switch 自帶(reading:標題 text-body、說明 14px)。
 */
function NotificationSettings() {
  const [email, setEmail] = useState(true)
  const [push, setPush] = useState(false)
  const [slack, setSlack] = useState(true)
  const items = [
    { key: 'email', title: '電子郵件通知', desc: '接收每日摘要到信箱', checked: email, onChange: setEmail },
    { key: 'push', title: '推播通知', desc: '即時推送到桌面通知', checked: push, onChange: setPush },
    { key: 'slack', title: 'Slack 整合', desc: '提及時自動發送到 #notifications', checked: slack, onChange: setSlack },
  ]
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="tertiary">通知設定</Button>
      </DialogTrigger>
      <DialogContent height="hug" maxWidth={480}>
        <DialogHeader>
          <DialogTitle>通知設定</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            {items.map((n) => (
              <Switch key={n.key} label={n.title} description={n.desc} checked={n.checked} onCheckedChange={n.onChange} />
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
 * - list-as-region canonical:item 自帶 `px-loose` → 前緣對齊 header 標題;成員列不可點 → 無 hover 底色
 *   (overlay-surface.spec.md「底色有無不是 List-as-region 的判定條件」;hover 只給「再點會發生什麼」有答案的列)
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

// 名片的狀態與狀態訊息成對(線上卻寫「休假中」是自相矛盾,profile-card.spec.md「Status 區」;2026-10-20 前四種狀態全用同一句 OOO,獨立驗證 OV-V01)
const MEMBER_PRESENCE = [
  { status: 'online', message: '今天在台北辦公室' },
  { status: 'busy', message: '會議中,15:00 後回覆' },
  { status: 'away', message: '休假中,週一回來' },
  { status: 'offline', message: '已下線,明早 9:00 上線' },
] as const

function MemberRow({ member, index }: { member: (typeof MEMBERS)[number]; index: number }) {
  const role = MEMBER_ROLES[index % MEMBER_ROLES.length]
  const presence = MEMBER_PRESENCE[index % MEMBER_PRESENCE.length]
  const avatarSrc = `https://i.pravatar.cc/80?u=${member.empNum}`
  return (
    // 成員列不能被點(listitem、無 onClick)→ 不給 hover 底色:hover 回饋要誠實回答「再點會發生什麼」
    // (item-anatomy.spec.md「選中 × 互動疊加」表;overlay-surface.spec.md「不適用」那條:成員名單這種展示列,走 Family 2 手組)
    <div
      role="listitem"
      // @layout-space-magic-ok: 頭像 ↔ 姓名 12px = 大頭像列表的 prefix ↔ content(item-anatomy.spec.md:1015);列上下 8px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d))
      className="flex items-center gap-3 py-2 px-[var(--layout-space-loose)]"
    >
      {/* 名片走全 DS 同一支建構器(buildPersonProfileCard,經 stories-helpers/scene/person-card.tsx):副標 = 列上的「職稱｜ID｜員工編號」,
          預設欄位 ID / 員工編號與副標同值;傳訊息 / 語音通話 / 查看更多接 demoPersonActions(2026-10-28 前接空函式,點了沒反應) */}
      <Avatar
        size={40}
        src={avatarSrc}
        alt={member.name}
        hoverCard={samplePersonCard({
          name: member.name,
          avatarSrc,
          subtitle: `${role}｜${member.empId}｜${member.empNum}`,
          id: member.empId,
          employeeNumber: member.empNum,
          status: presence.status,
          statusMessage: presence.message,
        })}
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

type Story = StoryObj

const meta: Meta = {
  title: 'Design System/Components/Dialog/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: '以模態浮層要求使用者專注完成確認、輸入或短流程，並管理 focus 與 Escape。任務必須在回到原頁前處理時使用；長篇或需要更多工作空間時改用 Sheet。' } },
  },
}
export default meta

// 邀請成員:說明寫「輸入 Email 即可邀請」就要真的有 Email 欄(2026-10-28 前只有一段字,「寄出邀請」點了沒反應;稽核 M096)。
// 表單接 useFormValidation、送出成功 → Toast 再關閉、每次打開回到空白(同下方「表單」的寫法與理由)。
function InviteMemberDialog() {
  const [open, setOpen] = useState(false)
  const form = useFormValidation({
    initialValues: { email: '' },
    validate: {
      email: (v) => (!String(v).trim() ? 'Email 必填' : /^\S+@\S+\.\S+$/.test(String(v)) ? undefined : 'Email 格式不正確'),
    },
    onSubmit: (values) => {
      toast({ variant: 'success', title: '邀請已寄出', description: `已寄給 ${String(values.email).trim()}` })
      setOpen(false)
    },
  })
  const handleOpenChange = (next: boolean) => {
    if (next) form.reset()
    setOpen(next)
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>邀請成員加入專案</Button>
      </DialogTrigger>
      {/* 邀請成員:一個欄位的短表單,開啟期間內容高度不會變 → hug(spec「高度軸」判準) */}
      <DialogContent height="hug">
        <DialogHeader>
          <DialogTitle>邀請成員到「Q3 設計改版」</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field required invalid={!!form.errors.email}>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" placeholder="name@company.com" {...form.getInputProps('email')} />
            <FieldDescription>被邀請者會收到通知信,接受後加入專案</FieldDescription>
            <FieldError>{form.errors.email}</FieldError>
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>寄出邀請</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const Default = {
  name: '基本',
  render: () => (
    <>
      <Toaster />
      <InviteMemberDialog />
    </>
  ),
}

/**
 * 對話框裡的表單走 `useFormValidation`(2026-10-01;form-validation.spec.md 可執行層):改過的欄位第一下 Esc 回復、第二下才關對話框
 * (keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」);沒有表單引擎的 `<Input>` 沒有「原值」可回復,Esc 直接關 ——
 * DS 自己的表單範例因此一律接 hook,預覽看到的就是裁示的行為。沒有 `<form>`:footer 鈕 `onClick={() => void form.handleSubmit()}`(規則 8b 的寫法)。
 * 送出成功 → Toast 再關閉(form-validation.spec.md「Submit 成功宣告」;user 2026-10-01 逐字「…然後送出成功跳提示」,文案是 AI 依 toast.spec 句型擬的)。
 * 建立表單每次打開都是空白的:打開那一刻 `reset()`(AI 推導)—— 取消、Esc、送出成功關閉都會經過下一次打開;關閉當下不清,收起動畫期間欄位不會先閃成空白。
 */
function CreateProjectDialogForm() {
  const [open, setOpen] = useState(false)
  const form = useFormValidation({
    initialValues: { name: '', description: '' },
    validate: { name: (v) => (String(v).trim() ? undefined : '專案名稱必填') },
    onSubmit: () => {
      toast({ variant: 'success', title: '專案已建立' })
      setOpen(false)
    },
  })
  const handleOpenChange = (next: boolean) => {
    if (next) form.reset()
    setOpen(next)
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>建立專案</Button>
      </DialogTrigger>
      {/* 建立專案:兩個欄位的短表單,開啟期間內容高度不會變 → hug(spec「高度軸」判準) */}
      <DialogContent height="hug">
        <DialogHeader>
          <DialogTitle>建立專案</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Field required invalid={!!form.errors.name}>
              <FieldLabel>專案名稱</FieldLabel>
              <Input placeholder="例:Q3 設計改版" {...form.getInputProps('name')} />
              <FieldError>{form.errors.name}</FieldError>
            </Field>
            <Field>
              <FieldLabel>描述</FieldLabel>
              <Input placeholder="一句話介紹專案目標..." {...form.getInputProps('description')} />
              <FieldDescription>選填，簡述專案用途</FieldDescription>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>建立</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const WithForm = {
  name: '表單',
  // Toast 的 Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one 是強制合約」允許 Storybook 各 story root 一個)
  render: () => (
    <>
      <Toaster />
      <CreateProjectDialogForm />
    </>
  ),
}

export const LongContent = {
  name: '長內容',
  // 按了才開(D2 甲:不要一進頁就開著);開著的畫面由 test-only「開啟狀態」那則給截圖與閘
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>開啟成員列表</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>成員列表</DialogTitle>
        </DialogHeader>
        {/* Body 放 list canonical(2026-05-01):body 撤 chrome padding(`!px-0 !pt-0 !pb-0`)+ list outer
            wrapper 自帶 `py-2`(menu group 8px breathing)+ item 自帶 `px-loose`(前緣對齊 header 標題)。
            成員列不可點,沒有 hover 底色(overlay-surface.spec.md:底色有無不是 List-as-region 的判定條件)。
            30 筆超出 viewport → 驗證預設高度(填滿)+ body 區捲動。 */}
        <DialogBody className="!px-0 !pt-0 !pb-0">{/* @tabs-content-gap-ok: list-as-region canonical(body 撤 chrome padding、list wrapper py-2 own;非 tabs !pt-0 hack)*/}
          {/* @layout-space-magic-ok: List-as-region 清單外框上下 8px 由清單自己帶(overlay-surface.spec.md:91「list outer wrapper 自帶 `py-2`」;Dialog body 的 padding 由 overlay-surface 擁有,dialog.spec.md「結構」) */}
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

// 觸發鈕後面還有一層確認 → secondary + danger(button.spec.md「danger prop — 語意意圖」;登記簿 E14);
// 標題一行寫出動作(登記簿 E17「header 只需要寫"是否刪除任務"之類的文案就好了吧?」)、內文寫出對象;確認後跳 Toast 再關閉
export const Destructive = {
  name: '危險操作',
  render: () => (
    <>
      <Toaster />
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" danger>刪除專案</Button>
        </DialogTrigger>
        {/* 確認刪除:單一決策的確認框,開啟期間內容高度不會變 → hug(spec「高度軸」判準) */}
        <DialogContent height="hug">
          <DialogHeader>
            <DialogTitle>是否刪除專案</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-body">確定要刪除「Q3 設計改版」?刪除後無法復原。</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="tertiary">取消</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary" danger onClick={() => toast({ variant: 'success', title: '專案已刪除' })}>刪除</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  ),
}

const TAG_OPTIONS = ['Bug', 'Feature', 'Improvement', 'Research', 'Documentation', 'Refactor', 'Test'] as const

// 選擇標籤:勾選只改暫存、按「套用」才寫回並關閉,觸發鈕顯示已套用的標籤(同 popover.stories.tsx 篩選面板的「暫存 → 套用」);
// 2026-10-28 前只有「關閉」,列可以點卻選不了(稽核 M097)。footer 只有取消與套用:沒有全選 / 重設的需求就不放(選取類 footer 順序〔UD-H15〕)
function TagPickerDialog() {
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState<string[]>(['Bug'])
  const [staged, setStaged] = useState<string[]>(applied)
  const handleOpenChange = (next: boolean) => {
    if (next) setStaged(applied)
    setOpen(next)
  }
  const toggle = (tag: string) => setStaged((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="tertiary">{applied.length ? `標籤:${applied.join('、')}` : '選擇標籤'}</Button>
      </DialogTrigger>
      <DialogContent height="hug" maxWidth={360}>
        <DialogHeader>
          <DialogTitle>選擇標籤</DialogTitle>
        </DialogHeader>
        <DialogBody className="!px-0 !pt-0 !pb-0">{/* @tabs-content-gap-ok: list-as-region canonical(body 撤 chrome padding、list wrapper py-2 own;非 tabs !pt-0 hack)*/}
          {/* 小 item 純文字 label → 選單列(世界級 Linear Cmd+K / Polaris OptionList /
              Atlassian Modal+Menu 共通 pattern:menu-like 內容在 dialog 內用 menu primitive)。
              容器用 Command(cmdk)而不是裸 MenuItem + `role="list"`:
              menu-item.spec.md「何時用 / 何時不用」禁止裸用 MenuItem(會失去鍵盤與焦點管理),而且 MenuItem 帶
              `role="option"`,外層若是 `role="list"` 是壞掉的無障礙父子關係(option 的合法父層是 listbox)。
              Command 自帶方向鍵導覽與 role="listbox",CommandGroup 自帶 py-2 = menu group 的 8px 呼吸。
              列的水平內距在 **Command 根**設一次 `--item-px: var(--layout-space-loose)`(16px),
              整份清單一起換 → 列的最前緣對齊 dialog header / footer。禁止寫在單列 className:
              CommandItem 是兩層,會跟內層相加(2026-09-17 實測 16+12=28px)。
              token owner: item-anatomy.spec.md「Token: --item-px」(預設 var(--field-px) 12px)。 */}
          <Command label="標籤選項" style={{ '--item-px': 'var(--layout-space-loose)' } as React.CSSProperties}>
            <CommandList>
              <CommandGroup>
                {TAG_OPTIONS.map((t) => (
                  <CommandItem key={t} value={t} checkbox checked={staged.includes(t)} onSelect={() => toggle(t)}>
                    {t}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">取消</Button>
          </DialogClose>
          <Button variant="primary" onClick={() => { setApplied(staged); setOpen(false) }}>套用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ListBody —— body 放清單(overlay-surface.spec.md「List-as-region in overlay body」):body 撤 chrome padding、
// list wrapper 自帶 py-2、item 自帶 px-loose(可點的列另帶 hover 底色;成員列不可點,不帶)。三則對應三種清單密度(item-anatomy Family 2 / 選單列)。
// (2026-10-28 前這段寫在 JSDoc,Autodocs 會把它當說明顯示給讀者;稽核 L136)
export const ListBody = {
  name: '主體放清單',
  // 三則範例對應三種清單密度(觸發鈕寫使用者會按的動作,密度註記住這裡 —— 2026-10-20 前寫在觸發鈕上,獨立驗證 OV-14);
  // 三則都是按了才開(D2 甲:不要一進頁就開著)
  parameters: {
    docs: {
      description: { story: '三種清單密度:「查看成員」= 大列(頭像 40 + 名稱 + 說明);「通知設定」= 中列(標題 + 說明 + 右側開關,在對話框裡直接設定);「選擇標籤」= 小列(純文字,走選單列,勾選後按「套用」)。' },
    },
  },
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)] items-start">
      {/* 大 item:avatar 40 + title + description(對齊 user 期望 + Material M3 + FileItem rich) */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="tertiary">查看成員</Button>
        </DialogTrigger>
        <DialogContent height="hug" maxWidth={520}>
          <DialogHeader>
            <DialogTitle>成員列表</DialogTitle>
          </DialogHeader>
          <DialogBody className="!px-0 !pt-0 !pb-0">{/* @tabs-content-gap-ok: list-as-region canonical(body 撤 chrome padding、list wrapper py-2 own;非 tabs !pt-0 hack)*/}
            {/* @layout-space-magic-ok: List-as-region 清單外框上下 8px 由清單自己帶(overlay-surface.spec.md:91「list outer wrapper 自帶 `py-2`」;Dialog body 的 padding 由 overlay-surface 擁有,dialog.spec.md「結構」) */}
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

      {/* 小 item:純文字 label(對齊 Linear Cmd+K 密集);勾選暫存、按「套用」才寫回(overlay-surface.spec.md「暫存選擇 + Save CTA 才 commit → Dialog + MenuItem」) */}
      <TagPickerDialog />
    </div>
  ),
}

// 標頭操作(actions slot,2026-07-08 WM 戰役 codify — 關閉鈕分隔線 SSOT 化)
// 真實場景:任務詳情 modal(Jira / Linear / Asana 任務檢視)— header 級 上一筆 / 下一筆 + ⋮ 更多操作,操作對象是「dialog 承載的這筆任務」本身。
// - `<DialogHeader actions={…}>`:DS 自動在 actions 與內建 Close X 之間放 `<ButtonDivider>`(action-bar.spec.md「五、分隔線規則」第 3 條誤觸保護);
//   Consumer 禁自刻 cluster + divider。按鈕 = `variant="text" iconOnly`(不撐高 48px chrome header;action-bar「溢出按鈕一律最低視覺重量」)。
// - 2026-10-28 前三顆都沒有行為(稽核 M097):上一筆 / 下一筆真的換任務(到頭到尾停用)、⋮ 打開 DropdownMenu;
//   選單項目做完跳 Toast(複製連結 = neutral、不帶 action,toast.spec.md 變體表;封存 = 關閉對話框 + success)。
// - 按了才開(D2 甲:不要一進頁就開著);這則的 Autodocs 說明 / JSDoc 改成一般註解(稽核 L136)
const SAMPLE_TASKS = [
  { key: 'WM-142', title: '結帳流程改版', desc: '重新設計結帳步驟,將付款方式與發票資訊合併為單一步驟,預期提升轉換率。', assignee: 'Alan Chen', status: '進行中', due: '2026-07-18' },
  { key: 'WM-143', title: '發票資訊欄位驗證', desc: '統一編號與載具條碼在送出前先驗格式,錯誤訊息貼在欄位下方。', assignee: 'Betty Wu', status: '待處理', due: '2026-07-22' },
  { key: 'WM-144', title: '付款失敗重試流程', desc: '付款被拒時保留購物車內容,提供換卡重試,不必重新填寫收件資料。', assignee: 'Charlie Lee', status: '待處理', due: '2026-07-29' },
] as const

function TaskDetailDialog() {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const task = SAMPLE_TASKS[index]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="tertiary">開啟任務詳情</Button>
      </DialogTrigger>
      <DialogContent height="hug" maxWidth={520}>
        <DialogHeader
          actions={
            <>
              <Button variant="text" iconOnly size="sm" startIcon={ChevronUp} aria-label="上一筆任務" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} />
              <Button variant="text" iconOnly size="sm" startIcon={ChevronDown} aria-label="下一筆任務" disabled={index === SAMPLE_TASKS.length - 1} onClick={() => setIndex((i) => i + 1)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="text" iconOnly size="sm" startIcon={MoreVertical} aria-label="更多操作" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => toast({ title: '已複製任務連結' })}>複製任務連結</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { setOpen(false); toast({ variant: 'success', title: `${task.key} 已封存` }) }}>封存任務</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        >
          <DialogTitle>{task.key} {task.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <p className="text-body">{task.desc}</p>
            {/* 2026-09-08:key / value 用 DescriptionList(owner:description-list.spec.md),不再手刻字級與欄寬 */}
            <DescriptionList orientation="horizontal">
              <DescriptionItem label="指派人">{task.assignee}</DescriptionItem>
              <DescriptionItem label="狀態">{task.status}</DescriptionItem>
              <DescriptionItem label="截止日">{task.due}</DescriptionItem>
            </DescriptionList>
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

export const HeaderActions = {
  name: '標頭操作',
  render: () => (
    <>
      <Toaster />
      <TaskDetailDialog />
    </>
  ),
}

// 標頭內含分頁(2026-05-18 從 patterns/header-canonical/header-canonical.stories.tsx 整合過來;user 當時要求整合進 Dialog、不另開 header canonical 資料夾)
// 對應 `header-canonical.spec.md` W1-W4:W1 Tabs 自畫 full-width border-divider 接管 chrome separator;W2 TabsList 全 dialog 寬 + 內 px-loose padding 對齊 title left;
//   W4 header content row + tabs row flush stack(gap = 0)。
// Anatomy(consumer 寫法):`<Tabs>` wrap 整 DialogContent → `<DialogHeader tabsSlot={<TabsList>}>` → `<DialogBody><TabsContent className="mt-0">...</TabsContent></DialogBody>`。
// TabsContent 必放 DialogBody 內(scroll + chrome padding 由 DialogBody 自管),不要自加 padding。一軸單一 spacing owner(item-anatomy.spec.md「垂直 padding 歸屬」):
//   DialogBody 內層已用 `pt-[var(--layout-space-tight)]` 擁有 header→content 的 chrome gap;TabsContent 預設帶 `mt-[var(--layout-space-tight)]`(為「緊接 tab bar 下方」而設),
//   tabsSlot 把 tab bar 抬進 header 後兩者疊加 = 雙重 tight(md 24 / lg 32,user 2026-07-01 抓)→ chrome body 內的 TabsContent 必 `className="mt-0"`
//   (對齊 AppShell 前例 app-shell.stories.tsx#PrimarySidebarWithTabs + tabs.spec.md「出現在 Dialog」段;Hook `check_tabs_content_chrome_body_double_gap.sh` 機械強制)。
// 2026-10-28:補 footer「取消 / 儲存」—— 分頁裡有可以改的欄位與開關,沒有存的地方 = 改了也帶不走(稽核 M097);儲存 → Toast 再關閉。
// (2026-10-28 前這段寫在 JSDoc,Autodocs 會把它當說明顯示給讀者;稽核 L136)
export const WithTabsInHeader = {
  name: '標頭內含分頁',
  render: () => (
    <>
      <Toaster />
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="tertiary">專案設定</Button>
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
              {/* mt-0:DialogBody pt-tight 已擁有 header→content gap,TabsContent 預設 mt-tight 會雙重(見上方 JSDoc)*/}
              <TabsContent value="general" className="mt-0">
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
              <TabsContent value="members" className="mt-0">
                <DescriptionList orientation="horizontal">
                  <DescriptionItem label="Alan Chen">管理員</DescriptionItem>
                  <DescriptionItem label="Betty Wu">編輯者</DescriptionItem>
                  <DescriptionItem label="Charlie Lee">檢視者</DescriptionItem>
                </DescriptionList>
              </TabsContent>
              <TabsContent value="integrations" className="mt-0">
                {/* 設定列:與本檔「通知設定」同一個寫法 —— 自帶標題的 <Switch label>(switch.spec.md「設定列 vs 水平 Field」),列與列之間 loose */}
                <div className="flex flex-col gap-[var(--layout-space-loose)]">
                  {[
                    { key: 'slack', label: 'Slack 通知', on: true },
                    { key: 'github', label: 'GitHub PR 同步', on: true },
                    { key: 'linear', label: 'Linear issue 連動', on: false },
                  ].map((it) => (
                    <Switch key={it.key} label={it.label} defaultChecked={it.on} />
                  ))}
                </div>
              </TabsContent>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="tertiary">取消</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="primary" onClick={() => toast({ variant: 'success', title: '專案設定已儲存' })}>儲存</Button>
              </DialogClose>
            </DialogFooter>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  ),
}

// 開啟狀態 —— 只給截圖 / 閘看(test-only,不進文件頁):defaultOpen 讓對話框一掛上就開著,截得到 Header / Body / Footer。
// 讀者看的展示 story 一律按了才開(D2 甲),開著的畫面集中在這一則。情境「確認刪除專案」涵蓋 title + body + footer 雙 action。
export const OpenSnapshot = {
  name: '開啟狀態',
  tags: ['test-only'],
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>打開 Dialog</Button>
      </DialogTrigger>
      <DialogContent height="hug" maxWidth={480}>
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

/* ── G1 POC:Modal Dialog 開著時,舞台上另一個浮層掛載會不會廢掉 Dialog 的焦點鎖 ──
   為什麼需要這個 probe:`@radix-ui/react-focus-scope/dist/index.mjs:71-73` 的
   `focusScopesStack.add(focusScope)` 寫在 `if (container)` 裡,**完全不看 `trapped`**;
   而 `add` 會對前一個 scope 呼叫 `pause()`(`:184-190`)。
   推論是「掛載任何 FocusScope(含 modal={false} 的)都會暫停正在生效的 Dialog 焦點鎖」——
   這是 agent 面板要與有 URL 的 Modal 並存(A 條)時的硬約束,**不能只憑讀原始碼下結論**。

   讀法:Dialog 開著、Popover 也開著時,連按 Tab 應該**永遠停在 Dialog 內**。
   若焦點跑到 Dialog 外(例如背景那顆按鈕),就證實焦點鎖被廢掉了。
   量測由 `scripts/dialog-focus-trap-poc.mjs` 執行。 */
export const FocusTrapWithConcurrentOverlay: Story = {
  name: '焦點鎖 × 並存浮層',
  // @example-basis: dialog.spec.md:282「焦點鎖在 Dialog 內，Tab 循環不逃出」
  parameters: { demoFocus: 'keep' },
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-col gap-3 p-6">
      <Button variant="tertiary" id="poc-outside-before">背景鈕(前)</Button>
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader><DialogTitle>並存浮層測試</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-2">
              <Button variant="tertiary" id="poc-inside-1">Dialog 內鈕 1</Button>
              <Button variant="tertiary" id="poc-inside-2">Dialog 內鈕 2</Button>
            </div>
          </DialogBody>
          <DialogFooter><DialogClose asChild><Button variant="tertiary">關閉</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 舞台上的另一個浮層 —— 模擬 agent 面板內開了一個選單。
          **用 DropdownMenu 不用 Popover**:Radix 的 PopoverContent 自己就帶 `role="dialog"`,
          會讓「焦點在不在 Dialog 內」的判定變模糊;而且非 modal Popover 的內容不進自然 Tab 順序,
          對照組因此建立不起來(2026-09-07 兩次都踩到)。 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="tertiary" id="poc-popover-trigger">舞台浮層</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem id="poc-popover-inner">浮層內項</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="tertiary" id="poc-outside-after">背景鈕(後)</Button>
    </div>
  ),
}

/* 上面那個 POC 的**對照組**:同樣的浮層,但沒有 Dialog。
   沒有這一組的話,「Tab 沒跑出 Dialog」也可能只是因為那顆鈕本來就走不到 —— 那樣就什麼都沒證明。 */
export const FocusTrapControlNoDialog: Story = {
  name: '同一版面沒有對話框時的焦點順序',
  // 上一則的對照組(同一版面拿掉 Dialog,Tab 走得到背景鈕),示範的是同一句焦點規格:
  // @example-basis: dialog.spec.md:282「焦點鎖在 Dialog 內，Tab 循環不逃出」
  parameters: { demoFocus: 'keep' },
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-col gap-3 p-6">
      <Button variant="tertiary" id="poc-outside-before">背景鈕(前)</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="tertiary" id="poc-popover-trigger">舞台浮層</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem id="poc-popover-inner">浮層內項</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="tertiary" id="poc-outside-after">背景鈕(後)</Button>
    </div>
  ),
}
