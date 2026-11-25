// ── 閱讀情境的畫面與驗證夾具(field.spec.md「閱讀情境」)──────────────────────────────────────────────
// 兩支都只給 test-only story 用(field.stories.tsx「閱讀情境:工作項目與行事曆事件詳情」「閱讀情境驗證」):
//   ReadingContextDemo     真實情境 —— 工作項目詳情(標籤在左)+ 行事曆事件詳情(標籤在上),各有文字、日期、類別 Tag、負責人頭像、
//                          開關、勾選框、editable=false 鎖定的值。給 scripts/reading-context-invariant.mjs 量,也是給 user 看的前後對照圖的唯一來源。
//   ReadingContextFixture  邊界 —— 只有一個就地編輯的組(編輯中不翻轉)、包一層的就地編輯、巢狀組(範圍 = 最外層)、不在組裡的單一欄位、
//                          停用、一般表單(對照:不得變)、DescriptionList(三者同色的參照)。
// 照規格不混純顯示:就地編輯的組裡只有就地編輯與直接切換的開關 / 勾選框(inline-edit.spec.md「editable 閘」「何時不用」)。
// 人員照片一律走名冊(stories-helpers/data/people.ts;本檔是 _demo-* 檔,scripts/demo-people-roster-invariant.mjs 會掃)。
// 每列 Field 帶 data-probe(組:欄名)與 data-kind(值的種類),閘靠它們指名;不影響畫面。
import * as React from 'react'
import { Field, FieldLabel, FieldGroup } from './field'
import type { FieldSize } from './field-context'
import { InlineEdit } from '@/design-system/components/InlineEdit/inline-edit'
import { Input } from '@/design-system/components/Input/input'
import { Switch } from '@/design-system/components/Switch/switch'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from '@/design-system/components/PeoplePicker/person-display'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
// 只從 stories-helpers 匯入名冊(person-card 本來就經 AppShell 的 _demo 進型別宣告);說明文字不借 ExampleCaption,
// 免得多一支 stories-helpers 的型別宣告跟著套件出貨(本檔不是 stories 檔,tsc 會替它匯入的檔產 .d.ts)
import { demoPersonData } from '@/design-system/stories-helpers/scene/person-card'

const WORK_CATEGORY: SelectOption[] = [
  { value: 'frontend', label: '前端', tagVariant: 'blue' },
  { value: 'backend', label: '後端', tagVariant: 'green' },
  { value: 'design', label: '設計', tagVariant: 'deep-orange' },
]
const EVENT_CATEGORY: SelectOption[] = [
  { value: 'customer', label: '客戶會議', tagVariant: 'yellow' },
  { value: 'internal', label: '內部會議', tagVariant: 'blue' },
]
// 名冊裡的人(同一支檔不同人不共用臉):負責人 / 主辦人可選的團隊成員
const TEAM: PersonValue[] = [
  demoPersonData('Alice Chen', 48),
  demoPersonData('張美真', 48),
  demoPersonData('Bob Lin', 48),
  demoPersonData('林伯彥', 48),
]

type Kind = 'text' | 'date' | 'tag' | 'person' | 'switch' | 'checkbox' | 'locked' | 'input'

/** 一列:Field + 標籤 + 控件;size 只在 story 的 args 指定時才寫(沒寫 = 看同組同高怎麼解) */
function Row({ set, label, kind, orientation, size, disabled, children }: {
  set: string; label: string; kind: Kind; orientation: 'horizontal' | 'vertical'; size?: FieldSize; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <Field orientation={orientation} size={size} disabled={disabled} data-probe={`${set}:${label}`} data-kind={kind}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </Field>
  )
}

function TextValue({ initial, label, editable = true }: { initial: string; label: string; editable?: boolean }) {
  const [value, setValue] = React.useState(initial)
  return <InlineEdit value={value} onCommit={setValue} label={label} editable={editable} />
}

function DateValue({ initial, label, size = 'sm' }: { initial: string; label: string; size?: FieldSize }) {
  const [value, setValue] = React.useState(initial)
  return (
    <InlineEdit<string>
      value={value}
      onCommit={setValue}
      label={label}
      renderRead={(v) => <DatePicker mode="view" size={size} value={v} />}
      renderEdit={(p) => (
        <DatePicker size={p.size} value={p.value} defaultOpen aria-label={label} onChange={(next) => { p.onChange(next); p.commit() }} />
      )}
    />
  )
}

function TagValue({ initial, label, options, size = 'sm' }: { initial: string; label: string; options: SelectOption[]; size?: FieldSize }) {
  const [value, setValue] = React.useState(initial)
  return (
    <InlineEdit<string>
      value={value}
      onCommit={setValue}
      label={label}
      renderRead={(v) => <Select mode="view" display="tag" size={size} value={v} options={options} />}
      renderEdit={(p) => (
        <Select autoFocus display="tag" size={p.size} value={p.value} options={options} defaultOpen
          onChange={(next) => { p.onChange(next as string); p.commit() }} />
      )}
    />
  )
}

function PersonValueEdit({ initial, label, size = 'sm' }: { initial: PersonValue; label: string; size?: FieldSize }) {
  const [value, setValue] = React.useState<PersonValue>(initial)
  return (
    <InlineEdit<PersonValue>
      value={value}
      onCommit={setValue}
      label={label}
      renderRead={(v) => <PeoplePicker mode="view" size={size} value={v} />}
      renderEdit={(p) => (
        <PeoplePicker size={p.size} people={TEAM} value={p.value} defaultOpen
          onChange={(next) => { p.onChange(next[0] ?? p.value); p.commit() }} />
      )}
    />
  )
}

// 開關 / 勾選框直接切換(就地編輯沒有給布林值的編輯態;同 DataTable 布林欄,data-table.spec.md);讀屏名稱由 FieldLabel 給
function ToggleValue({ initial }: { initial: boolean }) {
  const [checked, setChecked] = React.useState(initial)
  return <Switch checked={checked} onCheckedChange={setChecked} />
}

function CheckValue({ initial }: { initial: boolean }) {
  const [checked, setChecked] = React.useState(initial)
  return <Checkbox checked={checked} onCheckedChange={(next) => setChecked(next === true)} />
}

const CARD = 'rounded-md border border-border bg-surface p-[var(--layout-space-loose)]'

/** 真實情境:工作項目詳情(標籤在左)+ 行事曆事件詳情(標籤在上) */
export function ReadingContextDemo({ size }: { size?: FieldSize }) {
  const viewSize = size ?? 'sm'
  return (
    <div className="flex flex-wrap items-start gap-[var(--layout-space-loose)]" data-reading-story="">
      <section data-reading-set="RH" className={`w-[480px] ${CARD}`}>
        {/* 標題 → 欄位 = loose(同 inline-edit.stories.tsx「詳情欄位就地編輯」:layoutSpace.spec.md 規則 3「標題區 → 內容」) */}
        <h2 className="mb-[var(--layout-space-loose)] text-h6 font-medium text-foreground">PROJ-482 詳細資訊</h2>
        <FieldGroup labelWidth={112}>
          <Row set="RH" label="摘要" kind="text" orientation="horizontal" size={size}>
            <TextValue initial="修正 Safari 上結帳 e2e 測試偶發失敗" label="摘要" />
          </Row>
          <Row set="RH" label="到期日" kind="date" orientation="horizontal" size={size}>
            <DateValue initial="2026-12-05" label="到期日" size={viewSize} />
          </Row>
          <Row set="RH" label="類別" kind="tag" orientation="horizontal" size={size}>
            <TagValue initial="frontend" label="類別" options={WORK_CATEGORY} size={viewSize} />
          </Row>
          <Row set="RH" label="負責人" kind="person" orientation="horizontal" size={size}>
            <PersonValueEdit initial={demoPersonData('Alice Chen', 48)} label="負責人" size={viewSize} />
          </Row>
          <Row set="RH" label="需要設計審查" kind="switch" orientation="horizontal" size={size}>
            <ToggleValue initial />
          </Row>
          <Row set="RH" label="已通知客服" kind="checkbox" orientation="horizontal" size={size}>
            <CheckValue initial />
          </Row>
          <Row set="RH" label="所屬專案" kind="locked" orientation="horizontal" size={size}>
            <TextValue initial="結帳體驗改版" label="所屬專案" editable={false} />
          </Row>
        </FieldGroup>
      </section>
      <section data-reading-set="RV" className={`w-[320px] ${CARD}`}>
        <h2 className="mb-[var(--layout-space-loose)] text-h6 font-medium text-foreground">設計審查會議</h2>
        <FieldGroup>
          <Row set="RV" label="日期" kind="date" orientation="vertical" size={size}>
            <DateValue initial="2026-12-02" label="日期" size={viewSize} />
          </Row>
          <Row set="RV" label="地點" kind="text" orientation="vertical" size={size}>
            <TextValue initial="台北辦公室 3F 大會議室" label="地點" />
          </Row>
          <Row set="RV" label="類別" kind="tag" orientation="vertical" size={size}>
            <TagValue initial="customer" label="類別" options={EVENT_CATEGORY} size={viewSize} />
          </Row>
          <Row set="RV" label="主辦人" kind="person" orientation="vertical" size={size}>
            <PersonValueEdit initial={demoPersonData('張美真', 48)} label="主辦人" size={viewSize} />
          </Row>
          <Row set="RV" label="全天" kind="switch" orientation="vertical" size={size}>
            <ToggleValue initial={false} />
          </Row>
          <Row set="RV" label="開始前提醒" kind="checkbox" orientation="vertical" size={size}>
            <CheckValue initial />
          </Row>
          <Row set="RV" label="行事曆" kind="locked" orientation="vertical" size={size}>
            <TextValue initial="產品團隊" label="行事曆" editable={false} />
          </Row>
        </FieldGroup>
      </section>
    </div>
  )
}

// 包一層的就地編輯:consumer 自己的元件把 InlineEdit 包在 div 裡,而且 memo 過 —— Field 看不到 InlineEdit 的靜態偏好尺寸,
// 靠掛載時登記(field-context.ts useRegisterFieldPreferredSize);閱讀情境靠深層 :has() 一樣認得到
const WrappedNote = React.memo(function WrappedNote() {
  return <div><TextValue initial="請在週五前回覆客戶" label="備註" /></div>
})

/** 邊界夾具 */
export function ReadingContextFixture({ size }: { size?: FieldSize }) {
  return (
    <div className="grid grid-cols-2 items-start gap-[var(--layout-space-loose)]" data-reading-fixture="">
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">只有一個就地編輯的組(編輯中整組不翻回表單)</p>
        <section data-reading-set="ONE" className={`w-[400px] ${CARD}`}>
          <FieldGroup labelWidth={112}>
            <Row set="ONE" label="備註" kind="text" orientation="horizontal" size={size}><TextValue initial="客戶希望改用月結" label="備註" /></Row>
            <Row set="ONE" label="公開" kind="switch" orientation="horizontal" size={size}><ToggleValue initial /></Row>
            <Row set="ONE" label="置頂" kind="checkbox" orientation="horizontal" size={size}><CheckValue initial={false} /></Row>
          </FieldGroup>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">包一層的就地編輯</p>
        <section data-reading-set="WRAP" className={`w-[400px] ${CARD}`}>
          <FieldGroup labelWidth={112}>
            <Row set="WRAP" label="備註" kind="text" orientation="horizontal" size={size}><WrappedNote /></Row>
            <Row set="WRAP" label="公開" kind="switch" orientation="horizontal" size={size}><ToggleValue initial={false} /></Row>
          </FieldGroup>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">巢狀組:外層就地編輯、內層只有輸入框(範圍 = 最外層)</p>
        <section data-reading-set="N2" className={`w-[400px] ${CARD}`}>
          <FieldGroup labelWidth={112}>
            <Row set="N2" label="負責團隊" kind="text" orientation="horizontal" size={size}><TextValue initial="金流小組" label="負責團隊" /></Row>
            <FieldGroup>
              <Row set="N2" label="預估工時" kind="input" orientation="horizontal" size={size}><Input defaultValue="16" /></Row>
              <Row set="N2" label="實際工時" kind="input" orientation="horizontal" size={size}><Input defaultValue="12" /></Row>
            </FieldGroup>
          </FieldGroup>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">不在組裡的單一欄位(範圍 = 它自己)</p>
        <section data-reading-set="S1" className={`w-[320px] ${CARD}`}>
          <Row set="S1" label="標題" kind="text" orientation="vertical" size={size}><TextValue initial="第四季路線圖檢討" label="標題" /></Row>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">閱讀情境裡的停用列(標籤仍是停用色)</p>
        <section data-reading-set="DIS" className={`w-[400px] ${CARD}`}>
          <FieldGroup labelWidth={112}>
            <Row set="DIS" label="摘要" kind="text" orientation="horizontal" size={size}><TextValue initial="匯出報表缺少稅額欄" label="摘要" /></Row>
            <Row set="DIS" label="同步到客服系統" kind="switch" orientation="horizontal" size={size} disabled><ToggleValue initial /></Row>
          </FieldGroup>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">一般表單(標籤在左;對照:不得變)</p>
        <section data-reading-set="FH" className={`w-[400px] ${CARD}`}>
          <FieldGroup labelWidth={112}>
            <Row set="FH" label="專案名稱" kind="input" orientation="horizontal" size={size}><Input defaultValue="結帳體驗改版" /></Row>
            <Row set="FH" label="公開" kind="switch" orientation="horizontal" size={size}><ToggleValue initial /></Row>
            <Row set="FH" label="接收通知" kind="checkbox" orientation="horizontal" size={size}><CheckValue initial /></Row>
            <Row set="FH" label="專案代號" kind="input" orientation="horizontal" size={size} disabled><Input defaultValue="CHK" /></Row>
          </FieldGroup>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">一般表單(標籤在上;對照:不得變)</p>
        <section data-reading-set="FV" className={`w-[320px] ${CARD}`}>
          <FieldGroup>
            <Row set="FV" label="專案名稱" kind="input" orientation="vertical" size={size}><Input defaultValue="結帳體驗改版" /></Row>
            <Row set="FV" label="公開" kind="switch" orientation="vertical" size={size}><ToggleValue initial={false} /></Row>
            <Row set="FV" label="接收通知" kind="checkbox" orientation="vertical" size={size}><CheckValue initial /></Row>
          </FieldGroup>
        </section>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p className="text-body text-fg-secondary">DescriptionList(標籤色的參照)</p>
        <section data-reading-set="REF" className={`w-[320px] ${CARD}`}>
          <DescriptionList>
            <DescriptionItem label="建立時間">2026-11-20 09:30</DescriptionItem>
            <DescriptionItem label="最後更新">2026-11-24 17:05</DescriptionItem>
          </DescriptionList>
        </section>
      </div>
    </div>
  )
}
