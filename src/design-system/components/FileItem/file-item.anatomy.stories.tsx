import type { Meta, StoryObj } from '@storybook/react'
import { X, Download, RotateCw } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/FileItem/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>FileItem 是組合元件——Prefix(Avatar 或 Paperclip)+ Content(name + description + 可選 progress bar)+ 可選 Actions suffix。基於 item-layout pattern。</Desc>
        <div className="flex flex-col gap-2 max-w-lg">
          <FileItem
            name="Q1-report.pdf"
            description="2.4 MB · 上傳中 75%"
            status="uploading"
            progress={75}
            mode="rich"
          />
          <FileItem
            name="beach-photo.jpg"
            description="4.8 MB"
            mode="rich"
            thumbnailSrc="https://i.pravatar.cc/112?img=3"
          />
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['name', 'string', '必填', '檔名'],
                ['mode', "'compact' | 'rich'", "'compact'", 'compact=Paperclip 16px icon / rich=Avatar 56px 縮圖'],
                ['status', "'uploading' | 'completed' | 'error'", '—', '上傳狀態(不傳=已上傳靜態)'],
                ['progress', 'number', '—', '上傳進度 0-100(uploading 時顯示 bar)'],
                ['description', 'string', '—', 'rich 任意場景 / compact 只有 error 才顯示'],
                ['thumbnailSrc', 'string', '—', 'rich mode 的縮圖 URL(圖片類檔案)'],
                ['actions', 'ReactNode', '—', 'suffix actions(例:delete / cancel button)'],
                ['onDownload', '() => void', '—', "hover-swap:status='completed' 時,row hover ✓ 換成 Download ↓ button(幾何=Button sm/xs,與 actions 對齊)"],
                ['onRetry', '() => void', '—', "hover-swap:status='error' 時,row hover ✗ 換成 RotateCw ⟲ button(幾何同上)"],
                ['onClick', '() => void', '—', '傳入後整個 item 變可點擊(hover bg + cursor-pointer)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const ModeMatrix: Story = {
  name: 'Mode 對照(compact vs rich)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>rich — Avatar 56px square 在左</H3>
        <Desc>閱讀模式(text-body 14px 1.5 line-height),資訊容量較高。適合圖片 / 文件 / 需要縮圖的場景。</Desc>
        <div className="flex flex-col gap-2 max-w-lg">
          <FileItem name="Q1-report.pdf" description="2.4 MB · 已上傳" mode="rich" />
          <FileItem name="photo.jpg" description="4.8 MB" mode="rich" thumbnailSrc="https://i.pravatar.cc/112?img=3" />
          <FileItem name="contract.pdf" description="1.2 MB · 上傳中 45%" status="uploading" progress={45} mode="rich" />
        </div>
      </div>

      <div>
        <H3>compact（預設）— Paperclip 16px icon 在左</H3>
        <Desc>掃描模式(text-caption),資訊密度高。適合批次上傳的 logs / CSV / JSON。Description 只在 error 才顯示。</Desc>
        <div className="flex flex-col gap-1 max-w-lg">
          <FileItem name="users.csv" mode="compact" status="completed" progress={100} />
          <FileItem name="orders.json" mode="compact" status="uploading" progress={42} />
          <FileItem name="products.xlsx" mode="compact" status="error" description="檔案格式不支援" />
          <FileItem name="logs.txt" mode="compact" status="completed" progress={100} />
        </div>
      </div>

      <div>
        <H3>Mode 對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Mode</Th><Th>Prefix</Th><Th>Typography</Th><Th>Description</Th><Th>使用場景</Th></tr></thead>
            <tbody>
              <tr><Td mono>compact（預設）</Td><Td>Paperclip 16px</Td><Td>掃描模式(text-caption)</Td><Td>只有 error 才顯示</Td><Td>批次上傳、一般檔案</Td></tr>
              <tr><Td mono>rich</Td><Td>Avatar 48px square</Td><Td>閱讀模式(text-body)</Td><Td>任何場景</Td><Td>圖片、文件、需要預覽</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: 'Mode × Density 對照',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Mode 決定 density,不走 size prop</H3>
        <Desc>
          FileItem **沒有 size prop**——兩種 mode(compact / rich)已經覆蓋所有密度需求。對齊
          Dropbox / Google Drive / Linear 的檔案清單慣例:compact 是系統列表預設,rich 是 media-heavy
          場景(照片、需要縮圖的場景)。Size tier 的區別在 mode 上已足夠表達。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Dimension</Th>
                <Th>compact(預設)</Th>
                <Th>rich</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>Prefix</Td><Td mono>Paperclip 16px(foreground)</Td><Td mono>Avatar 56px square(縮圖或 fallback)</Td></tr>
              <tr><Td>Row 高度(無 bar)</Td><Td mono>h-field-md(32/36 density)</Td><Td mono>≈ 56px + py</Td></tr>
              <tr><Td>Typography</Td><Td mono>text-body leading-compact(掃描模式)</Td><Td mono>text-body 預設行高(閱讀模式)</Td></tr>
              <tr><Td>Description</Td><Td>僅 error 才顯示</Td><Td>任何場景都可顯示</Td></tr>
              <tr><Td>Progress bar</Td><Td mono>絕對定位 2px 在底</Td><Td mono>inline 4px,bar 底部對齊 avatar</Td></tr>
              <tr><Td>Actions</Td><Td>右側 sm iconOnly</Td><Td>右側 sm iconOnly(多 action 橫排)</Td></tr>
              <tr><Td>使用場景</Td><Td>批次上傳、log 列表、CSV/JSON</Td><Td>圖片上傳、文件附件、需預覽的檔案</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>同一批 5 個檔案:compact vs rich</H3>
        <Desc>同樣 5 個檔案,兩種 mode 呈現的視覺密度差異——compact 可一目 5 行掃完,rich 需滾動且視覺重量高。</Desc>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-caption text-fg-muted mb-2 font-mono">mode="compact"</div>
            <div className="flex flex-col gap-0 max-w-sm border border-border rounded-md">
              <FileItem name="Q1-report.pdf" mode="compact" status="completed" progress={100} />
              <FileItem name="users.csv" mode="compact" status="completed" progress={100} />
              <FileItem name="products.xlsx" mode="compact" status="uploading" progress={62} />
              <FileItem name="logs.txt" mode="compact" status="error" description="檔案格式不支援" />
              <FileItem name="invoice-2026.pdf" mode="compact" status="completed" progress={100} />
            </div>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2 font-mono">mode="rich"</div>
            <div className="flex flex-col gap-2 max-w-sm">
              <FileItem name="Q1-report.pdf" description="2.4 MB · 已上傳" mode="rich" />
              <FileItem name="users.csv" description="120 KB · 已上傳" mode="rich" />
              <FileItem name="products.xlsx" description="1.2 MB · 上傳中 62%" mode="rich" status="uploading" progress={62} />
              <FileItem name="logs.txt" description="檔案格式不支援" mode="rich" status="error" />
              <FileItem name="invoice-2026.pdf" description="880 KB · 已上傳" mode="rich" />
            </div>
          </div>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          選 mode 的 test:檔案是「資料 row」→ compact;是「內容物件」(圖片 / 附件)→ rich。
        </p>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為(uploading / completed / error / 靜態)',
  render: () => (
    <div className="flex flex-col gap-4 max-w-lg">
      <div>
        <H3>所有狀態對照</H3>
        <div className="flex flex-col gap-2">
          <FileItem name="uploading.pdf" description="2.4 MB · 上傳中 60%" status="uploading" progress={60} mode="rich" actions={<Button variant="tertiary" size="sm" iconOnly startIcon={X} aria-label="取消" />} />
          <FileItem name="completed.pdf" description="2.4 MB · 已上傳" status="completed" mode="rich" actions={<Button variant="tertiary" size="sm" iconOnly startIcon={Download} aria-label="下載" />} />
          <FileItem name="error.pdf" description="網路中斷,請重試" status="error" mode="rich" actions={<div className="flex gap-1"><Button variant="tertiary" size="sm" iconOnly startIcon={RotateCw} aria-label="重試" /><Button variant="tertiary" size="sm" iconOnly startIcon={X} aria-label="移除" /></div>} />
          <FileItem name="static.pdf" description="已儲存 · 1.2 MB" mode="rich" onClick={() => {}} actions={<Button variant="tertiary" size="sm" iconOnly startIcon={Download} aria-label="下載" />} />
        </div>
      </div>

      <div>
        <H3>Progress bar 色彩</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Status</Th><Th>Progress bar 色</Th><Th>Status icon</Th></tr></thead>
            <tbody>
              <tr><Td mono>uploading</Td><Td mono>bg-primary</Td><Td>—</Td></tr>
              <tr><Td mono>completed</Td><Td mono>bg-success(100%)</Td><Td>CircleCheck(text-success)</Td></tr>
              <tr><Td mono>error</Td><Td mono>bg-error(失敗點位置)</Td><Td>XCircle(text-error)</Td></tr>
              <tr><Td>(無 status)</Td><Td>無 bar</Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}
