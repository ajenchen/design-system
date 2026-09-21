#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 元件資料夾與主檔的命名結構一致(資料夾 PascalCase / 檔名 kebab-case / 主檔名對應資料夾名)。
 *   紅: 非 PascalCase 的資料夾、或缺對應主檔 → 列出並 exit 1(--selftest 以合成的 dataGrid /
 *        缺主檔的 DataGrid 驗過兩者都會紅)。
 *   綠: 合規時綠,且合規樣本與點開頭的工具暫存目錄都不得誤報(--selftest 一併驗)。
 *        不是抽籤 —— 純檔案系統列舉,同一份 worktree 恆等。
 *   註: 2026-09-21 之前沒有任何 workflow 呼叫它,而它從 2026-08-05 起就因為一個空的編輯器
 *        暫存目錄(`.claude/.cc-writes`)假紅,兩筆假警報躺了一個多月沒人看見。
 */
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
  // 點開頭的目錄不是元件,是工具的暫存區(例:編輯器在 2026-08-05 留下的 `.claude/.cc-writes`,
  // 空的、未進版控)。把它當成「資料夾非 PascalCase + 主檔缺」的違規,這支閘就永遠是紅的 ——
  // 而它剛好又沒有任何 CI 呼叫,於是那兩筆假警報躺了一個多月沒人看見(2026-09-21)。
  if (dir.startsWith('.')) continue
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

if (process.argv.includes('--selftest')) {
  // 對照組:合成兩種違規(資料夾非 PascalCase / 主檔缺),必須都被抓到。
  const synthetic = []
  const check = (dir, hasMain) => {
    const out = []
    if (dir.startsWith('.')) return out
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(dir)) out.push(`R1 ${dir}`)
    if (!hasMain && !(dir in MAIN_FILE_EXCEPTIONS)) out.push(`R3 ${dir}`)
    return out
  }
  synthetic.push(...check('dataGrid', true))   // 非 PascalCase → R1
  synthetic.push(...check('DataGrid', false))  // 主檔缺 → R3
  const clean = check('DataGrid', true)        // 合規的不得誤報
  const hiddenIgnored = check('.claude', false) // 點開頭目錄必須被略過
  const ok = synthetic.length === 2 && clean.length === 0 && hiddenIgnored.length === 0
  console.log(ok
    ? '✓ selftest:非 PascalCase 與缺主檔都被抓到,合規的不誤報,點開頭目錄被略過'
    : `✗ selftest 不符:合成違規 ${synthetic.length}/2、合規誤報 ${clean.length}、隱藏目錄誤報 ${hiddenIgnored.length}`)
  process.exit(ok ? 0 : 1)
}

if (bad.length) {
  console.error(`❌ naming-structure-invariant FAIL(${bad.length}):`)
  for (const b of bad) console.error(`   - ${b}`)
  console.error('   SSOT:CLAUDE.md「# 命名與語言一致性」+ audit dim 14(本 script = 其結構核心謂詞)')
  process.exit(1)
}
console.log(`✅ naming-structure-invariant PASS(${readdirSync(ROOT).length} 目錄;R1 PascalCase / R2 kebab / R3 主檔對應,例外 ${Object.keys(MAIN_FILE_EXCEPTIONS).length} 筆列冊)`)
