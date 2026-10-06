#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: story-layer-drift-invariant 這支棘輪在該紅的時候真的會紅、該綠的時候綠,而且它的綠燈來自真的掃到東西
 *         (2026-10-01 全樹 213 個 story:展示 81 / 設計原則 66 / 設計規格 66、數百顆 Button、上千段 class 字串),不是儀器壞掉後的空集合。
 *   紅: 閘的 --selftest 任一格不符 → 本測試紅;把 selftest 的儀器換成壞的(分類器永遠說 micro / 永遠說不是 micro、
 *       字級集合讀成空的)selftest 必須自己回 false;在重建後的 Rating 原文裡把送出鈕改回「給分前停用」必須在那一行紅;
 *       真檔突變:tag.principles 拿掉 `@story-counter-example` → 那一行紅;同一段連標記搬進展示層 → 仍紅;
 *       time-picker.anatomy 的 h4 標題改回 div → (c) 在那一行紅;
 *       spec 出處行(typography.spec.md:43、sidebar.spec.md:264、story-rules.md「三層定位」:15-17 /「Technical probe visibility」等)被改掉、
 *       ci.yml 出現 --write-baseline、CI 不再呼叫 test:story-layer-drift → 紅;
 *       「基準不得比 base 寬」以 HEAD 那棵樹的真資料走:多記一筆 / 替新檔預留 → 紅,反例標記多 → 只列 review;--base 打錯 → 儀器失效;
 *       基準裡出現「還沒輪到的九個資料夾」以外的漂移數字(反例標記 / 逃生口放行除外)→ 紅;任一個 story 標記引用的 `*.spec.md:N` 指到不存在的檔或
 *       超出檔尾、或 2026-10-01 掃除標記最常引用的那幾行(layoutSpace.spec.md :113 :140 :165–:168 :176、tag.spec.md:230、
 *       file-item.spec.md:264、category-templates.md:168)內容被改掉 → 紅。
 *       CLI 接線端到端(2026-10-06 審查:13 個突變只碰純函式,把「有新增就紅」改成 if (false) 沒有任何檢查發現):在臨時 git repo
 *       (閘 + 分類器 + 字級 token + 出處原文 + 三層各一支夾具 story,基準由閘自己寫、提交成 base)裡跑 runCli 與真的 `node 閘`:
 *       乾淨 → 0;三層各注入一筆 → 1(展示層那筆同時驗 gap-x / inline style margin / cn() 參數都被點名);數字一致的手改基準
 *       (+1、合法指紋、totals 跟著加)對 base → 1;格式不合的基準 → 1;CI 沒有 base → 2;掃到 0 個 story → 2;
 *       @submit-intent 出處原文被拿掉 → 2;CI 裡數字變少卻沒收緊基準 → 1(本機 → 0);新增一個逃生口放行 → 1、--write-baseline 後 → 0。
 *   綠: selftest 全過;全樹對已提交的基準沒有新增、基準格式合法;全樹一次判與逐檔判的結果逐筆相同;
 *        送出鈕用 useFormValidation 自己的 submitDisabled 時 0 筆。判定函式直接 import 呼叫;子行程只有被測閘自己叫的分類器、
 *        臨時 repo 的 git,以及兩次真的 `node scripts/story-layer-drift-invariant.mjs`(驗進入點那一行)。不讀時間、不開瀏覽器,重複跑結果相同。
 */
// meta-test for story-layer-drift-invariant —— 兩面對照,主角是 82f24938 的原版 Rating「送出評分流程」與重建後的 Rating。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, globSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  BASELINE_PATH,
  COUNTER_KEY,
  ESCAPE_KEY,
  COUNTER_EXAMPLE_SOURCES,
  SUBMIT_INTENTS,
  runCli,
  InstrumentError,
  RATING_STORY,
  REPO,
  RULES,
  SELF,
  analyzeSource,
  auditBaselineAgainstBase,
  compareWithBaseline,
  listScope,
  loadInstruments,
  readBaseline,
  LAYERS,
  layerOf,
  resolveBase,
  scanTree,
  selftest,
  treeAtCommit,
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
  assert.deepEqual(validateBaseline(baseline, { scope: listScope() }), [])
  const { perFile, counterPerFile, escapePerFile, stats } = scanTree({ instruments })
  // 下限取 2026-10-01 實測(213 檔:展示 81 / 原則 66 / 規格 66)往下留餘裕;glob 或分層壞掉時會掉到遠低於這裡
  assert.ok(stats.files >= 180 && stats.buttons >= 300 && stats.classStrings >= 3000, `掃描量太少,儀器可能壞了:${JSON.stringify(stats)}`)
  for (const [layer, n] of Object.entries(stats.layers)) assert.ok(n >= 50, `${LAYERS[layer].label}只掃到 ${n} 檔,範圍可能壞了:${JSON.stringify(stats.layers)}`)
  for (const [rel, hits] of perFile) for (const h of hits) assert.ok(LAYERS[layerOf(rel)].rules.includes(h.rule), `${rel}:${h.line} ${h.rule} 不在 ${LAYERS[layerOf(rel)].label}的範圍,卻被算成命中`)
  const { increases, decreases } = compareWithBaseline(perFile, baseline, counterPerFile, escapePerFile)
  assert.deepEqual(increases.map((i) => `${i.file} ${i.rule} ${i.before}→${i.after}`), [])
  // CI 不准留鬆的基準:已提交的基準必須剛好等於實測(數字變少要在同一個 PR 收緊)
  assert.deepEqual(decreases.map((d) => `${d.file} ${d.rule} ${d.before}→${d.after}`), [], '已提交的基準比實測鬆 —— 跑 --write-baseline 收緊')
})

check('「基準不得比 base 寬」用真資料走一遍:git 讀得到 HEAD 那棵樹;HEAD 實測 → 基準多記一筆就紅、替新檔預留就紅', () => {
  const head = resolveBase(REPO, ['--base=HEAD'], {})
  assert.ok(head && /^[0-9a-f]{40}$/.test(head.mergeBase), `--base=HEAD 應解析成一個 commit,實得 ${JSON.stringify(head)}`)
  assert.throws(() => resolveBase(REPO, ['--base=no-such-ref-for-story-layer-drift-control'], {}), InstrumentError, '明確指定的 base 打錯 = 儀器失效(不退回別的 ref)')
  const tree = treeAtCommit(REPO, head.mergeBase)
  assert.ok(tree.hasGate && tree.files.length >= 150, `HEAD 那棵樹應有這支閘與 ≥ 150 個 story,實得 ${tree.files.length}`)
  // 讀出來的原文 = git 裡的 blob(對照組:任挑一檔與 git show 比)
  const sample = tree.files.find((f) => f.endsWith('rating.stories.tsx'))
  assert.equal(tree.read(sample), spawnSync('git', ['show', `${head.mergeBase}:${sample}`], { cwd: REPO, encoding: 'utf8' }).stdout)
  const measured = scanTree({ instruments, files: tree.files, read: tree.read })
  // 從 HEAD 實測直接建出來的基準:剛好不寬 → 0 筆
  const exact = JSON.parse(JSON.stringify({ files: Object.fromEntries([...measured.perFile].map(([rel, hs]) => [rel, Object.fromEntries(Object.keys(RULES).map((r) => [r, { count: hs.filter((h) => h.rule === r).length }]).filter(([, v]) => v.count))])) }))
  assert.deepEqual(auditBaselineAgainstBase(exact, measured).problems, [])
  // 突變 1:同一份多記一筆(數字一致的手改)→ 紅,指名那一檔
  const [rel, entry] = Object.entries(exact.files)[0]
  const rule = Object.keys(entry)[0]
  const plus = structuredClone(exact)
  plus.files[rel][rule].count += 1
  assert.deepEqual(auditBaselineAgainstBase(plus, measured).problems.map((pr) => `${pr.file} ${pr.key}`), [`${rel} ${rule}`])
  // 突變 2:替 HEAD 沒有的檔預留額度 → 紅
  const reserve = structuredClone(exact)
  reserve.files['packages/design-system/src/components/Future/future.stories.tsx'] = { 'hardcoded-spacing': { count: 3 } }
  assert.equal(auditBaselineAgainstBase(reserve, measured).problems.length, 1)
  // 突變 3:反例標記比 HEAD 多 → 只進 review,不擋(它要隨基準檔送審,數字由棘輪鎖)
  const counter = structuredClone(exact)
  counter.files['packages/design-system/src/components/Tag/tag.principles.stories.tsx'] = { [COUNTER_KEY]: { count: 9 } }
  const audit = auditBaselineAgainstBase(counter, measured)
  assert.ok(audit.problems.length === 0 && audit.review.length === 1, JSON.stringify(audit))
})

// 2026-10-01 掃除時另有工作進行、留待下一輪的九個資料夾。下一輪掃完後這份清單清空,基準裡就不准再有任何漂移數字(只剩反例標記)。
const NOT_YET_SWEPT = ['Field', 'Rating', 'TreeView', 'Steps', 'AgentPanel', 'Dialog', 'Sheet', 'Toast', 'Button'].map((d) => `packages/design-system/src/components/${d}/`)
const RELEASED = new Set([COUNTER_KEY, ESCAPE_KEY])
check('基準只剩「還沒輪到的九個資料夾」的漂移;其他檔在基準裡只准出現被標記放行的數字(反例標記 / 逃生口)', () => {
  const stray = []
  for (const [rel, entry] of Object.entries(baseline.files)) {
    if (NOT_YET_SWEPT.some((dir) => rel.startsWith(dir))) continue
    for (const [key, v] of Object.entries(entry)) if (!RELEASED.has(key) && v.count > 0) stray.push(`${rel} ${key} ${v.count}`)
  }
  assert.deepEqual(stray, [], '掃過的檔不得在基準裡留漂移數字(改用 token 或在該行寫逃生口 / 反例標記)')
  // 對照組:同一份基準替一個掃過的檔記 1 筆 → 上面那條必須抓得到
  const probe = structuredClone(baseline)
  probe.files['packages/design-system/src/components/Tag/tag.stories.tsx'] = { 'hardcoded-spacing': { count: 1, hits: ['0123456789ab'] } }
  const caught = Object.entries(probe.files).filter(([rel, entry]) => !NOT_YET_SWEPT.some((dir) => rel.startsWith(dir)) && Object.entries(entry).some(([key, v]) => !RELEASED.has(key) && v.count > 0))
  assert.equal(caught.length, 1, '對照組沒被抓到 —— 這條檢查本身壞了')
})

check('全樹一次判(檔與檔之間墊空白行)與逐檔判,結果逐筆相同', () => {
  // 三層都要有:原則層的分類器候選行會跟展示層接在同一份裡判,規格層不送候選行
  const files = ['packages/design-system/src/components/Dialog/dialog.stories.tsx', 'packages/design-system/src/components/Field/field.stories.tsx', RATING_STORY, 'packages/design-system/src/components/FileItem/file-item.stories.tsx',
    'packages/design-system/src/components/Field/field.principles.stories.tsx', 'packages/design-system/src/components/ScrollArea/scroll-area.principles.stories.tsx', 'packages/design-system/src/components/TimePicker/time-picker.anatomy.stories.tsx']
  const batch = scanTree({ instruments, files }).perFile
  for (const rel of files) {
    const single = analyzeSource(rel, readFileSync(join(REPO, rel), 'utf8'), instruments).hits
    assert.deepEqual(keys(batch.get(rel) ?? []), keys(single), `${rel} 一次判與逐檔判不同`)
  }
})

const TAG_PRINCIPLES = 'packages/design-system/src/components/Tag/tag.principles.stories.tsx'
const TAG_SHOWCASE = 'packages/design-system/src/components/Tag/tag.stories.tsx'
check('突變:真檔 tag.principles 拿掉 @story-counter-example → 那一行紅;同一份原文當展示層看 → 標記不算數、仍紅並說明', () => {
  const text = readFileSync(join(REPO, TAG_PRINCIPLES), 'utf8')
  const lines = text.split('\n')
  const markerAt = lines.findIndex((l) => l.includes('@story-counter-example:')) + 1
  assert.ok(markerAt > 0, `${TAG_PRINCIPLES} 找不到 @story-counter-example(被改寫了?請更新本突變的錨點)`)
  assert.deepEqual(analyzeSource(TAG_PRINCIPLES, text, instruments).hits, [], `${TAG_PRINCIPLES} 目前應 0 筆`)
  const stripped = [...lines.slice(0, markerAt - 1), ...lines.slice(markerAt)].join('\n')
  const hits = analyzeSource(TAG_PRINCIPLES, stripped, instruments).hits
  assert.deepEqual(keys(hits), [`hardcoded-spacing@${markerAt}`], '拿掉反例標記後,原本被標的那一行(上移一行)應紅')
  const asShowcase = analyzeSource(TAG_SHOWCASE, text, instruments).hits.filter((h) => h.line === markerAt + 1)
  assert.ok(asShowcase.length === 1 && asShowcase[0].note?.includes('只在設計原則層'), `同一份原文當展示層看,被標的那一行應仍紅並說明,實得 ${JSON.stringify(asShowcase)}`)
})

const TIME_PICKER_ANATOMY = 'packages/design-system/src/components/TimePicker/time-picker.anatomy.stories.tsx'
check('突變:真檔 time-picker.anatomy 的 h4 標題改回 div → (c) 在那一行紅;規格層的寫死間距照樣 0 筆', () => {
  const text = readFileSync(join(REPO, TIME_PICKER_ANATOMY), 'utf8')
  const lines = text.split('\n')
  const at = lines.findIndex((l) => /<h4 className="text-h6 font-semibold[^"]*">[^<]+<\/h4>/.test(l)) + 1
  assert.ok(at > 0, `${TIME_PICKER_ANATOMY} 找不到單行 h4 標題(被改寫了?請更新本突變的錨點)`)
  assert.deepEqual(analyzeSource(TIME_PICKER_ANATOMY, text, instruments).hits, [], `${TIME_PICKER_ANATOMY} 目前應 0 筆`)
  lines[at - 1] = lines[at - 1].replace('<h4 ', '<div ').replace('</h4>', '</div>')
  assert.deepEqual(keys(analyzeSource(TIME_PICKER_ANATOMY, lines.join('\n'), instruments).hits), [`div-heading@${at}`])
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
    ['packages/design-system/src/components/Field/form-validation.spec.md', 146, 'disabled-until-dirty'],
    // (c) 不收 span 的出處:chrome 文字(workspace brand / user name)明文用 span + text-body-lg font-medium
    ['packages/design-system/src/components/Sidebar/sidebar.spec.md', 264, 'text-body-lg font-medium'],
    // test-only 不在範圍的出處
    ['packages/design-system/ds-canonical/rules/story-rules.md', 50, 'Technical probe visibility'],
    // 三層各收哪些規則的出處(檔頭「範圍」逐行引用 :15-17)
    ['packages/design-system/ds-canonical/rules/story-rules.md', 15, '| 1 展示 | `*.stories.tsx`'],
    ['packages/design-system/ds-canonical/rules/story-rules.md', 16, '| 2 設計規格 | `*.anatomy.stories.tsx`'],
    ['packages/design-system/ds-canonical/rules/story-rules.md', 17, '| 3 設計原則 | `*.principles.stories.tsx`'],
    // @story-counter-example 綁的第二句出處(do/don't 只住 principles)
    ['packages/design-system/ds-canonical/skills/story-writing/references/category-templates.md', 168, "do/don't 對照放 showcase(屬 principles)"],
    // 2026-10-01 掃除留下的 @layout-space-magic-ok 標記最常引用的幾行(右欄「刻意固定」的各類 + 判準一句話)
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 113, '同範疇 / bundled'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 140, '緊密相關(同一組值的起迄)'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 165, '同質 list 的列間距'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 166, 'micro / icon / 控件內部'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 167, '為視覺平衡 / 對稱 刻意調的值'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 168, '元件自身刻意固定'],
    ['packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md', 176, '判準一句話'],
    ['packages/design-system/src/components/Tag/tag.spec.md', 230, 'Tag 與 Tag 之間：`gap-1`'],
    ['packages/design-system/src/components/FileItem/file-item.spec.md', 264, 'compact form `gap-1`'],
  ]
  for (const [rel, n, needle] of cites) assert.ok(line(rel, n).includes(needle), `${rel}:${n} 應含「${needle}」,實得「${line(rel, n).slice(0, 80)}」`)
  for (const rule of Object.values(RULES)) if (rule.owner.includes('.spec.md:')) assert.match(rule.owner, /spec\.md:\d+/)
})

check('story 標記引用的每一個 `*.spec.md:N` 都指得到(檔在、行號沒超出檔尾)', () => {
  const specs = new Map()
  for (const f of globSync('packages/design-system/**/*.spec.md', { cwd: REPO })) {
    const name = f.split('/').pop()
    specs.set(name, [...(specs.get(name) ?? []), f])
  }
  const dangling = []
  let cites = 0
  for (const rel of listScope()) {
    const text = readFileSync(join(REPO, rel), 'utf8')
    for (const m of text.matchAll(/@(?:layout-space-magic-ok|story-counter-example):[^\n]*/g)) {
      for (const c of m[0].matchAll(/([A-Za-z][\w-]*\.spec\.md):(\d+)(?:-(\d+))?/g)) {
        cites++
        const candidates = specs.get(c[1]) ?? []
        const last = Number(c[3] ?? c[2])
        if (!candidates.length) dangling.push(`${rel}:${c[0]}(找不到 ${c[1]})`)
        else if (!candidates.some((f) => readFileSync(join(REPO, f), 'utf8').split('\n').length >= last)) dangling.push(`${rel}:${c[0]}(超出檔尾)`)
      }
    }
  }
  assert.ok(cites >= 300, `標記引用太少(${cites}),掃描可能壞了`)
  assert.deepEqual(dangling, [])
  // 對照組:一個指到檔尾之外的引用必須被抓到
  const fake = '{/* @layout-space-magic-ok: 夾具(layoutSpace.spec.md:99999) */}'
  const m = [...fake.matchAll(/([A-Za-z][\w-]*\.spec\.md):(\d+)/g)][0]
  assert.ok(!(specs.get(m[1]) ?? []).some((f) => readFileSync(join(REPO, f), 'utf8').split('\n').length >= Number(m[2])), '對照組(:99999)應被判為超出檔尾')
})


// ── CLI 接線端到端(臨時 git repo)──────────────────────────────────────────────
// 閘的檔案、分類器、字級 token、出處原文照真檔複製;三層各一支夾具 story;node_modules 用 symlink(typescript / tailwindcss)。
const FIXTURE_FILES = [
  SELF,
  'packages/design-system/ds-canonical/hooks/lib/_provider_paths.sh',
  'packages/design-system/ds-canonical/hooks/lib/_micro_geometry.sh',
  'packages/design-system/src/tokens/utility-registry.json',
  'packages/design-system/src/tokens/typography/typography.css',
  ...new Set([...Object.values(SUBMIT_INTENTS).map((d) => d.spec), ...COUNTER_EXAMPLE_SOURCES.map((d) => d.spec)]),
]
const FX = {
  showcase: 'packages/design-system/src/components/Demo/demo.stories.tsx',
  principles: 'packages/design-system/src/components/Demo/demo.principles.stories.tsx',
  anatomy: 'packages/design-system/src/components/Demo/demo.anatomy.stories.tsx',
}
const FX_SOURCE = {
  [FX.showcase]: [
    "import { Button } from '@/design-system/components/Button/button'",
    'export const Demo = () => (',
    '  <div className="flex flex-col gap-[var(--layout-space-loose)]">',
    '    <h3 className="text-h6 font-semibold">建立專案</h3>',
    '    <div className="flex flex-col gap-12">舊的寫死間距(基準記 1 筆)</div>',
    '    <Button variant="primary">建立</Button>',
    '  </div>',
    ')',
    '',
  ].join('\n'),
  [FX.principles]: [
    'export const Rule = () => (',
    '  <div className="flex flex-col gap-[var(--layout-space-loose)]">',
    '    {/* @layout-space-magic-ok: 夾具 —— 刻意固定的 16px 樣本卡內距 */}',
    '    <div className="rounded-md border p-4">樣本卡</div>',
    '  </div>',
    ')',
    '',
  ].join('\n'),
  [FX.anatomy]: [
    'export const Overview = () => (',
    '  <div className="flex flex-col gap-6">',
    '    <h4 className="text-h6 font-semibold">量測</h4>',
    '    <Inspector />',
    '  </div>',
    ')',
    '',
  ].join('\n'),
}
const fxGit = (dir, ...args) => {
  const r = spawnSync('git', ['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} 失敗:${r.stderr}`)
  return r.stdout
}
function createFixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'story-layer-drift-cli-'))
  assert.ok(dir && readdirSync(dir).length === 0, 'mkdtemp 失敗')
  for (const rel of FIXTURE_FILES) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    cpSync(join(REPO, rel), join(dir, rel))
  }
  for (const [rel, text] of Object.entries(FX_SOURCE)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  writeFileSync(join(dir, 'package.json'), '{ "name": "story-layer-drift-fixture", "private": true }\n')
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n')
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
  fxGit(dir, 'init', '-q', '-b', 'work')
  const sink = []
  assert.equal(runCli({ repo: dir, argv: ['--write-baseline'], env: {}, out: (l) => sink.push(l), err: (l) => sink.push(l) }), 0, sink.join('\n'))
  fxGit(dir, 'add', '-A')
  fxGit(dir, 'commit', '-q', '-m', 'base')
  return dir
}
const fxRun = (dir, argv, env = {}) => {
  const lines = []
  const code = runCli({ repo: dir, argv, env, out: (l) => lines.push(l), err: (l) => lines.push(l) })
  return { code, text: lines.join('\n') }
}
const fxReset = (dir) => { fxGit(dir, 'checkout', '-q', '--', '.'); fxGit(dir, 'clean', '-fdq') }
const fxEdit = (dir, rel, from, to) => {
  const text = readFileSync(join(dir, rel), 'utf8')
  assert.ok(text.includes(from), `夾具 ${rel} 找不到「${from}」`)
  writeFileSync(join(dir, rel), text.replace(from, to))
}

const fixture = createFixtureRepo()
try {
  check('CLI 接線:乾淨的臨時 repo → 0;基準是閘自己寫的(展示層舊間距 1 筆、原則層逃生口 1 筆)', () => {
    const r = fxRun(fixture, ['--base=HEAD'])
    assert.equal(r.code, 0, r.text)
    const doc = JSON.parse(readFileSync(join(fixture, BASELINE_PATH), 'utf8'))
    assert.equal(doc.files[FX.showcase]?.['hardcoded-spacing']?.count, 1, JSON.stringify(doc.files))
    assert.equal(doc.files[FX.principles]?.[ESCAPE_KEY]?.count, 1, JSON.stringify(doc.files))
  })

  check('CLI 接線:三層各注入一筆新漂移 → 1;展示層那筆的 gap-x / inline style margin / cn() 參數都被點名', () => {
    fxEdit(fixture, FX.showcase, '    <Button variant="primary">建立</Button>',
      '    <div className="flex gap-x-6" style={{ margin: 24 }}><span className={cn(\'p-6\')}>新卡片</span></div>\n    <Button variant="primary">建立</Button>')
    const show = fxRun(fixture, ['--base=HEAD'])
    assert.equal(show.code, 1, show.text)
    for (const token of ['gap-x-6', 'style.margin:24', 'p-6']) assert.ok(show.text.includes(token), `展示層注入的 ${token} 沒被點名:\n${show.text}`)
    fxReset(fixture)
    fxEdit(fixture, FX.principles, '    <div className="rounded-md border p-4">樣本卡</div>', '    <div className="rounded-md border p-4">樣本卡</div>\n    <div className="flex flex-col gap-8">新的寫死間距</div>')
    assert.equal(fxRun(fixture, ['--base=HEAD']).code, 1, '原則層注入應紅')
    fxReset(fixture)
    fxEdit(fixture, FX.anatomy, '    <h4 className="text-h6 font-semibold">量測</h4>', '    <div className="text-h6 font-semibold">量測</div>')
    const anat = fxRun(fixture, ['--base=HEAD'])
    assert.ok(anat.code === 1 && anat.text.includes('用 div / p 做標題'), `規格層 div 標題應紅並點名:\n${anat.text}`)
    fxReset(fixture)
  })

  check('CLI 接線:數字一致的手改基準(+1、合法指紋、totals 跟著加)對 base → 1;格式不合 → 1', () => {
    const path = join(fixture, BASELINE_PATH)
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    const loosened = structuredClone(doc)
    loosened.files[FX.showcase]['hardcoded-spacing'].count += 1
    loosened.files[FX.showcase]['hardcoded-spacing'].hits.push('0123456789ab')
    loosened.totals['hardcoded-spacing'] += 1
    writeFileSync(path, `${JSON.stringify(loosened, null, 2)}\n`)
    const r = fxRun(fixture, ['--base=HEAD'])
    assert.ok(r.code === 1 && r.text.includes('基準卻記 2 筆'), `數字一致的手改應被 base 實測擋下:\n${r.text}`)
    const malformed = structuredClone(doc)
    malformed.files[FX.showcase]['hardcoded-spacing'].count = 5
    writeFileSync(path, `${JSON.stringify(malformed, null, 2)}\n`)
    const m = fxRun(fixture, ['--base=HEAD'])
    assert.ok(m.code === 1 && m.text.includes('格式不合'), `格式不合的基準應紅:\n${m.text}`)
    fxReset(fixture)
  })

  check('CLI 接線:CI 找不到 base → 2;掃到 0 個 story → 2;@submit-intent 出處原文被拿掉 → 2', () => {
    const noBase = fxRun(fixture, [], { CI: 'true' })
    assert.ok(noBase.code === 2 && noBase.text.includes('INSTRUMENT-FAIL'), `CI 沒有 base 應儀器失效:\n${noBase.text}`)
    for (const rel of Object.values(FX)) unlinkSync(join(fixture, rel))
    const empty = fxRun(fixture, ['--base=HEAD'])
    assert.ok(empty.code === 2 && empty.text.includes('INSTRUMENT-FAIL'), `0 個 story 應儀器失效:\n${empty.text}`)
    fxReset(fixture)
    const intent = SUBMIT_INTENTS.update
    fxEdit(fixture, intent.spec, intent.quote, '(夾具:這句原文被拿掉)')
    const quote = fxRun(fixture, ['--base=HEAD'])
    assert.ok(quote.code === 2 && quote.text.includes('@submit-intent'), `出處原文不見應儀器失效:\n${quote.text}`)
    fxReset(fixture)
  })

  check('CLI 接線:數字變少卻沒收緊基準 —— CI → 1(延遲誤紅的源頭),本機 → 0;收緊後 CI → 0', () => {
    fxEdit(fixture, FX.showcase, '<div className="flex flex-col gap-12">', '<div className="flex flex-col gap-[var(--layout-space-loose)]">')
    const ci = fxRun(fixture, ['--base=HEAD'], { CI: 'true' })
    assert.ok(ci.code === 1 && ci.text.includes('--write-baseline'), `CI 裡留鬆的基準應紅並指示收緊:\n${ci.text}`)
    assert.equal(fxRun(fixture, ['--base=HEAD']).code, 0, '本機只提示')
    assert.equal(fxRun(fixture, ['--write-baseline']).code, 0)
    const tightened = fxRun(fixture, ['--base=HEAD'], { CI: 'true' })
    assert.equal(tightened.code, 0, tightened.text)
    fxReset(fixture)
  })

  check('CLI 接線:新增一個逃生口放行 → 1(逃生口進棘輪);--write-baseline 隨 PR 送審後 → 0 並列進 review', () => {
    fxEdit(fixture, FX.showcase, '    <Button variant="primary">建立</Button>', '    {/* @layout-space-magic-ok: aaaaaa */}\n    <div className="flex flex-col gap-12">x</div>\n    <Button variant="primary">建立</Button>')
    const r = fxRun(fixture, ['--base=HEAD'])
    assert.ok(r.code === 1 && r.text.includes('被逃生口放行'), `新增的逃生口放行應紅:\n${r.text}`)
    assert.equal(fxRun(fixture, ['--write-baseline']).code, 0)
    const reviewed = fxRun(fixture, ['--base=HEAD'])
    assert.ok(reviewed.code === 0 && reviewed.text.includes('⚠'), `基準已記錄 → 綠,並列進 review:\n${reviewed.text}`)
    fxReset(fixture)
  })

  check('CLI 進入點:真的 `node scripts/story-layer-drift-invariant.mjs` 在臨時 repo —— 乾淨 → 0、注入一筆 → 1', () => {
    // 腳本路徑寫成本檔的字面常數(相對臨時 repo 的 cwd):harness 來源清單要能靜態審查 node 的 script operand,
    // 從別支模組 import 的 SELF 審不到(`Harness source uses unreviewable Node pre-script argv`,2026-10-07 CI 治理套件抓到);
    // 下一行斷言把它綁回 SELF,兩者不得分岔。
    const GATE_CLI = 'scripts/story-layer-drift-invariant.mjs'
    assert.equal(GATE_CLI, SELF)
    const run = () => spawnSync(process.execPath, [GATE_CLI, '--base=HEAD'], { cwd: fixture, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
    const clean = run()
    // 綠燈必須來自真的跑完判定(印出結論),不是進入點沒觸發的 exit 0
    assert.ok(clean.status === 0 && clean.stdout.includes('沒有新增漂移'), `${clean.stdout}\n${clean.stderr}`)
    fxEdit(fixture, FX.showcase, '    <Button variant="primary">建立</Button>', '    <div className="flex flex-col gap-10">x</div>\n    <Button variant="primary">建立</Button>')
    const dirty = run()
    assert.ok(dirty.status === 1 && dirty.stderr.includes('gap-10'), `${dirty.stdout}\n${dirty.stderr}`)
    fxReset(fixture)
  })
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

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
