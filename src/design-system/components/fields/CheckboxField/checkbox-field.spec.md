# CheckboxField 設計原則

## 定位

CheckboxField 是布林值的輸入與顯示元件。Edit 模式用 Checkbox，readonly 模式用文字符號。

共用規則見 `field.spec.md`。本文件只記錄 CheckboxField 特有的原則。

---

## 模式差異

| Mode | 渲染方式 | 說明 |
|------|---------|------|
| `edit` | Checkbox 元件 | 可勾選 / 取消勾選 |
| `readonly` | 文字（✓ 或 —） | 不用 disabled checkbox——避免暗示「本來可以勾但被擋住」 |
| `disabled` | Disabled checkbox | 保留 checkbox 外觀，加上 disabled 視覺 |

### Readonly 用文字而非 disabled checkbox

Readonly 表達的是「這個欄位不是用來互動的」，disabled checkbox 暗示「你可以勾但現在不行」——語義不同。文字符號（✓ / —）直接傳達結果，沒有互動暗示。

---

## 值的呈現

| 值 | Edit | Readonly | Display |
|----|------|----------|---------|
| `true` | Checkbox checked | ✓（`text-foreground`） | ✓ |
| `false` / `null` | Checkbox unchecked | —（`text-fg-muted`） | — |

`false` 和 `null` 視覺上不做區分——對使用者來說「沒有勾」就是「沒有勾」。

---

## 與其他 Field 的差異

- **沒有 error 狀態**——布林值只有兩種答案，不存在「格式錯誤」
- **沒有 clearable**——取消勾選就是 clear
- **沒有 placeholder**——checkbox 本身就是空狀態的視覺

---

## 禁止事項

- ❌ 不在 readonly 模式使用 disabled checkbox——語義不同
- ❌ 不區分 `false` 和 `null`——對使用者沒有意義
