// @story-trait-rationale: hasInteractiveStates 的 Disabled / States 由 anatomy.stories.tsx StateBehavior auto-compile owns(2026-05-15 F-migration);showcase 層展示真實上傳 / 自訂內容情境。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { FileUpload } from './file-upload'
import { FileItem } from '@/design-system/components/FileItem/file-item'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof FileUpload> = {
  title: 'Design System/Components/FileUpload/展示',
  component: FileUpload,
  parameters: { layout: 'padded' },
}
export default meta

const noop = () => {}

// 單檔上傳:履歷(PDF / Word),5 MB 上限 — LinkedIn / 104 Job 慣例
export const ResumeUpload = {
  name: '單檔上傳',
  render: () => (
    <div className="max-w-lg">
      <FileUpload
        accept=".pdf,.doc,.docx"
        maxSize={5_000_000}
        title="上傳你的履歷"
        description="PDF / Word 格式,單檔最大 5 MB"
        onUpload={noop}
        onReject={noop}
      />
    </div>
  ),
}

// 批次上傳:相簿匯入 — Figma / Google Photos / Instagram 慣例
export const BulkImageUpload = {
  name: '批次上傳',
  render: () => {
    const [files, setFiles] = useState<File[]>([])
    return (
      <div className="max-w-lg flex flex-col gap-3">
        <FileUpload
          multiple
          accept="image/*"
          title="拖曳相片到這裡,或點擊選取"
          description="支援 JPG / PNG / GIF,可一次選多張"
          onUpload={(accepted) => setFiles((prev) => [...prev, ...accepted])}
        />
        {files.length > 0 && (
          // Compact FileItem 上傳完成有 bg-secondary 靜態底色 → 必 `gap-1`(4px)防貼邊
          // (見 file-item.spec.md「List wrapper canonical」+ item-anatomy「連續 item 貼邊合法性」)
          <div className="flex flex-col gap-1">
            {files.map((f, i) => (
              <FileItem
                key={`${f.name}-${i}`}
                mode="compact"
                name={f.name}
                actions={
                  <Button
                    variant="text"
                    size="xs"
                    iconOnly
                    startIcon={X}
                    aria-label={`移除 ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  />
                }
              />
            ))}
          </div>
        )}
      </div>
    )
  },
}

// WithUploadedList retired 2026-04-24(Dim 24 redundancy):教同樣「upload → list display」flow
// WithFileList(DS-canonical built-in `files` prop),保留 display story 重複 principle。Consumer
// 不傳 `files` 則自動回 pre-2026-04-24 consumer-composed pattern(無須 story 示範「不傳 prop」)。

// 2026-04-24 canonical:內建 `files` prop — FileUpload own success state display
export const WithFileList = {
  name: '內建 files 屬性',
  render: () => {
    type UploadItem = { id: string; name: string; size?: number; status?: 'uploading' | 'completed' | 'error'; progress?: number; description?: string }
    const [items, setItems] = useState<UploadItem[]>([
      { id: '1', name: '2026-Q1-report.pdf', size: 2_500_000, status: 'completed' },
      { id: '2', name: 'cover-image.png', size: 1_200_000, status: 'uploading', progress: 68 },
      { id: '3', name: 'malware.exe', status: 'error', description: '檔案類型不允許' },
    ])
    return (
      <div className="max-w-lg">
        <FileUpload
          multiple
          title="上傳附件"
          description="最多 20 MB / 檔"
          maxSize={20_000_000}
          files={items}
          fileListMode="compact"
          onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onUpload={(accepted) =>
            setItems((prev) => [
              ...prev,
              ...accepted.map((f, i) => ({
                id: `new-${Date.now()}-${i}`,
                name: f.name,
                size: f.size,
                status: 'completed' as const,
              })),
            ])
          }
        />
      </div>
    )
  },
}

// children 覆寫:Figma 匯入資產客製文案 / 品牌 logo
export const CustomChildren = {
  name: '自訂內容',
  render: () => (
    <div className="max-w-lg">
      <FileUpload accept="image/*,.svg,.fig" multiple onUpload={noop}>
        <ImageIcon size={32} className="text-primary" aria-hidden />
        <div className="flex flex-col gap-1">
          <div className="text-body-lg font-medium text-foreground">匯入你的設計資產</div>
          <div className="text-caption text-fg-secondary">
            支援 SVG / PNG / Figma 檔案 · 一次最多 50 個
          </div>
        </div>
      </FileUpload>
    </div>
  ),
}

// variant="button":表單內緊湊上傳(*Excel file 欄位場景)— 大 dropzone 太重時用按鈕觸發,
// 檔案清單在按鈕下方(Type B compact)。2026-06-03 加 — FileUpload 常出現在 form。
export const ButtonVariant = {
  name: '按鈕觸發(表單內)',
  render: () => {
    type Item = { id: string; name: string; size?: number; status?: 'completed' }
    const [items, setItems] = useState<Item[]>([
      { id: '1', name: 'UXP T-Phone.xlsx', size: 1_800_000, status: 'completed' },
    ])
    return (
      <div className="max-w-md">
        <FileUpload
          variant="button"
          buttonLabel="Choose Excel file" // i18n-allow: story label
          accept=".xls,.xlsx,.csv"
          files={items}
          fileListMode="compact"
          onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onUpload={(accepted) =>
            setItems((prev) => [
              ...prev,
              ...accepted.map((f, i) => ({ id: `n-${Date.now()}-${i}`, name: f.name, size: f.size, status: 'completed' as const })),
            ])
          }
        />
      </div>
    )
  },
}
