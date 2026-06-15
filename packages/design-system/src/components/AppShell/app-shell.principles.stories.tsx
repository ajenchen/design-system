// @benchmark-cited: Polaris / Material / Ant 共識 principles canonical(UsageGuidance integrated)
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
            <LinkTo kind="Design System/Components/AppShell/展示" name="主側欄佈局 — Linear 式議題追蹤"><span className="text-primary hover:underline font-medium cursor-pointer">展示 → 主側欄佈局 — Linear 式議題追蹤</span></LinkTo>
          </li>
          <li>
            • 需要 sidebar + main 持續共存——在議題列表、看板、報表等頁面間切換時,左側導覽不重渲染、捲動位置不丟失。見{' '}
            <LinkTo kind="Design System/Components/AppShell/展示" name="主側欄佈局 + 頁面分頁"><span className="text-primary hover:underline font-medium cursor-pointer">展示 → 主側欄佈局 + 頁面分頁</span></LinkTo>
          </li>
          <li>
            • 需要右側詳情面板(議題詳情 / inspector / 成員資料)跟 main 並存——如 Linear 點選議題後右側展開詳情。開合行為見{' '}
            <LinkTo kind="Design System/Components/AppShell/設計規格" name="右側面板開合行為(兩種模式)"><span className="text-primary hover:underline font-medium cursor-pointer">設計規格 → 右側面板開合行為</span></LinkTo>
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
          <LinkTo kind="Design System/Components/AppShell/設計原則" name="佈局模式怎麼選"><span className="text-primary hover:underline font-medium cursor-pointer">設計原則 → 佈局模式怎麼選</span></LinkTo>
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
          <li>❌ 禁:`&lt;AppShell&gt;` 內塞另一個 `&lt;AppShell&gt;`(整頁框架單例)</li>
          <li>❌ 禁:`sidebar={'{'}&lt;div&gt;...&lt;/div&gt;{'}'}` → 應傳 `&lt;Sidebar&gt;` primitive(型別收 ReactNode 不機械強制,2026-06-10 拍板)</li>
          <li>❌ 禁:`header={'{'}&lt;header&gt;raw&lt;/header&gt;{'}'}` → 應傳 `&lt;ChromeHeader&gt;` 或 header-canonical 派生(同上,不機械強制)</li>
          <li>❌ 禁:`&lt;AppShell.Main&gt;` 強制 padding(違 layoutSpace 規則 1B)</li>
          <li>✅ 必:Main 內容遵循既有 `layoutSpace.spec.md` 6 條規則(Page header / Card / DataTable / naked list 各按規則)</li>
        </ul>
      </section>
    </div>
  ),
}

// 佈局模式選型 deep-dive — 內容錨定 app-shell.spec.md「兩 mode 差異」(L93-94 / L105 常見誤解)
// +「WorkspaceBrand 放置 SSOT」(L112-119);category-templates.md component-specific `{Topic}Rule` idiom
export const LayoutModeRule: Story = {
  name: '佈局模式怎麼選',
  render: () => (
    <div className="prose max-w-2xl space-y-6 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
      <section>
        <h2 className="text-h4 mb-2">唯一判準:Header scope</h2>
        <p className="text-body mb-2">
          唯一 distinguisher = <strong>Header scope 是 local 還是 global</strong>,
          <em>不是</em> workspace 多寡(Notion / Gmail 都支援 multi-workspace,卻分屬不同派)。
          問自己:頂部那條 bar 服務的是「當前這一頁」還是「整個 app」?
        </p>
        <ul className="text-body space-y-1">
          <li>
            <strong>primary-sidebar</strong>:頂部是 <strong>local toolbar</strong> —
            服務當前頁(breadcrumb / page-level actions / filter)。Sidebar 頂天立地,WorkspaceBrand 在 sidebar 頂。
            參考 Linear / Notion / Figma。
          </li>
          <li>
            <strong>primary-header</strong>:多一條 <strong>global bar</strong> 橫跨頂部 —
            服務整個 app(account / workspace switcher / 跨頁 search / notifications);local toolbar
            <em>仍在</em> main col 頂,只是上面多了 global header。WorkspaceBrand 改放 globalHeader 左側。
            參考 GitHub / Slack / Gmail。完整組合見{' '}
            <LinkTo kind="Design System/Components/AppShell/展示" name="主標頭佈局 — 全域+本地兩層(GitHub/Gmail/Slack 派)"><span className="text-primary hover:underline font-medium cursor-pointer">展示 → 主標頭佈局 — 全域+本地兩層</span></LinkTo>
          </li>
        </ul>
        <p className="text-caption text-fg-secondary mt-2">
          兩 mode 是 product 角色表態——啟動時固定,不該在 runtime 切換。視覺對照圖見{' '}
          <LinkTo kind="Design System/Components/AppShell/設計規格" name="兩種布局模式對照圖"><span className="text-primary hover:underline font-medium cursor-pointer">設計規格 → 兩種布局模式對照圖</span></LinkTo>
        </p>
      </section>

      <section>
        <h2 className="text-h4 mb-2">常見誤解:global header 取代 local toolbar</h2>
        <p className="text-body">
          錯。primary-header = primary-sidebar 的所有東西 + <strong>額外一條</strong> global header 在頂;
          `header` slot(local toolbar)<strong>仍然存在</strong>。GitHub / Slack / Gmail 全部同時保有兩層,
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
    </div>
  ),
}
