# Phase B — Codex parallel audit + 比稿辯論

## B.0 Transport discovery(per codex-collab/SKILL.md Step 0.4)

3-test 順序固定:
```bash
ls -la node_modules/.bin/codex && node_modules/.bin/codex --version   # 1 Local CLI(canonical)
which codex 2>/dev/null && codex --version 2>/dev/null                 # 2 Global(罕見)
ls -la ~/.codex/auth.json                                              # 3 Auth(sanity)
```

**Decision**:1 ✅ → local CLI / 1 ❌ + 2 ✅ → global / 1+2 ❌ + 3 ✅ → `npm install` / 全 ❌ → 報 user。**禁 Explore agent 替身**(M31)。

## B.1 Brief template

⚠️ **Faithful relay invariant**(M31 Step 0.05,user-verbatim,不可只送 paraphrase):

```
## User 原話(verbatim)
「<user 在本 session 對 deep audit 的原話 quote,中英 / 符號 / 圖文 ref 全保>」

## Claude Phase A 結果摘要

### 全盤閱讀
- 讀完:CLAUDE.md / 31 active M-rules / spec.md ×<N> / tokens / patterns / memory active

### 全 dim NO-SAMPLE deep audit findings
- P0: <列具體 file:line + 違反 spec / rule>
- P1: <同>
- P2: <同>

### SSOT-UI/UX 已 ASK user
- <列 N 項>

### Autonomous landed
- <列 N 項 file:line + commit hash>

### Phase A 結論(不 verify 但抓到)
- <列 grep 看到 / suspect drift / 未跑 visual>

## 你的任務(Phase B,獨立)

1. **全盤閱讀**(per A.0 file list,不 sample):
   - CLAUDE.md / `.claude/rules/*` / `.claude/references/*`
   - `packages/design-system/src/**/*.spec.md` 全部(~60 file)
   - `packages/design-system/src/tokens/**/*.spec.md` + `packages/design-system/src/patterns/**/*.spec.md`
   - `~/.claude/.../memory/MEMORY.md` index + active project memory

2. **全 dim deep audit NO-SAMPLE**(對齊 `.claude/skills/design-system-audit/SKILL.md` Group A-P 全 dim per SKILL.md):
   - 每 dim 全 DS-wide 掃,禁 sample top N
   - 每 finding 必 cite: <file:line> + <quote> + <違反 spec / rule>

3. **整理完整報告**(P0 / P1 / P2 分類):
   ```
   ### Codex Phase B audit
   - P0: <list>
   - P1: <list>
   - P2: <list>

   ### 跟 Claude Phase A 對照
   - Claude 抓 + 你不同意:<list + cite>
   - 你抓 + Claude 漏:<list + cite>
   - 兩邊都漏的盲區:<list + cite>

   ### 真理由 disagreement(必 cite battle)
   - <題 1>: Claude 立場 / 你立場 / spec.md path:line 引文 / world-class ≥3 家對照
   ```

4. **禁**:
   - frame 答案進 Claude 思路(不可 paraphrase Claude 結論)
   - sample / heavy agent skip(NO-SAMPLE STRICT)
   - pass-through 共識（必獨立 own report）
   - 直接給 user verdict（共識由 Claude Phase B.5 synthesize）

## 請獨立解讀 user 原話(per M31 Step 0.05)

User 原話可能跟我 paraphrase 不同。請以「你直接看 user 原話該怎麼解讀」為主,
不要被 Claude 結論 frame。如果 user 想要的方向你判斷跟我不同,直接寫出來。

## Cite invariant(M22)

每 claim 必附 inline cite:URL / GitHub source path + line / screenshot ref。
無 cite = unverified rumor,自動降 P2 「pending verification」。
```

## B.2 Step 4 self-check 必過(M22/M23/M27→M23(c)/M8)

對 codex reply 跑 4 題:

| # | Check | 失敗 → |
|---|---|---|
| 1 | M22 cite check — codex 引的 benchmark 有 inline URL / GitHub line? | reply 要求補 cite |
| 2 | M23 DS-first — codex 建議是否覆蓋 DS 既有 canonical(spec.md / token / variant)? | 必 grep verify DS 既有,有命中 → 拒絕 codex / 修正 |
| 3 | M23(c) prop namespace — codex prop name 是否撞 DS 既有? | wrap-and-rename |
| 4 | M8 ≥3 source — codex 只引 1 家? | reply 要求補到 3 家 |

## B.3 Step 4.5 Verify each claim(anti-pass-through)

逐條 codex finding 過:

```
Finding N: <codex claim 一句話>

Verify:
1. Grep DS-internal: rg "<keyword>" src/ → <hit / miss + 行號>
2. WebFetch external(若 cite world-class): URL → <真 quote 對照>
3. Run invariant script(若 codex 給數字): bash <script> → <實 value vs codex value>
4. Counter-example scan: grep <pattern> DS-wide → <反例 / 無>

Verdict: ✅ verified / ❌ FALSE / ⚠️ partial
Reasoning: <一句話>
```

## B.4 Cite battle template

```
Disagreement N: <topic>

| Side | Position | Cite | Quote |
|---|---|---|---|
| Claude Phase A | <stance> | <file:line / URL> | 「<quote>」 |
| Codex Phase B | <stance> | <file:line / URL> | 「<quote>」 |

WebFetch external:
- Polaris: <URL> → 「<quote>」
- Material: <URL> → 「<quote>」
- Atlassian: <URL> → 「<quote>」

Verdict: <Claude / Codex / Both / STOP-ask-user>
Reasoning: <cite + world-class consensus + DS internal canonical alignment>
```

## B.5 Step 5 比稿 matrix(per finding)

```
| Finding | Claude v1 | Codex v1 | Verdict | Final synthesized |
|---|---|---|---|---|
| <N> | <stance> | <stance> | ✅ accept C / ✅ accept C+ / ✅ accept Claude / 修正 = synthesize / 重啟 | <final 方案> |
```

**禁** pass-through 直接 paste codex / 「兩邊都對」打太極 / vote without cite。

## Phase B complete output

```markdown
# Phase B 完成

## Codex independent findings(NO-SAMPLE)
- P0: <N> / P1: <M> / P2: <K>

## 比稿結果
- Claude 抓 + Codex 漏: <list>
- Codex 抓 + Claude 漏: <list>(這些是 Phase A 漏掉的盲區!)
- Cite battle resolved: <K 題,各題 verdict>
- Cite battle deferred(evidence 對等): <N 題,STOP 等 user>

## 共識 SSOT-UI/UX(中文人話 propose)
<決策 1-N per triage-rubric.md format>

## 共識 autonomous landed(commit <hash>)
- <N> 項
- file:line + diff link

→ 進 Phase C
```
