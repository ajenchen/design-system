# InlineEdit / Field-mode / Storybook 重整 — 追蹤總帳(2026-07-15)

## 🟢 最終確認模型(2026-07-15 user GO,SSOT — 蓋過下方研究過程中的中間結論)

**統一原則**:就地編輯 host(InlineEdit + DataTable cell)**完全同構、真 SSOT** —— 只有 `view ↔ edit` 兩態 + `editable` 判準閘(非第三態)。**不亂生狀態**。

**軸 1 — Field 控件 chrome mode(表單語境,單一控件怎麼渲染)**:
- `edit`(可編欄位)/ `readonly`(表單鎖定值算數,灰底可讀可選,吃 `bg-readonly`)/ `disabled`(表單「目前不適用」如選國家前的城市,灰底灰字不送出,**form 專屬**)/ **`view`(原 `display` 改名)**= 非表單的值呈現(cell/InlineEdit/詳情),值本體(文字/Tag/頭像)。

**✅ view padding 最終定案(2026-07-16 round14 收斂 — 推翻 round12「view×default=plaintext 不 collapse」,回到 collapse)**:
- **view COLLAPSE 成單一 variant-agnostic**(= bare:透明無 chrome、無 padding、高度/幾何由容器給)。**view×default 0 消費者**(cell=naked / InlineEdit=自帶 geometry cva / form 鎖定=readonly / Tag·Date 格式=bare view)→ collapse。**user 從頭直覺對**;round12「keep view×default=plaintext」是為了「InlineEdit 委派 `<Input mode="view">` **元件**」模型,round13 因標題型委派會丟 `<h1>` outline 而否決該模型 → InlineEdit 改「自帶 geometry cva」→ view×default 就沒人用 → 回到 collapse。
- **InlineEdit read cva 自帶 geometry**(不委派 Input 元件,對齊 Atlassian「read wrapper 給幾何盒 + 內容元素由場景決定」):`px-[var(--field-px)]` + **orientation-aware `-mx`**(vertical 用貼 label / horizontal 拔對齊 sibling,**選項 A,user 2026-07-16 拍板**)+ `min-h-field`(單行 items-center)+ `items-start py-2`(多行,對齊 Textarea edit `py-2`)+ hover + `[&:has(button:focus-visible)]:border-primary`。消費 `--field-px`/`--field-height-*` 同 field 控件 = SSOT via token。
- **content 分兩類**:純值(plain span / 標題 `<h1>` 客製 typography)**共享這份 geometry cva**;**只有「值-格式化」(Select→Tag / Date→日期格式)委派 `<Control mode="view">`**(bare,取格式化邏輯,幾何仍由 InlineEdit cva 盒給)。
- **③ 多行 py SSOT**:InlineEdit cva `py-2` == Textarea edit `py-2`(textarea.tsx:44)。Textarea py-2 是 class 非 token → **加 invariant 鎖**(assert InlineEdit 多行 read py == Textarea edit py,drift 即紅)確保 Field 一改就被抓。現況 InlineEdit 多行是 `py-1.5`(:105)= 待改 `py-2`。
- **cva 動作**:`view×default`(:128-136)+ `view×naked`(:220-226)兩條**合成單一** `{ mode:'view', className:[bare naked 值 + !h-auto] }`(不指定 variant);砍 `readonly×naked`/`disabled×naked` 死格(+ Textarea 鏡像)。
- ~~(round12 舊說法已刪:「InlineEdit view 委派控件 view mode 取 padding」被 round14 推翻 —— 幾何在 InlineEdit 自帶 cva,py-2 在 cva + invariant 鎖,見上方)~~

**⚠️ InlineEdit 對齊機制(2026-07-16 實證,plaintext 後視覺零變)**:
- InlineEdit **保留 `-mx-field-px` + `w-calc`**(欄位左緣對齊 + hover 外擴),但 **read wrapper 自己那條 `px-field-px` 拿掉**(改由委派的控件 view mode 提供,否則雙倍 px)。`-mx` 消掉控件 view 的 px → 內容仍落欄位左緣(= FieldLabel 同左緣)。math 相同(都 field-px),**視覺位置/對齊/hover/read↔edit 零跳全不變**,差別只在 px/py **來源** hardcode→控件 view mode(SSOT 同步)。
- vertical(flex-col):label 與內容同左緣。horizontal(grid label 欄+minmax 內容欄):-mx 在 controlArea 內對兩 orientation 皆成立,對齊原則不變。多行 py-2 來自 Textarea view(-mx 不動 py)。
- **edge case**:`as="h1"` 標題型 InlineEdit(renderView=styled `<h1>` 非 Field 控件)無控件 view mode 可委派 → 保留自己的 px/min-h(+ -mx)。委派只套「值-控件」路徑(文字/Tag/日期)。

**⚠️ 2026-07-16 round13 修正(推翻上面兩點的細節,以此為準)**:
- **Q1 -mx orientation-aware**:field-px=12px==gap-x-3=12px。horizontal 用 -mx → hover 底色吃掉整條 gap+貼死 label、read 文字比 sibling 左 12px(幾何實證)。**horizontal 拔 -mx**(read 值落內容欄左緣+field-px=對齊 sibling 控件+edit 零跳+hover 不溢);**vertical 保留 -mx**(值貼 label 左緣,user 原意)。讀 `fieldCtx.orientation`(FieldLabel 已有先例 field.tsx:334/362)。【選項 A;選項 B=全拔 -mx 更貼 Atlassian 但 vertical 值不再貼 label,待 user 選 A/B】
- **Q2 幾何 SSOT 收斂(推翻「plain 委派 `<Input mode="view">` 元件」)**:InlineEdit read **幾何** = **一份 token-based cva**(消費 `--field-px`/`--field-height-*`,同 field 控件 token = SSOT via token),**plain 文字 + 標題 h1 都用它**(內層各放 `<span>`/`<h1>`,標題客製 typography 保 h1 outline);**只有「值-格式化」路徑(Select→Tag / Date→格式)才委派 `<Control mode="view">`** 取格式化邏輯。→ 避免「plain 委派 Input 元件 + heading 用 cva」的雙幾何來源 drift。多行 py 放這份 cva(=Textarea py-2,加 invariant 鎖同步)。對齊 Atlassian「read wrapper 給幾何盒 + 內容元素由場景決定」解耦。

**軸 2 — 就地編輯 host(InlineEdit ＝ DataTable cell,同一份語義)**:
- `view`(顯示值,委派軸1 `view` mode 渲染;editable 時有 hover 入口)↔ `edit`(真控件輸入)。
- `editable` 判準(布林/callback,預設 true):false → view 無 hover/入口、**不灰化**(對齊世界級 detail-pane + grid:Atlassian/Jira/MUI X/AG Grid **就地編輯無 disabled 態**)。

**命名決策**:`display`→**`view`**(三層打通:MUI X cellMode=view / Atlassian readVIEW 字根 / edit 成對;過命名 3-test)。**撤回**:InlineEdit 加 disabled(round7 錯,detail-pane 鎖定=view 無入口,非灰化)。**廢除**:DataTable cell「disabled」(世界級 4 家全無 disabled cell = category error;meta.disabled 全庫 0 消費)。

**最終系統詞彙(6 個,零重疊)**:`view / edit`(互動軸)+ `readonly / disabled`(chrome 軸,form 專屬)+ `editable`(閘)+ `hover`。

**實作清單(全 GO)**:
1. **Field mode `display`→`view`** DS-wide(field-wrapper cva mode + field-context FieldMode type + 全 `mode="display"` 消費點 + 各控件)。
2. **cva 收斂**:view(原 display)收成單一 variant-agnostic compound + 砍 `readonly×naked`+`disabled×naked` 死格 + Textarea 鏡像。
3. **InlineEdit**:state `read`→`view`、read=委派 Field view mode(零重刻幾何)、**加 `editable` prop(預設 true)**、**不加 disabled**、auto-sm(`fieldPreferredSize='sm'` static + Field 偵測)、接 fieldCtx cascade(size/labelId)、focus 分路徑(滑鼠乾淨/鍵盤藍框)、renderRead 行盒修(Tag 下沉)、spec「view↔edit 二態」。
4. **DataTable cell**:CellMode `display`→`view`、**廢 disabled**(meta.disabled→移除;鎖定用 `editable:(row)=>bool`)、命名 drift 收齊。
5. **canonical spec**:軸1 4-mode(edit/readonly/disabled/view)+ 軸2 就地編輯 host 統一模型(view/edit+editable)+ 每態一句時機,進 `field-controls.spec.md`。
6. **storybook**:4 內容規範機械化 + 三層機械腳本 + 修 dim-11 假證據 + 補 InlineEdit anatomy·principles + DS-wide 掃 verification-intent names。

**驗證到完美**:tsc / build:lib / typecheck:stories / data-table-invariants 39/39 / story-quality / three-layer / content-quality / storybook build + playwright pixel(鎖定 view vs InlineEdit view 零偏差、Tag 置中偏差~0)。**不改 a 壞 b**:每階段獨立驗證。

**🔎 user 最初 4 個 layout 議題(必逐一驗到)**:① 高度佔位=label+4px+sm-field-height(auto-sm)② Tag 垂直置中零偏差(行盒修)③ **換行保持上下 padding**(多行文字=items-start+py-2 抄 Textarea / 多 Tag wrap=items-start+py-1+gap-4 抄 Combobox;若 delegate view mode wrap py 不對〔Textarea view 恐 !py-0 flush〕→ 補修 view mode wrap py 對齊各自 edit,read↔edit 零跳)④ blur 後純 view 無編輯指示(focus 分路徑)。**③ 最細,pixel 專項驗:多行/多tag 換行後上下 padding 保持 + read↔edit 零跳。**

---

## (以下為研究過程紀錄,中間結論以上方最終模型為準)

**狀態**:規格已確認(user GO 2026-07-15),實作中。
**規則**:所有決策/共識/待辦落盤此檔,任何中斷後讀此即可無損接續。每有新拍板就更新。
**分支**:`2026-07-15-inlineedit-storybook-remediation`(beta.86 bump 已 riding;working tree 只有研究 JSON,無 code 改動)。

## A. 已達共識(待 user 最終「全 GO」拍板,SSOT-affecting)

### A1. display mode cva 收斂
- **display 收斂成單一 variant-agnostic compound**:刪 `field-wrapper.tsx:128-136`(display×default)+ `:220-226`(display×naked),合成一條「mode=display 就套、不指定 variant」的 compound(className 抄 naked 現值)。cva 支援省略 variant key(先例 `:164-168` `{mode:'edit',error:true}`)。零風險:naked 消費者 byte-identical,只 standalone story `<Input mode="display">` 32→hug。
- **砍死 compound**:`readonly×naked`(全庫 0 消費,`displayOrDisabled` 永不回 readonly)+ `disabled×naked`(meta.disabled 全庫 0 setter)。**Textarea 自家鏡像同款兩格一併清**(textarea.tsx:135)。理由:「保留為軸對稱」= dead-code 藉口(違 M1/M17),軸對稱靠 cva wildcard 自然覆蓋。
- **variant 軸整體保留**(非冗餘):edit×default(form 殼)/ edit×naked(cell 自畫 border)/ readonly×default(RadioGroup/Checkbox/Switch)/ disabled×default(Input/Field)全真消費者。

### A2. InlineEdit 重整
- **命名**:維持 **read / edit 二態**(已驗證 = Atlassian readView/editView 逐字;不改)。spec:26「read/hover/edit 三態」→ 改「read↔edit 二態」(hover 是 read 子態)。
- **read = 委派**:read 態不重刻幾何,直接渲染該控件 `mode="display"`(值內容 intrinsic);高度由 host 容器給(Field 槽 min-h / standalone 自帶)。**零寫死 py/min-h**。renderRead 行盒 micro-bug 修(Tag 下沉 +1.8px:renderRead 容器改 flex items-center / line-height 歸零)。
- **auto-sm**:InlineEdit `size = useResolvedFieldSize(prop,'sm')`(接 fieldCtx.size,standalone fallback sm)+ 掛 static `fieldPreferredSize='sm'`;`<Field>` 偵測 control child 這個 static → Field.size 預設收 sm(`explicitProp ?? detected ?? 'md'`)。已驗證:同 `detectControlLayout` 讀 `child.type.fieldLayout` 機制(RadioGroup/CheckboxGroup forwardRef 已上線),forwardRef 這關過。`<Field size="md">` 顯式覆蓋。
- **接 cascade**:read button 接 fieldCtx.labelId(修 FieldLabel htmlFor 懸空)。
- **新增 disabled prop**(round7 補洞):條件停用(選國家前的城市 / 無權限 / 暫時鎖)→ 灰化(委派 Field mode=disabled token,無 hover)。**readonly 值不入 InlineEdit**(永久唯讀→用 display 元件)。判準:欄位本可編、被限制擋住=disabled;值本身就是唯讀資料=display。
- **focus 分路徑**:滑鼠 blur 提交→純閱讀態、不搶焦、無藍框;鍵盤 Enter/Esc 收尾→焦點回 read button+藍框(WCAG 2.4.7)。
- **hover-only-when-editable**:結構保證(不可編用 display 無 hover);delegate 後零洩漏。

### A3. DataTable cell 狀態(**可與 InlineEdit 分開做**)
- **砍到 3 態**:`display`(不可編純值)/ `editable-idle`(可編+hover+click)/ `editing`。per-cell 鎖定折進 `editable:(row)=>false`(= MUI X isCellEditable 模型,對齊 2/3 主流 grid)。
- **廢除誤用的「disabled」名**:column-types.ts:177 把 editable=false 叫 readonly、把灰化格叫 disabled,兩頭貼錯 + 灰化態全庫零消費。
- **✅ 已定(round11)**:灰化鎖定態 = **readonly**(行為早就是:值算數/可選取/只擋編)。若保留 → 吃 field 既有 **`bg-readonly` + `mode="readonly"`**(跟 RadioGroup/Checkbox/Switch 同 SSOT;現吃 `bg-disabled` 是錯配),命名 **readonly**(現「disabled」三重 drift:世界級 Handsontable 叫 readOnly、同字串跨元件衝突、field 有 readonly cell 卻誤名 disabled)。零消費則砍。**無論留或砍,cell「disabled」名必廢**。命名 drift 收齊:meta.disabled→readonly / isCellDisabled→isCellReadonly / displayOrDisabled→displayOrReadonly / mode=disabled→readonly / bg-disabled→bg-readonly / column-types.ts:177 自述倒置。副作用:字色灰(neutral-6)→正常(readonly 值該讀清楚)。
- **cell 命名 verdict**:`edit` ✓ / `display` ✓(對齊 field display + InlineEdit read + MUI view)/ 灰化鎖定 → `readonly`。

### A4. 明文 canonical(spec)
- **field 4-mode**:editable / readonly / disabled / display,各定位 + 能否選取/送出(見下 §D 表)進 `field-controls.spec.md`。
- **cell 狀態模型** + **mode×variant 有效集**(A1 那 5 格 + 為何)進 spec。
- **cell disabled(其實 readonly)vs InlineEdit disabled(真條件停用)** 的共同原則明文化。

### A5. Storybook 內容規範機械化(治理失職修復)
- **4 條規範進 gate**(`scripts/audit-story-quality.mjs`):① name 禁驗證/實作意圖(「(Tag 對齊)」)② demo 語言一致 ③ 禁 CSS 術語當 caption ④ trait 宣告卻沒 migration。每條 breadth-test。
- **三層存在機械腳本**(`scripts/check-three-layer-stories.mjs`,新):enumerate public components 缺 anatomy/principles → 列出;接 release:preflight。**InlineEdit 是全 64 元件唯一缺兩層的**。
- **修 dim-11 假證據**:residue 寫「全元件三層齊備」是假的(AI 重放冒充機械證據)→ 改機械腳本。
- **補 InlineEdit anatomy + principles stories**。
- **DS-wide 掃**:~11 個 verification-intent story names(尺寸與 Button 對齊×4、TreeView/Slider/Toast 等)humanize。

## B. 本輪未決(Q1/Q2 研究中,2026-07-15)
- **Q1**:table 灰化鎖定 cell 吃哪個 SSOT token?現況「disabled」cell 吃 bg-disabled+text-fg-disabled(TD 層);若真要 readonly-dimmed 該吃哪邊?
- **Q2**:DataTable cell 各態命名是否世界級 + 一致設計語言(比照 InlineEdit read/edit 已驗證)?

## C. 驗證計畫(實作後必跑)
`npx tsc -b` / `npm run build:lib` / `npm run typecheck:stories` / `node scripts/data-table-invariants.mjs`(39/39)/ `node scripts/audit-story-quality.mjs --check` / `node scripts/check-three-layer-stories.mjs` / `audit-content-quality --check` / build storybook + playwright pixel 實測(鎖定 display vs InlineEdit read 零偏差、Tag 置中偏差 ~0)。

## D. Field 4-mode SSOT 表(已達共識,對齊 HTML/ARIA/Polaris/Ant)

| mode | 意思 | 何時用 | 能選取/複製 | 會送出 | 可 focus |
|---|---|---|:--:|:--:|:--:|
| editable | 可改 | 一般可編欄位 | ✓ | ✓ | ✓ |
| readonly | 不能改但能讀能複製、值算數 | 鎖定欄位、系統產生值(訂單編號) | ✓ | ✓ | ✓ |
| disabled | 不適用、完全停用、值不算數 | 條件未滿足(選國家前的城市) | ✗ | ✗ | ✗ |
| display | 純展示、無 chrome、非表單欄位只秀值 | cell / 詳情不可編值 | 看容器 | — | — |

## E. 研究 artifact(全落盤 .claude/logs/)
`inline-edit-diagnosis.json`(runtime 實測 3 bug)/ `inline-edit-worldclass.json`(Atlassian/Chakra 幾何)/ `inline-edit-geometry-ssot.json`(per-type)/ `inline-edit-ssot-deep.json` / `inline-edit-final-ssot.json` / `inline-edit-round5~10-final.json`(逐輪)/ `storybook-rules-inventory.json`(33 規則 + 假證據分析)。

## F. 此投入之外的既有待辦(防掉棒,非本投入 scope)
- **deep-audit 戰役已收官**:beta.85/86 已發(beta.86 bump 在本分支未 release);WM main 已 push(`4e83402`,verify 13/13)。SSOT → `.claude/planning/2026-07-14-deep-audit-baton.md`(CAMPAIGN CLOSED)。
- **6 個 DS API backlog**(user 拍板才動):FilterPanel i18n / 條件數 helper / maxConditions / footer slot / now 注入 / DialogSplitBody 兩欄 API(#103 研究完未實作)。
- **knowledge-prune auto-nudge**:hook 56(soft 26,hard 60 內)/ memory 18(soft 18)。deep-audit C.0a 收尾曾 defer,未跑;非阻塞。
- **beta.86**:本分支已 bump 未 tag/release(等本投入完成一起發 or 獨立發)。

## G. 額度/中斷 SOP
本檔 + `.claude/logs/inline-edit-*.json` = 完整可恢復狀態。任何 session 讀 §A(共識)+ §B(未決)+ §C(驗證)即可無損接續。禁只留對話。

## 🔬 round15 實證(2026-07-16,三題查死,有 file:line)
- **① plain 多行 view**:inline-edit.tsx:259 multiline 套 `whitespace-pre-wrap break-words` + fieldDisplayTextClass;py 來自 InlineEdit cva(py-1.5→py-2)。支援,py 符合預期。
- **② 世界級+SSOT**:Atlassian read-wrapper-owns-geometry;px=--field-px token / typography=fieldDisplayTextClass / 多行 py-2=Textarea + invariant 鎖。全 token-SSOT。
- **③ view×default 0 production 消費者**:現況本來就 bare(!px-0 !py-0);`<Input/Textarea mode="display">` 直接 JSX=0、`<Field mode="display">`=0、cell 全 variant="naked"(cell-registry:145-160)。→ collapse view×default+naked 成單一 bare = 安全正確。**不需保留 view×default**。
