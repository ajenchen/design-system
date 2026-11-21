#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 相容政策(`packages/design-system/ds-canonical/references/props-naming.md`「相容政策」;版本判斷的唯一實作
 *         `scripts/lib/compat-policy.mjs`)在 DS 原始碼上成立 —— 0.x / 預發布版改名、移除不留舊名,
 *         取而代之的是變更帳本 `packages/design-system/ds-changes.json` 逐條寫明(隨 npm 出貨,給升版的消費端 —— 通常是 AI —— 照表改;
 *         GitHub Release 的「破壞性變更」段由帳本產生)。
 *         user 2026-11-15:「我認為還是 beta 的狀況下都不要再顧及所有向後相容的部分，確保ds可以如期運作並乾淨才是重點，
 *         反正你發版的時候會有release note,大家自己看release note去更新就好了 …」
 *   紅: NC0 讀不到相容政策(版本號缺 / 不是 semver)。
 *       NC1 政策 = no-compat 時,`packages/design-system/src` 的 .ts / .tsx 有 `@deprecated`(JSDoc 標籤或註解行)——
 *           0.x 不留舊名,標 @deprecated 的轉接 = 相容墊片(例外清單 NC1_EXCEPTIONS 逐筆寫理由,目前 0 筆)。
 *       NC2 `packages/design-system/src` 的程式與規格拿相容當理由:「向後相容 / backward compat / 保留一個版本 / 過渡一版 / 1 cycle /
 *           破壞相容 / 保留相容 / 不影響(不破壞)既有 consumer / 既有 consumer …零影響(不受影響、編譯失敗)/ 遷移期 / legacy pattern /
 *           避免 breaking change」(2026-11-16 補後半;比對字的唯一清單 = COMPAT_RATIONALE,判定表在 --selftest 每字一紅一綠)
 *           (「…」引文除外 —— 那是別人的原話,逐字;同一行指回「相容政策」的除外 —— 那是在講政策本身;
 *           政策 = alias-one-release(1.0 以後的正式版)時,標了 @deprecated 的那一行除外 —— 那是留一版的正規寫法)。
 *       (原 NC3 / NC4「跟上一次發布比,拿掉的成員要登記、發布說明要寫」2026-11-16 併進 scripts/public-surface-invariant.mjs —— 單一一支比整個
 *       公開介面,登記處是變更帳本 packages/design-system/ds-changes.json;本閘只留「原始碼不留舊名、不拿相容當理由」兩條)
 *       → 指名 file:line,exit 1。
 *   綠: NC1 / NC2 都 0 筆。純靜態讀檔,沒有時序或抽樣,同一棵樹重跑結果相同;
 *       不是抽籤的證明 = selftest 對同一份判定邏輯各破一次都會紅,且拿改動前 35508c15 的真實原始碼量得到 NC1 14 筆、NC2 77 行(2026-11-15 本機實跑;NC2 比對字 11-16 又擴充過)。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 讀不到相容政策、掃到 0 個原始碼檔 —— 不讀成通過。
 *   `--selftest`: 政策判定表;NC1 / NC2 合成正反例(每一格明確傳入固定政策 compatPolicyFor('0.1.0-beta.148') / ('1.0.0'),
 *       不讀 repo 現在的版本 —— 版號改成 1.0.0 照樣全綠;讀 repo 那條路只有「量具」一格,不斷言是哪一版);外加真實資料兩格:v0.1.0-beta.148 那一版的原始碼 NC1 必紅並指名 BulkActionBar 的
 *       toolbarAriaLabel(它當時是 @deprecated 轉接),而且同一份原始碼在 1.0 正式版政策下 NC1 不判(政策真的被讀)。
 *   純讀檔(selftest 的真實資料格用 git cat-file 讀 tag),不開瀏覽器、不量時間,機器快慢不影響結果。
 *
 * 用法:node scripts/compat-policy-invariant.mjs [--selftest]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isDirectRun } from './lib/direct-run.mjs'
import { COMPAT_POLICY_TABLE, CompatPolicyError, compatPolicyFor, POLICY_DOC, readCompatPolicy } from './lib/compat-policy.mjs'
import { LEDGER_REPO_PATH } from '../packages/design-system/tools/changes/ledger.mjs'

export class InstrumentError extends Error {}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SRC = 'packages/design-system/src'

/**
 * NC1 的例外(path → 理由):第三方型別透傳等真的必要的 @deprecated。清單只准逐筆加、每筆要寫理由。
 * 目前 0 筆 —— DS 原始碼沒有任何必須保留的 @deprecated。
 */
export const NC1_EXCEPTIONS = new Map()

// ── 共用:檔案收集 ───────────────────────────────────────────────────────────────
const SKIP_DIR = new Set(['node_modules', 'dist', 'storybook-static', '__selftest__'])
function walk(dir, accept, out = []) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return out
  for (const name of readdirSync(abs)) {
    if (name.startsWith('.') || SKIP_DIR.has(name)) continue
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, accept, out)
    else if (accept(rel)) out.push(rel)
  }
  return out
}
const isCode = (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts')
const parse = (path, text) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const lineAt = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1

// ── NC1:@deprecated ───────────────────────────────────────────────────────────────
/** 一個檔裡的 @deprecated:JSDoc 標籤(語法樹)+ 註解行裡的字樣(沒掛在宣告上的也算)。回 [{ line }] */
export function deprecatedMarks(path, text) {
  const lines = new Set()
  const sf = parse(path, text)
  const visit = (node) => {
    for (const tag of ts.getJSDocTags(node)) if (tag.tagName.getText(sf) === 'deprecated') lines.add(lineAt(sf, tag.getStart(sf)))
    ts.forEachChild(node, visit)
  }
  visit(sf)
  text.split('\n').forEach((l, i) => { if (/^\s*(\/\/|\/?\*|\{\s*\/\*)/.test(l) && /@deprecated\b/.test(l)) lines.add(i + 1) })
  return [...lines].sort((a, b) => a - b).map((line) => ({ line }))
}
export function checkNc1(files, policy) {
  if (policy.keepOldNames) return [] // 1.0 以後的正式版:留舊名一個版本是合法的路
  const hits = []
  for (const [p, text] of files) {
    if (!isCode(p) || NC1_EXCEPTIONS.has(p)) continue
    for (const { line } of deprecatedMarks(p, text)) hits.push(`NC1 ${p}:${line} 有 @deprecated —— ${policy.version} 的相容政策是 ${policy.mode}:改名 / 移除不留舊名,直接刪舊名並登記變更帳本 ${LEDGER_REPO_PATH}(${POLICY_DOC})`)
  }
  return hits
}

// ── NC2:拿「向後相容」當理由 ─────────────────────────────────────────────────────────
export const COMPAT_RATIONALE = new RegExp([
  'backward[- ]?compat', 'back[- ]compat', '向後相容', '保留一個版本', '保留一版', '留一個版本', '過渡一版', '1[- ]cycle',
  // 2026-11-16 補(審查 should-fix 第 2 條的漏網:chart.spec.md / empty.tsx / select.spec.md / profile-card.tsx / data-table.tsx …)
  '破壞相容', '保留相容', '(?:不影響|不破壞)既有 ?consumer', '既有 ?consumer[^。\\n]{0,24}(?:零影響|不受影響|編譯失敗)',
  '遷移期', 'legacy pattern', '避免 ?breaking[- ]?change',
].join('|'), 'i')
/**
 * 去掉「…」『…』引文(別人的原話,逐字,M36(a);引文可以跨行,所以整份文字先遮再切行、行數不變)後才比對;
 * 同一行指回「相容政策」(看原文那一行)= 在講政策本身,不算;
 * keepDeprecatedLines(政策 = alias-one-release)時,標了 @deprecated 的那一行 = 留一版的正規寫法,不算。
 */
export function compatRationaleLines(text, { keepDeprecatedLines = false } = {}) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  const own = text.replace(/「[^」]*」/g, blank).replace(/『[^』]*』/g, blank).split('\n')
  const raw = text.split('\n')
  const out = []
  own.forEach((line, i) => {
    if (!COMPAT_RATIONALE.test(line) || raw[i].includes('相容政策')) return
    if (keepDeprecatedLines && /@deprecated\b/.test(raw[i])) return
    out.push({ line: i + 1, text: raw[i].trim().slice(0, 120) })
  })
  return out
}
export function checkNc2(files, policy) {
  if (!policy || typeof policy.keepOldNames !== 'boolean') throw new CompatPolicyError('NC2 沒有拿到相容政策 —— 不知道 @deprecated 那一行算不算留一版的正規寫法(不是放行)')
  const hits = []
  for (const [p, text] of files) {
    if (!/\.(ts|tsx|md)$/.test(p)) continue
    for (const h of compatRationaleLines(text, { keepDeprecatedLines: policy.keepOldNames })) hits.push(`NC2 ${p}:${h.line} 拿「向後相容 / 保留一版」當理由:${h.text} —— 預設值寫它的設計理由(寫不出來就列成待 user 決定的預設值問題);改名紀錄寫「已移除」並指回 ${POLICY_DOC}`)
  }
  return hits
}

// ── git 讀 tag ───────────────────────────────────────────────────────────────────
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...opts })
/** tag 上某幾個資料夾的檔(cat-file --batch 一次讀完) */
function filesAt(ref, dirs, accept) {
  const list = git(['ls-tree', '-r', '--name-only', ref, '--', ...dirs], { encoding: 'utf8' }).split('\n').filter((p) => p && accept(p))
  const out = new Map()
  if (!list.length) return out
  const buf = git(['cat-file', '--batch'], { input: list.map((p) => `${ref}:${p}`).join('\n') + '\n' })
  let off = 0
  for (const p of list) {
    const nl = buf.indexOf(10, off)
    const header = buf.toString('utf8', off, nl)
    if (header.endsWith(' missing')) { off = nl + 1; continue }
    const size = Number(header.split(' ')[2])
    out.set(p, buf.toString('utf8', nl + 1, nl + 1 + size))
    off = nl + 1 + size + 1
  }
  if (out.size !== list.length) throw new InstrumentError(`cat-file 只讀回 ${out.size}/${list.length} 個檔(${ref})`)
  return out
}
const readWorking = (dirs, accept) => new Map(dirs.flatMap((d) => walk(d, accept)).map((p) => [p, readFileSync(join(ROOT, p), 'utf8')]))
export function check() {
  const policy = readCompatPolicy(ROOT)
  const srcFiles = readWorking([SRC], (p) => /\.(ts|tsx|md)$/.test(p))
  if (srcFiles.size === 0) throw new InstrumentError(`${SRC} 掃到 0 個檔 —— 掃描範圍壞了(請在 repo 根目錄執行)`)
  const problems = [...checkNc1(srcFiles, policy), ...checkNc2(srcFiles, policy)]
  return { policy, problems, srcCount: srcFiles.size }
}

// ── selftest ─────────────────────────────────────────────────────────────────────
function selftest() {
  const fails = []
  const expect = (c, m) => { if (!c) fails.push(m) }
  const beta = compatPolicyFor('0.1.0-beta.148')
  const stable = compatPolicyFor('1.0.0')
  // 政策判定表(唯一實作 lib/compat-policy.mjs)
  for (const [v, mode] of COMPAT_POLICY_TABLE) expect(compatPolicyFor(v).mode === mode, `政策:${v} 應判成 ${mode},實得 ${compatPolicyFor(v).mode}`)
  for (const bad of ['', 'beta', '1.0', '01.0.0']) {
    let threw = false
    try { compatPolicyFor(bad) } catch (e) { threw = e instanceof CompatPolicyError }
    expect(threw, `政策:「${bad}」不是 semver,應丟例外(讀不到不得當成某一種政策)`)
  }
  // 量具(唯一一格讀 repo):正式檢查用的 readCompatPolicy(ROOT) 讀得到、判出來的 = package.json 版本號直接判的。
  // 用途只有證明讀版本那條路沒壞;不斷言 repo 是哪一版(版號改成 1.0.0 這一格照樣綠)。其餘每一格都明確傳入 beta / stable。
  {
    const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'packages/design-system/package.json'), 'utf8')).version
    let live = null
    try { live = readCompatPolicy(ROOT) } catch { live = null }
    expect(live !== null && live.version === pkgVersion && live.mode === compatPolicyFor(pkgVersion).mode, `量具:readCompatPolicy 讀到的 ${live ? `${live.version} / ${live.mode}` : '(讀不到)'} 應等於 package.json 的 ${pkgVersion} 判出來的政策`)
  }

  // NC1
  const depSrc = "export interface TagProps {\n  removeAriaLabel?: string\n  /** @deprecated 改名為 removeAriaLabel */\n  dismissLabel?: string\n}\n// @deprecated 舊的接法\nexport const note = 'x @deprecated y'\n"
  const nc1 = checkNc1(new Map([['packages/design-system/src/components/Tag/tag.tsx', depSrc]]), beta)
  expect(nc1.length === 2 && nc1.some((h) => h.includes('tag.tsx:3')) && nc1.some((h) => h.includes('tag.tsx:6')), `NC1:JSDoc 標籤與註解行各一筆、字串裡的字樣不算,實得 ${JSON.stringify(nc1)}`)
  expect(checkNc1(new Map([['packages/design-system/src/components/Tag/tag.tsx', depSrc]]), stable).length === 0, 'NC1:1.0 正式版政策下不判(留一個版本是合法的路)')
  expect(checkNc1(new Map([['packages/design-system/src/components/Tag/tag.tsx', 'export interface TagProps { removeAriaLabel?: string }\n']]), beta).length === 0, 'NC1:沒有 @deprecated 不應紅')

  // NC2
  const nc2 = checkNc2(new Map([
    ['packages/design-system/src/components/X/x.tsx', "  /** 預設 false(backward compat)。 */\n  // Back-compat:舊寫法仍 work\n"],
    ['packages/design-system/src/components/X/x.spec.md', '舊名保留一個版本(@deprecated)。\n過渡一版後移除。\n'],
    ['packages/design-system/src/components/Y/y.spec.md', 'user 原話:「我認為還是 beta 的狀況下都不要再顧及所有向後相容的部分」\n舊名已移除(0.x 相容政策,props-naming.md「相容政策」):先前寫保留一版。\n寬度模式:hug / fill。\n'],
    // 跨行引文(field-types.ts 那種:「…\n// 舊名字保留一個版本,畫面不變。」)
    ['packages/design-system/src/components/Z/z.ts', '// 選項原文:「寬度一律叫 width;\n// 舊名字保留一個版本,畫面不變。」):欄位家族的 width 多收數字\n'],
  ]), beta)
  expect(nc2.length === 4 && nc2.every((h) => /X\/x\./.test(h)), `NC2:x.tsx 兩行 + x.spec.md 兩行紅;y.spec.md 的引文 / 指回政策的句子 / 一般句子、z.ts 的跨行引文不紅,實得 ${JSON.stringify(nc2)}`)
  // NC2 比對字判定表(2026-11-16 補的字):每個字一格該紅(拿它當理由)、一格對照不紅(長得像但不是 / 引文 / 指回政策)
  const NC2_TABLE = [
    ['破壞相容', true, '`--color-{key}` 照慣例保留(改名會破壞相容)。'],
    ['破壞相容', false, '破壞性變更登記在變更帳本(ds-changes.json)。'],
    ['保留相容', true, '| `md` | 保留相容階梯,不作新用例預設 |'],
    ['保留相容', false, '審查原文:「保留相容階梯」—— 引文不算。'],
    ['不影響既有 consumer', true, '預設 false,不影響既有 consumer。'],
    ['不影響既有 consumer', false, '錯誤列自動長高,其他列不影響高度。'],
    ['不破壞既有 consumer', true, 'DEV warn 提示,但 production 不破壞既有 consumer。'],
    ['不破壞既有 consumer', false, 'boolean primitive 不破壞 memo identity。'],
    ['既有 consumer 零影響', true, '不傳 = 內部 uncontrolled,既有 consumer 零影響。'],
    ['既有 consumer 零影響', false, '改動前後量過:畫面零影響(0px 差)。'],
    ['既有 consumer…不受影響', true, '都沒傳 → children 原樣(既有 consumer 自己排的寫法不受影響)。'],
    ['既有 consumer…不受影響', false, '其他沒錯誤的列維持固定高度,不受影響。'],
    ['既有 consumer…編譯失敗', true, '收窄型別會讓既有 consumer(含 work-management)編譯失敗。'],
    ['既有 consumer…編譯失敗', false, '型別錯就編譯失敗,這正是要的(0.x 照相容政策直接改)。'],
    ['遷移期', true, '這是遷移期 forgiving 行為:DEV warn。'],
    ['遷移期', false, 'Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)'],
    ['legacy pattern', true, '// consumer 透過 fields 傳 default key label(legacy pattern)'],
    ['legacy pattern', false, "bom.upgradeProtocol.legacyEntryMode === 'one-time-reviewed-full-snapshot-pr'"],
    ['避免 breaking change', true, '**Conservative path**:token 不刪(避免 breaking change 與 stories 維護成本)。'],
    ['避免 breaking change', false, '`Spinner` 元件已廢除並遷至本元件。Breaking change:import 路徑改了。'],
  ]
  for (const [word, red, text] of NC2_TABLE) {
    const got = checkNc2(new Map([['packages/design-system/src/components/W/w.spec.md', `${text}\n`]]), beta).length > 0
    expect(got === red, `NC2「${word}」:${red ? '該紅' : '不該紅'},實得${got ? '紅' : '綠'} —— ${text}`)
  }
  for (const word of new Set(NC2_TABLE.map(([w]) => w))) {
    const rows = NC2_TABLE.filter(([w]) => w === word)
    expect(rows.some(([, r]) => r) && rows.some(([, r]) => !r), `NC2「${word}」判定表要一紅一綠都有`)
  }
  // NC2 × 相容政策:1.0 正式版下,標了 @deprecated 的那一行(留一版的正規寫法)不判;0.x 照判;沒有 @deprecated 的「保留一版」說法兩種政策都判
  const legit10 = new Map([['packages/design-system/src/components/Tag/tag.tsx', '  /** @deprecated 改用 removeAriaLabel;保留一個版本,下一版刪 */\n']])
  expect(checkNc2(legit10, stable).length === 0, 'NC2:1.0 正式版政策下,標了 @deprecated 的「保留一個版本」那一行不判')
  expect(checkNc2(legit10, beta).length === 1, 'NC2:同一行在 0.x 政策下照判(0.x 不留舊名)')
  expect(checkNc2(new Map([['packages/design-system/src/components/Tag/tag.spec.md', '舊名保留一個版本,下一版刪。\n']]), stable).length === 1, 'NC2:1.0 政策下沒有 @deprecated 的「保留一個版本」照判 —— 放行只限 @deprecated 那一行')
  let nc2NoPolicy = false
  try { checkNc2(legit10) } catch (e) { nc2NoPolicy = e instanceof CompatPolicyError }
  expect(nc2NoPolicy, 'NC2:沒傳政策要丟例外(不得當成某一種政策放行)')

  // 真實資料:v0.1.0-beta.148 的原始碼(tag 上的 commit,永久不變)—— BulkActionBar 的 toolbarAriaLabel 當時是 @deprecated 轉接
  const ANCHOR = 'v0.1.0-beta.148'
  try {
    const anchorFiles = filesAt(ANCHOR, [`${SRC}/components/BulkActionBar`], isCode)
    const real = checkNc1(anchorFiles, beta)
    expect(real.some((h) => h.includes('bulk-action-bar.tsx')), `真實資料:${ANCHOR} 的 bulk-action-bar.tsx(toolbarAriaLabel @deprecated)NC1 必紅,實得 ${JSON.stringify(real)}`)
    expect(checkNc1(anchorFiles, stable).length === 0, `真實資料:同一份原始碼在 1.0 正式版政策下 NC1 不判 —— 政策真的被讀`)
  } catch (e) {
    fails.push(`${e instanceof InstrumentError ? '儀器失效' : '例外'}:真實資料那一段跑不完(${ANCHOR};簽出要 fetch-depth: 0 帶 tag)—— ${String(e.message).split('\n')[0]}`)
  }
  return fails
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    const fails = selftest()
    if (fails.length) { console.error(`✗ compat-policy selftest:\n  ${fails.join('\n  ')}`); process.exit(1) }
    console.log('✓ compat-policy selftest:政策判定表(0.x / 預發布 = no-compat、1.0 以後 = 留一版、不是 semver 丟例外);NC1 JSDoc 與註解行各紅、字串不算、正式版不判;NC2 理由句紅、引文 / 指回政策不紅、每個比對字一紅一綠、1.0 政策下 @deprecated 那一行放行而 0.x 照判;量具一格讀 repo 版本但不斷言是哪一版;beta.148 真實原始碼 NC1 必紅且正式版政策下不判')
    return
  }
  try {
    const r = check()
    for (const p of r.problems) console.error(`✗ ${p}`)
    if (r.problems.length) { console.error(`\n✗ compat-policy:${r.problems.length} 筆(相容政策 ${r.policy.mode} / ${r.policy.version})\n  規則:${POLICY_DOC}`); process.exit(1) }
    console.log(`✓ compat-policy:相容政策 ${r.policy.mode}(${r.policy.version});NC1 / NC2 掃 ${r.srcCount} 個檔 0 筆(公開介面的破壞性變更登記由 scripts/public-surface-invariant.mjs 把關)`)
  } catch (e) {
    if (e instanceof InstrumentError || e instanceof CompatPolicyError) { console.error(`INSTRUMENT-FAIL compat-policy:${e.message}`); process.exit(2) }
    throw e
  }
}
if (isDirectRun(import.meta.url)) main()
