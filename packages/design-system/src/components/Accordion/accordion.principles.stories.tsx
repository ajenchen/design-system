import type { Meta, StoryObj } from '@storybook/react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './accordion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Accordion/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-[640px]' })

// ── Stories ──────────────────────────────────────────────────────

// ── UsageGuidance — 何時用 / 何時不用 / 和相近元件怎麼選(固定三段,tutorial-page.tsx USAGE_SECTION_TITLES)──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>多個獨立主題、使用者依當下需要展開其中一段的內容:每段自成一體,不展開也不影響上下文(Material 3 Expansion panel / Polaris Disclosure 同樣定位)。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Accordion/展示" name="FAQ 常見問題">FAQ 常見問題</StoryLink> —— 預設全部收合,讀者展開有興趣的那一題</li>
          <li><StoryLink kind="Design System/Components/Accordion/展示" name="設定分組">設定分組</StoryLink> —— 一般 / 通知 / 安全等多段設定,長表單拆段</li>
          <li><StoryLink kind="Design System/Components/Accordion/展示" name="進階選項可隱藏">進階選項可隱藏</StoryLink> —— 主要欄位攤開,進階選項收起來減輕負擔</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>只有一個區塊要收合 → 改用原生 <code>&lt;details&gt;</code> 或自組開合按鈕(見「<StoryLink kind="Design System/Components/Accordion/設計原則" name="單一 項目 不用 Accordion">單一項目不用 Accordion</StoryLink>」)</li>
          <li>同一塊空間切換平行視圖(三選一)→ 改用 Tabs:Tabs 是互斥切換,Accordion 是各段獨立收合</li>
          <li>多層的導覽 / 檔案樹 → 改用 TreeView 或 Sidebar:Accordion 沒有巢狀層級</li>
          <li>收合整個浮層或側欄 → 改用 Dialog / Sheet / Popover:那是浮層開關,不是內文收合</li>
          <li>長清單只先顯示幾筆 → 改用「顯示更多」按鈕:Accordion 不是「更多 / 更少」</li>
          <li>走完一條流程、要標出目前在哪一步 → 改用 Steps:Accordion 沒有「目前這一步」,開合不代表進度</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="vs Tabs — Tabs 是互斥平行視圖(看 A 就不看 B)"
          note='三個 tab 是「同一層級的平行視角」,使用者每次只需一個。切換等於「換視角」,兩個視角不會同時需要。'
        >
          <div className='border border-border rounded-lg p-[var(--layout-space-loose)]'>
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
          <ExampleCaption>✅ Tabs:視角切換,使用者「不會想同時看總覽和成員」</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title='Accordion — 獨立收合多段(每段各自是否展開)'
          note='每個 item 是獨立主題,使用者依興趣選擇展開。不是互斥,而是「多段內容,多數時間只想看其中一段」。'
        >
          <Accordion type='multiple'>
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
          <ExampleCaption>✅ Accordion:各段主題獨立,使用者只想看其中 1-2 段</ExampleCaption>
        </TutorialRule>

        <TutorialRule
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
          <ExampleCaption warn>
            ❌ 平行視圖應該用 Tabs——Accordion 是「多段獨立內容」,不是「多個視角」
          </ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const TypeRule: Story = {
  name: '單一展開 vs 多重展開',
  render: () => (
    <TutorialPage>
      <TutorialRule
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
        <ExampleCaption>參考:Stripe Pricing FAQ、Notion Help Center</ExampleCaption>
      </TutorialRule>

      <TutorialRule
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
        <ExampleCaption>參考:Jira Project Settings、Linear Workspace Settings</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title='判斷法 — 「使用者會不會想同時看兩段?」'
        note='會 → multiple;不會 / 同時看反而混亂 → single。不確定時預設 single + collapsible(較保守,視覺負擔小)。'
      >
        <ExampleCaption>single(推薦預設):FAQ、教學、說明文件</ExampleCaption>
        <ExampleCaption>multiple:Settings、多段 form、工作 context panel</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const NoNestingRule: Story = {
  name: '不可巢狀',
  render: () => (
    <TutorialPage>
      <TutorialRule
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
        <ExampleCaption warn>
          ❌ 使用者收起「顯示偏好」後,外層仍在展開狀態——容易讓人失去位置感
        </ExampleCaption>
      </TutorialRule>

      <TutorialRule
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
      </TutorialRule>

      <TutorialRule
        title='✅ 真的有層級需求 — 改用 TreeView'
        note='TreeView 提供明確的縮排與展開 icon,使用者從視覺就能判斷自己在第幾層。'
      >
        <ExampleCaption>
          檔案樹、Notion 式工作區側欄、深層分類頁面 → 改用 TreeView
        </ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const ContentRule: Story = {
  name: '內容限制',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title='✅ 可放 — 文字說明、簡單表單欄位'
        note='Accordion 適合承載閱讀性內容或輕量輸入(e.g. 進階選項的文字欄位)。多段獨立設定各自收合(type="multiple"),不是單一 item——單一區塊該用 details(見「單一項目不用 Accordion」)。'
      >
        <Accordion type='multiple'>
          <AccordionItem value='deploy'>
            <AccordionTrigger>進階部署設定</AccordionTrigger>
            <AccordionContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>專案識別碼</FieldLabel>
                  <Input placeholder='例:Q2-RELEASE' />
                </Field>
                <Field>
                  <FieldLabel>自訂網域</FieldLabel>
                  <Input placeholder='your-team.example.com' />
                </Field>
              </FieldGroup>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='seo'>
            <AccordionTrigger>SEO 與中繼資料</AccordionTrigger>
            <AccordionContent>
              <Field>
                <FieldLabel>頁面標題</FieldLabel>
                <Input placeholder='顯示於瀏覽器分頁與搜尋結果' />
              </Field>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </TutorialRule>

      <TutorialRule
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
        <ExampleCaption warn>
          ❌ 刪除確認這種不可逆操作應該有獨立區塊 + Dialog 確認,不該藏在可收合 Accordion 裡
        </ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title='判斷法 — 「收合時使用者會不會正在操作 content 內的元素?」'
        note='會 → 不適合放 Accordion;不會(純閱讀 / 輕量輸入) → OK。'
      >
        <ExampleCaption>✅ OK:FAQ 說明、設定欄位、進階選項 text input</ExampleCaption>
        <ExampleCaption>❌ 不行:Dialog trigger、複雜多步驟 form、需要焦點持續的互動</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const SingleItemRule: Story = {
  name: '單一 項目 不用 Accordion',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title='❌ 只有一個區塊要收合 — 不該用 Accordion'
        note='Accordion 是「多個 item 可獨立收合」的 pattern,單 item 變成「為什麼要包一層?」。視覺上也過重(多出整條 border-b 分隔線)。'
      >
        <Accordion type='single' collapsible>
          <AccordionItem value='only'>
            <AccordionTrigger>顯示更多資訊</AccordionTrigger>
            <AccordionContent>單一可收合內容。</AccordionContent>
          </AccordionItem>
        </Accordion>
        <ExampleCaption warn>❌ 單 item Accordion = 過度使用元件</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title={<>✅ 改用 <code>&lt;details&gt;</code> 或自組 toggle 按鈕</>}
        note={<>原生 <code>&lt;details&gt;</code> 是單區塊展開的 HTML 原語;若需要自訂視覺可做一個「顯示更多 ↓」按鈕。</>}
      >
        {/* 原生 details 不抄 Accordion 的整條分隔線 / 列內距(accordion.tsx 的 AccordionTrigger 上下 16px、AccordionContent 底部 16px)——
            那正是上一則說的「過重」;摘要 ↔ 展開內容 = 標題 → 它標示的內容(layoutSpace.spec.md 規則 3 functional = tight) */}
        <details>
          <summary className='text-body font-medium text-foreground cursor-pointer'>
            顯示更多資訊
          </summary>
          <p className='mt-[var(--layout-space-tight)] text-body text-fg-secondary'>單一區塊用 details 即可。</p>
        </details>
        <ExampleCaption>原生 HTML 簡潔,無須額外 JS</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
