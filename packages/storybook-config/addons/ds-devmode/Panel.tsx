import React from 'react'
import { useChannel } from '@storybook/manager-api'
import { EVENTS, type InspectPayload, type DevmodeMode, type ForceState } from './constants'

/**
 * Theme-aware text color(2026-05-01 修):
 * Storybook 8 用 `--sb-color-*` namespace,我們原 code 用 `--sb-fg` / `--sb-fg-muted`
 * 永遠 fallback 到 hard-coded `#1F2532` (dark)→ dark theme bg 上 invisible
 * (user 抓到此 bug,先前 #65727F canonicalize 不夠,fallback 本身就有問題)。
 *
 * 解法:自定 `--dm-fg` / `--dm-fg-muted` CSS variables,透過 `<style>` tag 注入
 * `@media (prefers-color-scheme: dark)` rule 切換 → 純 CSS,無 React state,
 * 切 OS theme 自動 reflow。fallback 仍保留 `#1F2532` / `#65727F`(light theme)。
 */
const ThemeStyleInjector: React.FC = () => (
  <style>{`
    .ds-devmode-root { --dm-fg: #1F2532; --dm-fg-muted: #65727F; }
    @media (prefers-color-scheme: dark) {
      .ds-devmode-root { --dm-fg: #E5E8EB; --dm-fg-muted: #9AA3AC; }
    }
  `}</style>
)

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '12px 16px',
    fontSize: 11,  // 對齊 Chrome Styles panel 11px(原 12 偏鬆,精簡 + 資訊密度提升)
    fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    color: 'var(--dm-fg, #1F2532)',
    height: '100%',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 10,  // section head 縮小:Chrome MetricsSidebarPane / Styles section labels 都 10px
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--dm-fg-muted, #65727F)',
    margin: '8px 0 4px',  // 從 12 6 緊湊到 8 4
  },
  badge: {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 3,
    background: 'rgba(0,101,234,0.12)',
    color: '#0065EA',
    fontWeight: 500,
  },
  anatomy: {
    position: 'relative',
    border: '1px solid rgba(128,128,128,0.25)',
    borderRadius: 6,
    padding: '24px 28px',  // 從 36 40 壓縮 — 更接近 Chrome MetricsSidebarPane 的 compact 派
    background: 'var(--sb-bg-subtle, rgba(0,0,0,0.02))',
    marginTop: 4,
  },
  distance: {
    // 跟 canvas distanceLabel 統一(white-bg + red text + 1px red outline),
    // 跨 canvas/panel 視覺一致,且不在淺橙 margin band 上「過度突出」。
    position: 'absolute',
    fontSize: 10,
    fontWeight: 700,
    color: '#EC4436',
    background: '#fff',
    padding: '0 3px',
    borderRadius: 2,
    boxShadow: '0 0 0 1px rgba(236,68,54,0.35)',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  },
  borderBox: {
    position: 'relative',
    border: '1px dashed rgba(184, 152, 0, 0.6)',
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paddingBox: {
    position: 'relative',
    border: '1px dashed rgba(147,196,125,0.7)',
    padding: 8,
    background: 'repeating-linear-gradient(-45deg, rgba(147,196,125,0.18) 0 3px, transparent 3px 6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--dm-fg-muted, #65727F)',
    fontSize: 11,
    minWidth: 120,
    minHeight: 40,
  },
  edgeLabel: {
    color: 'var(--dm-fg-muted, #65727F)',
    fontSize: 10,
    lineHeight: 1,
  },
  toggle: {
    display: 'inline-flex',
    border: '1px solid rgba(128,128,128,0.35)',
    borderRadius: 4,
    overflow: 'hidden',
    fontSize: 11,
  },
  toggleBtn: (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    cursor: 'pointer',
    background: active ? 'rgba(0,101,234,0.15)' : 'transparent',
    color: active ? '#0065EA' : 'var(--dm-fg, #1F2532)',
    border: 0,
    fontWeight: active ? 600 : 400,
    fontFamily: 'inherit',
  }),
  code: {
    background: 'var(--sb-bg-subtle, rgba(0,0,0,0.04))',
    border: '1px solid rgba(128,128,128,0.2)',
    borderRadius: 4,
    padding: '8px 10px',
    fontFamily: '"SF Mono", Menlo, Consolas, monospace',
    fontSize: 11,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    counterReset: 'ln',
  },
  codeRow: {
    display: 'grid',
    gridTemplateColumns: '18px 1fr',
    gap: 8,
  },
  codeLn: {
    color: 'var(--dm-fg-muted, #65727F)',
    userSelect: 'none',
  },
  tokenChip: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: 2,
    verticalAlign: -1,
    marginRight: 4,
    border: '1px solid rgba(128,128,128,0.3)',
  },
  copy: {
    cursor: 'pointer',
    background: 'transparent',
    border: 0,
    color: 'var(--dm-fg-muted, #65727F)',
    padding: 2,
    borderRadius: 3,
    fontSize: 12,
  },
  empty: {
    color: 'var(--dm-fg-muted, #65727F)',
    fontSize: 12,
    padding: '24px 0',
    textAlign: 'center',
  },
  modeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottom: '1px solid rgba(128,128,128,0.2)',
    marginBottom: 8,
  },
}

type ViewMode = 'list' | 'code'

const isColor = (v: string) => /^(#|rgba?\(|hsla?\()/i.test(v.trim())
const extractColor = (v: string) => {
  const m = v.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8}\b|hsla?\([^)]+\))/i)
  return m ? m[0] : null
}

const propsOrder = [
  'display', 'position',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'flex', 'flex-direction', 'gap',
  'justify-content', 'align-items',
  'color', 'background', 'background-color',
  'border', 'border-width', 'border-style', 'border-color', 'border-radius',
  'box-shadow', 'opacity',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
] as const

const sortEntries = (groups: Record<string, string>): [string, string][] =>
  Object.entries(groups).sort((a, b) => {
    const ai = propsOrder.indexOf(a[0] as (typeof propsOrder)[number])
    const bi = propsOrder.indexOf(b[0] as (typeof propsOrder)[number])
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0])
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

const layoutKeys = new Set([
  'display', 'position', 'width', 'height', 'min-width', 'min-height',
  'max-width', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'flex', 'flex-direction', 'flex-wrap', 'gap', 'row-gap', 'column-gap',
  'justify-content', 'align-items', 'align-self',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
])

const splitByGroup = (cs: Record<string, string>) => {
  const layout: Record<string, string> = {}
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(cs)) {
    ;(layoutKeys.has(k) ? layout : style)[k] = v
  }
  return { layout, style }
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

type TokenByPropEntry = { tokens: string[]; resolved: string; source: 'author' | 'speculative'; raw?: string }

type TokenByPropEntryWithRaw = TokenByPropEntry & { raw?: string }

/**
 * Render author raw expression(calc / var combo)— 高亮全 var() token name
 * + 在右側 → 接 resolved value。對齊 Chrome / FF / Safari「raw → resolved」idiom。
 *
 * 例:`calc((var(--field-height-sm) - 16px - 2px) / 2)` → `5px`
 *      ─ var token highlighted with underline + tooltip resolved chain
 *      ─ calc / px / numeric 部分維持原 raw 文字
 *      ─ 整段右側接「→ 5px」 顯實際值
 */
const renderAuthorRaw = (raw: string, resolved: string, tokensByProp: TokenByPropEntryWithRaw): React.ReactNode => {
  // 切割 raw 成 segments:var() 部分 highlighted,其餘 plain
  const parts: React.ReactNode[] = []
  const re = /var\((--[a-zA-Z0-9-_]+)(?:,\s*([^)]+))?\)/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  let segIdx = 0
  while ((m = re.exec(raw))) {
    if (m.index > lastIdx) {
      parts.push(<span key={`p-${segIdx++}`}>{raw.slice(lastIdx, m.index)}</span>)
    }
    const tokenName = m[1]
    const fallback = m[2]
    parts.push(
      <span key={`v-${segIdx++}`} style={{ color: '#7A4EE8' }}>
        var(
        <span
          title={`token: ${tokenName}\nresolved: ${resolved}`}
          style={{ color: '#C4423A', textDecoration: 'underline', textDecorationStyle: 'solid' }}
        >
          {tokenName}
        </span>
        {fallback ? <>, <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>{fallback}</span></> : null}
        )
      </span>
    )
    lastIdx = re.lastIndex
  }
  if (lastIdx < raw.length) {
    parts.push(<span key={`p-${segIdx++}`}>{raw.slice(lastIdx)}</span>)
  }
  return (
    <>
      <span style={{ fontFamily: '"SF Mono", Menlo, monospace' }}>{parts}</span>
      <span style={{ color: 'var(--dm-fg-muted, #65727F)', margin: '0 6px' }}>→</span>
      <strong style={{ color: 'var(--dm-fg, #1F2532)' }}>{resolved}</strong>
    </>
  )
}

const renderValue = (
  prop: string,
  v: string,
  tokenByProp: Map<string, TokenByPropEntry>,
): React.ReactNode => {
  const hit = tokenByProp.get(prop)
  const color = extractColor(v)

  // 'author' source = stylesheet 真實寫的 var()(可能含 calc / 多 var) — 顯完整 raw → resolved
  if (hit && hit.tokens.length && hit.source === 'author') {
    return (
      <>
        {color && isColor(color) && (
          <span style={{ ...styles.tokenChip, background: color }} />
        )}
        {renderAuthorRaw(hit.raw || `var(${hit.tokens[0]})`, hit.resolved, hit)}
      </>
    )
  }

  // 'speculative' source = reverse-lookup 推測,作 hint 顯示為淡灰 + 註記 candidate
  if (hit && hit.tokens.length && hit.source === 'speculative') {
    const allTokens = hit.tokens.length > 1 ? `${hit.tokens.length} candidates` : hit.tokens[0]
    return (
      <>
        {color && isColor(color) && (
          <span style={{ ...styles.tokenChip, background: color }} />
        )}
        <span>{v}</span>
        <span
          title={`同值 token candidates(speculative,author 沒寫 var()):${hit.tokens.join(', ')}`}
          style={{ marginLeft: 6, fontSize: 10, color: 'var(--dm-fg-muted, #65727F)', fontStyle: 'italic' }}
        >
          ⓘ {allTokens}
        </span>
      </>
    )
  }

  // No token info — pure computed value
  return (
    <>
      {color && isColor(color) && (
        <span style={{ ...styles.tokenChip, background: color }} />
      )}
      <span>{v}</span>
    </>
  )
}

const Section: React.FC<{
  title: string
  entries: [string, string][]
  view: ViewMode
  tokenByProp: Map<string, TokenByPropEntry>
}> = ({ title, entries, view, tokenByProp }) => {
  if (!entries.length) return null
  const codeText = entries
    .map(([k, v]) => {
      const hit = tokenByProp.get(k)
      // Code view:author source 顯完整 raw expression(calc + var combo)→ resolved 註釋
      // Speculative 不顯避免 misleading copy-paste
      let display: string
      if (hit && hit.tokens.length && hit.source === 'author') {
        const raw = hit.raw || `var(${hit.tokens[0]})`
        // Show "raw  /* → resolved */" if raw differs from resolved (formula present)
        display = raw === hit.resolved ? raw : `${raw};  /* → ${hit.resolved} */`
        return `${k}: ${display.replace(/;\s*\/\*/, ' /* ')};`  // clean repeat ;
      }
      display = v
      return `${k}: ${display};`
    })
    .join('\n')
  return (
    <section>
      <div style={styles.sectionHead}>
        <span>{title}</span>
        <button
          style={styles.copy}
          onClick={() => copyText(codeText)}
          title="Copy section"
          aria-label={`Copy ${title}`}
        >
          ⧉
        </button>
      </div>
      {view === 'list' ? (
        <div style={styles.code}>
          {entries.map(([k, v], i) => (
            <div key={k} style={styles.codeRow}>
              <span style={styles.codeLn}>{i + 1}</span>
              <span>
                <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>{k}</span>
                {': '}
                {renderValue(k, v, tokenByProp)}
                {';'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <pre style={{ ...styles.code, margin: 0 }}>{codeText}</pre>
      )}
    </section>
  )
}

const AnatomyBox: React.FC<{ payload: InspectPayload }> = ({ payload }) => {
  const { distancesToParent, padding, margin, border, position, rect } = payload
  const isPositioned = position && position.type !== 'static'
  const w = Math.round(rect.width)
  const h = Math.round(rect.height)
  // Content size = rect - border - padding(對齊 Chrome DevTools box model 第 4 層 inner-most)。
  // 之前未扣 border → 有 border 元件(Tag / FileItem rich / Input)content size 偏大 2px,
  // 跟 Storybook addon-measure(扣 border)對不上;修正使我們 = Chrome = addon-measure 三方一致。
  const iw = Math.max(0, w - padding.left - padding.right - border.left - border.right)
  const ih = Math.max(0, h - padding.top - padding.bottom - border.top - border.bottom)
  // 2026-05-13 R5 rewrite(per codex Q1 verdict + user 拍「想盡辦法 auto-handle prereq」):
  // **Inspired by** Chrome DevTools Box Model / MetricsSidebarPane idiom(降級從「同源」claim;
  // 真 Chrome 是 `display:flex` 不是 grid,per Chromium source verify)。
  // 改 CSS Grid + grid-template-areas + clamp font-size + tabular-nums + ellipsis overflow,
  // 結構性消除 `position:absolute; top:-9` magic number 對 font fallback 的脆弱依賴。
  // 每層(margin / border / padding)用 3×3 grid:corners 空、edges 顯示 4 邊 px 值、center 為下一層,
  // 各層 label tag 用 `grid-row:1; align-self:start; justify-self:start` 放在 top-left 而非 absolute。
  // Font:`clamp(10px, 0.72rem, 11px)` + `font-variant-numeric:tabular-nums` 兼容 Windows fallback。
  const layerLabelStyle: React.CSSProperties = {
    fontSize: 'clamp(10px, 0.72rem, 11px)',
    lineHeight: 1.2,
    fontVariantNumeric: 'tabular-nums',
    padding: '1px 4px',
    background: 'var(--sb-bg, #fff)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }
  // 2026-05-14 AnatomyBox hybrid rewrite(per codex M31 verdict + user verbatim「就只能超越不能比
  // figma 還爛」+ Layer A 共識「revert CSS Grid 3×3 scatter,Figma/Chrome nested rect canonical」):
  // 保 Layer factory abstraction(maintainable)+ visual 走 Figma/Chrome 風格 position-relative nested
  // rects + edge values 浮在 band 中間(非 grid cell scatter)。對齊 Chrome DevTools box-model
  // diagram(MDN canonical) + Figma DevMode Inspect Panel layout/spacing canonical。
  const edgeValueStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: 11,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--dm-fg-muted, #65727F)',
    textAlign: 'center',
    padding: '1px 4px',
    background: 'var(--sb-bg, #fff)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  }
  const Layer: React.FC<{
    label: string
    edges: { top: number | string; right: number | string; bottom: number | string; left: number | string }
    color: string
    bgPattern?: string
    borderStyle?: 'solid' | 'dashed' | 'dotted'
    children: React.ReactNode
  }> = ({ label, edges, color, bgPattern, borderStyle = 'dashed', children }) => (
    <div
      style={{
        position: 'relative',
        border: `1px ${borderStyle} ${color}`,
        background: bgPattern,
        padding: 18,  // breathing band for edge values + nested layer
      }}
    >
      {/* Layer label — 左上角浮在 border 上(Chrome DevTools canonical) */}
      <span style={{ ...layerLabelStyle, position: 'absolute', top: 0, left: 8, transform: 'translateY(-50%)', color, padding: '0 4px' }}>{label}</span>
      {/* Edge values 浮在 band 中間(Figma-style nested rect)*/}
      <span style={{ ...edgeValueStyle, top: 3, left: '50%', transform: 'translateX(-50%)', color }}>{edges.top}</span>
      <span style={{ ...edgeValueStyle, bottom: 3, left: '50%', transform: 'translateX(-50%)', color }}>{edges.bottom}</span>
      <span style={{ ...edgeValueStyle, left: 3, top: '50%', transform: 'translateY(-50%)', color }}>{edges.left}</span>
      <span style={{ ...edgeValueStyle, right: 3, top: '50%', transform: 'translateY(-50%)', color }}>{edges.right}</span>
      {children}
    </div>
  )
  const positionFmt = (v: string) => v === 'auto' || v === '' ? '—' : v
  const content = (
    <div style={{ position: 'relative', minWidth: 100, padding: '8px 12px', textAlign: 'center', color: 'var(--dm-fg, #1F2532)', fontWeight: 500, fontSize: 'clamp(11px, 0.78rem, 12px)', fontVariantNumeric: 'tabular-nums' }}>
      {/* Content size — clear "Size W × H" label avoid mystery numeric */}
      Size {iw} × {ih}
    </div>
  )
  // 2026-05-14 distance badges 修(per user「padding 被蓋」報告):distance badges 從 content
  // div 拉到最外圍,放在 Margin/Position Layer **外側**(translateY -100% / 100%),不再跟
  // inner padding edge labels collision。distance = 此元素距 parent content edge 的 px,
  // 視覺上歸 outer Margin 外側才合理(對齊 Figma DevMode auto-layout spacing badge idiom)。
  const distanceBadges = distancesToParent && (
    <>
      {distancesToParent.top !== undefined && <span style={{ ...styles.distance, position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%) translateY(-100%)' }}>{distancesToParent.top}</span>}
      {distancesToParent.bottom !== undefined && <span style={{ ...styles.distance, position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%) translateY(100%)' }}>{distancesToParent.bottom}</span>}
      {distancesToParent.left !== undefined && <span style={{ ...styles.distance, position: 'absolute', left: 0, top: '50%', transform: 'translateX(-100%) translateY(-50%)' }}>{distancesToParent.left}</span>}
      {distancesToParent.right !== undefined && <span style={{ ...styles.distance, position: 'absolute', right: 0, top: '50%', transform: 'translateX(100%) translateY(-50%)' }}>{distancesToParent.right}</span>}
    </>
  )
  const paddingLayer = (
    <Layer
      label="Padding"
      edges={{ top: padding.top, right: padding.right, bottom: padding.bottom, left: padding.left }}
      color="#558B2F"
      bgPattern="repeating-linear-gradient(-45deg, rgba(147,196,125,0.18) 0 3px, transparent 3px 6px)"
    >
      {content}
    </Layer>
  )
  const borderLayer = (
    <Layer
      label={`Border ${border.top}/${border.right}/${border.bottom}/${border.left}`}
      edges={{ top: border.top, right: border.right, bottom: border.bottom, left: border.left }}
      color="rgba(184, 152, 0, 0.9)"
    >
      {paddingLayer}
    </Layer>
  )
  const marginLayer = (
    <Layer
      label="Margin"
      edges={{ top: margin.top, right: margin.right, bottom: margin.bottom, left: margin.left }}
      color="#A36100"
      bgPattern="repeating-linear-gradient(45deg, rgba(247, 142, 30, 0.08) 0 3px, transparent 3px 6px)"
    >
      {borderLayer}
    </Layer>
  )
  if (!isPositioned) return (
    <div style={{ position: 'relative', marginTop: 4 }}>
      {marginLayer}
      {distanceBadges}
    </div>
  )
  return (
    <div style={{ position: 'relative' }}>
      <Layer
        label={`Position ${position!.type} · ${positionFmt(position!.top)}/${positionFmt(position!.right)}/${positionFmt(position!.bottom)}/${positionFmt(position!.left)}`}
        edges={{ top: positionFmt(position!.top), right: positionFmt(position!.right), bottom: positionFmt(position!.bottom), left: positionFmt(position!.left) }}
        color="#7B44C4"
        bgPattern="rgba(123, 68, 196, 0.04)"
        borderStyle="dotted"
      >
        {marginLayer}
      </Layer>
      {distanceBadges}
    </div>
  )
}

const AutoLayoutSection: React.FC<{ autoLayout: NonNullable<InspectPayload['autoLayout']> }> = ({ autoLayout }) => {
  const isFlex = autoLayout.display === 'flex'
  return (
    <>
      <div style={styles.sectionHead}>
        <span>Auto-layout</span>
        <span style={{ ...styles.badge, background: isFlex ? 'rgba(0,168,179,0.12)' : 'rgba(123,68,196,0.12)', color: isFlex ? '#00A8B3' : '#7B44C4' }}>
          {autoLayout.display}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 12px', fontSize: 11, padding: '6px 0' }}>
        {isFlex && autoLayout.flexDirection && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>direction</span>
            <code>{autoLayout.flexDirection}</code>
          </>
        )}
        {autoLayout.gap && autoLayout.gap !== 'normal' && autoLayout.gap !== '0px' && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>gap</span>
            <code>{autoLayout.gap}</code>
          </>
        )}
        {autoLayout.justifyContent && autoLayout.justifyContent !== 'normal' && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>justify</span>
            <code>{autoLayout.justifyContent}</code>
          </>
        )}
        {autoLayout.alignItems && autoLayout.alignItems !== 'normal' && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>align</span>
            <code>{autoLayout.alignItems}</code>
          </>
        )}
        {isFlex && autoLayout.flexWrap && autoLayout.flexWrap !== 'nowrap' && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>wrap</span>
            <code>{autoLayout.flexWrap}</code>
          </>
        )}
        {!isFlex && autoLayout.gridTemplateColumns && autoLayout.gridTemplateColumns !== 'none' && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>columns</span>
            <code style={{ wordBreak: 'break-all' }}>{autoLayout.gridTemplateColumns}</code>
          </>
        )}
        {!isFlex && autoLayout.gridTemplateRows && autoLayout.gridTemplateRows !== 'none' && (
          <>
            <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>rows</span>
            <code style={{ wordBreak: 'break-all' }}>{autoLayout.gridTemplateRows}</code>
          </>
        )}
      </div>
    </>
  )
}

export const DsDevmodePanel: React.FC<{ active: boolean }> = ({ active }) => {
  const [payload, setPayload] = React.useState<InspectPayload | null>(null)
  const [view, setView] = React.useState<ViewMode>('list')
  const [mode, setMode] = React.useState<DevmodeMode>('off')
  const [forceState, setForceState] = React.useState<ForceState>('none')

  const emit = useChannel({
    [EVENTS.INSPECT]: (p: InspectPayload) => setPayload(p),
    [EVENTS.TOGGLE]: (m: DevmodeMode) => setMode(m),
    [EVENTS.CLEAR]: () => { setPayload(null); setForceState('none') },
  })

  if (!active) return null

  const tokenByProp = new Map<string, TokenByPropEntry>()
  payload?.tokenUsage.forEach(t => tokenByProp.set(t.property, { tokens: t.tokens, resolved: t.resolved, source: t.source, raw: t.raw }))
  const groups = payload ? splitByGroup(payload.computed) : { layout: {}, style: {} }

  const setModeAndBroadcast = (next: DevmodeMode) => {
    setMode(next)
    emit(EVENTS.TOGGLE, next)
    if (next === 'off') emit(EVENTS.CLEAR)
  }

  const setForceStateAndBroadcast = (next: ForceState) => {
    setForceState(next)
    emit(EVENTS.FORCE_STATE, next)
  }

  return (
    <div className="ds-devmode-root" style={styles.root}>
      <ThemeStyleInjector />
      <div style={styles.modeRow}>
        <strong style={{ fontSize: 12 }}>DS Devmode</strong>
        <div style={styles.toggle} role="group" aria-label="Inspect mode">
          <button style={styles.toggleBtn(mode === 'off')} onClick={() => setModeAndBroadcast('off')}>Off</button>
          <button style={styles.toggleBtn(mode === 'live')} onClick={() => setModeAndBroadcast('live')}>Live</button>
          <button style={styles.toggleBtn(mode === 'pin')} onClick={() => setModeAndBroadcast('pin')} disabled={!payload}>Pin</button>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dm-fg-muted, #65727F)' }}>
          Alt+I toggle · Esc unpin · ↑↓←→ DOM · <b style={{ color: '#EC4436' }}>hover 別元素 = 量距</b> · H 暫清 · 觸控 tap pin
        </span>
      </div>

      {!payload && (
        <div style={styles.empty}>
          {mode === 'off'
            ? 'Off. Toggle Live/Pin, click an element to inspect.'
            : mode === 'live'
              ? 'Hover any canvas element.'
              : 'Click a canvas element to pin — 之後 hover 其他元素自動測距(Figma-style)。'}
        </div>
      )}

      {payload && (
        <>
          {/* Element tree breadcrumb(Chrome DevTools 風)*/}
          {payload.breadcrumb && payload.breadcrumb.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 8, fontSize: 10, color: 'var(--dm-fg-muted, #65727F)' }}>
              {payload.breadcrumb.map((crumb, i) => {
                const isLast = i === payload.breadcrumb.length - 1
                const label = `${crumb.tag}${crumb.id ? `#${crumb.id}` : ''}${crumb.className ? `.${String(crumb.className).split(/\s+/).filter(Boolean)[0]}` : ''}`
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <span>›</span>}
                    <span style={{ color: isLast ? 'var(--dm-fg, #1F2532)' : undefined, fontWeight: isLast ? 600 : 400 }}>
                      {label}
                    </span>
                  </React.Fragment>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={styles.badge}>{payload.tag}</span>
            {payload.id && <code style={{ fontSize: 11 }}>#{payload.id}</code>}
            {payload.className && (() => {
              const classes = String(payload.className).split(/\s+/).filter(Boolean)
              // Truncate long class lists(button 常 50+ class)— first 5 + count,
              // <details> let user 展開看全。對齊 Chrome Styles panel 同 idiom。
              if (classes.length <= 5) {
                return (
                  <code style={{ fontSize: 11, color: 'var(--dm-fg-muted, #65727F)', wordBreak: 'break-all' }}>
                    .{classes.join(' .')}
                  </code>
                )
              }
              return (
                <details style={{ fontSize: 11, color: 'var(--dm-fg-muted, #65727F)', flex: 1, minWidth: 0 }}>
                  <summary style={{ cursor: 'pointer', listStyle: 'none', wordBreak: 'break-all' }}>
                    <code>.{classes.slice(0, 5).join(' .')}</code>
                    <span style={{ color: 'var(--dm-fg-muted, #65727F)', marginLeft: 4 }}>(+{classes.length - 5} more)</span>
                  </summary>
                  <code style={{ display: 'block', wordBreak: 'break-all', marginTop: 4, paddingLeft: 4, borderLeft: '2px solid rgba(128,128,128,0.2)' }}>
                    .{classes.slice(5).join(' .')}
                  </code>
                </details>
              )
            })()}
            <button
              style={{ ...styles.copy, marginLeft: 'auto' }}
              onClick={() => {
                const allCss = Object.entries(payload.computed)
                  .map(([k, v]) => {
                    const hit = tokenByProp.get(k)
                    if (hit && hit.tokens.length && hit.source === 'author') {
                      const raw = hit.raw || `var(${hit.tokens[0]})`
                      return raw === hit.resolved
                        ? `${k}: ${raw};`
                        : `${k}: ${raw}; /* → ${hit.resolved} */`
                    }
                    return `${k}: ${v};`
                  })
                  .join('\n')
                const sel = `${payload.tag}${payload.id ? `#${payload.id}` : ''}${payload.className ? `.${String(payload.className).split(/\s+/).filter(Boolean).join('.')}` : ''}`
                copyText(`${sel} {\n${allCss}\n}`)
              }}
              title="Copy all CSS as rule"
              aria-label="Copy all CSS"
            >
              ⧉ Copy all CSS
            </button>
          </div>

          {/* Force pseudo-class state(Chrome 「:hov」force state idiom) — 2026-05-13 R6 v1:
              Visible warning badge 顯示 fallback 機制限制(per codex V2 verdict)。 */}
          {mode === 'pin' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--dm-fg-muted, #65727F)' }}>:state</span>
              <div style={styles.toggle} role="group" aria-label="Force pseudo-class state">
                <button style={styles.toggleBtn(forceState === 'none')} onClick={() => setForceStateAndBroadcast('none')}>none</button>
                <button style={styles.toggleBtn(forceState === 'hover')} onClick={() => setForceStateAndBroadcast('hover')}>:hover</button>
                <button style={styles.toggleBtn(forceState === 'focus')} onClick={() => setForceStateAndBroadcast('focus')}>:focus</button>
                <button style={styles.toggleBtn(forceState === 'active')} onClick={() => setForceStateAndBroadcast('active')}>:active</button>
              </div>
              {forceState !== 'none' && (
                <span
                  style={{ fontSize: 10, color: '#A36100', background: 'rgba(247, 142, 30, 0.12)', padding: '2px 6px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' }}
                  title="本 addon 用 stylesheet rewriter fallback(注入 [data-ds-devmode-force=...] selector),非 Chrome 真實 CDP forcePseudoState 機制。:has() / :is() / :not(:hover) 等 logical selector 不準確。"
                >
                  ⚠ fallback simulation
                </span>
              )}
            </div>
          )}

          <div style={styles.sectionHead}>
            <span>Layer properties</span>
            <span style={{ fontSize: 11, color: 'var(--dm-fg-muted, #65727F)', fontWeight: 400 }}>
              {Math.round(payload.rect.width)} × {Math.round(payload.rect.height)}
            </span>
          </div>
          <AnatomyBox payload={payload} />

          {/* Sibling distance(pin mode hover 另一元素時顯示)— Panel canonical:
              canvas 小距離 hide label 時 user 仍能在此讀數。對齊 Figma Inspect
              「Distance to selected」idiom。*/}
          {payload.siblingDistance && (
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', fontSize: 11, padding: '8px 0', marginTop: 8, borderTop: '1px solid rgba(128,128,128,0.15)' }}>
              <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>Sibling distance</span>
              <span style={{ color: '#EC4436', fontWeight: 600 }}>
                {payload.siblingDistance.horizontal !== null && `H: ${Math.round(payload.siblingDistance.horizontal)}px`}
                {payload.siblingDistance.horizontal !== null && payload.siblingDistance.vertical !== null && '  ·  '}
                {payload.siblingDistance.vertical !== null && `V: ${Math.round(payload.siblingDistance.vertical)}px`}
              </span>
            </div>
          )}

          {payload.autoLayout && <AutoLayoutSection autoLayout={payload.autoLayout} />}

          {/* 2026-05-13 R6 v3 hot map UI(user「沒理由不做」拍板):
              Input token name → click button emit `HOTMAP_HIGHLIGHT` event → preview paint outline overlays
              on matching elements。配對 utils/token-drift-detector.ts `findElementsUsingToken`。 */}
          <details style={{ marginTop: 12, fontSize: 11 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--dm-fg-muted, #65727F)', fontWeight: 500 }}>
              🔍 Token hot map(highlight elements using a token)
            </summary>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <input
                type="text"
                placeholder="e.g. --space-2"
                style={{ flex: 1, fontSize: 11, padding: '3px 6px', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 3, fontFamily: 'ui-monospace, monospace' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v) emit(EVENTS.HOTMAP_HIGHLIGHT, v)
                  }
                }}
              />
              <button
                style={{ ...styles.toggleBtn(false), padding: '3px 8px' }}
                onClick={(e) => {
                  const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement)
                  const v = input?.value.trim()
                  if (v) emit(EVENTS.HOTMAP_HIGHLIGHT, v)
                }}
              >Highlight</button>
              <button
                style={{ ...styles.toggleBtn(false), padding: '3px 8px' }}
                onClick={() => emit(EVENTS.HOTMAP_CLEAR)}
              >Clear</button>
            </div>
            <span style={{ fontSize: 10, color: 'var(--dm-fg-muted, #65727F)', display: 'block', marginTop: 4 }}>
              Hot map outlines elements where any computed CSS property equals the token's resolved value(青色 outline)。掃描 scope:`#storybook-root` subtree,500 element cap(per codex V3 perf canonical)。
            </span>
          </details>

          {/* 2026-05-13 R6 v3 — Token drift detector UI section(per codex V3 verdict + user 拍板「做完」)。
              Detect author CSS 寫 raw value(如 `8px`)而剛好等於 DS token(如 `--space-2: 8px`)的 drift。
              利用 token-reverse-lookup.ts 既有 source extraction + token-drift-detector.ts allowlist。 */}
          {(() => {
            // Map author decl → raw value(non-resolved,from token-reverse-lookup extractSourceVars output 對應的 raw field)
            const authorDecls = new Map<string, string>()
            payload.tokenUsage.forEach(t => {
              if (t.raw && !t.raw.includes('var(')) authorDecls.set(t.property, t.raw)
            })
            const drifts = typeof window.__ds_devmode_drift === 'function' && payload && document.querySelector('[data-ds-devmode-pinned]')
              ? window.__ds_devmode_drift(document.querySelector('[data-ds-devmode-pinned]') as Element, authorDecls)
              : []
            if (drifts.length === 0) return null
            return (
              <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 4, background: 'rgba(247, 142, 30, 0.08)', border: '1px solid rgba(247, 142, 30, 0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#A36100', marginBottom: 4 }}>
                  ⚠ Token drift detected({drifts.length})
                </div>
                <div style={{ fontSize: 10, color: '#A36100', lineHeight: 1.6 }}>
                  {drifts.map((d, i) => (
                    <div key={i}>
                      <code>{d.property}: {d.rawValue}</code>{' '}
                      <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>
                        → 建議用 {d.matchedTokens.slice(0, 3).map(t => `var(${t})`).join(' / ')}
                      </span>
                      {d.severity === 'medium' && <span style={{ marginLeft: 4, opacity: 0.7 }}>(多 token 同值,ambiguous)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <div style={styles.toggle} role="group" aria-label="View">
              <button style={styles.toggleBtn(view === 'list')} onClick={() => setView('list')}>List</button>
              <button style={styles.toggleBtn(view === 'code')} onClick={() => setView('code')}>Code</button>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dm-fg-muted, #65727F)' }}>CSS</span>
          </div>

          {/* Author CSS — 完整顯示 author 寫的所有 properties(對齊 user 底線「完整顯示原本 css」)*/}
          {payload.authorCss && payload.authorCss.length > 0 && (
            <>
              <div style={styles.sectionHead}>
                <span>Author CSS({payload.authorCss.length})</span>
                <button
                  style={styles.copy}
                  onClick={() => {
                    const text = payload.authorCss
                      .map(d => d.rawValue === d.resolved ? `${d.property}: ${d.rawValue};` : `${d.property}: ${d.rawValue}; /* → ${d.resolved} */`)
                      .join('\n')
                    copyText(text)
                  }}
                  title="Copy all author CSS"
                  aria-label="Copy author CSS"
                >
                  ⧉
                </button>
              </div>
              <div style={styles.code}>
                {payload.authorCss.map((d, i) => (
                  <div key={`${d.property}-${i}`} style={styles.codeRow}>
                    <span style={styles.codeLn}>{i + 1}</span>
                    <span>
                      <span style={{ color: 'var(--dm-fg-muted, #65727F)' }}>{d.property}</span>
                      {': '}
                      {d.tokens.length > 0
                        ? renderAuthorRaw(d.rawValue, d.resolved, { tokens: d.tokens, resolved: d.resolved, source: 'author', raw: d.rawValue })
                        : d.rawValue !== d.resolved
                        ? <>
                            <span style={{ fontFamily: '"SF Mono", Menlo, monospace' }}>{d.rawValue}</span>
                            <span style={{ color: 'var(--dm-fg-muted, #65727F)', margin: '0 6px' }}>→</span>
                            <strong>{d.resolved}</strong>
                          </>
                        : <span>{d.rawValue}</span>}
                      {';'}
                      {d.fromSelector !== 'inline' && (
                        <span title={`from rule: ${d.fromSelector}`} style={{ marginLeft: 6, fontSize: 9, color: 'var(--dm-fg-muted, #65727F)' }}>
                          ← .{d.fromSelector.split(/\s+/).find(s => s.startsWith('.'))?.slice(1).split(':')[0] || d.fromSelector.slice(0, 20)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={styles.sectionHead}>
            <span>Computed CSS(filtered)</span>
          </div>
          <Section title="Layout" entries={sortEntries(groups.layout)} view={view} tokenByProp={tokenByProp} />
          <Section title="Style" entries={sortEntries(groups.style)} view={view} tokenByProp={tokenByProp} />

          {payload.tokenUsage.length === 0 && Object.keys(payload.computed).length > 0 && (
            <div style={{ ...styles.empty, padding: '12px 0' }}>No DS tokens matched this element&rsquo;s computed values.</div>
          )}
        </>
      )}
    </div>
  )
}
