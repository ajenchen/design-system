// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @renderer-symmetry-allow: ComboboxTagStack(display path)接 consumer tagRenderer 是 Stream C 下 cycle 工作 — 2026-05-12 先 ship Issues 2/3/4 surgical fixes(placeholder vocabulary + cell surface metrics + placeholder truncate),tagRenderer display-path unify deferred per field-controls.spec.md 共享 contract a。當前 multi=1 顯示已透過 PeoplePicker tagRenderer 線 314 PersonDisplay SSOT 對齊;其他 Combobox consumer 走 default `<Tag>` 純文字 backward-compat。
// code-quality-allow: file-size — Combobox 含 NativeCombobox/CustomCombobox/useOverflowCount/OverflowTagList/ComboboxTagStack 5 子元件 + 共用 helpers,split-into-files 會破壞 measurement closures + 重複 type definitions。
import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY, nakedCellRowModeAlign, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid } from '@/design-system/components/Field/field-context'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { SelectMenu, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'
import { useIsTouchDevice } from '@/design-system/hooks/use-is-touch-device'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

// ── constants ───────────────────────────────────────────────────────────────

const GAP = 4

const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

/**
 * Combobox option schema(2026-05-10 post-Issue-4 audit unify):**explicit extends
 * SelectMenuOption(primitive SSOT)** — 避免重蹈先前 PeoplePicker 改壞的 wrapper schema drift。
 *
 * Why `extends SelectMenuOption`(per user 「全盤檢查避免下次又改壞或是偏移」要求):
 *   原 `interface ComboboxOption { value: string; label: string }` 是 weak schema,跟 Select 的
 *   `ComboboxOption`(同名)雙重宣告但欄位不同 → TypeScript 不抓(同名 interface 在不同 file
 *   各 export,consumer import 到哪個版本看 import path)→ schema drift。
 *   PeoplePicker multi-mode 走 Combobox 路徑,dropdown menu rows lose avatar / description —
 *   user 看到「single mode 有 avatar / multi mode 沒 avatar」inconsistency。
 *
 * Fix(post-Issue-4 follow-up):extend SelectMenuOption → 全 primitive surface 自動繼承。
 * Wrapper-only field 都沒有 → empty body interface(future 加 wrapper-only field 加在此處)。
 * `menuOptions` mapping(below)forward 全 SelectMenuOption surface。
 *
 * 對齊 Polaris ChoiceList / Material Autocomplete / Carbon Dropdown 的 wrapper-vs-primitive
 * schema-extension idiom。Hook `check_wrapper_primitive_schema_drift.sh`(M30 機械強制)。
 */
export interface ComboboxOption extends SelectMenuOption {
  // (no wrapper-only fields yet — kept for future扩 + same-name SSOT cross-wrapper)
}

// ── useOverflowCount (unchanged) ────────────────────────────────────────────

function useOverflowCount(
  containerRef: React.RefObject<HTMLDivElement | null>,
  tagEls: React.MutableRefObject<(HTMLDivElement | null)[]>,
  overflowEl: React.RefObject<HTMLDivElement | null>,
  totalCount: number,
  enabled: boolean,
  gap: number = GAP,  // (2026-05-07 v15.13)stack avatar 模式傳 0
  visibleCountOverride?: number,  // 2026-05-15 Bug 3 fix:override DOM measurement(PeoplePicker stack 走 formula primitive)
): { visibleCount: number; ready: boolean } {
  const [state, setState] = React.useState({ visibleCount: totalCount, ready: !enabled })
  // 2026-05-18 Round 6 fix(per Codex M31 Round 6 H7 verdict + Step 5 共識):
  // `ofEl.offsetWidth` 在 expanded state(visibleCount === totalCount → overflow=0 →
  // `OverflowIndicator` line 92 `return null` → ofEl wrapper empty)= 0,fallback 60;
  // 在 collapsed state(+N rendered)= 真實寬(~28-32px)。同 `available` 在兩 state 給
  // 不同 verdict → 臨界值區 `max(B+g+Q, B+g+O) ≤ available < B+g+F` 振盪。Cache last
  // non-zero measurement → measurement state-independent → oscillation 收斂。
  // 初始 60 沿用舊 fallback(無 measure 史 ok-ish over-estimate)。
  const lastOverflowWRef = React.useRef<number>(60)

  // 2026-05-16 RACE FIX(user 抓「逐個 click 滿 6」vs「取消全選→再全選」same length 不同 visible):
  //
  // 原 useEffect + 雙 rAF 沒 capture rAF IDs → cleanup 不 cancel pending rAFs。
  // Path B(length=6→0→6):length=0 時 override=undefined 走 internal calc 排 rAF,
  // 然後 length=6 + override=N → deps change → cleanup 跑(disconnect ResizeObserver 但
  // 不 cancel rAF)→ 新 useEffect 跑 override 寫 el.hidden → 舊 rAF 仍 fire → 跑舊
  // internal calc → 覆寫 el.hidden 用 internal measurement(不一致於 override formula)。
  //
  // Fix:
  // 1. useEffect → useLayoutEffect:tighter timing,measurement 在 paint 前 sync
  // 2. Capture rAF IDs,cancel on cleanup
  // 3. scheduleCalc 函式包裝,cancel in-flight rAF 才排新一輪(避免 ResizeObserver
  //    re-fire 堆 rAF)
  //
  // 對齊 2026-05-14 I3 fix comment「user 抓『全選 vs 逐個勾 result 不同』」 — 當時 fix
  // 只加 double-rAF 但漏 cancel,本次補完 race close。
  // 2026-05-18 Round 5 fix(per visual test probe):useLayoutEffect 在 nested component 場景
  // 會在 parent ref attach 前 fire(child layout effect 先於 parent ref attach)→ containerRef.current
  // null → early return → calc never runs → setProperty never called → CSS var unset → tag overflow。
  // 改 useEffect:fires AFTER paint,所有 refs 都 attach。double-rAF guard ensures layout done。
  // Trade-off:可能 1-2 frame flicker,但 functional setState guard + paint target measurement 已 cover。
  React.useEffect(() => {
    if (!enabled || totalCount === 0) { setState({ visibleCount: totalCount, ready: true }); return }
    if (visibleCountOverride !== undefined) {
      for (let i = 0; i < tagEls.current.length; i++) {
        const el = tagEls.current[i]
        if (el) el.hidden = i >= visibleCountOverride
      }
      const ofEl = overflowEl.current
      if (ofEl) ofEl.hidden = visibleCountOverride >= totalCount
      setState({ visibleCount: visibleCountOverride, ready: true }); return
    }
    // totalCount=1 fast path:single-tag case 直接 visible 不跑 measurement loop。
    // (歷史:c90d029 曾移除此 bypass,後復原 — 移除會造成 narrow cell 1-selected 跑 unbounded Tag
    // measurement 後 visibleCount=0 → 顯 +1 indicator 而非 single tag,違反 PeoplePicker length===1
    // 走 PersonDisplay SSOT。)
    // 2026-05-16 Round 5 codex edge case fix:explicit unhide DOM nodes(對齊 override branch)。
    // 原 fast-path 只設 React state 不動 `el.hidden`,如 wrappers 之前 hidden 殘留(從 length>1 降到 1)
    // 可能視覺漏顯。Override branch L78-80 同 contract 對齊。
    if (totalCount === 1) {
      for (let i = 0; i < tagEls.current.length; i++) {
        const el = tagEls.current[i]
        if (el) el.hidden = i >= 1
      }
      const ofEl = overflowEl.current
      if (ofEl) ofEl.hidden = true
      setState({ visibleCount: 1, ready: true }); return
    }
    const container = containerRef.current
    if (!container) return

    const calc = () => {
      const cs = getComputedStyle(container)
      const available = container.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
      // 2026-05-18 Round 5 fix(per user 拍板「那就開始做」+ Codex M31 Round 5 verdict):
      // inject available 成 CSS var,Tag 用 explicit length 而非 cyclic percentage(避 CSS Sizing 3
      // §5.2.1 cyclic percentage 退化問題)。
      container.style.setProperty('--combobox-tag-area-inline-size', `${available}px`)
      for (const el of tagEls.current) if (el) el.hidden = false
      const ofEl = overflowEl.current
      if (ofEl) ofEl.hidden = false
      // 2026-05-18 Round 6 fix:cache last non-zero ofEl width 破 expanded/collapsed state
      // 量測二態(expanded → ofEl 空 offsetWidth=0 / collapsed → real ~28-32px)。沒 cache
      // 之前同 `available` 在兩 state 給不同 verdict → 永動。詳本 hook 頂部 ref 註解。
      const measuredOverflowW = ofEl?.offsetWidth || 0
      if (measuredOverflowW > 0) lastOverflowWRef.current = measuredOverflowW
      const overflowW = lastOverflowWRef.current
      // **#3 fix(2026-05-04)**:width-check 先於 count++,並處理 i=0 邊界(1 tag 自身就太寬 → 全 hidden 顯 +N)
      // 之前 bug:greedy `count++` 永遠至少 = 1,1-tag-too-wide case 視覺呈半個 tag clipped + +N(錯)
      // 修後:1 tag 太寬時 count = 0,全 N tags 走 +N 顯 indicator
      // 2026-05-18 Round 5:量 paint target `[data-tag-root]` 而非 wrapper(per codex Round 5 verdict)。
      // wrapper basis:auto 自由 grow,offsetWidth ≠ Tag actual paint width。
      let used = 0, count = 0
      for (let i = 0; i < totalCount; i++) {
        const el = tagEls.current[i]
        if (!el) continue
        const tagRoot = el.querySelector('[data-tag-root]') as HTMLElement | null
        const w = tagRoot ? tagRoot.getBoundingClientRect().width : el.offsetWidth
        const next = used + (count > 0 ? gap : 0) + w
        const remaining = totalCount - count - 1
        // width check FIRST(無 `count > 0` 短路):任何超寬都 break,包含 i=0 case
        if (remaining > 0 && next + gap + overflowW > available) break
        if (remaining === 0 && next > available) break
        used = next; count++
      }
      for (let i = 0; i < tagEls.current.length; i++) { const el = tagEls.current[i]; if (el) el.hidden = i >= count }
      if (ofEl) ofEl.hidden = count >= totalCount
      // 2026-05-18 Round 5 last guard(per Codex Round 5 verdict):safety net 防 measurement drift
      // (sub-pixel / rounding)。verify last visible tag rect.right ≤ container right,超出遞減 count。
      const containerRect = container.getBoundingClientRect()
      while (count > 0) {
        const lastEl = tagEls.current[count - 1]
        const tagRoot = lastEl?.querySelector('[data-tag-root]') as HTMLElement | null
        if (!tagRoot) break
        const tagRect = tagRoot.getBoundingClientRect()
        if (tagRect.right <= containerRect.right + 0.5) break
        count--
        if (lastEl) lastEl.hidden = true
      }
      if (ofEl) ofEl.hidden = count >= totalCount
      // 2026-05-18 A' fix functional setState value-equal guard(per Codex Round 3 verdict):
      // sync calc 在 useLayoutEffect 內 + ResizeObserver re-fire 同時跑 → 若每次都 new object setState
      // 觸發 re-render 即使值沒變,可能 cascade。回 prev 不更新 = avoid 抖動。
      setState(prev => (prev.visibleCount === count && prev.ready) ? prev : { visibleCount: count, ready: true })
    }

    // 2026-05-14 I3 fix(per codex M31 verdict + user 抓「全選 vs 逐個勾 result 不同」):
    // double-rAF ensures layout 完成 before measurement(原 single rAF 在 batched render
    // 場景 tag 還 0-width)。Plus observe per-item ResizeObserver — 任何 tag width 變動
    // 都 trigger recalc(deterministic regardless of commit order)。
    //
    // 2026-05-16 Race close:capture rAF IDs + cancel on cleanup(原版 race I3 沒 close
    // 完;user 抓 path A 逐個 click vs path B 取消全選再全選 same length 不同 visible)。
    // 2026-05-18 A' fix(per Codex Round 3 共識,user 拍板「執行」)— sync calc in useLayoutEffect:
    // React 18 `useLayoutEffect` 在 DOM commit 後、瀏覽器繪製前同步跑,sync calc 在 paint 前
    // 完成 `el.hidden` 設定 + functional setState guard(value-equal 不更新 = 避免 ResizeObserver
    // 抖動 cascade rerender)。double-rAF 改 fallback only(ResizeObserver / async update path)。
    // 解 user verbatim「tag 過長 / 過多會先全顯再變 +N 閃動」root cause(per codex Round 3 cite
    // `combobox.tsx:248 render 沒設 hidden + L129 calc imperative 寫 DOM`)。
    // 對齊 React docs https://react.dev/reference/react/useLayoutEffect pre-paint guarantee。
    calc()
    let rafId1 = 0, rafId2 = 0
    const scheduleCalc = () => {
      if (rafId1) { cancelAnimationFrame(rafId1); rafId1 = 0 }
      if (rafId2) { cancelAnimationFrame(rafId2); rafId2 = 0 }
      rafId1 = requestAnimationFrame(() => {
        rafId1 = 0
        rafId2 = requestAnimationFrame(() => {
          rafId2 = 0
          calc()
        })
      })
    }
    scheduleCalc()
    const containerObs = new ResizeObserver(scheduleCalc)
    containerObs.observe(container)
    const itemObs = new ResizeObserver(scheduleCalc)
    for (const el of tagEls.current) {
      if (el) itemObs.observe(el)
    }
    return () => {
      if (rafId1) cancelAnimationFrame(rafId1)
      if (rafId2) cancelAnimationFrame(rafId2)
      containerObs.disconnect()
      itemObs.disconnect()
    }
  }, [containerRef, totalCount, enabled, gap, visibleCountOverride])  // 2026-05-15 Bug 3 fix:visibleCountOverride 入 deps,override 改 trigger recalc

  return state
}

// ── OverflowTagList (unchanged) ──────────────────────────────────────────────

type ComboboxOverflowShape = 'circle' | 'tag'

// 2026-05-16 fix:overflow chip wrapper 必能跟 tag wrapper 套同 overlap class
// (per user 物理模型「avatar 和 +N 都是同尺寸圓形 + 同 step」)。原 chip wrapper
// 只有 `shrink-0`,在 stack 模式 -ml-0.5 不 apply → chip 不 overlap → 視覺多 22px
// 額外空間 → length=4→4 / length=5→2+3 saw bug 物理根因。
// PeoplePicker stack mode pass `'-ml-0.5 first:ml-0 relative inline-flex'` 對齊。
interface OverflowTagListProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  items: { value: string; label: string }[]
  size: 'sm' | 'md' | 'lg'
  wrap: boolean
  renderTag: (item: { value: string; label: string }, index: number) => React.ReactNode
  /**
   * 2026-05-14 I4 fix(per codex M31 verdict + user 抓「display overflow 有 avatar / edit 無」):
   * Optional renderer for hidden items in `+N` overflow popover。Default fallback = `<Tag>{label}</Tag>`
   * (純文字 chip,backward-compat)。Consumer pass 此 prop 讓 hidden items 顯示同 avatar 視覺
   * (對齊 display MultiPersonDisplay overflow popover Tag avatar SSOT)。
   */
  renderHiddenTag?: (item: { value: string; label: string }) => React.ReactNode
  onRemove?: (value: string) => void
  trailing?: React.ReactNode
  /** Tag area gap in px(default 4)。Stack mode 傳 0 讓 negative margin 生效 */
  gap?: number
  /**
   * Optional class merged into each tag's outer measurement wrapper `<div className="shrink-0">`.
   * (2026-05-07 v15.13)為 PeoplePicker stack mode 提供 hook point — 讓 stack avatar 走
   * `-ml-0.5 first:ml-0 relative inline-flex group/avatar` 達成 overlap + dismiss group selector,
   * 同時保留 `useOverflowCount` 量測 wrapper(必要,不可移除)。
   *
   * **Caveat(Q2 known tradeoff)**:`-ml-0.5` 負 margin 不改 each wrapper 的 `offsetWidth` →
   * `useOverflowCount` 累加按完整寬計算 → 視覺實際塞得進的 tag 數 > 量測判定能塞的數 →
   * **+N indicator 偏保守**(視覺還有空間但已顯 `+N`)。當前 v1 接受此 tradeoff;若窄 trigger
   * + 多人場景明顯不對,future 可加 `overlapPx` prop 讓量測補償。
   */
  tagWrapperClassName?: string
  /** 2026-05-16 fix:overflow chip 圓形 wrapper 套此 class(stack 模式套 `-ml-0.5` overlap),
   *  讓 chip 跟 avatar 同 step 物理 — 避免「chip 多 24px 額外空間」造成 saw transition。*/
  overflowWrapperClassName?: string
  /**
   * Overflow indicator(+N)形狀(2026-05-12 Round 7 fix,user 抓 PeoplePicker stack +N 該圓形):
   * - `'tag'`(default,backward-compat)— 矩形 chip(對齊 Combobox 文字 tag)
   * - `'circle'`(opt-in for avatar stack consumers)— 圓形 avatar-shape +N(對齊 GitHub picker idiom)
   * PeoplePicker stack mode pass `'circle'`,Combobox 文字 tag 自走 `'tag'`。
   */
  overflowShape?: ComboboxOverflowShape
  /**
   * 2026-05-15 Bug 3 fix:override visible count via formula-based primitive(PeoplePicker stack
   * 用 `avatar-stack-overflow` primitive deterministic formula 計算 visible,bypass DOM offsetWidth
   * measurement)。對齊 user SSOT「同 cell width 同 overflow 判斷」。
   */
  visibleCountOverride?: number
}

function OverflowTagList({ containerRef, items, size, wrap, renderTag, renderHiddenTag, onRemove, trailing, tagWrapperClassName, overflowWrapperClassName, gap = GAP, overflowShape = 'tag', visibleCountOverride }: OverflowTagListProps) {
  const tagEls = React.useRef<(HTMLDivElement | null)[]>([])
  const overflowEl = React.useRef<HTMLDivElement>(null)
  const { visibleCount, ready } = useOverflowCount(containerRef, tagEls, overflowEl, items.length, !wrap, gap, visibleCountOverride)
  tagEls.current.length = items.length

  if (wrap) return <>{items.map((item, i) => renderTag(item, i))}{trailing}</>

  const overflow = items.length - visibleCount
  const hiddenItems = items.slice(visibleCount)

  // 2026-05-18 A' fix(per Codex Round 3 共識,user 拍板「執行」)— 撤掉舊的 `style={{ opacity: ready ? 1 : 0 }}`
  // gate(掛在 `<span className="contents">` 上,但 CSS Display 3 spec 規定 `display:contents` 元素不產生 box,
  // parent opacity 對 children 無效 → gate 從沒生效是 dead code)。Flicker 已改 sync calc in useLayoutEffect 解
  // (L153 `calc()` 直跑,paint 前 hidden 設好)。`ready` state 保留供未來 instrumentation / debug,不再當 visual gate。
  // 保留 `<span className="contents">` 維持 fragment-like rendering(parent JSX 期望 single child)。
  void ready  // intentional: ready 留供 future debug,目前無 consumer
  return (
    <span className="contents">
      {items.map((item, i) => (
        // 2026-05-14 I5 fix(per codex M31 verdict + user 抓「avatar stack 堆疊方向不一致」):
        // 加 z-index per-index — 前 item z 高(對齊 MultiPersonDisplay zIndex: visible.length - i
        // canonical + MUI AvatarGroup surplus pattern)。display + edit stack 堆疊方向統一。
        <div key={item.value} ref={el => { tagEls.current[i] = el }} className={cn('shrink-0 max-w-full', tagWrapperClassName)} style={{ zIndex: items.length - i }}>{renderTag(item, i)}</div>
      ))}
      <div ref={overflowEl} className={cn('shrink-0', overflowWrapperClassName)}>
        <OverflowIndicator count={overflow} shape={overflowShape} size={size}>
          {hiddenItems.map(item => (
            renderHiddenTag
              ? <React.Fragment key={item.value}>{renderHiddenTag(item)}</React.Fragment>
              : <Tag key={item.value} size="sm" onRemove={onRemove ? () => onRemove(item.value) : undefined}>
                  {item.label}
                </Tag>
          ))}
        </OverflowIndicator>
      </div>
      {trailing}
    </span>
  )
}

// ── Internal tag-stack renderer (consumed by ReadonlyMultiSelect / mode='display') ───
//
// Phase B2(2026-05-05):原 ComboboxDisplay sub-component 已 retire,改 inline `<Combobox mode="display">`。
// 本 helper 只負責 tag-stack 內容渲染(OverflowTagList 消費),不包 Field wrapper。
function ComboboxTagStack({
  value, options, tagSize = 'md', wrap = false, containerRef: externalRef, disabled = false,
}: {
  value?: string[] | null; options?: ComboboxOption[]; tagSize?: 'sm' | 'md' | 'lg'
  wrap?: boolean; containerRef?: React.RefObject<HTMLDivElement | null>; disabled?: boolean
}) {
  const ownRef = React.useRef<HTMLDivElement>(null)
  if (!value || value.length === 0) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
  const items = value.map(v => ({ value: v, label: options?.find(o => o.value === v)?.label ?? v }))
  const disabledClass = disabled ? 'bg-disabled text-fg-disabled' : undefined

  const content = (
    <OverflowTagList containerRef={externalRef ?? ownRef} items={items} size={tagSize} wrap={wrap}
      // 2026-05-18 7B' fix(per user 拍板「執行」+ Codex Round 3 共識)— 移除 `unbounded`,Tag 回預設
      // `max-w-40` cap(160px)+ 內建 `[data-tag-text] truncate min-w-0` 自帶 ellipsis。原 unbounded 是
      // 「cell-as-input narrow cell < 160px」設計(`tag.tsx:85-90`),但 generic Combobox tag display
      // 應走 Tag canonical cap-with-ellipsis(per `data-table.spec.md:235`「Tag 文字內部 truncate;
      // multiSelect 動態 +N」+ `data-table.spec.md:467`「Tag 不可被外層 overflow-hidden 裁掉邊框」)。
      // Trade-off:長 tag 觸發 +N 提前(160 + gap + overflowW > available 較 quick)— acceptable per user。
      // Round 2 dynamic slot maxWidth 提案經 user + codex 共識撤回(3 chicken-and-egg fatal,KISS 勝)。
      renderTag={(item) => <Tag size={tagSize} className={cn('shrink-0', disabledClass)}>{item.label}</Tag>} />
  )

  if (externalRef) return content
  // 2026-05-05 v9 fix(Bug 4):display path 內 wrapper 必須 `flex-1 min-w-0`,否則在 cell flex
  // parent 下不認領完整可用寬度 → OverflowTagList 量得寬度小於 edit path → 顯 `+N` 多於 edit。
  // edit path tagAreaRef wrapper 已是 `flex-1 min-w-0`(NativeCombobox/CustomCombobox line 258 / 354),
  // display 必對稱才 SSOT。
  // 2026-05-15 F1 Q3 fix(per user round 3 verbatim「單人選取時 Tag 越界蓋 indicator」):
  // `overflow-visible` → `overflow-hidden` 讓 narrow cell width 強制 clip(Tag 內建 truncate
  // 處理 text ellipsis,stack `-ml-0.5` 負 margin 在 wrapper 內不受影響)。對齊
  // `data-table.spec.md:233`「禁硬裁無 ellipsis」+ MUI X / Ant Table column.ellipsis 共識。
  // (2026-05-14 nakedCellRowModeAlign 同保留 — autoRowHeight cell first-line align canonical。)
  return (
    <div ref={ownRef} className={cn('flex-1 min-w-0 flex items-center', nakedCellRowModeAlign, wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: GAP }}>
      {content}
    </div>
  )
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComboboxProps {
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: ComboboxOption[]
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  wrap?: boolean
  clearable?: boolean
  /** 啟用搜尋 */
  searchable?: boolean
  /** Loading state(2026-05-15 audit B fix per user verbatim「dropdown 隨時可開,讀取在 panel 中間 CircularProgress」)。
   *  Forward 給 SelectMenu primitive SSOT;dropdown 開啟時取代 options 顯 CircularProgress + loadingText。
   *  Trigger 不變(user 隨時可開)。對齊 MUI Autocomplete `loadingText` + Field SSOT + Empty 元件 compose。*/
  loading?: boolean
  /** 搜尋框位置：menu（浮層內，預設）或 trigger（inline input） */
  searchIn?: 'menu' | 'trigger'
  /** 搜尋框 placeholder（未有選項時顯示)。Default: 「搜尋…」 */
  searchPlaceholder?: string
  /** 搜尋框 ARIA label。Default: 「搜尋選項」 */
  searchAriaLabel?: string
  /** Empty-selection placeholder text。Default: 「選擇…」 */
  emptyPlaceholder?: string
  /** a11y:無 Field wrapper 時提供 role='combobox' 的 accessible name(axe aria-input-field-name) */
  'aria-label'?: string
  /** Initial open state(uncontrolled)— 對齊 Select.defaultOpen / Radix Popover canonical。
   *  DataTable cell-as-input 1-step open 用 */
  defaultOpen?: boolean
  /** open state 變更 callback。DataTable cell-as-input 用:open=false → cell exit edit */
  onOpenChange?: (open: boolean) => void
  /**
   * Selected tag pill 客製 render(2026-05-07 v15.5)。
   *
   * 設了 → 每個 selected tag pill 走 consumer 提供的 ReactNode(收 item={value, label}
   * + onRemove,consumer 自己組 onRemove);沒設 → 走預設 `<Tag>` text-only pill。
   *
   * 用例:PeoplePicker(multi)用此 slot 把 selected tag 換成 avatar + name pill,而非
   * 純文字 Tag。對齊 PeoplePicker = Combobox wrapper SSOT。
   */
  tagRenderer?: (item: { value: string; label: string }, onRemove: () => void) => React.ReactNode
  /**
   * 2026-05-14 I4 fix:Optional renderer for hidden items in `+N` overflow popover
   * (對齊 display MultiPersonDisplay overflow popover 含 avatar SSOT)。PeoplePicker stack
   * pass 此 prop 讓 hidden items 顯 avatar + name(同 display path)。Default fallback
   * `<Tag>{label}</Tag>` 純文字 backward-compat。
   */
  renderHiddenTag?: (item: { value: string; label: string }) => React.ReactNode
  /**
   * @internal PeoplePicker stack wrapper 內部協議 — end-user 勿用(measurement-layer hook)。
   *
   * Optional class merged into each tag's outer measurement wrapper (2026-05-07 v15.13)。
   * Stack avatar 模式用此 hook point 達成 sibling-level overlap (`-ml-0.5`) + group selector
   * (`group/avatar`)— 既保留 Combobox 必要 measurement wrapper,又讓 dismiss/overlap 視覺生效。
   */
  tagWrapperClassName?: string
  /** @internal PeoplePicker stack wrapper 內部協議 — end-user 勿用(measurement-layer hook)。
   *  2026-05-16:overflow chip wrapper 套此 class(對齊 tagWrapperClassName)。Stack 模式
   *  pass `-ml-0.5 first:ml-0` 讓 chip 跟 avatar 同 overlap step,物理上 chip = 1 個 slot 不
   *  外加 24px。Default undefined = chip 不 overlap(text-tag mode 等)。*/
  overflowWrapperClassName?: string
  /**
   * Tag area gap in px (2026-05-07 v15.13)。預設 4(pill mode 標準 spacing)。
   * Stack avatar 模式傳 0,讓 `tagWrapperClassName` 的 `-ml-0.5` negative margin 生效
   * (CSS `gap` 套在 flex container 上會強制 sibling spacing,蓋過 negative margin)。
   * **Q2 known tradeoff**:0 後 useOverflowCount 仍按 wrapper.offsetWidth 累加(不含 overlap
   * 補償)→ +N 偏保守。當前接受;若需精準可 future 加 `overlapPx` 補償邏輯。
   *
   * @internal PeoplePicker stack wrapper 內部協議 — end-user 勿用(measurement-layer hook)。
   */
  tagAreaGapPx?: number
  /**
   * tagAreaRef container 左 paddingLeft(px,2026-05-12 加,for PeoplePicker Avatar inset)。
   * Default undefined = no extra padding(Field wrapper `tagPadding[size]` calc 公式自然 inset)。
   * 設值時 tagAreaRef 增 `style.paddingLeft`,**useOverflowCount 的 `available = clientWidth -
   * paddingLeft - paddingRight` 自動 include**(`parseFloat(cs.paddingLeft)` 從 container CSS 抓)
   * → width calc 不漂移,無 side-effect。
   *
   * @internal PeoplePicker stack wrapper 內部協議 — 目前無 active consumer(PeoplePicker 傳 undefined),保留供未來精準 padding;新 consumer 請先評估。
   *
   * **2026-05-13 v2 deprecate path**:原 PeoplePicker pass `{8}` 假設「Combobox tagPadding=4px,4+8=12」
   * 但 `tagPadding[size]` 是 density-dependent calc `(field-height - icon-size) / 2`,只在 md size +
   * default density 才 = 4px;其他 size/density 漂 6/8px → 4+8=12 公式破。改 PeoplePicker 直接 inject
   * `!px-3` className 到 Combobox Field wrapper(per people-picker.spec.md:94 v2),`tagAreaPaddingLeftPx`
   * 走 undefined。Future 仍保留此 prop 給其他 consumer 精準調整 padding,但 PeoplePicker 已不再用。
   */
  tagAreaPaddingLeftPx?: number
  /**
   * Overflow indicator (+N) 形狀(2026-05-12 Round 7,opt-in 給 avatar stack consumer):
   * - `'tag'`(default)— 矩形 chip(Combobox 文字 tag default)
   * - `'circle'`(opt-in)— 圓形 avatar-shape(PeoplePicker stack 用)
   */
  overflowShape?: ComboboxOverflowShape
  /**
   * @internal PeoplePicker stack wrapper 內部協議 — end-user 勿用(measurement-layer override)。
   *
   * 2026-05-15 Bug 3 fix:override visible count via formula-based primitive(opt-in;default 走
   * DOM-based `useOverflowCount`)。PeoplePicker stack mode 用 `avatar-stack-overflow` primitive
   * deterministic formula 計算 visible count,forward 給 Combobox bypass DOM offsetWidth
   * measurement,避免 dual-algorithm drift。對齊 user SSOT「同 cell width 同 overflow 判斷」。
   */
  visibleCountOverride?: number
  /**
   * Display 是否渲 ChevronDown + Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell display↔edit 像素級對齊用。預設 false(裸 tag stack,backward compat)。
   * 設 true 時 display 走 fieldWrapperStyles(naked variant)+ ItemSuffix ChevronDown,
   * 與 edit 同 DOM 結構,消除 Layer-B padding mismatch。
   */
  showDisplayEndIcon?: boolean
}

// 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反)
const getIconSize = (size: string) => ICON_SIZE[size as 'sm' | 'md' | 'lg']

// ── Shared readonly/disabled/display render ─────────────────────────────────

function ReadonlyMultiSelect({
  mode, variant: variantProp, size, options, value, wrap, className, showDisplayEndIcon = false,
}: Pick<ComboboxProps, 'mode' | 'variant' | 'size' | 'options' | 'value' | 'wrap' | 'className' | 'showDisplayEndIcon'>) {
  const resolvedMode = mode ?? 'readonly'
  const variant = variantProp ?? 'default'
  const sz = size ?? 'md'
  const iconSize = sz === 'lg' ? 20 : 16
  const containerRef = React.useRef<HTMLDivElement>(null)
  const hasTags = (value?.length ?? 0) > 0

  // mode='display'(Phase B2 2026-05-05):純內容輸出 — tag stack 不包 Field wrapper / 不 reserve 高度。
  //   對齊原 ComboboxDisplay sub-component(retired)。
  //   Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper + ItemSuffix ChevronDown,
  //   與 edit 同結構消除 cell display↔edit 像素偏移(Layer-B padding mismatch)。
  if (resolvedMode === 'display') {
    if (!showDisplayEndIcon) {
      // 2026-05-14 I2 fix(spec contract (e) display typography canonical):empty bare span 套
      // `fieldDisplayTextClass(sz)`(sm/md→text-body,lg→text-body-lg)— 對齊跨 Field family 統一。
      if (!hasTags) return <span className={cn(fieldDisplayTextClass(sz), 'text-fg-muted', className)}>{EMPTY_DISPLAY}</span>
      return (
        <ComboboxTagStack value={value} options={options} tagSize={sz} wrap={wrap} />
      )
    }
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: 'display', variant, size: sz }), hasTags && tagPadding[sz], className)}
        data-field-mode="display"
      >
        {hasTags ? (
          <ComboboxTagStack value={value} options={options} tagSize={sz} wrap={wrap} />
        ) : (
          <span className={cn('flex-1 min-w-0', 'text-fg-muted')}>{EMPTY_DISPLAY}</span>
        )}
        <ItemSuffix className="pointer-events-none">
          <ChevronDown size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
        </ItemSuffix>
      </div>
    )
  }

  return (
    <div ref={containerRef}
      className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, size: sz }), hasTags && tagPadding[sz],
        // 2026-05-18 #6A Round 1 Step 1/4(per user 拍板「決策6選a」+ codex M31 Step 5 verdict cite combobox.tsx:451):
        // readonly/disabled path 對齊 L293 display wrapper 已 ship 的 overflow-hidden fix。
        // M10 propagation:原 overflow-visible 讓 readonly tag 越界蓋 indicator,跟 display 不對稱。
        wrap ? 'flex-wrap py-1' : 'overflow-hidden', className)}
      style={{ gap: GAP, ...(wrap ? { height: 'auto' } : undefined) }} data-field-mode={resolvedMode}
      aria-disabled={resolvedMode === 'disabled' ? true : undefined}>
      {hasTags ? (
        <ComboboxTagStack value={value} options={options} tagSize={sz} wrap={wrap}
          containerRef={containerRef} disabled={resolvedMode === 'disabled'} />
      ) : (
        <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
      )}
      {/* 2026-06-10 類型身份 indicator 規則:readonly/disabled 保留 chevron(naked cell 依 showDisplayEndIcon);disabled → fg-disabled */}
      {(variant === 'naked' ? !!showDisplayEndIcon : true) && (
        <ItemSuffix className="pointer-events-none">
          <ChevronDown size={iconSize} className={cn('shrink-0', resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted')} aria-hidden />
        </ItemSuffix>
      )}
    </div>
  )
}

// ── Native Combobox (mobile) ────────────────────────────────────────

// 2026-05-16 Bug A root cause fix(Claude+Codex M31 Step 5 比稿 consensus,user verbatim
// 「圖二/圖三 同 180px 不同 length 不同 visible — 跟 user 一開始抓的問題一模一樣」):
// 公開 `Combobox.forwardRef` 之前用 `(props, _ref)` 把 ref drop,內部 `NativeCombobox` /
// `CustomCombobox` 從未拿 ref → PeoplePicker `stackContainerRef.current` 永遠 null →
// `useLayoutEffect` early return → `visibleCountOverride` 永遠 undefined →
// Combobox 走原 internal `useOverflowCount` 60px chip fallback bug → drift。
// Fix:internal `__triggerRef` prop(underscore = internal-only)attach root div;
// 公開 `Combobox.forwardRef` 把 `ref` forward 為 `__triggerRef`。對齊 codex DS-wide iceberg
// audit:`SelectMenu` / `DateGrid` / `Toast` 的 `_ref` 是 intentional documented(no DOM
// target);唯本處 actionable drop。
type ComboboxInternalProps = ComboboxProps & { __triggerRef?: React.Ref<HTMLDivElement> }

function NativeCombobox({
  mode, variant: variantProp, error = false, size = 'md', options, value = [], onChange, placeholder,
  className, disabled: disabledProp, wrap = false, clearable = false, showDisplayEndIcon = false,
  __triggerRef,
}: ComboboxInternalProps) {
  const disabled = useResolvedFieldDisabled(disabledProp)
  const variant: FieldVariant = useResolvedFieldVariant(variantProp)
  // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="display"> 漏 cascade
  const resolvedMode = useResolvedFieldMode({ mode, disabled })
  const iconSize = getIconSize(size)
  const showClear = clearable && value.length > 0 && resolvedMode === 'edit'

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))
  const handleAdd = (v: string) => { if (!value.includes(v)) onChange?.([...value, v]) }

  if (resolvedMode !== 'edit') {
    return <ReadonlyMultiSelect mode={resolvedMode} variant={variant} size={size} options={options} value={value} wrap={wrap} className={className} showDisplayEndIcon={showDisplayEndIcon} />
  }

  const items = value.map(v => ({ value: v, label: options.find(o => o.value === v)?.label ?? v }))
  const unselected = options.filter(o => !value.includes(o.value))
  const selectRef = React.useRef<HTMLSelectElement>(null)
  const tagAreaRef = React.useRef<HTMLDivElement>(null)
  const tagHeight = size === 'sm' ? 20 : 24

  const selectDropdown = unselected.length > 0 ? (
    <select ref={selectRef} value="" onChange={(e) => handleAdd(e.target.value)}
      className={cn('bg-transparent outline-none border-none p-0 text-[inherit] font-[inherit] leading-[inherit] text-fg-muted cursor-pointer appearance-none',
        value.length > 0 ? 'absolute inset-0 w-full h-full opacity-0 z-0 cursor-pointer' : 'relative z-10 flex-1 min-w-20')}>
      <option value="" disabled>{placeholder ?? '選擇...'}</option>
      {unselected.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  ) : null

  return (
    <div ref={__triggerRef} className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, size }), value.length > 0 && tagPadding[size], 'relative',
      wrap && 'items-start py-1', error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
      style={{ paddingRight: '0.75rem', ...(wrap ? { height: 'auto' } : undefined) }} data-field-mode="edit" data-error={error ? '' : undefined}
      onClick={(e) => { if (e.target === e.currentTarget) { selectRef.current?.showPicker?.(); selectRef.current?.focus() } }}>
      {/* 2026-05-18 F2 sync(per user verbatim「modifying 修好 PeoplePicker stack 後改壞 Combobox tag display」
          + 「tag 應該要判斷所在空間最多可以呈現幾個tag(包括＋n)去自動判斷何時要變成+n」):
          edit path tagArea 對齊 display path L293 已 ship 的 `overflow-hidden` fix。原 `overflow-visible`
          讓 tag 視覺越界蓋 chevron / +N indicator(useOverflowCount measurement 對但 CSS overflow 仍露)。
          M10 violation root cause:2026-05-15 F1 Q3 只 fix display path,edit + Native(L518)沒同步。 */}
      <div ref={tagAreaRef} className={cn('flex-1 min-w-0 flex items-center relative', nakedCellRowModeAlign, wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: GAP }}
        onClick={(e) => { if (e.target === e.currentTarget) { selectRef.current?.showPicker?.(); selectRef.current?.focus() } }}>
        <OverflowTagList containerRef={tagAreaRef} items={items} size={size} wrap={wrap}
          renderTag={(item) => (
            <Tag size={size} className="shrink-0 relative z-10" onClick={() => { selectRef.current?.showPicker?.(); selectRef.current?.focus() }}
              onRemove={() => handleRemove(item.value)}>{item.label}</Tag>
          )} onRemove={handleRemove} trailing={value.length === 0 ? selectDropdown : undefined} />
      </div>
      {value.length > 0 && selectDropdown}
      <ItemSuffix className={cn('relative z-10 pointer-events-none', wrap && 'self-start')}
        style={wrap ? { height: tagHeight } : undefined}>
        {showClear && (
          <span className="pointer-events-auto">
            <ItemInlineAction
              size={size ?? 'md'}
              action={{ icon: X, label: '清除全部', onClick: () => onChange?.([]) }} // i18n-allow: DS default inline-action label
            />
          </span>
        )}
        <ChevronDown size={iconSize} className="shrink-0 text-fg-muted pointer-events-none" aria-hidden />
      </ItemSuffix>
    </div>
  )
}

// ── Custom Combobox (desktop — consumes SelectMenu) ───────────────────

function CustomCombobox({
  mode, variant: variantProp, error: errorProp = false, size = 'md', options, value = [], onChange, placeholder,
  className, disabled: disabledProp, wrap = false, clearable = false, searchable = false, loading, searchIn = 'menu',
  searchPlaceholder = '搜尋…', // i18n-allow: DS default
  searchAriaLabel = '搜尋選項', // i18n-allow: DS default
  emptyPlaceholder = '選擇…', // i18n-allow: DS default
  defaultOpen = false,
  onOpenChange,
  __triggerRef,
  tagRenderer,
  renderHiddenTag,
  tagWrapperClassName,
  overflowWrapperClassName,
  tagAreaGapPx,
  visibleCountOverride,
  tagAreaPaddingLeftPx,
  overflowShape,
  showDisplayEndIcon = false,
  'aria-label': ariaLabel,
}: ComboboxInternalProps) {
  const tagAreaGap = tagAreaGapPx ?? GAP
  const fieldCtx = useFieldContext()
  const error = useResolvedFieldInvalid(errorProp)
  const disabled = useResolvedFieldDisabled(disabledProp)
  // 2026-06-08 SSOT:mode 經 useResolvedFieldMode;修 <Field mode="display"> 漏 cascade
  const resolvedMode = useResolvedFieldMode({ mode, disabled })
  const variant: FieldVariant = useResolvedFieldVariant(variantProp)
  const iconSize = getIconSize(size)
  const showClear = clearable && value.length > 0 && resolvedMode === 'edit'
  const [open, setOpen] = React.useState(defaultOpen)
  const [search, setSearch] = React.useState('')
  // 2026-05-12 Q3 fix:trigger 內 inline 搜尋 input ref,onOpenAutoFocus 時 explicit focus
  // 讓 user 看到 cursor 知道可 inline search(跟 Select inputRef SSOT 同模式)。
  const inputRef = React.useRef<HTMLInputElement>(null)
  // a11y: 為 listbox 容器(SelectMenu 內 PopoverContent)建立穩定 id,讓 trigger 的
  // aria-controls 能指向它(WAI-ARIA combobox pattern 要求)。React.useId 在 SSR/CSR 都穩定。
  const listboxId = React.useId()

  React.useEffect(() => { if (!open) setSearch('') }, [open])

  if (resolvedMode !== 'edit') {
    return <ReadonlyMultiSelect mode={resolvedMode} variant={variant} size={size} options={options} value={value} wrap={wrap} className={className} showDisplayEndIcon={showDisplayEndIcon} />
  }

  const items = React.useMemo(
    () => value.map(v => ({ value: v, label: options.find(o => o.value === v)?.label ?? v })),
    [value, options]
  )
  const tagAreaRef = React.useRef<HTMLDivElement>(null)
  const tagHeight = size === 'sm' ? 20 : 24

  const handleRemove = (v: string) => onChange?.(value.filter(x => x !== v))

  // searchIn='trigger' 時由 trigger input 過濾，不走 SelectMenu 內建搜尋
  const filteredOptions = React.useMemo(
    () => (searchable && searchIn === 'trigger' && search
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options),
    [searchable, searchIn, search, options]
  )

  // 轉換 ComboboxOption → SelectMenuOption
  // 2026-05-10 post-Issue-4 follow-up:forward 全 SelectMenuOption surface(avatar / description /
  // disabled / icon / group)— 修先前 PeoplePicker multi-mode dropdown 漏 avatar drift bug。
  const menuOptions: SelectMenuOption[] = React.useMemo(
    () => filteredOptions.map(opt => ({
      value: opt.value,
      label: opt.label,
      icon: opt.icon,
      avatar: opt.avatar,
      description: opt.description,
      disabled: opt.disabled,
      group: opt.group,
    })),
    [filteredOptions]
  )

  const chevronEl = <ChevronDown size={iconSize} className={cn('shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />

  const trigger = (
    <div
      ref={__triggerRef}
      id={fieldCtx?.id}
      role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={listboxId} tabIndex={0}
      aria-label={ariaLabel}
      aria-invalid={error || undefined}
      aria-required={fieldCtx?.required || undefined}
      aria-describedby={fieldCtx?.descriptionId}
      aria-errormessage={error ? fieldCtx?.errorId : undefined}
      className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, size }), value.length > 0 && tagPadding[size], 'relative cursor-pointer',
        wrap && 'items-start py-1',
        // 2026-05-06 v13.3 SSOT retire:per-control `open && 'border-primary'` 移除。Field default
        // 統一處理 — open=灰深(data-state)/ focus=藍(focus-within !important)。改一處全 control 跟動。
        error && ['border-error hover:border-error-hover', 'focus-within:border-error focus-within:hover:border-error'], className)}
      style={{ paddingRight: '0.75rem', ...(wrap ? { height: 'auto' } : undefined) }}
      data-field-mode="edit" data-error={error ? '' : undefined}
      // WAI-ARIA APG combobox 鍵盤開啟語意 — 對齊 sibling Select(select.tsx:593-598)。
      // <div role=combobox> 不像 native <button> 自動 synthesize Enter/Space click,故顯式補:
      //   Enter/Space → 開(searchable 時不攔,讓 inline search input 自行處理打字);
      //   Escape → 關;ArrowDown → 開(APG required combobox 展開鍵,僅在 closed 時攔,
      //   open 後不 preventDefault 讓方向鍵自由流向選單導覽)。
      // 純 additive:此 trigger 原無 onKeyDown,不覆寫既有 handler;open 邏輯仍走 setOpen SSOT。
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // 2026-06-11 P0 a11y(R2,同 select.tsx 修):Combobox 恆 searchable → 原 `!searchable`
          // guard 使 Enter/Space 永遠開不了(僅 ArrowDown 可)。正確 guard = !open。
          if (!open) { e.preventDefault(); setOpen(true) }
        }
        if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) }
        if (e.key === 'Escape') setOpen(false)
      }}>
      {/* 2026-05-18 #6A Round 1 Step 2/4(per user 拍板「決策6選a」+ codex M31 Step 5 verdict cite combobox.tsx:648):
          CustomCombobox edit non-wrap tagArea 對齊 L293 display + L451 readonly + L518 native edit 已 ship 的 overflow-hidden fix。
          原 overflow-visible 讓 tag 越界蓋 chevron / +N indicator(user 圖三)。M10 propagation 完整 4-path align。 */}
      <div ref={tagAreaRef} className={cn('flex-1 min-w-0 flex items-center relative', nakedCellRowModeAlign, wrap ? 'flex-wrap' : 'overflow-hidden')} style={{ gap: tagAreaGap, paddingLeft: tagAreaPaddingLeftPx }}>
        {value.length > 0 ? (
          <OverflowTagList containerRef={tagAreaRef} items={items} size={size} wrap={wrap}
            tagWrapperClassName={tagWrapperClassName}
            overflowWrapperClassName={overflowWrapperClassName}
            gap={tagAreaGap}
            overflowShape={overflowShape}
            visibleCountOverride={visibleCountOverride}
            renderTag={(item) => (
              tagRenderer
                ? tagRenderer(item, () => handleRemove(item.value))
                : <Tag size={size} className="shrink-0 relative z-10"
                    onRemove={() => handleRemove(item.value)}>{item.label}</Tag>
            )}
            renderHiddenTag={renderHiddenTag}
            onRemove={handleRemove}
            trailing={searchable && searchIn === 'trigger' ? (
              <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)}
                // 2026-05-15 Drift A fix(per user verbatim SSOT clarification「未選 → placeholder 顯示請選擇之類」):
                // items.length === 0(empty selection)→ 用 `placeholder` trigger empty prop(「請選擇…」),
                // **不**用 `searchPlaceholder`(「搜尋…」);後者僅在 panel-top search input 場景才合理。
                // items.length > 0(已選)→ no placeholder,純 cursor(對齊 Combobox empty cursor SSOT)。
                // SSOT 對齊 select.tsx:185 `placeholder={selectedLabel || placeholder || '搜尋…'}`
                // empty-state fallback to trigger placeholder canonical。
                placeholder={items.length === 0 ? placeholder : ''} onClick={(e) => { e.stopPropagation(); setOpen(true) }}
                aria-label={searchAriaLabel}
                className="flex-1 min-w-[60px] bg-transparent outline-none text-body leading-compact relative z-10" />
            ) : undefined} />
        ) : (
          /* 2026-05-12 Stream C Issue 3 fix(codex Q3 Cluster C):placeholder span 必 flex-1 min-w-0
             truncate,narrow container 時單行省略(對齊 Combobox text-tag truncate canonical)。
             原 hardcode wraps in narrow trigger → user 抓「placeholder 文字 wrap multi-line」。 */
          <span className="flex-1 min-w-0 truncate text-fg-muted">{placeholder ?? emptyPlaceholder}</span>
        )}
      </div>
      <ItemSuffix className={cn('relative z-10 pointer-events-none', wrap && 'self-start')}
        style={wrap ? { height: tagHeight } : undefined}>
        {showClear && (
          <span className="pointer-events-auto">
            <ItemInlineAction
              size={size ?? 'md'}
              action={{
                icon: X,
                label: '清除全部', // i18n-allow: DS default inline-action label
                onClick: (e) => { e?.stopPropagation(); onChange?.([]) },
              }}
            />
          </span>
        )}
        {chevronEl}
      </ItemSuffix>
    </div>
  )

  return (
    <SelectMenu
      loading={loading}
      options={menuOptions}
      value={value}
      onValueChange={onChange as (value: string | string[]) => void}
      multiple
      searchable={searchable && searchIn === 'menu'}
      searchPlaceholder={searchPlaceholder}
      size={size}
      open={open}
      onOpenChange={(o) => { setOpen(o); onOpenChange?.(o) }}
      // 2026-05-12 Q3 fix(user 抓「inline-searchable 開浮層應出現 cursor」)— 跟 Select line 550
      // 同 SSOT pattern:preventDefault Radix default focus + 顯式 focus inline input → 開時
      // cursor 直接 visible,user 知道可 inline search。
      onOpenAutoFocus={searchIn === 'trigger' ? (e) => { e.preventDefault(); inputRef.current?.focus() } : undefined}
      contentId={listboxId}
    >
      {trigger}
    </SelectMenu>
  )
}

// ── Public component ────────────────────────────────────────────────────────

const Combobox = React.forwardRef<HTMLDivElement, ComboboxProps>(
  ({ size: sizeProp, ...props }, ref) => {
    // B 組 cascade fix:public wrapper 一處 resolve size(prop>Field>surface>md)後 forward 給內層,
    // 讓 <Field size> / DataTable cell surface-size 對 Combobox 生效(內層默認 'md' 被此顯式 size 覆蓋)。
    const size = useResolvedFieldSize(sizeProp)
    // 2026-05-16 真 root cause fix:之前用 `_ref` drop ref。修為 forward 給 internal
    // `__triggerRef`,讓 PeoplePicker stack 透過 ref 量 trigger DOM(visibleCountOverride
    // 才生效)。對齊 React forwardRef public-API canonical(MUI Autocomplete / Radix
    // Popover.Trigger 共識)+ codex M31 Step 5 比稿 verdict + DS-wide ref-drop iceberg audit。
    const isMobile = useIsTouchDevice()
    if (isMobile) return <NativeCombobox {...props} size={size} __triggerRef={ref} />
    return <CustomCombobox {...props} size={size} __triggerRef={ref} />
  }
)
Combobox.displayName = 'Combobox'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const comboboxMeta = {
  component: 'Combobox',
  family: 4,
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-disabled', 'bg-transparent'],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { Combobox }
