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
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
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
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="檔案瀏覽"><span className="text-primary hover:underline font-medium cursor-pointer">檔案瀏覽</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="步驟引導"><span className="text-primary hover:underline font-medium cursor-pointer">步驟引導</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="多選"><span className="text-primary hover:underline font-medium cursor-pointer">多選</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="長標籤"><span className="text-primary hover:underline font-medium cursor-pointer">長標籤</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/TreeView/展示" name="拖曳重排"><span className="text-primary hover:underline font-medium cursor-pointer">拖曳重排</span></LinkTo></li>
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
          title="❌ 互斥展開(同時只開一個):用 Accordion(未來)"
          note="TreeView 預設允許任意多個節點同時展開。若需要「選一個展開其他自動收」的互斥語意,用 Accordion(非 TreeView)"
        >
          <Label warn>(範例省略)TreeView 是多展開,Accordion 是單展開,語意不同</Label>
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
          title="❌ Sidebar 的簡單 2 層 nav:用 Sidebar 內建結構"
          note="Sidebar 的 SidebarMenuSub 已處理「主項目 + 子項目」2 層結構。只有深度 ≥ 3 層或 user data 樹才用 TreeView"
        >
          <Label warn>2 層 nav 用 Sidebar 的 Sub Menu 足夠,不需要 TreeView 的遞迴 overhead</Label>
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
          <TreeView defaultExpandedIds={['fa', 'sub']}>
            <TreeItem id="fa" label="資料夾 A" icon={Folder}>
              <TreeItem id="file-a" label="檔案 a.txt" icon={FileText} />
              <TreeItem id="sub" label="子資料夾" icon={Folder}>
                <TreeItem id="file-b" label="檔案 b.txt" icon={FileText} />
              </TreeItem>
            </TreeItem>
          </TreeView>
        </div>
        <Label>↑ 「檔案 a.txt」是葉,「子資料夾」可展開——兩者 label 依然垂直對齊</Label>
      </Rule>
    </div>
  ),
}
