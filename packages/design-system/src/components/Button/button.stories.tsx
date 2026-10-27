// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @story-history: hasSizes 由 anatomy.stories.tsx SizeMatrix auto-compile owns size showcase(2026-05-15 F-migration);Default scenario 由 Pressed / IconOnly / 各 variant 真實業務情境 story 覆蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { Plus, Trash2, Search, ChevronDown, Settings, Download, Bell, RefreshCw, Maximize2, Save, X } from 'lucide-react'
import { Button } from './button'
import { Badge } from '@/design-system/components/Badge/badge'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { Toaster } from '@/design-system/components/Toast/toast'
import { done, DemoToggle, DemoMenu, ConfirmAction, ConfirmDelete } from '@/design-system/stories-helpers/examples/demo-actions'

const meta: Meta<typeof Button> = {
  title: 'Design System/Components/Button/展示',
  component: Button,
  tags: ['autodocs'],
  // Toaster 是 app 層 Provider(toast.spec.md:consumer 在 app root 放一次)—— 放在 story 外層
  decorators: [(Story) => (<><Story /><Toaster /></>)],
  parameters: {
    docs: {
      description: {
        component: '用於觸發送出、儲存、確認或工具列動作，並以強調等級表達操作優先序。純跨頁導覽或內文連結改用 Link / `<a>`；多選一的持續狀態改用 SegmentedControl。',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'tertiary', 'text', 'link'],
      description: '視覺強調等級。`destructive` / `ghost` 為 shadcn 內部 compat alias，應用層請勿直接使用。',
    },
    danger: {
      control: 'boolean',
      description: '套用危險色（紅色）。僅 `primary` / `secondary` / `text` 支援（`tertiary` 無 danger compound——會靜默渲染成一般 tertiary、並非等同 secondary+danger；`link` 語義矛盾。見 spec 禁止事項）。',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'],
      description: '`xs` 固定尺寸；`sm` / `md`（預設）/ `lg` 會隨 density 自動縮放。',
    },
    startIcon: {
      control: false,
      description: '左側 icon（`LucideIcon`），最多一個。`loading` 時自動替換為 spinner。',
    },
    endIcon: {
      control: false,
      description: '右側 icon（`LucideIcon`），放在 badge 右邊。語意：告訴使用者按鈕會展開下一層（如 `ChevronDown`），不應放動詞性 icon。',
    },
    badge: {
      control: false,
      description: '右側 badge 內容（`ReactNode`），通常傳入計數指示器。',
    },
    iconOnly: {
      control: 'boolean',
      description: '移除水平 padding，讓按鈕變為正方形。必須同時設定 `aria-label`。',
    },
    // 說明不在這裡另寫:Controls / 文件頁的 args 表直接讀 button.tsx ButtonProps.loading 的 JSDoc(react-docgen-typescript)。
    // 2026-10-01 loading 改成可聚焦的停用之後,這裡手寫的舊說明(說它會變成原生停用)沒跟著改,兩份說明互相矛盾(r1b NEW-03)
    loading: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
      description: '停用按鈕。不代表載入中，若需傳達載入請同時設定 `loading`。',
    },
    fullWidth: {
      control: 'boolean',
      description: '加上 `w-full`，撐滿父容器。垂直排列按鈕群組時使用。',
    },
    asChild: {
      control: false,
      description: '將樣式套用至子元件（e.g. React Router `<Link>`），使用 Radix `Slot` 實作。',
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

// 間距(layoutSpace.spec.md 規則 3;category-templates.md「教學框的間距與標題」):本檔是變體樣本的對照列 ——
// 並列的樣本之間 loose、說明 ↔ 它標的那一列樣本 tight(ExampleGroup)、一組一組的對照之間 loose。
// 2026-05-18 加(user 指出頁面開頭就是按下狀態;原話已不可考,此為轉述):Default story 放最頂,
// 入口顯預設 variant 五連發(primary / secondary / tertiary / text / link),
// 讓 user 第一眼看到按鈕長什麼樣 — 而非 transient state demo。
// 2026-10-28 BA-specimen:畫面上的按鈕都要能按(F-S2),各自接上按鈕本來的行為(stories-helpers/examples/demo-actions.tsx):
// 一次性動作跳 Toast、開關切 pressed、帶下拉的打開選單、後面還有確認的危險動作先開確認框(button.spec.md「danger prop — 語意意圖」表)。
export const Default: Story = {
  name: '預設',
  render: () => (
    <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
      <Button variant="primary" onClick={done('已送出請假申請')}>送出申請</Button>
      <Button variant="secondary" onClick={done('已儲存草稿')}>儲存草稿</Button>
      <Button variant="tertiary" onClick={done('已取消,申請內容沒有送出')}>取消</Button>
      {/* 「重設表單」= 讀者看不懂要做什麼的重設鈕(登記簿 A19),換成表單裡常見的低強調動作 */}
      <Button variant="text" onClick={done('已儲存進度,稍後可以繼續填寫')}>稍後再填</Button>
      <Button variant="link" onClick={done('已開啟填寫說明')}>查看填寫說明</Button>
    </div>
  ),
}

export const Pressed: Story = {
  name: '按下狀態',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <div className="flex flex-wrap items-center gap-[var(--layout-space-tight)]">
        <span className="text-caption text-fg-muted w-24">secondary</span>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          {/* 兩顆都是同一種開關,初始一關一開;按下切換 pressed,字跟著狀態走 */}
          <DemoToggle>{(on, flip) => <Button variant="secondary" pressed={on} onClick={flip}>{on ? '已顯示側欄' : '顯示側欄'}</Button>}</DemoToggle>
          <DemoToggle defaultOn>{(on, flip) => <Button variant="secondary" pressed={on} onClick={flip}>{on ? '已顯示側欄' : '顯示側欄'}</Button>}</DemoToggle>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-[var(--layout-space-tight)]">
        <span className="text-caption text-fg-muted w-24">tertiary</span>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <DemoToggle>{(on, flip) => <Button variant="tertiary" pressed={on} onClick={flip}>{on ? '自動儲存中' : '自動儲存'}</Button>}</DemoToggle>
          <DemoToggle defaultOn>{(on, flip) => <Button variant="tertiary" pressed={on} onClick={flip}>{on ? '自動儲存中' : '自動儲存'}</Button>}</DemoToggle>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-[var(--layout-space-tight)]">
        <span className="text-caption text-fg-muted w-24">text</span>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <DemoToggle>{(on, flip) => <Button variant="text" pressed={on} onClick={flip}>{on ? '已靜音' : '靜音'}</Button>}</DemoToggle>
          <DemoToggle defaultOn>{(on, flip) => <Button variant="text" pressed={on} onClick={flip}>{on ? '已靜音' : '靜音'}</Button>}</DemoToggle>
        </div>
      </div>
    </div>
  ),
}

// 帶計數 / 下拉的按鈕打開的那一串(DemoMenu)
const NOTIFICATIONS = [
  { label: '張雅婷在「Q3 行銷預算」提到你', description: '10 分鐘前' },
  { label: '「官網改版」的截止日改為 11/15', description: '1 小時前' },
  { label: '李建宏把「首頁輪播圖更新」指派給你', description: '昨天' },
]
const MESSAGES = [
  { label: '林佳穎', description: '週五的設計評審改到下午 3 點,會議室不變' },
  { label: '陳志明', description: 'Q3 預算表我更新了第二頁,麻煩再看一次' },
]
const TODOS = [
  { label: '審核「官網改版」設計稿', description: '今天到期' },
  { label: '回覆客戶報價單', description: '明天到期' },
]
const SETTINGS_MENU = ['通知設定', '帳號設定']

// ── danger prop ─────────────────────────────────────────────────

export const Danger: Story = {
  name: '危險語意',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
        {/* primary + danger = 點下去就發生(它本身就是確認框裡的最後一步);secondary / text + danger = 後面還有一層確認 */}
        <Button variant="primary" danger onClick={done('已刪除專案「官網改版」')}>刪除專案</Button>
        <ConfirmAction title="是否移除成員" body="確定要把陳志明移出「官網改版」嗎?移除後他就看不到這個專案。" confirmLabel="移除" doneTitle="已移除陳志明">
          {(open) => <Button variant="secondary" danger onClick={open}>移除成員</Button>}
        </ConfirmAction>
        <ConfirmAction title="是否撤銷授權" body="撤銷後「Slack 整合」就不能再讀取這個專案的資料。" confirmLabel="撤銷" doneTitle="已撤銷 Slack 整合的授權">
          {(open) => <Button variant="text" danger onClick={open}>撤銷授權</Button>}
        </ConfirmAction>
      </div>
      <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
        <Button variant="primary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" onClick={done('已刪除「2026 Q3 營收報告.pdf」')} />
        <ConfirmDelete noun="檔案" target="「2026 Q3 營收報告.pdf」">{(open) => <Button variant="secondary" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" onClick={open} />}</ConfirmDelete>
        <ConfirmDelete noun="檔案" target="「2026 Q3 營收報告.pdf」">{(open) => <Button variant="text" danger size="sm" iconOnly startIcon={Trash2} aria-label="刪除" onClick={open} />}</ConfirmDelete>
      </div>
    </div>
  ),
}

// ── startIcon / endIcon display retired 2026-04-24 ──
// `WithStartIcon` retired(Dim 25 earn-existence):同教 principle 已在 `startIconRule`
// principles story(含視覺 + do/don't + 規則註解),display 層重複教相同原則 = noise。
// 需要 startIcon / endIcon 的 quick reference → 參考 `.principles.stories.tsx`。

// ── badge slot(獨立 rule,跟 Chip 一致)────────────────────────────────

export const WithBadge: Story = {
  // badge 是獨立 slot rule(inline 在 pill 內),不合進 WithIcon — 對齊 Chip 一致。
  // Compound(badge + endIcon)順帶展示 layering 真實情境(教 layering coexistence)。
  name: 'Badge 槽位',
  args: { size: 'sm' },
  render: (args) => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <ExampleGroup>
        <p className="text-caption text-fg-muted">badge — inline 計數</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <DemoMenu open align="start" title="通知 · 3 則" items={NOTIFICATIONS}><Button size={args.size} variant="tertiary" startIcon={Bell} badge={<Badge count={3} />}>通知</Button></DemoMenu>
          <DemoMenu open align="start" title="訊息 · 12 則未讀" items={MESSAGES}><Button size={args.size} variant="tertiary" badge={<Badge count={12} />}>訊息</Button></DemoMenu>
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <p className="text-caption text-fg-muted">badge + endIcon compound</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <DemoMenu open align="start" title="通知 · 5 則" items={NOTIFICATIONS}><Button size={args.size} variant="tertiary" badge={<Badge count={5} />} endIcon={ChevronDown}>更多通知</Button></DemoMenu>
          <DemoMenu open align="start" title="待辦 · 2 件" items={TODOS}><Button size={args.size} variant="tertiary" badge={<Badge count={2} />} endIcon={ChevronDown}>待辦</Button></DemoMenu>
        </div>
      </ExampleGroup>
    </div>
  ),
}

// ── Icon-only ──────────────────────────────────────────────────

export const IconOnly: Story = {
  name: '純圖示',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <ExampleGroup>
        <p className="text-caption text-fg-muted">variants — size="sm"</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <Button size="sm" iconOnly variant="primary"   startIcon={Plus}     aria-label="新增" onClick={done('已新增「未命名文件」')} />
          <Button size="sm" iconOnly variant="secondary" startIcon={Download}  aria-label="下載" onClick={done('已下載「2026 Q3 營收報告.pdf」')} />
          <Button size="sm" iconOnly variant="tertiary"  startIcon={Search}    aria-label="搜尋" onClick={done('已開啟搜尋')} />
          <DemoMenu open items={SETTINGS_MENU}><Button size="sm" iconOnly variant="text" startIcon={Settings} aria-label="設定" /></DemoMenu>
          <DemoToggle defaultOn>{(on, flip) => <Button size="sm" iconOnly variant="text" pressed={on} onClick={flip} startIcon={Maximize2} aria-label={on ? '全螢幕（開啟中）' : '全螢幕'} />}</DemoToggle>
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <p className="text-caption text-fg-muted">danger — size="sm"</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <Button size="sm" iconOnly variant="primary"    danger startIcon={Trash2} aria-label="永久刪除" onClick={done('已永久刪除「2026 Q3 營收報告.pdf」')} />
          <ConfirmDelete noun="檔案" target="「2026 Q3 營收報告.pdf」">{(open) => <Button size="sm" iconOnly variant="secondary" danger startIcon={Trash2} aria-label="刪除（有確認）" onClick={open} />}</ConfirmDelete>
          <ConfirmDelete noun="檔案" target="「2026 Q3 營收報告.pdf」">{(open) => <Button size="sm" iconOnly variant="text" danger startIcon={Trash2} aria-label="刪除" onClick={open} />}</ConfirmDelete>
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <p className="text-caption text-fg-muted">sizes — variant="text"</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <DemoMenu open items={SETTINGS_MENU}><Button size="xs" iconOnly variant="text" startIcon={Settings} aria-label="設定 xs" /></DemoMenu>
          <DemoMenu open items={SETTINGS_MENU}><Button size="sm" iconOnly variant="text" startIcon={Settings} aria-label="設定 sm" /></DemoMenu>
          <DemoMenu open items={SETTINGS_MENU}><Button size="md" iconOnly variant="text" startIcon={Settings} aria-label="設定 md" /></DemoMenu>
          <DemoMenu open items={SETTINGS_MENU}><Button size="lg" iconOnly variant="text" startIcon={Settings} aria-label="設定 lg" /></DemoMenu>
        </div>
      </ExampleGroup>
    </div>
  ),
}

// ── 狀態 ────────────────────────────────────────────────────────

export const Disabled: Story = {
  name: '停用',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <ExampleGroup>
        {/* 2026-10-21 前標「form footer 情境」卻連「取消」也停用 —— 真的表單底部取消永遠可按(r1b OTH-12);這一列是 variant 對照,不冒充情境 */}
        <p className="text-caption text-fg-muted">全 variants</p>
        <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
          <Button variant="primary" disabled>儲存</Button>
          <Button variant="secondary" disabled>匯出</Button>
          <Button variant="tertiary" disabled>預覽</Button>
          <Button variant="text" disabled>查看版本紀錄</Button>
          <Button variant="text" pressed disabled>已啟用自動儲存</Button>
          <Button variant="link" disabled>了解更多</Button>
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <p className="text-caption text-fg-muted">danger</p>
        <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
          <Button variant="primary" danger disabled>刪除專案</Button>
          <Button variant="secondary" danger disabled>移除成員</Button>
          <Button variant="text" danger disabled>撤銷授權</Button>
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <p className="text-caption text-fg-muted">icon-only — 全 variants</p>
        <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
          <Button variant="primary" disabled size="sm" iconOnly startIcon={Plus} aria-label="新增" />
          <Button variant="secondary" disabled size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="tertiary" disabled size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="text" disabled size="sm" iconOnly startIcon={Search} aria-label="搜尋" />
          <Button variant="text" pressed disabled size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <p className="text-caption text-fg-muted">icon-only — danger</p>
        <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
          <Button variant="primary" danger disabled size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
          <Button variant="secondary" danger disabled size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
          <Button variant="text" danger disabled size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
        </div>
      </ExampleGroup>
    </div>
  ),
}

export const Loading: Story = {
  name: '載入中',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {/* 行為對照 */}
      <ExampleGroup>
        <p className="text-caption text-fg-muted">行為對照：操作前與載入中</p>
        {/* @layout-space-magic-ok: 行為對照表欄距 24px、列距 12px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
        <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-6 gap-y-3">
          <span className="text-caption text-fg-muted">操作前</span>
          <span className="text-caption text-fg-muted">載入中</span>
          <span />
          <Button variant="primary" startIcon={Download} onClick={done('已匯出「Q3 訂單.csv」')}>匯出</Button>
          <Button variant="primary" startIcon={Download} loading>匯出中</Button>
          <span className="text-caption text-fg-muted">startIcon 被 spinner 替換，位置不變</span>
          <Button variant="primary" onClick={done('已儲存變更')}>儲存</Button>
          <Button variant="primary" loading>儲存中</Button>
          <span className="text-caption text-fg-muted">spinner 出現在文字左側，按鈕略寬</span>
          <Button size="sm" iconOnly startIcon={Download} aria-label="下載" onClick={done('已下載「Q3 訂單.csv」')} />
          <Button size="sm" iconOnly startIcon={Download} loading aria-label="下載中" />
          <span className="text-caption text-fg-muted">icon-only：spinner 替換 icon</span>
        </div>
      </ExampleGroup>

      {/* 全 variants:載入中 spinner 佔住 startIcon 的位置(上方對照第一列),有沒有 startIcon 長相相同 —— 2026-10-21 前分成「with / without
          startIcon」兩列,畫出來一模一樣,還有一顆載入中的「取消」(取消不會載入)(r1b OTH-12) */}
      <ExampleGroup>
        <p className="text-caption text-fg-muted">全 variants(匯出 / 同步情境)</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <Button variant="primary" startIcon={Download} loading>匯出報表</Button>
          <Button variant="secondary" startIcon={RefreshCw} loading>同步 Stripe</Button>
          <Button variant="tertiary" startIcon={RefreshCw} loading>重新整理</Button>
          <Button variant="text" loading>載入更多</Button>
          <Button variant="text" pressed loading>處理中</Button>
          <Button variant="primary" danger startIcon={Trash2} loading>刪除專案</Button>
        </div>
      </ExampleGroup>

      {/* icon-only */}
      <ExampleGroup>
        <p className="text-caption text-fg-muted">icon-only</p>
        <div className="flex flex-wrap items-center gap-[var(--layout-space-loose)]">
          <Button variant="primary" loading size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="secondary" loading size="sm" iconOnly startIcon={Download} aria-label="下載" />
          <Button variant="tertiary" loading size="sm" iconOnly startIcon={RefreshCw} aria-label="刷新" />
          <Button variant="text" loading size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="text" pressed loading size="sm" iconOnly startIcon={Maximize2} aria-label="全螢幕" />
        </div>
      </ExampleGroup>
    </div>
  ),
}

export const FullWidth: Story = {
  name: '全寬',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-xs">
      <Button variant="primary" fullWidth onClick={done('已送出訂單')}>確認送出</Button>
      <Button variant="tertiary" fullWidth onClick={done('已取消,訂單沒有送出')}>取消</Button>
      <Button variant="primary" danger fullWidth startIcon={Trash2} onClick={done('已永久刪除訂單 #4210')}>永久刪除</Button>
    </div>
  ),
}

// ── Interactive State Pilot(視覺稽核用)─────────────────────────────
// play() 只建立 focus / tooltip 等非 pointer 狀態；CSS :hover 一律由
// visual-audit 的真實 Playwright pointer 建立，避免 synthetic hover 假綠。
// 詳見 .claude/skills/visual-audit/SKILL.md 的「Layer A interactive state coverage」。

export const DismissHoverState: Story = {
  name: '關閉按鈕懸停狀態',
  tags: ['test-only'],
  render: () => (
    // 關閉鈕住列尾槽 ItemSuffix(h-[1lh]),對齊標題第一行(item-anatomy.spec.md「Suffix 一律 `h-[1lh]` inline 對齊第一行 label」;
    // 同 Notice / Alert / Toast 的關閉鈕);容器設 text-body 讓 1lh = 標題行高。2026-10-27 前是 items-center,× 落在兩行字塊正中、比標題中線低約 8px
    <div className="flex items-start gap-3 rounded-lg border border-divider bg-surface p-4 text-body">
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-foreground">付款方式已更新</p>
        <p className="text-caption text-fg-secondary">此通知可直接關閉。</p>
      </div>
      <ItemSuffix>
        <Button dismiss size="sm" startIcon={X} aria-label="關閉付款通知" data-visual-hover-target />
      </ItemSuffix>
    </div>
  ),
}

export const HoverFocusState: Story = {
  name: '滑鼠移過 / 鍵盤聚焦',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  // @example-basis: packages/design-system/ds-canonical/rules/story-rules.md「示範 = 滑鼠使用者」段:「滑鼠移過 / 鍵盤聚焦、焦點鎖、焦點接力、play 裡明寫 `.focus()` 或 `userEvent.keyboard`」
  parameters: { demoFocus: 'keep' },
  tags: ['test-only'],
  render: () => (
    <div className="flex gap-4">
      <Button variant="primary" data-testid="hover-target" data-visual-hover-target>查看帳單</Button>
      <Button variant="primary" data-testid="focus-target">下載明細</Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { within } = await import('@storybook/test')
    const canvas = within(canvasElement)
    await canvas.findByTestId('hover-target')
    const focusEl = await canvas.findByTestId('focus-target')
    focusEl.focus()
    // visual-audit 會在 play 完成後把真實 pointer 留在 hover target。
    await new Promise((r) => setTimeout(r, 400))
  },
}

export const TooltipVisible: Story = {
  name: '純圖示加 Tooltip',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  // @example-basis: packages/design-system/ds-canonical/rules/story-rules.md「示範 = 滑鼠使用者」段:「滑鼠移過 / 鍵盤聚焦、焦點鎖、焦點接力、play 裡明寫 `.focus()` 或 `userEvent.keyboard`」
  parameters: { demoFocus: 'keep' },
  tags: ['test-only'],
  render: () => (
    <div className="p-12">
      <Button iconOnly startIcon={Save} aria-label="儲存" data-testid="tooltip-target" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { within } = await import('@storybook/test')
    const canvas = within(canvasElement)
    const btn = await canvas.findByTestId('tooltip-target')
    btn.focus()
    // Tooltip open delay(Radix 預設 ~700ms warm-up / instant after warm);
    // 給足 1000ms 確保 content 已 render 到 Portal
    await new Promise((r) => setTimeout(r, 1000))
  },
}
