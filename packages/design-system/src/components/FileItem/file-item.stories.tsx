// @story-history: hasInteractiveStates 由 anatomy.stories.tsx StateBehavior auto-compile owns(2026-05-15 F-migration);Default scenario 由 Rich / Compact / HoverSwap 等真實上傳情境 story 覆蓋,Disabled state 由 status="error" / "uploading" 真實 state 體現。
import * as React from 'react'
import type { Meta } from '@storybook/react'
import { expect, fn, userEvent, within } from '@storybook/test'
import { Trash2, ChevronDown } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'
import { FileViewer, type FileInfo } from '@/design-system/components/FileViewer/file-viewer'
// upload-manager 面板消費 overlay-surface header + body SSOT(非手刻)—— 跟 Popover/Dialog 同一組 primitive
import { SurfaceHeader, SurfaceBody, COMPACT_HEADER_SLOT } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle } from '@/design-system/components/Popover/popover'

// 錯誤 description 範例(含 clickable "View log"):consumer 自由 ReactNode。
// 連結沿用錯誤訊息的紅 + 底線、滑過不換色(user 2026-09-26 選「乙 紅字 + 底線，滑過不變」;file-item.spec.md「Description ReactNode 可含 clickable 元素」)
const errorDescWithLog = (
  <>
    There&rsquo;s something wrong.{' '}
    <a href="#" className="underline" onClick={(e) => e.preventDefault()}>
      View log
    </a>
  </>
)

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

const noop = () => {}
const keyboardOpen = fn()

// FileItem row dedicated action(2026-04-23 統一 canonical):
// **Row action 絕對值 cap = ≤ 24px,不隨 row tier 放大**。rich + compact 統一用
// Button size="xs" iconOnly variant="text"(24 固定,≤ cap):
// compact row 透過 FileItem 內部 suffix wrapper `[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]`
// trick 讓 Button(24)layout footprint 收斂到 1lh(~18px)不撐高 row,視覺與命中區仍 24
// (命中 ≡ 可視,見 ds-canonical/references/hit-area-canonical.md;2026-09-24 把原文的「觸控範圍」正名為命中區)。
// Trash/Delete 非 dismiss 語意(dismiss 嚴格 = X close overlay),不套 `dismiss` prop——
// Button variant="text" 本來就 fg-muted,視覺已弱化(兩 mode 同)。
// 詳 item-anatomy.spec.md「Predicate」+「Row action 絕對值 cap」
const deleteBtn = <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除" onClick={noop} />
const deleteBtnXs = deleteBtn

export const Rich = {
  name: '豐富樣式',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  parameters: { demoFocus: 'keep' },
  render: () => (
    // rich(預設 form surface)各 status 展示:uploading / completed(保留 100% 完成條)/ error
    // 也可傳 onClick/onDownload 讓整 row 點開(預設 FileViewer,consumer 決定)
    // Rich 永遠 border card → list wrapper `gap-2` 防邊框相黏
    <div className="flex flex-col gap-2 max-w-md">
      <FileItem mode="rich" name="Alan Profile.png" status="uploading" progress={40}
        description="5.7 MB of 7.5MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
      <FileItem mode="rich" name="Alan Profile.png" status="completed"
        description="5.7 MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan"
        onClick={keyboardOpen} onDownload={noop} actions={deleteBtn} />
      <FileItem mode="rich" name="Alan Profile.png" status="error" progress={65}
        description={errorDescWithLog} thumbnailSrc="https://i.pravatar.cc/80?u=alan"
        onRetry={noop} actions={deleteBtn} />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    keyboardOpen.mockClear()
    const action = await within(canvasElement).findByRole('button', { name: '開啟 Alan Profile.png' })
    action.focus()
    await userEvent.keyboard('{Enter}')
    await expect(keyboardOpen).toHaveBeenCalledTimes(1)

    // 點同一列 trailing action 的刪除鈕:只該觸發刪除,**不得**連帶觸發整列 onClick。
    // 2026-09-24 補。先前這支 play 只驗了鍵盤 Enter 那一條,於是「點刪除連帶把檔案開起來」
    // 在我們自己的示範裡一路沒人看見 —— 那個洞不是沒人踩到,是**沒有人在量**。
    // `action` 是覆蓋整列的隱形鈕,它的 parentElement 就是列本身;用它把搜尋範圍縮到同一列,
    // 才不會抓到別列的刪除鈕(三列都有一顆)。
    const row = action.parentElement as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: '刪除' }))
    await expect(keyboardOpen).toHaveBeenCalledTimes(1)
  },
}

export const Compact = {
  name: '緊湊樣式',
  render: () => (
    // compact + status 各狀態展示(uploading / completed / error,永遠有 progress bar)
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
  name: '懸停替換',
  render: () => (
    <div className="flex flex-col max-w-md gap-4">
      <div>
        <div className="text-caption text-fg-muted mb-2">
          ↓ 游標移入任一 row:completed 綠 ✓ 變 Download ↓,error 紅 ✗ 變 Retry ⟲。
          這幾列沒有傳 onClick(點列本身沒反應),所以整列不上滑過底色,只有換上的那顆鈕有自己的滑過色(待辦總帳 B12)
        </div>
        {/* Rich border card list:無外框 + `gap-2`(item-anatomy「連續 item 貼邊合法性」) */}
        <div className="flex flex-col gap-2">
          <FileItem mode="rich" name="Q1 營收報表.xlsx" status="completed" data-visual-hover-target
            description="Uploaded to URL" thumbnailSrc="https://i.pravatar.cc/80?u=xls"
            onDownload={noop} actions={deleteBtn} />
          <FileItem mode="rich" name="合約草案 v3.pdf" status="error"
            description={errorDescWithLog}
            thumbnailSrc="https://i.pravatar.cc/80?u=pdf"
            onRetry={noop} actions={deleteBtn} />
        </div>
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-2">
          緊湊樣式也是同一套規則:狀態圖示與刪除鈕的大小、位置一致,垂直置中對齊
        </div>
        {/* Compact list 統一 gap-1(canonical 簡化) */}
        <div className="flex flex-col gap-1">
          <FileItem mode="compact" name="data-2024-q1.csv" status="completed"
            onDownload={noop} actions={deleteBtnXs} />
          <FileItem mode="compact" name="backup-failed.json" status="error"
            description={<>Network timeout. <a href="#" className="underline" onClick={(e) => e.preventDefault()}>View log</a></>}
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
        {/* 2026-07-14 Dim 68 修:原本同一 list 依檔案類型混 rich(圖片)+ compact(文件),
            違反 file-item.spec.md「❌ 不混用 rich + compact 在同一 list」(Invariant 1 —
            高度差破壞 row rhythm)。改拆兩個區段:圖片整組 rich、文件整組 compact,
            同區段 mode 統一(spec 建議的分區段做法);FileViewer index 跨兩區段連續。 */}
        <div className="flex flex-col gap-4 max-w-md">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-caption font-medium text-fg-muted">圖片</h3>
            <div className="flex flex-col gap-2">
              {attachmentFiles.slice(0, 2).map((f, i) => (
                <FileItem
                  key={f.id}
                  mode="rich"
                  name={f.name}
                  description={f.description ?? (f.size != null ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : '—')}
                  thumbnailSrc={f.url}
                  onClick={() => openAt(i)}
                  actions={deleteBtn}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-caption font-medium text-fg-muted">文件</h3>
            <div className="flex flex-col gap-1">
              {attachmentFiles.slice(2).map((f, i) => (
                <FileItem
                  key={f.id}
                  mode="compact"
                  name={f.name}
                  onClick={() => openAt(i + 2)}
                  actions={deleteBtn}
                />
              ))}
            </div>
          </div>
        </div>
        <FileViewer files={attachmentFiles} open={open} onOpenChange={setOpen} index={index} onIndexChange={setIndex} />
      </>
    )
  },
}

export const CompactMixed = {
  name: '緊湊 混合',
  render: () => (
    // Real-world:email 草稿 — 新上傳中(status=uploading/error)+ 舊已存附件(無 status 靜態)混在同 list
    // 重要 invariant:upload-manager 的 completed(bar 100% + ✓)跟靜態(無 bar)不共存
    // —— completed-保留 是「剛完成的 upload session」,無 status 是「已存 attachment」,
    //    業務語義互斥(表單情境完成後 consumer 會清掉 status 轉靜態)。
    // 這 mixed 情境只含:上傳中(uploading/error)+ 已存附件(saved attachments,無 status)
    <div className="flex flex-col gap-1 max-w-md">
      <FileItem mode="compact" name="圖片草稿.png" status="uploading" progress={40} actions={deleteBtnXs} />
      <FileItem mode="compact" name="回覆範本.docx" onClick={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="backup-failed.json" status="error"
        description={<>Network timeout. <a href="#" className="underline" onClick={(e) => e.preventDefault()}>View log</a></>}
        onRetry={noop} actions={deleteBtnXs} />
      <FileItem mode="compact" name="附件封面.pdf" onClick={noop} actions={deleteBtnXs} />
    </div>
  ),
}

/**
 * 上傳管理器這個 archetype 的**狀態 → 行動**配對,兩個密度樣張共用同一份。
 *
 * 為什麼抽出來(2026-09-18 user 回報):先前只有「豐富」那則的 completed 列傳了 `onDownload`,
 * 「緊湊」那則沒傳 —— 於是同一個面板在兩個密度下,滑過已完成的檔案一個會把綠 ✓ 換成下載鈕、另一個不會,
 * 看起來像「能力由密度決定」。實際上 `file-item.spec.md`「可下載狀態 canonical」的狀態表寫得很清楚:
 * `completed` 配 `Download ↓` 配 `onDownload`、`error` 配 `⟲` 配 `onRetry`;
 * 沒傳就退回 passive 是給既有 consumer 的相容行為,不是這裡要示範的東西。
 * 寫成共用常數而不是「兩邊都記得傳」:**能力集合從此不可能只在其中一則出現**。
 */
// 完成的檔案可以點開(onClick),上傳中 / 失敗的不行 —— 同一個面板裡兩種列並存,示範「點了會有反應的列才有滑過底色」
// (2026-09-25 待辦總帳 B12:user「要點了會有反應的才加…」)。上傳中還不能開是真實情境,不是示範取巧。
const UPLOAD_MANAGER_COMPLETED = { status: 'completed', onDownload: noop, onClick: noop } as const
const UPLOAD_MANAGER_ERROR = { status: 'error', onRetry: noop } as const

// surface="upload-manager":Google Drive / Dropbox 上傳管理面板。面板組合 canonical(file-item.spec.md「upload-manager 浮層面板 composition」):
//   - 2026-09-25 待辦總帳 B12 推翻 06-03 的「左右交給面板」:可點的列滑過底色要鋪到面板左右邊 → 列自帶左右 loose(16px,
//     文字 x 與 06-03 相同、仍對齊 header 標題),面板 body 左右 0(判準 = overlay-surface.spec.md「誰負責左右 gutter」)
//   - 上下目標不變:「邊緣→item ink」「ink→ink」= tight(12px)。兩 mode 的列上下各自帶 tight/2 → body 上下也給 tight/2、列間 gap 0
//     (06-03 compact 的 !pt-1 上下不對稱隨之取消);滑過底色上下各留 tight/2,不貼縮圖、不貼進度條
//   - 只有完成的列有 onClick(UPLOAD_MANAGER_COMPLETED),上傳中 / 失敗的列點了沒反應 → 不上滑過底色
export const UploadManagerSurface = {
  name: '上傳管理器 · 豐富(無邊框)',
  render: () => (
    <div className="max-w-md flex flex-col rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)]">
      {/* header 消費 overlay-surface SurfaceHeader + PopoverTitle(輕量浮層 chrome SSOT,非手刻):
          px-loose py-tight + border-b + chevron(variant=text → 自動 data-unbounded → 套 slot 負 my trick)*/}
      <SurfaceHeader className={`justify-between ${COMPACT_HEADER_SLOT}`}>
        <div className="flex-1 min-w-0"><PopoverTitle>正在上傳 3 個項目</PopoverTitle></div>
        <Button iconOnly variant="text" size="sm" startIcon={ChevronDown} aria-label="收合" onClick={noop} />
      </SurfaceHeader>
      {/* body 消費 overlay-surface SurfaceBody(非手刻;flex-1 scroll 鏈照用)。左右 0、上下 tight/2、列間 0:
          gutter 與另一半上下由列自己帶(B12,見上方註解);縮圖↔縮圖、邊緣↔縮圖仍是 12px */}
      <SurfaceBody className="flex flex-col gap-0 !px-0 !py-[calc(var(--layout-space-tight)/2)]">
        <FileItem mode="rich" surface="upload-manager" name="Alan Profile.png" status="uploading" progress={40}
          description="5.7 MB of 7.5 MB" thumbnailSrc="https://i.pravatar.cc/80?u=alan" actions={deleteBtn} />
        <FileItem mode="rich" surface="upload-manager" name="Q1 營收報表.xlsx" {...UPLOAD_MANAGER_COMPLETED} data-visual-hover-target
          description="2.4 MB" thumbnailSrc="https://i.pravatar.cc/80?u=xls" actions={deleteBtn} />
        <FileItem mode="rich" surface="upload-manager" name="合約草案 v3.pdf" {...UPLOAD_MANAGER_ERROR}
          description={errorDescWithLog} thumbnailSrc="https://i.pravatar.cc/80?u=pdf" actions={deleteBtn} />
      </SurfaceBody>
    </div>
  ),
}

// surface="upload-manager" 的 compact list:body 寫法與 rich 相同(左右 0、上下 tight/2、列間 0),差別只在列本身 ——
// compact 列上 tight/2、下 tight/2 + 8(文字↔bar 6 + bar 2),bar 離列底 tight/2(file-item.tsx「compact 內距」段)。
// 對比 rich panel(列高 = 縮圖 48 + tight),demo 兩 mode 密度差異。
export const UploadManagerCompactSurface = {
  name: '上傳管理器 · 緊湊(無邊框)',
  render: () => (
    <div className="max-w-md flex flex-col rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)]">
      {/* header 消費同一個 overlay-surface SurfaceHeader + PopoverTitle SSOT(同 rich panel)*/}
      <SurfaceHeader className={`justify-between ${COMPACT_HEADER_SLOT}`}>
        <div className="flex-1 min-w-0"><PopoverTitle>同步 3 個檔案</PopoverTitle></div>
        <Button iconOnly variant="text" size="sm" startIcon={ChevronDown} aria-label="收合" onClick={noop} />
      </SurfaceHeader>
      {/* body 同 rich 面板:左右 0、上下 tight/2、列間 0(B12)。用 `!` 沿用 List-as-region `!px-0` 慣例,
          覆寫勝負不依賴 twMerge 分組與 stylesheet 生成順序。 */}
      <SurfaceBody className="flex flex-col gap-0 !px-0 !py-[calc(var(--layout-space-tight)/2)]">
        {/* 上傳中的列不能開(沒有 onClick)→ 不上滑過底色;與 rich 面板同一組能力(B12) */}
        <FileItem mode="compact" surface="upload-manager" name="季度報告.docx" status="uploading" progress={60}
          actions={deleteBtn} />
        <FileItem mode="compact" surface="upload-manager" name="客戶名單.csv" {...UPLOAD_MANAGER_COMPLETED}
          actions={deleteBtn} />
        <FileItem mode="compact" surface="upload-manager" name="封面.png" {...UPLOAD_MANAGER_ERROR}
          description={errorDescWithLog} actions={deleteBtn} />
      </SurfaceBody>
    </div>
  ),
}
