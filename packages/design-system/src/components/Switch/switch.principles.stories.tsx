// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './switch'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Switch/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// ── WhenToUse — 何時使用 Switch ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsCheckboxRule / ReadonlyVsDisabledRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [bluetooth, setBluetooth] = React.useState(true)
    const [agreeTerms, setAgreeTerms] = React.useState(false)
    return (
    <TutorialPage>
      <UsageSection kind="when">
        <p>切換就立即生效的開關,像實體開關:Bluetooth、Wi-Fi、深色模式、推播通知、管理者即時開關功能;旁邊沒有送出 / 取消的流程。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Switch/展示" name="搭配標籤">搭配標籤</StoryLink></li>
        </TutorialList>
        <TutorialRule
          title="Switch 最適合即時生效的開關"
          note="切換即生效——物理開關類比(牆上 light switch、iPhone settings)。使用者按下那刻 Bluetooth 就開了,不經任何 submit 流程"
        >
          {/* 標籤 / 說明用 Switch 自己的 label / description(switch.spec.md「label / description 整合」:左文字、右開關,間距與字級由 Switch 擁有) */}
          <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
            <Switch
              checked={bluetooth}
              onCheckedChange={setBluetooth}
              label="Bluetooth"
              description="切換立刻開 / 關"
            />
          </div>
          <ExampleCaption>↑ 獨立 inline control,無 submit / cancel 流程</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 表單裡的同意 / 勾選:用 Checkbox"
          note="「我同意服務條款」是「勾選 → 送出 → 法律成立」的書面行為。Switch 的物理開關隱喻暗示「我打開了接受條款這個功能」——心智錯位且違反約定俗成(全球沒有 form 用 Switch 同意條款)"
        >
          {/* 單一同意 = 直接 Checkbox + label prop、不包 Field(field.spec.md「何時不用」:單一 Checkbox(勾選同意)→ 直接 Checkbox + label prop)——
              包進 Field 時 Checkbox 的 label 由 FieldLabel 接管、自己的字不畫(checkbox.spec.md「insideField && !insideGroup → 抑制 label」),
              畫面上只剩一個沒有字、讀屏也沒有名字的勾選框。原本的「送出 / 取消」兩顆鈕按了沒反應(稽核 M061),照稽核另一個修法拿掉,
              「旁邊有送出」已寫在本則說明與下方 caption */}
          <div className="border border-border rounded-lg p-[var(--layout-space-loose)]">
            <Checkbox
              label="我同意服務條款與隱私政策"
              checked={agreeTerms}
              onCheckedChange={(v) => setAgreeTerms(v === true)}
            />
          </div>
          <ExampleCaption>↑ Form 內同意條款用 Checkbox,隨 submit 才成立</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li>多選(複選多個選項)→ Checkbox 清單:Switch 是單一開關</li>
          <li>三種或更多狀態 → RadioGroup / SegmentedControl:Switch 只有開 / 關</li>
          <li>需要等待的動作(「正在開啟中」)→ 有載入狀態的 Button:Switch 是瞬間切換,不承載進度</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="判斷法:旁邊有「送出 / 取消」按鈕嗎?"
          note="有 → Checkbox(form 流程、值隨 submit 送出);沒有,是獨立 inline control → Switch(切換即生效)"
        >
          <ExampleCaption>三個判斷角度(套用時機、心智模型、是否可反悔)的完整對照見 <StoryLink kind="Design System/Components/Checkbox/設計原則" name="使用指引">Checkbox 設計原則「使用指引」</StoryLink></ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
    )
  },
}

export const ReadonlyVsDisabledRule: Story = {
  name: '唯讀 vs 停用',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Readonly(standalone)保留正常顏色(可讀)/ Disabled 降透明度(弱化)"
        note="兩者都鎖定互動,但視覺訊號不同:readonly 告訴使用者「這個值就是這樣,你看得清」;disabled 告訴使用者「這個 field 目前不可用」(弱化暗示低優先)"
      >
        <div className="grid grid-cols-2 gap-[var(--layout-space-loose)]">
          <div className="border border-dashed border-divider rounded-md p-[var(--layout-space-loose)]">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Readonly ON(顏色正常)</div>
            <Switch readOnly defaultChecked aria-label="唯讀的開啟狀態設定" />
          </div>
          <div className="border border-dashed border-divider rounded-md p-[var(--layout-space-loose)]">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Disabled ON(opacity 降低)</div>
            <Switch disabled defaultChecked aria-label="停用的開啟狀態設定" />
          </div>
        </div>
      </TutorialRule>

      <TutorialRule
        title="使用場景對照"
        note="Readonly（獨立設定列表）的值仍很重要，視覺不能弱化；表單內的 readonly 由 Field 以灰框與狀態圖示呈現，DataTable 非編輯態則使用檢視模式。Disabled 表示因方案或權限等外部條件而暫時不可用"
      >
        <ExampleCaption>兩者都不可切換、不在 tab order 內(standalone),機制不同:readonly 用 <code>pointer-events-none</code>(視覺正常);disabled 走 native <code>disabled</code> + <code>cursor-not-allowed</code>(降透明度)。Field 內 readonly 灰框則可聚焦(tabIndex=0)</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const DisabledOpacityRule: Story = {
  name: '停用用半透明保留顏色',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Switch disabled 用 opacity,不用灰階 swap"
        note="Switch 的 on/off 最強視覺載體是顏色(track bg-primary vs bg-border);thumb 位移與 checked 小 check icon 是輔助線索。若灰階 swap(primary → border),disabled 的 ON/OFF 只剩灰階低對比下的位置與小 icon 差異,難以一眼分辨當前狀態——所以設計上禁止改用灰階 swap,disabled 必須保留顏色"
      >
        <div className="grid grid-cols-2 gap-[var(--layout-space-loose)]">
          <div className="border border-dashed border-divider rounded-md p-[var(--layout-space-loose)]">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Rest ON</div>
            <Switch defaultChecked aria-label="可用的開啟狀態 Switch" />
          </div>
          <div className="border border-dashed border-divider rounded-md p-[var(--layout-space-loose)]">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Rest OFF</div>
            <Switch aria-label="可用的關閉狀態 Switch" />
          </div>
          <div className="border border-dashed border-divider rounded-md p-[var(--layout-space-loose)]">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Disabled ON(opacity 保留顏色)</div>
            <Switch defaultChecked disabled aria-label="停用的開啟狀態 Switch" />
          </div>
          <div className="border border-dashed border-divider rounded-md p-[var(--layout-space-loose)]">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Disabled OFF</div>
            <Switch disabled aria-label="停用的關閉狀態 Switch" />
          </div>
        </div>
        <ExampleCaption>↑ Disabled 仍能分辨 ON(藍)vs OFF(灰)——opacity 降低但顏色身份保留</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="對照 Slider / Checkbox:灰階 swap(位置/形狀承載 state)"
        note="Slider 的 state 是 thumb 位置 + range 長度——灰色 thumb 在灰色 track 上,位置資訊跟 primary 版本完全一樣。Checkbox 的 state 是 checkmark 形狀——灰色框裡的 check 仍清楚可辨。這兩個用灰階 swap 不失 state 資訊"
      >
        <ExampleCaption>判準:「什麼視覺載體承載 state?」位置/形狀 → 灰階 swap;純顏色 → opacity(Switch 特例)</ExampleCaption>
      </TutorialRule>

    </TutorialPage>
  ),
}
