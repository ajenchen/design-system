// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   ColorMatrix N/A — Empty 是純 layout pattern,色彩固定(title foreground、
//     description fg-secondary / fg-muted、Avatar 48px neutral),無 variant ×
//     state 色彩。
//   SizeMatrix N/A — 不提供 size prop;由 slot 組合決定外觀,SlotCombinations
//     已涵蓋 4 種強度從 minimal 到 full。
//   StateBehavior N/A — Empty 是純展示 layout,本身無 hover / focus / active /
//     selected 互動狀態。互動由 action slot 的 Button 提供,屬 Button 元件範疇。
//     例外:disabled context state(disabled prop,2026-06-03 加)非互動但元件支援——
//     title / description / icon glyph 轉 text-fg-disabled(供 FileUpload disabled 消費)。
import type { Meta, StoryObj } from '@storybook/react'
import { Inbox, Search, FileText, FolderOpen, Bell, Users, ClipboardList } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

// 範例裡的按鈕做它說的那件事(稽核 L020;user 2026-09-08 F-S2 看得到的按鈕都要能動)
const done = (title: string) => () => toast({ variant: 'success', title })
const copyInviteLink = async () => {
  try {
    await navigator.clipboard.writeText('https://app.example.com/invite/acme-design')
    toast({ variant: 'success', title: '邀請連結已複製' })
  } catch {
    toast({ variant: 'error', title: '無法存取剪貼簿,請改從瀏覽器網址列複製' })
  }
}

type InspectorArgs = {
  iconKey: 'none' | 'Inbox' | 'Search' | 'FileText' | 'FolderOpen' | 'Bell' | 'Users'
  title: string
  description: string
  withAction: boolean
  actionLabel: string
}

const ICON_OPTIONS: Record<string, LucideIcon | undefined> = {
  none: undefined,
  Inbox,
  Search,
  FileText,
  FolderOpen,
  Bell,
  Users,
}

const meta: Meta = {
  title: 'Design System/Components/Empty/設計規格',
  parameters: { layout: 'padded' },
  // 範例裡的按鈕跳 Toast:Toaster 是 app 層 Provider(toast.spec.md),放在 story 外層、不佔版面(同 Toast 設計原則頁)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<InspectorArgs>

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Empty 是 layout pattern——排列 Icon + Title + Description + Action 成居中垂直堆疊。預設只有 description,icon / title / action 全部可選。</Desc>
        <div className="border border-border rounded-lg p-8">
          <Empty
            icon={Users}
            title="還沒有團隊成員"
            description="把邀請連結傳給同事,他們加入後會出現在這裡"
            action={<Button variant="primary" onClick={copyInviteLink}>複製邀請連結</Button>}
          />
        </div>
      </div>

      <div>
        <H3>Slot 與 Spacing</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Slot</Th><Th>可選</Th><Th>Typography</Th><Th>上方間距</Th></tr></thead>
            <tbody>
              <tr><Td mono>icon</Td><Td>選填</Td><Td>Avatar 48px neutral + icon</Td><Td>—</Td></tr>
              <tr><Td mono>title</Td><Td>選填</Td><Td>16px font-medium centered</Td><Td>icon → 文字固定 16px(mb-4)</Td></tr>
              <tr><Td mono>description</Td><Td>必有(預設唯一 slot)</Td><Td>14px(standalone / sm·md row 子樹)/ 16px(lg RowSizeContext 子樹,如 lg menu)· fg-secondary(有 title/action 時)/ fg-muted(孤身 description,placeholder tier)· centered</Td><Td mono>--item-gap-label-desc-reading-lg(2px,title body-lg)</Td></tr>
              <tr><Td mono>action</Td><Td>選填</Td><Td>CTA Button</Td><Td>固定 24px(mt-6)</Td></tr>
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
                ['icon', 'LucideIcon | ReactElement', '—', 'LucideIcon 自動包 Avatar 48px;ReactElement 原樣渲染(自訂 Avatar / img / CircularProgress)'],
                ['title', 'string', '—', '主要標題(16px medium)'],
                ['description', 'string', '必填(預設唯一 slot)', '說明文字(14px;lg RowSizeContext 子樹內 16px · fg-secondary)'],
                ['action', 'ReactNode', '—', 'CTA button / 操作區'],
                ['disabled', 'boolean', 'false', 'disabled context（FileUpload disabled 等情境）— title / description / icon glyph 轉 fg-disabled'],
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

export const Inspector: InspectorStory = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story: '在右側 Controls 面板切換 icon / title / description / action,即時查看 Empty 在不同 slot 組合下的呈現。Empty 是純 layout 元件,所有 slot 皆可選,最少只需 description。',
      },
    },
  },
  args: {
    iconKey: 'Inbox',
    title: '收件匣已清空',
    description: '所有訊息都處理完畢,可以好好休息了',
    withAction: false,
    actionLabel: '建立專案',
  },
  argTypes: {
    iconKey: {
      control: 'select',
      options: ['none', 'Inbox', 'Search', 'FileText', 'FolderOpen', 'Bell', 'Users'],
      description: 'Icon(選 none 則不渲染 icon slot)',
    },
    title: { control: 'text', description: '主要標題(留白則不渲染)' },
    description: { control: 'text', description: '說明文字(預設唯一 slot)' },
    withAction: { control: 'boolean', description: '是否顯示 CTA button' },
    actionLabel: { control: 'text', description: 'CTA button 文字' },
  },
  render: (args) => {
    const icon = ICON_OPTIONS[args.iconKey]
    return (
      <div className="border border-border rounded-lg p-8 max-w-md">
        <Empty
          icon={icon}
          title={args.title || undefined}
          description={args.description}
          action={args.withAction ? <Button variant="primary" onClick={done(`${args.actionLabel}:完成`)}>{args.actionLabel}</Button> : undefined}
        />
      </div>
    )
  },
}

export const ScenarioMatrix: Story = {
  name: '常見場景',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Table 空資料</H3>
        <div className="border border-border rounded-lg p-8">
          <Empty description="還沒有訂單" className="py-12" />
        </div>
      </div>

      <div>
        <H3>Page section 初次引導</H3>
        <div className="border border-border rounded-lg p-8">
          <Empty
            icon={FileText}
            title="還沒有專案"
            description="建立第一個專案開始追蹤您的任務"
            action={<Button variant="primary" onClick={done('專案已建立')}>建立專案</Button>}
          />
        </div>
      </div>
    </div>
  ),
}

export const SlotCombinations: Story = {
  name: '插槽組合（只有說明 → 完整）',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>四種 slot 組合 — 從最小到最完整</H3>
        <Desc>
          Empty 是純 layout 元件——consumer 依 context 決定要顯示多少 slot。最少只要 <code>description</code>
          (預設唯一必填 slot),icon / title / action 全部是 opt-in。選擇時問自己:「使用者需要多強的
          引導?」——越初次 / 越重要的空狀態,slot 越多。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>場景強度</Th>
                <Th>Slot 組合</Th>
                <Th>適合情境</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>最低(僅提示)</Td><Td mono>description</Td><Td>DataTable 無資料、篩選無結果</Td></tr>
              <tr><Td>輕引導</Td><Td mono>icon + description</Td><Td>資料夾 / 區塊是空的、不需要下一步</Td></tr>
              <tr><Td>中引導</Td><Td mono>icon + title + description</Td><Td>收件匣空、無留言</Td></tr>
              <tr><Td>初次引導(full)</Td><Td mono>icon + title + description + action</Td><Td>第一次使用功能、onboarding empty</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>只有說明(DataTable 空)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty description="無符合條件的訂單" className="py-6" />
        </div>
      </div>

      <div>
        <H3>圖示 + 說明(資料夾是空的)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty icon={FolderOpen} description="這個資料夾還沒有檔案" className="py-6" />
        </div>
      </div>

      <div>
        <H3>圖示 + 標題 + 說明(收件匣空)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty
            icon={Inbox}
            title="收件匣已清空"
            description="所有訊息都處理完畢,可以好好休息了"
          />
        </div>
      </div>

      <div>
        <H3>全部插槽(初次引導)</H3>
        <div className="border border-border rounded-lg p-8 max-w-md">
          <Empty
            icon={ClipboardList}
            title="還沒有任何問卷"
            description="建立問卷,收集客戶對新功能的回饋"
            action={<Button variant="primary" onClick={done('問卷已建立')}>建立問卷</Button>}
          />
        </div>
      </div>

      <div>
        <H3>Slot 間距規則</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>關係</Th>
                <Th>間距來源</Th>
                <Th>數值</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>icon → 文字</Td><Td mono>mb-4</Td><Td>固定 16px(展示性元件,不隨密度變)</Td></tr>
              <tr><Td>title → description</Td><Td mono>--item-gap-label-desc-reading-lg</Td><Td>2px(緊密配對,title=body-lg 16 + desc=body 14)</Td></tr>
              <tr><Td>description → action</Td><Td mono>mt-6</Td><Td>固定 24px(展示性元件,不隨密度變)</Td></tr>
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
      <p>本元件為純視覺呈現,無 keyboard / ARIA role / focus state 需求。Consumer 包 Empty 進互動容器(Button / Card / Link)時 a11y 由容器決定。</p>
    </div>
  ),
}
