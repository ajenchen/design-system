// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: inspector 規格表格(token / prop 對照)用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   ColorMatrix N/A — 純 typography 元件,色彩固定為 fg-secondary(label)+
//     foreground(value),無 variant × state 色彩矩陣。色彩 token 已於
//     Overview「Typography(閱讀模式)」段列出。
//   SizeMatrix N/A — 不提供 size prop;大小固定 text-body(14px reading mode),
//     由 layout(cols / direction / divided)而非 size 決定差異。ColsMatrix 已
//     涵蓋 layout 變化。
import type { Meta, StoryObj } from '@storybook/react'
import { DescriptionList, DescriptionItem } from './description-list'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/DescriptionList/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>DescriptionList 是 `dl / dt / dd` HTML 語義元件——每個 DescriptionItem 是一組 label(dt)+ value(dd)配對。對齊 Atlassian / Polaris 慣例。CSS grid 容器,`cols` prop 控制欄數。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <DescriptionList>
            <DescriptionItem label="Email">user@example.com</DescriptionItem>
            <DescriptionItem label="團隊">Engineering</DescriptionItem>
            <DescriptionItem label="時區">UTC+8(台北)</DescriptionItem>
            <DescriptionItem label="建立時間">2026-04-18</DescriptionItem>
          </DescriptionList>
        </div>
      </div>

      <div>
        <H3>Typography(閱讀模式)</H3>
        <Desc>層級靠色彩區分,不靠字體大小。兩者都是 14px,行高 1.5(閱讀模式)。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Part</Th><Th>HTML</Th><Th>Typography</Th></tr></thead>
            <tbody>
              <tr><Td mono>label</Td><Td mono>&lt;dt&gt;</Td><Td mono>text-body(14px)+ text-fg-secondary(neutral-8)</Td></tr>
              <tr><Td mono>value</Td><Td mono>&lt;dd&gt;</Td><Td mono>text-body(14px)+ text-foreground(neutral-9)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>間距</H3>
        <Desc>items 之間垂直間距走 `--layout-space-tight` token(density-aware)——切 density 自動適配,避免硬寫 px / py-N 脫鉤 token;label → value(同 item 內)走 `--item-gap-label-desc-reading`(2px,見下表 row 1)。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Direction</Th><Th>位置</Th><Th>Value</Th><Th>Rationale</Th></tr></thead>
            <tbody>
              <tr><Td mono>vertical</Td><Td>label → value(同 item 內)</Td><Td mono>--item-gap-label-desc-reading(2px)</Td><Td>極小間距,視覺上 label 與 value 緊密配對(dt body + dd body → reading token)</Td></tr>
              <tr><Td mono>vertical</Td><Td>items 之間垂直 gap</Td><Td mono>gap-y-[var(--layout-space-tight)]</Td><Td>density-aware;Gestalt proximity 群組</Td></tr>
              <tr><Td mono>vertical</Td><Td>columns 之間水平 gap</Td><Td mono>gap-x-4(16px)</Td><Td>cols &gt; 1 時欄間距</Td></tr>
              <tr><Td mono>horizontal(divided=false)</Td><Td>items 之間垂直 gap</Td><Td mono>mb-[var(--layout-space-tight)] last:mb-0</Td><Td>等同 vertical 的 items gap,density-aware</Td></tr>
              <tr><Td mono>horizontal(divided=false)</Td><Td>label ↔ value</Td><Td mono>justify-between + gap-4</Td><Td>最小 16px,content 之間自然拉開</Td></tr>
              <tr><Td mono>horizontal(divided=true)</Td><Td>每 item 上下 padding</Td><Td mono>py-[var(--layout-space-tight)]</Td><Td>density-aware,形成 cell-like row 高度;row 間有 border-b border-divider 對齊格線</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切 props 即時 render,取代 Figma inspect。調整 `cols` / `direction` / `divided` 看 CSS grid 配置變化。' } },
  },
  args: {
    cols: 2,
    direction: 'vertical',
    divided: false,
  },
  argTypes: {
    cols: { control: 'radio', options: [1, 2, 3] },
    direction: { control: 'radio', options: ['vertical', 'horizontal'] },
    divided: { control: 'boolean', description: 'horizontal 模式下,每個 item 下加 border-b 對齊 rows(長列表建議開)' },
  },
  render: (args) => (
    <div className="border border-border rounded-lg p-4 max-w-lg">
      <DescriptionList {...args}>
        <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
        <DescriptionItem label="團隊">Engineering</DescriptionItem>
        <DescriptionItem label="職稱">Design Engineer</DescriptionItem>
        <DescriptionItem label="時區">UTC+8(台北)</DescriptionItem>
        <DescriptionItem label="建立時間">2026-04-18</DescriptionItem>
        <DescriptionItem label="最後登入">2026-04-21 09:12</DescriptionItem>
      </DescriptionList>
    </div>
  ),
}

export const ColsMatrix: Story = {
  name: '欄數（1 / 2 / 3）',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>cols=1(預設,窄容器)</H3>
        <Desc>垂直堆疊,適合 ProfileCard、sidebar detail 等窄容器。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-xs">
          <DescriptionList cols={1}>
            <DescriptionItem label="Email">user@example.com</DescriptionItem>
            <DescriptionItem label="團隊">Engineering</DescriptionItem>
            <DescriptionItem label="時區">UTC+8(台北)</DescriptionItem>
          </DescriptionList>
        </div>
      </div>

      <div>
        <H3>cols=2(中等寬度)</H3>
        <Desc>兩欄並排,適合 ProfileCard info fields / detail panel。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-lg">
          <DescriptionList cols={2}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="職稱">Design Engineer</DescriptionItem>
            <DescriptionItem label="Email">user@example.com</DescriptionItem>
            <DescriptionItem label="電話">0912-345-678</DescriptionItem>
            <DescriptionItem label="團隊">Engineering</DescriptionItem>
            <DescriptionItem label="時區">UTC+8</DescriptionItem>
          </DescriptionList>
        </div>
      </div>

      <div>
        <H3>cols=3(寬容器)</H3>
        <Desc>三欄,適合寬 detail panel 顯示大量屬性。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-3xl">
          <DescriptionList cols={3}>
            <DescriptionItem label="訂單編號">#20260418-001</DescriptionItem>
            <DescriptionItem label="狀態">已出貨</DescriptionItem>
            <DescriptionItem label="建立時間">2026-04-18 10:35</DescriptionItem>
            <DescriptionItem label="付款方式">信用卡</DescriptionItem>
            <DescriptionItem label="配送方式">宅配</DescriptionItem>
            <DescriptionItem label="預計送達">2026-04-20</DescriptionItem>
            <DescriptionItem label="商品">Q1 行銷套組</DescriptionItem>
            <DescriptionItem label="數量">3</DescriptionItem>
            <DescriptionItem label="總金額">NT$ 2,490</DescriptionItem>
          </DescriptionList>
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>空值呈現 — 一律用 `—` 字元(em dash)</H3>
        <Desc>
          DescriptionList 是唯讀資訊展示,空值不留空白(會讓使用者以為資料沒載入完)。一律用 em dash
          (`—`)明確表達「有查過,但這個欄位目前沒值」。對齊 Atlassian / Polaris / GitHub 的資訊卡慣例。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <DescriptionList cols={2}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="職稱"><span className="text-fg-muted">—</span></DescriptionItem>
            <DescriptionItem label="Email">user@example.com</DescriptionItem>
            <DescriptionItem label="電話"><span className="text-fg-muted">—</span></DescriptionItem>
            <DescriptionItem label="團隊">Engineering</DescriptionItem>
            <DescriptionItem label="直屬主管"><span className="text-fg-muted">—</span></DescriptionItem>
          </DescriptionList>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          空值不應該用「N/A」/「暫無」等字串——不同 consumer 會選不同字,破壞視覺一致。一律 em dash。
        </p>
      </div>

      <div>
        <H3>長 value — 自然換行,撐高該 grid cell</H3>
        <Desc>
          `value` 是自然流文字,超過欄寬自然換行(CSS grid 會讓該 row 的 cell 變高,其他 cell 保持 label
          top-aligned)。不使用 truncate——value 是被讀的內容,截斷會讓使用者漏資訊。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <DescriptionList cols={2}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="職稱">Senior Staff Principal Engineer, Design Systems</DescriptionItem>
            <DescriptionItem label="辦公地點">Taipei, Taiwan</DescriptionItem>
            <DescriptionItem label="Email">very.long.email.address@subdomain.example.com</DescriptionItem>
          </DescriptionList>
        </div>
      </div>

      <div>
        <H3>多行 value(地址 / 介紹 / 摘要)</H3>
        <Desc>
          Value 接受任何 ReactNode,包括多行文字。`dd` 保持 top-aligned,label 垂直靠上。
          適合展示地址、人物介紹、商品描述等需多行的資訊。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="公司地址">
              台北市信義區忠孝東路五段 68 號 18 樓<br />
              Taipei 110, Taiwan<br />
              電話:02-2345-6789
            </DescriptionItem>
            <DescriptionItem label="產品介紹">
              本產品採用最新 AMOLED 螢幕,支援 120Hz 高刷新率。
              支援 IP68 防水防塵。續航力一整天,最快 45W 充電。
            </DescriptionItem>
          </DescriptionList>
        </div>
      </div>

      <div>
        <H3>結合 ReactNode value(Tag / Badge / Link)</H3>
        <Desc>
          `value` 可放任何 ReactNode——Tag(狀態)、Badge(計數)、Link(相關文件)。型別是寬鬆的
          `ReactNode`,支援組合。
        </Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="訂單狀態">
              <span className="inline-flex items-center gap-1 text-success">
                <span className="w-2 h-2 rounded-full bg-success" />
                已出貨
              </span>
            </DescriptionItem>
            <DescriptionItem label="物流追蹤">
              <a href="#" className="text-primary hover:text-primary-hover underline">
                FedEx #1234567890
              </a>
            </DescriptionItem>
          </DescriptionList>
        </div>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `description-list.spec.md`「無障礙」段。摘要:\n\n- 語意 HTML:外層 <dl>,每組 <dt>(term)+ <dd>(description)— screen reader 讀「term X, description Y」配對敘事\n- DT/DD 配對:DescriptionItem 強制一組配對,不分開暴露 <dt>/<dd> primitive\n- 空值:consumer 傳 — 占位(SR 讀出長破折號,比空 <dd> 明確)\n- 多欄 cols>1:視覺 grid、DOM 仍 item 順序,SR 依 DOM 敘事\n- 無互動:純唯讀呈現,無 keyboard / focus state(無 ARIA 補強需求,語意由原生 dl/dt/dd 承載)"}</p>
    </div>
  ),
}
