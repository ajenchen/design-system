# Inventory Checklist — 元件 / token / a11y grep pattern

Phase 1 inventory 生成的具體 grep + 統計方法。

---

## Component Inventory

### 步驟 1: grep 所有 import

```bash
grep -rhnE "^import.*@/design-system/components/" {target} | \
  sed -E 's/.*components\/([A-Z][a-zA-Z]+)\/.*/\1/' | \
  sort | uniq -c | sort -rn
```

輸出:每個 DS 元件被 import 幾次。

### 步驟 2: count JSX usage

每個 component 精確使用次數(非 import):

```bash
for comp in Button Input Dialog Empty ScrollArea ...; do
  count=$(grep -rhnE "<$comp\b" {target} | wc -l)
  echo "$comp: $count"
done
```

### 步驟 3: 輸出 table

```markdown
## Components Used (12)

| Component | Count | Files |
|-----------|-------|-------|
| Button    | 12    | Checkout.tsx, Summary.tsx, ... |
| Input     | 3     | PaymentForm.tsx |
| Dialog    | 2     | ConfirmDialog.tsx, EditDialog.tsx |
| Empty     | 1     | EmptyCart.tsx |
| ProgressBar | 1   | UploadingBanner.tsx |
| ScrollArea | 1    | ItemList.tsx |
| ...       |       |       |
```

---

## Token Inventory

### CSS variable usage

```bash
grep -rohnE 'var\(--[a-z-]+\)' {target} | \
  sort | uniq -c | sort -rn
```

### Semantic token utility class

```bash
grep -rohnE '\b(bg|text|border|fill|stroke|ring)-(primary|primary-hover|primary-subtle|primary-text|info|info-hover|info-subtle|info-text|error|error-hover|error-subtle|error-text|success|success-hover|success-subtle|success-text|warning|warning-hover|warning-subtle|warning-text|foreground|fg-secondary|fg-muted|fg-disabled|neutral-hover|neutral-active|neutral-selected|surface|surface-raised|canvas|muted|secondary|border|border-hover|divider|overlay|tooltip|notification|chart-[1-5])\b' {target} | \
  awk -F: '{print $NF}' | sort | uniq -c | sort -rn
```

### 輸出 table

```markdown
## Tokens Used (24)

| Token | Usage | Primary consumer |
|-------|-------|------------------|
| --primary | 8 | 主 CTA |
| --fg-secondary | 14 | 次要文字 |
| --error | 3 | 錯誤狀態 |
| --surface-raised | 5 | Dialog / Popover bg |
| ... | | |
```

---

## Layout primitives 消費報告

每類 primitive 用了幾次 + 哪些地方:

```bash
# Empty
grep -rhnE '<Empty\b' {target} | wc -l

# ScrollArea
grep -rhnE '<ScrollArea\b' {target} | wc -l

# AspectRatio
grep -rhnE '<AspectRatio\b' {target} | wc -l

# item-layout (MenuItem etc.)
grep -rhnE '<(MenuItem|TreeItem|SidebarMenuButton|ItemIcon|ItemAvatar|ItemLabel|ItemSuffix)\b' {target} | wc -l

# overlay-surface (Dialog/Popover auto consume)
grep -rhnE '<(DialogHeader|DialogBody|DialogFooter|PopoverHeader|PopoverBody|PopoverFooter)\b' {target} | wc -l
```

輸出:

```markdown
## Layout primitives used

| Primitive | Count | Note |
|-----------|-------|------|
| Empty     | 1     | EmptyCart.tsx |
| item-layout | 5   | via MenuItem(3) / TreeItem(2) |
| overlay-surface | 4 | via Dialog sub-components |
| ScrollArea | 1    | ItemList.tsx |
| AspectRatio | 0   | 本 feature 無 media container |
| Horizontal-overflow | 0 | 本 feature 無水平溢出 |
| Field-wrapper | 3  | via Input(3) |
```

---

## A11y Checklist

### 自動掃描(visible)

```bash
# icon-only 無 aria-label
grep -rnE '(iconOnly|startIcon=\{)' {target} | \
  xargs -I {} sh -c 'echo {} | grep -v "aria-label"'

# 非 button 綁 onClick
grep -rnE '<(div|span)[^>]*onClick=' {target}

# Dialog 是否有 DialogTitle
grep -rlE '<DialogContent>' {target} | \
  xargs -I {} grep -L 'DialogTitle' {}
```

### 人工 review(本 skill AI 無法判)

| Check | Status | Note |
|-------|--------|------|
| Color contrast WCAG AA | ? | 需 Storybook 視覺 + axe plugin |
| Keyboard navigation tab order | ? | 需實際操作 |
| Screen reader announce 正確 | ? | 需 VoiceOver / NVDA 測試 |
| Focus trap 在 Modal 內 | ✓ | Radix 自動處理 |
| Esc 關閉 Modal | ✓ | Radix 自動處理 |

輸出:

```markdown
## A11y Status

### Auto-scanned (visible issues)

| Check | Status |
|-------|--------|
| icon-only 有 aria-label | ✓ 全過(12/12) |
| 非 button 綁 onClick | ✓ 無 |
| Dialog 有 Title | ✓ 2/2 |

### Manual review needed

- [ ] Color contrast(run axe in Storybook)
- [ ] Keyboard navigation test
- [ ] Screen reader test
```

---

## 新增的元件 / token

若 feature 過程中**新增**到 design-system/,在 inventory 特別標示:

```markdown
## New additions to DS (本 feature 過程新增)

| Added | File | Motivation |
|-------|------|-----------|
| Coachmark | node_modules/@qijenchen/design-system/src/components/Coachmark/ | onboarding tour 需求 |
| --chart-accent | node_modules/@qijenchen/design-system/src/tokens/color/semantic.css | data viz 擴充 |
```

讓 stakeholder 看得出「這 feature 帶動了 DS 擴充」的成本。

---

## 範本輸出順序

inventory 結果編排:

1. **Overview**(feature 規模:X screens / Y modals)
2. **Components Used**(按 count 由高至低)
3. **Tokens Used**(按 count 由高至低,分色 / 字 / 間距 / shadow 四類)
4. **Layout primitives**(全表)
5. **A11y**(auto + manual two tables)
6. **New additions**(若有)

如此 stakeholder 一分鐘可掃完,三分鐘可讀懂 feature 全景。
