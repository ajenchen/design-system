#!/usr/bin/env node
// check-dangling-infra-ref.mjs — infra-self integrity lint(2026-05-30 ship per user「讓 deep-audit 真正含所有 infra」)
//
// Why: 2026-05-30 session 抓出 13 處 check_token_hygiene.sh 死引用 + env-smoke set-e bug,
// 都是「doc 引用的 hook/script 在磁碟上不存在 / 名字改了沒同步」這類 infra-self drift,
// 而沒有任何機械防線抓(M7/M34 broad-vs-narrow gap)。本 lint = deep-audit Group Q dim 的執行 SSOT。
//
// 掃 governance docs 引用的 hook/script/path 名,assert 每個 target 存在磁碟 OR 同行有 retired/未實作 標註。
// 3-bucket: A=annotated-retired(OK) / B=dangling-LIVE(FAIL,--check exit 1) / C=path-deadref。
// Usage: node scripts/check-dangling-infra-ref.mjs [--check]
//
// @gate-contract
//   保證: 治理文件(ds-canonical skills / rules / references / commands、governance/memory、AGENTS.md、CLAUDE.md 的 .md / .json,
//         以及 .github/workflows 的每一支 .yml)引用的 hook 名(check_ / stop_ … .sh / .py)與 .mjs 腳本在磁碟上真的找得到,
//         或同一行明確標註已退役 / 未實作 —— 文件講的那道防線、CI 要跑的那支腳本,檔案真的在
//   紅: 文件裡寫一個不存在的 hook 名、指到 scripts / hooks / 根目錄以外的裸 .mjs 檔名、帶目錄但檔案不在的 .mjs 路徑、
//       或 workflow 呼叫一支不存在的 .mjs(含簽出前綴 `$GITHUB_WORKSPACE/`、`trusted/` 等寫法)→ --check 指名「檔案:行號 → 名稱」並 exit 1;
//       宣告要掃的目錄裡有檔卻 0 份被收進來、或整趟 0 份文件 = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成「沒有懸空引用」
//       (scripts/test-check-dangling-infra-ref.mjs 在隔離夾具裡逐面驗)
//   綠: 引用全部解析得到時 exit 0;只讀檔(.yml 用 js-yaml 取簽出位置)+ 正規表示式,不讀時間、不依機器速度,重複跑結果相同;
//       meta-test 的「完整路徑、檔案在 → 綠」「workflow 帶簽出前綴、檔案在 → 綠」兩面證明綠不是靠略過
//       (2026-10-14 前帶目錄的引用與整個 .github/workflows 都是被略過的)
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load as loadYaml } from 'js-yaml'

const rootIndex = process.argv.indexOf('--root')
if (rootIndex !== -1 && !process.argv[rootIndex + 1]) {
  console.error('usage: check-dangling-infra-ref.mjs [--check] [--root <repo>]')
  process.exit(2)
}
const ROOT = rootIndex === -1 ? process.cwd() : resolve(process.argv[rootIndex + 1])
const CHECK = process.argv.includes('--check')

// ── scan scope(live governance docs;排除 mirror / 歷史凍結檔)──
// 2026-05-31(infra-audit P1):補 governance/memory — 原漏掉,memory infra ref 零機械防線
// (memory file 可 cite 不存在的 hook 而無人攔)。
// 2026-07-07(治理進化收尾):補 .github/workflows — CI yml 引用的 scripts/*.mjs|sh 同屬
// infra-self ref(workflow 引不存在的 script = release/CI 靜默斷鏈),納入同一 3-bucket 檢查。
const SCAN_DIRS = [
  'packages/design-system/ds-canonical/skills',
  'packages/design-system/ds-canonical/rules',
  'packages/design-system/ds-canonical/references',
  'packages/design-system/ds-canonical/commands',
  'governance/memory',
  '.github/workflows',
]
const SCAN_FILES = ['AGENTS.md', 'CLAUDE.md']
const EXCLUDE = /\/planning\/|\/scratch\/|\/retired\/|\/tmp\/|node_modules/

// ── annotation = 同行 marker 明確 disclaim「此 ref 本身故意不對應 live 檔」──
// 收緊原則(2026-05-30):只認直接 disclaim THIS ref 的 marker,拿掉 example/e.g./範例
// 這類通用字 — 否則任一行只要含「(e.g., …)」或「每則 … 範例」就讓真 dangling ref 假綠放行
// (anchor:check_story_anatomy.sh 被同行 `(e.g., "Badge …")` 假 annotate;
//  check_principles_canonical.sh 被 `Rule note + 範例` 假 annotate)。
const ANNOTATED = /retired|未實作|planned|待\s*ship|deprecated|mindset enforcement|@[a-z-]+-skip|@[a-z-]+-allow|folded|rename →|不存在/i

// ── infra name patterns(hook / script)──
const HOOK_RE = /\b((?:check|stop|inject|pre_edit|post_edit|enforce|auto_regen|block)_[a-z0-9_]+\.(?:sh|py))\b/g
// Keep the complete repo-relative path when one is present.  The old pattern
// matched only the suffix after a dot, so
// `infra/governance/test/provider-surface.test.mjs` became `test.mjs` and was
// reported as a dangling script even though the referenced file existed.
const MJS_RE = /(?<![a-z0-9._/-])((?:[a-z0-9._-]+\/)*[a-z0-9][a-z0-9._-]*\.mjs)\b/gi

// ── where a referenced name could legitimately live on disk ──
// 含 hook-consolidation lib form:`check_X.sh`/`stop_X.sh` 的 logic 常被搬成 `_X.sh`
// lib helper(被 post_edit_dispatcher / chrome_header_dispatcher source,降 hook count),
// 跟 `check_token_hygiene→_token_hygiene` 同 pattern。視 lib form 為 live(functionally 存在)。
function resolvesOnDisk(name) {
  if (name.includes('/') && existsSync(join(ROOT, name))) return true
  const variants = [name]
  const libForm = name.replace(/^(?:check|stop|inject|pre_edit|post_edit|enforce|auto_regen|block)_/, '_')
  if (libForm !== name) variants.push(libForm)
  const dirs = name.endsWith('.mjs')
    ? ['scripts', 'packages/design-system/ds-canonical/hooks', '.']
    : ['packages/design-system/ds-canonical/hooks', 'packages/design-system/ds-canonical/hooks/lib', 'packages/design-system/ds-canonical/hooks/tests', 'hooks/scripts',
       // fork-launcher homes:intentionally fork-shipped hooks(非 ds-source),live on disk
       'template/ds-product-template/.claude/hooks', 'packages/design-system/ds-canonical/fork/launchers', '.']
  if (variants.some((v) => dirs.some((d) => existsSync(join(ROOT, d, v))))) return true
  // folded-provenance form:hook merge 把整個 check_X.sh logic 搬進 mega-dispatcher,
  // 並在 dispatcher 內留 `原 [lib/]check_X.sh` provenance 註解(eg. check_story_invariants.sh
  // R1「原 lib/check_story_anatomy.sh」/ check_canonical_propagation.sh E.1「原 check_principles_canonical」)。
  // logic functionally 存在 → 視為 live(同 lib-form 精神),非「拿 example 通用字假綠」。
  return foldedProvenance().has(name)
}

// 掃 live hooks 的 `原 [path/]<name>.{sh,py}` fold-provenance 註解,建「已 merge 進 dispatcher」index。
let _foldCache = null
function foldedProvenance() {
  if (_foldCache) return _foldCache
  _foldCache = new Set()
  const hookDirs = ['packages/design-system/ds-canonical/hooks', 'packages/design-system/ds-canonical/hooks/lib']
  // 副檔名 optional — fold 註解有寫 `原 check_X.sh` 也有省成 `原 check_X`(eg. principles)。
  // 抓 base name 後同時 index 帶 .sh / .py 兩種 ref 形式,讓 doc 引用 `check_X.sh` 也命中。
  const provRe = /原\s+(?:[a-z0-9_]+\/)*((?:check|stop|inject|pre_edit|post_edit|enforce|auto_regen|block)_[a-z0-9_]+?)(?:\.(?:sh|py))?(?=[\s,，。)）]|$)/g
  for (const d of hookDirs) {
    let ents
    try { ents = readdirSync(join(ROOT, d), { withFileTypes: true }) } catch { continue }
    for (const e of ents) {
      if (!e.isFile() || !/\.(sh|py)$/.test(e.name)) continue
      let body
      try { body = readFileSync(join(ROOT, d, e.name), 'utf8') } catch { continue }
      for (const m of body.matchAll(provRe)) {
        _foldCache.add(`${m[1]}.sh`)
        _foldCache.add(`${m[1]}.py`)
      }
    }
  }
  return _foldCache
}

// ── 收哪些檔 ──
// 散文文件收 .md / .json;.github/workflows 收 .yml / .yaml。2026-07-07 把 .github/workflows 加進 SCAN_DIRS 時 walk 只收
// .md / .json,14 支 workflow 一支都沒讀過,輸出只有一行「Scanned 120」看不出來 —— 宣告掃了、實際沒掃(M37 第八種形狀:
// 沒觀察到被讀成沒發生)。所以下面另外檢查「宣告的目錄有檔、卻 0 份收進來」,收不到就是儀器失效。
const WORKFLOW_DIR = '.github/workflows'
const isWorkflowFile = (rel) => rel.startsWith(`${WORKFLOW_DIR}/`) && /\.ya?ml$/.test(rel)
const isScannedDoc = (rel) => /\.(md|json)$/.test(rel) || isWorkflowFile(rel)

function walk(dir, acc) {
  let ents
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const rel = `${dir}/${e.name}`
    if (EXCLUDE.test(rel)) continue
    if (e.isDirectory()) walk(rel, acc)
    else if (isScannedDoc(rel)) acc.push(rel)
  }
}

function hasAnyFile(dir) {
  let ents
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }) } catch { return false }
  return ents.some((e) => {
    const rel = `${dir}/${e.name}`
    if (EXCLUDE.test(rel)) return false
    return e.isDirectory() ? hasAnyFile(rel) : e.isFile()
  })
}

const instrumentFailures = []
const files = []
for (const d of SCAN_DIRS) {
  const before = files.length
  walk(d, files)
  if (files.length === before && hasAnyFile(d)) instrumentFailures.push(`${d}:目錄裡有檔,卻 0 份被收進掃描(收檔的副檔名規則沒對上這個目錄)`)
}
for (const f of SCAN_FILES) if (existsSync(join(ROOT, f))) files.push(f)
if (files.length === 0) instrumentFailures.push(`${ROOT}:0 份文件被掃到 —— 根目錄或掃描路徑錯了,不是「沒有懸空引用」`)

// ── workflow 裡的路徑相對於「簽出位置」,不是 repo 根(2026-10-14)──
//   `$GITHUB_WORKSPACE/`、`${GITHUB_WORKSPACE}/`、`${{ github.workspace }}/` = 主簽出的根;
//   actions/checkout 的 `with.path`(trusted / source / candidate / reference / recovery-tools)= 同一個 repo 簽在子目錄;
//   `$RUNNER_TEMP/<簽出 path>/` = release-recover.yml 把簽出搬到 RUNNER_TEMP 之後再呼叫。
// 三種變數寫法先統一成裸字:MJS_RE 的前置排除擋 `/`,`${{ github.workspace }}/scripts/x.mjs` 原樣整條比不到 = 靜默不檢查。
// 只拿掉「這支 workflow 自己宣告的簽出 path」,不猜別的前綴;RUNNER_TEMP 底下不是簽出的,照原樣判(找不到就紅)。
function workflowCheckoutPaths(f, text) {
  let doc
  try { doc = loadYaml(text) } catch (error) {
    instrumentFailures.push(`${f}:YAML 解析失敗,判不了簽出位置(${String(error.message).split('\n')[0]})`)
    return null
  }
  const paths = new Set()
  for (const job of Object.values(doc?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.uses === 'string' && step.uses.startsWith('actions/checkout@') && typeof step.with?.path === 'string') {
        paths.add(step.with.path.replace(/^\.\//, '').replace(/\/+$/, ''))
      }
    }
  }
  return [...paths].sort((a, b) => b.length - a.length)
}
const normalizeWorkflowLine = (line) => line
  .replace(/\$\{\{\s*github\.workspace\s*\}\}|\$\{GITHUB_WORKSPACE\}|\$GITHUB_WORKSPACE\b/g, 'GITHUB_WORKSPACE')
  .replace(/\$\{\{\s*runner\.temp\s*\}\}|\$\{RUNNER_TEMP\}|\$RUNNER_TEMP\b/g, 'RUNNER_TEMP')
function workflowRefToRepoPath(name, checkoutPaths) {
  const underCheckout = (rest) => checkoutPaths.find((p) => rest.startsWith(`${p}/`))
  let rest = name
  if (rest.startsWith('GITHUB_WORKSPACE/')) rest = rest.slice('GITHUB_WORKSPACE/'.length)
  else if (rest.startsWith('RUNNER_TEMP/')) {
    const afterTemp = rest.slice('RUNNER_TEMP/'.length)
    if (!underCheckout(afterTemp)) return name
    rest = afterTemp
  }
  const p = underCheckout(rest)
  return p ? rest.slice(p.length + 1) : rest
}

// skip self-evidently-non-infra mjs(config / vendor)—— 只用在散文文件。
// 判「是不是 infra 腳本」看**檔名**,不看整條路徑(2026-10-14):先前拿整條路徑比開頭,任何帶目錄的寫法
// (`packages/governance/test/plugin-hook-runtime.test.mjs`、`scripts/check-x.mjs`)開頭都不是這些字 → 整條被略過、
// 從沒驗過存不存在 —— 把裸檔名改寫成完整路徑會「轉綠」,但綠的原因是沒檢查,不是檔案在(M37)。
// workflow 不套這張清單:workflow 裡的 .mjs 就是 CI 要跑(或註解在講 CI 跑)的那支,不需要拿檔名猜它是不是 infra ——
// 2026-10-14 實測 14 支 workflow 共 194 筆 .mjs 引用,檔名開頭對得上這張清單的只有 35 筆,套用就等於八成不檢查。
const INFRA_MJS_NAME = /^(check|sync|audit|dispatch|verify|build|setup|test|deploy|create|lint|score|extract|compose|dogfood|plugin)/

const bucketB = [] // dangling-live(no annotation)= FAIL
const bucketA = [] // annotated-retired = disclosed OK
const seen = new Set()
let workflowCount = 0

for (const f of files) {
  let text
  try { text = readFileSync(join(ROOT, f), 'utf8') } catch (error) {
    instrumentFailures.push(`${f}:讀不到(${error.code ?? error.message}),這一份等於沒掃`)
    continue
  }
  const workflow = isWorkflowFile(f)
  const checkoutPaths = workflow ? workflowCheckoutPaths(f, text) : []
  if (!checkoutPaths) continue
  if (workflow) workflowCount++
  text.split('\n').forEach((raw, i) => {
    const line = workflow ? normalizeWorkflowLine(raw) : raw
    const refs = [...line.matchAll(HOOK_RE), ...line.matchAll(MJS_RE)].map((m) => m[1])
    for (const name of refs) {
      if (!workflow && name.endsWith('.mjs') && !INFRA_MJS_NAME.test(name.split('/').pop())) continue
      const target = workflow ? workflowRefToRepoPath(name, checkoutPaths) : name
      if (resolvesOnDisk(target)) continue
      const key = `${f}:${i + 1}:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      const shown = target === name ? name : `${name}(對到 repo 的 ${target})`
      const entry = { file: f, line: i + 1, name: shown, text: raw.trim().slice(0, 120) }
      if (ANNOTATED.test(raw)) bucketA.push(entry)
      else bucketB.push(entry)
    }
  })
}

console.log('═══════════════════════════════════════════════════')
console.log('▶ Infra-ref integrity(dangling hook/script reference scan)')
console.log(`   Scanned ${files.length} governance docs(其中 workflow ${workflowCount} 支)`)
console.log(`   Bucket A(annotated retired/未實作/folded/不存在 — OK): ${bucketA.length}`)
console.log(`   Bucket B(dangling LIVE — no annotation, FAIL):   ${bucketB.length}`)
console.log('═══════════════════════════════════════════════════')

if (instrumentFailures.length) {
  console.error('\n✗ INSTRUMENT-FAIL —— 掃描本身壞了,下面的計數不代表「沒有懸空引用」:')
  for (const m of instrumentFailures) console.error(`   ${m}`)
  process.exit(1)
}

if (bucketB.length) {
  console.error('\n🚨 Bucket B — dangling LIVE infra refs(修:repoint live 檔 OR 同行加 retired/未實作 標註):')
  for (const e of bucketB) console.error(`   ${e.file}:${e.line}  →  ${e.name}\n      « ${e.text} »`)
}

if (bucketB.length && CHECK) process.exit(1)
console.log(bucketB.length ? '\n⚠️  dangling-live refs present(non-check mode)' : '\n✅ No dangling-live infra refs')
process.exit(0)
