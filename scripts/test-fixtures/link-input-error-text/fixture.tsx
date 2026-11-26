// 「LinkInput 錯誤說明」閘(scripts/link-input-error-text-invariant.mjs)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
//
// 為什麼不是 story:要量使用端拿到的驗證結果回呼(`onInvalidChange`)什麼時候被呼叫、帶什麼字,就得有一個把每次呼叫記下來的使用端;
// 展示頁的範例不該為了量放計數器。另外「包在 Field 裡、使用端自己的 FieldError 有字」這種接法展示頁沒有(那是使用端的錯,不是元件的),在這裡擺一份。
// 四個欄位(閘以 data-eti 找;Tab 順序 = 這個順序,最後一顆「下一個欄位」鈕):
//   typed    單獨用、一開始空白 —— 閘自己打不合法的字再離開;onInvalidChange 每次呼叫記進 data-eti-log(「true:草稿」以 | 分隔)
//   custom   單獨用、errorText 換字、外部值本身不是網址 —— 照 blur 驗證:一掛上、點進去都不驗,閘按 Tab 離開後才出現
//   field    包在 Field 裡(有 FieldDescription、使用端的 FieldError 沒字)、外部值本身不是網址 → 離開後說明畫在 Field 的錯誤區
//   consumer 包在 Field 裡、使用端自己的 FieldError 有字、外部值本身不是網址 → 離開後 LinkInput 也驗出不合法,仍只有使用端那一行
// 2026-11-26 加「控件交給 Field 畫的另一行」:字數計數(field-controls.spec.md「字數計數」,C7)—— 同一個機制(控件 → Field 欄裡的一行),同一支閘守:
//   count-desc  Input 在 Field 裡、有 FieldDescription、上限 100(工單標題)→ 計數在說明那一行的右端
//   count-only  Textarea 在 Field 裡、沒有說明、上限 10 → 那一行只有計數(右端);閘打超過上限的字,量擋住
//   count-alone Input 單獨用、上限 30 → 框下一行、右端
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/design-system/components/Field/field'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { Input } from '@/design-system/components/Input/input'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'

// 這兩句的原文也寫在閘裡(閘以字面比對畫出來的字)
const CUSTOM_TEXT = '請貼上會議邀請裡的連結'
const CONSUMER_TEXT = '這個網址已經登記在別的專案'

const STACK: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }

function Fixture() {
  const [typed, setTyped] = React.useState('')
  const [custom, setCustom] = React.useState('週三下午三點 3F 會議室')
  const [inField, setInField] = React.useState('官網還在架設中')
  const [consumer, setConsumer] = React.useState('結帳流程需求文件 v3')
  const [log, setLog] = React.useState<string[]>([])
  const [ticketTitle, setTicketTitle] = React.useState('結帳頁按鈕沒反應')
  const [note, setNote] = React.useState('請款單')
  const [keyword, setKeyword] = React.useState('')
  return (
    <div data-eti-log={log.join('|')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 24, width: 360, padding: 24 }}>
      {/* 單獨用的兩個欄位各放在有 gap 的 flex 直欄裡(展示頁的範例區就是這樣):容器的 gap 不得疊進框與說明之間 */}
      <div data-eti="typed" style={STACK}>
        <LinkInput value={typed} onChange={setTyped} aria-label="公司網站" onInvalidChange={(invalid, draft) => setLog((prev) => [...prev, `${invalid}:${draft}`])} />
      </div>
      <div data-eti="custom" style={STACK}>
        <LinkInput value={custom} onChange={setCustom} aria-label="線上會議連結" errorText={CUSTOM_TEXT} />
      </div>
      <div data-eti="field">
        <Field>
          <FieldLabel>官方網站</FieldLabel>
          <LinkInput value={inField} onChange={setInField} />
          <FieldDescription>顯示在對外的公司簡介頁。</FieldDescription>
          <FieldError>{undefined}</FieldError>
        </Field>
      </div>
      <div data-eti="consumer">
        <Field invalid>
          <FieldLabel>需求文件連結</FieldLabel>
          <LinkInput value={consumer} onChange={setConsumer} />
          <FieldError>{CONSUMER_TEXT}</FieldError>
        </Field>
      </div>
      <div data-eti="count-desc">
        <Field>
          <FieldLabel>工單標題</FieldLabel>
          <Input value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} maxLength={100} showCount />
          <FieldDescription>會出現在工單列表與通知信的主旨。</FieldDescription>
        </Field>
      </div>
      <div data-eti="count-only">
        <Field>
          <FieldLabel>付款備註</FieldLabel>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={10} rows={2} showCount />
        </Field>
      </div>
      <div data-eti="count-alone" style={STACK}>
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="搜尋工單關鍵字" maxLength={30} showCount />
      </div>
      <div><Button size="sm">下一個欄位</Button></div>
    </div>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('link-input-error-text fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色);不開 StrictMode(同其他夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)
