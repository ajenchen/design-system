---
paths:
  - "**/*.tsx"
  - "**/*.ts"
  - "packages/design-system/src/**"
  - "src/explorations/**"
  - "src/app/**"
---

# UI 開發 + Tailwind + Token + Props 命名規則(path-scoped)

僅在編 `.tsx` / `.ts` 或 DS / explorations / app code 時 load。

## Public component vs Internal primitive canonical(SSOT,2026-05-23 user 永久拍板)

**Public component**(consumer-facing):**end-user app 直接寫 `<X />` 就能 render 出有意義的 UI**,不需要再 wrap / 不需要再 compose 其他 DS 元件。Examples:`<Button>` / `<Avatar>` / `<Dialog>` / `<DataTable>` / `<MenuItem>` / `<ActionBar>` / `<ResizeHandle>`。

**Internal primitive**:**供 DS 內部其他元件 wrap / compose 用**。end-user app 直接 render 無 functioning UI,或必須先 import 多個 DS 元件一起組才有結果。Examples:`<ChromeHeader>`(Sidebar 內部消費)/ `<SurfaceHeader/Body/Footer>`(Dialog 內部)/ `useOverflowItems` hook / `<ItemIcon>` / `<ItemAvatar>`(MenuItem 內部 slot)。

**Mechanical test(verifiable)**:
- 問:end-user app `<X />`(空 children / 無 props / 無 wrapper context)render → 有 functioning visible UI 嗎?
  - YES → **public**
  - NO → **internal**

**Folder + storybook canonical**:
- public:`components/<Name>/` OR `patterns/<name>/`(frontmatter 無 `internal: true`),storybook title `Design System/Components/<Name>/...` OR `Design System/Patterns/<Name>`
- internal:`components/Internal/<Name>/` OR `patterns/<name>/`(frontmatter `internal: true`),storybook title `Design System/Internal/<Name>/...` OR `Design System/Internal Patterns/<Name>`(end-user 設計師 default 過濾掉,DS contributor 看 reference 用)
- export jsDoc 加 `@internal` marker(IDE intellisense 警示 end-user)

**對齊世界級**:Polaris 「Building blocks」(public) vs「layout primitives」(internal)/ Material UI `@mui/material`(public)vs `@mui/utils` `@mui/system`(internal hooks/primitives)/ Atlassian `@atlaskit/<component>`(public)vs internal `<unstyled>` primitives / Carbon turnkey components + internal utilities / Apple HIG「Presented controls」vs「implementation primitives」 共識。

## 建立 UI 前必讀

**先 `ls packages/design-system/src/{components,patterns}/`**。必查 spec:Tokens(`tokens/{color|typography|density|uiSize|layoutSpace|elevation|radius}/*.spec.md`)/ Row + List item(`item-anatomy.spec.md` Family 1+2 SSOT)/ Action bar / Overflow / Overlay(`patterns/{action-bar,horizontal-overflow,overlay-surface}/*.spec.md`)/ Field(`components/Field/*.spec.md`)。

**既有 primitive 優先消費**:命中既有 → 必消費不 hand-craft。**自我檢查**:icon+text 垂直 → `<Empty>`;橫向 row → `<MenuItem>` + slot;浮層 → `overlay-surface`;跨 OS 捲軸 → `<ScrollArea>`;鎖長寬比 → `<AspectRatio>`。完整對照 → `.claude/references/build-ui-canonicals.md`。

## UI 開發 4 條核心

必重用既有 `components/` / 必用 design tokens(禁硬寫色/字/間距/圓角)/ 建新 UI 前查 pattern / 用 `cn()`(`@/lib/utils`)合併 Tailwind class。

深度規則 → `.claude/references/ui-dev-rules.md`(slot 幾何 / Padding source / Icon size 3 層)。

**一句話 pointer**:
- 新 row 元件 → `patterns/element-anatomy/item-anatomy.spec.md`「自我檢查」
- 清 unused imports / export 異動後:`npx tsc -b` → grep `export {}` → `npm run storybook` → 互動驗
- Inline Action vs Button → item-anatomy.spec.md「Inline Action 設計規格」
- 陰影:必 `--elevation-*`;禁 `shadow-sm/md/lg/xl/2xl`
- 視覺容器 breathing:有邊界 → 必 inner padding

## Tailwind 5 條核心(每條過真實 bug,詳 `.claude/references/tailwind-gotchas.md`)

1. **CSS variable 必 `var()` 包覆** — `w-[var(--foo)]` 而非 `w-[--foo]`(v4 silent 失效)
2. **自訂 utility 必在 `lib/utils.ts` 註冊 group** — 否則 tailwind-merge 誤判 strip
3. **禁 `shadow-sm/md/lg` / `text-xs/sm/base` / 硬寫色值** — 用 `shadow-[var(--elevation-*)]` / `text-body`
4. **禁 shadcn compat alias**(`bg-popover` / `text-muted-foreground` / `bg-accent` 等)— 用 direct token
5. **禁 primitive 色名作 utility**(`bg-neutral-3` / `text-blue-6`)— 用 semantic utility 或 `bg-[var(--color-blue-6)]`

## Token 命名 4 條硬規則

1. **對齊既有 family**(不孤立發明)— 詳 `tokens/color/color.spec.md`
2. **不混語義與色名**:Tag/Avatar 用 primitive(`var(--color-deep-orange-1)`);Button/Checkbox 用 semantic(`var(--error-subtle)`)
3. **新增語意色相**走 `tokens/color/color.spec.md`「新增語意色相流程」SSOT。本系統採 **Atlassian-style Semantic State Token**
4. **禁止**:籠統命名 / 孤立命名 / 自創縮寫 / Primitive 帶語意 / Semantic 帶色相 / Categorical 中間層(已廢除)

## 元件 Props 命名

**按「是什麼」命名,不按「在哪裡」命名**(Material Chip / Ant Tag idiom):
- slot 只接 icon → `startIcon` / `endIcon`(型別 `LucideIcon`,元件控尺寸)
- slot 接任意視覺 → 描述內容類型(`avatar`,型別 `ReactNode`)
- slot 是行為 → callback(`onDismiss`,元件渲染互動 + 樣式)
- ❌ 禁 `prefix` / `suffix` / `left` / `right`(位置名不傳達本質)

**4 名關閉 / 移除 callback**(詳 `.claude/references/props-naming.md`):
`onClose` / `onDismiss` / `onRemove` / `onClear` 各有語意不合併。

**Badge 命名按放置**:`badge`(inline)/ `overlayBadge`(疊視覺重心 iconOnly)/ `badgeCount`(Avatar count)/ `status`(Avatar presence dot)。

**Icon canonical**:Overflow `MoreVertical` / Breadcrumb ellipsis `MoreHorizontal` / Close `X` / 成功 `Check` / 警告 `TriangleAlert` / 資訊 `Info`。

## shadcn 元件規範

**結構**:每元件 `{name}.{tsx,spec.md,stories.tsx,anatomy.stories.tsx,principles.stories.tsx}`。tsx 用 forwardRef + cva + VariantProps + cn() + `{Component, componentVariants}` export。Import `@/design-system/components/{Name}/{name}`(無 barrel)。`npx shadcn add` 後**立刻 grep 移除 shadcn compat alias**。

**cva 適用**:className-only 差異 → cva;style 物件 → object map + `style={{}}`;不同 JSX 樹 → conditional rendering。

**元件不得自包全域 Provider**(Tooltip / Theme / Toast / Portal)— 由應用層統一設定。**判斷**:Context 是行為狀態(open / size)→ 可包;全域外觀配置(delay / theme / portal / variant defaults)→ 禁止。
