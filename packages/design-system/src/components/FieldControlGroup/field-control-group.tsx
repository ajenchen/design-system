// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// ── 消費的 SSOT ──
// - patterns/element-anatomy/element-anatomy.spec.md(Field 家族邊界)
// - components/Field/field-wrapper.tsx(field-height token via h-field-{sm,md,lg})
// - components/Field/field-context.ts(useFieldContext / size cascade)
// - tokens/uiSize/uiSize.spec.md(--field-height-{sm,md,lg})
// - 世界級對照:Ant Space.Compact compact-item.ts(verified github.com/ant-design/ant-design/blob/master/components/style/compact-item.ts)
//   Bootstrap input-group.scss(verified github.com/twbs/bootstrap/blob/v5.3.3/scss/forms/_input-group.scss)
//
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * FieldControlGroup — 多個 Field controls 視覺接合成一個 input frame
 *
 * **Naming rationale**(2026-05-04):
 * - Taxonomic 一致:FieldGroup(多 Field 堆疊)/ FieldControlGroup(多 control 接合)— scope 區分
 * - 命名 idiom 一致:與 ButtonGroup 共享 <X>Group 命名(X = field control);但**機制不同** — ButtonGroup 是 gap 分離群組(flex gap-2),本元件才是 border-collapse 接合(負 margin 重疊 border)
 * - 不撞 RadioGroup/CheckboxGroup(那是 1-question 多 options semantic group)
 *
 * **Behavior canonical**(verified Ant compact-item.ts L21-58):
 * - 子 controls 保留自身 border + radius;不 strip
 * - 鄰接子用負 margin 重疊 border(Bootstrap 也用此手法,並用 z-index 確保 focus 在最上層;本元件 2026-11-13 起同向,見下方 z-index 那一條)
 * - first child 只留左 radii / last child 只留右 radii / middle 全 0 radii
 * - z-index:default 2 / hover 3(到這裡與 Ant 同值)/ focus-within|自己的浮層開著(data-field-open)4(比滑過高一層,2026-11-13 起;
 *   Ant 沒有這一層 —— 規則與來源住 field-control-group.spec.md「States」)/ disabled 0
 * - Container `display: inline-flex`(Ant default)/ `block` prop → `display: flex; width: 100%`
 *
 * **Size**(FCG 不擁有 size API；不傳遞 size 給 children,無 Context Provider / 無 cloneElement;見 spec「Size」段):
 * - children 尺寸完全由 child 自己決定;FCG 只負責 border-collapse 接合(border / radius / z-index)
 * - Mode A:整個 FieldControlGroup 包進 Field 當 control slot,children 各自讀外層 `<Field>` 的 context size(是 Field 的 context,不是 FCG 的)
 * - Mode B:standalone 用,逐一給每個 child 設 `size`
 *
 * **Width 配置**(Ant Space.Compact W-A canonical):
 * - 子 controls 自管 width(`className="w-[140px]"` / `style={{width:120}}` / `flex-1` etc.)
 * - FieldControlGroup 不另開 Cell wrapper(避免 indirection,符合 Ant idiom)
 *
 * **使用範例**:
 * ```tsx
 * // Filter row: 2 fixed select + 1 flex value
 * <FieldControlGroup>
 *   <Select className="!w-[140px]" options={fields} />
 *   <Select className="!w-[120px]" options={ops} />
 *   <Input className="flex-1" placeholder="輸入值..." />
 * </FieldControlGroup>
 *
 * // Phone: country code + number
 * <Field>
 *   <FieldLabel>電話</FieldLabel>
 *   <FieldControlGroup>
 *     <Select className="!w-[80px]" options={codes} />
 *     <Input className="flex-1" />
 *   </FieldControlGroup>
 * </Field>
 *
 * // Search + button
 * <FieldControlGroup>
 *   <Input className="flex-1" />
 *   <Button variant="primary">搜尋</Button>
 * </FieldControlGroup>
 * ```
 */

export interface FieldControlGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Block 模式:width 100% 撐滿 parent(對齊 Ant Space.Compact `block` prop) */
  block?: boolean
}

const FieldControlGroup = React.forwardRef<HTMLDivElement, FieldControlGroupProps>(
  ({ block = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        // ── Ant compact-item 機制(verified):
        //   [&>*]:relative — 子套 relative 才能 z-index 生效
        //   [&>*]:z-[2] — default z 2(Ant 同值)
        //   [&>*+*]:-ml-px — 鄰接子 margin-left -1px 重疊 border
        //   滑過 → z 3(Ant 同值)。聚焦 / 自己的浮層開著 → z 4,比滑過高一層 —— 這一層**不是** Ant 的(Ant 把滑過、聚焦、按下放同一層 3);
        //   只把聚焦那一格抬到最高的是 Bootstrap input-group 與 Polaris Connected(連結與規則住 field-control-group.spec.md「States」)
        //   first/middle/last radii:對齊 Ant compactItemBorderRadius L67-92
        // ── Children 自管 width(W-A,Ant idiom);Group 自身僅控制 border/radius/z-index 接合機制
        className={cn(
          block ? 'flex w-full' : 'inline-flex',
          'items-stretch',
          // z-index baseline + active layer
          '[&>*]:relative [&>*]:z-[2]',
          // 2026-09-07 刪 `[&>*:focus]:z-[3]` —— `:focus` 是 `:focus-within` 的子集(元素自己聚焦時
          // 它必然也 focus-within),下面 focus-within 那一條已完全涵蓋,純贅字。
          // 2026-11-12 加「開著」(2026-11-13 改認 `[&>*[data-field-open]]`):成員自己的浮層開著時焦點常在浮層裡(focus-within 不成立),
          // 但它仍維持聚焦的藍框(field.spec.md「Field state machine」表)→ 一樣要浮到鄰居上面,否則藍框被 -ml-px 的鄰居蓋掉一邊。
          // 2026-11-13 聚焦 / 開著由 3 改 4、滑過留在 3(AI 建議、user 2026-11-13 採納;規則、原話與三家對照住 field-control-group.spec.md「States」)。
          // 改前三種同在 3,同層時 DOM 順序較後的在上 → 某一格聚焦 / 開著時滑過它右邊那格,兩格共用的那條線變成右邊那格滑過的灰。
          '[&>*:hover]:z-[3] [&>*:focus-within]:z-[4] [&>*[data-field-open]]:z-[4]',
          // 同一格「聚焦(或開著)又被滑過」:上一行三條的權重相同,誰贏看樣式表裡誰排後面,而 Tailwind 把任意變體照選擇器字母序排
          // (聚焦那條 → 滑過那條 → 開著那條;2026-11-13 拿 repo 裝的 tailwindcss 4.2.2 編這幾個 class 實看)—— 只寫上一行的話,
          // 聚焦又被滑過的那一格會被滑過那條蓋回 3。下面兩條多帶一個條件、權重較高,不看排序。
          '[&>*:focus-within:hover]:z-[4] [&>*[data-field-open]:hover]:z-[4]',
          '[&>*[disabled]]:z-0 [&>*:has([disabled])]:z-0',
          // border overlap
          '[&>*+*]:-ml-px',
          // border radius — 中間 0,首/尾保留外側 radii
          '[&>*:not(:first-child):not(:last-child)]:rounded-none',
          '[&>*:first-child:not(:last-child)]:rounded-r-none',
          '[&>*:last-child:not(:first-child)]:rounded-l-none',
          // K12 fix(2026-05-04 v7 — semantic token):FCG 內 disabled cell border 用 `--border-opaque`:
          //   ✓ 保留 global `bg-disabled`(neutral-2 灰底)— disabled state 視覺主要承載
          //   ✓ 用 SEMANTIC `--border-opaque`(視覺等同 --border 但不跟 bg compositing)
          //   v6 直接消費 primitive `--color-neutral-5-opaque` 違反 token 4 規則「禁 primitive 色名作 utility」,
          //   v7 升 semantic alias `--border-opaque` 在 semantic.css(其 primitive 後盾仍是 neutral-5-opaque)
          //   → 對齊 Ant Design colorBorderSecondary solid idiom(table 外框 / row divider 用 solid,跟 input alpha border 視覺層級分)
          //   → 解決 alpha border 在 grey bg 上 composite 略深 perception(physical 對比問題)
          '[&>*[data-field-mode="disabled"]]:border-[var(--border-opaque)]',
          className,
        )}
        data-field-control-group=""
        {...props}
      >
        {children}
      </div>
    )
  },
)
FieldControlGroup.displayName = 'FieldControlGroup'

// Story auto-compile metadata — Phase 4 migration(2026-05-10 #12 task complete)
// Per scripts/compile-stories.mjs --check。FieldControlGroup is self-contained
// structural wrapper(border-collapse pattern for Field controls)。
// **No own sizes** — 不暴露 size prop(不傳遞給 children,無 Context Provider /
// 無 cloneElement;children 尺寸自管,見上方 docblock「Size」段),
// so sizes:{} matches spec frontmatter (no sizes declared)。
export const fieldControlGroupMeta = {
  component: 'FieldControlGroup',
  family: 'self-contained',
  variants: {},
  sizes: {},  // self-contained wrapper;children 尺寸自管
  states: ['default', 'children-hover', 'children-focus', 'children-open', 'children-disabled'],
  tokens: {
    bg: [],  // structural wrapper has no own bg
    fg: [],
    border: ['var(--border-opaque)'],  // K12 disabled cell border
  },
  defaultVariant: undefined,
  defaultSize: undefined,
} as const

export { FieldControlGroup }
