import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from '@storybook/test'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import type { PersonValue } from './person-display'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldError, FieldLabel } from '@/design-system/components/Field/field'

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
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（可互動）</h3>
        <PeoplePicker value={val} people={samplePeople} onChange={(v) => setVal(v[0] ?? null)} aria-label="負責人(edit mode demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">view</h3>
        <PeoplePicker mode="view" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <PeoplePicker mode="readonly" value={samplePeople[0]} />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
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
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit（可互動,多選）</h3>
        <PeoplePicker value={val} people={samplePeople} onChange={setVal} aria-label="專案協作者(edit multi demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <PeoplePicker mode="readonly" value={readonlyVal} />
      </div>
    </div>
  )
}

export const Multi: Story = {
  name: '多人',
  render: () => <MultiPicker />,
}

/* ── hug 寬度 × 多人頭像串 ────────────────────────────────────────────────
   為什麼需要這個 story:`width='hug'` 的欄位是 `w-fit max-w-full`(寬度由內容決定),
   而頭像串「畫幾顆」也是量出來的 —— 兩者互為因果就會形成單向棘輪:
   少畫一顆 → 欄位變窄 → 量到更窄 → 再少畫一顆,空間還回來也回不去。
   (2026-09-07 修:量測改成「容器內容寬 − 欄位外框開銷」,兩個減數同幀量、內容影響互相抵消。)

   讀法:容器 720px 寬、六個人。hug 欄位應該長到放得下的長度,而不是縮成「1 顆 + +5」。 */
export const HugWidthMultiStack: Story = {
  name: 'hug 寬度 × 多人',
  render: () => (
    <div className="flex flex-col gap-4" style={{ width: 720 }}>
      <p className="text-caption text-fg-muted">
        容器 720px。<code>width=&quot;hug&quot;</code> 的欄位寬度由內容決定,頭像串可畫幾顆則由
        「容器還剩多少」決定 —— 兩者不可互為因果,否則會一路縮到只剩一顆。
      </p>
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
  ),
}

// Roving-focus 契約 probe:逐一移除 chip 時焦點依序落到下一個移除鈕,移除
// 最後一人後回到 combobox。破壞性互動(清空全員)只屬測試,不得寄生在
// reader-facing 展示 story(anchor:2026-08-05 user 抓「多人一打開就自己清空」;
// 前身還為此加過「重設協作者」假 UI,ccf83b24)。story-rules「Technical probe
// visibility」canonical:標 test-only,自 sidebar/Autodocs 排除,test runner 照跑。
export const MultiRemoveFocusContract: Story = {
  name: '移除焦點接力驗證',
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
  tags: ['test-only'],
  render: () => <MultiPicker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btn = await canvas.findByRole('button', { name: '移除 Alice Chen' })
    btn.focus()
  },
}

/* ── 一鍵清空(選填欄位) ── */
// X 在 ChevronDown 左(family SSOT field-controls.spec.md「下拉箭頭」段)。「無選擇是有效
// 狀態」的選填欄位才開 clearable(select.spec.md「何時開」)——代理人 / 觀察者是典型選填人員欄位。
const ClearablePicker = () => {
  const [delegate, setDelegate] = React.useState<PersonValue | null>(samplePeople[1])
  const [watchers, setWatchers] = React.useState<PersonValue[]>(samplePeople.slice(2, 5))
  return (
    <div className="flex flex-col gap-6 max-w-xs">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">單人(代理人,選填)</h3>
        <PeoplePicker clearable value={delegate} people={samplePeople} onChange={(v) => setDelegate(v[0] ?? null)} aria-label="代理人(選填)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">多人(觀察者,選填)</h3>
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
    <div className="flex items-center gap-3">
      <PeoplePicker size={size} value={val} people={samplePeople} onChange={(v) => setVal(v[0] ?? null)} className="max-w-xs" aria-label={`負責人(size=${size})`} />
      <Button variant="primary" size={size}>送出</Button>
      <span className="text-caption text-fg-muted">size="{size}"</span>
    </div>
  )
}

export const SizeAlignment: Story = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-4">
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
      <PeoplePicker value={val[0] ?? null} people={people} suggestions={recent} filterOption={false} optionsLoading={optionsLoading} onSearchChange={onSearchChange} onChange={setVal} defaultOpen aria-label="指派人員(遠端搜尋)" />
    </div>
  )
}

export const RemoteSearch: Story = {
  name: '遠端搜尋名錄(建議 → 載入 → 結果)',
  parameters: { docs: { description: { story: 'Jira 指派人員、組織名錄在伺服器:還沒打字先列「建議」群組(最近指派過的兩位,群組標題告訴你名錄不只這些);每打一個字向後端要一次,抓資料中舊結果不留、只剩一列「載入選項中」;找不到才顯示「沒有人員」;清掉關鍵字回到建議。' } } },
  render: () => <RemoteDirectoryPicker />,
}
