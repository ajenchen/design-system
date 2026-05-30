# New Component 建立 checklist(每 phase 必過)

本檔對應 `SKILL.md` 6 phase,每項可直接勾選。

---

## Phase 1 — 近親 spec 掃讀

- [ ] 識別 2-3 個近親元件(同 family / pattern / 職責)
- [ ] 完整讀至少 2 個近親 spec.md
- [ ] 抓到 Layout Family 宣告、API surface、禁止事項、SSOT anchor
- [ ] 查至少 2 個世界級 DS(Polaris / Material / Atlassian / Ant / Apple HIG)對應元件
- [ ] `ls packages/design-system/src/components/` 確認名字無衝突
- [ ] grep CLAUDE.md `# 失敗記憶索引` 查同類歷史 bug

## Checkpoint 1 — 定位 Proposal

- [ ] 元件名通過「命名三重 test」(既有語言 / 世界級 idiom / 跨元件無衝突,見 CLAUDE.md `# 命名與語言一致性`)
- [ ] 報 user:元件名 / 近親 / 世界級對照 / positioning 一句話
- [ ] User 點頭

## Phase 2 — Layout Family 判定

- [ ] 走 CLAUDE.md `# 4-Family Layout Model` 判斷流程
- [ ] 若 Family 1/2 → 確認消費 `<MenuItem>` + slot components(不重寫 row 結構)
- [ ] 若 Family 3 → follow `Button Pill Layout` canonical(見 button.spec.md)
- [ ] 若 Family 4 → follow field-controls.spec.md
- [ ] 若 Non-family → 寫 3-5 行 rationale 說明為什麼不是 1-4

## Phase 3 — spec.md 7 維度

- [ ] 定位(含 Layout Family + 實作基礎 + 世界級對照)
- [ ] 何時用(3-5 真實業務情境)
- [ ] 何時不用(表格:情境 / 改用 / 原因)
- [ ] 禁止事項(❌ 清單)
- [ ] 相關 / SSOT pointer(互相 link,ownership 明確)
- [ ] 空值呈現 / 驗證時機(若不適用寫明文「本元件無 X」)
- [ ] Loading / 無障礙(若不適用寫明文)
- [ ] **Checkpoint 2**:spec 寫完停下報 user,lock in positioning

## Phase 4 — tsx

- [ ] 結構 shadcn + forwardRef + cva + VariantProps + cn()
- [ ] cva 適用正確(見 `.claude/references/cva-patterns.md`;style prop / 結構性 variant 不硬塞 cva)
- [ ] Props 命名按「是什麼」不按「在哪裡」(startIcon / endIcon / avatar / onDismiss / onClose / onClear / onRemove)
- [ ] callback 命名分層正確(`.claude/rules/ui-development.md`「元件 Props 命名」 的 canonical)
- [ ] Token 消費三層分層(chrome/layout-space / 元件內/Tailwind p-N / 精確幾何/calc)
- [ ] Icon size 三層分層(row 走 RowSizeContext / Button 走 Button mapping / 一次性 inline size={n} 對齊 uiSize)
- [ ] 無 shadcn compat alias(bg-popover 等)
- [ ] 無硬色 / shadow-sm / 預設 typography class
- [ ] `tsc --noEmit` 過
- [ ] cva defaultVariants 正確(Field 家族 default md;其他按 spec 明示)
- [ ] cva defaultVariants 改動 → 三方同步(spec / docblock / anatomy story)

## Phase 5 — stories(3 個 .stories.tsx 檔)

- [ ] `{name}.stories.tsx` 展示 3-5 真實業務情境(禁 Option A/B/C / 抽象代號 / 極端不現實)
- [ ] `{name}.anatomy.stories.tsx` 含 Overview + SizeMatrix + ColorMatrix(若有) + StateBehavior + Inspector(或 subset + rationale)
- [ ] `{name}.principles.stories.tsx` 含 do/don't Rule stories,每則 title + note + 範例
- [ ] 「人」test 過:遮標題 5 秒能懂情境
- [ ] 「舉一反三」test 過:讀者推得出自己產品怎用
- [ ] hook `check_story_invariants.sh` R1 anatomy(原 check_story_anatomy.sh folded 折入)未觸發 block(無手刻 list item / label Button dismiss / 自刻 overlay)
- [ ] Storybook title path 正確(`Design System/Components/{Name}/{中文子頁}` 或 `Internal/{Name}/...`)

## Phase 6 — Self quality-gate chain

- [ ] Invoke `/component-quality-gate` skill
- [ ] 45 項全綠
- [ ] Phase 4.5 visual audit Layer A 過(0 contrast / 0 geometry violation)
- [ ] Phase 4.5 Layer B AI 視覺判斷過(或有 documented rationale)
- [ ] 回報 user「元件 {Name} 建立完成,已過 create + review 雙 gate」

---

## 常見失敗 → 回哪 phase 修

| Quality-gate finding | 回 phase |
|---|---|
| Spec 七維度漏項 / positioning 不明 | Phase 3 |
| cva 結構錯 / 硬色 / token leak | Phase 4 |
| Stories 用 Option A/B/C / 虛構情境 | Phase 5 |
| Layout Family 判錯 / 不消費 MenuItem | Phase 2 |
| 名字跟既有元件撞語義 | Phase 1(改名後全回 Checkpoint 1) |
| Visual audit contrast 不過 | Phase 4(改 token),重跑 Phase 6 |
| Visual audit geometry fail(等高 / 對稱 padding / gap 錯) | Phase 4(改 tsx 或 assertion rationale),重跑 Phase 6 |
