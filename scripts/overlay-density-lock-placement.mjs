#!/usr/bin/env node
// overlay-density-lock-placement — 防 density/layout-space lock 設在 header primitive(非 surface 根)
//
// 不變式(2026-06-15,FileViewer 圖二 anchor):
//   density / layout-space lock 必須設在 overlay/chrome 的 **surface 根容器**,不可設在 header
//   primitive(ChromeHeader / SurfaceHeader)。header 鎖、sibling body 沒鎖 → 兩者 px-loose 在
//   不同 density 解析 → 內容左緣不對齊(FileViewer InfoPanel header px-loose@lg=24 vs body
//   px-loose@page=16 = 圖二 bug)。lock 放 surface 根 → header + body 同 density context → 左緣對齊。
//   `<ChromeHeader lockDensity="lg">` 是此 anti-pattern 的具體形式(lockDensity 在 header 上設
//   data-density)→ 禁用;density 改設在 surface 根(見 density.spec.md 消費者清單 + anti-pattern)。
//
// 零誤判:只抓 JSX 屬性用法 `lockDensity="..."` / `lockDensity={...}`(慣例無空格 `=`);
//   不抓 destructure default `lockDensity = 'inherit'`(有空格)、type `lockDensity?: ...`(`?:`)。

import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

const LOCK_ON_HEADER = /lockDensity=["{]/g

// 跳過註解(行首 // 或 jsdoc * 或 /* / 同行 // 之後)— 否則「原 lockDensity="lg"」這類歷史描述
// 註解會被誤判為真用法(2026-06-15 跨行/註解陷阱,對齊 CLAUDE.md 失敗記憶索引)。
export function checkSource(src) {
  const out = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const isCommentLine = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
    if (isCommentLine) continue
    for (const m of line.matchAll(LOCK_ON_HEADER)) {
      if (line.slice(0, m.index).includes('//')) continue // 行尾註解內
      out.push(i + 1)
    }
  }
  return out
}

function selftest() {
  const c = [
    { n: '<ChromeHeader lockDensity="lg"> = 該抓', src: '<ChromeHeader lockDensity="lg" className="x">', e: 1 },
    { n: 'lockDensity={v} JSX = 該抓', src: '<ChromeHeader lockDensity={v}>', e: 1 },
    { n: '<ChromeHeader> 無 lock = 不抓', src: '<ChromeHeader className="x">', e: 0 },
    { n: "destructure default lockDensity = 'inherit' = 不抓", src: "{ className, lockDensity = 'inherit', ...props }", e: 0 },
    { n: "type lockDensity?: 'inherit' = 不抓", src: "  lockDensity?: 'inherit' | 'lg'", e: 0 },
    { n: '行首註解提及 lockDensity="lg" = 不抓', src: '      // Density:原 lockDensity="lg" 只鎖 header', e: 0 },
    { n: 'jsdoc * 行提及 lockDensity="lg" = 不抓', src: ' * lockDensity="lg" 是歷史 escape hatch', e: 0 },
  ]
  let ok = true
  for (const t of c) {
    const got = checkSource(t.src).length
    const pass = (t.e === 0) === (got === 0)
    console.log(`  ${pass ? '✓' : '✗'} ${t.n}(got ${got})`)
    if (!pass) ok = false
  }
  return ok
}

if (process.argv.includes('--selftest')) {
  console.log('overlay-density-lock-placement selftest:')
  process.exit(selftest() ? 0 : 1)
}

// 掃 component consumer(primitive 定義檔 chrome-header.tsx 的 destructure/type 不匹配 regex,天然排除)
const files = globSync('packages/design-system/src/components/**/*.tsx', { cwd: ROOT })
  .filter((f) => !f.endsWith('.stories.tsx'))
const v = []
for (const rel of files) {
  for (const ln of checkSource(readFileSync(path.join(ROOT, rel), 'utf8'))) {
    v.push(`  - ${rel}:${ln} density lock 設在 header(lockDensity)→ 改設在 surface 根容器(防 header/body 左緣不對齊,FileViewer 圖二 anchor;見 density.spec.md anti-pattern)`)
  }
}
if (v.length) { console.error('❌ density lock 設在 header primitive(非 surface 根):'); console.error(v.join('\n')); process.exit(1) }
console.log(`✓ overlay-density-lock-placement:${files.length} 檔,0 個 header-level density lock`)
