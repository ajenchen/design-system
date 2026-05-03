// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: Item Anatomy pattern spec 的教學 story,使用 raw <table> 呈現 token/align/primitive 對照表(類似 Figma inspect)。DataTable 的密度 / row 交互行為不適合純文件靜態對照;此為 pattern 自身 anatomy 檔,屬合理例外。
import type { Meta } from '@storybook/react'
import { useState } from 'react'
import {
  Mail, Bell, Settings, Star, ChevronRight, Globe, Lock,
  Trash2, X, MoreVertical, Download, RotateCw, Share2, RefreshCw,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MenuItem } from '@/design-system/components/Menu/menu-item'
import { SelectionItem } from '@/design-system/components/SelectionControl/selection-item'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Tag } from '@/design-system/components/Tag/tag'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
import { NameCard, NameCardDefaultActions } from '@/design-system/components/NameCard/name-card'

/** Person avatar hover canonical helper — avatar.spec.md DS-wide rule:
 *  name-card.spec.md 重要資訊 canonical(status / statusMessage / fields 皆必含) */
const personHover = (name: string, subtitle?: string) => (
  <NameCard
    name={name}
    subtitle={subtitle ?? 'Design｜D-0042｜EMP-1001'}
    avatar={{ alt: name }}
    status="online"
    statusMessage="Out of Office: Back on Monday!"
    actions={<NameCardDefaultActions />}
    fields={[
      { label: 'ID', value: 'YHANAX' },
      { label: 'Employee number', value: '1234567' },
    ]}
    onViewMore={() => {}}
  />
)
import { Button } from '@/design-system/components/Button/button'
import { Separator } from '@/design-system/components/Separator/separator'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { cn } from '@/lib/utils'

const meta: Meta = {
  title: 'Design System/Patterns/Item Anatomy',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type SizeKey = 'sm' | 'md' | 'lg'
type ConsumerKey = 'MenuItem' | 'SelectionItem' | 'ListItem'
type PrefixType = 'icon' | 'avatar'

const SIZES: SizeKey[] = ['sm', 'md', 'lg']

/** Consumer preset definitions — spacing varies by consumer, structure is shared */
interface ConsumerPreset {
  label: string
  desc: string
  mode: 'scanning' | 'reading'
  py: string
  pyDesc: string
  px: string
  pxDesc: string
  gap: string
  gapDesc: string
  suffixGap: string
  suffixGapDesc: string
  /**
   * Label / description 的截斷政策(per-consumer 設計決定)。
   * `undefined` = 不截斷(自然 wrap 到任意行數)。
   * `1` = line-clamp-1(用 truncate / line-clamp css 截斷,顯示 ellipsis)。
   * `2` = line-clamp-2(最多兩行)。
   */
  labelMaxLines: number | undefined
  descMaxLines: number | undefined
  /** 預留最少行數(避免 layout shift)。預設 0(完全不預留,內容沒有就高度為 0) */
  labelMinLines: number
  descMinLines: number
}

/** Consumer tab 顯示名(情境導向,不用元件名) */
const CONSUMER_DISPLAY: Record<ConsumerKey, { tab: string; sub: string }> = {
  MenuItem: { tab: '選單', sub: 'MenuItem · 浮層內快速掃視' },
  SelectionItem:  { tab: '表單選項', sub: 'SelectionItem · Checkbox / RadioGroup' },
  ListItem:       { tab: '列表', sub: 'ListItem · 頁面內瀏覽' },
}

const CONSUMERS: Record<ConsumerKey, ConsumerPreset> = {
  MenuItem: {
    label: 'MenuItem',
    desc: '浮層選單（DropdownMenu / ComboBox）',
    mode: 'scanning',
    py: '(field-height − 一行文字高度) / 2',
    pyDesc: '單行 = field-height',
    px: 'px-3 (12px)',
    pxDesc: '選單標準水平間距',
    gap: 'gap-2 (8px)',
    gapDesc: 'prefix-content 間距',
    suffixGap: 'gap-1 (4px)',
    suffixGapDesc: 'value + ChevronRight 更緊湊',
    // Source: menu-item.tsx — label / description 都截到 1 行,維持掃視節奏
    labelMaxLines: 1,
    descMaxLines: 1,
    labelMinLines: 0,
    descMinLines: 0,
  },
  SelectionItem: {
    label: 'SelectionItem',
    desc: '表單 Checkbox / RadioGroup',
    mode: 'reading',
    py: '(field-height − 一行文字高度) / 2',
    pyDesc: '單行 = field-height',
    px: 'none',
    pxDesc: '由外層容器決定',
    gap: 'gap-2 (8px)',
    gapDesc: '控件與 label 間距',
    suffixGap: '--',
    suffixGapDesc: '無 suffix',
    // Source: selection-item.tsx — 兩者皆無 clamp,form 欄位允許任意長度
    labelMaxLines: undefined,
    descMaxLines: undefined,
    labelMinLines: 0,
    descMinLines: 0,
  },
  ListItem: {
    label: 'ListItem',
    desc: '頁面列表（未來元件）',
    mode: 'reading',
    py: 'py-3 (12px)',
    pyDesc: '觸控友好的列表行高',
    px: 'px-4 (16px)',
    pxDesc: '頁面標準水平間距',
    gap: 'gap-3 (12px)',
    gapDesc: '適合較大的 avatar',
    suffixGap: 'gap-2 (8px)',
    suffixGapDesc: '後綴元素間距',
    // Convention: label 截到 1 行,description 截到 2 行(觸控列表常見做法)
    labelMaxLines: 1,
    descMaxLines: 2,
    labelMinLines: 0,
    descMinLines: 0,
  },
}

interface TypoSpec {
  labelFont: string
  labelSize: string
  labelLh: string
  descFont: string
  descSize: string
  descLh: string
  iconPx: number
}

const SCANNING_SPECS: Record<SizeKey, TypoSpec> = {
  sm: { labelFont: 'text-body leading-compact', labelSize: '14px', labelLh: '1.3', descFont: 'text-caption', descSize: '12px', descLh: '1.3', iconPx: 16 },
  md: { labelFont: 'text-body leading-compact', labelSize: '14px', labelLh: '1.3', descFont: 'text-caption', descSize: '12px', descLh: '1.3', iconPx: 16 },
  lg: { labelFont: 'text-body-lg leading-compact', labelSize: '16px', labelLh: '1.3', descFont: 'text-body leading-compact', descSize: '14px', descLh: '1.3', iconPx: 20 },
}

const READING_SPECS: Record<SizeKey, TypoSpec> = {
  sm: { labelFont: 'text-body', labelSize: '14px', labelLh: '1.5', descFont: 'text-body', descSize: '14px', descLh: '1.5', iconPx: 16 },
  md: { labelFont: 'text-body', labelSize: '14px', labelLh: '1.5', descFont: 'text-body', descSize: '14px', descLh: '1.5', iconPx: 16 },
  lg: { labelFont: 'text-body-lg', labelSize: '16px', labelLh: '1.5', descFont: 'text-body-lg', descSize: '16px', descLh: '1.5', iconPx: 20 },
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared UI Components
   ═══════════════════════════════════════════════════════════════════════════ */

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground">{children}</h3>
)
const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted max-w-[720px]">{children}</p>
)
const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium text-caption whitespace-nowrap">{children}</th>
)
const Td = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`p-2 border-b border-divider align-top whitespace-nowrap text-caption ${mono ? 'font-mono' : ''}`}>{children}</td>
)

const TkVal = ({ token, value }: { token: string; value?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-mono text-[12px] text-fg-secondary">{token}</span>
    {value && <span className="font-mono text-[10px] text-fg-muted">{value}</span>}
  </div>
)

const Swatch = ({ value, size = 'md' }: { value: string; size?: 'sm' | 'md' }) => {
  const s = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  if (value === 'transparent') {
    return <span className={`${s} rounded-md shrink-0 border border-border`}
      style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,3px 3px' }} />
  }
  return <span className={`${s} rounded-md shrink-0 border border-black/10`} style={{ backgroundColor: `var(${value})` }} />
}

const Tab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`px-2.5 py-1 text-[12px] font-mono rounded-md cursor-pointer transition-colors ${
      active ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
    }`}>
    {children}
  </button>
)

const PropRow = ({ label, dot, children }: { label: string; dot?: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[88px] shrink-0 pt-0.5 flex items-center gap-1.5">
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      {label}
    </span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

/** Blueprint zone colors
 * Text colors darkened 2026-04-22 to pass WCAG 4.5:1 contrast on 0.6-alpha tint bgs
 * (previous text 3.41-4.25 ratio failed Layer A audit — `pad/icon/gap/label`).
 */
const Z = {
  pad:     { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#3d5520' },
  /** Control slot(SelectionItem 的 Checkbox / RadioGroupItem,永遠 inline) */
  control: { bg: 'rgba(170,222,180,0.6)', border: 'rgba(85,165,110,0.9)', text: '#1f5030' },
  icon:    { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#1f4d82' },
  gap:     { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#664500' },
  label:   { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#452578' },
  dim:     { text: '#d04040' },
  suffix:  { bg: 'rgba(253,186,186,0.5)', border: 'rgba(210,80,80,0.7)', text: '#a03030' },
  /** flex-1 spacer:把 suffix 推到右邊的可擴展區域。用斜紋背景表達「會撐開」的性質,跟其他固定寬度的彩色區塊區隔 */
  spacer:  {
    bg: 'repeating-linear-gradient(45deg, rgba(160,160,160,0.12) 0 6px, rgba(160,160,160,0.22) 6px 12px)',
    border: 'rgba(140,140,140,0.6)',
    text: '#666666',
  },
}

/** Menu container — role=listbox 滿足內部 MenuItem role=option 的 parent(axe aria-required-parent)。 */
const MenuFrame = ({ children, width = 320 }: { children: React.ReactNode; width?: number }) => (
  <div
    role="listbox"
    aria-label="Anatomy inspector menu preview"
    className="rounded-lg bg-surface-raised border border-border overflow-hidden py-2"
    style={{ width, boxShadow: 'var(--elevation-200)' }}
  >
    {children}
  </div>
)


/** 把 maxLines 轉成 line-clamp class;'none' / 0 → 空字串 */
function lineClampClass(maxLines: number | 'none'): string {
  if (maxLines === 'none' || !maxLines) return ''
  if (maxLines === 1) return 'line-clamp-1'
  if (maxLines === 2) return 'line-clamp-2'
  if (maxLines === 3) return 'line-clamp-3'
  return ''
}

/** ListItem preview (simulated — component not yet built) */
const ListItemPreview = ({ size, startIcon: StartIcon, avatar, label, description, suffix, labelMaxLines = 1, descMaxLines = 2 }: {
  size: SizeKey
  startIcon?: LucideIcon
  avatar?: AvatarData
  label: string
  description?: string
  suffix?: React.ReactNode
  labelMaxLines?: number | 'none'
  descMaxLines?: number | 'none'
}) => {
  const iconPx = size === 'lg' ? 20 : 16
  const hasBlockPrefix = !!avatar && !!description
  const alignClass = hasBlockPrefix
    ? (size === 'lg' ? 'h-[calc(1lh+var(--item-gap-label-desc-reading)+var(--font-body-size)*1.5)]' : 'h-[calc(1lh+var(--item-gap-label-desc-reading)+var(--font-body-size)*1.5)]')
    : 'h-[1lh]'

  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${size === 'lg' ? 'text-body-lg' : 'text-body'}`}>
      {(StartIcon || avatar) && (
        <div className={`${alignClass} flex items-center shrink-0`}>
          {StartIcon && <StartIcon size={iconPx} aria-hidden />}
          {avatar && (
            <Avatar
              src={avatar.src}
              alt={avatar.alt}
              color={avatar.color}
              hoverCard={avatar.hoverCard}
              size={hasBlockPrefix ? (size === 'lg' ? 40 : 32) : 24}
            />
          )}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className={cn('break-words', lineClampClass(labelMaxLines))}>{label}</span>
        {description && (
          <p
            className={cn('mt-[var(--item-gap-label-desc-reading)] text-fg-secondary break-words', lineClampClass(descMaxLines))}
            // ── 規則(item-anatomy.spec.md 閱讀模式) ──
            // ListItem 是 reading mode:description 字體**最小 14px**(spec「14→14px, 16→14px」)。
            // sm/md/lg 全部 14px,行高跟 label 同(預設 1.5,不套 leading-compact)。
            //
            // ── 為什麼用 inline style ──
            // tailwind-merge 會把 font-size utility(text-body)和 color utility
            // (text-fg-secondary)誤判成同組衝突,strip 掉 text-body。inline style 直接繞過。
            style={{ fontSize: 'var(--font-body-size)' }}
          >
            {description}
          </p>
        )}
      </div>
      {/* Suffix: 24px 閾值獨立於 prefix。ChevronRight ≤24px → 永遠 h-[1lh] 對齊 label 第一行 */}
      {suffix && (
        <div className="h-[1lh] flex items-center ml-auto shrink-0">
          {suffix}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. 檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

type ContentLength = 'short' | 'medium' | 'long'
type DescContent = 'none' | ContentLength
type ClampOverride = 'preset' | 'unbounded' | 1 | 2 | 3

/**
 * 真實內容字串——長度遞增,放進固定寬度的容器後 wrap 行為是 emergent 的。
 * 容器寬度約 200px(藍圖) / 300px(live preview),md size text-body(14px)。
 * - short:約 6 字 → 1 行
 * - medium:約 14 字 → 2 行
 * - long:約 28 字 → 3+ 行
 *
 * 注意:**不指定行數**——行數由「容器寬度 + 內容長度 + clamp 政策」共同決定。
 */
const LABEL_TEXT: Record<ContentLength, string> = {
  short: '電子郵件通知',
  medium: '電子郵件通知與每週重點摘要信件',
  long: '電子郵件通知與每週重點摘要信件以及帳戶異常即時警示提醒功能',
}
const DESC_TEXT: Record<ContentLength, string> = {
  short: '每日摘要',
  medium: '每日寄送摘要信件到您的電子信箱',
  long: '每日寄送摘要信件到您的電子信箱,可在帳戶設定中隨時調整或關閉此功能',
}

/**
 * 解析 clamp override → 顯示用的 effective value(`undefined` = ∞,for inspect panel display)。
 */
function resolveClamp(override: ClampOverride, presetVal: number | undefined): number | undefined {
  if (override === 'preset') return presetVal
  if (override === 'unbounded') return undefined
  return override
}

/**
 * 解析 clamp override → 傳給元件 prop 的值(永遠是 `number | 'none'`,絕不傳 undefined)。
 *
 * 為什麼不能傳 undefined?React props 的 destructure default 在 undefined 時會接管,
 * 例如 `<MenuItem labelMaxLines={undefined}>` 等同沒傳,fallback 到元件預設。
 * 要明確覆寫成「不截斷」,必須傳 `'none'` 這個非 undefined 的 sentinel。
 */
function resolveClampProp(override: ClampOverride, presetVal: number | undefined): number | 'none' {
  if (override === 'preset') return presetVal ?? 'none'
  if (override === 'unbounded') return 'none'
  return override
}

const InspectorInner = () => {
  const [consumer, setConsumer] = useState<ConsumerKey>('MenuItem')
  const [size, setSize] = useState<SizeKey>('md')
  const [hasPrefix, setHasPrefix] = useState(true)
  const [prefixType, setPrefixType] = useState<PrefixType>('icon')
  // (SelectionItem 沒有 block 模式,prefix 永遠 inline)
  const [labelLength, setLabelLength] = useState<ContentLength>('short')
  const [descContent, setDescContent] = useState<DescContent>('short')
  const [labelClampOverride, setLabelClampOverride] = useState<ClampOverride>('preset')
  const [descClampOverride, setDescClampOverride] = useState<ClampOverride>('preset')
  const [hasSuffix, setHasSuffix] = useState(false)

  const hasDescription = descContent !== 'none'

  const preset = CONSUMERS[consumer]
  const spec = preset.mode === 'scanning' ? SCANNING_SPECS[size] : READING_SPECS[size]

  // SelectionItem 也支援 icon/avatar prefix(在 control 之後、label 之前),
  // 套用同樣的 24px 閾值對齊規則。所以這幾個 toggle 對 SelectionItem 完全有效。
  // SelectionItem 沒有 suffix(form 欄位通常不用 suffix),強制 hasSuffix=false。
  const effectiveHasPrefix = hasPrefix
  const effectivePrefixType: PrefixType = prefixType
  const effectiveHasSuffix = consumer === 'SelectionItem' ? false : hasSuffix

  // Control slot 只有 SelectionItem 有(Checkbox/RadioGroupItem),其他 consumer 無
  const hasControl = consumer === 'SelectionItem'

  // 解析有效的 clamp:
  // - effective*Clamp:用於 inspect panel 顯示(undefined = ∞)
  // - prop*Clamp:直接傳給元件 prop(用 'none' sentinel,避免 undefined 觸發 destructure default)
  const effectiveLabelClamp = resolveClamp(labelClampOverride, preset.labelMaxLines)
  const effectiveDescClamp = resolveClamp(descClampOverride, preset.descMaxLines)
  const propLabelClamp = resolveClampProp(labelClampOverride, preset.labelMaxLines)
  const propDescClamp = resolveClampProp(descClampOverride, preset.descMaxLines)

  // Block 對齊規則:所有 consumer 統一——avatar + desc → block。
  // SelectionItem 的差異:block 時 control 也跟著走 block 高度(跟 prefix 同步),不會歪斜。
  const isBlockAlign = effectivePrefixType === 'avatar' && hasDescription
  const alignContainer = isBlockAlign ? '= label 文字塊 + 2px + desc 文字塊' : '= 一行文字高度'
  const alignDesc = isBlockAlign
    ? consumer === 'SelectionItem'
      ? 'avatar + desc → block;**control 跟 prefix 同高度**(都在 text block center,不歪斜)'
      : 'prefix > 24px(avatar)+ description → 對齊 label + description 文字塊中心'
    : 'prefix ≤ 24px(或無 description)→ 對齊第一行 label 中線'

  // 真實內容字串
  const labelText = LABEL_TEXT[labelLength]
  const descText = hasDescription ? DESC_TEXT[descContent as ContentLength] : ''

  const PY_ZONE = 20
  const hasPx = consumer !== 'SelectionItem'
  const gapLabel = consumer === 'ListItem' ? 'gap-3' : 'gap-2'
  const gapPx = consumer === 'ListItem' ? '12px' : '8px'
  const pxLabel = consumer === 'ListItem' ? 'px-4' : 'px-3'
  const pxPx = consumer === 'ListItem' ? '16px' : '12px'

  // line-clamp 產生的 CSS class
  const labelClampClass =
    effectiveLabelClamp === 1 ? 'line-clamp-1' :
    effectiveLabelClamp === 2 ? 'line-clamp-2' :
    effectiveLabelClamp === 3 ? 'line-clamp-3' : ''
  const descClampClass =
    effectiveDescClamp === 1 ? 'line-clamp-1' :
    effectiveDescClamp === 2 ? 'line-clamp-2' :
    effectiveDescClamp === 3 ? 'line-clamp-3' : ''

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">情境</span>
          <div className="flex gap-1.5">
            {(Object.keys(CONSUMERS) as ConsumerKey[]).map((c) => (
              <Tab key={c} active={consumer === c} onClick={() => setConsumer(c)}>{CONSUMER_DISPLAY[c].tab}</Tab>
            ))}
          </div>
          <span className="text-[10px] text-fg-muted font-mono">{CONSUMER_DISPLAY[consumer].sub}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">hasPrefix</span>
          <div className="flex gap-1.5">
            <Tab active={hasPrefix} onClick={() => setHasPrefix(true)}>on</Tab>
            <Tab active={!hasPrefix} onClick={() => setHasPrefix(false)}>off</Tab>
          </div>
          {consumer === 'SelectionItem' && (
            <span className="text-[11px] text-fg-muted">
              SelectionItem 的 prefix 是<strong>除了 control 之外</strong>的視覺輔助
            </span>
          )}
        </div>
        {hasPrefix && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-24 shrink-0">prefixType</span>
            <div className="flex gap-1.5">
              <Tab active={prefixType === 'icon'} onClick={() => setPrefixType('icon')}>icon</Tab>
              <Tab active={prefixType === 'avatar'} onClick={() => setPrefixType('avatar')}>avatar</Tab>
            </div>
          </div>
        )}
        {/* SelectionItem avatar 沒有 block 模式(left checkbox + block avatar = 歪斜) */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">label 內容長度</span>
          <div className="flex gap-1.5">
            <Tab active={labelLength === 'short'} onClick={() => setLabelLength('short')}>short</Tab>
            <Tab active={labelLength === 'medium'} onClick={() => setLabelLength('medium')}>medium</Tab>
            <Tab active={labelLength === 'long'} onClick={() => setLabelLength('long')}>long</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">label clamp</span>
          <div className="flex gap-1.5">
            <Tab active={labelClampOverride === 'preset'} onClick={() => setLabelClampOverride('preset')}>
              preset({preset.labelMaxLines ?? '∞'})
            </Tab>
            <Tab active={labelClampOverride === 1} onClick={() => setLabelClampOverride(1)}>1</Tab>
            <Tab active={labelClampOverride === 2} onClick={() => setLabelClampOverride(2)}>2</Tab>
            <Tab active={labelClampOverride === 'unbounded'} onClick={() => setLabelClampOverride('unbounded')}>∞</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">description</span>
          <div className="flex gap-1.5">
            <Tab active={descContent === 'none'} onClick={() => setDescContent('none')}>none</Tab>
            <Tab active={descContent === 'short'} onClick={() => setDescContent('short')}>short</Tab>
            <Tab active={descContent === 'medium'} onClick={() => setDescContent('medium')}>medium</Tab>
            <Tab active={descContent === 'long'} onClick={() => setDescContent('long')}>long</Tab>
          </div>
        </div>
        {hasDescription && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-muted w-24 shrink-0">desc clamp</span>
            <div className="flex gap-1.5">
              <Tab active={descClampOverride === 'preset'} onClick={() => setDescClampOverride('preset')}>
                preset({preset.descMaxLines ?? '∞'})
              </Tab>
              <Tab active={descClampOverride === 1} onClick={() => setDescClampOverride(1)}>1</Tab>
              <Tab active={descClampOverride === 2} onClick={() => setDescClampOverride(2)}>2</Tab>
              <Tab active={descClampOverride === 'unbounded'} onClick={() => setDescClampOverride('unbounded')}>∞</Tab>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-24 shrink-0">hasSuffix</span>
          <div className="flex gap-1.5">
            <Tab active={hasSuffix} onClick={() => setHasSuffix(true)}>on</Tab>
            <Tab active={!hasSuffix} onClick={() => setHasSuffix(false)}>off</Tab>
          </div>
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-8 items-start">
        {/* Left: live preview + blueprint */}
        <div className="flex flex-col gap-6 min-w-[440px]">
          {/* Live preview */}
          <div className="px-8 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            {consumer === 'MenuItem' && (
              <MenuFrame width={360}>
                <MenuItem
                  size={size}
                  startIcon={effectiveHasPrefix && effectivePrefixType === 'icon' ? Mail : undefined}
                  avatar={effectiveHasPrefix && effectivePrefixType === 'avatar' ? { alt: "Alice", color: "indigo" as const, hoverCard: personHover("Alice", "Design team lead") } : undefined}
                  description={hasDescription ? descText : undefined}
                  tag={effectiveHasSuffix ? <Tag size={size} variant="blue">Pro</Tag> : undefined}
                  labelMaxLines={propLabelClamp}
                  descMaxLines={propDescClamp}
                >
                  {labelText}
                </MenuItem>
              </MenuFrame>
            )}
            {consumer === 'SelectionItem' && (
              <div className="w-[360px]">
                <SelectionItem
                  size={size}
                  control={<Checkbox size={size} checked={true} />}
                  icon={effectiveHasPrefix && effectivePrefixType === 'icon' ? Mail : undefined}
                  avatar={effectiveHasPrefix && effectivePrefixType === 'avatar' ? { alt: "Alice", color: "indigo" as const, hoverCard: personHover("Alice", "Design team lead") } : undefined}
                  label={labelText}
                  description={hasDescription ? descText : undefined}
                  labelMaxLines={propLabelClamp}
                  descMaxLines={propDescClamp}
                />
              </div>
            )}
            {consumer === 'ListItem' && (
              <div className="w-[360px] rounded-lg border border-divider overflow-hidden bg-surface">
                <ListItemPreview
                  size={size}
                  startIcon={effectiveHasPrefix && effectivePrefixType === 'icon' ? Mail : undefined}
                  avatar={effectiveHasPrefix && effectivePrefixType === 'avatar' ? { alt: "Alice", color: "indigo" as const, hoverCard: personHover("Alice", "Design team lead") } : undefined}
                  label={labelText}
                  description={hasDescription ? descText : undefined}
                  suffix={effectiveHasSuffix ? <ChevronRight size={spec.iconPx} className="text-fg-muted" /> : undefined}
                  labelMaxLines={propLabelClamp}
                  descMaxLines={propDescClamp}
                />
              </div>
            )}
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-3">
            {/* Legend */}
            <div className="flex items-center gap-4 text-[11px] flex-wrap">
              {[
                ...(hasPx ? [{ c: Z.pad, l: 'Padding' }] : []),
                ...(hasControl ? [{ c: Z.control, l: 'Control' }] : []),
                ...(effectiveHasPrefix ? [{ c: Z.icon, l: 'Prefix' }] : []),
                { c: Z.gap, l: 'Gap' },
                { c: Z.label, l: 'Content' },
                { c: Z.spacer, l: 'flex-1 spacer' },
                ...(effectiveHasSuffix ? [{ c: Z.suffix, l: 'Suffix' }] : []),
              ].map(({ c, l }) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md" style={{ background: c.bg, border: `1.5px dashed ${c.border}` }} />
                  <span className="font-medium" style={{ color: c.text }}>{l}</span>
                </span>
              ))}
            </div>

            {/*
              Diagram — 2D: vertical padding-y + horizontal zones
              ────────────────────────────────────────────────────
              Container 寬度固定 520px,讓 flex-1 spacer 真的能撐開,
              如實反映真實元件的 layout 行為(避免 fit-content 造成的視覺混淆)。

              Row 結構:
                [px] [prefix] [gap] [Label/desc, 220px 固定寬] [flex-1 spacer] [suffix] [px]

              Label box 高度由「真實字串 + 容器寬 + line-clamp」共同決定,
              padding-y 區域固定 PY_ZONE(20px),演示「padding 不變,內容自然撐高」的 calc() 公式。
            */}
            <div className="flex items-start">
              <div className="flex flex-col rounded-lg overflow-hidden" style={{ width: 520, outline: `2px solid ${Z.dim.text}22` }}>
                {/* Top padding zone */}
                <div className="flex items-center justify-center"
                  style={{ height: PY_ZONE, background: Z.pad.bg, borderBottom: `1.5px dashed ${Z.pad.border}` }}>
                  <span className="text-[10px] font-mono font-bold" style={{ color: Z.pad.text }}>padding-y</span>
                </div>
                {/*
                  Horizontal content row — 高度由 Label box 內容決定(text 自然 wrap)
                  items-stretch:讓 prefix / spacer / suffix / px 都跟 Label box 同高
                */}
                <div className="flex items-stretch">
                  {hasPx && (
                    <div className="flex items-center justify-center shrink-0"
                      style={{ width: 48, background: Z.pad.bg, borderRight: `1.5px dashed ${Z.pad.border}` }}>
                      <span className="text-[12px] font-mono font-bold" style={{ color: Z.pad.text }}>{pxLabel}</span>
                    </div>
                  )}
                  {hasControl && (
                    <>
                      <div
                        className="flex shrink-0 items-center justify-center"
                        style={{
                          width: 50,
                          background: Z.control.bg,
                          borderLeft: `1.5px dashed ${Z.control.border}`,
                          borderRight: `1.5px dashed ${Z.control.border}`,
                        }}
                      >
                        <span className="text-[11px] font-mono font-bold text-center leading-tight" style={{ color: Z.control.text, whiteSpace: 'pre-line' }}>
                          {`control\n${spec.iconPx}px`}
                        </span>
                      </div>
                      <div className="flex items-center justify-center shrink-0"
                        style={{ width: 32, background: Z.gap.bg, borderRight: `1.5px dashed ${Z.gap.border}` }}>
                        <span className="text-[10px] font-mono font-bold" style={{ color: Z.gap.text }}>gap-2</span>
                      </div>
                    </>
                  )}
                  {effectiveHasPrefix && (
                    <>
                      <div
                        className="flex shrink-0 items-center justify-center"
                        style={{
                          width: 52,
                          background: Z.icon.bg,
                          borderLeft: `1.5px dashed ${Z.icon.border}`,
                          borderRight: `1.5px dashed ${Z.icon.border}`,
                        }}
                      >
                        <span className="text-[11px] font-mono font-bold text-center leading-tight" style={{ color: Z.icon.text, whiteSpace: 'pre-line' }}>
                          {effectivePrefixType === 'icon'
                            ? `icon\n${spec.iconPx}px`
                            : isBlockAlign
                              ? `avatar\n${size === 'lg' ? '40' : '32'}px`
                              : `avatar\n${size === 'sm' ? '20' : '24'}px`}
                        </span>
                      </div>
                      <div className="flex items-center justify-center shrink-0"
                        style={{ width: 38, background: Z.gap.bg, borderRight: `1.5px dashed ${Z.gap.border}` }}>
                        <span className="text-[11px] font-mono font-bold" style={{ color: Z.gap.text }}>{gapLabel}</span>
                      </div>
                    </>
                  )}
                  {/*
                    Label / description box:固定寬度 220px,**渲染真實字串**讓 wrap 自然發生。
                    行數是 emergent(內容長度 + 容器寬度 + clamp 三者決定),不是寫死的離散值。
                    line-clamp class 演示 max-lines 截斷;若內容超過 clamp,瀏覽器自動加 ellipsis。
                  */}
                  <div
                    className="flex flex-col shrink-0 justify-center py-1"
                    style={{
                      width: 220,
                      background: Z.label.bg,
                      borderLeft: `1.5px dashed ${Z.label.border}`,
                      borderRight: `1.5px dashed ${Z.label.border}`,
                    }}
                  >
                    <span
                      className={cn('text-[12px] font-mono font-bold leading-snug px-2 break-words', labelClampClass)}
                      style={{ color: Z.label.text }}
                    >
                      {labelText}
                    </span>
                    {hasDescription && (
                      <>
                        <div className="h-0.5" />
                        <span
                          className={cn('text-[10px] font-mono leading-snug px-2 opacity-80 break-words', descClampClass)}
                          style={{ color: Z.label.text }}
                        >
                          {descText}
                        </span>
                      </>
                    )}
                  </div>
                  {/* flex-1 spacer:斜紋背景,撐開 Label 與 suffix(或右 padding)之間的剩餘寬度 */}
                  <div
                    className="flex items-center justify-center"
                    style={{
                      flex: '1 1 0',
                      minWidth: 24,
                      background: Z.spacer.bg,
                      borderRight: `1.5px dashed ${Z.spacer.border}`,
                    }}
                  >
                    <span className="text-[10px] font-mono font-bold text-center leading-tight" style={{ color: Z.spacer.text, whiteSpace: 'pre-line' }}>
                      {'flex-1\npush →'}
                    </span>
                  </div>
                  {effectiveHasSuffix && (
                    <div className="flex items-center justify-center shrink-0"
                      style={{ width: 50, background: Z.suffix.bg, borderRight: `1.5px dashed ${Z.suffix.border}` }}>
                      <span className="text-[12px] font-mono font-bold" style={{ color: Z.suffix.text }}>suffix</span>
                    </div>
                  )}
                  {hasPx && (
                    <div className="flex items-center justify-center shrink-0"
                      style={{ width: 48, background: Z.pad.bg, borderLeft: `1.5px dashed ${Z.pad.border}` }}>
                      <span className="text-[12px] font-mono font-bold" style={{ color: Z.pad.text }}>{pxLabel}</span>
                    </div>
                  )}
                </div>
                {/* Bottom padding zone */}
                <div className="flex items-center justify-center"
                  style={{ height: PY_ZONE, background: Z.pad.bg, borderTop: `1.5px dashed ${Z.pad.border}` }}>
                  <span className="text-[10px] font-mono font-bold" style={{ color: Z.pad.text }}>padding-y</span>
                </div>
              </div>

              {/* Height annotation — 文字版,不再需要精確 px(高度由 Label box 內容決定) */}
              <div className="ml-4 flex items-start pt-2">
                <div className="text-[10px] font-mono text-fg-muted leading-relaxed">
                  <div className="text-fg-secondary font-bold mb-1">高度公式</div>
                  <div>= padding-y × 2</div>
                  <div>+ label content height</div>
                  {hasDescription && <div>+ 2px(label-desc gap)</div>}
                  {hasDescription && <div>+ desc content height</div>}
                  <div className="mt-2 text-fg-muted">內容多行 → 自然撐高</div>
                  <div className="text-fg-muted">padding-y 不變</div>
                </div>
              </div>
            </div>

            {/* 對齊規則 annotation */}
            {effectiveHasPrefix && (
              <div
                className="rounded-md px-3 py-2 text-[11px] flex items-start gap-2"
                style={{
                  background: isBlockAlign ? 'rgba(166,208,245,0.18)' : 'rgba(199,178,230,0.18)',
                  border: `1px dashed ${isBlockAlign ? Z.icon.border : Z.label.border}`,
                }}
              >
                <span className="font-mono font-bold mt-0.5 shrink-0" style={{ color: isBlockAlign ? Z.icon.text : Z.label.text }}>
                  {isBlockAlign ? '◫ Block 對齊' : '— Inline 對齊'}
                </span>
                <span className="text-fg-secondary leading-relaxed">{alignDesc}</span>
              </div>
            )}

            {/* Clamp 政策說明 */}
            <div className="rounded-md px-3 py-2 text-[11px] bg-muted border border-divider flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-fg-secondary">Clamp 政策</span>
                <span className="text-fg-muted">由 consumer 透過 prop 決定(每個 consumer 有預設,可 per-instance override)</span>
              </div>
              <div className="flex flex-wrap gap-x-4 font-mono text-[10px] text-fg-secondary">
                <span>
                  <code>labelMaxLines</code> = <strong>{effectiveLabelClamp ?? '∞ (unbounded)'}</strong>
                  {labelClampOverride !== 'preset' && <span className="text-error-text"> · override</span>}
                  {labelClampOverride === 'preset' && <span className="text-fg-muted"> · {preset.label} default</span>}
                </span>
                <span>
                  <code>labelMinLines</code> = <strong>{preset.labelMinLines}</strong>
                  {preset.labelMinLines === 0 && <span className="text-fg-muted"> · 不預留(內容空 → 高度 0)</span>}
                </span>
              </div>
              {hasDescription && (
                <div className="flex flex-wrap gap-x-4 font-mono text-[10px] text-fg-secondary">
                  <span>
                    <code>descMaxLines</code> = <strong>{effectiveDescClamp ?? '∞ (unbounded)'}</strong>
                    {descClampOverride !== 'preset' && <span className="text-error-text"> · override</span>}
                    {descClampOverride === 'preset' && <span className="text-fg-muted"> · {preset.label} default</span>}
                  </span>
                  <span>
                    <code>descMinLines</code> = <strong>{preset.descMinLines}</strong>
                  </span>
                </div>
              )}
              <div className="text-[10px] text-fg-muted leading-relaxed">
                行數是 <strong>內容長度 + 容器寬 + clamp</strong> 三者共同決定的 emergent 結果,**不是離散設定值**。
                左側 live preview 和右側藍圖**同步**反映相同的 clamp—改 toggle 兩邊一起變。
                <br />
                ※ <code>minLines</code> 概念目前在所有 consumer 都是 0,保留欄位是為了將來「避免 layout shift」的需求(例如 grid 列表需要每個 item 等高)
              </div>
            </div>

            {/* Annotations below the blueprint */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-mono text-fg-muted">
              {hasPx && <span><strong style={{ color: Z.pad.text }}>padding-x</strong> = {pxPx}</span>}
              {effectiveHasPrefix && <span><strong style={{ color: Z.icon.text }}>prefix-content gap</strong> = {gapPx}</span>}
              <span><strong style={{ color: Z.label.text }}>py</strong> = {preset.py.includes('calc') ? `calc((field-height-${size} − 一行文字高度) / 2)` : preset.py}</span>
              {hasDescription && <span>label-desc gap = --item-gap-label-desc-reading (2px)</span>}
            </div>
          </div>
        </div>

        {/* Right: Inspect panel */}
        <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground">Inspect</span>
              <span className="text-[10px] font-mono text-fg-muted">{preset.label}</span>
            </div>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <PropRow label="padding-y" dot={Z.pad.text}>
              <TkVal token={preset.py} value={preset.pyDesc} />
            </PropRow>
            <PropRow label="padding-x" dot={Z.pad.text}>
              <TkVal token={preset.px} value={preset.pxDesc} />
            </PropRow>
            <PropRow label="prefix-content" dot={Z.gap.text}>
              <TkVal token={preset.gap} value={preset.gapDesc} />
            </PropRow>
            {hasDescription && (
              <PropRow label="label-desc" dot={Z.gap.text}><TkVal token="--item-gap-label-desc-reading" value="2px" /></PropRow>
            )}
            {effectiveHasSuffix && (
              <PropRow label="suffix gap" dot={Z.suffix.text}>
                <TkVal token={preset.suffixGap} value={preset.suffixGapDesc} />
              </PropRow>
            )}
            {effectiveHasPrefix && (
              <PropRow label="icon size" dot={Z.icon.text}>{spec.iconPx}px</PropRow>
            )}
          </div>

          {/* TYPOGRAPHY */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Typography</span></div>
            <PropRow label="Label"><TkVal token={spec.labelFont} value={spec.labelSize} /></PropRow>
            <PropRow label="Label lh"><TkVal token={preset.mode === 'scanning' ? 'leading-compact' : 'default'} value={spec.labelLh} /></PropRow>
            <PropRow label="Label content">
              <TkVal token={labelLength} value={`${labelText.length} 字`} />
            </PropRow>
            <PropRow label="Label maxLines">
              <TkVal
                token={effectiveLabelClamp ? `line-clamp-${effectiveLabelClamp}` : 'unbounded'}
                value={labelClampOverride === 'preset' ? `${preset.label} default` : 'override'}
              />
            </PropRow>
            {hasDescription && (
              <>
                <PropRow label="Desc"><TkVal token={spec.descFont} value={spec.descSize} /></PropRow>
                <PropRow label="Desc content">
                  <TkVal token={descContent as string} value={`${descText.length} 字`} />
                </PropRow>
                <PropRow label="Desc maxLines">
                  <TkVal
                    token={effectiveDescClamp ? `line-clamp-${effectiveDescClamp}` : 'unbounded'}
                    value={descClampOverride === 'preset' ? `${preset.label} default` : 'override'}
                  />
                </PropRow>
                <PropRow label="Desc color">
                  <span className="inline-flex items-center gap-2"><Swatch value="--fg-secondary" /><span>fg-secondary</span></span>
                </PropRow>
              </>
            )}
          </div>

          {/* ALIGNMENT */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Alignment</span></div>
            <PropRow label="outer"><TkVal token="flex items-start" /></PropRow>
            <PropRow label="prefix align"><TkVal token={alignContainer} value={alignDesc} /></PropRow>
            <PropRow label="prefix threshold"><TkVal token="24px" value="prefix > 24px triggers block align" /></PropRow>
            {effectiveHasSuffix && (
              <PropRow label="suffix align">
                <TkVal token="h-[1lh]" value="永遠對齊第一行 label,跟 prefix 解耦" />
              </PropRow>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Inspector = {
  name: '檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3>Item Layout 檢閱器</H3>
        <Desc>
          Item Layout 是抽象對齊系統，不是固定元件。每個消費元件提供自己的間距（padding、gap），
          但共用相同的三區域結構和對齊規則。切換 Consumer 可看到不同元件的預設值。
        </Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 對齊容器（24px 閾值）
   ═══════════════════════════════════════════════════════════════════════════ */

export const AlignmentThreshold = {
  name: '對齊容器（24px 閾值）',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>對齊規則 — Prefix 與 Suffix 各自獨立</H3>
        <Desc>
          <strong>Prefix</strong> 對齊容器由 prefix 內容物大小決定:&le; 24px → 一行文字高度(inline);
          &gt; 24px(avatar + desc)→ label行高 + 2px + desc行高(block,對齊文字塊中心)。
          <br />
          <strong>Suffix</strong> 永遠用一行文字高度,**對齊第一行 label**,跟 prefix 解耦。
          理由:suffix 內容(Tag、Chevron、時間、計數)是 label 的 metadata,不是整個 item 的——
          業界 convention(Apple Mail / Gmail / iOS Settings / Material / Polaris)全部如此。
        </Desc>
      </div>

      {/* Side-by-side comparison */}
      <div className="flex gap-12 items-start">
        {/* Inline: <= 24px */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-foreground">&le; 24px — Inline 對齊</span>
            <span className="text-[11px] text-fg-muted">icon (16/20px), checkbox (16/20px)</span>
          </div>

          {/* Blueprint diagram — LARGE */}
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-stretch self-start rounded-lg overflow-hidden" style={{ height: 88, outline: `2px solid ${Z.dim.text}22` }}>
              <div className="flex items-center justify-center shrink-0"
                style={{ width: 72, height: '100%', background: Z.icon.bg, borderRight: `1.5px dashed ${Z.icon.border}` }}>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[14px] font-mono font-bold" style={{ color: Z.icon.text }}>prefix</span>
                  <span className="text-[11px] font-mono font-semibold" style={{ color: Z.icon.text }}>一行文字高度</span>
                </div>
              </div>
              <div className="flex items-center justify-center shrink-0"
                style={{ width: 48, height: '100%', background: Z.gap.bg }}>
                <span className="text-[13px] font-mono font-bold" style={{ color: Z.gap.text }}>gap</span>
              </div>
              <div className="flex flex-col items-center justify-center shrink-0"
                style={{ width: 120, height: '100%', background: Z.label.bg }}>
                <span className="text-[14px] font-mono font-bold" style={{ color: Z.label.text }}>Label</span>
                <span className="text-[10px] font-mono mt-1 opacity-60" style={{ color: Z.gap.text }}>--item-gap-label-desc-*</span>
                <span className="text-[12px] font-mono opacity-80" style={{ color: Z.label.text }}>description</span>
              </div>
              <div className="flex items-center justify-center shrink-0"
                style={{ width: 72, height: '100%', background: Z.suffix.bg, borderLeft: `1.5px dashed ${Z.suffix.border}` }}>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[14px] font-mono font-bold" style={{ color: Z.suffix.text }}>suffix</span>
                  <span className="text-[11px] font-mono font-semibold" style={{ color: Z.suffix.text }}>一行文字高度</span>
                </div>
              </div>
            </div>
            <span className="text-[11px] text-fg-muted">prefix center = label 第一行垂直中心，suffix 使用相同的 一行文字高度</span>
          </div>

          {/* Live example */}
          <MenuFrame width={360}>
            <MenuItem size="md" startIcon={Mail} description="每日寄送摘要信件" tag={<Tag size="md" variant="blue">Pro</Tag>}>
              電子郵件通知
            </MenuItem>
            <MenuItem size="md" startIcon={Bell} description="瀏覽器推送即時通知" tag={<Tag size="md" variant="green">Free</Tag>}>
              推送通知
            </MenuItem>
          </MenuFrame>
        </div>

        {/* Block: > 24px */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-foreground">&gt; 24px — Block 對齊</span>
            <span className="text-[11px] text-fg-muted">avatar (32/40px) with description</span>
          </div>

          {/* Blueprint diagram — LARGE */}
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-stretch self-start rounded-lg overflow-hidden" style={{ height: 88, outline: `2px solid ${Z.dim.text}22` }}>
              <div className="flex items-center justify-center shrink-0"
                style={{ width: 72, height: '100%', background: Z.icon.bg, borderRight: `1.5px dashed ${Z.icon.border}` }}>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[14px] font-mono font-bold" style={{ color: Z.icon.text }}>prefix</span>
                  <span className="text-[9px] font-mono" style={{ color: Z.icon.text }}>label行高</span>
                  <span className="text-[9px] font-mono" style={{ color: Z.icon.text }}>+2px+desc行高</span>
                </div>
              </div>
              <div className="flex items-center justify-center shrink-0"
                style={{ width: 48, height: '100%', background: Z.gap.bg }}>
                <span className="text-[13px] font-mono font-bold" style={{ color: Z.gap.text }}>gap</span>
              </div>
              <div className="flex flex-col items-center justify-center shrink-0"
                style={{ width: 120, height: '100%', background: Z.label.bg }}>
                <span className="text-[14px] font-mono font-bold" style={{ color: Z.label.text }}>Label</span>
                <span className="text-[10px] font-mono mt-1 opacity-60" style={{ color: Z.gap.text }}>--item-gap-label-desc-*</span>
                <span className="text-[12px] font-mono opacity-80" style={{ color: Z.label.text }}>description</span>
              </div>
              <div className="flex items-start justify-center shrink-0 pt-3"
                style={{ width: 72, height: '100%', background: Z.suffix.bg, borderLeft: `1.5px dashed ${Z.suffix.border}` }}>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[14px] font-mono font-bold" style={{ color: Z.suffix.text }}>suffix</span>
                  <span className="text-[10px] font-mono font-semibold" style={{ color: Z.suffix.text }}>一行文字高度</span>
                  <span className="text-[9px] font-mono opacity-80" style={{ color: Z.suffix.text }}>對齊第一行 label</span>
                </div>
              </div>
            </div>
            <span className="text-[11px] text-fg-muted">
              prefix center = label + description 文字塊中心(block);
              <strong>suffix 永遠對齊第一行 label,跟 prefix 解耦</strong>
            </span>
          </div>

          {/* Live example */}
          <MenuFrame width={360}>
            <MenuItem size="md" avatar={{ alt: "Alice", color: "indigo" as const, hoverCard: personHover("Alice Chen", "Design team lead") }} description="Design team lead">
              Alice Chen
            </MenuItem>
            <MenuItem size="md" avatar={{ alt: "Bob", color: "yellow" as const, hoverCard: personHover("Bob Wang", "Backend engineer") }} description="Backend engineer">
              Bob Wang
            </MenuItem>
          </MenuFrame>
        </div>
      </div>

      {/* Rules table */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">對齊規則總覽</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>對象</Th><Th>條件</Th><Th>對齊容器</Th><Th>對齊目標</Th></tr></thead>
            <tbody>
              <tr>
                <Td><strong>Prefix</strong></Td>
                <Td>≤ 24px(icon / checkbox / 小 avatar)</Td>
                <Td mono>一行文字高度</Td>
                <Td>第一行 label 垂直中心</Td>
              </tr>
              <tr>
                <Td><strong>Prefix</strong></Td>
                <Td>&gt; 24px(avatar)+ 有 description</Td>
                <Td mono>label行高 + 2px + desc行高</Td>
                <Td>label + gap + desc 文字塊中心</Td>
              </tr>
              <tr>
                <Td><strong>Prefix</strong></Td>
                <Td>無 description</Td>
                <Td mono>一行文字高度</Td>
                <Td>強制 inline(prefix 上限 24px)</Td>
              </tr>
              <tr>
                <Td><strong>Suffix</strong></Td>
                <Td>**所有情況**</Td>
                <Td mono>一行文字高度</Td>
                <Td>第一行 label 垂直中心(跟 prefix 解耦)</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-fg-muted max-w-[720px]">
          ※ Suffix 不跟 prefix 同步是有意的設計:suffix 是 label 的 metadata
          (Tag / Chevron / 時間 / 計數),不是整個 item 的。對齊 label 第一行讓使用者
          眼睛從 label 自然往右掃到 suffix,不被打斷。Apple Mail / Gmail / iOS Settings /
          Material / Polaris 全部如此。
        </p>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 閱讀模式比較
   ═══════════════════════════════════════════════════════════════════════════ */

export const ReadingModes = {
  name: '閱讀模式比較',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>掃描模式 vs 閱讀模式</H3>
        <Desc>
          同一套佈局結構，typography 策略依閱讀場景調整。掃描模式用於浮層（一掃而過），
          閱讀模式用於頁面/表單（仔細閱讀）。差異在行高和 description 字體。
        </Desc>
      </div>

      {/* Side-by-side at all sizes */}
      <div className="flex gap-12 items-start">
        {/* Scanning */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-foreground">掃描模式（Scanning）</span>
            <span className="text-[11px] text-fg-muted">浮層 / overlay — MenuItem, ComboboxItem</span>
          </div>
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-start gap-3">
              <span className="text-[12px] text-fg-muted w-6 shrink-0 pt-2 font-mono font-semibold">{sz}</span>
              <MenuFrame width={300}>
                <MenuItem size={sz} startIcon={Mail} description="每日寄送摘要信件">
                  電子郵件通知
                </MenuItem>
              </MenuFrame>
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-1 text-[11px] text-fg-muted">
            <p><strong>Label:</strong> leading-compact (1.3)</p>
            <p><strong>Desc:</strong> 降一級字體 + fg-secondary</p>
            <p><strong>Gap:</strong> --item-gap-label-desc-scanning (2px,sm/md)/ -scanning-lg (lg)</p>
          </div>
        </div>

        {/* Reading */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-foreground">閱讀模式（Reading）</span>
            <span className="text-[11px] text-fg-muted">頁面 / 表單 — SelectionItem (Checkbox/RadioGroup)</span>
          </div>
          {SIZES.map((sz) => (
            <div key={sz} className="flex items-start gap-3">
              <span className="text-[12px] text-fg-muted w-6 shrink-0 pt-2 font-mono font-semibold">{sz}</span>
              <div className="w-[300px]">
                <SelectionItem
                  size={sz}
                  control={<Checkbox size={sz} checked={true} />}
                  label="電子郵件通知"
                  description="每日寄送摘要信件到您的電子信箱"
                />
              </div>
            </div>
          ))}
          <div className="mt-1 flex flex-col gap-1 text-[11px] text-fg-muted">
            <p><strong>Label:</strong> default line-height (1.5)</p>
            <p><strong>Desc:</strong> 同字體 + fg-secondary（僅顏色區分）</p>
            <p><strong>Gap:</strong> --item-gap-label-desc-reading (2px,sm/md)/ -reading-lg (lg)</p>
          </div>
        </div>
      </div>

      {/* Token comparison table */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">Typography Token 對照表</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>掃描 — Label</Th>
                <Th>掃描 — Desc</Th>
                <Th>閱讀 — Label</Th>
                <Th>閱讀 — Desc</Th>
                <Th>Label-Desc Gap</Th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((sz) => {
                const sc = SCANNING_SPECS[sz]
                const rd = READING_SPECS[sz]
                return (
                  <tr key={sz}>
                    <Td mono>{sz}</Td>
                    <Td><TkVal token={sc.labelFont} value={`${sc.labelSize}, lh ${sc.labelLh}`} /></Td>
                    <Td><TkVal token={sc.descFont} value={`${sc.descSize}, lh ${sc.descLh}`} /></Td>
                    <Td><TkVal token={rd.labelFont} value={`${rd.labelSize}, lh ${rd.labelLh}`} /></Td>
                    <Td><TkVal token={rd.descFont} value={`${rd.descSize}, lh ${rd.descLh}`} /></Td>
                    <Td mono>--item-gap-label-desc-* (2px)</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Icon 色彩 + 消費元件預設
   ═══════════════════════════════════════════════════════════════════════════ */

export const IconColorsAndPresets = {
  name: 'Icon 色彩 + 消費元件預設',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>Icon 色彩原則</H3>
        <Desc>
          一條統一規則：icon 代表 label 內容或類別時，與 label 同色（foreground）。
          icon 純粹指示方向/展開/導覽時，fg-muted。Suffix value 文字與 label 同字體大小，只降色不降級。
        </Desc>
      </div>

      {/* Color rule table */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">色彩判斷規則</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>判斷</Th><Th>顏色</Th><Th>範例</Th></tr></thead>
            <tbody>
              <tr>
                <Td>代表內容/類別</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--foreground" />
                    <span className="font-mono">foreground（繼承）</span>
                  </span>
                </Td>
                <Td>Mail, Settings, Star</Td>
              </tr>
              <tr>
                <Td>代表危險操作</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--error" />
                    <span className="font-mono">text-error（與 label 同色）</span>
                  </span>
                </Td>
                <Td>Trash2 + 紅色 label</Td>
              </tr>
              <tr>
                <Td>指示方向/展開</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--fg-muted" />
                    <span className="font-mono">text-fg-muted</span>
                  </span>
                </Td>
                <Td>ChevronRight, ChevronDown, ExternalLink</Td>
              </tr>
              <tr>
                <Td>suffix value 文字</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--fg-muted" />
                    <span className="font-mono">fg-muted, 同 label 字體大小</span>
                  </span>
                </Td>
                <Td>&quot;深色&quot;、&quot;已啟用&quot;</Td>
              </tr>
              <tr>
                <Td>disabled</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <Swatch value="--fg-disabled" />
                    <span className="font-mono">text-fg-disabled</span>
                  </span>
                </Td>
                <Td>全部統一</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual reference — live examples */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">視覺參考</span>
        <div className="flex gap-8 items-start">
          {/* Prefix icons: inherit foreground */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">Prefix icon = foreground（代表內容）</span>
            <MenuFrame width={260}>
              <MenuItem size="md" startIcon={Mail}>電子郵件</MenuItem>
              <MenuItem size="md" startIcon={Settings}>設定</MenuItem>
              <MenuItem size="md" startIcon={Star}>收藏</MenuItem>
            </MenuFrame>
          </div>

          {/* Suffix indicator: fg-muted */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">Suffix indicator = fg-muted（指示方向）</span>
            <MenuFrame width={280}>
              <MenuItem
                size="md"
                startIcon={Globe}
                endContent={
                  <div className="h-[1lh] flex items-center gap-1 ml-auto">
                    <span className="text-body text-fg-muted">English</span>
                    <ChevronRight size={16} className="text-fg-muted" />
                  </div>
                }
              >
                語言
              </MenuItem>
              <MenuItem
                size="md"
                startIcon={Lock}
                endContent={
                  <div className="h-[1lh] flex items-center ml-auto">
                    <ChevronRight size={16} className="text-fg-muted" />
                  </div>
                }
              >
                隱私設定
              </MenuItem>
            </MenuFrame>
          </div>

          {/* Danger: same color as label */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">危險操作 = 與 label 同色（text-error）</span>
            <MenuFrame width={260}>
              <MenuItem size="md" startIcon={Trash2} className="text-error">
                刪除專案
              </MenuItem>
            </MenuFrame>
          </div>
        </div>
      </div>

      {/* Consumer preset comparison */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-foreground">消費元件預設比較</span>
          <span className="text-[11px] text-fg-muted">每個元件自訂間距，但結構和對齊規則不變</span>
        </div>

        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>屬性</Th>
                <Th>MenuItem</Th>
                <Th>SelectionItem</Th>
                <Th>ListItem</Th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: '場景', k: 'desc' as const },
                { label: '閱讀模式', k: 'mode' as const },
                { label: 'padding-y', k: 'py' as const },
                { label: 'padding-x', k: 'px' as const },
                { label: 'prefix-content gap', k: 'gap' as const },
                { label: 'suffix gap', k: 'suffixGap' as const },
              ].map(({ label, k }) => (
                <tr key={label}>
                  <Td>{label}</Td>
                  <Td mono>{CONSUMERS.MenuItem[k]}</Td>
                  <Td mono>{CONSUMERS.SelectionItem[k]}</Td>
                  <Td mono>{CONSUMERS.ListItem[k]}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live consumer examples */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">消費元件即時範例（md size）</span>
        <div className="flex gap-8 items-start">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">MenuItem</span>
            <MenuFrame width={280}>
              <MenuItem size="md" startIcon={Mail} description="每日寄送摘要信件">
                電子郵件通知
              </MenuItem>
              <MenuItem size="md" startIcon={Bell}>
                推送通知
              </MenuItem>
            </MenuFrame>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">SelectionItem</span>
            <div className="w-[280px]">
              <SelectionItem
                size="md"
                control={<Checkbox size="md" checked={true} />}
                label="電子郵件通知"
                description="每日寄送摘要信件"
              />
              <SelectionItem
                size="md"
                control={<Checkbox size="md" />}
                label="推送通知"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-fg-muted font-medium">ListItem（模擬）</span>
            <div className="w-[280px] rounded-lg border border-divider overflow-hidden bg-surface">
              <ListItemPreview
                size="md"
                startIcon={Mail}
                label="電子郵件通知"
                description="每日寄送摘要信件"
                suffix={<ChevronRight size={16} className="text-fg-muted" />}
              />
              <div className="border-t border-divider" />
              <ListItemPreview
                size="md"
                startIcon={Bell}
                label="推送通知"
                suffix={<ChevronRight size={16} className="text-fg-muted" />}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Icon Action Primitive 決策樹（canonical 2026-04-22）
   ═══════════════════════════════════════════════════════════════════════════ */

export const IconActionPrimitiveDecision = {
  name: 'Icon Action Primitive 決策',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>Icon 相關動作用哪個 primitive?(3 步決策)</H3>
        <Desc>
          DS 跨元件 icon action 的 canonical。接到「要放一個 icon 可點擊」的需求,跑下方 3 步決策樹——
          不要直覺寫 <code className="font-mono">&lt;button&gt;&lt;X /&gt;&lt;/button&gt;</code>。Primitive 選錯會造成 same-row 幾何不一致、gap token 被吃掉、
          或 chrome corner close 無法跟 refresh / share 並排分群。
        </Desc>
      </div>

      {/* Decision tree visual */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-foreground">決策樹</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>步驟</Th>
                <Th>問題</Th>
                <Th>結果</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>Q1</Td>
                <Td>Icon 點了要做事嗎?</Td>
                <Td>
                  <strong>否</strong> → Decorative indicator(<code className="font-mono">&lt;Icon aria-hidden pointer-events-none /&gt;</code>)
                  <br /><strong>是</strong> → 繼續 Q2
                </Td>
              </tr>
              <tr>
                <Td mono>Q2</Td>
                <Td>位置在哪?</Td>
                <Td>
                  Host 內部(chrome padding / content flow / row inline suffix)→ <strong>Inline Action</strong>
                  <br />Row 獨立 action slot → 看 Q3
                  <br />Action group region(toolbar / chrome corner / standalone)→ <strong>Button</strong>
                </Td>
              </tr>
              <tr>
                <Td mono>Q3</Td>
                <Td>Row 多大?</Td>
                <Td>
                  &le; 24(compact / xs row)→ <strong>Inline Action</strong>(Button xs 24 會填滿 row,失去呼吸)
                  <br />&ge; 28(sm / md / lg row)→ <strong>Button iconOnly size="xs"(24 固定,不放大)</strong>
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-fg-muted max-w-[780px] leading-relaxed">
          <strong>核心原則:Row dedicated action 永遠 &le; 24px cap</strong>,不隨 row tier 放大——超過 24 的 action
          會搶 content 視覺焦點,違反「資料 &gt; 行動」的視覺階層(世界級對照:Linear / Notion / Figma 全部 &le; 24)。
        </p>
      </div>

      {/* Real case table */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-foreground">實戰情境對照</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>情境</Th>
                <Th>位置</Th>
                <Th>Primitive</Th>
                <Th>理由</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>Input / Combobox clear X</Td><Td>Field chrome padding</Td><Td mono>Inline Action</Td><Td>Embedded in host</Td></tr>
              <tr><Td>Tag dismiss X</Td><Td>Pill body</Td><Td mono>Inline Action</Td><Td>Colored host,繼承顏色</Td></tr>
              <tr><Td>Menu / TreeView suffix action</Td><Td>Row inline flow</Td><Td mono>Inline Action</Td><Td>Inline with content</Td></tr>
              <tr><Td>SidebarGroup header chevron</Td><Td>Aux toggle</Td><Td mono>Inline Action</Td><Td>Inline header toggle</Td></tr>
              <tr><Td><strong>FileItem compact</strong>(row 24)</Td><Td>Row slot</Td><Td mono>Inline Action</Td><Td>Row 太小容不下 Button xs 24</Td></tr>
              <tr><Td><strong>FileItem rich</strong>(row 56)</Td><Td>Row slot</Td><Td mono>Button xs iconOnly</Td><Td>&le; 24 cap,不放大</Td></tr>
              <tr><Td><strong>DataTable row action</strong></Td><Td>Row dedicated column</Td><Td mono>Button xs iconOnly</Td><Td>&le; 24 cap(跨 tier 固定)</Td></tr>
              <tr><Td><strong>Dialog / Sheet chrome corner close</strong></Td><Td>Action group region</Td><Td mono>Button sm iconOnly dismiss</Td><Td>corner 屬 action group,可與 refresh / share 並排</Td></tr>
              <tr><Td><strong>Alert / Toast / Coachmark close</strong></Td><Td>Action group region</Td><Td mono>Button sm iconOnly dismiss</Td><Td>同上</Td></tr>
              <tr><Td><strong>Popover close</strong></Td><Td>Action group region</Td><Td mono>Button sm iconOnly dismiss</Td><Td>同上</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Dismiss X canonical */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-foreground">Dismiss 嚴格定義 — X close only</span>
        <Desc>
          <code className="font-mono">dismiss</code> prop 僅屬 <strong>X(close)</strong>icon——
          「關閉 surface / 忽略訊息」的語意。Trash / Delete / Clear / Remove 都<strong>不算 dismiss</strong>,
          即使視覺上也是 icon-only button,callback 用 <code className="font-mono">onDelete</code> / <code className="font-mono">onRemove</code> / <code className="font-mono">onClear</code>。
          世界級對照:Material IconButton close / Polaris Banner.onDismiss / Apple HIG window close — 全部 icon = X。
        </Desc>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead>
              <tr>
                <Th>語意</Th>
                <Th>Icon</Th>
                <Th>Callback</Th>
                <Th>Primitive</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>Dismiss(關閉 surface)</Td><Td mono>X</Td><Td mono>onClose / onDismiss</Td><Td>Button `dismiss` prop(chrome corner)或 Inline Action(chrome padding)</Td></tr>
              <tr><Td>Delete(刪除資料)</Td><Td mono>Trash2</Td><Td mono>onDelete</Td><Td>依 Q2/Q3 決策,<strong>不套 dismiss prop</strong></Td></tr>
              <tr><Td>Clear(清空欄位)</Td><Td mono>X</Td><Td mono>onClear</Td><Td>Inline Action(Field chrome padding)</Td></tr>
              <tr><Td>Remove(從集合移除)</Td><Td mono>X / Trash2</Td><Td mono>onRemove</Td><Td>依 Q2/Q3 決策</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Live case: Alert chrome corner action group */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-foreground">Live case — Alert chrome corner action group 佈局</span>
        <Desc>
          Chrome corner close 屬 <strong>action group region</strong>——實務上 close 左側可加 refresh / share 等
          輔助動作(用 Separator 分群),所以必須用 Button iconOnly(與群內其他 action 同 primitive),不可用 Inline Action。
        </Desc>
        <div className="flex items-start gap-3 p-4 rounded-md border border-border bg-surface-raised max-w-lg">
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-body font-semibold text-foreground">新版本可用</span>
            <span className="text-caption text-fg-muted">點擊重新整理載入最新版。</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="text" size="sm" iconOnly startIcon={RefreshCw} aria-label="重新整理" />
            <Button variant="text" size="sm" iconOnly startIcon={Share2} aria-label="分享" />
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button variant="text" size="sm" dismiss startIcon={X} aria-label="關閉" />
          </div>
        </div>
        <p className="text-[11px] text-fg-muted max-w-[780px] leading-relaxed">
          ✅ refresh / share / close 都是 Button sm iconOnly,Separator 分群(action 群 vs dismiss 群)。close 套
          <code className="font-mono"> dismiss</code> prop 自動弱化(icon fg-muted → hover foreground)。
          <br />❌ 禁止把 close 改寫成 Inline Action(會造成 same-row primitive 混用,gap 視覺斷裂)。
        </p>
      </div>

      {/* Same-row consistency */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-foreground">Same-row consistency — 同 row 所有 icon action 必同一類</span>
        <Desc>
          同一 action row(suffix slot / chrome corner)<strong>所有 icon action 必用相同 primitive</strong>——
          不混 Inline Action + Button iconOnly。混用會造成 box 尺寸不一致,gap token 視覺被吃掉(參考
          <code className="font-mono"> .claude/rules/ui-development.md </code>「同 flex 列的互動 slot 幾何鐵律」)。
        </Desc>
        <div className="flex flex-col gap-3 max-w-xl">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-surface">
            <span className="flex-1 text-caption text-fg-secondary">✅ 都用 Button xs iconOnly(24 固定,gap-1 穩定)</span>
            <div className="flex items-center gap-1">
              <Button variant="text" size="xs" iconOnly startIcon={RotateCw} aria-label="重試" />
              <Button variant="text" size="xs" iconOnly startIcon={Download} aria-label="下載" />
              <Button variant="text" size="xs" iconOnly startIcon={MoreVertical} aria-label="更多" />
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-surface">
            <span className="flex-1 text-caption text-fg-secondary">✅ compact row:都用 Inline Action(icon 16,hover-bg 22)</span>
            <div className="flex items-center gap-1">
              <ItemInlineActionButton icon={RotateCw} size="sm" aria-label="重試" />
              <ItemInlineActionButton icon={Download} size="sm" aria-label="下載" />
              <ItemInlineActionButton icon={MoreVertical} size="sm" aria-label="更多" />
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-error bg-surface">
            <span className="flex-1 text-caption text-error-text">❌ 禁止混 Inline Action + Button(box 尺寸不一致)</span>
            <div className="flex items-center gap-1">
              <ItemInlineActionButton icon={RotateCw} size="sm" aria-label="重試" />
              <Button variant="text" size="xs" iconOnly startIcon={Download} aria-label="下載" />
            </div>
          </div>
        </div>
      </div>

      {/* Overflow menu icon canonical */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-foreground">Overflow menu icon — <code className="font-mono">MoreVertical</code>,禁用 <code className="font-mono">MoreHorizontal</code></span>
        <Desc>
          Overflow menu(「更多動作」下拉)一律用 <strong>MoreVertical</strong>(縱向三點)。
          <code className="font-mono"> MoreHorizontal</code>(橫向三點)只保留給 Breadcrumb path ellipsis 語意
          (「沿路徑省略中間項」),不得用於 overflow menu。世界級對照:Linear / Notion / GitHub / Figma 全部如此。
        </Desc>
      </div>
    </div>
  ),
}
