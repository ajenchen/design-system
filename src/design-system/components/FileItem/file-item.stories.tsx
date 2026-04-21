import type { Meta } from '@storybook/react'
import { Trash2 } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof FileItem> = {
  title: 'Design System/Components/FileItem/展示',
  component: FileItem,
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// FileItem row dedicated action region(2026-04-22 canonical):Button size-pair row tier
// (rich=sm, compact=xs)。Delete 屬 dismiss 視覺類,用 `dismiss` prop 自動套:
//   - variant="text" + iconOnly(強制)
//   - Icon 色 override fg-muted → hover foreground(跟 Inline Action dismiss 視覺一致)
// 詳 button.spec.md「Dismiss 視覺類」+ patterns/element-anatomy/item-anatomy.spec.md
const deleteBtn = <Button size="sm" dismiss startIcon={Trash2} aria-label="刪除" onClick={noop} />
const deleteBtnXs = <Button size="xs" dismiss startIcon={Trash2} aria-label="刪除" onClick={noop} />

export const Rich = {
  name: 'Rich（上傳狀態）',
  render: () => (
    <div className="flex flex-col max-w-md">
      <FileItem mode="rich" name="Alan Profile.png" status="uploading" progress={40}
        description="5.7 MB of 7.5MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
      <FileItem mode="rich" name="Alan Profile.png" status="completed"
        description="5.7 MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
      <FileItem mode="rich" name="Alan Profile.png" status="error" progress={65}
        description="There's something wrong" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
    </div>
  ),
}

export const Compact = {
  name: 'Compact（上傳狀態）',
  render: () => (
    <div className="flex flex-col max-w-md">
      <FileItem mode="compact" name="UXP T-Phone.csv" status="uploading" progress={60} actions={deleteBtnXs} />
      <FileItem mode="compact" name="UXP T-Phone.csv" status="error" description="There's something wrong" actions={deleteBtnXs} />
      <FileItem mode="compact" name="UXP T-Phone.csv" status="completed" actions={deleteBtnXs} />
    </div>
  ),
}

export const HoverSwap = {
  name: 'Hover swap(狀態 ↔ 操作)',
  render: () => (
    <div className="flex flex-col max-w-md gap-4">
      <div>
        <div className="text-caption text-fg-muted mb-2">
          ↓ 游標移入任一 row:completed 綠 ✓ 變 Download ↓,error 紅 ✗ 變 Retry ⟲
        </div>
        <div className="flex flex-col border border-divider rounded-lg overflow-hidden">
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
          同樣 pattern 在 compact mode:幾何(16×16)與刪除按鈕一致,center 自動對齊
        </div>
        <div className="flex flex-col border border-divider rounded-lg overflow-hidden">
          <FileItem mode="compact" name="data-2024-q1.csv" status="completed"
            onDownload={noop} actions={deleteBtnXs} />
          <FileItem mode="compact" name="backup-failed.json" status="error"
            description="Network timeout. View log" onRetry={noop} actions={deleteBtnXs} />
        </div>
      </div>
    </div>
  ),
}

export const Clickable = {
  name: '已上傳（點擊下載）',
  render: () => (
    <div className="flex flex-col max-w-md border border-divider rounded-lg overflow-hidden">
      <FileItem mode="rich" name="報告.pdf" description="2.3 MB"
        thumbnailSrc="https://i.pravatar.cc/80?u=doc" onClick={noop} actions={deleteBtn} />
      <FileItem mode="rich" name="合約附件.docx" description="1.1 MB"
        thumbnailSrc="https://i.pravatar.cc/80?u=contract" onClick={noop} actions={deleteBtn} />
      <FileItem mode="compact" name="data.csv" onClick={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="backup.json" onClick={noop} actions={deleteBtnXs} />
    </div>
  ),
}
