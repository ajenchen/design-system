// @story-trait-rationale: isInputLike -> ErrorText — 「錯誤說明」示範網址不合法時的紅框與框下一行說明,「儲存時查出的錯」示範使用端自己給的錯(link-input.spec.md「錯誤說明」,2026-11-23 展示頁範例稽核);另開 WithError 會重複同一情境。
// @story-history: isInputLike WithError 由 Field 消費者處理(LinkInput 在 Field 內透過 fieldCtx.invalid 自動套 error border);showcase 不重複 Field state machine 覆蓋的 case。
// 每則只教一件事(2026-11-23 範例稽核,story-rules.md「範例最高準則」):基本用法 = 有網址時的樣子;填寫網址 = 空白直接打、離開變連結;
// 錯誤說明 = 不是網址時框下那一行(預設 / 換字);可清除 = ×;儲存時查出的錯 = 使用端的錯怎麼給、怎麼收;四模式 = mode 對照;自訂顯示文字 = label。
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LinkInput } from './link-input'
import { Field, FieldLabel, FieldError } from '@/design-system/components/Field/field'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta<typeof LinkInput> = {
  title: 'Design System/Components/LinkInput/展示',
  tags: ['autodocs'],
  component: LinkInput,
  parameters: {
    docs: {
      description: {
        component: '用於儲存、驗證與直接開啟單一外部 URL，在連結閱讀態與輸入編輯態間切換。Slug、Email 或內部 router path 改用 Input，需同時編輯顯示文字與 URL 時改用連結編輯器。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof LinkInput>

/* ── 基本用法:有網址時的樣子 ── */
export const Default: Story = {
  name: '基本用法',
  render: () => {
    const [value, setValue] = React.useState('https://github.com')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
        <p className="text-caption text-fg-muted">有網址時是藍色連結,只顯示網域。點框裡鉛筆以外的地方,會在新分頁打開這個網址;要改網址,按右邊的鉛筆。</p>
        <LinkInput value={value} onChange={setValue} aria-label="程式碼倉庫" />
      </div>
    )
  },
}

/* ── 填寫網址:空白直接打,離開後變連結 ── */
export const Empty: Story = {
  name: '填寫網址',
  render: () => {
    const [value, setValue] = React.useState('')
    return (
      <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
        <p className="text-caption text-fg-muted">還沒有網址時直接是輸入框,不用先按鉛筆。打上網址後按 Tab 或點別處離開,就變成藍色連結;沒寫 https:// 的(例如 acme.com)會自動補上。打的不是網址會怎樣,見「錯誤說明」。</p>
        <LinkInput value={value} onChange={setValue} placeholder="例如 acme.com" aria-label="公司網站" />
      </div>
    )
  },
}

/* ── 錯誤說明:不是網址時框下那一行 ── */
// link-input.spec.md「錯誤說明」:網址不合法時框下自帶一行說明,`errorText` 換字;照 blur 驗證(form-validation.spec.md「驗證時機」),
// 外面存進來的值一掛上不驗、離開欄位後才出現。兩則只差說明的字,其他一樣;不放 FieldDescription(user 確認頁留言:這則主要展示錯誤狀態怎麼顯示,化繁為簡)。
export const ErrorText: Story = {
  name: '錯誤說明',
  render: () => <ErrorTextDemo />,
}

function ErrorTextDemo() {
  const [website, setWebsite] = React.useState('官網還在架設中')
  const [meetingLink, setMeetingLink] = React.useState('週三下午三點 3F 會議室')
  return (
    <ExampleStack className="max-w-sm">
      <ExampleSection title="預設的錯誤說明" description="這格存的是一句話、不是網址。點進框裡再離開(按 Tab 或點別處),框變紅、下面多一行說明請使用者填網址;一打字就消失,離開時再檢查一次。">
        <Field>
          <FieldLabel>公司網站</FieldLabel>
          <LinkInput value={website} onChange={setWebsite} />
        </Field>
      </ExampleSection>
      <ExampleSection title="換成這個欄位的說法" description="欄位要的東西比「網址」更具體時,把那一行換成告訴使用者該貼什麼(errorText)。試法同上。">
        <Field>
          <FieldLabel>線上會議連結</FieldLabel>
          <LinkInput value={meetingLink} onChange={setMeetingLink} errorText="請貼上會議邀請裡的連結" />
        </Field>
      </ExampleSection>
    </ExampleStack>
  )
}

/* ── 可清除 ── */
// link-input.spec.md「可清除(clearable)」:選填的網址欄位開 clearable;× 只在打字狀態、框裡有字時出現,連結狀態照舊只有鉛筆。
export const Clearable: Story = {
  name: '可清除',
  parameters: { docs: { description: { story: '選填的網址欄位(不填也可以)才需要這顆 ×(clearable):框裡有字時右邊出現,一鍵清掉。' } } },
  render: () => <ClearableDemo />,
}

function ClearableDemo() {
  const [designLink, setDesignLink] = React.useState('https://www.figma.com/design/checkout-flow')
  const [specLink, setSpecLink] = React.useState('結帳流程需求文件 v3')
  return (
    <ExampleStack className="max-w-sm">
      <ExampleSection title="有連結:沒有 ×" description="右邊照舊只有鉛筆。按鉛筆改網址時,框裡有字才出現 ×。">
        <LinkInput clearable value={designLink} onChange={setDesignLink} aria-label="設計稿連結" />
      </ExampleSection>
      <ExampleSection title="框裡有字:出現 ×" description="貼錯的字按 × 一鍵清掉,游標留在框裡可以直接重貼;清空後 × 跟著消失。離開欄位或按 Enter 才算數(空白 = 不填),按 Esc 還原。">
        <LinkInput clearable value={specLink} onChange={setSpecLink} aria-label="需求文件連結" />
      </ExampleSection>
    </ExampleStack>
  )
}

/* ── 儲存時查出的錯:使用端自己給的錯 ── */
// link-input.spec.md「錯誤說明」「跟使用端的錯誤誰優先」、「可清除」「按下」:LinkInput 只檢查是不是網址;其他規則由使用端查,
// 錯誤照 Field 家族的寫法交給 Field(`invalid` + `<FieldError>`)。一開始編輯就收掉(form-validation.spec.md 規則 5):
// 打字與按 × 都送出 input 事件,接 onInput 當下清(onChange 要等離開欄位結算才呼叫)。
export const SaveError: Story = {
  name: '儲存時查出的錯',
  render: () => <SaveErrorDemo />,
}

function SaveErrorDemo() {
  const [landingPage, setLandingPage] = React.useState('https://shop.acme.com/spring-sale')
  // 示範用:按下儲存後伺服器回報的錯,一進頁就帶著
  const [saveError, setSaveError] = React.useState('這個網址已經登記在「春季檔期」專案')
  return (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
      <p className="text-caption text-fg-muted">網址格式沒問題、按下儲存才查出的錯(例如網址已經被別的專案用了),跟其他欄位一樣交給 Field 顯示紅框與一行說明(invalid + FieldError)。使用者一開始修改就收掉:按鉛筆後打字或按 × 都算。LinkInput 要等離開欄位才回報新網址(onChange),所以要在使用者一打字或按 × 的當下就把錯清掉(onInput)。</p>
      <Field invalid={!!saveError}>
        <FieldLabel>活動頁網址</FieldLabel>
        <LinkInput clearable value={landingPage} onChange={setLandingPage} onInput={() => setSaveError('')} />
        <FieldError>{saveError}</FieldError>
      </Field>
    </div>
  )
}

/* ── 四模式 ── */
// mode 四個值並排對照;段標題 = mode 的值,Field 家族各展示頁「四模式」同一套(field-view-typography-invariant 以 edit / view 段標題找段落、
// 拿 edit 段當 view 段字級的對照組)。2026-11-23 範例稽核:這則不動;它的 view 段讓原本的「檢視樣式」只剩 label 這件新事(改成「自訂顯示文字」)。
export const Modes: Story = {
  name: '四模式',
  render: () => <ModesDemo />,
}

function ModesDemo() {
  const [value, setValue] = React.useState('https://github.com')
  return (
    <ExampleStack className="max-w-sm">
      <ExampleSection title="edit">
        <LinkInput value={value} onChange={setValue} aria-label="程式碼倉庫" />
      </ExampleSection>
      <ExampleSection title="view">
        <LinkInput mode="view" value="https://github.com" />
      </ExampleSection>
      <ExampleSection title="readonly">
        <LinkInput mode="readonly" value="https://github.com" />
      </ExampleSection>
      <ExampleSection title="disabled">
        <LinkInput mode="disabled" value="https://github.com" />
      </ExampleSection>
      <ExampleSection title="readonly(空值)">
        <LinkInput mode="readonly" value={null} />
      </ExampleSection>
    </ExampleStack>
  )
}

/* ── 自訂顯示文字(label)── */
export const CustomLabel: Story = {
  name: '自訂顯示文字',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)] max-w-sm">
      <p className="text-caption text-fg-muted">網址預設只顯示網域(github.com)。同一個網域底下有好幾個連結、光看網域分不出是哪一個時,換成一段名稱(label);點了照樣打開那個網址。</p>
      <LinkInput mode="view" value="https://github.com/acme/storefront" label="前台網站原始碼" />
    </div>
  ),
}
