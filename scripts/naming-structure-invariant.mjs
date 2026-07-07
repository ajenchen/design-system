#!/usr/bin/env node
// naming-structure-invariant.mjs — Dim 14「命名一致性」的結構核心謂詞化
// (2026-07-07 deep-audit C.0b 判準化 harvest 首跑產物:27 個 PURE-JUDGMENT 維度中,
//  dim 14 的機械可判核心 = 資料夾 PascalCase / 檔名 kebab-case / 主檔對應。
//  語義部分(spec 章名中文、identifier 語言、hook 命名)仍留 LLM judgment — 謂詞化不縮減稽核,
//  是讓機械部分變厚,per planning/2026-07-07-governance-evolution-roadmap.md 雙柱模型。)
//
// 規則:
//   R1 components/<Dir> 必 PascalCase
//   R2 目錄內 .tsx/.ts/.md 檔名必 kebab-case(允許 `_` 前綴 = demo/private helper 慣例,
//      anchor: AppShell/_demo-helpers.tsx)
//   R3 主檔 <kebab(Dir)>.tsx 必存在 — 例外列冊(歷史既定結構,新元件不得援引):
//      Menu(主檔 menu-item.tsx:資料夾收 Menu 家族,元件 = MenuItem)
//      SelectionControl(selection-item.tsx:internal 單元,無 selection-control 主檔)
// Exit 1 on violations(deterministic;CI-able)。

import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'packages/design-system/src/components'
const MAIN_FILE_EXCEPTIONS = {
  Menu: 'menu-item.tsx 為主檔(資料夾收 Menu 家族,元件 = MenuItem)',
  SelectionControl: 'selection-item.tsx(internal 單元,無 selection-control 主檔)',
}
const pascalToKebab = (s) => s.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase()

const bad = []
for (const dir of readdirSync(ROOT).sort()) {
  const p = join(ROOT, dir)
  if (!statSync(p).isDirectory()) continue
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(dir)) bad.push(`R1 資料夾非 PascalCase: ${dir}`)
  const kebab = pascalToKebab(dir)
  if (!existsSync(join(p, `${kebab}.tsx`)) && !(dir in MAIN_FILE_EXCEPTIONS)) {
    bad.push(`R3 主檔缺: ${dir}/${kebab}.tsx(歷史例外僅 ${Object.keys(MAIN_FILE_EXCEPTIONS).join('/')},新元件必合規)`)
  }
  for (const f of readdirSync(p)) {
    if (!/\.(tsx|ts|md)$/.test(f)) continue
    if (!/^_?[a-z0-9][a-z0-9.-]*$/.test(f)) bad.push(`R2 檔名非 kebab-case: ${dir}/${f}`)
  }
}

if (bad.length) {
  console.error(`❌ naming-structure-invariant FAIL(${bad.length}):`)
  for (const b of bad) console.error(`   - ${b}`)
  console.error('   SSOT:CLAUDE.md「# 命名與語言一致性」+ audit dim 14(本 script = 其結構核心謂詞)')
  process.exit(1)
}
console.log(`✅ naming-structure-invariant PASS(${readdirSync(ROOT).length} 目錄;R1 PascalCase / R2 kebab / R3 主檔對應,例外 ${Object.keys(MAIN_FILE_EXCEPTIONS).length} 筆列冊)`)
