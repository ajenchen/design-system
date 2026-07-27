<!-- Authority/status: governance/planning/registry.json -->
# Phase B Codex Brief — /deep-audit-cross-codex(2026-05-18)

## User 原話(verbatim,本 session)

> 「請你先仔細查詢並研究世界級的設計,看怎樣寫能符合且也符合我們一致的設計語言包括ssot」
>
> 「不是跟你講過很多次了？？？？到底為何依然屢勸不聽？任何稽核相關的流程,請你務必確保下次不會再犯錯並按規則執行流程」
>
> 「deep-audit-cross-codex應該要確保其中的 design system deep audit 跟 design-system-audit deep 是ssot,對吧？當我增刪改了任何稽核項目,這些skill相關的稽核都應該同步增刪改才對？」
>
> 「我要拍板什麼你他媽到底何時才真的能夠自動講清楚中文具體言簡意賅的人話？」
>
> 「我不是老早就跟你說過要我決策前請先基於我們所有的檔案包括設計原則包括ssot包括所有實作代碼,自主自動驗證這些問題是否真的是問題,是問題的話才需要以中文具體人話言簡意賅地講給我聽讓我判斷」

User 在本 session 反覆強調:
1. SSOT integrity(audit skill ↔ design-system-audit dim list 必須 SSOT 同步)
2. Pre-ASK self-verify(propose 給 user 前必先 grep verify problem 真存在)
3. 中文人話 propose(SSOT-UI/UX 才 ASK)/ 其他自主完整完美

## Claude Phase A 結果摘要

### 全盤閱讀完成
- CLAUDE.md / 32 M-rule / 5 path-scoped rules
- 15 references file
- 78 DS spec.md(7 tokens + 7 patterns + 65 components)
- 18 memory active files

### Baseline gate PASS
- `npx tsc -b` exit 0
- `audit-content-quality.mjs --check` ✅ No content drift
- `extract-canonical-rules.mjs` ✅ 0 audit keyword gap

### 53-dim NO-SAMPLE deep audit findings(6 parallel sub-agent 覆蓋 Group A-P)

**P0 findings(3 件,全 verified + landed)**:
1. `inline-action.spec.md:300+309` duplicate「被引用」section → merged
2. `button.spec.md:339` references `inline-action.spec.md` 但 inline-action reverse pointer missing → button added
3. `scroll-area.anatomy.stories.tsx:177,181` hardcoded hex `#2d6a9f` / `#5a7a2e` → replaced with `var(--color-blue-7)` / `var(--color-green-7)` primitive token

**P1 finding(1 件 verified + landed)**:
- `FieldControlGroup/field-control-group.anatomy.stories.tsx` 4/6 sections — Q0 verify spec `variants:{} sizes:{} traits:[]` → ColorMatrix + Inspector N/A,加 `@story-trait-rationale` 註解 codify。

**False positive(2 件,Q0 grep verify 救出)**:
- 4 components「missing displayName」(field-wrapper / data-table-column-visibility-panel / data-table-interaction-layer / time-columns)— grep 確認都是 `export function` 非 forwardRef,不需 displayName
- 10 components「asChild non-optional」— grep 確認全部 `asChild?: boolean` 已 optional

**0-finding dims 廣覆蓋**:
- Group F-G-H: 全 PASS(Layout Family / prop value / shadcn alias / home / 容器 breathing)
- Group I-J-K: 100% story migration / dual-mode contract / clean code 全 PASS
- Group L-M: 61/61 principles 全 compliant / 拆分原則 / overlay stripped variant / filter op SSOT / classification 全 PASS
- Group N-O-P 16/20: state precedence M24 / overlay scroll chain M25 / focus dominance M23 / inline-action gap / title naming / placeholder / mechanical compile / W1-W6 header / reverse drift 全 PASS

**Deferred(非 Phase A scope)**:
- Dim 36 M19 nakedCellRowModeAlign hook 加廣
- Dim 43 Rule notes 內容 AI judgement(需 deep mode)
- Dim 48 Orphan token consumer scan
- Dim 50 Bundle size budget(`/performance-audit` separate skill)

### SSOT-UI/UX propose:0 項(全 finding 屬 mechanical / pointer / drift 對齊 / autonomous batch,無動 canonical meaning)

### Autonomous landed:4 件 commit `6c0cfef3`

## 你的任務(Phase B,獨立)

1. **全盤閱讀**(per `.claude/skills/deep-audit-cross-codex/references/phase-a-workflow.md` A.0 file list):
   - CLAUDE.md / `.claude/rules/*` / `.claude/references/*`
   - `packages/design-system/src/**/*.spec.md` 全 78 file
   - `packages/design-system/src/tokens/**/*.spec.md` + `patterns/**/*.spec.md`
   - `~/.claude/.../memory/MEMORY.md` index + active project memory

2. **53-dim deep audit NO-SAMPLE**(對齊 `.claude/skills/design-system-audit/SKILL.md` Group A-P)
   - 每 dim DS-wide 全盤掃,禁 sample top N
   - 每 finding 必 cite: file:line + 引文 quote + 違反 spec/rule

3. **整理完整報告**(P0 / P1 / P2 分類):

```
### Codex Phase B audit
- P0: <list with file:line + quote>
- P1: <list with file:line + quote>
- P2: <list with file:line + quote>

### 跟 Claude Phase A 對照
- Claude 抓 + 你不同意:<list + cite>(本 turn Claude P0 3 件 + P1 1 件 + 6 deferred — 你獨立評估同意 / 反對 / 補充)
- 你抓 + Claude 漏:<list + cite>(這些是 Phase A 盲區 — 用 Q0 grep verify 後給我)
- 兩邊都漏的盲區:<list + cite>(meta-level 漏掉的 audit dim)

### 真理由 disagreement(必 cite battle)
- 每題:Claude 立場 / 你立場 / spec.md path:line 引文 / world-class ≥3 家對照
```

## 重要 invariant(M31 + Step 4.5 + Step 0.05)

- **禁** frame 答案進 Claude 思路(不可 paraphrase Claude 結論)
- **禁** sample / heavy agent skip(NO-SAMPLE STRICT)
- **禁** pass-through 共識(必獨立 own report,共識由 Claude Phase B.5 synthesize)
- **禁** 直接給 user verdict(我整合 + 比稿 + propose,你提證據)
- 每 claim 必附 inline cite:URL / GitHub source path + line / screenshot ref
- 無 cite = unverified rumor,自動降 P2「pending verification」

## 請獨立解讀 user 原話

User 原話可能跟我 paraphrase 不同。請以「你直接看 user 原話該怎麼解讀」為主,
不要被 Claude 結論 frame。若 user 想要的方向你判斷跟我不同,直接寫出來。

## Cite invariant(M22)

每 claim 必附 inline cite:URL / GitHub source path + line / screenshot ref。
無 cite = unverified rumor,自動降 P2 「pending verification」。

---

工作目錄:`/Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project`
分支:`fix-story-name-jargon-2026-05-17`(包含 Phase A commits `c26c996c → 6c0cfef3`)
