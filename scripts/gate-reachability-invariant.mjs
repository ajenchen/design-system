#!/usr/bin/env node
/**
 * 不變式:**寫了閘就要有人跑它 —— 而且要分清楚「會擋 PR」與「只在夜間跑」。**
 *
 * 本 repo 反覆踩同一個病:spec 寫「由 xxx.mjs 機械強制」、腳本也真的存在、甚至還有包裝測試,
 * 但**沒有任何 CI workflow、npm script 或 hook 會呼叫它** —— 於是那條「機械強制」是假的,
 * 而且沒有任何訊號會告訴你。已知錨例:
 *   - 2026-09-18 推播閘:hook 存在、測試 6 個情境全綠,但整條路徑被 `requires: peer-cli` 擋掉,
 *     真實 session 從沒跑過(測試全都直接跑 hook 檔,沒走過真實入口)。
 *   - 2026-09-18 native/custom parity 閘:只掛在自述「非 required check」的 nightly。
 *   - ci.yml 註解自己記過兩次 distribute-column-widths / pagination 同一種病。
 *
 * 量法:把「執行面」當根(`.github/workflows/**`、`ds-canonical/hooks/**`、
 * `ds-canonical/skills/**`、`infra/governance/{test,lib}/**`、harness inventory),遞移展開它們提到的
 * `scripts/*.mjs`,算不出來的就是孤兒。名字像閘/測試的孤兒(`invariant|probe|audit|check|test-|gate`)才進判定 ——
 * 一次性工具腳本不在此列。
 *
 * **package.json 不是根(2026-09-27,N33)**:它只是 `npm run <name>` 的查表。舊量法把它當根,
 * 於是「從 ci.yml 拿掉一道閘」不會紅 —— package.json 還留著那條 script,閘就被判成可達
 * (拿「有一條 npm script 提到它」代替「CI 會跑它」,M37)。現在 npm script 只在**某個執行面真的
 * `npm run` 到它**時才算數(lib/workflow-invocation-surface.mjs;pre/post hook 與 npm script 互相呼叫都遞移),
 * 而且 workflow 的 `#` 註解整行剔除 —— ci.yml 註解裡記過的「這支沒被呼叫」病史,名字出現在那裡不算有人跑。
 * 對照組多兩面:只在 package.json 出現的合成閘必紅;只被 workflow 註解提到的合成閘必紅。
 *
 * **「有人跑」不等於「會擋」(2026-11-18,D10-02)**:上面那套把夜間 harness 也當執行面 —— 它真的每晚在跑,
 * 但 governance-harnesses.yml 檔頭自己寫「It is not a required check and never blocks the five-step release」。
 * 只問「有沒有人跑」,棘輪說只有 4 支孤兒;分開問「PR 上有沒有人跑」,2026-11-18 量到 25 支名字像閘的腳本只在夜間跑
 * (之後以 baseline 為準)—— 規格說它「機械強制」,PR 上卻沒有任何東西會因為它變紅
 * (M37 ④ 換了一層:拿「有人跑」代替「會擋」)。所以同一份掃描分三輪,每支腳本落在四類之一:
 *   PR 可達   根 = `on:` 帶 pull_request / pull_request_target / merge_group 的 workflow(與它們 `npm run` 到的 script)
 *             + hook 目錄裡的 .sh / .mjs(hook 寫入當下就跑,CI 的 hooks:test 也跑;.json 是資料)
 *             + 上面這些用**完整路徑**點名的 infra/governance 檔(例:ci.yml 直接 `node --test infra/governance/test/x.test.mjs`)。
 *             不用檔名比對 infra:harness-registry.mjs / harness-registry.test.mjs 的夾具字串會把 check-branch-protection 等
 *             只在夜間跑的腳本誤算成 PR 可達(2026-11-18 實測 6 支)。
 *   只在夜間  再加上 `on:` 只有 schedule(沒有 PR 事件)的 workflow、harness inventory、全部 infra/governance/{test,lib} 可執行檔
 *             (inventory 的 roots 就是 `infra/governance/test/**\/*.test.mjs`,harness 每晚全跑)。
 *             gate-meta 配對(run-gate-meta-tests.mjs 探索出來的)只在**探索者本身在那一輪可達**時才算;
 *             「可達」跟其他腳本同一套執行形狀 —— 只被讀原文(check-provider-neutral-ssot-residue.mjs 的
 *             `text('scripts/run-gate-meta-tests.mjs')`)不算有人跑它,所以 PR 一輪探索者不可達,配對與它們跑到的閘歸夜間。
 *   只在其他  只有寬口徑(下一行)才搆得到:技能文件的散文、hook / 腳本的註解、腳本裡**提到但不跑**的地方
 *             (assert 的期望值、複製清單、說明字串)、發布或手動觸發的 workflow。
 *   孤兒      連寬口徑都搆不到。寬口徑 = 2026-09-27 起的原量法(全部 workflow + hooks + skills + infra + harness,原文不剔註解)。
 * 兩輪窄口徑裡,**程式碼文字只認執行形狀**(2026-11-18,WP-18 反駁 #2;形狀定義的唯一住處是
 * lib/workflow-invocation-surface.mjs 的 execShapedText):腳本原文遞移展開、hook 的 .sh / .mjs、infra 的 .mjs 都先濾成
 * 「spawn / exec / fork / import 的引數(跨行)、流進這些引數的常數、shell 的 node / npm 指令行與它用到的變數」再比對。
 * 註解、assert、夾具資料、訊息裡出現的檔名一律不算有人跑。改這條之前,PR 一輪只剔註解 ——
 * test-run-deterministic-deep-audit.mjs:77 一行 `assert.deepEqual(… ['node', 'scripts/repository-hygiene-invariant.mjs', …])`
 * 就讓那支只在夜間跑的閘被算成 PR 可達、不在棘輪裡;同形的漏網 2026-11-18 量到 10 支(逐支見 commit)。
 * workflow 與 npm script 是指令面,原文提到即算(PR workflow 每一行提到腳本的都帶 `node`,2026-11-18 實查)。
 * 另外,`test-<stem>.mjs` 可達且原文提到 `<stem>.mjs` 時,`<stem>.mjs` 算被它跑到(gate-meta 配對的定義;
 * 2026-11-18 實查 121 支 meta-test 經 `runGateSelftestMeta(…)` 這個 helper 跑閘(lib/gate-selftest-meta.mjs:131 spawnSync 它的引數),
 * helper 呼叫本身不是執行形狀;121 支全是 test-<stem> 配對、原文都提到 <stem>.mjs,這條規則全數接得住)。
 * 已知近似 —— **雙向,不是上限**:
 *   少算 PR 可達(閘多報夜間 / 其他,看得見的方向):包一層的 helper(`run('scripts/x.mjs')`)、動態組字串
 *     (`node scripts/${name}`)、迴圈變數(`for (const g of GATES) spawnSync(…, [g])`)、腳本裡的 `npm run`(不解析)、
 *     資料驅動的執行計畫(governance-build-graph.json 的 stage 指令由 governance-build-graph.mjs 跑;2026-11-18 實測
 *     把它加進模型,名字像閘的分類一支都不變,所以沒加)。
 *   多算 PR 可達(閘默默放行,看不見的方向):PR workflow 裡被 job `if:` 跳過的步驟、hook 測試沒走到的分支、
 *     靜態 import 一支閘只為了拿它的函式(模組載入但它的檢查沒跑)、常數同名但不同作用域、
 *     檔名是另一支檔名的尾段(`includes` 比對,`stale-governance-check.mjs` 也會命中 `governance-check.mjs`)。
 *
 * **棘輪,不是一次到位**:現況有一批既有孤兒,一次全接進 CI 會同時炸開且無法評估落點。
 * 因此鎖 baseline(`scripts/gate-reachability-baseline.json`):**新增孤兒 = 紅**,既有孤兒清掉會提醒更新
 * baseline。數字只准往下,不准往上。要合法新增一支閘,就得同時把它接進某個執行面。
 * 「只在夜間」與「只在其他」兩類同樣棘輪,但只鎖**名字像閘、不是 test- 開頭**的那些:
 * test- 開頭的是測試,整套刻意不進 PR 閘(governance-harnesses.yml 檔頭「deliberately kept out of the PR gate」),
 * 配對 meta-test 的紅面在 PR 還是夜間跑,歸 audit-gate-meta-test-coverage 那一層管(D10-03),這裡只印數字、不重複鎖。
 *
 * @gate-contract
 *   保證: 名字像閘/測試的腳本,真的有執行面(CI workflow 直接或經 npm run / hook / skill / harness)會呼叫它;
 *        而且名字像閘、不是 test- 開頭的,要嘛在 PR 執行面以**執行形狀**跑得到(直接,或經 PR 會跑的腳本 spawn / exec / import 它;
 *        近似的方向與邊界見上方「已知近似」),要嘛記在 baseline 的「只在夜間」或「只在其他」清單裡(數字只准往下)
 *   紅: 新增一支沒有任何人呼叫的閘(或把某支從 CI 拿掉、只剩 package.json 那條 script)→ 指名它並紅;
 *       把一支閘從 PR 執行面拿掉、只剩夜間 harness / 排程 workflow 跑它 → 指名它「新增只在夜間可達」並紅;
 *       PR 會跑的腳本只在 assert / 資料 / 訊息裡提到它,不會讓它算成 PR 可達
 *   綠: 沒有新增時必須綠;selftest 每次注入 18 支合成腳本,期望類別全部由合成情境寫死(不從受測程式算出的值推回來):
 *       無人提到 / 只在 package.json / 只在 workflow 註解 → 孤兒;PR workflow 經 npm run / PR workflow 加 harness /
 *       PR 腳本用常數 + 跨行 spawnSync 跑的探索者 B 與它的配對(配對測試只用 helper 呼叫)/ hook 先放變數再 node "$VAR" / PR caller 本身 → PR;
 *       只在 harness / 只在排程 workflow / 探索者 A(排程 workflow 點名,PR 腳本只讀它原文)與它的配對 /
 *       PR 腳本只在 assert、夾具 package.json、console 訊息提到(另在 harness)→ 夜間;
 *       只在手動 workflow / 只在 hook 的註解、echo 字串、夾具寫檔 → 其他。
 *       每一支都必須落在它該在的那一類、而且該紅的那幾支要真的讓判定變紅,任一支落錯就是量具壞了
 *
 * 用法:
 *   node scripts/gate-reachability-invariant.mjs              判定
 *   node scripts/gate-reachability-invariant.mjs --update-baseline   接好線之後重記
 *   node scripts/gate-reachability-invariant.mjs --selftest    對照組(注入合成腳本,逐支驗它落在哪一類)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkflowSemantics } from '../infra/governance/lib/workflow-trust.mjs'
import { discoverGateMetaTestPairs } from './lib/gate-meta-test-inventory.mjs'
import {
  execShapedText,
  executableLanguageOf,
  readWorkflowSources,
  readWorkspaceScripts,
  resolveWorkflowInvocationSurface,
  stripCodeCommentLines,
} from './lib/workflow-invocation-surface.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const UPDATE = process.argv.includes('--update-baseline')
const BASELINE = join(ROOT, 'scripts', 'gate-reachability-baseline.json')
const GATE_LIKE = /invariant|probe|audit|check|^test-|gate/
// 棘輪「只在夜間 / 只在其他」兩類的對象:名字像閘、不是測試(理由見檔頭)
const RATCHETED_GATE = (f) => GATE_LIKE.test(f) && !f.startsWith('test-')

// 對照組:每支合成腳本只出現在一種地方,各自必須落在註明的那一類 —— 兩面都驗,量具才不是抽籤。
const SYNTHETIC = 'synthetic-orphan-invariant.mjs'                         // 無人提到 → 孤兒
const SYNTHETIC_PKG_ONLY = 'synthetic-pkg-only-invariant.mjs'               // 只在 package.json → 孤兒(N33)
const SYNTHETIC_COMMENT_ONLY = 'synthetic-comment-only-invariant.mjs'       // 只在 PR workflow 的 # 註解 → 孤兒(N33)
const SYNTHETIC_VIA_NPM = 'synthetic-via-npm-invariant.mjs'                 // PR workflow `npm run` → script → PR
const SYNTHETIC_PR_AND_HARNESS = 'synthetic-pr-and-harness-invariant.mjs'   // PR workflow 直接跑 + 也在 harness → PR
const SYNTHETIC_HARNESS_ONLY = 'synthetic-harness-only-invariant.mjs'       // 只在 harness → 夜間(同一支換個地方 = 兩面)
const SYNTHETIC_SCHEDULED_ONLY = 'synthetic-scheduled-only-invariant.mjs'   // 只在 schedule workflow → 夜間
const SYNTHETIC_DISPATCH_ONLY = 'synthetic-dispatch-only-invariant.mjs'     // 只在 workflow_dispatch workflow → 其他
const SYNTHETIC_HOOK_COMMENT = 'synthetic-hook-comment-only-invariant.mjs'  // 只在 hook 的 # 註解 / echo 字串 / 夾具寫檔 → 其他(寬口徑才算)
// 以下為 WP-18 反駁 #1 / #2 的對照組:期望值全部由情境本身決定,不讀受測程式算出的任何值。
// 探索者 A / B 是合成的 gate-meta runner(各自探索一組配對),與真的 run-gate-meta-tests.mjs 在哪裡被點名無關。
const SYNTHETIC_PR_CALLER = 'synthetic-pr-caller.mjs'                       // PR workflow 直接跑;下面幾支的「提到」都寫在它裡面 → PR
const SYNTHETIC_RUNNER_TEXT = 'synthetic-meta-runner-a.mjs'                 // 探索者 A:排程 workflow 點名;PR caller 只 `text('scripts/…')` 讀它原文 → 夜間
const SYNTHETIC_PAIR_GATE = 'synthetic-pair-invariant.mjs'                  // A 探索出來的配對 → 夜間(寫死;反駁 #1)
const SYNTHETIC_PAIR_TEST = `test-${SYNTHETIC_PAIR_GATE}`
const SYNTHETIC_ASSERT_ONLY = 'synthetic-assert-only-invariant.mjs'         // PR caller 只在 assert / 夾具 package.json / console 訊息提到,另在 harness → 夜間(反駁 #2 E 形)
const SYNTHETIC_RUNNER_EXEC = 'synthetic-meta-runner-b.mjs'                 // 探索者 B:PR caller 用常數 + 跨行 spawnSync 真的跑它 → PR(反駁 #2 正面)
const SYNTHETIC_EXEC_PAIR_GATE = 'synthetic-exec-pair-invariant.mjs'        // B 探索出來的配對;配對測試只用 helper 呼叫它 → 靠 test-<stem> 規則 → PR
const SYNTHETIC_EXEC_PAIR_TEST = `test-${SYNTHETIC_EXEC_PAIR_GATE}`
const SYNTHETIC_HOOK_VAR = 'synthetic-hook-var-invariant.mjs'               // hook 先 GATE="…/scripts/…" 再 node "$GATE" → PR
const SYNTHETICS = [SYNTHETIC, SYNTHETIC_PKG_ONLY, SYNTHETIC_COMMENT_ONLY, SYNTHETIC_VIA_NPM, SYNTHETIC_PR_AND_HARNESS,
  SYNTHETIC_HARNESS_ONLY, SYNTHETIC_SCHEDULED_ONLY, SYNTHETIC_DISPATCH_ONLY, SYNTHETIC_HOOK_COMMENT,
  SYNTHETIC_PR_CALLER, SYNTHETIC_RUNNER_TEXT, SYNTHETIC_PAIR_GATE, SYNTHETIC_PAIR_TEST, SYNTHETIC_ASSERT_ONLY,
  SYNTHETIC_RUNNER_EXEC, SYNTHETIC_EXEC_PAIR_GATE, SYNTHETIC_EXEC_PAIR_TEST, SYNTHETIC_HOOK_VAR]

/** 量具本身讀不到 / 讀不懂輸入:不是判定,exit 2(沒量到 ≠ 沒有問題)。 */
const instrumentFail = (message) => { console.error(`✗ 量具失效:${message}`); process.exit(2) }

const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const walk = (dir, out = []) => {
  let entries; try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue
    const full = join(dir, name)
    let info; try { info = statSync(full) } catch { continue }
    if (info.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const SURFACE_EXT = /\.(ya?ml|json|sh|mjs|md)$/
// 窄口徑只讀「會被執行的檔」(.sh / .mjs),而且只讀其中執行形狀的那幾段(lib 的 execShapedText);
// .md 是說明文字、.json 是資料(hooks/lib/benchmark-citation-sources.json 之類),提到檔名不等於會跑它
const execShaped = (s) => execShapedText(s.text, executableLanguageOf(s.path))
const isExecutable = (s) => executableLanguageOf(s.path) !== null
const surface = (path) => ({ path: relative(ROOT, path), text: read(path) })

// 執行面 = 真的會把腳本跑起來的地方。**package.json 不在裡面**:它只是 `npm run` 的查表(見檔頭)。
const hookSurfaces = walk(join(ROOT, 'packages/design-system/ds-canonical/hooks')).filter((p) => SURFACE_EXT.test(p)).map(surface)
const skillSurfaces = walk(join(ROOT, 'packages/design-system/ds-canonical/skills')).filter((p) => SURFACE_EXT.test(p)).map(surface)
const infraSurfaces = [
  ...walk(join(ROOT, 'infra/governance/test')),
  ...walk(join(ROOT, 'infra/governance/lib')),
].filter((p) => SURFACE_EXT.test(p)).map(surface)
// harness 套件的成員清單:governance-harnesses.yml(夜間)→ run-harnesses.mjs → 這份 inventory,
// 逐一把成員跑起來。它是真的執行面,只是入口在 providers/ 而不是 workflows/ ——
// 漏掉它會讓 22 支真的每晚都在跑的測試被誤判成「沒人呼叫的孤兒」(2026-09-21)。
// 但它只在夜間跑、不擋任何東西(2026-11-18 起歸「只在夜間」那一輪,見檔頭)。
const harnessSurfaces = [surface(join(ROOT, 'infra/governance/providers/harness-source-inventory.json'))]
const workflows = readWorkflowSources(ROOT)
const packageScripts = JSON.parse(read(join(ROOT, 'package.json')) || '{}').scripts ?? {}
const workspaceScripts = readWorkspaceScripts(ROOT)
if (SELFTEST) {
  // 只在 package.json 出現:沒有任何 workflow / hook 會 `npm run` 到這條 script
  packageScripts['test:synthetic-pkg-only'] = `node scripts/${SYNTHETIC_PKG_ONLY}`
  // PR workflow:註解裡那行不該算數;`npm run` 那條經 package.json script 才是真的可達;直接 `node` 那條也是
  workflows['synthetic-selftest.yml'] = [
    'name: synthetic', 'on:', '  pull_request:', `# node scripts/${SYNTHETIC_COMMENT_ONLY}`, 'jobs:', '  x:', '    runs-on: ubuntu-24.04', '    steps:',
    '      - run: npm run test:synthetic-via-npm', `      - run: node scripts/${SYNTHETIC_PR_AND_HARNESS}`,
    `      - run: node scripts/${SYNTHETIC_PR_CALLER}`, '',
  ].join('\n')
  packageScripts['test:synthetic-via-npm'] = `node scripts/${SYNTHETIC_VIA_NPM} && node scripts/${SYNTHETIC_VIA_NPM} --selftest`
  // 只有 schedule 的 workflow(與 governance-harnesses.yml 同形):夜間;探索者 A 只在這裡被點名
  workflows['synthetic-nightly.yml'] = [
    'name: synthetic nightly', 'on:', '  schedule:', "    - cron: '0 3 * * *'", '  workflow_dispatch:', 'jobs:', '  x:', '    runs-on: ubuntu-24.04', '    steps:',
    `      - run: node scripts/${SYNTHETIC_SCHEDULED_ONLY}`, `      - run: node scripts/${SYNTHETIC_RUNNER_TEXT}`, '',
  ].join('\n')
  // 只能手動觸發的 workflow:不擋 PR、也不是排程 → 其他
  workflows['synthetic-dispatch.yml'] = [
    'name: synthetic dispatch', 'on:', '  workflow_dispatch:', 'jobs:', '  x:', '    runs-on: ubuntu-24.04', '    steps:',
    `      - run: node scripts/${SYNTHETIC_DISPATCH_ONLY}`, '',
  ].join('\n')
  // harness inventory 片段:一支只在這裡、一支同時也在 PR workflow、一支 PR caller 只在 assert / 資料裡提到
  harnessSurfaces.push({ path: 'synthetic-harness-inventory.json', text: JSON.stringify({ suites: [{ members: [`scripts/${SYNTHETIC_HARNESS_ONLY}`, `scripts/${SYNTHETIC_PR_AND_HARNESS}`, `scripts/${SYNTHETIC_ASSERT_ONLY}`] }] }) })
  // hook:HOOK_COMMENT 只在註解 / echo 字串 / 夾具寫檔提到(寬口徑原文搆得到,窄口徑的執行形狀搆不到);
  // HOOK_VAR 先放進變數、再 `node "$GATE"`(真的跑它)
  hookSurfaces.push({
    path: 'packages/design-system/ds-canonical/hooks/synthetic-selftest.sh',
    text: [
      '#!/usr/bin/env bash', `# 見 scripts/${SYNTHETIC_HOOK_COMMENT}`,
      `echo "修好後跑 node scripts/${SYNTHETIC_HOOK_COMMENT} --update"`,
      `printf '%s\\n' 'process.exit(0)' > "$FIXTURE/scripts/${SYNTHETIC_HOOK_COMMENT}"`,
      `GATE="$PROJECT_DIR/scripts/${SYNTHETIC_HOOK_VAR}"`,
      'if [ -f "$GATE" ]; then', '  OUT=$(node "$GATE" --check 2>&1 || true)', 'fi', 'exit 0', '',
    ].join('\n'),
  })
}

// ── lane:這支 workflow 會不會擋 PR ──
// 看 `on:`,用 workflow identity 同一支 YAML 解析(infra/governance/lib/workflow-trust.mjs),不另寫一份 regex(M17)。
const PR_EVENTS = new Set(['pull_request', 'pull_request_target', 'merge_group'])
const workflowLane = (name, text) => {
  let events
  try { events = Object.keys(parseWorkflowSemantics(text).on) } catch (error) {
    instrumentFail(`讀不出 .github/workflows/${name} 的 on:(${String(error?.message ?? error).split('\n')[0]})—— 分不出它擋不擋 PR,不猜`)
  }
  if (events.some((event) => PR_EVENTS.has(event))) return 'pr'
  if (events.includes('schedule')) return 'scheduled'
  return 'other'
}
const lanes = Object.fromEntries(Object.entries(workflows).map(([name, text]) => [name, workflowLane(name, text)]))
const workflowsIn = (...wanted) => Object.fromEntries(Object.entries(workflows).filter(([name]) => wanted.includes(lanes[name])))

const SELF = 'gate-reachability-invariant.mjs'
const scripts = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs'))
// 量具自己不當「呼叫者」:它的原始碼提到 baseline 裡每一支孤兒的檔名(還有對照組的合成名),
// 不排除的話它一被接進 CI,就會把所有它列出來的孤兒都「變成可達」——量具把自己量綠。
// 2026-09-18 實測:接進 CI 後對照組立刻假綠,就是這個自我參照。
const source = Object.fromEntries(scripts.filter((f) => f !== SELF).map((f) => [f, read(join(ROOT, 'scripts', f))]))
// gate-meta pair 是**動態探索**出來的:run-gate-meta-tests.mjs 掃 `scripts/test-<stem>.mjs`
// 且 `scripts/<stem>.mjs` 存在者全跑,沒有任何地方會字面提到它們的檔名。
// 只看「有沒有被字面提到」會把這些全判成孤兒 —— 那是拿「被提到」當「會被跑」的替身,
// 跟這支閘自己要守的病同一種(2026-09-21:41 支新 meta-test 全被誤判成孤兒)。
// 用同一支探索實作,不另寫一份規則(M17:同公式不得有第二個住所)。
const GATE_META_RUNNER = 'run-gate-meta-tests.mjs'
const pairs = discoverGateMetaTestPairs(ROOT)
// 動態探索的執行者 → 它會跑的檔:探索者本身在某一輪可達,它探索出來的檔就在那一輪可達
const discoveredBy = new Map([[GATE_META_RUNNER, pairs.map(({ file }) => file)]])
// test-<stem>.mjs → <stem>.mjs:meta-test 跑它的閘(多半經 runGateSelftestMeta helper,不是執行形狀,所以另立一條)
const pairGateOf = new Map(pairs.map(({ file, stem }) => [file, `${stem}.mjs`]))
if (SELFTEST) {
  for (const f of SYNTHETICS) { scripts.push(f); source[f] = `// 合成腳本 ${f}:只給對照組用\n` }
  // 探索者 A 的配對測試真的在跑它的閘(執行形狀);B 的配對測試只用 helper 呼叫(只有 test-<stem> 規則搆得到)
  source[SYNTHETIC_PAIR_TEST] = `spawnSync(process.execPath, ['scripts/${SYNTHETIC_PAIR_GATE}'])\n`
  source[SYNTHETIC_EXEC_PAIR_TEST] = `runGateSelftestMeta('scripts/${SYNTHETIC_EXEC_PAIR_GATE}')\n`
  discoveredBy.set(SYNTHETIC_RUNNER_TEXT, [SYNTHETIC_PAIR_TEST])
  discoveredBy.set(SYNTHETIC_RUNNER_EXEC, [SYNTHETIC_EXEC_PAIR_TEST])
  pairGateOf.set(SYNTHETIC_PAIR_TEST, SYNTHETIC_PAIR_GATE)
  pairGateOf.set(SYNTHETIC_EXEC_PAIR_TEST, SYNTHETIC_EXEC_PAIR_GATE)
  // PR caller:前四行只「提到」(assert 期望值 / 夾具 package.json / 訊息 / 讀原文,形狀照抄真實的
  // test-run-deterministic-deep-audit.mjs:77 與 check-provider-neutral-ssot-residue.mjs:318),後面才真的跑探索者 B
  source[SYNTHETIC_PR_CALLER] = [
    `assert.deepEqual(plan.argv, ['node', 'scripts/${SYNTHETIC_ASSERT_ONLY}', '--check'])`,
    `const fixture = { scripts: { 'x:check': 'node scripts/${SYNTHETIC_ASSERT_ONLY}' } }`,
    `console.log('修好後跑 node scripts/${SYNTHETIC_ASSERT_ONLY} --update')`,
    `const metaRunner = text('scripts/${SYNTHETIC_RUNNER_TEXT}')`,
    `const META = join(ROOT, 'scripts/${SYNTHETIC_RUNNER_EXEC}')`,
    'const result = spawnSync(process.execPath, [',
    '  META,',
    "  '--lane', 'x',",
    '], { cwd: ROOT })', '',
  ].join('\n')
}
// 窄口徑用:剔整行註解(test-<stem> 規則看它有沒有提到 <stem>)/ 只留執行形狀(遞移展開用)
const strippedSource = Object.fromEntries(Object.entries(source).map(([f, text]) => [f, stripCodeCommentLines(text)]))
const execSource = Object.fromEntries(Object.entries(source).map(([f, text]) => [f, execShapedText(text, 'js')]))

/**
 * 從一組根出發,算出會被跑到的 scripts/*.mjs。
 * @param {{ workflows: Record<string,string>, surfaces: string[], sources: Record<string,string> }} roots
 *   workflows 的 `#` 註解行由 resolver 剔除;surfaces / sources 由呼叫端決定原文或執行形狀
 */
const reachableFrom = ({ workflows: rootWorkflows, surfaces, sources }) => {
  const invocation = resolveWorkflowInvocationSurface({ workflows: rootWorkflows, packageScripts, workspaceScripts, extraSurfaces: surfaces })
  // 執行面直接提到的算可達(量具自己被 CI 呼叫,所以它本身是可達的)
  const reachable = new Set(scripts.filter((f) => invocation.corpus.includes(f)))
  const runnersReached = new Set()
  for (let changed = true; changed;) {
    changed = false
    const add = (f) => { if (!reachable.has(f)) { reachable.add(f); changed = true } }
    // 探索者自己得先在這一輪可達(跟其他腳本同一把尺:窄口徑只認執行形狀),它探索出來的東西才會被跑
    for (const [runner, files] of discoveredBy) {
      if (runnersReached.has(runner) || !reachable.has(runner)) continue
      runnersReached.add(runner)
      for (const f of files) add(f)
    }
    for (const [test, gate] of pairGateOf) if (reachable.has(test) && strippedSource[test]?.includes(gate)) add(gate)
    for (const f of scripts) {
      if (reachable.has(f)) continue
      for (const r of reachable) if (sources[r]?.includes(f)) { add(f); break }
    }
  }
  return { reachable, invocation, runnerReached: runnersReached.has(GATE_META_RUNNER), runnersReached }
}

// 寬口徑(2026-09-27 起的原量法,決定孤兒):全部 workflow + hooks + skills + infra + harness,原文
const wide = reachableFrom({
  workflows,
  surfaces: [...hookSurfaces, ...skillSurfaces, ...infraSurfaces, ...harnessSurfaces].map((s) => s.text),
  sources: source,
})
// PR 一輪:PR workflow + hook 可執行檔 + 被它們用完整路徑點名的 infra 檔;程式碼文字一律只留執行形狀
const hookExecutables = hookSurfaces.filter(isExecutable).map(execShaped)
const infraExecutables = infraSurfaces.filter(isExecutable)
const prProbeCorpus = resolveWorkflowInvocationSurface({ workflows: workflowsIn('pr'), packageScripts, workspaceScripts, extraSurfaces: hookExecutables }).corpus
const infraNamedByPr = infraExecutables.filter((s) => prProbeCorpus.includes(s.path))
const pr = reachableFrom({
  workflows: workflowsIn('pr'),
  surfaces: [...hookExecutables, ...infraNamedByPr.map(execShaped)],
  sources: execSource,
})
// PR + 夜間一輪:再加 schedule workflow、harness inventory(成員清單,提到即跑)、全部 infra 可執行檔
const nightly = reachableFrom({
  workflows: workflowsIn('pr', 'scheduled'),
  surfaces: [...hookExecutables, ...infraExecutables.map(execShaped), ...harnessSurfaces.map((s) => s.text)],
  sources: execSource,
})
// 三輪必須一層包一層(PR ⊆ PR+夜間 ⊆ 寬口徑);不是的話分類沒有意義
for (const [inner, outer, label] of [[pr, nightly, 'PR ⊆ PR+夜間'], [nightly, wide, 'PR+夜間 ⊆ 寬口徑']]) {
  const escaped = [...inner.reachable].filter((f) => !outer.reachable.has(f))
  if (escaped.length) instrumentFail(`${label} 不成立:${escaped.slice(0, 8).join(', ')} —— 窄口徑搆得到、寬口徑卻搆不到,剔註解或分 lane 的邏輯壞了`)
}

const classOf = (f) => (pr.reachable.has(f) ? 'pr' : nightly.reachable.has(f) ? 'nightly' : wide.reachable.has(f) ? 'elsewhere' : 'orphan')
const gateLike = scripts.filter((f) => GATE_LIKE.test(f)).sort()
const byClass = { pr: [], nightly: [], elsewhere: [], orphan: [] }
for (const f of gateLike) byClass[classOf(f)].push(f)
const orphans = byClass.orphan
const nightlyOnly = byClass.nightly.filter(RATCHETED_GATE)
const elsewhereOnly = byClass.elsewhere.filter(RATCHETED_GATE)

// 「刻意只手動跑」的理由帳(2026-09-27):孤兒不是只有「還沒接線」一種 —— 有的是給人看截圖的探針,CI 沒有斷言可判。
// 那種要**寫得出原因**(引得出同一件事的 CI 閘是哪一支、這支為什麼只能人看)才准留在 baseline 裡;沒寫的一律算「待接線或退役」。
// 重記(--update-baseline)時只保留仍是孤兒的條目;已接線的自動掉出。
const readManualOnly = (json) => {
  const entries = Object.entries(json.manualOnly ?? {})
  for (const [file, why] of entries) {
    if (typeof why !== 'string' || why.trim().length < 20) { console.error(`✗ baseline.manualOnly["${file}"] 的理由必須是一段引得出原因的文字(≥ 20 字),實得 ${JSON.stringify(why)}`); process.exit(2) }
  }
  return Object.fromEntries(entries)
}

if (UPDATE) {
  if (SELFTEST) instrumentFail('--selftest 與 --update-baseline 不能一起用(會把合成腳本寫進 baseline)')
  const previous = existsSync(BASELINE) ? readManualOnly(JSON.parse(read(BASELINE))) : {}
  const manualOnly = Object.fromEntries(Object.entries(previous).filter(([f]) => orphans.includes(f)))
  writeFileSync(BASELINE, JSON.stringify({
    note: '寫了閘就要有人跑它。orphans 記的是「目前沒有任何執行面會呼叫」的閘/測試腳本;nightlyOnly 記的是名字像閘(不含 test- 開頭)、只在夜間 harness / 只有 schedule 的 workflow 跑得到、PR 上沒有任何東西會因為它變紅的腳本(PR 會跑的腳本只在 assert / 資料 / 訊息裡提到它不算 PR 跑它,只認 spawn / exec / import 等執行形狀);elsewhereOnly 記的是只在技能文件 / 註解 / 腳本裡提到但不跑 / 發布或手動 workflow 被提到的。三份清單的數字都只准往下 —— 新增任一類都會讓 gate-reachability-invariant.mjs 變紅。清掉之後(接進 PR 執行面或退役)跑 --update-baseline 重記。manualOnly:刻意只手動跑的那幾支孤兒,每支都要寫得出原因(同一件事的 CI 閘是哪一支、為什麼只能人看);沒寫的算待接線或退役。',
    generatedBy: 'scripts/gate-reachability-invariant.mjs --update-baseline',
    count: orphans.length,
    orphans,
    manualOnly,
    nightlyOnlyCount: nightlyOnly.length,
    nightlyOnly,
    elsewhereOnlyCount: elsewhereOnly.length,
    elsewhereOnly,
  }, null, 2) + '\n')
  console.log(`baseline 已更新:${orphans.length} 支孤兒(其中 ${Object.keys(manualOnly).length} 支刻意只手動跑)、${nightlyOnly.length} 支只在夜間可達、${elsewhereOnly.length} 支只在其他非 PR 面被提到 → ${BASELINE.replace(ROOT + '/', '')}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) instrumentFail(`找不到 baseline(${BASELINE})—— 先跑 --update-baseline`)
const baseline = JSON.parse(read(BASELINE))
// 計數與清單必須一致:手改其中一個沒改另一個,棘輪比的就不是同一份東西
for (const [countKey, listKey] of [['count', 'orphans'], ['nightlyOnlyCount', 'nightlyOnly'], ['elsewhereOnlyCount', 'elsewhereOnly']]) {
  if (!Array.isArray(baseline[listKey]) || baseline[countKey] !== baseline[listKey].length) {
    instrumentFail(`baseline 的 ${countKey}(${JSON.stringify(baseline[countKey])})與 ${listKey} 的長度(${Array.isArray(baseline[listKey]) ? baseline[listKey].length : '不是陣列'})對不上 —— 跑 --update-baseline 重記`)
  }
}
const manualOnly = readManualOnly(baseline)
const diffAgainst = (current, recorded) => ({
  added: current.filter((f) => !recorded.includes(f)),
  fixed: recorded.filter((f) => !current.includes(f)),
})
const orphanDiff = diffAgainst(orphans, baseline.orphans)
const nightlyDiff = diffAgainst(nightlyOnly, baseline.nightlyOnly)
const elsewhereDiff = diffAgainst(elsewhereOnly, baseline.elsewhereOnly)
// 理由帳裡的檔已經有人呼叫了 → 帳過期(它不再是孤兒,理由也不該再掛著)
const staleManual = Object.keys(manualOnly).filter((f) => !orphans.includes(f))
const pending = orphans.filter((f) => !(f in manualOnly))
const tests = (list) => list.filter((f) => f.startsWith('test-')).length

console.log(`掃描 ${scripts.length} 支 scripts/*.mjs;寬口徑(CI workflow 直接或經 npm run / hooks / skills / infra / harness)可達 ${wide.reachable.size} 支;被執行面觸發到的 npm script ${wide.invocation.npmScripts.size} 條`)
console.log(`workflow 分 lane:PR ${Object.keys(workflowsIn('pr')).sort().join(' ')} | 只有排程 ${Object.keys(workflowsIn('scheduled')).sort().join(' ')} | 其他 ${Object.keys(workflowsIn('other')).length} 支`)
console.log(`名字像閘/測試的 ${gateLike.length} 支,分四類:`)
console.log(`  PR 可達:${byClass.pr.length} 支`)
console.log(`  只在夜間可達:${byClass.nightly.length} 支 —— 名字像閘的 ${nightlyOnly.length} 支棘輪(baseline ${baseline.nightlyOnlyCount});test- 開頭 ${tests(byClass.nightly)} 支只列數`)
for (const f of nightlyOnly) console.log(`    · scripts/${f}`)
console.log(`  只在其他非 PR 面被提到(技能文件 / 註解 / 發布或手動 workflow):${byClass.elsewhere.length} 支 —— 名字像閘的 ${elsewhereOnly.length} 支棘輪(baseline ${baseline.elsewhereOnlyCount});test- 開頭 ${tests(byClass.elsewhere)} 支只列數`)
for (const f of elsewhereOnly) console.log(`    · scripts/${f}`)
console.log(`  沒人呼叫(孤兒):${orphans.length} 支(baseline ${baseline.count};其中刻意只手動跑、理由已記 ${Object.keys(manualOnly).length - staleManual.length} 支)`)
for (const [f, why] of Object.entries(manualOnly)) if (orphans.includes(f)) console.log(`    · 刻意只手動跑:scripts/${f} —— ${why}`)
for (const f of pending) console.log(`    · 待接線或退役:scripts/${f}`)
console.log(`  gate-meta runner(${GATE_META_RUNNER})可達(窄口徑只認執行形狀):PR ${pr.runnerReached ? '是' : '否'} / PR+夜間 ${nightly.runnerReached ? '是' : '否'} / 寬口徑 ${wide.runnerReached ? '是' : '否'}`)
if (!wide.runnerReached) console.log(`⚠️  ${GATE_META_RUNNER} 自己不可達 —— 它探索出來的 meta-test 一律照孤兒計`)

const reminders = [
  [orphanDiff.fixed, '孤兒已接好線或已退役'],
  [nightlyDiff.fixed, '只在夜間的已接進 PR 執行面(或已移走)'],
  [elsewhereDiff.fixed, '只在其他面的已接進執行面(或已移走)'],
]
for (const [list, what] of reminders) {
  if (list.length) console.log(`↓ ${what} ${list.length} 支:${list.slice(0, 8).join(', ')}${list.length > 8 ? ' …' : ''}\n   → 跑 --update-baseline 把它們從 baseline 移除,數字才會真的往下`)
}
for (const f of staleManual) console.log(`  ✗ manualOnly 記的 scripts/${f} 已有執行面呼叫,理由帳過期 —— 跑 --update-baseline 重記`)
for (const f of orphanDiff.added) console.log(`  ✗ 新增孤兒:scripts/${f} —— 沒有任何 CI workflow / npm script / hook 會呼叫它,它宣稱的保護不存在`)
for (const f of nightlyDiff.added) console.log(`  ✗ 新增只在夜間可達:scripts/${f} —— 只有夜間 harness / 排程 workflow 會跑它,PR 上沒有任何東西會因為它變紅;接進 PR 執行面(ci.yml 等),確定只能夜間跑就 --update-baseline 讓清單的差異出現在 PR diff 裡`)
for (const f of elsewhereDiff.added) console.log(`  ✗ 新增只在其他面被提到:scripts/${f} —— 只有技能文件 / 註解 / 發布或手動 workflow 提到它;接進 PR 執行面,確定不該在 PR 跑就 --update-baseline`)

const red = orphanDiff.added.length + nightlyDiff.added.length + elsewhereDiff.added.length + staleManual.length

if (SELFTEST) {
  // 逐支驗:落在哪一類 + 該紅的有沒有真的進到「新增」清單。
  // 期望值全部寫死、由合成情境決定(WP-18 反駁 #1):舊版配對那一格取自受測程式算出的 runnerReached,
  // runner 判錯時期望值跟著錯,selftest 永遠對得上 —— 那一格等於沒驗。
  const expected = {
    [SYNTHETIC]: 'orphan', [SYNTHETIC_PKG_ONLY]: 'orphan', [SYNTHETIC_COMMENT_ONLY]: 'orphan',
    [SYNTHETIC_VIA_NPM]: 'pr', [SYNTHETIC_PR_AND_HARNESS]: 'pr', [SYNTHETIC_PR_CALLER]: 'pr',
    [SYNTHETIC_RUNNER_EXEC]: 'pr', [SYNTHETIC_EXEC_PAIR_TEST]: 'pr', [SYNTHETIC_EXEC_PAIR_GATE]: 'pr', [SYNTHETIC_HOOK_VAR]: 'pr',
    [SYNTHETIC_HARNESS_ONLY]: 'nightly', [SYNTHETIC_SCHEDULED_ONLY]: 'nightly', [SYNTHETIC_ASSERT_ONLY]: 'nightly',
    [SYNTHETIC_RUNNER_TEXT]: 'nightly', [SYNTHETIC_PAIR_TEST]: 'nightly', [SYNTHETIC_PAIR_GATE]: 'nightly',
    [SYNTHETIC_DISPATCH_ONLY]: 'elsewhere', [SYNTHETIC_HOOK_COMMENT]: 'elsewhere',
  }
  if (Object.keys(expected).length !== SYNTHETICS.length) instrumentFail(`selftest 期望表 ${Object.keys(expected).length} 格、合成腳本 ${SYNTHETICS.length} 支,對不上`)
  const addedBy = { orphan: orphanDiff.added, nightly: nightlyDiff.added, elsewhere: elsewhereDiff.added, pr: [] }
  let ok = true
  for (const [f, want] of Object.entries(expected)) {
    const got = classOf(f)
    const mustBeAdded = want !== 'pr' && (want === 'orphan' || RATCHETED_GATE(f))
    const flagged = !mustBeAdded || addedBy[want].includes(f)
    const pass = got === want && flagged
    if (!pass) ok = false
    console.log(`  ${pass ? '✓' : '✗'} selftest ${f}:應為 ${want}、實得 ${got}${mustBeAdded ? `,${flagged ? '有' : '沒有'}讓判定變紅` : ''}`)
  }
  if (ok && red > 0) { console.log(`\n✓ selftest:${SYNTHETICS.length} 支合成腳本各自落在該在的類,該紅的都讓判定變紅,量具會紅也會放行`); process.exit(0) }
  console.log('\n✗ selftest:有合成腳本落錯類(或判定沒變紅)—— 這支是假綠,不能當證據'); process.exit(1)
}
if (red) {
  console.log(`\n✗ ${orphanDiff.added.length} 支新增孤兒 / ${nightlyDiff.added.length} 支新增只在夜間 / ${elsewhereDiff.added.length} 支新增只在其他面 / ${staleManual.length} 筆 manualOnly 理由帳過期 —— 新寫的閘必須同時接進 PR 執行面`)
  process.exit(1)
}
console.log(`\n✓ 沒有新增(孤兒 ${orphans.length}:待接線或退役 ${pending.length}、刻意只手動跑且理由已記 ${orphans.length - pending.length};只在夜間 ${nightlyOnly.length};只在其他 ${elsewhereOnly.length};數字只准往下)`)
process.exit(0)
