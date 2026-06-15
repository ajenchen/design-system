# Triage rubric — SSOT-UI/UX vs Non-SSOT scope classifier

## Scope classifier(critical 第 1 步)

### SSOT-UI/UX substantive(必 ASK user)

任一命中 → **STOP propose 等 user A/B**:

- 動 `packages/design-system/src/components/<X>/<X>.tsx` 的 cva variant / size / state(視覺 surface)
- 動 spec.md 的「視覺結構 / canonical / SSOT / 何時用 / 何時不用 / 邊界案例 / Layout Family」段落 substantive meaning
- 加 / 刪 / 改 token(`tokens/**/*.css` / `*.spec.md`)
- 加新 prop / 重命名 prop / 改 prop default value(API contract)
- 跨元件 design language 改動(同類 row primitive 重新訂 padding / dismiss canonical 跨元件改)
- 新 family 宣告 / 改 family 歸屬
- 新 pattern 加入 `patterns/` 或既有 pattern scope 改變

### Non-SSOT(AUTO 整批做完,M33 anti-defer)

- Bug fix(spec 既有 canonical + code 跑掉 → 對齊 spec)
- Code clean(unused import / dead export / typo / 排版)
- Refactor 不動行為(extract helper / rename internal symbol / consolidate condition)
- 命名一致對齊既有 canonical(per `# 命名與語言一致性`)
- Test / audit / verify(playwright / invariant script / hook regex 加廣)
- Audit dim / hook 加廣(對齊 spec wording 廣度,M34)
- Pointer / cross-link 補完整(reciprocal Dim 3 / SSOT pointer)
- Spec typo / markdown layout / 標點
- Memory file rotate(已 absorb → demote)
- Governance / hook / skill 內部 refactor(無 BLOCKER 邏輯改)

## 提案紀律(format / gate / 7 軸)→ 全走主檔,不在此重述

本檔曾把這幾項抄成舊的 4-Q(漏最關鍵的 Q0)+ 指向已刪檔 = 漂移實證;一律以主檔為準,改一處不會漏改別處:

- **中文人話 propose format + 禁用 jargon 對照表** → SSOT `.claude/memory/feedback_propose_discipline.md`(hook `check_propose_discipline.sh(r1,2026-06-11 merge)` 機械強制)
- **Propose 前必過 7-Q gate**(Q0 先驗「問題是否真存在」/ Q1 cite / Q1' DS canonical 優先 / Q2 SSOT consume / Q3 Rule-of-3 / Q4 下游吸收 / Q5 issue 100% mapped)→ SSOT `.claude/skills/propose-options/SKILL.md`(hook `check_propose_pre_grep_verify.sh` 機械強制 Q0);M18 為 meta anchor
- **Non-SSOT autonomous 7 軸 optimize 操作清單** → `phase-a-workflow.md` A.3;SSOT `CLAUDE.md` `# 自主執行 canonical`(檔案大小上限以該主檔為準,本檔不重述數字)

## 收斂判準 — 何時停止 rerun(Phase C.0,2026-06-01 codify)

**Why**:deep-audit 是 LLM 對抗式稽核 = **non-deterministic + 生成式永遠找得到東西 + 高假陽性**。同一份沒改的 code,每次 rerun 都會吐「新問題」——多數是措辭 nit 或誤判。盲目 **auto-rerun-to-zero = 追不到的跑步機**,且假陽性會誘發你「修」出 regression。但**過早宣稱遞減**也錯(漏掉真 material)。

**停止判準**(每跑完一輪 audit,先過此 gate 再決定要不要再跑):

> 迭代到某輪「**adversarial 二次驗證後,真 material 或 regression = 0**」(只剩 marginal nit + false-positive)→ **STOP**。既不追零、也不過早收手。

**每 finding 必三分類 + adversarial 二次驗證**(filter audit 高估):

| 類別 | 定義 | 處置 |
|---|---|---|
| **material** | 影響使用者 / contract / a11y / 真 regression(spec 改了但 tsx meta / story 漏跟)| 修(non-SSOT → autonomous;SSOT-UI/UX → propose)|
| **marginal** | 措辭 nit / 缺一欄非必要 doc / 風格偏好 | 記錄,**不修**(低於 materiality threshold)|
| **false-positive** | 讀 .tsx + wrap lib source 後證實宣稱錯(audit 誤判)| 駁回 + 標 evidence |

每個 raw finding 跑 **adversarial 二次驗證**(讀 source 逐句比對,不信第一輪結論)再歸類——audit 第一輪系統性高估(本 session Avatar 硬互斥 / FileViewer listbox / DropdownMenu child-only / Input naked 全 over-flag,二驗後降級)。

**「改一處看 N 處」doc-alignment 紀律**:一個 component 有多面向（spec frontmatter / tsx meta / props 表 / Inspector argTypes / ColorMatrix / ModeMatrix / Accessibility prose / principles / showcase / jsDoc）——改一處要**全掃同步**,否則 reruns 一直抓這缺口(本 session 2-4 輪全在清這個）。

**實證**(本 session,沒改 code 反覆 rerun):material **7→3→2→2→0**(5 輪)—— 第 1 輪抓我引入的 regression、2-4 輪清 doc 傳播缺口、第 5 輪歸零 STOP。

**收斂真正靠**:決定性 CI gate(`tsc` / invariant script / hook BLOCKER）+ **寫入時紀律**,**不是** audit loop。deep-audit 是**週期性工具**(release / SSOT 大改 / 季度),不該對「沒變的內容」反覆跑。對齊 Linux kernel `checkpatch.pl` deterministic pre-submit / Toyota TPS Jidoka(機器發現異常自停,非人工反覆巡）。

## 共識決策(Phase B.5)同 format

Phase B 共識(Claude + Codex 雙 verify PASS)走相同 propose / autonomous 分流:

- SSOT-UI/UX 共識 → 中文人話 propose user 拍板
- Non-SSOT 共識 → autonomous batch(7 軸 optimize)

**禁** Phase B 共識降回 Phase A 已 ASK 的同 decision 重 ASK(浪費 user 時間)。已 ASK 的 → 等 user 拍板;新發現(Phase B 抓的 Phase A 漏)→ 新 propose。
