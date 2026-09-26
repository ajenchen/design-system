#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 起不了 Chromium 時只有一條政策(lib/launch-browser.mjs 的 exitOnBrowserLaunchFailure):一般環境印 SKIPPED-ENV、exit 0;
 *         宣告 GOVERNANCE_BROWSER_REQUIRED=1 的 lane(CI 的瀏覽器 job)印 BROWSER-REQUIRED、exit 非 0 —— 必需瀏覽器的 lane 永不略過;
 *         寫錯的旗標值不會被當成「不必需」;全 repo 沒有任何閘繞過這條政策自己印 SKIPPED-ENV(否則旗標到不了它)
 *   紅: 把 exitOnBrowserLaunchFailure 的必需分支拿掉(永遠 SKIPPED-ENV exit 0)→「必需 + 起不來」那格紅;
 *       把旗標改成「任何非空值都算必需 / 都不算」→ 旗標值那兩格紅;任何閘再自己寫一份 `SKIPPED-ENV: 無法啟動 Chromium` → 繞道掃描紅
 *       (2026-09-25 以 `--lib=<弄壞的副本>` 實測四個版本各自指名紅:拿掉必需分支 / 寫錯值當不必需 / 任何非空值都算必需 /
 *       修前的 HEAD 版(必需 + 起不來照樣 SKIPPED-ENV exit 0);掃描的對照組每次都跑:合成一支手寫略過的閘必須被抓到)
 *   綠: 起不來用「指向不存在的執行檔」確定性地造(executablePath),不依賴這台機器有沒有裝瀏覽器、快慢或網路;
 *        子行程環境變數由測試指定(就算這支測試本身跑在宣告了旗標的 job 裡,判定表也不變)
 *
 * 為什麼(2026-09-25,M37):launchBrowserOrSkip 起不了瀏覽器就印 SKIPPED-ENV、exit 0。在沒有瀏覽器的沙箱那是誠實的
 * 「這次沒驗」;但在 CI 的瀏覽器 job 裡,那等於整批閘靜默通過 —— 而且另有七支閘各自抄了一份同樣的 try/catch,
 * 連「共用函式加一個旗標」都到不了它們。
 *
 *   node scripts/test-launch-browser.mjs               # 驗目前的 lib
 *   node scripts/test-launch-browser.mjs --lib=<path>  # 拿另一份 launch-browser 跑同一張判定表(對照組:弄壞的副本必紅)
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const libArg = process.argv.find((a) => a.startsWith('--lib='))?.slice('--lib='.length)
const LIB = libArg ? resolve(libArg) : join(REPO, 'scripts/lib/launch-browser.mjs')
const work = mkdtempSync(join(tmpdir(), 'launch-browser-meta-'))
const NO_SUCH_BROWSER = join(work, 'no-such-chromium', 'chrome')
let fail = 0
const report = (ok, name, detail) => {
  if (ok) console.log(`✓ ${name}`)
  else { console.log(`✗ ${name}\n${String(detail).split('\n').filter(Boolean).slice(0, 10).map((l) => '   ' + l).join('\n')}`); fail += 1 }
}

/** 在子行程裡呼叫 launchBrowserOrSkip,並指定一個不存在的執行檔 —— 起不來是確定的。 */
function launchUnlaunchable(envOverride) {
  writeFileSync(join(work, 'probe.mjs'), `
import { launchBrowserOrSkip } from ${JSON.stringify(LIB)}
const browser = await launchBrowserOrSkip({ executablePath: ${JSON.stringify(NO_SUCH_BROWSER)} }, { cleanup: () => console.log('CLEANUP-RAN'), hint: '請於可開瀏覽器的環境補驗' })
console.log('LAUNCHED'); await browser.close()
`)
  const env = { ...process.env }
  delete env.GOVERNANCE_BROWSER_REQUIRED
  Object.assign(env, envOverride)
  const r = spawnSync(process.execPath, ['--', 'probe.mjs'], { cwd: work, encoding: 'utf8', env, timeout: 60_000 })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// ── 判定表 ──
{
  const r = launchUnlaunchable({})
  report(r.status === 0 && /SKIPPED-ENV/.test(r.out) && !/BROWSER-REQUIRED/.test(r.out) && /CLEANUP-RAN/.test(r.out) && /請於可開瀏覽器的環境補驗/.test(r.out) && !/LAUNCHED/.test(r.out),
    '旗標未設 + 起不了 Chromium → SKIPPED-ENV、exit 0(誠實地說沒驗),且先收尾、印補充說明', `exit=${r.status}\n${r.out}`)
}
{
  const r = launchUnlaunchable({ GOVERNANCE_BROWSER_REQUIRED: '1' })
  report(r.status !== 0 && r.status !== null && /BROWSER-REQUIRED/.test(r.out) && !/SKIPPED-ENV/.test(r.out) && /CLEANUP-RAN/.test(r.out) && !/LAUNCHED/.test(r.out),
    'GOVERNANCE_BROWSER_REQUIRED=1 + 起不了 Chromium → BROWSER-REQUIRED、exit 非 0(必需瀏覽器的 lane 永不略過)', `exit=${r.status}\n${r.out}`)
}
{
  const r = launchUnlaunchable({ GOVERNANCE_BROWSER_REQUIRED: '0' })
  report(r.status === 0 && /SKIPPED-ENV/.test(r.out), "GOVERNANCE_BROWSER_REQUIRED='0' → 等同未設(略過)", `exit=${r.status}\n${r.out}`)
}
{
  const r = launchUnlaunchable({ GOVERNANCE_BROWSER_REQUIRED: 'true' })
  report(r.status !== 0 && r.status !== null && !/SKIPPED-ENV/.test(r.out) && /GOVERNANCE_BROWSER_REQUIRED/.test(r.out),
    "GOVERNANCE_BROWSER_REQUIRED='true'(寫錯的值)→ 紅並點名旗標,不得被當成「不必需」而略過", `exit=${r.status}\n${r.out}`)
}

// ── 繞道掃描:沒有任何閘自己印「起不了 Chromium → SKIPPED-ENV」(那樣旗標到不了它)──
const HAND_ROLLED = /SKIPPED-ENV[^\n]{0,40}無法啟動 Chromium/u
const SHARED = relative(REPO, join(REPO, 'scripts/lib/launch-browser.mjs'))
function scanHandRolled(root) {
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(mjs|js|cjs)$/.test(name)) continue
      const rel = relative(root, path)
      if (rel === SHARED || rel === relative(REPO, fileURLToPath(import.meta.url))) continue
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        // 註解裡談到這個標記不算;要抓的是真的印出來的那一行
        if (HAND_ROLLED.test(line) && !/^\s*(\/\/|\*)/.test(line)) hits.push(`${rel}:${i + 1}`)
      })
    }
  }
  walk(join(root, 'scripts'))
  return hits
}
{
  // 對照組(每次都跑):合成一支手寫略過的閘,掃描必須抓到它 —— 否則下面那格的「0 支」是零證據
  const fake = join(work, 'repo')
  const fakeScripts = join(fake, 'scripts')
  mkdirSync(fakeScripts, { recursive: true })
  writeFileSync(join(fakeScripts, 'hand-rolled-invariant.mjs'),
    "try { await launchBrowser() } catch (e) { console.error('⚠️  SKIPPED-ENV: 無法啟動 Chromium(' + e.message + ')'); process.exit(0) }\n")
  const caught = scanHandRolled(fake)
  report(caught.length === 1 && caught[0].endsWith('hand-rolled-invariant.mjs:1'), '繞道掃描的對照組:合成的手寫略過閘被抓到', caught.join('\n') || '(沒抓到)')
}
{
  const hits = scanHandRolled(REPO)
  report(hits.length === 0, '全 repo 沒有閘繞過共用政策自己印 SKIPPED-ENV(旗標必須到得了每一個略過點)',
    `改用 lib/launch-browser.mjs 的 launchBrowserOrSkip / exitOnBrowserLaunchFailure:\n${hits.join('\n')}`)
}

rmSync(work, { recursive: true, force: true })
console.log(fail ? `\n✗ launch-browser:${fail} 項不符${libArg ? `(lib = ${LIB})` : ''}` : '\n✅ launch-browser PASS(略過 / 必需瀏覽器 / 旗標值 / 繞道掃描 全對)')
process.exit(fail ? 1 : 0)
