import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, FolderOpen, Info, Keyboard } from 'lucide-react'
import { FileViewer, type FileInfo } from './file-viewer'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/design-system/components/Dialog/dialog'
import { Button } from '@/design-system/components/Button/button'

/**
 * FileViewer 設計原則(do / don't)——使用判斷指南。
 *
 * Rule / Label 共用模式對齊 Dialog / Sheet principles。每條 Rule 必搭配真實業務場景
 * (Jira / Notion / Figma / Gmail 等)與 live 互動,避免 Lorem ipsum / A/B/C。
 */

const meta: Meta = {
  title: 'Design System/Components/FileViewer/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && (
      <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">
        {note}
      </p>
    )}
    <div className="flex flex-wrap gap-3 items-start">{children}</div>
  </div>
)

const Label = ({
  children,
  warn,
}: {
  children: React.ReactNode
  warn?: boolean
}) => (
  <p
    className={`text-footnote leading-normal ${
      warn ? 'text-error font-medium' : 'text-fg-muted'
    }`}
  >
    {children}
  </p>
)

// Real file sources — picsum.photos seeded images(與 stories.tsx 一致)
const img = (seed: string, w = 1600, h = 1000) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`

// ── Rule 1:何時用 FileViewer vs Dialog ───────────────────────────────────────

const jiraAttachments: FileInfo[] = [
  {
    id: 'jira-1',
    url: img('r1-login', 1440, 900),
    name: 'login-error-step-3.png',
    mimeType: 'image/png',
    size: 412_800,
    description: '產品登入流程錯誤截圖 — 帳戶鎖定後 OTP 未寄出,使用者卡在驗證碼頁面。',
    metadata: { 回報人: 'amy.huang@acme.com', 環境: 'Production iOS 17.4' },
  },
  {
    id: 'jira-2',
    url: img('r1-network', 1440, 900),
    name: 'devtools-network.png',
    mimeType: 'image/png',
    size: 318_000,
    description: 'Chrome DevTools 顯示 /api/otp/resend 回 429(rate limited)。',
    metadata: { 回報人: 'amy.huang@acme.com' },
  },
]

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件 ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [fvOpen, setFvOpen] = React.useState(false)
    return (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
        <p>適合 FileViewer 的真實業務場景(點擊跳轉「展示」頁範例):</p>
        <ul className="space-y-1">
          <li>
            <LinkTo kind="Design System/Components/FileViewer/展示" name="Jira — 附件多圖檢視"><span className="text-primary hover:underline font-medium cursor-pointer">Jira — 附件多圖檢視</span></LinkTo>
          </li>
          <li>
            <LinkTo kind="Design System/Components/FileViewer/展示" name="Notion — 頁內配圖相簿"><span className="text-primary hover:underline font-medium cursor-pointer">Notion — 頁面配圖相簿瀏覽</span></LinkTo>
          </li>
          <li>
            <LinkTo kind="Design System/Components/FileViewer/展示" name="Figma — 單檔縮放聚焦"><span className="text-primary hover:underline font-medium cursor-pointer">Figma — 設計稿單檔縮放聚焦檢視</span></LinkTo>
          </li>
          <li>
            <LinkTo kind="Design System/Components/FileViewer/展示" name="Gmail — 多附件預覽"><span className="text-primary hover:underline font-medium cursor-pointer">Gmail — 信件多附件快速預覽</span></LinkTo>
          </li>
          <li>
            <LinkTo kind="Design System/Components/FileViewer/展示" name="活動相集 — 縮圖膠卷展開"><span className="text-primary hover:underline font-medium cursor-pointer">活動相集 — 開啟縮圖膠卷瀏覽跳轉</span></LinkTo>
          </li>
        </ul>
        <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
      </div>

      {/* vs 近親 + 何時不用 — 原 WhenNotToUse(FileViewer vs Dialog) */}
      <div>
        <Rule
          title="vs 近親元件 — 檢視檔案內容用 FileViewer(viewport-fill + dark canvas)"
          note="Jira ticket 附件檢視、Notion 配圖預覽、Figma design review、Gmail 多附件預覽。主任務是「看 content」,需要 viewport 最大化 + dark 底襯托媒體。FileViewer 固定 fullscreen + toolbar chrome,避免 Dialog 的 maxWidth inset 把 media 擠小"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setFvOpen(true)}>
            開啟 Jira bug 附件(2 張截圖)
          </Button>
          <FileViewer
            files={jiraAttachments}
            open={fvOpen}
            onOpenChange={setFvOpen}
            showFilmstrip
          />
          <Label>↑ 看 content 是主任務 → FileViewer,viewport 佔滿螢幕</Label>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — 確認 / 表單 / 決策用 Dialog"
          note="「確定要刪除專案?」「建立新客戶」這類聚焦決策或短表單場景,要用 Dialog。Dialog 是居中 modal(maxWidth 400–720),讓文字決策強制聚焦;若改用 FileViewer,使用者會因為 fullscreen dark 底感到突兀(「看圖」的視覺期待沒出現)"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary" danger startIcon={Trash2}>
                永久刪除專案
              </Button>
            </DialogTrigger>
            <DialogContent autoHeight maxWidth={440}>
              <DialogHeader>
                <DialogTitle>確定要永久刪除此專案?</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="text-body">此動作無法復原,所有任務、評論、附件都將一併刪除。</p>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary">取消</Button>
                <Button variant="primary" danger>
                  永久刪除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Label>↑ 破壞性決策 → Dialog(文字聚焦,不是看 content)</Label>
        </Rule>

        <Rule
          title="vs 近親元件 — 判準:「我要讓使用者看什麼」?"
          note="看文字決策 / 表單欄位 → Dialog(居中、maxWidth、light 底)。看媒體 content(圖 / PDF / 影片 / 設計稿)→ FileViewer(fullscreen、dark 底、toolbar chrome)"
        >
          <Label>FileViewer:Jira 附件、Notion 配圖、Figma design、Gmail 附件、產品 gallery</Label>
          <Label>Dialog:建立 / 編輯 / 刪除確認、付款確認、登出多裝置</Label>
        </Rule>
      </div>
    </div>
    )
  },
}

// ── Rule 2:Info panel 預設關 ─────────────────────────────────────────────────

const notionGallery: FileInfo[] = [
  {
    id: 'n-1',
    url: img('r2-hero', 1600, 900),
    name: 'q1-kickoff-hero.jpg',
    mimeType: 'image/jpeg',
    size: 892_000,
    description: '2026 Q1 kick-off 發布會主視覺稿 v3 — 已 Marketing review 過。',
  },
  {
    id: 'n-2',
    url: img('r2-agenda', 1600, 900),
    name: 'q1-kickoff-agenda.jpg',
    mimeType: 'image/jpeg',
    size: 532_000,
    description: '活動流程圖 — 10:00 報到 / 10:30 Keynote / 12:00 產品 demo。',
  },
]

export const InfoPanelDefaultRule: Story = {
  name: '檔案資訊面板預設關閉',
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <div>
        <Rule
          title="✅ 預設關 info panel,user 主動按 I / Info 才打開"
          note="世界級一致:Figma file preview / Notion attachment viewer / Google Photos / Dropbox preview 皆預設關 info。Viewer 主任務是看 content,metadata 是輔助;若預設打開,viewport 被右側 320 px 佔走、90% 情境沒人讀 metadata,是逆優化"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setOpen(true)}>
            開啟 Notion 配圖(按 I 切換 info)
          </Button>
          <FileViewer
            files={notionGallery}
            open={open}
            onOpenChange={setOpen}
            readOnly
            showFilmstrip
          />
          <Label>↑ 打開時 info panel 是關的;按 I 或 toolbar Info button 才出現</Label>
        </Rule>

        <Rule
          title="❌ 預設開 info panel = 把閱讀式工作區強加到 viewer"
          note="部分新手 DS 實作會把 info 預設打開「怕使用者找不到」。正確做法是 toolbar Info button 明顯 + keyboard shortcut I 可及;一次性 discovery(首次打開 hint)比 persistent 侵佔 viewport 更好"
        >
          <Label warn>↑ 預設開啟 = 永久把 viewport 砍掉 320 px,90% 使用者沒在讀 metadata</Label>
        </Rule>
      </div>
    )
  },
}

// ── Rule 3:Close button 在 toolbar 最右 ──────────────────────────────────────

const closeOrderFiles: FileInfo[] = [
  {
    id: 'c-1',
    url: img('r3-spec', 1600, 1000),
    name: 'dashboard-v2-design.png',
    mimeType: 'image/png',
    size: 1_240_000,
  },
]

export const CloseButtonPositionRule: Story = {
  name: '工具列 按鈕順序（關閉 永遠最右）',
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <div>
        <Rule
          title="✅ toolbar 順序 — zoom → info → download → close(影響力遞增)"
          note="DS 設計準則三方交集:(1) action-bar「全局 primary 在最右」影響力遞增;(2) Notice dismiss X always rightmost;(3) Dialog close 靠右的跨平台慣例(macOS / Windows / Web 一致)。zoom 影響單檔 transform / info 影響 layout / download 搬內容出 viewer / close unmount 所有 state — 影響越大越右"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setOpen(true)}>
            開啟 Dashboard 設計稿
          </Button>
          <FileViewer
            files={closeOrderFiles}
            open={open}
            onOpenChange={setOpen}
            readOnly
          />
          <Label>↑ 觀察 toolbar 右側:ZoomInput → Info → Download → X</Label>
        </Rule>

        <Rule
          title="❌ 把 close 放左上(像早期 macOS 視窗)"
          note="Web / Windows 慣例是右上 X,只有舊 macOS 視窗 chrome 用左上。Web 檔案 viewer 一致用右上 X — 把 close 放左會讓使用者找不到。Radix DialogPrimitive 本身不限位置,是本 DS 的規範要求"
        >
          <Label warn>↑ close 左上在 Web / 檔案 viewer 是罕見 convention,違反跨 DS 慣例</Label>
        </Rule>

        <Rule
          title="❌ close 飄離 toolbar(放 viewport 邊緣角落)"
          note="部分早期 lightbox 把 close X 浮在 viewport 右上角(脫離 toolbar)。這違反「所有 viewer 控制都集中在 toolbar」的可發現性原則 — 使用者視線會在 toolbar / 角落之間跳動"
        >
          <Label warn>↑ close 要與其他 chrome 同層 toolbar,不漂浮在 viewport 角落</Label>
        </Rule>
      </div>
    )
  },
}

// ── Rule 4:Filmstrip 顯示由 consumer 決定 ────────────────────────────────────

const focusFile: FileInfo[] = [
  {
    id: 'f-1',
    url: img('r4-focus', 1920, 1200),
    name: 'hero-banner-final.png',
    mimeType: 'image/png',
    size: 2_104_000,
    description: '首頁 hero banner 最終稿 — 行銷 review 確認色彩與字級。',
  },
]

const browsingFiles: FileInfo[] = Array.from({ length: 5 }, (_, i) => ({
  id: `b-${i}`,
  url: img(`r4-browse-${i}`, 1600, 1000),
  name: `event-photo-${String(i + 1).padStart(2, '0')}.jpg`,
  mimeType: 'image/jpeg',
  size: 800_000 + i * 60_000,
  description: [
    '主舞台 keynote 開場 — CEO 講述公司願景。',
    '產品 demo 區 — AI 助理新功能實機操作。',
    '茶歇時間 — 合作夥伴交流。',
    '圓桌論壇 — 協作工具的三個關鍵轉變。',
    '活動尾聲 — 全體大合照。',
  ][i],
}))

export const FilmstripRule: Story = {
  name: 'Filmstrip 顯示判準',
  render: () => {
    const [focusOpen, setFocusOpen] = React.useState(false)
    const [browseOpen, setBrowseOpen] = React.useState(false)
    return (
      <div>
        <Rule
          title="✅ 單檔 / focus 檢視 — 不顯示 filmstrip"
          note="Figma design review 單檔 zoom 看細節、Notion 文件單張配圖、Gmail 單附件。這類場景 viewport 是唯一主角,filmstrip 無內容可顯示只是佔 96 px 下方空間"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setFocusOpen(true)}>
            開啟 hero banner(單檔 focus)
          </Button>
          <FileViewer
            files={focusFile}
            open={focusOpen}
            onOpenChange={setFocusOpen}
            readOnly
          />
          <Label>↑ 單檔場景 不傳 showFilmstrip;files.length=1 時 shell 也自動隱藏</Label>
        </Rule>

        <Rule
          title="✅ 多檔 browsing — 顯示 filmstrip(可視覽 + 快速跳轉)"
          note="Jira 多附件、Notion gallery、Gmail 多附件、活動相集。filmstrip 提供「總覽 + 快速跳轉」— 使用者既能知道「還有幾張沒看」,也能直接點跳到想看那張。←→ 與 filmstrip 點擊是兩種互補互動"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setBrowseOpen(true)}>
            開啟活動相集(5 張,filmstrip on)
          </Button>
          <FileViewer
            files={browsingFiles}
            open={browseOpen}
            onOpenChange={setBrowseOpen}
            showFilmstrip
          />
          <Label>↑ browsing 場景 傳 showFilmstrip;5 張同時可視 + 點擊跳轉</Label>
        </Rule>

        <Rule
          title="判準 — 「使用者需要看總覽嗎」?"
          note="需要總覽(知道還有幾張 / 想跳到某張)→ showFilmstrip。不需要總覽(單檔 focus,或每張都必看完)→ 省略 showFilmstrip。Shell 在 files.length < 2 時自動隱藏,consumer 不需額外判斷"
        >
          <Label>filmstrip on:Jira 附件 / 活動相集 / 產品 gallery / Notion 多圖</Label>
          <Label>filmstrip off:Figma 單檔 review / Gmail 單附件 / 錯誤 screenshot 單張</Label>
        </Rule>
      </div>
    )
  },
}

// ── Rule 5:ReadOnly 由業務權限決定 ───────────────────────────────────────────

const editableFiles: FileInfo[] = [
  {
    id: 'e-1',
    url: img('r5-edit', 1600, 1000),
    name: 'my-team-event-photo.jpg',
    mimeType: 'image/jpeg',
    size: 892_000,
    description: '團隊活動現場照片 — 你剛上傳,可編輯說明。',
  },
]

const publicFiles: FileInfo[] = [
  {
    id: 'p-1',
    url: img('r5-public', 1600, 1000),
    name: 'public-announcement-poster.jpg',
    mimeType: 'image/jpeg',
    size: 612_000,
    description: '公司公告海報 — HR 發佈,一般同事僅檢視無法編輯。',
  },
]

export const ReadOnlyRule: Story = {
  name: 'readOnly 由業務權限決定',
  render: () => {
    const [editOpen, setEditOpen] = React.useState(false)
    const [roOpen, setRoOpen] = React.useState(false)
    const [editState, setEditState] = React.useState(editableFiles)
    return (
      <div>
        <Rule
          title="✅ 可編輯 — 檔案擁有者 / admin,editing 即時儲存"
          note="onDescriptionChange 在 textarea onBlur 觸發,consumer 負責持久化(call API)。textarea 就是普通編輯介面,沒有「儲存」按鈕 — 避免使用者疑惑「要不要按儲存」。世界級 parallel:Google Photos / Notion 的 caption 編輯都是 inline blur-save"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setEditOpen(true)}>
            開啟自己上傳的照片(可編輯說明)
          </Button>
          <FileViewer
            files={editState}
            open={editOpen}
            onOpenChange={setEditOpen}
            onDescriptionChange={(id, desc) =>
              setEditState((prev) =>
                prev.map((f) => (f.id === id ? { ...f, description: desc } : f)),
              )
            }
          />
          <Label>↑ 按 I 打開 info panel,修改說明後 blur,state 自動更新</Label>
        </Rule>

        <Rule
          title="✅ readOnly — 其他人上傳的 / 公開公告 / 只讀 link 分享"
          note="readOnly=true 時 textarea 變 readOnly,onDescriptionChange 不觸發。placeholder 改為「尚無說明」讓無 description 時也不顯示「為這個檔案加上說明...」誘導編輯的文字"
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setRoOpen(true)}>
            開啟公司公告(readOnly)
          </Button>
          <FileViewer files={publicFiles} open={roOpen} onOpenChange={setRoOpen} readOnly />
          <Label>↑ 按 I 打開 info panel,textarea 不可編輯、focus 不進游標</Label>
        </Rule>

        <Rule
          title="❌ 不要用 disabled 取代 readOnly"
          note="disabled = 完全無法互動(無法 focus / copy);readOnly = 可 focus / 可 select / 可 copy,只是不能改。Viewer 的 description 即便不能改也要能 select 複製,所以必須用 readOnly 不是 disabled"
        >
          <Label warn>↑ disabled 會讓使用者連 copy 都不能 — 不符 viewer 的展示定位</Label>
        </Rule>
      </div>
    )
  },
}

// ── Rule 6:禁止 nested 浮層 ───────────────────────────────────────────────────

const splitFiles: FileInfo[] = [
  {
    id: 's-1',
    url: img('r6-split', 1600, 1000),
    name: 'dashboard-review.png',
    mimeType: 'image/png',
    size: 742_000,
    description: '設計 review 中的 Dashboard 截圖。InfoPanel 直接在 viewer 內 split,不另開 Sheet',
    metadata: {
      '設計師': 'Claire Wu',
      '版本': 'v2.0',
    },
  },
]

export const NoNestedOverlayRule: Story = {
  name: '禁止 巢狀 浮層',
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <div>
        <Rule
          title="✅ InfoPanel 直接在 viewer 內 split(flex row)"
          note="FileViewer 本身就是 fullscreen modal,右側 InfoPanel 透過 flex-row 切出 320 px region,不另外開 Sheet 或 Dialog。好處:單層 focus-trap、單層 Esc 語義(按 Esc 直接關 viewer)、視覺無多層 overlay 疊加"
        >
          <Button variant="tertiary" startIcon={Info} onClick={() => setOpen(true)}>
            開啟 Dashboard review + info panel
          </Button>
          <FileViewer files={splitFiles} open={open} onOpenChange={setOpen} readOnly />
          <Label>↑ InfoPanel 在 viewer 內 split;按 Esc / X 直接關 viewer</Label>
        </Rule>

        <Rule
          title="❌ 不要在 viewer 內再開 Sheet / Dialog(例:info panel 用 Sheet)"
          note="部分 DS 把 detail info 做成獨立 Sheet,開進 viewer 後變成 Dialog-on-Dialog。結果:(1) 兩層 focus-trap 打架 — Esc 不知道關哪個;(2) 兩層 overlay 疊加視覺混亂;(3) 鍵盤 shortcut 意圖模糊(I 鍵在哪個 context?)。一律 split,不 nest"
        >
          <Label warn>↑ Sheet on FileViewer = focus-trap 雙層 + Esc 語義衝突 + 視覺多層 overlay</Label>
        </Rule>

        <Rule
          title="❌ 不要從 viewer 內開另一個 viewer(nested viewer)"
          note="viewer 疊 viewer 焦點陷阱崩壞。要在 viewer 內展示另一個檔案,改用 filmstrip 切換 index(這是 filmstrip 的核心用途)。viewer 只能有一層 active"
        >
          <Label warn>↑ 檔案 A viewer 內點「相關檔案 B」再開 B viewer = 崩壞 focus management</Label>
        </Rule>
      </div>
    )
  },
}

// ── Rule 7:Dark mode 鎖定 ────────────────────────────────────────────────────

const darkDemoFiles: FileInfo[] = [
  {
    id: 'd-1',
    url: img('r7-dark', 1600, 1000),
    name: 'product-mockup-white-bg.png',
    mimeType: 'image/png',
    size: 684_000,
    description: '產品截圖 — 白底設計,dark chrome 襯托避免色溫衝突。',
  },
]

export const DarkModeLockedRule: Story = {
  name: '檢視器框架鎖暗色（不隨頁面主題）',
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <div>
        <Rule
          title={'✅ Viewer chrome 永遠 dark(`data-theme="dark"` subtree)'}
          note={'Viewer 是「內容展示 chrome」而非 content-of-app。類比 Tooltip 永久 dark、全螢幕影片播放器 UI 永遠暗色、專業修圖軟體(Photoshop / Figma)UI 暗色。Dark 底讓圖片 / media 顯色最自然 — 亮底會跟任何含白邊的圖片打架。本 DS 用 `data-theme="dark"` subtree 鎖定,背景頁面 theme 不影響 viewer'}
        >
          <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setOpen(true)}>
            開啟 viewer(不管頁面 theme 為何,chrome 永遠 dark)
          </Button>
          <FileViewer files={darkDemoFiles} open={open} onOpenChange={setOpen} readOnly />
          <Label>↑ 切換全站 theme 到 light,viewer chrome 仍 dark</Label>
        </Rule>

        <Rule
          title="❌ 讓 viewer chrome 跟 app theme 走(light / dark 都出現)"
          note="Light viewer chrome 的問題:(1) 大部分內容圖帶白邊,light 底跟圖片白邊融在一起看不見邊界;(2) light chrome 亮度跟 content 亮度接近,使用者視覺焦點被 chrome 搶走、無法專注 content;(3) 世界級 parallel 全是 dark chrome(Google Photos / Figma / Dropbox / macOS Preview)— 跟業界違反 convention"
        >
          <Label warn>↑ Light viewer chrome 破壞媒體顯色 + 視覺焦點,且違反世界級 convention</Label>
        </Rule>
      </div>
    )
  },
}

// ── Rule 8:Keyboard shortcut 不替代 button ──────────────────────────────────

const kbFiles: FileInfo[] = Array.from({ length: 3 }, (_, i) => ({
  id: `k-${i}`,
  url: img(`r8-kb-${i}`, 1600, 1000),
  name: `design-iteration-v${i + 1}.png`,
  mimeType: 'image/png',
  size: 524_000 + i * 48_000,
  description: `Dashboard 設計第 ${i + 1} 版迭代 — 同時用鍵盤 ←→ 快速比對、或點 filmstrip 跳轉。`,
}))

export const KeyboardShortcutRule: Story = {
  name: '鍵盤捷徑 是 進階使用者 入口',
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <div>
        <Rule
          title="✅ Shortcut 加速 power user,不替代 button"
          note="所有 keyboard 動作都有 toolbar button / viewport arrow 對應 — ← → 對應 prev/next arrow,I 對應 Info button,+/-/0/F 對應 ZoomInput dropdown,Esc 對應 close X。Power user 按鍵快;一般 user / tablet / touch 用 button。少一組 → a11y 斷裂 / mobile 不可用"
        >
          <Button variant="tertiary" startIcon={Keyboard} onClick={() => setOpen(true)}>
            開啟 3 版設計迭代(試 ← → 切換)
          </Button>
          <FileViewer
            files={kbFiles}
            open={open}
            onOpenChange={setOpen}
            readOnly
            showFilmstrip
          />
          <Label>↑ 可用 ← →、I、+ -、0、F、Esc;也可點 toolbar / viewport arrow / filmstrip</Label>
        </Rule>

        <Rule
          title="快捷鍵總覽(每個都有對應 button)"
          note="設計時 keyboard ↔ button 對應表寫進 spec(見 file-viewer.spec.md「鍵盤支援」段)。這個對應關係不是實作細節,是 a11y 的結構承諾 — 任何新增 shortcut 都必須同步新增對應 button"
        >
          <div className="w-full max-w-[640px] rounded-md border border-border p-3">
            <table className="w-full text-caption">
              <thead className="text-fg-muted">
                <tr>
                  <th className="text-left font-normal pb-1">鍵</th>
                  <th className="text-left font-normal pb-1">行為</th>
                  <th className="text-left font-normal pb-1">對應 button</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr>
                  <td className="font-mono py-0.5">Esc</td>
                  <td className="py-0.5">關閉 viewer</td>
                  <td className="py-0.5">toolbar X</td>
                </tr>
                <tr>
                  <td className="font-mono py-0.5">← / →</td>
                  <td className="py-0.5">上 / 下一個檔案</td>
                  <td className="py-0.5">viewport prev/next arrow + filmstrip 點擊</td>
                </tr>
                <tr>
                  <td className="font-mono py-0.5">+ / =</td>
                  <td className="py-0.5">Zoom in</td>
                  <td className="py-0.5">ZoomInput dropdown preset</td>
                </tr>
                <tr>
                  <td className="font-mono py-0.5">-</td>
                  <td className="py-0.5">Zoom out</td>
                  <td className="py-0.5">ZoomInput dropdown preset</td>
                </tr>
                <tr>
                  <td className="font-mono py-0.5">0</td>
                  <td className="py-0.5">重設為 100%</td>
                  <td className="py-0.5">ZoomInput 輸入 100%</td>
                </tr>
                <tr>
                  <td className="font-mono py-0.5">F</td>
                  <td className="py-0.5">Fit to page</td>
                  <td className="py-0.5">ZoomInput dropdown「Fit to page」</td>
                </tr>
                <tr>
                  <td className="font-mono py-0.5">I</td>
                  <td className="py-0.5">Toggle Info panel</td>
                  <td className="py-0.5">toolbar Info button</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Rule>

        <Rule
          title="❌ Input / Textarea focus 時仍觸發 shortcut"
          note="使用者在 InfoPanel textarea 打 description 時按「-」(想寫減號 / 破折號),若沒排除會被 zoom out 劫持,字打不進去。本 DS 的 shell 已內建排除邏輯(tag === INPUT / TEXTAREA / contentEditable 時跳過)— 未來加新 shortcut 也必須遵守"
        >
          <Label warn>↑ 打字時被 shortcut 劫持 = 功能 bug + 信任破壞(使用者以為鍵盤壞了)</Label>
        </Rule>
      </div>
    )
  },
}
