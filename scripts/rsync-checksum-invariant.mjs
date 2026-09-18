#!/usr/bin/env node
/**
 * 不變式:**任何 `rsync -a` 都必須帶 `--checksum`。**
 *
 * `rsync -a` 的預設判斷是「檔案大小 + mtime 秒數」。兩者都相同就整個跳過,不看內容。
 * 這在「重生同一份檔、只換掉等長欄位」的場景下必然踩雷,而且**完全沒有錯誤訊息**。
 *
 * 錨例二:
 *   2026-07-28 —— 失敗記憶索引首次記錄(等長同秒被跳過)。
 *   2026-09-18 beta.134 —— consumer mirror 的 `package-lock.json`:換版號後與舊版
 *     **完全等長**(`0.1.0-beta.133`→`134`、resolved URL、integrity base64 三者都是固定長度;
 *     實測 292873 bytes 不變),clone 與生成又落在同一秒 → rsync 靜默跳過 → lock 沒進 commit →
 *     consumer 的 `npm ci` 才炸(lock 釘 beta.133、package.json 要 beta.134)。
 *     上游那支 `✓ lock pins the exact released version` 還是綠的,因為它驗的是來源那份、
 *     不是真的被複製過去的那份 —— 綠燈驗錯對象,比沒有綠燈更騙人。
 *
 * 規則有了、也在三個地方被遵守,但第四個地方漏掉,靠人記不住。本檔把它機械化。
 *
 * 掃描範圍:`.github/workflows/**.yml` + `scripts/**.mjs` + `infra/**`(含 shell 與 execFileSync 兩種寫法)。
 * 逃生口:同一行或前一行寫 `rsync-checksum-allow:<理由>`(例如來源與目的檔名不同、
 * 或刻意要 mtime 快速判斷的大量同步),會被跳過並列進報表。
 *
 * **只看會執行的程式行,不看註解**:本檔自己的說明就含 `rsync -a` 字樣,不跳過註解的話
 * 這支會抓到自己(2026-09-18 第一版就是這樣,而且對照組還因此「紅」了 —— 假綠的變形)。
 *
 * 對照組 `--selftest`:掃描清單裡加一個**合成檔**,內容是一行不帶 `--checksum` 的 `rsync -a`;
 * 必須紅,而且紅的必須是那個合成檔(只看「有沒有紅」會被任何誤判矇混過去)。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const ROOTS = ['.github/workflows', 'scripts', 'infra']
const EXT = /\.(ya?ml|mjs|js|sh)$/

const walk = (dir, out = []) => {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue
    const full = join(dir, name)
    let info
    try { info = statSync(full) } catch { continue }
    if (info.isDirectory()) walk(full, out)
    else if (EXT.test(name)) out.push(full)
  }
  return out
}

const SELF = fileURLToPath(import.meta.url)
// 量具自己不掃:它的說明與對照組用的字串常數都含 `rsync -a`,不排除就會抓到自己
//(2026-09-18:第一版抓到自己的註解,修完又抓到自己的合成字串)。
const files = ROOTS.flatMap((r) => walk(join(ROOT, r))).filter((f) => resolve(f) !== SELF)
const SYNTHETIC = '<selftest>/synthetic-rsync.sh'
const SYNTHETIC_TEXT = 'rsync -a --delete "$src/" "$dst/"\n'
const violations = []
const allowed = []
let scanned = 0

// `rsync` 後面接的旗標:shell 是 `rsync -a --delete …`,Node 是 execFileSync('rsync', ['-a', …])。
// 兩種都要認,所以看「這一行(含續行)裡有沒有 -a / --archive,以及有沒有 --checksum / -c」。
const RSYNC_LINE = /(^|[^\w-])rsync(\b|['"])/
const HAS_ARCHIVE = /(^|[\s,'"[])-a(\b|['"])|--archive/
const HAS_CHECKSUM = /--checksum|(^|[\s,'"[])-c(\b|['"])/
const ALLOW = /rsync-checksum-allow:/

// 註解行不算(本檔自己的說明就含 `rsync -a`)
const isComment = (line) => /^\s*(#|\/\/|\*|\/\*)/.test(line)

const targets = SELFTEST ? [...files, SYNTHETIC] : files
for (const file of targets) {
  const text = file === SYNTHETIC ? SYNTHETIC_TEXT : readFileSync(file, 'utf8')
  if (!/rsync/.test(text)) continue
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (isComment(line)) continue
    if (!RSYNC_LINE.test(line)) continue
    scanned += 1
    // Node 寫法的旗標可能在下一行,合併往後看兩行一起判
    const window = [line, lines[i + 1] || '', lines[i + 2] || ''].filter((l) => !isComment(l)).join(' ')
    if (!HAS_ARCHIVE.test(window)) continue
    const context = [lines[i - 1] || '', line].join(' ')
    if (ALLOW.test(context)) { allowed.push(`${relative(ROOT, file)}:${i + 1}`); continue }
    if (!HAS_CHECKSUM.test(window)) violations.push({ file: file === SYNTHETIC ? SYNTHETIC : relative(ROOT, file), line: i + 1, text: line.trim().slice(0, 120) })
  }
}

console.log(`掃描 ${files.length} 個檔,找到 ${scanned} 處 rsync 呼叫`)
if (allowed.length) console.log(`明示豁免:${allowed.join(', ')}`)
for (const v of violations) console.log(`  ✗ ${v.file}:${v.line} —— rsync -a 沒帶 --checksum\n      ${v.text}`)

if (SELFTEST) {
  const 抓到合成 = violations.some((v) => v.file === SYNTHETIC)
  const 其他誤判 = violations.filter((v) => v.file !== SYNTHETIC)
  if (其他誤判.length) { console.log(`\n✗ selftest:除了合成檔還誤判了 ${其他誤判.length} 處 —— 量具太鬆`); process.exit(1) }
  if (抓到合成) { console.log('\n✓ selftest:合成的「rsync -a 沒帶 --checksum」被抓到,量具會紅'); process.exit(0) }
  console.log('\n✗ selftest:合成違規沒被抓到 —— 這支是假綠,不能當證據')
  process.exit(1)
}
if (scanned === 0) { console.log('\n✗ 一處 rsync 都沒掃到 —— 這支等於沒跑'); process.exit(1) }
if (violations.length > 0) { console.log(`\n✗ ${violations.length} 處 rsync -a 缺 --checksum(等長同秒會被靜默跳過)`); process.exit(1) }
console.log('\n✓ 所有 rsync -a 都帶 --checksum')
process.exit(0)
