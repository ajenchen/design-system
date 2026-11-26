#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 多包 / 多步工作流程只有一個住處 packages/design-system/ds-canonical/rules/work-process.md,而且它每次對話都載入
 *         (沒有 paths 前置設定);每個 session 的啟動面(AGENTS.md、Claude adapter 來源、rules/README.md)都指向它;
 *         其他治理文字不重述它的步驟與數字;已退場的說法不回流;住處引用的路徑都存在;「依據」段的量測數字都能在證據檔逐字找到;
 *         檔頭版本 = 版本紀錄最後一列,每一列都附存在的證據檔 —— 流程改版只在這一處,而且每次改版都有量測證據。
 *   紅: W1 住處缺檔 / 帶 paths 前置設定 / 檔頭版本 ≠ 版本紀錄最後一列 / 版本紀錄某列有空欄或證據欄沒有存在的 governance/planning/*.md;
 *       W2 AGENTS.md 指向住處少於 2 處,或 Claude adapter 來源、rules/README.md 沒指向;
 *       W3 受管文字某一行命中流程指紋、同一行卻沒有 work-process.md(= 在別處重述);
 *       W4 受管文字(住處除外)出現已退場說法(verify-to-perfection、某一輪 0 條必修、修到 0 必修;v4 起加上合回點「本機跑 CI 導出的全部檢查」
 *          與「合回點一律跑整套」—— 全套改在 CI 跑,本機重跑全套的說法不准從別處回流);
 *       W5 住處反引號裡的 packages / governance / scripts / infra 路徑或 rules/x.md 不存在;
 *       W6 住處「依據」段帶單位的數字不在它指向的證據檔裡;W0 受管文字收到不到 3 份(量具失效,不當通過)。
 *   綠: 以上皆無。--selftest 在系統暫存資料夾建合成 repo(跑完刪掉):乾淨樣本必須綠(含「同一行有指向住處」的正當引用),
 *       每一格注入一個違規,必須紅在對應的那一條。
 *
 * 只用 node 內建模組;被 import 時不跑主流程(isMain)。
 * 用法: node scripts/work-process-ssot-invariant.mjs [--selftest]
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const SSOT = 'packages/design-system/ds-canonical/rules/work-process.md'
const RULES_DIR = 'packages/design-system/ds-canonical/rules'
const SKILLS_DIR = 'packages/design-system/ds-canonical/skills'
const HOOKS_DIR = 'packages/design-system/ds-canonical/hooks'
const ADAPTER = 'packages/design-system/ds-canonical/adapters/claude-root-instructions.md'

// W2 啟動面:Codex / generic 原生只讀 AGENTS.md(Rule Index 一列 + 自主執行段一處);Claude 的每次載入清單由 adapter 生成。
const STARTUP = [
  { file: 'AGENTS.md', needle: SSOT, min: 2, why: 'Rule Index 一列 + 自主執行段一處' },
  { file: ADAPTER, needle: 'rules/work-process.md', min: 1, why: 'Claude 每次載入的規則清單(CLAUDE.md 由它生成)' },
  { file: `${RULES_DIR}/README.md`, needle: 'work-process.md', min: 1, why: '規則目錄居民表' },
]

// W3 / W4 受管文字。
const CORPUS_FILES = ['AGENTS.md', 'CONTRIBUTING.md']
// hooks:hooks/README.md 寫了合回點本機檢查與 clone 的關係(v4 起照 W4 守,不准再寫回「本機跑全套」)。
const CORPUS_TREES = ['rules', 'skills', 'references', 'adapters', 'commands', 'hooks'].map((d) => `packages/design-system/ds-canonical/${d}`)
const CORPUS_FLAT = ['governance/memory', 'scripts/fork-role-sources']
// 住處本身、證據 / 歷史紀錄、生成檢視不算受管文字。
const EXCLUDED_PREFIXES = ['governance/planning/', 'governance/archive/', 'governance/generated/', '.claude/', '.agents/']

// 流程指紋:住處以外出現、而且同一行沒有指向住處 = 重述(W3)。改住處措辭時一起改這裡。
const FINGERPRINTS = [
  /做到\s*[/／]\s*漏做\s*[/／]\s*做錯\s*[/／]\s*做多/u,
  /修一次\s*(?:[+＋→、與和]|->)\s*再驗一次/u,
  /必修只限/u,
  /最多一輪審查/u,
  /1\s*位實作\s*[+＋]\s*1\s*位審查/u,
  /72\.6\s*%/u,
]
// 已退場的說法(W4):住處以外一律不准出現。
const RETIRED = [/verify-to-perfection/iu, /某一輪\s*0\s*條必修/u, /修到\s*0\s*條?\s*必修/u, /本機跑的?\s*CI\s*導出的?全部檢查/u, /合回點一律跑整套/u]

// W6「帶單位的數字」:數字 + 單位,或金額。比對用整段原字(例:「72.6%」「6 小時」「4 個檔」)。
const UNIT_NUMBER = /(?<![\d.,$])\d+(?:[.,]\d+)?\s*(?:%|分鐘|代理小時|小時|個檔|個代理|倍|天|秒|分)|\$\d[\d,]*(?:\.\d+)?/gu

const lines = (text) => text.split(/\r?\n/u)

function sectionLines(text, headingRe) {
  const all = lines(text)
  const start = all.findIndex((l) => /^##\s/u.test(l) && headingRe.test(l))
  if (start < 0) return null
  const out = []
  for (const l of all.slice(start + 1)) {
    if (/^#{1,2}\s/u.test(l)) break
    out.push(l)
  }
  return out
}

function listMd(root, rel, recursive, out) {
  const abs = join(root, rel)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return out
  for (const name of readdirSync(abs).sort()) {
    const r = `${rel}/${name}`
    const st = statSync(join(root, r))
    if (st.isDirectory()) { if (recursive) listMd(root, r, true, out) } else if (name.endsWith('.md')) out.push(r)
  }
  return out
}

export function corpusFiles(root) {
  const files = [
    ...CORPUS_FILES.filter((f) => existsSync(join(root, f))),
    ...CORPUS_TREES.flatMap((d) => listMd(root, d, true, [])),
    ...CORPUS_FLAT.flatMap((d) => listMd(root, d, false, [])),
  ]
  return [...new Set(files)].filter((f) => f !== SSOT && !EXCLUDED_PREFIXES.some((p) => f.startsWith(p)))
}

/** @returns {string[]} 每一條以 `W<n> ` 開頭 */
export function check(root) {
  const errors = []
  const read = (rel) => readFileSync(join(root, rel), 'utf8')
  const ssot = existsSync(join(root, SSOT)) ? read(SSOT) : null

  // W1 住處
  if (ssot == null) {
    errors.push(`W1 ${SSOT} 不存在 —— 多包 / 多步工作流程沒有住處`)
  } else {
    const fm = ssot.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)
    if (fm && /^paths\s*:/mu.test(fm[1])) errors.push(`W1 ${SSOT} 帶 paths 前置設定 —— 住處必須每次對話都載入`)
    const head = lines(ssot).slice(0, 6).join('\n').match(/\*\*v(\d+)\((\d{4}-\d{2}-\d{2})\)\*\*/u)
    if (!head) errors.push(`W1 ${SSOT} 檔頭缺「**vN(YYYY-MM-DD)**」`)
    const log = sectionLines(ssot, /版本紀錄/u)
    const rows = []
    if (!log) errors.push(`W1 ${SSOT} 缺「## 版本紀錄」段`)
    else {
      for (const l of log) {
        const t = l.trim()
        if (!t.startsWith('|')) continue
        if (/^\|[\s|:-]+\|$/u.test(t)) continue // 分隔列
        const cells = t.replace(/^\|/u, '').replace(/\|$/u, '').split('|').map((c) => c.trim())
        if (cells[0] === '版本') continue // 表頭
        rows.push({ cells, line: t })
      }
      if (!rows.length) errors.push(`W1 ${SSOT}「版本紀錄」沒有任何一列`)
      rows.forEach(({ cells }, i) => {
        if (cells.length !== 4 || cells.some((c) => !c)) {
          errors.push(`W1 版本紀錄第 ${i + 1} 列要剛好四欄且都非空(版本 / 日期 / 改了什麼 / 證據),實際:${JSON.stringify(cells)}`)
          return
        }
        if (!/^v\d+$/u.test(cells[0]) || !/^\d{4}-\d{2}-\d{2}$/u.test(cells[1])) errors.push(`W1 版本紀錄第 ${i + 1} 列版本 / 日期格式不對:${cells[0]} / ${cells[1]}`)
        const ev = [...cells[3].matchAll(/governance\/planning\/[^\s`|)]+?\.md/gu)].map((m) => m[0])
        if (!ev.some((p) => existsSync(join(root, p)))) errors.push(`W1 版本紀錄第 ${i + 1} 列證據欄沒有存在的 governance/planning/*.md(實際:${cells[3]})`)
      })
    }
    if (head && rows.length) {
      const [v, d] = rows[rows.length - 1].cells
      if (v !== `v${head[1]}` || d !== head[2]) errors.push(`W1 檔頭 v${head[1]}(${head[2]})≠ 版本紀錄最後一列 ${v}(${d})`)
    }
  }

  // W2 啟動面
  for (const { file, needle, min, why } of STARTUP) {
    const n = existsSync(join(root, file)) ? read(file).split(needle).length - 1 : 0
    if (n < min) errors.push(`W2 ${file} 指向住處 ${n} 處,至少要 ${min} 處(${why})`)
  }

  // W0 / W3 / W4 受管文字
  const corpus = corpusFiles(root)
  if (corpus.length < 3) errors.push(`W0 受管文字只收到 ${corpus.length} 份(< 3)—— 量具失效,不當通過`)
  for (const file of corpus) {
    lines(read(file)).forEach((line, i) => {
      if (FINGERPRINTS.some((re) => re.test(line)) && !line.includes('work-process.md')) {
        errors.push(`W3 ${file}:${i + 1} 重述流程內容 —— 改成指向 ${SSOT}`)
      }
      if (RETIRED.some((re) => re.test(line))) errors.push(`W4 ${file}:${i + 1} 已退場的說法回流 —— 流程照 ${SSOT}`)
    })
  }

  if (ssot != null) {
    // W5 住處引用的路徑
    for (const m of ssot.matchAll(/`((?:packages|governance|scripts|infra)\/[^`\s]*)`/gu)) {
      if (!existsSync(join(root, m[1]))) errors.push(`W5 ${SSOT} 引用不存在的 ${m[1]}`)
    }
    for (const m of ssot.matchAll(/`rules\/([^`\s]+\.md)`/gu)) {
      if (!existsSync(join(root, RULES_DIR, m[1]))) errors.push(`W5 ${SSOT} 引用不存在的 rules/${m[1]}`)
    }

    // W6 依據段的數字 ↔ 證據檔
    const basis = sectionLines(ssot, /依據/u)
    if (!basis) errors.push(`W6 ${SSOT} 缺「## 依據」段`)
    else {
      const text = basis.join('\n')
      const evPaths = [...new Set([...text.matchAll(/governance\/planning\/[^\s`|)]+?\.md/gu)].map((m) => m[0]))]
      const evTexts = evPaths.filter((p) => existsSync(join(root, p))).map((p) => read(p))
      if (!evTexts.length) errors.push(`W6 「依據」段沒有指向存在的證據檔(governance/planning/*.md)`)
      else {
        for (const m of text.matchAll(UNIT_NUMBER)) {
          if (!evTexts.some((t) => t.includes(m[0]))) errors.push(`W6 「依據」段的「${m[0]}」不在證據檔 ${evPaths.join('、')} 裡`)
        }
      }
    }
  }
  return errors
}

// ── --selftest:合成 repo,乾淨樣本必綠、每格一個違規必紅在對應條 ──

const GOOD_SSOT = `# 多包 / 多步工作流程
> **v1(2026-11-20)**。唯一住處。

## 適用

照 \`rules/self-verify.md\` 自驗。

## 每一包

規格逐項判「做到 / 漏做 / 做錯 / 做多」;有必修就修一次 → 再驗一次。

## 合回點

本機只跑合回新變動在 CI 對應的檢查 → 推送 → 讀回;全套只在 CI 跑。

## 依據(v1)

- 輕做法 20 分鐘;重流程 6 小時以上;範圍外 4 個檔;代理花費 72.6% 用在工具。
- 出處:\`governance/planning/ev.md\`

## 迭代

由 \`scripts/gate.mjs\` 守。

## 版本紀錄

| 版本 | 日期 | 改了什麼 | 證據 |
|---|---|---|---|
| v1 | 2026-11-20 | 首版 | \`governance/planning/ev.md\` |
`

function buildGood(root) {
  const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text) }
  put(SSOT, GOOD_SSOT)
  put(`${RULES_DIR}/self-verify.md`, '# 自驗\n')
  put(`${RULES_DIR}/README.md`, '| [work-process.md](work-process.md) | always |\n')
  put('scripts/gate.mjs', '// gate\n')
  put('governance/planning/ev.md', '輕做法 20 分鐘;重流程 6 小時以上;範圍外 4 個檔;72.6%\n')
  put('AGENTS.md', `| \`${SSOT}\` | 每個多包 / 多步任務開工前 |\n多包工作照 \`${SSOT}\`。\n`)
  put(ADAPTER, '- `.claude/rules/work-process.md` — always loads\n')
  put('CONTRIBUTING.md', '貢獻說明\n')
  put('governance/memory/a.md', '無關內容\n')
  // 正當引用:指紋句同一行有指向住處 → 不算重述
  put('governance/memory/b.md', '審查照 `packages/design-system/ds-canonical/rules/work-process.md`(做到 / 漏做 / 做錯 / 做多)\n')
  return put
}

const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(readFileSync(join(root, rel), 'utf8')))

const CASES = [
  ['乾淨樣本', () => {}, null],
  ['W1 住處缺檔', (r) => rmSync(join(r, SSOT)), 'W1'],
  ['W1 帶 paths 前置設定', (r) => edit(r, SSOT, (t) => `---\npaths:\n  - "**/*"\n---\n${t}`), 'W1'],
  ['W1 檔頭版本 ≠ 最後一列', (r) => edit(r, SSOT, (t) => t.replace('**v1(2026-11-20)**', '**v2(2026-12-01)**')), 'W1'],
  ['W1 證據欄空', (r) => edit(r, SSOT, (t) => t.replace('| 首版 | `governance/planning/ev.md` |', '| 首版 |  |')), 'W1'],
  ['W1 證據檔不存在', (r) => edit(r, SSOT, (t) => t.replace('| 首版 | `governance/planning/ev.md` |', '| 首版 | governance/planning/nope.md |')), 'W1'],
  ['W2 AGENTS.md 只指一處', (r) => edit(r, 'AGENTS.md', (t) => t.split('\n')[0] + '\n'), 'W2'],
  ['W2 adapter 沒指', (r) => edit(r, ADAPTER, () => '- `.claude/rules/meta-patterns.md`\n'), 'W2'],
  ['W2 rules/README.md 沒指', (r) => edit(r, `${RULES_DIR}/README.md`, () => '| [meta-patterns.md](meta-patterns.md) |\n'), 'W2'],
  ['W3 memory 重述「修一次 + 再驗一次」', (r) => edit(r, 'governance/memory/a.md', () => '每包修一次 + 再驗一次\n'), 'W3'],
  ['W3 rules 重述 72.6%', (r) => edit(r, `${RULES_DIR}/self-verify.md`, (t) => `${t}流程工具占 72.6% 花費\n`), 'W3'],
  ['W4 AGENTS.md 回流 verify-to-perfection', (r) => edit(r, 'AGENTS.md', (t) => `${t}**Default = autonomous + complete + verify-to-perfection**\n`), 'W4'],
  ['W4 memory 回流「修到 0 必修」', (r) => edit(r, 'governance/memory/a.md', () => '審查修到 0 必修為止\n'), 'W4'],
  ['W4 skills 回流「合回點一律跑整套」', (r) => { mkdirSync(join(r, `${SKILLS_DIR}/x`), { recursive: true }); writeFileSync(join(r, `${SKILLS_DIR}/x/SKILL.md`), '收窄子集先驗過;合回點一律跑整套。\n') }, 'W4'],
  // 同時證明 hooks/ 在受管範圍:hooks 沒收進 corpus 時這格會綠(BAD)。
  ['W4 hooks/README.md 回流「本機跑 CI 導出的全部檢查」', (r) => { mkdirSync(join(r, HOOKS_DIR), { recursive: true }); writeFileSync(join(r, `${HOOKS_DIR}/README.md`), 'clone 的等價全樹檢查 = 合回點本機跑 CI 導出的全部檢查\n') }, 'W4'],
  ['W5 住處引用不存在的路徑', (r) => edit(r, SSOT, (t) => t.replace('`scripts/gate.mjs`', '`scripts/nope.mjs`')), 'W5'],
  ['W5 住處引用不存在的 rules/x.md', (r) => edit(r, SSOT, (t) => t.replace('`rules/self-verify.md`', '`rules/nope.md`')), 'W5'],
  ['W6 依據數字不在證據檔', (r) => edit(r, 'governance/planning/ev.md', (t) => t.replace('20 分鐘', '25 分鐘')), 'W6'],
  ['W0 受管文字不到 3 份', (r) => {
    for (const p of ['AGENTS.md', 'CONTRIBUTING.md', 'governance/memory', `${RULES_DIR}/README.md`, `${RULES_DIR}/self-verify.md`, ADAPTER]) rmSync(join(r, p), { recursive: true, force: true })
  }, 'W0'],
]

function selftest() {
  const base = mkdtempSync(join(tmpdir(), 'work-process-ssot-selftest-'))
  let bad = 0
  try {
    CASES.forEach(([name, mutate, expect], i) => {
      const root = join(base, String(i))
      buildGood(root)
      mutate(root)
      const errs = check(root)
      const ok = expect === null ? errs.length === 0 : errs.some((e) => e.startsWith(`${expect} `))
      console.log(`${ok ? 'ok ' : 'BAD'} ${expect ?? '綠'} ${name}${ok ? '' : ` → ${JSON.stringify(errs)}`}`)
      if (!ok) bad += 1
    })
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
  if (bad) {
    console.error(`work-process SSOT selftest 失敗:${bad} / ${CASES.length} 格沒有照預期紅 / 綠`)
    process.exit(1)
  }
  console.log(`work-process SSOT selftest 通過:${CASES.length} 格(乾淨樣本綠,${CASES.length - 1} 格違規各自紅在對應條)`)
}

function main() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
  const errors = check(ROOT)
  if (errors.length) {
    console.error('work-process SSOT 閘 FAIL:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const head = readFileSync(join(ROOT, SSOT), 'utf8').match(/\*\*v(\d+)\((\d{4}-\d{2}-\d{2})\)\*\*/u)
  console.log(`work-process SSOT 閘 PASS:${SSOT} v${head[1]}(${head[2]});受管文字 ${corpusFiles(ROOT).length} 份,無重述、無退場說法,啟動面都指向,依據數字都在證據檔`)
}

const isMain = (() => {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else main()
}
