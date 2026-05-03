// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational SSOT for Family 1+2 row primitives + all item-anatomy helpers(ItemContent / ItemIcon / ItemPrefix / ItemSuffix / ItemInlineAction 等),拆檔會讓 primitive 跨檔 import 滿天飛
import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Avatar, type AvatarProps } from "@/design-system/components/Avatar/avatar"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/design-system/components/Tooltip/tooltip"

// ── InlineActionConfig ─────────────────────────────────────────────────────
// 宣告式 API:consumer 只宣告 intent,host 根據 size tier 自動渲染。
// 跨 Family 消費(Field family + Row family),SSOT 住 patterns/element-anatomy/
// 對齊 inline-action.spec.md「API 設計」節。
//
// Canonical 實作:`ItemInlineAction`(本檔內)。
export interface InlineActionConfig {
  icon: LucideIcon
  /** aria-label,同時作為 tooltip 來源 */
  label: string
  /**
   * 點擊 handler。可選接收 React 事件物件——有需要時可呼叫 `stopPropagation()` 避免
   * 事件冒泡到父層(例如 Select 清除按鈕在 popover trigger 內,不想觸發 popover open)。
   */
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void
}

/**
 * Item Layout — 共用工具與常數
 *
 * 這個檔案不是元件,是 `item-anatomy.spec.md` 的 code-level 實作。
 * 所有 row primitives(`MenuItem` / `TreeItem` / `SidebarMenuButton` /
 * `SelectionItem`)**必須 import 本 module 的 ICON_SIZE 和 helpers**,
 * 不要各自複製常數或 wrapper className——單一 source of truth,避免不一致。
 *
 * 詳細規則見 `item-anatomy.spec.md`。
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Row primitive 的 size 變體,對齊 `--field-height-*` token family */
export type RowSize = "sm" | "md" | "lg"

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Icon 尺寸(px)per row size。
 *
 * - sm / md: 16px(標準 row icon)
 * - lg: 20px(對齊 text-body-lg 的視覺重量)
 *
 * **用法**:透過 Lucide icon 的 `size` prop 直接傳入,不要用 CSS `[&>svg]:size-*`
 * selector——當 icon 被包在 `<ItemPrefix>` 的 `h-[1lh]` wrapper 內時,
 * `>` 直接子選擇器會失效,Lucide icon 會 fallback 到預設 24px。
 *
 * ```tsx
 * import { ICON_SIZE } from "@/design-system/patterns/element-anatomy/item-anatomy"
 *
 * const iconPx = ICON_SIZE[size]  // size: RowSize
 * <MyLucideIcon size={iconPx} />
 * ```
 */
export const ICON_SIZE: Record<RowSize, number> = {
  sm: 16,
  md: 16,
  lg: 20,
}

/**
 * Avatar 尺寸(px)per row size,分 inline / block 兩種模式。
 *
 * - **inline**(無 description,大宗情境)→ 對齊第一行 label,用 `h-[1lh]` 容器
 *   sm: 20, md: 24, lg: 24
 * - **block**(有 description,avatar 跨越 label + desc 兩行)→ 對齊文字塊中心
 *   sm: 32, md: 32, lg: 40
 *
 * **用法**:所有 row primitive 的 consumer(包含 `asChild` pattern 的 Sidebar / Tree
 * consumer)**必須**從本 module import 這個常數,**不可硬寫 `size={24}`**。
 * 硬寫會讓 sm 變體的 avatar 尺寸錯誤、跟 ICON_SIZE 對齊規則脫鉤。
 *
 * ```tsx
 * import { AVATAR_SIZE } from "@/design-system/patterns/element-anatomy/item-anatomy"
 *
 * const { size } = useSidebar()  // RowSize
 * <Avatar size={AVATAR_SIZE.inline[size]} />
 * ```
 *
 * Canonical 實作:`MenuItem` 的內部 `AVATAR_SIZE` 查表(即將 re-export 自此)。
 */
export const AVATAR_SIZE = {
  inline: { sm: 20, md: 24, lg: 24 },
  block:  { sm: 32, md: 32, lg: 40 },
} as const satisfies Record<"inline" | "block", Record<RowSize, number>>

/**
 * 回傳 uniform prefix slot 的 inline style(CSS variable form)。
 *
 * 用法:Row-primitive 頂層容器(例如 `<SidebarProvider uniformPrefix>` 的 wrapper)
 * 把這個 style 套在 `style` prop 上(預先放在 `--mixed-prefix-slot` 候選位置,
 * 由外層 CSS `:has()` 條件化套到 `--item-prefix-slot`),子樹內所有 `<ItemPrefix>` /
 * `<ItemIcon>` / `<ItemAvatar>` 會自動用固定寬槽對齊。
 *
 * 槽寬 = `AVATAR_SIZE.inline[size]`(20/24/24 @ sm/md/lg)——以最大的 inline
 * prefix(avatar)為基準,icon 在槽內 `justify-center`。
 *
 * ```tsx
 * <ul style={getUniformPrefixSlotStyle(size)}>
 *   <ItemIcon icon={Folder} />      ← 16px icon 在 24px 槽內置中
 *   <ItemAvatar alt="GitHub" />     ← 24px logo 填滿槽
 * </ul>
 * ```
 */
export function getUniformPrefixSlotStyle(size: RowSize): React.CSSProperties {
  return { "--item-prefix-slot": `${AVATAR_SIZE.inline[size]}px` } as React.CSSProperties
}

/**
 * Inline action(suffix 裡的 hover-action icon button)hover 背景尺寸(px)。
 * 規則:icon size + 2px(每邊 +1px,用 absolute positioning 溢出不影響排版)。
 * 對齊 `item-anatomy.spec.md`「Inline Action 設計規格」節。
 */
// code-quality-allow: dead-export — public constant — DS API surface,consumer 可引(即使當前 internal-only)
export const INLINE_ACTION_HOVER_BG_SIZE: Record<RowSize, number> = {
  sm: 18,
  md: 18,
  lg: 22,
}

/**
 * `ROW_PADDING_BY_SIZE` — Family 1+2 row primitive 的 size → padding + typography 公式 SSOT
 *
 * Formula(canonical):`py = (field-height - 1lh) / 2`,對齊 1em text 到 field-height center。
 *
 * **消費者**:menuItemVariants / sidebarMenuButtonVariants / treeItemVariants / 未來 row primitive
 * **Rationale**:前先 3 cva 各自寫同一公式 → drift risk(item-anatomy.spec 有明文「SidebarMenuButton
 * 獨立實作風險」)。抽本 export 後改**一處全同步**,risk 消失(對齊 Meta-Pattern M17「SSOT 必可傳播」)。
 *
 * 2026-04-24 D Phase 1+2 consolidation 建立。
 */
export const ROW_PADDING_BY_SIZE: Record<RowSize, string> = {
  sm: 'text-body leading-compact py-[calc((var(--field-height-sm)-1lh)/2)]',
  md: 'text-body leading-compact py-[calc((var(--field-height-md)-1lh)/2)]',
  lg: 'text-body-lg leading-compact py-[calc((var(--field-height-lg)-1lh)/2)]',
}

// ── Helper components ──────────────────────────────────────────────────────

/**
 * `<ItemPrefix>` — Row primitive 的 prefix slot wrapper。
 *
 * 把 prefix(icon / avatar / checkbox / indicator)包進 `h-[1lh]` 容器,
 * 強制對齊第一行文字中線。這是 item-layout 的底層規則(詳見 spec「Prefix 垂直對齊」)。
 *
 * **為什麼**:
 * - Row primitive 的 outer flex 是 `items-start`(多行 label 時 prefix 不飄移)
 * - 單行時 prefix 透過這個 wrapper 強制對齊第一行中線,視覺效果 = `items-center`
 * - 不同尺寸的 prefix(icon 16、Avatar 24、Checkbox 20)都能穩定置中
 *
 * 用法:
 * ```tsx
 * <div className="flex items-start gap-2">
 *   <ItemPrefix>
 *     <Avatar size={24} />
 *   </ItemPrefix>
 *   <span className="min-w-0 flex-1 truncate">{label}</span>
 * </div>
 * ```
 *
 * asChild 的 consumer(例如 `<SidebarMenuButton asChild>`)**必須自己**用這個 wrapper
 * 包 prefix,不能省略。
 */
export const ItemPrefix = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "h-[1lh] shrink-0 flex items-center",
      // Uniform prefix slot:讀取 `--item-prefix-slot` CSS variable,
      // fallback `auto`(= 預設行為,不佔額外寬度、不 center)。
      // Row-primitive 頂層容器(例如 `<SidebarProvider uniformPrefix>` 的 wrapper)
      // 若設定這個 var,小尺寸 prefix(icon 16px)會在固定寬槽(24px @ md)內置中,
      // 與大尺寸 prefix(app logo 24px)對齊,達成 label 齊左。
      // 詳見 item-anatomy.spec.md「Uniform prefix slot」節。
      "min-w-[var(--item-prefix-slot,auto)] justify-center",
      className
    )}
    {...props}
  />
))
ItemPrefix.displayName = "ItemPrefix"

/**
 * `itemPrefixAlignVariants` — Prefix 對齊高度的 cva SSOT(for 複雜 prefix 結構)。
 *
 * ── 存在的理由 ──
 * `<ItemPrefix>` primitive 預設單一 child(icon / avatar 任一)+ inline 對齊。
 * 但**複雜 prefix 結構**(e.g. MenuItem 可同時含 checkbox + icon/avatar 多 child)
 * 或**block mode**(大 prefix + description 對齊塊中心)需要自建 wrapper cva。
 * 本 cva 把 block formula SSOT 化,讓 MenuItem 等 consumer 共用,
 * 改值一處(token or cva)→ 所有 block-prefix consumer 同步。
 *
 * ── Align 變體(對齊 item-anatomy.spec.md「24px 閾值對齊規則」) ──
 * - `"inline"`:`h-[1lh]`,小 prefix(≤ 24px)對齊 label 第一行
 * - `"block-sm"` / `"block-md"`:大 prefix + scanning desc(sm/md menu),
 *   高度 = label(1lh) + gap(token) + desc(caption × 1.3)
 * - `"block-lg"`:大 prefix + scanning desc(lg menu),desc 改為 body × 1.3
 *
 * ── Consumer ──
 * MenuItem(inline / block-sm / block-md / block-lg)。其他 row primitive 簡單情境
 * 直接用 `<ItemPrefix>` 就好,不需此 cva。
 *
 * ── SSOT 傳播 ──
 * gap 用 `var(--item-gap-label-desc)` token;font-size 用 token-awareness
 * (`var(--font-caption-size)` / `var(--font-body-size)`)。改 token → 公式同步。
 */
// code-quality-allow: long-function — cva variant/styles table — 拆 fn 會失去 type inference + 跨 fn 傳 config 反而難讀
export const itemPrefixAlignVariants = cva(
  "flex items-center gap-2 shrink-0",
  {
    variants: {
      align: {
        inline: "h-[1lh]",
        // sm/md desc = text-caption (12px × 1.3 = 15.6px)
        // block-sm / block-md:scanning mode(body + caption 組合)→ 用 scanning mode 專屬 gap token
        "block-sm":
          "h-[calc(1lh+var(--item-gap-label-desc-scanning)+var(--font-caption-size)*1.3)]",
        "block-md":
          "h-[calc(1lh+var(--item-gap-label-desc-scanning)+var(--font-caption-size)*1.3)]",
        // block-lg:scanning-lg mode(body-lg + body compact 組合)→ 用 scanning-lg mode 專屬 gap token
        "block-lg":
          "h-[calc(1lh+var(--item-gap-label-desc-scanning-lg)+var(--font-body-size)*1.3)]",
      },
    },
    defaultVariants: {
      align: "inline",
    },
  }
)

/**
 * `<ItemLabel>` — Row primitive 的 label span。
 *
 * 預設 `min-w-0 flex-1 truncate`——單行截斷,佔滿剩餘 flex 空間。
 * 加 `data-sidebar="menu-label"` attribute 讓 sidebar icon 模式的 CSS selector 能命中。
 *
 * 用法:
 * ```tsx
 * <ItemLabel>{label}</ItemLabel>
 * ```
 */
export const ItemLabel = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-sidebar="menu-label"
    className={cn("min-w-0 flex-1 truncate", className)}
    {...props}
  />
))
ItemLabel.displayName = "ItemLabel"

/**
 * `<ItemContent>` — Row primitive 的 label + optional description 內容區(SSOT)。
 *
 * ── 存在的唯一理由 ──
 * 封裝「flex-col + label + description + `mt-[var(--item-gap-label-desc)]` gap」結構,
 * 避免 13+ 消費者各自 hard-code `mt-0.5`。改 token 一處,全 DS 同步。
 *
 * ── Consumer 偏離 canonical ──
 * 消費端若有**確切合理理由**不用 `<ItemContent>` / 需自訂 label/desc 行為,必在
 * 該元件 `spec.md` 明文寫下 rationale(對齊 item-anatomy canonical「偏離必明文」)。
 * 合法偏離範例:
 *   - MenuItem 的 `leading-compact + text-caption` scanning-mode typography
 *     → MenuItem spec 明文 rationale + 消費 `--item-gap-label-desc` token 直接用
 *   - SelectionItem 的 control slot 跟 block formula 綁定
 *     → SelectionItem spec 明文 rationale
 *
 * ── Props ──
 * - `label`:label 內容(ReactNode,必填)
 * - `description`:description 內容(ReactNode,optional)
 * - `mode`:typography tier(scanning vs reading,世界級對齊 Material `dense` / Carbon `size` / Ant `size`)
 *   - `"reading"`(預設):繼承 parent `text-body`(14px / 1.5 leading),舒適閱讀(Family 2 / Material body-large 派)
 *   - `"scanning"`:desc 縮為 `text-caption`(12px)+ `leading-compact`(1.3),緊湊掃視
 *     (Family 1 Menu item / Material body-medium dense 派)
 * - `descriptionTone`:desc 顏色語意
 *   - `"secondary"`(預設):`text-fg-secondary`
 *   - `"error"`:`text-error-text`
 *   - `"muted"`:`text-fg-muted`
 * - `descriptionWrap`:desc 多行 wrap(預設 true)/ false = truncate
 * - `labelClassName` / `descriptionClassName`:escape hatches(明文 rationale 才用)
 *
 * ── World-class benchmark ──
 * 6 家 DS(Material / Polaris / Atlassian / Apple HIG / Carbon / Ant)一致用
 * 14/20 vs 16/24 兩擋 body 表達 scanning vs reading。API 兩派:(A)密度 prop
 * Material `dense` / Carbon `size` / Ant `size`(本 DS 採 A 派);(B)typography
 * token 手選 Polaris / Atlassian / Apple。
 */

export interface ItemContentProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  label: React.ReactNode
  description?: React.ReactNode
  /**
   * Typography mode — **leading 行為**(跟 size 正交的另一維):
   * - `"reading"`(預設):default leading(1.5)— Family 2 List item 舒適閱讀
   * - `"scanning"`:`leading-compact`(1.3)+ desc 降一 tier —— Menu item / Step 掃視
   */
  mode?: "reading" | "scanning"
  /**
   * Size tier — **label 字級**(跟 mode 正交的另一維):
   * - `"md"`(預設):label `text-body`(14)
   * - `"lg"`:label `text-body-lg`(16)— desc 永遠比 label 小一 tier(body)
   *
   * 2 × 2 = 4 typography 組合,對應 4 tokens:
   * - md + reading  → body(14/1.5) + body(14/1.5)
   * - md + scanning → body(14/1.3) + caption(12/1.3)
   * - lg + reading  → body-lg(16/1.5) + body(14/1.5)
   * - lg + scanning → body-lg(16/1.3) + body(14/1.3)
   */
  size?: "md" | "lg"
  descriptionTone?: "secondary" | "error" | "muted" | "disabled"
  descriptionWrap?: boolean
  /**
   * Description 多行截斷(line-clamp-N)。undefined = 不 clamp(自由 wrap)。
   * Tailwind line-clamp utilities 支援 1-6。
   */
  descriptionClamp?: number
  /**
   * Description `break-words`(default `false`,僅在 consumer 需要時 opt-in)。
   * 使用情境:SelectionItem / Steps 這類 description 可能塞長英文 token 需 break。
   */
  descriptionBreakWords?: boolean
  /**
   * Label truncate (default `true`, 對齊 row-item 大宗 idiom)。
   * Opt-out(`false`)for card-like consumers(e.g. NameCard label 允許 wrap)。
   * World-class 對照:Material `ListItemText primaryTypographyProps.noWrap` default true。
   */
  labelTruncate?: boolean
  labelClassName?: string
  descriptionClassName?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
export const ItemContent = React.forwardRef<HTMLDivElement, ItemContentProps>(
  (
    {
      label,
      description,
      mode = "reading",
      size = "md",
      descriptionTone = "secondary",
      descriptionWrap = true,
      descriptionClamp,
      descriptionBreakWords = false,
      labelTruncate = true,
      labelClassName,
      descriptionClassName,
      className,
      ...props
    },
    ref,
  ) => {
    const toneClass = {
      secondary: "text-fg-secondary",
      error: "text-error-text",
      muted: "text-fg-muted",
      disabled: "text-fg-disabled",
    }[descriptionTone]

    // Typography desc class — 2 維 cross-product (mode × size):
    // ┌───────────┬────────────────────────────┬────────────────────────────┐
    // │           │ size="md"(body label 14) │ size="lg"(body-lg label 16)│
    // ├───────────┼────────────────────────────┼────────────────────────────┤
    // │ reading   │ 繼承 body(14/1.5)         │ body(14)default leading    │
    // │ scanning  │ caption(12)+ compact      │ body(14)+ compact          │
    // └───────────┴────────────────────────────┴────────────────────────────┘
    const isLg = size === "lg"
    const modeClass =
      mode === "scanning"
        ? isLg
          ? "text-[length:var(--font-body-size)] leading-compact"
          : "text-[length:var(--font-caption-size)] leading-compact"
        : isLg
          ? "text-[length:var(--font-body-size)]"
          : ""

    const clampClass = descriptionClamp ? `line-clamp-${descriptionClamp}` : ""

    return (
      <div
        ref={ref}
        className={cn("flex flex-col min-w-0 flex-1", className)}
        {...props}
      >
        <span className={cn(labelTruncate && "truncate", labelClassName)}>{label}</span>
        {description && (
          <span
            className={cn(
              // Typography-mode-aware gap token(2026-04-23):
              // (mode, size)2 維正交 → 4 token 對應 4 typography 組合
              mode === "scanning"
                ? isLg
                  ? "mt-[var(--item-gap-label-desc-scanning-lg)]"
                  : "mt-[var(--item-gap-label-desc-scanning)]"
                : isLg
                  ? "mt-[var(--item-gap-label-desc-reading-lg)]"
                  : "mt-[var(--item-gap-label-desc-reading)]",
              modeClass,
              toneClass,
              clampClass,
              descriptionBreakWords && "break-words",
              !descriptionWrap && "truncate",
              descriptionClassName,
            )}
          >
            {description}
          </span>
        )}
      </div>
    )
  },
)
ItemContent.displayName = "ItemContent"

// ── Row size context ──────────────────────────────────────────────────────
//
// 作用:讓 row primitive(Sidebar / SelectMenu / Tree / DropdownMenu)只 propagate
// 一次 size,整個子樹內的 <ItemIcon> / <ItemAvatar> 都自動查到正確尺寸。
//
// **存在的唯一理由**:消除 asChild pattern 下 consumer 硬寫 `size={24}` 的可能性。
// 過去 consumer 必須 `useSidebar().size` 再手動傳 `AVATAR_SIZE.inline[size]`,
// 每個 consumer 都是一次漂移機會(曾發生:sm 欄 avatar 顯示 24 而非 20,破壞規格)。
// 現在 consumer 只寫 `<ItemAvatar alt="..." />`,尺寸由 context 自動決定。
//
// Row primitive 實作者的責任:在元件內部用 `<RowSizeProvider value={size}>` 包裹
// children(不論 asChild 或非 asChild 路徑),這樣任何 descendant 的 ItemIcon /
// ItemAvatar 都會拿到正確尺寸。

const RowSizeContext = React.createContext<RowSize | null>(null)

export const RowSizeProvider = RowSizeContext.Provider

/**
 * 讀取當前 row size。在 row primitive 子樹外呼叫會回 fallback(預設 "md")。
 * Row primitive 實作者不該呼叫這個——你們已經知道自己的 size。
 * 這個 hook 是給 `<ItemIcon>` / `<ItemAvatar>` 和 asChild consumer 的逃生艙用。
 */
export function useRowSize(fallback: RowSize = "md"): RowSize {
  return React.useContext(RowSizeContext) ?? fallback
}

// ── Prefab prefix elements ────────────────────────────────────────────────
//
// `<ItemIcon>` 和 `<ItemAvatar>` 是「prefix slot 的完成品元件」——自帶 ItemPrefix
// wrapper + 自動查 ICON_SIZE / AVATAR_SIZE。
//
// **asChild consumer 必須用這兩個元件,禁止手動寫 `<Avatar size={N} />`**。
// 禁令理由見 item-anatomy.spec.md「Avatar 尺寸選擇」節。

export interface ItemIconProps
  extends Omit<React.SVGAttributes<SVGSVGElement>, "children"> {
  /** Lucide icon 元件(不是 JSX element) */
  icon: LucideIcon
}

/**
 * `<ItemIcon icon={Folder} />` — 自動查 `ICON_SIZE[rowSize]`,包在 `ItemPrefix` 內。
 * 永遠對齊第一行 label(item-layout 的 icon 永遠 inline)。
 */
export const ItemIcon = React.forwardRef<SVGSVGElement, ItemIconProps>(
  ({ icon: Icon, className, ...props }, ref) => {
    const size = useRowSize()
    return (
      // data-prefix-type="icon" 讓 row-primitive 容器的 `:has()` selector 能偵測類型,
      // 用於 `<SidebarProvider uniformPrefix>` opt-in 後的混用 auto-detection
      <ItemPrefix data-prefix-type="icon">
        <Icon
          ref={ref}
          size={ICON_SIZE[size]}
          className={cn("shrink-0", className)}
          aria-hidden
          {...props}
        />
      </ItemPrefix>
    )
  }
)
ItemIcon.displayName = "ItemIcon"

export interface ItemAvatarProps extends Omit<AvatarProps, "size"> {
  /**
   * 對齊模式(選填,預設 `"inline"`):
   * - `"inline"`:視覺重量輕的 avatar,對齊第一行 label(20/24/24 @ sm/md/lg)
   * - `"block"`:視覺重量重的 avatar,對齊 label + description 文字塊(32/32/40 @ sm/md/lg)
   *
   * 預設 inline——大宗情境(扁平 row、footer user、主清單)都用這個。
   * 只有 avatar 是 item 主體(人物卡、顯著身份辨識)才用 block。
   *
   * 詳見 `item-anatomy.spec.md`「Avatar 尺寸選擇」節,含 24px 對齊模式閾值規則。
   */
  mode?: "inline" | "block"
}

/**
 * `<ItemAvatar alt="Alan" color="blue" />` — 自動查 `AVATAR_SIZE[mode][rowSize]`,
 * 包在 `ItemPrefix` 內。
 *
 * asChild consumer 的標準用法——不需知道 size,不需 import AVATAR_SIZE,
 * 不可能硬寫錯誤尺寸。
 */
export const ItemAvatar = React.forwardRef<HTMLDivElement, ItemAvatarProps>(
  ({ mode = "inline", ...props }, ref) => {
    const size = useRowSize()
    return (
      // data-prefix-type="avatar" 讓 row-primitive 容器的 `:has()` selector 能偵測類型,
      // 用於 `<SidebarProvider uniformPrefix>` opt-in 後的混用 auto-detection
      <ItemPrefix data-prefix-type="avatar">
        <Avatar ref={ref} size={AVATAR_SIZE[mode][size]} {...props} />
      </ItemPrefix>
    )
  }
)
ItemAvatar.displayName = "ItemAvatar"

// ── Inline action (suffix slot) ───────────────────────────────────────────
//
// 共用 row-primitive 的 suffix inline action 渲染——消除過去 Input / NumberInput /
// Tag / LinkInput / Combobox 各自複製 18 行 JSX 的狀況(見 `item-anatomy.spec.md`
// 「Inline Action 設計規格」節)。
//
// 規格(完全對齊 item-anatomy.spec.md「Inline Action 設計規格」節):
// - Icon 尺寸 = ICON_SIZE[rowSize]      (16/16/20)
// - Hover bg 尺寸 = icon + 2            (18/18/22,INLINE_ACTION_HOVER_BG_SIZE)
// - Hover bg 圓角 = rounded-md (sm/md)/ rounded-md (lg)
// - Icon 顏色:fg-muted → foreground on hover/active
// - 必須 <button type="button">,aria-label = label,Tooltip(同 label)
// - cursor-pointer

// ── Low-level:ItemInlineActionButton ──
//
// Root 是 `<button>`(不是 Tooltip wrapper),可直接塞進 Radix `asChild` pattern
// 例如 `<Collapsible.Trigger asChild>`, `<Popover.Trigger asChild>` 等。
//
// 自動從 `RowSizeContext` 查:
//   - 寬高 = ICON_SIZE[size]
//   - Hover bg 尺寸 = INLINE_ACTION_HOVER_BG_SIZE[size]
//   - Hover bg 圓角 = rounded-md (sm/md) / rounded-md (lg)
//   - Icon color = fg-muted → foreground on hover/active
//
// 接受任何 button props 並 spread(讓 Radix Slot 可以 merge onClick / data-state 等)

export interface ItemInlineActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Lucide icon 元件 */
  icon: LucideIcon
  /** 可選:額外加在 icon 上的 className(例如 rotate transition) */
  iconClassName?: string
  /**
   * Size 明確覆寫(用於 fields / Tag 等**不在 `RowSizeProvider` 樹內**的 host):
   * 傳了就以此為準,否則從 `RowSizeContext` 讀(fallback "md")。
   *
   * 使用時機:
   * - Row primitive 子樹(Sidebar / TreeView / SelectMenu / DropdownMenu)→ **不傳**,吃 context
   * - Field / Tag(自有 size 系統,沒包 RowSizeProvider)→ **必傳** `size={hostSize}`
   */
  size?: RowSize
  /**
   * Hover / active bg className override(chromatic host 專用,如 Tag solid variant)。
   *
   * 預設 `group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active`。
   * 提供後**完全取代** hover + active 雙態 className,但**不影響** rest 態(永遠 bg-transparent)
   * 與 overlay-trigger 態(`group-data-[state=open]:bg-neutral-selected`)。
   *
   * Consumer 須**同時**包含 hover + active 兩態 selector,例:
   * `'group-hover/action:bg-[var(--my-hover)] group-active/action:bg-[var(--my-active)]'`
   *
   * Use case:Tag solid(blue/green/red 等)需 hover bg 跟 host 色相一致(非 neutral)。
   */
  hoverBgClassName?: string
}

export const ItemInlineActionButton = React.forwardRef<
  HTMLButtonElement,
  ItemInlineActionButtonProps
>(({ icon: Icon, className, iconClassName, style, type = "button", size: sizeProp, hoverBgClassName, ...rest }, ref) => {
  const contextSize = useRowSize()
  const size = sizeProp ?? contextSize
  const iconPx = ICON_SIZE[size]
  const hoverBgPx = INLINE_ACTION_HOVER_BG_SIZE[size]
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "group/action relative grid place-content-center shrink-0 cursor-pointer",
        "text-fg-muted hover:text-foreground active:text-foreground transition-colors",
        // Overlay trigger active state(Radix 自動 set data-state=open on asChild trigger)
        // — 維持 host hover 樣式(canonical 2026-05-02 改:對齊 shadcn/Radix/Material 狀態
        // 極簡派,不另開 selected 4%,跨 host 一致性高)
        "data-[state=open]:text-foreground",
        "focus-visible:outline-2 focus-visible:outline-ring",
        className
      )}
      style={{ width: iconPx, height: iconPx, ...style }}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "absolute pointer-events-none",
          "rounded-md",
          "bg-transparent",
          hoverBgClassName ?? "group-hover/action:bg-neutral-hover group-active/action:bg-neutral-active",
          // Overlay 開啟 = 維持 host hover bg(對齊上方 text 顏色策略)
          "group-data-[state=open]/action:bg-neutral-hover",
          "transition-colors"
        )}
        style={{
          width: hoverBgPx,
          height: hoverBgPx,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
      <Icon size={iconPx} className={cn("relative", iconClassName)} aria-hidden />
    </button>
  )
})
ItemInlineActionButton.displayName = "ItemInlineActionButton"

// ── High-level:ItemInlineAction ──
//
// 宣告式 API:consumer 給 `{ icon, label, onClick }`,元件自動處理 Tooltip +
// aria-label。適用於 row primitive 的 suffix slot(SidebarMenuButton inlineActions 等)。
//
// 內部用 `ItemInlineActionButton`——兩層共用同一套視覺規格、同一個 RowSizeContext 查表。
// 需要接 Radix asChild(例如 collapsible trigger)時改用 `ItemInlineActionButton`,
// 那層沒有 Tooltip 包裝,Root 就是 button,可直接塞進 Radix Slot。

export interface ItemInlineActionProps {
  action: InlineActionConfig
  /** Size 覆寫(見 `ItemInlineActionButtonProps.size`)——Field Controls / Tag 必傳 */
  size?: RowSize
}

export const ItemInlineAction = React.forwardRef<
  HTMLButtonElement,
  ItemInlineActionProps
>(({ action, size }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <ItemInlineActionButton
        ref={ref}
        icon={action.icon}
        aria-label={action.label}
        onClick={action.onClick}
        size={size}
      />
    </TooltipTrigger>
    <TooltipContent>{action.label}</TooltipContent>
  </Tooltip>
))
ItemInlineAction.displayName = "ItemInlineAction"

// ── Item suffix slot ──────────────────────────────────────────────────────
//
// `<ItemSuffix>` — row primitive 的 suffix 容器。對齊 item-layout spec:
// - `h-[1lh]`:suffix 永遠對齊第一行 label(跟 prefix 解耦)
// - `ml-auto`:靠右
// - `gap-2`:多個 inline action 之間的標準間距(item-anatomy.spec.md「Inline Action 設計規格」節)
// - `hoverReveal` opt-in:opacity 0→1 on 父層 `group/menu-item` hover(TreeView 模式)

export interface ItemSuffixProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Hover-reveal 模式:預設隱藏,父層 row(必須是 `group/menu-item`)hover 時才淡入。
   * 對齊 TreeView 的 inline action 行為。預設 false(永遠顯示,如 Badge)。
   */
  hoverReveal?: boolean
}

export const ItemSuffix = React.forwardRef<HTMLSpanElement, ItemSuffixProps>(
  ({ className, hoverReveal = false, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "h-[1lh] shrink-0 ml-auto flex items-center gap-2",
        // hover-reveal:滑鼠 hover 或鍵盤 focus 時顯示。
        // 用 `group-has-[:focus-visible]` 而非 `group-focus-within`——後者會被
        // mouse click 觸發,導致 click 後 suffix 永久顯示直到焦點移走。
        // focus-visible 只在鍵盤 tab 時啟動,mouse click 不會觸發。
        hoverReveal &&
          "opacity-0 group-hover/menu-item:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 transition-opacity duration-150",
        className
      )}
      {...props}
    />
  )
)
ItemSuffix.displayName = "ItemSuffix"
