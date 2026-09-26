import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { Rating } from './rating'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Rating/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ── Data ─────────────────────────────────────────────── */

type SizeKey = 'xs' | 'sm' | 'md' | 'lg'
type ModeKey = 'interactive' | 'readOnly' | 'disabled'

const SIZES: SizeKey[] = ['xs', 'sm', 'md', 'lg']
// 可以點的評分:每顆星對齊 item-anatomy inline Avatar(sm=20 / md=24 / lg=24),詳見 rating.spec.md「為什麼不完全對齊 icon tier」
const SIZE_PX: Record<SizeKey, number> = { xs: 20, sm: 20, md: 24, lg: 24 }
// 唯讀精簡版:星與字照 Button 的 icon + label 配對(rating.spec.md「Size — 唯讀精簡版」表)
const COMPACT: Record<SizeKey, { star: number; text: string; gap: string }> = {
  xs: { star: 16, text: 'text-caption (12px)', gap: 'gap-1 (4px)' },
  sm: { star: 16, text: 'text-body (14px)', gap: 'gap-2 (8px)' },
  md: { star: 16, text: 'text-body (14px)', gap: 'gap-2 (8px)' },
  lg: { star: 20, text: 'text-body-lg (16px)', gap: 'gap-2 (8px)' },
}

// 對齊 rating.spec.md「Size」表 canonical:xs = standalone 預設（商品卡 / 評論列表旁 / 搜尋結果 row,
// component default）,sm/md/lg 為 Field 配對尺寸(2026-07-04 補 xs — SizeMatrix 不該藏預設尺寸)
const SIZE_USE: Record<SizeKey, string> = {
  xs: 'Standalone 預設 — 商品卡 / 評論列表旁（component default,container 24）',
  sm: 'Field sm 並排（Field 配對尺寸）',
  md: 'Field 預設 — 一般表單評分欄位',
  lg: '送出評分的 review form、強調的主 CTA 區塊',
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>結構（Anatomy）</H3>
        <Desc>
          可以點的 Rating 由 `max`（預設 5）顆 Star icon 並排組成，每顆只有 filled / empty 兩態（只有整顆，沒有半顆）；
          容器 `inline-flex gap-1`。唯讀一律是精簡版：一顆實心星 + 數值 + 選填評論數（`count`）。
        </Desc>
        <div className="flex flex-col gap-4">
          {/* Single star anatomy — 可以點的評分才有 filled / empty 兩態 */}
          <div className="flex gap-8 items-start">
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">單顆星 — filled（可以點的評分）</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
                <Rating value={1} max={1} size="lg" aria-label="單顆星示意：實心" />
              </div>
              <span className="text-[10px] text-fg-muted font-mono">fill = var(--warning)</span>
            </div>
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">單顆星 — empty（可以點的評分）</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
                <Rating value={0} max={1} size="lg" aria-label="單顆星示意：空心" />
              </div>
              <span className="text-[10px] text-fg-muted font-mono">fill = var(--divider)</span>
            </div>
            <div className="flex flex-col gap-2 items-start">
              <span className="text-[11px] text-fg-muted font-medium">唯讀精簡版</span>
              <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
                <Rating value={4.7} count={12843} readOnly size="lg" aria-label="平均評分 4.7 星，共 5 星，12,843 則評論" />
              </div>
              <span className="text-[10px] text-fg-muted font-mono">★ var(--warning) · 數值 text-foreground · (count) text-fg-secondary</span>
            </div>
          </div>

          {/* Full Rating layout */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">整體 — 5 顆星 inline（可以點的評分）</span>
            <div className="inline-flex items-center border-2 border-dashed border-primary/30 rounded-md p-3">
              <Rating defaultValue={4} size="lg" aria-label="為這次體驗評分" />
            </div>
            <span className="text-[10px] text-fg-muted font-mono">inline-flex · gap-1（4px）· items-center</span>
          </div>
        </div>
      </div>

      <div>
        <H3>Props</H3>
        <table className="border-collapse">
          <thead>
            <tr>
              <Th>Prop</Th>
              <Th>Type</Th>
              <Th>Default</Th>
              <Th>說明</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ['value', 'number', '—', '當前評分（controlled，0 ~ max）。可以點的評分遇小數四捨五入到整顆；唯讀顯示一位小數'],
              ['defaultValue', 'number', '0', 'uncontrolled 預設值'],
              ['onChange', '(value: number) => void', '—', '評分改變 callback（滑鼠只給整數；鍵盤從目前值加減 1）'],
              ['max', 'number', '5', '滿分星數（世界級慣例 = 5，不建議超過 7）'],
              ['size', "'xs'|'sm'|'md'|'lg'", 'xs / md', '尺寸。可以點的星 20/20/24/24 px(對齊 inline Avatar);唯讀精簡版星 16/16/16/20 px + 字級照 Button。預設依情境:獨立展示 xs,Field 內跟隨 Field md'],
              ['readOnly', 'boolean', 'false', '唯讀：一律精簡版（一顆實心星 + 數值 + 選填 count），不響應 hover/click/鍵盤'],
              ['count', 'number', '—', '唯讀時接在數值後的評論數（千分位）；可以點的評分不顯示'],
              ['disabled', 'boolean', 'false', '完全停用'],
              ['loading', 'boolean', 'false', '暫時性等待,視覺同 disabled、aria-busy(詳 spec「Loading canonical」段)'],
              ['icon', 'LucideIcon', 'Star', '自訂 icon（極少用，禁止換成 Heart/ThumbsUp）'],
              ['aria-label', 'string', '—', 'standalone readOnly 時必填，要說出分數（有評論數就一起說）'],
            ].map(([p, t, d, desc]) => (
              <tr key={p}>
                <Td mono>{p}</Td>
                <Td mono>{t}</Td>
                <Td mono>{d}</Td>
                <Td>{desc}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

const PropRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[80px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

// 唯讀示範的評論數(檢閱器切到 readOnly 時接在數值後)
const INSPECTOR_REVIEW_COUNT = 128

const InspectorInner = () => {
  const [size, setSize] = useState<SizeKey>('md')
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [value, setValue] = useState(3)

  const readOnly = mode === 'readOnly'
  const disabled = mode === 'disabled'
  const compact = COMPACT[size]

  return (
    <div className="flex flex-col gap-6">
      {/* Controls — 互斥切換消費 SegmentedControl(segmented-control.spec.md「何時用」2–5 個互斥選項;
          取代手刻 Tab:它靜止借 neutral-hover、hover 借 neutral-active,是 color.spec.md 成對 token 的錯配) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">Size</span>
          <SegmentedControl size="sm" aria-label="Size" value={size} onValueChange={(v) => setSize(v as SizeKey)}>
            {SIZES.map((sz) => <SegmentedControlItem key={sz} value={sz}>{sz}</SegmentedControlItem>)}
          </SegmentedControl>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-20 shrink-0">Mode</span>
          <SegmentedControl size="sm" aria-label="Mode" value={mode} onValueChange={(v) => setMode(v as ModeKey)}>
            {(['interactive', 'readOnly', 'disabled'] as const).map((m) => <SegmentedControlItem key={m} value={m}>{m}</SegmentedControlItem>)}
          </SegmentedControl>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start flex-wrap">
        <div className="flex flex-col gap-5 min-w-[300px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <Rating
              value={value}
              onChange={setValue}
              size={size}
              readOnly={readOnly}
              count={readOnly ? INSPECTOR_REVIEW_COUNT : undefined}
              disabled={disabled}
              aria-label={readOnly
                ? `平均評分 ${value} 星，共 5 星，${INSPECTOR_REVIEW_COUNT} 則評論`
                : `為這次體驗評分，目前 ${value} 星，共 5 星`}
            />
          </div>
          <div className="text-caption text-fg-muted font-mono">
            當前值：{value} / 5
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span>
            </div>
            <PropRow label="Filled"><TokenCell token="--warning" /></PropRow>
            {readOnly ? (
              <>
                <PropRow label="Value"><TokenCell token="--foreground" display="text-foreground" /></PropRow>
                <PropRow label="Count"><TokenCell token="--fg-secondary" display="text-fg-secondary" /></PropRow>
              </>
            ) : (
              <>
                <PropRow label="Empty"><TokenCell token="--divider" /></PropRow>
                <PropRow label="Focus ring"><TokenCell token="--ring" display="outline: 2px solid var(--ring),往外 2px(全域 :focus-visible 規則,無 class)" /></PropRow>
              </>
            )}
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span>
            </div>
            {readOnly ? (
              <>
                <PropRow label="Star">{compact.star}px(icon tier,一顆)</PropRow>
                <PropRow label="Text">{compact.text}</PropRow>
                <PropRow label="Gap">{compact.gap}</PropRow>
                <PropRow label="Container">inline-flex · items-center</PropRow>
              </>
            ) : (
              <>
                <PropRow label="Icon size">{SIZE_PX[size]}px × 5</PropRow>
                <PropRow label="Gap">gap-1 (4px)</PropRow>
                <PropRow label="Container">inline-flex · items-center</PropRow>
                <PropRow label="Rounded">rounded-md (focus box)</PropRow>
              </>
            )}
          </div>

          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Behavior</span>
            </div>
            <PropRow label="Role">{readOnly || disabled ? 'img' : 'slider'}</PropRow>
            <PropRow label="tabIndex">{readOnly || disabled ? '—' : '0'}</PropRow>
            <PropRow label="Hover">{readOnly || disabled ? '—' : '填色預覽至游標所在星（只有整顆，不改尺寸）'}</PropRow>
            <PropRow label="Gap click">{readOnly || disabled ? '—' : '預覽亮著時點縫 = 確認預覽值'}</PropRow>
            <PropRow label="Keyboard">{readOnly || disabled ? '—' : 'Arrow ± 1 · Home=0 · End=max'}</PropRow>
          </div>

          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider">
              <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">A11y</span>
            </div>
            <PropRow label="aria-valuenow">{readOnly || disabled ? '—' : value}</PropRow>
            <PropRow label="aria-valuemin">{readOnly || disabled ? '—' : '0'}</PropRow>
            <PropRow label="aria-valuemax">{readOnly || disabled ? '—' : '5'}</PropRow>
            <PropRow label="aria-valuetext">{readOnly || disabled ? '—' : `${value} of 5 stars`}</PropRow>
            <PropRow label="aria-label">{readOnly ? '必填,要說出分數(畫面數值是 aria-hidden)' : 'Field 內免填 · standalone 必填'}</PropRow>
            <PropRow label="aria-labelledby">Field 內自動指向 FieldLabel（所有模式,含 readonly/disabled）</PropRow>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Inspector = {
  name: '元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <H3>元件檢閱器</H3>
      <Desc>
        選擇 size / mode，即時查看所有 token 與行為。readOnly 切到唯讀精簡版（一顆星 + 數值 + 評論數）。
        Rating 無 theme-dependent 色值以外的 resolved 數字（純 icon px + 黃灰兩色 + 兩個文字色）。
      </Desc>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>State × Token 對照</H3>
        <Desc>
          可以點的 Rating 只有 filled / empty 兩個星色；hover / focus / disabled 是行為層疊加，不改 fill 色。
          filled / empty 兩列用可以點的評分示範（唯讀精簡版只有一顆實心星，畫不出空星）；唯讀精簡版另有數值與評論數兩個文字色。
        </Desc>
      </div>
      <table className="border-collapse">
        <thead>
          <tr>
            <Th>State</Th>
            <Th>預覽</Th>
            <Th>Filled token</Th>
            <Th>Empty token</Th>
            <Th>額外視覺</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td mono>filled</Td>
            <Td><Rating value={5} size="md" aria-label="滿分示意" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td>—</Td>
            <Td>—</Td>
          </tr>
          <tr>
            <Td mono>empty</Td>
            <Td><Rating value={0} size="md" aria-label="零分示意" /></Td>
            <Td>—</Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td>—</Td>
          </tr>
          <tr>
            <Td mono>readOnly(精簡版)</Td>
            <Td><Rating value={4.7} count={12843} readOnly size="md" aria-label="平均評分 4.7 星，共 5 星，12,843 則評論" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td>—</Td>
            <Td className="text-[11px]">數值 text-foreground · 評論數 text-fg-secondary</Td>
          </tr>
          <tr>
            <Td mono>hover (interactive)</Td>
            <Td><Rating defaultValue={3} size="md" aria-label="hover 範例" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">填色預覽至游標所在星</Td>
          </tr>
          <tr>
            <Td mono>focus (keyboard)</Td>
            <Td><Rating defaultValue={3} size="md" aria-label="focus 範例" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">outline: 2px solid var(--ring),往外 2px(全域 :focus-visible 規則,無 class)</Td>
          </tr>
          <tr>
            <Td mono>disabled</Td>
            <Td><Rating value={3} disabled size="md" aria-label="disabled 範例" /></Td>
            <Td><TokenCell token="--warning" /></Td>
            <Td><TokenCell token="--divider" /></Td>
            <Td className="text-[11px]">opacity-disabled · pointer-events-none</Td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Size 對照</H3>
        <Desc>
          可以點的評分:每顆 star icon sm=20 / md=24 / lg=24,對齊 item-anatomy inline Avatar——
          一顆星是 filled identity 視覺(主要資料點),跟 Avatar 同重量才能在 row 內 visual weight 對齊。
          唯讀精簡版:星是數值旁的圖示,星與字照 Button 的 icon + label 配對(16/16/16/20 px、12/14/14/16px 字、4/8/8/8px 間距)。
          兩者 container 都走 `--field-height-*`(xs=24 / sm=28 / md=32 / lg=36)。詳見 rating.spec.md「Size」。
        </Desc>
      </div>

      <table className="border-collapse text-caption">
        <thead>
          <tr>
            <Th>Size</Th>
            <Th>可以點:星 px</Th>
            <Th>可以點:預覽</Th>
            <Th>唯讀:星 / 字 / 間距</Th>
            <Th>唯讀:預覽</Th>
            <Th>使用情境</Th>
          </tr>
        </thead>
        <tbody>
          {SIZES.map((sz) => (
            <tr key={sz}>
              <Td mono>{sz}{sz === 'md' ? ' ★Field default' : ''}</Td>
              <Td mono>{SIZE_PX[sz]}px · gap-1 (4px)</Td>
              <Td>
                <Rating defaultValue={4} size={sz} aria-label={`${sz} 尺寸示意，可以點的評分`} />
              </Td>
              <Td mono>{COMPACT[sz].star}px / {COMPACT[sz].text} / {COMPACT[sz].gap}</Td>
              <Td>
                <Rating value={4.5} count={892} readOnly size={sz} aria-label={`${sz} 尺寸示意，平均評分 4.5 星，共 5 星，892 則評論`} />
              </Td>
              <Td>{SIZE_USE[sz]}</Td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Container 消費 field-height;星的尺寸依呈現分兩套</span>
        <p className="text-caption text-fg-muted max-w-[720px] leading-relaxed">
          Rating 的 container 消費 `--field-height-*`（xs=24 / sm=28 / md=32 / lg=36），讓它與
          Input / NumberInput / DatePicker / Select / Button 等 field-height family 元件並排同一 row 時高度對齊。
          這一層是「外框高度」對齊。可以點的星走 item-anatomy inline Avatar 尺寸（sm=20 / md=24 / lg=24），
          而非 icon tier（16/16/20）——因為每一顆星是 filled identity 視覺（主要資料點），視覺份量要跟 Avatar 齊；
          唯讀精簡版的那一顆星則是數值旁的圖示，走 icon tier，與 Button 的 icon + label 同一張表。
        </p>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const StateBehavior = {
  name: '狀態行為',
  render: () => {
    const Interactive = () => {
      const [v1, setV1] = useState(0)
      const [v2, setV2] = useState(0)
      return (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              只有整顆 — 滑鼠、鍵盤都是一次一整顆
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              可以點的評分沒有半顆：點哪一顆就是那一顆的整數，鍵盤每按一下加減 1。
              value 若帶小數（例如從舊系統匯入的 3.6），畫面四捨五入成 4 顆；要照原值顯示小數，用唯讀精簡版。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={v1} onChange={setV1} size="lg" aria-label="為這次體驗評分" />
              <span className="text-caption text-fg-muted">當前值：{v1}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Interactive — hover 預覽 + click 設值
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              hover 某顆星時顯示到該星為止的填色預覽（state 未提交），click 才寫入。
              指標移到星與星之間的縫或上下留白時，預覽照舊亮著；此時點下去 = 確認正在預覽的值。
              Mouse leave（離開整個元件）才恢復當前已提交值。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={v2} onChange={setV2} size="lg" aria-label="hover 預覽範例" />
              <span className="text-caption text-fg-muted">當前值：{v2}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Keyboard — Arrow Left/Right/Up/Down 改值 · Home / End 跳極值
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              Focus 進入 Rating 容器後，Arrow Right/Up 加一、Arrow Left/Down 減一；
              Home 跳到 0、End 跳到 max（完整 WAI-ARIA slider 鍵盤 pattern）。
              值範圍 0 ~ max，超出自動 clamp。上方兩個範例都可以用鍵盤操作。
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              ReadOnly — 精簡版，不響應 hover / click / 鍵盤
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              展示平均分或他人評分時使用：一顆實心星 + 數值（取一位小數）+ 選填評論數。
              `role="img"`；畫面上的數值對螢幕閱讀器隱藏，standalone 時 `aria-label`（必填）要說出分數。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={4.5} count={8921} readOnly size="lg" aria-label="平均評分 4.5 星，共 5 星，8,921 則評論" />
              <span className="text-caption text-fg-muted">pointer / keyboard 都不響應</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium text-fg-secondary">
              Disabled — 整體降透明度，阻擋所有事件
            </span>
            <p className="text-caption text-fg-muted max-w-[720px]">
              `opacity-disabled` + `pointer-events-none`。`aria-disabled="true"`。仍畫整排星星（只有唯讀才是精簡版）。
            </p>
            <div className="flex items-center gap-4">
              <Rating value={4} disabled size="lg" aria-label="disabled 範例" />
            </div>
          </div>
        </div>
      )
    }
    return <Interactive />
  },
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `rating.spec.md` 「A11y 預設」段。摘要:\n\n-   interactive  ： role=\"slider\"  +  aria-valuenow={value}  +  aria-valuemin={0}  +  aria-valuemax={max}  +  aria-valuetext={`{value} of {max} stars`}  +  tabIndex={0} ，鍵盤 Arrow Left/Right/Up/Down ± 1（只有整顆），Home=0 / End=max（完整 WAI-ARIA slider 鍵盤 pattern）\n-   readOnly  ： role=\"img\"  +  aria-label （  standalone 必填  ），畫面上的數值與評論數是 aria-hidden，名稱要自己說出分數，例： aria-label=\"平均評分 4.7 星，共 5 星，12,843 則評論\" 。Field 內由 aria-labelledby 指向 FieldLabel。無 tabIndex\n-   disabled  ： aria-disabled=\"true\"  +  pointer-events-none \n-   單顆星    aria-hidden ：內部點擊目標是  <span role=\"presentation\" aria-hidden> （非 interactive element，避免與外層 role=\"slider\" 形成 axe nested-interactive）"}</p>
    </div>
  ),
}
