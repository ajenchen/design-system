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
  name: '單檔上傳(履歷 CV)',
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
  name: '批次上傳(相簿匯入)',
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
          <div className="flex flex-col">
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

// 搭配已上傳清單:Notion / Slack 附件 flow — 上傳後檔案出現在下方
export const WithUploadedList = {
  name: '搭配已上傳清單(Notion 附件)',
  render: () => {
    const [files, setFiles] = useState<{ name: string; description: string }[]>([
      { name: '2026-Q1-planning.pdf', description: '2.3 MB' },
      { name: 'design-review-notes.docx', description: '540 KB' },
    ])
    return (
      <div className="max-w-lg flex flex-col gap-3">
        <FileUpload
          multiple
          title="加入附件到這則留言"
          description="任何檔案類型,最多 20 MB / 檔"
          maxSize={20_000_000}
          onUpload={(accepted) =>
            setFiles((prev) => [
              ...prev,
              ...accepted.map((f) => ({
                name: f.name,
                description: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
              })),
            ])
          }
        />
        {files.length > 0 && (
          <div className="flex flex-col border border-divider rounded-lg overflow-hidden">
            {files.map((f, i) => (
              <FileItem
                key={`${f.name}-${i}`}
                mode="rich"
                name={f.name}
                description={f.description}
                thumbnailSrc={`https://i.pravatar.cc/80?u=${encodeURIComponent(f.name)}`}
                actions={
                  <Button
                    variant="text"
                    size="sm"
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

// children 覆寫:Figma 匯入資產客製文案 / 品牌 logo
export const CustomChildren = {
  name: 'Custom children(完全客製)',
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
