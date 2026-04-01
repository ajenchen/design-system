# Tag 設計原則

## 定位

Tag 是 inline label，用於分類標籤、狀態標記、多選已選值。不是 overlay 通知圓點（那是 Badge / Notification indicator）。

---

## Variant

以色名命名，語義由消費端決定。建議用法與色彩系統的語義定義對齊。

| Variant | 建議用法 |
|---------|----------|
| `neutral`（預設） | 通用分類、草稿、無特定語義 |
| `blue` | 進行中、資訊提示、active 狀態（對應 `--info`） |
| `red` | 錯誤、已封鎖、危險（對應 `--error`） |
| `green` | 成功、已完成、已核准（對應 `--success`） |
| `yellow` | 警告、待審核、注意（對應 `--warning`） |
| `turquoise` | 分類色（無固定語義） |
| `purple` | 分類色（無固定語義） |
| `magenta` | 分類色（無固定語義） |
| `indigo` | 分類色（無固定語義） |

前五個色（neutral ~ yellow）有對應的語義 token；後四個色（turquoise ~ indigo）使用原始色票，專供需要多色區分的場景（專案標籤、團隊分類等）。

---

## 尺寸

三種尺寸（子元件補齊原則），不隨 density 變化。尺寸在元件內定義，不引用 field-height token——Tag 和 Button 尺寸是獨立的設計決策。

| Size | 高度 | 字體 | 字重 | Tag px | Text px | 配對 field |
|------|------|------|------|----------|---------|-----------|
| sm | 20px | text-caption (12px) | font-medium | 4px | 4px | field sm |
| md（預設） | 24px | text-body (14px) | font-normal | 4px | 4px | field md |
| lg | 24px | text-body (14px) | font-normal | 4px | 4px | field lg（與 md 同值，子元件補齊原則） |

**Tag 內 icon 統一 16px**，不分 Tag 尺寸。prefix icon 和 suffix icon（含 dismiss）都是 16px。

## 內部結構

```
[tag-px] [prefix?] [text-px TEXT text-px] [suffix?] [tag-px]
```

- tag-px：外層呼吸空間
- text-px：文字自身 padding（固定 4px），同時作為與 prefix/suffix 的間距
- 不用 gap——text padding 自然拉開
- 前後綴顏色繼承文字色

## 圓角

統一 `rounded-md`（4px）。

## Tag 間距

tag 與 tag 之間：`gap-1`（4px）。

## 包含 Tag 的 Field

Field 內包含 Tag 時，Field 的 padding 改為 `(field-height - tag-height) / 2`，確保 tag 四邊等距。

---

## Dismiss（Inline Action）

可移除的 Tag 在 suffix 位置放置 dismiss inline action。共用規則見 `uiSize.spec.md` 的 Inline Action 段落。

Icon 色彩遵循 Inline Action 統一規則：預設 `fg-muted`，hover 時 `foreground`。

| Tag size | Icon | Hover 背景 | 上下呼吸空間 |
|---|---|---|---|
| sm (20px) | 16px | 18px | 1px |
| md/lg (24px) | 16px | 18px | 3px |

---

## 禁止事項

- ❌ Tag 尺寸不引用 field-height token——兩者獨立
- ❌ 不用 gap 處理 prefix/suffix 間距——text padding 已拉開
- ❌ 不用 Tag 做 overlay 通知圓點——那是不同元件（Badge）
- ❌ 不用 variant 名稱傳達語義（例：不靠 `red` = 錯誤）——variant 是顏色，語義由消費端的內容和上下文決定
