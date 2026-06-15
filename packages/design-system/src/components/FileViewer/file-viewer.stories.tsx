import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FileViewer, type FileInfo } from './file-viewer'
import { Button } from '@/design-system/components/Button/button'
import { Image as ImageIcon, Paperclip, Camera, Figma } from 'lucide-react'

/**
 * FileViewer 展示——真實業務場景(Jira / Notion / Figma / Gmail / 活動相集)。
 * 設計規則詳見 `file-viewer.spec.md`。
 *
 * 展示情境都用 picsum.photos 真實圖片 + 真實業務文案,避免 placeholder 與
 * lorem ipsum 汙染(CLAUDE.md # Story 範例最高準則)。
 */

const meta: Meta = {
  title: 'Design System/Components/FileViewer/展示',
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj

// 真實圖源:picsum.photos 可直連(seed 讓圖片固定)
const img = (seed: string, w = 1200, h = 800) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`

// ── Story 1:Jira 附件檢視(screenshot pack + 說明欄)─────────────────────────

const jiraScreenshots: FileInfo[] = [
  {
    id: 'jira-1',
    url: img('jira-login-err', 1440, 900),
    name: 'login-error-step-3.png',
    mimeType: 'image/png',
    size: 412_800,
    description:
      '產品登入流程錯誤截圖 — 帳戶鎖定後 OTP 沒寄出,使用者卡在輸入驗證碼頁面無法前進。',
    metadata: {
      '回報人': 'amy.huang@acme.com',
      '環境': 'Production iOS 17.4',
      '建立時間': '2026-04-18 14:32',
    },
  },
  {
    id: 'jira-2',
    url: img('jira-console-log', 1440, 900),
    name: 'console-network-log.png',
    mimeType: 'image/png',
    size: 296_400,
    description:
      'Chrome DevTools Network 分頁截圖 — /api/auth/otp/resend 回 429,已連續觸發 5 次。',
    metadata: {
      '回報人': 'amy.huang@acme.com',
      '環境': 'Production iOS 17.4',
      '建立時間': '2026-04-18 14:35',
    },
  },
  {
    id: 'jira-3',
    url: img('jira-sentry', 1440, 900),
    name: 'sentry-trace.png',
    mimeType: 'image/png',
    size: 524_000,
    description:
      'Sentry trace 顯示 OtpRateLimiter 觸發,但 cooldown 沒正確 reset,造成使用者永遠超限。',
    metadata: {
      '回報人': 'backend-team',
      '建立時間': '2026-04-18 15:02',
    },
  },
]

export const JiraAttachments: Story = {
  name: 'Jira — 附件多圖檢視',
  render: () => {
    const [open, setOpen] = React.useState(false)
    const [index, setIndex] = React.useState(0)
    const [files, setFiles] = React.useState(jiraScreenshots)

    const handleDescriptionChange = (fileId: string, description: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, description } : f)),
      )
    }

    return (
      <div className="flex flex-col gap-3 items-center">
        <Button
          variant="tertiary"
          startIcon={Paperclip}
          onClick={() => {
            setIndex(0)
            setOpen(true)
          }}
        >
          開啟 3 張附件檢視器
        </Button>
        <p className="text-footnote text-fg-muted text-center max-w-[520px] leading-relaxed">
          情境:PM 在 Jira bug ticket 中點開附件,逐張檢視 QA 上傳的截圖 + 閱讀回報人說明。
          支援 ← → 切換 / I 切換說明欄 / 編輯說明後 onBlur 持久化。
        </p>
        <FileViewer
          files={files}
          open={open}
          onOpenChange={setOpen}
          index={index}
          onIndexChange={setIndex}
          onDescriptionChange={handleDescriptionChange}
          showFilmstrip
        />
      </div>
    )
  },
}

// ── Story 2:Notion 頁面內多張配圖預覽 ──────────────────────────────────────

const notionInlinePics: FileInfo[] = [
  {
    id: 'notion-1',
    url: img('notion-hero', 1600, 900),
    name: 'q1-kickoff-hero.jpg',
    mimeType: 'image/jpeg',
    size: 892_000,
    description: '2026 Q1 kick-off 發布會主視覺稿 v3 — 已經 Marketing review 過。',
  },
  {
    id: 'notion-2',
    url: img('notion-agenda', 1600, 900),
    name: 'q1-kickoff-agenda.jpg',
    mimeType: 'image/jpeg',
    size: 532_000,
    description: '活動流程圖 — 10:00 報到 / 10:30 Keynote / 12:00 產品 demo / 14:00 圓桌。',
  },
  {
    id: 'notion-3',
    url: img('notion-venue', 1600, 900),
    name: 'venue-photo.jpg',
    mimeType: 'image/jpeg',
    size: 744_000,
    description: '場地確認 — 台北南港展覽館二樓,容納 500 人。',
  },
  {
    id: 'notion-4',
    url: img('notion-signage', 1600, 900),
    name: 'signage-preview.jpg',
    mimeType: 'image/jpeg',
    size: 612_000,
    description: '門口指引牌設計稿,需要 4/25 前交印刷廠。',
  },
]

export const NotionGallery: Story = {
  name: 'Notion — 頁內配圖相簿',
  render: () => {
    const [open, setOpen] = React.useState(false)
    const [startIdx, setStartIdx] = React.useState(0)

    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="grid grid-cols-4 gap-2 max-w-[640px]">
          {notionInlinePics.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setStartIdx(i)
                setOpen(true)
              }}
              className="aspect-[4/3] rounded-md overflow-hidden ring-1 ring-border hover:ring-border-hover transition-all"
            >
              <img
                src={f.url}
                alt={f.name}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
        <p className="text-footnote text-fg-muted text-center max-w-[520px] leading-relaxed">
          情境:Notion 文件內點擊任一配圖 → lightbox 開啟,可用 filmstrip 或 ← → 切換。
          預設 readOnly(文件作者控制說明),viewer 只呈現不能改。
        </p>
        <FileViewer
          files={notionInlinePics}
          initialIndex={startIdx}
          open={open}
          onOpenChange={setOpen}
          readOnly
          showFilmstrip
        />
      </div>
    )
  },
}

// ── Story 3:Figma file gallery(design review 單檔 zoom focus)───────────────

const figmaDesignFile: FileInfo[] = [
  {
    id: 'figma-1',
    url: img('figma-dashboard', 1920, 1200),
    name: 'Dashboard-v2-final.png',
    mimeType: 'image/png',
    size: 2_840_000,
    description:
      'Dashboard v2 最終設計稿 — 對齊 spec 2.3 節「Frozen columns + row actions」,可 zoom 看細節對齊。',
    metadata: {
      '設計師': 'Claire Wu',
      'Figma link': 'figma.com/file/xyz/Dashboard',
      '版本': 'v2.0-final',
      '最後更新': '2026-04-17',
    },
  },
]

export const FigmaDesignReview: Story = {
  name: 'Figma — 單檔縮放聚焦',
  render: () => {
    const [open, setOpen] = React.useState(false)

    return (
      <div className="flex flex-col gap-3 items-center">
        <Button variant="tertiary" startIcon={Figma} onClick={() => setOpen(true)}>
          開啟 Dashboard v2 設計稿
        </Button>
        <p className="text-footnote text-fg-muted text-center max-w-[520px] leading-relaxed">
          情境:設計 review 中,engineer 需要 zoom 看 spacing / color / font 細節。
          用滾輪或 +/- 縮放,拖曳 pan。`0` 重設為 100%,`F` Fit to page。
        </p>
        <FileViewer
          files={figmaDesignFile}
          open={open}
          onOpenChange={setOpen}
          readOnly
        />
      </div>
    )
  },
}

// ── Story 4:Gmail 多附件預覽(filmstrip + download 為主)────────────────────

const gmailAttachments: FileInfo[] = [
  {
    id: 'gmail-1',
    url: img('gmail-invoice', 1200, 1600),
    name: 'invoice-2026-04.png',
    mimeType: 'image/png',
    size: 423_000,
    description: '本月雲端服務請款單 — AWS + Vercel + Supabase。',
  },
  {
    id: 'gmail-2',
    url: img('gmail-receipt', 1200, 1600),
    name: 'receipt-office-supplies.jpg',
    mimeType: 'image/jpeg',
    size: 312_000,
    description: '辦公用品採購收據 — 申請報帳用。',
  },
  {
    id: 'gmail-3',
    url: img('gmail-ticket', 1200, 1600),
    name: 'ticket-confirmation.png',
    mimeType: 'image/png',
    size: 198_000,
    description: 'Google Cloud Next 2026 票券確認信 — 5/12-5/14 拉斯維加斯。',
  },
]

export const GmailAttachmentPreview: Story = {
  name: 'Gmail — 多附件預覽',
  render: () => {
    const [open, setOpen] = React.useState(false)

    return (
      <div className="flex flex-col gap-3 items-center">
        <Button variant="primary" startIcon={Paperclip} onClick={() => setOpen(true)}>
          預覽 3 個附件
        </Button>
        <p className="text-footnote text-fg-muted text-center max-w-[520px] leading-relaxed">
          情境:收到寄來帶多個附件的 email,快速預覽哪個需要下載存檔。
          readOnly(使用者不能改寄件人寫的說明),filmstrip 顯示全部附件方便切換。
        </p>
        <FileViewer
          files={gmailAttachments}
          open={open}
          onOpenChange={setOpen}
          readOnly
          showFilmstrip
        />
      </div>
    )
  },
}

// ── Story 5:活動相片集(filmstrip off 單張 focus 模式)─────────────────────

const eventPhotos: FileInfo[] = Array.from({ length: 6 }, (_, i) => ({
  id: `event-${i}`,
  url: img(`event-day-${i}`, 1600, 1067),
  name: `event-photo-${String(i + 1).padStart(2, '0')}.jpg`,
  mimeType: 'image/jpeg',
  size: 1_200_000 + i * 80_000,
  description: [
    '主舞台 keynote 開場 — CEO 講述 2026 公司願景。',
    '產品 demo 區 — 實機操作 AI 助理新功能。',
    '茶歇時間 — 合作夥伴交流。',
    '圓桌討論 — 未來協作工具的三個關鍵轉變。',
    '講者合影 — 感謝 12 位分享嘉賓。',
    '活動尾聲 — 全體與會者大合照。',
  ][i],
}))

export const EventPhotosCollection: Story = {
  name: '活動相集 — 縮圖膠卷展開',
  render: () => {
    const [open, setOpen] = React.useState(false)
    const [index, setIndex] = React.useState(0)
    const [files, setFiles] = React.useState(eventPhotos)

    return (
      <div className="flex flex-col gap-3 items-center">
        <Button
          variant="tertiary"
          startIcon={Camera}
          onClick={() => {
            setIndex(0)
            setOpen(true)
          }}
        >
          檢視活動相集
        </Button>
        <p className="text-footnote text-fg-muted text-center max-w-[520px] leading-relaxed">
          情境:行銷團隊上傳活動當天 6 張照片,PM 逐張檢視並補充說明(可編輯)。
          filmstrip 顯示 6 張 thumbnail,scroll 時顯示 fade mask + arrows。
        </p>
        <FileViewer
          files={files}
          open={open}
          onOpenChange={setOpen}
          index={index}
          onIndexChange={setIndex}
          onDescriptionChange={(id, desc) =>
            setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, description: desc } : f)))
          }
          showFilmstrip
        />
      </div>
    )
  },
}

// ── Story 6:Fallback — 未知檔案類型 ──────────────────────────────────────

const unknownFile: FileInfo[] = [
  {
    id: 'unknown-1',
    url: '/fake-archive.zip',
    name: 'project-backup-2026-04.zip',
    mimeType: 'application/zip',
    size: 48_200_000,
    description: '專案完整備份 — 含 source code / assets / db dump,僅供下載。',
  },
]

export const FallbackUnknownType: Story = {
  name: '後備顯示 — 不支援的檔案類型',
  render: () => {
    const [open, setOpen] = React.useState(false)

    return (
      <div className="flex flex-col gap-3 items-center">
        <Button variant="tertiary" startIcon={ImageIcon} onClick={() => setOpen(true)}>
          開啟無 renderer 支援的檔案
        </Button>
        <p className="text-footnote text-fg-muted text-center max-w-[520px] leading-relaxed">
          情境:專案備份 zip 檔案無對應 renderer,FallbackRenderer 兜底顯示檔名 +
          「請下載檢視」訊息。Toolbar 隱藏 zoom controls(capabilities.zoom = false)。
        </p>
        <FileViewer files={unknownFile} open={open} onOpenChange={setOpen} />
      </div>
    )
  },
}

/**
 * OpenSnapshot — visual-audit 專用 story。
 * 初始 `open={true}` 讓 FileViewer render 時已打開,Playwright 截圖抓完整
 * toolbar + image renderer + action-bar。對齊 Dialog / Sheet / Popover OpenSnapshot canonical。
 */
export const OpenSnapshot: Story = {
  name: '開啟狀態',
  tags: ['!autodocs'],
  render: () => {
    const [open, setOpen] = React.useState(true)
    const [index, setIndex] = React.useState(0)
    return (
      <FileViewer
        files={jiraScreenshots}
        open={open}
        onOpenChange={setOpen}
        index={index}
        onIndexChange={setIndex}
      />
    )
  },
}
