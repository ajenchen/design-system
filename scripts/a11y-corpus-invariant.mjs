#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: a11y 基線(infra/governance/baseline/a11y-baseline.json)的 story 清單 = 這次建置的 story 清單 ——
 *         加 / 刪 / 改名 story 卻沒跑 `npm run a11y:check -- --baseline-write`,在 PR 就紅(總帳 SM4),不用等隔天夜間的
 *         a11y 全掃(a11y-and-size.yml)才在「Storybook corpus differs from the governed a11y baseline」紅。
 *   紅: 兩份清單不同 → 列出少了 / 多出的 story id 與修法,exit 1;`--selftest` 用合成 index.json 證明加一則、刪一則、改名各紅,相同綠。
 *   綠: 兩份逐筆相同(排序後 sha256 相同)。純靜態:只讀 storybook-static/index.json 與基線檔,不開瀏覽器(約 1 秒)。
 *   缺前置: 沒有 storybook-static → MISSING-BUILD exit 2(CI 在 verify-static 的 build-storybook 之後跑,一定有)。
 *   儀器失效(exit 2): index.json 沒有 entries / 0 則 story、基線沒有 _meta.storyIds —— 不讀成通過。
 *
 * 清單的量法與 audit-a11y.mjs 同一份:index.json 裡 type === 'story' 的全部 id,經 scripts/lib/a11y-gate.mjs 的
 * createA11yStoryCorpus 排序去重(基線寫入與 --gate 比對用的也是它)—— 不另寫一份「哪些 story 算數」(M17)。
 *
 * 用法:node scripts/a11y-corpus-invariant.mjs [--static=<dir>] [--selftest]
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createA11yStoryCorpus } from './lib/a11y-gate.mjs'
import { INSTRUMENT_FAIL_MARKER, requireStorybookBuild } from './lib/launch-browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = 'infra/governance/baseline/a11y-baseline.json'
export class InstrumentError extends Error {}

/** index.json 文件 → 排序後的 story id 清單(與 audit-a11y 同一個篩法) */
export function builtStoryIds(indexDocument) {
  if (!indexDocument?.entries || typeof indexDocument.entries !== 'object') throw new InstrumentError('index.json 沒有 entries(建置格式變了)')
  const ids = Object.values(indexDocument.entries).filter((e) => e?.type === 'story').map((e) => e.id)
  if (ids.length === 0) throw new InstrumentError('index.json 裡 0 則 story')
  return createA11yStoryCorpus(ids)
}

/** 基線文件 → 排序後的 story id 清單 */
export function baselineStoryIds(baselineDocument) {
  const ids = baselineDocument?._meta?.storyIds
  if (!Array.isArray(ids) || ids.length === 0) throw new InstrumentError(`${BASELINE} 沒有 _meta.storyIds`)
  return createA11yStoryCorpus(ids)
}

/** 純函式:兩份清單比對 */
export function compareCorpus(built, baseline) {
  if (built.storyIdsSha256 === baseline.storyIdsSha256) return { ok: true, missing: [], unexpected: [] }
  const b = new Set(built.storyIds)
  const s = new Set(baseline.storyIds)
  return { ok: false, missing: baseline.storyIds.filter((id) => !b.has(id)), unexpected: built.storyIds.filter((id) => !s.has(id)) }
}

function selftest() {
  const fails = []
  const expect = (c, m) => { if (!c) fails.push(m) }
  const index = (ids) => ({ v: 5, entries: Object.fromEntries([...ids.map((id) => [id, { id, type: 'story' }]), ['x--docs', { id: 'x--docs', type: 'docs' }]]) })
  const base = { _meta: { storyIds: ['a--one', 'a--two', 'b--three'] } }
  const B = baselineStoryIds(base)
  expect(compareCorpus(builtStoryIds(index(['b--three', 'a--one', 'a--two'])), B).ok, '相同(順序不同、docs 條目不算)→ 綠')
  const added = compareCorpus(builtStoryIds(index(['a--one', 'a--two', 'b--three', 'b--four'])), B)
  expect(!added.ok && added.unexpected.join() === 'b--four' && added.missing.length === 0, '加一則 story 沒重寫基線 → 紅並點名多出的')
  const removed = compareCorpus(builtStoryIds(index(['a--one', 'b--three'])), B)
  expect(!removed.ok && removed.missing.join() === 'a--two' && removed.unexpected.length === 0, '刪一則 story 沒重寫基線 → 紅並點名少了的')
  const renamed = compareCorpus(builtStoryIds(index(['a--one', 'a--2', 'b--three'])), B)
  expect(!renamed.ok && renamed.missing.join() === 'a--two' && renamed.unexpected.join() === 'a--2', '改名 → 一少一多都點名')
  let threw = 0
  for (const bad of [{}, { entries: {} }, { entries: { d: { id: 'd', type: 'docs' } } }]) { try { builtStoryIds(bad) } catch (e) { if (e instanceof InstrumentError) threw += 1 } }
  try { baselineStoryIds({ _meta: {} }) } catch (e) { if (e instanceof InstrumentError) threw += 1 }
  expect(threw === 4, `儀器失效四種(沒有 entries / 0 則 / 只有 docs / 基線沒有 storyIds)都要丟 InstrumentError,實得 ${threw}`)
  return fails
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    const fails = selftest()
    if (fails.length) { console.error(`✗ a11y-corpus selftest:\n  ${fails.join('\n  ')}`); process.exit(1) }
    console.log('✓ a11y-corpus selftest:加一則 / 刪一則 / 改名各紅並點名,相同綠,四種儀器失效不讀成通過')
    return
  }
  const staticDir = resolve(ROOT, args.find((a) => a.startsWith('--static='))?.slice('--static='.length) ?? 'storybook-static')
  requireStorybookBuild(join(staticDir, 'index.json'))
  try {
    const built = builtStoryIds(JSON.parse(readFileSync(join(staticDir, 'index.json'), 'utf8')))
    if (!existsSync(join(ROOT, BASELINE))) throw new InstrumentError(`找不到 ${BASELINE}`)
    const baseline = baselineStoryIds(JSON.parse(readFileSync(join(ROOT, BASELINE), 'utf8')))
    const r = compareCorpus(built, baseline)
    if (!r.ok) {
      console.error(`✗ a11y 基線的 story 清單(${baseline.storyIds.length} 則)≠ 這次建置(${built.storyIds.length} 則):`)
      for (const id of r.missing) console.error(`  − 基線有、建置沒有:${id}`)
      for (const id of r.unexpected) console.error(`  + 建置有、基線沒有:${id}`)
      console.error('修:加 / 刪 / 改名 story 後跑 `npm run build-storybook && npm run a11y:check -- --baseline-write`,把新基線跟這次改動一起 commit(commit 訊息寫為什麼)。')
      process.exit(1)
    }
    console.log(`✓ a11y-corpus:基線與建置的 story 清單相同(${built.storyIds.length} 則)`)
  } catch (e) {
    if (e instanceof InstrumentError) { console.error(`${INSTRUMENT_FAIL_MARKER} a11y-corpus:${e.message}`); process.exit(2) }
    throw e
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
