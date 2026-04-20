# RadioGroup 設計原則

## 定位

RadioGroup 是**互斥單選且全選項可見**的表單控件——從 2-5 個選項中挑恰好一個，每個選項一行獨立呈現（支援 label + description + 完整閱讀）。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：基於 Radix RadioGroup（shadcn 包裝）+ 橋接 DS token。

共用規則見 `../Checkbox/checkbox.spec.md`（Checkbox & RadioGroup 設計原則，含 SelectionItem 佈局與 clamp 政策）。

---

## 何時用

- **決策節點的互斥單選**：付款方式、訂閱方案、票種、權限角色——使用者需要**對比評估**
- **選項需要描述文字**：法律條款、方案價格、feature 比較（Radio 的 description 支援完整閱讀，不截斷）
- **2-5 個選項且全部可見**：讓使用者一眼看完所有選項，不需要點兩次（Select）
- **空間允許 O(n) 垂直展開**：form 內、dialog 內、setting section 內

## 何時不用

**與 Select 的分界詳見 `../Select/select.spec.md` 的「與 RadioGroup 的分界」**（SSOT）——Select 是 Select vs RadioGroup 判斷的 owner。簡言：RadioGroup 用於「使用者需對比評估的決策節點」，Select 用於「label 自帶語意、空間受限、使用者熟悉選項」。

| 場景 | 改用 | 原因 |
|------|------|------|
| 空間受限 / 選項超過 5 個 | `Select` | RadioGroup 全可見，O(n) 垂直空間成本過高 |
| 2-5 個緊湊切換（toolbar / filter） | `SegmentedControl` | compact control，pill 尺寸融入 toolbar |
| 多選（可選多個）| `Checkbox` | Radio 是互斥單選，Checkbox 是獨立 toggle |
| 布林 on/off | `Switch`（即時）/ 單個 `Checkbox`（on-submit） | 布林不需要「選一個」的心智模型 |
| 大量選項需要搜尋 | `Select` + `searchable` | RadioGroup 不支援搜尋 |

---

## 與 Checkbox 的差異

視覺語言共用（見 Checkbox spec），差異僅在：

- **形狀**：`rounded-full`（Checkbox 是 `rounded-md`）
- **指示器**：filled dot（Checkbox 是 check / minus icon）
- **語意**：互斥單選（Checkbox 可多選）
- **`fieldLayout`**：`'block'`（放進 `<Field>` 時 Field 自動切 block 模式；Checkbox 沒有此 static 屬性，因為單個 Checkbox 是 inline primitive）

---

## 為何無 StateBehavior

RadioGroup 的互動狀態(default / hover / checked / disabled / focus)**與 Checkbox 共用同一套 SelectionItem 佈局 + 狀態規則**(見「與 Checkbox 的差異」段表格描述),由 Checkbox 的 StateBehavior story own。RadioGroup 只改 selection model(互斥),不改 state 視覺。重寫 StateBehavior = 與 Checkbox 漂移風險(圓圈 vs 方框形狀差異已由 cva 控制,state 色完全共用)。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix`。互動 state 見 Checkbox 的 `StateBehavior`。

---

## 相關

- `../Checkbox/checkbox.spec.md` — 共用規則（SelectionItem 佈局 / clamp 政策 / 視覺語言）
- `../Select/select.spec.md` — 「與 RadioGroup 的分界」SSOT（Select vs RadioGroup 決策的 owner）
- `../SegmentedControl/segmented-control.spec.md` — compact 互斥切換的替代
- `../Switch/switch.spec.md` — 布林開關
- `../Field/field.spec.md` — RadioGroup 作為 Field control 時的 block layout 整合
