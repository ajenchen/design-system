// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { X, Download, RotateCw } from 'lucide-react'
import { FileItem } from './file-item'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/FileItem/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-lg">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── WhenToUse — 何時使用 FileItem ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 FileItem 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/FileItem/展示" name="豐富樣式"><span className="text-primary hover:underline font-medium cursor-pointer">圖片 / 設計稿上傳 — 需要縮圖預覽(豐富樣式)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileItem/展示" name="緊湊樣式"><span className="text-primary hover:underline font-medium cursor-pointer">CSV / JSON 批次匯入的密集清單(緊湊樣式)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileItem/展示" name="懸停替換"><span className="text-primary hover:underline font-medium cursor-pointer">上傳完成後滑入整列、狀態 icon 換成下載鈕(懸停替換)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileItem/展示" name="已上傳"><span className="text-primary hover:underline font-medium cursor-pointer">工單 / 訊息附件的已上傳靜態檔案</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileItem/展示" name="緊湊 混合"><span className="text-primary hover:underline font-medium cursor-pointer">同一批次混合上傳中 / 完成 / 失敗狀態的清單</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="❌ 不用 FileItem 做純連結展示（已上傳檔案）"
        note="FileItem 承載上傳狀態、進度、錯誤。靜態檔名列表改用 LinkInput 或純 <a> 連結。Google Drive 的「最近開啟」是檔案卡片，不用 FileItem"
      >
        <Label warn>靜態檔名 → LinkInput / &lt;a&gt;，FileItem 只用上傳流程</Label>
      </Rule>

      <Rule
        title="❌ 不用 FileItem 做下載進度"
        note="FileItem 專為上傳設計。下載進度改用自訂 progress component 或瀏覽器原生下載 UI。Figma 的資源下載不用 FileItem"
      >
        <Label warn>下載進度 → 自訂或瀏覽器原生，FileItem 只管上傳</Label>
      </Rule>

      <Rule
        title="❌ 不用 FileItem 做相片 / 影片 gallery"
        note="Gallery 需要 grid 佈局、大圖縮圖。FileItem 是清單單行。改用 grid / Carousel。Instagram 的相簿是 grid，不是 FileItem"
      >
        <Label warn>Gallery → grid / Carousel，FileItem 是上傳清單</Label>
      </Rule>

      <Rule
        title="❌ 不用 FileItem 表達資料夾階層"
        note="FileItem 是平面列表。資料夾樹改用 TreeView。OneDrive 的資料夾結構用 TreeView，檔案列表用 FileItem"
      >
        <Label warn>資料夾樹 → TreeView，FileItem 是平面清單</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const ModeRule: Story = {
  name: '模式 選擇（緊湊 vs 豐富）',
  render: () => (
    <div>
      <Rule
        title="rich — 需要縮圖預覽的檔案（圖片、文件）"
        note="左側 Avatar 48px square 顯示縮圖或檔案類型 icon,右側檔名 + 大小 + 進度 bar。掃描模式(text-body 14px + leading-compact;兩 mode 統一),資訊容量較高"
      >
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
        <Label>↑ 設計 / 影音類檔案、需要視覺辨識的場景</Label>
      </Rule>

      <Rule
        title="compact — 批次上傳的一般檔案（CSV / JSON）"
        note="左側 Paperclip 16px icon,掃描模式(text-body + leading-compact,desc 為 text-caption;兩 mode 統一),資訊密度高。適合一次顯示 10+ 檔案的 batch upload 清單"
      >
        <div className="flex flex-col gap-1">
          <FileItem
            name="users.csv"
            mode="compact"
            status="completed"
            progress={100}
          />
          <FileItem
            name="orders.json"
            mode="compact"
            status="uploading"
            progress={42}
          />
          <FileItem
            name="products.xlsx"
            mode="compact"
            status="error"
            description="檔案格式不支援"
          />
        </div>
        <Label>↑ 數據匯入、日誌上傳等批次場景</Label>
      </Rule>

      <Rule
        title="判斷法：「檔案需要視覺預覽,還是清單掃視？」"
        note="需要預覽 → rich(圖文並列)/ 需要快速掃視多個 → compact(單行列表,預設)"
      >
        <Label>圖片類 / 需要縮圖用 rich;logs / data export / batch 用 compact（預設）</Label>
      </Rule>
    </div>
  ),
}

export const StatusProgressRule: Story = {
  name: '上傳狀態與進度視覺',
  render: () => (
    <div>
      <Rule
        title="uploading — progress bar info 色 + 百分比 description"
        note="上傳中清楚展示進度,讓使用者知道「多久能好」而不是只看到一個等待狀態"
      >
        <FileItem
          name="large-backup.zip"
          description="128 MB · 上傳中 42%"
          status="uploading"
          progress={42}
          mode="rich"
        />
      </Rule>

      <Rule
        title="completed — 成功 icon + 100% 完成條"
        note="完成後保留 100% 綠色完成條(surface=upload-manager narrative —— 上傳狀態是重點,Dropbox / Google Drive 慣例),成功 icon 再加一層明確表達「完成」。檔案變可點擊(下載)"
      >
        <FileItem
          name="users-export.csv"
          description="1.2 MB"
          status="completed"
          mode="rich"
        />
      </Rule>

      <Rule
        title="error — 錯誤 icon + error 訊息 description + 可重試"
        note="失敗必須清楚告知原因——不只顯示「失敗」,要有具體錯誤訊息讓使用者知道怎麼修。compact 模式下 error 會強制顯示 description"
      >
        <FileItem
          name="broken-file.pdf"
          description="檔案損毀,請重新上傳"
          status="error"
          mode="rich"
          actions={<Button variant="text" size="xs" iconOnly startIcon={RotateCw} aria-label="重試" />}
        />
      </Rule>

      <Rule
        title="無 status — 已上傳的靜態檔案"
        note="上傳已完成且已保存,不需要進度 / 狀態標示。可傳 onClick 讓整個 item 變可點擊下載"
      >
        <FileItem
          name="final-contract.pdf"
          description="已簽署 · 2.1 MB"
          mode="rich"
          onClick={() => {}}
          actions={<Button variant="text" size="xs" iconOnly startIcon={Download} aria-label="下載" />}
        />
      </Rule>
    </div>
  ),
}

export const ActionsRule: Story = {
  name: '動作 使用',
  render: () => (
    <div>
      <Rule
        title="Uploading 時：Cancel action"
        note="上傳進行中使用者應該可以取消。用 X icon 表達「取消上傳」"
      >
        <FileItem
          name="massive-video.mov"
          description="450 MB · 上傳中 12%"
          status="uploading"
          progress={12}
          mode="rich"
          actions={<Button variant="text" size="xs" iconOnly startIcon={X} aria-label="取消上傳" />}
        />
      </Rule>

      <Rule
        title="Error 時：Retry + Remove"
        note="失敗時使用者需要兩個選項——重試(可能只是暫時網路問題)或移除(放棄這個檔案)"
      >
        <FileItem
          name="failed-upload.pdf"
          description="網路中斷,請重試"
          status="error"
          mode="rich"
          actions={
            <div className="flex gap-1">
              <Button variant="text" size="xs" iconOnly startIcon={RotateCw} aria-label="重試" />
              <Button variant="text" size="xs" iconOnly startIcon={X} aria-label="移除" />
            </div>
          }
        />
      </Rule>

      <Rule
        title="Completed 時：Download / View"
        note="完成後使用者可以下載或查看。action 不必是 dismiss,重點在後續可能的動作"
      >
        <FileItem
          name="report-final.pdf"
          description="上傳完成 · 3.2 MB"
          status="completed"
          mode="rich"
          actions={<Button variant="text" size="xs" iconOnly startIcon={Download} aria-label="下載" />}
        />
      </Rule>

      <Rule
        title="❌ 重要 action 只靠 hover 才出現"
        note="「移除」「取消」這類影響資料的 action 必須 persistent visible,不能 hover 才顯示。觸控裝置無法 hover,會錯過關鍵動作"
      >
        <Label warn>hover-only actions 只適合純便利功能(如「複製連結」),關鍵動作永遠 visible</Label>
      </Rule>
    </div>
  ),
}

