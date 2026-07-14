/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 DropdownMenu / SelectMenu 等 menu 類 DS 元件 wrap 消費,end-user app 請用 wrapper 元件。
 */
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
// Row primitive 共用常數——統一從 item-layout pattern module 引入
import { ICON_SIZE, AVATAR_SIZE, ItemContent, itemPrefixAlignVariants, ROW_PADDING_BY_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * MenuItem — 所有 menu 類元件的共用視覺佈局層
 *
 * SelectMenu、DropdownMenu、未來的 ContextMenu 等都消費這個元件。
 * 它只負責 layout（padding、gap、prefix alignment、typography），
 * 互動行為由各 menu 的 Radix primitive 外層控制。
 *
 * ── 結構 ──
 *   [checkbox?]  [startIcon? | avatar?]  [label + description?]
 *
 * ── Prefix 對齊規則（24px 閾值）──
 *   prefix ≤ 24px  → h-[1lh]，對齊第一行 label
 *   prefix > 24px  → h-[calc(1lh+var(--item-gap-label-desc-scanning)+desc_1lh)](size-aware -scanning[-lg] 變體)，對齊文字區塊
 *   無 description → prefix 上限 24px
 *
 * ── Size ──
 *   sm / md / lg — 單行高度對齊 field-height token
 */

const CHECKBOX_SIZE: Record<string, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', lg: 'lg' }

// ── Item variants ──
const menuItemVariants = cva(
  [
    'flex items-start gap-2 px-3 w-full',
    'cursor-pointer select-none',
    'transition-colors duration-150',
    'outline-none',
    'focus-visible:bg-neutral-hover',
  ],
  {
    variants: {
      // 消費 ROW_PADDING_BY_SIZE SSOT(item-anatomy.tsx 導出)
      // 改一處 → 全 row primitive 自動同步(消除前 SidebarMenuButton 獨立實作 risk)
      size: ROW_PADDING_BY_SIZE,
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

// ── Prefix alignment container ──
// 消費 `itemPrefixAlignVariants`(SSOT from patterns/element-anatomy/item-anatomy.tsx)
// 原本 MenuItem 自管 cva 造成 drift 風險(block formula 改動需同步);改為共用 SSOT
// 讓公式只有一份,改 item-anatomy 一處 → MenuItem 自動同步。

// ── Component ──

export interface MenuItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof menuItemVariants> {
  /** Label 文字 */
  children: React.ReactNode
  /** 次要說明文字，顯示在 label 下方 */
  description?: React.ReactNode
  /** 左側 icon（LucideIcon），與 avatar / startContent 互斥 */
  startIcon?: LucideIcon
  /** startIcon 的 className 透傳(2026-07-08 WM 戰役:status 類彩色 icon 需求;disabled 色仍勝出) */
  startIconClassName?: string
  /** 左側頭像資料（AvatarData），元件內部渲染 Avatar。與 startIcon / startContent 互斥 */
  avatar?: AvatarData
  /**
   * 左側自訂內容（ReactNode），與 startIcon / avatar 互斥。與 `endContent` 對稱。
   *
   * **佔位與排列邏輯跟 startIcon 一模一樣**(2026-07-10 WM TypeIcon 彩色徽章需求):
   * 渲染在同一個 prefix 對齊容器(`itemPrefixAlignVariants` SSOT)內 —— gap / 對齊 /
   * shrink 全繼承,零平行 layout 邏輯,不可能與 startIcon 漂移。Consumer 唯一責任
   * 是節點尺寸對齊 `ICON_SIZE[size]`(sm/md=16px、lg=20px;如 `size-4` 徽章)。
   * 典型場景:類型徽章(彩底 + glyph)、status 圓點組合等 LucideIcon 表達不了的 leading 視覺。
   */
  startContent?: React.ReactNode
  /** 顯示 checkbox（多選模式由父層控制） */
  checkbox?: boolean
  /** Checkbox 選中狀態 */
  checked?: boolean | 'indeterminate'
  /** 單選選中（bg-neutral-selected 背景高亮，持續選中狀態） */
  selected?: boolean
  /** 後綴 Tag（ReactNode），靠右對齊 */
  tag?: React.ReactNode
  /** 後綴自訂內容（ReactNode），用於 DropdownMenu 的 badge/endIcon/shortcut 等 */
  endContent?: React.ReactNode
  /** 停用 */
  disabled?: boolean
  /** 作為群組標題（不可選，font-medium，fg-muted） */
  header?: boolean
  /**
   * Label 最大行數(line-clamp 截斷,超過顯示 ellipsis)。
   *
   * - `undefined`(預設 prop 值未傳)→ 套用元件預設 `1`(單行截斷,符合選單快速掃視需求)
   * - 數字(1-6)→ 截斷到該行數;>6 超出 line-clamp utility 支援範圍 → 不截斷(同 'none',見 lineClampClass)
   * - `'none'` → **明確**不截斷,自然 wrap 任意行數
   *
   * 為什麼用 `'none'` 而不是 `undefined` 表達不截斷?React props 的 destructure default
   * 在 `undefined` 時會接管,所以 `<MenuItem labelMaxLines={undefined}>` 等同沒傳,
   * 會 fallback 到預設 `1`。要明確覆寫成「不截斷」,必須用一個非 undefined 的 sentinel。
   */
  labelMaxLines?: number | 'none'
  /**
   * Description 最大行數。
   *
   * - `undefined`(預設 prop 值未傳)→ 套用元件預設 `1`(跟 label 對稱,維持掃視節奏)
   * - 數字(1-6)→ 截斷到該行數;>6 超出 line-clamp utility 支援範圍 → 不截斷(同 'none',見 lineClampClass)
   * - `'none'` → 明確不截斷
   *
   * 為什麼預設 1?Menu 的設計目的是「快速掃視多個選項挑一個」,垂直空間是
   * 寶貴的——一個過高的 item 會破壞 row rhythm,讓使用者眼睛重新校準。description
   * 跟 label 對稱地截到 1 行,確保所有 item 高度一致(無 desc / 有 desc 兩種高度)。
   * Consumer 若有合理理由要 2 行 description,可顯式 override。
   */
  descMaxLines?: number | 'none'
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

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
  (
    {
      children,
      description,
      startIcon: StartIcon,
      startIconClassName,
      avatar,
      startContent,
      checkbox,
      checked,
      selected,
      tag,
      endContent,
      disabled,
      header,
      size,
      labelMaxLines = 1,
      descMaxLines = 1,
      className,
      ...props
    },
    ref
  ) => {
    const sizeKey = size ?? 'md'
    const labelClampClass = lineClampClass(labelMaxLines)
    const descClampClass = lineClampClass(descMaxLines)
    const iconPx = ICON_SIZE[sizeKey]

    // ── 決定 avatar 容器尺寸 + 對齊模式 ──
    // 有 description → 使用 block 尺寸（32/40px），block 對齊
    // 無 description → 使用 inline 尺寸（20/24px），inline 對齊
    const avatarPx = avatar
      ? (description ? AVATAR_SIZE.block[sizeKey] : AVATAR_SIZE.inline[sizeKey])
      : 0
    const isBlockAlign = avatarPx > 24 && !!description

    const prefixAlign = isBlockAlign
      ? (`block-${sizeKey}` as const)
      : 'inline'

    const hasPrefix = !!StartIcon || !!avatar || !!startContent || checkbox

    // ── Header variant ──
    if (header) {
      return (
        <div
          ref={ref}
          className={cn(
            menuItemVariants({ size }),
            'font-medium text-fg-muted cursor-default pointer-events-none',
            className,
          )}
          role="presentation"
          {...props}
        >
          {children}
        </div>
      )
    }

    // ── ARIA 單一 owner gate(2026-07-05)──
    // consumer(DropdownMenu 各 item / SelectMenu option row)把 MenuItem 巢狀在 Radix / cmdk
    // 互動節點內時傳 role="presentation":外層 primitive 是唯一 ARIA owner(aria-checked /
    // aria-disabled 由外層宣告)。presentation 節點不得掛 ARIA state(axe aria-prohibited-attr
    // + 內外雙重宣告)→ 同步抑制 role="option" 與 aria-selected / aria-disabled 預設;
    // data-selected / data-disabled 保留(純樣式 hook,非 ARIA)。正規 listbox option 用法
    //(不傳 role)與 select-all row(role="checkbox")不受影響。
    const isPresentation = props.role === 'presentation'

    return (
      <div
        ref={ref}
        role={isPresentation ? 'presentation' : 'option'}
        aria-selected={isPresentation ? undefined : selected || (checked === true) || undefined}
        aria-disabled={isPresentation ? undefined : disabled || undefined}
        data-selected={selected ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        className={cn(
          menuItemVariants({ size }),
          !disabled && !selected && 'hover:bg-neutral-hover',
          !disabled && selected && 'bg-neutral-selected',
          // disabled 用 cursor-not-allowed(對齊 Button + Material/Polaris/Atlassian);
          // pointer-events-none 會讓 cursor 失效,改用 aria-disabled + onClick guard
          disabled && 'text-fg-disabled cursor-not-allowed',
          className,
        )}
        // 2026-07-04 robustness:先 spread 其餘 props、後放 guarded handlers — 消除
        // 「handler 置前 + 後方 runtime filter 同名 key」對屬性順序的隱性依賴,行為不變
        {...Object.fromEntries(Object.entries(props).filter(([k]) => k !== 'onClick' && k !== 'onKeyDown'))}
        onClick={disabled ? undefined : props.onClick}
        onKeyDown={disabled ? undefined : props.onKeyDown}
      >
        {/* Prefix 對齊容器 */}
        {hasPrefix && (
          <div className={cn(itemPrefixAlignVariants({ align: prefixAlign }))}>
            {checkbox && (
              // 2026-07-14 a11y(axe nested-interactive):此 checkbox 是純視覺 indicator —— checked
              // ARIA state 由外層 row 單一 owner 宣告(Radix menuitemcheckbox / cmdk option /
              // select-all row role="checkbox",見上方「ARIA 單一 owner gate」)。Radix Checkbox 渲
              // focusable <button role="checkbox">,巢狀在互動 row 內 = axe nested-interactive
              // violation;tabIndex=-1 不夠(axe-core no-focusable-content 對 tabindex<0 仍回
              // violation,僅 messageKey 換 notHidden)。aria-hidden 移出 AT tree(消 SR 內外雙重
              // checkbox 宣告)+ inert 移除 focusability(axe focusDisabled 認 inert → clean pass)。
              // inert:React 18 無 typing(React 19 才內建),以 spread cast 傳字串 attr。
              <Checkbox
                size={CHECKBOX_SIZE[sizeKey]}
                checked={checked === true ? true : checked === 'indeterminate' ? 'indeterminate' : false}
                disabled={disabled}
                tabIndex={-1}
                aria-hidden
                {...({ inert: '' } as object)}
                className="pointer-events-none"
              />
            )}
            {StartIcon && (
              <StartIcon
                data-prefix-type="icon"
                size={iconPx}
                className={cn('shrink-0', startIconClassName, disabled && 'text-fg-disabled')}
                aria-hidden
              />
            )}
            {avatar && (
              <Avatar
                data-prefix-type="avatar"
                src={avatar.src}
                alt={avatar.alt}
                color={avatar.color}
                hoverCard={avatar.hoverCard}
                size={avatarPx}
              />
            )}
            {startContent && (
              // 自訂 leading 節點:同容器 = 佔位/排列與 startIcon 一模一樣(見 props JSDoc)。
              // disabled 用 opacity-disabled(對齊本元件 suffix slot 對自訂 ReactNode 的同款處理)。
              <span
                data-prefix-type="content"
                className={cn('flex shrink-0 items-center', disabled && 'opacity-disabled')}
              >
                {startContent}
              </span>
            )}
          </div>
        )}

        {/* Content — 消費 ItemContent primitive(SSOT)。
            scanning mode 跟隨 size:sm/md = caption,lg = body(desc 比 label lg 16 小 1 tier)。
            labelClampClass / descClampClass 透過 className escape hatch 傳入(MenuItem 特化 labelMaxLines / descMaxLines 語意)。 */}
        <ItemContent
          label={children}
          description={description}
          mode="scanning"
          size={sizeKey === 'lg' ? 'lg' : 'md'}
          descriptionTone={disabled ? 'disabled' : 'secondary'}
          labelTruncate={false}
          labelClassName={cn(labelClampClass || 'break-words', disabled && 'text-fg-disabled')}
          descriptionClassName={cn(descClampClass || 'break-words')}
        />

        {(tag || endContent) && (
          // @row-slot-handcraft-allow: MenuItem 自身即 row primitive（item-anatomy Family 1 owner），此 tag/endContent 容器是 MenuItem 自有 suffix slot 實作，非外部 consumer hand-craft → 不再 wrap ItemSuffix
          <div className={cn(
            'flex items-center gap-2 shrink-0 h-[1lh] ml-auto',
            disabled && 'opacity-disabled',
          )}>
            {tag}
            {endContent}
          </div>
        )}
      </div>
    )
  }
)
MenuItem.displayName = 'MenuItem'

// ── Group ──
// MenuGroup — Menu-like group primitive(跨元件設計語言統一,SSOT 見
// `patterns/element-anatomy/item-anatomy.spec.md`「Group auto-separation」)
//
// 設計語言:每個 group 上下 8px + 相鄰 group 間 border-divider + 視覺 gap 16px
//
// 本元件用 Pattern A:`py-2 [&+&]:border-t [&+&]:border-divider`
// (適用外層容器無 py-2 的情境,例 Command.List——Group 自帶邊界 padding)
//
// **視覺必須跟 DropdownMenuGroup 等價**(見 dropdown-menu.tsx Pattern B 對照)。
// 改動前先讀 item-anatomy.spec.md「Group auto-separation」確認視覺不漂移。

export interface MenuGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const MenuGroup = React.forwardRef<HTMLDivElement, MenuGroupProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      className={cn('py-2 [&+&]:border-t [&+&]:border-divider', className)}
      {...props}
    >
      {children}
    </div>
  )
)
MenuGroup.displayName = 'MenuGroup'

// ── Footer ──

export interface MenuFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const MenuFooter = React.forwardRef<HTMLDivElement, MenuFooterProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('py-2 border-t border-divider', className)}
      {...props}
    >
      {children}
    </div>
  )
)
MenuFooter.displayName = 'MenuFooter'

// Story auto-compile metadata — Phase 1+2 migration
export const menuItemMeta = {
  component: 'MenuItem',
  family: 1,
  variants: {},
  sizes: {
    sm: {},
    md: {},
    lg: {},
  },
  defaultSize: 'md',
  states: ['default', 'hover', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-neutral-selected'],
    fg: ['text-fg-muted', 'text-fg-disabled'],
  },
} as const

export { MenuItem, MenuGroup, MenuFooter, menuItemVariants }
