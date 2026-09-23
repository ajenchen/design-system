#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 參考樹重拍時只拍「它自己的 Storybook 真的有」的場景:用參考樹建好的 storybook-static/index.json 過濾今天的
 *        visual-assertions.json,HEAD 新增、參考樹沒有的 story 從清單拿掉並逐一印出(之後由歸因報告標 new-scenario),
 *        外部 url 場景照留;index 讀不到 / 沒有任何 entries / 過濾後一則不剩,一律 exit 1(空清單 = 靜默什麼都沒拍)。
 *   紅: --selftest 用合成 index + 清單驗:缺的 story 會被拿掉、有的與 url 場景會留下;index 空 → 拒絕;全被拿掉 → 拒絕;
 *        任一條不符即 exit 1。
 *   綠: 正式跑:index 可讀且過濾後 ≥ 1 則 → 寫出清單、印「保留 / 拿掉」計數,exit 0;純函式,無時鐘、無取樣。
 *
 * 為什麼(2026-09-23 run #297):區間預覽新增三則 story,參考樹(8/5)沒有它們,今天的清單蓋進去後拍到 story 404
 * → render error 3 → 重拍模式唯一會紅的條件成立 → 整條重拍紅。「HEAD 有、參考沒有」是正常的產品演進,
 * 不是儀器壞掉;參考樹該拍的是它有的東西,差集交給歸因報告。
 *
 * Run:
 *   node scripts/visual-manifest-intersect.mjs --index storybook-static/index.json --manifest scripts/visual-assertions.json --out scripts/visual-assertions.json
 *   node scripts/visual-manifest-intersect.mjs --selftest
 */
import { readFileSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }

/**
 * 純函式:給 index 的 story id 集合與清單,回傳 { kept, dropped }。
 * @param {{entries?: Record<string, unknown>}} index storybook-static/index.json
 * @param {{scenarios: Array<{id?: string, url?: string, file: string}>}} manifest visual-assertions.json
 */
export function intersectManifest(index, manifest) {
  const ids = new Set(Object.keys(index?.entries ?? {}))
  if (ids.size === 0) throw new Error('storybook index 沒有任何 entries —— 參考樹沒建好或路徑錯,拒絕產生空清單')
  const scenarios = Array.isArray(manifest?.scenarios) ? manifest.scenarios : null
  if (!scenarios) throw new Error('visual-assertions.json 沒有 scenarios 陣列')
  const kept = []
  const dropped = []
  for (const scenario of scenarios) {
    if (scenario.url || (scenario.id && ids.has(scenario.id))) kept.push(scenario)
    else dropped.push(scenario)
  }
  if (kept.length === 0) throw new Error('過濾後一則場景都不剩 —— index 與清單對不上(不同 Storybook?),拒絕產生空清單')
  return { kept, dropped }
}

function selftest() {
  let fail = 0
  const ok = (cond, msg) => { if (cond) console.log(`✓ ${msg}`); else { console.log(`✗ ${msg}`); fail++ } }
  const index = { v: 5, entries: { 'a--one': {}, 'b--two': {} } }
  const manifest = { scenarios: [
    { id: 'a--one', file: 'a.png' },
    { id: 'b--two', file: 'b.png', interaction: { action: 'hover', selector: '[x]' } },
    { id: 'c--new-in-head', file: 'c.png' },
    { url: 'https://example.test/page', file: 'd.png' },
  ] }
  const { kept, dropped } = intersectManifest(index, manifest)
  ok(kept.map((s) => s.file).join(',') === 'a.png,b.png,d.png', `有的 story 與 url 場景留下(得 ${kept.map((s) => s.file).join(',')})`)
  ok(dropped.length === 1 && dropped[0].id === 'c--new-in-head', `參考樹沒有的 story 被拿掉(得 ${dropped.map((s) => s.id).join(',')})`)
  ok(JSON.stringify(kept[1]) === JSON.stringify(manifest.scenarios[1]), '留下的場景原封不動(interaction 等欄位不丟)')
  let threw = false
  try { intersectManifest({ entries: {} }, manifest) } catch { threw = true }
  ok(threw, '對照組:index 沒有 entries → 拒絕(否則會拍空清單而綠)')
  threw = false
  try { intersectManifest(index, { scenarios: [{ id: 'zzz--none', file: 'z.png' }] }) } catch { threw = true }
  ok(threw, '對照組:過濾後一則不剩 → 拒絕')
  threw = false
  try { intersectManifest(index, {}) } catch { threw = true }
  ok(threw, '對照組:清單沒有 scenarios → 拒絕')
  console.log(fail ? `✗ ${fail} 項不符` : '✅ visual-manifest-intersect selftest PASS')
  process.exit(fail ? 1 : 0)
}

if (argv.includes('--selftest')) selftest()
else {
  const indexPath = flag('--index'); const manifestPath = flag('--manifest'); const outPath = flag('--out')
  if (!indexPath || !manifestPath || !outPath) { console.error('用法:--index <index.json> --manifest <visual-assertions.json> --out <path> | --selftest'); process.exit(2) }
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const { kept, dropped } = intersectManifest(index, manifest)
  for (const s of dropped) console.log(`  - 參考樹沒有這則 story,不拍(歸因會標 new-scenario):${s.id}`)
  writeFileSync(outPath, `${JSON.stringify({ ...manifest, scenarios: kept }, null, 2)}\n`)
  console.log(`✓ 參考樹場景清單:保留 ${kept.length} / 拿掉 ${dropped.length}(index entries ${Object.keys(index.entries).length})→ ${outPath}`)
}
