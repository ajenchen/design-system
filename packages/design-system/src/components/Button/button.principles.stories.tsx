// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import {
  Plus, Trash2, Settings, RefreshCw,
  MoreVertical, Save, Maximize2, Share2,
  ChevronDown, Download, Bell,
} from 'lucide-react'
import { Button } from './button'
import { ButtonGroup } from './button-group'
import { Badge } from '@/design-system/components/Badge/badge'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Button/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


// 並列的獨立範例之間 loose、說明貼著它說的範例 tight(CaptionedExamples);同一組動作的鈕用 ButtonGroup(鈕距由群組擁有); items-center 維持本頁原本的垂直置中(不同尺寸的鈕並排時對齊中線)
const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap', examplesClassName: 'items-center' })

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Button ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>觸發一個會改變狀態的動作:送出表單、儲存、發佈、確認對話框;流程裡的下一步 / 上一步;工具列裡的格式化或工具切換(小尺寸圖示鈕)。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Button/展示" name="危險 語意">Danger 語意</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Button/展示" name="滑鼠移過 / 鍵盤聚焦">滑鼠移過 / 鍵盤聚焦</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Button/展示" name="純圖示加 Tooltip">純圖示加 Tooltip</StoryLink></li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 不用 Button 做標籤或指示器"
          note="Button 語義是「可點擊動作」。如果只是顯示狀態、不需使用者互動，用 Badge 或 Tag 代替。Jira 的「已解決」標籤、Stripe 的「active」指示不會設計成按鈕"
        >
          {/* 樣本 ↔ 它右邊的說明 = tight(說明在替樣本命名,layoutSpace.spec.md 規則 3);兩組並列由 Rule 的範例區給 loose */}
          <div className="flex items-center gap-[var(--layout-space-tight)]">
            <Button variant="primary" size="sm">Active</Button>
            <ExampleCaption warn>❌ 當標籤用 → 下方才對</ExampleCaption>
          </div>
          <div className="flex items-center gap-[var(--layout-space-tight)]">
            <Badge count={1} />
            <ExampleCaption>✅ Badge 表達計數 / 狀態</ExampleCaption>
          </div>
        </TutorialRule>
        <TutorialList>
          <li>純粹跳到別頁(不改變任何狀態)→ 改用連結:螢幕報讀會念「連結」而不是「按鈕」</li>
          <li>段落裡可點的文字 → 用原生連結 <code>&lt;a&gt;</code>,不把按鈕塞進段落</li>
          <li>只是展示的頭像 / 圖示(不能點)→ 用 Avatar / 圖示本身,不包成按鈕</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Tabs / SegmentedControl</strong> —— 同一層「多選一」切換(總覽 / 成員 / 設定、列表 / 看板):是選值,不是觸發動作,不用一排按鈕假裝</li>
          <li><strong>Tag / Badge</strong> —— 狀態或數量的指示(「已解決」「3 件待處理」):不可點、不觸發動作</li>
          <li><strong>連結</strong> —— 導覽到別處;Button 是在這裡做事</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const VariantRule: Story = {
  name: '變體 選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="primary — 最高視覺重量，每個操作區最多一個"
        note="這個畫面或操作區最重要的單一主要動作，超過一個主要動作時改用 secondary"
      >
        <Button variant="primary" startIcon={Plus}>新增</Button>
      </TutorialRule>

      <TutorialRule
        title="secondary — 正面與負面選項並存時的配對"
        note="兩個並列選項時使用：正面選項用 secondary，負面選項加 danger。若只有一個主要動作，改用 primary"
      >
        <ButtonGroup>
          <Button variant="secondary">儲存草稿</Button>
          <Button variant="secondary" danger>放棄變更</Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule
        title="tertiary — 最常用的非主要按鈕（日常預設選擇）"
        note="確認/取消配對的取消方、輔助操作、卡片 CTA 幾乎都用 tertiary"
      >
        <Button variant="tertiary">取消</Button>
        <Button variant="tertiary" startIcon={Save}>另存草稿</Button>
        <Button variant="tertiary" startIcon={Download}>匯出</Button>
      </TutorialRule>

      <TutorialRule
        title="text — 低視覺重量輔助動作"
        note="不需特別強調的操作；工具列 icon-only 按鈕常用 text"
      >
        <Button variant="text" startIcon={RefreshCw}>重新整理</Button>
        <Button variant="text">查看更多</Button>
        <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
      </TutorialRule>

      <TutorialRule
        title="pressed prop — 單一功能目前啟用中（binary toggle）"
        note="設定 pressed 時 Button 自動寫入 aria-pressed + data-state，由 variant 的 data-[state=on] 分支套用樣式。僅 secondary/tertiary/text 支援 toggle 視覺，primary/link 傳入無效果。描述「這個按鈕自己的功能是否開啟」，不表達多選一"
      >
        {/* @layout-space-magic-ok: 同一列的 樣本 ↔ 箭頭說明 ↔ 樣本(行內 micro)(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-center gap-2">
          <Button variant="text" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（關閉）" />
          <span className="text-footnote text-fg-muted">→ 啟用後 →</span>
          <Button variant="text" pressed size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
        </div>
        <ExampleCaption warn>❌ 多選一（視圖切換）不用 pressed → 用 Segmented Control</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="link — 帶使用者前往其他頁面的按鈕"
        note="視覺上像連結但需要 button 行為（React Router、事件處理）。放在內容區，不用於操作列，不嵌入段落文字（段落內用 HTML <a> 代替）"
      >
        <Button variant="link">前往設定</Button>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const PrimaryRule: Story = {
  name: '主要按鈕限制',
  render: () => (
    <TutorialPage>
      <TutorialRule title="✅ 正確 — 唯一的 primary" note="單一最強視覺入口讓使用者立即辨識主要路徑;其餘動作降為 tertiary,避免同一操作區出現競爭焦點。">
        <ButtonGroup>
          <Button variant="primary">確認</Button>
          <Button variant="tertiary">取消</Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule title="❌ 錯誤 — 兩個 primary 同時出現，使用者無法判斷優先順序" note="兩個相同最高視覺重量的動作互相競爭,使用者必須先讀文案才能判斷主路徑,因此同一操作區最多保留一個 primary。">
        <ButtonGroup>
          <Button variant="primary">儲存</Button>
          <Button variant="primary">另存新檔</Button>
        </ButtonGroup>
        <ExampleCaption warn>視覺重量相同 → 無法分辨主次</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="✅ 卡片清單 CTA 用 tertiary"
        note="重複出現的 CTA 應使用 tertiary，避免頁面充斥填滿按鈕，稀釋 primary 的信號強度"
      >
        {['官網改版', '行動裝置 App', '設計系統'].map(name => (
          // 有框卡片列:左右 loose、上下 tight(同 chrome band 的內距組合,layoutSpace.spec.md 規則 1 / 規則 6)
          // @layout-space-magic-ok: 卡片列內 名稱 ↔ 行內按鈕 12px,範例原值:名稱 flex-1 撐滿、按鈕貼右,只在名稱很長時才當最小間隔;沒有規格定義這個值(AI 判讀:同一列內部的間距,不是 layoutSpace.spec.md:165–168 左欄的 macro 結構間距)
          <div key={name} className="border border-border rounded-lg px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] flex items-center gap-3 min-w-40">
            <span className="text-body flex-1">{name}</span>
            <Button variant="tertiary" size="xs">開啟</Button>
          </div>
        ))}
      </TutorialRule>
    </TutorialPage>
  ),
}

export const DangerRule: Story = {
  name: '危險 時機',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="primary + danger — 立即且不可逆，點下去就發生"
        note="必須是最後一道關卡，沒有後續確認"
      >
        <ButtonGroup>
          <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
          <Button variant="tertiary">取消</Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule
        title="secondary + danger — 有警示意圖但點下去還可反悔"
        note="通常後面還有一層確認提示"
      >
        <ButtonGroup>
          <Button variant="secondary">儲存草稿</Button>
          <Button variant="secondary" danger>放棄變更</Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule
        title="text + danger — 低強調的危險操作"
        note="工具列刪除等有後續確認的場景；視覺干擾最小"
      >
        <Button variant="text" danger startIcon={Trash2}>刪除</Button>
        <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
      </TutorialRule>

      <TutorialRule title="❌ 錯誤 — 在有後續確認的流程中使用 primary danger" note="primary danger 承諾『點下即完成不可逆動作』;若後面還有確認或可復原,提前使用最高危險強度會誤報操作後果。">
        <Button variant="primary" danger>移至垃圾桶</Button>
        <ExampleCaption warn>移至垃圾桶還可以復原 → 不應用 primary danger</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const IconRule: Story = {
  name: '圖示語意',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="startIcon — 描述這個按鈕做什麼（動詞圖示）"
        note="icon 是 label 的圖示說明，與文字傳達同一個動作"
      >
        <Button variant="primary" startIcon={Plus}>新增</Button>
        <Button variant="tertiary" startIcon={Download}>匯出</Button>
        <Button variant="tertiary" startIcon={RefreshCw}>重新整理</Button>
      </TutorialRule>

      <TutorialRule
        title="endIcon — 指示按鈕會開啟下一層（展開 / 選單）"
        note="告訴使用者「點這裡還有更多」，不描述動作本身"
      >
        <Button variant="tertiary" endIcon={ChevronDown}>篩選條件</Button>
        <Button variant="tertiary" startIcon={Bell} endIcon={ChevronDown}>通知</Button>
      </TutorialRule>

      <TutorialRule
        title="❌ endIcon 不應使用動詞性圖示"
        note="endIcon 的位置傳達「這裡可以展開」，放動詞圖示會讓使用者以為有第二個獨立操作"
      >
        <Button variant="tertiary" endIcon={Download}>匯出</Button>
        <ExampleCaption warn>↑ 右側 Download 讓人以為可以直接下載，與展開選單的意圖衝突</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="icon + 下拉指示 — 無文字 dropdown trigger"
        note="不加 iconOnly（保留 endIcon 展開指示）；必須設定 aria-label"
      >
        <Button variant="tertiary" startIcon={Settings} endIcon={ChevronDown} aria-label="設定選項" />
        <ExampleCaption>↑ startIcon 描述功能，endIcon 指示展開，兩者並存</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="icon + overlay 角標 — 通知類按鈕"
        note={<>用 <code>overlayBadge</code> prop 傳入 Badge,Button 內部自動把 badge 中心對齊 icon top-right corner(Material BadgedBox 設計準則)——不手刻 <code>relative + absolute -top-1 -right-1</code> 讓 badge 飄到按鈕 chrome 邊緣</>}
      >
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          startIcon={Bell}
          aria-label="通知 (3)"
          overlayBadge={<Badge count={3} variant="critical" />}
        />
        <ExampleCaption>↑ overlayBadge prop 自動定位,Button 保持正方形,badge 貼 icon 不飄 chrome 角</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="溢出選單 — 一律 MoreVertical，放在群組末端"
        note={<>溢出按鈕是群組的一部分，不是獨立操作層。末端溢出與群組溢出的判斷規則見 <StoryLink kind="Design System/Patterns/Action Bar" name="溢出機制">Patterns / Action Bar(操作列)→ 溢出機制</StoryLink></>}
      >
        <ButtonGroup>
          <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="匯出" />
          <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
          <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
        </ButtonGroup>
        <ExampleCaption>↑ MoreVertical 在群組末端，左側不加分隔線</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const OrderRule: Story = {
  name: '排序與對齊',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="視覺重量序列 — 決定按鈕在群組中的相對位置"
        note="按視覺重量由高至低排列，最強吸引力的動作放在「起點」位置。danger 是顏色疊加，不影響排序位置；同 variant 內 danger 排在非 danger 之後（遠離主要焦點）"
      >
        <ButtonGroup>
          <Button variant="primary">發布</Button>
          <Button variant="secondary">儲存草稿</Button>
          <Button variant="secondary" danger>放棄變更</Button>
          <Button variant="tertiary">預覽</Button>
          <Button variant="text">查看歷史</Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule
        title="水平排列 — 對齊方向鏡像排序，主按鈕永遠在「起點」"
        note={<>對齊方向看這一列有沒有標題：有標題（標題在左）→ 按鈕靠右、primary 最右；沒有標題 → 按鈕靠左、primary 最左；Dialog / Sheet / Popover 的頁腳一律靠右。排序規則不因對齊方向改變，只是方向鏡像。判準與工具層的位置見 <StoryLink kind="Design System/Patterns/Action Bar" name="排列與結構">Patterns / Action Bar(操作列)→ 排列與結構</StoryLink></>}
      >
        {/* 2026-10-20 R1b-T8:原本的說明是「靠左:表單送出;靠右:對話框底部」,不是 SSOT 的判準 —— 判準是這一列有沒有標題
            (patterns/action-bar/action-bar.spec.md:109),浮層頁腳靠右另由 dialog.spec.md:178 / overlay-surface.spec.md:237 規定 */}
        {/* 兩種對齊並列 = loose;每一列的 群組 ↔ 旁邊的說明 = tight(說明在替那一組命名,layoutSpace.spec.md 規則 3) */}
        <div className="flex flex-col gap-[var(--layout-space-loose)] w-full">
          <div className="flex items-center gap-[var(--layout-space-tight)]">
            <ButtonGroup align="start">
              <Button variant="primary">確認</Button>
              <Button variant="tertiary">取消</Button>
            </ButtonGroup>
            <ExampleCaption>沒有標題 → 靠左，primary 最左（表單頁底、頁面步驟列）</ExampleCaption>
          </div>
          <div className="flex items-center justify-between w-full">
            <ExampleCaption>有標題（標題在左）或浮層頁腳 → 靠右，primary 最右</ExampleCaption>
            <ButtonGroup align="end">
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">確認</Button>
            </ButtonGroup>
          </div>
        </div>
      </TutorialRule>

      <TutorialRule
        title="垂直排列 — primary 最上，視覺動線由上往下"
        note="使用者眼睛最先掃到最上方，最希望被點擊的動作放第一個。所有按鈕撐滿容器寬度"
      >
        <div className="w-[200px]">
          <ButtonGroup orientation="vertical">
            <Button variant="primary">確認送出</Button>
            <Button variant="tertiary">取消</Button>
          </ButtonGroup>
        </div>
      </TutorialRule>

      <TutorialRule
        title="Toolbar 場景"
        note={<>Toolbar 中業務操作與工具操作的全局排序、分隔線規則、溢出機制見 <StoryLink kind="Design System/Patterns/Action Bar" name="排列與結構">Patterns / Action Bar(操作列)→ 排列與結構</StoryLink></>}
      />
    </TutorialPage>
  ),
}
