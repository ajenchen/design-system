# SSOT Index — High-risk interface ownership map

**Purpose**:per codex round 5 (e) — 設計提案前必查本 index 找 owner,再 grep spec verify。
避免 round 1-4 反覆「沒查就提案 → 提錯 owner → user 糾 → 再來」的 loop。

**Usage**:
1. 動視覺 / 結構前 → grep 本 file 找該 interface 是否列管
2. 命中 → 跳 owner spec 查 canonical sentence + 看 conflicting code 嗎?
3. 沒命中 → grep `*.spec.md` 找 anchor,**找到後加進本 index**(防下次再漏)

## High-risk interfaces(active divergence / past trap)

| Interface | Owner spec | Canonical sentence | Drift status | Last divergence event |
|---|---|---|---|---|
| **DataTable body cell internal indicator**(view endAction / clear / edit indicator)| `data-table.spec.md`「Body cell internal」row + `inline-action.spec.md`「DataTable body cell internal」row | 「Body cell internal = Field family endAction(自動繼承)」「Field view 元件已對齊」 | ✅ aligned:2026-05-09 D-path retired — `getEditIndicator(colType)` parallel system 移除,indicator authority 移交 Field naked view `showDisplayEndIcon` opt-in(prop 名保留),cellEl 不再 render parallel indicator(見 data-table.tsx「D-path retired」註解);2026-07-08 A 案:cell-registry 預設不再傳(view 態零恆顯 icon,prop 留 opt-in 逃生門,見 field.spec L6 v16)| 2026-05-08 round 5 → 2026-05-09 resolved |
| **Field naked variant state ring**(hover / focus / open / error)| `field-wrapper.tsx` cva compoundVariants(v13.3)+ `field.spec.md`「focus dominates」段 | 「SSOT 在 field-wrapper.tsx 三 compoundVariant — 改一處全 control + cell + variant 跟動」 | ✅ aligned(2026-05-08 D path canary 違反後 revert)| 2026-05-08 round 4(D path canary 違反 SSOT,已 revert `f0faab9`)|
| **Row prefix/suffix slot**(`<ItemPrefix>` / `<ItemSuffix>`)| `patterns/element-anatomy/item-anatomy.spec.md:175+190` | 「row prefix/suffix slot 必走 patterns/element-anatomy L1 primitive」「`h-[1lh] shrink-0 flex items-center` 普世正確」 | ✅ aligned(hook `check_pattern_invariants.sh` C.4 enforce)| — |
| **Inline action gap**(ItemInlineAction sibling spacing)| `patterns/element-anatomy/inline-action.spec.md`「多個 inline action 間距」段 | 「inline-action 跟 sibling gap 必 = `gap-2`(8px)」 | ✅ aligned(hook C.2 enforce)| — |
| **Drag visual**(drop indicator / drag overlay)| `lib/drag-visual.ts`(2026-05-06 v14.5)+ `tree-view.spec.md:265` | 「TreeView 是 DS 內最早 codified 的 drag canonical,DataTable row drag + column reorder 都 inherit via drag-visual.ts SSOT module」 | ✅ aligned | — |
| **Color tokens**(primitive vs semantic)| `tokens/color/color.spec.md`(架構流派定位)+ `tokens/color/semantic.css` | 「禁 primitive 色名作 utility,用 semantic alias」 | ✅ aligned(hook `check_naming_and_abstraction.sh` D.3 enforce)| — |
| **Layout space**(region/element + 親疏三級)| `tokens/layoutSpace/layoutSpace.spec.md` v6(原 memory `feedback_layout_v6_canonical.md` 已 retire)| 「region/element + bounded/unbounded + 親疏三級」 | ✅ aligned(2026-05-01 flush variant retire)| 2026-05-01 |
| **DataTable scroll**(3-region synced + cross-OS scrollbar)| `data-table.spec.md:245-251` | 「center body 用 native overflow-x-auto(非 ScrollArea),pinned column 三 region 同步」 | ✅ aligned(v15.13 interim CSS parity for Windows Bug H,deferred ScrollArea full migration)| 2026-04-30 / 2026-05-07 |
| **Cell view vs edit content position**(picker offset)| `field.spec.md`「Layout Family 4」段 + `data-table.spec.md`「Body cell internal」row | 「Field control view + edit 共用同 wrapper geometry(Model A:view×default = edit 幾何減 chrome,保留 px/py)」 | ✅ aligned:DataTable cell 場景走 Field naked(`showDisplayEndIcon` opt-in);standalone `mode="view"` 走 view×default = edit 幾何減 chrome(2026-07-16 Model A,原 bare-span deferral 已兌現;值內容層 4-mode 共享 renderer,見 select.tsx 檔頭 `@renderer-symmetry-allow`)| 2026-05-07~08 round 1-5 → 2026-07-16 Model A resolved |
| **Field state machine focus dominates**(v13.3)| `field-wrapper.tsx` cva compoundVariants + `field.spec.md`「focus dominates」段 + `check_field_family_invariants.sh` A.3 | 「focus dominates everything;naked 不寫平行 outline ring」 | ✅ aligned;hook A.3 enforce | 2026-05-06 v9-v13.3 5 round refinement |
| **Solo dev workflow**(1 chat = 1 branch / Netlify gate / squash merge)| `feedback_solo_dev_workflow.md` + CLAUDE.md「Git solo-work canonical」 | 「1 chat = 1 working branch;Netlify preview = user gate;『push / OK』trigger 才 merge main」 | ✅ aligned(M28 + hook `check_solo_workflow.sh`)| 2026-05-08 M28 codify |
| **Wrapper-vs-primitive schema unify**(SelectOption / MenuItemProps 等)| `SelectMenu/select-menu.tsx` SelectMenuOption + `Combobox/combobox.tsx` extends + `PeoplePicker/people-picker.tsx` extends | 「wrapper API schema 必 `extends primitive`,wrapper 內部 mapping 必 forward 全 primitive surface field(M30)」 | ✅ aligned(2026-05-10 Round 1 commit `561945b` Combobox extends + forward 全 field;PeoplePicker 對齊 + hook `check_wrapper_primitive_schema_drift.sh` BLOCKER)| 2026-05-10 M30 codify |
| **空值顯示符號 + 分流**(empty value display)| `field-context.ts` `useFieldEmptyDisplay()`(分流 hook)+ `field-wrapper.tsx` `EMPTY_DISPLAY = '-'`(半形常數)+ `field-controls.spec.md`「null / undefined 值」段 | 「符號 = 半形 hyphen `-`(U+002D),**非**全形 em dash;`surface==='table-cell' && isEditable ? '' : '-'`;可編輯 form edit 走 native placeholder。全 Field family 空值渲染必經 hook,consumer 禁直引 `EMPTY_DISPLAY`」 | ✅ aligned(2026-07-08 user 拍板半形;hook `check_field_family_invariants.sh` A.6 BLOCKER — 禁非 owner 直引常數 + 禁 hardcode 全形 em dash;DescriptionList / ProfileCard / FileViewer consumer 同步半形)| 2026-07-08 user directive |

## How to maintain

- 新 interface 第一次 surface → 加進本 index
- 新 divergence 發現 → 加 row + 標 ⚠ DRIFT
- Drift 解決 → 改 ✅ aligned
- 重大 round 結束 → 逐 row 反 grep owner spec/code 驗仍一致(`/deep-audit-cross-codex` Phase A 必讀清單已含本檔,見 `phase-a-workflow.md:15`;無專屬 audit dim 機械化)

## 與 hook 關係

- `check_ds_anchor_preflight.sh`(live,P0 BLOCKER exit 2,2026-07-07 升級)— 偵測 production tsx / apps consumer 內 DS primitive wrap 而無 canonical read trace → block;bypass `CLAUDE_BYPASS_DS_ANCHOR=1`(audit-logged)
- `check_field_family_invariants.sh` A.3 — 機械化 enforce v13.3 SSOT
- `check_pattern_invariants.sh` C.4 — 機械化 enforce row slot SSOT
- `check_canonical_propagation.sh` E.2 — 機械化 enforce L3 primitive import
