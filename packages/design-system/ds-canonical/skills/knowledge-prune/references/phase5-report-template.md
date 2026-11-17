# Phase 5 報告範本(knowledge-prune SKILL.md「Phase 5」extract)

Phase 5 報告格式只有這一個住所。SKILL.md「Phase 5」只留指標;`scripts/validate-knowledge-prune-run.mjs` 直接讀本檔,段名不在 validator 裡另存一份。

## 報告範本

```markdown
## Prune report(N 日期) <!-- id: report -->

### Metric delta <!-- id: metric-delta -->
- Bootstrap instructions: B → A(-X 行)
- MEMORY.md: B → A(-Y 條目 / -Z 檔)
- Total spec.md: B → A(-Z 行)
- Hooks: B → A(-N 個 hook retired)
- Skills: B → A(-N 個 skill retired)
- **Retire rate: X% = retired N / total M**(target ≥ 5%)
  - 公式套用見 SKILL.md「Phase 5」頂部
  - 若 < 5% 必附 rationale(成熟 / 無冗贅 / deferred 等)

### Retired(實際) <!-- id: retired -->
- {list of retired items + why + grep 確認無 reference}

### 未達 retire target rationale(若 < 5%) <!-- id: rationale -->
- {e.g. "governance ecosystem stable, 上季已大幅 prune,本季無重大冗贅"}

### 逐維三選一(D1–D10) <!-- id: dimensions -->
| 維 | 判定 | 已做(commit) | 沒做(理由寫在「逐項結局」) |
|---|---|---|---|
| D1 | {有候選 N / 無候選 / 儀器全盲} | | |
| D2 | {有候選 N / 無候選 / 儀器全盲} | | |
| D3 | {有候選 N / 無候選 / 儀器全盲} | | |
| D4 | {有候選 N / 無候選 / 儀器全盲} | | |
| D5 | {有候選 N / 無候選 / 儀器全盲} | | |
| D6 | {有候選 N / 無候選 / 儀器全盲} | | |
| D7 | {有候選 N / 無候選 / 儀器全盲} | | |
| D8 | {有候選 N / 無候選 / 儀器全盲} | | |
| D9 | {有候選 N / 無候選 / 儀器全盲} | | |
| D10 | {有候選 N / 無候選 / 儀器全盲} | | |

### 逐項結局(Phase 1 每個 ID 一列) <!-- id: outcomes -->
- {ID}:{commit sha} OR {ID}:沒做 —— {理由}

### Human-only pending(只限產品／UI／UX SSOT 真取捨) <!-- id: human-only -->
- {list or 無}

### 被擋的指令(原指令 + 訊息 + 影響) <!-- id: blocked -->
- {原指令:`…`;訊息:…(逐字);影響:…} OR 無

## Self-improvement capture <!-- id: self-improvement -->
- 新發現 prune pattern: {...} OR "無"
- 新確立 anti-bloat rule: {...} OR "無"
- 下次 prune trigger 建議: {...}
```

## validator 怎麼讀上面這段

- **必備段落** = 範本裡的每一個標題。標題尾端的 `<!-- id: … -->` 是 validator 用的代號,報告不必抄。報告的標題去掉前面的編號、後面的括號說明之後,開頭跟範本段名相同就算數(例:`## 3. Retired(實際)` 對得到 `### Retired(實際)`),標題層級不比。「未達 retire target rationale」只在 Retire rate 低於 target 時必備,而且那時不得是空的。
- **Metric delta 五列** = Metric delta 段裡寫 `B → A` 的每一列。報告每一列都要寫出「前 → 後」的數字;寫成條列或表格都可以,列名開頭要相同。
- **Retire rate** = 報告裡寫著 `Retire rate`、同時有 `N / M` 和百分比的那一行;百分比要等於 N / M(容許照小數位四捨五入)。target 從上面那一行的 `target ≥ 5%` 讀。
- **逐維三選一** = 表格每一列的維度代號。報告裡每一維的「判定」欄恰好一個:`有候選 N`(N 要寫數字)/ `無候選` / `儀器全盲`。SKILL.md D2 寫的「儀器全盲、無候選」視同 `儀器全盲`。子項的說明寫在其他欄,不要再用這三個詞。
- **Retired** 每一項都要附一條 grep 指令(反引號包住的 `git grep …` / `grep …` / `rg …`),證明刪掉後沒有斷鏈。沒有退場就寫「無」;但 Retire rate 的 N 大於 0 時不得寫「無」。
- **逐項結局**:Phase 1 清單的每個 ID 一列,開頭就是 ID。後面要嘛是 `<base>..HEAD` 裡真的有的 commit sha,要嘛是「沒做」加理由。理由寫「下次再做」「時間不夠」「下個 session」直接紅(共同 bootstrap 的「# 自主執行 canonical」把延後列為反 pattern)。
- **Human-only pending**、**被擋的指令** 不得是空段;沒有就寫「無」。
- **Self-improvement capture** 的三個小項(上面每一個 `- 名稱:` 列)都要有。

## 另外三份輸入

### phase1-findings.md(Phase 1 落檔,session-local,不 commit)

- 每個 finding 一列,開頭是 ID:`- D4-02 [P2E]:一句話說明`。ID 形如 `D4-02`、`H-M3`、`SI-1`;一列只寫一個 ID。
- 方括號裡的優先度可省略;標了 `[P2E]` / `[P2H]` 的 ID,commit 檢查會要求它單獨一個 commit(SKILL.md Phase 4)。
- 讀不到任何 ID 會紅:回 0 筆要先證明量具拿得到資料(meta-patterns M32「臨時查詢也是量具」)。

### metric-snapshots.jsonl(`${GOVERNANCE_STATE_DIR}`,預設 `<git dir>/governance-runtime/`)

- 比對的是**最後一筆 `"tag":"knowledge-prune"`** 的行(舊寫法 `"source":"knowledge-prune"` 也認),不是檔案最後一行:開遙測時 `stop_passive_logging.sh` R3 每天會追加 `"tag":"auto-daily"` 的行,「最後一行」會被它頂掉。
- 那一行 `ts` 的前 10 字要等於報告標題的日期(YYYY-MM-DD),`retired`、`total_before`、`retire_rate` 要和報告的 Retire rate 行一致。

### prune commit 訊息

- 哪些 commit 算 prune commit:subject 的 type 是 `prune`,或括號 scope 含 `knowledge-prune`(例:`prune(knowledge-prune D5-02): …`、`fix(knowledge-prune 反駁 #1): …`)。只在內文提到 knowledge-prune 的不算。
- 從本規則生效起才檢查:那個 commit 自己的 tree 裡已經有 `scripts/validate-knowledge-prune-run.mjs`。更早的 commit 會逐一印出「早於本規則」再略過,不默默放行。
- 每個 prune commit 要各有一行 `Prune-Items: <ID>, <ID>` 和 `Phase0-After: <bootstrap 行數>/<hook 數>/<meta-patterns 字數>`。這兩行不必在 git 的 trailer 區塊裡(和 `Co-Authored-By` 之間隔一個空行也讀得到);同一個鍵出現多次,以最後一行為準。`Phase0-After` 只驗格式,數值不重算。
- `Prune-Items` 裡有 P2 項(用一行 `Prune-Priority: P2E` 宣告,或 findings 把該 ID 標成 `[P2E]` / `[P2H]`)時,只准 1 個 ID。

## 怎麼跑

```sh
node scripts/validate-knowledge-prune-run.mjs \
  --report <prune-report.md> --findings <phase1-findings.md> \
  --snapshot <metric-snapshots.jsonl> --base <這輪起點 commit>
node scripts/validate-knowledge-prune-run.mjs --commits-only <base>..<head>   # 只看 commit 訊息
```

- 結束碼:0 = 綠;1 = 紅,逐項印出缺什麼;2 = 量具讀不到東西(範本、git、參數,或 `--commits-only` 的區間是空的)。2 不是綠。
- 完整模式在 git repo 裡跑(sha 與 commit 都從目前目錄的 repo 讀),一併檢查 `<base>..HEAD` 的 prune commit。
- 兩面對照組:`scripts/test-validate-knowledge-prune-run.mjs`。
