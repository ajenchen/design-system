# Phase A — Claude solo full audit workflow

## Phase 0 — Cwd context detection 完整版(2-mode branching,2026-05-29 加;SKILL Phase 0 摘要的 detail SSOT)

Skill 必能跑在 **DS repo + fork user repo** 兩處(per user 2026-05-29「fork user 在自己獨立環境下 infra 仍正確運行」directive)。Phase 0 自動偵測 cwd 切 scope:

```bash
detect_mode() {
  if [ -d "packages/design-system/src" ]; then echo "ds-repo"
  elif grep -q '"@qijenchen/design-system"' package.json 2>/dev/null; then echo "fork-user-repo"
  else echo "non-ds"; exit 0; fi
}
```

**為何 2-mode 不是 3-mode**(per user「避免原則無限膨脹」):「template SSOT」實際上是 ds-repo 內 `template/ds-product-template/` 子目錄;DS owner 編 template scaffold 仍在 ds-repo cwd 跑,**無 semantic 區隔**。Published `ds-product-template` GitHub repo 跟 fork user new repo 在 file structure 上一致(都消費 DS via npm + plugin),統一 fork-user-repo mode 處理。3-mode 設計 dead code:`ds-template-ssot` 永不 trigger 因 `packages/design-system/src` 條件先 win。

| Mode | A.0 全盤閱讀 scope | A.1 audit dim scope | Phase B codex scope |
|---|---|---|---|
| **ds-repo**(DS owner workflow,含 template SSOT 編輯)| full DS canonical + spec + token + pattern + memory + `template/ds-product-template/` scaffold | 全 dim per `/design-system-audit --deep` SSOT(含 dim 83 cross-3-repo runtime audit)**＋ chain `/product-ui-audit` 對 `apps/template`**(DS owner dogfood 自家消費端 surface,用 fork user 同等產品標準把關)| 全 dim parallel verify |
| **fork-user-repo**(published template repo / fork user product repo)| `node_modules/@qijenchen/design-system/CLAUDE.md` + `ds-canonical/rules/meta-patterns.md` + `apps/**` + 本 repo `CLAUDE.md` | dim 83 fork-side runtime checks(**C-prime committed 治理鏈 fire〔fork-governance-dispatcher.sh Pre/Post/UserPromptSubmit 讀 ds-canonical/fork/manifest.json + inject_fork_governance_preamble.sh SessionStart;免 plugin,2026-06-17 改版〕** / cross-load / setup-netlify smoke / **deploy URL hook 每次 push 吐 URL live** / **環境建置斷點清單通暢 + 無法自動的斷點有 plain-中文引導**)+ **完整 consumer/fork enforcement dim 集(2026-05-30 補,原僅 62-67 漏掉 bootstrap 等)**:58(plugin install + bootstrap chicken-egg gate)/ 59(approval-preflight `apps/**`)/ 62(Netlify onboarding + 斷點清單 + ≥6 條中文引導話術)/ 63(deploy URL auto-reply 每次必吐)/ 64(post-main-push SSOT propagation)/ 69-71(consumer no-catalog / @story-baseline / DS primitive misuse)/ 73-74(full-story sweep / overlay probe)/ 75(plugin freshness)/ 76(escape marker abuse)/ 82(consumer app story title)| 同 dim,fork-side verify;**禁** propose DS source change |

### Fork-mode safety invariants(2026-05-29 加)

當 cwd = `fork-user-repo`:
- A.2 propose scope 限 fork user's product code(`apps/**`,可選 `packages/<consumer-utils>/**`)
- **禁** propose DS source 改動(`node_modules/@qijenchen/design-system/**` read-only;要改 file PR 回 DS repo)
- A.3 autonomous batch fix scope 同上
- Commit / push 仍走 M28 working branch + user push trigger
- Hooks fire 信任 committed C-prime 治理鏈(settings.json → fork-governance-dispatcher.sh 讀 ds-canonical/fork/manifest.json;免 plugin,2026-06-17 改版)— skill 不重複實作 hook logic

## A.0 全盤閱讀 file list canonical(禁 sample)

### 治理 home(always-load + path-scoped)
- `CLAUDE.md` 全文
- `.claude/rules/meta-patterns.md`(31 active M-rules,M1-M32 with M27/M33/M34/M35 retired)
- `.claude/rules/spec-rules.md`
- `.claude/rules/ui-development.md`
- `.claude/rules/story-rules.md`
- `.claude/rules/self-verify.md`
- `.claude/rules/README.md`

### Reference SSOT(快速索引)
- `.claude/references/ssot-index.md`
- `.claude/references/ssot-consultation.md`
- `.claude/references/build-ui-canonicals.md`
- `.claude/references/naming-conventions.md`
- `.claude/references/ui-dev-rules.md`(若存在)
- `.claude/references/props-naming.md`
- `.claude/references/tailwind-gotchas.md`

### DS spec.md(全部)
```bash
# 列舉所有 spec.md
find packages/design-system/src -name "*.spec.md" -type f
# 預期 ~83 file:components/* + patterns/* + tokens/*
```

每個必 Read 全文(spec ≤ 300 lines budget,foundational SSOT ≤ 800-1200)。

### 記憶
- `~/.claude/.../memory/MEMORY.md`(index)
- 對 MEMORY.md 列的每個 active project memory file Read 全文(`project_*.md`)
- 對 feedback memory(`feedback_*.md`)只讀 description 比對 user 提的 topic 是否觸及 → 觸及才 Read 全文
- `.claude/skills/*/SKILL.md` 全部 ×22(2026-07-10 加,對齊 SKILL A.0 第 7 項)

### Output gate

A.0 結束時 output `.claude/planning/<date>-phaseA-preflight.md`(session-local,不 commit):

```markdown
# Phase A.0 全盤閱讀清單

## 讀完
- CLAUDE.md(<N> lines)
- meta-patterns.md(31 active M-rules verify list)
- spec.md ×<N>(file list)
- tokens spec.md ×<N>
- patterns spec.md ×<N>
- memory active files: <list>

## 預警點(讀過程發現的疑似漂移 / TODO)
- <spec X 提到 Y 但 src/ 沒實作>
- <token Z 0 consumer>
- ...
```

## A.1 全 dim deep audit chain(per design-system-audit SSOT)

直接 invoke `/design-system-audit --deep`。每 dim sub-agent dispatch prompt 必含:

```
你是 dim <N> sub-agent。NO-SAMPLE STRICT NO-ESCAPE — 必 DS-wide 全盤掃,
禁 sample top N / 禁 heavy agent skip。觸發 `check_audit_sample_escape.sh`
BLOCKER 字串(「sample」「top N」「heavy agent skip」「為節省」「先抽樣」
「pick representative」)= 立刻撤回 dispatch。

每 finding 必 cite: <file:line> + <引文 quote> + <為何違反 spec / rule>

不確定 → STOP propose,別假答案。
```

## A.2 Triage rubric

詳 `triage-rubric.md`(scope classifier + propose format)。

## A.3 Autonomous batch 7 軸 optimize 清單

對齊 CLAUDE.md `# 自主執行 canonical`:

1. **言簡意賅** — comment / spec / prop name 短而精
2. **效率 + 效能** — 避 unnecessary re-render / memoization gap / O(N²) algorithm(可 chain `/performance-audit`)
3. **SSOT 鐵律** — M17 token / primitive / pattern consume;M23 既有 canonical 優先;M29 anchor preflight;M30 wrapper extends primitive
4. **易懂 + 維護 + 擴充** — file ≤ budget;function ≤ 80;naming 一致(`# 命名與語言一致性`)
5. **世界級 + 一致設計語言** — mindset #1 + M8 ≥3 家 cite + M22 inline cite + M26 propose 前 WebFetch
6. **完整 self-verify** — M20 score / M31 dual-track 5-step / M32 pixel-quantified audit
7. **自動 self-improve** — M14 5-layer pipeline / M20 best-practice scoring

## A.4 Verify gate(per self-verify.md 4 階段)

| Layer | Cmd | PASS criteria |
|---|---|---|
| TypeScript | `npx tsc -b` | 0 errors |
| Content | `node scripts/audit-content-quality.mjs --check` | ✅ No content drift |
| Canonical | `node scripts/extract-canonical-rules.mjs` | ✅ All extracted rule keywords covered |
| Component invariants | `node scripts/data-table-invariants.mjs`(若觸動 DataTable)| PASS |
| Visual | `/visual-audit --scope=changed` | playwright snapshot diff Δ < 0.1% |
| Pixel-quantified | M32 audit(若動 alignment / spacing)| `rect.top / left / height` numeric verify |

任一 FAIL → STOP,不可進 Phase B。

## A complete output

```markdown
# Phase A 完成

## Findings(全 dim per design-system-audit SSOT)
- P0: <N> 項
- P1: <M> 項
- P2: <K> 項

## SSOT-UI/UX(待 user 拍板,中文人話 propose)
<決策 1-N per triage-rubric.md format>

## Autonomous landed(commit <hash>)
- <N> 項 spec / hook / story / code 修正
- file:line diff link

## 不 verify 但 Phase A 結論
- <列出僅 grep 看到但未跑 visual 的 case>

→ 等 user 拍板 SSOT-UI/UX 後 → 進 Phase B
```
