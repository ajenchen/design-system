// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Bell, Inbox, Archive, FileText, MessageSquare, Settings } from 'lucide-react'
import { Badge } from './badge'
import { Button } from '@/design-system/components/Button/button'
import { Toaster } from '@/design-system/components/Toast/toast'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'
import { DemoMenu, type DemoMenuEntry } from '@/design-system/stories-helpers/examples/demo-actions'

const meta: Meta = {
  title: 'Design System/Components/Badge/設計原則',
  parameters: { layout: 'padded' },
  // Toaster 是 app 層 Provider(toast.spec.md:consumer 在 app root 放一次)—— 放在 story 外層(同 toast.principles.stories.tsx)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
}
export default meta
type Story = StoryObj


// naturalWidth 讓 direct children 保持自然寬度(避免 iconOnly Button 等在 flex-col 被 stretch 撐滿 max-w-md 的 bug)。需要 full-width row 的 child 自己 w-full / self-stretch
const TutorialRule = createTutorialRule({ examples: true, naturalWidth: true, examplesClassName: 'max-w-md' })

/* 範例裡帶計數的按鈕都要能按(F-S2:畫面上看得到的按鈕都要能動),接的是按鈕本來的行為、不另造演出:
   Badge 計的是「有幾則」,按下按鈕 = 打開它計的那一串(最新幾則;選單標題寫「是什麼、共幾則」);點其中一則 = 開啟那一則(Toast 回饋)。
   選單 = stories-helpers/examples/demo-actions.tsx 的 DemoMenu(Action Bar / Button 頁同一份)。 */
type CountEntry = DemoMenuEntry

const MESSAGES: CountEntry[] = [
  { label: '林佳穎', description: '週五的設計評審改到下午 3 點,會議室不變' },
  { label: '陳志明', description: 'Q3 預算表我更新了第二頁,麻煩再看一次' },
  { label: '王小美', description: '客戶回覆了報價單,他們想把交期提前一週' },
]
const NOTIFICATIONS: CountEntry[] = [
  { label: '張雅婷在「Q3 行銷預算」提到你', description: '10 分鐘前' },
  { label: '「官網改版」的截止日改為 11/15', description: '1 小時前' },
  { label: '李建宏把「首頁輪播圖更新」指派給你', description: '昨天' },
]
const ERRORS: CountEntry[] = [
  { label: '客戶名單匯入失敗', description: '第 12 列的 Email 格式不正確' },
  { label: '發票 INV-2026-0412 寄送失敗', description: '收件信箱已停用' },
  { label: '每日備份未完成', description: '儲存空間不足' },
]
const ARCHIVED: CountEntry[] = [
  { label: '2026 Q2 營收報告', description: '7 月 3 日封存' },
  { label: '舊版官網素材', description: '6 月 28 日封存' },
  { label: '春季促銷活動', description: '6 月 15 日封存' },
]
const NEW_IN_SETTINGS: CountEntry[] = [
  { label: '自動封存', description: '新功能:30 天沒有更新的專案會自動移到封存' },
]

/** 帶計數的入口:按下打開它計的那一串 */
const CountMenu = ({ title, entries, children }: { title: string; entries: CountEntry[]; children: React.ReactElement }) => (
  <DemoMenu title={title} items={entries} open align="start">{children}</DemoMenu>
)

// ── WhenToUse — 何時使用 Badge ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / DotVsCountRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>通知計數與狀態圓點:收件匣未讀數、待辦數、「有新內容」的提示點,通常疊在圖示按鈕或頭像右上角。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Badge/展示" name="正圓 vs 膠囊">正圓 vs 膠囊</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Badge/展示" name="圓點模式">Dot 模式</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Badge/展示" name="數量上限">Max 上限</StoryLink></li>
        </TutorialList>
        <p>要顯示數字還是圓點,見「<StoryLink kind="Design System/Components/Badge/設計原則" name="數字 vs 圓點">數字 vs 圓點</StoryLink>」。</p>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>分類標籤(產品類別、角色)、狀態描述(有貨 / 缺貨)→ 改用 Tag:Tag 承載語意文字與狀態色,Badge 只是計數指示</li>
          <li>版本 / 角色標記(「Beta」「Pro」「Admin」)→ 改用 Tag:Badge 只有數字與圓點兩種模式,不承載文字</li>
          <li>篩選 / 選擇 → 改用 Chip:Badge 不可互動</li>
          <li>載入中 → 改用 CircularProgress:Badge 是數字或圓點,載入用轉圈動畫</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Tag</strong> —— 分類、狀態、已選值,承載語意文字,可含圖示 / 移除鈕;Badge 只表達「有多少」或「有沒有新東西」</li>
          <li><strong>Chip</strong> —— 可點的篩選 / 選擇;Badge 不可互動</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const DotVsCountRule: Story = {
  name: '數字 vs 圓點',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Count — 數字本身有意義（3 vs 30 觸發不同 urgency）"
        note="未讀訊息 / 錯誤數 / 購物車品項——使用者會根據數字決定行動優先序"
      >
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          <div className="flex items-center gap-[var(--layout-space-loose)]">
            <CountMenu title="訊息 · 3 則未讀" entries={MESSAGES}>
              <Button
                variant="tertiary"
                size="sm"
                iconOnly
                startIcon={MessageSquare}
                aria-label="訊息 (3)"
                overlayBadge={<Badge count={3} variant="critical" />}
              />
            </CountMenu>
            <CountMenu title="訊息 · 42 則未讀" entries={MESSAGES}>
              <Button
                variant="tertiary"
                size="sm"
                iconOnly
                startIcon={MessageSquare}
                aria-label="訊息 (42)"
                overlayBadge={<Badge count={42} variant="critical" />}
              />
            </CountMenu>
            <CountMenu title="訊息 · 150 則未讀" entries={MESSAGES}>
              <Button
                variant="tertiary"
                size="sm"
                iconOnly
                startIcon={MessageSquare}
                aria-label="訊息 (150 則)"
                overlayBadge={<Badge count={150} max={99} variant="critical" />}
              />
            </CountMenu>
          </div>
          <ExampleCaption>3 vs 42 vs 99+ 觸發不同 urgency 感</ExampleCaption>
        </div>
      </TutorialRule>

      <TutorialRule
        title="Dot — 存在性指示（「有新東西」即訊號）"
        note="新功能提示、unsaved changes、在線狀態——具體數量不重要或無意義。Dot overlay 的設計準則:只疊在 iconOnly button / 單一 icon / avatar 上(容器本身就是單一視覺重心)。text + icon button 的右上角離 icon 太遠,dot 會像飄在空中的裝飾,語義不成立。"
      >
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          <CountMenu title="設定 · 新功能" entries={NEW_IN_SETTINGS}>
            <Button
              variant="tertiary"
              size="sm"
              iconOnly
              startIcon={Settings}
              aria-label="設定(有新功能)"
              overlayBadge={<Badge dot variant="critical" aria-label="有新功能" />}
            />
          </CountMenu>
          <ExampleCaption>「設定有新功能」—— iconOnly Button <code>overlayBadge</code> prop,dot 中心貼齒輪 icon 的 top-right corner(不是按鈕角)</ExampleCaption>
        </div>
      </TutorialRule>

      <TutorialRule
        title="❌ text + icon button 右上疊 dot"
        note="按鈕寬度遠大於 icon,dot 跑到按鈕右邊緣,離 icon 太遠視覺上不連結。使用者不會把 dot 和齒輪 icon 的「有新功能」語義配對起來"
      >
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          {/* ❌ anti-pattern demo intentionally kept: text+icon Button + overlay dot —— 整個 Rule 的主軸就是
              「dot 飄在 button chrome 角不是 icon 角」,此處保留 old `relative + absolute` pattern 作為
              視覺反例,讓讀者看到 dot 為何離 icon 很遠 */}
          <div className="relative inline-flex">
            <CountMenu title="設定 · 新功能" entries={NEW_IN_SETTINGS}>
              <Button variant="tertiary" size="sm" startIcon={Settings}>設定</Button>
            </CountMenu>
            <Badge dot variant="critical" className="absolute -top-1 -right-1" aria-label="有新功能" />
          </div>
          <ExampleCaption warn>← dot 飄在「設定」文字右上角的空處,跟齒輪 icon 毫無視覺連結</ExampleCaption>
        </div>
        {/* 稽核 L106:原本的 (b)「改用內部文字 badge(DS 無,屬 tech debt)」是還沒定義的做法,拿掉 */}
        <ExampleCaption>改法:按鈕改 iconOnly + dot 疊 icon 角落,或移到 text 後 inline 小字「設定(新)」</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="判斷法：「使用者想知道『有沒有』還是『多少』？」"
        note="知道有就夠 → dot / 需要數量判斷 urgency → count"
      >
        <ExampleCaption>若 count 永遠顯示 99+(threshold 失去區別力),改用 dot 或升高 max</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const DefaultLowRule: Story = {
  name: '預設低強度,有理由才升級',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="選 level 時問：使用者錯過會怎樣？"
        note="從 low 起跳,只有當內容本身 urgency 更高才升級。Critical 的橘色從「罕見」獲得信號價值——過度使用會稀釋橘色在產品內的「急迫」意義"
      >
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          {/* @layout-space-magic-ok: 圖示 ↔ 文字 ↔ 計數 8px = badge.spec.md「2. Inline（跟 label 並列）」範例 `flex items-center gap-2` */}
          <div className="flex items-center gap-2">
            <Archive size={16} />
            <span className="text-body">Archive</span>
            <Badge count={128} variant="low" />
          </div>
          <ExampleCaption>low — 錯過無影響（被動計數）</ExampleCaption>
        </div>
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          {/* @layout-space-magic-ok: 圖示 ↔ 文字 ↔ 計數 8px = badge.spec.md「2. Inline（跟 label 並列）」範例 `flex items-center gap-2` */}
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            <span className="text-body">留言</span>
            <Badge count={12} variant="medium" />
          </div>
          <ExampleCaption>medium — 輕微不便（可延後看）</ExampleCaption>
        </div>
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          {/* @layout-space-magic-ok: 圖示 ↔ 文字 ↔ 計數 8px = badge.spec.md「2. Inline（跟 label 並列）」範例 `flex items-center gap-2` */}
          <div className="flex items-center gap-2">
            <Bell size={16} />
            <span className="text-body">待辦</span>
            <Badge count={7} variant="high" />
          </div>
          <ExampleCaption>high — 有感影響（工作堆積）</ExampleCaption>
        </div>
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          {/* @layout-space-magic-ok: 圖示 ↔ 文字 ↔ 計數 8px = badge.spec.md「2. Inline（跟 label 並列）」範例 `flex items-center gap-2` */}
          <div className="flex items-center gap-2">
            <Inbox size={16} />
            <span className="text-body">未讀私訊</span>
            <Badge count={3} variant="critical" />
          </div>
          <ExampleCaption>critical — 直接傷害（錯過溝通）</ExampleCaption>
        </div>
      </TutorialRule>

      <TutorialRule
        title="❌ 把 passive count 當 critical（訊號稀釋）"
        note="Archive / Trash 這類被動計數升 critical → 橘色遍地都是,使用者麻木,真正急迫的通知被稀釋"
      >
        {/* @layout-space-magic-ok: 圖示 ↔ 文字 ↔ 計數 8px = badge.spec.md「2. Inline（跟 label 並列）」範例 `flex items-center gap-2` */}
        <div className="flex items-center gap-2">
          <Archive size={16} />
          <span className="text-body">Archive</span>
          <Badge count={128} variant="critical" />
        </div>
        <ExampleCaption warn>↑ Archive 有多少郵件不需要 critical 橘色觸發 action——使用者只在整理時才看,用 low 即可</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="自我檢查：一個畫面最多 1-2 個 critical badge"
        note="超過代表把不急迫的事標成 critical。橘色稀缺性才有信號價值"
      >
        <ExampleCaption>打開任何 app 的主頁面,數一下橘色 badge——超過 2 個就該降級</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const ContrastFloorRule: Story = {
  name: '容器對比下限',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="最終強度,取「內容急迫度」和「容器最低需求」兩者中的較高者"
        note="容器需求是下限(底色太深時,badge 最少要到哪個強度才看得清),不是上限——內容本身夠急迫時,還是可以再往上升。兩個條件各自獨立把強度往上推"
      >
        {/* 稽核 M014:拿掉「Case 1 / 2 / 3」序號(A10),每列的情境寫在它的說明裡 */}
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          <CountMenu title="通知 · 3 則" entries={NOTIFICATIONS}>
            <Button
              variant="tertiary"
              size="sm"
              iconOnly
              startIcon={Bell}
              aria-label="通知 (3)"
              overlayBadge={<Badge count={3} variant="high" />}
            />
          </CountMenu>
          <ExampleCaption>內容急迫度=high,容器要求只到 low → 用 high(內容急迫度已經高於容器最低需求)</ExampleCaption>
        </div>
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          {/* ❌ anti-pattern demo intentionally kept: text+icon Button + overlay Badge
              展示 semantic 錯配(primary 容器逼 passive count 升 critical);同時保留
              text+icon+overlay 的幾何 anti-pattern — badge 飄在 button chrome 角而非 icon 角 */}
          <div className="relative inline-flex">
            <CountMenu title="通知 · 3 則" entries={NOTIFICATIONS}>
              <Button variant="primary" startIcon={Bell}>通知</Button>
            </CountMenu>
            <Badge count={3} variant="critical" className="absolute -top-1 -right-1" />
          </div>
          <ExampleCaption warn>內容急迫度=low(被動計數),但 primary 按鈕底色深,容器要求逼到 high/critical → 被迫升級(這代表設計擺錯位置)</ExampleCaption>
        </div>
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          <CountMenu title="錯誤 · 5 則" entries={ERRORS}>
            <Button
              variant="tertiary"
              size="sm"
              iconOnly
              startIcon={Bell}
              aria-label="錯誤 (5)"
              overlayBadge={<Badge count={5} variant="critical" />}
            />
          </CountMenu>
          <ExampleCaption>內容急迫度=critical 業務需求本身就急 → 用 critical,容器最低需求不會把它往下壓</ExampleCaption>
        </div>
      </TutorialRule>

      <TutorialRule
        title="容器把被動計數逼到高強度,代表放錯位置——重新考慮放置"
        note="passive count 被 primary button 逼到 high/critical,semantic 跟 visual 不搭。解決不是一直升 level,是重新思考這 badge 該不該在這裡"
      >
        <ExampleCaption>改用 dot 模式 / 移到外部 label / 乾脆不放 badge</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 為了「能在深色容器上看見」把 passive count 升 critical"
        note="扭曲 level 語意——把「被動資訊」包裝成「需立即處理」,誤導使用者的注意力分配"
      >
        {/* ❌ anti-pattern demo intentionally kept: text+icon Button + overlay Badge
            本 story 主軸是 semantic level 錯配(passive 被迫 critical),demo 幾何用
            舊 pattern 保留「text+icon + overlay」本身就是 anti-pattern 的視覺訊號 */}
        <div className="relative inline-flex">
          <CountMenu title="封存 · 128 封" entries={ARCHIVED}>
            <Button variant="primary" startIcon={Archive}>Archive</Button>
          </CountMenu>
          <Badge count={128} variant="critical" className="absolute -top-1 -right-1" />
        </div>
        <ExampleCaption warn>↑ Archive 的 128 被強制 critical 橘色 → 使用者誤以為「要去看」,實際只是總數</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="✅ 正確做法:按鈕降級 + badge 回歸 low"
        note="Archive 是歸檔/整理動作,不是 primary CTA——本來就該是 tertiary。按鈕降級後容器 contrast floor 放寬,badge 可以用 passive 原本的 low level,semantic 跟 visual 一致,訊號清楚。「想要 primary 按鈕 + critical badge」通常是資訊架構設定錯——重看:這顆按鈕真的是頁面主 CTA 嗎?"
      >
        {/* 稽核 H08:✓ 範例改成真的正確寫法 —— 有字的按鈕用 inline `badge` prop(badge.spec.md「2. Inline」;
            badge.spec.md 第 1 節 ❌ text + icon Button 改法 (b)「移除 overlay 改 inline badge 在 text 後」),手放 absolute 只留在 ❌ 反例 */}
        <CountMenu title="封存 · 128 封" entries={ARCHIVED}>
          <Button variant="tertiary" startIcon={Archive} badge={<Badge count={128} variant="low" />}>Archive</Button>
        </CountMenu>
        <ExampleCaption>↑ tertiary Archive + low badge(灰底灰字,跟在文字後)—— 「有 128 筆被歸檔」passive 展示,不誘導 click</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const AccessibilityRule: Story = {
  name: '無障礙必備',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Parent 元件的 aria-label 必須整合 badge 資訊"
        note="Badge 預設 role=「status」(live region 可播報計數變化),但仍應由 parent 的 aria-label 整合完整 context——「通知 (3 則未讀)」比「通知」+「3」更清楚"
      >
        <CountMenu title="通知 · 3 則未讀" entries={NOTIFICATIONS}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={Bell}
            aria-label="通知 (3 則未讀)"
            overlayBadge={<Badge count={3} variant="critical" />}
          />
        </CountMenu>
        <ExampleCaption>✅ aria-label="通知 (3 則未讀)" — screen reader 一次讀出完整資訊</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="Dot 模式必須給 aria-label"
        note="Dot 無文字,screen reader 完全看不到——沒 aria-label 等於對 a11y 使用者不存在"
      >
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          <Badge dot variant="critical" aria-label="有新訊息" />
          <span className="text-body">✅ 有 aria-label</span>
        </div>
        <div className="flex items-center gap-[var(--layout-space-tight)]">
          <Badge dot variant="critical" />
          <span className="text-body">❌ 沒 aria-label</span>
        </div>
        <ExampleCaption warn>↑ 沒 aria-label 的 dot → screen reader 使用者不知道「有東西」</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 單靠顏色傳達 urgency（color-blind 失效）"
        note="Badge 的 level 靠顏色(橘/藍/灰)——color-blind 使用者可能分不清 critical vs high。必須搭配 aria-label、count 數字、或容器上的其他視覺指示"
      >
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          <Badge dot variant="critical" aria-label="緊急" />
          <Badge dot variant="high" aria-label="重要" />
        </div>
        <ExampleCaption>↑ critical(橘)vs high(藍)只靠顏色——color-blind 使用者分不清,必須靠 aria-label 明確語意,不能只靠顏色</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const PlacementRule: Story = {
  name: '三種放置模式',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Overlay — 疊加在視覺重心（iconOnly / avatar / 純 icon）"
        note={<>標準 API:<code>&lt;Button overlayBadge={'{'}...{'}'}&gt;</code> — badge 中心對齊 icon 的 top-right corner(Material BadgedBox / iOS App Icon)。不手刻 relative + absolute,避免 badge 飄到 button chrome 邊緣</>}
      >
        <CountMenu title="通知 · 3 則" entries={NOTIFICATIONS}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={Bell}
            aria-label="通知 (3)"
            overlayBadge={<Badge count={3} variant="critical" />}
          />
        </CountMenu>
      </TutorialRule>

      <TutorialRule
        title="Inline — 跟 label 並列（計數展示）"
        note="Tab / Menu item / Section title 旁邊顯示計數。不用 absolute,gap 控制間距"
      >
        {/* @layout-space-magic-ok: 圖示 ↔ 文字 ↔ 計數 8px = badge.spec.md「2. Inline（跟 label 並列）」範例 `flex items-center gap-2` */}
        <div className="flex items-center gap-2">
          <FileText size={16} />
          <span className="text-body">文件</span>
          <Badge count={12} variant="low" />
        </div>
        <ExampleCaption>↑ 「文件 (12)」一體展示,不是 overlay</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="Standalone — 獨立狀態指示"
        note="通常是 dot 模式,跟 description 文字並列作為狀態 indicator"
      >
        {/* @layout-space-magic-ok: 圓點 ↔ 文字 8px = badge.spec.md「3. Standalone（獨立狀態指示）」範例 `flex items-center gap-2` */}
        <div className="flex items-center gap-2">
          <Badge dot variant="critical" aria-label="同步失敗" />
          <span className="text-body">同步失敗</span>
        </div>
      </TutorialRule>

      <TutorialRule
        title="❌ 一個元件同時疊多個同類 badge"
        note="同一 trigger 疊兩個不同 urgency 的同類訊號(count + dot 都是通知重要性)→ 使用者無法判斷哪個重要。合併成一個 badge。不同角、不同語義 OK(Avatar 右下 presence + 右上 count 是合法,範例見下方連結)"
      >
        {/* ❌ anti-pattern demo intentionally kept: Button `overlayBadge` prop 只支援單一 badge
            (設計準則 就是避免 signal crowding);本 rule 主軸是「不該這樣做」,用舊
            `relative + absolute` 手刻兩個 badge 作為視覺反例 */}
        <div className="relative inline-flex">
          <CountMenu title="通知 · 3 則" entries={NOTIFICATIONS}>
            <Button variant="tertiary" size="sm" iconOnly startIcon={Bell} aria-label="通知" />
          </CountMenu>
          <Badge count={3} variant="critical" className="absolute -top-1 -right-1" />
          <Badge dot variant="high" className="absolute -bottom-1 -right-1" />
        </div>
        <ExampleCaption warn>↑ 同一顆 Bell 按鈕同時表達「未讀 3」和「有更新(dot)」—— 兩個都是通知訊號,語義重疊 → 使用者混淆</ExampleCaption>
        {/* 稽核 L106:跨頁參照要有連結(A11) */}
        <ExampleCaption>
          不同角、不同語義可以並存:見{' '}
          <StoryLink kind="Design System/Components/Avatar/設計原則" name="頭像疊加層:在線小點 / 計數徽章">Avatar 設計原則 → 頭像疊加層</StoryLink>
        </ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
