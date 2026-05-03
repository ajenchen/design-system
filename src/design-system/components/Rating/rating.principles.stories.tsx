// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { useState } from 'react'
import { Heart, ThumbsUp, Star } from 'lucide-react'
import { Rating } from './rating'
import { Button } from '@/design-system/components/Button/button'
import { Badge } from '@/design-system/components/Badge/badge'
import { Slider } from '@/design-system/components/Slider/slider'

const meta: Meta = {
  title: 'Design System/Components/Rating/設計原則',
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
    <div className="flex flex-wrap gap-6 items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal mt-2 ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Stories ───────────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse / InteractiveVsReadOnly / RatingVsAlternatives(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const SubmitFlow = () => {
      const [v, setV] = useState(0)
      return (
        <div className="flex flex-col gap-2 w-[300px] p-4 border border-border rounded-md">
          <div className="text-caption text-fg-secondary font-medium">送出評分 — interactive</div>
          <Rating value={v} onChange={setV} size="lg" aria-label="為這次用餐評分" />
          <Label>使用者正在給分，hover 預覽 + click 送出</Label>
        </div>
      )
    }
    return (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Rating 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Rating/展示" name="商品列表平均分"><span className="text-primary hover:underline font-medium cursor-pointer">商品列表平均分</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Rating/展示" name="送出評分 Flow"><span className="text-primary hover:underline font-medium cursor-pointer">送出評分 Flow</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Rating/展示" name="包在 Field 內"><span className="text-primary hover:underline font-medium cursor-pointer">包在 Field 內</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="❌ readOnly 不加 aria-label"
        note="純視覺的星星螢幕閱讀器讀不出「4.7 分」。readOnly Rating 的 aria-label 必填，描述「幾星、共幾星、幾則評論」。"
      >
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <Rating value={4.5} readOnly precision="half" size="md" aria-label="平均評分 4.5 星，共 5 星" />
          <Label>✅ `aria-label=&quot;平均評分 4.5 星，共 5 星&quot;`</Label>
        </div>
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <Rating value={4.5} readOnly precision="half" size="md" />
          <Label warn>❌ 無 aria-label，螢幕閱讀器讀不出分數</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 換成 Heart / ThumbsUp 做愛心 / like"
        note="愛心是 binary（喜歡 / 不喜歡），不是 graded 1–5。使用者對「五顆愛心」的期待是『有 5 顆愛心那麼喜歡』= 量化——但 like 本身就是二元，語意衝突。"
      >
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <Button variant="text" iconOnly startIcon={Heart} aria-label="收藏" />
          <Label>✅ binary like → Button + pressed</Label>
        </div>
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <Rating defaultValue={3} max={5} size="md" icon={Heart} aria-label="誤用 Heart" />
          <Label warn>❌ Rating 換 Heart → 把 binary 變成 graded，語意衝突</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 用 Rating 做 progress bar"
        note="Rating 的語意是『給分』,用『填了 4 顆星』表達『完成 4/5 步』會讓使用者誤以為是評分而非進度。進度有具體 % 用 ProgressBar(linear)或 CircularProgress(circular,有 value),不定進度用 CircularProgress(無 value,indeterminate)。"
      >
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <div className="text-caption text-fg-secondary font-medium">完成 4/5 步</div>
          <Rating value={4} readOnly size="md" aria-label="誤用範例" />
          <Label warn>❌ 使用者會以為「這個任務被評 4 星」→ 改 ProgressBar</Label>
        </div>
      </Rule>

      <Rule
        title="❌ max 超過 7"
        note="超過 7 顆使用者無法「一眼看出是幾星」——必須一顆顆數。這違背 Rating 快速掃視的本質。若需要更細分度（0–100），改用 Slider。"
      >
        <div className="flex flex-col gap-2 w-[400px] p-4 border border-border rounded-md">
          <Rating value={7} readOnly max={10} size="md" aria-label="10 星量表" />
          <Label warn>❌ 10 星量表無法快速掃視 → 超過 7 改用 Slider</Label>
        </div>
      </Rule>
    </div>

      {/* vs 近親 — 原 InteractiveVsReadOnly + RatingVsAlternatives */}
      <div>
        <Rule
          title="送出前 → interactive，送出後 / 他人評分 → readOnly"
          note="Rating 既可編輯也可展示，最常見的錯誤是「讓使用者以為可以改別人的分數」。一條清楚的分界：自己正在給分 = interactive；看別人給的分或平均分 = readOnly。"
        >
          <SubmitFlow />
          <div className="flex flex-col gap-2 w-[300px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">評論列表 — readOnly</div>
            <Rating value={5} readOnly size="lg" aria-label="王小明給 5 星" />
            <Label>他人評分，純顯示</Label>
          </div>
          <div className="flex flex-col gap-2 w-[300px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">商品平均分 — readOnly</div>
            <Rating value={4.7} readOnly precision="half" size="lg" aria-label="平均 4.7 星" />
            <Label>平均分數，使用者無法改</Label>
          </div>
        </Rule>

        <Rule
          title="❌ 展示平均分時用 interactive"
          note="使用者以為自己可以改變商品平均分。所有展示用途必須 readOnly。"
        >
          <div className="flex flex-col gap-2 w-[300px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">商品平均分</div>
            <Rating defaultValue={4.7} precision="half" size="lg" aria-label="誤用範例" />
            <Label warn>使用者會以為點下去能改平均分 → 改 readOnly</Label>
          </div>
        </Rule>

        <Rule
          title="Rating — 離散 1–5 分評分"
          note="星等是使用者對商品 / 服務的 graded 量化評價。5 顆是世界級共識（超過 7 使用者無法快速掃視）。"
        >
          <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">商品評分</div>
            <Rating value={4.7} readOnly precision="half" size="md" aria-label="4.7 星" />
            <Label>離散 tier:1 / 2 / 3 / 4 / 5(或 0.5 step)</Label>
          </div>
        </Rule>

        <Rule
          title="Slider — 連續數值（非 1–5 評分）"
          note="音量、亮度、價格區間、百分比調整。Slider 是連續值，Rating 是離散 tier——完全不同語意。"
        >
          <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">音量（連續值）</div>
            <Slider defaultValue={[65]} max={100} aria-label="音量" />
            <Label>0–100 任何值都合理 → 用 Slider，不是 Rating</Label>
          </div>
        </Rule>

        <Rule
          title="Badge — 靜態分類標記（非量化）"
          note="「熱門」「Beta」「必填」「NEW」是 categorical label，不是 1–5 評分。Badge 傳達「屬於哪類」，Rating 傳達「值多少分」。"
        >
          <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">商品標記</div>
            <div className="flex items-center gap-2">
              <Badge count={0} variant="critical" />
              <span className="text-caption text-fg-muted">或文字 Badge（分類）</span>
            </div>
            <Label>分類 / 狀態 / 通知計數 → Badge，不是 Rating</Label>
          </div>
        </Rule>

        <Rule
          title="Like / ThumbsUp — 二元喜歡（非 graded）"
          note="愛心 / 豎拇指是 binary（喜歡 / 不喜歡），不是 1–5 分。用 Button iconOnly + pressed，不用 Rating 換 icon。"
        >
          <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-secondary font-medium">收藏（binary）</div>
            <div className="flex items-center gap-2">
              <Button variant="text" iconOnly startIcon={Heart} aria-label="收藏" />
              <Button variant="text" iconOnly startIcon={ThumbsUp} aria-label="喜歡" />
            </div>
            <Label>二元切換 → Button + pressed，不是 Rating 換 Heart icon</Label>
          </div>
        </Rule>
      </div>
    </div>
    )
  },
}

export const PrecisionChoice: Story = {
  name: 'Precision 選擇',
  render: () => (
    <div>
      <Rule
        title="full — 送出評分（使用者給分當下）"
        note="送出流程要「決斷」，整星最清晰。Yelp / Google Reviews / Amazon 的送出表單都是整星——使用者不必在 4 和 4.5 之間猶豫。"
      >
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <div className="text-caption text-fg-secondary font-medium">為這次服務評分</div>
          <Rating defaultValue={0} precision="full" size="lg" aria-label="送出評分" />
          <Label>step = 1，可選值：1 / 2 / 3 / 4 / 5</Label>
        </div>
      </Rule>

      <Rule
        title="half — 展示平均分（顯示小數）"
        note="平均分必定有小數（4.7、3.2、4.5），整星無法表達。半星用 overflow-hidden 疊一個 filled 在 empty 上，呈現「4.5 看起來就是 4 顆半星」。"
      >
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <div className="text-caption text-fg-secondary font-medium">商品平均分</div>
          <div className="flex items-center gap-2">
            <Rating value={4.7} readOnly precision="half" size="lg" aria-label="平均 4.7" />
            <span className="text-body text-fg-secondary">4.7</span>
            <span className="text-caption text-fg-muted">(12,843)</span>
          </div>
          <Label>顯示 4.7 需要半星精度</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 送出表單用 half — 使用者猶豫症"
        note="半星給送出評分會讓使用者陷入「4 跟 4.5 差在哪」的猶豫。送出 = full；半星只用於展示。"
      >
        <div className="flex flex-col gap-2 w-[320px] p-4 border border-border rounded-md">
          <div className="text-caption text-fg-secondary font-medium">送出評分 — 誤用 half</div>
          <Rating defaultValue={0} precision="half" size="lg" aria-label="誤用範例" />
          <Label warn>使用者要在 10 個刻度裡選 → 改 full（5 個整星）</Label>
        </div>
      </Rule>
    </div>
  ),
}

export const YellowStarConvention: Story = {
  name: '為什麼用黃色',
  render: () => (
    <div>
      <Rule
        title="黃星 = 世界級 convention，破壞 = 破壞使用者直覺"
        note="Amazon / Yelp / Google Reviews / Shopify / Airbnb / TripAdvisor 全部用黃星。使用者的視覺記憶已經把「黃星 = 評分」綁定——換成品牌 primary 色（藍 / 綠 / 紫）會讓使用者多花一瞬間「這是什麼？」。這一瞬間就是設計 bug。"
      >
        <div className="flex flex-col gap-2">
          <Rating value={4.5} readOnly precision="half" size="lg" aria-label="標準黃星" />
          <Label>✅ `var(--warning)` = yellow-6 — 世界級 convention</Label>
        </div>
      </Rule>

      <Rule
        title="填色 = 黃，空色 = 灰"
        note="空星用灰（`--color-neutral-4`）不用黃的淺色（yellow-2）——空星要表達「未選」不是「弱黃選」。灰色是跨系統的「empty / disabled」通用語。"
      >
        <div className="flex flex-col gap-2">
          <Rating value={3.5} readOnly precision="half" size="lg" aria-label="黃填灰空" />
          <Label>✅ filled = `--warning`，empty = `--color-neutral-4`</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 不要換成品牌 primary 色"
        note="Rating 是 evaluation convention color，跟 status color 共用 `--warning` 色相但語境不同——這是 documented 例外（見 color.spec.md）。不要為了『跟品牌一致』把 Rating 改藍 / 改綠，使用者不會認得。"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div style={{ color: 'var(--primary)' }} className="inline-flex">
              <Rating value={4.5} readOnly precision="half" size="lg" aria-label="誤用範例" icon={Star} />
            </div>
          </div>
          <Label warn>藍星讓使用者猶豫「這是什麼」→ 一瞬間流失 = 設計 bug</Label>
        </div>
      </Rule>
    </div>
  ),
}
