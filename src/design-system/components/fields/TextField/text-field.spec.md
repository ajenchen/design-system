# TextField 設計原則

## 定位

TextField 是純文字的輸入與顯示元件。格式化邏輯為 identity（value → value）。

共用規則見 `field.spec.md`。本文件只記錄 TextField 特有的原則。

---

## startIcon 的使用場景

startIcon 用於輔助使用者理解「這個 input 是做什麼的」，不是描述 value 的類型。

| 適合 | 範例 |
|------|------|
| 搜尋 | `Search` |
| Email | `Mail` |
| 密碼 | `Lock` |
| URL | `Globe` |

startIcon 不隨 value 變化——它描述的是 input 的用途，不是 value 的狀態。

---

## endAction 的常見模式

| 模式 | Icon | 行為 |
|------|------|------|
| 顯示/隱藏密碼 | `Eye` / `EyeOff` | toggle `type="password"` ↔ `type="text"` |
| 清除內容 | `X` | 清空 value，有值時出現、清空後消失 |

清除按鈕消失後不佔位——input 自然擴展。

---

## Display

`TextFieldDisplay` 是 identity 顯示：
- 有值：原樣輸出
- null / undefined / 空字串：`—`（em dash），`text-fg-muted`

---

## 禁止事項

- ❌ startIcon 不可隨 value 變化——它描述用途，不是狀態
- ❌ 不可用 TextField 顯示需要格式化的資料（數字、日期、貨幣）——用對應的 Field 元件
