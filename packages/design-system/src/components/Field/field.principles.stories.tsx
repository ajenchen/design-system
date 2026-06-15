// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: UsageGuidance merges WhenToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Upload } from 'lucide-react'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from './field'
import { Input } from '@/design-system/components/Input/input'
import { Select } from '@/design-system/components/Select/select'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Field/設計原則',
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
    <div className="flex flex-col gap-3 max-w-xl">{children}</div>
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
          <p>適合 Field 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/Field/展示" name="垂直"><span className="text-primary hover:underline font-medium cursor-pointer">註冊 / 建立專案表單 — 引導式逐欄輸入(垂直佈局)</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Field/展示" name="水平"><span className="text-primary hover:underline font-medium cursor-pointer">帳號設定 / 偏好設定頁 — 修改已知屬性(水平佈局)</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Field/展示" name="混合控制元件的高度對齊"><span className="text-primary hover:underline font-medium cursor-pointer">同一表單混用 Input / Select / DatePicker 等控制元件</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Field/展示" name="SegmentedControl 作為 Field 控制元件"><span className="text-primary hover:underline font-medium cursor-pointer">少量互斥選項(計費週期、版面密度)用 SegmentedControl 當控制元件</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ Field 試圖承載資料型別邏輯"
          note="別把「格式化數字」「處理日期」「搜尋選項」塞進 Field——這些是 Field Controls(NumberInput / DatePicker / Combobox)的責任。Field 不 wrap、不代理、不轉換它們的行為"
        >
          <Label warn>Field 試圖自己處理 number formatting → 複製 NumberInput 邏輯 → 違反 SRP + 漂移風險</Label>
        </Rule>

        <Rule
          title="❌ 把 form submit button 包在 Field 內"
          note="破壞「Field = 資料容器」的心智模型。使用者掃 form 時看到每個 Field,submit 按鈕不該混入這個節奏"
        >
          <div className="max-w-sm">
            <FieldGroup>
              <Field required>
                <FieldLabel>Email</FieldLabel>
                <Input />
              </Field>
              <Field>
                <FieldLabel>操作</FieldLabel>
                <Button variant="primary">送出表單</Button>
              </Field>
            </FieldGroup>
          </div>
          <Label warn>↑ 「送出表單」不該是一個 Field,它是 form-level action,應該在 footer</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="Field — 表單輸入(可編輯)"
          note="使用者要輸入 / 修改 / 提交的 form 場景。含 required、error、focus、驗證等 form state 機制"
        >
          <div className="max-w-sm">
            <FieldGroup>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input defaultValue="user@example.com" />
              </Field>
              <Field>
                <FieldLabel>時區</FieldLabel>
                <Select
                  options={[{ value: 'tw', label: '台北 (UTC+8)' }]}
                  value="tw"
                  onChange={() => {}}
                />
              </Field>
            </FieldGroup>
          </div>
          <Label>↑ 可編輯的 profile settings</Label>
        </Rule>

        <Rule
          title="❌ 唯讀展示:用 DescriptionList"
          note="「查看使用者資料」「訂單明細」這類純展示場景不該用 Field + readonly mode——DescriptionList 的 `dl / dt / dd` HTML 語義更適合唯讀屬性列表,a11y 也更清楚"
        >
          <div className="max-w-sm">
            {/* horizontalLabelWidth:同表單 horizontal Field 必統一 label 寬(field.spec.md「FieldGroup horizontalLabelWidth cascade」)*/}
            <FieldGroup horizontalLabelWidth="120px">
              <Field orientation="horizontal">
                <FieldLabel>Email</FieldLabel>
                <Input mode="readonly" defaultValue="user@example.com" />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>建立時間</FieldLabel>
                <Input mode="readonly" defaultValue="2026-04-18" />
              </Field>
            </FieldGroup>
          </div>
          <Label warn>↑ 純展示用 Field + readonly → 浪費 Field 的 input 邏輯。改用 DescriptionList</Label>
        </Rule>

        <Rule
          title="判斷法:「使用者會編輯這些值嗎?」"
          note="會 → Field(含 readonly mode);永遠不會(純展示/唯讀資料)→ DescriptionList。完整對照見 field.spec.md「何時不用」+ description-list.spec.md「vs Field 系統」"
        >
          <Label>會編輯 → Field;只看 → DescriptionList</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const ResponsibilityRule: Story = {
  name: 'Field 只負責佈局,不管資料',
  render: () => (
    <div>
      <Rule
        title="Field 的職責 — Layout + Context,不擁有資料邏輯"
        note="Field 只負責:label / control / description / error 的空間關係 + 把 mode / disabled / required / invalid / id 透過 context 傳給子元件。與資料相關的一切(格式化、驗證、readonly 呈現、DataTable cell 顯示)住在 Field Control 元件本身"
      >
        <div className="max-w-sm">
          <FieldGroup>
            <Field required>
              <FieldLabel>電子郵件</FieldLabel>
              <Input type="email" placeholder="name@example.com" />
              <FieldDescription>我們不會公開您的電子郵件</FieldDescription>
            </Field>
            <Field invalid>
              <FieldLabel>密碼</FieldLabel>
              <Input type="password" />
              <FieldError>密碼必須至少 8 個字元</FieldError>
            </Field>
          </FieldGroup>
        </div>
        <Label>↑ Field 管 layout + required 星號 + error 顯示,Input 管 type=email / 驗證邏輯</Label>
      </Rule>
    </div>
  ),
}

export const OrientationRule: Story = {
  name: '方向 選擇',
  render: () => (
    <div>
      <Rule
        title="Vertical(預設)— 主要表單場景,label 在控件上方"
        note="建立 / 編輯表單、登入 / 註冊、精靈流程。每個 field 佔完整寬度,自然垂直堆疊"
      >
        <div className="max-w-sm">
          <FieldGroup>
            <Field required>
              <FieldLabel>姓名</FieldLabel>
              <Input placeholder="請輸入姓名" />
            </Field>
            <Field>
              <FieldLabel>公司</FieldLabel>
              <Input placeholder="選填" />
            </Field>
          </FieldGroup>
        </div>
        <Label>↑ Vertical 適合大多數表單場景</Label>
      </Rule>

      <Rule
        title="Horizontal — Settings / 詳情頁,label 在控件左側"
        note="已知屬性的修改介面(account settings、使用者偏好)。label + control 並排節省垂直空間,讓多個設定一目了然。label 固定寬度對齊縱向軸"
      >
        <div className="max-w-xl">
          {/* horizontalLabelWidth:同表單 label 等寬 → 控件起點對齊(2026-06-10 user 抓本 story 違反自家 canonical)*/}
          <FieldGroup horizontalLabelWidth="120px">
            <Field orientation="horizontal" required>
              <FieldLabel>電子郵件</FieldLabel>
              <Input type="email" defaultValue="user@example.com" />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel>顯示名稱</FieldLabel>
              <Input defaultValue="Ada Chen" />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel>時區</FieldLabel>
              <Select
                options={[
                  { value: 'tw', label: '台北 (UTC+8)' },
                  { value: 'jp', label: '東京 (UTC+9)' },
                ]}
                value="tw"
                onChange={() => {}}
              />
            </Field>
          </FieldGroup>
        </div>
        <Label>↑ Horizontal 適合 settings 頁 — label 縱向對齊、controls 並排</Label>
      </Rule>

      <Rule
        title="判斷法:「欄位數量 + 垂直空間預算」"
        note="表單 / 初次建立(空間充裕、引導性)→ vertical;settings / 修改(已知屬性、密集顯示)→ horizontal"
      >
        <Label>世界級 DS(Polaris / Material)的 settings 頁都用 horizontal,表單用 vertical</Label>
      </Rule>
    </div>
  ),
}

export const NotForFormActionsRule: Story = {
  name: '表單動作 不是 Field 控制元件',
  render: () => (
    <div>
      <Rule
        title="Field 是資料輸入容器——不放 form submit / cancel"
        note="「儲存」「取消」「頁面導覽」這類 form-level action 應該在 form 底部的 footer / action bar,不是包在 Field 內"
      >
        <div className="max-w-sm">
          <FieldGroup>
            <Field required>
              <FieldLabel>專案名稱</FieldLabel>
              <Input />
            </Field>
            <Field>
              <FieldLabel>描述</FieldLabel>
              <Input />
            </Field>
          </FieldGroup>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="tertiary">取消</Button>
            <Button variant="primary">儲存</Button>
          </div>
        </div>
        <Label>↑ 儲存 / 取消在 form footer,不在 Field 內</Label>
      </Rule>

      <Rule
        title="✅ 合法情況 — 產生 value 的 Button"
        note="「上傳檔案」「選擇日期」「連接 OAuth」這類產生 field value 的動作 Button 可以當 control。判準:動作會產生這個 field 的 value → 合法;動作是 form 級別(submit / cancel / navigation)→ 不合法"
      >
        <div className="max-w-sm">
          <Field>
            <FieldLabel>頭像</FieldLabel>
            <Button variant="tertiary" startIcon={Upload}>上傳圖片</Button>
            <FieldDescription>支援 JPG / PNG,最大 2 MB</FieldDescription>
          </Field>
        </div>
        <Label>↑ 上傳按鈕產生 avatar url value → 合法作為 Field control</Label>
      </Rule>
    </div>
  ),
}
