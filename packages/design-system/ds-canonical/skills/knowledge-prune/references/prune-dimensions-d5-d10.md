# Prune Phase 1 D5-D10 dimension detail(2026-05-17 加;knowledge-prune SKILL.md Phase 1 extract)

#### D3 補充 — @watch 判法(2026-11-21 加)

`rules/meta-patterns.md` 分群表下方的 `@watch` 規則要判「觀察期內有沒有新 bug 被這條 M-rule 吸收」:先數有幾個 commit 訊息提到它,再逐筆讀。

```sh
git log --since=<起算日> -F --grep=<M-ID> --format='%h %s'
```

- **先跑對照**:同一條指令把 `<M-ID>` 換成 `M37` 先跑一次。對照拿得到資料,目標 M-ID 的 0 筆才可信;對照也是 0 筆 = 量具沒在量,不是「沒有新 bug」。
- **禁用 `-E` 加 `\b`**(例 `-E --grep='\bM25\b'`):本機 git(macOS)的 ERE 不認 `\b`,不報錯、直接回 0 筆 —— 2026-11-17 那一輪因此把 M25 誤數成 0 筆(同條件用 `-F` 是 5 筆)。
- 實測(2026-11-21,839029af,`--since=2026-06-01`):M37 61 筆;M25 用 `-F` 7 筆、用 `-E` 加 `\b` 0 筆。
- `-F` 是子字串比對:`M2` 也會命中 `M20`–`M29`;命中的 commit 要逐筆讀過,才判「升 sharp keep」或「降級」。

#### D5 — Canonical drift(spec vs code 語義漂移)— 2026-05-17 加

Scan:`*.spec.md` 寫的 canonical vs `*.tsx` 實際 code 行為衝突 / spec 寫禁止但 code 仍用 / spec 升級但 code 沒跟。

Example:
- `radius.spec.md`「禁止事項」禁 `rounded-xs/xl/2xl/3xl/4xl` → grep `packages/design-system/src/**/*.tsx` 仍有用 → drift
- `field-controls.spec.md` v13 state machine 升級 → 但 Combobox.tsx 還是 v12 behavior → drift

**Output**:per (spec, code) drift entry + 對應 commit hash 追溯 last alignment 時點

#### D6 — Hook-fire health(log-driven)— 2026-05-17 加

讀 `${GOVERNANCE_STATE_DIR}/hook-fires-per-hook.jsonl`,3 大病徵:
- **Dead**:6 月 0 fire(retire 候選,per `# Retire rules` Hook 規則)。**前提:`audit:hook-quality` 報告的 `summary.observation.blind` 必須是 false**;全盲時零筆不是證據,不得提名(SKILL.md D2),改用本檔末「遙測全盲時的靜態退場判準」
- **Hot**(過 fire):fire / day > 50 → 可能 false positive 多 / regex 太鬆
- **Toggle pattern**:同 fire 反覆 inject + retract → hook design 不穩

**Output**:dead retire list + hot tune list + toggle re-design list

#### D7 — Skill-invoke health(log-driven)— 2026-05-17 加

讀 `${GOVERNANCE_STATE_DIR}/skill-invokes.jsonl`,2 大病徵:
- **Unused**:3 月 0 invoke(除 rare-event skill 如 delivery-handoff)。前提:`skill-invokes.jsonl` 要開遙測才寫、收不到 slash 呼叫;log 不存在或沒涵蓋 3 個月 = 全盲,不提名
- **Always co-invoked**:Skill A 永遠跟 Skill B 一起 invoke → 該合 1 skill 或 chain auto

**Output**:retire list + merge candidate list

#### D8 — Memory recency / orphan— 2026-05-17 加

Scan repository authority `governance/memory/*.md`(禁止以 `~/.claude/**` 或 provider cache 當 authority):
- 6 月無 git log 變動 + **現況已不符** + 不在 `governance/memory/MEMORY.md` index head = stale candidate(per SKILL.md `# Retire rules` Memory file 列)
- file 存在但 MEMORY.md 沒 entry = orphan(可能 retire 漏刪)
- entry 存在但 file 不在 = broken pointer
- **Planning 狀態**(2026-11-17 改判法):以 `node scripts/validate-planning-registry.mjs` 為準 —— 每份 planning 都要登記在 `governance/planning/registry.json` 並有 status;只檢查 `status: active` 的計畫有沒有入口指標(MEMORY.md「Project (active work)」或 AGENTS 導航)。舊判法(逐檔拿檔名去 memory 搜)會把已登記的 reference / completed 文件誤報成孤兒(2026-11-17 實測 48 份裡 44 份誤報)。

**Output**:stale / orphan / broken pointer 3-class list

#### D9 — Benchmark / citation debt(2026-05-17 加,對應 M22)

Scan 全 repo:
- `@benchmark-unverified-blanket` marker(per file retraction;codify 後該 backfill cite 變 verified)
- spec.md / tsx 含 world-class DS keyword(Material / Polaris / Carbon / Ant / Atlassian / Apple)但無 inline URL / GitHub path / screenshot ref
- 過期 benchmark(cite URL 是 v3 但 framework 已 v5)
- 固定量具(2026-11-17 加):`node scripts/benchmark-citation-invariant.mjs --list`(CI 看得到的段)/ `node scripts/exemption-expiry-invariant.mjs --report`(豁免到期)/ 拿掉 `@benchmark-unverified-blanket` 後用同一支 `packages/design-system/ds-canonical/hooks/lib/benchmark-citation.mjs` 再判一次(看標記底下藏了幾段)。tsx 的債只列清單,補來源走 `/design-system-audit`(本 skill 不動 code)

**Output**:per (file, claim) cite debt entry + 建議 WebFetch 補 source

#### D10 — Verification artifact rot(2026-05-17 加,對應 M32)

Scan 全 audit / test infra:
- audit script 只驗 `getAttribute(...)` / `class.includes(...)` 不驗 `getBoundingClientRect()` numeric(pixel-quantified 缺)
- `*.spec.md` 寫 visual canonical 但無對應 playwright snapshot 或 visual-audit 覆蓋
- stale screenshot ref(`infra/governance/baseline/visual/**` 內 committed baseline 6 月未更新;provider compatibility mirror 不另行計數)
- 依 [runtime evidence retention canonical](../../../references/runtime-evidence-retention.md) 枚舉每個 observed worktree 的 `<absolute-git-dir>/governance-runtime/evidence/`:保留 current active/live referenced/genuine review/unexpired receipt closure；將 unreferenced blocked/failed/stale run 列為 whole-run 自主回收候選，禁止 partial CAS pruning

**Output**:per audit script 升 pixel-quantified 提名 + 缺 visual coverage列表 + runtime evidence bytes/保留根/whole-run 回收結果

#### 遙測全盲時的靜態退場判準(Hook / Skill;2026-11-17 加)

遙測預設關,而且就算開了,`hook-fires-per-hook.jsonl` 記的是「被叫到」不是「抓到違規」—— D2 / D6 / D7 的觸發數判準多半全盲。全盲時只准用下面四條靜態證據提名退場,**每一條都要寫「它擋的是什麼 / 退場後誰擋(閘名 + 檔名:行號)」**,寫不出來就不提名:

1. **在每一種部署情境都一定提早結束,或根本沒被出貨**(DS repo 內早退 + fork 分類 DROP + plugin 在非 DS-author target 不跑)。
2. **輸出到不了模型,CI 也沒有重跑它**(diagnostic 只寫 stderr 再 exit 0,且 consumer CI 不把它當 BLOCKER)。
3. **規則已被某一道必過的 CI 閘完整涵蓋**(寫出閘名、在 `.github/workflows/` 的呼叫行號)。
4. **事件、matcher、fork 分類、outputMode 與 SSOT 全部相同,可以合併**(合併後兩條規則與兩面測試都要保留)。
