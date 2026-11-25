// @anatomy-exempt: spec-reference tables(Props 速查 / Layout token / 視覺 token / 開關方式對照 / Focus management)為靜態文件對照表,非互動資料網格 — DataTable 為 row-data 互動元件,過度包裝靜態 spec 對照。對齊 Sheet / Popover anatomy 同 pattern。
// @anatomy-rationale:
//   Inspector N/A — 設計規格頁不放開得起來的對話框(登記簿 A32「dialog 的設計規格的範例給我拿掉」);可調的 props 列在元件總覽的 Props 速查,開起來的樣子在展示頁。
import type { Meta, StoryObj } from '@storybook/react-vite'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { StoryLink } from '@/design-system/stories-helpers/examples/tutorial-page'

// 設計規格頁只留表格與量測,不放開得起來的對話框(登記簿 A32「dialog 的設計規格的範例給我拿掉」);開起來的樣子在「展示」頁。
// 2026-10-28 前這頁還留著元件檢閱器(一進頁就開著的對話框)、高度行為兩則、尺寸表四顆開啟鈕、狀態行為兩則對話框,
// 裡面的按鈕點了都沒反應(稽核 M009 / M098);狀態行為那則還在教「破壞性確認框禁 Esc / 點遮罩」(稽核 H03,登記簿 D23) —— 一併拿掉。

const meta: Meta = {
  title: 'Design System/Components/Dialog/設計規格',
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
        <Desc>Dialog 由 Overlay + Content 組成。Content 分三個區塊:Header(邊框底)+ Body(可捲動 flex-1)+ Footer(邊框頂)。基於 Radix Dialog,橋接 DS token。開起來的樣子見<StoryLink kind="Design System/Components/Dialog/展示" name="基本">展示頁</StoryLink>。</Desc>
      </div>

      <div>
        <H3>結構說明</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>區塊</Th><Th>CSS</Th><Th>用途</Th></tr></thead>
            <tbody>
              <tr><Td mono>DialogHeader</Td><Td mono>border-b, px-loose py-tight</Td><Td>Title + Close button(靠右,flex 第一 child flex-1 grow 自然右推,非 position:fixed)</Td></tr>
              <tr><Td mono>DialogBody</Td><Td mono>ScrollArea(flex-1 min-h-0)+ inner div(px-loose;上下由容器自己給:data-layout-body=&quot;fill&quot;)</Td><Td>主要內容(ScrollArea 捲動;底部留白依最後一個東西,照 layoutSpace.spec.md 規則 4)</Td></tr>
              <tr><Td mono>DialogFooter</Td><Td mono>border-t, px-loose py-tight</Td><Td>Action buttons(justify-end, gap-2)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['height', "'fill' | 'hug'", "'fill'", "'hug'=隨內容長高 / 'fill'=填滿可用高度(body 捲動);判準:開啟期間內容高度會不會變"],
                ['maxHeight', 'string | number', '—', '只能選更矮的上限:min(視窗可用高度, 此值)'],
                ['width', "'sm' | 'md' | 'lg' | 'xl' | number", "'md'", '寬度檔位或數字(px),兩種都是最大寬:實際寬 = min(此值, 所在區塊寬 − 96),沒有下限。檔位見「尺寸對照表」;數字只給檔位不適用的產品特例'],
                ['actions(DialogHeader)', 'ReactNode', '—', 'Header 級操作(上一筆 / 下一筆 / ⋮ 更多);DS 自動在 actions 與關閉 × 之間放分隔線,防誤觸關閉'],
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

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>寬度檔位</H3>
        <Desc>
          <code>width</code> 收四個檔名或數字(px),預設 <code>md</code>。數字是寬螢幕時的寬,也是上限;寬度不隨密度變,內距隨密度變(md 16 / lg 24),所以內容寬列兩組。
          怎麼選:一件 → sm;多件疊成一欄 → md;有一件很寬 → lg;兩欄 → xl。內容不得橫向捲動,放不下往上一檔。
          開起來的樣子:<StoryLink kind="Design System/Components/Dialog/展示" name="大檔位:對話框裡放表格">大檔位</StoryLink>、
          <StoryLink kind="Design System/Components/Dialog/展示" name="超大檔位:兩欄記錄詳情">超大檔位</StoryLink>。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>檔位</Th>
                <Th>寬</Th>
                <Th>內容寬(md / lg 密度)</Th>
                <Th>放什麼</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>sm</Td><Td mono>400</Td><Td mono>368 / 352</Td><Td>只有一件事:一兩句話(確認、刪除確認、告知、離開不儲存),或一個控制項(改名輸入框、一個選單)</Td></tr>
              <tr><Td mono>md ★ 預設</Td><Td mono>480</Td><Td mono>448 / 432</Td><Td>幾件事疊成一欄:多欄位表單、說明加欄位、成員清單。不確定時用它</Td></tr>
              <tr><Td mono>lg</Td><Td mono>640</Td><Td mono>608 / 592</Td><Td>有一件東西本身就寬:表格、拖放上傳區、圖片預覽。只有文字時不用</Td></tr>
              <tr><Td mono>xl</Td><Td mono>960</Td><Td mono>928 / 912</Td><Td>兩欄並排(主內容 + 資訊欄)或 lg 放不下的表格。建議上限</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted">
          實際寬 = min(檔位或數字, 所在區塊寬 − 96px):四邊各留 <code>--layout-space-viewport-inset</code>(48px),沒有下限。
          所在區塊平常是視窗;傳 <code>portalContainer</code> 時是那個舞台。各檔開始內縮的寬:sm 496 / md 576 / lg 736 / xl 1056。
          產品自填數字不設上限,但先用檔位;比 xl 還大的內容先考慮改成頁面或側板。規則與出處住 dialog.spec.md「寬度檔位」。
        </p>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>關閉方式</H3>
        <Desc>
          所有 modal 預設都可以點遮罩或按 Esc 關閉,破壞性的確認框也一樣 —— 點旁邊就是返回。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>關閉方式</Th>
                <Th>預設行為</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>右上角 ×(DialogHeader)</Td><Td>永遠可用</Td></tr>
              <tr><Td>Esc</Td><Td>一次只少一層;焦點所在的控件自己那一層也算一層(改過的欄位第一下回復、第二下才關)</Td></tr>
              <tr><Td>點遮罩</Td><Td>關閉 = 返回</Td></tr>
              <tr><Td>程式關閉</Td><Td mono>setOpen(false)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Focus management</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>階段</Th><Th>行為</Th></tr></thead>
            <tbody>
              <tr><Td>Open</Td><Td>DialogContent 攔截 Radix 預設(<code>onOpenAutoFocus</code>):focus 落在 body 第一個有意義互動元素(input / textarea / select / button,排除右上關閉 X);無則退到 footer 第一顆按鈕,再退到 container。避免 Radix 預設 focus close X 觸發 tooltip</Td></tr>
              <tr><Td>Tab cycle</Td><Td>focus trap(Radix)——Tab 在 Dialog 內循環,不跳到背景頁</Td></tr>
              <tr><Td>Close</Td><Td>focus 自動回到觸發 Dialog 的原 trigger element(Radix)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Density</H3>
        <Desc>Dialog 不自設任何 density attribute,layout-space + ui-size 全繼承 page。md page → body px-loose 16 / header py-tight 12 → header 48;lg page → 24 / 16 → header 56,隨 page tier。modal 寬鬆呼吸由 page tier 自動滿足:lg 產品拿 24;md 產品本就要緊湊(資訊密集),16 仍留得出內容與外框之間的呼吸空間,是本 DS modal 內距的下限。有同類密度切換的{' '}
          <a href="https://cloudscape.design/foundation/visual-foundation/content-density/" className="text-primary hover:text-primary-hover font-medium" target="_blank" rel="noreferrer">AWS Cloudscape</a>{' '}
          也讓緊湊間距套到所有元件(例外只列說明性元件與小目標,不含 modal),不把 modal 釘在固定 tier。</Desc>
      </div>

      <div>
        <H3>Layout token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Area</Th><Th>Token</Th><Th>數值</Th></tr></thead>
            <tbody>
              <tr><Td>水平 padding(Header / Body / Footer 統一)</Td><Td mono>--layout-space-loose</Td><Td>16/24 px</Td></tr>
              <tr><Td>Header / Footer 垂直 padding</Td><Td mono>--layout-space-tight</Td><Td>12/16 px</Td></tr>
              <tr><Td>Body 垂直 padding(top)</Td><Td mono>--layout-space-tight</Td><Td>12/16 px</Td></tr>
              <tr><Td>Body 垂直 padding(bottom)</Td><Td mono>--layout-space-bottom</Td><Td>48 px(固定)</Td></tr>
              <tr><Td>Viewport inset(四邊)</Td><Td mono>--layout-space-viewport-inset</Td><Td>48 px(四邊統一)</Td></tr>
              <tr><Td>Footer 按鈕間距</Td><Td mono>gap-2</Td><Td>8 px</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>視覺 token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>屬性</Th><Th>Token</Th></tr></thead>
            <tbody>
              <tr><Td>Overlay</Td><Td mono>bg-overlay</Td></tr>
              <tr><Td>Shadow</Td><Td mono>--elevation-200(浮層級)</Td></tr>
              <tr><Td>圓角</Td><Td mono>rounded-lg(8px)</Td></tr>
              <tr><Td>背景</Td><Td mono>bg-surface-raised</Td></tr>
              <tr><Td>外邊框</Td><Td mono>border-border</Td></tr>
              <tr><Td>Header/Footer 分隔線</Td><Td mono>border-divider</Td></tr>
              <tr><Td>Title</Td><Td mono>text-body-lg font-medium truncate</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>動畫</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>階段</Th><Th>幾何</Th><Th>時長 / 曲線(motion token)</Th></tr></thead>
            <tbody>
              <tr><Td>進場</Td><Td mono>fade-in-0 + zoom-in-95(從中心淡入 + 輕微縮放,不位移)</Td><Td mono>--motion-duration-surface / --motion-easing-enter</Td></tr>
              <tr><Td>離場</Td><Td mono>fade-out-0 + zoom-out-95</Td><Td mono>--motion-duration-surface / --motion-easing-exit</Td></tr>
              <tr><Td>reduced-motion</Td><Td mono>不播(surfaceMotion 只在 motion-safe 下宣告動畫)</Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-[var(--layout-space-tight)]">無障礙設計</h3>
      {/* 原本一整段 whitespace-pre-line 字串(反引號原樣顯示、開頭「詳 dialog.spec.md」是內部代號)→ 改成真的段落與清單;段落之間 tight(同一段文字流) */}
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p>Radix Dialog 自動處理:</p>
        <ul className="list-disc pl-5">
          <li>Modal 語意:<code>role="dialog"</code>(Radix 刻意不設 <code>aria-modal</code>,改用 <code>hideOthers()</code> 把背景兄弟節點設 <code>aria-hidden</code>,加上 FocusScope 鎖焦點達成隔離)</li>
          <li>標題綁定:<code>&lt;DialogTitle&gt;</code> 自動成為 <code>aria-labelledby</code> 指向的對象,螢幕報讀器開啟時讀出標題</li>
          <li>焦點鎖:焦點鎖在對話框內,Tab 循環不會跑到背景</li>
          <li>Esc 關閉:一次只少一層;焦點所在的控件自己那一層也算一層</li>
          <li>關閉後還焦點:關閉的那一刻焦點回到觸發鈕</li>
          <li>點遮罩關閉:點遮罩 = 返回</li>
        </ul>
        <p>Consumer 必須保留 <code>&lt;DialogTitle&gt;</code>——即使畫面上不顯示,也要用 VisuallyHidden 包起來給螢幕報讀器。</p>
      </div>
    </div>
  ),
}
