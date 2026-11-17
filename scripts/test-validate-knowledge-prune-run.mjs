#!/usr/bin/env node
/**
 * meta-test for validate-knowledge-prune-run.mjs —— 兩面對照組:
 *   綠面:同一份齊全的 fixture(報告 + findings + snapshot + 一個拋棄式 git repo)必須 exit 0,而且印得出它真的讀到了資料
 *         (findings 幾個 ID、區間幾個 commit、幾個早於本規則);實際報告常見的寫法(表格版 Metric delta、標題前加編號、
 *         D2 的「儀器全盲、無候選」)也要綠 —— 太嚴會誤紅。
 *   紅面:(a)–(i) 每一項各拿掉一段 → exit 1,而且「❌ (字母)」那一行點名缺的那一段 / 那個 ID / 那個 commit;
 *         把範本的段名改掉 → 原本齊全的報告改紅在新段名,證明段名真的是從範本讀的;
 *         範本讀不到 / 缺代號、參數不齊、--commits-only 區間是空的 → exit 2(量具讀不到東西,不是綠也不是報告的錯)。
 *   每一次「拿掉一段」都先確認被換掉的字串真的存在,換不到就讓本測試自己紅 —— 否則對照組會因為沒改到東西而假綠。
 *
 * 安全:git fixture 一律建在 os.tmpdir() 的 mkdtemp 目錄,子行程拿到的環境拿掉 GIT_DIR 等變數、不讀使用者的 git 設定;
 * 結束時整個刪掉。不碰呼叫端的 repo。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VALIDATOR = join(HERE, 'validate-knowledge-prune-run.mjs')
const TEMPLATE = join(HERE, '..', 'packages/design-system/ds-canonical/skills/knowledge-prune/references/phase5-report-template.md')
const RULE_FILE = 'scripts/validate-knowledge-prune-run.mjs'

const ENV = (() => {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
  for (const key of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX)$/.test(key)) delete env[key]
  }
  Object.assign(env, {
    GIT_AUTHOR_NAME: 'Prune Meta Test', GIT_AUTHOR_EMAIL: 'prune-meta-test@example.invalid',
    GIT_COMMITTER_NAME: 'Prune Meta Test', GIT_COMMITTER_EMAIL: 'prune-meta-test@example.invalid',
  })
  return env
})()

const WORK = mkdtempSync(join(tmpdir(), 'knowledge-prune-validator-meta-'))
let failures = 0
let cases = 0

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return path
}

/** 建一個拋棄式 repo;commits = [{ files, message }]。回傳各 commit 的 sha。 */
function makeRepo(name, commits) {
  const root = join(WORK, name)
  mkdirSync(root, { recursive: true })
  git(root, ['init', '-q'])
  const shas = []
  for (const commit of commits) {
    for (const [path, text] of Object.entries(commit.files ?? {})) write(join(root, path), text)
    git(root, ['add', '-A'])
    git(root, ['commit', '-q', '--allow-empty', '-F', '-'], commit.message)
    shas.push(git(root, ['rev-parse', 'HEAD']))
  }
  return { root, shas }
}

function run(cwd, args) {
  // `--` 先收掉 node 自己的旗標:harness 的來源審查要能證明腳本前面沒有動態旗標
  const result = spawnSync(process.execPath, ['--', VALIDATOR, ...args], { cwd, env: ENV, encoding: 'utf8' })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

function record(name, ok, out) {
  cases += 1
  if (ok) {
    console.log(`✓ ${name}`)
    return
  }
  failures += 1
  console.error(`✗ ${name}\n${out.split('\n').map((line) => `    ${line}`).join('\n')}`)
}

/** 紅面:exit 1,而且至少有一行同時含「❌ (字母)」與每一個指名字串。 */
function expectRed(name, result, letter, mentions) {
  const lines = result.out.split('\n').filter((line) => line.startsWith(`❌ (${letter})`))
  const named = lines.some((line) => mentions.every((mention) => line.includes(mention)))
  record(`紅 (${letter}) ${name}`, result.status === 1 && named, result.out)
}

function expectGreen(name, result, mentions = []) {
  record(`綠 ${name}`, result.status === 0 && !result.out.includes('❌') && mentions.every((mention) => result.out.includes(mention)), result.out)
}

function expectInstrument(name, result, mention) {
  record(`exit 2 ${name}`, result.status === 2 && result.out.includes(mention), result.out)
}

/** 把 text 裡的 from 換成 to;from 不存在 = 對照組沒改到東西,直接丟例外讓本測試紅。 */
function mutate(text, from, to) {
  if (!text.includes(from)) throw new Error(`對照組沒改到東西:找不到「${from}」`)
  return text.replace(from, to)
}

function mutateAll(text, from, to) {
  return mutate(text, from, to).replaceAll(from, to)
}

// ─────────────────────────────── fixture ───────────────────────────────

const PRUNE_MESSAGE = (subject, items, extra = '') =>
  `${subject}\n\n改了什麼、為什麼。\n\nPrune-Items: ${items}\nPhase0-After: 203/58/31983\n${extra}\nCo-Authored-By: Prune Meta Test <prune-meta-test@example.invalid>\n`

const BASE_COMMITS = [
  { files: { 'README.md': '起點\n' }, message: 'chore: 起點\n' },
  // 早於本規則(tree 裡還沒有 validator):沒有 trailer 也只會被列出、不檢查
  { files: { 'docs/a.md': 'a\n' }, message: 'prune(knowledge-prune D1-01): 早於本規則的 commit\n' },
  { files: { [RULE_FILE]: '// fixture:規則從這個 commit 起生效\n', 'docs/b.md': 'b\n' }, message: PRUNE_MESSAGE('prune(knowledge-prune D1-02): 重複段落改成指標', 'D1-02') },
  { files: { 'docs/c.md': 'c\n' }, message: PRUNE_MESSAGE('fix(knowledge-prune 反駁 #1): memory 前後矛盾', 'D4-03') },
  // 只在內文提到 knowledge-prune:不是 prune commit,不檢查
  { files: { 'docs/d.md': 'd\n' }, message: 'docs(audit X): 修一個連結\n\n內文提到 knowledge-prune SKILL,但這不是 prune commit。\n' },
]

const base = makeRepo('base', BASE_COMMITS)
const [BASE_SHA, OLD_SHA, C_SHA, D_SHA] = base.shas
const short = (sha) => sha.slice(0, 8)

const REPORT = `# Prune report(2026-11-18,fixture)

## 1. Metric delta
- Bootstrap instructions: 203 → 203(0 行)
- MEMORY.md: 18 → 18(0 條目 / 0 檔)
- Total spec.md: 28,286 → 28,286(0 行)
- Hooks: 58 → 57(-1 個 hook retired)
- Skills: 25 → 25(0 個 skill retired)
- **Retire rate: 2.5% = retired 1 / total 40**(target ≥ 5%)

## 2. Retired(實際)
- \`check_old_rule.sh\`:併進 \`check_new_rule.sh\`(${short(C_SHA)})。確認無引用:\`git grep -n check_old_rule HEAD -- .\` → 0 筆

## 3. 未達 retire target rationale(若 < 5%)
- 這輪找到的大多是寫得不實的段落,修正不會讓公式項目變少;不為湊數字刪真的保護。

## 4. 逐維三選一(D1–D10)
| 維 | 判定 | 已做(commit) | 沒做(理由寫在「逐項結局」) |
|---|---|---|---|
| D1 重複 | 有候選 1 | D1-02 | |
| D2 dead / stale | 儀器全盲、無候選 | | |
| D3 | 無候選 | | |
| D4 | 有候選 1 | D4-03 | |
| D5 | 無候選 | | |
| D6 | 儀器全盲 | | |
| D7 | 儀器全盲 | | |
| D8 | 無候選 | | |
| D9 | 有候選 1 | | D9-01 |
| D10 | 無候選 | | |

## 5. 逐項結局(Phase 1 每個 ID 一列)
- D1-02:${short(C_SHA)}
- D4-03:${short(D_SHA)}
- D9-01:沒做 —— 要改 tsx 的標記,knowledge-prune 不動 code(SKILL.md Non-goals),交給 /design-system-audit

## 6. Human-only pending(只限產品/UI/UX SSOT 的真取捨)
- 無

## 7. 被擋的指令
- 原指令:\`git commit --amend -F msg.txt\`;訊息:被分類器擋下;影響:commit 訊息裡的一個數字沒能更正,改在本報告更正

## Self-improvement capture
- **新發現 prune pattern**:「檔名:行號」引用會漂,一律寫段名
- **新確立 anti-bloat rule**:無
- **下次 prune trigger 建議**:開遙測滿 6 個月再跑 D2 / D6 / D7

\`\`\`sh
# 這行在程式碼區塊裡,不是標題
git log --oneline
\`\`\`
`

const FINDINGS = `# Phase 1 findings(fixture)
- D1-02 [P1]:同一條規則在三個地方完整重述
- D4-03 [P0]:memory 自相矛盾
- D9-01 [P2E]:tsx 裡的無出處句
`

const SNAPSHOT = [
  { ts: '2026-11-18T01:00:00Z', schema_version: 'v3', tag: 'auto-daily', instruction_lines: 203, hooks_total: 58 },
  { ts: '2026-11-18T04:00:00Z', tag: 'knowledge-prune', retire_rate: 0.025, retired: 1, total_before: 40, instruction_lines: 203, hooks_total: 57 },
  // 開遙測時 stop hook 會在之後再追加 auto-daily:檔案最後一行不是 prune 那一行,validator 不得因此誤紅
  { ts: '2026-11-19T01:00:00Z', schema_version: 'v3', tag: 'auto-daily', instruction_lines: 203, hooks_total: 57 },
].map((entry) => JSON.stringify(entry)).join('\n') + '\n'

const files = (name, { report = REPORT, findings = FINDINGS, snapshot = SNAPSHOT } = {}) => {
  const dir = join(WORK, 'inputs', name)
  return {
    report: write(join(dir, 'prune-report.md'), report),
    findings: write(join(dir, 'phase1-findings.md'), findings),
    snapshot: write(join(dir, 'metric-snapshots.jsonl'), snapshot),
  }
}

const full = (name, inputs = {}, { repo = base, extra = [] } = {}) => {
  const paths = files(name, inputs)
  return run(repo.root, ['--report', paths.report, '--findings', paths.findings, '--snapshot', paths.snapshot, '--base', repo.shas[0], ...extra])
}

try {
  // ─────────── 綠面 ───────────
  expectGreen('齊全的 fixture(含 D2「儀器全盲、無候選」、標題前加編號、snapshot 最後一行是 auto-daily)', full('green'), [
    '✅ (a)', '✅ (b)', '✅ (c)', '✅ (d)', '✅ (e)', '✅ (f)', '✅ (g)', '✅ (h)', '✅ (i)',
    'findings 3 個 ID', '區間 4 個 commit', 'prune commit 3 個(檢查 2、早於本規則 1)', `${short(OLD_SHA)}「prune(knowledge-prune D1-01)`,
  ])
  expectGreen('Metric delta 寫成表格(2026-11-17 實際報告的寫法)', full('green-table', {
    report: mutate(REPORT, `- Bootstrap instructions: 203 → 203(0 行)
- MEMORY.md: 18 → 18(0 條目 / 0 檔)
- Total spec.md: 28,286 → 28,286(0 行)
- Hooks: 58 → 57(-1 個 hook retired)
- Skills: 25 → 25(0 個 skill retired)`, `| 項目 | 前 → 後 |
|---|---|
| Bootstrap instructions(AGENTS.md + CLAUDE.md) | 203 → 203 行(0) |
| MEMORY.md 索引條數 | 18 → 18(0) |
| Total spec.md | 97 檔 / 28,286 行 → 97 檔 / 28,286 行(0) |
| Hooks(session_start Check 7 的算法) | 58 → 57(−1) |
| Skills | 25 → 25(0) |`),
  }))
  expectGreen('Retire rate ≥ target 時可以沒有「未達 retire target rationale」段', full('green-above-target', {
    report: mutate(mutate(REPORT, '2.5% = retired 1 / total 40', '5.0% = retired 2 / total 40'), `## 3. 未達 retire target rationale(若 < 5%)
- 這輪找到的大多是寫得不實的段落,修正不會讓公式項目變少;不為湊數字刪真的保護。
`, ''),
    snapshot: mutate(SNAPSHOT, '"retire_rate":0.025,"retired":1', '"retire_rate":0.05,"retired":2'),
  }))
  expectGreen('--commits-only:早於本規則的逐一列出、只在內文提到 knowledge-prune 的不檢查', run(base.root, ['--commits-only', `${BASE_SHA}..HEAD`]), [
    '✅ (i)', 'prune commit 3 個(檢查 2、早於本規則 1)', `· ${short(OLD_SHA)}「prune(knowledge-prune D1-01)`,
  ])

  // ─────────── 紅面:(a)–(i) 每一項各拿掉一段 ───────────
  expectRed('拿掉「Self-improvement capture」整段', full('a-section', {
    report: REPORT.slice(0, REPORT.indexOf('## Self-improvement capture')),
  }), 'a', ['Self-improvement capture'])
  expectRed('拿掉「下次 prune trigger 建議」小項', full('a-row', {
    report: mutate(REPORT, '- **下次 prune trigger 建議**:開遙測滿 6 個月再跑 D2 / D6 / D7\n', ''),
  }), 'a', ['下次 prune trigger 建議'])
  {
    // 段名從範本讀:把範本的段名改掉,原本齊全的報告就要紅在新段名上
    const renamed = write(join(WORK, 'templates', 'renamed.md'),
      mutate(readFileSync(TEMPLATE, 'utf8'), '### Human-only pending(', '### Human-only 待決('))
    expectRed('範本把「Human-only pending」改名成「Human-only 待決」→ 齊全的報告紅在新段名', full('a-template', {}, { extra: ['--template', renamed] }), 'a', ['Human-only 待決'])
  }
  expectRed('Metric delta「Hooks」沒有數字', full('b', {
    report: mutate(REPORT, '- Hooks: 58 → 57(-1 個 hook retired)', '- Hooks: 待補'),
  }), 'b', ['Hooks'])
  expectRed('Metric delta 少了「Skills」列', full('b-missing', {
    report: mutate(REPORT, '- Skills: 25 → 25(0 個 skill retired)\n', ''),
  }), 'b', ['Skills'])
  expectRed('Retire rate 百分比和 N / M 對不上', full('c', {
    report: mutate(REPORT, '2.5% = retired 1 / total 40', '3.5% = retired 1 / total 40'),
  }), 'c', ['3.5%', '1 / 40'])
  expectRed('低於 target 卻把 rationale 段寫成「無」', full('c-rationale', {
    report: mutate(REPORT, '- 這輪找到的大多是寫得不實的段落,修正不會讓公式項目變少;不為湊數字刪真的保護。', '- 無'),
  }), 'c', ['未達 retire target rationale'])
  expectRed('D2 同時寫了兩個判定', full('d-two', {
    report: mutate(REPORT, '| D2 dead / stale | 儀器全盲、無候選 |', '| D2 dead / stale | 儀器全盲;其他子項有候選 2 |'),
  }), 'd', ['D2'])
  expectRed('少了 D7 那一列', full('d-missing', {
    report: mutate(REPORT, '| D7 | 儀器全盲 | | |\n', ''),
  }), 'd', ['D7'])
  expectRed('「有候選」沒寫 N', full('d-number', {
    report: mutate(REPORT, '| D9 | 有候選 1 |', '| D9 | 有候選 |'),
  }), 'd', ['D9', '數字'])
  expectRed('Retired 那一項拿掉 grep 指令', full('e', {
    report: mutate(REPORT, '確認無引用:`git grep -n check_old_rule HEAD -- .` → 0 筆', '確認無引用'),
  }), 'e', ['Retired', 'check_old_rule.sh'])
  expectRed('Retired 寫「無」但 Retire rate 說 retired 1', full('e-none', {
    report: mutate(REPORT, /- `check_old_rule\.sh`[^\n]*/.exec(REPORT)[0], '- 無'),
  }), 'e', ['retired 1'])
  expectRed('「被擋的指令」段是空的', full('f-empty', {
    report: mutate(REPORT, /- 原指令:[^\n]*\n/.exec(REPORT)[0], ''),
  }), 'f', ['被擋的指令'])
  expectRed('拿掉「Human-only pending」整段', full('f-missing', {
    report: mutate(REPORT, '## 6. Human-only pending(只限產品/UI/UX SSOT 的真取捨)\n- 無\n', ''),
  }), 'f', ['Human-only pending'])
  expectRed('snapshot 的 retired 和報告不一致', full('g-retired', {
    snapshot: mutate(SNAPSHOT, '"retired":1', '"retired":2'),
  }), 'g', ['retired=2'])
  expectRed('snapshot 日期和報告日期不同', full('g-date', {
    snapshot: mutate(SNAPSHOT, '"ts":"2026-11-18T04:00:00Z"', '"ts":"2026-11-17T04:00:00Z"'),
  }), 'g', ['2026-11-17', '2026-11-18'])
  expectRed('snapshot 沒有 knowledge-prune 那一行(只剩 auto-daily)', full('g-tag', {
    snapshot: mutate(SNAPSHOT, '"tag":"knowledge-prune"', '"tag":"auto-daily"'),
  }), 'g', ['knowledge-prune'])
  expectRed('拿掉 D9-01 的結局', full('h-missing', {
    report: mutate(REPORT, /- D9-01:[^\n]*\n/.exec(REPORT)[0], ''),
  }), 'h', ['D9-01'])
  expectRed('D9-01 的理由寫「下次再做」', full('h-banned', {
    report: mutate(REPORT, '要改 tsx 的標記,knowledge-prune 不動 code(SKILL.md Non-goals),交給 /design-system-audit', '下次再做'),
  }), 'h', ['D9-01', '下次再做'])
  expectRed('D9-01 的理由寫「時間不夠」', full('h-time', {
    report: mutate(REPORT, '要改 tsx 的標記,knowledge-prune 不動 code(SKILL.md Non-goals),交給 /design-system-audit', '這輪時間不夠'),
  }), 'h', ['D9-01', '時間不夠'])
  expectRed('D1-02 的 sha 換成區間外的 commit(起點本身)', full('h-sha', {
    report: mutate(REPORT, `- D1-02:${short(C_SHA)}`, `- D1-02:${short(BASE_SHA)}`),
  }), 'h', ['D1-02', short(BASE_SHA)])
  expectRed('findings 讀不到任何 ID', full('h-empty', {
    findings: '# Phase 1 findings\n這份清單沒有照格式寫,一個 ID 都讀不到。\n',
  }), 'h', ['讀不到任何 ID'])
  {
    // (i) 同樣寫法(prune(knowledge-prune …))放在規則生效之後、沒有 trailer → 紅;用 type=fix + scope 的寫法也要抓到
    const noItems = makeRepo('i-no-items', [...BASE_COMMITS, { files: { 'docs/e.md': 'e\n' }, message: 'prune(knowledge-prune D9-01): 規則生效後沒有 trailer\n' }])
    const result = run(noItems.root, ['--commits-only', `${noItems.shas[0]}..HEAD`])
    expectRed('規則生效後的 prune commit 缺 Prune-Items', result, 'i', [short(noItems.shas.at(-1)), 'Prune-Items'])
    expectRed('規則生效後的 prune commit 缺 Phase0-After', result, 'i', [short(noItems.shas.at(-1)), 'Phase0-After'])
    const scoped = makeRepo('i-scope', [...BASE_COMMITS, { files: { 'docs/e.md': 'e\n' }, message: 'fix(knowledge-prune 反駁 #2): scope 寫法也算 prune commit\n\nPrune-Items: D9-01\n' }])
    expectRed('fix(knowledge-prune …) 只有 Prune-Items、缺 Phase0-After', run(scoped.root, ['--commits-only', `${scoped.shas[0]}..HEAD`]), 'i', [short(scoped.shas.at(-1)), 'Phase0-After'])
    const badFormat = makeRepo('i-format', [...BASE_COMMITS, { files: { 'docs/e.md': 'e\n' }, message: 'prune(knowledge-prune D9-01): 數字沒量\n\nPrune-Items: D9-01\nPhase0-After: 待量\n' }])
    expectRed('Phase0-After 不是三個數字', run(badFormat.root, ['--commits-only', `${badFormat.shas[0]}..HEAD`]), 'i', ['Phase0-After', '待量'])
    const p2Declared = makeRepo('i-p2', [...BASE_COMMITS, {
      files: { 'docs/e.md': 'e\n' },
      message: PRUNE_MESSAGE('prune(knowledge-prune D9-01 D9-02): 兩個 P2 塞進同一個 commit', 'D9-01, D9-02', 'Prune-Priority: P2E\n'),
    }])
    expectRed('Prune-Priority: P2E 卻有 2 個 ID', run(p2Declared.root, ['--commits-only', `${p2Declared.shas[0]}..HEAD`]), 'i', ['P2', 'D9-01, D9-02'])
    const p2Findings = makeRepo('i-p2-findings', [...BASE_COMMITS, {
      files: { 'docs/e.md': 'e\n' },
      message: PRUNE_MESSAGE('prune(knowledge-prune D9-01 D4-03): 沒宣告優先度,但 findings 標了 P2E', 'D9-01, D4-03'),
    }])
    // 報告的 sha 換成這個 repo 的,讓紅只來自 (i)
    const report = mutateAll(mutateAll(REPORT, short(C_SHA), short(p2Findings.shas[2])), short(D_SHA), short(p2Findings.shas[3]))
    const p2Result = full('i-p2-findings', { report }, { repo: p2Findings })
    expectRed('完整模式:findings 把 D9-01 標成 [P2E],它卻和別的 ID 同一個 commit', p2Result, 'i', ['D9-01', 'P2'])
    record('紅 (i) 上一格只紅在 (i)(其他八項仍綠)', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].every((letter) => p2Result.out.includes(`✅ (${letter})`)), p2Result.out)
  }

  // ─────────── exit 2:量具讀不到東西 ───────────
  expectInstrument('範本檔不存在', full('t-missing', {}, { extra: ['--template', join(WORK, 'templates', 'no-such-template.md')] }), '讀不到範本檔')
  {
    const noId = write(join(WORK, 'templates', 'no-id.md'),
      mutate(readFileSync(TEMPLATE, 'utf8'), '### 被擋的指令(原指令 + 訊息 + 影響) <!-- id: blocked -->', '### 被擋的指令(原指令 + 訊息 + 影響)'))
    expectInstrument('範本標題缺代號', full('t-no-id', {}, { extra: ['--template', noId] }), '範本標題沒有代號')
  }
  expectInstrument('完整模式缺 --base', run(base.root, ['--report', files('t-args').report]), '缺參數')
  expectInstrument('--commits-only 區間是空的(HEAD..HEAD)', run(base.root, ['--commits-only', 'HEAD..HEAD']), '是空的')
  expectInstrument('--commits-only 區間不存在', run(base.root, ['--commits-only', 'no-such-ref..HEAD']), 'git log')
} finally {
  rmSync(WORK, { recursive: true, force: true })
}

console.log(`\n${cases - failures}/${cases} 格符合`)
process.exit(failures ? 1 : 0)
