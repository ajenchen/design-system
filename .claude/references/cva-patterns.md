# cva 適用範圍 完整對照(historical provenance:從 provider-specific generated adapter CLAUDE.md 拆出)

Canonical `packages/design-system/ds-canonical/rules/ui-development.md`「shadcn 元件規範」留判斷法 + 禁止一句話;完整對照表和 documented 例外在本檔。

---

## 變體 × 實作模式對照

`cva()` 是系統管理 **className 變體**的標準工具,但**不是所有變體都該用 cva**。合法的**非 cva** 實作模式:

| 變體類型 | 實作方式 | 範例 |
|---------|---------|------|
| className 變體(bg / text / border / size / state) | **`cva()`** | Button / SegmentedControl / Chip / Tag / Field Controls 等絕大多數 |
| **Style prop 驅動的 variant**(需要 `style={{ backgroundColor: 'var(--...)' }}`)| **Object map / lookup table**(world-class:Material / Ant / Polaris 同樣做法) | **Avatar** 的 color variants 驅動 inline style;cva 無法產 style object |
| **結構性變體**(不同 mode 是不同 layout,不只 class swap) | **Conditional rendering / sub-components** | **FileItem** 的 `compact / rich` mode 有不同 flex 結構 |

---

## 當前系統 documented 例外

- **`Avatar`**:color variants 用 object map(原因:inline style prop;cva 無法產 style object)
- **`FileItem`**:mode variants 用 if-branches(原因:結構性差異,不是 class swap;compact vs rich 是不同 flex 樹)

---

## 新增例外判斷法

要加例外(= 某元件變體不用 cva)前先問:
1. 變體差異 **真的需要 inline style** 嗎?(有些看似需要其實可用 CSS variable + data attribute 解)
2. **結構性差異**夠大嗎?(只差一個 slot 可以 cva + `data-mode` 選擇器;不同 root layout 才算結構)
3. 世界級 DS(Material / Ant / Polaris)怎麼處理同類變體?

若答案 3 題都指向「非 cva」,加 documented 例外 + 更新本檔。否則先嘗試 cva。

---

## 禁止

- ❌ 為了「一律用 cva」硬把 style prop 變體塞進 cva(無法優雅產出 style object)
- ❌ 為了「一律用 cva」把不同結構的 mode 強制壓到同一棵 JSX 配 className 切換(code 會長滿 `{mode === 'rich' && ...}` hacks)
- ❌ 「新例外」沒寫進本檔的 documented 例外清單(= 隱性 drift)
