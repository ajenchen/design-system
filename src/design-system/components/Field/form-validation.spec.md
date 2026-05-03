<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Form Validation 設計原則

> **本 spec = 跨表單的 validation 方法論 rules,非 UI 元件 spec,不適用 Layout Family 分類**(Dim 16 豁免)。
> 元件級 validation 視覺規格住在 `Field/field.spec.md`(Field wrapper chrome)+ 各 form control spec。

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

## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家對照),「禁 focus 中報錯」+「禁邊打邊重驗」是本 spec 的 binary strict rule,以下為支撐 rationale。

### 驗證 timing 哲學

| DS | 本 DS | Material 3 | Polaris | Ant Design | Carbon | iOS HIG | Atlassian Forge | GitHub Primer |
|----|-------|-----------|---------|-----------|--------|---------|-----------------|---------------|
| 預設 timing | **blur + submit**(無 onChange) | onBlur + 已出錯後 onChange(MUI/RHF default) | onBlur(明寫「don't validate while typing」)| **onChange + onBlur 雙模式**(`validateTrigger=['onChange','onBlur']`) | onBlur + submit | submit / Done(form 內延遲)| onBlur + onSubmit | submit only(極簡)|
| 已出錯後 | edit 立即清 error / blur 重驗 | re-validate onChange | re-validate onChange | re-validate onChange | edit 清 / blur 重驗 | submit 才驗 | edit 清 / blur 重驗 | submit 才驗 |
| Submit 失敗 | scroll + focus first error | focus first error | focus first error | scroll + focus | focus first error | shake animation | scroll + focus | inline alert |

### Submit button 狀態哲學

| DS | 本 DS | Material 3 | Polaris | Ant | Stripe Dashboard | Linear | Notion 設定頁 |
|----|-------|-----------|---------|-----|------------------|--------|---------------|
| 新建(Create)| **always enabled** | always enabled | always enabled | dirty 才 enable(差異)| always enabled | always enabled | always enabled |
| 更新(Update)| **disabled-until-dirty** | dirty 才 enable | dirty 才 enable | dirty 才 enable | dirty 才 enable | auto-save(無 explicit save)| disabled-until-dirty |

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) Blur-only validation(non-onChange)— 對齊 Polaris / Carbon「don't validate while typing」**

Ant Design default `validateTrigger=['onChange', 'onBlur']` 對使用者 aggressive — 才打「user@」就跳「invalid email」碎念,reader 思路被打斷。Polaris / Carbon / iOS / Atlassian 共識 onBlur + submit,讓使用者「先表達完意圖再評斷」。

捨棄 onChange 即時驗證的代價是「打錯看不到反饋」(打到第 3 位才發現密碼太短),但 Field 內可選 `realtime` mode 提供 hint(非 error)補足,本 spec 規範 default 行為。

**(2) Edit 清 error + blur 重驗(已出錯後),非 onChange 重驗 — 對齊 Carbon / Atlassian 兩階段哲學**

Material/Polaris/Ant 已出錯後 onChange re-validate(改第 1 字 error 又跳回)— 給使用者壓力。Carbon / Atlassian「edit 清 + blur 重驗」哲學:給使用者完整修正空間,離開時才再判決。

對應使用者心智:「修改」是過程,「離開 field」是動作完成的 boundary,在 boundary 評斷比每字評斷尊重 user agency。

**(3) Create always-enabled / Update disabled-until-dirty 不對稱 — 對齊 Stripe / Notion / Linear 現代慣例**

Ant 對「Create」也 disabled-until-dirty(填了所有 required 才亮)— 但這讓使用者第一次進 form 看到 disabled button 困惑「為什麼按不了」。Stripe / Notion / Material 共識:Create 永遠 enabled — 點擊後若 invalid,顯示 error 並 scroll,使用者明確知道為什麼。

Update 場景反向:沒改的 Update 沒提交意義(對齊「intent 才 commit」),disabled 表達「等你做動作」比 enabled 後點擊判斷「沒變化」更直接。對齊 Notion 設定頁 / Figma file rename 慣例。

**(4) 格式驗證 vs 業務驗證分層(blur vs submit)— 對齊 Material/Carbon「local vs cross-cutting validation」哲學**

Email 格式 / URL 格式 / 必填等「single-field 純 syntax」blur 即可判斷;名稱重複(API 查)/ 結束日 ≥ 開始日(跨欄位)等「business / async」必須 submit 才能判 — 強行 blur 觸發 API 對使用者體驗差(每換 field 一次 API call)。

對齊 Material `<TextField error>` + Form layer error 分層 / Carbon「format vs business」雙軌。視覺一致(都紅框 + error message)避免 reader 區分「為什麼這個 error 是 blur 出來那個是 submit 出來」。


## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `field.spec.md`
- `link-input.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`
