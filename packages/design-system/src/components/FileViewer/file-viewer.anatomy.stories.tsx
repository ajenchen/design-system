// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FileViewer, registerFileRenderer, type FileInfo } from './file-viewer'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { FolderOpen } from 'lucide-react'

/**
 * FileViewer 設計規格(Anatomy)——完整技術藍圖。
 *
 * Canonical 5 stories:Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior。
 * 對齊 `spec.md`「Consistency Audit Rationale」段;SizeMatrix 改走「固定 chrome 尺寸」
 * 敘事(FileViewer 不隨 density 放大,chrome 為穩定框架)。
 */

const meta: Meta = {
  title: 'Design System/Components/FileViewer/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 真實圖源:picsum.photos 可直連;seed 固定方便 Storybook snapshot 穩定
const img = (seed: string, w = 1600, h = 1000) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`

const sampleFiles: FileInfo[] = [
  {
    id: 'doc-1',
    url: img('spec-hero', 1600, 1000),
    name: 'dashboard-spec-cover.png',
    mimeType: 'image/png',
    size: 612_000,
    description: 'Dashboard v2 spec 封面圖 — 設計 review 用。',
    metadata: {
      '設計師': 'Claire Wu',
      '版本': 'v2.0',
      '建立時間': '2026-04-17',
    },
  },
  {
    id: 'doc-2',
    url: img('spec-flow', 1600, 1000),
    name: 'user-onboarding-flow.jpg',
    mimeType: 'image/jpeg',
    size: 484_000,
    description: '使用者首次引導流程圖 — 含 5 個決策點。',
  },
  {
    id: 'doc-3',
    url: img('spec-token', 1600, 1000),
    name: 'token-sync-checklist.jpg',
    mimeType: 'image/jpeg',
    size: 392_000,
    description: 'Design token 同步 checklist — 與 engineering 對齊。',
  },
]

// ─── Shared anchor button for Viewer demos ───────────────────────────────────

const OpenViewer: React.FC<{
  label: string
  children: (open: boolean, setOpen: (o: boolean) => void) => React.ReactNode
}> = ({ label, children }) => {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant="tertiary" startIcon={FolderOpen} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {children(open, setOpen)}
    </>
  )
}

// ─── 1. Overview ─────────────────────────────────────────────────────────────

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>
          FileViewer 是 fullscreen modal shell,鎖 dark subtree,內含 4 個 region:
          Toolbar(上)/ Viewport(中,renderer 渲染)/ InfoPanel(右側可選)/ Filmstrip(下側可選)。
          浮層基於 Radix DialogPrimitive(跳過 DS &lt;Dialog&gt; wrapper 以獲得 edge-to-edge
          layout 控制權);檔案本體由 renderer registry 按 MIME 決定誰渲染。
        </Desc>

        {/* Anatomy 示意圖(純 slot 標示,不是 live viewer) */}
        <div
          className="rounded-lg overflow-hidden border border-border"
          data-theme="dark"
          style={{ maxWidth: 960 }}
        >
          <div className="bg-canvas text-foreground" style={{ height: 420 }}>
            <div className="h-full w-full flex flex-col">
              {/* Toolbar */}
              <div className="h-14 shrink-0 flex items-center justify-between bg-surface-raised border-b border-divider px-6">
                <span className="text-body-lg text-foreground">① Toolbar — 檔名 + zoom/info/download/close</span>
                <span className="text-caption text-fg-muted">--chrome-header-height(lg=56）</span>
              </div>
              {/* Viewport + InfoPanel */}
              <div className="flex-1 min-h-0 flex">
                <div className="flex-1 bg-overlay flex items-center justify-center relative">
                  <span className="text-body-lg text-fg-secondary">② Viewport — renderer 渲染區(flex-1)</span>
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-caption text-fg-muted">← prev</span>
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-caption text-fg-muted">next →</span>
                </div>
                <aside className="w-80 shrink-0 bg-surface-raised border-l border-divider flex items-center justify-center">
                  <span className="text-body text-fg-secondary">③ InfoPanel — w-80(320px)</span>
                </aside>
              </div>
              {/* Filmstrip */}
              <div className="h-24 shrink-0 bg-surface-raised border-t border-divider flex items-center px-6 gap-1">
                <span className="text-caption text-fg-muted mr-3">④ Filmstrip</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-16 h-16 rounded-md bg-muted ring-1 ring-border"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <H3>結構說明</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>區塊</Th>
                <Th>條件</Th>
                <Th>幾何</Th>
                <Th>作用</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>Toolbar</Td>
                <Td>永遠顯示</Td>
                <Td mono>--chrome-header-height, bg-surface-raised, border-b</Td>
                <Td>檔名 + 按鈕列(zoom → info → download → close,影響力遞增)；bg-surface-raised 確保 overlay 上的 chrome 不透明</Td>
              </tr>
              <tr>
                <Td mono>Viewport</Td>
                <Td>永遠顯示</Td>
                <Td mono>flex-1(無自身 bg;bg-overlay 透出)</Td>
                <Td>renderer 渲染區;prev/next arrow 絕對定位於左右</Td>
              </tr>
              <tr>
                <Td mono>InfoPanel</Td>
                <Td mono>infoOpen === true</Td>
                <Td mono>w-80 shrink-0, border-l</Td>
                <Td>Description textarea + metadata &lt;dl&gt;;預設關</Td>
              </tr>
              <tr>
                <Td mono>Filmstrip</Td>
                <Td mono>showFilmstrip && files.length &gt; 1</Td>
                <Td mono>h-24, bg-surface-raised, border-t</Td>
                <Td>64×64 thumb 水平捲動(horizontal-overflow pattern)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>子元件</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Export</Th>
                <Th>身份</Th>
                <Th>用途</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>&lt;FileViewer&gt;</Td>
                <Td>React component(預設 export)</Td>
                <Td>shell — consumer 傳 files + open 即可</Td>
              </tr>
              <tr>
                <Td mono>registerFileRenderer()</Td>
                <Td>Module function</Td>
                <Td>註冊自訂 renderer(PDF / Video / Code ...);registry singleton</Td>
              </tr>
              <tr>
                <Td mono>ImageRenderer</Td>
                <Td>Built-in renderer</Td>
                <Td>預設處理 image/* MIME;消費 react-zoom-pan-pinch</Td>
              </tr>
              <tr>
                <Td mono>FallbackRenderer</Td>
                <Td>Built-in renderer(internal)</Td>
                <Td>未知檔案類型兜底 — Empty 佈局 + 下載提示</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查(FileViewer)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Prop</Th>
                <Th>Type</Th>
                <Th>Default</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              {([
                ['files', 'FileInfo[]', '—', '檔案清單(shell 依 index 渲染當前)'],
                ['open', 'boolean', '—', 'Modal 開關(controlled)'],
                ['onOpenChange', '(open: boolean) => void', '—', 'Modal 開關 callback'],
                ['initialIndex', 'number', '0', '初始 active 索引(uncontrolled)'],
                ['index', 'number', '—', 'Active 索引(controlled);不傳則 shell 自理'],
                ['onIndexChange', '(index: number) => void', '—', '切換檔案 callback'],
                ['onDescriptionChange', '(fileId, description) => void', '—', 'Description 編輯 onBlur 觸發;readOnly 時不觸發'],
                ['readOnly', 'boolean', 'false', 'true → InfoPanel textarea readOnly'],
                ['showFilmstrip', 'boolean', 'false', 'true && files.length>1 → 顯示 filmstrip'],
                ['allowDownload', 'boolean', 'true', 'true → toolbar 顯示 download 按鈕'],
                ['onDownload', '(file: FileInfo) => void', '—', '自訂 download(跨域檔案必傳)'],
              ] as const).map(([p, t, d, desc]) => (
                <tr key={p}>
                  <Td mono>{p}</Td>
                  <Td mono>{t}</Td>
                  <Td mono>{d}</Td>
                  <Td>{desc}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>FileInfo shape</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Field</Th>
                <Th>Type</Th>
                <Th>必要</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              {([
                ['id', 'string', '必要', '唯一 id(作 React key + onDescriptionChange 參數)'],
                ['url', 'string', '必要', '檔案 URL(renderer 直接消費)'],
                ['name', 'string', '必要', '檔名(toolbar 顯示 + 下載 filename)'],
                ['mimeType', 'string', '必要', '決定 renderer resolution'],
                ['size', 'number', '選用', 'Bytes;InfoPanel 自動 formatBytes'],
                ['description', 'string', '選用', 'InfoPanel textarea 初值'],
                ['metadata', 'Record<string, string | number>', '選用', 'InfoPanel &lt;dl&gt; 逐行呈現'],
              ] as const).map(([f, t, req, desc]) => (
                <tr key={f}>
                  <Td mono>{f}</Td>
                  <Td mono>{t}</Td>
                  <Td>{req}</Td>
                  <Td>{desc}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ─── 2. Inspector ────────────────────────────────────────────────────────────

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => {
    const [showFilmstrip, setShowFilmstrip] = React.useState(true)
    const [readOnly, setReadOnly] = React.useState(false)
    const [allowDownload, setAllowDownload] = React.useState(true)
    const [filesCount, setFilesCount] = React.useState(3)
    const [open, setOpen] = React.useState(false)

    const files = sampleFiles.slice(0, filesCount)

    const Toggle = ({
      label,
      value,
      onChange,
    }: {
      label: string
      value: boolean
      onChange: (v: boolean) => void
    }) => (
      <label className="flex items-center gap-2 text-caption">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-mono">{label}</span>
      </label>
    )

    return (
      <div className="grid grid-cols-1 gap-8 max-w-[1080px]">
        <div>
          <H3>互動預覽</H3>
          <Desc>
            切換 props 組合,按「開啟 Viewer」觀察結果。FileViewer 的主要決策維度是
            布林組合(filmstrip / readOnly / allowDownload),Inspector 以多 toggle 同時
            驗證組合影響(例:filmstrip 在 files.length &lt; 2 時自動隱藏)。
          </Desc>
          <div className="flex flex-wrap gap-4 p-3 bg-muted rounded-md text-caption mb-3">
            <Toggle label="showFilmstrip" value={showFilmstrip} onChange={setShowFilmstrip} />
            <Toggle label="readOnly" value={readOnly} onChange={setReadOnly} />
            <Toggle label="allowDownload" value={allowDownload} onChange={setAllowDownload} />
            <label className="flex items-center gap-2 text-caption">
              <span className="font-mono">filesCount</span>
              <select
                value={filesCount}
                onChange={(e) => setFilesCount(Number(e.target.value))}
                className="text-caption font-mono border border-border rounded-md px-2 py-0.5"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            開啟 Viewer
          </Button>
          <FileViewer
            files={files}
            open={open}
            onOpenChange={setOpen}
            showFilmstrip={showFilmstrip}
            readOnly={readOnly}
            allowDownload={allowDownload}
          />
          <p className="text-footnote text-fg-muted mt-2 leading-relaxed">
            提醒:filmstrip 需 `showFilmstrip && files.length &gt; 1` 才顯示;
            prev/next arrow 需 `files.length &gt; 1`;切換 files 時 shell 不重設 zoom,由 renderer onLoad 重新 fit-page。
          </p>
        </div>

        <div>
          <H3>Inspect 面板(chrome token 與幾何)</H3>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse w-full">
              <thead>
                <tr>
                  <Th>類別</Th>
                  <Th>Token / 值</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Overlay</Td>
                  <Td>
                    <TokenCell token="--overlay" display="bg-overlay" />
                  </Td>
                </tr>
                <tr>
                  <Td>Chrome 鎖 dark subtree</Td>
                  <Td mono>data-theme="dark"(對齊 Tooltip pattern)</Td>
                </tr>
                <tr>
                  <Td>Viewport 背景</Td>
                  <Td>
                    <TokenCell token="--overlay" display="bg-overlay 透出(自身無 bg)" />
                  </Td>
                </tr>
                <tr>
                  <Td>Toolbar / InfoPanel / Filmstrip 背景</Td>
                  <Td>
                    <TokenCell token="--surface-raised" display="bg-surface-raised" />
                  </Td>
                </tr>
                <tr>
                  <Td>分隔線(Toolbar-b / InfoPanel-l / Filmstrip-t)</Td>
                  <Td>
                    <TokenCell token="--divider" display="border-divider" />
                  </Td>
                </tr>
                <tr>
                  <Td>Toolbar 高度</Td>
                  <Td mono>--chrome-header-height(隨 page:48 md / 56 lg,ChromeHeader 繼承 page,與 InfoPanel header 等高)</Td>
                </tr>
                <tr>
                  <Td>Toolbar 水平 padding</Td>
                  <Td mono>px-[var(--layout-space-loose)]</Td>
                </tr>
                <tr>
                  <Td>Toolbar 按鈕 gap</Td>
                  <Td mono>gap-2(8px,對齊 DS 按鈕 gap canonical;含 ZoomInput 內部)</Td>
                </tr>
                <tr>
                  <Td>InfoPanel 寬</Td>
                  <Td mono>w-80(320px,對齊 Figma right panel 慣例)</Td>
                </tr>
                <tr>
                  <Td>InfoPanel 內 padding</Td>
                  <Td mono>px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]</Td>
                </tr>
                <tr>
                  <Td>Filmstrip 高</Td>
                  <Td mono>h-24(96px,容 64 thumb + padding)</Td>
                </tr>
                <tr>
                  <Td>Filmstrip thumb 尺寸</Td>
                  <Td mono>64×64 px</Td>
                </tr>
                <tr>
                  <Td>Filmstrip thumb gap</Td>
                  <Td mono>gap-[var(--layout-space-tight)](density-aware,對齊 lightbox 慣例)</Td>
                </tr>
                <tr>
                  <Td>Filmstrip active thumb ring</Td>
                  <Td mono>ring-2 ring-primary</Td>
                </tr>
                <tr>
                  <Td>Filmstrip 預設 thumb ring</Td>
                  <Td mono>ring-1 ring-border → hover ring-border-hover</Td>
                </tr>
                <tr>
                  <Td>Toolbar 按鈕 variant / size</Td>
                  <Td mono>variant="text" size="sm" iconOnly</Td>
                </tr>
                <tr>
                  <Td>ZoomInput 高</Td>
                  <Td mono>h-field-sm(28/32 px,隨 density)</Td>
                </tr>
                <tr>
                  <Td>ZoomInput 寬</Td>
                  <Td mono>autoWidth(field-sizing:content,隨 % 文字寬;chevron 為 endSlot)</Td>
                </tr>
                <tr>
                  <Td>Prev/Next arrow Button size</Td>
                  <Td mono>size="md" iconOnly variant="text"</Td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  },
}

// ─── 3. ColorMatrix ──────────────────────────────────────────────────────────

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Chrome 鎖 dark 的理由</H3>
        <Desc>
          FileViewer 是「內容展示 chrome」,viewer 本身是獨立沉浸式 context——類比 Tooltip 永久 dark、
          全螢幕影片播放器 UI 永遠暗色。Dark 底 + 半透明 bg-overlay backdrop 讓圖片 / media 顯色最自然
          (亮底會跟任何含白色邊緣的圖片打架);rollback 到 light theme 會讓圖片與 chrome 產生
          色溫衝突。實作:DialogPrimitive.Content 內包 &lt;div data-theme="dark"&gt;,子元件 token
          自動解析為 dark 值,不影響背景頁面 theme。
        </Desc>
      </div>

      <div>
        <H3>Chrome 分層對照</H3>
        <div
          data-theme="dark"
          className="rounded-lg overflow-hidden border border-border"
          style={{ width: 720 }}
        >
          <div className="bg-canvas">
            <div className="h-14 flex items-center px-6 bg-surface-raised border-b border-divider">
              <span className="text-body-lg text-foreground">Toolbar — bg-surface-raised</span>
            </div>
            <div className="flex">
              <div
                className="flex-1 flex items-center justify-center"
                style={{ height: 180, backgroundColor: 'var(--overlay)' }}
              >
                <span className="text-body text-fg-secondary">Viewport — 無自身 bg(bg-overlay 透出)</span>
              </div>
              <aside className="w-56 bg-surface-raised border-l border-divider flex items-center justify-center">
                <span className="text-body text-fg-secondary">InfoPanel — bg-surface-raised</span>
              </aside>
            </div>
            <div className="h-24 flex items-center px-6 bg-surface-raised border-t border-divider">
              <span className="text-body text-fg-secondary">Filmstrip — bg-surface-raised</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <H3>Token 對照表</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>區塊</Th>
                <Th>Token</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Overlay(頁面遮罩)</Td>
                <Td>
                  <TokenCell token="--overlay" display="bg-overlay" />
                </Td>
                <Td>與 Dialog 共用</Td>
              </tr>
              <tr>
                <Td>Viewport 背景</Td>
                <Td>
                  <TokenCell token="--overlay" display="bg-overlay 透出(自身無 bg)" />
                </Td>
                <Td>viewer 自身不畫 viewport bg;半透明遮罩透出,media 周圍近黑</Td>
              </tr>
              <tr>
                <Td>Toolbar / InfoPanel / Filmstrip</Td>
                <Td>
                  <TokenCell token="--surface-raised" display="bg-surface-raised" />
                </Td>
                <Td>遮蓋型浮層必須不透明(不用 bg-surface,dark = white α8 半透明);比 canvas 高一階形成 chrome 分層</Td>
              </tr>
              <tr>
                <Td>分隔線</Td>
                <Td>
                  <TokenCell token="--divider" display="border-divider" />
                </Td>
                <Td>Toolbar-b / InfoPanel-l / Filmstrip-t</Td>
              </tr>
              <tr>
                <Td>主文字(檔名 / 標題)</Td>
                <Td>
                  <TokenCell token="--foreground" display="text-foreground" />
                </Td>
                <Td>text-body-lg 檔名;text-body 內文</Td>
              </tr>
              <tr>
                <Td>次要文字(metadata label)</Td>
                <Td>
                  <TokenCell token="--fg-secondary" display="text-fg-secondary" />
                </Td>
                <Td>InfoPanel &lt;dt&gt;</Td>
              </tr>
              <tr>
                <Td>弱化文字(caption / icon)</Td>
                <Td>
                  <TokenCell token="--fg-muted" display="text-fg-muted" />
                </Td>
                <Td>Filmstrip 非圖 thumb 的 FileText 圖示 + 副檔名 label(InfoPanel「檔案資訊」小標走 text-foreground、「說明」走 FieldLabel,皆非弱化)</Td>
              </tr>
              <tr>
                <Td>Filmstrip thumb 當前選中</Td>
                <Td>
                  <TokenCell token="--primary" display="ring-primary" />
                </Td>
                <Td>與 DS 選中視覺準則 一致</Td>
              </tr>
              <tr>
                <Td>Filmstrip thumb 預設</Td>
                <Td>
                  <TokenCell token="--border" display="ring-border" />
                </Td>
                <Td>hover → ring-border-hover</Td>
              </tr>
              <tr>
                <Td>Filmstrip thumb bg(非圖片時)</Td>
                <Td>
                  <TokenCell token="--muted" display="bg-muted" />
                </Td>
                <Td>Fallback 圖示底色</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ─── 4. SizeMatrix ───────────────────────────────────────────────────────────

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>為什麼沒有 sm / md / lg variant</H3>
        <Desc>
          FileViewer 是 viewport-fill 的展示殼,不是工作區—— chrome 尺寸是穩定框架,
          不隨 density 放大。對比 Family 1/2/3/4 元件都有 sm/md/lg,FileViewer 的所有
          chrome 維度(toolbar / panel / filmstrip)都是 fixed px / rem,避免放大後
          壓縮 viewport 實際展示空間。唯一會隨 density 變的是 Toolbar 內的
          &lt;Button size="sm"&gt; 與 ZoomInput 的 h-field-sm(28 → 32 px),在 viewer 尺度可
          忽略。對照 Coachmark spec「固定 width 無 variant」同流派。
        </Desc>
      </div>

      <div>
        <H3>Chrome 尺寸對照</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>區塊</Th>
                <Th>值</Th>
                <Th>世界級對照</Th>
                <Th>理由</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Dialog outer</Td>
                <Td mono>fixed inset-0(viewport-fill)</Td>
                <Td>Figma / Google Photos / Dropbox lightbox</Td>
                <Td>內容消費 context,不留邊</Td>
              </tr>
              <tr>
                <Td>Toolbar 高</Td>
                <Td mono>--chrome-header-height(48 md / 56 lg)</Td>
                <Td>Figma toolbar 48–56 / macOS Preview 56</Td>
                <Td>ChromeHeader 繼承 page density,token 驅動;md=48 / lg=56(2026-06-15 移除 lockDensity)</Td>
              </tr>
              <tr>
                <Td>InfoPanel 寬</Td>
                <Td mono>w-80(320px)</Td>
                <Td>Figma right panel 320 / Google Photos info 360</Td>
                <Td>取 Figma 偏窄,留更多空間給 viewport</Td>
              </tr>
              <tr>
                <Td>Filmstrip 高</Td>
                <Td mono>h-24(96px)</Td>
                <Td>Google Photos 96 / Dropbox 88</Td>
                <Td>固定 96(對齊 Google Photos 96 benchmark);thumb 64 + py-2(16px)留白</Td>
              </tr>
              <tr>
                <Td>Filmstrip thumb</Td>
                <Td mono>64×64 px</Td>
                <Td>Google Photos 64 / Dropbox 72</Td>
                <Td>10+ 檔可同時見 + 能辨識縮圖</Td>
              </tr>
              <tr>
                <Td>Filmstrip thumb gap</Td>
                <Td mono>gap-[var(--layout-space-tight)]</Td>
                <Td>Google Photos / Dropbox 3–4 px</Td>
                <Td>density-aware token,緊密排列 lightbox 慣例</Td>
              </tr>
              <tr>
                <Td>Toolbar 按鈕</Td>
                <Td mono>Button size="sm" iconOnly</Td>
                <Td>Figma / Google Drive 32 px icon button</Td>
                <Td>密集 UI,text variant 不搶焦點</Td>
              </tr>
              <tr>
                <Td>ZoomInput 寬</Td>
                <Td mono>autoWidth(field-sizing:content)</Td>
                <Td>Figma zoom 80 / Google Slides 72</Td>
                <Td>隨 % 文字寬自適應,chevron 為 endSlot inline action</Td>
              </tr>
              <tr>
                <Td>Prev/Next arrow</Td>
                <Td mono>Button size="md" iconOnly</Td>
                <Td>Google Photos / Dropbox 40 px</Td>
                <Td>主要瀏覽動作,比 toolbar sm 更明顯</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>InfoPanel 內部尺寸</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>區塊</Th>
                <Th>值</Th>
                <Th>說明</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Panel header 高</Td>
                <Td mono>--chrome-header-height</Td>
                <Td>消費 &lt;ChromeHeader&gt;(繼承 page density);md=48 / lg=56,與 Toolbar 等高,視覺水平對齊</Td>
              </tr>
              <tr>
                <Td>Body 水平 padding</Td>
                <Td mono>px-[var(--layout-space-loose)]</Td>
                <Td>24 / 32 px(隨 density)</Td>
              </tr>
              <tr>
                <Td>Body 垂直 padding</Td>
                <Td mono>pt-[var(--layout-space-tight)] pb-[var(--layout-space-loose)]</Td>
                <Td>非對稱:top tight / bottom loose(對齊 layoutSpace v6 規則 4「bounded region 容器底 = loose」)</Td>
              </tr>
              <tr>
                <Td>Section 間 gap</Td>
                <Td mono>gap-[var(--layout-space-loose)]</Td>
                <Td>說明 ↔ 檔案資訊 24 / 32 px(隨 density;跨範疇 parallel = loose)</Td>
              </tr>
              <tr>
                <Td>檔案資訊 metadata</Td>
                <Td mono>&lt;DescriptionList horizontal divided&gt;</Td>
                <Td>消費 DescriptionList primitive,每 row py-[var(--layout-space-tight)](不再手刻 dl/dt/dd)</Td>
              </tr>
              <tr>
                <Td>Textarea rows</Td>
                <Td mono>rows={5}</Td>
                <Td>預留 5 行顯示,超出自捲動</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ─── 5. StateBehavior ────────────────────────────────────────────────────────

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>開關 / 切換 / Zoom / Info / Filmstrip / ReadOnly / Download 場景矩陣</H3>
        <Desc>
          FileViewer 是多 slot shell,不同 prop 組合產生不同 UX 場景。以下矩陣並列呈現典型配置。
          可在「元件檢閱器」story 自由切換;本 story 用固定場景示範推薦配置。
        </Desc>
        <div className="flex flex-wrap gap-4">
          <OpenViewer label="單檔 focus(無 filmstrip)">
            {(open, setOpen) => (
              <FileViewer
                files={[sampleFiles[0]]}
                open={open}
                onOpenChange={setOpen}
                readOnly
              />
            )}
          </OpenViewer>

          <OpenViewer label="多檔 + filmstrip + 可編輯">
            {(open, setOpen) => (
              <FileViewer
                files={sampleFiles}
                open={open}
                onOpenChange={setOpen}
                showFilmstrip
              />
            )}
          </OpenViewer>

          <OpenViewer label="多檔 + filmstrip + readOnly">
            {(open, setOpen) => (
              <FileViewer
                files={sampleFiles}
                open={open}
                onOpenChange={setOpen}
                showFilmstrip
                readOnly
              />
            )}
          </OpenViewer>

          <OpenViewer label="allowDownload=false(只看不能下)">
            {(open, setOpen) => (
              <FileViewer
                files={sampleFiles}
                open={open}
                onOpenChange={setOpen}
                showFilmstrip
                allowDownload={false}
              />
            )}
          </OpenViewer>
        </div>
      </div>

      <div>
        <H3>Zoom 狀態機(ImageRenderer)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>觸發</Th>
                <Th>結果</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>初始</Td>
                <Td mono>mount / 切換檔案</Td>
                <Td>zoom=fit-page(onLoad 自動算 min(cw/iw, ch/ih) 對應 %,如 40%),centered;切換檔案 shell 不重設,renderer onLoad 重 fit-page</Td>
              </tr>
              <tr>
                <Td>Zoom in</Td>
                <Td mono>+ / = 鍵 / ＋ 按鈕</Td>
                <Td>下一個 preset(10/25/50/75/100/125/150/200/400)</Td>
              </tr>
              <tr>
                <Td>Zoom out</Td>
                <Td mono>- 鍵 / − 按鈕</Td>
                <Td>上一個 preset</Td>
              </tr>
              <tr>
                <Td>連續 / 任意值</Td>
                <Td mono>滾輪(step 0.03)/ ZoomInput 打字</Td>
                <Td>multiplicative 連續縮放,任意 %(非 preset;spec「Wheel step canonical」);ZoomInput preset menu 才跳 preset</Td>
              </tr>
              <tr>
                <Td>Reset 100%</Td>
                <Td mono>0 key</Td>
                <Td>固定設 zoom=100%(natural pixel size)</Td>
              </tr>
              <tr>
                <Td>雙擊 toggle</Td>
                <Td mono>雙擊 image</Td>
                <Td>在 fit-page 附近(±5pt)→ 跳 100%;否則 → 回 fit-page(對齊 Apple Photos / Preview.app / PhotoSwipe)</Td>
              </tr>
              <tr>
                <Td>Fit</Td>
                <Td mono>F / ZoomInput dropdown</Td>
                <Td>算 container/image 比例 → fit-width(寬填滿)或 fit-page(完整可見,取較小 scale);emit 回 shell 更新 zoom %</Td>
              </tr>
              <tr>
                <Td>Pan</Td>
                <Td mono>zoom &gt; 100% 時拖曳</Td>
                <Td>平移圖片位置</Td>
              </tr>
              <tr>
                <Td>限制</Td>
                <Td mono>min/max</Td>
                <Td>10% ～ 400%(超過 clamped)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>InfoPanel / Filmstrip 條件渲染</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Slot</Th>
                <Th>顯示條件</Th>
                <Th>隱藏行為</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>InfoPanel</Td>
                <Td mono>infoOpen === true</Td>
                <Td>預設關,I 鍵 / Info 按鈕 toggle</Td>
              </tr>
              <tr>
                <Td>Filmstrip</Td>
                <Td mono>showFilmstrip && files.length &gt; 1</Td>
                <Td>單檔自動隱藏(不必 consumer 手動判斷)</Td>
              </tr>
              <tr>
                <Td>Prev/Next arrows</Td>
                <Td mono>files.length &gt; 1</Td>
                <Td>邊界(0 / last)對應按鈕隱藏</Td>
              </tr>
              <tr>
                <Td>Download 按鈕</Td>
                <Td mono>allowDownload === true</Td>
                <Td>false 時不渲染(不 disabled 反灰)</Td>
              </tr>
              <tr>
                <Td>ZoomInput</Td>
                <Td mono>capabilities.zoom === true</Td>
                <Td>Fallback renderer 不支援 zoom,自動隱藏</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Keyboard shortcut 對照</H3>
        <Desc>
          Focus 在 input / textarea / contentEditable 時**全部不觸發**(避免打字被快捷鍵劫持)。
          所有 keyboard 動作都有 toolbar button 對應(a11y + tablet / touch 可用性)。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>鍵</Th>
                <Th>行為</Th>
                <Th>生效條件</Th>
                <Th>對應 button</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>Esc</Td>
                <Td>關閉 viewer</Td>
                <Td>Radix 預設</Td>
                <Td>toolbar X</Td>
              </tr>
              <tr>
                <Td mono>←</Td>
                <Td>上一個檔案</Td>
                <Td mono>files.length &gt; 1</Td>
                <Td>viewport prev arrow</Td>
              </tr>
              <tr>
                <Td mono>→</Td>
                <Td>下一個檔案</Td>
                <Td mono>files.length &gt; 1</Td>
                <Td>viewport next arrow</Td>
              </tr>
              <tr>
                <Td mono>+ / =</Td>
                <Td>Zoom in(下一個 preset)</Td>
                <Td mono>capabilities.zoom</Td>
                <Td>ZoomInput dropdown</Td>
              </tr>
              <tr>
                <Td mono>-</Td>
                <Td>Zoom out</Td>
                <Td mono>capabilities.zoom</Td>
                <Td>ZoomInput dropdown</Td>
              </tr>
              <tr>
                <Td mono>0</Td>
                <Td>Reset zoom 100%</Td>
                <Td mono>capabilities.zoom</Td>
                <Td>ZoomInput 輸入 100</Td>
              </tr>
              <tr>
                <Td mono>F</Td>
                <Td>Fit to page</Td>
                <Td mono>capabilities.zoom</Td>
                <Td>ZoomInput dropdown Fit to page</Td>
              </tr>
              <tr>
                <Td mono>I</Td>
                <Td>Toggle InfoPanel</Td>
                <Td>永遠</Td>
                <Td>toolbar Info button</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>狀態職責邊界</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>處理方</Th>
                <Th>備註</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>Loading(圖片載入中)</Td>
                <Td>Renderer 自己處理</Td>
                <Td>Shell 不提供全頁 loading</Td>
              </tr>
              <tr>
                <Td>Empty(files.length === 0)</Td>
                <Td>Shell 不渲染(return null)</Td>
                <Td>Consumer 用 open=false 控制</Td>
              </tr>
              <tr>
                <Td>Error(renderer crash)</Td>
                <Td>MVP 由 renderer 自理</Td>
                <Td>未來可加 error boundary</Td>
              </tr>
              <tr>
                <Td>Unknown file type</Td>
                <Td>FallbackRenderer 兜底</Td>
                <Td>顯示 Empty + 下載提示</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ─── 6. Extras:Renderer Registry ─────────────────────────────────────────────

export const RendererRegistry: Story = {
  name: '延伸機制（registerFileRenderer）',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>為什麼是 registry 而非 switch(file.mimeType)</H3>
        <Desc>
          Shell 只懂 `FileRenderer` interface,不硬寫 image / pdf / video 邏輯。新檔案類型
          透過 `registerFileRenderer` 加入,不動 shell 一行 code。Consumer 可把
          專屬 renderer(PDFRenderer / VideoRenderer / CodeRenderer)獨立套件化,
          按需載入、team 平行開發。
        </Desc>
      </div>

      <div>
        <H3>Resolution 順序</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>優先序</Th>
                <Th>Renderer</Th>
                <Th>canRender 規則</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>1</Td>
                <Td>User-registered(註冊順序)</Td>
                <Td>consumer 定義</Td>
              </tr>
              <tr>
                <Td>2</Td>
                <Td>Built-in ImageRenderer</Td>
                <Td mono>mimeType.startsWith('image/') || ext in IMAGE_EXTS</Td>
              </tr>
              <tr>
                <Td>3</Td>
                <Td>FallbackRenderer</Td>
                <Td mono>() =&gt; true(永遠兜底)</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>註冊 PDF renderer 範例</H3>
        <pre className="text-caption bg-muted p-4 rounded-md overflow-x-auto">
          <code>{`import { registerFileRenderer } from '@/design-system/components/FileViewer/file-viewer'
import { PDFRenderer } from './pdf-renderer'

registerFileRenderer({
  id: 'pdf',
  canRender: (f) => f.mimeType === 'application/pdf',
  component: PDFRenderer, // 消費 react-pdf,emit pageNumber capability
})`}</code>
        </pre>
        <p className="text-footnote text-fg-muted mt-2 leading-relaxed">
          {'Renderer 透過 `onCapabilitiesChange({ zoom, rotate, pageNumber })` 告訴 shell 當前支援什麼 affordance。Shell 據此動態顯示 toolbar 內容。'}
        </p>
      </div>

      <div>
        <H3>Capability 維度(MVP + 預留)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>Capability</Th>
                <Th>狀態</Th>
                <Th>影響 toolbar</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>zoom</Td>
                <Td>MVP</Td>
                <Td>顯示 ZoomInput + +/−/0/F 鍵啟用</Td>
              </tr>
              <tr>
                <Td mono>rotate</Td>
                <Td>預留 interface</Td>
                <Td>未來顯示 rotate 按鈕</Td>
              </tr>
              <tr>
                <Td mono>pageNumber</Td>
                <Td>預留 interface</Td>
                <Td>未來顯示 page navigator(n/total)</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-2">
          範例:{' '}
          <code className="font-mono">registerFileRenderer</code>{' '}
          由此處引入可(避免 eslint no-unused-import);此 story 不實際註冊新 renderer,僅作 code 示範。
        </p>
        <div className="hidden">{typeof registerFileRenderer}</div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `file-viewer.spec.md` 「A11y 預設」段。摘要:\n\nRadix DialogPrimitive 自動處理:\n-  role=\"dialog\"  +  aria-modal=\"true\" \n-  <DialogPrimitive.Title> (sr-only)自動成  aria-labelledby  目標——screen reader 開啟時讀「檔案檢視器:{file.name}」\n- Focus trap:焦點鎖在 viewer 內\n- Esc 關閉(Radix DismissableLayer);Backdrop click 關閉為自寫 geometric onClick handler(非 Radix outside-click — Content 為 fixed inset-0 全螢幕覆蓋,判斷 click 落在 img rect 外才關)\n\n自加的 a11y:\n- 所有 iconOnly button 皆有  aria-label (中文,跟 DS 其他元件風格一致)\n- Filmstrip  role=\"group\"  + thumb  <button>  +  aria-current (非 tablist:選圖導航非切 tabpanel)\n- InfoPanel 用  <aside aria-label=\"檔案詳細資訊\">  語意標記\n-  onOpenAutoFocus  preventDefault:避免焦點自動跑進第一個 tabbable(讓鍵盤從 viewport 開始)"}</p>
    </div>
  ),
}
