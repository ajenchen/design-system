import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './checkbox'
import { CheckboxGroup } from './checkbox-group'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'
import { Switch } from '@/design-system/components/Switch/switch'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta = {
  title: 'Design System/Components/Checkbox/設計原則',
  parameters: { layout: 'padded' },
  // 範例的儲存 / 送出成功跳 Toast(form-validation.spec.md「Submit 成功宣告」);Toaster 一頁一個,放 decorators(同 Toast 設計原則頁)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
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
    // 儲存 = 記下目前勾選並跳 Toast;取消 = 還原到上次儲存的勾選
    const [savedConsent, setSavedConsent] = React.useState({ agree: false, notif: 'unchecked' as 'checked' | 'unchecked' })
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
            {/* 同意條款、訂閱行銷是兩件不相干的事,各是一個單一勾選框(checkbox.spec.md「單一同意」),不包成同一組;
                兩個之間 = 規則 3 parallel = loose(layoutSpace.spec.md「跨範疇 + parallel」;2026-10-27 Q6 甲)。
                勾選框 → 按鈕 = loose(按鈕跟在內容後,上方一律 loose)。 */}
            <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
              <div className="flex flex-col gap-[var(--layout-space-loose)]">
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
              </div>
              <ButtonGroup className="mt-[var(--layout-space-loose)]">
                <Button variant="primary" onClick={() => { setSavedConsent({ agree, notif }); toast({ variant: 'success', title: '設定已儲存' }) }}>儲存</Button>
                <Button variant="tertiary" onClick={() => { setAgree(savedConsent.agree); setNotif(savedConsent.notif) }}>取消</Button>
              </ButtonGroup>
            </div>
            <ExampleCaption>↑ 同意條款、訂閱選擇——form 內、有 submit / cancel button</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="Switch — 獨立 inline、切換即生效、無 submit 流程"
            note="使用者按下那刻 Bluetooth / Wi-Fi / 通知 就已經開 / 關。心智模型是物理開關（真實世界的 light switch），視覺語言強調「現在就是這樣」"
          >
            {/* 設定列 = 自帶標題的 <Switch label description>(switch.spec.md「設定列 vs 水平 Field」;2026-10-21 S1 甲):
                標題 + 說明在左、開關在列尾;Wi-Fi 的說明放回(已發布的內容,PR 為了遷就水平 Field 刪掉)。
                列與列之間 = loose(每列各管一件事,規則 3 parallel;2026-10-27 Q6 甲),列高 = 欄位高由元件自己給 */}
            <div className="border border-border rounded-lg p-[var(--layout-space-loose)] flex flex-col gap-[var(--layout-space-loose)]">
              <Switch label="Bluetooth" checked={bluetooth} onCheckedChange={setBluetooth} />
              <Switch label="Wi-Fi" description="2.4 GHz + 5 GHz" checked={wifi} onCheckedChange={setWifi} />
            </div>
            <ExampleCaption>↑ 系統設定類——獨立 inline control、旁邊沒有 submit 流程</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="❌ 用 Switch 做 form 同意"
            note="「我同意條款」是「勾選 → 送出 → 法律成立」的書面行為。Switch 的物理開關隱喻暗示「我打開了接受條款這個功能」——心智錯位且違反約定俗成"
          >
            <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
              <Switch label="我同意服務條款" />
              <div className="mt-[var(--layout-space-loose)]">
                <Button variant="primary" onClick={() => toast({ variant: 'success', title: '已送出' })}>送出</Button>
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
  name: '標籤與說明不截斷',
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
        {/* 反例畫成真的截斷長相:consumer 改用 SelectionItem 並傳 labelMaxLines={1}(note 講的那條路),真實條款文字被切成一行 */}
        <div className="max-w-xs">
          <SelectionItem
            control={<Checkbox aria-label="我同意 Acme 服務條款" />}
            label="我同意 Acme 服務條款,包含資料保存期間、第三方分享範圍,以及帳號終止後的資料刪除方式"
            labelMaxLines={1}
          />
        </div>
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
