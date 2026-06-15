// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — composite 拼裝(Toolbar / ZoomInput / InfoPanel / Filmstrip + Dialog shell + renderer registry);拆檔會把 useState/useEffect/key handler 跨檔同步過於複雜
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  X as XIcon,
  Download,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  File as FileIcon,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Separator } from '@/design-system/components/Separator/separator'
import { Input } from '@/design-system/components/Input/input'
import { Empty } from '@/design-system/components/Empty/empty'
import { AspectRatio } from '@/design-system/components/AspectRatio/aspect-ratio'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import {
  useScrollEdges,
  useScrollByPage,
  buildFadeMask,
  OverflowScrollArrow,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'
import { useControllable } from '@/design-system/hooks/use-controllable'
import { ImageRenderer, canRenderImage } from './image-renderer'
import type {
  FileInfo,
  FileRenderer,
  FileRendererCapabilities,
  FileRendererProps,
} from './file-viewer-types'

/**
 * FileViewer — 可延伸的網頁檔案 preview shell(modal fullscreen)
 *
 * ── 定位 ──
 * 公開、composite 元件。consumer 傳 `files`,FileViewer 處理 overlay / toolbar /
 * keyboard / filmstrip / info panel 一切 chrome;檔案本體由 renderer registry
 * 按 file MIME 決定誰渲染(MVP 內建 ImageRenderer + FallbackRenderer)。
 *
 * ── 實作基礎 ──
 * 自建 composite,消費 DS primitives:
 *   - Radix DialogPrimitive(焦點 trap / Esc / aria-modal,保有 shadcn 結構優勢)
 *   - `<Empty>` / `<Button>` / `<Input variant="bare">` / `<AspectRatio>` / `<Textarea>` / `<DropdownMenu>`
 *   - `patterns/horizontal-overflow`(filmstrip 溢出捲動)
 * 不用 DS 的 `<Dialog>` wrapper:因為 FileViewer 需要 edge-to-edge fullscreen
 * (無 viewport inset / 無 rounded-lg / 無 maxWidth),Dialog 的這些預設都要覆寫。
 * 直接消費 Radix primitive 讓 shell 擁有完整 layout 控制權。
 *
 * ── Layout Family ──
 * 非 Family 1/2/3/4 — composite / multi-region(Toolbar / Viewport / Filmstrip +
 * 可選 InfoPanel)。見 `file-viewer.spec.md`「Layout Family」段。
 *
 * ── Extensibility ──
 * `registerFileRenderer(renderer)` 註冊新 renderer;shell 按註冊順序 iterate,
 * 第一個 `canRender(file)` 回 true 的渲染。FallbackRenderer 永遠兜底(未知檔案
 * 類型顯示 icon + 檔名 + download)。
 */

// ─── Renderer Registry ────────────────────────────────────────────────────────

/**
 * Fallback renderer — 無 renderer 能處理時兜底。
 * 顯示 Empty 佈局:icon + 檔名 + 「請下載檢視」提示。
 */
const FallbackRenderer: React.FC<FileRendererProps> = ({ file, onCapabilitiesChange }) => {
  // Contract(file-viewer-types.ts `onCapabilitiesChange` doc):「第一個 renderer mount
  // 時必須 emit」。fallback 不支援 zoom → emit { zoom: false };不 emit 的話 shell 會沿用
  // 上一個 renderer 的 capability(image → 未知檔切換時 toolbar 殘留 zoom controls,
  // `+`/`-`/`0`/`F` 快捷鍵也會對不支援 zoom 的檔案生效)。同 image-renderer.tsx mount emit pattern。
  React.useEffect(() => {
    onCapabilitiesChange({ zoom: false })
  }, [onCapabilitiesChange])

  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <Empty
        icon={FileText}
        title={file.name}
        description={`無法在瀏覽器中預覽此檔案類型（${file.mimeType || 'unknown'}）。請下載後檢視。`}
      />
    </div>
  )
}

const fallbackRenderer: FileRenderer = {
  id: 'fallback',
  canRender: () => true,
  component: FallbackRenderer,
}

const imageRenderer: FileRenderer = {
  id: 'image',
  canRender: canRenderImage,
  component: ImageRenderer,
}

// Registry 是 module-singleton:新 renderer 透過 registerFileRenderer 加入。
// Fallback 永遠最後(兜底),因此用陣列第二段存放。
const userRegistered: FileRenderer[] = []

export function registerFileRenderer(renderer: FileRenderer): void {
  // 去重:同 id 則覆寫
  const existingIdx = userRegistered.findIndex((r) => r.id === renderer.id)
  if (existingIdx >= 0) {
    userRegistered[existingIdx] = renderer
  } else {
    userRegistered.push(renderer)
  }
}

function resolveRenderer(file: FileInfo): FileRenderer {
  // 先查 user registered,再 built-in,最後 fallback
  for (const r of userRegistered) {
    if (r.canRender(file)) return r
  }
  if (imageRenderer.canRender(file)) return imageRenderer
  return fallbackRenderer
}

// ─── Zoom presets ─────────────────────────────────────────────────────────────

type ZoomFit = 'fit-width' | 'fit-page'

const ZOOM_PRESETS: number[] = [10, 25, 50, 75, 100, 125, 150, 200, 400]
// i18n-allow-block: DS defaults for zoom fit menu;consumer override via `labels.zoomFitOptions` (future) or fork
const ZOOM_FIT_OPTIONS: { value: ZoomFit; label: string }[] = [
  { value: 'fit-width', label: 'Fit to width' },
  { value: 'fit-page', label: 'Fit to page' },
]

function nextZoomIn(current: number): number {
  for (const p of ZOOM_PRESETS) {
    if (p > current) return p
  }
  return ZOOM_PRESETS[ZOOM_PRESETS.length - 1]
}
function nextZoomOut(current: number): number {
  for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
    if (ZOOM_PRESETS[i] < current) return ZOOM_PRESETS[i]
  }
  return ZOOM_PRESETS[0]
}

// ─── ZoomInput ────────────────────────────────────────────────────────────────

interface ZoomInputProps {
  value: number
  onChange: (next: number) => void
  onFit: (fit: ZoomFit) => void
  labels: Pick<Required<FileViewerLabels>, 'zoomInput' | 'zoomMenu'>
}

/**
 * ZoomInput — [−] [% input(bare)with ⌄ menu trigger] [+]
 *
 * 世界級對照:Figma zoom control / Adobe Acrobat / Google Slides zoom。
 *
 * ── 消費 DS primitive ──
 *   - `<Button>` iconOnly size="sm" 作 ±按鈕
 *   - `<Input size="sm" autoWidth>` 作 %輸入(Toolbar inline editing canonical;autoWidth 隨文字寬)
 *   - Input `endSlot` escape hatch 包 `<DropdownMenuTrigger asChild>` + chevron 觸發 DropdownMenu
 *   - `<DropdownMenu>` 作 preset + fit 選單(取代原先 Popover + 手刻 button list)
 *
 * ── 為什麼 inline(不抽獨立 primitive)──
 * 目前只 FileViewer 消費;MVP 階段遵循 YAGNI。當 PDF / Video viewer 也需要相同
 * primitive 時,再依「建立前必查既有 pattern」原則從 FileViewer 抽出升級。
 */
const ZoomInput: React.FC<ZoomInputProps> = ({ value, onChange, onFit, labels }) => {
  const [draft, setDraft] = React.useState<string>(`${value}%`)
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    setDraft(`${value}%`)
  }, [value])

  const commitDraft = () => {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      // 限 10–400 範圍,對齊 ImageRenderer MIN_SCALE/MAX_SCALE
      const clamped = Math.min(400, Math.max(10, parsed))
      onChange(clamped)
      setDraft(`${clamped}%`)
    } else {
      setDraft(`${value}%`)
    }
  }

  return (
    // zoom group = toolbar 按鈕群組,`gap-2`(8px)對齊本 DS 按鈕 gap canonical。
    <div className="inline-flex items-center gap-2">
      {/* 縮小 */}
      <Button
        variant="text"
        size="sm"
        iconOnly
        startIcon={Minus}
        aria-label="縮小"
        disabled={value <= 10}
        onClick={() => onChange(nextZoomOut(value))}
      />

      {/* % Input + chevron 內嵌為 endSlot(ItemInlineActionButton 作 DropdownMenuTrigger):
          — Input body 可自由打字(chevron 是 Input 內部 element,body 區域 click 不觸發 menu)
          — Chevron 是 inline action,同時是 DropdownMenuTrigger → menu 精確 anchor 在 chevron 下方
          — 靠 Radix asChild + ItemInlineActionButton:視覺是 Input + endAction,行為是 chevron-as-trigger
          — 完全對齊 user AR:「只有 inline action 能觸發選單,menu 對齊 inline action」 */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Input
          size="sm"
          autoWidth
          aria-label={labels.zoomInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="text-center tabular-nums"
          endSlot={
            <DropdownMenuTrigger asChild>
              <ItemInlineActionButton
                icon={ChevronDown}
                aria-label={labels.zoomMenu}
                size="sm"
                overlayTrigger
              />
            </DropdownMenuTrigger>
          }
        />
        {/* data-theme="dark":DropdownMenuContent 走 Portal 到 document body 外,
            不繼承 FileViewer 外層 data-theme="dark",需顯式打 dark 讓選單跟 chrome 一致。
            **加 bg-surface-raised 強制用 dark token**(純 data-theme attr 在 Portal 不夠,
            Tailwind 條件 class + CSS variable 都要一起帶) */}
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          // minWidth 對齊 trigger(Input autoWidth),menu 寬度 fit-content 更貼近觸發點視覺中心
          className="min-w-[9rem] w-auto bg-surface-raised text-foreground border-divider"
          data-theme="dark"
        >
          {/* 內層 data-theme 再覆蓋一次 — 確保 DropdownMenuItem children 都 resolve dark token */}
          <div data-theme="dark" className="contents">
            {ZOOM_FIT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => onFit(opt.value)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {ZOOM_PRESETS.map((p) => {
              const selected = p === value
              return (
                <DropdownMenuItem
                  key={p}
                  onSelect={() => onChange(p)}
                  data-state={selected ? 'checked' : undefined}
                  className={cn(
                    'tabular-nums',
                    selected && 'bg-neutral-selected',
                  )}
                >
                  {p}%
                </DropdownMenuItem>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 放大 */}
      <Button
        variant="text"
        size="sm"
        iconOnly
        startIcon={Plus}
        aria-label="放大"
        disabled={value >= 400}
        onClick={() => onChange(nextZoomIn(value))}
      />
    </div>
  )
}
ZoomInput.displayName = 'ZoomInput'

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  file: FileInfo
  capabilities: FileRendererCapabilities
  zoom: number
  onZoomChange: (z: number) => void
  onFit: (fit: ZoomFit) => void
  infoOpen: boolean
  onInfoToggle: () => void
  onDownload?: () => void
  allowDownload: boolean
  onClose: () => void
  labels: Required<FileViewerLabels>
}

const Toolbar: React.FC<ToolbarProps> = ({
  file,
  capabilities,
  zoom,
  onZoomChange,
  onFit,
  infoOpen,
  onInfoToggle,
  onDownload,
  allowDownload,
  onClose,
  labels,
}) => {
  return (
    <ChromeHeader
      // Density:繼承 page(2026-06-15 canonical)。原 lockDensity="lg" 只鎖在 header、沒鎖 body →
      // InfoPanel header(px-loose@lg=24)與其 body(px-loose@page=16)左緣不對齊(圖二 bug)。移除 lock
      // → header + body 全繼承 page density,左緣對齊;FileViewer 全 surface 同一密度(non-special)。
      className={cn(
        // Chrome layer — `bg-surface-raised` 對齊 token semantic「遮蓋型浮層必須不透明」。
        // FileViewer 整體是 overlay,chrome 屬其 raised surface(同 DropdownMenuContent line 244)。
        // 不用 bg-surface(dark = white α8 半透明,outer 透明時失去 backdrop 洗白)。
        // 不用 bg-canvas(那是「頁面最底層」semantic,chrome 不是 page)。
        // ChromeHeader 自帶 flex/items-center/gap-2/shrink-0/h-chrome-header-height/border-b/px-loose
        'bg-surface-raised',
      )}
    >
      {/* 檔名(左,佔據可用寬度,ellipsis)—— file-type icon 代表檔名的意象(這是什麼檔),
          對齊 CLAUDE.md「icon 代表 label 意象時與 label 同色」原則:icon 走 text-foreground
          不走 text-fg-muted(後者是裝飾性 / 輔助 icon 的色階) */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileIcon size={16} className="text-foreground shrink-0" aria-hidden />
        <span
          className="text-body-lg text-foreground truncate"
          title={file.name}
        >
          {file.name}
        </span>
      </div>

      {/* 按鈕順序 canonical:zoom → info → download → close(影響力遞增)
          action-bar 三分區:zoom(data op)/ info+download(action group)/ close(dismiss)
          dismiss 前分隔線 = action-bar「dismiss 跟動作分群」canonical

          ── gap-2 canonical(2026-04-21 follow-up)──
          按鈕間距 **8px**(gap-2),對齊 Dialog footer `gap-2` / CLAUDE 按鈕間距 SSOT。
          zoom group(ZoomInput)內部同樣是 gap-2(見 `ZoomInput` L197),
          與這裡 action-group-to-action-group 的 gap-2 一致。 */}
      <div className="flex items-center gap-2 shrink-0">
        {capabilities.zoom && (
          <>
            {/* Zoom group:-/%/+/▼ 屬同類「縮放」操作,群組並在右側加分隔線跟其他動作分群 */}
            <ZoomInput value={zoom} onChange={onZoomChange} onFit={onFit} labels={labels} />
            {/* zoom group → next action group divider(action-bar canonical;v11 升級成 Separator
                元件,對齊 separator.spec.md「consumer 手動放置 toolbar 群組分隔線 = 用 Separator」)*/}
            <Separator orientation="vertical" className="h-6 mx-1" />
          </>
        )}
        <Button
          variant="text"
          size="sm"
          iconOnly
          startIcon={Info}
          aria-label={infoOpen ? labels.infoToggleCollapse : labels.infoToggleExpand}
          pressed={infoOpen}
          onClick={onInfoToggle}
        />
        {allowDownload && (
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={Download}
            aria-label={labels.download}
            onClick={onDownload}
          />
        )}
        {/* action-bar canonical:dismiss 前加分隔線跟其他動作分群(info/download = action group,
            close = dismiss group;v11 升級成 Separator,對齊 separator.spec.md canonical)*/}
        <Separator orientation="vertical" className="h-6 mx-1" />
        {/* Close X 走 dismiss canonical(`<Button iconOnly dismiss />`)——對齊 CLAUDE.md
            `button.spec.md`「Dismiss 視覺類」+ `patterns/element-anatomy/item-anatomy.spec.md`
            「Dismiss canonical」:chrome corner close X = Button dismiss,不是 Inline Action。 */}
        <Button
          iconOnly
          dismiss
          size="sm"
          data-dismiss
          startIcon={XIcon}
          aria-label={labels.close}
          onClick={onClose}
        />
      </div>
    </ChromeHeader>
  )
}

// ─── InfoPanel ────────────────────────────────────────────────────────────────

interface InfoPanelProps {
  file: FileInfo
  readOnly: boolean
  onDescriptionChange?: (fileId: string, description: string) => void
  onClose: () => void
  labels: Required<FileViewerLabels>
}

function formatBytes(bytes: number | undefined): string | undefined {
  if (bytes == null) return undefined
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const InfoPanel: React.FC<InfoPanelProps> = ({
  file,
  readOnly,
  onDescriptionChange,
  onClose,
  labels,
}) => {
  const [draft, setDraft] = React.useState(file.description ?? '')

  React.useEffect(() => {
    setDraft(file.description ?? '')
  }, [file.id, file.description])

  const commit = () => {
    if (readOnly) return
    if (draft !== (file.description ?? '')) {
      onDescriptionChange?.(file.id, draft)
    }
  }

  const sizeText = formatBytes(file.size)

  return (
    <aside
      className={cn(
        // Chrome — bg-surface-raised 同 Toolbar / Filmstrip(token semantic「遮蓋型浮層」)
        'w-80 shrink-0 flex flex-col bg-surface-raised border-l border-divider',
        'h-full',
      )}
      aria-label={labels.detailPanel}
    >
      {/* Panel header — 與 Toolbar 同 ChromeHeader,繼承 page density(2026-06-15:移除 lockDensity,
          修 header(原 px-loose@lg=24)與 body(px-loose@page=16)左緣不對齊 = 圖二 bug;全 surface 同密度)。 */}
      <ChromeHeader className="justify-between">
        <h3 className="text-body-lg font-medium text-foreground">{labels.detailsHeading}</h3>
        {/* InfoPanel close 走 dismiss canonical `<Button iconOnly dismiss />`,對齊 button.spec.md
            「Dismiss 視覺類」+ inline-action.spec.md「Dismiss canonical — X close only」。 */}
        <Button
          iconOnly
          dismiss
          size="sm"
          data-dismiss
          startIcon={XIcon}
          aria-label={labels.detailPanelClose}
          onClick={onClose}
        />
      </ChromeHeader>

      {/* Panel body — header(shrink-0)上常駐 + body 走 ScrollArea(高度小時內容可捲動)。
          padding 對齊 layoutSpace v6 規則 4「bounded region → 容器底(無 action buttons)= loose」。
          gap 對齊 v6 規則 3「跨範疇 parallel = loose」(說明 vs 檔案資訊兩個獨立 functional sections,
          屬「跨範疇 + 不相關」)— 從 gap-4 寫死改為 token-aware loose。 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className={cn(
          'flex flex-col gap-[var(--layout-space-loose)]',
          'px-[var(--layout-space-loose)]',
          'pt-[var(--layout-space-tight)] pb-[var(--layout-space-loose)]',
        )}>
        {/* 說明 — 用 DS Field + FieldLabel + Textarea(2026-04-20 B12 決策:
            FileViewer 一律消費 DS Field 家族,不手刻 `<span>label` + raw control) */}
        <Field>
          <FieldLabel>說明</FieldLabel>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            readOnly={readOnly}
            placeholder={readOnly ? labels.descriptionPlaceholderReadOnly : labels.descriptionPlaceholderEdit}
            rows={5}
          />
        </Field>

        {/* 檔案資訊 — 用 DS DescriptionList horizontal + divided(Google Drive /
            Notion file info panel 模式):
            - section header 用 FieldLabel 同款 typography 保視覺一致
            - DescriptionList direction="horizontal" divided 提供 row 下底線
              對齊格線,key 長度不一也易讀
            - 不再手刻 dl/dt/dd — canonical 由 DS primitive own */}
        {/* heading → first-item gap = item → item gap(Gestalt proximity,見 description-list.spec.md) */}
        <div className="flex flex-col gap-[var(--layout-space-tight)]">
          <span className="text-body font-normal text-foreground">{labels.fileInfoHeading}</span>
          <DescriptionList direction="horizontal" divided>
            <DescriptionItem label="檔名">{file.name}</DescriptionItem>
            <DescriptionItem label="類型">{file.mimeType || '—'}</DescriptionItem>
            {sizeText && (
              <DescriptionItem label="大小">
                <span className="tabular-nums">{sizeText}</span>
              </DescriptionItem>
            )}
            {file.metadata &&
              Object.entries(file.metadata).map(([k, v]) => (
                <DescriptionItem key={k} label={k}>{String(v)}</DescriptionItem>
              ))}
          </DescriptionList>
        </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

// ─── Filmstrip ────────────────────────────────────────────────────────────────

interface FilmstripProps {
  files: FileInfo[]
  activeIndex: number
  onSelect: (index: number) => void
  labels: Pick<Required<FileViewerLabels>, 'filmstripLabel'>
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const THUMB_SIZE = 64 // px, 固定

const Filmstrip: React.FC<FilmstripProps> = ({ files, activeIndex, onSelect, labels }) => {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
  const scrollByPage = useScrollByPage(scrollRef)
  const maskImage = buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth: 32 })

  // 切換當前檔案時,自動 scroll 讓 active thumb 可見
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const active = el.querySelector<HTMLButtonElement>(`[data-thumb-index="${activeIndex}"]`)
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeIndex, scrollRef])

  return (
    <div
      className={cn(
        // Chrome — bg-surface-raised 同 Toolbar / InfoPanel(token semantic「遮蓋型浮層」)
        'relative shrink-0 h-24 bg-surface-raised border-t border-divider',
        'flex items-center',
        'px-[var(--layout-space-loose)]',
      )}
    >
      {canScroll && !atStart && (
        <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />
      )}
      <div
        ref={scrollRef}
        className={cn(
          'flex items-center',
          // 刻意隱藏 native scrollbar + 用 fade-mask(horizontal-overflow pattern)
          'scrollbar-none overflow-x-auto overflow-y-hidden h-full py-2',
          'w-full',
        )}
        style={{
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      >
        {/* 內層 wrapper:mx-auto 讓 thumbs 在少量時水平置中,多量溢出時 mx-auto = 0 自然轉 scroll。
            gap-[var(--layout-space-tight)] 走 DS density-aware token(不用 raw gap-1)——
            世界級 idiom:Google Drive / Dropbox / Notion file preview 的 filmstrip 都是
            少量置中 / 多量靠 start scroll。
            ARIA role="group"(非 tablist):filmstrip 是「選圖導航」不是「切換 N 個 tabpanel」——
            lightbox 縮圖膠卷只有單一 viewport,不符 W3C tabs pattern(tab MUST 對應自己的 tabpanel + roving tabindex)。
            對齊 APG grouped-carousel + PhotoSwipe / codeaccessible.com lightbox 共識:group + button + aria-current。 */}
        <div
          role="group"
          aria-label={labels.filmstripLabel}
          className="flex items-center gap-[var(--layout-space-tight)] mx-auto shrink-0"
        >
        {files.map((file, i) => {
          const active = i === activeIndex
          const isImage = canRenderImage(file)
          const ext = file.name.split('.').pop()?.toUpperCase() ?? '檔'
          return (
            <button
              key={file.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              aria-label={`${i + 1} / ${files.length}:${file.name}`}
              data-thumb-index={i}
              onClick={() => onSelect(i)}
              className={cn(
                'shrink-0 rounded-md bg-muted overflow-hidden',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'transition-shadow duration-150',
                active
                  ? 'ring-2 ring-primary'
                  : 'ring-1 ring-border hover:ring-border-hover',
              )}
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            >
              <AspectRatio ratio={1} className="w-full h-full">
                {isImage ? (
                  <img
                    src={file.url}
                    alt=""
                    aria-hidden
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-0.5">
                    <FileText size={20} className="text-fg-muted" aria-hidden />
                    <span className="text-footnote text-fg-muted font-medium">{ext}</span>
                  </div>
                )}
              </AspectRatio>
            </button>
          )
        })}
        </div>
      </div>
      {canScroll && !atEnd && (
        <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />
      )}
    </div>
  )
}

// ─── FileViewer (shell) ───────────────────────────────────────────────────────

/**
 * i18n-able labels for FileViewer chrome / controls.
 * All keys are optional — defaults are CJK (see `DEFAULT_LABELS`).
 * Consumer typically spreads partial override:
 *   `<FileViewer labels={{ close: 'Close', download: 'Download' }} />`
 */
// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export interface FileViewerLabels {
  /** Zoom input ARIA label */
  zoomInput?: string
  /** Zoom menu trigger ARIA label */
  zoomMenu?: string
  /** Info panel toggle button — shown when panel is OPEN */
  infoToggleCollapse?: string
  /** Info panel toggle button — shown when panel is CLOSED */
  infoToggleExpand?: string
  /** Download button ARIA label */
  download?: string
  /** Close viewer button ARIA label */
  close?: string
  /** InfoPanel outer aside ARIA label */
  detailPanel?: string
  /** InfoPanel heading text */
  detailsHeading?: string
  /** InfoPanel close button ARIA label */
  detailPanelClose?: string
  /** Description textarea placeholder (readOnly) */
  descriptionPlaceholderReadOnly?: string
  /** Description textarea placeholder (editable) */
  descriptionPlaceholderEdit?: string
  /** Detail section — file info section heading */
  fileInfoHeading?: string
  /** Filmstrip group ARIA label（role="group" + thumb button + aria-current,非 tablist）*/
  filmstripLabel?: string
  /** Previous-file nav button ARIA label */
  previousFile?: string
  /** Next-file nav button ARIA label */
  nextFile?: string
}

// i18n-allow: DS defaults;consumer override via `labels` prop
const DEFAULT_LABELS: Required<FileViewerLabels> = {
  zoomInput: '縮放比例',
  zoomMenu: '開啟縮放選單',
  infoToggleCollapse: '收合詳細資訊面板',
  infoToggleExpand: '展開詳細資訊面板',
  download: '下載檔案',
  close: '關閉檢視器',
  detailPanel: '檔案詳細資訊',
  detailsHeading: '詳細資訊',
  detailPanelClose: '關閉詳細資訊',
  descriptionPlaceholderReadOnly: '尚無說明',
  descriptionPlaceholderEdit: '為這個檔案加上說明…',
  fileInfoHeading: '檔案資訊',
  filmstripLabel: '檔案佇列',
  previousFile: '上一個檔案',
  nextFile: '下一個檔案',
}

export interface FileViewerProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    'onOpenChange'
  > {
  files: FileInfo[]
  initialIndex?: number
  /** Controlled open state。與 `defaultOpen` 二擇一。 */
  open?: boolean
  /** Uncontrolled open 預設(2026-04-25 加,對齊 Dialog/Sheet/Popover dual-mode canonical)。 */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** 當前索引(controlled);consumer 想自己控制 active file 時傳。不傳則 shell 管理。 */
  index?: number
  onIndexChange?: (index: number) => void
  /** 當前檔案 description 變化。consumer 負責持久化。readOnly 為 true 時不觸發。 */
  onDescriptionChange?: (fileId: string, description: string) => void
  /** true → InfoPanel 的 description textarea 為 readOnly。預設 false。 */
  readOnly?: boolean
  /** 顯示底部 filmstrip。預設 false;files.length < 2 時自動隱藏。 */
  showFilmstrip?: boolean
  /** 是否提供 download 按鈕。預設 true。 */
  allowDownload?: boolean
  /** 自訂 download 行為;未傳則用 anchor download attribute。 */
  onDownload?: (file: FileInfo) => void
  /** i18n labels override. Partial — merged with DS defaults. */
  labels?: FileViewerLabels
}

const FileViewer = React.forwardRef<HTMLDivElement, FileViewerProps>(function FileViewer({
  files,
  initialIndex = 0,
  open: openProp,
  defaultOpen,
  onOpenChange,
  index: indexProp,
  onIndexChange,
  onDescriptionChange,
  readOnly = false,
  showFilmstrip = false,
  allowDownload = true,
  onDownload,
  labels: labelsOverride,
  ...props
}, ref) {
  const labels = React.useMemo(
    () => ({ ...DEFAULT_LABELS, ...labelsOverride }) satisfies Required<FileViewerLabels>,
    [labelsOverride],
  )
  // Open:受控/非受控雙模式鏡像(消費 DS useControllable;select-menu.tsx 2026-06-11 同修先例)。
  // 原本 keyboard shortcuts effect 與 index-reset effect 直接讀 `open` prop ——
  // uncontrolled(defaultOpen)場景 open === undefined,兩 effect 永遠不啟動(快捷鍵全失效
  // + 重開不重置 index),Toolbar X / backdrop click 的 onOpenChange?.(false) 也是 no-op。
  // 鏡像後 effect / close 都走 mirror:controlled 時純 passthrough,
  // uncontrolled 時 internal state 為準 + onOpenChange 僅通知。
  const [open, setOpen] = useControllable<boolean>({
    value: openProp,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  })

  // Index:uncontrolled fallback
  const [internalIndex, setInternalIndex] = React.useState(initialIndex)
  const activeIndex = indexProp ?? internalIndex

  const setIndex = React.useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(files.length - 1, next))
      if (indexProp === undefined) setInternalIndex(clamped)
      onIndexChange?.(clamped)
    },
    [files.length, indexProp, onIndexChange],
  )

  // 開啟時若 uncontrolled,重置為 initialIndex
  React.useEffect(() => {
    if (open && indexProp === undefined) {
      setInternalIndex(Math.max(0, Math.min(files.length - 1, initialIndex)))
    }
  }, [open, initialIndex, files.length, indexProp])

  // Info panel open state(shell own)
  const [infoOpen, setInfoOpen] = React.useState(false)

  // Zoom state(shell own,renderer 消費 + 回報)
  const [zoom, setZoom] = React.useState(100)
  // 切換檔案時不再 setZoom(100)— 把「下一張該怎麼初始化 zoom」的決定權交給 renderer:
  //   image-renderer 自己 watch file.url change → reset loaded → onLoad → 重 fit-page。
  //   原本 setZoom(100) 在 cache 命中(onLoad 沒 fire)時會卡 100% 不 fit(user 抓的 bug)。

  // Fit request(shell → renderer 指令;nonce 遞增讓重複同 fit 也觸發 renderer)
  const [fitRequest, setFitRequest] = React.useState<{ fit: ZoomFit; nonce: number } | null>(null)

  // Renderer capabilities(mount 時 renderer emit)
  const [capabilities, setCapabilities] = React.useState<FileRendererCapabilities>({
    zoom: false,
  })

  const file = files[activeIndex]
  const Renderer = file ? resolveRenderer(file) : null

  // Fit-to-* 下指令給 renderer,renderer 算 container/image 比例後透過 onZoomChange 回報
  const handleFit = React.useCallback((fit: ZoomFit) => {
    setFitRequest((prev) => ({ fit, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  // Download handler
  const handleDownload = React.useCallback(() => {
    if (!file) return
    if (onDownload) {
      onDownload(file)
      return
    }
    // 預設:anchor download(同源檔案有效;跨域由 consumer 提供 onDownload)
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.name
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [file, onDownload])

  // Keyboard shortcuts(focus 在 input / textarea 時不觸發)
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      if (e.key === 'ArrowLeft' && files.length > 1) {
        e.preventDefault()
        setIndex(activeIndex - 1)
      } else if (e.key === 'ArrowRight' && files.length > 1) {
        e.preventDefault()
        setIndex(activeIndex + 1)
      } else if (e.key === '+' || e.key === '=') {
        if (capabilities.zoom) {
          e.preventDefault()
          setZoom((z) => nextZoomIn(z))
        }
      } else if (e.key === '-') {
        if (capabilities.zoom) {
          e.preventDefault()
          setZoom((z) => nextZoomOut(z))
        }
      } else if (e.key === '0') {
        if (capabilities.zoom) {
          e.preventDefault()
          setZoom(100)
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (capabilities.zoom) {
          e.preventDefault()
          handleFit('fit-page')
        }
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        setInfoOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, activeIndex, files.length, setIndex, capabilities.zoom, handleFit])

  // Arrows idle auto-hide(世界級 lightbox canonical:Google Photos / Dropbox / PhotoSwipe)
  // 滑鼠移入 viewport → 顯示箭頭;持續 2.5 秒無 mouse move → 自動淡出(對齊世界級行為)
  const [armVisible, setArmVisible] = React.useState(false)
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleViewportMouseMove = React.useCallback(() => {
    setArmVisible(true)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setArmVisible(false), 2500)
  }, [])
  const handleViewportMouseLeave = React.useCallback(() => {
    setArmVisible(false)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [])
  React.useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [])

  if (!file || !Renderer) {
    // files 為空或 index 超界 — 不渲染
    return null
  }

  const showFilmstripResolved = showFilmstrip && files.length > 1
  const showArrows = files.length > 1

  // Root 永遠餵 mirror(Radix 視角 controlled);uncontrolled 的 defaultOpen 由
  // useControllable internal state 承載,Radix Esc / dismiss 經 setOpen 同步回 mirror。
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        {/* Overlay — FileViewer 固定深色氛圍,與 Dialog 共用 bg-overlay。
            **data-theme="dark"**(2026-04-30):Overlay 在 Portal 內、是 Content 的 sibling,
            不繼承 Content 內層的 dark 主題 → `--overlay` 默認 resolve 成 light theme α45 黑。
            FileViewer 永遠 dark(line 899 outer),mask 也須 dark token = α65 黑(更深)
            才語意一致。同 DropdownMenuContent Portal 處理(line 245)。 */}
        <DialogPrimitive.Overlay
          data-theme="dark"
          className={cn(
            'fixed inset-0 z-50 bg-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // Edge-to-edge fullscreen,無 inset / 無 radius(與一般 Dialog 差別的所在)
            'fixed inset-0 z-50 outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
          // 避免 Radix 自動把焦點送進 Content 的第一個 tabbable —— 我們要留給 viewport
          onOpenAutoFocus={(e) => e.preventDefault()}
          {...props}
        >
          {/* 鎖 dark subtree。Density 繼承 page(不另設 data-density)。
              header 高度透過 `--chrome-header-height` 自動 density-aware(md=48 / lg=56)。
              ── Q1 mask 透明度(2026-04-30)──
              outer **不**設 bg → Overlay(`bg-overlay` α45/α65)透出 image 周圍區域,
              對齊 Notion / Dropbox / Slack lightbox idiom 跟 Dialog mask 同 token 一致。
              chrome(Toolbar / Filmstrip / InfoPanel)各自 `bg-surface-raised` opaque dark
              (對齊 Apple Photos / Drive lightbox 派 — chrome opaque vs mask 半透明,
              清楚區分 backdrop click 區 vs 互動區)。
              **不**用 bg-surface — dark mode `--surface = white α8` 半透明,outer 透明時
              無 dark backdrop 撐 → 視覺洗白。 */}
          <div
            data-theme="dark"
            className="w-full h-full flex flex-col text-foreground"
          >
            {/* Accessible title — 視覺隱藏但 screen reader 讀得到 */}
            <DialogPrimitive.Title className="sr-only">
              檔案檢視器:{file.name}
            </DialogPrimitive.Title>

            <Toolbar
              file={file}
              capabilities={capabilities}
              zoom={zoom}
              onZoomChange={setZoom}
              onFit={handleFit}
              infoOpen={infoOpen}
              onInfoToggle={() => setInfoOpen((o) => !o)}
              onDownload={handleDownload}
              allowDownload={allowDownload}
              onClose={() => setOpen(false)}
              labels={labels}
            />

            {/* 主區:Viewport + 可選 InfoPanel(右側)
                Arrows visibility = armVisible(state)控制:mouse move 顯示 / 2.5s idle 隱藏 / mouse leave 立即隱藏
                對齊 Google Photos / Dropbox lightbox / PhotoSwipe world-class canonical */}
            <div className="flex-1 min-h-0 flex">
              <div
                className="relative flex-1 min-w-0"
                onMouseMove={handleViewportMouseMove}
                onMouseLeave={handleViewportMouseLeave}
                // Backdrop click-to-close(對齊 Google Drive / Dropbox lightbox / Apple Photos canonical):
                // 點擊 image 周圍的暗色 backdrop 區關閉,跟 modal mask 同 idiom。
                //
                // 為何 geometric check 而非 closest('img')?
                // react-zoom-pan-pinch 的 TransformComponent 是 wrapper div 蓋在 image 之上(absorb
                // pan/zoom events),click target 是該 wrapper div 不是 <img>。closest('img') 檢查
                // ancestor 永遠 false。改 geometric check:看 click 座標是否落在 <img> 視覺 rect 內。
                onClick={(e) => {
                  const t = e.target as HTMLElement
                  // 互動元素(side arrows / chrome buttons 透過冒泡)→ 不關
                  if (t.closest('button, [role="button"]')) return
                  // 點到 image 視覺範圍 → 不關(image 本體 click ≠ close)
                  const img = e.currentTarget.querySelector('img')
                  if (img) {
                    const r = img.getBoundingClientRect()
                    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return
                  }
                  // 否則 = 點到 backdrop(outer 不設 bg,半透明 bg-overlay 透出 — 見 Q1 註解)→ close
                  setOpen(false)
                }}
              >
                {showArrows && activeIndex > 0 && (
                  <div
                    className={cn(
                      'absolute left-[var(--layout-space-loose)] top-1/2 -translate-y-1/2 z-10',
                      'transition-opacity duration-150',
                      // armVisible state 控制,或 focus-within 時 a11y 強制顯示
                      armVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
                      'focus-within:opacity-100 focus-within:pointer-events-auto',
                    )}
                  >
                    <Button
                      variant="text"
                      size="md"
                      iconOnly
                      startIcon={ChevronLeft}
                      aria-label={labels.previousFile}
                      onClick={() => setIndex(activeIndex - 1)}
                    />
                  </div>
                )}
                <div className="w-full h-full">
                  <Renderer.component
                    file={file}
                    zoom={zoom}
                    onZoomChange={setZoom}
                    fitRequest={fitRequest}
                    onCapabilitiesChange={setCapabilities}
                  />
                </div>
                {showArrows && activeIndex < files.length - 1 && (
                  <div
                    className={cn(
                      'absolute right-[var(--layout-space-loose)] top-1/2 -translate-y-1/2 z-10',
                      'transition-opacity duration-150',
                      armVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
                      'focus-within:opacity-100 focus-within:pointer-events-auto',
                    )}
                  >
                    <Button
                      variant="text"
                      size="md"
                      iconOnly
                      startIcon={ChevronRight}
                      aria-label={labels.nextFile}
                      onClick={() => setIndex(activeIndex + 1)}
                    />
                  </div>
                )}
              </div>
              {infoOpen && (
                <InfoPanel
                  file={file}
                  readOnly={readOnly}
                  onDescriptionChange={onDescriptionChange}
                  onClose={() => setInfoOpen(false)}
                  labels={labels}
                />
              )}
            </div>

            {showFilmstripResolved && (
              <Filmstrip
                files={files}
                activeIndex={activeIndex}
                onSelect={setIndex}
                labels={labels}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})
FileViewer.displayName = 'FileViewer'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const fileViewerMeta = {
  component: 'FileViewer',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted', 'bg-overlay', 'bg-surface-raised'],
    fg: ['text-fg-muted', 'text-foreground'],
    ring: ['ring-primary', 'ring-ring'],
  },
} as const

export { FileViewer }
export type { FileInfo, FileRenderer, FileRendererCapabilities, FileRendererProps } from './file-viewer-types'
