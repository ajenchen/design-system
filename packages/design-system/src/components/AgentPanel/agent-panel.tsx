// code-quality-allow: file-size foundational composite family(9 元件一家族檔,同 Sidebar 前例)
/**
 * AgentPanel 家族 — 智慧代理面板(9 元件;附屬資產 AgentLogo/AgentFab 另檔)。
 *
 * ── 消費的 SSOT ──
 * - 容器:右側欄=bg-surface + border-l border-divider(app-shell aside 前例);
 *   寬 --agent-panel-width(uiSize.css;可拖拉 360–640 且 ≤50vw,把手=ResizeHandle pattern,
 *   鍵盤等價=WAI-ARIA separator 同 DataTable 欄寬慣例);開合 --motion-duration-surface。
 * - 標題列:ChromeHeader(header-canonical;chrome 內控件一律 sm);品牌區=gap-2+24 標誌;
 *   標題+chevron=單一複合觸發鈕(Button text sm + endIcon,Polaris disclosure / Combobox 觸發器同構),
 *   chevron=裝飾性指示(inline-action.spec.md Q1);ButtonDivider 於 gap-2 cluster(action-bar 規則 3)。
 *   **固定構件恆渲染**:+ / × / 標題觸發鈕不隨 callback 有無消失(2026-09-02 根因修正)。
 * - 歷史浮層:Popover+Command+MenuItem,列組裝逐字照 select-menu.tsx 原型(外層 CommandItem 單一
 *   互動 owner、內層 MenuItem role=presentation 透明、群組 heading、CommandSeparator、Empty);
 *   行內動作=ItemSuffix hoverReveal + ItemInlineAction(懸停/鍵盤 focus-visible 浮出);思考列=CircularProgress 16。
 * - 訊息:氣泡 bg-secondary/rounded-md/8/12;附件=Chip assist 分支(chip.spec.md),相互 4;
 *   輪距 40=8+24(Button text xs)+8。
 * - 思考塊:Radix Collapsible+animate-accordion(base.css;Sidebar 同法);chevron=accordion 慣例
 *   (裝飾指示、色同 Select 觸發器 chevron);微光僅標題+最新行(agent-panel.css);完成步驟 fg-secondary。
 * - 輸入盒:欄位家族內距(--field-control-py-md/--field-px/text-body;32 等高鐵律);
 *   附件列=Tag md 單列 + OverflowIndicator(+N,useOverflowIndices 量測);送出/停止=Button primary xs。
 * - 決策卡:SurfaceHeader(compact)+SurfaceFooter(overlay-surface);選項=灰底卡(--secondary、
 *   rounded-md、內距 8/12、整卡可點)包 RadioGroup md(Popover all-sm 律之拍板豁免;footer 鈕 sm 守律);
 *   一題一問步進(Skip / 下一題 / 送出);N>1 才顯示「n / N」小標;淡入+下滑 --motion-duration-overlay。
 * - 改名/刪除:Dialog(header md+X;body Field+Input;footer md 鈕;刪除=primary+danger;
 *   form-validation:儲存 dirty 規則、空名 blur 顯錯;Esc=Dialog 取消)。
 * - 空狀態:Empty icon slot 接 AgentLogo 招喚態。
 * 全表:agent-panel.spec.md。
 */
import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import {
  createLucideIcon,
  ArrowUp,
  ChevronDown,
  Copy,
  MessageSquare,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X as XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 停止實心正方:12/24 grid(= Material Symbols `stop` 480/960)→ 8px @ Button icon 16。
 * lucide Square 填滿後 20/24 = 13.3px,比 ArrowUp/Plus(14/24 線稿)視覺偏重,故自繪
 * (2026-09-02 user 抓「太巨大」;rx 1.5 ≈ Carbon 2/20、lucide 2/18 圓角比例)。
 */
const StopFilled = createLucideIcon('StopFilled', [
  ['rect', { x: '6', y: '6', width: '12', height: '12', rx: '1.5', fill: 'currentColor', stroke: 'none', key: 'stop' }],
])
import { Button } from '@/design-system/components/Button/button'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { fieldChromeStyles } from '@/design-system/components/Field/field-wrapper'
import {
  SurfaceHeader,
  SurfaceFooter,
  COMPACT_HEADER_SLOT,
} from '@/design-system/patterns/overlay-surface/overlay-surface'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/design-system/components/Popover/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/design-system/components/Command/command'
import { MenuItem } from '@/design-system/components/Menu/menu-item'
import {
  ItemInlineAction,
  ItemSuffix,
} from '@/design-system/patterns/element-anatomy/item-anatomy'
import { ResizeHandle } from '@/design-system/patterns/resize-handle/resize-handle'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
import { useOverflowIndices } from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'
import { Chip } from '@/design-system/components/Chip/chip'
import { Tag } from '@/design-system/components/Tag/tag'
import { Input } from '@/design-system/components/Input/input'
import { Empty } from '@/design-system/components/Empty/empty'
import { Field, FieldLabel, FieldError } from '@/design-system/components/Field/field'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog/dialog'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { AgentLogo, type AgentLogoState } from './agent-logo'
import './agent-panel.css'

/* ────────────────────────────────────────────────────────────────────────────
 * 1. AgentPanel(容器;可拖拉寬度)
 * ──────────────────────────────────────────────────────────────────────── */

/** 拖拉寬度界限(spec「AgentPanel」節;token 鏡像:--agent-panel-width-min / -max)。 */
const PANEL_WIDTH_DEFAULT = 400
const PANEL_WIDTH_MIN = 360
const PANEL_WIDTH_MAX = 640
const PANEL_RESIZE_KEY_STEP = 16

function clampPanelWidth(width: number) {
  const viewportCap = typeof window === 'undefined' ? PANEL_WIDTH_MAX : Math.floor(window.innerWidth / 2)
  return Math.min(Math.max(width, PANEL_WIDTH_MIN), Math.min(PANEL_WIDTH_MAX, Math.max(viewportCap, PANEL_WIDTH_MIN)))
}

export interface AgentPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 面板開合;false 時不渲染(關閉後由 AgentFab 承接入口,兩者互斥)。 */
  open?: boolean
  /** 受控寬度(px);省略=非受控,起於 defaultWidth。 */
  width?: number
  /** 非受控初始寬;預設 --agent-panel-width 400。 */
  defaultWidth?: number
  /** 拖拉/鍵盤調整結束時回報(DS 不持久化,產品自存)。 */
  onWidthChange?: (width: number) => void
  /** 可拖拉(左緣把手);預設 true。Sheet 承載時同樣可拖。 */
  resizable?: boolean
}

const AgentPanel = React.forwardRef<HTMLDivElement, AgentPanelProps>(
  (
    {
      open = true,
      width,
      defaultWidth = PANEL_WIDTH_DEFAULT,
      onWidthChange,
      resizable = true,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const [uncontrolledWidth, setUncontrolledWidth] = React.useState(() => clampPanelWidth(defaultWidth))
    const resolvedWidth = clampPanelWidth(width ?? uncontrolledWidth)

    const applyWidth = React.useCallback(
      (next: number, commit: boolean) => {
        const clamped = clampPanelWidth(next)
        if (width === undefined) setUncontrolledWidth(clamped)
        if (commit) onWidthChange?.(clamped)
      },
      [width, onWidthChange],
    )

    if (!open) return null
    return (
      <div
        ref={ref}
        role="complementary"
        aria-label="智慧代理" // i18n-allow: DS 預設,props 展開在後可覆寫
        className={cn(
          'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-surface',
          // 分隔線只有一個 owner:可拖時由 ResizeHandle 的 1px line 擁有(DataTable 欄間同款,hover/拖曳會變色);
          // 不可拖才由容器畫 border-l(app-shell aside 前例)。兩者並存 = 2px 粗線(2026-09-02 user 抓到)。
          !resizable && 'border-l border-divider',
          'animate-in fade-in-0 slide-in-from-right-4 duration-[var(--motion-duration-surface)] motion-reduce:animate-none',
          className,
        )}
        style={{ width: resolvedWidth, ...style }}
        {...props}
      >
        {resizable && (
          // 同一顆 ResizeHandle 擁有視覺 / 拖拉 / 鍵盤 / ARIA(DataTable 欄寬同元件,2026-09-02 SSOT 收斂);
          // 面板寬 clamp(360–640 且 ≤50vw)由 applyWidth 負責。
          <ResizeHandle
            direction="horizontal"
            position="start"
            value={resolvedWidth}
            min={PANEL_WIDTH_MIN}
            max={PANEL_WIDTH_MAX}
            step={PANEL_RESIZE_KEY_STEP}
            ariaLabel="調整面板寬度" // i18n-allow: DS 預設文案
            className="z-10"
            onValueChange={(next) => applyWidth(next, false)}
            onValueCommit={(next) => applyWidth(next, true)}
          />
        )}
        {children}
      </div>
    )
  },
)
AgentPanel.displayName = 'AgentPanel'

/* ────────────────────────────────────────────────────────────────────────────
 * 2. AgentPanelHeader(標題列)+ 歷史浮層 / 改名 / 刪除
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentConversationSummary {
  id: string
  title: string
  /** 分組標題(如「今天」「過去 7 天」);同組相鄰排列。 */
  group?: string
  /** 代理仍在回覆:列首圖示原地換 CircularProgress 16,等寬等高不動版面。 */
  thinking?: boolean
}

export interface AgentPanelHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** 目前對話標題(標題本身=歷史浮層觸發鈕)。 */
  title: string
  /** 歷史浮層搜尋 placeholder(i18n override)。 */
  historySearchPlaceholder?: string
  /** 歷史浮層無結果文案(i18n override)。 */
  historyEmptyText?: string
  /** 標誌狀態(代理思考中傳 "think")。 */
  logoState?: AgentLogoState
  /** 歷史對話清單;空清單=浮層顯示無結果(觸發鈕恆在)。 */
  conversations?: AgentConversationSummary[]
  /** 目前對話 id(歷史清單高亮)。 */
  activeConversationId?: string
  /** 目前對話尚無已送出訊息=本身就是新對話 → 「+ 新對話」停用。 */
  conversationEmpty?: boolean
  /** 歷史浮層初始開啟(展示/快照用;M15 OpenSnapshot)。 */
  defaultHistoryOpen?: boolean
  onSelectConversation?: (id: string) => void
  /** 改名確認(Dialog 流程由元件內建)。 */
  onRenameConversation?: (id: string, title: string) => void
  /**
   * 刪除確認(Dialog 流程由元件內建)。consumer 契約:刪的是目前對話 → 切到最近一則;
   * 全部刪光 → 面板回空狀態(spec「附:歷史浮層」)。
   */
  onDeleteConversation?: (id: string) => void
  /** 固定構件:+ 恆渲染,主流程無內建行為 → 必填。 */
  onNewConversation: () => void
  /** 固定構件:× 恆渲染,面板 open 是 consumer state → 必填。 */
  onClose: () => void
}

/** 歷史列(select-menu.tsx 原型):外層 CommandItem 單一互動 owner;內層 MenuItem 純視覺。 */
function HistoryRow({
  conversation,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: AgentConversationSummary
  selected: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <CommandItem
      value={conversation.id}
      keywords={[conversation.title]}
      onSelect={onSelect}
      className={cn(
        'group/menu-item p-0 rounded-none',
        // 選中 × 鍵盤游標疊加(select-menu.tsx 2026-08-11 拍板:滑鼠釘住、鍵盤反白深一階)。
        selected && 'bg-neutral-selected data-[selected=true]:bg-neutral-selected data-[selected=true]:not-hover:bg-neutral-selected-focus',
      )}
    >
      <MenuItem
        labelMaxLines={1}
        role="presentation"
        selected={selected}
        className="!bg-transparent hover:!bg-transparent"
        startContent={
          conversation.thinking ? (
            <CircularProgress size={16} aria-label="回覆中" /> // i18n-allow: DS 預設
          ) : (
            <MessageSquare size={16} aria-hidden className="text-fg-muted" />
          )
        }
        endContent={
          // 行內動作恆在 DOM(鍵盤 Tab 可達);懸停/focus-visible 淡入=ItemSuffix hoverReveal SSOT。
          /* MenuItem 的 endContent slot 內再包 ItemSuffix 只為 hoverReveal(opacity 淡入);兩層同盒
             (h-[1lh] items-center ml-auto gap-2),不疊任何位移——非 drift(2026-09-02 覆核實測)。 */
          <ItemSuffix hoverReveal hoverGroup="menu-item">
            {/* Enter/Space 在行內動作上 = 啟動該動作(stopPropagation 擋掉 cmdk 的 Enter=選列)。 */}
            <span
              className="contents"
              onKeyDown={(e) => {
                const target = e.target as HTMLElement
                if ((e.key === 'Enter' || e.key === ' ') && target.closest('button')) {
                  e.preventDefault()
                  e.stopPropagation()
                  target.closest('button')?.click()
                }
              }}
            >
            <ItemInlineAction
              action={{
                icon: Pencil,
                label: '改名', // i18n-allow: DS 預設文案(Dialog「關閉」同前例)
                onClick: (e) => {
                  e?.stopPropagation()
                  onRename()
                },
              }}
            />
            <ItemInlineAction
              action={{
                icon: Trash2,
                label: '刪除', // i18n-allow: DS 預設文案(Dialog「關閉」同前例)
                onClick: (e) => {
                  e?.stopPropagation()
                  onDelete()
                },
              }}
            />
                      </span>
          </ItemSuffix>
        }
      >
        {conversation.title}
      </MenuItem>
    </CommandItem>
  )
}

const AgentPanelHeader = React.forwardRef<HTMLElement, AgentPanelHeaderProps>(
  (
    {
      title,
      logoState = 'still',
      historySearchPlaceholder = '搜尋對話', // i18n-allow: DS 預設文案,prop 可覆寫
      historyEmptyText = '沒有符合的對話', // i18n-allow: DS 預設文案,prop 可覆寫
      conversations = [],
      activeConversationId,
      conversationEmpty = false,
      defaultHistoryOpen = false,
      onSelectConversation,
      onRenameConversation,
      onDeleteConversation,
      onNewConversation,
      onClose,
      className,
      ...props
    },
    ref,
  ) => {
    const [historyOpen, setHistoryOpen] = React.useState(defaultHistoryOpen)
    const [renameTarget, setRenameTarget] = React.useState<AgentConversationSummary | null>(null)
    const [deleteTarget, setDeleteTarget] = React.useState<AgentConversationSummary | null>(null)
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    /** Dialog 關閉後焦點回歷史觸發鈕(Popover 已因焦點外移關閉;WCAG 2.4.3)。 */
    // Dialog 關閉後焦點:歷史浮層仍開 → 交給 Radix 還原到觸發它的行內動作(改名/刪除);浮層已關
    // → 延到下一個 macrotask 回標題觸發(晚於 FocusScope 還原到已消失元素 → body 的動作,2026-09-02 實測)。
    const historyOpenRef = React.useRef(historyOpen)
    historyOpenRef.current = historyOpen
    const returnFocus = () => {
      window.setTimeout(() => {
        if (historyOpenRef.current) return
        triggerRef.current?.focus({ preventScroll: true })
      }, 0)
    }

    const groups = React.useMemo(() => {
      const order: string[] = []
      const byGroup = new Map<string, AgentConversationSummary[]>()
      for (const item of conversations) {
        const key = item.group ?? ''
        if (!byGroup.has(key)) {
          byGroup.set(key, [])
          order.push(key)
        }
        byGroup.get(key)!.push(item)
      }
      return order.map((key) => ({ label: key, items: byGroup.get(key)! }))
    }, [conversations])

    // 標題群 ↔ 動作群 gap = loose(2026-09-02 user 拍板:chevron 與右側按鈕至少 --layout-space-loose;
    // ChromeHeader 預設 gap-2 是 slot 內間距,長標題截斷時 chevron 會貼到 28px 圖示鈕被讀成同一群)。
    return (
      <ChromeHeader ref={ref} className={cn('gap-[var(--layout-space-loose)] bg-surface', className)} {...props}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AgentLogo state={logoState} size={24} />
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              {/* 標題+chevron 複合觸發:幾何逐字沿用品牌區前例(238cdf91:gap-2 / chevron 16 / 零 padding),
                  chevron 純指示、fg-muted 靜色、無懸停底(同 AgentThinking 標題列);原生 button 承接 Radix Slot props。 */}
              <button
                ref={triggerRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={historyOpen}
                className={cn(
                  'flex min-w-0 max-w-full cursor-pointer items-center gap-2 p-0 text-left',
                  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {/* 單行截斷 → 截斷時才顯 tooltip 補全(tooltip.spec.md:32;引擎 truncated-text.spec.md),
                    禁手刻 truncate span。 */}
                <TruncatedText className="text-body-lg font-medium">{title}</TruncatedText>
                {/* 指示 chevron 與 Select 觸發器逐字同款:同色 text-fg-muted、同線粗、同「字級↔icon tier」
                    (標題 text-body-lg = Select lg → ICON_SIZE.lg 20)、開啟時 rotate-180。 */}
                <ChevronDown
                  size={ICON_SIZE.lg}
                  aria-hidden
                  className={cn('shrink-0 text-fg-muted transition-transform motion-reduce:duration-0', historyOpen && 'rotate-180')}
                />
              </button>
            </PopoverTrigger>
            {/* 寬度 = Popover canonical w-72(288;popover.tsx 預設,不另訂):介於 ChatGPT 側欄 260 /
                Claude 側欄 290(2026-09-02 實測),且在面板最窄 360 時仍容得下(標題左緣起 312)。
                與觸發點距 = OVERLAY_SIDE_OFFSET 8(elevation.spec.md)。 */}
            <PopoverContent
              align="start"
              aria-label="歷史對話" // i18n-allow: DS 預設文案
              className="overflow-hidden p-0"
            >
              <Command label="歷史對話" className="[&_[cmdk-input-wrapper]]:py-1">
                {/* 搜尋列 40 = 32 + 8(select-menu.tsx 搜尋列同高)。 */}
                <CommandInput
                  placeholder={historySearchPlaceholder}
                  aria-label={historySearchPlaceholder}
                  className="h-8 py-0"
                />
                <CommandList aria-label="對話">
                  <CommandEmpty className="flex items-center justify-center">
                    <Empty description={historyEmptyText} className="py-6" />
                  </CommandEmpty>
                  {groups.map(({ label, items }, gi) => (
                    <React.Fragment key={label || '(ungrouped)'}>
                      {gi > 0 && <CommandSeparator />}
                      <CommandGroup
                        className="p-0 py-2 [&_[cmdk-group-heading]]:p-0"
                        heading={label ? <MenuItem header>{label}</MenuItem> : undefined}
                      >
                        {items.map((conversation) => (
                          <HistoryRow
                            key={conversation.id}
                            conversation={conversation}
                            selected={conversation.id === activeConversationId}
                            onSelect={() => {
                              onSelectConversation?.(conversation.id)
                              setHistoryOpen(false)
                            }}
                            onRename={() => setRenameTarget(conversation)}
                            onDelete={() => setDeleteTarget(conversation)}
                          />
                        ))}
                      </CommandGroup>
                    </React.Fragment>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={Plus}
            aria-label="新對話" // i18n-allow: DS 預設文案(Dialog「關閉」同前例)
            disabled={conversationEmpty}
            onClick={onNewConversation}
          />
          <ButtonDivider />
          <Button dismiss size="sm" startIcon={XIcon} aria-label="關閉面板" onClick={onClose} />
        </div>
        {renameTarget && (
          <AgentRenameDialog
            conversation={renameTarget}
            onOpenChange={(next) => {
              if (!next) {
                setRenameTarget(null)
                returnFocus()
              }
            }}
            onConfirm={(nextTitle) => {
              onRenameConversation?.(renameTarget.id, nextTitle)
              setRenameTarget(null)
              returnFocus()
            }}
          />
        )}
        {deleteTarget && (
          <Dialog
            open
            onOpenChange={(next) => {
              if (!next) {
                setDeleteTarget(null)
                returnFocus()
              }
            }}
          >
            {/* 確認框/短表單:autoHeight 隨內容(dialog.spec.md 高度行為)、寬 440(DS 五個確認框 story 慣例)。 */}
            <DialogContent autoHeight maxWidth={440}>
              <DialogHeader>
                <DialogTitle>刪除對話</DialogTitle>
              </DialogHeader>
              <DialogBody>
                確定刪除「{deleteTarget.title}」?此動作立即生效且不可復原。
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary" onClick={() => { setDeleteTarget(null); returnFocus() }}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  danger
                  onClick={() => {
                    onDeleteConversation?.(deleteTarget.id)
                    setDeleteTarget(null)
                    returnFocus()
                  }}
                >
                  刪除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </ChromeHeader>
    )
  },
)
AgentPanelHeader.displayName = 'AgentPanelHeader'

/** 改名 Dialog:Field+Input 預填全選;儲存=更新類 dirty 規則;空名 blur 顯錯;Esc=Dialog 取消。 */
function AgentRenameDialog({
  conversation,
  onOpenChange,
  onConfirm,
}: {
  conversation: AgentConversationSummary
  onOpenChange: (open: boolean) => void
  onConfirm: (title: string) => void
}) {
  const [value, setValue] = React.useState(conversation.title)
  const [touched, setTouched] = React.useState(false)
  const trimmed = value.trim()
  const dirty = trimmed !== conversation.title
  const empty = trimmed.length === 0
  const showError = touched && empty
  const commit = () => {
    setTouched(true)
    if (empty || !dirty) return
    onConfirm(trimmed)
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* 確認框/短表單:autoHeight 隨內容(dialog.spec.md 高度行為)、寬 440(DS 五個確認框 story 慣例)。 */}
      <DialogContent autoHeight maxWidth={440}>
        <DialogHeader>
          <DialogTitle>改名對話</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field required invalid={showError}>
            <FieldLabel>名稱</FieldLabel>
            <Input
              value={value}
              error={showError}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                // form-validation:Enter=等同 blur(觸發驗證並提交);Esc 由 Dialog 承接=取消。
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commit()
                }
              }}
            />
            {showError && <FieldError>名稱不可空白</FieldError>}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={!dirty} onClick={commit}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. AgentConversation(訊息卷軸區)
 * ──────────────────────────────────────────────────────────────────────── */

export type AgentConversationProps = React.HTMLAttributes<HTMLDivElement>

/** 最後一則代理訊息的工具列常駐(其餘懸停);由 AgentConversation 判定,consumer 不設(SSOT)。 */
const LastAgentMessageContext = React.createContext<boolean>(false)

const AgentConversation = React.forwardRef<HTMLDivElement, AgentConversationProps>(
  ({ className, children, ...props }, ref) => {
    // 找最後一則 role="agent" 的直接子訊息:它的工具列常駐,其他訊息懸停才顯(spec「AgentToolbar」)。
    const items = React.Children.toArray(children)
    let lastAgentIndex = -1
    items.forEach((child, index) => {
      if (React.isValidElement<AgentMessageProps>(child) && child.type === AgentMessage && (child.props.role ?? 'agent') === 'agent') {
        lastAgentIndex = index
      }
    })
    // 自動捲到最新:掛載時與訊息數增加時捲到底(使用者若已往上捲離底部 > 40px 則不打擾;
    // ChatGPT / Claude 皆「貼底跟隨、離底不搶」);全家族一致,consumer 不自接。
    const logRef = React.useRef<HTMLDivElement | null>(null)
    React.useImperativeHandle(ref, () => logRef.current as HTMLDivElement)
    const count = items.length
    const wasNearBottomRef = React.useRef(true)
    React.useLayoutEffect(() => {
      const viewport = logRef.current?.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
      if (!viewport) return
      if (wasNearBottomRef.current) viewport.scrollTop = viewport.scrollHeight
      const onScroll = () => {
        wasNearBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 40
      }
      viewport.addEventListener('scroll', onScroll, { passive: true })
      return () => viewport.removeEventListener('scroll', onScroll)
    }, [count])
    return (
      // 捲軸必用 ScrollArea(跨 OS 一致;Dialog body 同法)。
      <ScrollArea fillX className="min-h-0 flex-1">
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          className={cn(
            // 輪距 40 = 8 + 24(工具列)+ 8;懸停工具列絕對定位於輪距內,出現不推擠。
            // 底部 = --layout-space-bottom 48:最後內容(常駐工具列)→ 輸入盒動作(送出)= layoutSpace 規則 4
            // 「內容 → action button = bottom」(layoutSpace.spec.md L118;2026-09-02 user 抓工具列貼輸入盒)。
            'flex flex-col gap-10 p-[var(--layout-space-loose)] pb-[var(--layout-space-bottom)]',
            className,
          )}
          {...props}
        >
          {items.map((child, index) => (
            <LastAgentMessageContext.Provider key={(React.isValidElement(child) && child.key) || index} value={index === lastAgentIndex}>
              {child}
            </LastAgentMessageContext.Provider>
          ))}
        </div>
      </ScrollArea>
    )
  },
)
AgentConversation.displayName = 'AgentConversation'

/* ────────────────────────────────────────────────────────────────────────────
 * 4. AgentMessage(訊息)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentAttachment {
  id: string
  label: string
}

export interface AgentMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 訊息角色:user=我方氣泡靠右;agent=無氣泡全寬。 */
  role?: 'user' | 'agent'
  /** 氣泡內文字上方的附件(送出後視覺=Chip assist 分支)。 */
  attachments?: AgentAttachment[]
  onAttachmentClick?: (attachment: AgentAttachment) => void
  /** 訊息工具列(AgentToolbar);絕對定位於輪距內。 */
  toolbar?: React.ReactNode
}

const AgentMessage = React.forwardRef<HTMLDivElement, AgentMessageProps>(
  (
    { role = 'agent', attachments, onAttachmentClick, toolbar, className, children, ...props },
    ref,
  ) => {
    const isUser = role === 'user'
    return (
      <div
        ref={ref}
        className={cn('group/agent-message relative', isUser && 'flex justify-end', className)}
        {...props}
      >
        <div
          className={cn(
            'text-body text-foreground',
            isUser
              ? [
                  'max-w-[85%] rounded-md bg-secondary px-3 py-2',
                  'animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--motion-duration-overlay)] motion-reduce:animate-none',
                ]
              : 'w-full [&_a]:text-primary [&_a:hover]:text-primary-hover [&_a]:underline-offset-2 [&_a:hover]:underline',
          )}
        >
          {attachments && attachments.length > 0 && (
            // chip 相互垂直/水平 4(=Combobox 內 Tag 區間距;2026-09-02 拍板)。
            <div className="mb-2 flex flex-wrap gap-1">
              {attachments.map((attachment) => (
                <Chip
                  key={attachment.id}
                  variant="assist"
                  aria-label={`附件:${attachment.label}`}
                  onClick={() => onAttachmentClick?.(attachment)}
                >
                  {attachment.label}
                </Chip>
              ))}
            </div>
          )}
          {children}
        </div>
        {toolbar}
      </div>
    )
  },
)
AgentMessage.displayName = 'AgentMessage'

/* ────────────────────────────────────────────────────────────────────────────
 * 5. AgentThinking(思考塊)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentThinkingProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 進行中:標題「思考中」+微光;完成:「思考過程」靜態。 */
  thinking?: boolean
  /** 已完成的步驟(靜態,fg-secondary)。 */
  steps?: React.ReactNode[]
  /** 正在寫入的最新一行(僅此行與標題套微光)。 */
  currentStep?: React.ReactNode
  /** 開合(未受控時:回覆中自動展開、回覆完自動收合)。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const AgentThinking = React.forwardRef<HTMLDivElement, AgentThinkingProps>(
  ({ thinking = false, steps, currentStep, open, onOpenChange, className, ...props }, ref) => {
    // 非受控:AI 回覆中自動展開、回覆完自動收合(拍板;三套元件庫一致慣例)。
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(thinking)
    React.useEffect(() => {
      if (open === undefined) setUncontrolledOpen(thinking)
    }, [thinking, open])
    const resolvedOpen = open ?? uncontrolledOpen
    const handleOpenChange = (next: boolean) => {
      setUncontrolledOpen(next)
      onOpenChange?.(next)
    }
    return (
      <CollapsiblePrimitive.Root
        ref={ref}
        open={resolvedOpen}
        onOpenChange={handleOpenChange}
        className={cn('text-body', className)}
        {...props}
      >
        <CollapsiblePrimitive.Trigger
          className={cn(
            'group/agent-thinking flex cursor-pointer items-center gap-1 text-fg-secondary hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
          )}
        >
          <span className={cn(thinking && 'agent-shimmer')}>
            {thinking ? '思考中' : '思考過程'}
          </span>
          {/* chevron=裝飾指示(accordion 慣例),不吃微光;色同 Select 觸發器 chevron(fg-muted)。 */}
          <ChevronDown
            size={16}
            aria-hidden
            className="shrink-0 text-fg-muted transition-transform duration-[var(--motion-duration-overlay)] motion-reduce:duration-0 group-data-[state=open]/agent-thinking:rotate-180"
          />
        </CollapsiblePrimitive.Trigger>
        <CollapsiblePrimitive.Content
          className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"
        >
          {/* 完成步驟=fg-secondary(2026-09-02 拍板;原 muted 太淺);微光行基色由 agent-panel.css 自管。 */}
          <div className="mt-2 flex flex-col gap-1 border-l border-divider pl-3 text-fg-secondary">
            {steps?.map((step, index) => <div key={index}>{step}</div>)}
            {currentStep != null && (
              <div className={cn(thinking && 'agent-shimmer')}>{currentStep}</div>
            )}
          </div>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    )
  },
)
AgentThinking.displayName = 'AgentThinking'

/* ────────────────────────────────────────────────────────────────────────────
 * 6. AgentToolbar(訊息工具列;固定 anatomy 恆渲染)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 常駐顯示。預設由 AgentConversation 判定:代理**最後一則**常駐,其餘懸停淡入(SSOT,consumer 不需設);
   * 只在 AgentConversation 之外單獨使用時才需手動指定。
   */
  pinned?: boolean
  onCopy?: () => void
  onLike?: () => void
  onDislike?: () => void
}

const AgentToolbar = React.forwardRef<HTMLDivElement, AgentToolbarProps>(
  ({ pinned: pinnedProp, onCopy, onLike, onDislike, className, children, ...props }, ref) => {
    const pinnedFromConversation = React.useContext(LastAgentMessageContext)
    const pinned = pinnedProp ?? pinnedFromConversation
    return (
    <div
      ref={ref}
      className={cn(
        'mt-2 flex h-6 items-center gap-2',
        'transition-opacity duration-[var(--motion-duration-overlay)] motion-reduce:transition-none',
        // 常駐(最後一則)= 在流內佔位,底部才能守 --layout-space-bottom;懸停顯示 = 絕對定位於輪距內,
        // 出現/消失完全不推擠版面(輪距 40 ≥ 8+24+8)。
        pinned
          ? 'relative opacity-100'
          : 'absolute left-0 top-full opacity-0 group-hover/agent-message:opacity-100 focus-within:opacity-100',
        className,
      )}
      {...props}
    >
      <Button variant="text" size="xs" iconOnly startIcon={Copy} aria-label="複製" onClick={() => onCopy?.()} />
      <ButtonDivider />
      <Button variant="text" size="xs" iconOnly startIcon={ThumbsUp} aria-label="讚" onClick={() => onLike?.()} />
      <Button variant="text" size="xs" iconOnly startIcon={ThumbsDown} aria-label="倒讚" onClick={() => onDislike?.()} />
      {children}
    </div>
    )
  },
)
AgentToolbar.displayName = 'AgentToolbar'

/* ────────────────────────────────────────────────────────────────────────────
 * 7. AgentPromptInput(複合輸入盒;固定 anatomy 恆渲染)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentPromptAttachment {
  id: string
  label: string
}

export interface AgentPromptInputProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  value: string
  onValueChange: (value: string) => void
  /** 送出(Enter / 送出鈕);無內建行為 → 必填。 */
  onSubmit: () => void
  /** 代理進行中:送出鈕同位換停止(實心正方),0.15s 淡切。 */
  busy?: boolean
  onStop?: () => void
  /** 輸入中附件(Tag md 恆帶 ×;超寬 +N;送出後於訊息內轉 Chip assist 視覺)。 */
  attachments?: AgentPromptAttachment[]
  /** 固定構件:每個 Tag 的 × 恆渲染 → 必填。 */
  onRemoveAttachment: (attachment: AgentPromptAttachment) => void
  /** 固定構件:工具列 + 恆渲染 → 必填。 */
  onAddAttachment: () => void
  placeholder?: string
}

/** 附件單列 + 超寬 +N(useOverflowIndices 量測;Combobox 多選 Tag 區同族)。 */
function PromptAttachmentRow({
  attachments,
  onRemove,
}: {
  attachments: AgentPromptAttachment[]
  onRemove: (attachment: AgentPromptAttachment) => void
}) {
  const { containerRef, registerItem, overflowIndices } = useOverflowIndices<HTMLDivElement>({
    reserveTriggerWidth: 48,
  })
  const hidden = new Set(overflowIndices)
  const hiddenItems = attachments.filter((_, i) => hidden.has(i))
  return (
    // 附件列 28:Tag 相互間距 4、距內緣 4;單列不換行,溢出以 +N 收納。
    // 被藏的 Tag 留在 flow 內、排到 +N 之後(order-last)並隱形:useOverflowIndices 每次重量都拿得到
    // 真實位置(抽離 flow 會在放寬時被誤判「可見」而失去 +N,2026-09-02 實測)。
    <div ref={containerRef} className="flex items-center gap-1 overflow-hidden px-1 pt-1">
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id}
          ref={registerItem(index)}
          className={cn('shrink-0', hidden.has(index) && 'invisible order-last')}
        >
          <Tag size="md" onRemove={() => onRemove(attachment)}>
            {attachment.label}
          </Tag>
        </div>
      ))}
      {hiddenItems.length > 0 && (
        <OverflowIndicator count={hiddenItems.length} shape="tag" size="md">
          {hiddenItems.map((attachment) => (
            <Tag key={attachment.id} size="md" onRemove={() => onRemove(attachment)}>
              {attachment.label}
            </Tag>
          ))}
        </OverflowIndicator>
      )}
    </div>
  )
}

const AgentPromptInput = React.forwardRef<HTMLDivElement, AgentPromptInputProps>(
  (
    {
      value,
      onValueChange,
      onSubmit,
      busy = false,
      onStop,
      attachments = [],
      onRemoveAttachment,
      onAddAttachment,
      placeholder = '輸入訊息…',
      className,
      ...props
    },
    ref,
  ) => {
    const canSubmit = value.trim().length > 0
    const submit = () => {
      if (busy || !canSubmit) return
      onSubmit()
    }
    return (
      <div
        ref={ref}
        className={cn(
          'm-[var(--layout-space-loose)] mt-0 shrink-0 rounded-md',
          // 外框互動 = Field 家族 default chrome SSOT(field-wrapper.tsx fieldChromeStyles:單行 wrapper /
          // Textarea / 複合輸入盒三宿主同一份 compounds):hover 一階 border-hover、focus-within 主色;
          // 2026-09-02 user 抓「跟 Textarea 不一樣」→ 收斂為單一住所,禁自刻。
          fieldChromeStyles({ mode: 'edit', variant: 'default', error: false }),
          className,
        )}
        {...props}
      >
        {attachments.length > 0 && (
          <PromptAttachmentRow attachments={attachments} onRemove={onRemoveAttachment} />
        )}
        <textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            // 按 Enter 送出、Shift+Enter 換行(拍板)。
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="訊息"
          className={cn(
            // 欄位家族內距:單行 32 等高鐵律((欄高−1lh)/2−1 + --field-px)。
            'block w-full resize-none bg-transparent outline-none',
            'px-[var(--field-px)] py-[var(--field-control-py-md)] text-body text-foreground',
            'placeholder:text-fg-muted',
            'field-sizing-content max-h-40',
          )}
        />
        <div className="flex h-10 items-center justify-between px-2">
          <Button
            variant="text"
            size="xs"
            iconOnly
            startIcon={Plus}
            aria-label="新增附件"
            onClick={onAddAttachment}
          />
          {busy ? (
            <Button
              variant="primary"
              size="xs"
              iconOnly
              startIcon={StopFilled}
              aria-label="停止生成"
              onClick={() => onStop?.()}
              className="animate-in fade-in-0 duration-[var(--motion-duration-overlay)]"
            />
          ) : (
            <Button
              variant="primary"
              size="xs"
              iconOnly
              startIcon={ArrowUp}
              aria-label="送出"
              disabled={!canSubmit}
              onClick={submit}
              className="animate-in fade-in-0 duration-[var(--motion-duration-overlay)]"
            />
          )}
        </div>
      </div>
    )
  },
)
AgentPromptInput.displayName = 'AgentPromptInput'

/* ────────────────────────────────────────────────────────────────────────────
 * 8. AgentDecisionCard(決策卡;一題一問步進)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentDecisionOption {
  value: string
  /** 單行、≤10 字、無句尾標點、說「選了會怎樣」(產題守則 5)。 */
  label: string
  /** 一行差異描述:單句、無句號、同題比同一維度(產題守則 6)。 */
  description: string
}

export interface AgentDecisionQuestion {
  id: string
  /** 題目=一句完整問句、以「?」結尾、句內點名決策對象(產題守則 3)。 */
  label: string
  /** 2-4 具名選項(不含「其他」;「其他」由元件必備附加,產題守則 4/7)。 */
  options: AgentDecisionOption[]
  /** 預選推薦解;省略=第一項;元件在該項 label 後加「(建議)」(產題守則 8)。 */
  defaultValue?: string
  /** 不可逆/安全/法律/稱謂類題:不預選(產題守則 8 例外);複選題恆不預選。 */
  noDefault?: boolean
  /** 答案本質可複選才開(產題守則 10):改 CheckboxGroup、不預選、值以 `\n` 連接。 */
  multiSelect?: boolean
}

export interface AgentDecisionCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit' | 'title'> {
  /** ≤3 題;一題一問步進,N>1 時標題列顯示「n / N」。 */
  questions: AgentDecisionQuestion[]
  /** 全部作答後送出:answers[questionId] = 選項值或「其他」文字(複選以 `\n` 連接)。 */
  onSubmit?: (answers: Record<string, string>) => void
  /** 跳過=採預設值繼續(Skip 鈕與 header × 同一行為);回傳目前預設/已選值。 */
  onSkip?: (answers: Record<string, string>) => void
}

const OTHER_VALUE = '__agent_decision_other__'
const OTHER_LABEL = '其他'
const RECOMMENDED_SUFFIX = '(建議)'
const MULTI_JOIN = '\n'

/** 產題守則機械層(agent-panel.spec.md §8 ⚙ 條):DEV 只警告不阻擋,內容規則靠稽核。 */
function warnDecisionRules(questions: AgentDecisionQuestion[]) {
  const warn = (msg: string) => console.warn(`[AgentDecisionCard] 產題守則:${msg}`)
  if (questions.length === 0 || questions.length > 3) warn(`題數 1–3(收到 ${questions.length})。`)
  for (const q of questions) {
    if (!/[??]$/.test(q.label.trim())) warn(`題目必是完整問句、以「?」結尾(${q.id}:「${q.label}」)。`)
    if (q.options.length < 2 || q.options.length > 4) warn(`每題 2–4 個具名選項(${q.id} 有 ${q.options.length})。`)
    for (const o of q.options) {
      if (/\n/.test(o.label) || o.label.length > 10) warn(`選項標籤單行且 ≤10 字(${q.id}:「${o.label}」)。`)
      if (/[,,;;.。!!]$/.test(o.label)) warn(`選項標籤無句尾標點(${q.id}:「${o.label}」)。`)
      if (/\(建議\)|\(建議\)|\(Recommended\)/i.test(o.label)) warn(`「(建議)」由元件標,勿寫進標籤(${q.id}:「${o.label}」)。`)
      if (!o.description?.trim()) warn(`每個具名選項必附一行差異描述(${q.id}:「${o.label}」)。`)
      else if (/\n/.test(o.description) || /[。.]$/.test(o.description.trim())) warn(`描述單句、無句號(${q.id}:「${o.label}」)。`)
      if (/^(其他|other)$/i.test(o.label.trim()) || o.value === OTHER_VALUE) warn(`「其他」由元件附加,勿自列(${q.id})。`)
    }
    if (q.multiSelect && q.defaultValue) warn(`複選題不預選(${q.id})。`)
    if (!q.multiSelect && !q.noDefault) {
      const def = q.defaultValue ?? q.options[0]?.value
      if (q.defaultValue && !q.options.some((o) => o.value === q.defaultValue)) warn(`defaultValue 必是選項之一(${q.id})。`)
      if (def !== q.options[0]?.value) warn(`推薦解必排第一(${q.id})。`)
    }
  }
}

function initialAnswer(q: AgentDecisionQuestion) {
  if (q.multiSelect || q.noDefault) return ''
  return q.defaultValue ?? q.options[0]?.value ?? ''
}

/** 複選值 = 已勾選 value 集合(含 OTHER_VALUE),以 `\n` 連接存於 answers。 */
const splitMulti = (v: string | undefined) => (v ? v.split(MULTI_JOIN).filter(Boolean) : [])

const AgentDecisionCard = React.forwardRef<HTMLDivElement, AgentDecisionCardProps>(
  ({ questions, onSubmit, onSkip, className, ...props }, ref) => {
    const titleId = React.useId()
    const otherInputId = React.useId()
    const optionIdBase = React.useId()
    if (import.meta.env?.DEV) warnDecisionRules(questions)
    const [step, setStep] = React.useState(0)
    const [answers, setAnswers] = React.useState<Record<string, string>>(() =>
      Object.fromEntries(questions.map((q) => [q.id, initialAnswer(q)])),
    )
    const [otherText, setOtherText] = React.useState<Record<string, string>>({})
    const resolveOne = (q: AgentDecisionQuestion) => {
      const other = (otherText[q.id] ?? '').trim()
      if (q.multiSelect) {
        return splitMulti(answers[q.id])
          .map((v) => (v === OTHER_VALUE ? other : v))
          .filter(Boolean)
          .join(MULTI_JOIN)
      }
      return answers[q.id] === OTHER_VALUE ? other : (answers[q.id] ?? '')
    }
    const resolvedAnswers = () =>
      Object.fromEntries(questions.map((q) => [q.id, resolveOne(q)])) as Record<string, string>
    const total = questions.length
    const question = questions[Math.min(step, total - 1)]
    const isLast = step >= total - 1
    const select = (value: string) => setAnswers((prev) => ({ ...prev, [question.id]: value }))
    const toggle = (value: string, checked: boolean) =>
      setAnswers((prev) => {
        const set = new Set(splitMulti(prev[question.id]))
        if (checked) set.add(value)
        else set.delete(value)
        return { ...prev, [question.id]: [...set].join(MULTI_JOIN) }
      })
    const skip = () => onSkip?.(resolvedAnswers())

    if (!question) return null
    const multi = Boolean(question.multiSelect)
    const selectedSet = new Set(multi ? splitMulti(answers[question.id]) : [answers[question.id]])
    const otherSelected = selectedSet.has(OTHER_VALUE)
    // 「其他」選中而文字為空 → 不得前進/送出(產題守則 7);複選一項未勾 → 亦不得前進。
    const canAdvance =
      (!otherSelected || (otherText[question.id] ?? '').trim() !== '') &&
      (!multi || selectedSet.size > 0)
    const recommendedValue =
      !multi && !question.noDefault ? (question.defaultValue ?? question.options[0]?.value) : undefined
    const optionLabel = (option: AgentDecisionOption | { value: string; label: string }) =>
      option.value === recommendedValue ? `${option.label}${RECOMMENDED_SUFFIX}` : option.label
    const allOptions = [...question.options, { value: OTHER_VALUE, label: OTHER_LABEL }]
    const renderOtherInput = () => (
      // 「其他」卡:常駐 32 高輸入格;label 行框↔Input 8(mt-2);距卡右/下各 12(卡 px 12;卡 py 8 + mb 4);
      // 左縮排 24 = radio 16 + gap 8,與 label 對齊(Polaris ChoiceChildren 同款)。
      <div className="mb-1 mt-2 pl-6">
        <Input
          id={otherInputId}
          value={otherText[question.id] ?? ''}
          placeholder="輸入其他選項"
          aria-label="其他(自由輸入)"
          aria-describedby={titleId}
          onFocus={() => (multi ? toggle(OTHER_VALUE, true) : select(OTHER_VALUE))}
          onChange={(e) => setOtherText((prev) => ({ ...prev, [question.id]: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )
    // 滑鼠/觸控點整張「其他」卡 → 聚焦輸入格(明確指向意圖);鍵盤方向鍵選中不搶焦點(APG radio roving),Tab 一步即到。
    const focusOtherInput = () =>
      window.setTimeout(() => (document.getElementById(otherInputId) as HTMLInputElement | null)?.focus(), 0)
    // 灰底選項卡 = 唯一行距 owner(py 8);SelectionItem 自帶 py((32−1lh)/2=5.5)歸零,避免 double padding
    // (checkbox.spec.md 零外部 gap 鐵律的反向:間距只能有一個 owner)。
    const cardClass = 'cursor-pointer rounded-md bg-secondary px-3 py-2'
    return (
      <div
        ref={ref}
        role="group"
        aria-labelledby={titleId}
        className={cn(
          // 繼承 Popover surface:rounded-lg/border/elevation-200;改寫:無下圓角、貼底。
          'absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden',
          'rounded-t-lg rounded-b-none border border-b-0 border-border bg-surface-raised',
          'shadow-[var(--elevation-200)]',
          'animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--motion-duration-overlay)] motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {/* 標題列:N>1 時小標「n / N」+ 題目 + ×(跳過);改寫:header 下無分隔線。 */}
        <SurfaceHeader className={cn(COMPACT_HEADER_SLOT, 'items-start justify-between border-b-0')}>
          <div className="flex min-w-0 flex-1 flex-col">
            {total > 1 && (
              <span className="text-caption font-medium text-fg-secondary">
                {step + 1} / {total}
              </span>
            )}
            <span id={titleId} className="text-body font-medium text-foreground">
              {question.label}
            </span>
          </div>
          <Button dismiss size="sm" startIcon={XIcon} aria-label="跳過" onClick={skip} />
        </SurfaceHeader>
        {/* body:上下無內距、左右 16;選項=灰底卡 gap 8(整卡可點;拍板樣張,本地包裝不抽通用元件);捲軸必用 ScrollArea。 */}
        <ScrollArea fillX className="min-h-0">
          {multi ? (
            <CheckboxGroup
              key={question.id}
              aria-labelledby={titleId}
              className="flex flex-col gap-2 px-[var(--layout-space-loose)]"
            >
              {allOptions.map((option) => {
                const isOther = option.value === OTHER_VALUE
                const checked = selectedSet.has(option.value)
                return (
                  <div
                    key={option.value}
                    data-state={checked ? 'checked' : 'unchecked'}
                    className={cardClass}
                    onClick={() => {
                      toggle(option.value, !checked)
                      if (isOther && !checked) focusOtherInput()
                    }}
                  >
                    <SelectionItem
                      size="md"
                      className="py-0"
                      htmlFor={`${optionIdBase}-${option.value}`}
                      control={
                        <Checkbox
                          id={`${optionIdBase}-${option.value}`}
                          size="md"
                          checked={checked}
                          onCheckedChange={(next) => toggle(option.value, next === true)}
                          onClick={(e) => e.stopPropagation()}
                          aria-controls={isOther ? otherInputId : undefined}
                        />
                      }
                      label={optionLabel(option)}
                      description={isOther ? undefined : (option as AgentDecisionOption).description}
                    />
                    {isOther && renderOtherInput()}
                  </div>
                )
              })}
            </CheckboxGroup>
          ) : (
            <RadioGroup
              key={question.id}
              value={answers[question.id] ?? ''}
              onValueChange={select}
              aria-labelledby={titleId}
              className="flex flex-col gap-2 px-[var(--layout-space-loose)]"
            >
              {allOptions.map((option) => {
                const isOther = option.value === OTHER_VALUE
                const checked = selectedSet.has(option.value)
                return (
                  <div
                    key={option.value}
                    data-state={checked ? 'checked' : 'unchecked'}
                    className={cardClass}
                    onClick={() => {
                      select(option.value)
                      if (isOther) focusOtherInput()
                    }}
                  >
                    <SelectionItem
                      size="md"
                      className="py-0"
                      htmlFor={`${optionIdBase}-${option.value}`}
                      control={
                        <RadioGroupItem
                          id={`${optionIdBase}-${option.value}`}
                          value={option.value}
                          size="md"
                          aria-controls={isOther ? otherInputId : undefined}
                        />
                      }
                      label={optionLabel(option)}
                      description={isOther ? undefined : (option as AgentDecisionOption).description}
                    />
                    {isOther && renderOtherInput()}
                  </div>
                )
              })}
            </RadioGroup>
          )}
        </ScrollArea>
        {/* footer:第一題=跳過(用預設繼續)、第二題起=上一題(答案保留;Material Stepper Back / GOV.UK Back 同款);
            右=下一題 / 送出(末題);鈕 sm 守 Popover all-sm 律;無上分隔線;× 恆為跳過。 */}
        <SurfaceFooter className="border-t-0">
          {step > 0 ? (
            <Button variant="tertiary" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              上一題
            </Button>
          ) : (
            <Button variant="tertiary" size="sm" onClick={skip}>
              跳過
            </Button>
          )}
          {isLast ? (
            <Button variant="primary" size="sm" disabled={!canAdvance} onClick={() => onSubmit?.(resolvedAnswers())}>
              送出
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              下一題
            </Button>
          )}
        </SurfaceFooter>
      </div>
    )
  },
)
AgentDecisionCard.displayName = 'AgentDecisionCard'

/* ────────────────────────────────────────────────────────────────────────────
 * 9. AgentDecisionSummary(決策回執)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentDecisionSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  /** [問題, 答案] 配對(靜態回執)。 */
  entries: Array<{ question: string; answer: string }>
}

const AgentDecisionSummary = React.forwardRef<HTMLDivElement, AgentDecisionSummaryProps>(
  ({ entries, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-body',
        className,
      )}
      {...props}
    >
      {entries.map(({ question, answer }, index) => (
        <div key={index} className="flex flex-col">
          <span className="text-fg-secondary">{question}</span>
          <span className="text-foreground">{answer}</span>
        </div>
      ))}
    </div>
  ),
)
AgentDecisionSummary.displayName = 'AgentDecisionSummary'

export {
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentThinking,
  AgentToolbar,
  AgentPromptInput,
  AgentDecisionCard,
  AgentDecisionSummary,
  PANEL_WIDTH_DEFAULT as AGENT_PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MIN as AGENT_PANEL_WIDTH_MIN,
  PANEL_WIDTH_MAX as AGENT_PANEL_WIDTH_MAX,
}
