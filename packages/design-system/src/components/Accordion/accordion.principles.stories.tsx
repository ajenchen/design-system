import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './accordion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Accordion/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers(對齊 button.principles.stories.tsx 模式) ─────────────

const Rule = ({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && (
      <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">
        {note}
      </p>
    )}
    <div className="flex flex-col gap-3 max-w-[640px]">{children}</div>
  </div>
)

const Label = ({
  children,
  warn,
}: {
  children: React.ReactNode
  warn?: boolean
}) => (
  <p
    className={`text-footnote leading-normal ${
      warn ? 'text-error font-medium' : 'text-fg-muted'
    }`}
  >
    {children}
  </p>
)

// ── Stories ──────────────────────────────────────────────────────

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件(合併 WhenToUse + AccordionVsTabsRule) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Rule
        title="何時用 — 真實業務場景"
        note="Accordion 適合「多個獨立主題、使用者依興趣或當下需要展開單一段」的內容(非互斥可同時展開,Radix Accordion type='multiple');每段內容 self-contained,不展開不影響上下脈絡。對齊 Material 3 Expansion panel / Polaris Disclosure 共識。"
      >
        <ul className="space-y-1">
          <li>
            <LinkTo kind="Design System/Components/Accordion/展示" name="FAQ 常見問題"><span className="text-primary hover:underline font-medium cursor-pointer">FAQ 常見問題</span></LinkTo>
          </li>
          <li>
            <LinkTo kind="Design System/Components/Accordion/展示" name="設定分組"><span className="text-primary hover:underline font-medium cursor-pointer">設定分組</span></LinkTo>
          </li>
          <li>
            <LinkTo kind="Design System/Components/Accordion/展示" name="進階選項可隱藏"><span className="text-primary hover:underline font-medium cursor-pointer">進階選項可隱藏</span></LinkTo>
          </li>
        </ul>
      </Rule>

      <Rule
        title="vs Tabs — Tabs 是互斥平行視圖(看 A 就不看 B)"
        note='三個 tab 是「同一層級的平行視角」,使用者每次只需一個。切換等於「換視角」,兩個視角不會同時需要。'
      >
        <div className='border border-border rounded-lg p-4'>
          <Tabs defaultValue='overview'>
            <TabsList>
              <TabsTrigger value='overview'>總覽</TabsTrigger>
              <TabsTrigger value='members'>成員</TabsTrigger>
              <TabsTrigger value='settings'>設定</TabsTrigger>
            </TabsList>
            <TabsContent value='overview'>
              <p className='text-body text-fg-secondary'>專案總覽資訊</p>
            </TabsContent>
            <TabsContent value='members'>
              <p className='text-body text-fg-secondary'>成員列表</p>
            </TabsContent>
            <TabsContent value='settings'>
              <p className='text-body text-fg-secondary'>專案設定</p>
            </TabsContent>
          </Tabs>
        </div>
        <Label>✅ Tabs:視角切換,使用者「不會想同時看總覽和成員」</Label>
      </Rule>

      <Rule
        title='Accordion — 獨立收合多段(每段各自是否展開)'
        note='每個 item 是獨立主題,使用者依興趣選擇展開。不是互斥,而是「多段內容,多數時間只想看其中一段」。'
      >
        <Accordion type='single' collapsible>
          <AccordionItem value='pricing'>
            <AccordionTrigger>付款週期與折扣</AccordionTrigger>
            <AccordionContent>年付享 20% 折扣。</AccordionContent>
          </AccordionItem>
          <AccordionItem value='refund'>
            <AccordionTrigger>退款政策</AccordionTrigger>
            <AccordionContent>14 天內可全額退款。</AccordionContent>
          </AccordionItem>
          <AccordionItem value='support'>
            <AccordionTrigger>技術支援範圍</AccordionTrigger>
            <AccordionContent>企業方案提供 24/7 專屬窗口。</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label>✅ Accordion:各段主題獨立,使用者只想看其中 1-2 段</Label>
      </Rule>

      <Rule
        title='❌ 錯誤 — 用 Accordion 做平行視圖切換'
        note='三段內容結構相似、使用者只需其一——這是 Tabs 的情境。用 Accordion 會讓使用者困惑「為什麼要收合?」。'
      >
        <Accordion type='single' collapsible defaultValue='overview'>
          <AccordionItem value='overview'>
            <AccordionTrigger>總覽</AccordionTrigger>
            <AccordionContent>專案總覽資訊</AccordionContent>
          </AccordionItem>
          <AccordionItem value='members'>
            <AccordionTrigger>成員</AccordionTrigger>
            <AccordionContent>成員列表</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label warn>
          ⚠️ 平行視圖應該用 Tabs——Accordion 是「多段獨立內容」,不是「多個視角」
        </Label>
      </Rule>
    </div>
  ),
}

export const TypeRule: Story = {
  name: '單一展開 vs 多重展開',
  render: () => (
    <div>
      <Rule
        title='single + collapsible — FAQ / 使用教學'
        note='讀者一段一段看,同時看多段反而混亂。collapsible 讓使用者可把展開的再收起,回到乾淨的「全部收合」狀態。'
      >
        <Accordion type='single' collapsible>
          <AccordionItem value='q1'>
            <AccordionTrigger>如何取消訂閱?</AccordionTrigger>
            <AccordionContent>
              於「設定 → 帳單」點選取消。取消後資料保留 90 天供復用。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='q2'>
            <AccordionTrigger>資料可以匯出嗎?</AccordionTrigger>
            <AccordionContent>
              所有方案支援 CSV / JSON 匯出;企業方案另支援 API 批次匯出。
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label>參考:Stripe Pricing FAQ、Notion Help Center</Label>
      </Rule>

      <Rule
        title='multiple — 設定頁 / 工作 context(需同時比對)'
        note='使用者會同時打開「通知偏好」與「安全設定」對照;強制收合前一個反而阻礙工作。'
      >
        <Accordion type='multiple' defaultValue={['notifications']}>
          <AccordionItem value='notifications'>
            <AccordionTrigger>通知偏好</AccordionTrigger>
            <AccordionContent>Email 每日摘要、@提及立即通知。</AccordionContent>
          </AccordionItem>
          <AccordionItem value='security'>
            <AccordionTrigger>安全與登入</AccordionTrigger>
            <AccordionContent>兩步驟驗證:已啟用。</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label>參考:Jira Project Settings、Linear Workspace Settings</Label>
      </Rule>

      <Rule
        title='判斷法 — 「使用者會不會想同時看兩段?」'
        note='會 → multiple;不會 / 同時看反而混亂 → single。不確定時預設 single + collapsible(較保守,視覺負擔小)。'
      >
        <Label>single(推薦預設):FAQ、教學、說明文件</Label>
        <Label>multiple:Settings、多段 form、工作 context panel</Label>
      </Rule>
    </div>
  ),
}

export const NoNestingRule: Story = {
  name: '不可巢狀',
  render: () => (
    <div>
      <Rule
        title='❌ 不在 Accordion 內放另一個 Accordion'
        note='巢狀收合會讓使用者迷失方向——「我剛才收起的是哪一層?」。多層結構應該改用 TreeView(明確的層級視覺)或拆成獨立頁面。'
      >
        <Accordion type='single' collapsible>
          <AccordionItem value='outer'>
            <AccordionTrigger>外層:一般設定</AccordionTrigger>
            <AccordionContent>
              <Accordion type='single' collapsible>
                <AccordionItem value='inner-1'>
                  <AccordionTrigger>內層:顯示偏好</AccordionTrigger>
                  <AccordionContent>字級、主題⋯</AccordionContent>
                </AccordionItem>
                <AccordionItem value='inner-2'>
                  <AccordionTrigger>內層:鍵盤快捷鍵</AccordionTrigger>
                  <AccordionContent>快捷鍵列表⋯</AccordionContent>
                </AccordionItem>
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label warn>
          ⚠️ 使用者收起「顯示偏好」後,外層仍在展開狀態——容易讓人失去位置感
        </Label>
      </Rule>

      <Rule
        title='✅ 改用扁平結構 — 多段平行 Accordion'
        note='把所有分組拉到同一層。使用者看得到全部主題,依興趣展開,不會在層級中迷路。'
      >
        <Accordion type='multiple'>
          <AccordionItem value='display'>
            <AccordionTrigger>顯示偏好</AccordionTrigger>
            <AccordionContent>字級、主題、密度⋯</AccordionContent>
          </AccordionItem>
          <AccordionItem value='keyboard'>
            <AccordionTrigger>鍵盤快捷鍵</AccordionTrigger>
            <AccordionContent>自訂快捷鍵列表⋯</AccordionContent>
          </AccordionItem>
          <AccordionItem value='accessibility'>
            <AccordionTrigger>無障礙</AccordionTrigger>
            <AccordionContent>螢幕閱讀器、動畫減少⋯</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Rule>

      <Rule
        title='✅ 真的有層級需求 — 改用 TreeView'
        note='TreeView 提供明確的縮排與展開 icon,使用者從視覺就能判斷自己在第幾層。'
      >
        <Label>
          檔案樹、Notion-style 工作區 sidebar、深度分類頁面 → `../TreeView`
        </Label>
      </Rule>
    </div>
  ),
}

export const ContentRule: Story = {
  name: '內容限制',
  render: () => (
    <div>
      <Rule
        title='✅ 可放 — 文字說明、簡單表單欄位'
        note='Accordion 適合承載閱讀性內容或輕量輸入(e.g. 進階選項的文字欄位)。'
      >
        <Accordion type='single' collapsible>
          <AccordionItem value='form'>
            <AccordionTrigger>進階選項</AccordionTrigger>
            <AccordionContent>
              <div className='flex flex-col gap-3'>
                <div className='flex flex-col gap-1'>
                  <label className='text-body text-foreground'>專案識別碼</label>
                  <input
                    className='h-field-md border border-border rounded-md px-3 text-body'
                    placeholder='例:Q2-RELEASE'
                  />
                </div>
                <div className='flex flex-col gap-1'>
                  <label className='text-body text-foreground'>自訂網域</label>
                  <input
                    className='h-field-md border border-border rounded-md px-3 text-body'
                    placeholder='your-team.example.com'
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Rule>

      <Rule
        title='❌ 不放 — 會開啟浮層的焦點重互動'
        note='收合 Accordion 後,焦點會離開 content 內的元素——如果當下正在操作 Dialog / Popover / 複雜 form,使用者的操作流會斷。這類元素應該放在主頁面或獨立 section。'
      >
        <Accordion type='single' collapsible defaultValue='danger'>
          <AccordionItem value='danger'>
            <AccordionTrigger>危險操作區</AccordionTrigger>
            <AccordionContent>
              <Button variant='primary' danger>
                永久刪除工作區
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label warn>
          ⚠️ 刪除確認這種不可逆操作應該有獨立區塊 + Dialog 確認,不該藏在可收合 Accordion 裡
        </Label>
      </Rule>

      <Rule
        title='判斷法 — 「收合時使用者會不會正在操作 content 內的元素?」'
        note='會 → 不適合放 Accordion;不會(純閱讀 / 輕量輸入) → OK。'
      >
        <Label>✅ OK:FAQ 說明、設定欄位、進階選項 text input</Label>
        <Label>❌ 不行:Dialog trigger、複雜多步驟 form、需要焦點持續的互動</Label>
      </Rule>
    </div>
  ),
}

export const SingleItemRule: Story = {
  name: '單一 項目 不用 Accordion',
  render: () => (
    <div>
      <Rule
        title='❌ 只有一個區塊要收合 — 不該用 Accordion'
        note='Accordion 是「多個 item 可獨立收合」的 pattern,單 item 變成「為什麼要包一層?」。視覺上也過重(多出整條 border-b 分隔線)。'
      >
        <Accordion type='single' collapsible>
          <AccordionItem value='only'>
            <AccordionTrigger>顯示更多資訊</AccordionTrigger>
            <AccordionContent>單一可收合內容。</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Label warn>⚠️ 單 item Accordion = 過度使用元件</Label>
      </Rule>

      <Rule
        title='✅ 改用 `<details>` 或自組 toggle 按鈕'
        note='原生 `<details>` 是單區塊展開的 HTML 原語;若需要自訂視覺可做一個「顯示更多 ↓」按鈕。'
      >
        <details className='border-b border-divider pb-4'>
          <summary className='py-4 text-body font-medium text-foreground cursor-pointer'>
            顯示更多資訊
          </summary>
          <p className='text-body text-fg-secondary'>單一區塊用 details 即可。</p>
        </details>
        <Label>原生 HTML 簡潔,無須額外 JS</Label>
      </Rule>
    </div>
  ),
}
