// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { toast } from './toast'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Toast/設計原則',
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

// ── WhenToUse — 何時使用 Toast ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsAlertVsDialogRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Toast 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Toast/展示" name="有 Title + Description"><span className="text-primary hover:underline font-medium cursor-pointer">有 Title + Description</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Toast/展示" name="互動測試"><span className="text-primary hover:underline font-medium cursor-pointer">互動測試</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsAlertVsDialogRule — 原 VsAlertVsDialogRule */}
      <div>
      <Rule
        title="Toast — 短暫自動消失、非阻斷、不保留"
        note="操作結果回饋(儲存成功、已複製、訊息已送出)。使用者不需要看到也沒關係——不該阻斷流程。自動消失(預設 4000ms)"
      >
        <div className="flex gap-2 flex-wrap">
          <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已儲存', description: '變更已同步至雲端' })}>
            觸發成功 Toast
          </Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'info', title: '已複製連結', description: '已複製到剪貼簿' })}>
            觸發複製 Toast
          </Button>
        </div>
      </Rule>

      <Rule
        title="❌ 關鍵錯誤 / 警告：用 Alert + Dialog"
        note="Toast 會自動消失——如果使用者當下沒看到,錯過後無法再看到。關鍵訊息必須 persistent(Alert)或 modal 確認(Dialog)"
      >
        <Button
          variant="tertiary"
          onClick={() => toast({
            variant: 'error',
            title: '付款失敗',
            description: '您的信用卡已被拒絕,請更新付款方式',
            duration: 4000,
          })}
        >
          ❌ 付款失敗用 Toast
        </Button>
        <Label warn>↑ 4 秒後消失 → 使用者離開螢幕一下就錯過 → 用 Alert 持久顯示</Label>
      </Rule>

      <Rule
        title="❌ 需要使用者確認的動作：用 Dialog"
        note="「是否繼續？」這類必須 modal 才能承載的流程 Toast 無法做——toast 不阻斷且自動消失"
      >
        <Button
          variant="tertiary"
          onClick={() => toast({
            variant: 'warning',
            title: '是否刪除專案？',
            action: { label: '刪除', onClick: () => {} },
          })}
        >
          ❌ 刪除確認用 Toast
        </Button>
        <Label warn>↑ 破壞性動作靠 Toast action 確認 → 4 秒消失 / 點錯只能救 → 用 Dialog 聚焦確認</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const ActionRule: Story = {
  name: 'Action 使用場景（Undo pattern）',
  render: () => (
    <div>
      <Rule
        title="Toast action — 讓使用者短暫內復原"
        note="Undo pattern:執行後 toast 出現 + 「復原」按鈕,使用者有一段時間(預設 4 秒)可以反悔。Gmail / Linear / Slack 都用這個 pattern"
      >
        <Button
          variant="tertiary"
          onClick={() => toast({
            variant: 'success',
            title: '已刪除訊息',
            description: '訊息已移至封存',
            action: { label: '復原', onClick: () => toast({ variant: 'info', title: '已復原' }) },
          })}
        >
          刪除訊息(帶 Undo)
        </Button>
        <Label>↑ 點「刪除」不彈 Dialog 直接刪 + Toast,4 秒內可「復原」</Label>
      </Rule>

      <Rule
        title="Undo 的好處：避免每個動作都 Dialog 阻斷"
        note="傳統做法每個刪除都彈 Dialog 確認 → 使用者被反覆阻斷。Undo pattern 讓「未確認即執行」變得安全——錯了 4 秒內可救"
      >
        <Label>✓ 減少 Dialog 阻斷、提升速度、錯誤仍可挽救</Label>
      </Rule>

      <Rule
        title="❌ 重要不可逆動作用 Undo（不是所有動作都適合）"
        note="「永久刪除帳號」「清空整張表」這類真的無法復原的動作仍必須 Dialog 確認。Undo pattern 只用在「可還原」的動作"
      >
        <Label warn>判準:如果後端真的無法復原 → Dialog 確認;若是 soft delete 可復原 → Toast + Undo</Label>
      </Rule>
    </div>
  ),
}

export const VariantRule: Story = {
  name: 'Variant 選擇',
  render: () => (
    <div>
      <Rule
        title="success / info / warning / error 各自對應場景"
        note="跟 Alert 共用同一套 variant × theme 策略。語意由事件類型決定——不靠 consumer 用顏色暗示"
      >
        <div className="flex flex-col gap-2">
          <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已儲存' })}>success</Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'info', title: '已複製連結' })}>info</Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'warning', title: '空間即將用完' })}>warning</Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'error', title: '操作失敗' })}>error</Button>
        </div>
      </Rule>

      <Rule
        title="neutral — 無特定語意的資訊"
        note="公告、系統訊息、無明確 good/bad 的通知"
      >
        <Button variant="tertiary" onClick={() => toast({ variant: 'neutral', title: '檔案已下載' })}>neutral 範例</Button>
      </Rule>
    </div>
  ),
}

export const DurationRule: Story = {
  name: 'Duration 選擇',
  render: () => (
    <div>
      <Rule
        title="預設 4000ms — 足夠讀完一行但不拖累"
        note="多數場景用預設。使用者有足夠時間讀「已儲存」+ 考慮是否按「復原」。過短 = 來不及看,過長 = 堆積"
      >
        <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已儲存' })}>
          預設 4000ms
        </Button>
      </Rule>

      <Rule
        title="較長（7000-10000ms）— 內容較多或有 action"
        note="兩行描述 + undo action 需要更多時間。使用者讀完 + 判斷 + 點擊 action"
      >
        <Button
          variant="tertiary"
          onClick={() => toast({
            variant: 'success',
            title: '已刪除 3 個項目',
            description: '已移至回收桶,可以在 7 天內復原',
            action: { label: '復原', onClick: () => {} },
            duration: 7000,
          })}
        >
          較長 duration(有 description + action)
        </Button>
      </Rule>

      <Rule
        title="❌ 極長 duration（> 15000ms）或 duration=Infinity"
        note="Toast 長時間停留會堆積,而且使用者注意力已轉移。持久訊息用 Alert,不是 Toast"
      >
        <Label warn>Toast 不該永遠停留——真的需要 persistent 用 Alert</Label>
      </Rule>
    </div>
  ),
}
