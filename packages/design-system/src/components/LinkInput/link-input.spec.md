---
component: LinkInput
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design Input: github.com/ant-design/ant-design/tree/master/components/input
  - MUI TextField: github.com/mui/material-ui/tree/master/packages/mui-material/src/TextField
---

# LinkInput 設計原則

## 定位

LinkInput 是 **URL 的**輸入與顯示元件。外觀基於 Input，但 value 以藍色連結樣式呈現，可直接點擊開啟。核心互動差異：**點擊 value 是開啟連結，不是進入編輯**。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 LinkInput 特有的原則。

## Controlled-only rationale(Dim 26)

本元件採 **controlled-only**:`value` + `onChange`,不支援 `defaultValue` uncontrolled fallback(value pair V1)。對齊 Field 家族 canonical(Combobox / DatePicker / TimePicker / SelectMenu 同,rationale 見各 spec 同名段);LinkInput 內部另有「連結顯示 ↔ 編輯中」狀態與 `value` 雙向 sync,dual-mode 會引入 race condition。未來要改 dual-mode 需 `useControllableState` helper,屬 major API 擴充。

**Layout Family**：本元件是 `components/Field/field-controls.spec.md` 所擁有的 **Family 4（Field control layout）** 消費者。結構繼承其 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## 何時用

- **需要儲存的外部 URL**：網站連結、文件 URL、repo 地址、社群連結
- **顯示時使用者希望直接點開**：在 readonly / table cell / 設定頁可點擊開啟
- **需要 URL 格式驗證**（blur 時驗證 protocol + 結構）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 純字串 slug（`my-project-name`）| `Input` | 不是完整 URL，不需驗證 protocol 與點擊開啟 |
| Email 地址 | `Input` + `type="email"` | Email 不是 URL,`mailto:` 點擊體驗取決於 OS 設定,非核心需求 |
| 內部 React Router 路徑 | `Input`（或自訂元件）| Router 路徑不是絕對 URL,LinkInput 的 protocol 驗證會 false reject |
| Markdown 連結（顯示文字 + URL）| 自訂編輯器 | LinkInput 只處理 URL value,不處理 display text 搭配 |
| URL 清單（多個 URL）| 多個 LinkInput 或自訂清單元件 | 單一 LinkInput 一次一個 URL |

---

## 兩種顯示狀態（edit mode 內）

### Link 狀態

有合法 URL 且未在編輯中時：
- value 以 `text-primary` 藍色顯示，hover 加底線，點擊開啟連結
- **連結盒子 = 網址文字本身**：連結只有文字那麼寬，太長時縮到欄寬並截斷；不撐滿整行(所有模式;由連結自己保證,`link-input.tsx` `renderLinkAnchor` 的 `inline-block max-w-full align-top`,不靠外層排版;2026-10-13 前是 `block`,待辦總帳 Q3a)。**點擊範圍 = 框裡 Pencil 以外全部**(2026-11-06 原地改寫,依據 user 2026-11-06 原話「照①乙②b」,回覆決策頁 n8;user 10-29 原則原話「…框內非按鈕或是連結的地方到底點擊後該觸發什麼 我認為應該是最常被用的功能 然後link input類的東西應該是開啟連結」):
  - **能不能編輯都一樣**:框裡不是按鈕的地方(網址文字、右側空白、內距)點了都開連結 —— 編輯模式的連結狀態(外殼含看得見的 1px 邊框)、readonly、view(有沒有 `viewEditAction` 都一樣;裸 view 是那一行)、DataTable 網址格(整格)。滑過整框就出網址底線 + 手形:**滑過有變化的範圍 = 點擊範圍**(`../../../ds-canonical/references/hit-area-canonical.md`「懸停回饋 ≡ 命中區」);編輯模式外框滑過變深是 Field 家族共用外觀,照留(變色的地方都點得開);DataTable 網址格同一條:**能編輯**的格滑過出淺框(`../Field/field.spec.md` L4,意思 = 這格可以編輯),**不能編輯**的不出(同 readonly)(2026-11-10 user「表格跟輸入框難道不應該是類似的邏輯嗎？…這樣不是跟輸入框一致？」;11-06 – 11-10 表格有連結的格一律不出)。做法 = 延伸連結:連結自己的 `::before` 鋪滿最近的定位祖先(`renderLinkAnchor` 的 `stretch` + `data-link-stretch`;框是 `relative`,表格由 `linkHitAreaFromHost` 交給格;用 ::before 讓文字那一層照樹的順序畫在上面,不另開 z 值),所以中鍵 / Ctrl+點 / 右鍵選單都是真的連結(Bootstrap `.stretched-link` 同一招,它用 ::after:https://github.com/twbs/bootstrap/blob/v5.3.3/scss/helpers/_stretched-link.scss#L1-L15)。表格試算表模式沒選中的格第一下仍只選格(`../DataTable/data-table.spec.md`「Navigate-valued cell 通用類別」第 1 條)
  - **能編輯的地方,Pencil = 滑鼠唯一的編輯入口**(下一條);鍵盤照「A11y 預設」段,不變
  - **沒有合法網址就沒有連結可開**:編輯模式空值 / 不合法 = 直接是輸入框(「Input 狀態」),點框 = 打字;DataTable 可編輯的網址格空值 / 不是網址 = 照其他可編輯格(滑過淺框、點格進編輯);readonly / view 的空值與一般文字沒有反應。同一條 user 原則推得:框裡沒有連結時,最常用的就是填網址【AI 推導】
- 右側 Pencil inline action 觸發編輯模式,是能編輯的地方唯一的滑鼠編輯入口(畫在延伸區上面)。演進:2026-09-26 – 11-06 是「點外框裡其他地方 = 按 Pencil」(user 2026-09-26 要 AI 先研究世界級網址欄的做法、確認沒有分歧再照建議做 —— 原話逐字見 `governance/planning/2026-09-25-interaction-and-hover-remediation.md`「其餘建議」條;之後 AI 照研究做;那份研究的「一手來源沒有一家從空白處開連結」說得太滿,11-03 n8 研究更正),11-06 改成上一條
- 在框裡按下後拖動 = 拖連結(瀏覽器原生),不開連結、不進編輯
- 點擊 value 是開啟連結，不是編輯——這是 LinkInput 與 Input 的核心互動差異;「value」= 框裡 Pencil 以外的地方

**世界級對照**(點網址文字開連結;框裡空白處各家做法不同,本 DS 照上方 user 原則給開連結):
- Atlassian inline-edit 的讀取態：點到連結照連結原本的行為，點讀取區其他地方進入編輯 —— [`read-view.js#L27-L37`](https://cdn.jsdelivr.net/npm/@atlaskit/inline-edit@16.4.5/dist/es2019/internal/read-view.js)「If a link is clicked in the read view, default action should be taken」，非連結的點擊 `onEditRequested()`；點擊入口只到滑過範圍為止([`CHANGELOG.md` 4.5.5](https://cdn.jsdelivr.net/npm/@atlaskit/inline-edit@16.4.5/CHANGELOG.md)「fix inline-edit component edit mode triggering when clicking outside hover width」)
- Notion URL 屬性：點網址開啟、不進入編輯，編輯另有滑過才出現的按鈕 —— [2021-09-08 release note](https://www.notion.com/releases/2021-09-08)「Clicking the URL opens that page in your web browser, rather than selecting the property for editing. And there's a new Edit URL button that appears when you hover over the property with your cursor.」
- Salesforce Lightning Design System 記錄詳情：`<a>` 只包住值的文字，編輯是另一顆鉛筆鈕(`Edit: ${label}`)—— [`record-detail/index.jsx#L64-L96`](https://github.com/salesforce-ux/design-system/blob/cb91709d48074a8422a968fecda298a8bc715749/ui/components/form-element/record-detail/index.jsx#L64-L96)

### Input 狀態

正在編輯、無值、或 URL 格式不合法時：
- 外觀與 Input 一模一樣（bareInput + placeholder）
- blur 時驗證格式，合法則自動切回 link 狀態
- 格式不合法維持 input 狀態 + error 邊框 + 框下一行錯誤說明，直到格式正確(見「驗證」段「錯誤說明」)
- 開了 `clearable`、框裡有字時右側有清除 ×(按下 = 清草稿、留在輸入框;見「驗證」段「可清除(clearable)」)

### View 模式幾何（不包 wrapper）

`mode="view"` 預設（`showDisplayEndIcon=false`）渲染**裸 anchor / span**——不包 `fieldWrapperStyles`（無 h-field 高度；左側 0 與 `../Field/field-controls.spec.md` 共享 contract (d)「view×default 左側歸 0、值齊標籤」結果相同,2026-10-21 起高度以外不再是例外）（2026-07-16 VERIFY 記錄為例外而非對齊 code;預設 false 的理由 = 檢視態只顯示值,跟表格 2026-07-08 A 案同一方向(user 2026-11-17 採 AI 建議甲「維持預設不畫」)—— 見 `../Field/field-controls.spec.md`「LinkInput / PeoplePicker 預設 view 路徑不包 wrapper」）。需要與 cell edit 像素對齊時走 `showDisplayEndIcon=true` opt-in（Field naked wrapper 包覆 anchor）。typography 仍消費 contract (e)（`fieldDisplayTextClass`）。**檢視態的編輯入口(`viewEditAction`,目前只有 DataTable 可編輯的連結格用)**:給了才在外殼裡畫右側槽(`ItemSuffix`)+ 一顆 Button `iconOnly` `variant="text"` `size="xs"`「編輯連結」(24、無框;網址 → 鈕吃外殼 `gap-2`;以後加複製放同一個槽、多顆 `gap-2`)—— 依模式自己換:欄位編輯態的鉛筆是行內小按鈕 `ItemInlineAction`,表格格(naked × view)是這顆;單一主人,表格不另外畫。`revealGroup` 給了 = 只在那個群組滑過 / 鍵盤焦點時出現(瞬間、不淡入);鈕自己 `stopPropagation`,按下呼叫 `onClick`(宿主決定怎麼進編輯);外層帶 `data-link-edit-entry`(宿主找它做編輯結束的焦點歸還)。依據 `../../patterns/element-anatomy/inline-action.spec.md` 實例表「DataTable body cell internal — 檢視態滑過才出現的動作」(user 2026-10-28「Q4用乙'」)。

---

## 驗證

遵循 Field 共用驗證標準（blur validation）：

1. **blur 時驗證**——使用者離開 field 時才檢查格式
2. **開始打字時清除 error**——輸入任一字元即移除錯誤狀態(Escape 還原原值亦清除);單純重新 focus 不清除
3. **Enter 提交**——結算草稿(等同離開 field 的驗證):合法 → 提交、切回連結狀態,焦點給鉛筆;網址無效 → 紅框、**焦點留在輸入框**;清空 → 清值、留在輸入框。2026-10-01 前 Enter 走 `blur()`,網址無效 / 清空時焦點掉到 `<body>`(實測);同日第一版在 keydown 當下同步聚焦鉛筆又沒 preventDefault,同一下 Enter 的 keypress 落到鉛筆上把編輯重開 —— 現改走 `../Field/field-edit-keys.ts` `editSettleKeyProps`(全 DS 就地編輯鍵盤結算 SSOT:IME guard + preventDefault),焦點在 commit 之後、只在真的掉了才搬
4. **Escape 取消編輯**——回復原值，不觸發驗證;焦點給鉛筆(同 `../InlineEdit/inline-edit.spec.md`「退出 edit 態(focus 分流)」)。**正在編輯、或有打了還沒存的字,是焦點所在控件自己的一層**(2026-10-01;`ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」):放在 Dialog / Sheet 裡第一下 Esc 只取消、浮層不關,第二下才關;它是同一個 `<input>` 上比 consumer 自己接的 `onKeyDown` 更內層的一層 —— 先收它,consumer 的 Esc 下一下才輪到(表單引擎目前接不上 LinkInput,見下段)

**不在 `useFormValidation` `getInputProps` 的 v1 支援清單**(`../Field/form-validation.spec.md` v1 邊界 (a),2026-10-01 實測):連結狀態不渲 `<input>`,`getInputProps` 帶的 `name` / 歸屬標記 / Esc 層 / handler 到不了 —— 連結狀態下改過的值按 Esc 不回復(表單那一層輪不到),規則 8 也找不到帶 name 的元素;從輸入狀態被表單回復成合法網址時輸入框卸載、焦點掉到對話框殼。要接上得先定它在連結狀態的欄位語意(待辦總帳 N85)。

### 錯誤說明

2026-11-22 起(user 11-22 確認頁題 1 留言「第一題可以照你建議，看哪種最SSOT且完整」= AI 建議丙:元件自帶預設說明 + 使用端可換字 + 驗證結果回呼)。`../Field/form-validation.spec.md`「驗證分層」把 URL 格式驗證歸 Field 元件自身、錯誤以「紅框 + error message」呈現,「A11y 預設」要紅框之外必有文字(WCAG 1.4.1 / 3.3.1);修前 LinkInput 自己驗出不合法時只有紅框,使用端也拿不到不合法的草稿(只在合法時呼叫 `onChange`),想寫字也寫不了。

- **何時出現**:LinkInput 自己驗出不合法時(上方第 1、3 點:離開欄位 / Enter 結算出來的),框下一行;外面存進來、本身不是網址的值也一樣,沒離開過欄位就不驗、不出這行(第 1 點;`../Field/form-validation.spec.md`「驗證時機」規則 1–2)。開始打字、按清除 ×、Esc 還原原值時跟紅框一起消失(第 2 點)。只看 LinkInput 自己的驗證:使用端給的 `error` / `<Field invalid>` 不會讓這行出現(那是使用端的錯,字由使用端給)。表格格(`naked`)不畫,格的錯誤由表格顯示(`../DataTable/data-table.spec.md` cellErrors)
- **字**:預設「請輸入網址,例如 acme.com」(句型照 DS 既有的「請輸入…」;例子用沒寫 `https://` 的寫法,因為沒寫協定也收 —— 下方 URL 格式要求)。`errorText` 換字(欄位用途比「網址」具體時,例「請貼上會議邀請裡的連結」);只能換、不能關,空字串 = 預設那句
- **長相與位置**:Field 家族的 `<FieldError>`(`text-body`、`text-error-text`、`role="alert"`)。**包在 `<Field>` 裡** = 交給 Field 的錯誤區畫(`../Field/field-context.ts` `registerControlError`):位置在說明文字(`FieldDescription`)下面、id = Field 的 `errorId`,跟使用端自己寫的 `<FieldError>` 同位置同長相;**單獨用** = 框下 4px(= Field 欄內的 `gap-1`;框與說明包在同一層,放進有 gap 的容器裡也是 4px)
- **跟使用端的錯誤誰優先**:包在 Field 裡、使用端自己的 `<FieldError>` 有字時,只畫使用端那行(一個欄位只有一行錯誤);沒字(`<FieldError>{errors.link}</FieldError>` 而 `errors.link` 是空的)才畫 LinkInput 這行。紅框照舊(任一方有錯就紅)
- **讀屏**:輸入框 `aria-invalid`,`aria-describedby` 加上這一行的 id(聚焦就念得到;WCAG 3.3.1),`aria-errormessage` 照 Field 家族指到同一行;這行出現時 `role="alert"` 播報
- **驗證結果回呼 `onInvalidChange(invalid, draft)`**:上面「何時出現」那一態有變時呼叫 —— 變成不合法 → `true`;打字、按 ×、Esc、結算成合法或空白 → `false`。`draft` 是當下框裡的字。用途:表單層要知道這格現在不合法(擋送出)、或要自己寫一段更完整的說明放進 `<FieldError>`(這時 Field 只畫使用端那行)
- **範例**:展示頁「錯誤說明」(預設字、`errorText` 換字;離開欄位後出現)、「可清除」第二則(使用端儲存時檢查出網址不合法:包在 `<Field invalid>` 裡、字放 `<FieldError>`,只出使用端那一行)

### 可清除(clearable)

2026-11-21 起(user 2026-11-19 拍板提案 A「照你建議」)。`clearable` 與 Select / Combobox / DatePicker / TimePicker 同名同語意、**預設關**;何時開照 `../Select/select.spec.md`「何時開 clearable」(「沒有網址」是有效值 —— 選填欄位 —— 才開)。

- **何時出現**:只在編輯模式的**打字狀態**(上方「Input 狀態」:正在編輯、無值、網址不合法)、**框裡有字**時,輸入框右側出現清除 ×;空白的框沒有。網址不合法、框裡有字時也有 —— 一鍵清掉重打。**連結狀態不變**:沒有 ×,右側照舊只有 Pencil;readonly / disabled / view 沒有
- **長相**:Field 家族共用的那一顆(`../Field/field-clear-button.tsx` FieldClearButton = `ItemInlineAction` X,`../../patterns/element-anatomy/inline-action.spec.md`「Real case 表」clear X 列),名稱「清除網址」(「清除 + 清掉的是什麼」,同「清除日期」「清除時間」);右緣內距照 `../Field/field-controls.spec.md`「右側元素」
- **按下**:清掉打的字(草稿)與紅框,**焦點留在輸入框**;**不**當場提交、不呼叫 `onChange`
- **之後照既有規則結算**(上方「驗證」):離開欄位或 Enter —— 空白 = 清值(`onChange('')`)、合法 = 提交、不合法 = 紅框;Esc = 還原原值(打字狀態的 Esc 層照舊,見「驗證」4)
- **焦點**:
  - 滑鼠:輸入框握著焦點時按 ×,焦點不動(擋 mousedown 預設、click 照常;`../../lib/pointer-press.ts` `keepFocusOnPointerPress`,Select / Combobox 欄位內搜尋框同一支);焦點本來不在欄位裡時,按完放進輸入框 —— 草稿已經跟值不同,得有一次離開才會結算
  - 鍵盤:× 在 Tab 序上(輸入框 → ×);`Enter` / 空白鍵按下後焦點回輸入框,不隨 × 卸載掉到 `body`(`../Field/field-wrapper.tsx` `keepFieldFocusBeforeUnmount`,Select「清除後焦點」同一支);焦點在 × 上按 `Esc` 與在輸入框裡按同一層(還原原值,浮層裡第一下只還原);鍵盤聚焦 × 時它的 tooltip 開著,第一下 `Esc` 先收 tooltip(一次只收一層),第二下才還原
  - **輸入框 ↔ × 之間移動不算離開欄位、不結算,也不呼叫 consumer 的 `onBlur`**;從 × 離開欄位(Tab 走、點別處)才結算、才呼叫一次 `onBlur`(事件的 `currentTarget` / `target` 是輸入框 —— consumer 的 `onBlur` 掛在輸入框上)(判準 = `../../lib/composite-field-focus.ts` `isWithinCompositeField`,與 Select / DatePicker「觸發欄位 + 零件 = 同一個欄位」同一支;`onBlur` 一次離開只一次,同該檔「真的離開這個欄位才轉呼叫」)
- **為什麼要這兩條焦點處理**(提案 A ②):「離開輸入框就結算」會搶在 × 之前 —— 只把 × 接上「清字」的寫法,按 × 那一下輸入框先 blur,合法的網址當場提交、切回連結狀態,× 跟著卸載,點擊落空(退出編輯)。閘 `scripts/link-input-clear-invariant.mjs`(兩面對照:拿掉「× 算同一個欄位」或「按 × 焦點不動」任一條,按 × 會退出編輯 = 紅;現行留在編輯 = 綠)

URL 格式要求：`http://` 或 `https://` 開頭的網址;**沒寫協定、但看起來就是網址的字自動補 `https://`**(主機名 = 「標籤.標籤…頂級網域」,頂級網域要是真的頂級網域,可帶埠號與路徑,例:`www.acme.com`、`acme.com/pricing`;2026-10-21 確認頁 F2 乙)。其他協定(`javascript:` / `data:` / `mailto:` / `ftp:` …)、信箱、中間有空白的字、結尾是檔案副檔名而那個副檔名不是頂級網域的檔名(`report.pdf`、`node.js`)一律不合法。判斷只有一支 `link-input.tsx` `toWebUrl`:編輯模式的驗證與提交(提交的值是補好 `https://` 的完整網址)、唯讀 / 檢視 / 表格連結格的顯示都經它。

---

## 空值

沒有 URL 時直接顯示 placeholder 並允許輸入，不需要先按 Pencil——因為沒有連結可以開。

---

## 極長 URL（邊界）

- **顯示文字 = hostname**:link 狀態預設只顯示 hostname（去 `www.`,如 `https://github.com/org/repo` → `github.com`）,非完整 URL;`label` prop 可覆寫顯示文字。完整 URL 載於 `href`
- **單行 truncate**:link / readonly / view 狀態超寬時 ellipsis 截斷,不換行;截斷時 hover 顯 tooltip 顯完整文字(僅實際截斷才顯——rule owner `components/Tooltip/tooltip.spec.md`「截斷文字 → 用 tooltip 顯示完整內容。」;anchor 內消費 `<TruncatedText>`,anchor 自身即 hover 目標,SSOT `patterns/element-anatomy/truncated-text.spec.md`)
- **編輯態**:原生 input 水平捲動,無長度上限

---

## readonly / disabled

與其他 Field 一致：
- readonly：顯示藍色連結（可點擊），無 Pencil action
- **readonly 的焦點**(2026-11-11):連結是這個欄位唯一的 tab stop —— 鍵盤聚焦 = 連結自己的全域 2px 外描邊(下方「Focus」),**欄位邊框不亮**(一個 tab stop 一個指示器;修前 `focus-within` 讓連結外描邊 + 欄位邊框兩個同時出現);滑鼠點連結兩者都不畫(唯讀欄位滑鼠點不變,規則 `../Field/field-controls.spec.md`「Focus 行為」readonly 段)
- **值不是網址時(readonly / view,含 DataTable 連結格)畫成一般文字、不給連結**(2026-10-13,待辦總帳 Q3e;2026-10-21 F2 乙):判準與編輯模式同一支 `toWebUrl`(本檔「驗證」:http(s) 開頭,或看起來像網址就補 `https://` —— 例:`www.acme.com` 畫成連結、`href` = `https://www.acme.com`),`javascript:`、`data:`、`mailto:` 等別的協定與信箱永遠不會變成 `href`。**唯一另外放行的是站內路徑**(以 `/` 開頭、解析後仍在同一個網站,例:`/projects/8821/tasks/4821`):它解析後就是本站的 http(s),修前就畫成連結,`AgentPanel` 網址登記示範的任務標題欄靠它開對話框;`//host`、`/\host` 這類會被瀏覽器正規化成別的網站的寫法不算。編輯模式不收站內路徑(只收網頁網址;上方「不適用場景」站內路由請用 Input)。DataTable 存檔時的驗證仍由 consumer 做(`../DataTable/data-table.spec.md` cellErrors),表格不另加
- disabled：連結灰化，不可點擊。**顯示的字與 readonly 同一份**(合法網址顯示主機名、其他值顯示原字串;停用只換顏色,有值不能畫成「-」—— M24):`link-input.tsx` `linkDisplayText` 一支給連結、一般文字、停用三處用(2026-10-21,r1b fields F2:修前停用另寫一份,`mailto:` / `tel:` / `javascript:` / `data:` 在停用時畫成「-」、`ftp:` 只剩主機名;閘 `scripts/link-input-url-display-invariant.mjs` 判定表「停用時字與唯讀不同」必紅)

---

## 禁止事項

- ❌ 不在 link 狀態下讓點擊 value 進入編輯——點擊連結必須開啟連結
- ❌ 不讓連結盒子撐滿整行(整框可點用延伸連結,盒子仍是文字寬)
- ❌ 不在網址框裡留下「滑過沒變化卻點得開」或「滑過有底線卻點不開」的區塊——底線 + 手形的範圍 = 點擊範圍(Pencil 除外)
- ❌ 不讓 link 狀態外框裡滑過會變色的地方點下去沒有反應——Pencil 以外都是連結
- ❌ 不在打字過程中即時驗證格式——等 blur
- ❌ 不讓紅框沒有字——LinkInput 自己驗出不合法時框下一定有一行說明(`errorText` 只能換字);包在 Field 裡時跟使用端的錯誤只出一行
- ❌ 不讓清除 × 當場提交或退出編輯——按 × 只清草稿、焦點留在輸入框,之後照「驗證」結算;焦點移到 × 不算離開欄位
- ❌ 不放行別的協定(`javascript:` / `data:` / `mailto:` …)——只有網頁網址(含補上 `https://` 的網址樣字)才是合法值

---

## 為何無 StateBehavior

LinkInput 是 **Field Controls family 成員**——互動狀態(focus / invalid / disabled / readonly)完全繼承 `../Field/field-controls.spec.md` SSOT「Mode 狀態」。LinkInput 特有的狀態(edit 輸入 vs view link-chip)已在 `Overview` 中說明。重寫 StateBehavior = 與 field-controls SSOT 漂移。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix` + `Accessibility`。互動 state 見 Input 的 `StateBehavior` + field-controls.spec.md。

---

## 相關

- `../Input/input.spec.md` — 純文字 / slug / email 等非 URL 場景
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）
- `../Field/form-validation.spec.md` — blur 驗證標準

## A11y 預設

**ARIA / Pattern**:native `<input type="url">` element 預設 a11y;label 關聯靠 `id`(`fieldCtx.id`)+ FieldLabel `<label htmlFor>`(native `for` 機制);input 上另設 `aria-invalid` / `aria-describedby`(error 時 `aria-errormessage`)。自己驗出不合法時 `aria-describedby` 另加錯誤說明那一行的 id(見「驗證」段「錯誤說明」)。

**Keyboard 行為**:

- Tab — focus
- 字母鍵 — 輸入
- Enter — 提交(見「驗證」3:合法 → 連結狀態、焦點給鉛筆;無效 / 清空 → 留在輸入框)
- Esc — 取消編輯,回復原值,不觸發驗證,焦點給鉛筆(見「驗證」4:浮層裡第一下只取消、第二下才關浮層)
- Link 狀態:Tab 依序停在連結(Enter 開啟)與 Pencil(Enter / Space 進入編輯並聚焦輸入框)。外框本身不是 tab stop(滑鼠點框 = 開連結,鍵盤走連結本身);編輯走 Pencil
- 打字狀態開了 `clearable`、框裡有字:Tab 依序停在輸入框與清除 ×(Enter / Space 清草稿、焦點回輸入框;Esc 同輸入框還原);兩者之間移動不結算(見「驗證」段「可清除(clearable)」)

**Focus**:原生 input outline 已關閉;focus 視覺提示由 Field wrapper 的 `focus-within:!border-primary` 提供(滑鼠點入也亮藍框,對齊 Field wrapper canonical)。連結(link / readonly / view 狀態,含 DataTable 連結格)與 Pencil 鍵盤聚焦時畫 DS 焦點框(全域外描邊,往外 2px),**四邊都要畫得出來**:包著連結的外殼不得用 `overflow` 裁切 —— 上方「單行 truncate」由連結自己(`inline-block max-w-full truncate` + `TruncatedText`)做,外殼只給 `min-w-0`(`link-input.tsx` `LINK_HOST_CLASS`;`../../../ds-canonical/references/focus-canonical.md`「問題二」→「正當障礙」:截斷 wrapper 不是正當障礙,修 wrapper、不改內描邊)。2026-10-21 前三處外殼寫 `truncate`,框只剩右邊一條 2px(r1b DT-01;閘 `scripts/data-table-link-cell-invariant.mjs` L8)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `data-table.spec.md`
- `field-controls.spec.md`
- `file-item.spec.md`
- `form-validation.spec.md`
- `input.spec.md`
- `textarea.spec.md`
