// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './switch'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Switch/設計原則',
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

// ── WhenToUse — 何時使用 Switch ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsCheckboxRule / ReadonlyVsDisabledRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [bluetooth, setBluetooth] = React.useState(true)
    const [agreeTerms, setAgreeTerms] = React.useState(false)
    return (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Switch 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Switch/展示" name="搭配 Label"><span className="text-primary hover:underline font-medium cursor-pointer">搭配 Label</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親元件 — 原 VsCheckboxRule */}
      <div>
        <Rule
          title="vs 近親元件 — Switch 是即時套用的布林開關 (sweet spot)"
          note="切換即生效——物理開關類比(牆上 light switch、iPhone settings)。使用者按下那刻 Bluetooth 就開了,不經任何 submit 流程"
        >
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-body font-medium">Bluetooth</div>
                <div className="text-caption text-fg-muted">切換立刻開 / 關</div>
              </div>
              <Switch checked={bluetooth} onCheckedChange={setBluetooth} />
            </div>
          </div>
          <Label>↑ 獨立 inline control,無 submit / cancel 流程</Label>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — Form 內的同意 / 勾選用 Checkbox"
          note="「我同意服務條款」是「勾選 → 送出 → 法律成立」的書面行為。Switch 的物理開關隱喻暗示「我打開了接受條款這個功能」——心智錯位且違反約定俗成(全球沒有 form 用 Switch 同意條款)"
        >
          <div className="border border-border rounded-lg p-4 space-y-3">
            <Checkbox
              label="我同意服務條款與隱私政策"
              checked={agreeTerms}
              onCheckedChange={(v) => setAgreeTerms(v === true)}
            />
            <div className="flex gap-2 pt-2">
              <Button variant="primary">送出</Button>
              <Button variant="tertiary">取消</Button>
            </div>
          </div>
          <Label>↑ Form 內同意條款用 Checkbox,隨 submit 才成立</Label>
        </Rule>

        <Rule
          title="vs 近親元件 — 判斷法:「旁邊有 submit / cancel button 嗎?」"
          note="有 → Checkbox(form 流程、值隨 submit 送出);沒有,是獨立 inline control → Switch(切換即生效)"
        >
          <Label>完整三角度對照 SSOT 在 checkbox.spec.md「與 Switch 的分界」</Label>
        </Rule>
      </div>

      {/* vs 近親 — ReadonlyVsDisabledRule — 原 ReadonlyVsDisabledRule */}
      <div>
      <Rule
        title="Readonly 保留正常顏色(可讀)/ Disabled 降透明度(弱化)"
        note="兩者都鎖定互動,但視覺訊號不同:readonly 告訴使用者「這個值就是這樣,你看得清」;disabled 告訴使用者「這個 field 目前不可用」(弱化暗示低優先)"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Readonly ON(顏色正常)</div>
            <Switch readOnly defaultChecked />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Disabled ON(opacity 降低)</div>
            <Switch disabled defaultChecked />
          </div>
        </div>
      </Rule>

      <Rule
        title="使用場景對照"
        note="Readonly:表單 readonly 呈現、DataTable cell 非編輯態——值重要、視覺不能弱化。Disabled:外部條件造成暫時不可用(方案限制、權限不足)——傳達「現在用不到」"
      >
        <Label>兩者都 `pointer-events-none` + 不在 tab order 內,互動鎖定一致,差別在視覺訊號</Label>
      </Rule>
    </div>
    </div>
    )
  },
}

export const DisabledOpacityRule: Story = {
  name: 'Disabled 用 opacity(保留顏色)',
  render: () => (
    <div>
      <Rule
        title="Switch disabled 用 opacity,不用灰階 swap"
        note="Switch 的 on/off 視覺差異**唯一載體是顏色**(track bg-primary vs bg-border)——track 和 thumb 在 on/off 之間形狀完全相同,只有顏色變。若灰階 swap(primary → border),disabled 的 ON 和 OFF 會看起來一模一樣,使用者無法分辨當前狀態"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Rest ON</div>
            <Switch defaultChecked />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Rest OFF</div>
            <Switch />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Disabled ON(opacity 保留顏色)</div>
            <Switch defaultChecked disabled />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Disabled OFF</div>
            <Switch disabled />
          </div>
        </div>
        <Label>↑ Disabled 仍能分辨 ON(藍)vs OFF(灰)——opacity 降低但顏色身份保留</Label>
      </Rule>

      <Rule
        title="對照 Slider / Checkbox:灰階 swap(位置/形狀承載 state)"
        note="Slider 的 state 是 thumb 位置 + range 長度——灰色 thumb 在灰色 track 上,位置資訊跟 primary 版本完全一樣。Checkbox 的 state 是 checkmark 形狀——灰色框裡的 check 仍清楚可辨。這兩個用灰階 swap 不失 state 資訊"
      >
        <Label>判準:「什麼視覺載體承載 state?」位置/形狀 → 灰階 swap;純顏色 → opacity(Switch 特例)</Label>
      </Rule>

      <Rule
        title="❌ 若 Switch 改用灰階 swap"
        note="disabled ON 和 disabled OFF 都會變成「灰 track + 灰 thumb」,視覺一模一樣——使用者不知道這個被停用的開關當前是開還是關"
      >
        <Label warn>設計上禁止——Switch 是系統內唯一靠顏色承載 state 的元件,必須保留顏色</Label>
      </Rule>
    </div>
  ),
}

