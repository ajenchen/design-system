import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, waitFor } from '@storybook/test'
import { FileViewer, type FileInfo } from './file-viewer'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { FileItem } from '@/design-system/components/FileItem/file-item'
import { SimulatedBrowser } from '@/design-system/stories-helpers/scene/simulated-browser'
import { Paperclip, Camera, Figma } from 'lucide-react'

/**
 * FileViewer 展示——真實業務場景(Jira / Notion / Figma / Gmail / 活動相集)。
 * 設計規則詳見 `file-viewer.spec.md`。
 *
 * 展示情境都用 picsum.photos 真實圖片 + 真實業務文案,避免 placeholder 與
 * lorem ipsum 汙染(CLAUDE.md # Story 範例最高準則)。
 */

const meta: Meta = {
  title: 'Design System/Components/FileViewer/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: '集中預覽圖片與文件，並提供切換、資訊面板和受能力控制的工具列。使用者需要在不離開當前工作流的情況下檢視一個或一組檔案時使用。' } },
  },
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

// 每則的情境說明放 docs、用人話寫;畫布上只留產品裡真的會出現的入口(之前每則都是示範鈕 + 灰色「情境:…」便條)
export const JiraAttachments: Story = {
  name: 'Jira — 附件多圖檢視',
  parameters: {
    docs: { description: { story: 'PM 在 Jira 的 bug 單裡點開 QA 上傳的附件,逐張看截圖、讀回報人寫的說明。左右鍵切換檔案,按 I 開關說明欄;說明欄可以直接改,離開輸入框就存起來。' } },
  },
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
      <>
        <Button
          variant="tertiary"
          startIcon={Paperclip}
          onClick={() => {
            setIndex(0)
            setOpen(true)
          }}
        >
          login-error-step-3.png 等 3 個附件
        </Button>
        <FileViewer
          files={files}
          open={open}
          onOpenChange={setOpen}
          index={index}
          onIndexChange={setIndex}
          onDescriptionChange={handleDescriptionChange}
          showFilmstrip
        />
      </>
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
  name: 'Notion — 頁內配圖',
  parameters: {
    docs: { description: { story: 'Notion 頁面裡插了幾張配圖,點任一張就用檢視器打開,可以用底下的縮圖列或左右鍵切換。說明由文件作者寫,這裡只能看、不能改。' } },
  },
  render: () => {
    const [open, setOpen] = React.useState(false)
    const [index, setIndex] = React.useState(0)

    // 入口用 FileItem 清單(縮圖 + 檔名 + 大小,點列用 FileViewer 開,file-item.spec.md「Row-click」),
    // 不再手拼縮圖格(user 2026-10-21 09:25 對這一題回覆照建議 = 不定新長相,用既有元件當入口;之前是原生 <button> 包 <img> + 自訂 4:3 比例 / 圓角 / 框)
    return (
      <>
        {/* @layout-space-magic-ok: rich FileItem 清單列距 8px(file-item.spec.md:268 多 item 間距表 Rich + surface=form 那一列 gap-2) */}
        <div className="flex flex-col gap-2 w-full max-w-md">
          {notionInlinePics.map((f, i) => (
            <FileItem
              key={f.id}
              mode="rich"
              name={f.name}
              description={`${Math.round((f.size ?? 0) / 1000)} KB`}
              thumbnailSrc={f.url}
              onClick={() => {
                setIndex(i)
                setOpen(true)
              }}
            />
          ))}
        </div>
        <FileViewer
          files={notionInlinePics}
          open={open}
          onOpenChange={setOpen}
          index={index}
          onIndexChange={setIndex}
          readOnly
          showFilmstrip
        />
      </>
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
      '營運儀表板 v2 最終設計稿 — 凍結欄與列操作已定案,可 zoom 檢視 spacing 與色彩細節。',
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
  parameters: {
    docs: { description: { story: '設計審查時,工程師要放大看設計稿的間距、顏色與字。用滾輪或 + / − 縮放、拖曳移動畫面;按 `0` 回到 100%,按 `F` 符合頁面。' } },
  },
  render: () => {
    const [open, setOpen] = React.useState(false)

    return (
      <>
        <Button variant="tertiary" startIcon={Figma} onClick={() => setOpen(true)}>
          開啟 Dashboard v2 設計稿
        </Button>
        <FileViewer
          files={figmaDesignFile}
          open={open}
          onOpenChange={setOpen}
          readOnly
        />
      </>
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
  parameters: {
    docs: { description: { story: '收到一封帶多個附件的信,先快速預覽哪些需要下載存檔。寄件人寫的說明不能改,底下縮圖列列出全部附件方便切換。' } },
  },
  render: () => {
    const [open, setOpen] = React.useState(false)

    return (
      <>
        {/* 單獨的觸發鈕一律 tertiary(story-rules.md「單獨的觸發鈕 / 取消 / 一般輔助動作一律 tertiary」;之前是 primary,同頁其他觸發鈕都是 tertiary) */}
        <Button variant="tertiary" startIcon={Paperclip} onClick={() => setOpen(true)}>
          預覽 3 個附件
        </Button>
        <FileViewer
          files={gmailAttachments}
          open={open}
          onOpenChange={setOpen}
          readOnly
          showFilmstrip
        />
      </>
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
  parameters: {
    docs: { description: { story: '行銷團隊上傳了活動當天的 6 張照片,PM 逐張檢視並補上說明(說明可以編輯)。底下的縮圖列放不下時可以左右捲動。' } },
  },
  render: () => {
    const [open, setOpen] = React.useState(false)
    const [index, setIndex] = React.useState(0)
    const [files, setFiles] = React.useState(eventPhotos)

    return (
      <>
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
      </>
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
  parameters: {
    docs: { description: { story: 'zip 這類無法在瀏覽器預覽的檔案,檢視器改顯示檔名與「請下載後檢視」的提示,工具列也不出現縮放按鈕。' } },
  },
  render: () => {
    const [open, setOpen] = React.useState(false)

    return (
      <>
        <Button variant="tertiary" startIcon={Paperclip} onClick={() => setOpen(true)}>
          project-backup-2026-04.zip
        </Button>
        <FileViewer files={unknownFile} open={open} onOpenChange={setOpen} />
      </>
    )
  },
}

// OpenSnapshot — visual-audit 專用 story(test-only;用 // 註解,不進 docs 說明)。
// 初始 `open={true}` 讓 FileViewer render 時已打開,Playwright 截圖抓完整
// toolbar + image renderer + action-bar。對齊 Dialog / Sheet / Popover OpenSnapshot canonical。
export const OpenSnapshot: Story = {
  name: '開啟狀態',
  tags: ['test-only'],
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
  play: async () => {
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('role', 'dialog')
      expect(document.activeElement).toHaveAttribute('tabindex', '-1')
    })
  },
}

// 並存區域(`persistentElements`)—— 與 Dialog 同一份契約、同一支 primitive。
// FileViewer **直接建 Radix Root/Portal**、不經 DS Dialog,所以只改 Dialog 會漏掉它
// (2026-09-08 跨模型審查指出)。這個 story 也是「快捷鍵作用域」的驗證場:
// 檢視器開著時,在右邊常駐區的按鈕上按方向鍵**不得**切換檔案。
// 閘:`scripts/overlay-shortcut-scope-invariant.mjs`。
export const CoexistenceContract: Story = {
  name: '並存 — 常駐區域仍可用',
  tags: ['test-only'],
  // 說明放 docs(整頁示範畫布下方不放備註;之前經 SimulatedBrowser 的 caption 印在畫布下方)
  parameters: {
    // 整頁示範:撐滿 story、與邊界四周留 loose(SimulatedBrowser 的 height="fill" 用法);
    // 之前固定 640 高 + padded 版面,舞台窄到檢視器工具列的縮放輸入框右側被裁
    layout: 'fullscreen',
    docs: { description: { story: '模擬:檔案檢視器(有自己的網址)開著時只佔舞台,右側評論側欄照常可用。' } },
  },
  render: () => {
    const [open, setOpen] = React.useState(true)
    const [index, setIndex] = React.useState(0)
    const asideRef = React.useRef<HTMLElement | null>(null)
    const [stage, setStage] = React.useState<HTMLDivElement | null>(null)
    const toolbarRef = React.useRef<HTMLDivElement | null>(null)
    const keepAll = React.useCallback(() => [asideRef.current, toolbarRef.current].filter((el): el is HTMLElement => !!el), [])
    const [aside, setAside] = React.useState('')
    const [comments, setComments] = React.useState<string[]>(['Betty:截圖二的按鈕文案要跟規格對一下。'])
    return (
      <div className="flex h-dvh flex-col p-[var(--layout-space-loose)]">
        <SimulatedBrowser url="/projects/8821/tasks/4821/attachments" canBack height="fill" toolbarRef={toolbarRef}>
          <div ref={setStage} className="relative flex min-w-0 flex-1 flex-col overflow-hidden" style={{ transform: 'translateZ(0)' }}>
            <FileViewer
              files={jiraScreenshots}
              open={open}
              onOpenChange={setOpen}
              index={index}
              onIndexChange={setIndex}
              persistentElements={keepAll}
              portalContainer={stage}
            />
          </div>
          <aside ref={asideRef} id="fv-aside" aria-label="評論" className="flex w-[300px] shrink-0 flex-col gap-[var(--layout-space-loose)] border-l border-divider bg-surface p-[var(--layout-space-loose)]">
            <h2 className="text-body-lg font-medium">評論</h2>
            <ul className="flex flex-col gap-1">
              {comments.map((c, i) => <li key={i} className="text-body">{c}</li>)}
            </ul>
            <Field id="fv-aside-input">
              <FieldLabel>新增評論</FieldLabel>
              <Input placeholder="可以打字" value={aside} onChange={(e) => setAside(e.target.value)} />
            </Field>
            <div>
              <Button id="fv-aside-btn" variant="primary" disabled={!aside.trim()} onClick={() => { const t = aside.trim(); if (t) { setComments((c) => [...c, `你:${t}`]); setAside('') } }}>送出</Button>
            </div>
          </aside>
        </SimulatedBrowser>
      </div>
    )
  },
}
