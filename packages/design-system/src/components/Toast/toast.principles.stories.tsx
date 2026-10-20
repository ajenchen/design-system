// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { toast, Toaster } from './toast'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { TutorialPage, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Toast/設計原則',
  parameters: { layout: 'padded' },
  // Toaster 是 app 層 Provider(toast.spec.md:consumer 在 app root 放一次)—— 放在 story 外層,不當成教學頁裡的一塊
  //(放在 TutorialPage 裡會佔一格塊距,頁尾多出 loose × 2 的空白)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
}
export default meta
type Story = StoryObj

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const TutorialRule = createTutorialRule({ caption: Label, examplesClassName: 'max-w-md' })

// ── WhenToUse — 何時使用 Toast ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsAlertVsDialogRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      {/* 何時用 — 原 WhenToUse */}
      <div className="max-w-prose">
      <p>適合 Toast 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Toast/展示" name="有標題與描述"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">有 Title + Description</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Toast/展示" name="點擊觸發通知"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">點擊觸發通知</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時:先看下方「何時用 / 何時不用」的對照;若訊息重要到使用者必須看到、或需要使用者確認,就不該用 Toast,改用 Alert(持久顯示)或 Dialog(阻斷確認)。</p>
    </div>

      {/* vs 近親 — VsAlertVsDialogRule — 原 VsAlertVsDialogRule */}
      <>
      <TutorialRule
        title="Toast — 短暫自動消失、非阻斷、不保留"
        note="操作結果回饋(儲存成功、已複製、訊息已送出)。使用者不需要看到也沒關係——不該阻斷流程。自動消失(預設 4000ms)"
      >
        <ButtonGroup>
          <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已儲存', description: '變更已同步至雲端' })}>
            觸發成功 Toast
          </Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'info', title: '已複製連結', description: '已複製到剪貼簿' })}>
            觸發複製 Toast
          </Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule
        title="❌ 關鍵錯誤 / 警告：用 Alert + Dialog"
        note="Toast 會自動消失——如果使用者當下沒看到,錯過後無法再看到。關鍵訊息必須 persistent(Alert)或 modal 確認(Dialog)"
      >
        <Button
          variant="tertiary"
          className="self-start"
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
      </TutorialRule>

      <TutorialRule
        title="❌ 需要使用者確認的動作：用 Dialog"
        note="「是否繼續？」這類必須 modal 才能承載的流程 Toast 無法做——toast 不阻斷且自動消失"
      >
        <Button
          variant="tertiary"
          className="self-start"
          onClick={() => toast({
            variant: 'warning',
            title: '是否刪除專案？',
            action: { label: '刪除', onClick: () => {} },
          })}
        >
          ❌ 刪除確認用 Toast
        </Button>
        <Label warn>↑ 破壞性動作靠 Toast action 確認 → 10 秒後仍消失 / 點錯只能救 → 用 Dialog 聚焦確認</Label>
      </TutorialRule>
    </>
    </TutorialPage>
  ),
}

export const ActionRule: Story = {
  name: '動作 使用場景(復原 模式)',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Toast action — 讓使用者短暫內復原"
        note="動作完成後顯示 Toast 與「復原」按鈕，讓使用者在含 action 的預設 10 秒內反悔。只有後端確實能還原的動作才適合這個模式"
      >
        <Button
          variant="tertiary"
          className="self-start"
          onClick={() => toast({
            variant: 'success',
            title: '已刪除訊息',
            description: '訊息已移至封存',
            action: { label: '復原', onClick: () => toast({ variant: 'info', title: '已復原' }) },
          })}
        >
          刪除訊息(帶 Undo)
        </Button>
        <Label>↑ 點「刪除」不彈 Dialog 直接刪 + Toast,10 秒內可「復原」</Label>
      </TutorialRule>

      <TutorialRule
        title="Undo 的好處：避免每個動作都 Dialog 阻斷"
        note="傳統做法每個刪除都彈 Dialog 確認 → 使用者被反覆阻斷。Undo pattern 讓「未確認即執行」變得安全——錯了 10 秒內可救"
      >
        <Label>✅ 減少 Dialog 阻斷、提升速度、錯誤仍可挽救</Label>
      </TutorialRule>

      <TutorialRule
        title="❌ 重要不可逆動作用 Undo（不是所有動作都適合）"
        note="「永久刪除帳號」「清空整張表」這類真的無法復原的動作仍必須 Dialog 確認。Undo pattern 只用在「可還原」的動作"
      >
        <Label warn>判準:如果後端真的無法復原 → Dialog 確認;若是 soft delete 可復原 → Toast + Undo</Label>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const VariantRule: Story = {
  name: '變體 選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="success / info / warning / error 各自對應場景"
        note="與 Alert 共用 Notice primitive 與三層 theme 架構(variant × theme 映射各自不同,如 success:Toast 反轉 surface / Alert solid 綠底)。語意由事件類型決定——不靠 consumer 用顏色暗示"
      >
        {/* 直排的一組觸發鈕 = 垂直 ButtonGroup(鈕與鈕之間由群組擁有,button-group.tsx;直排時撐滿欄寬是群組的正規行為) */}
        <ButtonGroup orientation="vertical">
          {/* 觸發鈕寫使用者真的會按的動作(story-rules「範例必真實業務場景」);各自觸發的 Toast 就是該 variant 的樣子。
              2026-10-20 前四顆鈕直接寫 success / info / warning / error(獨立驗證 OV-14) */}
          <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已儲存' })}>儲存變更</Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'info', title: '已複製連結' })}>複製連結</Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'warning', title: '空間即將用完' })}>上傳大型檔案</Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'error', title: '上傳失敗' })}>上傳檔案</Button>
        </ButtonGroup>
      </TutorialRule>

      <TutorialRule
        title="neutral — 無特定語意的資訊"
        note="公告、系統訊息、無明確 good/bad 的通知"
      >
        <Button variant="tertiary" className="self-start" onClick={() => toast({ variant: 'neutral', title: '檔案已下載' })}>下載檔案</Button>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const DurationRule: Story = {
  name: '持續時間 選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="預設 4000ms(無 action)— 足夠讀完一行但不拖累"
        note="多數場景用預設。使用者有足夠時間讀「已儲存」。過短 = 來不及看,過長 = 堆積"
      >
        <Button variant="tertiary" className="self-start" onClick={() => toast({ variant: 'success', title: '已儲存' })}>
          預設 4000ms
        </Button>
      </TutorialRule>

      <TutorialRule
        title="有 action → 預設自動加長為 10000ms"
        note="兩行描述與 undo action 需要更多時間，也要留給鍵盤使用者 Tab 到 action；鍵盤焦點不會暫停倒數。有 action 時預設 duration 為 10000ms，無需手動指定，內容特別多時才覆寫"
      >
        <Button
          variant="tertiary"
          className="self-start"
          onClick={() => toast({
            variant: 'success',
            title: '已刪除 3 個項目',
            description: '已移至回收桶,可以在 7 天內復原',
            action: { label: '復原', onClick: () => {} },
          })}
        >
          較長 duration(有 description + action,預設 10000ms)
        </Button>
      </TutorialRule>

      <TutorialRule
        title="❌ 極長 duration（> 15000ms）或 duration=Infinity"
        note="Toast 長時間停留會堆積,而且使用者注意力已轉移。持久訊息用 Alert,不是 Toast"
      >
        <Label warn>Toast 不該永遠停留——真的需要 persistent 用 Alert</Label>
      </TutorialRule>
    </TutorialPage>
  ),
}
