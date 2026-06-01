// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: Merged WhenToUse + WhenNotToUse + NotLoadingNotErrorRule
// into a single `UsageGuidance` story (3 sections — 何時用 / 何時不用 + 替代 / vs 近親)
// per 2026-04-26 user mandate. NextActionRule / StructureRule / CopyRule kept as
// separate principles.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { SearchX, FolderOpen, Inbox, WifiOff } from 'lucide-react'
import { Empty } from './empty'
import { Button } from '@/design-system/components/Button/button'
import { Alert } from '@/design-system/components/Alert/alert'
import { Skeleton } from '@/design-system/components/Skeleton/skeleton'

const meta: Meta = {
  title: 'Design System/Components/Empty/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-4">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Frame = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`border border-border rounded-lg p-8 max-w-md ${className ?? ''}`}>{children}</div>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>適合 Empty 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/Empty/展示" name="搜尋無結果"><span className="text-primary hover:underline font-medium cursor-pointer">搜尋無結果</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Empty/展示" name="空清單"><span className="text-primary hover:underline font-medium cursor-pointer">空清單</span></LinkTo>
            </li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 不用 Empty 做載入中狀態"
          note="Empty 是「確定沒有」。載入中 → Skeleton / CircularProgress。Notion 首次開啟資料庫時先 Skeleton,載完才變 Empty 或有資料"
        >
          <Label warn>載入中 → Skeleton / CircularProgress,不是 Empty</Label>
        </Rule>

        <Rule
          title="❌ 不用 Empty 做錯誤或失敗狀態"
          note="Empty 是中性提示。錯誤改用 Alert + 重試按鈕。Stripe 付款失敗用 Alert,不用 Empty"
        >
          <Frame>
            <Empty
              icon={WifiOff}
              title="沒有資料"
              description="無法載入"
              action={<Button variant="secondary">重新載入</Button>}
            />
          </Frame>
          <Label warn>↑ 錯誤用 Empty 傳達不出「這是問題」的緊迫感 → 應改用 Alert variant=error</Label>
        </Rule>

        <Rule
          title="❌ 不用 Empty 做整頁級 404 / 無權限"
          note="整頁錯誤需要完整頁面佈局(navigation + hero 錯誤訊息)。Empty 是容器內提示。GitHub 的 404 頁是整頁設計"
        >
          <Label warn>整頁 404 → 專屬錯誤頁面設計,Empty 只用容器內</Label>
        </Rule>

        <Rule
          title="❌ 不用 Empty 表達 disabled 狀態"
          note="Disabled 是「禁用元件」的視覺,不是「沒內容」的提示。改用禁用該元件本身。Toggle off 的搜尋結果不用 Empty,而是禁用 SearchInput"
        >
          <Label warn>禁用 → disable 元件本身,不用 Empty</Label>
        </Rule>
      </Section>

      <Section title="vs 近親 — Empty / Skeleton / Alert">
        <Rule
          title="Skeleton — 短暫 loading,不是 Empty"
          note="Empty 代表「已經查過、確定沒有」;loading 是「還沒查完、不確定有沒有」。直接顯示 Empty 會讓使用者以為資料真的沒有,然後一秒後內容跳出來,視覺跳動破壞信任"
        >
          <Frame>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Frame>
          <Label>↑ 資料還在載入 → Skeleton 保留版面輪廓,不誤導「這裡沒東西」</Label>
        </Rule>

        <Rule
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
          <Label>↑ 錯誤用 Alert (variant=error) 明確標示問題 + 解決路徑</Label>
        </Rule>

        <Rule
          title="判斷法"
          note="使用者卡住但確定沒資料 → Empty;還在載入 → Skeleton;發生錯誤需要明確處理 → Alert"
        >
          <Frame>
            <Empty
              icon={SearchX}
              title="找不到相符的任務"
              description="試試其他關鍵字,或調整篩選條件"
              action={<Button variant="tertiary">清除所有篩選</Button>}
            />
          </Frame>
          <Label>↑ Empty 的代表案例:有結果預期、沒有結果、需要明確下一步</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const NextActionRule: Story = {
  name: 'Empty 必須提示下一步動作',
  render: () => (
    <div>
      <Rule
        title="✅ 告訴使用者「接下來可以做什麼」"
        note="空狀態是使用者卡住的時刻——此時最需要引導。action 不一定要是 primary button,但要讓使用者知道有明確出路(建立、重試、調整過濾)。世界級 SaaS(Jira / Notion / Linear)的空狀態都不是 dead-end"
      >
        <Frame>
          <Empty
            icon={FolderOpen}
            title="還沒有任何專案"
            description="建立第一個專案,開始規劃團隊工作"
            action={<Button variant="primary">建立專案</Button>}
          />
        </Frame>
        <Label>↑ 「建立專案」是明確下一步,使用者不會卡住</Label>
      </Rule>

      <Rule
        title="✅ 搜尋無結果 → 調整篩選的出路"
        note="搜尋 / 篩選無結果時,使用者卡在「我查不到東西」——action 應是「清除篩選」/「調整關鍵字」等可回退動作,不是建立新資料"
      >
        <Frame>
          <Empty
            icon={SearchX}
            title="找不到相符的任務"
            description="試試其他關鍵字,或調整篩選條件"
            action={<Button variant="tertiary">清除所有篩選</Button>}
          />
        </Frame>
      </Rule>

      <Rule
        title="❌ 純提示不給出路 — dead-end 空狀態"
        note="只告訴使用者「沒資料」但不說接下來能做什麼,使用者卡住。即使是 table 空狀態,也應至少提示如何開始(建立 / 匯入 / 調整)"
      >
        <Frame>
          <Empty icon={Inbox} description="沒有任何資料" />
        </Frame>
        <Label warn>
          ↑ 「沒有資料」後沒有下一步 — 使用者不知道該做什麼
        </Label>
      </Rule>
    </div>
  ),
}

export const StructureRule: Story = {
  name: '圖示 + 標題 + 說明 + 動作 結構',
  render: () => (
    <div>
      <Rule
        title="完整結構 — 越重要的初次引導,slot 越完整"
        note="icon 快速建立情境、title 說明「這裡是什麼」、description 補充「怎麼用」、action 給下一步。首次引導(onboarding empty)通常需要完整 slot;日常空狀態(filter 無結果)可只有 icon + description"
      >
        <Frame>
          <Empty
            icon={FolderOpen}
            title="還沒有任何專案"
            description="建立第一個專案,邀請團隊成員協作追蹤進度"
            action={<Button variant="primary">建立專案</Button>}
          />
        </Frame>
      </Rule>

      <Rule
        title="最多一個 primary action"
        note="Empty 是單一引導時刻,超過一個 primary 會讓使用者不知道先做什麼。若真的有多個並列動作,用 secondary + tertiary 配對 — 但盡量避免"
      >
        <Frame>
          <Empty
            icon={FolderOpen}
            title="開始你的第一個專案"
            description="從範本快速建立,或自己從零規劃"
            action={
              <div className="flex gap-2">
                <Button variant="tertiary">從範本</Button>
                <Button variant="primary">從零建立</Button>
              </div>
            }
          />
        </Frame>
        <Label>↑ 兩個動作時,主要路徑仍只有一個 primary,次要用 tertiary</Label>
      </Rule>

      <Rule
        title="❌ 兩個 primary button 並存"
        note="兩個 primary → 使用者無法辨識主次 → 決策疲勞"
      >
        <Frame>
          <Empty
            icon={FolderOpen}
            title="還沒有專案"
            description="選一個方式開始"
            action={
              <div className="flex gap-2">
                <Button variant="primary">匯入資料</Button>
                <Button variant="primary">建立新專案</Button>
              </div>
            }
          />
        </Frame>
        <Label warn>↑ 兩個 primary 視覺重量相同,使用者無從判斷</Label>
      </Rule>
    </div>
  ),
}

export const CopyRule: Story = {
  name: '文案具體化 — 不用 通用 字',
  render: () => (
    <div>
      <Rule
        title="✅ 具體情境 + 下一步動作"
        note="title 告訴使用者「這個容器是什麼 + 為什麼空」;description 告訴「怎麼讓它不空」。文案與場景綁定,不可跨元件通用"
      >
        <Frame>
          <Empty
            icon={Inbox}
            title="收件匣已清空"
            description="所有訊息都處理完畢,可以好好休息了"
          />
        </Frame>
      </Rule>

      <Rule
        title="✅ Onboarding 語氣 — 帶情境引導"
        note="第一次使用的 empty 應該讓人「期待」而不是「遺憾」。對齊 Notion / Linear 的語氣 — 提供 context + 給出口"
      >
        <Frame>
          <Empty
            icon={FolderOpen}
            title="還沒有任何專案"
            description="建立第一個專案,邀請團隊成員協作追蹤進度"
            action={<Button variant="primary">建立專案</Button>}
          />
        </Frame>
      </Rule>

      <Rule
        title="❌ Generic 字串 — No data / Empty / 無資料"
        note="「No data」「Empty」「無資料」是系統語言,不是使用者語言。這類文案讓 empty 看起來像是 bug 或 debug 訊息,而不是一個情境提示"
      >
        <Frame>
          <Empty description="No data" />
        </Frame>
        <Label warn>↑ 使用者看不懂「No data」代表什麼——沒有哪個資料?要怎麼補?</Label>

        <Frame>
          <Empty icon={Inbox} title="Empty" description="No records found" />
        </Frame>
        <Label warn>↑ 「Empty / No records found」純技術語,不傳達使用者情境</Label>
      </Rule>
    </div>
  ),
}
