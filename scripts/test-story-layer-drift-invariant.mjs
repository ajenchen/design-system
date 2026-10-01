#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: story-layer-drift-invariant 這支棘輪在該紅的時候真的會紅、該綠的時候綠,而且它的綠燈來自真的掃到東西
 *         (81 個左右的展示層 story、數百顆 Button、上千段 class 字串),不是儀器壞掉後的空集合。
 *   紅: 閘的 --selftest 任一格不符 → 本測試紅;把 selftest 的儀器換成壞的(分類器永遠說 micro / 永遠說不是 micro、
 *       字級集合讀成空的)selftest 必須自己回 false;在重建後的 Rating 原文裡把送出鈕改回「給分前停用」必須在那一行紅;
 *       spec 出處行(typography.spec.md:43、sidebar.spec.md:264、story-rules.md「Technical probe visibility」等)被改掉、
 *       ci.yml 出現 --write-baseline、CI 不再呼叫 test:story-layer-drift → 紅。
 *   綠: selftest 全過;全樹對已提交的基準沒有新增、基準格式合法;全樹一次判與逐檔判的結果逐筆相同;
 *        送出鈕用 useFormValidation 自己的 submitDisabled 時 0 筆。全部是 import 判定函式直接呼叫 + 讀檔,
 *        不起子行程(分類器由被測的閘自己叫)、不讀時間、不開瀏覽器,重複跑結果相同。
 */
// meta-test for story-layer-drift-invariant —— 兩面對照,主角是 82f24938 的原版 Rating「送出評分流程」與重建後的 Rating。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  BASELINE_PATH,
  RATING_STORY,
  REPO,
  RULES,
  SELF,
  analyzeSource,
  compareWithBaseline,
  loadInstruments,
  readBaseline,
  scanTree,
  selftest,
  validateBaseline,
} from './story-layer-drift-invariant.mjs'

let passed = 0
const check = (label, fn) => { fn(); passed++; console.log(`✓ ${label}`) }
const instruments = loadInstruments()
const quiet = []
const keys = (hits) => hits.map((h) => `${h.rule}@${h.line}`)

check('閘的 --selftest 全過(原版 Rating 三條紅、合成新檔四條各在指定行紅、乾淨檔 0 筆、不合法註記仍紅)', () => {
  const lines = []
  assert.equal(selftest((l) => lines.push(l)), true, lines.join('\n'))
})

check('selftest 不是恆綠:儀器換成壞的,selftest 自己要回 false', () => {
  const allMicro = { ...instruments, classify: () => new Set() }
  const noneMicro = { ...instruments, classify: (_text, lines) => new Set(lines) }
  const blindTypography = { ...instruments, typography: { ...instruments.typography, headingSizes: new Set(), allowed: new Set() } }
  for (const [why, broken] of [['分類器永遠說 micro', allMicro], ['分類器永遠說不是 micro', noneMicro], ['字級集合讀成空的', blindTypography]]) {
    assert.equal(selftest((l) => quiet.push(l), REPO, broken), false, `${why} 時 selftest 應該紅`)
  }
})

const baseline = readBaseline()
check('已提交的基準格式合法,全樹對它沒有新增漂移,而且真的掃到東西', () => {
  assert.ok(baseline, `${BASELINE_PATH} 不存在`)
  assert.deepEqual(validateBaseline(baseline), [])
  const { perFile, stats } = scanTree({ instruments })
  assert.ok(stats.files >= 50 && stats.buttons >= 100 && stats.classStrings >= 500, `掃描量太少,儀器可能壞了:${JSON.stringify(stats)}`)
  const { increases } = compareWithBaseline(perFile, baseline)
  assert.deepEqual(increases.map((i) => `${i.file} ${i.rule} ${i.before}→${i.after}`), [])
})

check('全樹一次判(檔與檔之間墊空白行)與逐檔判,結果逐筆相同', () => {
  const files = ['packages/design-system/src/components/Dialog/dialog.stories.tsx', 'packages/design-system/src/components/Field/field.stories.tsx', RATING_STORY, 'packages/design-system/src/components/FileItem/file-item.stories.tsx']
  const batch = scanTree({ instruments, files }).perFile
  for (const rel of files) {
    const single = analyzeSource(rel, readFileSync(join(REPO, rel), 'utf8'), instruments).hits
    assert.deepEqual(keys(batch.get(rel) ?? []), keys(single), `${rel} 一次判與逐檔判不同`)
  }
})

const ratingNow = readFileSync(join(REPO, RATING_STORY), 'utf8')
const SUBMIT = '<Button type="submit" variant="primary">送出評分</Button>'
check('突變:重建後的 Rating 把送出鈕改回「給分前停用」→ 在那一行紅;改成 hook 自己的 submitDisabled → 不紅', () => {
  const at = ratingNow.split('\n').findIndex((l) => l.includes(SUBMIT)) + 1
  assert.ok(at > 0, `重建後的 Rating 找不到送出鈕 ${SUBMIT}(被改寫了?請更新本突變的錨點)`)
  const reverted = ratingNow.replace(SUBMIT, '<Button type="submit" variant="primary" disabled={form.values.rating === 0}>送出評分</Button>')
  const hits = analyzeSource(RATING_STORY, reverted, instruments).hits.filter((h) => h.rule === 'primary-submit-disabled')
  assert.deepEqual(keys(hits), [`primary-submit-disabled@${at}`])
  const hookState = ratingNow.replace(SUBMIT, '<Button type="submit" variant="primary" disabled={form.submitDisabled}>送出評分</Button>')
  assert.deepEqual(analyzeSource(RATING_STORY, hookState, instruments).hits.filter((h) => h.rule === 'primary-submit-disabled'), [])
})

check('規則出處仍在(spec 行被改掉,閘的說明就會指錯地方)', () => {
  const line = (rel, n) => readFileSync(join(REPO, rel), 'utf8').split('\n')[n - 1] ?? ''
  const cites = [
    ['packages/design-system/src/tokens/typography/typography.spec.md', 43, '視覺標題 ≠ 語義標題'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 306, '元素間 gap 硬寫'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 159, '刻意固定'],
    ['packages/design-system/src/components/Field/form-validation.spec.md', 15, '永遠 enabled'],
    ['packages/design-system/src/components/Field/form-validation.spec.md', 142, 'disabled-until-dirty'],
    // (c) 不收 span 的出處:chrome 文字(workspace brand / user name)明文用 span + text-body-lg font-medium
    ['packages/design-system/src/components/Sidebar/sidebar.spec.md', 264, 'text-body-lg font-medium'],
    // test-only 不在範圍的出處
    ['packages/design-system/ds-canonical/rules/story-rules.md', 50, 'Technical probe visibility'],
  ]
  for (const [rel, n, needle] of cites) assert.ok(line(rel, n).includes(needle), `${rel}:${n} 應含「${needle}」,實得「${line(rel, n).slice(0, 80)}」`)
  for (const rule of Object.values(RULES)) if (rule.owner.includes('.spec.md:')) assert.match(rule.owner, /spec\.md:\d+/)
})

check('CI 只跑判定與 selftest,永遠不跑 --write-baseline', () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts ?? {}
  assert.equal(pkg['test:story-layer-drift'], `node ${SELF} --selftest && node ${SELF}`)
  for (const [name, cmd] of Object.entries(pkg)) assert.ok(!(cmd.includes(SELF) && cmd.includes('--write-baseline')), `package.json ${name} 不得跑 --write-baseline`)
  const workflowsDir = join(REPO, '.github/workflows')
  for (const f of readdirSync(workflowsDir).filter((n) => /\.ya?ml$/.test(n))) {
    assert.doesNotMatch(readFileSync(join(workflowsDir, f), 'utf8'), /story-layer-drift-invariant\.mjs[^\n]*--write-baseline/, `${f} 不得跑 --write-baseline`)
  }
  const ci = readFileSync(join(workflowsDir, 'ci.yml'), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  assert.match(ci, /\n\s+npm run test:story-layer-drift\n/, 'ci.yml 必須呼叫 npm run test:story-layer-drift(註解不算)')
})

console.log(`\n✓ story-layer-drift-invariant meta-test ${passed} 題全過(基準:${Object.entries(baseline.totals).map(([r, n]) => `${r} ${n}`).join(' / ')})`)
