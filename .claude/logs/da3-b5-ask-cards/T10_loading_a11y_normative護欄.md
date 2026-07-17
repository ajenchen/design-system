# T10 — Loading / A11y / Normative 護欄(決策卡)

主題性質:**雜項 normative 護欄**(7 findings,異質)。經嚴格 SSOT-check,**3 條降回 AUTO**(對齊既有已拍板決策),**4 條為真拍板題**(各自獨立、tradeoff 不同構 → 4 張獨立決策卡,非合成)。

---

## 先講降回 AUTO 的 3 條(不需你花決策力,實作對齊既有決策即可)

### D-AUTO-1 · d8i19 — elevation 只管陰影 / z-index 責任歸屬
- **為何 AUTO**:z-index 的歸屬**早已拍板** —— `app-shell.spec.md:253` 明文「shell root 不設 z-index;overlay 走既有 `z-50` Tailwind utility(Sheet SSOT),**不發明 `--z-overlay` token**」。所以「新立 z-index owner」這件事沒有新決策,現況就是「不設 token、用 `z-50`」。
- 邊框 / 圓角 / sideOffset 的 owner 也早已是 `overlay-surface.spec.md`(overlay 結構 SSOT);elevation spec 的「浮層共用樣式」表只是重複摘要。
- 動作(全 AUTO,不動任何視覺 / 語意):(a) 修 `motion.spec.md:95` 把 elevation 誤稱「z-index 視覺層」的單句 → 改指「overlay 陰影深度」;(b) elevation spec 收斂成「只管 shadow depth」+ 把 border/rounded/sideOffset 改成指向 `overlay-surface.spec.md` 的 pointer(清 duplicate);(c) z-index 現況補一句 pointer 到 `app-shell.spec.md:253`。
- **無 SSOT 理由**:不新增 API、不改任何 canonical 語意、不生新視覺語言 → 純對齊 / 清重複 / 補 pointer,符合 audit-vs-execute 分權的 AUTO 側。

### D-AUTO-2 · d72i12 — Select `tagVariant?: string` 收窄成 Tag color union
- **為何 AUTO**:對齊 `select.tsx:57`「**2026-07-14 API 策展 D,user 拍板『全部收窄』**」的型別誠實原則。`tagVariant?: string` 型別承諾任意字串,但實作 4 處硬 cast `as 'blue'|'green'|'red'|'yellow'|'neutral'`(select.tsx:335/393/397/458)—— 這正是「型別比實際寬」的同一類 bug,你已拍板要收窄。
- 動作(AUTO):把 `tagVariant?: string` → `tagVariant?: NonNullable<TagProps['color']>`,4 處硬 cast 一併移除。**保留 `tagVariant` 原名**(避免 consumer churn;rename 成 `tagColor` 屬非必要的命名美化,不做以免多開 API 決策)。
- **無 SSOT 理由**:union 外的值本來就是 runtime 壞值(硬 cast 出無效 Tag color),收窄只擋掉「早就壞的值」,不是新契約 —— 是「對齊既有『全部收窄』原則的實作缺口」。

### D-AUTO-3 · d72i9 — FilterCondition/OperatorSpec `op: string` 收窄成 registry 推導 union
- **為何 AUTO**:同上,對齊「全部收窄」;且 `OPERATOR_REGISTRY` 已是 `as const`(filter-operators.ts:60/79)→ 機械上可直接 `typeof` 推導出 `FilterOperator` union。未知 op 目前經 `getOperatorSpecLoose` 回 null → 被 `isConditionComplete` 靜默略過(filter-tree.ts:118-126),等於已經是壞值。
- 動作(AUTO):以 `as const` 推導 `FilterOperator` union,`FilterCondition.op` / `OperatorSpec.op` 收窄成該 union。**實作約束**:持久化資料(JSON/localStorage 反序列化)在**邊界**仍接受 `string`,驗證通過才轉入 typed tree —— parse-don't-validate 標準做法,不破壞 round-trip,不需你拍板。
- **無 SSOT 理由**:收窄的是「早就會被靜默丟棄的拼錯值」,邊界 string 入口保留 → 對既有原則的實作補齊。

> 若實作時發現 d72i9 的 boundary parse 無法乾淨分層(consumer 大量直接 cast 持久化 string 進 exported `FilterCondition`),再升回拍板題;目前判定可 AUTO。

---

## 真拍板題 4 張(請逐張選)

### 決策卡 1 · d7i4 — 非同步批次操作的 loading orchestration 契約

**【問題】**
BulkActionBar 的 spec 只規範了「無權限的 action 要 disabled + tooltip」(spec:187),但**沒有**規範最常見的場景:按下批次操作後要打 API(例如批次刪除 500 筆)、這期間整條 bar 該怎麼表現。誰顯示轉圈?其他 action 要不要一起鎖?clear 能不能按?選取狀態保留到成功還是先清掉?失敗了怎麼回?—— 全檔 grep `loading/aria-busy/async/失敗` 0 命中,consumer 只能各做各的,體驗會不一致。

**【選項 A:最小契約 —— 只定「誰負責」,不定死視覺】**
在 spec 補一段:loading 狀態**由觸發的那顆 Button 自己顯示**(消費既有 `Button loading` canonical,button.spec.md:305 已有 `loading` + 自動 disabled + `aria-busy`);BulkActionBar 只負責 orchestration 規則:(1) 進行中其他衝突 action + clear 一併 disabled;(2) selection **保留到 settle**(成功才清、失敗保留讓使用者重試);(3) 成功/失敗由 consumer 用既有 Toast/Alert 回饋。
- tradeoff:契約輕、複用既有 Button/Toast,不長新 API;但把「協調多顆 action」的落地交給 consumer,DS 不強制。

**【選項 B:BulkActionBar 內建 async 狀態管理】**
在 BulkActionBar API 上加 `actions[].loading` / `busy` prop,由 bar 統一渲染 loading + 自動鎖其他 action + 自動管 selection 保留。
- tradeoff:consumer 最省事、行為最一致;但 bar 從「plain block(spec:112 明文無 positioning/狀態邏輯)」變成有狀態元件,增加 API 表面與維護面,且和 spec 現有「bar 不耦合業務判斷」定位衝突。

**【推薦:A】**
理由:(1) loading 狀態的 **owner 早已是 Button**(button.spec.md:305,`loading`+`aria-busy` 已 canonical),重造在 bar 上 = 違 SSOT;(2) BulkActionBar spec:112 自我定位是「plain block、無狀態邏輯」,選 B 會推翻此定位;(3) 世界級對照支持「loading 是 action 層、bar 只協調」:Polaris IndexTable 討論在 **promoted bulk actions 上加 `loading` prop**(Shopify/polaris-react #5282,明言「async 時 loading 比 disabled 更清楚」)、MUI X 對 bulk action 也僅停在「demo/recipe」不內建成狀態元件(mui-x #8280)、AG Grid async 後靠 `onFilterChanged()` 由 consumer 觸發重算(consumer-orchestrated)。三家都把「批次 async 狀態」放在 consumer/action 層而非 bar 內建。
**【SSOT 理由】** 這是**新增行為 canonical 契約**:給 BulkActionBar 定義 async 批次操作的 loading/selection-保留/成功失敗 語意規則(改 canonical 語意 —— 從「只管 disabled」擴到「管 async 生命週期協調」)。

---

### 決策卡 2 · d8i18 — 10px footnote 的無障礙護欄

**【問題】**
typography spec 允許 `text-footnote`(10px)用於「法律文字、來源標注」(spec:41),但整份 204 行**沒有任何 a11y 護欄**:沒說重要資訊不能只靠這種微小字、沒要求視覺標題 ≠ 語義標題、沒要求驗證 200% 放大 / 文字縮放時不被裁切。風險是有人拿 10px 塞「使用者其實需要看懂並據以行動」的資訊,窄版或放大時讀不到。

**【選項 A:補一段 A11y 契約(規範用途 + 驗證,不改 token 值)】**
在 typography spec 新增 A11y 段:(1) 10px 僅限「純附帶、不影響操作」的法律/來源字,**使用者需理解才能行動的資訊禁止只靠 footnote**;(2) 樣式標題(font-weight/size)≠ 語義標題,結構一律用 `h1–h6`(WCAG 1.3.1);(3) 任何 ≤12px 用途上線前必驗 200% 放大(WCAG 1.4.4)+ reflow(1.4.10)不裁切不遺失。
- tradeoff:純加護欄、零視覺變動、把已知 a11y 風險寫成明文 gate;但需 consumer 自律 + audit 抽驗,非機械強制(可後續補 hook)。

**【選項 B:直接廢掉 10px,footnote 提到 12px】**
移除 `text-footnote` 10px,最小字統一 12px(`text-caption`)。
- tradeoff:一刀切最安全;但推翻 spec 既有「10px 極少用、法律字場景」的刻意設計,且 12px 也非 WCAG 硬底線(WCAG 不設像素硬下限,只要求可縮放),等於為個案砍掉一個 token,影響既有 consumer。

**【推薦:A】**
理由:(1) WCAG **不設**像素硬下限,真正的護欄是「可縮放到 200% 不失內容」(WCAG 1.4.4)+「reflow 400% 不橫向卷軸」(1.4.10)+「語義結構程式可讀」(1.3.1)—— 所以正解是補「用途限制 + 縮放驗證」而非砍 token;(2) 業界共識是「never below 12px for reading,但 dense UI 的 caption/footnote 可用小字**只要乾淨縮放到 200%**」(a11y-collective / Section508),與選 A 一致;(3) 選 B 砍 token 破壞既有設計語言,代價大於收益。
**【SSOT 理由】** 對 typography token SSOT **新增 normative a11y canonical**:把「10px 可讀性 / 語義標題 / 縮放驗證」從無明文提升為契約條款(改 canonical 語意,增新規範面)。

---

### 決策卡 3 · d43i10 — Tooltip vs HoverCard 分界:「即消失」的錯誤 canonical

**【問題】**
principles story(:142)與 owner spec(hover-card.spec.md:57「停留行為」表)都寫 **Tooltip「滑鼠離開 trigger 即消失」**。但這與 runtime 不符:`tooltip.tsx` 沒設 `disableHoverableContent`,Radix 預設 = content **可 hover 停留**(指標移向浮層時會短暫維持,不會立刻消失)。更關鍵:Radix 這個預設**是刻意的 WCAG 2.1「Content on Hover」(SC 1.4.13)合規**(內容要 hoverable/dismissible/persistent),MUI Tooltip 甚至預設 interactive。所以 canonical 描述錯了,而且「改成真的即消失」會**倒退 WCAG**。

**【選項 A:修正 canonical 對齊 WCAG-hoverable 現況,分界改用「可互動性」畫線】**
(1) 修 story:142 + spec:57「停留行為」列 → Tooltip 改述「指標可短暫移到浮層(WCAG 1.4.13 hoverable grace),**但內容不可互動**」;(2) Tooltip vs HoverCard 的分界**改以「內容可不可互動」為唯一判準**(Tooltip=純文字不可互動、HoverCard=可互動 preview),不再用「停留 vs 即消失」當差異點。`tooltip.tsx` **不動**(保持 WCAG 合規)。
- tradeoff:對齊實際行為 + 保住 WCAG + 分界更乾淨;但需微調 owner spec 的分界框架敘述。

**【選項 B:設 `disableHoverableContent={true}` 讓 Tooltip 真的「即消失」以符合現有文字】**
- tradeoff:文字不用改;但**倒退 WCAG 1.4.13**(內容變不可 hover/persist),且與 Radix/MUI 世界級預設背道而馳 —— 不建議。

**【推薦:A】**
理由:(1) Radix 預設 hoverable = 刻意 WCAG SC 1.4.13 合規(radix-ui tooltip docs),MUI 預設 interactive tooltip 同向,HoverCard 本就為可互動 preview 設計 —— 三家一致把「可互動性」當 Tooltip/HoverCard 的真分界,不是「停留行為」;(2) 選 B 主動製造 a11y 倒退,違反 mindset #1 對標世界級;(3) 我方 spec 既有 canonical「Tooltip 內容不可互動、tabindex=-1」(hover-card.spec.md:25)**已經對** —— 錯的只有「即消失」這個次要描述,選 A 只是把它修準。
**【SSOT 理由】** 修正 owner spec 的 **canonical 分界語意**:把 Tooltip↔HoverCard 的判準從「停留行為」改成「內容可互動性」,並更正一條事實錯誤的行為 canonical(改 canonical 語意)。story:142 那句因純屬事實錯誤,無論你選哪案都會一併修正。

---

### 決策卡 4 · d72i8 — DataTableFilterPanel 的 mode 重複 discriminant 重整

**【問題】**
`DataTableFilterPanelProps` 同時收兩個會打架的來源:獨立的 `mode: 'flat'|'nested'`(:130)和 `value: FilterTree` 自帶的 `value.mode` discriminant(:134)。型別允許矛盾組合;而且 rows/mutators 讀 `value.mode`(:224-248)、寬度讀 `mode`(:317-319)、CTA 文案+onClick 也讀 `mode`(:385-390)。結果:`mode='nested'` 但 `value.mode='flat'` 時,CTA 顯「加入篩選器」卻 `addGroup` 無反應 —— 錯文案 + 死操作。這是 public root-barrel export(`DataTableFilterPanel` + `DataTableFilterPanelProps`)。

**【選項 A:移除獨立 `mode`,一律由 `value.mode` 推導】**
砍掉 `mode` prop,寬度/CTA/rows 全部改讀 `value.mode` 單一真相源。
- tradeoff:最小 surface、單一真相源、消滅矛盾;但 `mode` 現有註解是「consumer 拍板」—— 砍它是移除一個曾刻意提供的 public prop,是 breaking change(consumer 需改傳法)。

**【選項 B:改成 discriminated union props(flat 分支 / nested 分支)】**
把 `value`/`defaultValue`/`onChange` 依 `mode` 鎖進同一分支的判別聯合型別,讓「`mode='nested'` 配 flat value」在編譯期就不可能。
- tradeoff:型別最嚴、非法狀態編譯期即擋、IntelliSense 最清楚;但 props 型別重構較大,consumer 遷移成本高於 A。

**【推薦:A(必要時以 B 的判別聯合強化型別)】**
理由:(1) 兩案都對齊你已拍板的「**全部收窄 / 型別誠實**」(select.tsx:57)—— 讓非法狀態不可表示;(2) 世界級的 filter model 都是**單一 model 推導 mode**,不另設打架的 mode prop:MUI X `GridFilterModel = { items, logicOperator }` 單一來源、AG Grid 單一 filter model 為真相源 —— 支持選 A 的「由 value 推導」;(3) TypeScript 社群對「互斥 props」的共識正是 discriminated union「make invalid states impossible」(Total TypeScript / Developer Way),若團隊要編譯期硬擋可在 A 之上疊 B。先 A(移除矛盾源)成本最低、最快消 bug;要更嚴再上 B。
**【SSOT 理由】** 這是 **public API contract 重整**:移除/重構一個已發佈的 root-barrel export prop(`mode`)並可能改成判別聯合型別 —— 動的是 consumer 契約的形狀(新/改 API contract),且推翻「mode 由 consumer 拍板」的既有 API 設計,需你確認方向。

---

## 世界級對照(來源)

- **d7i4**:Shopify Polaris IndexTable — promoted bulk actions 加 `loading` prop 提案(github.com/Shopify/polaris-react #5282,「async 時 loading 比 disabled 清楚」);MUI X bulk action 僅 demo/recipe 不內建(mui/mui-x #8280);AG Grid async 靠 consumer `onFilterChanged()`(ag-grid.com/react-data-grid/filter-api)。我方 Button `loading`+`aria-busy` 既有 canonical(button.spec.md:305)。
- **d8i18**:WCAG 1.4.4 Resize Text 200%(w3.org/WAI/WCAG21/Understanding/resize-text);WCAG 1.4.10 Reflow 400%;WCAG 1.3.1 Info & Relationships(語義 heading);業界「never below 12px for reading」(a11y-collective / Section508.gov)。search-only + W3C 官方 confidence。
- **d43i10**:Radix Tooltip 預設 `disableHoverableContent=false` = WCAG 2.1 Content on Hover 合規(radix-ui.com/primitives/docs/components/tooltip);MUI Tooltip 預設 interactive;Radix HoverCard 為可互動 preview 設計。WCAG SC 1.4.13。
- **d72i8**:MUI X `GridFilterModel`(mui.com/x/api/data-grid/grid-filter-model)單一 model;AG Grid 單一 filter model(ag-grid.com/react-data-grid/filter-api);TypeScript discriminated unions 「make invalid states impossible」(totaltypescript.com / developerway.com)。
- **downgrade 錨點**:「全部收窄」= select.tsx:57(2026-07-14 API 策展 D user 拍板);z-index owner = app-shell.spec.md:253(Sheet `z-50`,不發明 token);OPERATOR_REGISTRY `as const` = filter-operators.ts:60/79。

## Provider / model
- Author:Claude (claude-opus-4-8) · DA3 B.5 ASK 決策收斂 · 2026-07-17
