// @principles-rationale: Merged WhenToUse + WhenNotToUse + VsDatePicker into a single
// `UsageGuidance` story (3 sections) per 2026-04-26 user mandate to consolidate
// decision-related stories. ColorSemantic + MonthViewOnlyRule + ReadOnlyRule kept as separate principles.
// 2026-11-26 加三則事件詳情的原則(DetailReadingFirstRule / DetailBesideListRule / FullEditInDialogRule;calendar.spec.md「事件詳情浮層」)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from '@storybook/test'
import { type CalendarEvent } from './calendar'
import { CalendarDemo } from './_calendar-demo'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Select } from '@/design-system/components/Select/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/design-system/components/Dialog/dialog'
import { TutorialPage, UsageSection, TutorialList, StoryLink, ExampleSection, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Calendar/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 視覺基線同時釘住顯示月與 today SSOT，避免跨月/換日造成 snapshot 漂移。
const now = new Date(2026, 6, 15)
const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
// 月份標題 / 星期名照讀者的中文產品排(同展示頁 calendar.stories.tsx 的 LOCALE;元件預設 2026-11-24 起也是 'zh-TW',之前是 'en-US');事件名稱也用中文(2026-11-21 前是英文,SIB-PV)。
const LOCALE = 'zh-TW'
// 日期格二擇一、事件方塊三擇一:可點就接回調(型別層必填;事件方塊是 eventDetail 內建詳情或 onEventClick),不可點就寫 readOnlyDates / readOnlyEvents
//(calendar.spec.md「日期格與事件方塊:可點或唯讀」)。右上角「新事件」是全域新增入口、恆渲染,onCreateEvent 必填(同段末條,M23(f))。
// 原則頁的可點範例也給**真的結果**(CalendarDemo:點事件開內建詳情、點日期 / 新事件開「新增事件」對話框、送出跳 Toast),與展示頁同一個示範殼。

// 規則外框(標題 / 說明 / 間距)= 共用教學頁元件;本頁的範例是整塊行事曆,放進一個有邊框的展示框(原本寫在本頁 Rule 裡的同一個框)。
// 說明的字級 / 字色由共用元件擁有(text-caption + text-fg-muted,tutorial-page.tsx 檔頭;字色 = color.spec.md:96 caption 列),本頁不另選
//(2026-10-20 前本頁傳 noteTone 選 fg-secondary,同一層說明全 DS 兩種字色,已收成一種)。
const TutorialRule = createTutorialRule()

const ExampleFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-5xl rounded-md border border-divider p-[var(--layout-space-loose)] bg-surface">{children}</div>
)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 Calendar 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li>
              <StoryLink kind="Design System/Components/Calendar/展示" name="團隊行事曆">團隊行事曆</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Components/Calendar/展示" name="內容發佈月曆">內容發佈月曆</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Components/Calendar/展示" name="空行事曆">空行事曆</StoryLink>
            </li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <div className="text-body text-fg-secondary max-w-3xl">
          <TutorialList>
            <li><b>「選一個日期」表單欄位</b> → 用 <code>{'<DatePicker>'}</code>:Calendar 是檢視 canvas,不是 form control</li>
            <li><b>「選一個日期範圍」表單欄位</b> → 用 <code>{'<DatePicker.Range>'}</code>:同上</li>
            <li><b>時間 granularity 是時分秒的儀表板</b> → Timeline / Gantt chart:event calendar 的最小 granularity 是時段(15-60 分鐘),不是秒級</li>
            <li><b>單純事件列表</b>(沒時間軸視覺需求)→ 用 <code>{'<DataTable>'}</code> / <code>{'<Empty>'}</code>:列表是「linear」瀏覽,calendar 是「spatial」瀏覽</li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Calendar 是「看事件」的 page canvas,DatePicker 是「選日期」的 form control"
          note="名字相近,職責完全不同。Calendar 是月行事曆事件 canvas;DatePicker 是欄位,選單一日期寫入 form state。"
          paragraph={false}
        >
          <ExampleFrame>
            <div className="grid grid-cols-2 gap-[var(--layout-space-loose)]">
              <ExampleSection title="DatePicker(表單欄位)">
                <Field>
                  <FieldLabel>截止日期</FieldLabel>
                  <DatePicker />
                </Field>
              </ExampleSection>
              <ExampleSection title="Calendar(事件月曆)">
                {/* 只給高度:框線、圓角、裁切是 Calendar 自己的外殼(calendar.tsx 根節點),外面不再包一層同樣的框 */}
                <div className="h-80">
                  <CalendarDemo
                    defaultReferenceDate={now}
                    locale={LOCALE}
                    today={now}
                    events={[
                      { id: 'a', title: '設計審查', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue' },
                    ] as CalendarEvent[]}
                  />
                </div>
              </ExampleSection>
            </div>
          </ExampleFrame>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

// ── 原則 — Event color 是類別語意,不是 severity ─────────────────────────────
export const ColorSemantic: Story = {
  name: '事件顏色類別語意',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="事件的 color 是「這是哪一類事件」(團隊 / 專案),不是嚴重度"
        note="Calendar 的 color = 12 categorical 色相,與 Tag / Avatar 共用同一組 SSOT(blue / green / deep-orange / yellow / red / orange / amber / lime / turquoise / indigo / purple / magenta),色名 1:1 對 color token;不屬於任何類別的事件(例:全公司的假日)用 neutral 中性灰。色相本身無 severity 語義——紅色 ≠「緊急」、橙色 ≠「警告」,只是類別選擇。若要標示緊急,寫在事件標題文字裡。顏色出現在全天事件的淡底長條、有時段事件的左側色條。下例以藍 / 綠 / 橙 / 紫四種色相代表四個不同團隊或專案。"
        paragraph={false}
      >
        <ExampleFrame>
          {/* 容器刻意比整月矮(格陣在裡面捲),但四個團隊的事件(第二到第四週)都要整列看得到:h-84 時第四週 7/22 那一列離可視範圍底 14、
              第五週露出一點(提示可捲)。2026-11-25 前是 h-80 —— 格最小高 60(沒算格線)時剛好放得下,改成 61 後 7/22 那一列被裁掉 2px。 */}
          <div className="h-84">
            <CalendarDemo
              defaultReferenceDate={now}
              locale={LOCALE}
              today={now}
              events={[
                { id: '1', title: '設計審查', start: `${thisMonth}-05T10:00`, end: `${thisMonth}-05T11:00`, color: 'blue' },
                { id: '2', title: '衝刺規劃會議', start: `${thisMonth}-08T14:00`, end: `${thisMonth}-08T15:30`, color: 'blue' },
                { id: '3', title: '版本發布截止', start: `${thisMonth}-12T18:00`, end: `${thisMonth}-12T18:00`, color: 'orange' },
                { id: '4', title: '季度檢討', start: `${thisMonth}-18T14:00`, end: `${thisMonth}-18T16:00`, color: 'green' },
                { id: '5', title: '行銷週會', start: `${thisMonth}-22T10:00`, end: `${thisMonth}-22T11:00`, color: 'purple' },
              ] as CalendarEvent[]}
            />
          </div>
        </ExampleFrame>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 原則 — 支援範圍:月 view only(2026-07-14 rename MvpScope → MonthViewOnlyRule
//    per audit Dim 14 + category-templates.md「Canonical naming」:「MVP」為開發 roadmap
//    內部用語,reader-facing name 必人話;component-specific {Topic}Rule idiom 保留)──────
export const MonthViewOnlyRule: Story = {
  name: '僅支援月檢視',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="只支援月檢視;週 / 日檢視、拖拉新增事件目前不支援"
        note="本元件只實作月檢視;週 / 日檢視、拖拉新增事件目前不支援(點事件打開的詳情可以就地修改各欄)。"
        paragraph={false}
      >
        <ExampleFrame>
          <div className="h-80">
            <CalendarDemo
              defaultReferenceDate={now}
              locale={LOCALE}
              today={now}
              events={[
                { id: '1', title: '衝刺規劃會議', start: `${thisMonth}-08T14:00`, end: `${thisMonth}-08T15:30`, color: 'blue' },
              ] as CalendarEvent[]}
            />
          </div>
        </ExampleFrame>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 原則 — 事件詳情(2026-11-26,calendar.spec.md「事件詳情浮層」「點清單裡的事件」「本元件的層次」)────────────────
// 三則都用示範殼的內建詳情(eventDetail);play 打開要看的那一層(M15:點一下才看得到的狀態)。
const detailCategories = [
  { id: 'meeting', name: '內部會議', color: 'blue' },
  { id: 'customer', name: '客戶會議', color: 'orange' },
] as const satisfies readonly { id: string; name: string; color: CalendarEvent['color'] }[]

export const DetailReadingFirstRule: Story = {
  name: '詳情以閱讀為主、就地改一欄',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="詳情浮層以閱讀為主:每一欄平常是值,點了才就地改那一欄;沒有「儲存」鈕"
        note="點事件打開的詳情是給人讀的:時間、地點、說明、類別平常都是值,點一欄才變成那一欄的輸入框,按 Enter 或點外面就提交 —— 不是一張要一次填完再按儲存的表單。標籤在上、次要色(閱讀情境);全天是一個開關,直接切換。改了經 onEventChange 交回,事件資料仍由產品持有。"
        paragraph={false}
      >
        <ExampleFrame>
          <div className="h-[560px]">
            <CalendarDemo
              defaultReferenceDate={now}
              locale={LOCALE}
              today={now}
              categories={detailCategories}
              events={[
                { id: 'r1', title: '設計審查', start: `${thisMonth}-07T10:00`, end: `${thisMonth}-07T11:00`, color: 'blue', categoryId: 'meeting', location: '台北辦公室 3F 大會議室', description: '結帳頁改版第二輪:確認信用卡分期的金額顯示與錯誤訊息。' },
                { id: 'r2', title: '宏達工業季度回顧', start: `${thisMonth}-16T14:00`, end: `${thisMonth}-16T15:30`, color: 'orange', categoryId: 'customer', location: '宏達工業 新竹廠' },
              ] as CalendarEvent[]}
            />
          </div>
        </ExampleFrame>
      </TutorialRule>
    </TutorialPage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^設計審查,/ }))
    await within(document.body).findByRole('dialog', { name: '設計審查' })
  },
}

export const DetailBesideListRule: Story = {
  name: '清單留著、旁邊開詳情',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="從「+N」清單點事件:詳情開在清單旁,清單不關;Esc 一次關一層"
        note="清單是為了讓藏起來的事件看得到;看完一筆還要看下一筆,所以點清單裡的事件時清單留著、詳情貼著清單外緣開、上緣對齊那一列,那一列維持亮著。第一下 Esc 關詳情、焦點回那一列;第二下才關清單、焦點回「+N」。點在清單上只關詳情,點在頁面上兩層都關。"
        paragraph={false}
      >
        <ExampleFrame>
          <div className="h-[560px]">
            <CalendarDemo
              defaultReferenceDate={now}
              locale={LOCALE}
              today={now}
              events={[
                { id: 'b1', title: '上線前檢查', start: `${thisMonth}-15T09:00`, end: `${thisMonth}-15T09:30`, color: 'blue' },
                { id: 'b2', title: '發布 v2.0', start: `${thisMonth}-15T10:00`, end: `${thisMonth}-15T11:00`, color: 'blue' },
                { id: 'b3', title: '上線公告', start: `${thisMonth}-15T11:00`, end: `${thisMonth}-15T11:30`, color: 'green' },
                { id: 'b4', title: '合作夥伴通知', start: `${thisMonth}-15T13:00`, end: `${thisMonth}-15T13:30`, color: 'turquoise' },
                { id: 'b5', title: '監控輪值', start: `${thisMonth}-15T14:00`, end: `${thisMonth}-15T22:00`, color: 'purple' },
                { id: 'b6', title: '客服待命', start: `${thisMonth}-15T15:00`, end: `${thisMonth}-15T18:00`, color: 'yellow' },
                { id: 'b7', title: '慶功', start: `${thisMonth}-15T18:30`, end: `${thisMonth}-15T20:30`, color: 'orange' },
              ] as CalendarEvent[]}
            />
          </div>
        </ExampleFrame>
      </TutorialRule>
    </TutorialPage>
  ),
  play: async ({ canvasElement }) => {
    const day = `${thisMonth}-15`
    const opened = `[data-calendar-more-list="${day}"]`
    // 「+N」剛掛上時會被 Radix 換成新節點一次(設計規格「狀態行為:「+N」清單開著」的註解):每一輪重抓當下那一顆點,點到清單開出來為止
    await waitFor(async () => {
      if (document.querySelector(opened)) return
      const button = canvasElement.querySelector<HTMLElement>(`[data-calendar-more="${day}"]`)
      await expect(button?.isConnected).toBe(true)
      await userEvent.click(button as HTMLElement)
      await expect(document.querySelector(opened)).not.toBeNull()
    })
    const list = document.querySelector<HTMLElement>(opened) as HTMLElement
    await userEvent.click(within(list).getByRole('button', { name: /^客服待命,/ }))
    await within(document.body).findByRole('dialog', { name: '客服待命' })
  },
}

function FullEditExample() {
  const [editing, setEditing] = React.useState<CalendarEvent | null>(null)
  return (
    <>
      <CalendarDemo
        defaultReferenceDate={now}
        locale={LOCALE}
        today={now}
        events={[
          { id: 'f1', title: '季度業務檢討', start: `${thisMonth}-21T14:00`, end: `${thisMonth}-21T16:00`, color: 'green', location: '台北辦公室 5F 董事會議室' },
        ] as CalendarEvent[]}
        // 「開完整編輯」放在標題列操作位,「⋯」之前(action-bar.spec.md:121 / :125:可見操作在前、溢出永遠在末端)
        extraActions={(event) => <Button variant="text" size="sm" onClick={() => setEditing(event)}>開完整編輯</Button>}
      />
      <Dialog open={editing != null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent height="hug">
          <DialogHeader><DialogTitle>編輯「{editing?.title}」</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-[var(--layout-space-loose)]">
              <Field>
                <FieldLabel>與會者</FieldLabel>
                <Input placeholder="輸入姓名或 email" />
              </Field>
              <Field>
                <FieldLabel>重複</FieldLabel>
                <Select options={[{ value: 'none', label: '不重複' }, { value: 'weekly', label: '每週' }, { value: 'quarterly', label: '每季' }]} defaultValue="quarterly" />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="tertiary">取消</Button></DialogClose>
            <Button variant="primary" onClick={() => setEditing(null)}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export const FullEditInDialogRule: Story = {
  name: '要一次填很多欄位時開完整編輯',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="邀請與會者、設定重複這類要一次填很多欄位的事,不塞進詳情浮層:在標題列放「開完整編輯」,打開對話框"
        note="詳情浮層是閱讀為主、偶爾改一欄;要一次填寫多個欄位(表單)時改用對話框或側邊面板,不在浮層裡再疊一層表單。產品把「開完整編輯」放在 eventDetail.actions(標題列操作位),點了開自己的 Dialog。"
        paragraph={false}
      >
        <ExampleFrame>
          <div className="h-[560px]"><FullEditExample /></div>
        </ExampleFrame>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 原則 — 日期格與事件方塊:可點就接回調,不可點就明說唯讀(2026-09-26,待辦總帳 L8 / C15)──────────────
export const ReadOnlyRule: Story = {
  name: '唯讀的日期格與事件',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="點了沒反應的東西不長成可點的樣子:日期格、事件方塊各自宣告「可點」或「唯讀」"
        note="日期格(點一下 = 在這天新增)與事件方塊(點一下 = 打開事件)是兩個獨立的點擊目標。可點就傳回調 onDateClick / onEventClick(事件也可以傳 eventDetail 開內建詳情)—— 整格是手形游標(滑過不變色,點了在這天新增)、日期數字是按鈕、事件方塊是按鈕;沒有這個動作就寫 readOnlyDates / readOnlyEvents —— 不是按鈕、游標不變(箭頭),鍵盤仍可用方向鍵在格陣裡走。兩者都不能省略不講:型別層要求擇一,不會出現「看起來能點、點了沒反應」的格子。右上角「新事件」是全域新增入口,不在這個二擇一裡、永遠在(onCreateEvent 必填):點了之後先選日期,哪些日子不能新增由新增流程決定,不由這顆鈕的有無表達。下例是公司假日行事曆:假日只是標記、沒有詳情可開,日子也不在格子上點來新增 → 兩者都唯讀;新增假日走右上角。"
        paragraph={false}
      >
        <ExampleFrame>
          {/* 整月都要看得到(23–24 號的年中盤點在第四週):高度同 calendar.anatomy.stories.tsx 整月示範 */}
          <div className="h-[560px]">
            <CalendarDemo
              defaultReferenceDate={now}
              locale={LOCALE}
              today={now}
              readOnlyDates
              readOnlyEvents
              noun="假日"
              events={[
                // 全天,end 不含(calendar.spec.md「資料語意」):創立紀念日一天 → end 隔天;年中盤點週四、週五關兩天 → end 週六,畫成一條橫跨兩格的長條
                { id: 'h1', title: '公司創立紀念日', start: `${thisMonth}-03`, end: `${thisMonth}-04`, color: 'green', allDay: true },
                { id: 'h2', title: '年中盤點(辦公室關閉)', start: `${thisMonth}-23`, end: `${thisMonth}-25`, color: 'green', allDay: true },
              ] as CalendarEvent[]}
            />
          </div>
        </ExampleFrame>
      </TutorialRule>
    </TutorialPage>
  ),
}
