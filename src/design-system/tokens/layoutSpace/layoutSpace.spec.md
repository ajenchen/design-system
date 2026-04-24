# LayoutSpace 設計原則

Layout Space 定義頁面與容器的巨觀間距 token，隨 density 自動縮放。

頁面結構間距，隨 `data-density`（或 `data-layout-space`）切換。

## Token 表

| Token | md | lg | 語意 |
|-------|----|----|------|
| `--layout-space-loose` | 16px | 24px | 主間距:容器水平 padding、元素間 gap、fw 呼吸空間 |
| `--layout-space-tight` | 12px | 16px | 緊湊間距:header 到非 fw、非 fw 到 fw 轉場 |
| `--layout-space-bottom` | 48px | 48px | 結論留白:內容到 action buttons |

### 為什麼 bottom 不隨 density 變

48px 是「結論前的留白」——content 到 action buttons 的視覺暫停。這跟 density 無關(不論 compact 或 comfortable,使用者都需要「表單結束了」的節奏),所以固定。

---

## 容器 Layout 規則(6 條)

### 規則 1:水平 padding = `loose`

所有內容的左右 padding = `--layout-space-loose`。Full-width 元素(table / textarea / editor)的左右 padding **也是 `loose`**,讓內容邊緣跟非 full-width 元素對齊(視覺對稱)。

### 規則 2:頂部(Header → 第一個元素)

**依第一個元素的類型決定**:

| 第一個元素 | Header → 該元素的距離 | 為什麼 |
|---|---|---|
| **Full-width**(table / editor）| `loose` | fw 視覺重、需要呼吸空間 |
| **非 full-width**(input / button / text / alert）| `tight` | 元素輕、header 邊界已提供分離 |

### 規則 3:元素間 gap

| 轉場 | 間距 | 為什麼 |
|---|---|---|
| 非 fw → 非 fw | `loose` | 預設 gap,form fields 之間 |
| 非 fw → fw | `tight` | fw 視覺重、不需額外呼吸;避免「double spacing」感 |
| fw → fw | `tight` | 同理 |
| fw → 非 fw | `tight` | 同理(跟 fw 相鄰一律 tight) |

**一句話**:跟 full-width 相鄰的 gap 一律 `tight`。只有 non-fw ↔ non-fw 之間用 `loose`。

#### Caveat:`flex-col gap-*` 單值 form(2026-04-22 校準)

規則 3 是 **per-transition** 設計意圖,但 CSS `flex-col gap-X` 只能套單一值。若 form 用 `flex-col gap-*` 容器統一 gap 處理:

| Form 組成 | 統一 gap 選擇 | rationale |
|----------|-------------|----------|
| 全是 non-fw(Input / Select / Button) | **`loose`** | 所有 transition 都是 non-fw ↔ non-fw,規則 3 要求 loose |
| 含 fw + non-fw 混合(Input / Textarea / CheckboxGroup) | **`loose`**(保守選) | 理由:「fw-adjacent 微 tight 的視覺損失」 << 「non-fw-adjacent 用 tight 的視覺擠壓」。非 fw 之間太緊使用者會覺得貼邊(M12 意義上的不合法貼邊);fw-adjacent 從 tight 拉寬到 loose 視覺差異 < 4px(md density)無察覺 |
| 純 fw(Textarea + Table + Editor) | **`tight`** | 所有 transition 都是 fw-adjacent,規則 3 要求 tight |

**禁止**:單純因為 form 含一個 fw 就把 container 整體設 `tight`(會讓多數的 non-fw ↔ non-fw transition 視覺過緊,歷史 bug:2026-04-22 Sheet form field 全部貼邊假 tight 實際 bug 是 `className` 套錯層,但 spec 選 tight 也是 contributing factor)。

**程式化路徑**(未來):若要完整 per-transition 套不同 gap,需建 `FormLayout` primitive 元件(見下方「程式化建議」),consumer 不用自己算。

### 規則 4:底部

| 情境 | 間距 |
|---|---|
| 最後一個內容 → **action buttons** | `bottom`(48px) |
| Full-width → **容器底部**（無 buttons）| `loose` |

Bottom 48px **只用在 action buttons 之前**。如果容器底部只有 fw content(沒有 Cancel/Save),底部 padding 跟左右一樣用 `loose`。

### 規則 5:Full-width vs 非 Full-width 判斷

| 歸類 | 典型元件 | 判斷 |
|------|---------|------|
| Full-width | Table、Textarea、Editor、Code block | 佔滿容器寬度(扣掉 loose padding) |
| 非 Full-width | Input、Button、Select、Alert、Text、Checkbox、Tabs 內 trigger | 有自己的自然寬度 |

### 規則 6:橫排 Input Gap（固定,不隨 density 變）

橫排並列的 input fields 使用**固定 gap**,不走 layout-space token:

| 關聯性 | Gap | 範例 |
|---|---|---|
| **緊密相關**（同一組值的起迄） | **8px**（`gap-2`） | Sleep start ↔ Sleep end |
| **非緊密**（不同組值並列） | **16px**（`gap-4`） | Sleep 時段 ↔ Work 時段 |

為什麼固定:這是 field 層級的 micro-spacing,跟容器層級的 macro-spacing（layout-space）是不同維度。Field gap 由**內容語意**決定（緊密 vs 獨立），不由 density 決定。

---

## 程式化建議:FormLayout Pattern

表單容器的 layout 幾乎都是相同格式。可以程式化成一個 `<FormLayout>` pattern:

```tsx
<FormLayout>
  {/* 自動套用: pt=tight, px=loose, pb=bottom, gap=loose */}
  <Field><FieldLabel>Name</FieldLabel><Input /></Field>
  <Field><FieldLabel>Description</FieldLabel><Textarea /></Field>
  {/* Full-width element: FormLayout 自動偵測,改用 tight gap */}
  <DataTable ... />
  {/* Action footer */}
  <FormLayout.Footer>
    <Button variant="secondary">Cancel</Button>
    <Button>Create</Button>
  </FormLayout.Footer>
</FormLayout>
```

**可程式化的部分**:
- `pt-[var(--layout-space-tight)]` — 頂部 tight(非 fw 首元素)
- `px-[var(--layout-space-loose)]` — 水平 loose
- `gap-[var(--layout-space-loose)]` — 預設 gap
- Footer 前自動加 `pb-[var(--layout-space-bottom)]`

**需要手動處理的部分**:
- Full-width 偵測(consumer 標記哪些是 fw,或用 className 覆蓋 gap)
- 橫排 input 的 8px / 16px gap(由 consumer 在 flex row 上設定)

---

## 模式切換

Layout Space 與 UI Size 統一透過 `data-density` 控制：

```html
<html data-density="md">
```

```ts
document.documentElement.setAttribute('data-density', 'lg')
```

若需單獨控制版面間距而不影響元件尺寸:

```ts
document.documentElement.setAttribute('data-layout-space', 'lg')
```

---

## 容器持有 padding 原則

元件不貼齊容器邊緣——**容器負責提供內距(padding),元件本身不加外距(margin)來推開容器**。這讓同一個元件在不同容器中都有一致的行為,間距的控制權在容器端。

---

## 典型容器範例

### 表單 Dialog（非 fw 內容）

```
┌────────────────────────────────────┐
│  Title                        [X]  │ ← Dialog header(元件自帶)
├────────────────────────────────────┤
│← tight(16) ──────────────────────→│ ← 頂部到第一個非 fw 元素
│  ← loose → [Name input]  ← loose →│
│← loose gap(24) ─────────────────→│
│  ← loose → [Description] ← loose →│
│← loose gap(24) ─────────────────→│
│  ← loose → [Color select]← loose →│
│                                    │
│← bottom(48) ───────────────────→│
│  ← loose → [Cancel] [Create] ← loose →│
└────────────────────────────────────┘
```

### Full-width Editor Dialog

```
┌────────────────────────────────────┐
│  Multi-line text              [X]  │
├────────────────────────────────────┤
│← loose(24) ────────────────────→│ ← fw 首元素:用 loose
│╔══════════════════════════════════╗│
│║← loose → Editor content ← loose →║│
│╚══════════════════════════════════╝│
│← loose(24) ────────────────────→│ ← fw → 底部(無 buttons):loose
├────────────────────────────────────┤
│  ← loose → [Cancel] [Save] ← loose →│
└────────────────────────────────────┘
```

### Tabs + Alert + Table Dialog

```
┌────────────────────────────────────┐
│  Access                       [X]  │
│  [Members] [Role permission] [Security]│
├────────────────────────────────────┤
│← tight(16) ────────────────────→│ ← 非 fw(alert)
│  ← loose → [ℹ Info alert]← loose →│
│← tight(16) ────────────────────→│ ← 非 fw → fw 轉場
│╔══════════════════════════════════╗│
│║← loose → Table           ← loose →║│
│╚══════════════════════════════════╝│
│← loose(24) ────────────────────→│ ← fw → 底部(無 buttons)
└────────────────────────────────────┘
```

### Tabs + Table（無 Alert）

```
┌────────────────────────────────────┐
│  Access                       [X]  │
│  [Members] [Role permission] [Security]│
├────────────────────────────────────┤
│← loose(24) ────────────────────→│ ← fw 首元素:用 loose
│╔══════════════════════════════════╗│
│║← loose → Table           ← loose →║│
│╚══════════════════════════════════╝│
│← loose(24) ────────────────────→│
└────────────────────────────────────┘
```

### Description + Table + Buttons

```
┌────────────────────────────────────┐
│  Map deprecated statuses      [X]  │
├────────────────────────────────────┤
│← tight(16) ────────────────────→│ ← 非 fw 首元素
│  ← loose → [Description text] ← loose →│
│← tight(16) ────────────────────→│ ← 非 fw → fw 轉場
│╔══════════════════════════════════╗│
│║← loose → Table           ← loose →║│
│╚══════════════════════════════════╝│
│← loose(24) ────────────────────→│ ← fw → buttons 區
├────────────────────────────────────┤
│  ← loose → [Cancel] [Apply] ← loose →│
└────────────────────────────────────┘
```

### 橫排 Input Gap

```
[*Sleep start][8px][*Sleep end]  [16px]  [*Work start][8px][*Work end]
 └── 緊密相關 ──┘              └── 非緊密 ──┘ └── 緊密相關 ──┘
```

---

## 使用方式

```tsx
// 容器水平 padding
className="px-[var(--layout-space-loose)]"

// 頂部(非 fw 首元素)
className="pt-[var(--layout-space-tight)]"

// 頂部(fw 首元素)
className="pt-[var(--layout-space-loose)]"

// 元素間 gap（非 fw ↔ 非 fw）
className="gap-[var(--layout-space-loose)]"

// Full-width 轉場 gap
className="mt-[var(--layout-space-tight)]"

// Bottom（到 action buttons）
className="pb-[var(--layout-space-bottom)]"

// 橫排 input gap（固定,不走 token）
className="gap-2"   // 8px 緊密
className="gap-4"   // 16px 非緊密
```

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `description-list.spec.md`
- `empty.spec.md`
- `overlay-surface.spec.md`
