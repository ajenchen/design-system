import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from '@storybook/test'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from './person-display'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/design-system/components/Field/field'

const meta: Meta = {
  title: 'Design System/Components/PeoplePicker/展示',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '用於指派、邀請或選擇一位或多位人員，並以 Avatar 幫助辨識同名成員。非人員的單選／多選改用 Select / Combobox；只顯示人員資訊時改用 ProfileCard、Avatar.Group 或 list。',
      },
    },
  },
}

export default meta
type Story = StoryObj

// PersonData sample 含 ProfileCard 重要資訊(status / statusMessage / fields)—
// canonical:所有 person avatar hover 都應 render 完整資訊(profile-card.spec.md)。
const samplePeople = [
  {
    name: 'Alice Chen', avatarUrl: 'https://i.pravatar.cc/48?u=alice', description: 'Design｜D-0042｜EMP-1001',
    status: 'online' as const,
    statusMessage: 'Out of Office: Back on Monday! For urgent matters please contact @Wei-Lun Cheng in the meantime.',
    fields: [{ label: 'ID', value: 'YHANAX' }, { label: 'Employee number', value: 'EMP-1001' }],
  },
  {
    name: 'Bob Lin', avatarUrl: 'https://i.pravatar.cc/48?u=bob', description: 'Engineering｜E-0087｜EMP-1002',
    status: 'busy' as const,
    statusMessage: '正在處理 Q2 release,優先處理 P0 issues',
    fields: [{ label: 'ID', value: 'BLIN01' }, { label: 'Employee number', value: 'EMP-1002' }],
  },
  {
    name: 'Charlie Wu', avatarUrl: 'https://i.pravatar.cc/48?u=charlie', description: 'Product｜P-0015｜EMP-1003',
    status: 'away' as const,
    statusMessage: '外出開會,下午 3 點後回覆',
    fields: [{ label: 'ID', value: 'CWU003' }, { label: 'Employee number', value: 'EMP-1003' }],
  },
  {
    name: 'Diana Huang', avatarUrl: 'https://i.pravatar.cc/48?u=diana', description: 'Marketing｜M-0023｜EMP-1004',
    status: 'online' as const,
    statusMessage: 'Welcome pings! 我下午在 campaign review meeting',
    fields: [{ label: 'ID', value: 'DHUANG' }, { label: 'Employee number', value: 'EMP-1004' }],
  },
  {
    name: 'Eric Tsai', avatarUrl: 'https://i.pravatar.cc/48?u=eric', description: 'Engineering｜E-0091｜EMP-1005',
    status: 'offline' as const,
    statusMessage: 'PTO until next Tuesday',
    fields: [{ label: 'ID', value: 'ETSAI' }, { label: 'Employee number', value: 'EMP-1005' }],
  },
  {
    name: 'Fiona Lee', avatarUrl: 'https://i.pravatar.cc/48?u=fiona', description: 'Design｜D-0056｜EMP-1006',
    status: 'online' as const,
    statusMessage: 'Working on ProfileCard v3 refactor',
    fields: [{ label: 'ID', value: 'FLEE' }, { label: 'Employee number', value: 'EMP-1006' }],
  },
]

/* ── 單人（互動） ── */
const SinglePicker = () => {
  const [val, setVal] = React.useState<PersonValue | null>(samplePeople[0])
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-xs">
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">edit（可互動）</h3>
        <PeoplePicker value={val} people={samplePeople} onChange={(v) => setVal(v[0] ?? null)} aria-label="負責人(edit mode demo)" />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">view</h3>
        <PeoplePicker mode="view" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">readonly</h3>
        <PeoplePicker mode="readonly" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">disabled</h3>
        <PeoplePicker mode="disabled" value={samplePeople[0]} />
      </div>
    </div>
  )
}

export const Single: Story = {
  name: '單人',
  render: () => <SinglePicker />,
}

function PeoplePickerErrorExample() {
  const [value, setValue] = React.useState<PersonValue | null>(null)
  return (
    <Field required invalid={value == null} className="max-w-xs">
      <FieldLabel>任務負責人</FieldLabel>
      <PeoplePicker
        value={value}
        people={samplePeople}
        onChange={next => setValue(next[0] ?? null)}
        aria-label="任務負責人"
      />
      {value == null && <FieldError>請指派一位任務負責人</FieldError>}
    </Field>
  )
}

export const WithError: Story = {
  name: '驗證錯誤',
  render: () => <PeoplePickerErrorExample />,
}

/* ── 多人（互動） ── */
const MultiPicker = () => {
  const [val, setVal] = React.useState<PersonValue[]>(samplePeople.slice(0, 4))
  const readonlyVal = samplePeople.slice(0, 4)
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-xs">
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">edit（可互動,多選）</h3>
        <PeoplePicker value={val} people={samplePeople} onChange={setVal} aria-label="專案協作者(edit multi demo)" />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">readonly</h3>
        <PeoplePicker mode="readonly" value={readonlyVal} />
      </div>
    </div>
  )
}

export const Multi: Story = {
  name: '多人',
  render: () => <MultiPicker />,
}

/* ── 多人 × 欄位內搜尋(searchIn='trigger')──
   Outlook 排會議:出席者欄位直接打名字找人,選一位關鍵字就清空、游標留在欄位裡接著打下一位;
   頭像堆疊(預設)與每人一顆標籤(`multiDisplay='pill'`)兩種顯示,各放「已有人」與「還沒選」一格(選填那一格可一鍵清空)——
   欄位內搜尋框空值也在(people-picker.spec.md §D / §E:有頭像 → 純插入點,空 → 欄位 placeholder);
   它的寬度 = 打的字(combobox.spec.md「欄位內搜尋框的寬度」):接在最後一位後面,空的時候不自己佔一列 ——
   「會議記錄寄給」兩顆標籤排在同一列,關著的欄位沒有多一列空白(2026-09-30 前 60px 固定下限讓搜尋框自己換到第二列)。 */
const InlineSearchAttendees = () => {
  const [required, setRequired] = React.useState<PersonValue[]>(samplePeople.slice(0, 3))
  const [optional, setOptional] = React.useState<PersonValue[]>([])
  const [notify, setNotify] = React.useState<PersonValue[]>(samplePeople.slice(3, 5))
  const [cc, setCc] = React.useState<PersonValue[]>([])
  return (
    // 版面消費 field.stories.tsx FormValidation 同一組:區塊之間 layout-space-loose、標題 → 內容 layout-space-tight、多個欄位走 FieldGroup
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-xs">
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">頭像堆疊(預設)</h3>
        <FieldGroup>
          <Field>
            <FieldLabel>必要出席者</FieldLabel>
            <PeoplePicker searchIn="trigger" value={required} people={samplePeople} onChange={setRequired} />
          </Field>
          <Field>
            <FieldLabel>選擇性出席者</FieldLabel>
            <PeoplePicker searchIn="trigger" clearable value={optional} people={samplePeople} onChange={setOptional} />
          </Field>
        </FieldGroup>
      </div>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">每人一顆標籤(multiDisplay=&quot;pill&quot;)</h3>
        <FieldGroup>
          <Field>
            <FieldLabel>會議記錄寄給</FieldLabel>
            <PeoplePicker searchIn="trigger" multiDisplay="pill" value={notify} people={samplePeople} onChange={setNotify} />
          </Field>
          <Field>
            <FieldLabel>副本</FieldLabel>
            <PeoplePicker searchIn="trigger" multiDisplay="pill" clearable value={cc} people={samplePeople} onChange={setCc} />
          </Field>
        </FieldGroup>
      </div>
    </div>
  )
}

export const MultiInlineSearch: Story = {
  name: '多人 × 欄位內搜尋',
  parameters: { docs: { description: { story: 'Outlook 排會議:在欄位裡直接打名字找人,選一位關鍵字就清空、游標留在欄位裡接著打下一位。頭像堆疊與每人一顆標籤兩種顯示,各放已有人與還沒選的一格。' } } },
  render: () => <InlineSearchAttendees />,
}

/* ── hug 寬度 × 多人頭像串 ────────────────────────────────────────────────
   為什麼需要這個 story:`width='hug'` 的欄位是 `w-fit max-w-full`(寬度由內容決定),
   而頭像串「畫幾顆」也是量出來的 —— 兩者互為因果就會形成單向棘輪:
   少畫一顆 → 欄位變窄 → 量到更窄 → 再少畫一顆,空間還回來也回不去。
   (2026-09-07 修:量測改成「容器內容寬 − 欄位外框開銷」,兩個減數同幀量、內容影響互相抵消。)

   讀法:容器 720px 寬、六個人。hug 欄位應該長到放得下的長度,而不是縮成「1 顆 + +5」。 */
export const HugWidthMultiStack: Story = {
  name: '寬度貼合內容 × 多人',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)]" style={{ width: 720 }}>
      <p className="text-caption text-fg-muted">
        容器 720px。<code>width=&quot;hug&quot;</code> 的欄位寬度由內容決定,頭像串可畫幾顆則由
        「容器還剩多少」決定 —— 兩者不可互為因果,否則會一路縮到只剩一顆。
      </p>
      <div className="flex flex-col gap-[var(--layout-space-loose)]">
        <PeoplePicker
          width="hug"
          mode="readonly"
          value={samplePeople.slice(0, 6)}
          aria-label="協作者(hug 寬度)"
        />
        <PeoplePicker
          width="fill"
          mode="readonly"
          value={samplePeople.slice(0, 6)}
          aria-label="協作者(fill 寬度,對照組)"
        />
      </div>
    </div>
  ),
}

// Roving-focus 契約 probe:逐一移除 chip 時焦點依序落到下一個移除鈕,移除
// 最後一人後回到 combobox。破壞性互動(清空全員)只屬測試,不得寄生在
// reader-facing 展示 story(anchor:2026-08-05 user 抓「多人一打開就自己清空」;
// 前身還為此加過「重設協作者」假 UI,ccf83b24)。story-rules「Technical probe
// visibility」canonical:標 test-only,自 sidebar/Autodocs 排除,test runner 照跑。
export const MultiRemoveFocusContract: Story = {
  name: '移除焦點接力驗證',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  parameters: { demoFocus: 'keep' },
  tags: ['test-only'],
  render: () => <MultiPicker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '移除 Alice Chen' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: '移除 Bob Lin' })).toHaveFocus())
    await userEvent.click(canvas.getByRole('button', { name: '移除 Bob Lin' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: '移除 Charlie Wu' })).toHaveFocus())
    await userEvent.click(canvas.getByRole('button', { name: '移除 Charlie Wu' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: '移除 Diana Huang' })).toHaveFocus())
    await userEvent.click(canvas.getByRole('button', { name: '移除 Diana Huang' }))
    await waitFor(() => expect(canvas.getByRole('combobox', { name: '專案協作者(edit multi demo)' })).toHaveFocus())
  },
}

// Stack 移除鈕完整性 probe:AvatarDismissOverlay(`-top-px` + 2px ring,person-display.tsx)
// 必須完整可見,不被 tag 列裁切(combobox.tsx tagRowOverflowClass 只裁水平;anchor:2026-08-05
// user 抓「hover X 上緣被裁」— 2026-05-18 F2 雙軸 overflow-hidden 副作用)。screenshot lane
// 無 hover 能力,以 keyboard focus 觸發 group-focus-within 顯示 overlay。
export const StackRemoveOverlayProbe: Story = {
  name: '移除鈕完整性驗證',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  parameters: { demoFocus: 'keep' },
  tags: ['test-only'],
  render: () => <MultiPicker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btn = await canvas.findByRole('button', { name: '移除 Alice Chen' })
    btn.focus()
  },
}

// 「+N」浮出清單的移除契約 probe(2026-09-30):窄欄位裡頭像堆疊溢出成 +N,浮出清單裡的人員 Tag × 走 Combobox 同一條移除路徑
// —— 焦點接力不掉到 body、搜尋框握著焦點時不搬焦點(規則 select-menu.spec.md「A11y 預設」Focus 段、combobox.spec.md「Tag 操作」)。
// 兩格:浮層內搜尋(預設)與欄位內搜尋(`searchIn='trigger'`)。瀏覽器閘 searchable-menu-focus-invariant.mjs 從 index 讀到它、量 +N 卡片裡的 ×。
// 其餘人員 story 的欄位夠寬、六個人放得下,沒有 +N;DataTable 窄格有 +N 但不在該閘的家族裡。
// 同 MultiRemoveFocusContract 的做法(story-rules「Technical probe visibility」):標 test-only,自 sidebar / Autodocs 排除。
const OverflowRemovePickers = () => {
  const [inMenu, setInMenu] = React.useState<PersonValue[]>(samplePeople)
  const [inField, setInField] = React.useState<PersonValue[]>(samplePeople)
  return (
    <div className="flex flex-col gap-6 w-40">
      <PeoplePicker value={inMenu} people={samplePeople} onChange={setInMenu} clearable aria-label="審核人(窄欄位,浮層內搜尋)" />
      <PeoplePicker searchIn="trigger" value={inField} people={samplePeople} onChange={setInField} clearable aria-label="審核人(窄欄位,欄位內搜尋)" />
    </div>
  )
}
export const OverflowRemoveFocusContract: Story = {
  name: '+N 浮出清單移除驗證',
  tags: ['test-only'],
  render: () => <OverflowRemovePickers />,
}

/* ── 一鍵清空(選填欄位) ── */
// X 在 ChevronDown 左(family SSOT field-controls.spec.md「下拉箭頭」段)。「無選擇是有效
// 狀態」的選填欄位才開 clearable(select.spec.md「何時開」)——代理人 / 觀察者是典型選填人員欄位。
const ClearablePicker = () => {
  const [delegate, setDelegate] = React.useState<PersonValue | null>(samplePeople[1])
  const [watchers, setWatchers] = React.useState<PersonValue[]>(samplePeople.slice(2, 5))
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-xs">
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">單人(代理人,選填)</h3>
        <PeoplePicker clearable value={delegate} people={samplePeople} onChange={(v) => setDelegate(v[0] ?? null)} aria-label="代理人(選填)" />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">多人(觀察者,選填)</h3>
        <PeoplePicker clearable value={watchers} people={samplePeople} onChange={setWatchers} aria-label="觀察者(選填)" />
      </div>
    </div>
  )
}

export const Clearable: Story = {
  name: '一鍵清空(選填欄位)',
  render: () => <ClearablePicker />,
}

/* ── 尺寸與 Button 對齊 ── */
const SizePicker = ({ size }: { size: 'sm' | 'md' | 'lg' }) => {
  const [val, setVal] = React.useState<PersonValue | null>(samplePeople[0])
  return (
    <div className="flex items-center gap-[var(--layout-space-tight)]">
      <PeoplePicker size={size} value={val} people={samplePeople} onChange={(v) => setVal(v[0] ?? null)} className="max-w-xs" aria-label={`負責人(size=${size})`} />
      <Button variant="primary" size={size}>送出</Button>
      <span className="text-caption text-fg-muted">size="{size}"</span>
    </div>
  )
}

export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <SizePicker key={size} size={size} />
      ))}
    </div>
  ),
}

/* ── 人員清單非同步載入（已選值先到、名錄後到;前 1.5 秒 optionsLoading） ── */
const AsyncDirectoryPicker = () => {
  const [people, setPeople] = React.useState<PersonValue[]>([])
  const [optionsLoading, setOptionsLoading] = React.useState(true)
  const [val, setVal] = React.useState<PersonValue[]>([samplePeople[0], samplePeople[2]])
  React.useEffect(() => {
    const timer = window.setTimeout(() => { setPeople(samplePeople); setOptionsLoading(false) }, 1500)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div className="max-w-xs">
      <PeoplePicker value={val} people={people} optionsLoading={optionsLoading} onChange={setVal} aria-label="任務協作者" />
    </div>
  )
}

export const AsyncDirectoryLoad: Story = {
  name: '人員清單非同步載入',
  parameters: { docs: { description: { story: 'Jira 任務「協作者」欄位:已選成員隨任務資料先抵達,組織人員名錄約 1.5 秒後才從 API 回來——這 1.5 秒展開只看到一列「載入選項中」,觸發點不轉圈(名錄載入的指示只在選單內);已選成員立即顯示、不報錯,名錄未到前頭像先以姓名縮寫呈現,名錄載入後自動補上頭像。' } } },
  render: () => <AsyncDirectoryPicker />,
}

/* ── 選項載入中(首次開啟;開啟態快照,defaultOpen 讓瀏覽器閘不用點擊就看得到) ── */
export const LoadingFirstOpen: Story = {
  name: '選項載入中(首次開啟)',
  parameters: { docs: { description: { story: 'Jira 議題「指派人員」第一次展開,組織名錄還沒從 API 回來:清單只有一列「載入選項中」訊息列,與一筆人員等高,觸發點不轉圈;名錄回來後同一個選單直接長出人員列。' } } },
  render: () => (
    <div className="max-w-xs">
      <PeoplePicker value={null} people={[]} optionsLoading defaultOpen aria-label="指派人員(首次載入)" />
    </div>
  ),
}

export const ValueLoading: Story = {
  name: '值處理中(儲存)',
  parameters: { docs: { description: { story: '指派人員改成 Bob Lin 後正在寫回 Jira:`loading` 是 Field 家族共用的「這個值在讀取 / 驗證 / 儲存」—— 觸發點右側、箭頭左邊轉圈並標 aria-busy;跟名錄有沒有載入無關。' } } },
  render: () => (
    <div className="max-w-xs">
      <PeoplePicker value={samplePeople[1]} people={samplePeople} loading aria-label="指派人員(儲存中)" />
    </div>
  ),
}

/** 遠端搜尋名錄(Jira 指派人員):組織上萬人只能問伺服器;關鍵字空先列「建議」(最近指派過的兩位),每打一個字向後端要一次。 */
const RemoteDirectoryPicker = () => {
  const recent = [samplePeople[1], samplePeople[3]]
  const [people, setPeople] = React.useState<PersonValue[]>([])
  const [optionsLoading, setOptionsLoading] = React.useState(false)
  const [val, setVal] = React.useState<PersonValue[]>([])
  const timer = React.useRef<number | null>(null)
  const onSearchChange = (q: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    const needle = q.trim().toLowerCase()
    // 關鍵字清空:回到建議群組,不用問後端
    if (!needle) { setPeople([]); setOptionsLoading(false); return }
    setOptionsLoading(true)
    timer.current = window.setTimeout(() => {
      setPeople(samplePeople.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(needle)))
      setOptionsLoading(false)
    }, 800)
  }
  return (
    <div className="max-w-xs">
      <PeoplePicker value={val[0] ?? null} people={people} suggestions={recent} filterOption={false} optionsLoading={optionsLoading} onSearchChange={onSearchChange} onChange={setVal} aria-label="指派人員(遠端搜尋)" />
    </div>
  )
}

export const RemoteSearch: Story = {
  name: '遠端搜尋名錄(建議 → 載入 → 結果)',
  parameters: { docs: { description: { story: 'Jira 指派人員、組織名錄在伺服器:還沒打字先列「建議」群組(最近指派過的兩位,群組標題告訴你名錄不只這些);每打一個字向後端要一次,抓資料中舊結果不留、只剩一列「載入選項中」;找不到才顯示「沒有人員」;清掉關鍵字回到建議。' } } },
  render: () => <RemoteDirectoryPicker />,
}
