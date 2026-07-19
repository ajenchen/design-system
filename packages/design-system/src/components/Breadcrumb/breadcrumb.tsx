// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — Breadcrumb 含 BreadcrumbList(主)+ BreadcrumbItem + BreadcrumbEllipsis + items-collapse logic,split 會破壞 collapse/overflow Tooltip subtree
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { ChevronRight, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

// ── TruncatedLabel ── 2026-07-19:truncate+tooltip 引擎 + presentation 已抽成 SSOT primitive
// `patterns/element-anatomy/truncated-text`(`<TruncatedText>` 消費 `useTruncated` hook)。本檔改為
// 消費 `<TruncatedText display="block" tooltip={fullText}>`,原 file-local shared RO + TruncatedLabel 已移除。

/**
 * Breadcrumb — 顯示當前頁面在階層中的位置
 *
 * 基於 shadcn/ui Breadcrumb 結構(純 HTML nav + ol + li + a/span),
 * 橋接設計系統 token。
 *
 * ── 結構 ──
 *   <Breadcrumb>
 *     <BreadcrumbList size="md">
 *       <BreadcrumbItem>
 *         <BreadcrumbLink href="/projects">專案</BreadcrumbLink>
 *       </BreadcrumbItem>
 *       <BreadcrumbSeparator />
 *       <BreadcrumbItem>
 *         <BreadcrumbPage>目前頁面</BreadcrumbPage>
 *       </BreadcrumbItem>
 *     </BreadcrumbList>
 *   </Breadcrumb>
 *
 * ── Size(跟 page title 配對) ──
 *   sm  text-body(14)     → 建議配 text-h4(20) title —— Dialog / panel / drawer
 *   md  text-body(14)     → 建議配 text-h3(24) title —— 一般頁面 header (預設)
 *   lg  text-body-lg(16)  → 建議配 text-h2(32) title —— Detail page hero / landing
 *
 * ── 視覺 ──
 *   Link (預設): text-fg-secondary
 *   Link hover:  text-primary-hover (canonical「互動高亮」, 跟 Tabs / Chip 用法一致)
 *   Page (當前): text-foreground(不加粗 — 加粗會讓 breadcrumb 最右端視覺過重,見 spec)
 *   Separator:  ChevronRight (size 跟 list 一致), text-fg-muted
 *
 * ── 詳見 breadcrumb.spec.md ──
 */

// ── Size context ─────────────────────────────────────────────────────────────

type BreadcrumbSize = 'sm' | 'md' | 'lg'

interface BreadcrumbContextValue {
  size: BreadcrumbSize
}

const BreadcrumbContext = React.createContext<BreadcrumbContextValue>({ size: 'md' })

const BREADCRUMB_TEXT_CLASS: Record<BreadcrumbSize, string> = {
  sm: 'text-body',
  md: 'text-body',
  lg: 'text-body-lg',
}

// Separator chevron + BreadcrumbLink/Item start icon 尺寸 — 對齊 uiSize.spec.md「Icon Size Tier」(field-height-sm/md→16,lg→20)。
// 注意:BreadcrumbEllipsis 不消費此常數,固定 md(16px icon,見 BreadcrumbEllipsis 定義),size='lg' 時不隨 chevron 放大到 20
// 2026-05-18 改 per user 拍板「A 先改 16/16/20」+「做完」approval:
// 撤回 text-flow 例外設計,Breadcrumb chevron 跟其他 chrome icon 同 tier。
// World-class 對齊:Atlassian Breadcrumb chevron 16 default / Material 3 / Ant Design 同。
const BREADCRUMB_ICON_SIZE: Record<BreadcrumbSize, number> = {
  sm: 16,
  md: 16,
  lg: 20,
}

// ── Breadcrumb (nav root) ────────────────────────────────────────────────────

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<'nav'>
>(({ ...props }, ref) => (
  <nav ref={ref} aria-label="Breadcrumb" {...props} />
))
Breadcrumb.displayName = 'Breadcrumb'

// ── BreadcrumbList (ol) ──────────────────────────────────────────────────────

/**
 * Phase B(2026-05-10):declarative items mode 啟用 auto-collapse + auto-separator + auto-page-end。
 * 對齊 Material UI source `Breadcrumbs.js renderItemsBeforeAndAfter` mechanism(`maxItems`
 * default 8;本 DS 採 user-tuned 4 — 更積極 collapse 適合 single-line 緊湊 layout)。
 */
// code-quality-allow: dead-export — public consumer-facing item spec type;對齊 BreadcrumbProps API contract,允許 consumer 構造 items array 外部
export interface BreadcrumbItemSpec {
  label: React.ReactNode
  href?: string
  asChild?: boolean
  /**
   * 起始 icon(per `ui-development.md`「icon prop 命名 4 條」:slot 只接 icon → `startIcon`)。
   * 業界慣例:Breadcrumb 首項用 Home icon 強化視覺錨點(Material / Atlassian)。
   * 內部消費 `BREADCRUMB_ICON_SIZE[size]` SSOT(sm/md=16, lg=20,對齊 uiSize.spec.md Icon Size Tier)。
   * Consumer **不傳** size,DS 統一管。
   */
  startIcon?: LucideIcon
}

interface BreadcrumbListProps extends Omit<React.ComponentPropsWithoutRef<'ol'>, 'children'> {
  /**
   * 字體尺寸 — 依據與之配對的 page title 選擇:
   *   sm  → 配 text-h4(20) title (Dialog / panel / drawer)
   *   md  → 配 text-h3(24) title (一般頁面 header,預設)
   *   lg  → 配 text-h2(32) title (Detail page hero / landing)
   */
  size?: BreadcrumbSize
  /**
   * Declarative items mode(opt-in)。當 provided 時 `children` 被忽略,List 內部自動:
   *  - 插 separator
   *  - 末位 spec(無 `href`)自動 BreadcrumbPage(per Title-breadcrumb-end SSOT)
   *  - 超 `maxItems` auto-collapse 中段成 BreadcrumbEllipsis + DropdownMenu(對齊 Material UI
   *    source `renderItemsBeforeAndAfter`)
   */
  items?: BreadcrumbItemSpec[]
  /**
   * Auto-collapse 閾值。Default 4(user-tuned;Material UI source 預設 8)。`items.length > maxItems`
   * 才 collapse。
   */
  maxItems?: number
  /** Collapse 後保留首 N 個(default 1)。對齊 Material UI source default。 */
  itemsBeforeCollapse?: number
  /** Collapse 後保留末 N 個(default 1)。對齊 Material UI source default。 */
  itemsAfterCollapse?: number
  children?: React.ReactNode
}

// code-quality-allow: long-function — items props × children narrowing × collapse-with-overflow × tooltip 4 軸組合在 BreadcrumbList,拆 sub-fn 會跨 fn 傳 itemsBeforeCollapse/After collapsed-tooltip refs
const BreadcrumbList = React.forwardRef<HTMLOListElement, BreadcrumbListProps>(
  ({ className, size = 'md', items, maxItems = 4, itemsBeforeCollapse = 1, itemsAfterCollapse = 1, children, ...props }, ref) => {
    // Memoize provider value(2026-04-22 D3 perf audit):單 field wrapper memoize
    const ctxValue = React.useMemo(() => ({ size }), [size])

    // Declarative mode(items prop provided):自動 render + auto-collapse
    const declarativeContent = React.useMemo(() => {
      if (!items) return null
      // 2026-07-04 修:非字串 label 的 key 原用 Math.random() → 每次 render 新 key 造成
      // BreadcrumbItem unmount/remount(重置 TruncatedLabel ResizeObserver 與 state)→ 改 stable idx key
      const renderItem = (spec: BreadcrumbItemSpec, role: 'root' | 'middle' | 'current', idx: number) => (
        <BreadcrumbItem key={`${role}-${typeof spec.label === 'string' ? spec.label : idx}`} role={role}>
          {role === 'current'
            ? <BreadcrumbPage startIcon={spec.startIcon}>
                <TruncatedText display="block" tooltip={typeof spec.label === 'string' ? spec.label : undefined}>{spec.label}</TruncatedText>
              </BreadcrumbPage>
            : <BreadcrumbLink href={spec.href} asChild={spec.asChild} startIcon={spec.startIcon}>
                <TruncatedText display="block" tooltip={typeof spec.label === 'string' ? spec.label : undefined}>{spec.label}</TruncatedText>
              </BreadcrumbLink>
          }
        </BreadcrumbItem>
      )

      const shouldCollapse = items.length > maxItems
      const beforeN = Math.max(0, itemsBeforeCollapse)
      const afterN = Math.max(1, itemsAfterCollapse)  // 末位永遠 ≥ 1(current page)

      type VisibleItem = { spec: BreadcrumbItemSpec; role: 'root' | 'middle' | 'current' }
      let visible: Array<VisibleItem | { ellipsisOf: BreadcrumbItemSpec[] }>
      if (!shouldCollapse) {
        visible = items.map((spec, i) => ({
          spec,
          role: i === 0 ? 'root' : (i === items.length - 1 ? 'current' : 'middle') as 'root' | 'middle' | 'current',
        }))
      } else {
        const before = items.slice(0, beforeN).map((spec, i) => ({
          spec,
          role: (i === 0 ? 'root' : 'middle') as 'root' | 'middle' | 'current',
        }))
        const collapsed = items.slice(beforeN, items.length - afterN)
        const after = items.slice(items.length - afterN).map((spec, i, arr) => ({
          spec,
          role: (i === arr.length - 1 ? 'current' : 'middle') as 'root' | 'middle' | 'current',
        }))
        visible = [...before, { ellipsisOf: collapsed }, ...after]
      }

      // Interleave with separators
      const rendered: React.ReactNode[] = []
      visible.forEach((entry, i) => {
        if (i > 0) rendered.push(<BreadcrumbSeparator key={`sep-${i}`} />)
        if ('ellipsisOf' in entry) {
          rendered.push(
            <BreadcrumbItem key="ellipsis" role="ellipsis">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {entry.ellipsisOf.map((s, j) => (
                    <DropdownMenuItem key={j} asChild={!!s.href}>
                      {s.href ? <a href={s.href}>{s.label}</a> : <span>{s.label}</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          )
        } else {
          rendered.push(renderItem(entry.spec, entry.role, i))
        }
      })
      return rendered
    }, [items, maxItems, itemsBeforeCollapse, itemsAfterCollapse])

    // 2026-05-12 fix(user 抓 image 2 Deep story 違反 single-line + max-levels canonical):
    // Compositional path 也走 auto-collapse + flex-shrink hierarchy。Walk children, 找
    // BreadcrumbItem 並按 index 分派 role (first=root / last=current / middle=middle)。
    // > maxItems 自動 collapse 中段成 ellipsis(對齊 declarative path canonical SSOT)。
    const compositionalContent = React.useMemo(() => {
      if (items) return null
      const childArr = React.Children.toArray(children)
      // 抓 BreadcrumbItem children(skip BreadcrumbSeparator — auto re-interleave)
      // 2026-05-12 Round 4.5 fix(codex M31 Layer C 抓):type-identity primary path + displayName fallback。
      // 純 `displayName` check 在 HOC / React.memo / consumer alias 場景脆弱(production build / wrap
      // 可能改寫 displayName)。`c.type === BreadcrumbItem` 是 React fiber reference-identity 最穩
      // primary(對齊 Radix children-walk pattern);displayName fallback 給 HOC 場景。
      const itemChildren = childArr.filter((c): c is React.ReactElement<BreadcrumbItemProps> =>
        React.isValidElement(c) && (c.type === BreadcrumbItem ||
          (c.type as React.ComponentType)?.displayName === 'BreadcrumbItem')
      )
      // 無 item 或全是 separator → pass-through(consumer raw children,e.g. spinners)
      if (itemChildren.length === 0) return children
      // Assign role by position; clone with role prop
      const total = itemChildren.length
      const cloneWithRole = (item: React.ReactElement<BreadcrumbItemProps>, idx: number, role: 'root' | 'middle' | 'current') =>
        React.cloneElement(item, { role: item.props.role ?? role, key: `bc-${role}-${idx}` })
      const shouldCollapse = total > maxItems
      const beforeN = Math.max(0, itemsBeforeCollapse)
      const afterN = Math.max(1, itemsAfterCollapse)
      const rendered: React.ReactNode[] = []
      if (!shouldCollapse) {
        itemChildren.forEach((item, i) => {
          if (i > 0) rendered.push(<BreadcrumbSeparator key={`sep-${i}`} />)
          const role: 'root' | 'middle' | 'current' = i === 0 ? 'root' : (i === total - 1 ? 'current' : 'middle')
          rendered.push(cloneWithRole(item, i, role))
        })
      } else {
        // before(first N) + ellipsis + after(last M)
        const beforeItems = itemChildren.slice(0, beforeN)
        const collapsedItems = itemChildren.slice(beforeN, total - afterN)
        const afterItems = itemChildren.slice(total - afterN)
        beforeItems.forEach((item, i) => {
          if (i > 0) rendered.push(<BreadcrumbSeparator key={`sep-bef-${i}`} />)
          const role: 'root' | 'middle' = i === 0 ? 'root' : 'middle'
          rendered.push(cloneWithRole(item, i, role))
        })
        if (rendered.length > 0) rendered.push(<BreadcrumbSeparator key="sep-ellipsis-before" />)
        rendered.push(
          <BreadcrumbItem key="bc-ellipsis" role="ellipsis">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BreadcrumbEllipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {collapsedItems.map((item, j) => {
                  // 2026-05-12 Round 4.5 fix(codex M31 Layer C 抓):consumer BreadcrumbItem children 常包
                  // `<BreadcrumbLink href>` = anchor button-like。直接放進 `<DropdownMenuItem>` 會 nested
                  // interactive(menuitem within button violates HTML / a11y)。Fix:把實際 link 元素接到
                  // menuitem `asChild`,對齊 declarative path canonical pattern。
                  // 2026-07-19 fix(DA3 對抗稽核抓):原只讀 `c.props.href` → `<BreadcrumbLink asChild>
                  //   <RouterLink to=…>` 這種(BreadcrumbLink 無 href、RouterLink child 帶 `to`)摺疊後
                  //   dropdown 失去導航目標。修:asChild 時**保留整個 link 子元素**(RouterLink/<Link to>/<a>,
                  //   含 to/href/onClick/state 全 forward,前端路由不退化成整頁重載);純 href 才重建 <a>。
                  const innerChildren = (item.props as { children?: React.ReactNode }).children
                  let menuChild: React.ReactNode | undefined  // 接進 menuitem(asChild)的實際 link 元素
                  let label: React.ReactNode = innerChildren   // fallback:無 link 時的純內容
                  React.Children.forEach(innerChildren, (c) => {
                    if (!React.isValidElement<{ href?: string; asChild?: boolean; children?: React.ReactNode }>(c)) return
                    if (c.props.asChild && React.isValidElement(c.props.children)) {
                      // BreadcrumbLink asChild → 實際 link = 其 child(RouterLink / <Link to> / <a>),整個保留
                      menuChild = c.props.children
                      const grand = (c.props.children.props as { children?: React.ReactNode }).children
                      if (grand != null) label = grand
                    } else if (c.props.href != null) {
                      // BreadcrumbLink href → 重建 <a href>(對齊原 canonical，避免 nested interactive)
                      menuChild = <a href={c.props.href}>{c.props.children}</a>
                      if (c.props.children != null) label = c.props.children
                    }
                  })
                  return menuChild
                    ? <DropdownMenuItem key={`collapsed-${j}`} asChild>{menuChild}</DropdownMenuItem>
                    : <DropdownMenuItem key={`collapsed-${j}`}>{label}</DropdownMenuItem>
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        )
        rendered.push(<BreadcrumbSeparator key="sep-ellipsis-after" />)
        afterItems.forEach((item, i) => {
          if (i > 0) rendered.push(<BreadcrumbSeparator key={`sep-aft-${i}`} />)
          const role: 'middle' | 'current' = i === afterItems.length - 1 ? 'current' : 'middle'
          rendered.push(cloneWithRole(item, i, role))
        })
      }
      return rendered
    }, [items, children, maxItems, itemsBeforeCollapse, itemsAfterCollapse])

    return (
    <BreadcrumbContext.Provider value={ctxValue}>
      <ol
        ref={ref}
        // gap-1 (4px) — separator 與兩邊 items 間距;緊湊節奏,符合 breadcrumb 密集流動感。
        // 2026-05-10 Phase A single-line canonical(per user + Material UI source verified):
        //   `flex-nowrap` 不 wrap。長路徑走中段折疊。
        // 2026-05-12 fix:compositional 也走 auto-collapse + role-assignment(`compositionalContent`)
        //   → declarative / compositional 兩 path 都符合 single-line + max-levels + width 分配 canonical SSOT。
        className={cn(
          'flex flex-nowrap items-center gap-1 text-fg-secondary leading-compact min-w-0',
          BREADCRUMB_TEXT_CLASS[size],
          className
        )}
        {...props}
      >
        {items ? declarativeContent : compositionalContent}
      </ol>
    </BreadcrumbContext.Provider>
    )
  },
)
BreadcrumbList.displayName = 'BreadcrumbList'

// ── BreadcrumbItem (li) ──────────────────────────────────────────────────────

/**
 * Phase B(2026-05-10):`role` prop emit `data-bc-role` attr → CSS flex-shrink hierarchy。
 * Per BreadcrumbItem 在 row 中的角色決定 shrink 優先級:
 *   - `root`(首位)→ shrink:3(縮最積極;root context 可弱化)
 *   - `middle`(中段)→ shrink:2
 *   - `current`(末位 / page)→ shrink:1(最後縮;a11y current page anchor)
 *   - `ellipsis`(BreadcrumbEllipsis 包裝)→ shrink:0(永遠完整 ⋯)
 *
 * 設計回應 user 兩 challenges:
 *   (a) Root 也 truncate(shrink:3,不是 shrink-0)
 *   (b) 不用 fixed max-width — flex-shrink hierarchy 容器寬時自然展開不浪費空間,
 *       窄時按優先級縮 + TruncatedLabel 內部 CSS truncate + tooltip。
 */
interface BreadcrumbItemProps extends React.ComponentPropsWithoutRef<'li'> {
  role?: 'root' | 'middle' | 'current' | 'ellipsis'
}

const BreadcrumbItem = React.forwardRef<HTMLLIElement, BreadcrumbItemProps>(
  ({ className, role, style, ...props }, ref) => {
    // 2026-05-20 fix v3(user 抓「專案 後方多 4px 間距 / 我的新專案 沒有」chevron 不對稱):
    //   v2 `minWidth: '2rem'`(32px)在寬容器強制 li ≥ 32px → 短 label「專案」(natural ~28px)
    //   被撐 4px,長 label「我的新專案」(natural ~70px)hug content → chevron 兩側不對稱。
    //
    // v3 解法:minWidth `2rem` → `1.5rem`(24px)
    //   數學:中文「X…」最小寬度 = 1 char(~14-16px)+ ellipsis(~6-8px)≈ 22-24px → 24px 剛 cover
    //   結果:
    //     - 寬容器:所有自然 label ≥ 24px → li hug content,chevron 緊貼,對稱(本 fix 主目的)
    //     - 窄容器 truncate:shrink 不過 24px → 「X…」仍可見 ellipsis 保險
    //     - 短英文「OK / ID」(natural ~20px)→ 多 ~4px(原 12px → 縮到 4px,顯著改善)
    //   對齊 user verbatim「minWidth 再調小一點」+ ellipsis 數學最小值。
    const shrinkStyle: React.CSSProperties = role === 'root' ? { flexShrink: 3, minWidth: '1.5rem' }
      : role === 'middle' ? { flexShrink: 2, minWidth: '1.5rem' }
      : role === 'current' ? { flexShrink: 1, minWidth: '1.5rem' }
      : role === 'ellipsis' ? { flexShrink: 0 }
      : {}
    return (
      <li
        ref={ref}
        data-bc-role={role}
        className={cn('inline-flex items-center min-w-0', className)}
        style={{ ...shrinkStyle, ...style }}
        {...props}
      />
    )
  }
)
BreadcrumbItem.displayName = 'BreadcrumbItem'

// ── BreadcrumbLink (a) ───────────────────────────────────────────────────────

interface BreadcrumbLinkProps extends React.ComponentPropsWithoutRef<'a'> {
  /** 將樣式套用至子元件(e.g. React Router Link) */
  asChild?: boolean
  /**
   * 起始 icon(per `ui-development.md`「icon prop 命名 4 條」:slot 只接 icon → `startIcon`)。
   * 內部消費 `BREADCRUMB_ICON_SIZE[size]` SSOT,DS 統一尺寸不允許 consumer override。
   * 對齊 uiSize.spec.md Icon Size Tier(2026-05-18 撤回 14 例外,統一 16/16/20)。
   */
  startIcon?: LucideIcon
}

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ asChild, className, children, startIcon: StartIcon, ...props }, ref) => {
    const { size } = React.useContext(BreadcrumbContext)
    // 2026-05-12 fix(user 抓 image 2 Deep story 麵包屑沒符合 single-line + truncate canonical):
    // 純文字 children → auto-wrap TruncatedLabel(canonical「single-line + ellipsis + tooltip
    // on truncate」per spec.md / Polaris breadcrumb)。Non-string children(consumer 自訂 icon+text
    // 結構)→ pass-through 不 force-wrap(consumer own truncate)。
    const wrappedChildren = typeof children === 'string'
      ? <TruncatedText display="block" tooltip={children}>{children}</TruncatedText>
      : children
    const sharedClassName = cn(
      'inline-flex items-center gap-2',
      'min-w-0 max-w-full',
      'text-fg-secondary',
      'hover:text-primary-hover',
      'transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      'rounded-md',
      className
    )
    // 2026-05-25 fix(user 抓 Breadcrumb asChild story React.Children.only runtime fail):
    // Radix Slot 規範 children 必為單 element;原 unified Comp render 在 asChild path 內
    // 仍輸出「{StartIcon && ...} + {wrappedChildren}」雙 JSX expression → Slot 收到 array
    // → React.Children.only(array) throws「expected to receive a single React element child」。
    // 分支 render 解 — asChild path 只傳 consumer-supplied child(icon 由 consumer 自管,
    // 對齊 Radix Slot canonical「single child contract」);非 asChild path 維持原 native
    // <a> + DS-controlled icon + wrapped label。
    if (asChild) {
      return (
        <Slot ref={ref} className={sharedClassName} {...props}>
          {wrappedChildren}
        </Slot>
      )
    }
    return (
      <a ref={ref} className={sharedClassName} {...props}>
        {StartIcon && <StartIcon size={BREADCRUMB_ICON_SIZE[size]} aria-hidden className="shrink-0" />}
        {wrappedChildren}
      </a>
    )
  }
)
BreadcrumbLink.displayName = 'BreadcrumbLink'

// ── BreadcrumbPage (current, non-clickable) ──────────────────────────────────

interface BreadcrumbPageProps extends React.ComponentPropsWithoutRef<'span'> {
  /** 起始 icon。內部消費 `BREADCRUMB_ICON_SIZE[size]` SSOT。對齊 BreadcrumbLink. */
  startIcon?: LucideIcon
}

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, BreadcrumbPageProps>(
  ({ className, children, startIcon: StartIcon, ...props }, ref) => {
    const { size } = React.useContext(BreadcrumbContext)
    // 2026-05-12 fix(同 BreadcrumbLink):純文字 children → auto-wrap TruncatedLabel。
    const wrappedChildren = typeof children === 'string'
      ? <TruncatedText display="block" tooltip={children}>{children}</TruncatedText>
      : children
    return (
      <span
        ref={ref}
        role="link"
        aria-disabled="true"
        aria-current="page"
        className={cn('inline-flex items-center gap-2 min-w-0 max-w-full text-foreground', className)}
        {...props}
      >
        {StartIcon && <StartIcon size={BREADCRUMB_ICON_SIZE[size]} aria-hidden className="shrink-0" />}
        {wrappedChildren}
      </span>
    )
  }
)
BreadcrumbPage.displayName = 'BreadcrumbPage'

// ── BreadcrumbSeparator ──────────────────────────────────────────────────────

interface BreadcrumbSeparatorProps extends React.ComponentPropsWithoutRef<'li'> {
  children?: React.ReactNode
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const BreadcrumbSeparator = React.forwardRef<HTMLLIElement, BreadcrumbSeparatorProps>(
  ({ children, className, ...props }, ref) => {
    const { size } = React.useContext(BreadcrumbContext)
    return (
      <li
        ref={ref}
        role="presentation"
        aria-hidden="true"
        // Phase B(2026-05-10):separator 永遠 shrink-0(必完整顯示,否則 path 視覺斷裂)
        className={cn('inline-flex items-center text-fg-muted shrink-0', className)}
        {...props}
      >
        {children ?? <ChevronRight size={BREADCRUMB_ICON_SIZE[size]} aria-hidden />}
      </li>
    )
  }
)
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator'

// ── BreadcrumbEllipsis ───────────────────────────────────────────────────────

/**
 * BreadcrumbEllipsis — 折疊路徑的 "⋯" 按鈕
 *
 * 2026-05-10 重寫:消費 `ItemInlineActionButton`(primitive SSOT)取代自刻 `<button>`。
 * Per inline-action.spec.md L106-131 predicate Q1+Q2+Q3 全指向 Inline Action:
 *   - Q1 點了要做事嗎?是(展開折疊路徑 dropdown)
 *   - Q2 位置?BreadcrumbList row inline flow(host 內)
 *   - Q3 row 多大?14-16px text row(compact tier)→ Inline Action
 * + 對齊 M1「視覺決策前必消費 SSOT」+ Mindset #2「優先消費既有」。
 *
 * 配合 DropdownMenuTrigger asChild 使用:
 *
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <BreadcrumbEllipsis />
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem asChild><a href="/org">組織</a></DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 *
 * `overlayTrigger=true` 視覺鎖:DropdownMenu open 期間 button 維持 hover bg(對齊
 * shadcn / Radix Themes / Material 的 overlay trigger canonical,inline-action.spec.md
 * 「Overlay trigger canonical」段)。
 */
type BreadcrumbEllipsisProps = Omit<React.ComponentPropsWithoutRef<typeof ItemInlineActionButton>, 'icon' | 'size'>

const BreadcrumbEllipsis = React.forwardRef<HTMLButtonElement, BreadcrumbEllipsisProps>(
  ({ 'aria-label': ariaLabel = '顯示折疊路徑' /* i18n-allow: DS default; consumer override via aria-label prop */, ...props }, ref) => {
    return (
      <ItemInlineActionButton
        ref={ref}
        icon={MoreHorizontal}
        size="md"  // Breadcrumb 不在 RowSizeProvider 樹內,固定 md(16px icon + 18px hover bg,對齊 inline-action.spec.md 尺寸表)
        aria-label={ariaLabel}
        overlayTrigger
        {...props}
      />
    )
  }
)
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const breadcrumbMeta = {
  component: 'Breadcrumb',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {
    // 值源 = code SSOT:BREADCRUMB_TEXT_CLASS(sm/md=text-body, lg=text-body-lg)+ BREADCRUMB_ICON_SIZE(sm/md=16, lg=20)。
    // Breadcrumb 是文字列無固定高度 token,故不列 height(對照 Tag meta 有自身 h-* 才列)。
    sm: { iconSize: 16, typography: 'body' },
    md: { iconSize: 16, typography: 'body' },
    lg: { iconSize: 20, typography: 'body-lg' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
} as const

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
export type { BreadcrumbSize, BreadcrumbListProps, BreadcrumbEllipsisProps }
// BreadcrumbItemSpec 已在上方 `export interface BreadcrumbItemSpec` 直接 export
