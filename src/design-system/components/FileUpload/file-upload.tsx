import * as React from 'react'
import { Upload as UploadIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty } from '@/design-system/components/Empty/empty'

/**
 * FileUpload — 拖放 / 點擊上傳區塊
 *
 * 世界級對照:Ant Design `Upload.Dragger`、Polaris `DropZone`、Material community MUI-File-Input。
 * 與本 DS 既有 FileItem(顯示已上傳檔案)配對 — 這裡 own「上傳觸發 + 拖放偵測」,
 * 上傳後的檔案清單顯示交給 consumer 用 FileItem 渲染。
 *
 * ── 3 狀態 ──
 * idle     (default) — border-dashed border-divider  bg-surface
 * drag-over         — border-dashed border-primary  bg-primary-subtle
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

export interface FileUploadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDrop'> {
  onUpload?: (files: File[]) => void
  onReject?: (files: File[], reason: 'size' | 'type') => void
  multiple?: boolean
  accept?: string
  maxSize?: number
  disabled?: boolean
  /** 標題文字(預設「Click or drag file here to upload」) */
  title?: string
  /** 說明文字(預設「Support for a single or bulk upload」) */
  description?: string
  /** 若傳入 children,覆寫預設 Empty 結構 */
  children?: React.ReactNode
}

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      onUpload,
      onReject,
      multiple = false,
      accept,
      maxSize,
      disabled = false,
      title = 'Click or drag file here to upload',
      description = multiple ? 'Support for a single or bulk upload' : 'Support for a single file upload',
      children,
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

    const state = disabled ? 'disabled' : isDragOver ? 'drag-over' : 'idle'

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        data-state={state}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragOver(false)
        }}
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
        }}
        onDrop={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragOver(false)
          filterAndDispatch(e.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 text-center',
          'rounded-md border-2 border-dashed px-6 py-10',
          'cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // idle
          'border-divider bg-surface hover:bg-neutral-hover',
          // drag-over
          'data-[state=drag-over]:border-primary data-[state=drag-over]:bg-primary-subtle data-[state=drag-over]:hover:bg-primary-subtle',
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
        {children ?? (
          <Empty
            icon={UploadIcon}
            title={title}
            description={description}
          />
        )}
      </div>
    )
  },
)
FileUpload.displayName = 'FileUpload'

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

export { FileUpload }
