// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import {
  Plus, Trash2, Settings, RefreshCw,
  MoreVertical, Save, Maximize2, Share2,
  ChevronDown, Download, Bell,
} from 'lucide-react'
import { Button } from './button'
import { ButtonGroup } from './button-group'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta = {
  title: 'Design System/Components/Button/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-wrap gap-2 items-center">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Button ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Button 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Button/展示" name="Danger prop"><span className="text-primary hover:underline font-medium cursor-pointer">Danger prop</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Button/展示" name="Hover / Focus"><span className="text-primary hover:underline font-medium cursor-pointer">Hover / Focus</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Button/展示" name="Tooltip on Icon Only"><span className="text-primary hover:underline font-medium cursor-pointer">Tooltip on Icon Only</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="❌ 不用 Button 做標籤或指示器"
        note="Button 語義是「可點擊動作」。如果只是顯示狀態、不需使用者互動，用 Badge 或 Tag 代替。Jira 的「已解決」標籤、Stripe 的「active」指示不會設計成按鈕"
      >
        <div className="flex gap-2 items-center">
          <Button variant="primary" size="sm">Active</Button>
          <Label warn>❌ 當標籤用 → 下方才對</Label>
        </div>
        <div className="flex gap-2 items-center mt-3">
          <Badge count={1} />
          <Label>✅ Badge 表達計數 / 狀態</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 不用多個 primary 按鈕搶焦點"
        note="Primary 語義是「這個畫面最重要的動作」。多個 primary 時使用者無法判斷優先順序，改用 primary + secondary + tertiary。Notion 對話框永遠只有一個藍色按鈕"
      >
        <div>
          <div className="mb-4">
            <Button variant="primary">保存</Button>
            <Button variant="primary" className="ml-2">另存新檔</Button>
            <Label warn>❌ 兩個都搶焦點</Label>
          </div>
          <div>
            <Button variant="primary">保存</Button>
            <Button variant="secondary" className="ml-2">另存新檔</Button>
            <Label>✅ 主次分明</Label>
          </div>
        </div>
      </Rule>

      <Rule
        title="❌ 不用 primary + danger 做可反悔的操作"
        note="primary + danger 語義是「立即不可逆」。如移至垃圾桶還能復原，改用 secondary + danger。Linear 的刪除先確認"
      >
        <div>
          <div className="mb-4">
            <Button variant="primary" danger startIcon={Trash2}>刪除</Button>
            <Label warn>❌ 風險高，無法復原</Label>
          </div>
          <div>
            <Button variant="secondary" danger startIcon={Trash2}>移至垃圾桶</Button>
            <div><Label>✅ secondary + danger，後續可復原</Label></div>
          </div>
        </div>
      </Rule>
    </div>
    </div>
  ),
}

export const VariantRule: Story = {
  name: 'Variant 選擇',
  render: () => (
    <div>
      <Rule
        title="primary — 最高視覺重量，每個操作區最多一個"
        note="這個畫面或操作區最重要的單一主要動作，超過一個主要動作時改用 secondary"
      >
        <Button variant="primary" startIcon={Plus}>新增</Button>
      </Rule>

      <Rule
        title="secondary — 正面與負面選項並存時的配對"
        note="兩個並列選項時使用：正面選項用 secondary，負面選項加 danger。若只有一個主要動作，改用 primary"
      >
        <Button variant="secondary">儲存草稿</Button>
        <Button variant="secondary" danger>放棄變更</Button>
      </Rule>

      <Rule
        title="tertiary — 最常用的非主要按鈕（日常預設選擇）"
        note="確認/取消配對的取消方、輔助操作、卡片 CTA 幾乎都用 tertiary"
      >
        <Button variant="tertiary">取消</Button>
        <Button variant="tertiary" startIcon={Save}>另存草稿</Button>
        <Button variant="tertiary" startIcon={Download}>匯出</Button>
      </Rule>

      <Rule
        title="text — 低視覺重量輔助動作"
        note="不需特別強調的操作；工具列 icon-only 按鈕常用 text"
      >
        <Button variant="text" startIcon={RefreshCw}>重新整理</Button>
        <Button variant="text">查看更多</Button>
        <Button variant="text" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
      </Rule>

      <Rule
        title="pressed prop — 單一功能目前啟用中（binary toggle）"
        note="設定 pressed 時 Button 自動寫入 aria-pressed + data-state，由 variant 的 data-[state=on] 分支套用樣式。僅 secondary/tertiary/text 支援 toggle 視覺，primary/link 傳入無效果。描述「這個按鈕自己的功能是否開啟」，不表達多選一"
      >
        <div className="flex items-center gap-2">
          <Button variant="text" size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（關閉）" />
          <span className="text-footnote text-fg-muted">→ 啟用後 →</span>
          <Button variant="text" pressed size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
        </div>
        <Label warn>⚠️ 多選一（視圖切換）不用 pressed → 用 Segmented Control</Label>
      </Rule>

      <Rule
        title="link — 帶使用者前往其他頁面的按鈕"
        note="視覺上像連結但需要 button 行為（React Router、事件處理）。放在內容區，不用於操作列，不嵌入段落文字（段落內用 HTML <a> 代替）"
      >
        <Button variant="link">前往設定</Button>
      </Rule>
    </div>
  ),
}

export const PrimaryRule: Story = {
  name: 'Primary 限制',
  render: () => (
    <div>
      <Rule title="✅ 正確 — 唯一的 primary">
        <Button variant="primary">確認</Button>
        <Button variant="tertiary">取消</Button>
      </Rule>

      <Rule title="❌ 錯誤 — 兩個 primary 同時出現，使用者無法判斷優先順序">
        <Button variant="primary">儲存</Button>
        <Button variant="primary">另存新檔</Button>
        <Label warn>視覺重量相同 → 無法分辨主次</Label>
      </Rule>

      <Rule
        title="✅ 卡片清單 CTA 用 tertiary"
        note="重複出現的 CTA 應使用 tertiary，避免頁面充斥填滿按鈕，稀釋 primary 的信號強度"
      >
        {['專案 A', '專案 B', '專案 C'].map(name => (
          <div key={name} className="border border-border rounded-lg px-4 py-3 flex items-center gap-3 min-w-40">
            <span className="text-body flex-1">{name}</span>
            <Button variant="tertiary" size="xs">開啟</Button>
          </div>
        ))}
      </Rule>
    </div>
  ),
}

export const DangerRule: Story = {
  name: 'Danger 時機',
  render: () => (
    <div>
      <Rule
        title="primary + danger — 立即且不可逆，點下去就發生"
        note="必須是最後一道關卡，沒有後續確認"
      >
        <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
        <Button variant="tertiary">取消</Button>
      </Rule>

      <Rule
        title="secondary + danger — 有警示意圖但點下去還可反悔"
        note="通常後面還有一層確認提示"
      >
        <Button variant="secondary">儲存草稿</Button>
        <Button variant="secondary" danger>放棄變更</Button>
      </Rule>

      <Rule
        title="text + danger — 低強調的危險操作"
        note="工具列刪除等有後續確認的場景；視覺干擾最小"
      >
        <Button variant="text" danger startIcon={Trash2}>刪除</Button>
        <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
      </Rule>

      <Rule title="❌ 錯誤 — 在有後續確認的流程中使用 primary danger">
        <Button variant="primary" danger>移至垃圾桶</Button>
        <Label warn>移至垃圾桶還可以復原 → 不應用 primary danger</Label>
      </Rule>
    </div>
  ),
}

export const IconRule: Story = {
  name: 'Icon 語意',
  render: () => (
    <div>
      <Rule
        title="startIcon — 描述這個按鈕做什麼（動詞圖示）"
        note="icon 是 label 的圖示說明，與文字傳達同一個動作"
      >
        <Button variant="primary" startIcon={Plus}>新增</Button>
        <Button variant="tertiary" startIcon={Download}>匯出</Button>
        <Button variant="tertiary" startIcon={RefreshCw}>重新整理</Button>
      </Rule>

      <Rule
        title="endIcon — 指示按鈕會開啟下一層（展開 / 選單）"
        note="告訴使用者「點這裡還有更多」，不描述動作本身"
      >
        <Button variant="tertiary" endIcon={ChevronDown}>篩選條件</Button>
        <Button variant="tertiary" startIcon={Bell} endIcon={ChevronDown}>通知</Button>
      </Rule>

      <Rule
        title="❌ endIcon 不應使用動詞性圖示"
        note="endIcon 的位置傳達「這裡可以展開」，放動詞圖示會讓使用者以為有第二個獨立操作"
      >
        <Button variant="tertiary" endIcon={Download}>匯出</Button>
        <Label warn>↑ 右側 Download 讓人以為可以直接下載，與展開選單的意圖衝突</Label>
      </Rule>

      <Rule
        title="icon + 下拉指示 — 無文字 dropdown trigger"
        note="不加 iconOnly（保留 endIcon 展開指示）；必須設定 aria-label"
      >
        <Button variant="tertiary" startIcon={Settings} endIcon={ChevronDown} aria-label="設定選項" />
        <Label>↑ startIcon 描述功能，endIcon 指示展開，兩者並存</Label>
      </Rule>

      <Rule
        title="icon + overlay 角標 — 通知類按鈕"
        note="用 `overlayBadge` prop 傳入 Badge,Button 內部自動把 badge 中心對齊 icon top-right corner(Material BadgedBox canonical)——不手刻 `relative + absolute -top-1 -right-1` 讓 badge 飄到按鈕 chrome 邊緣"
      >
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          startIcon={Bell}
          aria-label="通知 (3)"
          overlayBadge={<Badge count={3} variant="critical" />}
        />
        <Label>↑ overlayBadge prop 自動定位,Button 保持正方形,badge 貼 icon 不飄 chrome 角</Label>
      </Rule>

      <Rule
        title="溢出選單 — 一律 MoreVertical，放在群組末端"
        note="溢出按鈕是群組的一部分，不是獨立操作層。末端溢出與群組溢出的判斷規則見 Patterns / 操作列"
      >
        <ButtonGroup>
          <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="匯出" />
          <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
          <Button variant="text" size="sm" iconOnly startIcon={MoreVertical} aria-label="更多操作" />
        </ButtonGroup>
        <Label>↑ MoreVertical 在群組末端，左側不加分隔線</Label>
      </Rule>
    </div>
  ),
}

export const OrderRule: Story = {
  name: '排序與對齊',
  render: () => (
    <div>
      <Rule
        title="視覺重量序列 — 決定按鈕在群組中的相對位置"
        note="按視覺重量由高至低排列，最強吸引力的動作放在「起點」位置。danger 是顏色疊加，不影響排序位置；同 variant 內 danger 排在非 danger 之後（遠離主要焦點）"
      >
        <Button variant="primary">發布</Button>
        <Button variant="secondary">儲存草稿</Button>
        <Button variant="secondary" danger>放棄變更</Button>
        <Button variant="tertiary">預覽</Button>
        <Button variant="text">查看歷史</Button>
      </Rule>

      <Rule
        title="水平排列 — 對齊方向鏡像排序，主按鈕永遠在「起點」"
        note="靠左：動作由左發起（表單送出），primary 在最左。靠右：動作是確認補充（對話框底部），primary 在最右。排序規則不因對齊方向改變，只是方向鏡像"
      >
        <div className="flex flex-col gap-4 w-full">
          <div className="flex items-center gap-3">
            <ButtonGroup align="start">
              <Button variant="primary">確認</Button>
              <Button variant="tertiary">取消</Button>
            </ButtonGroup>
            <Label>靠左 — primary 最左，動作從左發起</Label>
          </div>
          <div className="flex items-center justify-between w-full">
            <Label>靠右 — primary 最右，對話框確認場景</Label>
            <ButtonGroup align="end">
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">確認</Button>
            </ButtonGroup>
          </div>
        </div>
      </Rule>

      <Rule
        title="垂直排列 — primary 最上，視覺動線由上往下"
        note="使用者眼睛最先掃到最上方，最希望被點擊的動作放第一個。所有按鈕撐滿容器寬度"
      >
        <div className="w-[200px]">
          <ButtonGroup direction="vertical">
            <Button variant="primary">確認送出</Button>
            <Button variant="tertiary">取消</Button>
          </ButtonGroup>
        </div>
      </Rule>

      <Rule
        title="Toolbar 場景"
        note="Toolbar 中業務操作與工具操作的全局排序、分隔線規則、溢出機制見 Patterns / 操作列"
      >
        <span className="text-caption text-fg-muted">→ Design System / Patterns / 操作列</span>
      </Rule>
    </div>
  ),
}

