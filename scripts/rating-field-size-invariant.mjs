#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Rating 的尺寸模型逐字符合 rating.spec.md「Size」——(1) 元件只有內容高:根節點**沒有** `h-field-*` / `min-h-field-*` 容器 class,
 *         列高交給所在的列(Field 槽 / 表格 / 列);(2) 尺寸解析序:consumer 明傳 size 最優先 → Field 明確指定的 size → 表格 surface size →
 *         預設 md(Field 內外同一個預設,同 Switch / Checkbox);(3) 沒有 xs:執行期傳 'xs'(JS consumer / 舊 d.ts)映到 sm 並 dev-warn。
 *   紅: 任一格的 `data-size` 與判定表不符、根節點帶容器高度 class、或缺 data-size → exit 1,指名那一格。
 *       歷史紅燈:2026-07-29 `b644488f` 改 useResolvedFieldSize 優先序後,Rating 無條件 fallback 'xs' → Field 內沒指定 size 的評分
 *       靜默變 xs 兩個月;2026-09-27 抓到(user:「用field的地方一定要照規定吧？」「反正就是要遵照 field 的設計原則」),同日 xs 整個退役、
 *       容器高改成內容高(user:「我反而覺得其跟 switch 和 checkbox 十分接近的邏輯」)。
 *   綠: 九格全部符合判定表且沒有容器 class。`--selftest`:判定函式吃「有人把 fallback 改回 'sm'」的形狀必紅並指名 fieldDefault / standalone;
 *       吃「有人把 h-field-md 加回根節點」的形狀必紅;吃正確形狀必綠;空結果每格都紅;且探針分得出 sm / md / lg(對照組:standaloneSm → sm、fieldLg → lg)。
 *   量法: esbuild 把 TSX 探針打包成 node 可跑的 CJS(css 當空模組),react-dom/server 靜態渲染,讀根節點(role=slider / role=img)的
 *         `data-size` 與 class。純靜態、與瀏覽器 / 建置無關,重複跑結果恆等。幾何(Field 槽置中)不在本閘,由 visual-assertions 與基準圖看。
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ESBUILD = path.join(ROOT, 'node_modules', '.bin', 'esbuild')

/** 判定表:每格要保證的性質(逐字)→ 根節點 data-size。 */
export const EXPECTED = {
  fieldDefault: 'md',      // <Field> 沒指定 size → md(Field 預設;spec「Field 內跟 Field size」)
  fieldReadonly: 'md',     // <Field mode="readonly"> 沒指定 size → 唯讀精簡版仍 md
  fieldSm: 'sm',           // <Field size="sm"> → sm
  fieldLg: 'lg',           // <Field size="lg"> → lg
  fieldSmExplicitLg: 'lg', // <Field size="sm"> 內明傳 lg → lg(prop 最優先)
  standalone: 'md',        // Field 外沒傳 size → md(同 Switch / Checkbox;沒有 standalone 專用預設)
  standaloneSm: 'sm',      // Field 外明傳 sm → sm
  surfaceLg: 'lg',         // 表格 surface size lg、無 Field → lg(field-context surface-size 序)
  fieldInSurfaceLg: 'md',  // surface lg 裡再包一個沒指定 size 的 Field → Field 預設 md 先於 surface(field-context 解析序;實務 cell 不包 Field,邊界格)
  runtimeXs: 'sm',         // 執行期傳 'xs'(型別已拒,JS 仍可能傳)→ 映到 sm
}
const CONTAINER_CLASS = /\b(?:min-)?h-field-(?:xs|sm|md|lg)\b/

/** 純函式:拿到「每格根節點 {size, cls}」→ 回傳不符的格。呼叫端與 selftest 都消費這一支(M37:判斷式只有一份)。 */
export function judge(results) {
  const failures = []
  for (const [key, want] of Object.entries(EXPECTED)) {
    const r = results[key]
    if (!r || typeof r !== 'object') { failures.push(`${key}: 沒量到根節點`); continue }
    if (typeof r.size !== 'string' || !r.size) failures.push(`${key}: 根節點缺 data-size`)
    else if (r.size !== want) failures.push(`${key}: 期望 data-size=${want},實際 ${r.size}`)
    if (typeof r.cls === 'string' && CONTAINER_CLASS.test(r.cls)) failures.push(`${key}: 根節點仍帶容器高度 class(${r.cls.match(CONTAINER_CLASS)[0]})—— 元件只能有內容高`)
  }
  return failures
}

const PROBE = `
import { renderToStaticMarkup } from 'react-dom/server'
import { Rating } from '@/design-system/components/Rating/rating'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { FieldSurfaceSizeProvider } from '@/design-system/components/Field/field-context'

function root(html: string): { size: string | null; cls: string | null } | null {
  const i = html.search(/role="(slider|img)"/)
  if (i < 0) return null
  const start = html.lastIndexOf('<', i)
  const end = html.indexOf('>', i)
  const tag = html.slice(start, end + 1)
  const size = tag.match(/data-size="([^"]*)"/)
  const cls = tag.match(/class="([^"]*)"/)
  return { size: size ? size[1] : null, cls: cls ? cls[1] : null }
}
const R = (p: Record<string, unknown> = {}) => <Rating value={4} aria-label="滿意度" {...p} />
const cases: Record<string, JSX.Element> = {
  fieldDefault: <Field><FieldLabel>滿意度</FieldLabel>{R()}</Field>,
  fieldReadonly: <Field mode="readonly"><FieldLabel>滿意度</FieldLabel>{R()}</Field>,
  fieldSm: <Field size="sm"><FieldLabel>滿意度</FieldLabel>{R()}</Field>,
  fieldLg: <Field size="lg"><FieldLabel>滿意度</FieldLabel>{R()}</Field>,
  fieldSmExplicitLg: <Field size="sm"><FieldLabel>滿意度</FieldLabel>{R({ size: 'lg' })}</Field>,
  standalone: R(),
  standaloneSm: R({ size: 'sm' }),
  surfaceLg: <FieldSurfaceSizeProvider size="lg">{R()}</FieldSurfaceSizeProvider>,
  fieldInSurfaceLg: <FieldSurfaceSizeProvider size="lg"><Field><FieldLabel>滿意度</FieldLabel>{R()}</Field></FieldSurfaceSizeProvider>,
  runtimeXs: R({ size: 'xs' as never }),
}
const warns: string[] = []
const origWarn = console.warn
console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(' ')) }
const out: Record<string, unknown> = {}
for (const [k, el] of Object.entries(cases)) out[k] = root(renderToStaticMarkup(el))
console.warn = origWarn
process.stdout.write(JSON.stringify({ out, warns }))
`

function measure() {
  if (!existsSync(ESBUILD)) throw new Error(`找不到 esbuild:${ESBUILD}(先 npm install)`)
  const dir = mkdtempSync(path.join(tmpdir(), 'rating-field-size-'))
  if (!dir || !existsSync(dir)) throw new Error('mkdtemp 失敗(回空)')
  const src = path.join(dir, 'probe.tsx')
  const bundle = path.join(dir, 'probe.cjs')
  writeFileSync(src, PROBE)
  // 探針檔在暫存目錄(repo 外),裸模組(react-dom/server、react/jsx-runtime)要靠 NODE_PATH 指回 repo 的 node_modules
  const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules'), NODE_ENV: 'development' }
  const build = spawnSync(ESBUILD, [src, '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', `--tsconfig=${path.join(ROOT, 'tsconfig.app.json')}`, '--loader:.css=empty', '--log-level=warning', '--define:process.env.NODE_ENV="development"', `--outfile=${bundle}`], { cwd: ROOT, encoding: 'utf8', env })
  if (build.status !== 0) throw new Error(`esbuild 打包失敗:\n${build.stderr}`)
  const run = spawnSync(process.execPath, [bundle], { cwd: ROOT, encoding: 'utf8', env })
  if (run.status !== 0) throw new Error(`探針執行失敗:\n${run.stderr}`)
  const json = run.stdout.trim()
  if (!json) throw new Error('探針沒有輸出(儀器失效)')
  return JSON.parse(json)
}

function selftest() {
  let ok = true
  const good = Object.fromEntries(Object.entries(EXPECTED).map(([k, v]) => [k, { size: v, cls: 'inline-flex items-center gap-1 rounded-md' }]))
  // 1. 「有人把 fallback 改回 'sm'」→ Field 內沒指定與 standalone 都變 sm → 必紅並指名那兩格
  const fallbackSm = { ...good, fieldDefault: { size: 'sm', cls: good.fieldDefault.cls }, standalone: { size: 'sm', cls: good.standalone.cls } }
  const f1 = judge(fallbackSm)
  if (!(f1.length === 2 && f1.some((s) => s.startsWith('fieldDefault')) && f1.some((s) => s.startsWith('standalone:')))) { console.error('✗ selftest:fallback 改回 sm 的形狀應紅兩格,實際:', f1); ok = false }
  // 2. 「有人把 h-field-md 加回根節點」→ 必紅
  const container = { ...good, fieldDefault: { size: 'md', cls: 'inline-flex items-center gap-1 h-field-md rounded-md' } }
  const f2 = judge(container)
  if (!(f2.length === 1 && /容器高度 class/.test(f2[0]))) { console.error('✗ selftest:根節點帶 h-field-md 應紅,實際:', f2); ok = false }
  // 3. 正確形狀必綠;缺 data-size 必紅;空結果每格都紅
  if (judge(good).length !== 0) { console.error('✗ selftest:正確形狀應綠,實際:', judge(good)); ok = false }
  if (!judge({ ...good, fieldLg: { size: null, cls: good.fieldLg.cls } }).some((s) => /缺 data-size/.test(s))) { console.error('✗ selftest:缺 data-size 應紅'); ok = false }
  if (judge({}).length !== Object.keys(EXPECTED).length) { console.error('✗ selftest:空結果應每格都紅'); ok = false }
  // 4. 儀器有眼睛:真的渲染一次,standaloneSm 與 fieldLg 必須讀到不同的 data-size
  const { out } = measure()
  if (!(out.standaloneSm?.size === 'sm' && out.fieldLg?.size === 'lg')) { console.error('✗ selftest:對照組失敗 —— standaloneSm / fieldLg 應分別讀到 sm / lg,實際:', out.standaloneSm, '/', out.fieldLg); ok = false }
  console.log(ok ? '✅ rating-field-size selftest PASS' : '❌ rating-field-size selftest FAIL')
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  const { out, warns } = measure()
  const failures = judge(out)
  // 執行期 'xs' 必須 dev-warn(型別擋不住 JS consumer;靜默映射會讓舊用法零訊號)
  if (!warns.some((w) => /xs/.test(w))) failures.push('runtimeXs: 傳 \'xs\' 沒有 dev-warn(靜默映射 = 零訊號)')
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(18)} data-size=${v?.size ?? '(無)'}${v?.cls && CONTAINER_CLASS.test(v.cls) ? '  ⚠ 容器 class' : ''}`)
  if (failures.length) { console.error('❌ rating-field-size FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
  console.log('✅ rating-field-size PASS(元件只有內容高;prop > Field 明確 size > surface > md;xs 映 sm 並 warn)')
}
