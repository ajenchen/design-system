// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: UsageGuidance merges WhenToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Tag as TagIcon } from 'lucide-react'
import { Tag } from './tag'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta = {
  title: 'Design System/Components/Tag/設計原則',
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
          <p>適合 Tag 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/Tag/展示" name="頭像"><span className="text-primary hover:underline font-medium cursor-pointer">頭像</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Tag/展示" name="可移除"><span className="text-primary hover:underline font-medium cursor-pointer">可移除</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Tag/展示" name="截斷 + Tooltip"><span className="text-primary hover:underline font-medium cursor-pointer">截斷 + Tooltip</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 用 Tag 做 overlay 通知圓點"
          note="Tag 太大,放在角落會蓋住主元件;且 Tag 承載語意內容,用來單純計數太重 — 改用 Badge"
        >
          <div className="relative inline-flex">
            <button className="px-4 py-2 border rounded-md">通知</button>
            <Tag color="red" className="absolute -top-2 -right-2">3</Tag>
          </div>
          <Label warn>↑ Tag 太大,疊在 button 角落違和 → 用 Badge</Label>
        </Rule>

        <Rule
          title="❌ 用 Badge 做分類標籤"
          note="Badge 不承載語意,單純數字/dot。「Electronics」這類分類必須用 Tag 才有 variant 色 + 可讀文字"
        >
          <Badge count={0} variant="high" className="!w-auto !px-2" />
          <Label warn>↑ Badge 不設計來放文字 label 做分類 → 用 Tag</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="Tag — 分類標籤、狀態標記、多選已選值"
          note="承載語意(類別 / 狀態),通常有 variant 色彩區分。較大、可含 icon / dismiss button、適合放語意內容"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Tag color="blue">進行中</Tag>
            <Tag color="green">已完成</Tag>
            <Tag color="yellow">待審核</Tag>
            <Tag color="red">已封鎖</Tag>
          </div>
          <Label>↑ 訂單狀態 / 專案狀態 — variant 色彩加速掃視</Label>
        </Rule>

        <Rule
          title="Badge — 通知計數、狀態紅點"
          note="overlay 在元件角落,較小(16px),表達「數量」或「有新東西」——不承載語意內容"
        >
          <div className="flex items-center gap-2">
            <Badge count={3} variant="critical" />
            <Badge count={12} variant="high" />
            <Badge dot variant="critical" aria-label="有新訊息" />
          </div>
          <Label>↑ 數字計數或純 dot,通常疊在 button / avatar 右上角</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const VariantNotSemanticRule: Story = {
  name: '變體 色彩不自動承載語意',
  render: () => (
    <div>
      <Rule
        title="Variant 是「顏色」,不是「語意」"
        note="red 不一定代表「錯誤」,green 不一定代表「成功」。語意由消費端的內容和上下文決定。世界級 DS(Atlassian/Polaris)都採這個架構——避免強綁語意後 categorical color 不夠用的困境"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="red">紅色標籤</Tag>
          <Tag color="green">綠色分類</Tag>
          <Tag color="blue">藍色狀態</Tag>
          <Tag color="turquoise">青色</Tag>
          <Tag color="purple">紫色</Tag>
          <Tag color="magenta">洋紅</Tag>
          <Tag color="indigo">靛藍</Tag>
        </div>
        <Label>↑ 13 種 color variant(neutral + 12 categorical 色相,此處節選),色彩意義由 consumer 上下文決定</Label>
      </Rule>

      <Rule
        title="❌ 只靠 variant 色傳達狀態(color-blind 失效)"
        note="「這個 Tag 是紅色 → 錯誤」這種單靠顏色的語意對 color-blind 使用者失效。必須用 label 文字明確傳達"
      >
        <div className="flex items-center gap-2">
          <Tag color="red" />
          <Tag color="green" />
          <Tag color="yellow" />
        </div>
        <Label warn>↑ 沒 label 的純色 Tag → color-blind 看不出差異。必須寫文字「已封鎖 / 已完成 / 待審核」</Label>
      </Rule>
    </div>
  ),
}

export const SubtleVsSolidRule: Story = {
  name: '低調 vs 實心 選擇',
  render: () => (
    <div>
      <Rule
        title="Subtle(預設)— 淺底深字,適合一般分類 / 狀態"
        note="視覺重量較輕,不搶頁面焦點。99% 場景用 subtle"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="blue">Draft</Tag>
          <Tag color="green">Published</Tag>
          <Tag color="yellow">Under Review</Tag>
          <Tag color="neutral">Archived</Tag>
        </div>
        <Label>↑ 部落格文章狀態,subtle 不干擾文章清單主內容</Label>
      </Rule>

      <Rule
        title="Solid — 深底白字,需要視覺強調時"
        note="重點標籤、重要狀態標記。視覺重量較高,一頁內不該多個 solid(會互相搶戲)"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="red" solid>緊急</Tag>
          <Tag color="blue" solid>VIP</Tag>
          <Tag color="yellow" solid>精選</Tag>
        </div>
        <Label>↑ 需要在清單裡跳出的「緊急」/「VIP」標記</Label>
      </Rule>

      <Rule
        title="❌ 所有 Tag 都用 solid"
        note="視覺重量太高,使用者無法分辨哪個真的重要。subtle 是基礎,solid 是強調——多數應該是 subtle"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="blue" solid>電子產品</Tag>
          <Tag color="green" solid>服飾</Tag>
          <Tag color="red" solid>食品</Tag>
          <Tag color="yellow" solid>書籍</Tag>
          <Tag color="purple" solid>家具</Tag>
        </div>
        <Label warn>↑ 所有 Tag solid → 互相爭奪注意力 → 都不重要</Label>
      </Rule>
    </div>
  ),
}

export const DismissRule: Story = {
  name: '取消 按鈕行為',
  render: () => {
    const [tags, setTags] = React.useState(['React', 'TypeScript', 'Design System'])
    return (
      <div>
        <Rule
          title="用 onRemove callback,Tag 自動渲染 X button"
          note="消費者不需要自己組 remove button——傳 onRemove,Tag 內部處理尺寸、hover、a11y。多選 Combobox 的已選 tag 用這個 pattern"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {tags.map(t => (
              <Tag key={t} color="blue" onRemove={() => setTags(tags.filter(x => x !== t))}>
                {t}
              </Tag>
            ))}
          </div>
          <Label>↑ 點 X 移除該 tag,自動重渲染</Label>
        </Rule>

        <Rule
          title="Dismiss icon 繼承 Tag 文字色(有色時跟色)"
          note="不同於一般 inline action 的 fg-muted——Tag 有色變體時 dismiss 跟 Tag 文字同色,視覺一體"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Tag color="blue" onRemove={() => {}}>React</Tag>
            <Tag color="green" onRemove={() => {}}>TypeScript</Tag>
            <Tag color="red" onRemove={() => {}}>Storybook</Tag>
            <Tag color="neutral" onRemove={() => {}}>Design System</Tag>
          </div>
          <Label>↑ X icon 跟 Tag 文字同色,融入 Tag 視覺</Label>
        </Rule>

        <Rule
          title="❌ 用 prefix / suffix / 自訂 button 放 dismiss"
          note="會失去 Tag 內建的尺寸 / hover / a11y 規則。統一走 onRemove callback pattern"
        >
          <Label warn>(範例省略)consumer 自組 dismiss = 漂移風險</Label>
        </Rule>
      </div>
    )
  },
}

export const IconRule: Story = {
  name: '圖示與頭像的使用',
  render: () => (
    <div>
      <Rule
        title="icon — 類別圖示(tag label 的視覺強化)"
        note="用 LucideIcon,Tag 統一 16px。icon 顏色繼承 Tag 文字色(有色時跟色)"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="blue" icon={TagIcon}>Feature</Tag>
          <Tag color="green" icon={TagIcon}>Bug Fix</Tag>
        </div>
      </Rule>

      <Rule
        title="avatar — 人員 / 組織類 Tag 前綴"
        note="多選 Combobox 的已選成員用 avatar + name 組合"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="neutral" avatar={<img src="https://i.pravatar.cc/40?img=1" className="w-4 h-4 rounded-full" />}>
            Ada Chen
          </Tag>
          <Tag color="neutral" avatar={<img src="https://i.pravatar.cc/40?img=2" className="w-4 h-4 rounded-full" />}>
            Alice
          </Tag>
        </div>
      </Rule>

      <Rule
        title="❌ icon + avatar 同時用(互斥)"
        note="icon 和 avatar 都是 prefix slot,設計慣例上互斥(由 consumer 自律,非型別強制)。若同時傳,icon 與 avatar 會並列渲染,破壞 Tag 內部結構"
      >
        <Label warn>(範例省略)設計慣例上互斥——同時傳會並列渲染,請只擇一</Label>
      </Rule>
    </div>
  ),
}
