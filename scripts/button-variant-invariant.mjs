#!/usr/bin/env node
/**
 * Button 變體規則閘(靜態)—— 2026-09-08
 *
 * 規則來源(逐字):
 *   button.spec.md:12  「主要 action / CTA。**必 explicit `variant="primary"`,不靠預設**」
 *   button.spec.md:204 「`primary` + `danger` | 立即且不可逆」;:205「`secondary` + `danger` | 還有一層確認」
 *   button.spec.md:415 「`danger` 僅支援 primary / secondary / text —— tertiary + danger 靜默渲染成一般 tertiary」
 *   button.tsx defaultVariants:沒給 variant 的 labeled Button = tertiary(2026-06-06 起)
 *   dialog.principles.stories.tsx:209「確認類動作用 primary…primary 在最右」;:229「刪除 / 永久移除等動作用 primary + danger」
 *
 * 2026-09-08 user 抓到:確認框的「刪除」`<Button danger>` 沒給 variant → 渲成灰色 tertiary;Dialog footer 的「儲存」吃預設 → tertiary。
 * 全 DS 之前沒有任何機械防線守這條(hook 60/60 零 headroom,所以做成 CI 靜態閘 + registry 早警)。
 *
 * 斷言(掃 packages/design-system/src 下所有 *.stories.tsx):
 *   R1 `danger` 必附 explicit variant(primary / secondary / text);
 *   R2 *Footer(Dialog / Sheet / Popover / Surface)內的按鈕:非「取消 / 關閉 / 返回」語意的動作鈕必明寫 variant(吃預設就是 9/8 那顆「儲存」
 *      變灰的根因);primary **最多一顆**(button.spec.md:180「每個操作區最多一個」、:407),有的話必是 footer 內最後一顆 Button。
 *      2026-09-09 收窄:首版寫「恰一顆」比規範嚴 —— 規範自己的「儲存草稿(secondary)/放棄變更(secondary danger)」配對(button.spec.md:218-219)
 *      沒有 primary 也合法;世界級(Polaris `primaryAction?` 可省略、Carbon passive modal 無動作鈕、Apple 單鈕 Done)皆「最多一顆、可無」。
 *      user 9/9 原話:「footer必須給 一顆primary 是否太硬？預設應該給一個？」
 *   R3 footer 已有非 danger 的 primary(= confirm / cancel 型 footer)時,不得再放 danger 鈕:記錄級的破壞動作走 header actions 槽
 *      (dialog.spec.md:107-113)。首版「非 primary 的 danger 一律紅」同樣比規範嚴(會誤判上述配對),9/9 一併收窄。
 * 對照組:`--selftest` 用內建的錯誤片段跑同一套解析,必須紅;另附合法片段必須綠(0 primary 的正負配對、只有「關閉」的 footer)。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = join(REPO, 'packages/design-system/src')
const SELFTEST = process.argv.includes('--selftest')
const DISMISS = /^(取消|關閉|返回|稍後|Cancel|Close|Back|Later|Dismiss)$/

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (n.endsWith('.stories.tsx')) out.push(p)
  }
  return out
}

/** 逐個 `<Button` 標籤解析:找到對應的 `>`(跳過 {…} 與字串),回傳 props 原文與 children 文字。 */
function buttons(src) {
  const out = []
  const re = /<Button\b/g
  let m
  while ((m = re.exec(src))) {
    let i = m.index + 7, depth = 0, q = null
    for (; i < src.length; i++) {
      const ch = src[i]
      if (q) { if (ch === q && src[i - 1] !== '\\') q = null; continue }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue }
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    const props = src.slice(m.index + 7, i)
    const selfClosing = props.trimEnd().endsWith('/')
    let text = ''
    if (!selfClosing) {
      const close = src.indexOf('</Button>', i)
      text = src.slice(i + 1, close === -1 ? i + 1 : close).replace(/\{[^}]*\}/g, '').replace(/<[^>]+>/g, '').trim()
    }
    const line = src.slice(0, m.index).split('\n').length
    out.push({ index: m.index, line, props, text, variant: (props.match(/\bvariant=["']([a-z]+)["']/) || [])[1] ?? (/\bvariant=\{/.test(props) ? 'dynamic' : undefined), danger: /\bdanger\b/.test(props), iconOnly: /\biconOnly\b/.test(props), dismiss: /\bdismiss\b/.test(props) })
  }
  return out
}

function check(src, file) {
  const findings = []
  const all = buttons(src)
  for (const b of all) {
    if (b.danger && !b.variant) findings.push(`${file}:${b.line} R1 \`danger\` 沒給 variant → 渲成灰色 tertiary(button.spec.md:415);確認框的立即刪除用 variant="primary" danger,會再確認的用 secondary danger`)
  }
  // R2:footer 區段
  const fre = /<(Dialog|Sheet|Popover|Surface)Footer\b[^>]*>([\s\S]*?)<\/\1Footer>/g
  let f
  while ((f = fre.exec(src))) {
    const inner = f[2]
    const bs = buttons(inner).filter((b) => !b.iconOnly && !b.dismiss)
    const actionable = bs.filter((b) => !DISMISS.test(b.text))
    if (actionable.length === 0) continue
    const primaries = bs.filter((b) => b.variant === 'primary')
    const line = src.slice(0, f.index).split('\n').length
    // R2(a) 動作鈕必明寫 variant:吃預設 = 靜默變成 tertiary 灰鈕(button.spec.md:12「必 explicit,不靠預設」);取消 / 關閉可吃預設(預設就是 tertiary)。
    for (const b of actionable) if (!b.variant) findings.push(`${file}:${b.line} R2 ${f[1]}Footer 的動作鈕「${b.text}」沒寫 variant → 吃預設變成灰色 tertiary(button.spec.md:12 主要動作必 explicit primary;次要動作明寫 secondary)`)
    // R2(b) primary 最多一顆(button.spec.md:180 / :407);有的話在最右(dialog.spec.md:215 / dialog.principles:209)。0 顆合法(正負配對 spec:218-219、純資訊框)。
    if (primaries.length > 1) findings.push(`${file}:${line} R2 ${f[1]}Footer 有 ${primaries.length} 顆 primary(button.spec.md:180「每個操作區最多一個」、:407)`)
    else if (primaries.length === 1 && bs[bs.length - 1].variant !== 'primary') findings.push(`${file}:${line} R2 ${f[1]}Footer 的 primary 不在最右(dialog.spec.md:215 / dialog.principles:209)`)
    // R3(2026-09-09 user 抓到:任務 modal 的「刪除任務」放在 footer 當 secondary danger):confirm / cancel 型的 footer(已有非 danger 的 primary)
    // 不得再放 danger 鈕 —— 記錄級的破壞性動作(刪除這筆記錄)走 header actions slot 的 icon-only 鈕(dialog.spec.md:107-113「操作對象是 dialog 承載的記錄本身」)。
    // 沒有 primary 的正負配對(儲存草稿 / 放棄變更 secondary danger)與確認框的 primary danger 都合法。
    const hasPlainPrimary = primaries.some((b) => !b.danger)
    if (hasPlainPrimary) for (const b of bs) if (b.danger) findings.push(`${file}:${b.line} R3 ${f[1]}Footer 已有 primary「${primaries.find((x) => !x.danger).text}」卻又放 danger 鈕「${b.text}」:記錄級的破壞動作走 header actions 的 icon-only 鈕(dialog.spec.md:107-113),footer 只放 confirm / cancel`)
  }
  return findings
}

if (SELFTEST) {
  const bad = `
<DialogFooter>
  <Button variant="tertiary">取消</Button>
  <Button danger onClick={() => x('>')}>刪除</Button>
</DialogFooter>
<DialogFooter><Button>儲存</Button></DialogFooter>
<DialogFooter>
  <Button variant="secondary" danger>刪除任務</Button>
  <Button variant="secondary">取消</Button>
  <Button variant="primary">儲存</Button>
</DialogFooter>
`
  const good = `
<DialogFooter>
  <Button variant="secondary">儲存草稿</Button>
  <Button variant="secondary" danger>放棄變更</Button>
</DialogFooter>
<DialogFooter><Button variant="tertiary">關閉</Button></DialogFooter>
<DialogFooter>
  <Button variant="tertiary">取消</Button>
  <Button variant="primary" danger>永久刪除</Button>
</DialogFooter>
<DialogFooter>
  <Button>取消</Button>
  <Button variant="primary">儲存</Button>
</DialogFooter>
`
  const f = check(bad, 'selftest.stories.tsx')
  const g = check(good, 'selftest-good.stories.tsx')
  // bad:R1 ×1(danger 無 variant)、R2 ×2(儲存吃預設 + 第一片的「刪除」吃預設)、R3 ×1(有 primary 儲存卻放 secondary danger 刪除任務)
  const ok = f.filter((x) => x.includes('R1')).length === 1 && f.filter((x) => x.includes('R2')).length === 2 && f.filter((x) => x.includes('R3')).length === 1 && g.length === 0
  console.log(ok ? '✓ selftest:danger 無 variant、動作鈕吃預設、confirm 型 footer 再放 danger 都被抓到;0 primary 的正負配對 / 只有關閉 / 確認框 primary danger 都不誤報' : '✗ selftest 不符\n' + [...f, ...g.map((x) => '(誤報)' + x)].join('\n'))
  process.exit(ok ? 0 : 1)
}

let total = 0
const findings = []
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')
  total += buttons(src).length
  findings.push(...check(src, relative(REPO, file)))
}
for (const x of findings) console.log('✗ ' + x)
console.log(findings.length ? `✗ ${findings.length} 條違規(掃 ${total} 顆 Button)` : `✓ Button 變體規則:${total} 顆全部合規`)
process.exit(findings.length ? 1 : 0)
