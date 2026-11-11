// @story-baseline: tokens/density/density.stories.tsx#UISize — token bar 展示慣例同源;本頁展示 size-tier 軸(xs/sm/md/lg + icon 兩 tier),density md/lg 軸在 Tokens/Density 不重複
import { useLayoutEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Download } from 'lucide-react'
import { ICON_SIZE } from './icon-size'
import { Select } from '@/design-system/components/Select/select'
import { TutorialPage, TutorialSection, StoryLink } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Tokens/UiSize',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
元件高度的語義 token(rem 單位,尊重使用者瀏覽器字體設定)。\`--field-height-*\` 是核心家族——Button / Input / Select 等互動元件共享 **default \`md\`**;另有 table-row / tab-height / chrome-header 等家族。

**md ↔ lg density 軸**的對照展示在 \`Design System/Tokens/Density\`,本頁不重複;此處展示 **size tier 軸**(xs / sm / md / lg)與 icon 尺寸的離散配對。

產品自己排的東西要跟輸入框同高、文字起點對齊時,看「產品對齊用的共用尺寸」:哪 12 顆可以讀、怎麼讀(只讀不覆寫;要輸入框還是用元件)。
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj


function HeightRow({ token, px, usage, isDefault }: {
  token: string; px: string; usage: string; isDefault?: boolean
}) {
  return (
    // @layout-space-magic-ok: token 表同質列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
    <div className="grid items-center gap-x-6 border-b border-border py-3 last:border-0"
      style={{ gridTemplateColumns: '200px 160px 60px 1fr' }}>
      <div>
        <code className="block text-caption font-medium text-fg-secondary">{token}</code>
        {isDefault && <span className="text-caption text-fg-muted">★ family default</span>}
      </div>
      <div
        className="rounded-md bg-primary"
        style={{ height: `var(${token})`, width: '100%' }}
      />
      <span className="text-caption font-mono text-fg-muted">{px}</span>
      <span className="text-body text-foreground">{usage}</span>
    </div>
  )
}

function IconTierRow({ tier, iconPx, note }: { tier: string; iconPx: number; note: string }) {
  return (
    // @layout-space-magic-ok: token 表同質列 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值)
    <div className="grid items-center gap-x-6 border-b border-border py-3 last:border-0"
      style={{ gridTemplateColumns: '260px 120px 1fr' }}>
      <code className="text-caption font-medium text-fg-secondary">{tier}</code>
      {/* @layout-space-magic-ok: 圖示 ↔ 尺寸標籤 —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 2eb5b433 同值) */}
      <div className="flex items-center gap-2">
        <Download size={iconPx} className="text-foreground" aria-hidden />
        <span className="text-caption font-mono text-fg-muted">{iconPx}px</span>
      </div>
      <span className="text-body text-foreground">{note}</span>
    </div>
  )
}


export const Overview: Story = {
  name: '總覽',
  render: () => (
    <TutorialPage>
      {/* 兩張表寬 = 原本的整頁 max-w-3xl(頁根不再自訂寬,BA-tutorial-width) */}
      <TutorialSection title="Field Height">
        <div className="max-w-3xl">
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            Button / Input / Checkbox SelectionItem 等互動元件的高度。一般 field family 消費者
            <strong>不傳 size 時預設 md</strong>——Form / Toolbar 並排多控件默認等高。
            documented carve-outs 例外:Checkbox / Switch / Rating 等小控件只有內容高、列高由 Field 槽供給(預設仍 md)、
            Chip 等單一尺寸消費者不在 default-md 規則內。
            下列為 md density 預設值(lg density 對照見{' '}
            <StoryLink kind="Design System/Tokens/Density" name="UI 尺寸">Density → UI 尺寸</StoryLink>)。
          </p>

          <HeightRow token="--field-height-xs" px="24px" usage="密集 UI 地板高度;固定不隨 density 縮放。獨立互動元件不得低於此高度" />
          <HeightRow token="--field-height-sm" px="28px" usage="輕量浮層(Popover body / footer)內的控件尺寸" />
          <HeightRow token="--field-height-md" px="32px" usage="Form / Dialog / 一般頁面的控件尺寸" isDefault />
          <HeightRow token="--field-height-lg" px="36px" usage="需要更大點擊目標的場景;同時切換到大 icon tier(20px)" />
        </div>
      </TutorialSection>

      <TutorialSection title="Icon 尺寸兩 tier">
        <div className="max-w-3xl">
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            Icon 尺寸由元件引用的 field-height token 決定——離散兩組配對,無中間值、不需公式。
            程式化 SSOT 是 <code>ICON_SIZE</code> 常數(本表直接消費真值渲染)。
          </p>

          <IconTierRow
            tier="field-height-xs / sm / md"
            iconPx={ICON_SIZE.sm}
            note="搭配 text-body(14px);Checkbox / Radio 控件同 16px"
          />
          <IconTierRow
            tier="field-height-lg"
            iconPx={ICON_SIZE.lg}
            note="搭配 text-body-lg(16px);Checkbox / Radio 控件同 20px"
          />

          <p className="text-caption text-fg-muted mt-[var(--layout-space-tight)]">
            Stroke icon 下限 12px(僅出現在 Checkbox 等指示器內部)。
          </p>
        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}


// ── 產品對齊用的共用尺寸(user 2026-11-10 token 第 5 題「5甲」)──────────────────
// 畫面上的數字一律當場量(getBoundingClientRect),不在 story 裡另抄一份值 —— 同一個值只有一個住處
// (token-system.spec.md 規則 2)。誰可以讀的唯一一份資料是 tokens/token-registry.json 的 product 欄;這裡只是展示頁
// (token-system.spec.md「新增 / 搬家 / 退場時要做的事」第 6 條:產品可讀的共用刻度要有展示頁)。

type DensityMode = 'md' | 'lg'

/**
 * 量一顆長度 token 在這個位置算出來幾 px。probeClass = 讀者的字級(--field-control-py-* 的 1lh 在使用端解析)。
 * 只負責量與印數字,不帶字級 / 字色:讀數是表格的一格,字樣由表格那一列給(跟欄位標題同一處寫),
 * 它不是範例的說明(說明一律 ExampleCaption;tutorial-page-invariant R10)。
 */
function MeasuredLength({ token, probeClass = 'text-body' }: { token: string; probeClass?: string }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [px, setPx] = useState('')
  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height
    if (h != null) setPx(`${Math.round(h * 10) / 10}px`)
  }, [token])
  return (
    // block:數字的行框用這一格(caption)自己的行高,跟同列 token 名字同一條基線(inline 的話會吃到外層 body 行高,往下掉 2px)
    <span className="relative block">
      <span ref={probe} aria-hidden className={`invisible absolute left-0 top-0 block w-px ${probeClass}`} style={{ height: `var(${token})` }} />
      {px}
    </span>
  )
}

/** 讀數格的字樣(表格這一欄的字樣,只寫這一處) */
const READING_CELL = 'text-caption font-mono text-fg-muted'

const ALIGN_COLS = '240px 96px 96px'

interface AlignmentFamily {
  title: string
  use: string
  tokens: { token: string; probeClass?: string }[]
}

const ALIGNMENT_FAMILIES: AlignmentFamily[] = [
  {
    title: '輸入框高度',
    use: '自己排的一列要跟同 size 的按鈕、輸入框一樣高(上面權限條件面板的條件文字列讀 sm)',
    tokens: [{ token: '--field-height-xs' }, { token: '--field-height-sm' }, { token: '--field-height-md' }, { token: '--field-height-lg' }],
  },
  {
    title: '上下內距',
    use: '自己排的多行文字盒只有一行時,跟同 size 輸入框一樣高(大尺寸配大字級,行高不同)',
    tokens: [{ token: '--field-control-py-sm' }, { token: '--field-control-py-md' }, { token: '--field-control-py-lg', probeClass: 'text-body-lg' }],
  },
  {
    title: '左右內距',
    use: '文字起點跟輸入框裡的文字在同一條線(固定,不隨密度變)',
    tokens: [{ token: '--field-px' }],
  },
  {
    title: '堆疊間距',
    use: '疊在一起的兩樣東西之間的縫,跟焦點框、頭像堆疊同一個值',
    tokens: [{ token: '--stack-gap' }],
  },
  {
    title: '樹狀縮排',
    use: '自己排的巢狀清單每層往右縮多少,跟樹狀清單、表格巢狀列一致(跟元件 size 走,不隨密度變)',
    tokens: [{ token: '--tree-indent-sm' }, { token: '--tree-indent-md' }, { token: '--tree-indent-lg' }],
  },
  {
    title: '外框標頭高',
    use: '自己排的頁首跟側欄頂部同高(不在 12 顆裡,uiSize.spec.md「Chrome Header Height」本來就寫明產品可讀)',
    tokens: [{ token: '--chrome-header-height' }],
  },
]

function AlignmentFamilyRows({ family }: { family: AlignmentFamily }) {
  return (
    <div className="flex flex-col border-b border-border py-[var(--layout-space-tight)] last:border-0">
      <span className="text-body font-medium text-foreground">{family.title}</span>
      <span className="text-caption text-fg-muted">{family.use}</span>
      {family.tokens.map(({ token, probeClass }) => (
        <div key={token} className="grid items-center gap-x-[var(--layout-space-loose)] pt-[var(--layout-space-tight)]" style={{ gridTemplateColumns: ALIGN_COLS }}>
          <code className="text-caption font-medium text-fg-secondary">{token}</code>
          <div data-density="md" className={READING_CELL}><MeasuredLength token={token} probeClass={probeClass} /></div>
          <div data-density="lg" className={READING_CELL}><MeasuredLength token={token} probeClass={probeClass} /></div>
        </div>
      ))}
    </div>
  )
}

const ROLE_OPTIONS = [
  { value: 'assignee', label: '負責人' },
  { value: 'reporter', label: '回報人' },
  { value: 'watcher', label: '關注者' },
]

const STATUS_OPTIONS = [
  { value: 'closed', label: '已關閉' },
  { value: 'in_review', label: '審核中' },
  { value: 'draft', label: '草稿' },
]

/** 產品的權限條件面板:條件文字是產品自己排的,讀 --field-height-sm 跟旁邊的 DS Select(size="sm")同高 */
function PermissionConditionsPanel({ density }: { density: DensityMode }) {
  const label = useRef<HTMLSpanElement>(null)
  const control = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState('')
  useLayoutEffect(() => {
    const a = label.current?.getBoundingClientRect().height
    const b = control.current?.getBoundingClientRect().height
    if (a != null && b != null) setMeasured(`量到:條件文字列 ${Math.round(a)}px・選單 ${Math.round(b)}px`)
  }, [])
  return (
    // 密度只套在面板本身:標示與量測讀數留在頁面密度,兩欄的面板頂端才會對齊
    <div className="flex min-w-0 flex-1 flex-col gap-[var(--layout-space-tight)]">
      <span className="text-caption text-fg-muted">{density === 'md' ? '一般密度' : '大密度'}</span>
      <div data-density={density} className="flex flex-col gap-[var(--layout-space-loose)] rounded-md border border-border bg-surface p-[var(--layout-space-loose)]">
        <span className="text-body font-medium text-foreground">權限條件</span>
        <p className="text-body text-foreground">「專案管理員」可以編輯「錯誤回報」類型的工作項目,條件如下:</p>
        <div className="grid items-start gap-[var(--layout-space-tight)]" style={{ gridTemplateColumns: 'max-content minmax(0, 1fr)' }}>
          <span ref={label} className="flex min-h-[var(--field-height-sm)] items-center text-body text-fg-secondary">這個角色是</span>
          <div ref={control}>
            <Select size="sm" options={ROLE_OPTIONS} defaultValue="assignee" aria-label={`角色條件(${density === 'md' ? '一般密度' : '大密度'})`} />
          </div>
          <span className="flex min-h-[var(--field-height-sm)] items-center text-body text-fg-secondary">而且狀態不是</span>
          <Select size="sm" options={STATUS_OPTIONS} defaultValue="closed" aria-label={`狀態條件(${density === 'md' ? '一般密度' : '大密度'})`} />
        </div>
        <p className="text-caption text-fg-muted">條件設定好才會生效。</p>
      </div>
      <span className="text-caption font-mono text-fg-muted">{measured}</span>
    </div>
  )
}

export const ProductAlignment: Story = {
  name: '產品對齊用的共用尺寸',
  parameters: {
    docs: {
      description: {
        story: '產品自己排的東西(不是 DS 元件)要跟輸入框同高、文字起點對齊時,讀這些共用尺寸:只讀、不覆寫(要換尺寸用元件的 `size` 參數),也不拿來自己刻輸入框(要輸入框就用 `Input` / `Select`)。依據 user 2026-11-10 token 第 5 題「5甲」;誰可以讀以 `tokens/token-registry.json` 的 `product` 欄為準。',
      },
    },
  },
  render: () => (
    <TutorialPage>
      <TutorialSection title="權限條件面板:自己排的條件文字跟選單同高">
        <div className="flex max-w-3xl flex-col gap-[var(--layout-space-tight)]">
          <p className="text-body text-fg-secondary">
            條件文字「這個角色是」不是輸入框,是產品自己排的一列。它讀 <code>--field-height-sm</code> 當最小高度、內容垂直置中,
            才會跟旁邊 <code>size=&quot;sm&quot;</code> 的選單同高;換到大密度兩邊一起變高,不用另寫數字。
          </p>
          <div className="flex flex-wrap gap-[var(--layout-space-loose)]">
            <PermissionConditionsPanel density="md" />
            <PermissionConditionsPanel density="lg" />
          </div>
        </div>
      </TutorialSection>

      <TutorialSection title="可以讀的 12 顆,加上外框標頭高">
        <div className="max-w-3xl">
          <p className="text-body text-fg-secondary mb-[var(--layout-space-tight)]">
            數字是在這一頁當場量出來的(左欄一般密度、右欄大密度)。標籤高、頭像重疊量是元件自己的值,住在主人元件的樣式檔,產品不讀。
          </p>
          {/* 欄位標題 */}
          <div className="grid gap-x-[var(--layout-space-loose)] border-b border-border pb-[var(--layout-space-tight)]" style={{ gridTemplateColumns: ALIGN_COLS }}>
            <span className="text-caption text-fg-muted">token</span>
            <span className="text-caption text-fg-muted">一般密度</span>
            <span className="text-caption text-fg-muted">大密度</span>
          </div>
          {ALIGNMENT_FAMILIES.map((family) => <AlignmentFamilyRows key={family.title} family={family} />)}
        </div>
      </TutorialSection>
    </TutorialPage>
  ),
}
