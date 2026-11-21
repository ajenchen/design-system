#!/usr/bin/env node
// Isolated meta-test for sync-governance-counters.mjs 的「寫死總數」比對。只寫隔離暫存目錄,不碰 repo。
//
// @gate-contract
//   保證: 治理文件(AGENTS.md / CLAUDE.md、canonical skills 的 SKILL.md 與 references、rules 全部;歷史檔除外)裡寫死的
//         audit dim / hooks / skills / M-rules 總數,寫錯時 `sync-governance-counters.mjs --check` 會紅、寫對時綠,
//         數字和名詞中間夾量詞(「33 條 M-rules」「25 個 skills」)也一樣納管;
//         而且「不是總數」的寫法(N 維度、一位數子集、日期、版號、跨行、單數 hook 歷史錨點)不會被誤報
//   紅: 判定表任一格與預期不符;掃描清單漏掉該掃的檔、或把歷史檔收進來;夾具裡 AGENTS.md 寫錯 dim 數或
//       「N 條 M-rules」而真的 sync-governance-counters.mjs 沒有紅、或沒有指名「檔案:行號」—— 本測試 exit 1 並逐格指名
//   綠: 判定表全對、清單對、夾具寫對 dim 數與 M-rule 數(含「7 維度」「7-dim spec」與歷史檔裡的舊數字)時腳本 exit 0、
//       寫錯時 exit 1,還原後又 exit 0;純讀檔與正規表示式,不讀時間、不依機器速度
//
// 為什麼要跑真的腳本(不只測純函式):M37 / M32 的「那個值是誰算的」—— 判定式測得再全,只要
// sync-governance-counters.mjs 沒有真的呼叫 scripts/lib/governance-count-drift.mjs、或餵給它的 dim 數不是從
// design-system-audit SKILL.md 算出來的,CI 照樣綠。夾具那一段就是在證明這條接線。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL,
  HISTORICAL_COUNT_FILES,
  resolveLiveCountFiles,
  scanCountDrift,
} from './lib/governance-count-drift.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(SCRIPT_DIR, '..')
const COUNTERS = join(SCRIPT_DIR, 'sync-governance-counters.mjs')

let failures = 0
const pass = (label) => console.log(`✓ ${label}`)
const fail = (label, detail = '') => {
  failures += 1
  console.error(`✗ ${label}${detail ? `\n${detail}` : ''}`)
}

// ── 1. 判定表(純函式)──────────────────────────────────────────────
const COUNTS = { auditDims: 91, hooks: 56, skills: 25, mRules: 33 }
const RED = [
  ['dim 數寫錯(根目錄 AGENTS.md「91 dim rubric」那句的寫法)', '稽核判準 SSOT(90 dim rubric,Claude 與 Codex 同判準)'],
  ['連字號寫法', '實際 coverage 以 90-dim matrix 核對'],
  ['audit dims', '全部 90 audit dims'],
  ['audit dimensions 標題', '## The 90 audit dimensions'],
  ['大小寫不同', 'Design System Audit (90 Dimensions, Groups A–Q)'],
  ['中文量詞', '依序跑 90 個 dim'],
  ['dim 全掃(原 pattern)', '每季 90 dim 全掃'],
  ['hooks 寫錯', '目前 55 hooks'],
  ['收窄後仍擋:括號前', '(55 hooks)'],
  ['收窄後仍擋:中文字緊貼', '共55 hooks'],
  ['個 DS governance hooks', '57 個 DS governance hooks'],
  ['skills 寫錯', '24 skills'],
  ['個 skills 寫錯', '24 個 skills'],
  ['active M-rules 寫錯', '# Meta-Pattern 預警(32 active M-rules)'],
  ['M-rules 寫錯', '32 M-rules 分 6 cluster'],
  // 反駁 B6:根目錄 AGENTS.md Rule Index 那句的寫法,數字和 M-rules 中間夾「條」。
  ['量詞「條」M-rules 寫錯(AGENTS.md Rule Index 那句)', '| `meta-patterns.md` | 每個任務(32 條 M-rules,fundamental)|'],
  ['量詞前後不空白', '共32條M-rules'],
  ['量詞「支」hooks 寫錯', '目前 55 支 hooks'],
  ['量詞「項」dim 寫錯', '共 90 項 dim'],
]
const GREEN = [
  ['dim 數寫對', '稽核判準 SSOT(91 dim rubric)'],
  ['連字號寫對', '以 91-dim matrix 核對'],
  ['hooks 寫對', '56 hooks'],
  ['skills 寫對', '當前居民(25 skills)'],
  ['M-rules 寫對', '33 active M-rules'],
  ['量詞「條」M-rules 寫對(反駁 B6 的綠面)', '| `meta-patterns.md` | 每個任務(33 條 M-rules,fundamental)|'],
  ['量詞「支」hooks 寫對', '目前 56 支 hooks'],
  ['量詞「個」skills 寫對', '25 個 skills'],
  ['量詞以外的中文字不是總數', '修掉 40 處死 hooks'],
  ['單數 hook 是歷史錨點(knowledge-prune SKILL.md 那句)', '這一維把全部 60 支 hook 標成 `dead`'],
  ['「7 維度」不報(D6-3)', '對標世界級 7 維度'],
  ['「6 維度」不報(D6-3)', '3 層級 × 6 維度'],
  ['兩位數的「10 維」也不報(另一套系統)', '### Phase 1 — 10 維 scan(D1–D10)'],
  ['一位數 dim 是另一套系統', '/product-ui-audit(6 dim)'],
  ['一位數連字號', '7-dim spec'],
  ['表格裡的層號', '| **5 Audit dim** | Periodic mechanical batch verify |'],
  ['日期接 dim 編號', '2026-07-04 dim 73 修 stale 916'],
  ['日期接 dim-編號', '(2026-06-05 dim-72 SSOT,user Q2 拍板)'],
  ['dim 後面接編號', '綁著 dim 58 / 75'],
  ['版號', 'beta.37 hooks'],
  ['識別字', 'v14 hooks'],
  ['日期接 hooks', '- 2026-08-28 hooks/scripts symlink 本地殘影'],
  ['跨行不接(knowledge-prune SKILL.md 表格)', 'SKILL.md total    N files        per-file ≤250\nhooks             N scripts'],
  ['一位數子集', '這次改了 3 hooks'],
]
for (const [label, text] of RED) {
  const drifts = scanCountDrift('fixture.md', text, COUNTS)
  if (drifts.length === 1) pass(`紅:${label} → ${drifts[0]}`)
  else fail(`紅:${label} 應恰好報 1 筆,實得 ${drifts.length}`, JSON.stringify(drifts))
}
for (const [label, text] of GREEN) {
  const drifts = scanCountDrift('fixture.md', text, COUNTS)
  if (drifts.length === 0) pass(`綠:${label}`)
  else fail(`綠:${label} 不應報,實得`, JSON.stringify(drifts))
}
{
  // 期望字串用變數組:寫成字面的「檔名:行號」會被 owner-claims-invariant 當成指向真檔的引用。
  const expected = `${'fixture-doc'}.md:${3}: "90 dim"`
  const drifts = scanCountDrift('fixture-doc.md', '第一行\n第二行\n| x | 稽核判準 SSOT(90 dim rubric)|\n', COUNTS)
  if (drifts.length === 1 && drifts[0].startsWith(expected)) pass('報告帶檔名與行號')
  else fail(`報告應以「${expected}」開頭`, JSON.stringify(drifts))
}

// ── 2. 掃描清單(那個清單是誰算的)──────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'counters-meta-'))
if (!tmp || !existsSync(tmp)) {
  console.error(`✗ mkdtemp 失敗(TMPDIR=${process.env.TMPDIR ?? 'unset'});fixture unavailable`)
  process.exit(1)
}
const put = (root, rel, content) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), content)
}
try {
  const listRoot = join(tmp, 'list')
  const SCANNED = [
    'AGENTS.md',
    'CLAUDE.md',
    `${CANONICAL}/rules/meta-patterns.md`,
    `${CANONICAL}/rules/brand-new-rule.md`,
    `${CANONICAL}/skills/README.md`,
    `${CANONICAL}/skills/some-skill/SKILL.md`,
    `${CANONICAL}/skills/some-skill/references/notes.md`,
    `${CANONICAL}/skills/deep-audit-cross-codex/references/phase-b-codex-brief.md`,
  ]
  const NOT_SCANNED = [
    ...HISTORICAL_COUNT_FILES.keys(),
    `${CANONICAL}/skills/some-skill/references/data.json`,
    'packages/design-system/src/components/Button/button.spec.md',
  ]
  for (const rel of [...SCANNED, ...NOT_SCANNED]) put(listRoot, rel, 'x\n')
  const listed = new Set(resolveLiveCountFiles(listRoot))
  for (const rel of SCANNED) {
    if (listed.has(rel)) pass(`清單收進 ${rel}`)
    else fail(`清單漏掉 ${rel}`)
  }
  for (const rel of NOT_SCANNED) {
    if (!listed.has(rel)) pass(`清單不收 ${rel}`)
    else fail(`清單不該收 ${rel}`)
  }

  // 真 repo:歷史檔排除清單的每一筆都要真的存在(改名後排除會默默失效),該掃的代表檔都要在清單裡(清單不得悄悄變空)。
  const repoListed = new Set(resolveLiveCountFiles(REPO))
  for (const rel of HISTORICAL_COUNT_FILES.keys()) {
    if (existsSync(join(REPO, rel)) && !repoListed.has(rel)) pass(`repo 歷史檔存在且被排除:${rel}`)
    else fail(`repo 歷史檔排除清單失準:${rel}`)
  }
  for (const rel of [
    'AGENTS.md',
    `${CANONICAL}/rules/meta-patterns.md`,
    `${CANONICAL}/skills/design-system-audit/SKILL.md`,
    `${CANONICAL}/skills/design-system-audit/references/audit-prompts.md`,
    `${CANONICAL}/skills/codex-collab/references/brief-template.md`,
  ]) {
    if (repoListed.has(rel)) pass(`repo 清單含 ${rel}`)
    else fail(`repo 清單缺 ${rel}`)
  }

  // ── 3. 跑真的 sync-governance-counters.mjs(證明它消費的是這一份、dim 數是從 SKILL.md 表格算的)──
  const e2e = join(tmp, 'e2e')
  const rows = Array.from({ length: 12 }, (_, i) => `| ${i + 1} | **Fixture dim ${i + 1}** | rubric |`).join('\n')
  put(e2e, `${CANONICAL}/skills/design-system-audit/SKILL.md`, `# Design System Audit\n\n## The audit dimensions\n\n| # | Dim | Rubric |\n|---|---|---|\n${rows}\n`)
  put(e2e, `${CANONICAL}/skills/new-component/SKILL.md`, '走 7-dim spec;spec.md 7 維度\n')
  put(e2e, `${CANONICAL}/rules/spec-rules.md`, '對標世界級 7 維度\n')
  put(e2e, `${CANONICAL}/skills/knowledge-prune/references/meta-pattern-history.md`, '當時只有 11 dim(歷史量測)\n')
  // M-rule 數從夾具 meta-patterns.md 的「## M<N>」標題算:10 條。
  put(e2e, `${CANONICAL}/rules/meta-patterns.md`, Array.from({ length: 10 }, (_, i) => `## M${i + 1} fixture rule\n`).join('\n'))
  const agents = (dims, mRules) => [
    '# fixture',
    `| \`audit-prompts.md\` | 稽核判準 SSOT(${dims} dim rubric,Claude 與 Codex 同判準)|`,
    `| \`meta-patterns.md\` | 每個任務(${mRules} 條 M-rules,fundamental)|`,
    '3 層級 × 6 維度。',
    '',
  ].join('\n')
  const AGENTS_DIM_LINE = 2 // agents() 的第 2 行是 dim rubric 那句
  const AGENTS_MRULE_LINE = 3 // 第 3 行是「N 條 M-rules」那句(反駁 B6)
  const runCounters = (check) => {
    const r = spawnSync(process.execPath, ['--', COUNTERS, ...(check ? ['--check'] : [])], { cwd: e2e, encoding: 'utf8' })
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  }
  // --check 只比較不寫入,所以每一面都先 generate 一次再 --check(否則「json 缺失」本身就會紅,紅面就不算數)。
  const face = (label, dims, mRules, expectCode, expectText) => {
    put(e2e, 'AGENTS.md', agents(dims, mRules))
    const gen = runCounters(false)
    if (gen.code !== 0) return fail(`${label}:generate 應 exit 0,實得 ${gen.code}`, gen.out)
    const { code, out } = runCounters(true)
    if (!/Audit dims:\s+12\b/.test(out)) return fail(`${label}:dim 數不是從夾具 SKILL.md 表格算出的 12`, out)
    if (!/M-rules:\s+10\b/.test(out)) return fail(`${label}:M-rule 數不是從夾具 meta-patterns.md 算出的 10`, out)
    if (code !== expectCode) return fail(`${label}:--check 應 exit ${expectCode},實得 ${code}`, out)
    if (expectText && !out.includes(expectText)) return fail(`${label}:輸出應指名 ${expectText}`, out)
    if (!expectText && /Hardcoded drift detected/.test(out)) return fail(`${label}:不應有 drift`, out)
    pass(`${label} → exit ${code}`)
  }
  face('夾具 AGENTS.md 寫對 12 dim、10 條 M-rules(含 7 維度 / 7-dim / 歷史檔 11 dim)', 12, 10, 0, '')
  face('夾具 AGENTS.md 寫錯 11 dim', 11, 10, 1, `AGENTS.md:${AGENTS_DIM_LINE}: "11 dim" != actual audit dims 12`)
  face('夾具 AGENTS.md 寫錯 11 條 M-rules(反駁 B6)', 12, 11, 1, `AGENTS.md:${AGENTS_MRULE_LINE}: "11 條 M-rules" != actual M-rules 10`)
  face('還原為 12 dim、10 條 M-rules', 12, 10, 0, '')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

if (failures) {
  console.error(`\n✗ test-sync-governance-counters:${failures} 格不符`)
  process.exit(1)
}
console.log('\n✓ test-sync-governance-counters:全部通過')
