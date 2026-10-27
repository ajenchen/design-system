// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: Merged WhenToUse + WhenNotToUse + NotLoadingNotErrorRule
// into a single `UsageGuidance` story (3 sections — 何時用 / 何時不用 + 替代 / vs 近親)
// per 2026-04-26 user mandate. NextActionRule / StructureRule / CopyRule kept as
// separate principles.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { FolderOpen, Inbox, WifiOff, FileText, Users, BarChart3, Mail } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { Alert } from '@/design-system/components/Alert/alert'
import { Skeleton } from '@/design-system/components/Skeleton/skeleton'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta = {
  title: 'Design System/Components/Empty/設計原則',
  parameters: { layout: 'padded' },
  // Toaster 是 app 層 Provider(toast.spec.md:consumer 在 app root 放一次)—— 放在 story 外層,不當成教學頁裡的一塊(同 Toast 設計原則頁)
  decorators: [(Story) => (<><Story /><Toaster /></>)],
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true })

// 範例欄寬(只限寬、不畫框):2026-10-27 前這裡是手刻的有框容器(邊框 + 圓角 + 32px 內距)—— DS 沒有這個元件,
// 它只是把 Empty 圈起來(ssot F 規範缺口第 2 條、F-S3「已經有的元件就直接用不要再亂造輪子」);Empty 放在真的容器裡的樣子見「展示」(DataTable 空狀態)。
const Example = ({ children }: { children: React.ReactNode }) => <div className="max-w-md">{children}</div>

/** 範例裡的按鈕做它說的那件事:建立 / 匯入這類動作送出後跳 Toast(稽核 L020「建立 → 開 Dialog 或跳 Toast」;user 2026-09-08 F-S2 看得到的按鈕都要能動) */
const done = (title: string) => () => toast({ variant: 'success', title })

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 Empty 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li>
              <StoryLink kind="Design System/Components/Empty/展示" name="搜尋無結果">搜尋無結果</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Components/Empty/展示" name="空清單">空清單</StoryLink>
            </li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 不用 Empty 做載入中狀態"
          note="Empty 是「確定沒有」。載入中 → Skeleton / CircularProgress。Notion 首次開啟資料庫時先 Skeleton,載完才變 Empty 或有資料"
        >
          <ExampleCaption warn>載入中 → Skeleton / CircularProgress,不是 Empty</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不用 Empty 做錯誤或失敗狀態"
          note="Empty 是中性提示。錯誤改用 Alert + 重試按鈕。Stripe 付款失敗用 Alert,不用 Empty"
        >
          <Example>
            <Empty
              icon={WifiOff}
              title="沒有資料"
              description="無法載入"
            />
          </Example>
          <ExampleCaption warn>↑ 錯誤用 Empty 傳達不出「這是問題」的緊迫感 → 應改用 Alert variant=error</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不用 Empty 做整頁級 404 / 無權限"
          note="整頁錯誤需要完整頁面佈局(navigation + hero 錯誤訊息)。Empty 是容器內提示。GitHub 的 404 頁是整頁設計"
        >
          <ExampleCaption warn>整頁 404 → 專屬錯誤頁面設計,Empty 只用容器內</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不用 Empty 表達 disabled 狀態"
          note="Disabled 是「禁用元件」的視覺,不是「沒內容」的提示。改用禁用該元件本身。Toggle off 的搜尋結果不用 Empty,而是禁用 SearchInput"
        >
          <ExampleCaption warn>禁用 → disable 元件本身,不用 Empty</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Skeleton — 短暫 loading,不是 Empty"
          note="Empty 代表「已經查過、確定沒有」;loading 是「還沒查完、不確定有沒有」。直接顯示 Empty 會讓使用者以為資料真的沒有,然後一秒後內容跳出來,視覺跳動破壞信任"
        >
          <Example>
            {/* @layout-space-magic-ok: 骨架文字行之間(同一文字區的 micro)(layoutSpace.spec.md:166 micro) */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Example>
          <ExampleCaption>↑ 資料還在載入 → Skeleton 保留版面輪廓,不誤導「這裡沒東西」</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="Alert — 錯誤 / 失敗,不是 Empty"
          note="錯誤需要明確說明「發生什麼問題」+「如何解決」,並傳達可處理的語意。Empty 是中性的「暫時沒有」,沒辦法傳達錯誤的嚴重性"
        >
          <div className="max-w-md">
            <Alert
              variant="error"
              title="連線中斷,無法載入最新資料"
              description="請檢查網路連線後重試。你看到的是快取資料。"
            />
          </div>
          <ExampleCaption>↑ 錯誤用 Alert (variant=error) 明確標示問題 + 解決路徑</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="判斷法"
          note="使用者卡住但確定沒資料 → Empty;還在載入 → Skeleton;發生錯誤需要明確處理 → Alert"
        >
          <Example>
            <Empty
              icon={FileText}
              title="沒有待審核的請款單"
              description="同事送出新的請款單後,會出現在這裡"
            />
          </Example>
          <ExampleCaption>↑ Empty 的代表案例:已經查過、確定沒有,並說清楚之後怎麼會有</ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const NextActionRule: Story = {
  name: 'Empty 必須提示下一步動作',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 告訴使用者「接下來可以做什麼」"
        note="空狀態是使用者卡住的時刻——此時最需要引導。action 不一定要是 primary button,但要讓使用者知道有明確出路(建立、重試、調整過濾)。世界級 SaaS(Jira / Notion / Linear)的空狀態都不是 dead-end"
      >
        <Example>
          <Empty
            icon={FolderOpen}
            title="還沒有任何專案"
            description="建立第一個專案,開始規劃團隊工作"
            action={<Button variant="primary" onClick={done('專案已建立')}>建立專案</Button>}
          />
        </Example>
        <ExampleCaption>↑ 「建立專案」是明確下一步,使用者不會卡住</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="✅ 搜尋無結果 → 調整篩選的出路"
        note="搜尋 / 篩選無結果時,使用者卡在「我查不到東西」——action 應是「清除篩選」/「調整關鍵字」等可回退動作,不是建立新資料"
      >
        <ExampleCaption>
          完整的例子:{' '}<StoryLink kind="Design System/Components/Empty/展示" name="搜尋無結果">搜尋無結果</StoryLink>(清除搜尋 → 訂單回來)
        </ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 純提示不給出路 — dead-end 空狀態"
        note="只告訴使用者「沒資料」但不說接下來能做什麼,使用者卡住。即使是 table 空狀態,也應至少提示如何開始(建立 / 匯入 / 調整)"
      >
        <Example>
          <Empty icon={Inbox} description="沒有任何資料" />
        </Example>
        <ExampleCaption warn>
          ↑ 「沒有資料」後沒有下一步 — 使用者不知道該做什麼
        </ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const StructureRule: Story = {
  name: '圖示 + 標題 + 說明 + 動作的結構',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="完整結構 — 越重要的初次引導,slot 越完整"
        note="icon 快速建立情境、title 說明「這裡是什麼」、description 補充「怎麼用」、action 給下一步。首次引導(onboarding empty)通常需要完整 slot;日常空狀態(filter 無結果)可只有 icon + description"
      >
        <Example>
          <Empty
            icon={Mail}
            title="還沒有任何發票"
            description="把信箱裡的電子發票匯進來,系統會自動辨識金額與日期"
            action={<Button variant="primary" onClick={done('已開始從信箱匯入發票,完成後會通知你')}>從信箱匯入發票</Button>}
          />
        </Example>
      </TutorialRule>

      <TutorialRule
        title="最多一個 primary action"
        note="Empty 是單一引導時刻,超過一個 primary 會讓使用者不知道先做什麼。"
      >
        <Example>
          <Empty
            icon={BarChart3}
            title="還沒有任何報表"
            description="從範本快速建立,或自己挑要看的欄位"
            action={
              <ButtonGroup>
                <Button variant="tertiary" onClick={done('已用「每週營收」範本建立報表')}>從範本</Button>
                <Button variant="primary" onClick={done('已建立空白報表')}>自訂報表</Button>
              </ButtonGroup>
            }
          />
        </Example>
        <ExampleCaption>↑ 兩個動作時,主要路徑仍只有一個 primary,次要用 tertiary</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 兩個 primary button 並存"
        note="兩個 primary → 使用者無法辨識主次 → 決策疲勞"
      >
        <Example>
          <Empty
            icon={Users}
            title="還沒有聯絡人"
            description="選一個方式開始"
            action={
              <ButtonGroup>
                <Button variant="primary" onClick={done('已開始匯入聯絡人')}>匯入聯絡人</Button>
                <Button variant="primary" onClick={done('聯絡人已新增')}>新增聯絡人</Button>
              </ButtonGroup>
            }
          />
        </Example>
        <ExampleCaption warn>↑ 兩個 primary 視覺重量相同,使用者無從判斷</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const CopyRule: Story = {
  name: '文案具體化 — 不用通用字',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 具體情境 + 下一步動作"
        note="title 告訴使用者「這個容器是什麼 + 為什麼空」;description 告訴「怎麼讓它不空」。文案與場景綁定,不可跨元件通用"
      >
        <Example>
          <Empty
            icon={Inbox}
            title="收件匣已清空"
            description="所有訊息都處理完畢,可以好好休息了"
          />
        </Example>
      </TutorialRule>

      <TutorialRule
        title="✅ Onboarding 語氣 — 帶情境引導"
        note="第一次使用的 empty 應該讓人「期待」而不是「遺憾」。對齊 Notion / Linear 的語氣 — 提供 context + 給出口"
      >
        <Example>
          <Empty
            icon={Users}
            title="還沒有建立任何團隊"
            description="建立團隊後,就能看到大家的進度、一起討論"
            action={<Button variant="primary" onClick={done('團隊已建立')}>建立團隊</Button>}
          />
        </Example>
      </TutorialRule>

      <TutorialRule
        title="❌ Generic 字串 — No data / Empty / 無資料"
        note="「No data」「Empty」「無資料」是系統語言,不是使用者語言。這類文案讓 empty 看起來像是 bug 或 debug 訊息,而不是一個情境提示"
      >
        <Example>
          <Empty description="No data" />
        </Example>
        <ExampleCaption warn>↑ 使用者看不懂「No data」代表什麼——沒有哪個資料?要怎麼補?</ExampleCaption>

        <Example>
          <Empty icon={Inbox} title="Empty" description="No records found" />
        </Example>
        <ExampleCaption warn>↑ 「Empty / No records found」純技術語,不傳達使用者情境</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
