---
name: deep-audit-cross-codex
description: Phase A Claude solo 完整深度進階稽核 → Phase B codex 同流程稽核 + 比稿辯論共識 → Phase C 落地。SSOT-UI/UX 中文人話 propose / 其他 autonomous。對齊 M14/M18/M19/M20/M22/M23/M26/M29/M31/M32 + audit dim list 全集(SSOT = design-system-audit/SKILL.md)+ codex-collab 5-step。
arguments: scope?=full|changed focus?=「ssot|visual|behavior|all」
---

# Deep Audit Cross-Codex — 雙 model adversarial 完整 DS 稽核

> **SSOT integrity invariant**(2026-05-18 user-mandated):本 skill 的 audit dim list **完全 chain `/design-system-audit --deep` SSOT**(`.claude/skills/design-system-audit/SKILL.md` `## The N audit dimensions` 段)。
>
> **禁** hardcode dim count(`46 dim` / `53 dim` 等具體數字)— 用「全 dim」/「Group A-P」/「per design-system-audit SSOT」表達。新增 / 刪除 / 修改稽核項目 → **只動 design-system-audit/SKILL.md**,本 skill 自動繼承。
>
> Mechanical 強制:hook `check_dim_count_drift.sh` 攔 Edit 寫死數字。

**生態位**:`/design-system-audit --deep` 是 Claude solo 全 dim 稽核 SSOT;本 skill 是**雙 model 完整 sweep**(Claude solo → codex parallel → 比稿辯論共識 → 落地),chain 既有 audit dim 不 fork。對齊 mindset #1「不取巧省工」+ M31 dual-track + 用戶 2026-05-18 directive(verbatim):

> 「完整深度進階稽核整個 design system」+「codex 跑相同的完整深度進階稽核」+「跟 codex 討論辯論出共識」+「SSOT-UI/UX 增刪改需要用中文具體人話言簡意賅地講給我聽讓我判斷決策,其他的決策基本上就是不以省工為前提...自主自動自發地做到完整、完美」

## When to invoke

- User 明確 trigger:「跑深度稽核 + codex 比稿」「完整盤查 with codex」「dual-pass audit」「/deep-audit-cross-codex」
- 重大 release / SSOT 大改 / 季度健檢
- 多輪修正後想雙 model verify

**不該 invoke**:single 元件小修(用 `/design-system-audit --scope=component`)/ 已知 surgical bug fix(用 `/bug-fix-rhythm`)/ 日常 dev(`visual-audit --scope=changed`)。

## Non-goals

- 不取代 `/design-system-audit --deep`(本 skill **chain** 它 Phase A.1)
- 不取代 `/codex-collab`(本 skill **chain** 它 Phase B)
- 不動 audit 觸發以外的 PR / branch ops(M28 由 user 拍板)

---

## Phase A — Claude solo full audit(必先 NO-SAMPLE 跑完才進 Phase B)

### A.0 — 全盤閱讀 preflight(M29 升級,**禁止憑記憶**)

**強制 read sweep**(不可 sample,不可挑):
1. `CLAUDE.md` 全文
2. `.claude/rules/{meta-patterns,spec-rules,ui-development,story-rules,self-verify}.md` 全文
3. `.claude/references/{ssot-index,ssot-consultation,build-ui-canonicals,naming-conventions}.md`
4. `packages/design-system/src/**/*.spec.md` 全部(60+ file,通過 Glob 列舉 + Read)
5. `packages/design-system/src/tokens/**/*.spec.md` + `packages/design-system/src/patterns/**/*.spec.md` 全部
6. 本 session 對話脈絡 + memory `~/.claude/.../memory/MEMORY.md` index + active project memory files

**完成 gate**:Phase A.0 output = `phaseA-preflight-checklist.md`(session-local,列出讀過的 N file + 任何 spec 漂移嫌疑點)。**禁** skip / sample / 「先看標題判斷」。

### A.1 — 跑全 dim NO-SAMPLE deep audit(chain `/design-system-audit --deep` SSOT)

**Dispatch plan auto-pickup**(2026-05-23 ship per user verbatim「infra 增刪改 audit 自動跟最新」):
必先跑 `node scripts/dispatch-audit-dims.mjs --summary` 取**動態 dim 列**(non-hardcoded),從 `.claude/logs/audit-dims-dispatch.json` 讀 sub-agent batch 分組。Heavy dims 自動標,新加 dim 自動 included,retire 自動排除。

**禁** hardcode dim range numbers(eg.「Dims 1-15」/「Dims 34-56」)在 sub-agent prompt — 用 dispatch-audit-dims.mjs output 的 `dispatchPlan.suggestedBatches[].dimNumbers` 動態填。

完整跑,**no sample / no escape**(對齊 `feedback_audit_full_sweep_not_sample.md` + `check_audit_sample_escape.sh` BLOCKER)。
每 dim sub-agent prompt 必含「DS-wide 全盤,禁 sample top N」。

### A.2 — Triage findings → 中文人話 propose SSOT-UI/UX / autonomous non-SSOT

**Scope classifier**(critical,先過):
- **SSOT-UI/UX substantive 增刪改** = 動 component / token / spec.md 視覺結構 / 跨元件 design language / 新 API contract → **STOP propose**
- **Non-SSOT**(bug fix / clean / refactor / 命名一致 / test / audit / verify / hook regex 加廣 / pointer 補 / spec typo / 漂移 mechanical 對齊)→ **AUTO 整批做完**

**SSOT-UI/UX propose 必過 4-Q gate**(M18 + M19 ensure-canonical chain):
- Q1 M22 cite — 3-column owner table(spec path:line / canonical sentence / conflicting code)
- Q2 M17 SSOT consume — 既有 token / primitive / pattern 列消費清單
- Q3 Rule-of-3 — 同概念 ≥ 3 處 → 選 SSOT 其他 pointer
- Q4 M10 下游吸收 — 修上游 ≥ 3 處下游 redundant 可清

**中文人話 propose format**(per `feedback_propose_in_plain_chinese.md` + hook `check_propose_plain_chinese.sh`,必過):

```
### 決策 N:<一句話標題,zero jargon>

**現況**:<目前 code/spec 行為,人話>
**影響**:<不改會怎樣 / 改了會怎樣,具體>
**選項**:
- A. <做法 1>(後果:...)
- B. <做法 2>(後果:...)
- C. <不動>(後果:...)
**我推**:<A / B / C> 因 <理由>
```

禁:術語(L1-L7 / canonical / primitive / SSOT 在 propose 內裸用,該翻成「主檔/共用零件/設計原則」等人話)。

### A.3 — Autonomous batch execute(non-SSOT,M33 anti-defer)

7 目標 simultaneous optimize(per CLAUDE.md `# 自主執行 canonical`):
1. 言簡意賅 / 2. 效率+效能 / 3. SSOT 鐵律(M17/M23/M29/M30)/ 4. 易懂+維護+擴充 / 5. 世界級+一致設計語言 / 6. 完整 self-verify(M20/M31/M32)/ 7. 自動 self-improve(M14/M20)

**禁defer keyword**:「下次再做 / 下個 session / 省工 / 等等」(M33 BLOCKER)。

### A.4 — Verify-to-perfection(per self-verify.md 4 階段)

- Post-edit:`npx tsc -b` / 相關 invariant 腳本 / `audit-content-quality.mjs --check` / `extract-canonical-rules.mjs`
- Visual:`/visual-audit --scope=changed`(UI 改動)+ playwright pixel-quantified(M32)
- M14 5-layer pipeline:spec / hook / SKILL / CLAUDE.md / memory 同步

**Phase A complete gate**:全部 verify PASS + commit on working branch + 報 user「Phase A 完成,N 項 SSOT-UI/UX 等你拍板」。**禁** skip Phase A 直接 Phase B。

---

## Phase B — Codex parallel audit + 比稿辯論共識

### B.0 — Codex transport discovery(per codex-collab/SKILL.md Step 0.4)

3-test 順序固定(local 優先):`node_modules/.bin/codex` → `which codex` → `~/.codex/auth.json`。失敗 → 報 user,**禁 Explore agent 替身**(M31)。

### B.1 — Brief codex 跑相同 Phase A 完整流程

Brief format(per codex-collab/SKILL.md Step 0.05 user-verbatim faithful relay + Step 0.5 own-version invariant):

```
## User 原話(verbatim,prompt 中段引用)
「<user 原文 quote,中英符號圖文全保>」

## Claude Phase A 結果摘要
- 全 dim audit:<N P0 / M P1 / K P2 findings>
- SSOT-UI/UX propose:N 項(已 ASK user)
- Autonomous landed:M 項(列具體 file:line)
- 不 verify 但 Phase A 結論:<列出>

## 請你執行 Phase A 相同流程(獨立)
1. 全盤閱讀(CLAUDE.md / rules / spec.md ×60 / tokens / patterns / memory)
2. 全 dim deep audit NO-SAMPLE
3. 整理完整報告(P0 / P1 / P2 分類 + file:line + 引文 cite)
4. 跟 Claude Phase A 結果**獨立**比對,不 frame 答案

請回:Phase A 你抓但 Claude 漏的 / Claude 抓但你不同意的 / 兩邊都漏的盲區。
```

Send via `codex exec`(local CLI per M31 Step 0.4)或 cloud `@codex` 後序。

### B.2 — Receive codex report + Step 4 self-check + Step 4.5 verify

**禁 pass-through**(per M31 + `feedback_codex_dual_track_synthesizer.md`):
- Step 4:M22/M23/M27/M8 4 題自檢
- **Step 4.5 verify each claim**:grep / WebFetch / run invariant script / counter-example scan
- 每 codex claim 標 `✅ verified` / `❌ FALSE` / `⚠️ partial`

### B.3 — Step 5 比稿(matrix per claim)

不可只「pick A/B/C」(round-7 trap)。對每 finding 4 axis:
- **接受 codex**:codex 抓 + verified + Claude 漏
- **接受 Claude**:Claude 抓 + codex 漏 / codex verified FALSE
- **修正 = synthesize**:兩邊各補對方缺漏 → final 比兩 v1 都強
- **重啟**:兩邊都不對 → 重做

### B.4 — Disagreement → cite battle(M31 Step 4 / 5)

任何 disagreement **禁** vote / 直覺;走 cite battle:
- 各自提 spec.md path:line + 引文
- WebFetch ≥ 3 家 world-class DS 對照
- evidence stronger 勝;evidence 對等 → STOP 給 user 拍板

### B.5 — 共識 triage → 中文人話 propose / autonomous

跟 Phase A.2 同 format,但 finding source = 共識(Claude + codex 兩邊都認 + verify PASS)。

---

## Phase C — Final report + commit + push trigger gate

### C.1 — Final report(送 user)

```
## Deep Audit Cross-Codex 完整報告(N 日期)

### Phase A 結果
- 全 dim findings: <P0 N / P1 M / P2 K>
- Autonomous landed: <N 項> commit <hash>
- SSOT-UI/UX 已拍板: <M 項>
- SSOT-UI/UX 待拍板: <列出 + 簡述>

### Phase B 結果
- Codex 抓 + Claude 漏: <N 項>
- Claude 抓 + Codex 漏: <M 項>
- Cite battle: <K 題,各題 verdict + evidence>
- 共識 SSOT-UI/UX 待拍板: <列出 + 簡述>
- 共識 autonomous landed: <N 項> commit <hash>

### 待你拍板(中文人話)
<決策 1-N(per A.2 format)>

### Verify artifact
- tsc PASS / invariant PASS / content-quality PASS / visual probe PASS
- file:line + before / after diff link
```

### C.2 — Push trigger gate(M28 solo-work canonical)

**禁** AI 自決 merge main / push origin main。等 user 「Push 到 main」trigger。

---

## Mechanical enforcement

- Pre-edit:`check_substantive_edit_approval_preflight.sh` + `check_ds_anchor_preflight.sh`(SSOT-UI/UX 必先 approval)
- Mid:`check_audit_sample_escape.sh`(Agent dispatch 攔 sample escape)+ `check_codex_collab_5step.sh`(Layer A/B/C cite verdict)
- Post:`stop_self_audit.sh` Mechanism 1 claim-verify-gap BLOCKER + `audit-content-quality.mjs --check`
- Commit gate:`check_solo_workflow.sh`(no PR / 1 chat 1 branch / 等 user push trigger)

## Checkpoints(禁止跳)

| Checkpoint | 在哪 | What |
|---|---|---|
| **CP-A0** | A.0 結束 | 全盤閱讀清單給 user 看(列 N file read),禁未讀就進 A.1 |
| **CP-A2** | A.2 SSOT-UI/UX propose | 中文人話 + 4-Q gate;**STOP** 等 user A/B 才動 code |
| **CP-B0** | B.0 codex transport | 3-test 失敗 → 報 user 決(local install / cloud / 跳 Phase B 只 Phase A);禁 Explore 替身 |
| **CP-B4** | B.4 cite battle | evidence 對等 → STOP 等 user 拍板,**禁** AI 自決誰勝 |
| **CP-C2** | C.2 push gate | 等 user「Push 到 main」trigger;禁 AI 自決 merge |

## References

- `references/phase-a-workflow.md` — A.0 全盤閱讀 file list canonical + A.1 全 dim sub-agent dispatch template
- `references/phase-b-codex-brief.md` — codex brief template(B.1)+ Step 4.5 verify checklist + Step 5 比稿 matrix template
- `references/triage-rubric.md` — Scope classifier(SSOT-UI/UX vs non-SSOT)+ 中文人話 propose format + 7 autonomous 目標 expansion

## 與其他 skill 分工

| Skill | Scope | 不重疊 |
|---|---|---|
| `/design-system-audit --deep` | 全 dim Claude solo audit | 本 skill chain 為 Phase A.1,額外 Phase B + 全盤閱讀 preflight + 比稿辯論 |
| `/codex-collab` | M31 5-step dual-track for **任意題目** | 本 skill chain 為 Phase B,額外 Phase A 前置 + 全 dim 完整覆蓋(per design-system-audit SSOT) + Phase C 共識 commit |
| `/propose-options` | M18 4-Q gate single propose | 本 skill A.2 / B.5 chain 用它格式化 propose |
| `/ensure-canonical` | M19 5-layer auto-pipeline | 本 skill A.3 / B.5 chain 用它落地 canonical |
| `/knowledge-prune` | 治理文件冗贅清 | 正交,本 skill 跑稽核;`/knowledge-prune` 跑治理 hygiene |
| `/bug-fix-rhythm` | surgical visual bug 修 | 正交,本 skill 是 broad sweep;surgical bug 不該觸發本 skill |

## Anti-pattern(永久 ban)

- ❌ Skip A.0 全盤閱讀(憑記憶判斷哪些 spec 該讀)
- ❌ A.1 sub-agent prompt 含「sample top N」/「heavy agent skip」escape
- ❌ A.2 propose 用 jargon(L1-L7 / SSOT / canonical 在 propose 內裸用)
- ❌ 跳 Phase B 只跑 Phase A(除非 codex transport 全失敗 + user 同意)
- ❌ B.2 收 codex reply 直接 paste 給 user(pass-through,M31 Step 4.5 verify 跳)
- ❌ B.4 disagreement 用直覺 vote / 「兩邊都對」打太極(cite battle invariant)
- ❌ C.2 AI 自決 merge main(M28 violation)
- ❌ Phase A 完成沒等 user 拍板 SSOT-UI/UX 就進 Phase B(scope 跑掉)

## 世界級對照

- **RFC 學術同儕審查**:作者 v1 + reviewer v2(獨立)+ public cite battle 收斂共識
- **Linux kernel patch review**:Maintainer first-pass + lkml mailing list 二 review + cite source 比稿
- **Google ML eng-design-review**:proposer + adversarial reviewer + structured disagreement protocol
- **Anthropic constitutional AI critic + revise**:同 model 不同 prompt 互審 → 本 skill 升級成跨 model
