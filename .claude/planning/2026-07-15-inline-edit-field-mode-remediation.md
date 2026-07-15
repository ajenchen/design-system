# InlineEdit / Field-mode / Storybook 重整 — 追蹤總帳(2026-07-15)

**狀態**:規格研究中(10+ 輪唯讀深研已完成),**尚未實作任何 code**(user 要先把規格全確認好)。
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
- **未定(本輪 Q1/Q2 研究中)**:若真要保留 Handsontable 式「灰化=這格被保護」顯性訊號,則留 4 態、正名 disabled→readonly,且該吃哪個 SSOT token(Q1)+ cell 各態命名世界級對照(Q2)。

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
