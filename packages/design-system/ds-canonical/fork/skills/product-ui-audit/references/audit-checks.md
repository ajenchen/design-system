# Audit Checks — 7 維度 grep pattern + rule

每個維度的具體 check。AI Phase 1 parallel 執行時依此 grep + rule 判斷。

---

## Dim 1 — Token 紀律

### Check 1.1: shadcn compat alias

```
grep -nE '\b(bg-popover|text-popover-foreground|text-muted-foreground|bg-accent|text-accent-foreground|bg-destructive|bg-background|bg-card|text-card-foreground|border-input|text-primary-foreground)\b' {target}
```

**Severity**: P0。**Fix**: 對映見 token 防線 `lib/_token_hygiene.sh` + `check_opacity_token_usage.sh`。

### Check 1.2: Tailwind default shadow

```
grep -nE '\bshadow-(sm|md|lg|xl|2xl|inner)\b' {target}
```

**Severity**: P0。**Fix**: shadow-sm → shadow-[var(--elevation-100)] / shadow-md → shadow-[var(--elevation-200)] / shadow-lg → shadow-[var(--elevation-200)](elevation-300 不存在,最高 tier 200)。

### Check 1.3: Tailwind v4 `[--foo]` shorthand

```
grep -nE '\[--[a-z][a-z0-9-]*\]' {target} | grep -v '\[&'
```

**Severity**: P0(silent fail)。**Fix**: `[--foo]` → `[var(--foo)]`。

### Check 1.4: 硬寫 hex / rgb / hsl

```
grep -nE '#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\(|hsla\(' {target}
```

**Severity**: P0。**Exception**: `#fff` 在 Avatar / Tag 白字變體是 documented cva exception(object map 非 cva,per CLAUDE.md `cva 適用範圍`);anatomy inspector chrome 顏色 highlight(`bg: 'rgba(...)'` in `.anatomy.stories.tsx`)。**Fix**: 改 semantic token(`var(--primary)` / `bg-primary` 等)。

### Check 1.5: 硬寫 px 當應用 token

```
grep -nE 'w-\[\d+px\]|h-\[\d+px\]|text-\[\d+px\]|gap-\[\d+px\]|p-\[\d+px\]' {target}
```

**Severity**: P1(需 case-by-case 判斷)。**Rule**: 若有對應 field-height / layout-space / icon-size token,應改 token;若是 genuinely unique 尺寸則保留 + spec 解釋。

---

## Dim 2 — Layout primitive 消費

### Check 2.1: icon+title+desc 垂直居中 → 應消費 Empty

```
# grep for potential misuse patterns
grep -nE 'flex.*flex-col.*items-center.*text-center' {target}
```

對每 hit,檢查是否有:
- LucideIcon 置頂 + title + desc(3-layer vertical stack)
- 且 parent 是**空狀態 / 空目錄 / 無資料 / 拖放區 / 首次引導**等語境

**Severity**: P1。**Fix**: `<Empty icon={Icon} title="..." description="..." />`。

### Check 2.2: row prefix+content+suffix → 應消費 item-layout

```
grep -nE 'flex.*items-center.*gap-2' {target}
```

對每 hit,檢查是否是:
- 單列 row with icon/avatar 左 + content 中 + action 右
- 且是 menu / list / tree / file 類項目

**Severity**: P1。**Fix**: 消費 `MenuItem` / `TreeItem` / `SidebarMenuButton` 等既有 row primitive(或組合 item-anatomy 的 slot components `<ItemIcon>` / `<ItemLabel>` / `<ItemSuffix>` 等)。

### Check 2.3: overlay Header/Body/Footer → 應消費 overlay-surface

```
grep -nE 'border-b border-divider.*px-\[var\(--layout-space-loose\)\]' {target}
grep -nE 'border-t border-divider.*px-\[var\(--layout-space-loose\)\]' {target}
```

若在 Dialog / Popover / Sheet / Drawer consumer 重複寫這個 pattern → flag。

**Severity**: P1。**Fix**: 用 `<SurfaceHeader>` / `<SurfaceBody>` / `<SurfaceFooter>` 或 Dialog 的 sub-components。

### Check 2.4: native overflow-(auto|scroll) → 應用 ScrollArea

```
grep -nE '\boverflow-(auto|scroll|x-auto|x-scroll|y-auto|y-scroll)\b' {target} | grep -vE 'scrollbar-none|useOverflow|horizontal-overflow'
```

**Severity**: P1(跨 OS drift)。**Fix**: 改用 `<ScrollArea>`;若是刻意隱藏 + fade-mask 改用 `horizontal-overflow` pattern。

### Check 2.5: 硬寫 aspect-* → 應用 AspectRatio

```
grep -nE '\baspect-(video|square|\[[\d/]+\])' {target}
```

**Exception**: icon-only Button 以 `aspect-square w-X` 形成正方形 hit area(如 Sidebar trigger)屬幾何 layout 不是 media container,保留。

**Severity**: P2(主要影響:未來 ratio 變化時漂移)。**Fix**: media/image container 改用 `<AspectRatio ratio={n}>`。

### Check 2.6: Field wrapper 缺失

```
grep -nE '<input(?![^>]*ref=)' {target}
```

裸 `<input>` 未包 Field / fieldWrapperStyles → flag。

**Severity**: P1。**Fix**: 包 Field 或消費 Input 元件。

---

## Dim 3 — 元件使用正確性

### Check 3.1: icon-only 無 aria-label

```
grep -nE '(iconOnly|startIcon|ItemInlineAction)' {target}
```

每 hit 檢查同行或附近有 `aria-label=` / `label=`。

**Severity**: P0(a11y 必要)。**Fix**: 加 `aria-label="..."`。

### Check 3.2: Primary Button 堆疊

```
grep -nE 'variant="primary"' {target}
```

若同一 parent 出現多個 primary Button → flag(每 row 應只一個 primary action)。

**Severity**: P1。**Fix**: 次要 action 改 tertiary / secondary。

### Check 3.3: Dialog / Popover / Sheet 缺 title / description

```
grep -nE '<DialogContent>|<PopoverContent>|<SheetContent>' {target}
```

每 hit 追蹤 children 是否含 DialogTitle / DialogDescription。

**Severity**: P0(Dialog a11y 必要)/ P1(Popover, 可選但建議)。**Fix**: 加 Title / Description(Radix 已提供)。

### Check 3.4: 巢狀 Accordion / Tabs / Carousel

```
grep -nE '<(Accordion|Tabs|Carousel)' {target}
```

檢查是否有同名元件巢狀(兩層以上)。

**Severity**: P1(UX 使用者迷失)。**Fix**: flatten 結構或改用 TreeView。

---

## Dim 4 — Mindset adherence

### Check 4.1: placeholder 文案(M4 違反)

```
grep -nE '(Option [A-E]|按鈕[一二三四五]|Rule [A-E]|Variant [A-E]|Placeholder|Lorem ipsum|Foo|Bar|Test value)' {target}
```

**Severity**: P1(違反 Mindset #4 「真實業務場景」)。**Fix**: 改真實 SaaS 場景(Jira / Stripe / Notion / Linear / Figma)。

### Check 4.2: TODO-未確認留白(M5 違反)

```
grep -nE '(TODO:\s*待確認|TODO:\s*decide|FIXME|XXX)' {target}
```

**Severity**: P2(必討論)。**Fix**: 若是規格未定應 surface 給 user 決策,不在 code 留模糊 TODO。

### Check 4.3: cva defaultVariants 三方漂移(M3)

**適用情境**: 若 consumer 在 app 層 override cva 的 defaultVariants(罕見但發生過),檢查是否同步 spec / docblock / anatomy。

---

## Dim 5 — 視覺幾何

### Check 5.1: 同 flex 行互動 slot box 尺寸不一

**手動 review pattern**: 找 `flex items-center gap-*` 包含多個 interactive element(Button / ItemInlineActionButton / Link),確認他們的 box 尺寸一致。

例: FileItem `status slot(16px)` + `delete Button sm(28px)` = 不一致 → hover-bg 吃 gap。

**Severity**: P0(世界級 DS 鐵律違反,違反 node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md「同 flex 列的互動 slot 幾何鐵律」)。

### Check 5.2: 自造 typography tier

```
grep -nE 'text-\[\d+px\]' {target}
```

用 `text-[13px]` 等自造尺寸 → flag。

**Severity**: P1。**Fix**: 改用 DS typography utility(text-caption / text-body / text-body-lg / h1 / h2 等)。

---

## Dim 6 — A11y

### Check 6.1: icon-only 無 aria-label(已含 Check 3.1)

### Check 6.2: 非 button 用 onClick

```
grep -nE '<(div|span)[^>]*onClick='
```

非 `<button>` 元素綁 onClick → flag(缺 keyboard / screen reader)。

**Severity**: P0。**Fix**: 改 `<button>` 或加 `role="button" tabIndex={0} onKeyDown={...}`。

### Check 6.3: color 作唯一 state signal

**手動 review**: 只用紅色 / 綠色 傳 error / success 無 icon 或 label → 色盲不可辨。

**Severity**: P1(WCAG 1.4.1 違反)。**Fix**: 色 + icon 雙通道(CheckCircle / XCircle 等)。

### Check 6.4: keyboard 陷阱

**手動 review**: Modal 內 focus 能 loop(tab 出去要能回來);esc 能關;Arrow keys 導航 list。

**Severity**: P0 若為 Modal / Dialog。**Fix**: 用 Radix primitives(已內建 focus trap)。

---

## 合法例外(documented)

以下 hit 不是 bug,由既有 spec / CLAUDE.md 記錄為合理例外:

- **Avatar 白字**(`text: '#fff'`): cva 適用範圍例外(style prop 驅動用 object map 而非 cva),per `cva 適用範圍` 章節。
- **Anatomy inspector chrome**(`bg: 'rgba(...)'` in `.anatomy.stories.tsx`): dev-tool highlight 非 consumer UI token。
- **Rating yellow stars**(`bg-warning` 黃星): 世界級 convention(Amazon / Google / Yelp 皆黃),spec line 73 明文 documented exception。
- **uiSize icon-only button**(`aspect-square w-X`): 幾何性 square,非 media container,per uiSize.spec.md「calc 不用 aspect-square」主體邏輯。

遇到 hit 時檢查是否屬上述 documented exception,若是則不 flag,否則 flag。
