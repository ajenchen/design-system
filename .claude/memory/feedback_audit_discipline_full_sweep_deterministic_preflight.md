---
name: Audit discipline — full-sweep + deterministic script + preflight (3-in-1 consolidated 2026-05-27)
description: 稽核三 invariant — NO-SAMPLE 全盤 / 必 chain deterministic script not sub-agent / Preflight scan all files + principles + coverage matrix。違 = hook BLOCKER
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---

# Audit Discipline — 3 sub-rules consolidated

User 2026-05-15 + 2026-05-23 系列 directives codified per Rule-of-3 absorb principle. 原 3 file (`feedback_audit_full_sweep_not_sample.md` / `feedback_audit_deterministic_script_not_subagent.md` / `feedback_audit_preflight_全盤查.md`) 合併本檔。

## Sub-rule 1 — NO-SAMPLE 全盤掃(原 full_sweep_not_sample)

**Rule**:`/design-system-audit --deep` sub-agent 必掃 DS-wide 全元件(non-Internal + Internal ~60+),禁 sample subset。

❌ 絕禁 sub-agent prompt 寫「sample top N」「Sampled top X」「subset」「pick top」「too many to scan all」
✅ 必:DS-wide grep + per-component dim verify ALL;context budget 不夠 → 拆 N stages(每 10-15 元件),不 sample

**User 原話 SSOT 2026-05-15**:「稽核**並非既往不咎**,稽核要**全盤稽核,不能只抽樣,要全盤**」

**Anchor**:2026-05-15 Dim 12+24+25 sub-agent「Sample top 5-10」→ 只覆蓋 22/190 stories ≈ 12%,168 stories 漏掃,user 抓「還是有很多 story 和範例都沒有被整理過」。

## Sub-rule 2 — Deterministic script not sub-agent judgment(原 deterministic_script)

**Rule**:Dim 40/41/42(title canonical / name jargon / placeholder)**禁** sub-agent AI judgment 替代 deterministic script。**必 chain** `node scripts/audit-story-quality.mjs --check` 全 196 stories / 350 names 全掃。

Sub-agent dispatch prompt 必含:
> 「先跑 `node scripts/audit-story-quality.mjs --check`,stderr 完整貼進 report;0 violations = CLEAN,有 violations 列具體 file:line。禁 sub-agent 自寫 grep / 自評 sample」

**User 原話 2026-05-23**:「我他媽你確定 deep audit cross codex 跑完了?我不信現在所有的範例都有講具體言簡意賅的中文 ... 如果又被發現你他媽又再偷懶又再抽樣他媽該怎麼幹死你避免你下次再犯?」

**Anchor**:2026-05-23 Batch 3 sub-agent「sample-based AI judgment, sampled Button only」→ inline 跑 deterministic script 0 violations,但 reactive 非 mechanical prevention。

## Sub-rule 3 — Preflight 全面盤查(原 audit_preflight)

**Rule**:`/design-system-audit --deep` Phase 1 前必跑 Phase 0.5 Preflight,輸出 3 件:
1. **檔案 enumeration**:全 DS files list(`src/design-system/**/*.{tsx,ts,css,md}` 含 stories + anatomy + principles + spec)+ count
2. **設計原則 enumeration**:全 M-rule + spec.md `traits:` + `.claude/rules/*.md` + hook invariant + SKILL discipline
3. **Coverage matrix**:每原則 → audit dim 對應 / 「NO COVER (gap)」標記

存 `.claude/logs/audit-preflight-{date}.json` 供 Phase 1 引用。`scripts/audit-preflight.mjs` SSOT。

**User 原話 2026-05-15**:「你完整稽核之前應該會先全面盤查全部檔案和所有設計原則對吧?我記得之前我有命令你要在 infra 定義這件事」+「上面的都完成之後,就去確保所有 infra 要求的任何設計準則在設計系統進階稽核都會全面涵蓋,並要確保現在和未來都會自動涵蓋」

## How to apply(統一)

Sub-agent dispatch prompt 必含 3 directives(verbatim,不可弱化):
```
**Coverage requirement (NO-SAMPLE)**:DS-wide ALL components,context 不夠 → 拆 stage,禁「sample top N」
**Deterministic script chain (Dim 40/41/42 等可機械化 dims)**:先跑 audit-story-quality.mjs --check,stderr 完整貼進 report
**Preflight prerequisite**:Phase 0.5 audit-preflight.json 必存在,否則 BLOCKER
```

## Mechanical enforcement

- `stop_self_audit.sh` 偵測 sub-agent prompt 含「sample / subset / top N / pick top / too many」+ `--deep` mode → BLOCKER
- `check_audit_sample_escape.sh` pre + post Agent dispatch 雙向攔 sample escape keyword(2026-05-23)
- `scripts/audit-preflight.mjs` 必先跑;`stop_self_audit.sh` 偵測 audit 但 24h 內無 preflight log → BLOCKER
- `scripts/audit-story-quality.mjs --check` deterministic 全掃 + ci.yml `npm run story-quality:check` step
- design-system-audit SKILL Phase 0.5 mandatory directive
- `references/audit-prompts.md` template 必含 NO-SAMPLE / deterministic script / preflight directives

## Anti-pattern(永久 ban)

- ❌ Sub-agent prompt sample top N / subset / pick top / too many
- ❌ Dim 40/41/42 sub-agent self-grep / self-judgment 替代 audit-story-quality.mjs
- ❌ Audit 跳 Phase 0.5 直接 Phase 1
- ❌「Coverage 12% sampled looks clean」= audit incomplete
- ❌ Claim「D40 CLEAN」無 cite script output

## Sub-rule 4 — Deep-audit rerun 收斂原則:何時停(2026-06-01,user 問「沒改內容卻每次 rerun 都有新問題,要 rerun 到完全沒問題嗎?」)

**Why**:deep-audit 是 LLM 對抗式稽核 = non-deterministic + 生成式永遠找得到東西 + 高假陽性(本 session Avatar 硬互斥 / FileViewer listbox / DropdownMenu child-only / PeoplePicker className / Input naked 全 over-flag,adversarial 二次驗證後降級)。盲目 auto-rerun-to-zero = 追不到的跑步機 + 假陽性誘發 regression。

**How to apply**:停止判準 = **迭代到某輪「adversarial 二次驗證後真 material/regression = 0」(只剩 marginal + false-positive)才 STOP** —— 既不追零、也不過早宣稱遞減。本 session 實證 material **7→3→2→2→0**(5 輪):第 1 輪抓 regression、2-4 輪清「改一處漏 N 處」的 doc 傳播缺口、第 5 輪歸零 STOP。
- 每 finding 必 **materiality 三分類**(material=影響使用者/contract/a11y;marginal=措辭 nit;false-positive)+ adversarial 二次驗證 filter audit 高估,再決定修不修。
- **doc-alignment「改一處看 N 處」**:component 有多面向(spec frontmatter / tsx meta / props 表 / Inspector argTypes / ColorMatrix / ModeMatrix / Accessibility prose / principles / showcase / jsDoc),改一處要全掃 — reruns 一直抓我這缺口。
- 收斂靠決定性 CI gate + 寫入時紀律,非稽核 loop;deep-audit = 週期性工具(release/季度)非對沒變內容反覆跑。
- **已 codify(2026-06-01)**:`deep-audit-cross-codex/SKILL.md` Phase C.0 rerun-stop-gate anchor + `references/triage-rubric.md`「收斂判準」完整三分類表 + 「改一處看 N 處」。放 skill 而非新 M-rule(velocity cap + skill-specific,不增 every-session context)。

## Sub-rule 5 — Audit-FIX triage 別過度保守:非-SSOT-UI/UX 一律 AUTO 修到完美(2026-06-28,user 連兩次糾正「為何沒做」)

**Why**:deep-audit A.3 / A2 fix 階段把「改超過一行 / 加 optional prop」誤當成「substantive → 需 user 決策」而 skip,留一堆本該自動修的待辦。user 連兩次糾正:「你應該把全部做到完整完美吧?」+「與 ssot 的 ui/ux 無關的錯誤修正不是應該自動修正到完美嗎?到底為何還留那麼多待辦?」

**正確判準(不是「改幾行」)**:
- **AUTO 修到完美**(autonomy canonical 本就規定):a11y 改善(含加 **optional 非破壞性 prop**,如 Avatar `badgeAriaLabel` / Tag `dismissLabel`)、metadata 準確性(meta 值對齊真實渲染,如 RadioGroup iconSize→真 dot)、code-quality(stale 註解)、**drift-to-canonical**(裸 utility → DS token,如 Command `border-b`→`border-divider`;零視覺對齊,如 Sheet 去多餘 `text-foreground`)。
- **才需 user 決策**:真正改**視覺結構 / 跨元件 design language / 破壞性 API**。

**Anchor**:2026-06-28 beta.77 followups —— Phase A 早抓到這 9 項(都在 findings),但 A2 fix-workflow scope-guard 過度 skip 成「needs manual substantive」。實際 6 個是 a11y/meta/drift = 該 AUTO;只 SelectMenu(重接破 cmdk = 真風險)+ 已正確項不動。教訓:**fix-workflow scope-guard 的「substantive」門檻 = 改視覺結構/design-language/破壞 API,不是「改 >1 行 / 加 prop」**。

**驗證鐵律(user「不要改A壞B」)**:加 optional prop = 跑 `build:lib`(型別 surface);動 aria = a11y audit **per-story 比對 committed baseline**(總數可能 axe flake ±2,要看「我改的元件有沒有新增 violation」而非總數)。

## 對齊原則

- CLAUDE.md `# 稽核 canonical` audit-vs-execute 分權
- M20 self-improvement(audit incomplete → score regress → next session inject directive)
- mindset #1 不取巧
- Linux kernel `scripts/checkpatch.pl` deterministic pre-submit / Google CL presubmit / Toyota TPS Jidoka
