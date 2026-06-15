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
import type { FieldSize } from '@/design-system/components/Field/field-context'

/**
 * FieldControlGroup — 多個 Field controls 視覺接合成一個 input frame
 *
 * **Naming rationale**(2026-05-04):
 * - Taxonomic 一致:FieldGroup(多 Field 堆疊)/ FieldControlGroup(多 control 接合)— scope 區分
 * - Idiom 一致:ButtonGroup(多 Button 接合)同 pattern,只是 X = field control
 * - 不撞 RadioGroup/CheckboxGroup(那是 1-question 多 options semantic group)
 *
 * **Behavior canonical**(verified Ant compact-item.ts L21-58):
 * - 子 controls 保留自身 border + radius;不 strip
 * - 鄰接子用負 margin 重疊 border(Bootstrap 也用此手法 但用 z-index 確保 focus 在最上層)
 * - first child 只留左 radii / last child 只留右 radii / middle 全 0 radii
 * - z-index:default 2 / hover|focus|focus-within 3 / disabled 0
 * - Container `display: inline-flex`(Ant default)/ `block` prop → `display: flex; width: 100%`
 *
 * **Size**(FCG `size` 為 no-op — 不傳遞 size 給 children,無 Context Provider / 無 cloneElement;見 spec「Size」段):
 * - children 尺寸完全由 child 自己決定;FCG 只負責 border-collapse 接合(border / radius / z-index)
 * - Mode A:整個 FieldControlGroup 包進 Field 當 control slot,children 各自讀外層 `<Field>` 的 context size(是 Field 的 context,不是 FCG 的)
 * - Mode B:standalone 用,逐一給每個 child 設 `size`(設 `<FieldControlGroup size>` 無效)
 *
 * **Width 配置**(Ant Space.Compact W-A canonical):
 * - 子 controls 自管 width(`className="w-[140px]"` / `style={{width:120}}` / `flex-1` etc.)
 * - FieldControlGroup 不另開 Cell wrapper(避免 indirection,符合 Ant idiom)
 *
 * **使用範例**:
 * ```tsx
 * // Filter row: 2 fixed select + 1 flex value
 * <FieldControlGroup>
 *   <Select className="w-[140px]" options={fields} />
 *   <Select className="w-[120px]" options={ops} />
 *   <Input className="flex-1" placeholder="輸入值..." />
 * </FieldControlGroup>
 *
 * // Phone: country code + number
 * <Field>
 *   <FieldLabel>電話</FieldLabel>
 *   <FieldControlGroup>
 *     <Select className="w-[80px]" options={codes} />
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
  /** no-op — FCG 不傳遞 size 給 children;Mode A 由 children 讀外層 Field context、Mode B 逐一給每個 child 設 size(見 spec「Size」段) */
  size?: FieldSize
  /** Block 模式:width 100% 撐滿 parent(對齊 Ant Space.Compact `block` prop) */
  block?: boolean
}

const FieldControlGroup = React.forwardRef<HTMLDivElement, FieldControlGroupProps>(
  ({ size: _size = 'md', block = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        // ── Ant compact-item 機制(verified):
        //   [&>*]:relative — 子套 relative 才能 z-index 生效
        //   [&>*]:z-[2] — default z 2(Ant 同值)
        //   [&>*+*]:-ml-px — 鄰接子 margin-left -1px 重疊 border
        //   hover/focus/focus-within → z-3(active border 在最上層,Bootstrap 用 z-5,Ant 用 z-3 我們對齊 Ant)
        //   first/middle/last radii:對齊 Ant compactItemBorderRadius L67-92
        // ── Children 自管 width(W-A,Ant idiom);Group 自身僅控制 border/radius/z-index 接合機制
        className={cn(
          block ? 'flex w-full' : 'inline-flex',
          'items-stretch',
          // z-index baseline + active layer
          '[&>*]:relative [&>*]:z-[2]',
          '[&>*:hover]:z-[3] [&>*:focus]:z-[3] [&>*:focus-within]:z-[3]',
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
// **No own sizes** — size prop 目前為 no-op(不傳遞給 children,無 Context Provider /
// 無 cloneElement;children 尺寸自管,見上方 docblock「Size」段 + spec「FCG `size` prop 目前為 no-op」),
// so sizes:{} matches spec frontmatter (no sizes declared)。
export const fieldControlGroupMeta = {
  component: 'FieldControlGroup',
  family: 'self-contained',
  variants: {},
  sizes: {},  // self-contained wrapper;size prop no-op(children 尺寸自管)
  states: ['default', 'children-hover', 'children-focus', 'children-disabled'],
  tokens: {
    bg: [],  // structural wrapper has no own bg
    fg: [],
    border: ['var(--border-opaque)'],  // K12 disabled cell border
  },
  defaultVariant: undefined,
  defaultSize: undefined,
} as const

export { FieldControlGroup }
