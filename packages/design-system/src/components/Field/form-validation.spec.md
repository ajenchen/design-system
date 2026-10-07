
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

**更新表單送出成功後也算「沒改」**(2026-10-01,AI 依本表「沒改就不用存」推導,待辦總帳 N69;本表「何時停用」那一格的延伸,表格原文是 story-layer 漂移閘 `@submit-intent` 例外的出處、不改字):剛送出的值成為新的比對基準 —— isDirty 回 false、送出鈕再度停用、Escape(規則 4)回到**已存的值**而不是存檔前的舊值;await 期間使用者又打的字逐格重算 dirty。新建表單不重設(建立後 consumer 常要 `reset()` 回空白繼續建下一筆)。對照 Polaris Contextual Save Bar "Become visible when a form on the page has unsaved changes"(<https://github.com/Shopify/polaris-react-archive/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris.shopify.com/content/components/internal-only/contextual-save-bar.mdx#L48-L51>)、Mantine `form.resetDirty(values)`(<https://github.com/mantinedev/mantine/blob/f38933cb4f1c534600f4ff59ee3ddbb4685a4bc4/apps/mantine.dev/src/pages/form/status.mdx#L106-L119>)、react-hook-form `reset` with values updates defaultValues(<https://github.com/react-hook-form/documentation/blob/3ac1fe0254947748d993cd4b1915fc5dea87ba8b/src/content/docs/useform/reset.mdx#L38>)。
**送出鈕的焦點**:送出中(`isSubmitting` → Button `loading`)與存檔後(pristine → `disabled`)焦點都**留在送出鈕上**,不掉到 `<body>`:Button 在忙碌、或握著焦點時被停用,不轉成原生 `disabled`(`../Button/button.tsx` 可聚焦的停用;規則 `ds-canonical/references/keyboard-model-canonical.md`「按了之後自己變停用:焦點留在原處」)。2026-10-01 前 `submitDisabled` 接原生 disabled,送出那一下焦點掉到 body(N69 實測)。

### 驗證時機(Blur Validation)

所有 Field 統一使用 blur validation——使用者離開 field 時驗證，不在打字過程中即時驗證。

#### 尚未出錯的欄位

1. **Focus 中不顯示錯誤**——即使輸入內容不合法,focus 狀態不驗證、不顯示 error
2. **Blur 時驗證**——使用者離開 field 後才顯示 error(可執行層 bug fix,2026-10-01,待辦總帳 N67:因滑鼠按下 / 觸控點一下別的東西而離開時,這一格的驗證延到這一下按壓完成、click 已送出之後才跑;按住連結 / 圖片拖一段(原生拖曳,不會有 click)則在瀏覽器取消這一下按壓或拖曳結束時就補驗,「按著」不會卡住 —— 當場驗的話錯誤訊息在按下與放開之間長出來、把下方的按鈕推走,這一下點擊落空,送出 / 取消都沒發生(實測 CreateProjectForm 送出鈕被推 25px、對話框 footer 271.6 → 321.6);按到的是送出或重設就由它們接手,焦點回到這一格就不驗,鍵盤離開照舊立刻驗)
3. **Enter 等同 blur**——觸發驗證並離開編輯(適用於單行 field)
4. **Escape 取消**——回復原值，不觸發驗證。**放在 Dialog / Sheet / Popover 裡時,改過的欄位是「最內層」**(2026-10-01,待辦總帳 N68;規則與出處 `ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」,AI 推導):第一下 Escape 回復欄位、浮層不關,第二下才關;乾淨的欄位按 Escape 直接關浮層。控件自己的彈出層(可搜尋的 Select 清單、DatePicker 日曆)開著時,彈出層才是最內層 —— 那一下只關彈出層、**不**回復欄位(修前同一下兩件事都做)。機制:`getInputProps` 在欄位改過時掛 `data-escape-layer`,浮層守門 `../../lib/overlay-escape.ts` 看到就把那一下留給欄位;欄位的 Escape 先問 `isEscapeForControl`。**沒有接 `useFormValidation` 的 `<Input>` 沒有「原值」可回復,Escape 直接關浮層**(DS 內自己的對話框 / 側板表單範例因此一律接 hook,預覽看到的就是裁示的行為;結構示範與 test-only 夾具除外 —— 清單見 canonical 該節)

**為什麼 focus 中不報錯**:使用者可能才打到一半(例如 email 打了 `user@` 還沒打完),此時報錯是「提前判決」,打斷使用者思路。

#### 已出錯的欄位

5. **開始編輯時立即清除 error**——不論新輸入合法與否,只要欄位被編輯就移除 error 視覺,給使用者修正的空間
6. **Blur 時重新驗證**——離開欄位後重新判斷,如仍不合法則再次顯示 error

**為什麼不邊打邊重驗(onChange re-validation)**:逐字重驗太 aggressive——使用者才改了第一個字,error 又跳回來,感覺系統在「碎念」。清除 error 後等 blur 重驗,給使用者完整的修正空間。

### Submit 驗證

7. **Submit 驗證全部**——點擊 submit 時對所有欄位執行驗證(不依賴個別 field 的 blur 狀態)
8. **Anchor 到第一個錯誤**——若有任何欄位出錯,scroll 並 focus 到**被送出的那張表單裡**的第一個錯誤欄位(以 DOM `name` 定位,哪些控件定位得到見下方「v1 邊界」(b);同頁另一張表單的同名欄位不算 —— 經 `getInputProps` 接線的欄位有沒有 `<form>`、送出時帶不帶 event 都一樣,其餘控件見 (b),2026-10-01 code 同步;**「第一個」= DOM 視覺順序**,非 validate key 宣告順序;對齊瀏覽器原生 reportValidity + react-hook-form shouldFocusError,2026-07-07 code 同步)。多次 submit 重試時,每次都重新驗證全部欄位並重新計算「第一個錯誤」(rule 7 的自然結果),不保持上次 anchor 位置
9. **Async / cross-field 驗證 defer 到 submit**——某些驗證無法在 blur 當下完成(如「名稱是否重複」需要 API 查詢、跨欄位邏輯如「結束日不得早於開始日」),這些在 submit 時統一判斷。若有錯誤,同樣 anchor 到第一個出錯欄位。

**Double-submit 防護(2026-07-05 D4 codify,規則 9 的必然配套)**:async onSubmit 進行期間,重複 submit(連點按鈕 / 連按 Enter)一律忽略——否則業務層被並發呼叫兩次(重複建立資源的經典事故)。submit 期間狀態以 `isSubmitting` 暴露(餵 Button loading / disabled;`submitDisabled` 同步為 true);onSubmit 拋錯時先復位 `isSubmitting` 再讓錯誤原樣上拋(不吞錯,表單回到可重送狀態)。`isSubmitting` 是這段生命週期的唯一 state owner。

### 驗證分層

| 層級 | 負責者 | 時機 | 範例 |
|---|---|---|---|
| **格式驗證** | Field 元件自身 | blur | email 格式、URL 格式、必填檢查 |
| **業務驗證** | Form 層 / 應用層 | submit | 名稱不可重複(API)、跨欄位邏輯 |

兩者都透過 `error` prop / Field context 的 `invalid` 呈現,視覺上一致(紅框 + error message)。

### 可執行層:`useFormValidation`(2026-07-03,本 spec 的 executable arm)

上表 9 條方法論已編成 **`useFormValidation` hook 的不可配置預設**(`Field/use-form-validation.ts`,public export)——consumer 拿到就是 canonical 行為,**沒有 API 可以違反**(M17「SSOT 必可傳播」:方法論從 prose 變 executable)。

**實作基礎**:基於 react-hook-form(direct dependency,**完全 wrapped 不外露** —— consumer 不 install、不 import、看不到 RHF API;同 DataTable 基於 TanStack / DatePicker 基於 react-day-picker / Toast 基於 sonner 的 engine-wrapper 邊界)。RHF 提供 state / dirty 深比對 / errors store;驗證**時機**由本 hook own(RHF 的 mode / reValidateMode 不外露 = 不可配錯)。Consumer 只依賴 DS form contract，不依賴底層 engine API。

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
| Blur validation timing(1/2/6)+ Edit 清 error(5)+ Escape 回復(4;原值 = dirty 比對基準:掛載時的 `initialValues`,更新表單送出成功後 = 剛送出的值 —— 回復後該欄算沒改過、清掉該欄錯誤;放在浮層裡第一下只回復、第二下才關,見規則 4) | **`useFormValidation` 內建(不可配置)** |
| Submit 全驗 + anchor 第一個錯誤(7/8)+ 業務/async 錯誤同軌(9) | **`useFormValidation.handleSubmit` 內建** |
| Dirty tracking + Submit button 狀態(Create/Update) | **`useFormValidation.submitDisabled`** |
| Double-submit 防護 + submit 進行中狀態(規則 9 配套) | **`useFormValidation.handleSubmit` 重入 guard + `isSubmitting`** |
| 更新表單送出成功 → 剛送出的值成為新基準(「Submit Button 狀態」段) | **`useFormValidation.handleSubmit` 成功路徑內建**(`reset(snapshot, { keepValues })` + 逐格重算) |
| Field error visual(紅框 + FieldError) | Field 元件 `invalid` context(既有,hook 不侵入) |

**v1 邊界**(誠實 documented):(a) `getInputProps` 支援 value/onChange 型控件(Input / Textarea / NumberInput / Select / Combobox / DatePicker / TimePicker / Rating;onChange 收 event 或裸值皆可)。這幾個控件都把 consumer 的 `onKeyDown` / `onBlur` **先跑再走自己的**、把 `name` 與 `data-*` 轉到帶焦點的元素(2026-10-01 修:Combobox 原本解構時把 name / onBlur / onKeyDown / data-* 全丟掉,規則 2 / 4 / 8 一條都到不了它(待辦總帳 N82);DatePicker / TimePicker / LinkInput 原本 `{...props}` 在後,consumer 的 onKeyDown 整支蓋掉元件的,鍵盤打不開面板)。觸發欄位 + 它的彈出層算**同一個欄位**(`../../lib/composite-field-focus.ts`,待辦總帳 N83):開啟時焦點搬進浮層不算離開,規則 2 的驗證只在真的離開時跑 —— 修前一開清單 / 日曆 / 面板,必填錯誤就長出來。**LinkInput 不在清單**:它的連結狀態不渲 `<input>`,`getInputProps` 帶的 name / 歸屬標記 / Esc 層 / handler 到不了(實測:連結狀態下改過的值按 Esc 不回復,表單那一層輪不到;規則 8 也找不到帶 name 的元素);要接上得先定它在連結狀態的欄位語意(待辦總帳 N85)。Checkbox / Switch(onCheckedChange)用 `setFieldValue` 自接。**`getInputProps` 是一整組,覆寫其中的 handler 要轉呼叫原本那一支**:`<Input {...form.getInputProps('title')} onKeyDown={(e) => { titleProps.onKeyDown(e); …自己的事 }} />`(WM CreateWorkItemDialog、AgentRenameDialog 的寫法)—— 欄位改過時同一組還帶著 Esc 層宣告(`data-escape-layer`),浮層因此把第一下 Esc 留給欄位回復;只蓋掉 `onKeyDown` 不轉呼叫,回復就沒人做。這種寫法不會困住使用者:浮層守門在這一下派送完發現沒有控件認領,照常關掉這一層(`../../lib/overlay-escape.ts` 檔頭「宣告 ≠ 處理」,2026-10-07;修前五下 Esc 都關不掉對話框),只是規則 4 的回復沒了。(b) focus-first-error 以 DOM `name` 屬性定位,**只認這個 hook 實例自己的欄位**:`getInputProps` 在控件上掛 `data-form-validation`(值 = hook 實例 id,控件的 `{...props}` 把它轉到帶 name 的元素或其外層),所以不靠 `<form>`、也不靠 submit event —— 沒有 `<form>`、footer 按鈕 `onClick={() => form.handleSubmit()}` 的對話框同樣落在自己的欄位。找到帶該 name 的元素就 focus + 捲到中間(native input;Rating 根節點帶 name 且 `tabIndex=0`,見 `../Rating/rating.spec.md`「放入 Field 的可組合性」;桌機 Select 的 mirror,見 `../Select/select.spec.md`「原生表單參與」段);控件沒有帶 name 的元素就不移焦點、也不捲動(error 視覺仍由 Field 紅框 + FieldError 呈現)。沒走 `getInputProps` 的控件(Checkbox / Switch 用 `setFieldValue` 自接、自己寫 `name`)沒有這個標記:只在 submit event 所在的 `<form>` 內找,沒有 `<form>` 可界定時找整頁沒被其他表單標記的第一個同名元素。(c) 不用 hook 的 consumer 仍可全手動(Field `invalid` prop 是 engine-agnostic 的,見 field.spec.md 定位)。

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

**(1) Blur-only validation(non-onChange)**

Ant Design default `validateTrigger=['onChange', 'onBlur']` 對使用者 aggressive — 才打「user@」就跳「invalid email」碎念,reader 思路被打斷。Polaris / Carbon / iOS / Atlassian 共識 onBlur + submit,讓使用者「先表達完意圖再評斷」。

捨棄 onChange 即時驗證的代價是「打錯看不到反饋」(打到第 3 位才發現密碼太短)——本 spec 規範 default 行為(blur + submit);DS 目前無 onChange hint API。

**(2) Edit 清 error + blur 重驗(已出錯後),非 onChange 重驗**

Material/Polaris/Ant 已出錯後 onChange re-validate(改第 1 字 error 又跳回)— 給使用者壓力。Carbon / Atlassian「edit 清 + blur 重驗」哲學:給使用者完整修正空間,離開時才再判決。

對應使用者心智:「修改」是過程,「離開 field」是動作完成的 boundary,在 boundary 評斷比每字評斷尊重 user agency。

**(3) Create always-enabled / Update disabled-until-dirty 不對稱**

Ant 對「Create」也 disabled-until-dirty(填了所有 required 才亮)— 但這讓使用者第一次進 form 看到 disabled button 困惑「為什麼按不了」。Stripe / Notion / Material 共識:Create 永遠 enabled — 點擊後若 invalid,顯示 error 並 scroll,使用者明確知道為什麼。

Update 場景反向:沒改的 Update 沒提交意義(「intent 才 commit」),disabled 表達「等你做動作」比 enabled 後點擊才判斷「沒變化」更直接。

**(4) 格式驗證 vs 業務驗證分層(blur vs submit)**

Email 格式 / URL 格式 / 必填等「single-field 純 syntax」blur 即可判斷;名稱重複(API 查)/ 結束日 ≥ 開始日(跨欄位)等「business / async」必須 submit 才能判 — 強行 blur 觸發 API 對使用者體驗差(每換 field 一次 API call)。

兩類 error 共用紅框 + error message 視覺，使用者不需先辨認錯誤是 blur 還是 submit 產生；差異只在驗證 ownership 與觸發時機。

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
- **Submit error scroll**:submit 失敗後,focus 自動 jump 到被送出那張表單的第一個 invalid field(`field.focus()` + `scrollIntoView({block: 'center'})`;定位得到哪些控件見「v1 邊界」(b))
- **Error 宣告**:`<FieldError>` 為 `role="alert"`(隱含 `aria-live="assertive"`,field.tsx:468)——error 文字一出現即由 SR 宣讀;children 有值才渲染(children-gated,非讀 Field.invalid)。錯誤**不**另設 `aria-live="polite"` 容器(送出成功的 polite 宣告由 `<Toaster />` 的朗讀區承擔,見下一條),跨欄位 / async error 亦透過對應 field 的 `<FieldError>` 呈現
- **Submit 成功宣告**(WCAG 4.1.3 Status Messages):**送出成功 → Toast**(user 2026-10-01 逐字:「以上噎一律處理到完美，然後送出成功跳提示」;待辦總帳 N64 已決)。在 onSubmit 的成功路徑呼叫 `toast({ variant: 'success', title })`(`../Toast/toast.spec.md`:操作結果短暫回饋 / success 用於「確認動作已完成」;不帶 `action` → 預設 4000ms,不另傳 duration;業務驗證回傳錯誤或 onSubmit 拋錯時不跳),讀屏由 `<Toaster />` 的 polite 朗讀區宣讀(toast.spec.md「DS 自帶完整 announcer」:consumer 不應另建 live region),表單內**不**自建 `role="status"`。文案用 toast.spec 範例的「名詞 + 已 + 動詞」句型(「專案設定已儲存」「專案已建立」「評分已送出」;Polaris "noun + verb",<https://github.com/Shopify/polaris-react-archive/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris.shopify.com/content/components/internal-only/toast.mdx#L81-L88>;Carbon success notification "Confirm a task was completed as expected",<https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/notification/usage.mdx#L169>)。範例 `field.stories.tsx` UpdateProjectSettingsForm / CreateProjectForm、`../Rating/rating.stories.tsx`「包在 Field 內」,以及放在浮層裡、送出成功就關閉的四則:`../Dialog/dialog.stories.tsx`「表單」(「專案已建立」)、`../Sheet/sheet.stories.tsx`「建立新專案」(「專案已建立」)/「編輯成員詳情」(「成員資料已儲存」)、`../AgentPanel/agent-panel.stories.tsx` 網址註冊表的任務對話框(「任務已儲存」/「任務已建立」)(每個 story root 掛一個 `<Toaster />`,toast.spec.md 允許;2026-10-07 補齊後四則 —— 前一版只有前三則跳提示,獨立驗證抓到)。**送出成功就關閉的浮層表單**:先 `toast()` 再關;建立表單每次**打開**那一刻 `reset()` 回到空白、更新表單打開時 `reset()` 回到最後存下的值(AI 推導:關閉當下不清,收起動畫期間欄位不會先閃掉;修前送出後再打開,上一次打的字還在)。hook 本身不加 toast 選項:表單層對回饋零耦合,文案屬於 consumer。2026-10-01 前的做法(表單內 `role="status"` 朗讀區「已儲存 ✓」)已撤
- **Required indicator**:label 的 `*` 為純視覺、對讀屏隱藏(`aria-hidden="true"`,field.tsx:395);required 語意由內部輸入控件的 `aria-required`(input.tsx:188)承擔,避免讀屏讀出「asterisk」語義不清
- **Color-only error 警告**:error border 紅色之外必有文字訊息(WCAG 1.4.1 不僅靠顏色)— 由 `<FieldError>` 文字承擔;DS **不**在 input 內放 error 狀態 icon(見 `field-controls.spec.md`「禁止事項」)

**空值 / Loading(明文 N/A)**:本 spec 是跨 Field 控件的驗證時機原則(非 UI 元件)——空值渲染與 loading 狀態分屬各控件 spec(SSOT → `field-controls.spec.md`「null / undefined 值」+「Loading state」段)。

## 相關

- `field.spec.md` — Field wrapper 的 error 視覺 chrome(紅框 + error message slot)
- `field-controls.spec.md` — form control 共用 state(disabled / readonly / invalid)
- `../Input/input.spec.md` — `aria-required` / `aria-invalid` 實作端(input.tsx)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `checkbox.spec.md`
- `combobox.spec.md`
- `date-picker.spec.md`
- `field-controls.spec.md`
- `field.spec.md`
- `link-input.spec.md`
- `select.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`
