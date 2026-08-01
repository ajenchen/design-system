# 治理 home × 稽核者覆蓋表（2026-08-01 重驗）

**觸發**:user verbatim「綜觀來看,deep audit 到底會不會稽核**所有** DS 的治理?」— 不是單軸,是全部。本表 = 逐 home 盤點「誰稽核它、怎麼稽核、多常跑」,誠實標出弱軸。**消費點:`design-system-audit/SKILL.md` Phase 4.5 deep mode**— 同一 run 的 full knowledge-prune 後必逐 row 對照本表並產 evidence／UNOBSERVED receipt；新治理物無 row 或漏 row = deep run 不完整。Default audit 只跑 light prune，不冒充全治理覆蓋。

## 覆蓋表(逐 home,cite 查證過)

| 治理 home | 稽核者(機械) | 跑的時機 | 覆蓋度 |
|---|---|---|---|
| `AGENTS.md` + canonical `packages/design-system/ds-canonical/rules/*.md` + 計數 snapshot | `sync-governance-counters --check`(數字 drift,fail-closed)+ session-start Check 7 + `_governance_coverage_check` PostToolUse(原則→dim 對映)+ knowledge-prune D1/D4(重複/矛盾) | 每 session + 每發版 + 季度 | ✅ 強 |
| `packages/design-system/ds-canonical/rules/*.md`(M-rules 等) | counters(M-rule 數)+ `extract-canonical-rules --check` + canonical-reviewer agent(edit 時)+ knowledge-prune D1/D3/D4 | 每 edit + 每發版 + 季度 | ✅ 強 |
| `*.spec.md` | deep-audit dims 6/7/8(NO-SAMPLE judgment)+ A.1b claim-vs-code 逐句 + `audit-spec-deadlinks --check` + `add-reciprocal-pointers --check` + `check_spec_class_drift` hook + `audit-content-quality --check`(**scope 註:此 script 只掃 components/ 的 spec/story,非治理 md**) | 每 deep-audit + 每發版 | ✅ 強 |
| registered hooks | `audit:hook-quality`(有可信 telemetry 時才判 fire 活性/假死；缺資料 = unobserved)+ `audit-hook-test-coverage --check`(BLOCKER hook 必有 test)+ `tests/run-all` + fork classification gate(`build-fork-governance --check`,新 hook 未分類 = 擋發版)+ dynamic counters(數量 cap) | 每 deep-audit + 每發版 + 季度 | ✅ 結構強 / ⚠️ live telemetry 視環境可為 UNOBSERVED |
| canonical skills | knowledge-prune D7(只在有可信 invoke telemetry 時判活性)+ file-size hook + deep-audit A.0 全讀 + governance-health 月度；inventory 由 canonical tree 動態枚舉 | 每 deep-audit + 季度 + 月度 | ⚠️ 中(read 層有了;逐句 claim-vs-behavior 仍無機械閘 = 弱軸 2) |
| committed memory SSOT + provider cache | session-start 對 repo SSOT cap 檢查(≤20)+ `sync-memory --check` content-hash drift + knowledge-prune D8(recency/orphan) | 每 session + 季度 | ✅ 強 |
| `references/`(registry / 對照表) | dim 91 registry gate(failure-class)+ `check_story_invariants` R8(story-baseline-registry 消費)+ repo-hygiene exact inventory/duplicate gate + prune D1/D4/D2 references-orphan | 每 deep-audit + 每發版 + 季度 | ⚠️ 中(結構/registry 強；純文字語意仍靠季度 judgment) |
| `planning/`(Level 9 plan doc) | `validate-planning-registry.mjs` 驗 exact inventory/status/executable contract；knowledge-prune D8 驗 active memory pointer、stale/orphan | 每 deep-audit + 每發版 + 季度 | ⚠️ 中(狀態機械；內容 recency 仍是 judgment) |
| repository folder/file topology(含 authority + available registered consumer repos) | `repository-hygiene-invariant.mjs` + paired mutation meta-test + `references/repository-hygiene.md` 全檔語意分類；未掛載 repo = unobserved | 每 full/deep audit + 每發版 | ✅ 結構強 / ⚠️ ambiguous future-use 需 evidence judgment |
| checker gates(discovery-derived) | `audit-coverage-matrix --check`(每 dim 的 tier/mechanism 封閉分類、deterministic plan 與 active hook edge 綁定)+ `audit-gate-meta-test-coverage --check`(發現數 = paired owner 數、zero debt)+ `run-gate-meta-tests.mjs`(一次性 disposable snapshot 內執行 paired mutation tests)。Harness registry 從 checker inventory + execution owner 即時重算；任一 test 改成 external-only 就立即產生 gap 並 fail closed，不靠人工維護總數。 | 每 deep-audit + 每發版 + All-Harness | ✅ 強(只證明本機 mutation closure；不冒充 browser/registry/model/CI/managed-host live certification) |
| plugin / marketplace / fork corpus | `plugin-structure-validate` + `build-fork-governance --check` + `test-fork-governance` 假 fork harness(防 false-green/brick)+ counters | 每發版 | ✅ 強 |
| eslint-plugin | 自帶 node --test(50 case)| 手跑/CI 無(**未發佈 = 對 consumer 零效**,plan doc 批次 B) | ⚠️ 已知缺口(tracked) |
| commands / agents(稀住戶) | knowledge-prune D2(2026-07-10 補 bullet:commands 對照 skill-invokes log / agents 用 git recency + transcript grep — 原 D2 零掃描此二 home) | 季度 | ⚠️ 低(住戶少、變動少) |
| failure-class(病根→防線) | **dim 91 `audit-failure-class-coverage --check`(2026-07-10 新)** | 每 deep-audit + 每發版 | ✅ 強 |
| provider/runtime/model 與獨立第二意見綁定 | Provider-neutral authority = `packages/governance/canonical/providers.json` + `infra/governance/providers/model-release-registry.json` + `provider-review-binding.mjs` + managed-CI model-release authority/readback。`check-codex-freshness.mjs` 僅是 **Codex local adapter diagnostic**(config/CODEX_HOME/CLI/evidence TTL/model identity fail closed)，不是 Claude/未來 provider 共通 workflow，也不再宣稱已接入 legacy deep-audit B.0 或 codex-collab Step 0.4。 | 每次 independent-review/deep-audit provider binding；Codex diagnostic 只在對應 adapter 明確執行 | ✅ contract 強 / ⚠️ live model/provider certification 仍以外部 readback 為準 |

## 誠實結論(回答「所有?」)

**所有已登記治理 home 都有稽核路徑，能機械化的結構／計數／引用／拓撲／mutation closure 均 fail closed。**仍有 4 個不能冒充全自動真值的弱軸（全部 tracked，非隱藏）：

1. **live 外部執行/啟用**:discovery-derived 本機 paired mutation 已保持 zero-gap，但 GitHub rulesets/App identities、registry/npm、真實 model provider、cloud runner 與 managed-host 仍必須用簽署且鮮度受控的 live readback 認證；`Unverified` 不能當 PASS。
2. **SKILL.md 內容 claim-vs-behavior**:skill 文字宣稱的流程 vs 實際 hook/script 行為,無逐句機械比對(A.1b 只對 component spec)。季度 prune D5 部分覆蓋。
3. **eslint-plugin 未發佈**(批次 B tracked)。
4. **planning / 純文字 reference 靜置漂移**:by-design 低頻,D1/D4/D8 季度兜底;規則 = 活的內容必有 memory pointer。

**加新治理物時的規矩**:新 home / 新 artifact 類型 → 本表加 row(誰稽核它、多常跑);沒 row = deep-audit C.0b 抓(已接線)。
