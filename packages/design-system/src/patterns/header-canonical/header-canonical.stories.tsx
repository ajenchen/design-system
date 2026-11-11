// @anatomy-exempt: Header Anatomy pattern story — 涵蓋 2 家族:B chrome(ChromeHeader,single-row / withTabs)+ A overlay(SurfaceHeader)。
// （leadingRail slot 因專搭 sidebar,canonical demo 在 AppShell primary-header,不在此孤立展示。）
// 內部 title 用 flex 排列是 header content 結構,非 list row,不走 item-anatomy MenuItem。
//
// 公開 Pattern anatomy 參照(對標 patterns/element-anatomy/item-anatomy.stories.tsx)。
// 目的:做 header 相關元件時,人 / AI 看這支 story + header-canonical.spec.md 就知道 header 該怎麼結構,
// 並直接消費 <ChromeHeader> primitive(或在 AppShell header slot 傳它)滿足需求。
//
// 2026-10-28(稽核 M035 / M036 / L130 / M094、範例依據 E1、SH-clip):story 上方的 JSDoc 會被 Storybook 當成 docs 說明顯示,
// 原本寫著「1. Single-row —」這類序號與內部代號 → 開發備忘改成一般註解,docs 說明寫在 parameters.docs.description.story;
// 標題一律包 TruncatedText(截斷時才出 DS Tooltip,同 DialogTitle),拿掉瀏覽器原生 title;標頭上的按鈕都接上本來的行為(F-S2)。
import * as React from 'react'
import type { Meta } from '@storybook/react'
import type { ReactNode } from 'react'
import {
  FileText,
  ZoomIn,
  Download,
  X,
} from 'lucide-react'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { SurfaceHeader, SurfaceBody } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { Button } from '@/design-system/components/Button/button'
import { ButtonDivider, ButtonGroup } from '@/design-system/components/Button/button-group'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/design-system/components/Tabs/tabs'
import { TutorialPage, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Patterns/Header Anatomy',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '頁面與浮層標頭的組合規則，統一標題、操作、分頁與導覽槽位。建立 AppShell、Dialog 或 Sheet 標頭時，用這裡的結構選型，避免各自手刻 chrome。' } },
  },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Header Anatomy — 跨元件 chrome header 的結構契約(header-canonical.spec.md SSOT)

   ChromeHeader 封裝的共同契約(所有型共享):
   • 高度 = var(--chrome-header-height)(md 48 / lg 56),items-center 垂直置中
   • 左右 padding = var(--layout-space-loose)(md 16 / lg 24),所有 slot 統一靠齊
   • border-b border-divider(有 tabs 時自動移除,改由 TabsList 畫線)
   • dismiss(close X)永遠 <Button iconOnly dismiss size="sm">,不論 density

   consumer:Sidebar header / FileViewer Toolbar+InfoPanel / AppShell header slot / 未來 Drawer
   ═══════════════════════════════════════════════════════════════════════════ */

// 總覽的教學框:規則的內容是一則 header 示範(示範塊 → 該則寫 paragraph={false}:標題區 → 示範 = loose,A4)
const TutorialRule = createTutorialRule()

// 容器:把 header 放進一個有邊界的面板裡看(模擬實際 chrome 嵌在 surface 上)。
// 不裁切(原本 overflow-hidden):面板裡沒有任何會畫出圓角外的底色(ChromeHeader 巢狀時透明、分頁列只畫底線),
// 裁切只會把貼著面板邊的鍵盤焦點框(分頁捲動鈕、分頁內容)切掉一邊 —— focus-canonical.md「框怎麼畫」:預設往外、
// 障礙不正當就拿掉障礙(SH-clip)
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-divider bg-surface">
      {children}
    </div>
  )
}

/**
 * 標頭的 × 是固定構件,按了就要真的關(F-S2「畫面上看得到的按鈕都要能動」);關掉後原位留一顆「重新開啟」把它叫回來
 * (同 Coachmark 設計規格「單步 Coachmark」的「重新開啟」,coachmark.anatomy.stories.tsx)。
 */
function Closable({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = React.useState(true)
  if (!open) return <Button variant="tertiary" size="sm" onClick={() => setOpen(true)}>重新開啟</Button>
  return <>{children(() => setOpen(false))}</>
}

// 檔案預覽的放大檔位 = FileViewer 的定案檔位(file-viewer.tsx 的 ZOOM_PRESETS 與 nextZoomIn;那兩個沒有對外出口,這裡照抄同一組數字,
// 不另訂一套;抽成共用交整合)。放大一次 = 跳到下一檔,到最後一檔(400%)時放大鈕停用。
const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 400]
const ZOOM_MAX = ZOOM_PRESETS[ZOOM_PRESETS.length - 1]
const nextZoomIn = (current: number) => ZOOM_PRESETS.find((p) => p > current) ?? ZOOM_MAX

// 最常見:標題 + 動作列(對標 FileViewer Toolbar / Sidebar header)
function SingleRowDemo() {
  const [zoom, setZoom] = React.useState(100)
  return (
    <>
      <Closable>
        {(close) => (
          <Panel>
            <ChromeHeader>
              {/* 圖示 ↔ 檔名 = 同一個行內標記的間距(span 行內群:utility-registry canonical_micro_geometry 認得;ChromeHeader 自身 children 也是 gap 8px) */}
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <FileText size={16} className="shrink-0 text-foreground" aria-hidden />
                <TruncatedText display="block" className="text-body-lg text-foreground">2026 Q1 財務報告.pdf</TruncatedText>
              </span>
              {/* 右側按鈕 = children + flex(title flex-1 推開);排列遵循 action-bar:
                  動作群(放大/下載)── 群組分隔線 ── dismiss(關閉),buttons 全 size="sm"(chrome header canonical)。
                  分隔線唯一實作 = ButtonDivider,而且要住在自動高度的 ButtonGroup 裡(action-bar.spec.md「分隔線幾何」:
                  直接放在固定高度的 chrome header 會退化成容器高;禁用 Separator 畫 action region 群組線) */}
              <ButtonGroup>
                <Button
                  iconOnly
                  variant="text"
                  size="sm"
                  startIcon={ZoomIn}
                  aria-label="放大"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom(nextZoomIn)}
                />
                <Button
                  iconOnly
                  variant="text"
                  size="sm"
                  startIcon={Download}
                  aria-label="下載"
                  onClick={() => toast({ title: '已開始下載', description: '2026 Q1 財務報告.pdf' })}
                />
                <ButtonDivider />
                <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" onClick={close} />
              </ButtonGroup>
            </ChromeHeader>
            {/* chrome header 下方內容區:水平 loose(規則 6)、header → 第一個元素 tight(規則 2);放大 = 這一塊預覽跟著縮放 */}
            {/* @layout-space-magic-ok: meta 行 ↔ 內文 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
            <div className="flex flex-col gap-2 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] text-body text-fg-secondary" style={{ zoom: zoom / 100 }}>
              <p className="text-caption text-fg-muted">陳雅婷 更新於 2026/04/18 · 12 頁 · 2.4 MB</p>
              <p>本季合併營收 NT$4.82 億,較上季成長 8.2%;毛利率維持 41%。附錄含各區域損益與現金流量表。</p>
            </div>
          </Panel>
        )}
      </Closable>
      {/* 下載的回饋 Toast:每個獨立 story root 掛一個(toast.spec.md) */}
      <Toaster />
    </>
  )
}

export const SingleRow = () => <SingleRowDemo />
SingleRow.parameters = {
  docs: { description: { story: '最常見的標頭:左邊標題、右邊動作列,動作群與關閉鈕之間用分隔線隔開。檔案預覽工具列、側欄標頭都是這一型。' } },
}
SingleRow.storyName = '單列(標題 + 動作列)'

// header 含分頁列(對標 FileViewer InfoPanel / 設定頁 header):傳 tabsSlot 自動進兩列結構 —— 第一列標題、第二列分頁列全寬畫線
export const WithTabs = () => (
  <Closable>
    {(close) => (
      <Panel>
        <Tabs defaultValue="overview">
          <ChromeHeader
            tabsSlot={
              <TabsList>
                <TabsTrigger value="overview">概覽</TabsTrigger>
                <TabsTrigger value="activity">活動</TabsTrigger>
                <TabsTrigger value="files">檔案</TabsTrigger>
              </TabsList>
            }
          >
            <h2 className="min-w-0 flex-1 text-body-lg font-medium text-foreground">
              <TruncatedText display="block">Acme 品牌改版專案</TruncatedText>
            </h2>
            <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" onClick={close} />
          </ChromeHeader>
          {/* TabsContent 內建 mt-tight 已擁有 header → content(tabs.spec.md:195);內層只補水平 loose + 底部與頂部同值 tight(有框面板不擋頁面、高度貼內容 → 上下對稱,layoutSpace.spec.md 規則 4 第 4 列) */}
          <TabsContent value="overview">
            {/* @layout-space-magic-ok: 概覽兩行(專案 meta ↔ 說明)4px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
            <div className="flex flex-col gap-1 px-[var(--layout-space-loose)] pb-[var(--layout-space-tight)] text-body text-fg-secondary">
              <p>負責人:林思妤 · 期程:2026/03–2026/06 · 狀態:設計中</p>
              <p>將既有品牌識別全面翻新——logo、配色與元件庫,預計 Q2 上線。</p>
            </div>
          </TabsContent>
          <TabsContent value="activity">
            {/* 活動紀錄 = 一串同質清單列(ul / li:utility-registry canonical_micro_geometry 認得的清單群,列距 4px 不需放行章) */}
            <ul className="flex flex-col gap-1 px-[var(--layout-space-loose)] pb-[var(--layout-space-tight)] text-body text-fg-secondary">
              <li>陳柏宇 上傳了「新版 logo 提案 v3」· 2 小時前</li>
              <li>林思妤 將狀態改為「設計中」· 昨天</li>
              <li>Aisha Khan 留言:配色再往暖色調微調 · 3 天前</li>
            </ul>
          </TabsContent>
          <TabsContent value="files">
            {/* 檔案列 = 一串同質清單列(ul / li,同上) */}
            <ul className="flex flex-col gap-1 px-[var(--layout-space-loose)] pb-[var(--layout-space-tight)] text-body text-fg-secondary">
              <li>品牌識別規範_v3.pdf · 8.1 MB</li>
              <li>logo 原始檔.ai · 24 MB</li>
              <li>配色對照表.xlsx · 320 KB</li>
            </ul>
          </TabsContent>
        </Tabs>
      </Panel>
    )}
  </Closable>
)
WithTabs.parameters = {
  docs: { description: { story: '標頭內含分頁列:第一列是標題,第二列是全寬的分頁列,底線改由分頁列畫。檔案預覽的資訊面板是這一型。' } },
}
WithTabs.storyName = '含分頁列'

/* withTabs × overflow(scroll / menu)— header 分頁列在窄容器的溢出模式。
   對標專案管理工具的專案設定頁:細分頁多到單行放不下(概覽/待辦清單/衝刺/看板/報表/版本/元件/權限/通知)。
   Panel 限寬 420px + 9 個分頁強制觸發溢出;W2 契約(triggers 內縮 px-loose 對齊 header
   content row)三種 overflow 模式同享,border 隨溢出內容延展(min-w-full,header-canonical.spec.md Rule W2)。
   兩則共用同組分頁資料(同 tabs.stories.tsx OverflowScroll/OverflowMenu 精神),各教一種溢出機制。 */
const projectSettingsTabs = [
  { value: 'overview', label: '概覽', content: '負責人:張惟安 · 分類:客戶關係 · Scrum 流程已啟用' },
  { value: 'backlog', label: '待辦清單', content: 'Backlog 42 項:預設排序 = 優先級,顯示 story point 欄位' },
  { value: 'sprints', label: '衝刺', content: 'Sprint 18 進行中(04/14–04/28),完成 21 / 34 點' },
  { value: 'board', label: '看板', content: '欄位:待處理 / 進行中 / 審查中 / 完成;WIP 上限 5' },
  { value: 'reports', label: '報表', content: '燃盡圖 / 速度圖 / 累積流量圖,每週一自動寄送摘要' },
  { value: 'releases', label: '版本', content: 'v2.4.0 規劃中(05/30 發布)· v2.3.1 已發布' },
  { value: 'components', label: '元件', content: '前端 / API / 資料庫 / 通知服務,各自指派預設負責人' },
  { value: 'permissions', label: '權限', content: '管理員 3 人 · 成員 24 人;訪客僅能檢視看板' },
  { value: 'notifications', label: '通知', content: '議題指派與提及即時通知;摘要每日 09:00 寄送' },
] as const

/** 窄標頭的分頁列(overflow 模式由呼叫端給):標題 + 關閉、九個分頁 */
function ProjectSettingsHeader({ overflow }: { overflow: 'scroll' | 'menu' }) {
  return (
    <div className="w-[420px]">
      <Closable>
        {(close) => (
          <Panel>
            <Tabs defaultValue="overview">
              <ChromeHeader
                tabsSlot={
                  <TabsList overflow={overflow}>
                    {projectSettingsTabs.map((t) => (
                      <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                    ))}
                  </TabsList>
                }
              >
                <h2 className="min-w-0 flex-1 text-body-lg font-medium text-foreground">
                  <TruncatedText display="block">CRM 平台 — 專案設定</TruncatedText>
                </h2>
                <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" onClick={close} />
              </ChromeHeader>
              {projectSettingsTabs.map((t) => (
                <TabsContent key={t.value} value={t.value}>
                  <div className="px-[var(--layout-space-loose)] pb-[var(--layout-space-tight)] text-body text-fg-secondary">{t.content}</div>
                </TabsContent>
              ))}
            </Tabs>
          </Panel>
        )}
      </Closable>
    </div>
  )
}

// withTabs + overflow="scroll":窄 header 的分頁列單行橫向捲動(fade mask + 左右 arrow)
export const WithTabsOverflowScroll = () => <ProjectSettingsHeader overflow="scroll" />
WithTabsOverflowScroll.storyName = '含分頁列 — 溢出水平捲動'
WithTabsOverflowScroll.parameters = {
  docs: { description: { story: '分頁多到一列放不下時,分頁列單行橫向捲動,兩端淡出並出現捲動鈕。' } },
}

// withTabs + overflow="menu":窄 header 的分頁列 + 右側 ⌄ 導覽選單(show-all navigator)
export const WithTabsOverflowMenu = () => <ProjectSettingsHeader overflow="menu" />
WithTabsOverflowMenu.parameters = {
  docs: { description: { story: '分頁多到一列放不下時,分頁列右側出現 ⌄ 選單,列出全部分頁,點了就切過去。' } },
}
WithTabsOverflowMenu.storyName = '含分頁列 — 溢出 ⌄ 導覽選單'

// 總覽:只放前面各則沒教到的 —— 浮層標題列,與 leadingRail 槽位該去哪裡看(稽核 L130:原本把「單列」「含分頁列」原封不動再畫一次,
// leadingRail 那段只有一句叫人去別頁看、沒有連結)。leadingRail 專為「跟 sidebar 收合 icon 對齊」而生(寬 = sidebar 收合寬),
// 只在有 sidebar 時有意義 → 示範在 AppShell 主標頭佈局(leadingRail = <SidebarTrigger />),不在此孤立展示
// (2026-06-08 per user:孤立 demo 會誤導成通用 slot,且 icon 易被亂換)。
export const Overview = () => (
  // 教學框 = 共用教學頁元件(2026-10-20 T7 甲 / T8)
  <TutorialPage>
    <TutorialRule
      title="浮層標題列(SurfaceHeader)"
      note="Dialog / Sheet / Popover / Coachmark 的頂部標題列。高度由內容撐開、對齊 chrome 標頭的高度,跟 chrome 標頭共用同一組契約:底線、左右內距、關閉鈕尺寸、分頁連動。實際使用多半透過 DialogHeader / SheetHeader / PopoverHeader,這裡用底層的 SurfaceHeader 展示結構。"
      paragraph={false}
    >
      <Closable>
        {(close) => (
          // 浮層外殼 = 浮層的共同契約(rounded-lg + border-border + bg-surface-raised + elevation-200,同 popover.tsx 的 PopoverContent、
          // overlay-surface.stories.tsx 的 Shell —— 2026-06-08 這裡手刻成 rounded-md + border-divider,稽核 M094)
          <div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)]">
            <SurfaceHeader>
              <h2 className="min-w-0 flex-1 text-body-lg font-medium text-foreground">
                <TruncatedText display="block">編輯專案設定</TruncatedText>
              </h2>
              <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" onClick={close} />
            </SurfaceHeader>
            {/* 浮層 body 消費 SurfaceBody(px-loose py-tight,不手刻殼);標籤 / 值兩組用 DescriptionList */}
            <SurfaceBody>
              <DescriptionList cols={1}>
                <DescriptionItem label="專案名稱">Acme 品牌改版專案</DescriptionItem>
                <DescriptionItem label="可見範圍">團隊成員(12 人)</DescriptionItem>
              </DescriptionList>
            </SurfaceBody>
          </div>
        )}
      </Closable>
    </TutorialRule>
    <TutorialRule
      title="leadingRail 槽位在 AppShell 示範"
      note={
        <>
          ChromeHeader 另有 leadingRail 槽位(寬 = 側欄收合寬,專為跟側欄收合後的圖示對齊)。它只在有側欄時有意義,示範見{' '}
          <StoryLink kind="Design System/Components/AppShell/展示" name="主標頭佈局 — 全域+本地兩層(GitHub/Gmail/Slack 派)">AppShell 展示「主標頭佈局」</StoryLink>
          (全域標頭最左邊的側欄開關)。
        </>
      }
    />
  </TutorialPage>
)
Overview.parameters = {
  docs: { description: { story: '前面幾則沒涵蓋的兩件事:浮層的標題列怎麼組,以及側欄專用的 leadingRail 槽位去哪裡看。' } },
}
Overview.storyName = '總覽'
