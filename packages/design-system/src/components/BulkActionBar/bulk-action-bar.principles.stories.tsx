// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, Archive } from 'lucide-react'
import { BulkActionBar } from './bulk-action-bar'
import { Alert } from '@/design-system/components/Alert/alert'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/BulkActionBar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <div className="mb-10">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-4 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>BulkActionBar 是「選取狀態驅動」的批次操作列,跟 selection state 生命週期綁定。真實業務場景:</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/BulkActionBar/展示" name="基本"><span className="text-primary hover:underline cursor-pointer">基本</span></LinkTo>(收件匣多選郵件後,一次封存 / 加標籤 / 刪除)</li>
            <li><LinkTo kind="Design System/Components/BulkActionBar/展示" name="提示擴選整個資料集"><span className="text-primary hover:underline cursor-pointer">提示擴選整個資料集</span></LinkTo>(資料集共 5370 筆、本頁只顯示 50 筆:本頁全選後浮出提示,可一鍵把選取範圍擴大到全部 5370 筆)</li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定:對照 spec.md「何時用 / 何時不用」段。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 對單一 item 操作不用 BulkActionBar"
          note="單項 inline action(編輯 / 刪除某一筆)應在 row 內 inline action region(item-anatomy)。BulkActionBar 是『multi 狀態浮現』語意,單項 action 升 toolbar 是過度反應"
        >
          <Label warn>單項操作 → row 內 InlineAction(MoreVertical / Edit / Delete icon button)</Label>
        </Rule>

        <Rule
          title="❌ Page-level Submit / Save 不放 BulkActionBar"
          note="Page-level CTA 跟 selection 無關(沒選任何 row 也要 Submit)。耦合 BulkActionBar 生命週期會導致 selection 清空時 Submit 跟著消失,使用者卡關"
        >
          <Label warn>頁面主要按鈕放在頁尾或頁首,不與 BulkActionBar 耦合</Label>
        </Rule>

        <Rule
          title="❌ 永遠顯示的 toolbar(filter / sort / search)不用 BulkActionBar"
          note="filter / sort / search 不依賴 selection,沒選也要顯示。用 action-bar pattern 組 toolbar 即可"
        >
          <Label warn>常駐 toolbar → patterns/action-bar(Toolbar 變體)</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="BulkActionBar — selection-driven,length=0 自動藏"
          note="只在多選狀態浮現,清除選取就消失。生命週期跟 selection state 綁定。對齊 Linear / Notion / Polaris IndexTable / Material DataGrid"
        >
          <BulkActionBar
            selection={['a', 'b', 'c']}
            actions={
              <>
                <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
                <Button variant="tertiary" size="md" startIcon={Trash2} danger>刪除</Button>
              </>
            }
            onClear={() => {}}
          />
          <Label>↑ selection {`>`} 0 浮現,= 0 完全藏</Label>
        </Rule>

        <Rule
          title="Action Bar / Toolbar pattern — 永遠顯示,不依賴 selection"
          note="filter / sort / search / 新增按鈕等 page-level operations。詳見 patterns/action-bar/action-bar.spec.md"
        >
          <Label>常駐工具列,不隨 selection 變化</Label>
        </Rule>

        <Rule
          title="Notice / Toast — 系統訊息,不是批次操作"
          note="通知使用者某事發生(操作成功 / 失敗 / 系統公告)。可帶 1-2 個 action,但語意是『回應系統訊息』非『對選取項做事』"
        >
          <Label>系統訊息走 Notice / Toast,單純 ack 而非 batch operate</Label>
        </Rule>
      </Section>

      <Section title="判斷法">
        <p className="text-body text-fg-secondary max-w-prose">
          「沒選取就消失嗎?」是 → BulkActionBar;否 → Action Bar pattern / Toolbar / Notice。
        </p>
      </Section>
    </div>
  ),
}

export const VsToastRule: Story = {
  name: 'BulkActionBar vs Toast — 角色區分',
  render: () => (
    <div>
      <Rule
        title="✅ BulkActionBar = 選取狀態下的批次操作;Toast = 事件後的短暫回饋"
        note="兩者都浮在底部,但語意完全不同。BulkActionBar 隨 selection state 決定顯示(state-driven),容納多 action,使用者主動操作;Toast 是事件後 transient 通知(event-driven),自動消失,僅 1-2 action(undo / dismiss)。對齊 Polaris BulkActions vs Toast / Material BulkActionsBar vs Snackbar 共識。"
      >
        <Label>BulkActionBar</Label>
        <BulkActionBar
          selection={['a', 'b', 'c']}
          actions={
            <>
              <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
              <Button variant="tertiary" size="md" startIcon={Trash2} danger>刪除</Button>
            </>
          }
        />
      </Rule>
      <Rule
        title="❌ 不要用 BulkActionBar 顯示「3 個項目已封存,Undo」這類事件後通知"
      >
        <Label warn>這種情況應改用 Toast</Label>
        <p className="text-fg-muted text-body">
          事件後通知 → 用 Toast(sonner Toaster)。
          BulkActionBar 是「選了 N 項要做什麼」的選取後 toolbar,不是「我做完了」的回饋。
        </p>
      </Rule>
    </div>
  ),
}

export const ActionVariantRule: Story = {
  name: '動作 變體 規則（不用 主要）',
  render: () => (
    <div>
      <Rule
        title="✅ 批次 action 用 tertiary,destructive 用 tertiary + danger"
        note="批次操作是『可取消的入口』(點下後通常還會跳出確認視窗),所以用次要樣式(tertiary)就好;最強調的 primary 樣式留給確認視窗裡那顆最終按鈕。刪除這類危險操作也只加 danger 紅色,不升成 primary。"
      >
        <BulkActionBar
          selection={['a', 'b', 'c']}
          actions={
            <>
              <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
              <Button variant="tertiary" size="md" startIcon={Trash2} danger>刪除</Button>
            </>
          }
          onClear={() => {}}
        />
        <Label>↑ tertiary 主 / tertiary danger 破壞性</Label>
      </Rule>

      <Rule
        title="❌ 批次 action 用 primary"
        note="primary 視覺權重最高,留給 dialog 內最終確認。批次 toolbar 用 primary 會跟 page-level Submit 視覺衝突,user 認知混淆"
      >
        <BulkActionBar
          selection={['a', 'b', 'c']}
          actions={
            <>
              <Button variant="primary" size="md" startIcon={Archive}>封存</Button>
              <Button variant="primary" size="md" startIcon={Trash2} danger>刪除</Button>
            </>
          }
          onClear={() => {}}
        />
        <Label warn>↑ 兩顆都 primary → 視覺重量過高,跟 page Submit 競爭</Label>
      </Rule>
    </div>
  ),
}

export const HintBannerRule: Story = {
  name: '提示 橫幅 — 用 Alert 不自刻',
  render: () => (
    <div>
      <Rule
        title="✅ 擴 dataset 提示用 Alert(variant=info, placement=fixed)+ ReactNode title 帶 inline link"
        note="不在 BulkActionBar 內部 hardcode hint banner。Alert 既有 placement=fixed 已支援(rounded-none border-none),title 接 ReactNode 後可塞 inline button 自然 inline 連結。banner 黏在 BulkActionBar 上方 / 下方,共浮起"
      >
        <div className="border border-divider rounded-md overflow-hidden">
          <Alert
            variant="info"
            placement="fixed"
            dismissible={false}
            title={
              <>
                已選取本頁全部 50 個。{' '}
                <button type="button" className="text-primary hover:underline">
                  點此選取全部 5370 個項目
                </button>
              </>
            }
          />
          <div className="border-t border-divider">
            <BulkActionBar
              selection={Array.from({ length: 50 }, (_, i) => `f-${i}`)}
              actions={<Button variant="tertiary" size="md">下載</Button>}
              onClear={() => {}}
            />
          </div>
        </div>
        <Label>↑ Alert + BulkActionBar 兩 bar 黏一起,inline link 流暢呈現</Label>
      </Rule>

      <Rule
        title="❌ 自刻 hint banner / 用 contrast 底色 div"
        note="banner 是 Alert 的職責(自帶 a11y role / aria-live / 視覺一致性)。自刻會破壞跟其他 Alert 的視覺一致性,也漏 a11y"
      >
        <Label warn>(範例省略)有 Alert 元件不用是浪費</Label>
      </Rule>

      <Rule
        title="✅ Filter hidden 進主 bar count 區 inline,不開 hint banner"
        note="hint banner 唯一語意是「dataset 擴充入口」。filter hidden 是 minor status,inline 進 count 區即可,不該佔 banner 區域"
      >
        <BulkActionBar
          selection={['a', 'b', 'c']}
          hiddenByFilter={2}
          actions={<Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>}
          onClear={() => {}}
        />
        <Label>↑ count 文字 inline:「已選 3 項 · 2 個被 filter 隱藏」</Label>
      </Rule>
    </div>
  ),
}
