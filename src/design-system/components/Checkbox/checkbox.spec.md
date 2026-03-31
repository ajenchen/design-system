# Checkbox & Radio 設計原則

## 定位

Checkbox 和 Radio 是選擇控件，視覺語言完全一致，差異只有形狀和語意。

| | Checkbox | Radio |
|---|---|---|
| 形狀 | `rounded-md`（方） | `rounded-full`（圓） |
| 指示器 | Check icon | Filled dot |
| 語意 | 獨立 toggle（多選） | 互斥選擇（單選，必須在 RadioGroup 內） |

---

## 尺寸

三種尺寸（sm/md = 16px、lg = 20px），對齊 icon 系統。sm 和 md 視覺相同，純粹是命名 mapping 讓消費者直接傳同一個 size。

| Size | 控件尺寸 | 內部 icon | 配對 field |
|------|---------|----------|-----------|
| sm | 16px | 12px | field sm |
| md | 16px | 12px | field md |
| lg | 20px | 16px | field lg |

---

## Label 對齊

Checkbox/Radio 不內建 label。Label 組合使用 `SelectionItem` 元件。

對齊機制：
1. 外層 `<div>` 設 `text-body` / `text-body-lg`（建立 line-height context）
2. 控件包在 `h-[1lh]` 的容器內（容器高度 = 一行文字高度）
3. `flex items-center`（控件在文字行高內垂直置中）
4. 外層 `flex items-start`（多行時控件對齊第一行）

`1lh` 在 `<div>` 上正常繼承，改字體自動重算。

---

## SelectionItem 佈局

垂直排列和水平排列共用 `SelectionItem`。

| | 垂直 | 水平 |
|---|---|---|
| Item 間距 | 0（padding 處理） | 24px（gap-6） |
| Item padding | `py = (field-height - 1lh) / 2` | 同左 |
| 單行高度 | = field-height（對齊 TextField） | 同左 |
| 多行高度 | padding 不變，自然撐高 | — |

---

## 狀態

### Checkbox

| 狀態 | 邊框 | 底色 | 指示器 |
|------|------|------|--------|
| unchecked | border | surface | 無 |
| checked | primary | primary | white check |
| hover unchecked | neutral-6 | surface | 無 |
| hover checked | primary-hover | primary-hover | white check |
| disabled unchecked | 無 | neutral-2 | 無 |
| disabled checked | 無 | neutral-2 | fg-disabled check |

### Radio

| 狀態 | 邊框 | 底色 | 指示器 |
|------|------|------|--------|
| unchecked | border | surface | 無 |
| checked | primary | surface | primary dot |
| hover unchecked | neutral-6 | surface | 無 |
| hover checked | primary-hover | surface | primary-hover dot |
| disabled unchecked | 無 | neutral-2 | 無 |
| disabled checked | 無 | neutral-2 | fg-disabled dot |

---

## 禁止事項

- ❌ Radio 不可單獨使用——必須在 RadioGroup 內
- ❌ Checkbox 不內建 label——label 組合用 SelectionItem
- ❌ 垂直排列不加 gap——padding 已處理間距
- ❌ 多選一不用 Checkbox——用 Radio 或 Select
