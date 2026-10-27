// FileItem 三層範例(展示 / 設計原則 / 設計規格)共用的「點了會有反應」的檔案動作與上傳管理器面板。
// 底線開頭 = 不進套件出口(gen-design-system-barrel 略過 `_` 開頭檔,同 AppShell/_demo-helpers.tsx)。
//
// 為什麼有這支(2026-10-28):三層的刪除 / 下載 / 重試 / 收合 / 點列原本全接空函式,點了沒有任何反應
// (user 2026-09-08「一堆按鈕都無法正常反應」〔UD-A16〕)。行為只用 FileItem 規格寫過的:
// - 刪除 = 那一列拿掉;重試 = 回到上傳中、跑完變完成;下載 = 跳一則通知(Toast);
// - 點已上傳 / 已完成的列 = 用 FileViewer 開(file-item.spec.md「`surface="upload-manager"`」表的 Row-click 列);
// - 錯誤說明裡的「View log」= 開上傳紀錄(連結長相照 file-item.spec.md「Description ReactNode 可含 clickable 元素」)。
// 進度只在按下「重試」之後才開始跑:靜止畫面沒有任何計時器,截圖每次相同。
// 用到通知的 story 自己掛 <Toaster />(toast.spec.md:每個獨立 story root 一個)。
import * as React from 'react'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'
import { FileViewer } from '@/design-system/components/FileViewer/file-viewer'
import type { FileInfo } from '@/design-system/components/FileViewer/file-viewer-types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/design-system/components/Dialog/dialog'
import { toast } from '@/design-system/components/Toast/toast'
import { SurfaceHeader, SurfaceBody, COMPACT_HEADER_SLOT } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle } from '@/design-system/components/Popover/popover'

export type DemoFileStatus = 'uploading' | 'completed' | 'error'

export interface DemoFile {
  id: string
  name: string
  mimeType: string
  /** 不傳 = 已上傳的靜態附件(無進度條、無狀態圖示) */
  status?: DemoFileStatus
  progress?: number
  /** 檔案大小(完成 / 靜態時當說明顯示;上傳中顯示 uploadingText) */
  size: string
  /** 上傳中的說明,例「5.7 MB of 7.5 MB」;沒給就顯示「上傳中 N%」 */
  uploadingText?: string
  /** 完成 / 靜態時的說明;沒給就顯示 size */
  description?: string
  /** 錯誤說明(後面接「View log」) */
  errorText?: string
  /** false = 錯誤說明後面不接「View log」 */
  errorLog?: boolean
  thumbnailSrc?: string
  /** FileViewer 預覽來源;沒給就用 thumbnailSrc(FileViewer 對不能預覽的類型有自己的退回畫面) */
  url?: string
}

/** 錯誤說明裡的「View log」:點了開這個檔案的上傳紀錄(Dialog,按 × / Esc / 點外面關) */
function ErrorWithLog({ text, file }: { text: string; file: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      {text}{' '}
      {/* 長相照 user 2026-09-26 選的乙案:紅字加底線、滑過不變(file-item.spec.md「Description ReactNode 可含 clickable 元素」) */}
      <a href="#" className="underline" onClick={(e) => { e.preventDefault(); setOpen(true) }}>
        View log
      </a>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent height="hug">
          <DialogHeader>
            <DialogTitle>上傳紀錄 · {file}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-body text-foreground">伺服器 30 秒內沒有回應(408 Request Timeout),上傳已停止。按列上的重試可以從頭再傳一次。</p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 重試後每一格進度的間隔與步幅(只在按下重試之後才跑) */
const RETRY_TICK_MS = 300
const RETRY_STEP = 25

/**
 * 一份可以真的操作的檔案清單。回傳 `itemProps(f)` = 一列 FileItem 需要的 props(說明、狀態圖示的滑過替換、
 * 點列開檔、列尾刪除鈕),`viewer` = 點列開出來的 FileViewer(放在 story 裡任何位置)。
 * `clickable: false` = 這幾列不傳 onClick(示範「點列本身沒反應的列不上滑過底色」)。
 */
export function useFileDemo(initial: readonly DemoFile[], { clickable = true }: { clickable?: boolean } = {}) {
  const [files, setFiles] = React.useState<DemoFile[]>(() => [...initial])
  const timers = React.useRef(new Map<string, number>())
  React.useEffect(() => () => { timers.current.forEach((t) => window.clearInterval(t)) }, [])

  const remove = React.useCallback((id: string) => {
    window.clearInterval(timers.current.get(id))
    setFiles((fs) => fs.filter((f) => f.id !== id))
  }, [])
  const retry = React.useCallback((id: string) => {
    window.clearInterval(timers.current.get(id))
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'uploading', progress: 0, uploadingText: undefined } : f)))
    timers.current.set(id, window.setInterval(() => {
      setFiles((fs) => fs.map((f) => {
        if (f.id !== id || f.status !== 'uploading') return f
        const progress = Math.min(100, (f.progress ?? 0) + RETRY_STEP)
        if (progress < 100) return { ...f, progress }
        window.clearInterval(timers.current.get(id))
        return { ...f, status: 'completed', progress: undefined }
      }))
    }, RETRY_TICK_MS))
  }, [])
  const download = React.useCallback((f: DemoFile) => { toast({ title: `已開始下載 ${f.name}` }) }, [])

  const openable = files.filter((f) => f.status === undefined || f.status === 'completed')
  const [viewing, setViewing] = React.useState<number | null>(null)
  const open = (id: string) => setViewing(openable.findIndex((o) => o.id === id))
  const viewerFiles: FileInfo[] = openable.map((f) => ({ id: f.id, name: f.name, url: f.url ?? f.thumbnailSrc ?? '', mimeType: f.mimeType, description: f.size }))
  const viewer = (
    <FileViewer files={viewerFiles} open={viewing !== null} onOpenChange={(o) => { if (!o) setViewing(null) }} index={viewing ?? 0} onIndexChange={setViewing} />
  )

  const itemProps = (f: DemoFile) => ({
    name: f.name,
    status: f.status,
    progress: f.status === 'uploading' || f.status === 'error' ? (f.progress ?? 0) : undefined,
    thumbnailSrc: f.thumbnailSrc,
    description:
      f.status === 'uploading' ? (f.uploadingText ?? `上傳中 ${f.progress ?? 0}%`)
        : f.status === 'error'
          ? (f.errorLog === false ? (f.errorText ?? 'There’s something wrong.') : <ErrorWithLog text={f.errorText ?? 'There’s something wrong.'} file={f.name} />)
          : (f.description ?? f.size),
    onDownload: f.status === 'completed' ? () => download(f) : undefined,
    onRetry: f.status === 'error' ? () => retry(f.id) : undefined,
    onClick: clickable && (f.status === undefined || f.status === 'completed')
      ? () => open(f.id)
      : undefined,
    // 列內操作的讀屏名稱帶檔名(file-item.anatomy.stories.tsx「無障礙與鍵盤」:只寫「刪除」分不出是哪一列)
    actions: <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label={`刪除 ${f.name}`} onClick={() => remove(f.id)} />,
  })

  return { files, itemProps, viewer, open, remove, retry, download }
}

/** 全部成功後,面板自己收起前停留的時間(5 秒;file-item.spec.md upload-manager「全部成功」那一列〔UD-U1021-17〕) */
export const UPLOAD_MANAGER_DISMISS_MS = 5000

/**
 * 上傳管理器面板(file-item.spec.md「upload-manager 浮層面板 composition」)。
 * - 標頭只有收合鈕:傳輸中只能收合,沒有 ×(file-item.spec.md「upload-manager 浮層面板 composition」第一點);收合 = 把清單收起來,只留標頭。
 * - 全部成功 → 5 秒後整個面板收起;滑鼠在面板上或鍵盤焦點在面板裡時暫停,離開重新計時。
 * - 有失敗的檔案就不收起;收合著時出現新的失敗,自動展開讓使用者看到(同上那一列)。
 * - 清單刪到一列都不剩,面板就沒有東西可管理,直接收起。
 */
export function UploadManagerPanel({
  mode,
  title,
  files: initial,
  hoverTargetId,
}: {
  mode: 'rich' | 'compact'
  title: string
  files: readonly DemoFile[]
  /** 視覺稽核滑過截圖要滑的那一列(data-visual-hover-target) */
  hoverTargetId?: string
}) {
  const demo = useFileDemo(initial)
  const [expanded, setExpanded] = React.useState(true)
  const [dismissed, setDismissed] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const [focusWithin, setFocusWithin] = React.useState(false)

  const failed = demo.files.filter((f) => f.status === 'error').length
  const allDone = demo.files.length > 0 && demo.files.every((f) => f.status === 'completed')

  // 收合著時出現新的失敗 → 自動展開(只看「變多」,使用者自己收起時不會被立刻彈開)
  const prevFailed = React.useRef(failed)
  React.useEffect(() => {
    if (failed > prevFailed.current) setExpanded(true)
    prevFailed.current = failed
  }, [failed])

  // 全部成功才倒數;滑過 / 聚焦期間不倒數,離開後重新從 5 秒算
  React.useEffect(() => {
    if (!allDone || hovered || focusWithin) return
    const t = window.setTimeout(() => setDismissed(true), UPLOAD_MANAGER_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [allDone, hovered, focusWithin])

  if (dismissed || demo.files.length === 0) return demo.viewer
  return (
    <>
      <div
        data-upload-manager
        className="max-w-md flex flex-col rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)]"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false) }}
      >
        {/* header 消費 overlay-surface SurfaceHeader + PopoverTitle(輕量浮層 chrome SSOT,非手刻) */}
        <SurfaceHeader className={`justify-between ${COMPACT_HEADER_SLOT}`}>
          <div className="flex-1 min-w-0"><PopoverTitle>{title}</PopoverTitle></div>
          <Button
            iconOnly
            variant="text"
            size="sm"
            startIcon={expanded ? ChevronDown : ChevronUp}
            aria-label={expanded ? '收合' : '展開'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          />
        </SurfaceHeader>
        {/* body 消費 overlay-surface SurfaceBody:左右 0、上下 tight/2、列間 0(列自己帶 gutter 與另一半上下,見 file-item.spec.md) */}
        {expanded && (
          <SurfaceBody className="flex flex-col gap-0 !px-0 !py-[calc(var(--layout-space-tight)/2)]">
            {demo.files.map((f) => (
              <FileItem key={f.id} mode={mode} surface="upload-manager" {...demo.itemProps(f)}
                {...(f.id === hoverTargetId ? { 'data-visual-hover-target': true } : {})} />
            ))}
          </SurfaceBody>
        )}
      </div>
      {demo.viewer}
    </>
  )
}
