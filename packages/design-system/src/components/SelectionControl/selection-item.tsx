/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Checkbox / RadioGroup wrap 消費,end-user app 請用 wrapper 元件。
 */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
import { ICON_SIZE, AVATAR_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'

// ── Selection Item Styles ───────────────────────────────────────────────────
// Checkbox 和 RadioGroup 共用的 item 佈局。
//
// 結構(item-anatomy.spec.md 4-slot 模型):
//   [control] [optional prefix(icon|avatar)] [content(label/desc)](3-slot,見 spec「定位」)
//
// padding 公式：py = (field-height - 1lh) / 2
//   - 單行時 item 高度 = field-height（對齊同 size 的 Input）
//   - 多行時 padding 不變（文字間距一致）
//   - density 切換時 field-height 自動調整，padding 跟著算
//
// 容器設 text-body / text-body-lg 建立 1lh context（div 上正常繼承）。
//
// ── 為什麼 NOT 消費 ROW_PADDING_BY_SIZE(item-anatomy.tsx SSOT,2026-04-24 consolidation)──
// menu / sidebar / tree 3 cva 統一消費 ROW_PADDING_BY_SIZE;SelectionItem 刻意不消費,
// 因 typography 不同(mode 差異,非 drift):
//   - ROW_PADDING_BY_SIZE:`text-body leading-compact`(scanning mode,緊湊)
//   - SelectionItem:`text-body`(**無 leading-compact** — reading mode,Checkbox/Radio 搭配
//     較長 label + description,需預設 1.5 leading 而非 1.3 compact)
// py 公式本身相同 — 若 field-height token 變動,本檔需手動同步(contained,由本註解 anchor 追)。

// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export const selectionItemStyles = cva(
  'flex items-start gap-2',
  {
    variants: {
      size: {
        sm: 'text-body py-[calc((var(--field-height-sm)_-_1lh)_/_2)]',
        md: 'text-body py-[calc((var(--field-height-md)_-_1lh)_/_2)]',
        lg: 'text-body-lg py-[calc((var(--field-height-lg)_-_1lh)_/_2)]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

type SizeKey = 'sm' | 'md' | 'lg'

// Avatar 尺寸 + Icon 尺寸從 item-layout module 共用,不在此 re-declare(避免漂移)
// AVATAR_SIZE / ICON_SIZE 都是 item-layout 的 canonical 常數。
//
// SelectionItem 跟 MenuItem 的差異:SelectionItem 有 control(checkbox/radio)。
// block 模式時 **control 跟 prefix 一起走 block 高度**——兩者都在 text block center,
// 維持「selection + identity」是一組的視覺語意,不會歪斜。
const AVATAR_PX = AVATAR_SIZE

// ── Block 對齊容器 ──
// sm/md: reading mode (body 14/1.5 + body 14/1.5) — gap token `reading`
// lg:    reading-lg mode (body-lg 16/1.5 + body 14/1.5) — gap token `reading-lg`
// desc 永遠 body(14) line-height;`1lh` 會 resolve 到 label 的 line-height(sm/md=21, lg=24)
const blockAlignClass: Record<SizeKey, string> = {
  sm: 'h-[calc(1lh+var(--item-gap-label-desc-reading)+var(--font-body-size)*1.5)]',
  md: 'h-[calc(1lh+var(--item-gap-label-desc-reading)+var(--font-body-size)*1.5)]',
  lg: 'h-[calc(1lh+var(--item-gap-label-desc-reading-lg)+var(--font-body-size)*1.5)]',
}

// ── Selection Item ──────────────────────────────────────────────────────────
// 通用 item 行：control + 可選 prefix(icon/avatar) + label + description。
// control 永遠包在 h-[1lh] 容器內,對齊第一行 label。
// prefix 走 24px 閾值規則,各自獨立對齊。

export interface SelectionItemProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof selectionItemStyles> {
  /** Checkbox 或 RadioGroupItem 元素(永遠存在,永遠 inline 對齊) */
  control: React.ReactNode
  /** Label 文字 */
  label: React.ReactNode
  /** 描述文字(fg-secondary;reading mode 永遠 14px) */
  description?: React.ReactNode
  /**
   * 可選的左側 icon(在 control 之後、label 之前)。LucideIcon 型別,元件內部控制尺寸
   * (16/16/20px @ sm/md/lg)。**永遠 inline 對齊第一行 label**(icon ≤24px)。
   * 與 `avatar` 互斥。
   */
  icon?: LucideIcon
  /**
   * 可選的左側 avatar(在 control 之後、label 之前)。`AvatarData` 資料型別,元件內部渲染 Avatar。
   * 尺寸由 `description` 自動決定(跟 MenuItem 同 convention):
   * - 無 desc → inline(20/24/24px),跟 control 同步在 label 第一行
   * - 有 desc → block(32/32/40px),跟 control 同步在 text block center
   *
   * Block 模式時 **control(checkbox/radio)也一起走 block 高度**——兩者都在
   * text block center,不會歪斜。與 `icon` 互斥。
   */
  avatar?: AvatarData
  /** htmlFor（label 指向 control 的 id） */
  htmlFor?: string
  /** disabled 狀態影響 label 顏色 */
  disabled?: boolean
  /**
   * Label 最大行數(line-clamp 截斷)。
   *
   * - `undefined`(預設 prop 值未傳)→ 套用元件預設 `'none'`(form 欄位允許任意長度)
   * - 數字 → 截斷到該行數
   * - `'none'` → 明確不截斷(語意等同預設)
   *
   * 為什麼用 `'none'` 而不是 `undefined`?React props 的 destructure default 在
   * `undefined` 時會接管,要明確覆寫必須用非 undefined 的 sentinel。
   */
  labelMaxLines?: number | 'none'
  /**
   * Description 最大行數。預設 `'none'`(不截)。
   */
  descMaxLines?: number | 'none'
  className?: string
}

/** 把 maxLines 轉成 line-clamp class;'none' / 0 → 空字串 */
function lineClampClass(maxLines: number | 'none'): string {
  if (maxLines === 'none' || !maxLines) return ''
  if (maxLines === 1) return 'line-clamp-1'
  if (maxLines === 2) return 'line-clamp-2'
  if (maxLines === 3) return 'line-clamp-3'
  if (maxLines === 4) return 'line-clamp-4'
  if (maxLines === 5) return 'line-clamp-5'
  if (maxLines === 6) return 'line-clamp-6'
  return ''
}

// ── PrefixSlot — 24px 閾值規則 ──
// icon(永遠 ≤24px)→ inline;avatar + 無 desc → inline;avatar + 有 desc → block(centered on text block)
type PrefixSlotProps = {
  icon: LucideIcon | undefined
  avatar: AvatarData | undefined
  sizeKey: SizeKey
  alignClass: string
  avatarPx: number
  disabled: boolean | undefined
}
function PrefixSlot({ icon: Icon, avatar, sizeKey, alignClass, avatarPx, disabled }: PrefixSlotProps) {
  if (!Icon && !avatar) return null
  return (
    <div className={cn(alignClass, 'flex items-center shrink-0')}>
      {Icon && (
        <Icon
          size={ICON_SIZE[sizeKey]}
          className={cn('shrink-0', disabled && 'text-fg-disabled')}
          aria-hidden
        />
      )}
      {!Icon && avatar && (
        <Avatar src={avatar.src} alt={avatar.alt} color={avatar.color} hoverCard={avatar.hoverCard} size={avatarPx} />
      )}
    </div>
  )
}

// ── ContentSlot — label + optional description ──
// inline-style fontSize 繞 tailwind-merge 把 text-body / text-fg-secondary 誤判同組衝突的 bug
type ContentSlotProps = {
  htmlFor: string | undefined
  disabled: boolean | undefined
  label: React.ReactNode
  description: React.ReactNode | undefined
  sizeKey: SizeKey
  labelClampClass: string
  descClampClass: string
}
function ContentSlot({ htmlFor, disabled, label, description, sizeKey, labelClampClass, descClampClass }: ContentSlotProps) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={htmlFor}
        // 2026-06-10 a11y:styled-disabled label 明告 inactive(WCAG 1.4.3 豁免可機判;對齊 FieldLabel 同修;a11y 補強不動 SSOT = AUTO 分權,user verbatim「確保所有的任務你都有做到完美做到完整」)
        aria-disabled={disabled || undefined}
        className={cn(
          'cursor-pointer block break-words',
          labelClampClass,
          disabled ? 'text-fg-disabled cursor-not-allowed' : 'text-foreground',
        )}
      >
        {label}
      </label>
      {description && (
        <p
          className={cn(
            sizeKey === 'lg' ? 'mt-[var(--item-gap-label-desc-reading-lg)]' : 'mt-[var(--item-gap-label-desc-reading)]',
            'break-words',
            descClampClass,
            disabled ? 'text-fg-disabled' : 'text-fg-secondary',
          )}
          style={{ fontSize: 'var(--font-body-size)' }}
        >
          {description}
        </p>
      )}
    </div>
  )
}

const SelectionItem = React.forwardRef<HTMLDivElement, SelectionItemProps>(
  (
    {
      control,
      label,
      description,
      icon: Icon,
      avatar,
      htmlFor,
      disabled,
      size,
      labelMaxLines = 'none',
      descMaxLines = 'none',
      className,
      ...props
    },
    ref
  ) => {
    const sizeKey: SizeKey = size ?? 'md'
    if (process.env.NODE_ENV !== 'production' && Icon && avatar) {
      // eslint-disable-next-line no-console
      console.warn('[SelectionItem] `icon` 和 `avatar` 互斥,只會渲染 icon。')
    }
    // Block 對齊:control 跟 prefix(avatar)一起走 block 高度,「selection + identity」視覺單元不歪斜
    const useBlock = !!avatar && !Icon && !!description && AVATAR_PX.block[sizeKey] > 24
    const avatarPx = useBlock ? AVATAR_PX.block[sizeKey] : AVATAR_PX.inline[sizeKey]
    const alignClass = useBlock ? blockAlignClass[sizeKey] : 'h-[1lh]'

    return (
      <div ref={ref} className={cn(selectionItemStyles({ size }), className)} {...props}>
        <div className={cn(alignClass, 'flex items-center shrink-0')}>{control}</div>
        <PrefixSlot icon={Icon} avatar={avatar} sizeKey={sizeKey} alignClass={alignClass} avatarPx={avatarPx} disabled={disabled} />
        <ContentSlot
          htmlFor={htmlFor}
          disabled={disabled}
          label={label}
          description={description}
          sizeKey={sizeKey}
          labelClampClass={lineClampClass(labelMaxLines)}
          descClampClass={lineClampClass(descMaxLines)}
        />
      </div>
    )
  }
)
SelectionItem.displayName = 'SelectionItem'

// Story auto-compile metadata — Phase 1+2 migration
export const selectionItemMeta = {
  component: 'SelectionItem',
  family: 2,
  variants: {},
  sizes: {
    sm: {},
    md: {},
    lg: {},
  },
  defaultSize: 'md',
  states: ['default', 'disabled'], // disabled 是唯一視覺狀態;selected / hover 屬傳入的 control(spec「為何無 ColorMatrix / StateBehavior」)
  tokens: {
    fg: ['text-foreground', 'text-fg-secondary', 'text-fg-disabled'],
  },
} as const

export { SelectionItem }
