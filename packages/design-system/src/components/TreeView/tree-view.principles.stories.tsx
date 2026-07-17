// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse(含近親對照)into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Folder, FileText, Image, Users, User } from 'lucide-react'
import { TreeView, TreeItem } from './tree-view'

const meta: Meta = {
  title: 'Design System/Components/TreeView/設計原則',
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
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-h3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>適合 TreeView 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="檔案瀏覽"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">檔案瀏覽</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="步驟引導"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">步驟引導</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="多選"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">多選</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="長標籤"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">長標籤</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="拖曳重排"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">拖曳重排</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>

        <Rule
          title="TreeView 的 sweet spot — 階層資料 + 任意多層 + 展開收合"
          note="檔案資料夾、組織架構、專案 / 子專案 / 任務。每個 node 有 children 就可展開,沒有就是 leaf"
        >
          <div className="border border-border rounded-lg p-3 w-80">
            <TreeView defaultExpandedIds={['docs', 'photos', 'downloads']}>
              <TreeItem id="docs" label="Documents" icon={Folder}>
                <TreeItem id="resume" label="Resume.pdf" icon={FileText} />
                <TreeItem id="photos" label="Photos" icon={Folder}>
                  <TreeItem id="beach" label="beach.jpg" icon={Image} />
                  <TreeItem id="trip" label="trip.jpg" icon={Image} />
                </TreeItem>
              </TreeItem>
              <TreeItem id="downloads" label="Downloads" icon={Folder}>
                <TreeItem id="installer" label="installer.dmg" icon={FileText} />
              </TreeItem>
            </TreeView>
          </div>
        </Rule>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title='❌ 互斥展開(同時只開一個):用 Accordion type="single"'
          note='TreeView 預設允許任意多個節點同時展開。平面設定分段若需要「展開一個、其他自動收合」的互斥語意,用 Accordion type="single"(非 TreeView)'
        >
          <div className="border border-border rounded-lg p-3 w-80">
            <TreeView aria-label="帳號設定分段" selectionMode="none" defaultExpandedIds={['account', 'notify', 'privacy']}>
              <TreeItem id="account" label="帳號設定">
                <TreeItem id="account-email" label="電子郵件" />
                <TreeItem id="account-password" label="密碼" />
              </TreeItem>
              <TreeItem id="notify" label="通知偏好">
                <TreeItem id="notify-email" label="信件通知" />
                <TreeItem id="notify-push" label="推播通知" />
              </TreeItem>
              <TreeItem id="privacy" label="隱私與安全">
                <TreeItem id="privacy-2fa" label="兩步驟驗證" />
              </TreeItem>
            </TreeView>
          </div>
          <Label warn>↑ 三個設定分段在 TreeView 裡可同時展開;要「展開一個自動收其他」的互斥手風琴,用 Accordion type="single"</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="❌ 平面資料(無階層):用 DataTable / list"
          note="TreeView 為階層而設計——若資料本質是平面(使用者清單、訂單清單),用 DataTable 更自然,TreeView 的遞迴結構徒增 overhead"
        >
          <div className="border border-border rounded-lg p-3 w-80">
            <TreeView>
              <TreeItem id="alice" label="Alice" icon={User} />
              <TreeItem id="bob" label="Bob" icon={User} />
              <TreeItem id="charlie" label="Charlie" icon={User} />
              <TreeItem id="diana" label="Diana" icon={User} />
            </TreeView>
          </div>
          <Label warn>↑ 平面的使用者清單用 TreeView → TreeView 的 chevron / indent 都用不上,用 DataTable 或 list</Label>
        </Rule>

        <Rule
          title="❌ 純視覺分段(設計時可列舉的固定選單):用 SidebarGroup 不用 TreeView"
          note="Sidebar 主選單只接受 1 層可列舉項目——設計時就固定死、不會 runtime 新增的分段,用 SidebarGroup 純視覺分段即可。真階層 user data(專案 / 子專案、部門樹,即使只有 2 層、未來會長)才用 TreeView(見 sidebar.spec.md「判斷規則」)"
        >
          <Label warn>固定分段用 SidebarGroup 就夠,不需要 TreeView 的遞迴 overhead;user data 樹則一律 TreeView</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const ExpandSelectSeparationRule: Story = {
  name: '展開 與 Select 語意分離',
  render: () => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set(['resume']))
    return (
      <div>
        <Rule
          title="Chevron = 展開 / 收合;Label = 選取 / 執行"
          note="兩個獨立的互動區——點 chevron 只展開不選,點 label 只選不展開(除非 consumer 顯式 opt-in expandOnSelect)。世界級 tree 元件的共識(VS Code、macOS Finder、Linear)"
        >
          <div className="border border-border rounded-lg p-3 w-80">
            <TreeView selectedIds={selected} onSelectedChange={setSelected} defaultExpandedIds={['docs', 'photos']}>
              <TreeItem id="docs" label="Documents" icon={Folder}>
                <TreeItem id="resume" label="Resume.pdf" icon={FileText} />
                <TreeItem id="photos" label="Photos" icon={Folder}>
                  <TreeItem id="beach" label="beach.jpg" icon={Image} />
                </TreeItem>
              </TreeItem>
            </TreeView>
          </div>
          <Label>↑ 點 chevron 展開資料夾,點檔名選取該檔。兩個動作獨立</Label>
        </Rule>

        <Rule
          title="❌ 混淆 expand 和 select 語意"
          note="點 node 同時展開 + 選取,使用者會困惑:「我只想展開看看,不想選它」。分離讓使用者有更細的控制"
        >
          <Label warn>若強制合併,變成「想展開必須選」,破壞檔案瀏覽的自然 pattern(想看裡面但不選起來)</Label>
        </Rule>
      </div>
    )
  },
}

export const IndentRule: Story = {
  name: '縮排與欄位節奏',
  render: () => (
    <div>
      <Rule
        title="Indent 必須用 gap-2(8px)和 chevronSize 對齊"
        note="indentStep = chevronSize + gap-2,跟 item-layout 的 prefix-content gap 一致。讓 indent 視覺跟 item-layout 融為一體,而非獨立數字系統"
      >
        <div className="border border-border rounded-lg p-3 w-80">
          <TreeView defaultExpandedIds={['eng', 'frontend', 'backend']}>
            <TreeItem id="eng" label="Engineering" icon={Users}>
              <TreeItem id="frontend" label="Frontend" icon={Users}>
                <TreeItem id="alice" label="Alice" icon={User} />
                <TreeItem id="bob" label="Bob" icon={User} />
              </TreeItem>
              <TreeItem id="backend" label="Backend" icon={Users}>
                <TreeItem id="charlie" label="Charlie" icon={User} />
              </TreeItem>
            </TreeItem>
          </TreeView>
        </div>
        <Label>↑ 三層縮排節奏一致——每層 indent 剛好是 chevron + gap-2</Label>
      </Rule>

      <Rule
        title="Chevron placeholder 保留對齊"
        note="同層 siblings 有展開 icon、有的沒有 → label 不對齊。TreeView 自動給葉節點留 chevron 位置(透明 placeholder),consumer 不需介入"
      >
        <div className="border border-border rounded-lg p-3 w-80">
          <TreeView aria-label="行銷素材資料夾樹" defaultExpandedIds={['assets', 'social']}>
            <TreeItem id="assets" label="行銷素材" icon={Folder}>
              <TreeItem id="hero" label="活動主視覺.png" icon={Image} />
              <TreeItem id="social" label="社群貼文" icon={Folder}>
                <TreeItem id="story" label="限動範本.psd" icon={FileText} />
              </TreeItem>
            </TreeItem>
          </TreeView>
        </div>
        <Label>↑ 「活動主視覺.png」是葉,「社群貼文」可展開——兩者 label 依然垂直對齊</Label>
      </Rule>

      <Rule
        title="❌ 混用有 icon / 無 icon 的節點"
        note="Chevron 有自動佔位(leaf 也留等寬空白),但 icon 無自動佔位——同層有些節點傳 icon、有些沒傳,label 起點會直接錯開。要嘛全傳 icon,要嘛全不傳(見 spec「Icon 一致性原則」)"
      >
        <div className="border border-border rounded-lg p-3 w-80">
          <TreeView aria-label="icon 混用反例檔案樹" defaultExpandedIds={['src', 'public']}>
            <TreeItem id="src" label="src" icon={Folder}>
              <TreeItem id="app" label="App.tsx" icon={FileText} />
              <TreeItem id="readme" label="README.md" />
            </TreeItem>
            <TreeItem id="public" label="public">
              <TreeItem id="favicon" label="favicon.ico" icon={Image} />
            </TreeItem>
          </TreeView>
        </div>
        <Label warn>↑ 「README.md」「public」沒傳 icon → label 起點比有 icon 的節點前移,視覺節奏錯開</Label>
      </Rule>
    </div>
  ),
}
