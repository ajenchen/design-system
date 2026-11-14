// 「選到就露出來」(scripts/overflow-reveal-selected-invariant.mjs)夾具那一段的頁面 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
//
// 為什麼不是 story(A7 ②,2026-11-14;design-horizontal-scroll.md 第三節):
//   · 沒有任何一則 story 有「清單變長,而且新的那一項就是目前這一項」的操作;溢出 story 的預設選中也都是第一項,
//     「一打開就選在中間 / 最後一項」掛載那一次只會夾在起點,驗不到置中;
//   · story 裡每一項多寬看這台機器的字型(CI runner 沒有中日韓字型),這裡每一項寬度寫死,幾何不看字型;
//   · 三種情境要帶參數(選中第幾項、對照組的破法),加成 story 會進每一支全庫掃描的閘與視覺基準。
// 樣式來自「正在服務的那一份建置」;元件行為來自這次 checkout 的原始碼(每次跑閘重新打包)——
// 受測的 useRevealSelected 與三個消費者(Tabs / ChipGroup / FileViewer 縮圖列)怎麼接它,都是產品的真程式。
//
// 網址參數:
//   strip    = tabs-scroll | tabs-menu | chip-scroll | chip-menu | filmstrip(沒給或不認得 = tabs-scroll)
//   selected = 一開始選中第幾項(0 起算;沒給 = 0)。Tabs / Chip:頁面載入就是掛載;縮圖列:「開啟」鈕打開檢視器時停在第幾份
//   count    = 項目數(沒給 = 12)
//   revealSabotage = 對照組的破法 —— 夾具自己不讀,是閘在開頁前裝的揭露探針在讀
// 「新出現的已選項目」:Tabs / Chip 按 #add;縮圖列的檢視器是 modal、外面的按鈕點不到,
// 改由閘呼叫 window.__overflowRevealFixture.addAfterCurrent()(真實情境 = 上傳完成 / 遠端更新)。
// 夾具自己的版面只能用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/design-system/components/Button/button'
import { Chip, ChipGroup } from '@/design-system/components/Chip/chip'
import { FileViewer, type FileInfo } from '@/design-system/components/FileViewer/file-viewer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/design-system/components/Tabs/tabs'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'

const STRIPS = ['tabs-scroll', 'tabs-menu', 'chip-scroll', 'chip-menu', 'filmstrip'] as const
type Strip = (typeof STRIPS)[number]
const query = new URLSearchParams(window.location.search)
const strip: Strip = STRIPS.find((s) => s === query.get('strip')) ?? 'tabs-scroll'
const count = Math.max(3, Number(query.get('count') ?? 12) || 12)
const selected0 = Math.min(count - 1, Math.max(0, Number(query.get('selected') ?? 0) || 0))

// 寫死的幾何(閘不把這些數字寫成期望值 —— 期望一律從量到的幾何判;改這裡只會讓閘的「幾何不成立」變成儀器失效):
// 外框 360 − 兩側內距 16 = 捲動容器可視寬 328(menu 模式再扣 ⌄);每一項 Tabs 72 / Chip 80;縮圖本來就是 64(file-viewer.tsx THUMB_SIZE)
const BOX_WIDTH = 360
const TAB_WIDTH = 72
const CHIP_WIDTH = 80

type Item = { value: string; label: string }
const pad = (names: string[], prefix: string): Item[] =>
  Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: names[i] ?? `${prefix} ${i + 1}` }))

// 專案管理工具的檢視列(Linear / Notion / Airtable 的「檢視」):「複製目前檢視」= 新檢視插在目前這一個右邊,而且直接切過去
const VIEW_NAMES = ['全部工作', '我的工作', '本週到期', '看板', '時間軸', '行事曆', '依負責人', '依優先度', '待審核', '已完成', '已封存', '回收桶']
function TabsScene({ overflow }: { overflow: 'scroll' | 'menu' }) {
  const [items, setItems] = React.useState<Item[]>(() => pad(VIEW_NAMES, '檢視'))
  const [value, setValue] = React.useState(`v${selected0}`)
  const duplicate = () => {
    const at = items.findIndex((it) => it.value === value)
    const next: Item = { value: `copy-${items.length}`, label: `${items[at]?.label ?? '檢視'} 副本` }
    setItems([...items.slice(0, at + 1), next, ...items.slice(at + 1)])
    setValue(next.value)
  }
  return (
    <div id="box" style={{ width: BOX_WIDTH, padding: 16, boxSizing: 'border-box' }}>
      <Tabs value={value} onValueChange={setValue}>
        <TabsList overflow={overflow}>
          {items.map((it) => (
            <TabsTrigger key={it.value} value={it.value} style={{ width: TAB_WIDTH, flexShrink: 0 }}>{it.label}</TabsTrigger>
          ))}
        </TabsList>
        {items.map((it) => <TabsContent key={it.value} value={it.value}>{it.label}的工作清單</TabsContent>)}
      </Tabs>
      <div style={{ marginTop: 16 }}><Button id="add" variant="tertiary" onClick={duplicate}>複製目前檢視</Button></div>
    </div>
  )
}

// 技術部落格文章列表的標籤篩選(多選):「加入篩選標籤」= 新標籤插在最後一顆已選的右邊,一出現就是已選
const TAG_NAMES = ['設計系統', '無障礙', '效能', '前端', '後端', '資料視覺化', '產品管理', '使用者研究', '文案', '行動版', '國際化', '測試']
function ChipScene({ layout }: { layout: 'scroll' | 'menu' }) {
  const [items, setItems] = React.useState<Item[]>(() => pad(TAG_NAMES, '標籤'))
  const [value, setValue] = React.useState<string[]>([`v${selected0}`])
  const addTag = () => {
    const at = items.findIndex((it) => it.value === value[value.length - 1])
    const next: Item = { value: `new-${items.length}`, label: 'AI 協作' }
    setItems([...items.slice(0, at + 1), next, ...items.slice(at + 1)])
    setValue([...value, next.value])
  }
  return (
    <div id="box" style={{ width: BOX_WIDTH, padding: 16, boxSizing: 'border-box' }}>
      <ChipGroup type="multiple" layout={layout} value={value} onValueChange={(v) => setValue(v as string[])}>
        {items.map((it) => <Chip key={it.value} value={it.value} style={{ width: CHIP_WIDTH, flexShrink: 0 }}>{it.label}</Chip>)}
      </ChipGroup>
      <div style={{ marginTop: 16 }}><Button id="add" variant="tertiary" onClick={addTag}>加入篩選標籤</Button></div>
    </div>
  )
}

// 客服工單的附件檢視(縮圖列)。附件用 application/zip:走後備顯示(檔案圖示),不發任何圖片請求
const ATTACHMENT_NAMES = ['需求規格書', '線框稿', '視覺稿-v1', '視覺稿-v2', '切圖資源', '圖示包', '字型授權', '測試報告', '錯誤截圖', '使用者訪談', '會議紀錄', '上線檢查表']
declare global {
  interface Window { __overflowRevealFixture?: { addAfterCurrent: () => void } }
}
function FilmstripScene() {
  const [files, setFiles] = React.useState<FileInfo[]>(() => Array.from({ length: count }, (_, i) => ({
    id: `f${i}`, url: `/attachments/${i}.zip`, name: `${ATTACHMENT_NAMES[i] ?? `附件-${i + 1}`}.zip`, mimeType: 'application/zip', size: 48_000,
  })))
  const [open, setOpen] = React.useState(false)
  const [index, setIndex] = React.useState(selected0)
  const indexRef = React.useRef(index)
  indexRef.current = index
  // 「補傳一份,插在目前這一份後面並切過去」:同一次狀態更新裡新縮圖掛上來就是目前那一張
  const addAfterCurrent = React.useCallback(() => {
    const at = indexRef.current
    setFiles((prev) => [
      ...prev.slice(0, at + 1),
      { id: `extra-${prev.length}`, url: `/attachments/extra-${prev.length}.zip`, name: '補充資料.zip', mimeType: 'application/zip', size: 12_000 },
      ...prev.slice(at + 1),
    ])
    setIndex(at + 1)
  }, [])
  React.useEffect(() => {
    window.__overflowRevealFixture = { addAfterCurrent }
    return () => { delete window.__overflowRevealFixture }
  }, [addAfterCurrent])
  return (
    <div id="box" style={{ padding: 16 }}>
      <Button id="open" variant="tertiary" onClick={() => setOpen(true)}>開啟第 {selected0 + 1} 個附件</Button>
      <FileViewer files={files} open={open} onOpenChange={setOpen} index={index} onIndexChange={setIndex} showFilmstrip readOnly />
    </div>
  )
}

function Fixture() {
  if (strip === 'tabs-scroll') return <TabsScene overflow="scroll" />
  if (strip === 'tabs-menu') return <TabsScene overflow="menu" />
  if (strip === 'chip-scroll') return <ChipScene layout="scroll" />
  if (strip === 'chip-menu') return <ChipScene layout="menu" />
  return <FilmstripScene />
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('overflow-reveal fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色);
// 溢出箭頭是 iconOnly 的 Button,會自動包 Tooltip。Storybook 預設不開 StrictMode,這裡也不開(同 sidebar-rail-center 夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div data-fixture-strip={strip} style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)', minHeight: '100vh' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)
