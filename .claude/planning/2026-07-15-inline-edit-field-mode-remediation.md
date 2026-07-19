# InlineEdit / Field-mode / Storybook 重整 — 追蹤總帳(2026-07-15)

## 🟢 最終確認模型(2026-07-15 user GO,SSOT — 蓋過下方研究過程中的中間結論)

**統一原則**:就地編輯 host(InlineEdit + DataTable cell)**完全同構、真 SSOT** —— 只有 `view ↔ edit` 兩態 + `editable` 判準閘(非第三態)。**不亂生狀態**。

**軸 1 — Field 控件 chrome mode(表單語境,單一控件怎麼渲染)**:
- `edit`(可編欄位)/ `readonly`(表單鎖定值算數,灰底可讀可選,吃 `bg-readonly`)/ `disabled`(表單「目前不適用」如選國家前的城市,灰底灰字不送出,**form 專屬**)/ **`view`(原 `display` 改名)**= 非表單的值呈現(cell/InlineEdit/詳情),值本體(文字/Tag/頭像)。

**✅ view 幾何最終定案(2026-07-16 round16 — user GO Model A,推翻 round14 collapse)**:
- **view = edit 幾何減 chrome**(不 collapse):view×default 保留 `px-[var(--field-px)]` + edit 的 py(單行 h-field / 多行 py-2)+ h-field,只拔 border/bg(透明)。**唯一改動 = 現況 `!px-0 !py-0`(bare)→ 留 px + py**。理由 = 唯一能對**所有內容型態**(純文字/多行/多 tag/avatar/日期)保證 read↔edit 零跳的模型:view 與 edit 是**同一顆控件**、只差 chrome → 幾何天生一致。
- **view×naked ≠ view×default**(**不 collapse**,round14 合併是錯的):naked = bare(cell substrate,host TD 給 padding);default = edit 減 chrome(form read-only + InlineEdit 委派)。兩者本質不同用途。仍砍 `readonly×naked`/`disabled×naked` 死格(0 消費者,+ Textarea 鏡像)。
- **InlineEdit read = 委派控件 view mode 取全幾何**(px/py/min-h/內部間距皆來自控件),**砍掉自帶 geometry cva**(round14 的 `inlineEditReadStyles` 刪除,消 M17 重複 SSOT)。InlineEdit 只保留:`-mx-field-px` + `w-calc`(拉到欄左緣 + hover 外擴,= Atlassian 負邊距)+ hover bg + `[&:has(button:focus-visible)]:border-primary` + 隱形 Pressable。**無自己的 px/py/min-h**。
- **content 兩類、共用同一 view 幾何 SSOT**:(a) 值-格式化(Select→Tag / Date / avatar)→ `renderRead={(v) => <Control mode="view">}`,控件 view×default 提供全幾何 + 內部間距;(b) 純值 / 標題 `<h1>` → InlineEdit 把 **view×default 的幾何 class**(= `fieldViewGeometry(size,multiline)` helper,SSOT)套在 `<Tag as>` 上,保 h1 outline + 客製 typography。**兩路取同一份幾何**(helper == view×default compound class)。
- **③ 多行 py 自動 SSOT**:多行委派 `<Textarea mode="view">`(py-2 = 它 edit py-2,edit 減 chrome)→ read/edit **同一顆 Textarea**,py 天生一致,**免另立 invariant**。純文字 h1 多行走 helper(helper 內含 multiline py-2 = Textarea)。
- **Q1(多 tag/avatar/prefix 間距零偏移)根治**:內部間距歸控件(read=edit 同一顆 → 天生一致);換行 py 歸控件 view(= 它 edit 的 py,零猜測)。這正是 round14 InlineEdit-自帶-cva 對付不了 tag-wrap py 的漏洞。

**⚠️ InlineEdit 對齊機制(round16,Model A)**:
- InlineEdit `-mx-field-px` + `w-calc` 把整塊拉到欄位左緣;委派的控件 view×default 自帶 px-field-px → 淨值:內容落欄左緣(read),edit `<Control mode="edit">` 同框 -mx → 值也落欄左緣 → **read/edit 零水平跳**(Atlassian 負邊距模型)。
- **orientation-aware `-mx`(選項 A,user 2026-07-16 拍板保留)**:field-px=12px==gap-x-3=12px。vertical(flex-col)保留 -mx(值貼 label 左緣);horizontal(grid)拔 -mx(值落內容欄左緣+field-px=對齊 sibling 控件,hover 不溢吃 gap)。讀 `fieldCtx.orientation`(FieldLabel 先例 field.tsx:334/362)。
- **三情境自洽**:①詳情面板全 InlineEdit(-mx→全對齊欄左)②表單 read-only 用 `<Control mode="view">`(inset px-field-px,值成一直行)③cell 用 view×naked(bare + TD padding)。
- **標題型 `as="h1"`**:走純值路徑(helper 幾何 class 套 `<h1>`),非 blocker。

**世界級實證(round16,M26 三源)**:
- Bootstrap `.form-control-plaintext` SCSS = `padding: $input-padding-y 0`(留垂直、拔水平,對齊 label 場景)。https://github.com/twbs/bootstrap/blob/main/scss/forms/_form-control.scss
- Atlassian inline-edit read-view wrapper 無 padding + 容器負邊距對齊 edit(= 我們 -mx)。https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx
- **我們 view 用在 cell/inline-edit/詳情(對齊「edit 值位置」非 label)→ 水平垂直都留**(比 Bootstrap 更徹底,因用例不同);InlineEdit 再靠 -mx 拉到欄左。

**軸 2 — 就地編輯 host(InlineEdit ＝ DataTable cell,同一份語義)**:
- `view`(顯示值,委派軸1 `view` mode 渲染;editable 時有 hover 入口)↔ `edit`(真控件輸入)。
- `editable` 判準(布林/callback,預設 true):false → view 無 hover/入口、**不灰化**(對齊世界級 detail-pane + grid:Atlassian/Jira/MUI X/AG Grid **就地編輯無 disabled 態**)。

**命名決策**:`display`→**`view`**(三層打通:MUI X cellMode=view / Atlassian readVIEW 字根 / edit 成對;過命名 3-test)。**撤回**:InlineEdit 加 disabled(round7 錯,detail-pane 鎖定=view 無入口,非灰化)。**廢除**:DataTable cell「disabled」(世界級 4 家全無 disabled cell = category error;meta.disabled 全庫 0 消費)。

**最終系統詞彙(6 個,零重疊)**:`view / edit`(互動軸)+ `readonly / disabled`(chrome 軸,form 專屬)+ `editable`(閘)+ `hover`。

**實作清單(全 GO)**:
1. **Field mode `display`→`view`** DS-wide(field-wrapper cva mode + field-context FieldMode type + 全 `mode="display"` 消費點 + 各控件)。
2. **cva(Model A,round16)**:view×default = **edit 減 chrome**(留 px-field-px + py + h-field,拔 border/bg;現況 `!px-0 !py-0` → 留 padding)+ view×naked = bare(**不 collapse 兩者**)+ 砍 `readonly×naked`+`disabled×naked` 死格 + Textarea 鏡像。抽 `fieldViewGeometry(size,multiline)` helper(view×default 幾何 class SSOT,供 InlineEdit 純值路徑共用)。
3. **InlineEdit(Model A,round16)**:state `read`→`view`、**砍自帶 geometry cva(`inlineEditReadStyles` 刪)**、值-格式化路徑委派 `<Control mode="view">` 取全幾何、純值/h1 路徑套 `fieldViewGeometry` helper、保留 `-mx`(orientation-aware A 案)+hover+focus+pressable、**加 `editable` prop(預設 true)**、**不加 disabled**、auto-sm(`fieldPreferredSize='sm'` static + Field 偵測)、接 fieldCtx cascade(size/labelId/orientation)、focus 分路徑(滑鼠乾淨/鍵盤藍框)、renderRead 行盒修(Tag 下沉)、spec「view↔edit 二態」。
4. **DataTable cell**:CellMode `display`→`view`、**廢 disabled**(meta.disabled→移除;鎖定用 `editable:(row)=>bool`)、命名 drift 收齊。
5. **canonical spec**:軸1 4-mode(edit/readonly/disabled/view)+ 軸2 就地編輯 host 統一模型(view/edit+editable)+ 每態一句時機,進 `field-controls.spec.md`。
6. **storybook**:4 內容規範機械化 + 三層機械腳本 + 修 dim-11 假證據 + 補 InlineEdit anatomy·principles + DS-wide 掃 verification-intent names。

**驗證到完美**:tsc / build:lib / typecheck:stories / data-table-invariants 39/39 / story-quality / three-layer / content-quality / storybook build + playwright pixel(鎖定 view vs InlineEdit view 零偏差、Tag 置中偏差~0)。**不改 a 壞 b**:每階段獨立驗證。

**🔎 user 最初 4 個 layout 議題(必逐一驗到)**:① 高度佔位=label+4px+sm-field-height(auto-sm)② Tag 垂直置中零偏差(行盒修)③ **換行保持上下 padding**(Model A 根治:多行/多 tag 的 wrap py **來自委派控件 view mode = 它 edit 的 py**〔Textarea view py-2、Select-tag view 保它 edit 的 wrap py/gap〕→ read/edit 同一顆控件、py 天生一致;**故 view×default 不可 collapse 成 !py-0**,否則委派內容失去 wrap py)④ blur 後純 view 無編輯指示(focus 分路徑)。**③ 最細,pixel 專項驗:多行/多tag 換行後上下 padding 保持 + read↔edit 零跳。**

---

## ✅ 實作完成(2026-07-16,Model A 全落地 + 對抗稽核 + pixel probe)

> ✅ **2026-07-19 RECONCILE:本投入早已 ship 上主線並發版。** 下述 6 commit(c3c1a09f/37aa63c4/63f5c71e/952033c4/
> ff82fcdc/b2049e0a)`git merge-base --is-ancestor` 全 IN main;working branch 已刪;後續已隨 beta.86→…→beta.89
> 連續發版。下文「未 push / 等 user push trigger / beta.86 未 release」等措辭為當時 working-branch 階段快照,**現皆已完成**,以本 RECONCILE 為準。

**6 commit(working branch `2026-07-15-inlineedit-storybook-remediation`,當時未 push;現已全 IN main)**:
c3c1a09f 更名+Model A cva+InlineEdit委派+cell disabled廢除 / 37aa63c4 storybook 治理機械化+三層補齊 /
63f5c71e spec view mode / 952033c4 對抗 loose ends+pixel probe / ff82fcdc 對抗 F1/F2/F3 / b2049e0a 治理閘進 preflight。

**驗證全綠**:tsc -b 0 / build:lib 0(型別 surface deploy-safe)/ typecheck:stories 0 / data-table-invariants 39/39 /
story-quality CLEAN / three-layer 0 缺 / inline-edit-view-geometry-invariant PASS / content-quality CLEAN /
storybook build 0 / **pixel probe 4/4**(read↔edit 水平零跳 Δ=0、多行 py-2 上下對稱 Δ=0、Tag 置中 Δ=0、auto-sm=field-height-sm Δ=2)。

**3-agent 對抗稽核**:cell 廢除 + auto-sm 零回歸(agent 3 逐路 trace 確認);抓 + 修 F2(standalone -mx 溢出)、
F1(補機械鎖 script)、F3(min-w-0)、number-input tight-pipe、spec mode-union DS-wide。

**FOREVER 機械強制**(user「no sampling」):三層閘 + geometry invariant + 4 storybook 內容規範(verification-intent
+ css-jargon 新增,breadth-tested)全進 release:preflight。**唯一剩 = user push main trigger**(規矩:Netlify preview gate)。

---

## (以下為研究過程紀錄,中間結論以上方最終模型為準)

**狀態**:✅ 實作完成(見上方「實作完成」段),等 user push trigger。
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

## B. 本輪未決 — ✅ 全數關閉(2026-07-16)
- ~~Q1/Q2~~ → 已由最終模型收斂(cell disabled 廢除、view/edit 命名三層打通),見「實作完成」段。

## B2. 2026-07-16 色彩 session(user 拍板追加,同 branch riding)
- **dark blue-6 對比升級**:oklch(0.60→0.63 0.22 258)= #2c84ff;card/table/浮層 AA ✗→✓(4.63-4.67:1);
  單一基準改值、階層公式全不動;端到端 --primary 計算值驗證 ✓(commit e64fb698)
- **dark turquoise 色相修正**:oklch(0.57 0.10 225)→(0.68 0.09 196)— 原值 = 複製 spec 假想範例的錯值
  (唯一 dark 改色相/L 降/C 升 三重違反);推導 = H 歸位 + L 經驗律內插 +0.04 + C ×0.95。連動 solid 白字
  2.77 < 3:1 → 切 --on-emphasis-dark 深字組(canonical 機制,4 處同步)(commit 7bbeac58)
- **3 文件 drift 修**:spec:504 例值 / categorical 順序註解 ×2 / orphan regex 幽靈色相(spec+script)
- **knowledge-prune nudge 關閉**:hook-quality 58 hot/16 warm/7 cool/1 false-positive dead → 成熟無真冗餘

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
