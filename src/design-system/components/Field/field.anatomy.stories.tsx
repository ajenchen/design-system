import type { Meta, StoryObj } from '@storybook/react'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from './field'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { Select } from '@/design-system/components/Select/select'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Switch } from '@/design-system/components/Switch/switch'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { Slider } from '@/design-system/components/Slider/slider'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Field/設計規格',
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
        <Desc>Field 是表單欄位的佈局容器,由 4 個 slot 組成。Field 本身不擁有資料邏輯,只管 label/control/description/error 的空間關係 + 透過 context 把 mode/disabled/required/invalid/id 傳給子元件。</Desc>
        <div className="border border-border rounded-lg p-6 max-w-xl bg-muted/20">
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
        <p className="text-footnote text-fg-muted mt-3">FieldLabel(必有)+ Control(必有)+ FieldDescription(選填)+ FieldError(僅 invalid 時顯示)</p>
      </div>

      <div>
        <H3>子元件責任邊界</H3>
        <Desc>Field 只管佈局與狀態傳遞——所有與資料相關的邏輯都在子元件(Field Controls)。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>責任</Th><Th>Field</Th><Th>Field Controls (Input / NumberInput / etc.)</Th></tr></thead>
            <tbody>
              <tr><Td>Layout(label/control/description/error 排版)</Td><Td>✓ 管</Td><Td>—</Td></tr>
              <tr><Td>Context 傳遞(mode/disabled/required/invalid/id)</Td><Td>✓ 管</Td><Td>從 context 讀</Td></tr>
              <tr><Td>資料格式化(千分位/貨幣/locale)</Td><Td>—</Td><Td>✓ 管</Td></tr>
              <tr><Td>驗證邏輯</Td><Td>—</Td><Td>✓ 管(+ zod schema 於 form 層)</Td></tr>
              <tr><Td>readonly 呈現</Td><Td>—</Td><Td>✓ 管</Td></tr>
              <tr><Td>DataTable cell 顯示</Td><Td>—</Td><Td>✓ 管(Display 子元件)</Td></tr>
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
                ['orientation', "'vertical' | 'horizontal'", "'vertical'", 'label 位置:上方 / 左方'],
                ['labelWidth', 'string', "'120px'", 'horizontal 模式 label 寬度'],
                ['required', 'boolean', 'false', '顯示 * 星號 + context.required'],
                ['invalid', 'boolean', 'false', 'error 狀態 + context.invalid(觸發 aria-invalid)'],
                ['disabled', 'boolean', 'false', 'context.disabled 傳給 control'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", 'context.size 傳給 control(field-height tier)'],
                ['mode', "'edit' | 'readonly' | 'disabled'", "'edit'", 'context.mode 傳給 Field Controls'],
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

export const OrientationMatrix: Story = {
  name: 'Orientation × Control 矩陣',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Vertical(預設)— label 在控件上方</H3>
        <Desc>主要表單場景。label 與 control 之間 gap = layout-space-tight,垂直堆疊。</Desc>
        <div className="grid grid-cols-2 gap-6 max-w-4xl">
          <div className="border border-dashed border-divider rounded-md p-4">
            <FieldGroup>
              <Field required>
                <FieldLabel>姓名</FieldLabel>
                <Input placeholder="請輸入姓名" />
              </Field>
              <Field>
                <FieldLabel>年齡</FieldLabel>
                <NumberInput placeholder="0" />
              </Field>
            </FieldGroup>
          </div>
          <div className="border border-dashed border-divider rounded-md p-4">
            <FieldGroup>
              <Field>
                <FieldLabel>簡介</FieldLabel>
                <Textarea placeholder="簡單介紹自己..." rows={2} />
              </Field>
              <Field>
                <FieldLabel>音量</FieldLabel>
                <Slider defaultValue={[60]} />
              </Field>
            </FieldGroup>
          </div>
        </div>
      </div>

      <div>
        <H3>Horizontal — label 在控件左方</H3>
        <Desc>Settings / 詳情頁場景。label 固定寬度(labelWidth,預設 120px)對齊縱向軸,節省垂直空間。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-2xl">
          <FieldGroup>
            <Field orientation="horizontal" required>
              <FieldLabel>電子郵件</FieldLabel>
              <Input type="email" defaultValue="user@example.com" />
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
            <Field orientation="horizontal">
              <FieldLabel>訂閱電子報</FieldLabel>
              <Switch defaultChecked />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel>個人檔案公開</FieldLabel>
              <Checkbox label="允許搜尋引擎索引" />
            </Field>
          </FieldGroup>
        </div>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: 'Size × Control 矩陣',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種 Size — 對齊 field-height 系統</H3>
        <Desc>Field 的 size 透過 context 傳遞給所有 Field Controls(Input / NumberInput / Select / Slider / Switch / Checkbox),讓一個 Field 內所有 control 自動對齊高度。對齊 `--field-height-*` tier(見 uiSize.spec.md)。</Desc>
        <div className="grid grid-cols-3 gap-6">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size} className="border border-dashed border-divider rounded-md p-4">
              <div className="text-caption text-fg-muted mb-3 font-mono">size="{size}"</div>
              <FieldGroup>
                <Field size={size}>
                  <FieldLabel>姓名</FieldLabel>
                  <Input placeholder="請輸入姓名" />
                </Field>
                <Field size={size}>
                  <FieldLabel>數量</FieldLabel>
                  <NumberInput placeholder="0" />
                </Field>
                <Field size={size}>
                  <FieldLabel>時區</FieldLabel>
                  <Select
                    options={[{ value: 'tw', label: '台北' }]}
                    value="tw"
                    onChange={() => {}}
                  />
                </Field>
              </FieldGroup>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為(required / invalid / disabled / readonly)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Required — label 後加 * 星號</H3>
        <Desc>Field required 傳 context,FieldLabel 自動加星號並設 aria-required。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <Field required>
            <FieldLabel>姓名</FieldLabel>
            <Input placeholder="請輸入姓名" />
            <FieldDescription>本欄位為必填</FieldDescription>
          </Field>
        </div>
      </div>

      <div>
        <H3>Invalid — 觸發 error 視覺 + FieldError 顯示</H3>
        <Desc>Field invalid 傳 context(觸發 aria-invalid + error border),FieldError 取代 FieldDescription 顯示。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <Field invalid>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" defaultValue="invalid-email@" />
            <FieldError>請輸入有效的電子郵件地址</FieldError>
          </Field>
        </div>
      </div>

      <div>
        <H3>Disabled — 整個 Field 停用</H3>
        <Desc>Field disabled 傳 context.disabled,control 自動灰化 + cursor-not-allowed。label / description 也降色。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <Field disabled>
            <FieldLabel>方案升級</FieldLabel>
            <Input defaultValue="Pro 方案" />
            <FieldDescription>目前方案不可手動修改</FieldDescription>
          </Field>
        </div>
      </div>

      <div>
        <H3>Mode = readonly — 表單 readonly 呈現</H3>
        <Desc>Field mode='readonly' 傳 context 給 Field Controls,Input 切換為 readonly 視覺(neutral-2 底色 + 無邊框)同高度。</Desc>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-md">
          <Field mode="readonly">
            <FieldLabel>註冊時間</FieldLabel>
            <Input defaultValue="2026-04-18 10:35" />
          </Field>
        </div>
      </div>

      <div>
        <H3>組合:Required + Horizontal + Size=md(settings 典型場景)</H3>
        <div className="border border-dashed border-divider rounded-md p-4 max-w-2xl">
          <FieldGroup>
            <Field orientation="horizontal" required size="md">
              <FieldLabel>姓名</FieldLabel>
              <Input defaultValue="陳麒仁" />
            </Field>
            <Field orientation="horizontal" size="md">
              <FieldLabel>電子郵件</FieldLabel>
              <Input type="email" defaultValue="user@example.com" />
            </Field>
            <Field orientation="horizontal" size="md" invalid>
              <FieldLabel>公司網址</FieldLabel>
              <Input defaultValue="not-a-url" />
              <FieldError>請輸入完整網址(包含 https://)</FieldError>
            </Field>
          </FieldGroup>
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照(label / required / invalid / disabled)',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Field 元素色彩 Token</H3>
        <Desc>
          Field 本身不擁有 control 邊框色(那由 Field Controls 管),但擁有 label / description /
          error / required-star 的色彩。這裡列出 Field 容器的所有色彩 token。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>元素</Th>
                <Th>Default 色</Th>
                <Th>Invalid 色</Th>
                <Th>Disabled 色</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>FieldLabel</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td><TokenCell token="--foreground" display="foreground(不變)" /></Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
              </tr>
              <tr>
                <Td mono>Required 星號(*)</Td>
                <Td><TokenCell token="--error" display="error" /></Td>
                <Td><TokenCell token="--error" display="error" /></Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
              </tr>
              <tr>
                <Td mono>FieldDescription</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td>—(隱藏,被 FieldError 取代)</Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
              </tr>
              <tr>
                <Td mono>FieldError</Td>
                <Td>—(不渲染)</Td>
                <Td><TokenCell token="--error" display="error" /></Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td mono>Control border(傳給 Field Controls)</Td>
                <Td><TokenCell token="--border" display="border" /></Td>
                <Td><TokenCell token="--error" display="error(border)" /></Td>
                <Td><TokenCell token="--border" display="border" /></Td>
              </tr>
              <tr>
                <Td mono>Control bg(disabled)</Td>
                <Td><TokenCell token="--surface" display="surface" /></Td>
                <Td>—</Td>
                <Td><TokenCell token="--bg-disabled" display="bg-disabled" /></Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Field 本身不畫這些色——只透過 `context`(mode / invalid / disabled / required / size)把
          state 傳給子元件,由 FieldLabel / FieldDescription / FieldError 和 Field Controls(Input /
          NumberInput / etc.)各自渲染對應視覺。詳見 `field-controls.spec.md`。
        </p>
      </div>

      <div>
        <H3>色彩實際並排對照</H3>
        <div className="grid grid-cols-2 gap-6 max-w-4xl">
          <div>
            <div className="text-caption text-fg-muted mb-2 font-mono">default</div>
            <Field>
              <FieldLabel>電子郵件</FieldLabel>
              <Input type="email" placeholder="name@example.com" />
              <FieldDescription>我們不會公開您的電子郵件</FieldDescription>
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2 font-mono">required</div>
            <Field required>
              <FieldLabel>姓名</FieldLabel>
              <Input placeholder="請輸入姓名" />
              <FieldDescription>本欄位為必填(label 後有紅星 *)</FieldDescription>
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2 font-mono">invalid</div>
            <Field invalid>
              <FieldLabel>Email</FieldLabel>
              <Input type="email" defaultValue="invalid@" />
              <FieldError>請輸入有效的電子郵件地址</FieldError>
            </Field>
          </div>
          <div>
            <div className="text-caption text-fg-muted mb-2 font-mono">disabled</div>
            <Field disabled>
              <FieldLabel>方案</FieldLabel>
              <Input defaultValue="Pro 方案" />
              <FieldDescription>目前方案不可手動修改</FieldDescription>
            </Field>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const FieldGroupBehavior: Story = {
  name: 'FieldGroup — 多 Field 堆疊',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>FieldGroup — 管理多 Field 垂直間距</H3>
        <Desc>FieldGroup 提供 density-aware 的垂直 gap(跟隨 `--layout-space-tight` token),不需 consumer 手算間距。</Desc>
        <div className="grid grid-cols-2 gap-6 max-w-4xl">
          <div className="border border-dashed border-divider rounded-md p-4">
            <div className="text-caption text-fg-muted mb-3 font-mono">vertical orientation</div>
            <FieldGroup>
              <Field required>
                <FieldLabel>姓名</FieldLabel>
                <Input placeholder="請輸入姓名" />
              </Field>
              <Field required>
                <FieldLabel>電子郵件</FieldLabel>
                <Input type="email" placeholder="name@example.com" />
              </Field>
              <Field>
                <FieldLabel>公司</FieldLabel>
                <Input placeholder="選填" />
              </Field>
            </FieldGroup>
          </div>
          <div className="border border-dashed border-divider rounded-md p-4">
            <div className="text-caption text-fg-muted mb-3 font-mono">horizontal orientation</div>
            <FieldGroup>
              <Field orientation="horizontal" required>
                <FieldLabel>姓名</FieldLabel>
                <Input placeholder="請輸入姓名" />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>電子郵件</FieldLabel>
                <Input type="email" placeholder="name@example.com" />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>時區</FieldLabel>
                <Select
                  options={[{ value: 'tw', label: '台北 (UTC+8)' }]}
                  value="tw"
                  onChange={() => {}}
                />
              </Field>
            </FieldGroup>
          </div>
        </div>
      </div>
    </div>
  ),
}
