# Prune Phase 1 D5-D10 dimension detail(2026-05-17 加;knowledge-prune SKILL.md Phase 1 extract)

#### D5 — Canonical drift(spec vs code 語義漂移)— 2026-05-17 加

Scan:`*.spec.md` 寫的 canonical vs `*.tsx` 實際 code 行為衝突 / spec 寫禁止但 code 仍用 / spec 升級但 code 沒跟。

Example:
- `radius.spec.md:57-71` 禁 `rounded-xl/2xl/3xl` → grep `packages/design-system/src/**/*.tsx` 仍有用 → drift
- `field-controls.spec.md` v13 state machine 升級 → 但 Combobox.tsx 還是 v12 behavior → drift

**Output**:per (spec, code) drift entry + 對應 commit hash 追溯 last alignment 時點

#### D6 — Hook-fire health(log-driven)— 2026-05-17 加

讀 `.claude/logs/hook-fires-per-hook.jsonl`,3 大病徵:
- **Dead**:6 月 0 fire(retire 候選,per `# Retire rules` Hook 規則)
- **Hot**(過 fire):fire / day > 50 → 可能 false positive 多 / regex 太鬆
- **Toggle pattern**:同 fire 反覆 inject + retract → hook design 不穩

**Output**:dead retire list + hot tune list + toggle re-design list

#### D7 — Skill-invoke health(log-driven)— 2026-05-17 加

讀 `.claude/logs/skill-invokes.jsonl`,2 大病徵:
- **Unused**:3 月 0 invoke(除 rare-event skill 如 delivery-handoff)
- **Always co-invoked**:Skill A 永遠跟 Skill B 一起 invoke → 該合 1 skill 或 chain auto

**Output**:retire list + merge candidate list

#### D8 — Memory recency / orphan— 2026-05-17 加

Scan `~/.claude/.../memory/*.md`:
- 6 月無 git log 變動 + 不在 MEMORY.md index head = stale candidate(per existing D2 retire rule)
- file 存在但 MEMORY.md 沒 entry = orphan(可能 retire 漏刪)
- entry 存在但 file 不在 = broken pointer
- **Planning orphan**(2026-07-10 hunt 補,原方向相反不掃 planning/):`ls .claude/planning/*.md` 逐檔 rg 檔名 across memory/*.md + MEMORY.md;無引用 = planning orphan 候選(存檔性質可標 archived,活的必補 memory pointer)

**Output**:stale / orphan / broken pointer 3-class list

#### D9 — Benchmark / citation debt(2026-05-17 加,對應 M22)

Scan 全 repo:
- `@benchmark-unverified-blanket` marker(per file retraction;codify 後該 backfill cite 變 verified)
- spec.md / tsx 含 world-class DS keyword(Material / Polaris / Carbon / Ant / Atlassian / Apple)但無 inline URL / GitHub path / screenshot ref
- 過期 benchmark(cite URL 是 v3 但 framework 已 v5)

**Output**:per (file, claim) cite debt entry + 建議 WebFetch 補 source

#### D10 — Verification artifact rot(2026-05-17 加,對應 M32)

Scan 全 audit / test infra:
- audit script 只驗 `getAttribute(...)` / `class.includes(...)` 不驗 `getBoundingClientRect()` numeric(pixel-quantified 缺)
- `*.spec.md` 寫 visual canonical 但無對應 playwright snapshot 或 visual-audit 覆蓋
- stale screenshot ref(snapshot file 6 月未更新)

**Output**:per audit script 升 pixel-quantified 提名 + 缺 visual coverage 列表
