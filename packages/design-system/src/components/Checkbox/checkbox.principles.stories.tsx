import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './checkbox'
import { Switch } from '@/design-system/components/Switch/switch'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'

const meta: Meta = {
  title: 'Design System/Components/Checkbox/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      <div>
        <Rule
          title="何時用 — 真實業務場景"
          note="Checkbox 用於「獨立布林開關(on/off)」或「同類選項可複選」場景 — 每個 Checkbox 的值跟其他互不影響(對比 RadioGroup 互斥)。提交前可反悔(state local),點擊即時 toggle 視覺,不需要額外確認。對齊 WAI-ARIA `role=checkbox` / Polaris Choice 共識。"
        >
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/Checkbox/展示" name="直式群組"><span className="text-primary hover:underline font-medium cursor-pointer">商品類別的複選清單(直式群組)</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Checkbox/展示" name="水平排列"><span className="text-primary hover:underline font-medium cursor-pointer">篩選列的少量選項複選(水平排列)</span></LinkTo>
            </li>
          </ul>
        </Rule>

        <Rule
          title="vs Switch — Checkbox 是表單內、隨 submit 才生效、可反悔"
          note="勾選不代表立刻生效——使用者按「儲存」前都可以反悔。心智模型是「選擇 / 同意」，視覺語言強調「尚未確定」"
        >
          <div className="border border-border rounded-lg p-4 space-y-3">
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
            <div className="flex gap-2 pt-2">
              <button className="h-field-md px-3 text-body rounded-md bg-primary text-inverse-fg">儲存</button>
              <button className="h-field-md px-3 text-body rounded-md border border-border">取消</button>
            </div>
          </div>
          <Label>↑ 同意條款、訂閱選擇——form 內、有 submit / cancel button</Label>
        </Rule>

        <Rule
          title="Switch — 獨立 inline、切換即生效、無 submit 流程"
          note="使用者按下那刻 Bluetooth / Wi-Fi / 通知 就已經開 / 關。心智模型是物理開關（真實世界的 light switch），視覺語言強調「現在就是這樣」"
        >
          <div className="border border-border rounded-lg p-4 space-y-3">
            <Switch label="Bluetooth" checked={bluetooth} onCheckedChange={setBluetooth} />
            <Switch label="Wi-Fi" description="2.4 GHz + 5 GHz" checked={wifi} onCheckedChange={setWifi} />
          </div>
          <Label>↑ 系統設定類——獨立 inline control、旁邊沒有 submit 流程</Label>
        </Rule>

        <Rule
          title="❌ 用 Switch 做 form 同意"
          note="「我同意條款」是「勾選 → 送出 → 法律成立」的書面行為。Switch 的物理開關隱喻暗示「我打開了接受條款這個功能」——心智錯位且違反約定俗成"
        >
          <div className="border border-border rounded-lg p-4 space-y-3">
            <Switch label="我同意服務條款" />
            <div className="flex gap-2 pt-2">
              <button className="h-field-md px-3 text-body rounded-md bg-primary text-inverse-fg">送出</button>
            </div>
          </div>
          <Label warn>↑ 同意條款用 Switch → 心智模型錯誤 + 與產業共識背離（全球沒有 form 用 Switch 同意條款）</Label>
        </Rule>

        <Rule
          title="❌ 用 Checkbox 做即時系統設定"
          note="按下 Checkbox 在使用者心智裡還是「尚未確定」——但 Bluetooth 已經開了。視覺語言和實際行為脫節，使用者會困惑「我需要再按個儲存嗎？」"
        >
          <Checkbox label="Bluetooth" />
          <Label warn>↑ 即時套用用 Checkbox → 缺少「按下即生效」的視覺指示</Label>
        </Rule>

        <Rule
          title="vs Radio — Checkbox 是獨立 toggle(多選 或 單一 agreement)"
          note="每個 Checkbox 是獨立 boolean——可同時勾多個。也用於單一「我同意 X」agreement"
        >
          <div className="space-y-2">
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
          </div>
          <Label>↑ 權限可以任意組合——多選用 Checkbox</Label>
        </Rule>

        <Rule
          title="Radio — 互斥單選（必須在 RadioGroup 內）"
          note="N 個選項中只能選一個，其他自動變 unchecked。必須有 default value（radio 的語意不允許「都沒選」）"
        >
          <RadioGroup value={selected} onValueChange={setSelected}>
            <RadioGroupItem value="credit" label="信用卡" description="手續費 2.5%，即時" />
            <RadioGroupItem value="bank" label="銀行轉帳" description="無手續費，1-2 工作日" />
            <RadioGroupItem value="cash" label="貨到付款" description="手續費 NT$30，到貨時付" />
          </RadioGroup>
          <Label>↑ 付款方式互斥——選一個自動取消其他</Label>
        </Rule>

        <Rule
          title="❌ 多選一用 Checkbox"
          note="使用者可以同時勾 3 個 → 邏輯錯誤，破壞互斥語意"
        >
          <div className="space-y-2">
            <Checkbox label="信用卡" />
            <Checkbox label="銀行轉帳" />
            <Checkbox label="貨到付款" />
          </div>
          <Label warn>↑ 付款方式只能一個，卻用 Checkbox 允許多選 → 用 RadioGroup</Label>
        </Rule>

        <Rule
          title="判斷法 — 這個值旁邊有 submit / cancel button 嗎?"
          note="有 → Checkbox;沒有、是獨立 inline control → Switch。Radio 必須在 RadioGroup 內,且至少兩個選項;單一「我同意條款」用 Checkbox。"
        >
          <Label>簡單記:旁邊有「儲存 / 取消」按鈕、要送出表單才生效 → Checkbox;切下去就立刻生效(像實體開關)→ Switch。</Label>
        </Rule>
      </div>
    )
  },
}

export const ClampPolicyRule: Story = {
  name: '夾值 政策',
  render: () => (
    <div>
      <Rule
        title="Label / Description 預設不截斷（'none'）"
        note="Checkbox / Radio 常承載法律條款、隱私聲明、條件描述——任何截斷都可能讓使用者同意沒看到的內容，是法律或道德問題。與 MenuItem 的「掃視優先」完全相反，SelectionItem 的核心訴求是「完整閱讀後同意」"
      >
        <Checkbox
          label="我同意網站使用 Cookie 以改善瀏覽體驗"
          description="包含但不限於：分析使用行為以優化內容、個人化廣告推薦、第三方服務整合（Google Analytics、Meta Pixel 等）、以及符合歐盟 GDPR 規範的使用者同意記錄。詳細條款請見隱私政策。"
        />
        <Label>↑ 即使文字很長也完整顯示——使用者必須看完才能勾選</Label>
      </Rule>

      <Rule
        title="❌ 絕不預設截斷 agreement 類 Label"
        note="若 consumer 有合理理由（如 settings 頁掃視節奏）想截斷過長文字，需直接改用 SelectionItem 包裝 Checkbox 並傳 labelMaxLines / descMaxLines 覆寫——Checkbox 本身的 label / description prop 不提供截斷控制。截斷應該是例外，不是預設"
      >
        <Checkbox
          label="我同意非常長的服務條款與隱私政策以及所有使用規範這段文字被截斷了你看不到剩下的部分"
        />
        <Label warn>↑ 截斷同意條款 → 使用者可能同意了看不到的內容</Label>
      </Rule>

      <Rule
        title="Per-instance override：傳 'none' 不是 undefined"
        note="這組覆寫設定在 SelectionItem 上（Checkbox 內部用它組合 label）。React destructure default 會把 undefined 當「沒傳」→ fallback 到預設。要明確表達「不截」請傳 'none'"
      >
        <Label>SelectionItem labelMaxLines='none' / labelMaxLines={1} / labelMaxLines={2}（1-10 的數字）</Label>
      </Rule>
    </div>
  ),
}
