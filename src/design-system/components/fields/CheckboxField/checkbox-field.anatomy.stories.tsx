import type { Meta } from '@storybook/react'
import { useState } from 'react'
import { CheckboxField } from './checkbox-field'

const meta: Meta = {
  title: 'Design System/Components/Fields/CheckboxField/設計規格',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Types & Data
   ═══════════════════════════════════════════════════════════════════════════ */

type ModeKey = 'edit' | 'readonly' | 'disabled'
type SizeKey = 'sm' | 'md' | 'lg'

const MODES: ModeKey[] = ['edit', 'readonly', 'disabled']
const SIZES: SizeKey[] = ['sm', 'md', 'lg']

/* ── Color tokens by mode × value ── */

interface ColorSpec { bg: string; border: string; icon: string; text: string }

const COLOR_MAP: Record<ModeKey, Record<'checked' | 'unchecked', ColorSpec>> = {
  edit: {
    checked: {
      bg: '--primary',
      border: '--primary',
      icon: 'white',
      text: '—',
    },
    unchecked: {
      bg: '--surface',
      border: '--border',
      icon: '—',
      text: '—',
    },
  },
  readonly: {
    checked: {
      bg: '--bg-disabled',
      border: 'transparent',
      icon: '—',
      text: '--foreground',
    },
    unchecked: {
      bg: '--bg-disabled',
      border: 'transparent',
      icon: '—',
      text: '--fg-muted',
    },
  },
  disabled: {
    checked: {
      bg: '--bg-disabled',
      border: 'transparent',
      icon: '--fg-disabled',
      text: '—',
    },
    unchecked: {
      bg: '--bg-disabled',
      border: 'transparent',
      icon: '—',
      text: '—',
    },
  },
}

/* ── Size specs ── */

interface SizeSpec {
  checkbox: string
  checkIcon: number
  wrapperHeight: string
  wrapperHeightToken: string
  font: string
  fontToken: string
}

const SIZE_SPECS: Record<SizeKey, SizeSpec> = {
  sm: { checkbox: '16px (h-4 w-4)', checkIcon: 12, wrapperHeight: '28px', wrapperHeightToken: 'h-field-sm', font: '14px', fontToken: 'text-body' },
  md: { checkbox: '16px (h-4 w-4)', checkIcon: 12, wrapperHeight: '32px', wrapperHeightToken: 'h-field-md', font: '14px', fontToken: 'text-body' },
  lg: { checkbox: '20px (h-5 w-5)', checkIcon: 16, wrapperHeight: '36px', wrapperHeightToken: 'h-field-lg', font: '16px', fontToken: 'text-body-lg' },
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
    return <span className={`${s} rounded-sm shrink-0 border border-border`}
      style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,3px 3px' }} />
  }
  if (value === 'white') {
    return <span className={`${s} rounded-sm shrink-0 border border-black/10`} style={{ backgroundColor: '#fff' }} />
  }
  if (value === '—') {
    return <span className="text-[10px] text-fg-muted">—</span>
  }
  return <span className={`${s} rounded-sm shrink-0 border border-black/10`} style={{ backgroundColor: `var(${value})` }} />
}

const TokenAnnotation = ({ colors }: { colors: ColorSpec }) => (
  <div className="flex flex-col gap-0.5 mt-2">
    {([['bg', 'bg'], ['border', 'bdr'], ['icon', 'icon'], ['text', 'text']] as const).map(([key, label]) => (
      <span key={key} className="inline-flex items-center gap-1 text-[10px]">
        <Swatch value={colors[key]} size="sm" />
        <span className="text-fg-muted w-6 shrink-0">{label}</span>
        <span className="font-mono text-fg-secondary">{colors[key]}</span>
      </span>
    ))}
  </div>
)

const Tab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`px-2.5 py-1 text-[12px] font-mono rounded-md cursor-pointer transition-colors ${
      active ? 'bg-primary text-white font-semibold' : 'bg-neutral-hover text-fg-secondary hover:bg-neutral-active'
    }`}>
    {children}
  </button>
)

const PropRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[80px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview = {
  name: '1. 元件總覽',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <H3>結構（Anatomy）</H3>
          <Desc>CheckboxField 根據 mode 渲染完全不同的元素：edit / disabled 用 Checkbox 元件，readonly 用純文字符號。沒有 error、clearable、placeholder — 布林值只有兩種答案。</Desc>
        </div>

        <div className="flex gap-12">
          {/* edit mode */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">edit（Checkbox）</span>
            <div className="flex gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <CheckboxField mode="edit" value={true} />
                <span className="text-[10px] text-fg-muted font-mono">checked</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <CheckboxField mode="edit" value={false} />
                <span className="text-[10px] text-fg-muted font-mono">unchecked</span>
              </div>
            </div>
          </div>

          {/* readonly mode */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">readonly（純文字）</span>
            <div className="flex gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <CheckboxField mode="readonly" value={true} />
                <span className="text-[10px] text-fg-muted font-mono">true → ✓</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <CheckboxField mode="readonly" value={false} />
                <span className="text-[10px] text-fg-muted font-mono">false/null → —</span>
              </div>
            </div>
            <span className="text-[10px] text-fg-muted">用 fieldWrapperStyles(readonly) 包裹，有 bg-disabled 底色</span>
          </div>

          {/* disabled mode */}
          <div className="flex flex-col gap-2 items-start">
            <span className="text-[11px] text-fg-muted font-medium">disabled（Checkbox disabled）</span>
            <div className="flex gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <CheckboxField mode="disabled" value={true} />
                <span className="text-[10px] text-fg-muted font-mono">checked</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <CheckboxField mode="disabled" value={false} />
                <span className="text-[10px] text-fg-muted font-mono">unchecked</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Props table */}
      <div className="flex flex-col gap-3">
        <H3>Props</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['mode', "'edit' | 'readonly' | 'disabled'", "'edit'", 'Field 顯示模式'],
                ['value', 'boolean | null', 'undefined', '布林值（false 和 null 視覺不區分）'],
                ['onChange', '(value: boolean) => void', '—', '值變更 callback（僅 edit 模式觸發）'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", 'readonly wrapper 高度（edit 模式由 Checkbox 自身決定）'],
                ['disabled', 'boolean', 'false', '原生屬性覆蓋，等同 mode="disabled"'],
                ['readOnly', 'boolean', 'false', '原生屬性覆蓋，等同 mode="readonly"'],
                ['className', 'string', '—', '附加 class'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mode rendering rules */}
      <div className="flex flex-col gap-3">
        <H3>模式渲染差異</H3>
        <Desc>Readonly 用文字而非 disabled checkbox：readonly 表達「這個欄位不是用來互動的」，disabled checkbox 暗示「你可以勾但現在不行」。語義不同。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Mode</Th><Th>渲染元素</Th><Th>包裹</Th><Th>互動</Th></tr></thead>
            <tbody>
              {[
                ['edit', 'Checkbox 元件', '無 wrapper（直接渲染 Checkbox）', '可勾選 / 取消'],
                ['readonly', '文字 ✓ 或 —', 'fieldWrapperStyles({ mode: "readonly", size })', '無'],
                ['disabled', 'Checkbox disabled', '無 wrapper（Checkbox 自帶 disabled 樣式）', '無（cursor-not-allowed）'],
              ].map(([mode, el, wrap, interaction]) => (
                <tr key={mode}><Td mono>{mode}</Td><Td>{el}</Td><Td mono>{wrap}</Td><Td>{interaction}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器
   ═══════════════════════════════════════════════════════════════════════════ */

const InspectorInner = () => {
  const [mode, setMode] = useState<ModeKey>('edit')
  const [value, setValue] = useState(true)
  const [size, setSize] = useState<SizeKey>('md')

  const valueKey = value ? 'checked' : 'unchecked'
  const colors = COLOR_MAP[mode][valueKey]
  const sizeSpec = SIZE_SPECS[size]

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Mode</span>
          <div className="flex gap-1.5">
            {MODES.map((m) => <Tab key={m} active={mode === m} onClick={() => setMode(m)}>{m}</Tab>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Value</span>
          <div className="flex gap-1.5">
            <Tab active={value === true} onClick={() => setValue(true)}>true</Tab>
            <Tab active={value === false} onClick={() => setValue(false)}>false</Tab>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-muted w-16 shrink-0">Size</span>
          <div className="flex gap-1.5">
            {SIZES.map((sz) => <Tab key={sz} active={size === sz} onClick={() => setSize(sz)}>{sz}</Tab>)}
          </div>
          {mode !== 'readonly' && <span className="text-[11px] text-fg-muted">size 僅影響 readonly wrapper 高度</span>}
        </div>
      </div>

      {/* Preview + Panel */}
      <div className="flex gap-6 items-start">
        {/* Left: preview */}
        <div className="flex flex-col gap-5 min-w-[280px]">
          <div className="px-10 py-8 rounded-lg bg-canvas border border-divider flex items-center justify-center">
            <CheckboxField
              mode={mode}
              value={value}
              size={size}
              onChange={mode === 'edit' ? setValue : undefined}
            />
          </div>

          {/* Rendering info */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-fg-muted font-medium">渲染元素</span>
            <span className="font-mono text-[12px] text-fg-secondary">
              {mode === 'edit' && 'Checkbox (Radix CheckboxPrimitive.Root)'}
              {mode === 'readonly' && `div.fieldWrapperStyles({ mode: "readonly", size: "${size}" }) > span`}
              {mode === 'disabled' && 'Checkbox [disabled]'}
            </span>
            {mode === 'readonly' && (
              <span className="font-mono text-[10px] text-fg-muted">
                value={String(value)} → 顯示「{value ? '✓' : '—'}」
              </span>
            )}
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[300px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* COLOR */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
            {mode === 'edit' || mode === 'disabled' ? (
              <>
                <PropRow label="Checkbox bg">
                  <span className="inline-flex items-center gap-2"><Swatch value={colors.bg} /><span>{colors.bg}</span></span>
                </PropRow>
                <PropRow label="Border">
                  <span className="inline-flex items-center gap-2"><Swatch value={colors.border} /><span>{colors.border}</span></span>
                </PropRow>
                <PropRow label="Check icon">
                  <span className="inline-flex items-center gap-2"><Swatch value={colors.icon} /><span>{colors.icon}</span></span>
                </PropRow>
              </>
            ) : (
              <>
                <PropRow label="Wrapper bg">
                  <span className="inline-flex items-center gap-2"><Swatch value={colors.bg} /><span>{colors.bg}</span></span>
                </PropRow>
                <PropRow label="Text">
                  <span className="inline-flex items-center gap-2"><Swatch value={colors.text} /><span>{colors.text}</span></span>
                </PropRow>
              </>
            )}
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            {mode === 'readonly' ? (
              <>
                <PropRow label="Wrapper 高度"><TkVal token={sizeSpec.wrapperHeightToken} value={sizeSpec.wrapperHeight} /></PropRow>
                <PropRow label="左右內距"><TkVal token="px-3" value="12px" /></PropRow>
                <PropRow label="字體"><TkVal token={sizeSpec.fontToken} value={sizeSpec.font} /></PropRow>
              </>
            ) : (
              <>
                <PropRow label="Checkbox 尺寸">{sizeSpec.checkbox}</PropRow>
                <PropRow label="Check icon">{sizeSpec.checkIcon}px</PropRow>
              </>
            )}
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <PropRow label="Radius"><TkVal token="rounded-md" value="4px" /></PropRow>
            {(mode === 'edit' || mode === 'disabled') && (
              <PropRow label="Focus"><TkVal token="ring-2 ring-ring ring-offset-1" /></PropRow>
            )}
            {mode === 'edit' && (
              <PropRow label="Hover bdr"><TkVal token="--border-hover" /></PropRow>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Inspector = {
  name: '2. 元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3>元件檢閱器</H3>
        <Desc>選擇 mode、value、size 組合，即時查看渲染元素與所有 token。Edit / disabled 渲染 Checkbox 元件，readonly 渲染 fieldWrapperStyles wrapper + 文字符號。</Desc>
      </div>
      <InspectorInner />
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix = {
  name: '3. 色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Mode x Value 色彩對照</H3>
        <Desc>橫向看同 mode 的 checked / unchecked 變化。edit 用 Checkbox 的色彩系統（primary 填色），readonly 用純文字色彩（foreground / fg-muted），disabled 統一 neutral 灰化。色塊即時渲染，切 dark mode 自動更新。</Desc>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <Th>Mode</Th>
              <Th>checked (true)</Th>
              <Th>unchecked (false / null)</Th>
            </tr>
          </thead>
          <tbody>
            {MODES.map((mode) => (
              <tr key={mode}>
                <td className="p-3 border-b border-divider font-mono text-caption font-medium align-top">{mode}</td>
                {(['checked', 'unchecked'] as const).map((val) => (
                  <td key={val} className="p-3 border-b border-divider align-top min-w-[180px]">
                    <CheckboxField
                      mode={mode}
                      value={val === 'checked'}
                    />
                    <TokenAnnotation colors={COLOR_MAP[mode][val]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit hover states */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">edit hover 狀態 token</span>
        <div className="overflow-x-auto">
          <table className="border-collapse text-caption">
            <thead><tr><Th>State</Th><Th>Checkbox bg</Th><Th>Border</Th></tr></thead>
            <tbody>
              {[
                ['unchecked default', '--surface', '--border'],
                ['unchecked hover', '--surface', '--border-hover'],
                ['checked default', '--primary', '--primary'],
                ['checked hover', '--primary-hover', '--primary-hover'],
              ].map(([state, bg, border]) => (
                <tr key={state}>
                  <Td mono>{state}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <Swatch value={bg} size="sm" />
                      <span className="font-mono text-fg-secondary">{bg}</span>
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <Swatch value={border} size="sm" />
                      <span className="font-mono text-fg-secondary">{border}</span>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix = {
  name: '4. 尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <H3>Size Token 對照</H3>
        <Desc>Size 影響兩個層面：Checkbox 元件自身尺寸（sm/md = 16px, lg = 20px）與 readonly wrapper 高度（fieldWrapperStyles 的 size variant）。Edit / disabled 模式不使用 wrapper，size 只影響 Checkbox。</Desc>
      </div>

      {/* Token table */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-caption">
          <thead>
            <tr>
              <Th>屬性</Th>
              {SIZES.map((sz) => <Th key={sz}>{sz}{sz === 'md' ? '（預設）' : ''}</Th>)}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Checkbox 尺寸', key: 'checkbox' as const },
              { label: 'Check icon', key: 'checkIcon' as const, suffix: 'px' },
              { label: 'Readonly wrapper 高度', key: 'wrapperHeightToken' as const, sub: 'wrapperHeight' as const },
              { label: 'Readonly 字體', key: 'fontToken' as const, sub: 'font' as const },
            ].map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                {SIZES.map((sz) => {
                  const spec = SIZE_SPECS[sz]
                  const val = spec[row.key]
                  const sub = row.sub ? spec[row.sub] : undefined
                  return (
                    <Td key={sz} mono>
                      <div className="text-fg-secondary">{String(val)}{row.suffix ?? ''}</div>
                      {sub && <div className="text-fg-muted text-[10px]">{String(sub)}</div>}
                    </Td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <Td>Readonly px</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">px-3</div>
                  <div className="text-fg-muted text-[10px]">12px</div>
                </Td>
              ))}
            </tr>
            <tr>
              <Td>Readonly gap</Td>
              {SIZES.map((sz) => (
                <Td key={sz} mono>
                  <div className="text-fg-secondary">gap-2</div>
                  <div className="text-fg-muted text-[10px]">8px</div>
                </Td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Visual preview */}
      <div className="flex flex-col gap-4">
        <span className="text-caption font-medium text-fg-secondary">預覽 — 各 size x mode</span>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <Th>Size</Th>
                <Th>edit (checked)</Th>
                <Th>edit (unchecked)</Th>
                <Th>readonly (true)</Th>
                <Th>readonly (false)</Th>
                <Th>disabled (checked)</Th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((sz) => (
                <tr key={sz}>
                  <Td mono>{sz}</Td>
                  <Td><CheckboxField mode="edit" value={true} size={sz} /></Td>
                  <Td><CheckboxField mode="edit" value={false} size={sz} /></Td>
                  <Td><CheckboxField mode="readonly" value={true} size={sz} /></Td>
                  <Td><CheckboxField mode="readonly" value={false} size={sz} /></Td>
                  <Td><CheckboxField mode="disabled" value={true} size={sz} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}
