# Form Validation 設計原則

表單層級的驗證行為規範。適用於所有包含 Field 元件的表單。

---

## 表單驗證原則

### Submit Button 狀態

| 情境 | 按鈕預設 | 何時啟用 | 何時停用 |
|---|---|---|---|
| **新建**(Create) | **永遠 enabled** | — | — |
| **更新**(Update) | **disabled** | 使用者變更任何欄位(dirty) | 變更被還原回原值(pristine) |

新建永遠 enabled——不讓使用者猜「為什麼按不了」。更新用 disabled 明確表達「沒改就不用存」,有變更才亮起來。

### 驗證時機(Blur Validation)

所有 Field 統一使用 blur validation——使用者離開 field 時驗證，不在打字過程中即時驗證。

#### 尚未出錯的欄位

1. **Focus 中不顯示錯誤**——即使輸入內容不合法,focus 狀態不驗證、不顯示 error
2. **Blur 時驗證**——使用者離開 field 後才顯示 error
3. **Enter 等同 blur**——觸發驗證並離開編輯(適用於單行 field)
4. **Escape 取消**——回復原值，不觸發驗證

**為什麼 focus 中不報錯**:使用者可能才打到一半(例如 email 打了 `user@` 還沒打完),此時報錯是「提前判決」,打斷使用者思路。

#### 已出錯的欄位

5. **開始編輯時立即清除 error**——不論新輸入合法與否,只要欄位被編輯就移除 error 視覺,給使用者修正的空間
6. **Blur 時重新驗證**——離開欄位後重新判斷,如仍不合法則再次顯示 error

**為什麼不邊打邊重驗(onChange re-validation)**:逐字重驗太 aggressive——使用者才改了第一個字,error 又跳回來,感覺系統在「碎念」。清除 error 後等 blur 重驗,給使用者完整的修正空間。

### Submit 驗證

7. **Submit 驗證全部**——點擊 submit 時對所有欄位執行驗證(不依賴個別 field 的 blur 狀態)
8. **Anchor 到第一個錯誤**——若有任何欄位出錯,scroll 並 focus 到第一個錯誤欄位
9. **Async / cross-field 驗證 defer 到 submit**——某些驗證無法在 blur 當下完成(如「名稱是否重複」需要 API 查詢、跨欄位邏輯如「結束日不得早於開始日」),這些在 submit 時統一判斷。若有錯誤,同樣 anchor 到第一個出錯欄位。

### 驗證分層

| 層級 | 負責者 | 時機 | 範例 |
|---|---|---|---|
| **格式驗證** | Field 元件自身 | blur | email 格式、URL 格式、必填檢查 |
| **業務驗證** | Form 層 / 應用層 | submit | 名稱不可重複(API)、跨欄位邏輯 |

兩者都透過 `error` prop / Field context 的 `invalid` 呈現,視覺上一致(紅框 + error message)。

### 可程式化的部分

| 功能 | 實作位置 | 方式 |
|---|---|---|
| Blur validation timing | Form library config(如 RHF `mode: 'onBlur'`) | 應用層 |
| Error clearing on edit | Form library config(`reValidateMode: 'onBlur'`）+ Field `onChange` clear | 應用層 |
| Dirty tracking(submit button 狀態) | Form library(`isDirty`)或自訂 `useFormDirty` | 應用層 |
| Scroll to first error | Form library(`scrollToFirstError`)或自訂 `focusFirstError` | 應用層 |
| Field error visual | Field 元件的 `error` prop / `invalid` context | **元件層(已有)** |
| Submit button disabled | `<Button disabled={!isDirty}>` | 應用層 consumer |

---

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `field.spec.md`
- `link-input.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`
