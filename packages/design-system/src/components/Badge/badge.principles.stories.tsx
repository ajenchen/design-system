// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Bell, Inbox, Archive, FileText, MessageSquare, Settings } from 'lucide-react'
import { Badge } from './badge'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Badge/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    {/* items-start 讓 direct children 保持自然寬度(避免 iconOnly Button 等在 flex-col 被
        stretch 撐滿 max-w-md 的 bug)。需要 full-width row 的 child 自己 w-full / self-stretch */}
    <div className="flex flex-col gap-4 max-w-md items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── WhenToUse — 何時使用 Badge ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / DotVsCountRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Badge 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Badge/展示" name="正圓 vs 膠囊"><span className="text-primary hover:underline font-medium cursor-pointer">正圓 vs 膠囊</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Badge/展示" name="圓點模式"><span className="text-primary hover:underline font-medium cursor-pointer">Dot 模式</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Badge/展示" name="數量上限"><span className="text-primary hover:underline font-medium cursor-pointer">Max 上限</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:先確認使用者真正需要的是「有沒有新東西」(用 Dot)還是「有多少」(用數字)。若兩者都不貼切,代表這裡可能不該放 Badge——改用文字標籤或其他狀態指示。</p>
    </div>

      {/* vs 近親 — DotVsCountRule — 原 DotVsCountRule */}
      <div>
      <Rule
        title="Count — 數字本身有意義（3 vs 30 觸發不同 urgency）"
        note="未讀訊息 / 錯誤數 / 購物車品項——使用者會根據數字決定行動優先序"
      >
        <div className="flex items-center gap-4">
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={MessageSquare}
            aria-label="訊息 (3)"
            overlayBadge={<Badge count={3} variant="critical" />}
          />
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={MessageSquare}
            aria-label="訊息 (42)"
            overlayBadge={<Badge count={42} variant="critical" />}
          />
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={MessageSquare}
            aria-label="訊息 (150+)"
            overlayBadge={<Badge count={150} max={99} variant="critical" />}
          />
          <Label>3 vs 42 vs 99+ 觸發不同 urgency 感</Label>
        </div>
      </Rule>

      <Rule
        title="Dot — 存在性指示（「有新東西」即訊號）"
        note="新功能提示、unsaved changes、在線狀態——具體數量不重要或無意義。Dot overlay 的設計準則:**只疊在 iconOnly button / 單一 icon / avatar 上**(容器本身就是單一視覺重心)。text + icon button 的右上角離 icon 太遠,dot 會像飄在空中的裝飾,語義不成立。"
      >
        <div className="flex items-center gap-4">
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={Settings}
            aria-label="設定(有新功能)"
            overlayBadge={<Badge dot variant="critical" aria-label="有新功能" />}
          />
          <Label>「設定有新功能」—— iconOnly Button `overlayBadge` prop,dot 中心貼齒輪 icon 的 top-right corner(不是按鈕角)</Label>
        </div>
      </Rule>

      <Rule
        title="❌ text + icon button 右上疊 dot"
        note="按鈕寬度遠大於 icon,dot 跑到按鈕右邊緣,離 icon 太遠視覺上不連結。使用者不會把 dot 和齒輪 icon 的「有新功能」語義配對起來"
      >
        <div className="flex items-center gap-4">
          {/* ❌ anti-pattern demo intentionally kept: text+icon Button + overlay dot —— 整個 Rule 的主軸就是
              「dot 飄在 button chrome 角不是 icon 角」,此處保留 old `relative + absolute` pattern 作為
              視覺反例,讓讀者看到 dot 為何離 icon 很遠 */}
          <div className="relative inline-flex">
            <Button variant="tertiary" size="sm" startIcon={Settings}>設定</Button>
            <Badge dot variant="critical" className="absolute -top-1 -right-1" aria-label="有新功能" />
          </div>
          <Label warn>↑ dot 飄在「設定」文字右上角的空處,跟齒輪 icon 毫無視覺連結</Label>
        </div>
        <Label>改法:(a) 按鈕改 iconOnly + dot 疊 icon 角落、(b) 移除 dot 改用內部文字 badge(目前 DS 無 text-only badge,屬 tech debt)、(c) 移到 text 後 inline 小字「設定(新)」</Label>
      </Rule>

      <Rule
        title="判斷法：「使用者想知道『有沒有』還是『多少』？」"
        note="知道有就夠 → dot / 需要數量判斷 urgency → count"
      >
        <Label>若 count 永遠顯示 99+(threshold 失去區別力),改用 dot 或升高 max</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const DefaultLowRule: Story = {
  name: '預設低強度,有理由才升級',
  render: () => (
    <div>
      <Rule
        title="選 level 時問：使用者錯過會怎樣？"
        note="從 low 起跳,只有當內容本身 urgency 更高才升級。Critical 的紅色從「罕見」獲得信號價值——過度使用會稀釋紅色在產品內的「急迫」意義"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Archive size={16} />
            <span className="text-body">Archive</span>
            <Badge count={128} variant="low" />
          </div>
          <Label>low — 錯過無影響（被動計數）</Label>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            <span className="text-body">留言</span>
            <Badge count={12} variant="medium" />
          </div>
          <Label>medium — 輕微不便（可延後看）</Label>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Bell size={16} />
            <span className="text-body">待辦</span>
            <Badge count={7} variant="high" />
          </div>
          <Label>high — 有感影響（工作堆積）</Label>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Inbox size={16} />
            <span className="text-body">未讀私訊</span>
            <Badge count={3} variant="critical" />
          </div>
          <Label>critical — 直接傷害（錯過溝通）</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 把 passive count 當 critical（訊號稀釋）"
        note="Archive / Trash 這類被動計數升 critical → 紅色遍地都是,使用者麻木,真正急迫的通知被稀釋"
      >
        <div className="flex items-center gap-2">
          <Archive size={16} />
          <span className="text-body">Archive</span>
          <Badge count={128} variant="critical" />
        </div>
        <Label warn>↑ Archive 有多少郵件不需要 critical 紅色觸發 action——使用者只在整理時才看,用 low 即可</Label>
      </Rule>

      <Rule
        title="自我檢查：一個畫面最多 1-2 個 critical badge"
        note="超過代表把不急迫的事標成 critical。紅色稀缺性才有信號價值"
      >
        <Label>打開任何 app 的主頁面,數一下紅色 badge——超過 2 個就該降級</Label>
      </Rule>
    </div>
  ),
}

export const ContrastFloorRule: Story = {
  name: '對比 下限（容器對比下限）',
  render: () => (
    <div>
      <Rule
        title="最終強度,取「內容急迫度」和「容器最低需求」兩者中的較高者"
        note="容器需求是下限(底色太深時,badge 最少要到哪個強度才看得清),不是上限——內容本身夠急迫時,還是可以再往上升。兩個條件各自獨立把強度往上推"
      >
        <div className="flex items-center gap-3">
          <span className="text-footnote text-fg-muted w-20">Case 1:</span>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={Bell}
            aria-label="通知 (3)"
            overlayBadge={<Badge count={3} variant="high" />}
          />
          <Label>內容急迫度=high,容器要求只到 low → 用 high(內容急迫度已經高於容器最低需求)</Label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-footnote text-fg-muted w-20">Case 2:</span>
          {/* ❌ anti-pattern demo intentionally kept: text+icon Button + overlay Badge
              展示 semantic 錯配(primary 容器逼 passive count 升 critical);同時保留
              text+icon+overlay 的幾何 anti-pattern — badge 飄在 button chrome 角而非 icon 角 */}
          <div className="relative inline-flex">
            <Button variant="primary" startIcon={Bell}>通知</Button>
            <Badge count={3} variant="critical" className="absolute -top-1 -right-1" />
          </div>
          <Label warn>內容急迫度=low(被動計數),但 primary 按鈕底色深,容器要求逼到 high/critical → 被迫升級(這代表設計擺錯位置)</Label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-footnote text-fg-muted w-20">Case 3:</span>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            startIcon={Bell}
            aria-label="錯誤 (5)"
            overlayBadge={<Badge count={5} variant="critical" />}
          />
          <Label>內容急迫度=critical 業務需求本身就急 → 用 critical,容器最低需求不會把它往下壓</Label>
        </div>
      </Rule>

      <Rule
        title="Case 2 是設計錯配訊號——重新考慮放置"
        note="passive count 被 primary button 逼到 high/critical,semantic 跟 visual 不搭。解決不是一直升 level,是重新思考這 badge 該不該在這裡"
      >
        <Label>改用 dot 模式 / 移到外部 label / 乾脆不放 badge</Label>
      </Rule>

      <Rule
        title="❌ 為了「能在深色容器上看見」把 passive count 升 critical"
        note="扭曲 level 語意——把「被動資訊」包裝成「需立即處理」,誤導使用者的注意力分配"
      >
        {/* ❌ anti-pattern demo intentionally kept: text+icon Button + overlay Badge
            本 story 主軸是 semantic level 錯配(passive 被迫 critical),demo 幾何用
            舊 pattern 保留「text+icon + overlay」本身就是 anti-pattern 的視覺訊號 */}
        <div className="relative inline-flex">
          <Button variant="primary" startIcon={Archive}>Archive</Button>
          <Badge count={128} variant="critical" className="absolute -top-1 -right-1" />
        </div>
        <Label warn>↑ Archive 的 128 被強制 critical 紅色 → 使用者誤以為「要去看」,實際只是總數</Label>
      </Rule>

      <Rule
        title="✓ 正確做法:按鈕降級 + badge 回歸 low"
        note="Archive 是**歸檔/整理**動作,不是 primary CTA——本來就該是 tertiary。按鈕降級後容器 contrast floor 放寬,badge 可以用 passive 原本的 low level,semantic 跟 visual 一致,訊號清楚。「想要 primary 按鈕 + critical badge」通常是資訊架構設定錯——重看:這顆按鈕真的是頁面主 CTA 嗎?"
      >
        {/* Note: 本 story 聚焦 level semantic 對照(critical → low);幾何仍是
            text+icon Button + overlay,非 iconOnly overlay 設計準則。若要幾何也對齊
            設計準則 應改為 iconOnly + `overlayBadge` prop,或移除 overlay 改 inline badge */}
        <div className="relative inline-flex">
          <Button variant="tertiary" startIcon={Archive}>Archive</Button>
          <Badge count={128} variant="low" className="absolute -top-1 -right-1" />
        </div>
        <Label>↑ tertiary Archive + low badge(灰底灰字)—— 「有 128 筆被歸檔」passive 展示,不誘導 click</Label>
      </Rule>
    </div>
  ),
}

export const AccessibilityRule: Story = {
  name: '無障礙必備',
  render: () => (
    <div>
      <Rule
        title="Parent 元件的 aria-label 必須整合 badge 資訊"
        note="Badge 預設 role=「status」(live region 可播報計數變化),但仍應由 parent 的 aria-label 整合完整 context——「通知 (3 則未讀)」比「通知」+「3」更清楚"
      >
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          startIcon={Bell}
          aria-label="通知 (3 則未讀)"
          overlayBadge={<Badge count={3} variant="critical" />}
        />
        <Label>✓ aria-label="通知 (3 則未讀)" — screen reader 一次讀出完整資訊</Label>
      </Rule>

      <Rule
        title="Dot 模式必須給 aria-label"
        note="Dot 無文字,screen reader 完全看不到——沒 aria-label 等於對 a11y 使用者不存在"
      >
        <div className="flex items-center gap-4">
          <Badge dot variant="critical" aria-label="有新訊息" />
          <span className="text-body">✓ 有 aria-label</span>
        </div>
        <div className="flex items-center gap-4">
          <Badge dot variant="critical" />
          <span className="text-body">❌ 沒 aria-label</span>
        </div>
        <Label warn>↑ 沒 aria-label 的 dot → screen reader 使用者不知道「有東西」</Label>
      </Rule>

      <Rule
        title="❌ 單靠顏色傳達 urgency（color-blind 失效）"
        note="Badge 的 level 靠顏色(紅/藍/灰)——color-blind 使用者可能分不清 critical vs high。必須搭配 aria-label、count 數字、或容器上的其他視覺指示"
      >
        <div className="flex items-center gap-4">
          <Badge dot variant="critical" aria-label="緊急" />
          <Badge dot variant="high" aria-label="重要" />
        </div>
        <Label>↑ critical(橘)vs high(藍)只靠顏色——color-blind 使用者分不清,必須靠 aria-label 明確語意,不能只靠顏色</Label>
      </Rule>
    </div>
  ),
}

export const PlacementRule: Story = {
  name: '三種放置模式',
  render: () => (
    <div>
      <Rule
        title="Overlay — 疊加在視覺重心（iconOnly / avatar / 純 icon）"
        note="標準 API:`<Button overlayBadge={...}>` — badge 中心對齊 icon 的 top-right corner(Material BadgedBox / iOS App Icon)。不手刻 relative + absolute,避免 badge 飄到 button chrome 邊緣"
      >
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          startIcon={Bell}
          aria-label="通知 (3)"
          overlayBadge={<Badge count={3} variant="critical" />}
        />
      </Rule>

      <Rule
        title="Inline — 跟 label 並列（計數展示）"
        note="Tab / Menu item / Section title 旁邊顯示計數。不用 absolute,gap 控制間距"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} />
          <span className="text-body">文件</span>
          <Badge count={12} variant="low" />
        </div>
        <Label>↑ 「文件 (12)」一體展示,不是 overlay</Label>
      </Rule>

      <Rule
        title="Standalone — 獨立狀態指示"
        note="通常是 dot 模式,跟 description 文字並列作為狀態 indicator"
      >
        <div className="flex items-center gap-2">
          <Badge dot variant="critical" aria-label="同步失敗" />
          <span className="text-body">同步失敗</span>
        </div>
      </Rule>

      <Rule
        title="❌ 一個元件同時疊多個同類 badge"
        note="同一 trigger 疊兩個不同 urgency 的**同類訊號**(count + dot 都是通知重要性)→ 使用者無法判斷哪個重要。合併成一個 badge。不同角、不同語義 OK(Avatar 右下 presence + 右上 count 是合法,見「Avatar + badgeCount + status」demo)"
      >
        {/* ❌ anti-pattern demo intentionally kept: Button `overlayBadge` prop 只支援單一 badge
            (設計準則 就是避免 signal crowding);本 rule 主軸是「不該這樣做」,用舊
            `relative + absolute` 手刻兩個 badge 作為視覺反例 */}
        <div className="relative inline-flex">
          <Button variant="tertiary" size="sm" iconOnly startIcon={Bell} aria-label="通知" />
          <Badge count={3} variant="critical" className="absolute -top-1 -right-1" />
          <Badge dot variant="high" className="absolute -bottom-1 -right-1" />
        </div>
        <Label warn>↑ 同一顆 Bell 按鈕同時表達「未讀 3」和「有更新(dot)」—— 兩個都是通知訊號,語義重疊 → 使用者混淆</Label>
      </Rule>
    </div>
  ),
}
