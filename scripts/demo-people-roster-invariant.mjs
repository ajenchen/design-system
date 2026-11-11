#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 全 DS 範例(story / stories-helpers / _demo 檔)裡的人員照片只走照片名冊 stories-helpers/data/people.ts:網址形狀固定為 /<px≤1000>?img=<n>、名冊不引用不合格的臉、同一支檔裡不同人不共用臉、範例只用名冊裡有的名字;consumer 範本(apps/template/src 與其 canonical 副本 ds-canonical/templates)不帶第三方照片網址
 *   紅: 名冊把任一人改成 DEMO_FACE_UNUSABLE 裡的臉、任一 story 寫回 `https://i.pravatar.cc/48?u=…` 字串、同一支檔放兩個同臉的人、或 demoPersonPhoto 傳名冊沒有的名字 → 本閘指名檔案與人名並紅(selftest 逐條合成驗)
 *   綠: 現行樹(名冊 + 全部遷移後的範例)必須綠;selftest 另以合成的合規名冊與合規 story 驗「該放行的會放行」,不靠關鍵字猜
 *
 * ── 為什麼有這支 ──
 *
 * user 2026-11-11:「此外avatar的部分是否可以盡量都用真實圖片？目前的呈現方式也合規，但希望除了 avatar 本身元件與範例之外的範例可以美觀一點」。
 * 之前每支檔自己寫 `https://i.pravatar.cc/48?u=<字串>`,字串雜湊到哪張臉沒人看過:目前登入者 Alan Chen 是女性臉、Alice 是男性鬼臉、
 * 設計原則頁的 Bob Lin 是幼兒、`u=bob` 同時給兩個不同的 Bob。名冊收成一份(M17)之後,這支閘守住「不會有人再手寫一個 ?u=」。
 *
 * ── 範圍 ──
 *
 * - 掃 packages/design-system/src 下的 *.stories.tsx、stories-helpers/**、元件資料夾裡的 _demo-* 檔。
 * - components/Avatar/** 整個略過:那是 Avatar 元件自己的照片示範,要不要一起換由 user 決定(本閘不替 user 做這個決定)。
 * - 檔案縮圖不是人員頭像(NON_PERSON_FILES):照樣檢查網址形狀與不合格的臉,但不要求對得到名冊。
 * - 「同一支檔」= 該檔自己用到的名字 + 它 import 的 _demo-* 畫面檔用到的名字(同一個畫面);名冊檔本身(person-card / people)不算畫面。
 *   已知看不到的(靜態判法的界線,照實寫):名字從別的資料模組或變數組出來的(非字串字面值、非 SAMPLE_PEOPLE、非 _demo-* 匯入)。
 *   這一半要在瀏覽器端量「同一則 story 畫面上不同 alt 的頭像不得同一個 src」才守得住 —— 2026-11-11 r3 審查列為待補,尚未建閘。
 * - scripts/ 不掃:那裡的 pravatar 網址是測試夾具(例 test-data-table-column-sorting 的排序資料),不是給人看的範例畫面。
 *
 * 用法: node scripts/demo-people-roster-invariant.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = 'packages/design-system/src'
const ROSTER = `${SRC}/stories-helpers/data/people.ts`
const CARD = `${SRC}/stories-helpers/scene/person-card.tsx`
/**
 * consumer 範本:apps/template/src 與 ds-canonical/templates(後者是同一份範本的 canonical 副本,dashboard-app.tsx 與 App.tsx 同內容)。
 * 2026-11-11 r3 審查:原本只掃 apps/template/src(「範本不帶第三方照片網址」拿一個資料夾當代理,M37),ds-canonical/templates 不在範圍。
 */
const TEMPLATES = ['apps/template/src', 'packages/design-system/ds-canonical/templates']
const MAX_IMG = 70
const MAX_PX = 1000

/** 整個略過的路徑前綴(理由逐字寫在這裡)。 */
const EXEMPT_PREFIXES = Object.freeze({
  [`${SRC}/components/Avatar/`]: 'Avatar 元件自己的照片示範;寫死的照片要不要換由 user 決定(2026-11-11 回報 needsUser)',
})
/** 檔案縮圖(不是人員頭像):只查網址形狀與不合格的臉。 */
const NON_PERSON_FILES = Object.freeze({
  [`${SRC}/components/FileItem/file-item.anatomy.stories.tsx`]: '「photo.jpg」檔案縮圖,不是人員頭像',
})

const URL_RE = /https?:\/\/i\.pravatar\.cc[^\s'"`)}]*/g
const SHAPE_RE = /^https:\/\/i\.pravatar\.cc\/(\d+)\?img=(\d+)$/
const HELPER_TEMPLATE = '`https://i.pravatar.cc/${px}?img=${DEMO_PERSON_PHOTO[name]}`'

/** 讀出 `export const NAME = { … } as const` 物件字面值的那一段(到配對的右大括號)。 */
function objectBlock(source, name) {
  const start = source.indexOf(`export const ${name} = {`)
  if (start < 0) return null
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  return null
}

export function parseRoster(source) {
  const photoBlock = objectBlock(source, 'DEMO_PERSON_PHOTO')
  const unusableBlock = objectBlock(source, 'DEMO_FACE_UNUSABLE')
  const photo = new Map()
  const dupNames = []
  for (const m of (photoBlock ?? '').matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([^\s:'"/]+))\s*:\s*(\d+)\s*,/gm)) {
    const name = m[1] ?? m[2] ?? m[3]
    if (photo.has(name)) dupNames.push(name)
    photo.set(name, Number(m[4]))
  }
  const unusable = new Set([...(unusableBlock ?? '').matchAll(/^\s*(\d+)\s*:/gm)].map((m) => Number(m[1])))
  return { photo, unusable, dupNames, hasHelperTemplate: source.includes(HELPER_TEMPLATE), parsed: !!photoBlock && !!unusableBlock }
}

/** SAMPLE_PEOPLE 的 key → 名字(例 ada → Ada Chen)。 */
export function parseSamplePeople(source) {
  const map = new Map()
  for (const m of source.matchAll(/^ {2}(\w+): \{\s*\n\s*name: '([^']+)'/gm)) map.set(m[1], m[2])
  return map
}

/** 一支檔用到的名冊人名(字串字面值完全等於名冊人名 + SAMPLE_PEOPLE.key / 解構)。 */
export function namesInFile(source, roster, samplePeople) {
  const names = new Set()
  for (const m of source.matchAll(/(['"])((?:(?!\1)[^\n\\])+)\1/g)) if (roster.photo.has(m[2])) names.add(m[2])
  for (const m of source.matchAll(/SAMPLE_PEOPLE\.(\w+)/g)) if (samplePeople.has(m[1])) names.add(samplePeople.get(m[1]))
  for (const m of source.matchAll(/const\s*\{([^}]+)\}\s*=\s*SAMPLE_PEOPLE\b/g)) {
    for (const key of m[1].split(',').map((s) => s.split(':')[0].trim())) if (samplePeople.has(key)) names.add(samplePeople.get(key))
  }
  return names
}

function checkUrlShape(url, roster, where, violations) {
  const m = SHAPE_RE.exec(url)
  if (!m) { violations.push(`${where}: 照片網址形狀不對 ${url}(只能是 https://i.pravatar.cc/<px>?img=<n>)`); return }
  const px = Number(m[1])
  const img = Number(m[2])
  if (px < 1 || px > MAX_PX) violations.push(`${where}: 尺寸 ${px} 超出 1–${MAX_PX}(本機替身接不上)`)
  if (img < 1 || img > MAX_IMG) violations.push(`${where}: img=${img} 不存在(pravatar 只有 1–${MAX_IMG})`)
  if (roster.unusable.has(img)) violations.push(`${where}: img=${img} 是不合格的臉(DEMO_FACE_UNUSABLE)`)
}

/**
 * 純函式:給名冊、名錄與一組檔案,回違規清單。
 * files: [{ path, source }](path 相對 repo 根);template: [{ path, source }]
 */
export function check({ rosterSource, cardSource, files, template = [] }) {
  const violations = []
  const roster = parseRoster(rosterSource)
  if (!roster.parsed) return [`${ROSTER}: 讀不到 DEMO_PERSON_PHOTO / DEMO_FACE_UNUSABLE(量具失效,不是放行)`]
  if (roster.photo.size === 0) return [`${ROSTER}: 名冊是空的(量具失效,不是放行)`]
  if (!roster.hasHelperTemplate) violations.push(`${ROSTER}: demoPersonPhoto 的網址不是 ${HELPER_TEMPLATE}`)
  for (const name of roster.dupNames) violations.push(`${ROSTER}: 「${name}」在名冊出現兩次`)
  for (const [name, img] of roster.photo) {
    if (!Number.isInteger(img) || img < 1 || img > MAX_IMG) violations.push(`${ROSTER}: 「${name}」img=${img} 不存在`)
    if (roster.unusable.has(img)) violations.push(`${ROSTER}: 「${name}」用了不合格的臉 img=${img}(DEMO_FACE_UNUSABLE)`)
  }
  const samplePeople = parseSamplePeople(cardSource)
  for (const [key, name] of samplePeople) if (!roster.photo.has(name)) violations.push(`${CARD}: SAMPLE_PEOPLE.${key}「${name}」不在照片名冊`)

  const byPath = new Map(files.map((f) => [f.path, f]))
  const ownNames = new Map()
  for (const f of files) {
    if (f.path === ROSTER) continue
    if (Object.keys(EXEMPT_PREFIXES).some((p) => f.path.startsWith(p))) continue
    const nonPerson = Object.hasOwn(NON_PERSON_FILES, f.path)
    for (const url of f.source.match(URL_RE) ?? []) {
      if (nonPerson) checkUrlShape(url, roster, f.path, violations)
      else violations.push(`${f.path}: 手寫照片網址 ${url} —— 人員照片一律走 demoPersonPhoto / demoPersonData(名冊 ${ROSTER})`)
    }
    for (const m of f.source.matchAll(/demoPerson(?:Photo|Data)\(\s*(['"])((?:(?!\1).)+)\1(?:\s*,\s*(\d+))?/g)) {
      if (!roster.photo.has(m[2])) violations.push(`${f.path}: 「${m[2]}」不在照片名冊(${ROSTER})`)
      if (m[3] && (Number(m[3]) < 1 || Number(m[3]) > MAX_PX)) violations.push(`${f.path}: 「${m[2]}」尺寸 ${m[3]} 超出 1–${MAX_PX}`)
    }
    if (f.path !== CARD) ownNames.set(f.path, namesInFile(f.source, roster, samplePeople))
  }
  // 同一支檔(+ 它 import 的 _demo-* 畫面檔)裡,不同人不得共用臉
  for (const [path, names] of ownNames) {
    const all = new Set(names)
    const source = byPath.get(path).source
    for (const m of source.matchAll(/from\s+'([^']*\/_demo-[^']+)'/g)) {
      const spec = m[1].startsWith('@/design-system/') ? `${SRC}/${m[1].slice('@/design-system/'.length)}` : join(dirname(path), m[1])
      for (const ext of ['.tsx', '.ts']) { const dep = ownNames.get(`${spec}${ext}`); if (dep) for (const n of dep) all.add(n) }
    }
    const faceOwner = new Map()
    for (const name of all) {
      const img = roster.photo.get(name)
      if (faceOwner.has(img)) violations.push(`${path}: 「${faceOwner.get(img)}」與「${name}」同一張臉 img=${img}(同一支檔 / 同一個畫面裡不同人不共用臉)`)
      else faceOwner.set(img, name)
    }
  }
  for (const f of template) {
    for (const url of f.source.match(URL_RE) ?? []) violations.push(`${f.path}: consumer 範本不放第三方照片網址 ${url}`)
  }
  return violations
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function isScanned(rel) {
  if (!/\.(tsx?|mts)$/.test(rel)) return false
  return rel.includes('.stories.') || rel.includes('/stories-helpers/') || /\/_demo-[^/]+$/.test(rel)
}

function readTree() {
  const files = walk(join(ROOT, SRC)).map((full) => relative(ROOT, full).split('\\').join('/')).filter(isScanned)
    .map((path) => ({ path, source: readFileSync(join(ROOT, path), 'utf8') }))
  const template = TEMPLATES.flatMap((dir) => {
    // 範本資料夾不存在 = 量具失效(不是「沒有違規」):讀不到就丟,不默默回空陣列
    if (!existsSync(join(ROOT, dir))) throw new Error(`demo-people-roster:範本資料夾 ${dir} 不存在(量具失效,不是放行)`)
    return walk(join(ROOT, dir)).filter((f) => /\.(tsx?|css|html)$/.test(f))
      .map((full) => ({ path: relative(ROOT, full).split('\\').join('/'), source: readFileSync(full, 'utf8') }))
  })
  return { rosterSource: readFileSync(join(ROOT, ROSTER), 'utf8'), cardSource: readFileSync(join(ROOT, CARD), 'utf8'), files, template }
}

function selftest() {
  const rosterOk = `export const DEMO_PERSON_PHOTO = {\n  'Ada Chen': 32,\n  'Bob Lin': 8,\n  林雅婷: 44,\n  'Julia Shen': 44,\n} as const\nexport const DEMO_FACE_UNUSABLE = {\n  1: '兩人同框',\n  24: '杯子遮臉',\n} as const\nreturn ${HELPER_TEMPLATE}\n`
  const card = `export const SAMPLE_PEOPLE = {\n  ada: {\n    name: 'Ada Chen',\n  },\n}\n`
  const story = (path, source) => ({ path: `${SRC}/components/X/${path}`, source })
  const A = `${SRC}/components/X/a.stories.tsx`
  const FI = Object.keys(NON_PERSON_FILES)[0]
  // 第三欄:0 = 必須 0 筆;字串 = 必須有一筆「以這個檔名開頭、含這句規則」的違規(紅的是指名的那一條,不是別條剛好紅 —— r3 審查 M37)
  const cases = [
    ['合規名冊 + 合規 story → 綠', { rosterSource: rosterOk, cardSource: card, files: [story('a.stories.tsx', "demoPersonPhoto('Ada Chen', 48); demoPersonData('Bob Lin', 48); SAMPLE_PEOPLE.ada")] }, 0],
    ['跨檔共用臉(林雅婷 / Julia Shen 各在一支檔)→ 綠', { rosterSource: rosterOk, cardSource: card, files: [story('a.stories.tsx', "demoPersonPhoto('林雅婷', 48)"), story('b.stories.tsx', "demoPersonPhoto('Julia Shen', 48)")] }, 0],
    ['名冊引用不合格的臉 → 紅', { rosterSource: rosterOk.replace("'Bob Lin': 8", "'Bob Lin': 24"), cardSource: card, files: [] }, [ROSTER, '「Bob Lin」用了不合格的臉 img=24']],
    ['手寫 ?u= 網址 → 紅', { rosterSource: rosterOk, cardSource: card, files: [story('a.stories.tsx', "src: 'https://i.pravatar.cc/48?u=bob'")] }, [A, '手寫照片網址 https://i.pravatar.cc/48?u=bob']],
    ['同一支檔兩人同臉 → 紅', { rosterSource: rosterOk, cardSource: card, files: [story('a.stories.tsx', "demoPersonPhoto('林雅婷', 48); demoPersonPhoto('Julia Shen', 48)")] }, [A, '「林雅婷」與「Julia Shen」同一張臉 img=44']],
    ['畫面檔(_demo-*)與 import 它的 story 同臉 → 紅', { rosterSource: rosterOk, cardSource: card, files: [story('_demo-helpers.tsx', "demoPersonData('林雅婷', 48)"), story('a.stories.tsx', "import { X } from './_demo-helpers'\ndemoPersonPhoto('Julia Shen', 48)")] }, [A, '「Julia Shen」與「林雅婷」同一張臉 img=44']],
    ['名冊沒有的名字 → 紅', { rosterSource: rosterOk, cardSource: card, files: [story('a.stories.tsx', "demoPersonPhoto('Nobody Here', 48)")] }, [A, '「Nobody Here」不在照片名冊']],
    ['尺寸超過 1000 → 紅', { rosterSource: rosterOk, cardSource: card, files: [story('a.stories.tsx', "demoPersonPhoto('Ada Chen', 1200)")] }, [A, '「Ada Chen」尺寸 1200 超出 1–1000']],
    ['Avatar/** 寫死的照片 → 略過(綠)', { rosterSource: rosterOk, cardSource: card, files: [{ path: `${SRC}/components/Avatar/avatar.stories.tsx`, source: "src: 'https://i.pravatar.cc/80?u=alice-chen'" }] }, 0],
    ['檔案縮圖用合格臉 → 綠', { rosterSource: rosterOk, cardSource: card, files: [{ path: FI, source: "thumbnailSrc: 'https://i.pravatar.cc/112?img=3'" }] }, 0],
    ['檔案縮圖用不合格的臉 → 紅', { rosterSource: rosterOk, cardSource: card, files: [{ path: FI, source: "thumbnailSrc: 'https://i.pravatar.cc/112?img=24'" }] }, [FI, 'img=24 是不合格的臉']],
    ['檔案縮圖網址形狀錯(/128/128)→ 紅', { rosterSource: rosterOk, cardSource: card, files: [{ path: FI, source: "thumbnailSrc: 'https://i.pravatar.cc/128/128?img=3'" }] }, [FI, '照片網址形狀不對']],
    ['consumer 範本帶照片網址 → 紅', { rosterSource: rosterOk, cardSource: card, files: [], template: [{ path: `${TEMPLATES[0]}/App.tsx`, source: "src: 'https://i.pravatar.cc/48?img=5'" }] }, [`${TEMPLATES[0]}/App.tsx`, 'consumer 範本不放第三方照片網址']],
    ['canonical 範本副本(ds-canonical/templates)帶照片網址 → 紅', { rosterSource: rosterOk, cardSource: card, files: [], template: [{ path: `${TEMPLATES[1]}/dashboard-app.tsx`, source: "src: 'https://i.pravatar.cc/48?img=5'" }] }, [`${TEMPLATES[1]}/dashboard-app.tsx`, 'consumer 範本不放第三方照片網址']],
    ['名錄成員不在名冊 → 紅', { rosterSource: rosterOk, cardSource: card.replace('Ada Chen', 'Ghost Person'), files: [] }, [CARD, 'SAMPLE_PEOPLE.ada「Ghost Person」不在照片名冊']],
    ['名冊讀不到(量具失效)→ 紅', { rosterSource: 'export const X = 1', cardSource: card, files: [] }, [ROSTER, '讀不到 DEMO_PERSON_PHOTO / DEMO_FACE_UNUSABLE']],
  ]
  // 範圍本身也要驗:真實樹讀得到兩個範本資料夾(各至少一支檔),否則「沒違規」只是沒掃到
  const tree = readTree()
  const scannedDirs = TEMPLATES.filter((dir) => tree.template.some((f) => f.path.startsWith(`${dir}/`)))
  let failed = 0
  if (scannedDirs.length !== TEMPLATES.length) { failed++; console.error(`✗ 範本掃描範圍:應讀到 ${TEMPLATES.join(' / ')},實際只讀到 ${scannedDirs.join(' / ') || '0 個'}`) }
  else console.log(`✓ 範本掃描範圍讀到 ${TEMPLATES.length} 個資料夾(${tree.template.length} 支檔)`)
  for (const [label, input, want] of cases) {
    const v = check(input)
    const ok = want === 0 ? v.length === 0 : v.some((line) => line.startsWith(`${want[0]}:`) && line.includes(want[1]))
    if (!ok) { failed++; console.error(`✗ ${label}:預期 ${want === 0 ? '0 筆' : `一筆「${want[0]}: …${want[1]}…」`},實得 ${v.length} 筆\n  ${v.join('\n  ')}`) }
    else console.log(`✓ ${label}`)
  }
  if (failed) { console.error(`selftest 失敗 ${failed} / ${cases.length + 1}`); process.exit(1) }
  console.log(`selftest 通過 ${cases.length + 1} / ${cases.length + 1}`)
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const tree = readTree()
    const roster = parseRoster(tree.rosterSource)
    const v = check(tree)
    if (v.length) {
      console.error(`demo-people-roster:${v.length} 筆違規`)
      for (const line of v) console.error(`  ${line}`)
      process.exit(1)
    }
    console.log(`demo-people-roster:通過(名冊 ${roster.photo.size} 人 / ${new Set(roster.photo.values()).size} 張臉,不合格 ${roster.unusable.size} 張;掃 ${tree.files.length} 支範例檔 + ${tree.template.length} 支範本檔)`)
  }
}
