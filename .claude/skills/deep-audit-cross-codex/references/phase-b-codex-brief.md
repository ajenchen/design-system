# Phase B — Codex parallel audit + 比稿辯論

## B.0 Transport discovery(per codex-collab/SKILL.md Step 0.4)

3-test 順序固定:
```bash
ls -la node_modules/.bin/codex && node_modules/.bin/codex --version   # 1 Local CLI(canonical)
which codex 2>/dev/null && codex --version 2>/dev/null                 # 2 Global(罕見)
ls -la ~/.codex/auth.json                                              # 3 Auth(sanity)
```

**Decision**:1 ✅ → local CLI / 1 ❌ + 2 ✅ → global / 1+2 ❌ + 3 ✅ → `npm install` / 全 ❌ → 報 user。**禁 Explore agent 替身**(M31)。

## B.0.1 — Exec invocation(2026-05-30 bypass-parity,user-authorized;取代 audit-verify 場景的舊 `exec -s read-only`)

**Why**:`-s read-only` 只能 grep/read,跑不了 tsc/playwright/.mjs → verify 不對稱(Claude 機械驗、codex 只目測)違反 M31 Step 2「不可只一方 verify」。bypass 讓 codex 做**跟 Claude 一模一樣**的機械驗證。

```bash
node_modules/.bin/codex exec \
  --dangerously-bypass-approvals-and-sandbox \   # user-authorized;codex shell 可跑 audit script
  --skip-git-repo-check -C "$PWD" \              # 同 repo root → 同 spec.md / scripts / node_modules
  --output-last-message /tmp/codex-phaseB.md \   # 截 verdict artifact 供 Step 4.5 diff
  < brief.md > /tmp/codex-phaseB.log 2>&1 &
```

**最強模型算力強制(2026-07-10 user directive)**:**禁帶 `-c model_reasoning_effort` / `-m` 降檔 flag** — `~/.codex/config.toml`(最強 model + xhigh)= SSOT,不帶即繼承。大 brief 死局對策 = 只拆更小 single-axis brief,不降 effort(詳 memory Rule 3)。

**安全護欄(bypass 解鎖 shell 但仍禁寫源)**:
- Brief 必含「**禁 edit / delete / write `packages/design-system/src/**` 及任何 DS 源**;只跑唯讀 audit script + grep + Playwright screenshot」。
- **每次 bypass 需 user explicit authorize**(anti-pattern:AI 自動 bypass 不問,per `memory/feedback_codex_exec_transport_canonical`)。
- codex 截圖寫 `/tmp/codex-screenshots/`(不污染 repo)。
- 純讀 / cite-only 場景(非 audit-verify)仍用 `-s read-only`(bypass 只給「需跑 script 才能機械驗」的 Phase B verify)。

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

**⚠️ 本 brief 的 SSOT 宣告(2026-07-10 user「codex 和 Claude 在 deep audit 所做的所有事包括所有判斷標準、稽核任務等都應是 SSOT」)**:
你要做的稽核 = **Claude 的 deep audit Phase A 完整鏡像,只差模型**。任務 / 判準 / 流程的**唯一真相來源(SSOT)= 這些檔,你必逐字讀並遵循**,本 brief 只補「檔案得不到的動態」(user 原話 / Claude Phase A 摘要 / live dim 清單):
- `.claude/skills/deep-audit-cross-codex/SKILL.md` Phase A 全段(A.0 全盤閱讀 / A.1 全 dim / **A.1b per-component claim-vs-code 對抗** / A.4 verify-to-perfection)—— **你做 A.0→A.1→A.1b→A.4 每一步,標準與 Claude 同**
- `.claude/skills/design-system-audit/SKILL.md` dim 表 + `references/audit-prompts.md` 每-dim rubric(你的判準 = Claude 的判準)
- 下方逐條 = 上述 SSOT 的**執行清單摘要**,若與 SSOT 檔衝突以 SSOT 檔為準(未來 Phase A 新增步驟自動經此傳到你,不需改本 brief)


1. **全盤閱讀 — 逐字鏡射 Claude A.0 六項**(2026-07-10 user directive「codex 擁有/閱讀的資訊要跟 Claude 一模一樣」;泛 glob ≠ 對等,hook 5️⃣ 驗錨點):
   1. `CLAUDE.md` 全文
   2. `.claude/rules/{meta-patterns,spec-rules,ui-development,story-rules,self-verify}.md` 全文
   3. `.claude/references/{ssot-index,ssot-consultation,build-ui-canonicals,naming-conventions}.md`
   4. `packages/design-system/src/**/*.spec.md` 全部(brief-gen 時跑 `find packages/design-system/src -name '*.spec.md' | wc -l` 取真數,禁硬寫)
   5. `packages/design-system/src/tokens/**/*.spec.md` + `packages/design-system/src/patterns/**/*.spec.md` 全部
   6. repo `.claude/memory/MEMORY.md` index + active project memory files(repo mirror,codex 讀得到)
   **A.0 第 6 項的「session 對話脈絡」是唯一結構性拿不到的 — 以本 brief 第 1 段(user 原話 verbatim,Step 0.05)+ 第 2 段(Claude Phase A 結果摘要)補償,此為明文契約非省略**
   **環境對等**:`-C "$PWD"` 同 repo root = 同 spec / 同 scripts / 同 node_modules;bypass sandbox = 可跑跟 Claude 一模一樣的 tsc / invariant / playwright(M31 Step 2 verify 對稱)

2. **全 dim deep audit NO-SAMPLE — 判準對等**(對齊 `.claude/skills/design-system-audit/SKILL.md` Group A-Q 全 dim):
   - **判準對等(2026-07-10 user「兩邊都用同樣的完美標準去稽核同樣的完整項目」)**:codex **必讀** `.claude/skills/design-system-audit/references/audit-prompts.md`(每 dim 的 rubric)+ SKILL.md dim 表,**逐 dim 套用該 rubric 判**(= Claude 的 dim sub-agent 判準 SSOT,SKILL.md:257)。**禁**只憑 dim 名 / 自己理解判 —— 那是標準不對稱。
   - **live dim 清單由 Claude brief-gen 時注入**:跑 `node scripts/dispatch-audit-dims.mjs --summary` 把編號 / batch 貼進 brief,並要求 codex **自己再跑一次自確認**(read-only 跑不了 → 用 bypass 跑;禁硬寫 dim 數字,per SKILL.md SSOT-integrity invariant)
   - 每 dim 全 DS-wide 掃,禁 sample top N
   - **回覆必附「dim 覆蓋對帳段」**(2026-07-10 加,回程可驗):列出本 brief 實際掃過的 dim 號 +
     每 dim 一行「N files scanned / M findings(或 0 after 全掃)」。拆多 brief 時每份都要附
     —— B.2 會彙總對 dispatch 清單逐號對帳,缺號 = 補 brief 再跑,不齊不得進 B.3 比稿
   - **機械維度 codex 自己跑**(bypass sandbox,做跟 Claude 一樣的事):`npx tsc -b` / `node scripts/audit-content-quality.mjs --check` / 相關 `node scripts/*-invariants.mjs` / Playwright screenshot(sequential navigate→wait→screenshot→evaluate,per memory Rule 2,禁 batch unsafe)。**貼每個 command 的 literal stdout 當 cite**;真跑不了的(帳號 / 網路 scoped)明標「mechanical-uncoverable, eyeball-only」讓 Claude B.2 補跑
   - 每 finding 必 cite: <file:line> + <quote> + <違反 spec / rule>

3. **A.1b — per-component claim-vs-code 對抗驗證(MANDATORY,NO-SAMPLE;= Claude SKILL A.1b 鏡像,歷史最高產出 pass)**:
   對**每個** component + pattern(全 62+,禁 sample):Read 該元件 `.tsx` **+ 它 wrap 的 lib**(Radix / cmdk / react-day-picker / sonner 等)source,對該元件**所有** anatomy / a11y / principles / spec / docblock 宣稱**逐句**比對真實 code:鍵盤 map / ARIA role / focus 行為 / prop 存在性 / 預設值 / native-vs-custom / token。**「自上次無 code 改動」≠ 可跳過**(content 宣稱可在 code 沒變下就是假的)。輸出 per-component `{component, claimsVerified: N, falseClaims: [{fileLine, 宣稱, 真實 code 行為}]}`。錨:2026-05-30 此 pass 抓 403 findings / 202 FALSE_CLAIM。

4. **整理完整報告**(P0 / P1 / P2 分類):
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

5. **禁**:
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
