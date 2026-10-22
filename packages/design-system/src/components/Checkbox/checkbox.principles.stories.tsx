import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './checkbox'
import { CheckboxGroup } from './checkbox-group'
import { Switch } from '@/design-system/components/Switch/switch'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { Field, FieldGroup, FieldLabel } from '@/design-system/components/Field/field'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Checkbox/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// ── Stories ───────────────────────────────────────────────────────────────────

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件(合併 WhenToUse + VsSwitchRule + CheckboxVsRadioRule) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [agree, setAgree] = React.useState(false)
    const [notif, setNotif] = React.useState<'checked' | 'unchecked'>('unchecked')
    const [bluetooth, setBluetooth] = React.useState(true)
    const [wifi, setWifi] = React.useState(true)
    const [selected, setSelected] = React.useState('credit')
    const [perms, setPerms] = React.useState({ read: true, write: false, admin: false })
    return (
      <TutorialPage>
        <UsageSection kind="when">
          <p>獨立的是 / 否勾選,或同一類選項可以複選;每個 Checkbox 的值互不影響(對比 RadioGroup 的互斥)。送出前都可以反悔,點了就切換,不需要再確認(WAI-ARIA <code>role=checkbox</code> / Polaris Choice 同樣定位)。</p>
          <TutorialList>
            <li><StoryLink kind="Design System/Components/Checkbox/展示" name="直式群組">商品類別的複選清單(直式群組)</StoryLink></li>
            <li><StoryLink kind="Design System/Components/Checkbox/展示" name="水平排列">篩選列的少量選項複選(水平排列)</StoryLink></li>
          </TutorialList>
        </UsageSection>

        <UsageSection kind="whenNot">
          <TutorialRule
            title="❌ 用 Checkbox 做即時系統設定"
            note="按下 Checkbox 在使用者心智裡還是「尚未確定」——但 Bluetooth 已經開了。視覺語言和實際行為脫節，使用者會困惑「我需要再按個儲存嗎？」"
          >
            <Checkbox label="Bluetooth" />
            <ExampleCaption warn>↑ 即時套用用 Checkbox → 缺少「按下即生效」的視覺指示</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="❌ 多選一用 Checkbox"
            note="使用者可以同時勾 3 個 → 邏輯錯誤，破壞互斥語意"
          >
            <CheckboxGroup>
              <Checkbox label="信用卡" />
              <Checkbox label="銀行轉帳" />
              <Checkbox label="貨到付款" />
            </CheckboxGroup>
            <ExampleCaption warn>↑ 付款方式只能一個，卻用 Checkbox 允許多選 → 用 RadioGroup</ExampleCaption>
          </TutorialRule>
          <TutorialList>
            <li>單選但選項 6 個以上、或空間不夠 → Select:全部攤開會佔滿頁面</li>
            <li>多選但選項 6 個以上、或空間不夠 → Combobox:一整排 Checkbox 佔滿頁面</li>
            <li>有階層的選項(部門 / 資料夾)→ TreeView:Checkbox 是平面選項</li>
            <li>純介面切換(收合側欄)→ 可切換的按鈕(Button 的 pressed):那是介面狀態,不是表單的值</li>
          </TutorialList>
        </UsageSection>

        <UsageSection kind="siblings">
          <TutorialRule
            title="vs Switch — Checkbox 是表單內、隨 submit 才生效、可反悔"
            note="勾選不代表立刻生效——使用者按「儲存」前都可以反悔。心智模型是「選擇 / 同意」，視覺語言強調「尚未確定」"
          >
            <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
              <CheckboxGroup>
                <Checkbox
                  label="我同意服務條款與隱私政策"
                  checked={agree}
                  onCheckedChange={(v) => setAgree(v === true)}
                />
                <Checkbox
                  label="訂閱行銷訊息"
                  description="每月最多 2 封，可隨時取消"
                  checked={notif === 'checked'}
                  onCheckedChange={(v) => setNotif(v ? 'checked' : 'unchecked')}
                />
              </CheckboxGroup>
              <ButtonGroup className="mt-[var(--layout-space-bottom)]">
                <Button variant="primary">儲存</Button>
                <Button variant="tertiary">取消</Button>
              </ButtonGroup>
            </div>
            <ExampleCaption>↑ 同意條款、訂閱選擇——form 內、有 submit / cancel button</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="Switch — 獨立 inline、切換即生效、無 submit 流程"
            note="使用者按下那刻 Bluetooth / Wi-Fi / 通知 就已經開 / 關。心智模型是物理開關（真實世界的 light switch），視覺語言強調「現在就是這樣」"
          >
            {/* 純 settings list:horizontal Field + FieldGroup horizontalLabelWidth,toggle 自動齊右、label 統一寬度
                (switch.spec.md「Horizontal Field 自動齊右」+「同一畫面多個 horizontal Switch Field → 必搭配 FieldGroup horizontalLabelWidth」)。
                不放 FieldDescription:horizontal Field 的說明落在控件欄,開關齊右後說明會懸在列中間 */}
            <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
              <FieldGroup horizontalLabelWidth="120px">
                <Field orientation="horizontal">
                  <FieldLabel>Bluetooth</FieldLabel>
                  <Switch checked={bluetooth} onCheckedChange={setBluetooth} />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel>Wi-Fi</FieldLabel>
                  <Switch checked={wifi} onCheckedChange={setWifi} />
                </Field>
              </FieldGroup>
            </div>
            <ExampleCaption>↑ 系統設定類——獨立 inline control、旁邊沒有 submit 流程</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="❌ 用 Switch 做 form 同意"
            note="「我同意條款」是「勾選 → 送出 → 法律成立」的書面行為。Switch 的物理開關隱喻暗示「我打開了接受條款這個功能」——心智錯位且違反約定俗成"
          >
            <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
              <Switch label="我同意服務條款" />
              <div className="mt-[var(--layout-space-bottom)]">
                <Button variant="primary">送出</Button>
              </div>
            </div>
            <ExampleCaption warn>↑ 同意條款用 Switch → 心智模型錯誤 + 與產業共識背離（全球沒有 form 用 Switch 同意條款）</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="vs Radio — Checkbox 是獨立 toggle(多選 或 單一 agreement)"
            note="每個 Checkbox 是獨立 boolean——可同時勾多個。也用於單一「我同意 X」agreement"
          >
            <CheckboxGroup>
              <Checkbox
                label="讀取權限"
                description="可查看資料"
                checked={perms.read}
                onCheckedChange={(v) => setPerms({ ...perms, read: v === true })}
              />
              <Checkbox
                label="寫入權限"
                description="可新增 / 修改資料"
                checked={perms.write}
                onCheckedChange={(v) => setPerms({ ...perms, write: v === true })}
              />
              <Checkbox
                label="管理權限"
                description="可管理成員與設定"
                checked={perms.admin}
                onCheckedChange={(v) => setPerms({ ...perms, admin: v === true })}
              />
            </CheckboxGroup>
            <ExampleCaption>↑ 權限可以任意組合——多選用 Checkbox</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="Radio — 互斥單選（必須在 RadioGroup 內）"
            note="N 個選項中只能選一個，其他自動變 unchecked。通常可預選常用項；需要使用者主動表態（如付款方式）時可從未選開始（value=null 是合法的初始狀態），配 required 驗證兜底"
          >
            <RadioGroup value={selected} onValueChange={setSelected}>
              <RadioGroupItem value="credit" label="信用卡" description="手續費 2.5%，即時" />
              <RadioGroupItem value="bank" label="銀行轉帳" description="無手續費，1-2 工作日" />
              <RadioGroupItem value="cash" label="貨到付款" description="手續費 NT$30，到貨時付" />
            </RadioGroup>
            <ExampleCaption>↑ 付款方式互斥——選一個自動取消其他</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="判斷法 — 這個值旁邊有 submit / cancel button 嗎?"
            note="有 → Checkbox;沒有、是獨立 inline control → Switch。Radio 必須在 RadioGroup 內,且至少兩個選項;單一「我同意條款」用 Checkbox。"
          >
            <ExampleCaption>簡單記:旁邊有「儲存 / 取消」按鈕、要送出表單才生效 → Checkbox;切下去就立刻生效(像實體開關)→ Switch。</ExampleCaption>
          </TutorialRule>
        </UsageSection>
      </TutorialPage>
    )
  },
}

export const ClampPolicyRule: Story = {
  name: '夾值 政策',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Label / Description 預設不截斷（'none'）"
        note="Checkbox / Radio 常承載法律條款、隱私聲明、條件描述——任何截斷都可能讓使用者同意沒看到的內容，是法律或道德問題。與 MenuItem 的「掃視優先」完全相反，SelectionItem 的核心訴求是「完整閱讀後同意」"
      >
        <Checkbox
          label="我同意網站使用 Cookie 以改善瀏覽體驗"
          description="包含但不限於：分析使用行為以優化內容、個人化廣告推薦、第三方服務整合（Google Analytics、Meta Pixel 等）、以及符合歐盟 GDPR 規範的使用者同意記錄。詳細條款請見隱私政策。"
        />
        <ExampleCaption>↑ 即使文字很長也完整顯示——使用者必須看完才能勾選</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 絕不預設截斷 agreement 類 Label"
        note="若 consumer 有合理理由（如 settings 頁掃視節奏）想截斷過長文字，需直接改用 SelectionItem 包裝 Checkbox 並傳 labelMaxLines / descMaxLines 覆寫——Checkbox 本身的 label / description prop 不提供截斷控制。截斷應該是例外，不是預設"
      >
        <Checkbox
          label="我同意非常長的服務條款與隱私政策以及所有使用規範這段文字被截斷了你看不到剩下的部分"
        />
        <ExampleCaption warn>↑ 截斷同意條款 → 使用者可能同意了看不到的內容</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="Per-instance override：傳 'none' 不是 undefined"
        note="這組覆寫設定在 SelectionItem 上（Checkbox 內部用它組合 label）。React destructure default 會把 undefined 當「沒傳」→ fallback 到預設。要明確表達「不截」請傳 'none'"
      >
        <ExampleCaption>SelectionItem labelMaxLines='none' / labelMaxLines={1} / labelMaxLines={2}（1-6 的數字；7 以上無對應 line-clamp class，傳了不生效）</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
