<!-- Authority/status: governance/planning/registry.json -->
# Codex collab synthesis — I1 placeholder + I3 overflow(2026-05-15)

**Transport**:local codex CLI(`npx codex exec`,reply 1-3 min)。Per `codex-collab/SKILL.md` Step 5 比稿 + transport.md「地端 → local」canonical(我兩 turn 前誤 default cloud — 撤回)。

## Step 1-3 各自熟讀 + verify(各自獨立)

Claude:grep field-wrapper.tsx / select.tsx / person-display.tsx / combobox.tsx / cell-registry.tsx;raised H1 + H2 + H3。
Codex(本機 `npx codex exec`):同 grep + read source。

## Step 4.5 verify codex cite(我 cross-check)

| Codex cite | 實 verify 結果 |
|---|---|
| `field-controls.spec.md:14-22` Family 4 SSOT | ✅ verified — L14-22 含「Family 4(Field Control Layout)SSOT owner」 |
| `data-table.spec.md:233-235`「禁硬裁無 ellipsis」 | ✅ verified — L233 verbatim「每個 Display 元件自管 truncation,Cell `overflow-hidden` 僅 safety net。截斷必顯 `...`(**禁硬裁無 ellipsis**)」|
| `data-table.spec.md:217` cell endAction → Field family | ✅ |
| `person-display.tsx:170` `resolvedMax = max ?? 3` | ✅ verified line 170 verbatim |
| `combobox.tsx:143` negative margin overlap caveat | ✅ verified comment block |

## Step 5 比稿 verdict

| Question | Claude H | Codex H | Cite battle | Synthesis |
|---|---|---|---|---|
| Q1 placeholder no ellipsis | **H1: fieldWrapperStyles `min-w-0` 缺** | 同意 + 已看到 L19 註解 verify shipped | (none — agree) | ✅ **已 ship min-w-0 in fieldWrapperStyles base**(commit pending);DS-wide M10 follow-up:13 empty span 補 truncate min-w-0 |
| Q2 cell 越界 | placeholder text 越界 | ⚠️ **可能是 dropdown menu width > cell**(SelectMenu `minWidth: max(trigger, 15rem)` 是 canonical 非 bug) | codex cite SelectMenu canonical — strong | **PENDING user 確認截圖** — trigger overflow or menu width? Codex 提的 menu width 是 design canonical |
| Q3 overflow 非確定 | **H2: image load timing**(撤回) | ✗ Avatar 固定 w/h,image 不改 offsetWidth。**真 root cause**: display path `MultiPersonDisplay` 硬寫 `max ?? 3` vs edit path `useOverflowCount` 真實量測 + negative margin overlap 偏保守 = **兩套 algorithm 沒 SSOT 統一** | codex cite `person-display.tsx:170` + `combobox.tsx:143` — strong | **撤回 H2,採 codex root cause**。**真正 fix**:收成 single measured avatar-stack overflow primitive,display + edit 共用,接受 `overlapPx` 或 `getBoundingClientRect` + margin compensation |

## External cite(codex 補)
- MUI X DataGrid columns: cell content `text-overflow: ellipsis` canonical(https://mui.com/components/data-grid/columns)
- Ant Table `column.ellipsis`: 同 idiom(https://3x.ant.design/components/table/)

兩家 world-class 共識 = `data-table.spec.md:233` DS 內 canonical 對齊(M23 internal-first verified)。

## 落地 action(per Step 6 implement)

### 已 ship(本 session)
1. **H1 fix**:`field-wrapper.tsx:25` 加 `min-w-0` 進 fieldWrapperStyles base(整 Field family ~10 元件 SSOT)— commit pending

### Auto(per autonomy canonical AUTO scope)
2. **Q1 DS-wide M10 follow-up**:13 sites EMPTY span(Combobox 2 / DatePicker 1 / LinkInput 3 / PeoplePicker 3 / person-display 2 / RadioGroup 1 / TimePicker 1)補 `truncate min-w-0`(若 EMPTY 本身只 `—` 不會 overflow 可不補;若 value/label 用同 span 就必補)

### Substantive — 等 user 拍板(SSOT-UI/UX)
3. **Q3 真 fix**(per codex)— 收成 single measured avatar-stack overflow SSOT primitive:
   - new primitive: `AvatarStackOverflow`(measured)取代 `MultiPersonDisplay max ?? 3` + `Combobox useOverflowCount` 平行
   - 接 `overlapPx` 或 `getBoundingClientRect` + margin compensation
   - display + edit 共用 → 同 cell width 同 result(確定性)
4. **Q2 user 確認**:截圖是 trigger 越界 or dropdown menu wider than cell?

## Step 7 / 後續
- 此 synthesis 進 `.claude/memory/codex-brief-queue.jsonl` `{topic:"i1-i3", transport:"local", repliedAt:"2026-05-15T..."}`
- H1 commit + DS-wide M10 commit
- 待 user 確認 Q2 + Q3 拍板才動 substantive primitive
