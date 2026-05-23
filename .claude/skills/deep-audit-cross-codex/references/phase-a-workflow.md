# Phase A — Claude solo full audit workflow

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
find src/design-system -name "*.spec.md" -type f
# 預期 ~60 file:components/* + patterns/* + tokens/*
```

每個必 Read 全文(spec ≤ 300 lines budget,foundational SSOT ≤ 800-1200)。

### 記憶
- `~/.claude/.../memory/MEMORY.md`(index)
- 對 MEMORY.md 列的每個 active project memory file Read 全文(`project_*.md`)
- 對 feedback memory(`feedback_*.md`)只讀 description 比對 user 提的 topic 是否觸及 → 觸及才 Read 全文

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
