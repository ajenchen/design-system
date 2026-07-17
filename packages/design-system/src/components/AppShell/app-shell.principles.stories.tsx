// @benchmark-unverified-blanket: file-level retraction per M22 (d) — 產品架構參照(Linear / Notion / Figma / GitHub / Slack / Gmail 等)為 usage 觀察,非逐句 URL-cited;視為 unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Components/AppShell/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const UsageGuidance: Story = {
  name: '使用準則',
  render: () => (
    <div className="prose max-w-2xl space-y-6 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
      <section>
        <h2 className="text-h4 mb-2">何時用 AppShell</h2>
        <ul className="text-body space-y-2">
          <li>
            • 多頁 web service 的主結構——Linear / Notion / Slack / GitHub / Asana 這類「左側導覽 + 中央工作區」產品。完整組合見{' '}
            <LinkTo kind="Design System/Components/AppShell/展示" name="主側欄佈局 — Linear 式議題追蹤"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">展示 → 主側欄佈局 — Linear 式議題追蹤</span></LinkTo>
          </li>
          <li>
            • 需要 sidebar + main 持續共存——在議題列表、看板、報表等頁面間切換時,左側導覽不重渲染、捲動位置不丟失。見{' '}
            <LinkTo kind="Design System/Components/AppShell/展示" name="主側欄佈局 + 頁面分頁"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">展示 → 主側欄佈局 + 頁面分頁</span></LinkTo>
          </li>
          <li>
            • 需要右側詳情面板(議題詳情 / inspector / 成員資料)跟 main 並存——如 Linear 點選議題後右側展開詳情。開合行為見{' '}
            <LinkTo kind="Design System/Components/AppShell/設計規格" name="右側面板開合行為(兩種模式)"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">設計規格 → 右側面板開合行為</span></LinkTo>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-h4 mb-2">何時不用</h2>
        <ul className="text-body space-y-1">
          <li>• 單頁 landing / marketing site(產品官網、定價頁)→ `&lt;main&gt;` 直接展開,沒導覽不需要 shell</li>
          <li>• Auth 頁(login / signup)→ 自寫置中 layout,不被 sidebar 佔位</li>
          <li>• Embedded widget / iframe(嵌進別人頁面的客服小視窗類)→ 已被 host shell 包住</li>
          <li>• 文件 reader(全螢幕閱讀)→ shell chrome 干擾閱讀</li>
        </ul>
      </section>

      <section>
        <h2 className="text-h4 mb-2">Layout mode 怎麼選</h2>
        <p className="text-body">
          兩種佈局模式(primary-sidebar / primary-header)的選型決策樹獨立成「佈局模式怎麼選」story(含
          WorkspaceBrand 放置規則),見本頁側欄或{' '}
          <LinkTo kind="Design System/Components/AppShell/設計原則" name="佈局模式怎麼選"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">設計原則 → 佈局模式怎麼選</span></LinkTo>
        </p>
      </section>

      <section>
        <h2 className="text-h4 mb-2">vs Sidebar 規則</h2>
        <p className="text-body">
          AppShell 只負責整體組合、版面模式、以及右側面板的響應式開合。Sidebar 的外觀、行為、行動裝置上的
          抽屜形式都由 Sidebar 元件自己定義,<strong>AppShell 不會去改 Sidebar 的樣式</strong>。
          多個 sidebar 的情境要等 Sidebar 元件本身支援後才提供。
        </p>
      </section>

      <section>
        <h2 className="text-h4 mb-2">Consumer 紀律</h2>
        <ul className="text-body space-y-1">
          <li>❌ 禁:`&lt;AppShell&gt;` 內塞另一個 `&lt;AppShell&gt;`(整頁框架只能有一個)</li>
          <li>❌ 禁:`sidebar` 傳裸 `&lt;div&gt;` → 必傳 `&lt;Sidebar&gt;`,才能維持一致的展開／收合、行動裝置抽屜、鍵盤操作與視覺;傳其他容器雖然型別過得了,卻會失去這些導覽行為</li>
          <li>❌ 禁:`header` 傳裸 `&lt;header&gt;` → 應傳 `&lt;ChromeHeader&gt;`(或沿用同一套標準標頭結構自訂),才能得到一致的標頭高度、內距與對齊</li>
          <li>❌ 禁:硬性撐開 Main 區域的內距 → Main 本身不加留白,由內容自己決定(自帶邊框的卡片、資料表各自帶內距)</li>
          <li>✅ 必:Main 內容的間距沿用既有版面間距原則——頁面標頭、卡片、資料表、純列表各按對應規則處理</li>
        </ul>
      </section>
    </div>
  ),
}

// 佈局模式選型 deep-dive — 內容錨定 app-shell.spec.md 的「Layout mode 兩 mode 差異」+「WorkspaceBrand 放置 SSOT」
// +「帳號入口(Account entry)放置 SSOT」段(均含 Responsive 精修子句;用段名錨定不寫死行號避免 drift)。
// category-templates.md component-specific `{Topic}Rule` idiom
export const LayoutModeRule: Story = {
  name: '佈局模式怎麼選',
  render: () => (
    <div className="prose max-w-2xl space-y-6 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
      <section>
        <h2 className="text-h4 mb-2">唯一判準:頂部標頭服務的範圍</h2>
        <p className="text-body mb-2">
          唯一的區分標準 = <strong>頂部標頭服務的是「目前這一頁」還是「整個產品」</strong>,
          <em>不是</em>工作區(workspace)的數量多寡(Notion / Gmail 都支援多工作區,卻分屬不同派)。
          問自己:頂部那條標頭列服務的是當前頁面,還是整個產品?
        </p>
        <ul className="text-body space-y-1">
          <li>
            <strong>primary-sidebar</strong>:頂部是<strong>服務當前頁的工具列</strong> —
            放麵包屑、頁面層級操作、篩選。Sidebar 頂天立地,工作區品牌(`WorkspaceBrand`)放在 sidebar 頂。
            參考 Linear / Notion / Figma。
          </li>
          <li>
            <strong>primary-header</strong>:多一條<strong>橫跨頂部、服務整個產品的全域標頭</strong> —
            放帳號、工作區切換、跨頁搜尋、通知;服務當前頁的工具列
            <em>仍在</em>主欄頂部,只是上面多了這條全域標頭。工作區品牌改放全域標頭(`globalHeader`)左側。
            參考 GitHub / Slack / Gmail。完整組合見{' '}
            <LinkTo kind="Design System/Components/AppShell/展示" name="主標頭佈局 — 全域+本地兩層(GitHub/Gmail/Slack 派)"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">展示 → 主標頭佈局 — 全域+本地兩層</span></LinkTo>
          </li>
        </ul>
        <p className="text-caption text-fg-secondary mt-2">
          兩種模式是產品的角色定位——啟動時就固定,不該在執行期切換。視覺對照圖見{' '}
          <LinkTo kind="Design System/Components/AppShell/設計規格" name="兩種布局模式對照圖"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">設計規格 → 兩種布局模式對照圖</span></LinkTo>
        </p>
      </section>

      <section>
        <h2 className="text-h4 mb-2">常見誤解:全域標頭會取代當前頁工具列</h2>
        <p className="text-body">
          錯。primary-header = primary-sidebar 的所有東西 + <strong>額外一條</strong>全域標頭在頂;
          當前頁工具列(`header` slot)<strong>仍然存在</strong>。GitHub / Slack / Gmail 全部同時保有兩層,
          不是二選一。
        </p>
      </section>

      <section>
        <h2 className="text-h4 mb-2">WorkspaceBrand 跟著 mode 走(只能出現一次)</h2>
        <ul className="text-body space-y-1">
          <li>• <strong>primary-sidebar</strong>:WorkspaceBrand 放 Sidebar 頂部(`&lt;SidebarHeader&gt;` 內)— Linear / Notion / Figma file panel</li>
          <li>• <strong>primary-header</strong>:WorkspaceBrand 改放 globalHeader 左側(搭配 SidebarTrigger),SidebarHeader 留空 — GitHub / Gmail / Figma file editor</li>
          <li>❌ 禁:`primary-header` mode 同時在 globalHeader + SidebarHeader 各放一份 = 視覺冗餘 + 跨產品識別混淆(WorkspaceBrand 視覺 SSOT,只能出現一次)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-h4 mb-2">帳號入口(個人設定)跟著 mode 走(只能出現一次)</h2>
        <ul className="text-body space-y-1">
          <li>• <strong>primary-sidebar</strong>:帳號 / 個人設定放 Sidebar 底部(`&lt;SidebarFooter&gt;`)— Linear / Notion / Figma</li>
          <li>• <strong>primary-header</strong>:帳號入口改放 globalHeader 右側 avatar(品牌左、帳號右,左右對稱),sidebar 不放帳號頁尾 — GitHub / Gmail / Slack 帳號一律在全域標頭右上</li>
          <li>• 開「個人資料 / 設定 / 登出」帳號選單(`&lt;DropdownMenu&gt;`),<strong>不用 ProfileCard</strong>(ProfileCard 是看別人的人員卡,預設動作 Chat/通話用在自己身上不對)</li>
          <li>• 帳號 avatar = 24px,跟左側品牌 avatar 同尺寸(沿用標準標頭的頭像尺寸規範);右側邊距與品牌距分割線對稱</li>
          <li>❌ 禁:`primary-header` mode 同時在 globalHeader + sidebar footer 各放一份 = 入口混淆(帳號入口視覺 SSOT,只能出現一次)</li>
        </ul>
      </section>
    </div>
  ),
}
