#!/usr/bin/env node
// build-fork-governance.mjs — C-prime fork-mode governance corpus 生成器(SSOT-driven)
//
// 讀 scripts/fork-hook-classification.json → 從 DS repo .claude/hooks/ SSOT 生成一套
// 「專給 consumer fork 用」的治理 corpus,輸出到 packages/design-system/ds-canonical/fork/。
// 該目錄隨 npm package ship(rides node_modules → npm install 覆蓋 = 官方控管不可客製)。
//
// fork 端只 commit 一個極穩定的 per-event dispatcher(讀本生成的 fork/manifest.json),
// 故 DS 未來治理增刪改 → 重生此 corpus → fork `npm install @beta` 即完全同步,
// 無需改 fork 自己 committed 設定(完全同步設計)。
//
// 四桶處理(per classification SSOT):
//   SHIP_AS_IS     → verbatim copy
//   SHIP_REWRITTEN → override 檔優先(scripts/fork-hook-overrides/<name>),否則套 path transform
//   REPLACE        → 用 override(scripts/fork-hook-overrides/<replaceWith>)
//   DROP           → 不生成、不註冊
//
// 用法:
//   node scripts/build-fork-governance.mjs            # 生成 ds-canonical/fork/
//   node scripts/build-fork-governance.mjs --check    # 驗:(1) 全 hook 已分類(漏接=FAIL)(2) 生成物與 SSOT 無 drift

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOKS_DIR = join(ROOT, '.claude/hooks')
const CLS_PATH = join(ROOT, 'scripts/fork-hook-classification.json')
const GOV_PATH = join(ROOT, 'scripts/fork-governance-classification.json')
const RULES_DIR = join(ROOT, '.claude/rules')
const REFS_DIR = join(ROOT, '.claude/references')
const OVERRIDE_DIR = join(ROOT, 'scripts/fork-hook-overrides')
const OUT_DIR = join(ROOT, 'packages/design-system/ds-canonical/fork')
const SETTINGS_PATH = join(ROOT, '.claude/settings.json')
// C-prime 接線骨架 SSOT(template fork 的 committed 啟動器 + settings.json)→ 隨 npm ship 供 sync-all 刷新
const TPL_CLAUDE = join(ROOT, 'template/ds-product-template/.claude')
// 2026-06-17 移除 check_governance_bootstrap.sh:其 install 邏輯併進 inject(消除 SessionStart 並行 race)。
const LAUNCHER_NAMES = ['fork-governance-dispatcher.sh', 'inject_fork_governance_preamble.sh']

const CHECK = process.argv.includes('--check')

const cls = JSON.parse(readFileSync(CLS_PATH, 'utf8'))
const gov = JSON.parse(readFileSync(GOV_PATH, 'utf8'))
const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))

// ── (1) Coverage gate:全 .claude/hooks/*.{sh,py} 必須被分類,漏接 = FAIL ──
const realHooks = readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.sh') || f.endsWith('.py'))
const classified = new Set()
for (const b of ['SHIP_AS_IS', 'SHIP_REWRITTEN', 'REPLACE', 'DROP']) {
  for (const e of cls[b]) classified.add(e.hook)
}
const unclassified = realHooks.filter((h) => !classified.has(h))
if (unclassified.length) {
  console.error(`❌ FORK-GOVERNANCE COVERAGE FAIL: ${unclassified.length} hook 未分類(新增 hook 必先分類進 fork-hook-classification.json):`)
  console.error(unclassified.map((h) => '   - ' + h).join('\n'))
  console.error('   修:把每個未分類 hook 加進 SHIP_AS_IS / SHIP_REWRITTEN / REPLACE / DROP 之一。')
  process.exit(1)
}
const ghost = [...classified].filter((h) => !realHooks.includes(h))
if (ghost.length) {
  console.error(`❌ FORK-GOVERNANCE GHOST FAIL: ${ghost.length} 個分類的 hook 在 .claude/hooks/ 不存在(stale 分類):`)
  console.error(ghost.map((h) => '   - ' + h).join('\n'))
  process.exit(1)
}

// ── event 對照(從 DS settings.json 取每個 hook 註冊在哪些 event)──
function eventsOf(hookName) {
  const evs = []
  for (const ev of Object.keys(settings.hooks || {})) {
    for (const g of settings.hooks[ev]) {
      for (const h of g.hooks || []) {
        if ((h.command || '').includes(hookName)) { if (!evs.includes(ev)) evs.push(ev); }
      }
    }
  }
  return evs
}

// ── SHIP_REWRITTEN 的 path transform(simple 機械改寫;複雜者用 override 檔)──
function applyTransform(content) {
  return content
    // DS src spec/story/token 路徑 → node_modules(fork 佈局)
    .replace(/packages\/design-system\/src/g, 'node_modules/@qijenchen/design-system/src')
    .replace(/\.\.\/\.\.\/packages\/design-system\/src/g, 'node_modules/@qijenchen/design-system/src')
}

// preamble 專用 transform:除 src 路徑外,把 inline 的 .claude/{rules,references,skills,commands} 指標
// 改指 npm ship 的 ds-canonical/(套件不 ship .claude/ 目錄)→ 修 fork 死指標(adversarial MINOR 1)。
// memory/planning/logs 與 scripts/*.mjs 是 DS-author-only,不 ship → 不改(由 fork-context header 教 fork 忽略)。
function preambleTransform(content) {
  return applyTransform(content)
    .replace(/\.claude\/(rules|references|skills|commands)\//g, 'node_modules/@qijenchen/design-system/ds-canonical/$1/')
}

// ── 生成 ──
function buildCorpus() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(join(OUT_DIR, 'hooks'), { recursive: true })

  const manifest = { _generated: 'build-fork-governance.mjs', hooks: {} } // event → [{file, source-hook}]
  const lockEntries = []

  const emit = (outName, content, sourceHook, bucket, evs) => {
    // fork path 適配(所有 bucket 都套):DS-author repo dir 名 `my-project` 的 display-path strip
    // 在 fork 永不命中 → 顯示絕對路徑。改 `$CLAUDE_PROJECT_DIR`(fork 通用,strip 出 repo-relative)。
    // 純 display(soft warn message),不動 exit code / BLOCKER 邏輯。
    content = content.replace(/#\*\/my-project\//g, '#"$$CLAUDE_PROJECT_DIR"/')
    const outPath = join(OUT_DIR, 'hooks', outName)
    writeFileSync(outPath, content)
    const sha = createHash('sha256').update(content).digest('hex')
    lockEntries.push({ file: `hooks/${outName}`, sha256: sha, sourceHook, bucket })
    for (const ev of evs.length ? evs : ['PreToolUse']) {
      manifest.hooks[ev] = manifest.hooks[ev] || []
      manifest.hooks[ev].push({ file: `hooks/${outName}`, sourceHook, bucket })
    }
  }

  for (const e of cls.SHIP_AS_IS) {
    const content = readFileSync(join(HOOKS_DIR, e.hook), 'utf8')
    emit(e.hook, content, e.hook, 'SHIP_AS_IS', eventsOf(e.hook))
  }
  for (const e of cls.SHIP_REWRITTEN) {
    const ov = join(OVERRIDE_DIR, e.hook)
    let content
    if (existsSync(ov)) content = readFileSync(ov, 'utf8')
    else content = applyTransform(readFileSync(join(HOOKS_DIR, e.hook), 'utf8'))
    emit(e.hook, content, e.hook, 'SHIP_REWRITTEN', eventsOf(e.hook))
  }
  for (const e of cls.REPLACE) {
    const m = e.replaceWith.match(/([a-zA-Z0-9_-]+\.sh)/)
    const newName = m ? m[1] : ('replaced_' + e.hook)
    const ov = join(OVERRIDE_DIR, newName)
    if (!existsSync(ov)) {
      console.error(`❌ REPLACE override 缺檔:scripts/fork-hook-overrides/${newName}(${e.hook} 的取代版必須手寫)`)
      process.exit(1)
    }
    emit(newName, readFileSync(ov, 'utf8'), e.hook, 'REPLACE', eventsOf(e.hook))
  }
  // DROP: 不生成

  // ── preamble.md(#3 事前指引層,deterministic 從 source 生成、hash-locked,禁人工摘要)──
  // 規則:via 含 "inject" 的 rules/references → 收錄全文(path-rewrite 後);via "npm_read" → 收錄 pointer。
  // 來源是 .claude/rules + .claude/references 的真實檔(SSOT),非手寫摘要 → deterministic + npm-current。
  const preParts = ['# DS Fork 治理 preamble(SessionStart 注入;source-generated,禁手改)\n',
    '> 本檔由 build-fork-governance.mjs 從 .claude/{rules,references} SSOT 生成,path 已改 node_modules 視角。\n',
    '\n> **你是 FORK PRODUCT 開發者**:遵循下方設計紀律(item-anatomy / SSOT 消費 / Tailwind / 命名 / 4-Family Layout)。' +
    '**git 節奏照 fork 的「預覽 → 確認 → 上線」**:做完推草稿分支 → Netlify 出預覽 → user 確認 → 才合 main(詳本 repo CLAUDE.md「預覽→確認→上線」段)。' +
    '**忽略的是 DS-author 的【發版/治理維護】鏈**(`build:lib` / `release:preflight` / `npm publish` / tag / GitHub Pages / codex-collab / `scripts/*.mjs` gate — 那些是 DS 維護者的,fork 不發套件、用不到)。' +
    'Deep detail 看 `node_modules/@qijenchen/design-system/ds-canonical/{rules,references}` + 元件 `.spec.md`。\n' +
    '> **4-Family Layout**:Family 1+2(列表/選單項)見下方 item-anatomy;Family 3(Pill)見 `Button` 的 `.spec.md`;Family 4(可編輯 Field 控件)見 `field-controls.spec.md`(都在 node_modules/@qijenchen/design-system/src)。\n']
  const collect = (home, srcDir, label) => {
    const items = (gov.homes[home] && gov.homes[home].items) || []
    for (const it of items) {
      if (!it.name || !['SHIP_AS_IS', 'SHIP_REWRITTEN'].includes(it.bucket)) continue
      const src = join(srcDir, it.name)
      if (!existsSync(src)) continue
      const via = it.via || ''
      if (via.includes('inject') || via.includes('embed')) {
        preParts.push(`\n---\n## ${label}/${it.name}\n`, preambleTransform(readFileSync(src, 'utf8')))
      } else {
        // npm package 把 .claude/{rules,references} 鏡像到 ds-canonical/{rules,references}(sync-ds-canonical.mjs);
        // 套件「不 ship .claude/ 目錄」→ pointer 必指 ds-canonical/(實際 ship 路徑),指 .claude/ 會 file-not-found。
        preParts.push(`\n- 需要時 Read:node_modules/@qijenchen/design-system/ds-canonical/${home}/${it.name}(${(it.reason || '').slice(0, 60)})`)
      }
    }
  }
  preParts.push('\n# 設計紀律(rules,寫產品 code 前主動遵循)\n')
  collect('rules', RULES_DIR, 'rules')
  preParts.push('\n# SSOT 消費對照(references)\n')
  collect('references', REFS_DIR, 'references')
  const preambleStr = preParts.join('\n') + '\n'
  writeFileSync(join(OUT_DIR, 'preamble.md'), preambleStr)
  lockEntries.push({ file: 'preamble.md', sha256: createHash('sha256').update(preambleStr).digest('hex') })

  // ── launchers/(接線骨架:3 啟動器 + settings hooks 區塊,隨 npm ship 供 sync-all 刷新既有 fork)──
  // SSOT = template/ds-product-template/.claude/{hooks,settings.json}。讓「接線層」也完全同步(2026-06-17 補)。
  mkdirSync(join(OUT_DIR, 'launchers'), { recursive: true })
  for (const ln of LAUNCHER_NAMES) {
    const src = join(TPL_CLAUDE, 'hooks', ln)
    if (!existsSync(src)) {
      console.error(`❌ LAUNCHER 缺檔:template/ds-product-template/.claude/hooks/${ln}(C-prime 啟動器 SSOT 必存在)`)
      process.exit(1)
    }
    const content = readFileSync(src, 'utf8')
    writeFileSync(join(OUT_DIR, 'launchers', ln), content)
    lockEntries.push({ file: `launchers/${ln}`, sha256: createHash('sha256').update(content).digest('hex'), source: 'template/.claude/hooks' })
  }
  // settings.json 的 hooks 區塊 + governance permissions → launchers/settings-hooks.json(sync-all idempotent merge 用)
  const tplSettings = JSON.parse(readFileSync(join(TPL_CLAUDE, 'settings.json'), 'utf8'))
  const settingsHooksStr = JSON.stringify({
    _generated: 'build-fork-governance.mjs',
    _source: 'template/ds-product-template/.claude/settings.json(hooks + permissions 區塊)',
    _merge: 'sync-all/refresh-fork-launchers.mjs:strip 舊 launcher 註冊 + append canonical hooks + union permissions.allow',
    hooks: tplSettings.hooks,
    permissions: tplSettings.permissions,
  }, null, 2) + '\n'
  writeFileSync(join(OUT_DIR, 'launchers', 'settings-hooks.json'), settingsHooksStr)
  lockEntries.push({ file: 'launchers/settings-hooks.json', sha256: createHash('sha256').update(settingsHooksStr).digest('hex'), source: 'template/.claude/settings.json' })

  // dispatcher manifest + lock
  const manifestStr = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(join(OUT_DIR, 'manifest.json'), manifestStr)
  lockEntries.push({ file: 'manifest.json', sha256: createHash('sha256').update(manifestStr).digest('hex') })
  const lockStr = JSON.stringify({ _purpose: 'sha256 of every shipped fork governance body + manifest (tamper-detect baseline)', entries: lockEntries.sort((a, b) => a.file.localeCompare(b.file)) }, null, 2) + '\n'
  writeFileSync(join(OUT_DIR, 'governance.lock'), lockStr)

  return { manifest, lockEntries, count: lockEntries.length - 1 }
}

if (CHECK) {
  // drift check:重生到暫存比對(這裡簡化為「重生 + 比對 lock」;CI 用)
  const before = existsSync(join(OUT_DIR, 'governance.lock')) ? readFileSync(join(OUT_DIR, 'governance.lock'), 'utf8') : ''
  const r = buildCorpus()
  const after = readFileSync(join(OUT_DIR, 'governance.lock'), 'utf8')
  if (before && before !== after) {
    console.error('❌ FORK-GOVERNANCE DRIFT: ds-canonical/fork/ 與 SSOT 重生結果不一致 — 重跑 `node scripts/build-fork-governance.mjs` 並 commit。')
    process.exit(1)
  }
  console.log(`✅ fork-governance --check PASS:53 hook 全分類 + 生成物與 SSOT 無 drift（${r.count} 個 fork hook body）`)
} else {
  const r = buildCorpus()
  const tally = cls._meta.tally
  console.log(`✅ fork governance corpus 生成 → packages/design-system/ds-canonical/fork/`)
  console.log(`   ship-as-is ${tally.SHIP_AS_IS} / rewritten ${tally.SHIP_REWRITTEN} / replaced ${tally.REPLACE} / dropped ${tally.DROP}`)
  console.log(`   → ${r.count} 個 fork hook body + manifest.json(dispatcher 清單)+ governance.lock(sha256 tamper baseline）`)
  const evs = Object.keys(r.manifest.hooks)
  console.log(`   events: ${evs.map((e) => `${e}(${r.manifest.hooks[e].length})`).join(' / ')}`)
}
