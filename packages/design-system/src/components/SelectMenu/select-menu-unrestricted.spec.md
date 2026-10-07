# SelectMenu「不限」選項設計原則(多選清單最上面那一列;獨立 SSOT)

> **本 spec 是 SelectMenu「不限」選項的獨立 SSOT**(2026-09-30 從 `select-menu.spec.md` 抽出「「不限」選項」整段,避免單一 spec 過長(544 行 > 500 硬上限,同待辦總帳 N19 的處理);內容零改動,只加本檔頭與一處回指 `select-menu.spec.md` 的路徑)。定位 / 架構 / 搜尋關鍵字 / Creatable / 分組 / 遠端搜尋 / Suggestions / Empty / Loading / A11y 仍住 `./select-menu.spec.md`。程式碼對應 `select-menu.tsx`(`showUnrestricted` / `handleSelect` 互斥 / 全選分母)。
>
> **Layout Family**:同 `select-menu.spec.md`(composite / multi-section);本檔不另立 family。

## 「不限」選項(2026-09-18 user 拍板)

多選可以在清單最上面加一列「不限」。**`unrestricted` 預設關**,由消費端自行開啟
(形狀比照同檔 `creatable` + `createLabel`:opt-in boolean + 另一個 label prop)。

### 「不限」不是「全選」——這是整段的核心

| | 全選按鈕 | 「不限」 |
|---|---|---|
| 意思 | **現在清單上這幾個** | **不設限**,涵蓋現在與**以後新增**的選項 |
| 存進去的值 | 每一個具體選項的值 | **一個獨立的保留值**,不展開成具體選項 |
| 使用者手動勾滿時 | 就是勾滿,**不會**自動變成「不限」 | — |
| 按「取消全選」之後 | 變成空的,**不會**自動勾「不限」 | — |

**這兩件事不可互相取代**:一個報表篩選若存的是「當下這 5 個地區」,明年多一個地區時它不會涵蓋;
存「不限」才會。反過來,若使用者真的只要這 5 個,就不該被偷偷升格成「不限」。

### 何時該開 / 何時不該開

**該開**:選單代表一種**限制條件**,而「不設限」是一個有意義的狀態,而且要涵蓋未來新增的選項。
典型:報表篩選的地區 / 類別 / 狀態、權限條件、通知範圍。

**不該開**:選單是在**挑具體標的**——要附加哪幾個檔案、把誰加進這個團隊、搬到哪個資料夾。
那裡「不限」不是一個值,是一句沒有意義的話。

**開了但一個一般選項都沒有** = 這個選單根本不給選,設定本身有問題(開發模式會警告)。

### 位置與結構

- `CommandGroup` 包成**清單的第一組**;分隔線由 `CommandGroup` 自己的規則畫在**下一組的頂端**
  (`../Command/command.tsx:263-268`;判準 owner `../../patterns/element-anatomy/item-anatomy.spec.md`
  「Group auto-separation」)。**不插 Separator、不寫新 CSS。**
- 結構先例是同檔下方的**可建立列**:同樣無標題、單獨一列、自成一組,只是它在最下面。
- ❌ **不得用 `MenuGroup`**:這一列**是選項**,要點得到、鍵盤上下鍵走得到;`MenuGroup` 的列不經 cmdk 註冊
  (那正是訊息列選它的理由,見 `../Command/command.tsx:187-189`),放這裡會變成鍵盤走不到的孤兒,
  而且它的相鄰線用 `[&+&]`(同 class 相鄰)也對不上 `CommandGroup`。

### 出現條件

兩條各自獨立的規則。

**(a) 三種訊息列的情境一律不出現** —— 載入中 / 清單真的沒東西 / 遠端還沒打字
(user 原話:「這三種狀態有需要出現不限的選項嗎?應該不用出現吧」)。

**(b) 搜尋時跟一般選項一樣照關鍵字配對** —— user 2026-09-18 原話:「如果要可以搜得到,不是應該
遠端和非遠端都搜得到嗎?但前提是關鍵字要有配對到吧?然後遠端搜尋的話,應該要等結果都回傳回來了
才一起跟其他一般選項同時秀出?」落地:

| 模式 | 誰負責比對 |
|---|---|
| 本機、浮層內搜尋框(cmdk `shouldFilter=true`)| **照渲染出來,交給 cmdk**,用 `value` + `keywords` 比,跟其他選項同一套規則 |
| 本機、搜尋字在觸發欄位(cmdk 不過濾,清單由本元件依受控 `search` 過濾)| 跟同一份清單的一般選項**同一條** `labelMatchesSearch`(見 `./select-menu.spec.md`「遠端搜尋」段首的本機過濾規則);2026-09-30 前這一種被當成「cmdk 在過濾」而整列不比對 —— 打「fo」清單出現「不限、Food」、反白在「不限」,`Enter` 就把「不限」取消了(實測) |
| 遠端(`shouldFilter=false`,cmdk 不過濾)| 自己呼叫 cmdk 公開匯出的**同一支** `defaultFilter` 比一次;「等結果回傳」由 `!optionsLoading` 保證 |

❌ **不得用兩套比對規則**:本機一套、遠端另一套會讓同一個字在兩種清單有不同結果。
cmdk 的 `defaultFilter` 是公開匯出(`node_modules/cmdk` 的 `exports`),直接消費它。
實測它對中文正常:查「不限」0.9 / 「不」0.891 / 「限」0.17 / 「zzz」0。

⚠️ **筆數與訊息列的相容性**:cmdk 的訊息列只在「筆數 = 0」時渲
(`node_modules/cmdk`:`P(u => u.filtered.count === 0) ? <div cmdk-empty> : null`)。
本機模式「不限」是會被註冊也會被過濾的普通列,筆數自然正確;遠端模式不過濾,但它只在配對到時
才渲染,所以「沒有選項」該出現時仍出得來。**兩邊都不需要 `forceMount`** ——
那會讓它不計入筆數,反而造成「不限 + 沒有選項」同時出現。

📌 **2026-09-18 修正紀錄**:原本這裡寫的是「沒在搜尋」(`isIdle`),搜尋框一有字就整列不渲染。
那**不是 user 說的**,是 AI 自己放寬的;後果是打「不限」兩個字會得到「沒有選項」,而那一列
上一秒還在第一行(實測),同時傳給它的 `keywords` 變成永遠到不了的死碼。
邊界案例:遠端搜尋時若伺服器回 0 筆、但查詢配對到「不限」,清單只列「不限」——
這是「查詢確實命中了它」的誠實結果,不出「沒有選項」。

### 互斥(三條)

1. 勾「不限」→ 清掉所有一般選項(值只剩「不限」)
2. 勾任一一般選項 → 取消「不限」
3. 取消「不限」→ 回到**未選**(不還原上一批)

寫在 `handleSelect` 一處即可:欄位上的 Tag × 碰不到「不限」(它不渲成 Tag,所以沒有它的 ×),
一鍵清空是整個清成空陣列、把它一起清掉本來就對。**這兩條既有路徑不需要改。**
關鍵字空白時按 `Backspace`(2026-10-07 待辦總帳 K1,`./select-menu.spec.md`「A11y 預設」Keyboard `Backspace` 列)刪掉的是最後一個值 ——
只選「不限」時就是它,結果是空陣列,與第 3 條「取消『不限』→ 回到未選」同一個值,不經 `handleSelect` 也不會生出矛盾的值。

### 全選按鈕

「不限」**不進**「可選選項」(它不是來自 options),所以全選狀態天然只看一般選項。
按全選前先把「不限」濾掉再交給 `applySelectAll` —— 那支共用工具的語意是「保留既有 + 追加未選」
(`../../lib/multi-select-ordering.ts`),不濾的話「不限」會跟全部一般選項並存。
❌ **不得為此修改 `applySelectAll`**:它是通用排序規則,別的使用者也在吃。
❌ **不得把「不限」塞進 options 陣列**:一塞,全選狀態的分母就多一個永遠勾不滿的東西,
按鈕的字會永遠停在「全選」、按第二次沒反應。

**任何「算有幾個選項 / 是不是全選了」的東西都要排除這一列**,判準是它身上的結構記號
`data-unrestricted`,**不是**比對 `unrestrictedValue` 的字串 —— 那是消費端可改的 prop,
拿字串當判準等於把判準交給呼叫端。2026-09-18 實測:`scripts/select-all-footer-invariant.mjs`
沒排除時當場誤判成「全選狀態沒變標籤卻變了」(勾選數 1→5、選項數 6、`已全選` 恆 false)。

### 欄位顯示

- 一般選項一律 Tag(只選一個也是)
- **只選「不限」時不渲 Tag**,走**一般已填值**那條純文字路徑:與 placeholder 同一顆 span、
  同一個字級(`fieldDisplayTextClass`)、同一個位置,**唯一差別是不套 `fieldEmptyColorClass` 那層灰**
  —— 與單選欄位的寫法完全相同(`../Select/select.tsx` `CustomSelectTriggerContent` 純文字那一支 `!value && 'text-fg-muted'`;
  2026-10-07 前這裡引的 `:352-353` 早已漂到別的程式,改指符號名)
- **欄位的左內距必須是標準的 `--field-px`,不是 tagPadding**。依據逐字在
  `../Field/field-controls.spec.md:298`:「tagPadding 只在有 Tag 時才套用。Placeholder/空值狀態
  使用 fieldWrapper 的標準 `--field-px`(`px-[var(--field-px)]`)padding」。
  tagPadding(`fieldTagInsetX`)的理由是**讓 Tag 四邊等距**(`../Tag/tag.spec.md`「圓角與間距」
  + `field-controls.spec.md:279`),跟文字無關 —— 欄位裡沒有 Tag 時本來就不該套。
  「只選『不限』」正是這條規則涵蓋的情形:值非空、但不渲 Tag。
  做法:「要不要縮內距」與「要不要渲 Tag」**每條路徑只准有一個判斷式**(`hasTags`),
  內距與渲染都吃它。
  ❌ **不得讓兩者各寫各的**:2026-09-18 user 抓到「不限」的字掉到 4px(md 標準值是 13px,少 9px),
  根因就是 readonly 路徑看 `hasTags`、可編輯路徑看 `value.length > 0`,新增「值非空但不渲 Tag」
  這第三種狀態時只改到渲染那一側。閘 `scripts/field-text-left-edge-invariant.mjs` 全庫機械強制
  (把判斷式改回舊寫法,它會指名這一格說「量到 4px,應為 13px」)。
- 四條路徑都要一致:可編輯 / 原生 / 唯讀 / 檢視
- 欄位上的文字與選單那一列**同一個來源**(`unrestrictedLabel`),不會兩邊各寫各的
- 有一鍵清空的欄位,只選「不限」時照常有;清單開著按它,反白回第一列 —— 第一列就是「不限」本身,接著按 `Enter` 會選回「不限」
  (跟打開一個空欄位一致,照實記錄;要跳過它是一條新的產品規則,不在這裡訂。`./select-menu.spec.md`「搜尋關鍵字何時保留、何時清空」)
- **欄位內有搜尋框時**(Combobox `searchable` + `searchIn='trigger'`;2026-10-07 待辦總帳 K4):「不限」照**單選欄位的讓位做法**顯示 ——
  關著 = 上面那條一般已填值的黑字(同字級、同位置、同色,**與不可搜尋的「不限」長得一樣**:標籤短、欄位填滿寬時逐像素相同;
  長標籤在窄欄位的截斷點、依內容寬時的欄寬也與不可搜尋的相同 —— 2026-10-07 前「不限」與搜尋框分兩格,長標籤少 6px 就開始省略、依內容寬多 8px);
  打開還沒打字 = 同一個位置的**灰色提示**、讀屏略過,插入點在 `--field-px` 那條線;**一打字就讓位**,打的字從那條線開始;字刪光提示回來;
  換行模式打長字時欄高不變(值與關鍵字不並排,不會擠出第二列)。**讓位不改欄寬**:「不限」讓位後,它原本的寬留在搜尋框那一格(看不見的量尺)——
  依內容寬(`width="hug"`)的欄位打開、打的字沒超過「不限」之前欄寬都不變,超過才跟著字長;填滿寬的欄位看不出差別
  (`../Combobox/combobox.tsx` 搜尋框那一格「讓位的值留下的寬」;與 PeoplePicker 多人 1 位的名字同一條,`../PeoplePicker/people-picker.spec.md` §C)。
  依據(DS 內部一致性,user 2026-10-06「應該是要確保我們DS自身有一致性才對」):欄位上**用文字畫的值**一碰到打字就讓位 —— Select 單選
  (`../Select/select.tsx` `showSelectedOverlay`)、PeoplePicker 單人與多人只選 1 位(`../PeoplePicker/people-picker.spec.md` §B、§C);
  「不限」是純文字、沒有框,所以跟它們同一條;有框的 Tag / 頭像才留在原位、搜尋框接在後面。提示字公式 `people-picker.spec.md` §E :194
  (看不到有框的值 → 顯示已選值的名字)。2026-10-01 起曾畫成「不限 fo」(值與關鍵字同字級同色、只隔 4px;`../Combobox/combobox.spec.md`
  「邊界案例」Empty 那一列的括號),查不到 user 看過或同意的紀錄,依上面的規則更正。user 2026-09-18 訂「不限」長相時的原話
  「反正其當下的樣式跟select的field control應該是一樣的」講的是當時(還不會與欄位內搜尋框同時出現);延伸到「打字時也跟 Select 一樣」是 AI 推導。
  實作 `../Combobox/combobox.tsx`(搜尋框那一格疊一層字;Backspace 刪掉「不限」見上方「互斥」)。

### 英文用字

程式與英文標籤**避開 `Any`**:`../DataTable/filter-operators.ts:134` 與 `:149` 的 `has_any_of`
其 `labelEn` 已經是 `'Any'`(含其中之一),而那個篩選面板用的正是本元件 —— 會同畫面撞名。

### 單選不提供

單選本來就互斥,「不限」在那裡就是一個普通選項,消費端在選項清單第一筆自己放一個即可,元件不需支援。

### 機械強制

上面四件事都會**靜默**壞掉(擺錯位置只會看起來像第一個選項、互斥壞掉會生出「不限 + 三個選項」
這種畫面上完全合理的矛盾值),所以四條都有閘:

| 閘 | 驗什麼 | 對照組 |
|---|---|---|
| `scripts/unrestricted-option-invariant.mjs` | 自成一組排最上 + 分隔線畫在下一組、互斥三條、欄位四條路徑都是純文字且與一般填值同左緣不同色、三態訊息列不受影響 | 四件事各弄壞一次,**每條各自都要被抓到**(只看「有沒有紅」會讓一條掩護其他三條) |
| `scripts/select-all-footer-invariant.mjs` | 全選按鈕的字與勾選狀態綁死時,分母已排除「不限」列 | `--selftest-unrestricted` 拔掉 `data-unrestricted` 記號,必須紅 |
| `scripts/field-text-left-edge-invariant.mjs` | **全庫**:欄位的水平內距是標準 `--field-px`(量沒有 Tag / 頭像 / 前置元素時的第一段文字)| 把每個受管欄位的左內距推 6px,必須紅 |
| `scripts/searchable-field-keys-invariant.mjs` | 只選「不限」× 欄位內搜尋框:關著與不可搜尋的「不限」同位置同色(窄欄位長標籤截斷寬、依內容寬的欄寬也相同)、打開變灰色提示且讀屏略過、打字讓位、字刪光回來、換行模式欄高不變、依內容寬時打開與打字欄寬不變;Backspace 刪掉「不限」;一鍵清空後反白落在「不限」那一列(story `combobox.stories.tsx`「不限 × 欄位內搜尋」;依內容寬與窄欄位長標籤兩對在 `../Field/field.stories.tsx`「欄位內搜尋讓位 × 欄寬驗證」;都是 test-only) | 在頁面上讓「不限」打開後仍是黑字、打字時仍並排,或拿掉讓位後留下寬的量尺,K4 那幾列必須紅(對修前建置實跑同樣紅) |

前兩支在 CI 的 `verify-browser-select-all` job、第三支在 `verify-browser-field-edges` job、第四支在 `verify-browser-interaction` job 裡跑(各自用該 job 的 storybook build)。

---

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `combobox.spec.md`
- `field-controls.spec.md`
- `select-menu.spec.md`
