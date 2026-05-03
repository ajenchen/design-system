// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Upload as UploadIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty } from '@/design-system/components/Empty/empty'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { FileItem } from '@/design-system/components/FileItem/file-item'
import { Button } from '@/design-system/components/Button/button'

/**
 * FileUpload — 拖放 / 點擊上傳區塊
 *
 * 世界級對照:Ant Design `Upload.Dragger`、Polaris `DropZone`、Material community MUI-File-Input。
 * 與本 DS 既有 FileItem(顯示已上傳檔案)配對 — 這裡 own「上傳觸發 + 拖放偵測」,
 * 上傳後的檔案清單顯示交給 consumer 用 FileItem 渲染。
 *
 * ── 4 狀態 ──
 * idle     (default) — border-dashed border-divider  bg-surface
 * drag-over         — border-dashed border-primary  bg-primary-subtle
 * loading           — 上傳中(async)顯示 CircularProgress,阻擋新互動
 * disabled          — opacity-disabled pointer-events-none
 *
 * ── children 插槽 ──
 * 預設渲染 `<Empty icon={Upload} title description />` — 重用 Empty 元件 own
 * 的「icon + title + description 垂直居中」SSOT 避免視覺漂移。Empty 改字體 /
 * gap / icon 尺寸時 FileUpload 自動跟進。若 consumer 傳 children 則整個覆寫。
 *
 * ── API ──
 * onUpload: 使用者選取或拖放檔案時觸發,回傳 File[](至少 1 個)。
 * multiple: 允許多檔。預設 false(單檔)。
 * accept:   MIME filter(例 "image/*,.pdf"),傳給 <input type=file>。
 * maxSize:  單檔最大 bytes;超過靜默忽略(consumer 若需要錯誤提示,走 onReject)。
 * onReject: 被 maxSize / accept 擋下的檔案(提供錯誤訊息顯示機會)。
 */

/**
 * Uploaded / uploading file status item(for `files` prop)。
 * Consumer 持 state(progress / status),FileUpload 只負責渲染。
 */
export interface FileUploadStatus {
  id: string
  name: string
  /** bytes */
  size?: number
  /** Upload 進度(0-100)— uploading 時顯示 progress bar */
  progress?: number
  status?: 'uploading' | 'completed' | 'error'
  /** Error 訊息 / size 等 description */
  description?: React.ReactNode
  /** Thumbnail URL for rich mode */
  thumbnailSrc?: string
}

export interface FileUploadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDrop'> {
  onUpload?: (files: File[]) => void
  onReject?: (files: File[], reason: 'size' | 'type') => void
  multiple?: boolean
  accept?: string
  maxSize?: number
  disabled?: boolean
  /**
   * Loading 狀態(async 上傳 / 伺服器處理中)。
   * - 顯示 CircularProgress 取代預設 Empty 內容
   * - 阻擋新點擊 / drag 事件(避免 double-submit)
   * - 宣告 `aria-busy="true"` 讓 screen reader 感知處理中
   * - Consumer 負責在上傳完成後自己切回 `loading={false}`
   */
  loading?: boolean
  /** Loading 狀態的文字標題(預設「上傳中…」) */
  loadingTitle?: string
  /** 標題文字(預設「Click or drag file here to upload」) */
  title?: string
  /** 說明文字(預設「Support for a single or bulk upload」) */
  description?: string
  /** 若傳入 children,覆寫預設 Empty 結構 */
  children?: React.ReactNode
  /**
   * Uploaded / uploading 檔案清單。傳入 → FileUpload 在 drop zone 下方渲染列表。
   * 不傳 → 不顯示(consumer 可自行用 FileItem 組成,pre-2026-04-24 行為)。
   * 每項有 status 狀態會對應 icon:
   *   - `uploading`:CircularProgress(+ progress bar 若 progress 給)
   *   - `completed`:綠色 ✓(success 狀態視覺確認)
   *   - `error`:紅色 ✗(+ description 顯示錯誤訊息)
   */
  files?: FileUploadStatus[]
  /** File list 每項顯示模式。Default: 'compact'(單行);'rich' = 含 thumbnail / size / progress bar */
  fileListMode?: 'compact' | 'rich'
  /** File list 移除 callback。有值 → 每項右側顯示 X dismiss button;無 → 不可移除(view-only) */
  onRemove?: (id: string) => void
  /** File list dismiss button ARIA label template。預設 `移除 {name}`。For i18n. */
  removeAriaLabel?: (name: string) => string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      onUpload,
      onReject,
      multiple = false,
      accept,
      maxSize,
      disabled = false,
      loading = false,
      loadingTitle = '上傳中…', // i18n-allow: DS default; consumer override via loadingTitle prop
      title = 'Click or drag file here to upload', // i18n-allow: DS default; consumer override via title prop
      description = multiple ? 'Support for a single or bulk upload' : 'Support for a single file upload', // i18n-allow: DS default; consumer override via description prop
      children,
      files,
      fileListMode = 'compact',
      onRemove,
      removeAriaLabel = (name: string) => `移除 ${name}`, // i18n-allow: DS default; consumer override via removeAriaLabel prop
      className,
      onClick,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [isDragOver, setDragOver] = React.useState(false)

    const filterAndDispatch = (files: FileList | null) => {
      if (!files || files.length === 0) return
      const accepted: File[] = []
      const rejectedBySize: File[] = []
      const rejectedByType: File[] = []

      Array.from(files).forEach((f) => {
        if (maxSize != null && f.size > maxSize) {
          rejectedBySize.push(f)
          return
        }
        if (accept && !matchAccept(f, accept)) {
          rejectedByType.push(f)
          return
        }
        accepted.push(f)
      })

      if (rejectedBySize.length) onReject?.(rejectedBySize, 'size')
      if (rejectedByType.length) onReject?.(rejectedByType, 'type')
      if (accepted.length) onUpload?.(multiple ? accepted : accepted.slice(0, 1))
    }

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!disabled) inputRef.current?.click()
      onClick?.(e)
    }

    // State 優先序:disabled > loading > drag-over > idle(disabled 最硬,loading 次之)
    const state = disabled ? 'disabled' : loading ? 'loading' : isDragOver ? 'drag-over' : 'idle'
    const isBlocked = disabled || loading

    const hasFiles = Array.isArray(files) && files.length > 0

    const fileListNode = hasFiles ? (
      <ul
        className={cn(
          // stack vertically with consistent gap;bg-surface 在容器外的 chrome / consumer bg 之上
          'flex flex-col gap-2 w-full',
          'mt-3',
        )}
        aria-label="Uploaded files"
      >
        {files!.map((f) => (
          <li key={f.id} className="list-none">
            <FileItem
              mode={fileListMode}
              name={f.name}
              status={f.status}
              progress={f.progress}
              description={f.description ?? (f.size != null ? formatBytes(f.size) : undefined)}
              thumbnailSrc={f.thumbnailSrc}
              actions={
                onRemove ? (
                  // Collection remove(per-file)— 不是 dismiss surface,故不套 `dismiss` prop。
                  // 視覺與 dismiss 一致(text variant + fg-muted dim)— 對齊 inline-action.spec.md
                  // 「Dismiss canonical — X close only」L249-251:onRemove callback 不觸發 dismiss prop。
                  <Button
                    iconOnly
                    variant="text"
                    size="xs"
                    startIcon={X}
                    aria-label={removeAriaLabel(f.name)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(f.id)
                    }}
                    className="text-fg-muted hover:text-foreground"
                  />
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    ) : null

    return (
      <div ref={ref} className={cn('w-full', hasFiles && 'flex flex-col')}>
      <div
        role="button"
        tabIndex={isBlocked ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-busy={loading || undefined}
        data-state={state}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (isBlocked) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          if (isBlocked) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (isBlocked) return
          e.preventDefault()
          setDragOver(false)
        }}
        onDragOver={(e) => {
          if (isBlocked) return
          e.preventDefault()
        }}
        onDrop={(e) => {
          if (isBlocked) return
          e.preventDefault()
          setDragOver(false)
          filterAndDispatch(e.dataTransfer.files)
        }}
        className={cn(
          // 寬度 w-full 填滿 consumer 容器(user 明示「寬度填滿」);高度由 padding + 內容物決定(不固定 h)
          'flex flex-col items-center justify-center gap-2 text-center w-full',
          // 對稱 padding p-[var(--layout-space-loose)]:四邊等距,density-aware(md=24px / lg=32px),對齊 DS chrome padding canonical。
          // 不再硬寫 px-6 py-10(不對稱+非 token)。內容物(icon + title + description)垂直堆疊由 gap-2 控制
          'rounded-md border-2 border-dashed p-[var(--layout-space-loose)]',
          'cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // idle
          'border-divider bg-surface hover:bg-neutral-hover',
          // drag-over
          'data-[state=drag-over]:border-primary data-[state=drag-over]:bg-primary-subtle data-[state=drag-over]:hover:bg-primary-subtle',
          // loading(阻擋新互動但不 opacity-disabled — 避免跟 disabled 視覺撞,保持「處理中」語意)
          'data-[state=loading]:cursor-progress data-[state=loading]:pointer-events-none',
          // disabled
          'data-[state=disabled]:opacity-disabled data-[state=disabled]:pointer-events-none data-[state=disabled]:cursor-not-allowed',
          className,
        )}
        {...props}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={accept}
          disabled={disabled}
          onChange={(e) => filterAndDispatch(e.target.files)}
        />
        {loading ? (
          <Empty
            icon={<CircularProgress size={48} />}
            title={loadingTitle}
          />
        ) : (
          children ?? (
            <Empty
              icon={UploadIcon}
              title={title}
              description={description}
            />
          )
        )}
      </div>
      {fileListNode}
      </div>
    )
  },
)
FileUpload.displayName = 'FileUpload'

// ── helper: bytes formatter ───────────────────────────────────────────────
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ── helpers ─────────────────────────────────────────────────────────────────

function matchAccept(file: File, accept: string): boolean {
  const patterns = accept.split(',').map((s) => s.trim().toLowerCase())
  const fileName = file.name.toLowerCase()
  const fileType = file.type.toLowerCase()
  return patterns.some((p) => {
    if (p.startsWith('.')) return fileName.endsWith(p) // 副檔名 e.g. ".pdf"
    if (p.endsWith('/*')) return fileType.startsWith(p.slice(0, -1)) // e.g. "image/*"
    return fileType === p // 完整 MIME
  })
}

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const fileUploadMeta = {
  component: 'FileUpload',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-primary-subtle', 'bg-surface'],
    fg: [],
    ring: ['ring-ring'],
  },
} as const

export { FileUpload }
