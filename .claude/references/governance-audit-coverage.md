# 治理 home × 稽核者 覆蓋表(2026-07-10)

**觸發**:user verbatim「綜觀來看,deep audit 到底會不會稽核**所有** DS 的治理?」— 不是單軸,是全部。本表 = 逐 home 盤點「誰稽核它、怎麼稽核、多常跑」,誠實標出弱軸。**機械消費點:deep-audit SKILL C.0b(2026-07-10 接線)— 每輪收尾必逐 row 對照本表,新治理物無 row = C 階段不完整**;另 knowledge-prune 季度掃時參照。

## 覆蓋表(逐 home,cite 查證過)

| 治理 home | 稽核者(機械) | 跑的時機 | 覆蓋度 |
|---|---|---|---|
| `CLAUDE.md` ×2 + 計數 snapshot | `sync-governance-counters --check`(數字 drift,fail-closed)+ session-start Check 7 + `_governance_coverage_check` PostToolUse(原則→dim 對映)+ knowledge-prune D1/D4(重複/矛盾) | 每 session + 每發版 + 季度 | ✅ 強 |
| `.claude/rules/*.md`(M-rules 等) | counters(M-rule 數)+ `extract-canonical-rules --check` + canonical-reviewer agent(edit 時)+ knowledge-prune D1/D3/D4 | 每 edit + 每發版 + 季度 | ✅ 強 |
| `*.spec.md`(83+) | deep-audit dims 6/7/8(NO-SAMPLE judgment)+ A.1b claim-vs-code 逐句 + `audit-spec-deadlinks --check` + `add-reciprocal-pointers --check` + `check_spec_class_drift` hook + `audit-content-quality --check`(**scope 註:此 script 只掃 components/ 的 spec/story,非治理 md**) | 每 deep-audit + 每發版 | ✅ 強 |
| hooks(56) | `audit:hook-quality`(fire 活性/假死)+ `audit-hook-test-coverage --check`(BLOCKER hook 必有 test;**2026-07-10 進 preflight fail-closed**)+ `tests/run-all` + fork classification gate(`build-fork-governance --check`,新 hook 未分類 = 擋發版)+ counters(數量 cap) | 每發版 + 季度 | ✅ 強 |
| skills(SKILL.md ×22) | knowledge-prune D7(invoke 活性)+ file-size hook + deep-audit A.0 第 7 項全讀(2026-07-10 補真 — 原宣稱超前)+ governance-health 月度 | 每 deep-audit + 季度 + 月度 | ⚠️ 中(read 層有了;逐句 claim-vs-behavior 仍無機械閘 = 弱軸 2) |
| memory(SSOT + mirror) | session-start cap 檢查(≤20)+ `sync-memory` drift + knowledge-prune D8(recency/orphan) | 每 session + 季度 | ✅ 強 |
| `references/`(registry / 對照表) | dim 91 registry gate(failure-class)+ `check_story_invariants` R8(story-baseline-registry 消費)+ prune D1/D4 + **D2 references-orphan 掃(2026-07-10 加)** | 每發版 + 季度 | ⚠️ 中(2026-07-10 修:原誤引 canonical_propagation/counters — 兩者實際不掃本目錄;純文字 reference 靠季度) |
| `planning/`(Level 9 plan doc) | 設計上 = 歷史 SSOT 存檔;**D8 planning-orphan 掃(2026-07-10 補 — 原 D8 只掃 memory 方向相反)** | 季度 | ⚠️ 低-by-design(存檔性質;活的必有 memory pointer,無引用 → D8 列 orphan 候選) |
| scripts/ gates(76 .mjs) | `audit-coverage-matrix --check`(每 dim 的 mechanism script 必存在於 disk)+「DETERMINISTIC dim 必驗 mode 真跑」鐵律(2026-06-11)+ 引入時 breadth-test 鐵律(注入違規→抓到→revert) | 每 deep-audit + 每發版 | ⚠️ 中(**gate script 自身正確性**只有 3 支有專屬 meta-test〔fork harness / DataTable invariants / story-manifest〕;其餘靠引入時 breadth-test + dim 真跑證據。系統性 meta-test = roadmap 候選,見下) |
| plugin / marketplace / fork corpus | `plugin-structure-validate` + `build-fork-governance --check` + `test-fork-governance` 假 fork harness(防 false-green/brick)+ counters | 每發版 | ✅ 強 |
| eslint-plugin | 自帶 node --test(50 case)| 手跑/CI 無(**未發佈 = 對 consumer 零效**,plan doc 批次 B) | ⚠️ 已知缺口(tracked) |
| commands / agents(稀住戶) | knowledge-prune D2(2026-07-10 補 bullet:commands 對照 skill-invokes log / agents 用 git recency + transcript grep — 原 D2 零掃描此二 home) | 季度 | ⚠️ 低(住戶少、變動少) |
| failure-class(病根→防線) | **dim 91 `audit-failure-class-coverage --check`(2026-07-10 新)** | 每 deep-audit + 每發版 | ✅ 強 |
| codex 鏈(CLI/model 新鮮度) | **`check-codex-freshness.mjs`(2026-07-10;deep-audit B.0 前置 + codex-collab Step 0.4 同日補接 = 兩條 codex 路徑皆 gate;CLI 落後自動升 + 禁 model pin + effort probe top)** | 每次 codex 使用(兩路徑)| ✅ 強 |

## 誠實結論(回答「所有?」)

**主幹 9 軸已全機械化 + fail-closed**(內容/計數/機械化程度/hook 活性+測試/膨脹矛盾/fork 出貨/病根覆蓋/codex 新鮮度/dim 自身反抽樣)。**「所有」還不成立的 4 個弱軸**(全部 tracked,非隱藏):

1. **gate script 自身正確性**:多數 .mjs gate 無 meta-test(靠引入時 breadth-test + deep-audit「真跑證據」規則)。升級路 = 對 fail-closed gate 逐支補「注入違規必 exit 1」self-test(fork harness 模式推廣)。歸 governance-evolution roadmap 方向 5 品質回灌。
2. **SKILL.md 內容 claim-vs-behavior**:skill 文字宣稱的流程 vs 實際 hook/script 行為,無逐句機械比對(A.1b 只對 component spec)。季度 prune D5 部分覆蓋。
3. **eslint-plugin 未發佈**(批次 B tracked)。
4. **planning / 純文字 reference 靜置漂移**:by-design 低頻,D1/D4/D8 季度兜底;規則 = 活的內容必有 memory pointer。

**加新治理物時的規矩**:新 home / 新 artifact 類型 → 本表加 row(誰稽核它、多常跑);沒 row = deep-audit C.0b 抓(已接線)。
