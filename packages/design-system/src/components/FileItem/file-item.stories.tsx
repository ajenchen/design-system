// @story-trait-rationale: hasInteractiveStates 由 anatomy.stories.tsx StateBehavior auto-compile owns(2026-05-15 F-migration);Default scenario 由 Rich / Compact / HoverSwap 等真實上傳情境 story 覆蓋,Disabled state 由 status="error" / "uploading" 真實 state 體現。
import * as React from 'react'
import type { Meta } from '@storybook/react'
import { Trash2 } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'
import { FileViewer, type FileInfo } from '@/design-system/components/FileViewer/file-viewer'

// 錯誤 description 範例(含 clickable "View log"):consumer 自由 ReactNode,通常用底線 link 表 clickable
const errorDescWithLog = (
  <>
    There&rsquo;s something wrong.{' '}
    <a href="#" className="underline hover:text-error-hover" onClick={(e) => e.preventDefault()}>
      View log
    </a>
  </>
)

const meta: Meta<typeof FileItem> = {
  title: 'Design System/Components/FileItem/展示',
  component: FileItem,
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// FileItem row dedicated action(2026-04-23 統一 canonical):
// **Row action 絕對值 cap = ≤ 24px,不隨 row tier 放大**。rich + compact 統一用
// Button size="xs" iconOnly variant="text"(24 固定,≤ cap):
// compact row 透過 FileItem 內部 suffix wrapper `[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]`
// trick 讓 Button(24)layout footprint 收斂到 1lh(~18px)不撐高 row,觸控範圍仍 24。
// Trash/Delete 非 dismiss 語意(dismiss 嚴格 = X close overlay),不套 `dismiss` prop——
// Button variant="text" 本來就 fg-muted,視覺已弱化(兩 mode 同)。
// 詳 item-anatomy.spec.md「Predicate」+「Row action 絕對值 cap」
const deleteBtn = <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除" onClick={noop} />
const deleteBtnXs = deleteBtn

export const Rich = {
  name: '豐富樣式',
  render: () => (
    // Type A upload manager:所有 item 都有 status + progress bar(含 completed 100%)
    // 也可傳 onClick/onDownload 讓整 row 點開(預設 FileViewer,consumer 決定)
    // Rich 永遠 border card → list wrapper `gap-2` 防邊框相黏
    <div className="flex flex-col gap-2 max-w-md">
      <FileItem mode="rich" name="Alan Profile.png" status="uploading" progress={40}
        description="5.7 MB of 7.5MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
      <FileItem mode="rich" name="Alan Profile.png" status="completed"
        description="5.7 MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan"
        onClick={noop} onDownload={noop} actions={deleteBtn} />
      <FileItem mode="rich" name="Alan Profile.png" status="error" progress={65}
        description={errorDescWithLog} thumbnailSrc="https://i.pravatar.cc/80?u=alan"
        onRetry={noop} actions={deleteBtn} />
    </div>
  ),
}

export const Compact = {
  name: '緊湊樣式',
  render: () => (
    // Compact + status(永遠有 progress bar)= Type A upload manager
    // list wrapper `gap-1`(4px)簡化 canonical — compact list 統一 gap-1,不論純/混合(2026-04-23)
    <div className="flex flex-col gap-1 max-w-md">
      <FileItem mode="compact" name="UXP T-Phone.csv" status="uploading" progress={60} actions={deleteBtnXs} />
      <FileItem mode="compact" name="UXP T-Phone.csv" status="error" description={errorDescWithLog} actions={deleteBtnXs} />
      <FileItem mode="compact" name="UXP T-Phone.csv" status="completed"
        onClick={noop} onDownload={noop} actions={deleteBtnXs} />
    </div>
  ),
}

export const HoverSwap = {
  name: 'Hover 替換',
  render: () => (
    <div className="flex flex-col max-w-md gap-4">
      <div>
        <div className="text-caption text-fg-muted mb-2">
          ↓ 游標移入任一 row:completed 綠 ✓ 變 Download ↓,error 紅 ✗ 變 Retry ⟲
        </div>
        {/* Rich border card list:無外框 + `gap-2`(item-anatomy「連續 item 貼邊合法性」) */}
        <div className="flex flex-col gap-2">
          <FileItem mode="rich" name="Q1 營收報表.xlsx" status="completed"
            description="Uploaded to URL" thumbnailSrc="https://i.pravatar.cc/80?u=xls"
            onDownload={noop} actions={deleteBtn} />
          <FileItem mode="rich" name="合約草案 v3.pdf" status="error"
            description="There's something wrong. View log"
            thumbnailSrc="https://i.pravatar.cc/80?u=pdf"
            onRetry={noop} actions={deleteBtn} />
        </div>
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-2">
          同樣 pattern 在 compact mode:status slot 幾何與 delete action 一致(兩 mode 統一 Button xs 24),center 自動對齊
        </div>
        {/* Compact list 統一 gap-1(canonical 簡化) */}
        <div className="flex flex-col gap-1">
          <FileItem mode="compact" name="data-2024-q1.csv" status="completed"
            onDownload={noop} actions={deleteBtnXs} />
          <FileItem mode="compact" name="backup-failed.json" status="error"
            description={<>Network timeout. <a href="#" className="underline hover:text-error-hover" onClick={(e) => e.preventDefault()}>View log</a></>}
            onRetry={noop} actions={deleteBtnXs} />
        </div>
      </div>
    </div>
  ),
}

// ── FileViewer 真實整合 —— Clickable story 用 ──
// onClick 打開 FileViewer,預設用 picsum 圖片模擬 preview(real-world consumer
// 會用實際檔案 blob url / CDN url)。
const attachmentFiles: FileInfo[] = [
  {
    id: 'attach-1',
    url: 'https://picsum.photos/seed/report-pdf/1200/800',
    name: '報告.pdf',
    mimeType: 'application/pdf',
    size: 2_400_000,
    description: '2.3 MB',
  },
  {
    id: 'attach-2',
    url: 'https://picsum.photos/seed/contract-docx/1200/800',
    name: '合約附件.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 1_100_000,
    description: '1.1 MB',
  },
  {
    id: 'attach-3',
    url: 'https://picsum.photos/seed/data-csv/1200/800',
    name: 'data.csv',
    mimeType: 'text/csv',
    size: 48_000,
  },
  {
    id: 'attach-4',
    url: 'https://picsum.photos/seed/backup-json/1200/800',
    name: 'backup.json',
    mimeType: 'application/json',
    size: 320_000,
  },
]

export const Clickable = {
  name: '已上傳',
  render: () => {
    // Real FileViewer wiring:click → 打開 FileViewer at 對應 index
    const [open, setOpen] = React.useState(false)
    const [index, setIndex] = React.useState(0)
    const openAt = (idx: number) => {
      setIndex(idx)
      setOpen(true)
    }
    return (
      <>
        <div className="flex flex-col gap-2 max-w-md">
          {attachmentFiles.map((f, i) => {
            const isImage = i < 2 // 前兩個 rich card(有 thumbnail)
            const sizeLabel = f.description ?? (f.size != null ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : '—')
            return isImage ? (
              <FileItem
                key={f.id}
                mode="rich"
                name={f.name}
                description={sizeLabel}
                thumbnailSrc={f.url}
                onClick={() => openAt(i)}
                actions={deleteBtn}
              />
            ) : (
              <FileItem
                key={f.id}
                mode="compact"
                name={f.name}
                onClick={() => openAt(i)}
                actions={deleteBtn}
              />
            )
          })}
        </div>
        <FileViewer files={attachmentFiles} open={open} onOpenChange={setOpen} index={index} onIndexChange={setIndex} />
      </>
    )
  },
}

export const CompactMixed = {
  name: 'Compact 混合',
  render: () => (
    // Real-world:email 草稿 — 新上傳中(Type A active)+ 舊已存附件(Type B 靜態)混在同 list
    // **重要 invariant**:Type A **completed**(bar 100% + ✓)跟 Type B(無 bar)不共存
    // —— Type A completed 是「剛完成的 upload session」,Type B 是「已存 attachment」,
    //    業務語義互斥(完成後 consumer 會把 item 轉成 Type B)。
    // 這 mixed 情境只含:Type A active(uploading/error)+ Type B(saved attachments)
    <div className="flex flex-col gap-1 max-w-md">
      <FileItem mode="compact" name="圖片草稿.png" status="uploading" progress={40} actions={deleteBtnXs} />
      <FileItem mode="compact" name="回覆範本.docx" onClick={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="backup-failed.json" status="error"
        description={<>Network timeout. <a href="#" className="underline hover:text-error-hover" onClick={(e) => e.preventDefault()}>View log</a></>}
        onRetry={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="附件封面.pdf" onClick={noop} actions={deleteBtnXs} />
    </div>
  ),
}

// surface="upload-manager":Google Drive / Dropbox 背景上傳 box — rich 無邊框(box 自身是容器,
// avatar 作每筆 item 邊界),列間 4px(無邊框 → 跟 compact 同間距)。對比預設 surface=form 的 border card。
export const UploadManagerSurface = {
  name: 'Upload manager(無邊框)',
  render: () => (
    <div className="flex flex-col gap-1 max-w-md rounded-md border border-divider bg-surface p-2">
      <FileItem mode="rich" surface="upload-manager" name="Alan Profile.png" status="uploading" progress={40}
        description="5.7 MB of 7.5MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
      <FileItem mode="rich" surface="upload-manager" name="Q1 營收報表.xlsx" status="completed"
        description="2.4 MB" thumbnailSrc="https://i.pravatar.cc/80?u=xls" onDownload={noop} actions={deleteBtn} />
      <FileItem mode="rich" surface="upload-manager" name="合約草案 v3.pdf" status="error"
        description="There's something wrong. View log" thumbnailSrc="https://i.pravatar.cc/80?u=pdf" onRetry={noop} actions={deleteBtn} />
    </div>
  ),
}
