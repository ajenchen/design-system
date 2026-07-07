<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline(M22(d) 顯式撤回;本檔 frontmatter 無 benchmark list,來源 URL 未補)。 -->

# Form Validation 設計原則

> **本 spec = 跨表單的 validation 方法論 rules**(表單層級行為規範,適用於所有含 Field 元件的表單)。非 UI 元件 spec,不適用 Layout Family 分類(Dim 16 豁免)。
> 元件級 validation 視覺規格住在 `Field/field.spec.md`(Field wrapper chrome)+ 各 form control spec。

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
8. **Anchor 到第一個錯誤**——若有任何欄位出錯,scroll 並 focus 到第一個錯誤欄位(**「第一個」= DOM 視覺順序**,非 validate key 宣告順序;對齊瀏覽器原生 reportValidity + react-hook-form shouldFocusError,2026-07-07 code 同步)。多次 submit 重試時,每次都重新驗證全部欄位並重新計算「第一個錯誤」(rule 7 的自然結果),不保持上次 anchor 位置
9. **Async / cross-field 驗證 defer 到 submit**——某些驗證無法在 blur 當下完成(如「名稱是否重複」需要 API 查詢、跨欄位邏輯如「結束日不得早於開始日」),這些在 submit 時統一判斷。若有錯誤,同樣 anchor 到第一個出錯欄位。

**Double-submit 防護(2026-07-05 D4 codify,規則 9 的必然配套)**:async onSubmit 進行期間,重複 submit(連點按鈕 / 連按 Enter)一律忽略——否則業務層被並發呼叫兩次(重複建立資源的經典事故)。submit 期間狀態以 `isSubmitting` 暴露(餵 Button loading / disabled;`submitDisabled` 同步為 true);onSubmit 拋錯時先復位 `isSubmitting` 再讓錯誤原樣上拋(不吞錯,表單回到可重送狀態)。對齊 react-hook-form `formState.isSubmitting` / Polaris / Mantine form submitting 內建。 <!-- @benchmark-unverified -->

### 驗證分層

| 層級 | 負責者 | 時機 | 範例 |
|---|---|---|---|
| **格式驗證** | Field 元件自身 | blur | email 格式、URL 格式、必填檢查 |
| **業務驗證** | Form 層 / 應用層 | submit | 名稱不可重複(API)、跨欄位邏輯 |

兩者都透過 `error` prop / Field context 的 `invalid` 呈現,視覺上一致(紅框 + error message)。

### 可執行層:`useFormValidation`(2026-07-03,本 spec 的 executable arm)

上表 9 條方法論已編成 **`useFormValidation` hook 的不可配置預設**(`Field/use-form-validation.ts`,public export)——consumer 拿到就是 canonical 行為,**沒有 API 可以違反**(M17「SSOT 必可傳播」:方法論從 prose 變 executable)。

**實作基礎**:基於 react-hook-form(direct dependency,**完全 wrapped 不外露** —— consumer 不 install、不 import、看不到 RHF API;對齊 DS「基於 X」引擎慣例:DataTable 基於 TanStack / DatePicker 基於 react-day-picker / Toast 基於 sonner)。RHF 提供 state / dirty 深比對 / errors store;驗證**時機**由本 hook own(RHF 的 mode / reValidateMode 不外露 = 不可配錯)。世界級對照:Atlassian `@atlaskit/form` 包 react-final-form 同構;MUI 靠第三方 binding(react-hook-form-mui)達成,本 DS 做成第一方。 <!-- @benchmark-unverified -->

```tsx
const form = useFormValidation({
  initialValues: { name: '', email: '' },
  intent: 'update',                         // 'create'(default)| 'update' → submitDisabled 規則
  validate: { email: (v) => !v.includes('@') ? 'Email 格式不正確' : undefined },  // 格式層(blur)
  onSubmit: async (values) => {             // 業務層(submit);回傳 field-keyed errors = 規則 9
    if (await nameTaken(values.name)) return { name: '名稱已存在' }
  },
})
<Field invalid={!!form.errors.name}>        {/* Field 層零耦合:一行接 context */}
  <FieldLabel>名稱</FieldLabel>
  <Input {...form.getInputProps('name')} />
  <FieldError>{form.errors.name}</FieldError>
</Field>
<Button type="submit" disabled={form.submitDisabled}>儲存</Button>
```

| 功能(規則) | 實作位置 |
|---|---|
| Blur validation timing(1/2/6)+ Edit 清 error(5)+ Escape 回復(4) | **`useFormValidation` 內建(不可配置)** |
| Submit 全驗 + anchor 第一個錯誤(7/8)+ 業務/async 錯誤同軌(9) | **`useFormValidation.handleSubmit` 內建** |
| Dirty tracking + Submit button 狀態(Create/Update) | **`useFormValidation.submitDisabled`** |
| Double-submit 防護 + submit 進行中狀態(規則 9 配套) | **`useFormValidation.handleSubmit` 重入 guard + `isSubmitting`** |
| Field error visual(紅框 + FieldError) | Field 元件 `invalid` context(既有,hook 不侵入) |

**v1 邊界**(誠實 documented):(a) `getInputProps` 支援 value/onChange 型控件(Input / Textarea / NumberInput / Select / Combobox / DatePicker / TimePicker;onChange 收 event 或裸值皆可);Checkbox / Switch(onCheckedChange)用 `setFieldValue` 自接。(b) focus-first-error 以 DOM `name` 屬性定位 —— native input 生效;非 native 控件 focus 略過(error 視覺仍由 Field 紅框 + FieldError 呈現)。(c) 不用 hook 的 consumer 仍可全手動(Field `invalid` prop 是 engine-agnostic 的,見 field.spec.md 定位)。

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

**(1) Blur-only validation(non-onChange)— 對齊 Polaris / Carbon「don't validate while typing」** <!-- @benchmark-unverified -->

Ant Design default `validateTrigger=['onChange', 'onBlur']` 對使用者 aggressive — 才打「user@」就跳「invalid email」碎念,reader 思路被打斷。Polaris / Carbon / iOS / Atlassian 共識 onBlur + submit,讓使用者「先表達完意圖再評斷」。

捨棄 onChange 即時驗證的代價是「打錯看不到反饋」(打到第 3 位才發現密碼太短)——本 spec 規範 default 行為(blur + submit);DS 目前無 onChange hint API。

**(2) Edit 清 error + blur 重驗(已出錯後),非 onChange 重驗 — 對齊 Carbon / Atlassian 兩階段哲學** <!-- @benchmark-unverified -->

Material/Polaris/Ant 已出錯後 onChange re-validate(改第 1 字 error 又跳回)— 給使用者壓力。Carbon / Atlassian「edit 清 + blur 重驗」哲學:給使用者完整修正空間,離開時才再判決。

對應使用者心智:「修改」是過程,「離開 field」是動作完成的 boundary,在 boundary 評斷比每字評斷尊重 user agency。

**(3) Create always-enabled / Update disabled-until-dirty 不對稱 — 對齊 Stripe / Notion / Linear 現代慣例** <!-- @benchmark-unverified -->

Ant 對「Create」也 disabled-until-dirty(填了所有 required 才亮)— 但這讓使用者第一次進 form 看到 disabled button 困惑「為什麼按不了」。Stripe / Notion / Material 共識:Create 永遠 enabled — 點擊後若 invalid,顯示 error 並 scroll,使用者明確知道為什麼。

Update 場景反向:沒改的 Update 沒提交意義(對齊「intent 才 commit」),disabled 表達「等你做動作」比 enabled 後點擊判斷「沒變化」更直接。對齊 Notion 設定頁 / Figma file rename 慣例。 <!-- @benchmark-unverified -->

**(4) 格式驗證 vs 業務驗證分層(blur vs submit)— 對齊 Material/Carbon「local vs cross-cutting validation」哲學** <!-- @benchmark-unverified -->

Email 格式 / URL 格式 / 必填等「single-field 純 syntax」blur 即可判斷;名稱重複(API 查)/ 結束日 ≥ 開始日(跨欄位)等「business / async」必須 submit 才能判 — 強行 blur 觸發 API 對使用者體驗差(每換 field 一次 API call)。

對齊 Material `<TextField error>` + Form layer error 分層 / Carbon「format vs business」雙軌。視覺一致(都紅框 + error message)避免 reader 區分「為什麼這個 error 是 blur 出來那個是 submit 出來」。 <!-- @benchmark-unverified -->

## 禁止事項

- ❌ 在 onChange 即時 re-validate(已出錯後)— 違反「edit 清 error + blur 重驗」哲學,給使用者壓力
- ❌ 對 Create form 用 disabled-until-dirty Submit button — 第一次進 form 看到 disabled CTA 困惑,改為 always-enabled + submit 後 scroll-to-error
- ❌ Update form 用 always-enabled Submit — 沒改的 Update 沒提交意義,違反「intent 才 commit」
- ❌ 對 single-field syntax(email / URL / required)用 submit-time API validation — 浪費 round-trip,blur 即可判
- ❌ 對 business / async / cross-field 用 blur-time validation — 每換 field 觸 API call 體驗差,submit 才判
- ❌ 不同 validation 來源用不同視覺(blur 黃框 / submit 紅框)— 視覺必一致,user 不需區分「為什麼是 blur 來的」

## A11y 預設

Form validation 的 ARIA / 鍵盤行為(對齊 WCAG 3.3.1 Error Identification + 3.3.3 Error Suggestion):

- **Error message ARIA**:`<FieldError>` 容器 id = `{fieldId}-error`(fieldId 為 Field 的 `id` prop / `useId`,field.tsx:174),控件經 Field context 自動接 `aria-errormessage`(有 error 時指向 errorId)+ `aria-invalid="true"`;`aria-describedby` 保留給 FieldDescription(descriptionId)。SR 在 focus field 時可得 label + error 完整資訊;接線 SSOT 見 `field.spec.md`「驗證與 aria 屬性」段(input.tsx:187-190)
- **Submit error scroll**:submit 失敗後,focus 自動 jump 到第一個 invalid field(`field.focus()` + `scrollIntoView({block: 'center'})`);對齊 Material / Atlassian 慣例 <!-- @benchmark-unverified -->
- **Error live region**:跨欄位 / async error 用 `aria-live="polite"` 容器宣告 — SR 在空閒時讀出,不中斷使用者打字
- **Required indicator**:label 的 `*` 為純視覺、對讀屏隱藏(`aria-hidden="true"`,field.tsx:395);required 語意由內部輸入控件的 `aria-required`(input.tsx:188)承擔,避免讀屏讀出「asterisk」語義不清
- **Color-only error 警告**:error border 紅色之外必有文字訊息(WCAG 1.4.1 不僅靠顏色)— 由 `<FieldError>` 文字承擔;DS **不**在 input 內放 error 狀態 icon(見 `field-controls.spec.md`「禁止事項」)

## 相關

- `field.spec.md` — Field wrapper 的 error 視覺 chrome(紅框 + error message slot)
- `field-controls.spec.md` — form control 共用 state(disabled / readonly / invalid)
- `../Input/input.spec.md` — `aria-required` / `aria-invalid` 實作端(input.tsx)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `combobox.spec.md`
- `date-picker.spec.md`
- `field-controls.spec.md`
- `field.spec.md`
- `link-input.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`
