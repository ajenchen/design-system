// FileUpload 三層 story 共用的示範小工具(`_` 前綴 = 示範用的私有 helper,不進 index;同 Calendar/_calendar-demo.tsx)。
// 選了檔案就真的列出來(FileUpload 內建 files / onRemove 清單,file-item.spec.md「List wrapper canonical」)、可以移除;
// 被 accept / maxSize 擋下的檔案給錯誤提示(file-upload.principles「設 accept / maxSize 就一定要接 onReject」那則的同一種 Alert)。
// 依據:F-S2 user 09-08「一堆按鈕都無法正常反應」(登記簿 UD-A16)—— 樣本的上傳入口接空函式 = 點了選檔、什麼都沒發生。
import * as React from 'react'
import { FileUpload, type FileUploadStatus } from './file-upload'
import { Alert } from '@/design-system/components/Alert/alert'

type Reason = 'size' | 'type'

/** 一組選好的檔案:onUpload 加進清單(single = 換掉舊的那一個)、onRemove 拿掉、onReject 記下被擋的檔名 */
export function useDemoFiles({ single = false, initial = [] }: { single?: boolean; initial?: FileUploadStatus[] } = {}) {
  const [files, setFiles] = React.useState<FileUploadStatus[]>(initial)
  const [rejected, setRejected] = React.useState<{ names: string[]; reason: Reason } | null>(null)
  const onUpload = (accepted: File[]) => {
    setRejected(null)
    const added = accepted.map((f, i) => ({ id: `${f.name}-${Date.now()}-${i}`, name: f.name, size: f.size, status: 'completed' as const }))
    setFiles((prev) => (single ? added.slice(0, 1) : [...prev, ...added]))
  }
  const onRemove = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id))
  const onReject = (blocked: File[], reason: Reason) => setRejected({ names: blocked.map((f) => f.name), reason })
  return { files, onUpload, onRemove, onReject, rejected }
}

/** 被擋下的檔案:欄位下方一則 error Alert(同 file-upload.principles ErrorFeedbackRule ✅ 那則) */
export function RejectedAlert({ rejected, limit }: { rejected: { names: string[]; reason: Reason } | null; limit: string }) {
  if (!rejected) return null
  return (
    <Alert
      variant="error"
      appearance="subtle"
      title="以下檔案無法上傳"
      description={rejected.names.map((name) => (
        <span key={name} className="block">{rejected.reason === 'size' ? `「${name}」超過 ${limit} 上限` : `「${name}」格式不支援`}</span>
      ))}
    />
  )
}

/** 樣本用的 FileUpload:選了就列出來、可移除;有 accept / maxSize 時被擋下的給錯誤提示(單檔 = 沒開 multiple) */
export function LiveFileUpload({ limit, ...props }: Omit<React.ComponentProps<typeof FileUpload>, 'files' | 'onUpload' | 'onRemove' | 'onReject'> & { limit?: string }) {
  const demo = useDemoFiles({ single: !props.multiple })
  return (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <FileUpload {...props} files={demo.files} fileListMode="compact" onUpload={demo.onUpload} onRemove={demo.onRemove} onReject={demo.onReject} />
      <RejectedAlert rejected={demo.rejected} limit={limit ?? '大小'} />
    </div>
  )
}
