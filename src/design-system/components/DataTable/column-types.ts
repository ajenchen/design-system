import type { RowData } from '@tanstack/react-table'

// ── Column Types ─────────────────────────────────────────────────────────────

// ── Column Types ─────────────────────────────────────────────────────────────
//
// 命名原則:描述**資料型別**本身,不是視覺變體。命名要避開撞 Button `variant` 值。
// `string` / `url` 是世界級 DS(Atlassian / Notion / Ant Table)的資料型別用語,
// 跟 Button 的視覺變體 `text` / `link` 在 consumer 心智不會混淆。
export const columnTypes = [
  'string',      // 前身為 'text',因撞 Button variant="text"(文字樣式按鈕)改名
  'number',
  'currency',
  'date',
  'time',        // Phase C(2026-05-05):time-only column,渲 `<TimePicker>`
  'select',
  'multiSelect',
  'person',
  'multiPerson',
  'boolean',
  'url',         // 前身為 'link',因撞 Button variant="link"(連結樣式按鈕)改名
] as const

export type ColumnType = (typeof columnTypes)[number]

// ── Column Type Config ───────────────────────────────────────────────────────

export interface ColumnTypeConfig {
  /** Default horizontal alignment */
  align: 'left' | 'right' | 'center'
  // L3: sortingFn
  // L4: filterVariant, filterFn
  // L5: cellRenderer, cellEditor
}

/** Default config per column type */
export const columnTypeDefaults: Record<ColumnType, ColumnTypeConfig> = {
  string:      { align: 'left' },
  number:      { align: 'right' },
  currency:    { align: 'right' },
  date:        { align: 'left' },
  time:        { align: 'left' },
  select:      { align: 'left' },
  multiSelect: { align: 'left' },
  person:      { align: 'left' },
  multiPerson: { align: 'left' },
  boolean:     { align: 'left' },
  url:         { align: 'left' },
}

// ── Extend TanStack Table ColumnMeta ─────────────────────────────────────────

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * Column data type — determines default alignment, rendering, sorting, filtering.
     *
     * **Filterable column 必須設此 prop**(filter UI 只列有 `type` 的 column,
     * 對齊 Notion / Airtable / Linear:每 property 強制有 type)。
     */
    type?: ColumnType
    /** Override default alignment from column type */
    align?: 'left' | 'right' | 'center'
    /** Allow text wrapping (only effective when autoRowHeight is true) */
    wrap?: boolean
    /**
     * Column 寬度(px)— DS canonical 命名(2026-05-06 v14.3)。
     *
     * **為何不用 TanStack 的 `size`** — DS 內 `size` 既定意為元件 density string
     * `'sm' | 'md' | 'lg'`(Field / Button / Input 等 49+ 處 use case)。Column 寬
     * 是 px 數字,跟 density 概念衝突 → 走 DS-internal 命名 `width`/`minWidth`/`maxWidth`
     * (對齊 CSS 原生 + AG Grid 的命名共識)。
     *
     * 內部 pre-process 會把 `meta.width` copy 到 TanStack 的 root `size`,確保 column
     * resize feature(`enableColumnResize=true` 拖拉 + columnSizing state)正常運作。
     *
     * - **No resize mode**(default): `width` = column 寬度 reserve(cell ≥ width,
     *   flex 可 grow,**不可 shrink** 低於 width)。對齊 user 預期「我設多寬就多寬」。
     * - **Resize mode**(`enableColumnResize=true`):`width` = 初始寬度,user 可拖拉
     *   到 `minWidth` 為止。
     */
    width?: number
    /**
     * Column 最小寬度(px)— resize 模式下的拖拉下限。No resize 模式不使用(`width` 即下限)。
     * Default(resize mode 沒明示時)= 80px(`MIN_COLUMN_WIDTH`)。
     */
    minWidth?: number
    /**
     * Column 最大寬度(px)— resize 模式下的拖拉上限。預設無上限。
     */
    maxWidth?: number
    /**
     * Explicit opt-out from filter UI(預設 accessor column 有 type 即 filterable)。
     *
     * 用於:有 `type` 但不想在 filter UI 出現的 accessor column
     * (例如:internal sorting key、composite display 用的 hidden column)。
     */
    filterable?: boolean
    /** Number/currency formatting options */
    prefix?: string
    suffix?: string
    precision?: number
    locale?: string
    /** Select/multiSelect options — maps value to display label */
    options?: Array<{ value: string; label: string }>
    /** Date: Intl.DateTimeFormat options */
    formatOptions?: Intl.DateTimeFormatOptions
    /**
     * Date: 是否含時間部分(datetime mode)。對齊 Notion idiom — 不另設 datetime column type。
     *
     * - `false`(default):cell 顯示與 filter 比對僅日期(day-level 精度)
     * - `true`:cell 渲 date+time;filter 比對走 ms 精度(避開 Airtable 著名地雷)
     *
     * 在 advanced filter 中,`date` columnType 配 `includeTime=true` 時,
     * `date_*` ValueShape 自動 promote 到 `datetime_*`,渲 `<DatePicker showTime>` /
     * `<DatePickerRange showTime>`(詳 `filter-operators.ts` `getValueShape`)。
     */
    includeTime?: boolean
    /** Link: 自訂顯示文字（不設則自動從 URL 提取 hostname） */
    linkLabel?: string
    /**
     * Inline edit:column 是否可編輯。
     * - `true`:可編
     * - `false`(default):唯讀
     * - `(row) => boolean`:per-row 動態決定(e.g. row.status !== 'archived' 才能編)
     *
     * 互動 per type(對齊 Notion / Airtable):
     * - string / number / currency:click cell → inline `<Input>` autoFocus + selected
     * - date / select / multiSelect / person / multiPerson:click cell → 進 edit mode 的 Field control(用戶按 trigger 開 picker)
     * - boolean:不分 read/edit mode,直接 `<Checkbox>` 點即 toggle + commit
     * - url:read = 連結;**hover cell** 右側出 Pencil 按鈕,click 才進 `<Input>` edit mode(保留 click 連結語意)
     *
     * Esc cancel / blur or Enter commit。Commit 觸發 `onCellCommit`。
     */
    editable?: boolean | ((row: TData) => boolean)
    /**
     * Locked column — column reorder 不可拖,Notion 「primary column」 pattern。
     * 對齊 SKU / ID 等不可移欄位。
     */
    locked?: boolean
    /** Person/multiPerson edit mode: people pool for picker(2026-05-05 v4 type-augmentation)。 */
    people?: Array<{ name: string; avatarUrl?: string; description?: string }>
  }
}
