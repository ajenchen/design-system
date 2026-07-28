# Provider-neutral Agent Skills charter

**Canonical owner:** `packages/design-system/ds-canonical/skills/**`. Runtime skill directories are deterministic provider views. Shared workflow meaning belongs here; provider identity, peer transport, discovery paths, and role bindings belong only to the provider registry.

## 這裡只收:可重複、可延遲載入的 Agent Skills workflow

每個 skill 一個 folder,內含:
- `SKILL.md` — frontmatter(`name` / `description`) + 完整 workflow body
- `references/` — 深度細節檔(AI 在跑 workflow 時按需讀)

**核心特徵**:只在相關或 user invoke 時載入(不佔每 session context)；採 Agent Skills 共用形式，並投影到所有已認證 provider surface。只有改變產品／UI／UX SSOT 且仍有真實選擇或取捨時才設 user checkpoint；純工程／治理決策依 shared governance 的 Engineering Decision Policy 與 Standing Authorization 自動收斂，純讀、deterministic 的 one-shot 檢查可無 checkpoint。

## 當前居民(25 skills,2026-07-22 update)

**Audit / Quality(5)**:
| Skill | Invoke 時機 | Scope |
|-------|-----------|-------|
| `design-system-audit/` | user 要求 audit DS 本身 | DS 內部 spec/cva/SSOT full-dim(Phase 0 自建 baseline)|
| `product-ui-audit/` | 「audit 這個 UI / 檢查 DS 用對嗎」| consumer UI 7 維檢核 |
| `component-quality-gate/` | 元件 merge / ready / check | 45+ 項 checklist + Phase 4 Ship 6 項 |
| `visual-audit/` | 視覺對齊 / 排版問題 / gap 錯 | pixel-level Layer A + B |
| `code-quality-audit/` | 量化 clean code(any / dead export / file-size / long fn / circular dep / magic number)| chained by /design-system-audit Dim 27 |

**Performance / UX(2)**:
| `performance-audit/` | 「這元件效能如何」 | render / memo / bundle |
| `ux-audit/` | 「鍵盤用不了 / focus 跑飛 / 無障礙」 | keyboard / ARIA / animation |

**Build-phase workflow(3)**:
| `new-component/` | 「做新元件 X」 | 6-phase 建新元件 |
| `prototype/` | 「做 prototype / MVP / 原型」 | exploration + Phase 3.5 gate |
| `delivery-handoff/` | 「要交付 / handoff」 | figma-like 交付包 |

**Story 層(2)**:
| `story-writing/` | 「寫 story / 補 anatomy / principles story」 | 6-story 結構 + 範例品質 |
| `story-auto-compile-migrate/` | 「migrate 元件到 auto-compile」/ auto-chained by audit Dim 23 | 批次加 `componentMeta` export + spec YAML frontmatter(Phase 1+2 migration) |

**Governance(8)**:
| `knowledge-prune/` | 季度 / shared instructions 超過預算 / memory index 超過預算 / audit 報 sprawl | 治理冗贅深度 prune |
| `governance-health/` | 月度 / auto-chain by audit | continuous metric monitor + auto-propose |
| `propose-options/` | 給 option A/B/C 前必走 M18 4-Q gate | M8 benchmark / M17 SSOT / Rule-of-3 / M10 下游 |
| `scan-similar-bugs/` | 修 bug 後 M10 mechanical exhaustive scan | DS-wide 同類 bug 全清 |
| `codify-corrections/` | user 糾正後 codify 到正確 home(memory / shared instructions / spec / hook) | 跨 home 路由 |
| `ensure-canonical/` | user 說「確保 X 一定要 / 永不漂移」trigger phrase(M19)| 自動規劃 5-layer defense-in-depth(canonical+hook+skill+audit+verify),至少 3 層落地 |
| `canonical-reviewer/` | 治理檔案實質變更後 / 詢問 SSOT 位置 | 唯讀 7-Q SSOT/provider/downstream 審查；所有已認證 provider 共用同一 rubric |
| `governance-status/` | 詢問 governance 狀態 / adapter drift / provider parity | 快速、deterministic、不修檔的健康檢查 |

**Cross-provider collaboration(5)**:
| `codex-collab/` | 需要獨立 provider 交叉審查 / 合作 | 跨 provider 合作流程 |
| `deep-audit-cross-codex/` | 需要獨立 deep audit | 將審查與 author 分離 |
| `independent-review/` | product consumer 的重大改動需要第二意見 | provider-adaptive、只讀、角色隔離；無 DS-author/release 權限 |
| `codify-principle/` | 將重複原則收旂為 canonical | 判準化與下游吸收 |
| `bug-fix-rhythm/` | bug fix 完成後 | 修正、同類掃描、驗證節奏 |

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 無需 AI 判斷的單次機械操作 | `scripts/` + package script | 可執行程式比 prompt workflow 可驗證 |
| 自動機械檢查(pre/post tool) | canonical hooks | skill 需 AI 走流程,hook 是 tool-level 自動 |
| 每 session 都要的 signal rule | shared governance instructions | skill 只在 invoke 時載入,會 miss signal |
| 隨時間變化的狀態(audit progress) | `memory/` | skill 是不變的 workflow,state 屬 memory |
| 元件 runtime primitive | `packages/design-system/src/patterns/` | skill 是 AI workflow,不是 UI code |

## 新 skill 的 criteria(必須全部通過)

1. **可重複 workflow**(單步 deterministic check 或明確多階段流程)
2. **權限路由明確**：產品／UI／UX SSOT 真取捨設 user checkpoint；純工程／治理決策不得設 user approval checkpoint
3. **只在特定 invoke 情境需要**(不是每 session signal)
4. **重複使用 ≥ 3 次**(一次性任務不建 skill)
5. **invoke trigger 明確**(frontmatter description 裡清楚列出 user 說什麼會觸發)
6. **provider-neutral core**；provider 專屬執行面只能是 thin adapter

任一不過 → 改建 script / hook / spec / shared-governance rule,不硬塞。

## SKILL.md 必須包含

```markdown
---
name: skill-name-kebab-case
description: 一句話說明 skill 做什麼 + 何時 invoke(user 說哪些話觸發)
---

# Skill Title

## When to run
[明確觸發 trigger]

## Preconditions
[必要條件]

## Workflow
[單步 deterministic 檢查，或 Phase 1 / 2 / 3；只有產品／UI／UX SSOT 真取捨列 user checkpoint，工程／治理依 Standing Authorization]

## References
[指向 references/*.md 的深度細節]
```

## 建立前必 Read

本 README + shared governance instructions 的治理章節 + 最接近的既有 skill 當範本。
