// @benchmark-unverified-blanket: file-level retraction per M22 (d) — 產品架構參照(Linear / Notion / Figma / GitHub / Slack / Gmail 等)為 usage 觀察,非逐句 URL-cited;視為 unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/AppShell/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 規則的內容是一段文字 / 清單(不是範例區),不給 caption
const TutorialRule = createTutorialRule()

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-2xl">
      <UsageSection kind="when">
        <TutorialList>
          <li>
            多頁 web service 的主結構——Linear / Notion / Slack / GitHub / Asana 這類「左側導覽 + 中央工作區」產品。完整組合見{' '}
            <StoryLink kind="Design System/Components/AppShell/展示" name="主側欄佈局 — Linear 式議題追蹤">展示 → 主側欄佈局 — Linear 式議題追蹤</StoryLink>
          </li>
          <li>
            需要 sidebar + main 持續共存——在議題列表、看板、報表等頁面間切換時,左側導覽不重渲染、捲動位置不丟失。見{' '}
            <StoryLink kind="Design System/Components/AppShell/展示" name="主側欄佈局 + 頁面分頁">展示 → 主側欄佈局 + 頁面分頁</StoryLink>
          </li>
          <li>
            需要右側詳情面板(議題詳情 / inspector / 成員資料)跟 main 並存——如 Linear 點選議題後右側展開詳情。開合行為見{' '}
            <StoryLink kind="Design System/Components/AppShell/設計規格" name="狀態行為">設計規格 → 狀態行為(四區版面)</StoryLink>
          </li>
          <li>
            決定用 AppShell 之後,兩種版面模式(primary-sidebar / primary-header)怎麼選見{' '}
            <StoryLink kind="Design System/Components/AppShell/設計原則" name="佈局模式怎麼選">設計原則 → 佈局模式怎麼選</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>單頁 landing / marketing site(產品官網、定價頁)→ <code>&lt;main&gt;</code> 直接展開,沒導覽不需要 shell</li>
          <li>Auth 頁(login / signup)→ 自寫置中 layout,不被 sidebar 佔位</li>
          <li>Embedded widget / iframe(嵌進別人頁面的客服小視窗類)→ 已被 host shell 包住</li>
          <li>文件 reader(全螢幕閱讀)→ shell chrome 干擾閱讀</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="AppShell vs Sidebar:誰管什麼"
          note="AppShell 決定版面:Menu(側欄)此刻是並排、暫藏(只剩細列)還是左側浮層,以及 Menu、Right panel(詳情面板)、AI agent 各區的寬度(用各區最小寬現算,沒有固定斷點)。Sidebar 決定 Menu 的長相 —— 外觀、選單項、細列與浮層裡的樣子都由 Sidebar 元件自己定義,AppShell 不會去改 Sidebar 的樣式。多個 sidebar 的情境要等 Sidebar 元件本身支援後才提供。"
        />
      </UsageSection>
    </TutorialPage>
  ),
}

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    <TutorialPage className="max-w-2xl">
      {/* 2026-10-20 T5:原本是一串「❌ 禁: / ✅ 必:」開頭的清單 —— 對錯判斷只放在規則標題(全 DS 教學頁同一種寫法),每條各自一則規則;
          2026-10-15 r1b 複驗 F5 補齊 spec「Consumer 紀律」的 Menu 不用 collapsible="none"、各區最小寬、詳情面板標題列、版面模式固定四條 */}
      <TutorialRule
        title={<>❌ <code>&lt;AppShell&gt;</code> 裡不再放另一個 <code>&lt;AppShell&gt;</code></>}
        note="整頁框架只能有一個。"
      />
      <TutorialRule
        title={<>❌ <code>sidebar</code> 不傳裸 <code>&lt;div&gt;</code>,必傳 <code>&lt;Sidebar&gt;</code></>}
        note="才能維持一致的展開／收合、放不下時的左側浮層、鍵盤操作與視覺;傳其他容器雖然型別過得了,卻會失去這些導覽行為。"
      />
      <TutorialRule
        title={<>❌ <code>header</code> 不傳裸 <code>&lt;header&gt;</code>,改傳 <code>&lt;ChromeHeader&gt;</code></>}
        note="(或沿用同一套標準標頭結構自訂)才能得到一致的標頭高度、內距與對齊。"
      />
      <TutorialRule
        title="❌ 不硬性撐開 Main 區域的內距"
        note="Main 本身不加留白,由內容自己決定(自帶邊框的卡片、資料表各自帶內距)。"
      />
      <TutorialRule
        title={<>❌ AppShell 的 Menu 不用 <code>collapsible=&quot;none&quot;</code></>}
        note="AppShell 的面板都要能開關;不收合的側欄只用在 AppShell 以外。"
      />
      <TutorialRule
        title="✅ 各區最小寬照版面規則的消費者指引設定"
        note="Main 最小寬 + 細列寬 + 每一種詳情內容的最小寬,不超過產品要支援的最窄桌機版面寬,水平捲軸就幾乎不會出現。"
      />
      <TutorialRule
        title={<>❌ 詳情面板(<code>AppShellAside</code>)的標題列不加第二行或動作鈕</>}
        note="標題列只放單行標題與關閉鈕,說明文字放在面板內容裡。"
      />
      <TutorialRule
        title={<>✅ 版面模式(<code>layout</code>)在產品啟動時就固定,使用中不切換</>}
        note="切換等於產品角色改變,應重新載入整個 app。"
      />
      <TutorialRule
        title="✅ Main 內容的間距沿用既有版面間距原則"
        note="頁面標頭、卡片、資料表、純列表各按對應規則處理。"
      />
    </TutorialPage>
  ),
}


// 佈局模式選型 deep-dive — 內容錨定 app-shell.spec.md 的「Layout mode 兩 mode 差異」+「WorkspaceBrand 放置 SSOT」
// +「帳號入口(Account entry)放置 SSOT」段(均含「浮層精修」子句 —— 2026-10-14 前叫 Responsive 精修;用段名錨定不寫死行號避免 drift)。
// category-templates.md component-specific `{Topic}Rule` idiom
export const LayoutModeRule: Story = {
  name: '佈局模式怎麼選',
  render: () => (
    <TutorialPage className="max-w-2xl">
      <TutorialRule title="唯一判準:頂部標頭服務的範圍">
        <p className="text-body">
          唯一的區分標準 = <strong>頂部標頭服務的是「目前這一頁」還是「整個產品」</strong>,
          <em>不是</em>工作區(workspace)的數量多寡(Notion / Gmail 都支援多工作區,卻分屬不同派)。
          問自己:頂部那條標頭列服務的是當前頁面,還是整個產品?
        </p>
        <TutorialList>
          <li>
            <strong>primary-sidebar</strong>:頂部是<strong>服務當前頁的工具列</strong> —
            放麵包屑、頁面層級操作、篩選。Sidebar 頂天立地,工作區品牌(<code>WorkspaceBrand</code>)放在 sidebar 頂。
            參考 Linear / Notion / Figma。
          </li>
          <li>
            <strong>primary-header</strong>:多一條<strong>橫跨頂部、服務整個產品的全域標頭</strong> —
            放帳號、工作區切換、跨頁搜尋、通知;服務當前頁的工具列
            <em>仍在</em>主欄頂部,只是上面多了這條全域標頭。工作區品牌改放全域標頭(<code>globalHeader</code>)左側。
            參考 GitHub / Slack / Gmail。完整組合見{' '}
            <StoryLink kind="Design System/Components/AppShell/展示" name="主標頭佈局 — 全域+本地兩層(GitHub/Gmail/Slack 派)">展示 → 主標頭佈局 — 全域+本地兩層</StoryLink>
          </li>
        </TutorialList>
        <p className="text-caption text-fg-secondary">
          兩種模式是產品的角色定位——啟動時就固定,不該在執行期切換。視覺對照圖見{' '}
          <StoryLink kind="Design System/Components/AppShell/設計規格" name="兩種布局模式對照圖">設計規格 → 兩種布局模式對照圖</StoryLink>
        </p>
      </TutorialRule>

      <TutorialRule title="常見誤解:全域標頭會取代當前頁工具列">
        <p className="text-body">
          錯。primary-header = primary-sidebar 的所有東西 + <strong>額外一條</strong>全域標頭在頂;
          當前頁工具列(<code>header</code> slot)<strong>仍然存在</strong>。GitHub / Slack / Gmail 全部同時保有兩層,
          不是二選一。
        </p>
      </TutorialRule>

      <TutorialRule title="WorkspaceBrand 跟著 mode 走(只能出現一次)">
        <TutorialList>
          <li><strong>primary-sidebar</strong>:WorkspaceBrand 放 Sidebar 頂部(<code>&lt;SidebarHeader&gt;</code> 內)— Linear / Notion / Figma file panel</li>
          <li><strong>primary-header</strong>:WorkspaceBrand 改放 globalHeader 左側(搭配 SidebarTrigger),SidebarHeader 留空 — GitHub / Gmail / Figma file editor</li>
          <li>禁止:<code>primary-header</code> mode 同時在 globalHeader + SidebarHeader 各放一份 = 視覺冗餘 + 跨產品識別混淆(WorkspaceBrand 視覺 SSOT,只能出現一次)</li>
        </TutorialList>
      </TutorialRule>

      <TutorialRule title="帳號入口(個人設定)跟著 mode 走(只能出現一次)">
        <TutorialList>
          <li><strong>primary-sidebar</strong>:帳號 / 個人設定放 Sidebar 底部(<code>&lt;SidebarFooter&gt;</code>)— Linear / Notion / Figma</li>
          <li><strong>primary-header</strong>:帳號入口改放 globalHeader 右側 avatar(品牌左、帳號右,左右對稱),sidebar 不放帳號頁尾 — GitHub / Gmail / Slack 帳號一律在全域標頭右上</li>
          <li>開「個人資料 / 設定 / 登出」帳號選單(<code>&lt;DropdownMenu&gt;</code>),<strong>不用 ProfileCard</strong>(ProfileCard 是看別人的人員卡,預設動作 Chat/通話用在自己身上不對)</li>
          <li>帳號 avatar = 24px,跟左側品牌 avatar 同尺寸(沿用標準標頭的頭像尺寸規範);右側邊距與品牌距分割線對稱</li>
          <li>禁止:<code>primary-header</code> mode 同時在 globalHeader + sidebar footer 各放一份 = 入口混淆(帳號入口視覺 SSOT,只能出現一次)</li>
        </TutorialList>
      </TutorialRule>
    </TutorialPage>
  ),
}
