# Phase 3.5 Self-audit checklist(/prototype 用)

對齊 CLAUDE.md `# 稽核 canonical` M6(stakeholder-visible 產出 → 強制進階模式)。比稿本質是「給 stakeholder 選視覺方向」,6 維任一沒 audit 好就 present = 比稿品質失準。

## 6 維對應 skill

| 維度 | Skill | Audit scope |
|------|-------|-------------|
| **D1 設計語言一致** | `/product-ui-audit` | 6 dim(token 紀律 / layout primitive / 元件使用 / mindset / 幾何 / a11y) |
| **D2 程式語言一致** | `tsc --noEmit` + lint | exploration 目錄 |
| **D3 元件效能** | `/performance-audit` | render / memo / bundle(per candidate) |
| **D4 UX 行為** | `/ux-audit` | keyboard / focus / ARIA / animation |
| **D5 視覺品質** | `/visual-audit` | Layer A mechanical + Layer B AI judgement |
| **D6 設計原則自檢(4 子維)** | chain `principle-audit-protocol.md` | 合理 / 一致 / 無矛盾 / 完整 |

## 執行順序

0. **Flow snapshot coverage 前置檢查**(M15,Phase 3.5 gate 前必過):exploration 必含 OpenSnapshot 類 stories,涵蓋所有 UI flow state(initial / open / confirm / success / error / empty)。Pattern:`defaultOpen` / `useState(true)` / play() interaction 讓 Playwright 能截圖。未提供 = block audit。
1. `npm run visual-audit -- --scope=component:{topic-slug}`(D5 Layer A,產 snapshots)
2. Chain `/product-ui-audit`(D1)scope 到 `src/explorations/{topic-slug}/`
3. Chain `/performance-audit`(D3)scope 到 exploration
4. Chain `/ux-audit`(D4)scope 到 exploration
5. Chain `/visual-audit`(D5 Layer B AI judgement)讀 `snapshots/*.png`
6. **D6 真 scan**:chain `node_modules/@qijenchen/design-system/ds-canonical/skills/design-system-audit/references/principle-audit-protocol.md` 對 exploration code 跑 4 子維;依判斷公式 auto / STOP
7. **Self-improvement capture**(強制 Phase F step,見 CLAUDE.md `# 治理 canonical`)

## Gate 規則(嚴格)

| Finding | 處理 |
|---------|------|
| D1 / D2 P0(token alias / 硬色 / 幾何違反 / tsc error) | 必修 |
| D5 Layer A violation(contrast AA 不過 / geometry assertion fail) | 必修(視同 P0) |
| D3 / D4 高 impact finding(render 爆 / keyboard 不通 / ARIA 缺) | 必修 |
| D5 Layer B 明顯設計問題 | 必修 OR notes.md 明文 rationale |
| D6 canonical 疑點 | 不 block,列 STOP 區等 user sign-off |
| Code P1 > 3 筆 | 建議修,user 可決定先 present 或先修 |
| 無 P0 + Layer A 乾淨 + D3/D4 無高 impact | 可進 Phase 4 |
