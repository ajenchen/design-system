// Field「展示」頁的 test-only 契約 probe 元件(2026-10-13 自 field.stories.tsx 搬出,待辦 K9:該檔 851 行超過 800 行過渡上限)。
// 不是 story 檔:story 匯出(`InlineSearchYieldWidthContract`,test-only)留在 field.stories.tsx,story id 與文件頁不變。
// 為什麼不另開一個同 title 的 `*.stories.tsx`:Storybook 把同 title 的檔併成一頁,文件頁(autodocs)會挑其中一個檔當入口 ——
// 挑到只放 probe 的那一個時,整頁「Field/展示」文件只剩 probe、側欄也把它當 test-only 藏掉(2026-10-13 獨立驗證抓到)。
// 慣例同 `AppShell/_demo-helpers.tsx`(`_` 前綴 = demo / private helper,naming-structure-invariant R2)。
import * as React from 'react'
import { CircleDot, Globe } from 'lucide-react'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'
import { Input } from '@/design-system/components/Input/input'
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Switch } from '@/design-system/components/Switch/switch'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { Field, FieldLabel } from './field'

// ── 欄位內搜尋讓位 × 欄寬(test-only 契約 probe,2026-10-07 待辦總帳 K4 驗證回報;2026-10-13 加 K6 / K7) ──────────────────────
// 欄位上用文字畫的值(只選「不限」、PeoplePicker 多人只選 1 位的名字)打開時讓位給欄位內搜尋框;讓位**不改欄寬**——
// 它原本的寬留在搜尋框那一格,依內容寬(owner = field-controls.spec.md「寬度軸(width: fill / hug)」)的欄位打開前後、
// 打的字沒超過值之前欄寬都不變;關著時與不可搜尋的「不限」、同寬的單人欄位長得一樣(窄欄位長標籤的截斷點、名字放得下就完整)。
// 規則住 select-menu-unrestricted.spec.md「欄位顯示」與 people-picker.spec.md §C;閘 `scripts/searchable-field-keys-invariant.mjs` 逐格量。
// K7(2026-10-13):單選的 Select / PeoplePicker 依內容寬,打開前後欄寬不變(修前打開時撐成搜尋框的固有寬,151 → 204px)—— 同一支閘量。
// K6(2026-10-13):依內容寬的多選文字標籤不再縮成只剩「+N」(修前標籤可見數用自己的 hug 寬量,互為因果)——
// 三顆放得下就三顆都在;容器真的放不下才收進 +N,容器再變寬就放回來。閘 `scripts/tag-overflow-room-invariant.mjs`
//(逐格畫面、兩種時序;「窄容器」那一欄另把父層拉成 192 → 400 → 120 → 400px 逐格看)。
// 放在 Field 而不是 Combobox / PeoplePicker:量的是寬度軸,而且可搜尋選單焦點閘(searchable-menu-focus,掃那幾個元件目錄)
// 會在這些依內容寬 / 窄欄位上挑選多項。關著的長相與既有範例相同、互動後的欄寬沒有新畫面,所以 test-only(story-rules「Technical probe visibility」)。
const yieldCategoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
]
const yieldReviewers: PersonValue[] = [{ name: 'Alice Chen' }, { name: 'Bob Lin' }, { name: 'Charlie Wu' }]
const shipCountries = [
  { value: 'jp', label: '日本' },
  { value: 'us', label: '美國' },
  { value: 'tw', label: '台灣' },
]
// r-F3(2026-10-27 研究)查到的三個缺陷,各放一格給閘量(2026-10-28 加,FL-f3):
// P 依內容寬 + 空值:提示字整句放得下(欄寬 = 不可搜尋的同一欄)/ E 換行 × 每人一顆標籤佔一整列:空的搜尋框不自己多佔一列(欄高 = 不可搜尋的同一欄)/
// K 頭像堆疊 × 依內容寬 × 編輯欄位:有幾個人就畫幾個頭像(修前 2 人只剩「+2」、6 人只畫 4 顆)/ V 換行欄位空值:提示字與單行欄位同高
const f3People: PersonValue[] = [{ name: 'Alice Chen' }, { name: 'Bob Lin' }, { name: 'Charlie Wu' }, { name: 'Diana Huang' }, { name: 'Eric Tsai' }, { name: 'Fiona Lee' }]
const f3LongPeople: PersonValue[] = [{ name: 'Alexandra Montgomery' }, { name: 'Benjamin Richardson' }, { name: 'Catherine Williamson' }]
export function InlineSearchYieldWidthProbe() {
  const [hug, setHug] = React.useState<string[]>(['__unrestricted__'])
  const [hugPlain, setHugPlain] = React.useState<string[]>(['__unrestricted__'])
  const [long, setLong] = React.useState<string[]>(['__unrestricted__'])
  const [longPlain, setLongPlain] = React.useState<string[]>(['__unrestricted__'])
  const [reviewerHug, setReviewerHug] = React.useState<PersonValue[]>([yieldReviewers[0]])
  const [reviewerNarrow, setReviewerNarrow] = React.useState<PersonValue[]>([yieldReviewers[0]])
  const [owner, setOwner] = React.useState<PersonValue | null>(yieldReviewers[0])
  const [ownerHug, setOwnerHug] = React.useState<PersonValue | null>(yieldReviewers[0])
  const [country, setCountry] = React.useState<string | null>('jp')
  const [tagsHug, setTagsHug] = React.useState<string[]>(['electronics', 'furniture', 'food'])
  const [tagsHugNarrow, setTagsHugNarrow] = React.useState<string[]>(['electronics', 'furniture', 'food'])
  const longLabel = '不限(全部商品類別都可以)'
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-sm">
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">只選「不限」· 依內容寬(欄位內搜尋 / 不可搜尋對照)</h3>
        <Combobox width="hug" unrestricted searchable searchIn="trigger" options={yieldCategoryOptions} value={hug} onChange={setHug}
          aria-label="商品類別(依內容寬,欄位內搜尋)" />
        <Combobox width="hug" unrestricted options={yieldCategoryOptions} value={hugPlain} onChange={setHugPlain} aria-label="商品類別(依內容寬,對照)" />
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">只選「不限」· 窄欄位長標籤(欄位內搜尋 / 不可搜尋對照)</h3>
        <div className="w-40 flex flex-col gap-[var(--layout-space-tight)]">
          <Combobox unrestricted unrestrictedLabel={longLabel} searchable searchIn="trigger" options={yieldCategoryOptions} value={long} onChange={setLong}
            aria-label="商品類別(窄欄位長標籤,欄位內搜尋)" />
          <Combobox unrestricted unrestrictedLabel={longLabel} options={yieldCategoryOptions} value={longPlain} onChange={setLongPlain}
            aria-label="商品類別(窄欄位長標籤,對照)" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">PeoplePicker 多人只選 1 位 · 依內容寬 / 窄欄位(單人對照)</h3>
        <PeoplePicker width="hug" searchIn="trigger" value={reviewerHug} people={yieldReviewers} onChange={setReviewerHug} aria-label="審核人(依內容寬,欄位內搜尋)" />
        <div className="w-48">
          <PeoplePicker searchIn="trigger" value={reviewerNarrow} people={yieldReviewers} onChange={setReviewerNarrow} aria-label="審核人(窄欄位,欄位內搜尋)" />
        </div>
        <div className="w-48">
          <PeoplePicker value={owner} people={yieldReviewers} onChange={(v) => setOwner(v[0] ?? null)} aria-label="負責人(窄欄位,單人對照)" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">單選 · 依內容寬(打開前後欄寬不變)</h3>
        <PeoplePicker width="hug" value={ownerHug} people={yieldReviewers} onChange={(v) => setOwnerHug(v[0] ?? null)} aria-label="負責人(依內容寬,單人)" />
        <Select width="hug" searchable options={shipCountries} value={country} onChange={(v) => setCountry(v || null)} aria-label="出貨國家(依內容寬,可搜尋)" />
      </div>
      <F3Cells />
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">多選文字標籤 · 依內容寬(放得下 / 容器放不下)</h3>
        <Combobox width="hug" options={yieldCategoryOptions} value={tagsHug} onChange={setTagsHug} aria-label="商品類別(依內容寬,多選三顆)" />
        <div className="w-48">
          <Combobox width="hug" options={yieldCategoryOptions} value={tagsHugNarrow} onChange={setTagsHugNarrow} aria-label="商品類別(依內容寬,窄容器)" />
        </div>
      </div>
    </div>
  )
}

function F3Cells() {
  const [cbEmpty, setCbEmpty] = React.useState<string[]>([])
  const [cbEmptyPlain, setCbEmptyPlain] = React.useState<string[]>([])
  const [ppEmpty, setPpEmpty] = React.useState<PersonValue[]>([])
  const [ppEmptyPlain, setPpEmptyPlain] = React.useState<PersonValue[]>([])
  const [pills, setPills] = React.useState<PersonValue[]>(f3LongPeople)
  const [pillsPlain, setPillsPlain] = React.useState<PersonValue[]>(f3LongPeople)
  const [two, setTwo] = React.useState<PersonValue[]>(f3People.slice(0, 2))
  const [six, setSix] = React.useState<PersonValue[]>(f3People)
  const [wrapEmpty, setWrapEmpty] = React.useState<string[]>([])
  const [lineEmpty, setLineEmpty] = React.useState<string[]>([])
  return (
    <>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">空值 · 依內容寬(欄位內搜尋 / 不可搜尋對照)</h3>
        <Combobox width="hug" searchable searchIn="trigger" options={yieldCategoryOptions} value={cbEmpty} onChange={setCbEmpty} aria-label="商品類別(依內容寬,空值,欄位內搜尋)" />
        <Combobox width="hug" options={yieldCategoryOptions} value={cbEmptyPlain} onChange={setCbEmptyPlain} aria-label="商品類別(依內容寬,空值,對照)" />
        <PeoplePicker width="hug" searchIn="trigger" value={ppEmpty} people={yieldReviewers} onChange={setPpEmpty} aria-label="出席者(依內容寬,空值,欄位內搜尋)" />
        <PeoplePicker width="hug" value={ppEmptyPlain} people={yieldReviewers} onChange={setPpEmptyPlain} aria-label="出席者(依內容寬,空值,對照)" />
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">每人一顆標籤 · 換行 · 窄欄位 · 可一鍵清空(欄位內搜尋 / 不可搜尋對照)</h3>
        <div className="w-48 flex flex-col gap-[var(--layout-space-tight)]">
          <PeoplePicker multiDisplay="pill" pillWrap clearable searchIn="trigger" value={pills} people={f3LongPeople} onChange={setPills} aria-label="出席者(換行窄欄位,欄位內搜尋)" />
          <PeoplePicker multiDisplay="pill" pillWrap clearable value={pillsPlain} people={f3LongPeople} onChange={setPillsPlain} aria-label="出席者(換行窄欄位,對照)" />
        </div>
      </div>
      <div className="flex flex-col items-start gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">頭像堆疊 · 依內容寬 · 編輯欄位(2 人 / 6 人)</h3>
        <PeoplePicker width="hug" value={two} people={f3People} onChange={setTwo} aria-label="協作者(依內容寬,2 人)" />
        <PeoplePicker width="hug" value={six} people={f3People} onChange={setSix} aria-label="協作者(依內容寬,6 人)" />
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)] w-60">
        <h3 className="text-h6 font-semibold text-foreground">空值 · 換行 / 單行(提示字同高)</h3>
        <Combobox wrap options={yieldCategoryOptions} value={wrapEmpty} onChange={setWrapEmpty} aria-label="商品類別(換行,空值)" />
        <Combobox options={yieldCategoryOptions} value={lineEmpty} onChange={setLineEmpty} aria-label="商品類別(單行,空值)" />
      </div>
    </>
  )
}

// ── 純顯示齊標籤 × 兩種標籤位置(test-only 契約 probe,2026-10-27 C1 甲)──────────────────────────────────────────
// 18 種 `<Field mode="view">` 純顯示 × 標籤在上 / 標籤在左:值的第一個可見元素左緣 = 控件欄左緣(標籤在上時 = 標籤左緣),
// 值的第一行中線 = 控件欄頂 + field-height / 2(RadioGroup 修前高 5.5 / lg 7.5px)。規則住 field-controls.spec.md
// 「軸一 view mode」(user 2026-10-21 C1 甲);閘 `scripts/probe-inline-edit-align.mjs` 逐格量(`data-view-case` 是量具找格子的錨)。
// 長相與既有範例(Field 展示「欄位狀態連動」、各控件「四模式」)相同,沒有新畫面,所以 test-only(story-rules「Technical probe visibility」)。
const viewPriority = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
]
const viewStatus = [
  { value: 'doing', label: '進行中', tagVariant: 'blue' },
  { value: 'done', label: '已完成', tagVariant: 'green' },
]
const viewTopics = [
  { value: 'design', label: '設計' },
  { value: 'research', label: '研究' },
  { value: 'ops', label: '營運' },
]
const viewPeople: PersonValue[] = [{ name: '王小明' }, { name: '林美華' }]
const viewCases: { key: string; label: string; control: React.ReactNode }[] = [
  { key: 'input', label: '專案名稱', control: <Input value="官網改版" onChange={() => {}} /> },
  { key: 'input-icon', label: '網域', control: <Input startIcon={Globe} value="acme.com" onChange={() => {}} /> },
  { key: 'input-empty', label: '備註', control: <Input value="" onChange={() => {}} /> },
  { key: 'number', label: '數量', control: <NumberInput value={42} onChange={() => {}} /> },
  { key: 'textarea', label: '需求說明', control: <Textarea value={'首頁改版與會員中心\n第二期加上多語系'} onChange={() => {}} /> },
  { key: 'select', label: '優先級', control: <Select options={viewPriority} value="high" /> },
  { key: 'select-tag', label: '狀態', control: <Select display="tag" options={viewStatus} value="doing" /> },
  { key: 'select-renderer', label: '進度', control: <Select options={viewStatus} value="doing" selectedItemRenderer={(o) => <span className="inline-flex items-center gap-1"><CircleDot size={16} aria-hidden />{o.label}</span>} /> },
  { key: 'combobox', label: '主題', control: <Combobox options={viewTopics} value={['design', 'research']} /> },
  { key: 'date', label: '截止日', control: <DatePicker value="2026-06-20" onChange={() => {}} /> },
  { key: 'date-range', label: '活動期間', control: <DatePicker.Range value={['2026-06-01', '2026-06-20']} onChange={() => {}} /> },
  { key: 'time', label: '開始時間', control: <TimePicker value="09:30" onChange={() => {}} /> },
  { key: 'link', label: '官網', control: <LinkInput value="https://acme.com" onChange={() => {}} /> },
  { key: 'person', label: '負責人', control: <PeoplePicker value={viewPeople[0]} people={viewPeople} /> },
  { key: 'people', label: '審核人', control: <PeoplePicker value={viewPeople} people={viewPeople} /> },
  { key: 'checkbox', label: '同意條款', control: <Checkbox checked /> },
  { key: 'switch', label: '已啟用', control: <Switch checked /> },
  { key: 'radio', label: '付款方式', control: <RadioGroup value="card"><RadioGroupItem value="card" label="信用卡" /><RadioGroupItem value="cash" label="貨到付款" /></RadioGroup> },
]
export function ViewAlignmentProbe() {
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <div className="grid grid-cols-3 gap-[var(--layout-space-loose)] max-w-3xl" data-view-orientation="vertical">
        {viewCases.map((c) => (
          <Field key={c.key} mode="view" data-view-case={c.key}><FieldLabel>{c.label}</FieldLabel>{c.control}</Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-[var(--layout-space-loose)] max-w-3xl" data-view-orientation="horizontal">
        {viewCases.map((c) => (
          <Field key={c.key} mode="view" orientation="horizontal" labelWidth="88px" data-view-case={c.key}><FieldLabel>{c.label}</FieldLabel>{c.control}</Field>
        ))}
      </div>
    </div>
  )
}
