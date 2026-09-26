// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldEmptyDisplay } from '@/design-system/components/Field/field-context'
import { Tag } from '@/design-system/components/Tag/tag'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { Avatar, AVATAR_STACK_CLASS, AVATAR_STACK_ITEM_CLASS, AVATAR_DISMISS_OVERLAY_PX, avatarStackItemStyle } from '@/design-system/components/Avatar/avatar'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { useTableIsScrolling } from '@/design-system/components/Field/field-context'
import { ItemPrefix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import {
  getAvatarStackVisibleCount,
  AVATAR_STACK_AVATAR_PX,
  AVATAR_STACK_OVERFLOW_CHIP_PX,
} from './avatar-stack-overflow'

// ── Types ───────────────────────────────────────────────────────────────────

// PersonData 承載 ProfileCard 所需的完整資訊。DS 全域 person avatar 的 hoverCard ProfileCard 顯示
// 同一組 sections(name + subtitle + status + 2 default fields(id + employeeNumber,見下方
// NAMECARD_DEFAULT_FIELD_KEYS 對齊註解)+ 自訂 fields + actions + View more)— 缺資料顯 placeholder;
// **例外:status undefined 時整 status block 省略(collapse,= loading transient,見 status jsDoc)**。
// 對齊 avatar.spec.md「person avatar hover → ProfileCard」DS-wide canonical。
export interface PersonData {
  name: string
  avatarUrl?: string
  /** 角色 / 部門 / ID 等 meta 單行(ProfileCard subtitle) */
  description?: string
  /** Presence 狀態(對齊 Avatar presence canonical)。**2026-05-14 v12 update**(per user 拍板):
   *  production 每 user 一定有 presence state,**undefined = loading transient(資料還沒讀到)**,
   *  不是「user 沒設定」。ProfileCard 在 undefined 期間隱藏整 status block,**禁** render「Status not set」
   *  placeholder 文字。 */
  status?: 'online' | 'away' | 'busy' | 'offline'
  /** Status 訊息(ProfileCard status section)。只在 status defined 時 render,缺則顯 `—` placeholder。
   *  Status undefined 整 block skip(無 statusMessage 也跟著 skip)。 */
  statusMessage?: React.ReactNode
  /** **2026-05-07 v15.7 user directive**:ProfileCard default 只 render `id` + `employeeNumber`,
   *  其他 description 一律 opt-in by consumer 透過 `fields` array prop。對齊
   *  `NAMECARD_DEFAULT_FIELD_KEYS = ['id', 'employeeNumber']`。 */
  id?: string
  employeeNumber?: string
  /** 自訂額外 fields(在 default fields 之後 append)。Email / Phone / Department / Location
   *  / 任何其他 description 一律走這個 prop(opt-in,consumer 自選)。 */
  fields?: { label: string; value: string }[]
  /** 跳至完整 profile 頁的 handler(hover ProfileCard 必含,不傳時 fallback noop placeholder) */
  onViewProfile?: () => void
  /** ProfileCard 預設 Chat 按鈕 handler(2026-07-06 user 拍板加接線;未傳 dev-warn,見 ProfileCardDefaultActions) */
  onChat?: () => void
  /** ProfileCard 預設 Audio call 按鈕 handler(ChevronDown 下拉行為留 v2) */
  onCall?: () => void
}

export type PersonValue = string | PersonData

function resolvePerson(value: PersonValue): PersonData {
  return typeof value === 'string' ? { name: value } : value
}

// buildPersonProfileCard — DS 全域 person avatar hoverCard 的 canonical ProfileCard JSX 建構器。
// SSOT for「avatar hover ProfileCard 一致視覺」— 任何 person avatar consumer 都走這個 helper,
// 不可繞道直接 build ProfileCard。
//
// **2026-05-07 v15.7 user directive**:default field values 只 `id` + `employeeNumber`,
// 對齊 NAMECARD_DEFAULT_FIELD_KEYS。其他 description(email/phone/department/location/etc)
// consumer 想顯式透過 `person.fields` opt-in 傳入。
function buildPersonProfileCard(person: PersonData): React.ReactNode {
  return (
    <ProfileCard
      name={person.name}
      subtitle={person.description}
      avatar={{ src: person.avatarUrl, alt: person.name }}
      status={person.status}
      statusMessage={person.statusMessage}
      defaultFieldValues={{
        id: person.id,
        employeeNumber: person.employeeNumber,
      }}
      fields={person.fields}
      actions={<ProfileCardDefaultActions onChat={person.onChat} onCall={person.onCall} />}
      // onViewMore hover context 必含(avatar.spec.md canonical)。consumer 傳
      // `onViewProfile` 則用真 handler,否則 noop placeholder(UI 仍渲染 View more
      // footer,避免 preview 變死路)。
      onViewMore={person.onViewProfile ?? (() => {})}
    />
  )
}

// ── Avatar Size ─────────────────────────────────────────────────────────────
// 與 Tag 高度對齊:sm=20px, md/lg=24px(對齊 item-anatomy AVATAR_SIZE.inline)

const AVATAR_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 20, md: 24, lg: 24 }

// ── PersonAvatar ────────────────────────────────────────────────────────────
// Consume DS `Avatar` primitive(2026-04-22 refactor,M1 SSOT consumption)+ 預設 ProfileCard
// hoverCard(avatar.spec.md DS-wide「person avatar hover → ProfileCard」canonical)。
//
// 之前用 local `<img>` / `<User icon />` hand-craft 繞過 DS Avatar,違反 M1。本次 refactor:
// - 所有 person avatar 經過 DS Avatar primitive(size 對應 uiSize family,fallback / icon / badge 集中管理)
// - 人員資訊 → ProfileCard(subtitle = description,actions = ProfileCardDefaultActions)

// 2026-05-13 (a) perf fix(per codex Layer C HoverCard subtree dominant):
// useMemo `buildPersonProfileCard` per-person stable ref。原 every render call → new JSX ref →
// Avatar.memo bails → HoverCard subtree 重建。Stable ref → memo skip → big win on scroll。
//
// (c) push-up scroll-defer:當 DataTable virtualizer.isScrolling=true,**完全不 build ProfileCard**
// (Avatar 收 undefined → 跳 HoverCard wrapper)。原 (c) v1 在 Avatar 層 skip wrapper 但 ProfileCard
// JSX subtree 仍在此處 build → 浪費 React reconciliation work。push 到此處才真省。
function PersonAvatar({
  person,
  size = 'md',
  className = '',
  style,
  disabled = false,
  stacked = false,
  dismissCutout = false,
}: {
  person: PersonData
  size?: 'sm' | 'md' | 'lg'
  className?: string
  style?: React.CSSProperties
  /** disabled field context(2026-07-14 deep-audit 修):抑制 ProfileCard hoverCard(Avatar 收
   *  undefined → 無 HoverCard wrapper / 無 tabIndex,真不可互動)+ avatar 自身 dim(host-controlled
   *  opacity — avatar.spec.md「Avatar 在 disabled 元件內 host-controlled opacity」canonical;
   *  PeoplePicker disabled 分支無 fieldCtx,Avatar self-dim 搆不到,host 補)。
   *  對齊 people-picker.spec.md「disabled:灰化整個 field,不可互動」。 */
  disabled?: boolean
  /** 頭像堆疊裡的一項 → 轉給 Avatar `stacked`(挖空;avatar.spec.md「頭像堆疊(疊在一起時)」) */
  stacked?: boolean
  /** 右上浮著移除 ×(AvatarDismissOverlay)→ 轉給 Avatar `dismissCutout`(× 顯示時把它底下連縫挖掉) */
  dismissCutout?: boolean
}) {
  const isTableScrolling = useTableIsScrolling()
  const nameCard = React.useMemo(
    () => (isTableScrolling || disabled ? undefined : buildPersonProfileCard(person)),
    [person, isTableScrolling, disabled]
  )
  return (
    <Avatar
      src={person.avatarUrl}
      alt={person.name}
      size={AVATAR_PX[size]}
      className={cn(className, disabled && 'opacity-disabled')}
      style={style}
      hoverCard={nameCard}
      stacked={stacked}
      dismissCutout={dismissCutout}
    />
  )
}

// ── Single Person Display ───────────────────────────────────────────────────

// 2026-05-14 item-anatomy SSOT fix(per codex+Layer A 共識 path (a) + user 拍板「全部做完」):
// outer 改 items-start + Avatar 外包 ItemPrefix primitive consumption。單行視覺 = items-center 等效;
// 多行(autoRowHeight cell)避免 avatar+name center 整 row 不對齊 first-line text top。M1 消費既有
// 對齊 TreeView / MenuItem / SelectionItem 共用 ItemPrefix wrap chevron/icon/avatar canonical。
function PersonDisplay({ value, size = 'md', disabled = false, onRemove }: { value?: PersonValue | null; size?: 'sm' | 'md' | 'lg'; /** 見 PersonAvatar.disabled jsDoc(抑制 hoverCard + dim) */ disabled?: boolean; onRemove?: () => void }) {
const emptyDisplay = useFieldEmptyDisplay()
  if (!value) return <span className="text-foreground">{emptyDisplay}</span>

  const person = resolvePerson(value)

  // 2026-05-14 I1 fix(per codex addendum verdict):outer `inline-flex` → `flex w-full`
  // 完成 truncate 寬度約束鏈。原 inline-flex content-width parent constrain 不到 name span
  // → cell overflow-hidden 硬裁 → ellipsis dots 不可見。改 flex(block-level full width)
  // + inner name span `flex-1 min-w-0 truncate` 真實 truncate-with-ellipsis 顯示。
  // 對齊 GitHub Primer ActionList / Slack users_select / Atlassian UserPicker truncation canonical。
  return (
    <span className="flex items-start gap-2 min-w-0 w-full">
      <ItemPrefix>
        <span className="relative inline-flex group/avatar">
          <PersonAvatar person={person} size={size} disabled={disabled} />
          {onRemove && <AvatarDismissOverlay onRemove={onRemove} label={person.name} />}
        </span>
      </ItemPrefix>
      <span className="truncate flex-1 min-w-0">{person.name}</span>
    </span>
  )
}
PersonDisplay.displayName = 'PersonDisplay'

// ── Multi Person Display ────────────────────────────────────────────────────
// 多人堆疊:avatar 重疊(-2px),不顯示人名。
// 第一個 avatar z-index 最高(在最上面),依此類推;+N 在最下面。
// 疊在一起的地方用挖空分開(不是外圈):幾何與層次都消費 Avatar 的頭像堆疊 SSOT
//(`AVATAR_STACK_CLASS` / `AVATAR_STACK_ITEM_CLASS` + `avatarStackItemStyle` + Avatar `stacked` + OverflowIndicator circle;avatar.spec.md「頭像堆疊(疊在一起時)」、
// people-picker.spec.md §D row 1)。
// 溢出時顯示 +N 指示器,hover 出 tooltip 列出溢出的人(avatar + 人名)。

function MultiPersonDisplay({
  value,
  size = 'md',
  max,
  measured = false,
  onRemove,
  disabled = false,
}: {
  value?: PersonValue[] | null
  size?: 'sm' | 'md' | 'lg'
  /** 最多顯示幾個 avatar(不含 +N),預設 3。`measured=true` 時忽略此 prop(改 container width 算)*/
  max?: number
  /**
   * 2026-05-15 codex Round 5 C+ SSOT fix:`measured=true` 啟動 container-width 量測(取代 hardcode `max ?? 3`)
   * → view + edit stack 同 algorithm(同 cell width → 同 overflow 判斷),不再 view 用固定 3 vs edit
   * 用 useOverflowCount。對齊 field-controls.spec.md:286 「4-mode 共享 renderer」contract + user round 3
   * verbatim「同空間兩判斷點」SSOT directive。Default false 保 backward compat(non-cell context 仍 max ?? 3)。
   */
  measured?: boolean
  /** 傳入時啟用 dismiss(edit mode),callback 接收被移除的 person */
  onRemove?: (person: PersonValue) => void
  /** 見 PersonAvatar.disabled jsDoc(抑制全 stack ProfileCard hoverCard + avatar dim) */
  disabled?: boolean
}) {
  const emptyDisplay = useFieldEmptyDisplay()
  // 2026-07-05 D3 P1 修(React #310 家族):3 hooks 原在 empty early return 之後 — value 非空↔空
  // 切換時 hook 數 0↔3 變動必 crash(現靠 consumer 三元切換 element type 偶然避開)。hoist 到 return 前。
  // 2026-05-15 Bug 3 fix(Claude+Codex Step 5 比稿 consensus):消費 shared `avatar-stack-overflow`
  // primitive。原 inline canvas-based formula 是 dual-implementation 違反 user SSOT「同 cell width 同
  // overflow 判斷」(edit path 用 Combobox useOverflowCount DOM offsetWidth / view path 用 inline
  // canvas)。**抽 primitive 統一**:view + edit 共用 `getAvatarStackVisibleCount` formula。
  // SSOT in `./avatar-stack-overflow.ts`,M14 mechanical guard 防 future drift。
  const containerRef = React.useRef<HTMLSpanElement>(null)
  const [measuredCount, setMeasuredCount] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    if (!measured || !value || value.length === 0) return
    const el = containerRef.current
    if (!el) return
    // **2026-09-06 修:量測對象必須是「被分配到的空間」,不是「自己畫多寬」**。
    //
    // 原本 `ro.observe(el)` + `availablePx: el.clientWidth` 量的是 stack 自己 —— 它是
    // `inline-flex`(收縮到內容),clientWidth 等於「目前畫了幾顆圓」,不是儲存格還剩多少。
    // 於是量測與佈局互為因果,形成單向棘輪:少畫一顆 → 量到更窄 → 再少畫一顆;而
    // 「1 顆 avatar + 1 顆 +N」本身是這條公式的穩定不動點(2 slots ⇒ visible = 1),
    // 空間還回來也**永遠回不去**。線上實測 grpW=46 / cellW=180 即此循環的證據 ——
    // 這就是「明明還有空間卻顯示成溢出、重整才會好」的真因(GitHub main 同樣有,非本次改壞)。
    //
    // 三個 `measured` 消費點(people-picker.tsx:260 / 281 / 308)的父層分別是
    // `flex w-full min-w-0` 與 `flex-1 min-w-0`,寬度由外層決定、**不受本元件內容影響**,
    // 量它才是 `getAvatarStackVisibleCount` jsdoc 講的 availablePx。
    const box = el.parentElement ?? el
    // **2026-09-07(B1)修:`width='hug'` 下量父層還是會自我回饋。**
    //
    // hug 的 field wrapper 是 `w-fit max-w-full`(field-wrapper.tsx:134)—— 它的寬度
    // **就是內容決定的**,所以裡面那層 `flex-1 min-w-0` 也跟著內容縮:少畫一顆 →
    // 父層變窄 → 再少畫一顆,棘輪只是往上搬了一層,沒有被拆掉。
    //
    // 拆法是找一個**不隨內容變**的量。欄位的「外框開銷」(左右 padding、邊框、同排的
    // chevron / 清除鈕 / gap)跟畫幾顆頭像無關,所以:
    //     可用寬 = 容器內容寬 − 外框開銷
    //     外框開銷 = wrapper 現在的寬 − 這個 slot 現在的寬
    // 兩個減數都在同一幀量,內容多寡同時影響兩者、相減後抵消 → 迴圈斷掉。
    //
    // fill 模式下這條公式與原本的「量父層」逐像素相同(wrapper 寬由容器決定,
    // slot = wrapper − 開銷,相減回來就是容器寬 − 開銷),所以**不需要分兩條路**;
    // 沒有 field wrapper 的用法(people-picker.tsx:256 那個 `flex w-full min-w-0`)
    // 找不到 `[data-field-mode]`,自然落回原本的量父層。
    const wrapper = el.closest<HTMLElement>('[data-field-mode]')
    const containingBlock = wrapper?.parentElement ?? null
    // 觀察對象是**儲存格的父層**,所以欄寬重分配、捲軸出現消失、列重掛,都會讓畫面上
    // 每一個 reviewers 儲存格同時收到通知。若每次通知都重量一遍外框開銷,就是
    // 「一次欄寬變動 × 視窗內幾十格 × 每格三次強制版面」。CPU 剖析(dpr2 + CPU×6)量到
    // 這支回呼 self time 102.7ms,而 main 前 15 名裡根本沒有它。
    //
    // 外框開銷(field 的 padding / border / 其他 slot)**不隨欄寬改變**,量一次就夠;
    // 真的變了(換密度、清除鈕出現)會重掛節點或讓下面的寬度判斷落到 <= 0,屆時自然重量。
    // 寬度沒變就直接返回,連 getAvatarStackVisibleCount 與 setState 都不必跑。
    let chromePx: number | null = null
    let lastAvailable = -1
    const calc = () => {
      // 先用一次便宜的讀取確認版面好了沒 —— 沒好就連外框開銷都不量,否則會把還沒排版的
      // 垃圾值快取起來、之後再也不重算(story 切換過渡、display:none、圖未載入都會走到)。
      const rawAvail = wrapper && containingBlock ? containingBlock.clientWidth : box.clientWidth
      if (rawAvail <= 0) { chromePx = null; lastAvailable = -1; return }
      if (wrapper && containingBlock && chromePx === null) {
        chromePx = wrapper.getBoundingClientRect().width - box.getBoundingClientRect().width
      }
      const availablePx = rawAvail - (chromePx ?? 0)
      // (story 切換過渡、display:none、圖未載入時會走到這裡;用 0 去算會鎖進收縮態且不再復原。)
      if (availablePx <= 0) return
      // 寬度沒變就不必再跑分配計算與 setState(觀察對象是儲存格父層,一次欄寬變動會同時
      // 喚醒畫面上每一格)。
      if (availablePx === lastAvailable) return
      lastAvailable = availablePx
      const visible = getAvatarStackVisibleCount({
        availablePx,
        total: value.length,
        avatarPx: AVATAR_STACK_AVATAR_PX[size],
        overflowChipPx: AVATAR_STACK_OVERFLOW_CHIP_PX[size],
      })
      setMeasuredCount(visible)
    }
    calc()
    // 觀察對象也要是不隨內容變的那個 —— hug 下 wrapper 自己會跟著內容縮,
    // 只觀察它等於在觀察自己的輸出。
    const ro = new ResizeObserver(calc)
    ro.observe(containingBlock ?? box)
    return () => ro.disconnect()
  }, [measured, size, value])

  if (!value || value.length === 0) return <span className="text-foreground">{emptyDisplay}</span>

  const resolvedMax = measured && measuredCount !== null ? measuredCount : (max ?? 3)
  const people = value.map(resolvePerson)
  const visible = people.slice(0, resolvedMax)
  const hidden = people.slice(resolvedMax)
  const overflow = hidden.length

  // 單人回退到 PersonDisplay(顯示名字)
  if (people.length === 1) {
    return <PersonDisplay value={value[0]} size={size} disabled={disabled} onRemove={onRemove ? () => onRemove(value[0]) : undefined} />
  }

  // 2026-05-14 item-anatomy SSOT fix(per codex+Layer A 共識):outer items-start + avatar stack
  // 鎖 first-line baseline(整 stack 是 prefix slot,h-[1lh] 對齊 first line)。
  // 項目總數含 +N(它是最後一項、在最下層)。
  const stackCount = visible.length + (overflow > 0 ? 1 : 0)
  return (
    <span ref={containerRef} className="inline-flex items-start min-w-0">
      <ItemPrefix className="!justify-start"><span className={cn('inline-flex items-center min-w-0', AVATAR_STACK_CLASS)}>
      {visible.map((person, i) => {
        // **2026-05-07 v15.11 Bug D 升級 SSOT**:visible avatar 也支援 inline dismiss
        // (對齊 user directive「avatar = tag」)。Dismiss overlay 走 `AvatarDismissOverlay`
        // 共用 SSOT(下方 export),Combobox tagRenderer / 此處 / 任何 future avatar consumer
        // 都用同一視覺 — 紅圈 X 對齊 avatar 右上,hover/focus-visible 才顯。
        const handleDismiss = onRemove ? () => onRemove(value![i]) : undefined
        return (
          <span key={person.name + i} className={cn(AVATAR_STACK_ITEM_CLASS, 'group/avatar')} style={avatarStackItemStyle(i, stackCount)}>
            <PersonAvatar
              person={person}
              size={size}
              stacked
              disabled={disabled}
            />
            {handleDismiss && <AvatarDismissOverlay onRemove={handleDismiss} label={person.name} />}
          </span>
        )
      })}
      {overflow > 0 && (
        // +N 也是堆疊的一項:包一層 item,結構與頭像項目相同(item > 觸發點 > 圓),挖空才對得上。
        <span className={AVATAR_STACK_ITEM_CLASS} style={avatarStackItemStyle(visible.length, stackCount)}>
        <OverflowIndicator
          count={overflow}
          size={size}
        >
          {hidden.map((person, i) => (
            <Tag
              key={person.name + i}
              color="neutral"
              size="sm"
              // Tag.avatar 是 ReactNode(非 AvatarData object)——傳 <Avatar> 元素。
              // Tag 內部用 `w-4 h-4 rounded-full` 容器 slot,Avatar 填滿 object-cover。
              // **hoverCard 必帶**(avatar.spec.md DS-wide canonical:所有 person avatar 必 hover → ProfileCard)。
              // 跟 PersonAvatar 共用 `buildPersonProfileCard` helper 確保顯示資訊一致。
              avatar={
                <Avatar
                  src={person.avatarUrl}
                  alt={person.name}
                  size={16}
                  // disabled field:同 PersonAvatar — 抑制 ProfileCard hoverCard(不可互動)
                  hoverCard={disabled ? undefined : buildPersonProfileCard(person)}
                />
              }
              onRemove={onRemove ? () => onRemove(value![resolvedMax + i]) : undefined}
            >
              {person.name}
            </Tag>
          ))}
        </OverflowIndicator>
        </span>
      )}
      </span></ItemPrefix>
    </span>
  )
}
MultiPersonDisplay.displayName = 'MultiPersonDisplay'

// ── AvatarDismissOverlay ────────────────────────────────────────────────────
// SSOT for「person avatar overlay dismiss」(2026-05-07 v15.12,user spec confirmed)。
//
// **Visual canonical**(對齊 DS new token `--surface-strong`):
//   - **12×12 圓**(固定,不隨 field size 變)
//   - **bg `--surface-strong`**(neutral-6-opaque),hover → `--surface-strong-hover`(自己的配對 = 下一階,
//     color.spec.md「Hover 換色配對總則」)。兩個主題都是 neutral-7-opaque:淺 #BFBFBF→#8C8C8C 變深、
//     深 #737373→#A6A6A6 變亮(semantic.css Surface 段)。2026-09-25 更正:原註解寫「light=neutral-5」與實值不符。
//   - **X icon size=12 strokeWidth=3**(icon 跟底色一樣大,對齊 checkbox checkmark
//     sm/md stroke 規格;2026-06-12 同步 checkbox 2026-05-18 簡化 3.5→3,SSOT →
//     packages/design-system/ds-canonical/references/ui-dev-rules.md「小尺寸 icon stroke 補償」)
//   - **text-on-emphasis**(白 X,確保飽和色底對比)
//   - **位置 `absolute -top-px -right-1`**(top -1px / right -4px,右緣凸出 avatar 外 4px —
//     v15.15 user-confirmed asymmetric canonical,rationale 見下方 className 內註解)
//
// **a11y**(codex P1 fix):`opacity-0` 而非 `display:none` — element 在 DOM/tab-order,
// keyboard tab 可達,觸控 focus-within 也顯。Hover / focus-within / focus-visible
// 三條件之一觸發 `opacity-100`。
//
// **Why centralize**:Combobox tagRenderer (PeoplePicker stack mode) + MultiPersonDisplay
// dismiss 共用 SSOT,改 1 處全 sync(M17 propagation)。
function AvatarDismissOverlay({ onRemove, label }: { onRemove: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove() }}
      data-collection-remove
      aria-label={`移除 ${label}`}
      // **Position(2026-05-07 v15.15 user-confirmed)**:asymmetric top -1px / right -4px — field padding-y
      // (4px sm/md)緊 → top 只 -1px 安全;padding-x 12px 寬鬆 → right 凸 4px 達 badge canonical visual。
      // 對齊 ClickUp 世界級 idiom(asymmetric offset by avatar/field size constraint)。
      // 幾何只有一個住所 `AVATAR_DISMISS_OVERLAY_PX`(avatar.tsx):Avatar 用同一組數字在頭像上挖 × 底下的洞。
      style={{ top: AVATAR_DISMISS_OVERLAY_PX.top, right: AVATAR_DISMISS_OVERLAY_PX.right, width: AVATAR_DISMISS_OVERLAY_PX.size, height: AVATAR_DISMISS_OVERLAY_PX.size }}
      className={[
        'absolute z-10',
        'inline-flex items-center justify-center',
        // **12×12,與底下頭像之間的縫是從頭像上挖出來的**(Avatar `dismissCutout`,由 PersonAvatarTag 傳;2026-09-26 待辦總帳 N49):
        // 此前是 `[box-shadow:0 0 0 2px var(--surface)]` 畫一圈當縫,深色 `--surface` 半透明 → 在頁面 / 卡片 / 滑過列上各是一圈錯色;
        // 挖空露出真正的底,不需要知道底色(同 avatar.tsx 狀態圓點 / 計數徽章 / 頭像堆疊)。
        // 聚焦時的藍框由全域 `:focus-visible` 外描邊畫,不再與白環搶同一個 box-shadow 屬性。
        'rounded-full',
        // bg-surface-strong = neutral-6-opaque / hover = neutral-7-opaque(both modes,
        // step-7 dark 公式自動 lighter → engaged 跨 mode 對稱)
        'bg-surface-strong text-on-emphasis hover:bg-surface-strong-hover',
        // a11y(codex P1 fix):opacity 而非 display:none — element 在 DOM/tab-order,
        // keyboard 可達。Hover / focus-within / focus-visible 三條件之一觸發。
        // **此行是移除鈕可見性的唯一 gating,刪掉 = 全部恆顯**(2026-08-05 anchor:撤 A 案時
        // 連同本行一起刪除,造成桌機 stack 所有 avatar 的 X 無條件顯示;mechanical guard
        // 見 scripts/test-hover-revealed-affordances.mjs)。
        'opacity-0 group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100',
        // **不加 touch 恆顯**(2026-08-05 user 否決前一版 A 案:「一般狀態直接把所有成員 avatar
        // 的 X 都秀出來,這樣看起來超亂」)。觸控的多人移除改由 PeoplePicker 自動降階為既有
        // pill 型態(Combobox tag SSOT,每顆 pill 自帶 X)承擔 — 見 people-picker.spec.md
        // 「觸控裝置(native 分支)」。本 overlay 維持 hover / focus 才顯的桌機語意。
        // 瞬間出現,不寫 transition-opacity(tokens/motion/motion.spec.md「hover 回饋不做過渡」;2026-09-26 延伸到滑過才出現的按鈕,待辦總帳 L9 / N4(3))。
      ].join(' ')}
    >
      <X size={12} strokeWidth={3} aria-hidden />
    </button>
  )
}

// ── PersonAvatarTag(Combobox tagRenderer SSOT for stack mode)─────────────
// PeoplePicker `multiDisplay='stack'` 模式 wraps Combobox,tagRenderer 不能用 Tag pill
// (那是 pill mode),改 render 此元件 — Avatar overlap 視覺 + AvatarDismissOverlay。
// 對齊 user directive「avatar = tag 概念,差別只在視覺,SSOT 一致」(2026-05-07 v15.13)。
//
// **架構**(v15.13 重構):本元件**不自包** `group/avatar` / `-ml-[var(--avatar-stack-overlap)]` overlap wrapper,
// 因 Combobox `tagRenderer` 結果會被內部 `<div shrink-0>` 包成 measurement wrapper
// (useOverflowCount 必要)。把 overlap + group 拉到 Combobox 的 `tagWrapperClassName`
// 上,sibling-level overlap + group selector 才能正確 chain → AvatarDismissOverlay 的
// `group-hover/avatar:opacity-100` 才會通。
//
// **挖空(2026-09-26)**:本元件拿不到自己是第幾顆,但不需要 —— Avatar `stacked` 的挖空由結構決定
//(所在 wrapper 前面有看得見的堆疊項目才挖;Combobox 量寬時 `hidden` 的 wrapper 不算),
// 見 avatar.tsx「頭像堆疊」段、people-picker.spec.md §D row 1。
function PersonAvatarTag({
  person, size = 'md', onRemove,
}: {
  person: PersonData
  size?: 'sm' | 'md' | 'lg'
  onRemove?: () => void
}) {
  return (
    <>
      <PersonAvatar person={person} size={size} stacked dismissCutout={!!onRemove} />
      {onRemove && <AvatarDismissOverlay onRemove={onRemove} label={person.name} />}
    </>
  )
}
PersonAvatarTag.displayName = 'PersonAvatarTag'

export { PersonDisplay, MultiPersonDisplay, PersonAvatarTag, buildPersonProfileCard, resolvePerson }
