
// @story-history: hasInteractiveStates 由 anatomy.stories.tsx StateBehavior auto-compile owns(2026-05-15 F-migration);Default scenario 由 Rich / Compact / HoverSwap 等真實上傳情境 story 覆蓋,Disabled state 由 status="error" / "uploading" 真實 state 體現。
import type { Meta } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { Trash2 } from 'lucide-react'
import { FileItem } from './file-item'
import { useFileDemo, UploadManagerPanel, type DemoFile } from './_demo-files'
import { Button } from '@/design-system/components/Button/button'
import { Toaster } from '@/design-system/components/Toast/toast'

const meta: Meta<typeof FileItem> = {
  title: 'Design System/Components/FileItem/展示',
  tags: ['autodocs'],
  component: FileItem,
  parameters: {
    layout: 'padded',
    docs: { description: { component: '以一致列項呈現檔名、類型、進度、狀態與檔案操作，可切換 compact 或 rich 內容。上傳佇列與附件清單需要逐檔回饋時使用。' } },
  },
}
export default meta

// 每一則的刪除 / 下載 / 重試 / 點列 / View log 都接上真的反應(./_demo-files.tsx;之前全是空函式,點了沒反應)。
// 列內操作一律 Button xs iconOnly variant="text"(24 固定):compact 列靠 FileItem suffix wrapper 的負 margin 把 layout
// footprint 收到 1lh、不撐高列,命中區仍 24(命中 ≡ 可視,ds-canonical/references/hit-area-canonical.md);
// 判準住 item-anatomy.spec.md「結構:四個獨立 slot」的 suffix 表(Inline Action 列:點擊靶子 ≤ 24px)。

// 同一張人像照(圖片檔,縮圖就是照片本身)的三種狀態;上傳中 40% = 3.0 / 7.5 MB,完成後 7.5 MB,前後對得上(之前上傳中寫 5.7 MB of 7.5MB、完成後寫 5.7 MB)
const RICH_FILES: DemoFile[] = [
  { uid: 'rich-uploading', name: 'Alan Profile.png', mimeType: 'image/png', status: 'uploading', progress: 40, uploadingText: '3.0 MB of 7.5 MB', size: '7.5 MB', thumbnailSrc: 'https://i.pravatar.cc/80?u=alan' },
  { uid: 'rich-completed', name: 'Alan Profile.png', mimeType: 'image/png', status: 'completed', size: '7.5 MB', thumbnailSrc: 'https://i.pravatar.cc/80?u=alan', url: 'https://i.pravatar.cc/800?u=alan' },
  { uid: 'rich-error', name: 'Alan Profile.png', mimeType: 'image/png', status: 'error', progress: 65, size: '7.5 MB', thumbnailSrc: 'https://i.pravatar.cc/80?u=alan' },
]

export const Rich = {
  name: '豐富樣式',
  // 示範焦點是本則的主題(起點 a103c40b 就是這個示範畫面):鍵盤 Tab 進「已完成」那列,狀態圖示換成下載鈕、焦點框落在同一列的刪除鈕。
  // 2026-11-04 審查:驗證用的 Enter / 點刪除斷言留在 test-only「整列鍵盤契約」—— 本則的鈕接上真的行為之後,那兩下會真的開檔 / 刪列;本則只用 Tab 造出同一個焦點狀態。
  // @example-basis: packages/design-system/src/components/FileItem/file-item.spec.md:425「Primary button 與下載／重試／移除皆為 sibling」
  parameters: { demoFocus: 'keep' },
  render: function RichStory() {
    // rich(預設 form surface)各 status 展示:uploading / completed(保留 100% 完成條)/ error;完成的那列點了用 FileViewer 開
    const demo = useFileDemo(RICH_FILES)
    return (
      <>
        <Toaster />
        {/* Rich 永遠 border card → list wrapper gap 8px 防邊框相黏 */}
        {/* @layout-space-magic-ok: rich FileItem 清單列距 8px(file-item.spec.md:268 多 item 間距表 Rich + surface=form 那一列 gap-2) */}
        <div className="flex flex-col gap-2 max-w-md">
          {demo.files.map((f) => <FileItem key={f.uid} mode="rich" {...demo.itemProps(f)} />)}
        </div>
        {demo.viewer}
      </>
    )
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    // 只有「已完成」那列可以點開,所以「開啟 Alan Profile.png」只有一顆;從它 Tab 兩下:下載(滑過 / 聚焦時換上的那顆)→ 刪除
    const open = await within(canvasElement).findByRole('button', { name: '開啟 Alan Profile.png' })
    const row = open.parentElement as HTMLElement
    open.focus()
    await userEvent.tab()
    await userEvent.tab()
    // 鍵盤聚焦到 icon-only 鈕會自動出它的 Tooltip(button.tsx icon-only 自動 tooltip);起點那張示範圖是點擊聚焦、沒有 Tooltip ——
    // 按一下 Esc 收掉 Tooltip(焦點留在刪除鈕),畫面回到起點那張(2026-11-04 全 DS 像素比對抓到)
    await userEvent.keyboard('{Escape}')
    await expect(within(row).getByRole('button', { name: '刪除 Alan Profile.png' })).toHaveFocus()
  },
}

// 整列鍵盤契約(test-only 夾具):2026-10-28 自「豐富樣式」搬出驗證用的斷言(示範焦點 2026-11-04 放回「豐富樣式」,見上)。斷言照搬:
// Tab 到整列那顆隱形鈕按 Enter 只開一次;點同一列的刪除鈕只刪除、不連帶開檔。
const keyboardOpen = fn()
const keyboardDelete = fn()
export const RichRowKeyboardContract = {
  name: '豐富樣式 — 整列鍵盤契約',
  tags: ['test-only'],
  parameters: { demoFocus: 'keep' },
  render: () => (
    <div className="max-w-md">
      <FileItem mode="rich" name="Alan Profile.png" status="completed" description="7.5 MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan"
        onClick={keyboardOpen} onDownload={() => {}}
        actions={<Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除 Alan Profile.png" onClick={keyboardDelete} />} />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    keyboardOpen.mockClear()
    keyboardDelete.mockClear()
    const action = await within(canvasElement).findByRole('button', { name: '開啟 Alan Profile.png' })
    action.focus()
    await userEvent.keyboard('{Enter}')
    await expect(keyboardOpen).toHaveBeenCalledTimes(1)

    // 點同一列 trailing action 的刪除鈕:只該觸發刪除,**不得**連帶觸發整列 onClick。
    // 2026-09-24 補。先前這支 play 只驗了鍵盤 Enter 那一條,於是「點刪除連帶把檔案開起來」
    // 在我們自己的示範裡一路沒人看見 —— 那個洞不是沒人踩到,是**沒有人在量**。
    // `action` 是覆蓋整列的隱形鈕,它的 parentElement 就是列本身;用它把搜尋範圍縮到同一列。
    const row = action.parentElement as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: '刪除 Alan Profile.png' }))
    await expect(keyboardDelete).toHaveBeenCalledTimes(1)
    await expect(keyboardOpen).toHaveBeenCalledTimes(1)
  },
}

const COMPACT_FILES: DemoFile[] = [
  { uid: 'compact-uploading', name: 'UXP T-Phone.csv', mimeType: 'text/csv', status: 'uploading', progress: 60, size: '48 KB' },
  { uid: 'compact-error', name: 'UXP T-Phone.csv', mimeType: 'text/csv', status: 'error', size: '48 KB' },
  { uid: 'compact-completed', name: 'UXP T-Phone.csv', mimeType: 'text/csv', status: 'completed', size: '48 KB' },
]

export const Compact = {
  name: '緊湊樣式',
  render: function CompactStory() {
    // compact + status 各狀態展示(uploading / completed / error,永遠有 progress bar)
    const demo = useFileDemo(COMPACT_FILES)
    return (
      <>
        <Toaster />
        {/* list wrapper gap 4px 簡化 canonical — compact list 統一 4px,不論純/混合(2026-04-23) */}
        {/* @layout-space-magic-ok: compact FileItem 清單列距 4px(file-item.spec.md:270 多 item 間距表 Compact + surface=form 那一列 gap-1) */}
        <div className="flex flex-col gap-1 max-w-md">
          {demo.files.map((f) => <FileItem key={f.uid} mode="compact" {...demo.itemProps(f)} />)}
        </div>
        {demo.viewer}
      </>
    )
  },
}

// 懸停替換:試算表與 PDF 沒有圖片縮圖,不放人臉照片 —— 走 FileItem 自己的檔案類型退回呈現
const HOVER_RICH: DemoFile[] = [
  { uid: 'hover-xlsx', name: 'Q1 營收報表.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'completed', size: '2.4 MB' },
  { uid: 'hover-pdf', name: '合約草案 v3.pdf', mimeType: 'application/pdf', status: 'error', progress: 0, size: '3.1 MB' },
]
const HOVER_COMPACT: DemoFile[] = [
  { uid: 'hover-csv', name: 'data-2024-q1.csv', mimeType: 'text/csv', status: 'completed', size: '48 KB' },
  { uid: 'hover-json', name: 'backup-failed.json', mimeType: 'application/json', status: 'error', size: '320 KB', errorText: 'Network timeout.' },
]

export const HoverSwap = {
  name: '懸停替換',
  parameters: {
    // 說明放 docs、用人話寫(之前畫布上印著符號串與內部待辦代號)
    docs: { description: { story: '滑鼠移到列上:已完成的綠色勾換成下載鈕,失敗的紅色叉換成重試鈕。這幾列本身點了不會開檔,所以整列不上滑過底色,只有換上的那顆鈕有自己的滑過色。緊湊樣式也是同一套規則:狀態圖示與刪除鈕的大小、位置一致,垂直置中對齊。' } },
  },
  render: function HoverSwapStory() {
    const rich = useFileDemo(HOVER_RICH, { clickable: false })
    const compact = useFileDemo(HOVER_COMPACT, { clickable: false })
    return (
      <>
        <Toaster />
        <div className="flex flex-col max-w-md gap-[var(--layout-space-loose)]">
          {/* Rich border card list:無外框 + 列距 8px(item-anatomy「連續 item 貼邊合法性」) */}
          {/* @layout-space-magic-ok: rich FileItem 清單列距 8px(file-item.spec.md:268 多 item 間距表 Rich + surface=form 那一列 gap-2) */}
          <div className="flex flex-col gap-2">
            {rich.files.map((f, i) => (
              <FileItem key={f.uid} mode="rich" {...rich.itemProps(f)} {...(i === 0 ? { 'data-visual-hover-target': true } : {})} />
            ))}
          </div>
          {/* @layout-space-magic-ok: compact FileItem 清單列距 4px(file-item.spec.md:270 多 item 間距表 Compact + surface=form 那一列 gap-1) */}
          <div className="flex flex-col gap-1">
            {compact.files.map((f) => <FileItem key={f.uid} mode="compact" {...compact.itemProps(f)} />)}
          </div>
        </div>
      </>
    )
  },
}

// 已上傳的附件:點列用 FileViewer 開;「圖片」區段只放圖片檔(之前把 報告.pdf / 合約附件.docx 放在圖片區)
const ATTACHMENT_IMAGES: DemoFile[] = [
  { uid: 'attach-1', name: '活動主視覺.jpg', mimeType: 'image/jpeg', size: '2.3 MB', thumbnailSrc: 'https://picsum.photos/seed/event-key-visual/1200/800' },
  { uid: 'attach-2', name: '會場平面圖.png', mimeType: 'image/png', size: '1.1 MB', thumbnailSrc: 'https://picsum.photos/seed/venue-floor-plan/1200/800' },
]
const ATTACHMENT_DOCUMENTS: DemoFile[] = [
  { uid: 'attach-3', name: 'data.csv', mimeType: 'text/csv', size: '47 KB' },
  { uid: 'attach-4', name: 'backup.json', mimeType: 'application/json', size: '313 KB' },
]

export const Clickable = {
  name: '已上傳',
  render: function ClickableStory() {
    const images = useFileDemo(ATTACHMENT_IMAGES)
    const documents = useFileDemo(ATTACHMENT_DOCUMENTS)
    return (
      <>
        {/* 2026-07-14 Dim 68 修:原本同一 list 依檔案類型混 rich(圖片)+ compact(文件),
            違反 file-item.spec.md「❌ 不混用 rich + compact 在同一 list」(Invariant 1 —
            高度差破壞 row rhythm)。改拆兩個區段:圖片整組 rich、文件整組 compact,
            同區段 mode 統一(spec 建議的分區段做法)。 */}
        <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-md">
          <div className="flex flex-col gap-[var(--layout-space-tight)]">
            <h3 className="text-caption font-medium text-fg-muted">圖片</h3>
            {/* @layout-space-magic-ok: rich FileItem 清單列距 8px(file-item.spec.md:268 多 item 間距表 Rich + surface=form 那一列 gap-2) */}
            <div className="flex flex-col gap-2">
              {images.files.map((f) => <FileItem key={f.uid} mode="rich" {...images.itemProps(f)} />)}
            </div>
          </div>
          <div className="flex flex-col gap-[var(--layout-space-tight)]">
            <h3 className="text-caption font-medium text-fg-muted">文件</h3>
            {/* @layout-space-magic-ok: compact FileItem 清單列距 4px(file-item.spec.md:270 多 item 間距表 Compact + surface=form 那一列 gap-1) */}
            <div className="flex flex-col gap-1">
              {documents.files.map((f) => <FileItem key={f.uid} mode="compact" {...documents.itemProps(f)} />)}
            </div>
          </div>
        </div>
        {images.viewer}
        {documents.viewer}
      </>
    )
  },
}

// Real-world:email 草稿 — 新上傳中(status=uploading/error)+ 舊已存附件(無 status 靜態)混在同 list
// 重要 invariant:upload-manager 的 completed(bar 100% + ✓)跟靜態(無 bar)不共存
// —— completed-保留 是「剛完成的 upload session」,無 status 是「已存 attachment」,
//    業務語義互斥(表單情境完成後 consumer 會清掉 status 轉靜態)。
// 這 mixed 情境只含:上傳中(uploading/error)+ 已存附件(saved attachments,無 status)
const COMPACT_MIXED: DemoFile[] = [
  { uid: 'mixed-uploading', name: '圖片草稿.png', mimeType: 'image/png', status: 'uploading', progress: 40, size: '1.8 MB' },
  { uid: 'mixed-reply', name: '回覆範本.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: '64 KB' },
  { uid: 'mixed-error', name: 'backup-failed.json', mimeType: 'application/json', status: 'error', size: '320 KB', errorText: 'Network timeout.' },
  { uid: 'mixed-cover', name: '附件封面.pdf', mimeType: 'application/pdf', size: '220 KB' },
]

export const CompactMixed = {
  name: '緊湊混合清單',
  render: function CompactMixedStory() {
    const demo = useFileDemo(COMPACT_MIXED)
    return (
      <>
        <Toaster />
        {/* @layout-space-magic-ok: compact FileItem 清單列距 4px(file-item.spec.md:270 多 item 間距表 Compact + surface=form 那一列 gap-1) */}
        <div className="flex flex-col gap-1 max-w-md">
          {demo.files.map((f) => <FileItem key={f.uid} mode="compact" {...demo.itemProps(f)} />)}
        </div>
        {demo.viewer}
      </>
    )
  },
}

// surface="upload-manager":右下角背景上傳進度面板(./_demo-files.tsx UploadManagerPanel;
// 組合與行為 = file-item.spec.md「upload-manager 浮層面板 composition」):
//   - 列自帶左右 loose(16px,文字 x 對齊 header 標題)、面板 body 左右 0;上下 tight/2、列間 0(2026-09-25 B12)
//   - 只有完成的列可以點開(onClick),上傳中 / 失敗的列點了沒反應 → 不上滑過底色(B12)
//   - 標頭只有收合鈕(傳輸中只能收合);全部成功 5 秒後整個面板收起,滑過 / 聚焦時暫停;有失敗就不收起
// 試算表與 PDF 沒有圖片縮圖,不放人臉照片。
const UPLOAD_MANAGER_RICH: DemoFile[] = [
  { uid: 'um-rich-uploading', name: 'Alan Profile.png', mimeType: 'image/png', status: 'uploading', progress: 40, uploadingText: '3.0 MB of 7.5 MB', size: '7.5 MB', thumbnailSrc: 'https://i.pravatar.cc/80?u=alan' },
  { uid: 'um-rich-completed', name: 'Q1 營收報表.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', status: 'completed', size: '2.4 MB' },
  { uid: 'um-rich-error', name: '合約草案 v3.pdf', mimeType: 'application/pdf', status: 'error', progress: 0, size: '3.1 MB' },
]

export const UploadManagerSurface = {
  name: '上傳管理器 · 豐富(無邊框)',
  render: () => (
    <>
      <Toaster />
      <UploadManagerPanel mode="rich" title="正在上傳 3 個項目" files={UPLOAD_MANAGER_RICH} hoverTargetId="um-rich-completed" />
    </>
  ),
}

// compact 的面板:body 寫法與 rich 相同(左右 0、上下 tight/2、列間 0),差別只在列本身 ——
// compact 列上 tight/2、下 tight/2 + 8(文字↔bar 6 + bar 2),bar 離列底 tight/2(file-item.tsx 的 compactPadBlock)。
const UPLOAD_MANAGER_COMPACT: DemoFile[] = [
  { uid: 'um-compact-uploading', name: '季度報告.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'uploading', progress: 60, size: '1.4 MB' },
  { uid: 'um-compact-completed', name: '客戶名單.csv', mimeType: 'text/csv', status: 'completed', size: '86 KB' },
  { uid: 'um-compact-error', name: '封面.png', mimeType: 'image/png', status: 'error', size: '2.2 MB' },
]

export const UploadManagerCompactSurface = {
  name: '上傳管理器 · 緊湊(無邊框)',
  render: () => (
    <>
      <Toaster />
      <UploadManagerPanel mode="compact" title="同步 3 個檔案" files={UPLOAD_MANAGER_COMPACT} />
    </>
  ),
}
