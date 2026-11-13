// 「欄位自己的浮層開著時的外框」閘(scripts/field-open-border-invariant.mjs)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
//
// 為什麼不是 story(三組格子各自的原因):
//   (一) 外面包一層浮層、直接把欄位元件當觸發點(導覽提示 / Popover / Tooltip):2026-11-13 的邊界調查掃過 DS 與 work-management,
//        都沒有這種用法;這種包法要不要列為禁止,規格目前沒有寫 —— 寫成 story 等於拿它當範例示範。
//        但「只認欄位自己的浮層」這句邊界(field.spec.md「Field state machine」表;記號的寫入者住 lib/composite-field-focus.ts 檔頭最後一段)
//        需要一個真的這樣包的掛載目標才量得到:外面那層的 props 會經 Radix Slot 落到欄位外框上,純 DOM 模擬量不到這一段。
//   (二) 驗證錯誤 × 可搜尋的 Select / 可打字的 DatePicker / 日期區間:展示頁的「驗證錯誤」範例只有不可搜尋、不可打字的那幾種,
//        這三格湊不出來;錯誤的長相已有範例,不為了閘再各加一則 story。
//   (三) 併排欄位組「欄位 / 欄位[驗證錯誤] / 欄位」(2026-11-13 加;格名 group-error-mid):閘把併排欄位組那一段(K、G 列)對這一組再量一遍,
//        期望色 --error —— 驗證錯誤的成員聚焦 / 自己的浮層開著時四邊紅、鄰居被滑過時共用那條線仍是紅
//        (field-control-group.spec.md「States」)。DS 的範例只有「錯誤格在最後一格」(FieldControlGroup 規格頁「狀態行為」),
//        錯誤格在中間、左右都有鄰居的組合沒有範例;這一組只為了量,不是業務情境的示範,所以不寫成 story。
//        錯誤狀態用元件的正式寫法:成員自己的 `error`(field.spec.md「Field state machine SSOT」:控件只傳 `error` flag)。
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
// 例外只有 (三) 成員的寬度 class:逐字沿用 story「篩選列」(FieldControlGroup/field-control-group.stories.tsx)已經用的那三個字串,
// 建置的 CSS 裡本來就有;story 改了字串,這一組只會變寬變窄,三格仍然相鄰(閘另外確認三格真的相鄰重疊 1px)。
// 每一格用 `data-fob-cell` 標名字(閘用它找格子)。外面那層的開關由同一格裡的按鈕受控(`data-fob-ext` = 現在開著嗎),
// 外面那層的 onOpenChange 一律不理 —— 點欄位、點外面、按 Esc 都不會動到它,閘才分得清「外面開著」與「欄位自己開著」。
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/design-system/components/Button/button'
import { Coachmark } from '@/design-system/components/Coachmark/coachmark'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { FieldControlGroup } from '@/design-system/components/FieldControlGroup/field-control-group'
import { Input } from '@/design-system/components/Input/input'
import { Popover, PopoverBody, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { Select } from '@/design-system/components/Select/select'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

const shipCountries = [
  { value: 'tw', label: '台灣' },
  { value: 'jp', label: '日本' },
  { value: 'us', label: '美國' },
  { value: 'de', label: '德國' },
]
const issueStatuses = [
  { value: 'todo', label: '待處理' },
  { value: 'doing', label: '進行中' },
  { value: 'review', label: '審查中' },
  { value: 'done', label: '已完成' },
]
const filterFields = [
  { value: 'name', label: '名稱' },
  { value: 'sku', label: 'SKU' },
  { value: 'category', label: '類別' },
]
const filterOperators = [
  { value: 'contains', label: '包含' },
  { value: 'is', label: '等於' },
  { value: 'starts', label: '開頭是' },
]
const ignoreOpenChange = () => {}
const cellStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, width: 320 }
// 併排欄位組那一格:橫跨兩欄、寬 640(同 story「篩選列」的外框寬)
const wideCellStyle: React.CSSProperties = { ...cellStyle, width: 640, gridColumn: '1 / -1' }
const captionStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: 'var(--fg-secondary)' }

function Cell({ name, title, wide = false, children }: { name: string; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section data-fob-cell={name} style={wide ? wideCellStyle : cellStyle}>
      <p style={captionStyle}>{title}</p>
      <div style={{ width: '100%' }}>{children}</div>
    </section>
  )
}

/** 外面那層受控的一格:按鈕切換外面那層,`data-fob-ext` 寫出現在的狀態;`close` 給外面那層自己的完成鍵用 */
function WrappedCell({ name, title, toggleLabel, render }: {
  name: string; title: string; toggleLabel: string
  render: (extOpen: boolean, close: () => void) => React.ReactNode
}) {
  const [extOpen, setExtOpen] = React.useState(false)
  return (
    <section data-fob-cell={name} data-fob-ext={extOpen ? 'open' : 'closed'} style={cellStyle}>
      <p style={captionStyle}>{title}</p>
      <div style={{ width: '100%' }}>{render(extOpen, () => setExtOpen(false))}</div>
      <div data-fob-toggle>
        <Button size="sm" onClick={() => setExtOpen((v) => !v)}>{toggleLabel}</Button>
      </div>
    </section>
  )
}

function Fixture() {
  const [country, setCountry] = React.useState('')
  const [due, setDue] = React.useState('')
  const [campaign, setCampaign] = React.useState<[string | null, string | null]>([null, null])
  const [status, setStatus] = React.useState('doing')
  const [sprint, setSprint] = React.useState<[string | null, string | null]>(['2026-11-10', '2026-11-21'])
  const [standup, setStandup] = React.useState('09:30')
  const [filterField, setFilterField] = React.useState('name')
  const [filterOperator, setFilterOperator] = React.useState('contains')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 320px', columnGap: 200, rowGap: 96, padding: '64px 80px', minHeight: '100svh', alignContent: 'start' }}>
      {/* 左欄 = (二) 驗證錯誤 × 展示頁沒有的三種欄位;右欄 = (一) 外面包一層浮層(浮層開在欄位右邊,不蓋到別格) */}
      <Cell name="error-select-searchable" title="出貨國家(必填,還沒選)">
        <Select searchable error options={shipCountries} value={country} onChange={setCountry} placeholder="選擇出貨國家…" aria-label="出貨國家" />
      </Cell>
      <WrappedCell
        name="wrap-coachmark-select" title="狀態(導覽提示指著這個欄位)" toggleLabel="顯示狀態欄位的導覽提示"
        render={(extOpen, close) => (
          <Coachmark
            open={extOpen} onOpenChange={ignoreOpenChange} side="right" align="start"
            kind="new-features" title="狀態可以直接在這裡改" description="不用打開工作項目,選一個狀態就會存檔。"
            onNext={close} isLastStep data-fob-ext-content
          >
            <Select options={issueStatuses} value={status} onChange={setStatus} aria-label="狀態" />
          </Coachmark>
        )}
      />
      <Cell name="error-date-typeable" title="到期日(必填,還沒填)">
        <DatePicker typeable error value={due} onChange={setDue} aria-label="到期日" />
      </Cell>
      <WrappedCell
        name="wrap-popover-range" title="衝刺期間(旁邊的說明把這個欄位當觸發點)" toggleLabel="顯示衝刺期間說明"
        render={(extOpen) => (
          <Popover open={extOpen} onOpenChange={ignoreOpenChange}>
            <PopoverTrigger asChild>
              <DatePicker.Range value={sprint} onChange={setSprint} placeholder={['衝刺開始', '衝刺結束']} />
            </PopoverTrigger>
            <PopoverContent data-fob-ext-content side="right" align="start">
              <PopoverBody>衝刺固定兩週;改了期間,還沒完成的工作項目會留在這個衝刺。</PopoverBody>
            </PopoverContent>
          </Popover>
        )}
      />
      <Cell name="error-date-range" title="活動期間(必填,還沒填)">
        <DatePicker.Range error value={campaign} onChange={setCampaign} placeholder={['活動開始', '活動結束']} />
      </Cell>
      <WrappedCell
        name="wrap-tooltip-time" title="每日站會時間(整個欄位包在提示裡)" toggleLabel="顯示站會時間提示"
        render={(extOpen) => (
          <Tooltip open={extOpen}>
            <TooltipTrigger asChild>
              <TimePicker value={standup} onChange={setStandup} aria-label="每日站會時間" />
            </TooltipTrigger>
            <TooltipContent data-fob-ext-content side="right">站會時間會同步到團隊行事曆</TooltipContent>
          </Tooltip>
        )}
      />
      {/* (三) 併排欄位組:欄位 / 欄位[驗證錯誤] / 欄位。放最後一列,不動上面六格的位置;成員必須是欄位組的直接子元素(不包 wrapper) */}
      <Cell name="group-error-mid" title="篩選列(中間「篩選條件」那一格驗證錯誤)" wide>
        <FieldControlGroup block>
          <Select aria-label="篩選欄位" className="!w-[160px] flex-shrink-0" options={filterFields} value={filterField} onChange={setFilterField} />
          <Select aria-label="篩選條件" className="!w-[120px] flex-shrink-0" error options={filterOperators} value={filterOperator} onChange={setFilterOperator} />
          <Input aria-label="篩選值" className="!flex-1 !min-w-0" defaultValue="無線滑鼠" />
        </FieldControlGroup>
      </Cell>
    </div>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('field-open-border fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色);
// Storybook 預設不開 StrictMode,這裡也不開(同 dialog-coexistence 夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)
