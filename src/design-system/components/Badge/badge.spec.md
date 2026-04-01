# Badge 設計原則

## 定位

Badge 是通知計數指示器，用於未讀數量、待辦計數、狀態紅點。不是分類標籤（那是 Tag）。

---

## 層級（Variant）

四個層級代表通知的緊急程度，由高到低：

| Variant | 視覺 | 何時使用 |
|---------|------|----------|
| `critical`（預設） | 紅底白字（bg-notification） | 需要立即處理——未讀訊息、錯誤計數 |
| `high` | 藍底白字（bg-primary） | 重要但不緊急——新功能、待辦事項 |
| `medium` | 淺藍底藍字（bg-primary-subtle） | 參考資訊——更新數量、評論計數 |
| `low` | 灰底灰字（neutral-3 + neutral-7） | 被動計數——總數、已完成數量 |

### 層級與容器的關係

Badge 的層級應自然匹配容器的視覺重量。Primary button 是畫面上最強烈的元素，只有 `critical` 的對比度足以在深色底上清楚辨識。低層級 badge 放在高視覺重量的按鈕上是設計矛盾——通知不重要，按鈕卻最重要。

| 按鈕 variant | 適合的 Badge 層級 |
|---|---|
| primary、checked、secondary+danger | `critical` |
| secondary、tertiary | `critical`、`high` |
| text | 全部 |

---

## 模式

### Count（預設）

16px 高、10px 字、font-medium。

- 個位數：min-w-4 確保寬 = 高 = 16px → 正圓
- 多位數：px-1 等距左右 padding → 膠囊
- `max` prop 設定上限，超過顯示 "max+"（如 `max={99}` → "99+"）

### Dot

6×6px 純色圓點，無文字。用於不需顯示具體數量的場景（「有新東西」vs「有 N 個新東西」）。

---

## 禁止事項

- ❌ 不用 Badge 做分類標籤——那是 Tag
- ❌ 不在深色背景按鈕上用 `medium` / `low` 層級——對比不足
- ❌ dot 模式不帶數字——dot 是純視覺指示，數量用 count 模式
