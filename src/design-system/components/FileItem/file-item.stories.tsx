import type { Meta } from '@storybook/react'
import { Trash2 } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'

const meta: Meta<typeof FileItem> = {
  title: 'Design System/Components/FileItem/展示',
  component: FileItem,
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// FileItem row dedicated action(2026-04-22 canonical):
// **Row action 絕對值 cap = ≤ 24px,不隨 row tier 放大**。依 row 高度分兩種實作:
//   - Rich(row 56)→ Button size="xs" iconOnly(24 固定,≤ cap)
//   - Compact(row 24)→ ItemInlineActionButton(因 Button xs 24 會填滿 compact row,
//     失去呼吸;Inline Action icon 16 + hover-bg 22 剛好)
// Trash/Delete 非 dismiss 語意(dismiss 嚴格 = X close overlay),不套 `dismiss` prop——
// Button variant="text" / Inline Action 本來就 fg-muted,視覺已弱化。
// 詳 item-anatomy.spec.md「Predicate」+「Row action 絕對值 cap」
const deleteBtn = <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除" onClick={noop} />
const deleteBtnXs = <ItemInlineActionButton icon={Trash2} size="sm" aria-label="刪除" onClick={noop} />

export const Rich = {
  name: 'Rich（上傳狀態）',
  render: () => (
    // Rich 永遠 border card → list wrapper `gap-2` 防邊框相黏(item-anatomy「連續 item 貼邊合法性」)
    <div className="flex flex-col gap-2 max-w-md">
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
  name: 'Compact（上傳狀態 · Type A upload manager）',
  render: () => (
    // Compact + status(永遠有 progress bar)= Type A upload manager
    // 永久視覺:flush 透明 row + 底部 progress bar(分隔線型 affordance 同 DataTable border-b)
    // → 0 gap 合法(item-anatomy v2「連續 item 貼邊合法性」),progress bar 自身作 separator
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
          同樣 pattern 在 compact mode:status slot 幾何與 Inline Action(16×16 icon)一致,center 自動對齊
        </div>
        {/* Compact + status = Type A(flush + progress bar 分隔線型 affordance)→ 0 gap 合法 */}
        <div className="flex flex-col">
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
  name: '已上傳（點擊下載,Type B form attachment）',
  render: () => (
    // Type B form attachment(無 status)—— rich card + compact bg-neutral-3 混場景,list wrapper 無外框
    // rich 必 gap-2 / compact bg 必 gap-1 → 混用取最大 `gap-2` 保守(file-item.spec「List wrapper canonical」)
    <div className="flex flex-col gap-2 max-w-md">
      <FileItem mode="rich" name="報告.pdf" description="2.3 MB"
        thumbnailSrc="https://i.pravatar.cc/80?u=doc" onClick={noop} actions={deleteBtn} />
      <FileItem mode="rich" name="合約附件.docx" description="1.1 MB"
        thumbnailSrc="https://i.pravatar.cc/80?u=contract" onClick={noop} actions={deleteBtn} />
      <FileItem mode="compact" name="data.csv" onClick={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="backup.json" onClick={noop} actions={deleteBtnXs} />
    </div>
  ),
}

export const CompactMixed = {
  name: 'Compact 混合(Type A 上傳中 + Type B 已上傳)',
  render: () => (
    // Real-world:email 草稿 / 多步驟 upload flow —— 上傳中(Type A)+ 舊附件(Type B)混在同 list
    // 相鄰組合:A↔A / A↔B 兩邊至少一邊無 bg,OK;B↔B 兩 bg 相連融合 → 必防
    // 決策:取最保守 `gap-1`(4px)不論實際順序,避免 B↔B 融合(spec「Mixed 類型 list」)
    <div className="flex flex-col gap-1 max-w-md">
      <FileItem mode="compact" name="圖片草稿.png" status="uploading" progress={40} actions={deleteBtnXs} />
      <FileItem mode="compact" name="回覆範本.docx" onClick={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="data-2024.csv" status="completed" onDownload={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="附件封面.pdf" onClick={noop} actions={deleteBtnXs} />
    </div>
  ),
}
