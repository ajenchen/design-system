import * as React from 'react'
import { MessageCircle, Phone, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * NameCardDefaultActions — canonical 預設 action 組合
 *
 * ── 為什麼需要 export ──
 * NameCard 的 action 列在世界級 chat/contact app 是「關係型快速動作」的 canonical
 * (Slack / iMessage / LinkedIn / Figma 皆如此):**Chat / Message + Audio call**。
 * 跨 consumer(avatar.principles / name-card.stories / future product code)應該用
 * 同一組預設,避免每個範例各自發明 action 組合,讓 reader 誤以為 action 會隨情境自動變。
 *
 * ── 使用方式(hover context 必含 onViewMore,見 name-card.spec.md 「View more」節)──
 *   <NameCard name="..." actions={<NameCardDefaultActions />} onViewMore={...} />
 *
 * ── 何時要換成自訂 action ──
 * - Single-action 情境(只要「傳訊息」)→ consumer 傳 `<Button>傳訊息</Button>`
 * - 特定情境的 action(管理員「撤銷邀請」/ HR「離職管理」)→ consumer 自訂
 * - 非人員關係動作(「訂購此商品」)→ 根本不應該用 NameCard
 *
 * Chat + Audio call 是 **default**,不是 **only**——consumer 可覆寫,但需有明確理由。
 */
export const NameCardDefaultActions = () => (
  <>
    <Button variant="tertiary" size="sm" startIcon={MessageCircle}>Chat</Button>
    <Button variant="tertiary" size="sm" startIcon={Phone} endIcon={ChevronDown}>Audio call</Button>
  </>
)

/**
 * NameCard — 人員 HoverCard 的內容元件
 *
 * ── Status 對齊 Avatar presence canonical(2026-04-20) ──
 * status type = `online | away | busy | offline`,跟 Avatar 的 presence prop 對齊
 * (世界級 Slack / Teams / Discord term);dot 色走 `--status-*` semantic token
 * (獨立於 success/error/warning,避免語義衝突)。
 *
 * ── Avatar 對齊 ──
 * 跟 FileItem rich 統一:右側 text column 用 justify-center + minHeight=avatar。
 * 短文字置中於 avatar,長文字(多行名字)自然撐高。
 *
 * ── Info fields ──
 * Status message / ID / Employee number 等唯讀屬性全部用 DescriptionList 家族
 * 承載(不手刻 dt/dd),canonical 由 DS primitive own。
 */

const AVATAR_SIZE = 64

type StatusType = 'online' | 'away' | 'busy' | 'offline'

// Presence semantic tokens(見 color/semantic.css)——跟 Avatar status dot 共用
const STATUS_DOT_COLOR: Record<StatusType, string> = {
  online: 'var(--status-online)',
  away: 'var(--status-away)',
  busy: 'var(--status-busy)',
  offline: 'var(--status-offline)',
}

const STATUS_LABEL: Record<StatusType, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
}

/**
 * NameCard SSOT — 預設 field keys(v11 always-render canonical,2026-05-06)
 *
 * ── 為什麼 SSOT ──
 * User explicit rule:「所有 namecard 預設顯示的資訊都是要一樣完整的」。前 v10 props
 * 全 optional + body conditional render → consumer 漏傳 fields 視覺缺 section,每個範例
 * 各自不一致(同 person 在 DataTable / PeoplePicker / avatar.principles 看起來不同)。
 *
 * v11 canonical:NameCard **always** renders 4 default sections regardless of consumer 是否
 * 傳資料 — 缺 data → 對應 DescriptionItem 顯 `EMPTY_PLACEHOLDER`("—"),section 結構不收合。
 * 視覺結構 SSOT 在此元件,不依賴 consumer。
 *
 * ── 對齊 world-class ──
 * Slack profile card / Linear member card / Notion person card / GitHub user card / Figma user card
 * 都是 fixed schema(role / email / location / department / department / pronouns 等),
 * 不會因為某 user 沒填 phone 整個 phone field 不見 — 缺 = 顯 `Not set` 或留白。
 *
 * ── 為什麼 placeholder 不 hide ──
 * Hide → consumer 不知道少傳 → 視覺漂移;Placeholder → 永遠看到「該欄該有」+ dev-warn 提示
 * consumer 補資料,自動防漂移(M19 ensure-canonical 對齊)。
 */
// **2026-05-07 v15.7 user directive**:default render 只 `id` + `employeeNumber` 兩個。
// Email / Phone / Department / Location 等其他 description 一律 opt-in by consumer 透過
// `fields` array prop。對齊 user 明確「應該確保所有都只有這兩個,因為我並沒有要求你要選其他的」。
export const NAMECARD_DEFAULT_FIELD_KEYS = ['id', 'employeeNumber'] as const
export type NameCardDefaultFieldKey = typeof NAMECARD_DEFAULT_FIELD_KEYS[number]

const DEFAULT_FIELD_LABEL: Record<NameCardDefaultFieldKey, string> = {
  id: 'ID',
  employeeNumber: 'Employee number',
}

const FIELD_PLACEHOLDER = '—'

export interface NameCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  avatar?: AvatarData
  subtitle?: string
  status?: StatusType
  statusMessage?: React.ReactNode
  actions?: React.ReactNode
  /**
   * Consumer 傳的 field 資料(partial)。預設 keys 走 `NAMECARD_DEFAULT_FIELD_KEYS` —
   * email / phone / department / location 永遠 render(缺資料顯 `—`)。Consumer 想新增
   * 自訂 field 直接傳入(在 default 之後 append),想 override default key value 也直接傳。
   */
  fields?: { label: string; value: React.ReactNode }[]
  /**
   * Default field 的真實值。Object key = NAMECARD_DEFAULT_FIELD_KEYS 之一。
   * 缺 key → render placeholder。Dev mode 會 console.warn 提醒消費者補資料。
   */
  defaultFieldValues?: Partial<Record<NameCardDefaultFieldKey, React.ReactNode>>
  onViewMore?: () => void
  viewMoreLabel?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const NameCard = React.forwardRef<HTMLDivElement, NameCardProps>(
  (
    {
      name,
      avatar,
      subtitle,
      status,
      statusMessage,
      actions,
      fields,
      defaultFieldValues,
      onViewMore,
      viewMoreLabel = 'View more',
      className,
      ...props
    },
    ref,
  ) => {
    // v11 always-render canonical:default fields 永遠 render(缺資料顯 placeholder),
    // consumer 自訂 fields 在 default 之後 append。Status section 也永遠 render(無 status
    // 顯「Status not set」placeholder),統一視覺結構。
    //
    // **Dedup canonical(2026-05-07 v15.8 fix Bug E)**:consumer 的 `fields` array 若含
    // label 撞 default(eg. 「ID」「Employee number」),consumer 值 win — defaults 那一行
    // 跳過(否則 same label 連 render 兩次,如 default placeholder `—` + consumer 真值)。
    // 這是遷移期 forgiving 行為:DEV warn 提示應改用 `defaultFieldValues`,但 production
    // 不破壞既有 consumer。對齊 React `key` 唯一性 + Linear / Slack profile card 一 label
    // 一 row idiom。
    const allFields = React.useMemo(() => {
      const consumerLabels = new Set((fields ?? []).map((f) => f.label))
      const defaults = NAMECARD_DEFAULT_FIELD_KEYS
        .map((key) => ({
          label: DEFAULT_FIELD_LABEL[key],
          value: defaultFieldValues?.[key] ?? FIELD_PLACEHOLDER,
        }))
        .filter((d) => !consumerLabels.has(d.label))
      return fields && fields.length > 0 ? [...defaults, ...fields] : defaults
    }, [defaultFieldValues, fields])

    // Dev warn:consumer 透過 `fields` 傳 default key label(legacy pattern)→ 應改 `defaultFieldValues`
    if (process.env.NODE_ENV !== 'production' && fields) {
      const legacyEntry = fields.find((f) =>
        Object.values(DEFAULT_FIELD_LABEL).includes(f.label as string),
      )
      if (legacyEntry) {
        // eslint-disable-next-line no-console
        console.warn(
          `[NameCard] "${name}":legacy pattern — fields[].label="${legacyEntry.label}" ` +
          `is a default field. Migrate to defaultFieldValues={{ id, employeeNumber }} prop ` +
          `to align with NAMECARD_DEFAULT_FIELD_KEYS canonical.`,
        )
      }
    }

    // Dev mode warn:consumer 沒傳 default field 任何 key → 提示補完(避免漂移成 placeholder-only)
    if (process.env.NODE_ENV !== 'production' && !defaultFieldValues) {
      // eslint-disable-next-line no-console
      console.warn(
        `[NameCard] "${name}":no defaultFieldValues passed — sections will render placeholders. ` +
        `Pass at least { id, employeeNumber } via defaultFieldValues prop. ` +
        `For other description items (email/phone/department/location etc),use \`fields\` prop array.`,
      )
    }

    // Layout canonical(2026-04-23):Header + Actions 固定上,Body(status + fields)可捲動,
    // View more 固定下。**NameCard 自己約束高度**,不依賴 consumer HoverCardContent 設 flex:
    //   - `max-h-[var(--radix-hover-card-content-available-height,...)]`:HoverCard / Popover
    //     context 自動繼承 Radix viewport-aware 變數;standalone 落到 100vh fallback
    //   - 內部 `flex flex-col + overflow-hidden`:Header(shrink-0)+ Body(flex-1 min-h-0 ScrollArea)
    //     + Footer(shrink-0)三層 chrome
    // 世界級對照:Slack / Linear / GitHub / Notion hover-profile popover 皆此 chrome pattern。
    return (
      <div
        ref={ref}
        className={cn(
          'w-[320px] flex flex-col overflow-hidden',
          'max-h-[var(--radix-hover-card-content-available-height,var(--radix-popover-content-available-height,100vh))]',
          className,
        )}
        {...props}
      >
        {/* ── HEADER(固定): profile + actions ── */}
        <div className="shrink-0 flex flex-col">
          <div className="flex items-start gap-3 px-4 py-3">
            <Avatar
              src={avatar?.src}
              alt={avatar?.alt ?? name}
              color={avatar?.color}
              size={AVATAR_SIZE}
              status={status}
              className="shrink-0"
            />
            {/* NameCard typography:label body-lg(16/1.5) + desc body(14/1.5) = reading mode + size="lg"。
                labelClassName escape hatch 加 font-medium(card context 語意)+ labelTruncate=false 允許 wrap。 */}
            <ItemContent
              label={name}
              description={subtitle}
              mode="reading"
              size="lg"
              labelTruncate={false}
              labelClassName="text-body-lg font-medium text-foreground"
              className="justify-center"
              style={{ minHeight: AVATAR_SIZE }}
            />
          </div>

          {/* Action buttons — 均分空間 + 填滿格子(canonical):多個 action 等寬瓜分容器,
              單一 action 也撐滿容器。`grid grid-flow-col auto-cols-fr` + `[&>*]:w-full`。
              世界級對照:iOS contact card / macOS contact / LinkedIn profile card 的 action row。 */}
          {actions && (
            <div className="grid grid-flow-col auto-cols-fr gap-2 px-4 pb-3 [&>*]:w-full">
              {actions}
            </div>
          )}
        </div>

        {/* ── BODY(可捲動,v11 always-render canonical): status + fields ──
            前 v10 用 `hasStatus || hasFields` conditional render → consumer 漏傳 → section
            消失 + 視覺結構在不同 consumer 不一致。v11:**永遠 render 兩個 section**(缺資料顯
            placeholder),user explicit「視覺結構統一」rule。 */}
        <ScrollArea className="flex-1 min-h-0 border-t border-divider">
          <div className="px-4 py-3 flex flex-col gap-3">
            {/* Status badge — dot 色走 --status-* presence token;無 status → muted 樣式 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: status ? STATUS_DOT_COLOR[status] : 'var(--color-neutral-5)' }}
              />
              <span className={cn('text-body', !status && 'text-fg-muted')}>
                {status ? STATUS_LABEL[status] : 'Status not set'}
              </span>
            </div>
            {/* Status message — 包 DescriptionList 維持 dl/dt/dd 語意。缺則顯 placeholder */}
            <DescriptionList>
              <DescriptionItem label="Status message">
                {statusMessage ?? <span className="text-fg-muted">{FIELD_PLACEHOLDER}</span>}
              </DescriptionItem>
            </DescriptionList>
          </div>

          <div className="border-t border-divider px-4 py-3">
            <DescriptionList cols={2}>
              {allFields.map((f) => (
                <DescriptionItem key={f.label} label={f.label}>
                  {f.value === FIELD_PLACEHOLDER
                    ? <span className="text-fg-muted">{FIELD_PLACEHOLDER}</span>
                    : f.value}
                </DescriptionItem>
              ))}
            </DescriptionList>
          </div>
        </ScrollArea>

        {/* ── FOOTER(固定): View more,py-3 canonical(12px,比一般 link 按鈕多呼吸) ── */}
        {onViewMore && (
          <div className="shrink-0 border-t border-divider px-4 py-3">
            <Button variant="link" size="sm" onClick={onViewMore} className="w-full">{viewMoreLabel}</Button>
          </div>
        )}
      </div>
    )
  },
)
NameCard.displayName = 'NameCard'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const nameCardMeta = {
  component: 'NameCard',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted'],
    fg: ['text-foreground'],
    ring: [],
  },
} as const

export { NameCard }
