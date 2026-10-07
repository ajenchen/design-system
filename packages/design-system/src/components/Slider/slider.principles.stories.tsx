// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './slider'
import { Switch } from '@/design-system/components/Switch/switch'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Field, FieldLabel, FieldDescription } from '@/design-system/components/Field/field'
import { CaptionedExamples, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Slider/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-[var(--layout-space-loose)]">
    <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)] max-w-[720px]">{note}</p>}
    <CaptionedExamples caption={Label} className="max-w-md">{children}</CaptionedExamples>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [volume, setVolume] = React.useState([70])
    const [price, setPrice] = React.useState([500, 3500])
    return (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {/* 何時用 — 原 WhenToUse */}
      <div className="max-w-prose">
      <p>適合 Slider 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Slider/展示" name="容器尺寸對齊"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">表單內與 Input / NumberInput 並排的數值調整（容器尺寸對齊）</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Slider/展示" name="最小 / 最大 / 步階"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">價格 / 數量等有上下限與步階的調整（最小 / 最大 / 步階）</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Slider/展示" name="提交數值回呼"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">拖曳即時預覽、放開才送出查詢（提交數值回呼）</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
        <Rule
          title="Slider 的 sweet spot — 連續感受值 + 使用者在意「相對位置」勝過「精確數字」"
          note="亮度 / 音量 / 縮放 / 透明度。拖曳 thumb 的觸感就是在「感受」這個值,不是輸入精確數字"
        >
          {/* 標籤 / 顯示值消費 Field(slider.spec.md「跟 Field 整合」:FieldLabel + Slider + FieldDescription;
              spec「搭配顯示值」),不手刻文字標籤列 */}
          <Field>
            <FieldLabel>音量</FieldLabel>
            <Slider value={volume} onValueChange={setVolume} />
            <FieldDescription>目前 {volume[0]}%</FieldDescription>
          </Field>
        </Rule>

        <Rule
          title="Range mode — 範圍選取(價格 / 日期 / 分數)"
          note="兩個 thumb 定義區間。使用者拖左右兩端感受範圍寬度,比打兩個精確數字直觀"
        >
          <Field>
            <FieldLabel>價格範圍</FieldLabel>
            <Slider value={price} onValueChange={setPrice} min={0} max={10000} step={100} />
            <FieldDescription>${price[0]} – ${price[1]}</FieldDescription>
          </Field>
        </Rule>

        <Rule
          title="❌ 離散少量選項(3-5 個):用 SegmentedControl / RadioGroup"
          note="Slider 是連續軌道,設 step 強制 3 個離散點是反模式——使用者必須精準拖到對齊點。用分段控件更精確且直觀"
        >
          {/* 「❌ 反例 → 說明 → 正解」一條鏈 = 一組(說明同時指上方反例、引出下方正解) */}
          <ExampleGroup>
            <Field>
              <FieldLabel>大小</FieldLabel>
              <Slider defaultValue={[50]} step={50} min={0} max={100} />
              <FieldDescription>目前:中</FieldDescription>
            </Field>
            <Label warn>↑ 強制拖到 0 / 50 / 100 的 Slider = 反模式。改 SegmentedControl:</Label>
            <SegmentedControl defaultValue="md">
              <SegmentedControlItem value="sm">小</SegmentedControlItem>
              <SegmentedControlItem value="md">中</SegmentedControlItem>
              <SegmentedControlItem value="lg">大</SegmentedControlItem>
            </SegmentedControl>
          </ExampleGroup>
        </Rule>

        <Rule
          title="❌ 精確數字輸入:用 NumberInput"
          note="要使用者輸入精確數字(2490 這種)用 Slider 要拖半天還拖不準。Slider 跟 NumberInput 可以並用——Slider 粗略拖、NumberInput 精調"
        >
          <Field>
            <FieldLabel>商品價格</FieldLabel>
            <NumberInput value={2490} prefix="$" onChange={() => {}} />
          </Field>
          <Label>↑ 金額不用 Slider,直接 NumberInput 輸入</Label>
        </Rule>

        <Rule
          title="❌ 布林 on/off:用 Switch"
          note="on/off 不是「連續值」,不需要軌道"
        >
          {/* 獨立開關消費 Switch 自帶的 label(switch.spec.md「label / description 整合」:label 左 / 開關右) */}
          <Switch defaultChecked label="啟用" />
        </Rule>
      </div>
    </div>
    )
  },
}

export const PositionAsStateRule: Story = {
  name: '位置/長度是狀態,不是顏色',
  render: () => (
    <div>
      <Rule
        title="Disabled 用灰階 swap(不是 opacity)— 因為 state 載體是位置 / 長度"
        note="使用者看 disabled Slider 需要理解兩件事:thumb 在 track 哪個位置、range 填滿多長。這兩個資訊完全不依賴顏色——灰階 thumb 在灰階 track 上的位置跟 primary 版本一模一樣。失去藍色沒有資訊損失"
      >
        <div className="flex items-center">
          <div className="flex-1">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Rest(primary)</div>
            <Slider defaultValue={[60]} aria-label="亮度" />
          </div>
        </div>
        <div className="flex items-center">
          <div className="flex-1">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Disabled(灰階——位置/長度完全可辨)</div>
            <Slider defaultValue={[60]} disabled aria-label="亮度" />
          </div>
        </div>
        <Label>↑ 灰階後 thumb 位置(60%)+ range 填滿長度(0-60%)仍然清楚。不需要保留藍色</Label>
      </Rule>

      <Rule
        title="對照 Switch:必須用 opacity(顏色是主要 state 載體)"
        note="Switch 的 on/off 主要靠顏色(track bg-primary vs bg-border)承載——thumb 位移與 checked 勾號只是輔助訊號,單獨一顆、無左右對照時不易讀。若灰階 swap,disabled 的 ON 和 OFF track 同灰、主通道消失,使用者難以分辨。必須 opacity 保留顏色"
      >
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          {/* @layout-space-magic-ok: 狀態標籤 ↔ Switch 樣本(行內 micro)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-16">Rest ON</span>
            <Switch defaultChecked aria-label="啟用（開）" />
          </div>
          {/* @layout-space-magic-ok: 狀態標籤 ↔ Switch 樣本(行內)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-16">Rest OFF</span>
            <Switch aria-label="啟用（關）" />
          </div>
        </div>
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          {/* @layout-space-magic-ok: 狀態標籤 ↔ Switch 樣本(行內 micro)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-16">Disabled ON</span>
            <Switch defaultChecked disabled aria-label="啟用（停用、開）" />
          </div>
          {/* @layout-space-magic-ok: 狀態標籤 ↔ Switch 樣本(行內)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-2">
            <span className="text-caption text-fg-muted w-16">Disabled OFF</span>
            <Switch disabled aria-label="啟用（停用、關）" />
          </div>
        </div>
        <Label>↑ Switch disabled 保留顏色(opacity),所以仍能分辨 ON/OFF</Label>
      </Rule>

      <Rule
        title="判斷法:「什麼視覺載體承載 state?」"
        note="位置 / 形狀 → 灰階 swap(Slider/Checkbox/Button);純顏色 → opacity(Switch)。選錯讓使用者看不懂當前狀態"
      >
        <Label>完整對照見 slider.spec.md「Disabled 策略」</Label>
      </Rule>
    </div>
  ),
}

export const HoverUsesShadowRule: Story = {
  name: '滑鼠移過 / 啟用 用陰影不用色變',
  render: () => (
    <div>
      <Rule
        title="Slider 是「位置指示器」,底色不該動"
        note="按 button 時 bg 變色是合理的(button 是動作按下的視覺回饋)。Slider 的 thumb 不是 button——它是「現在值在這裡」的位置指示。底色變色會暗示「這是個可點擊的按鈕」,心智模型錯位"
      >
        <div>
          <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Hover thumb → 陰影 elevation-100</div>
          <Slider defaultValue={[50]} aria-label="音量" />
        </div>
        <Label>↑ hover 時 thumb 加 elevation-100,不改底色。對齊 Material 3 / iOS / Linear 共識</Label>
      </Rule>

      <Rule
        title="❌ 若改成 hover 時 thumb 變深色"
        note="thumb 看起來像按鈕,使用者可能以為要「按下」才會生效——但 Slider 的互動是拖曳不是點擊。破壞 mental model"
      >
        <Label warn>範例省略——設計上禁止此做法</Label>
      </Rule>
    </div>
  ),
}

export const ThumbBindingRule: Story = {
  name: 'Thumb 白底 + 邊框,不用實心',
  render: () => (
    <div>
      <Rule
        title="Thumb 白底 + 2px primary border(不是實心 primary)"
        note="實心 primary thumb 在 range mode(兩個 thumb)+ primary range 一起時,會跟 range 融為一體,看不出 thumb 邊界。白底 + 邊框讓 thumb 浮出——thumb 白底是「被 range 圍住的空心洞」,border 是 range 的連續延伸"
      >
        <div>
          <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Range mode(兩個 thumb)</div>
          <Slider defaultValue={[30, 70]} aria-label="價格範圍" />
        </div>
        <Label>↑ 兩個 thumb 清楚浮在 range 上,邊界分明</Label>
      </Rule>

      <Rule
        title="Range ↔ Thumb border 必須同色(綁定規則)"
        note="Thumb 坐落在 range 端點上,border 是 range 的視覺延續。兩者同色讓視覺一體——thumb 像是「range 圍住的洞」而不是「浮在 range 上的異物」。這個 mental model 更接近真實物理滑桿(handle 就是軌道的延伸)"
      >
        <div>
          <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Rest:range = primary + thumb border = primary</div>
          <Slider defaultValue={[60]} aria-label="亮度" />
        </div>
        <div>
          <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Disabled:range = border + thumb border = border(同步降級)</div>
          <Slider defaultValue={[60]} disabled aria-label="亮度（停用）" />
        </div>
        <Label>↑ 兩個 state 下 range 和 thumb border 永遠同一個 token,不讓兩者漂移</Label>
      </Rule>

      <Rule
        title="❌ 實心 primary thumb(融色)"
        note="實心 thumb 跟 primary range 同色,邊界看不清楚,range mode 下兩個 thumb 完全融入 range"
      >
        <Label warn>設計上禁止——對齊 Material 3 / iOS / Linear 的空心 thumb 共識</Label>
      </Rule>
    </div>
  ),
}
