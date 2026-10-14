import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'
import { parseWorkflowSemantics } from '../lib/workflow-trust.mjs'
import { REBAKE_REQUEST_PATH, parseRebakeRequest } from '../../../scripts/visual-rebake-request.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const readWorkflow = name => readFileSync(resolve(ROOT, `.github/workflows/${name}`), 'utf8')

test('CI is the only PR/push gate and stays within the fast deterministic scope', () => {
  const source = readWorkflow('ci.yml')
  const workflow = parseWorkflowSemantics(source)
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch'])
  // 2026-09-08:單一 verify job 連兩次 15 分鐘逾時被取消(瀏覽器閘 586 秒 + 治理檢查 249 秒 + 安裝與 build)。
  // 拆成三個平行 job;required check 的 context 名字不變,由 `verify` fan-in:它必須 `if: always()` 並明確檢查
  // 每個上游的 result —— GitHub 把 skipped 的 required check 當通過,上游紅了若讓 fan-in 被 skip 就等於沒閘。
  // 2026-09-17:第七個跑東西的 job `verify-browser-sweeps` —— 兩支「全 1034 支 story 掃一遍」的閘
  //(Avatar 錨點外框 / 浮層選項列前緣)各約 5–6 分鐘,原本掛在 dpr2 job 上把它撐爆 25 分被取消。
  // 2026-09-12:第六個跑東西的 job `verify-browser-overlay`。interaction job 連兩次跑滿 15 分被 cancel,
  // CI 逐支計時顯示浮層 / 主題閘合計 437 秒 = 整步的 54%。調高上限撞下面那條契約(試過),
  // 搬到排程 deep gates 又不對(這幾支守的是剛回報過的回歸,必須每個 PR 跑),
  // 所以照 2026-09-08 的先例再拆一個平行 job。
  // 2026-09-15:第七個跑東西的 job `verify-browser-datatable-perception`。DataTable 像素 job 跑到 24 分鐘貼著
  // 25 分鐘上限(8b1137c7 被砍),CI 逐支計時顯示感知 / 把手 / 釘選 resize 那段佔 10 分鐘,照 2026-09-10 拆 dpr2 的先例再拆。
  // 2026-09-17:第八個跑東西的 job `verify-browser-select-all`。它跟 sweeps 一樣全 story 掃,但**還要開面板**
  //(逐一點開觸發點、按一下全選、再量一次),本機 6.6 分,疊進 sweeps 必撞 25 分上限,所以自己一個 job。
  // 2026-09-20:第九個跑東西的 job `verify-browser-field-edges`。select-all 一個 job 序列跑五支
  // 全 story 掃描,實測 1076 秒(17.9 分)—— 是關鍵路徑第二長的,而那五支彼此獨立、只共用同一份
  // storybook build。拆一半出來平行跑,各自約 9-10 分。user 原話:「你他媽發版到底是要發多久?」
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['container-closed-git', 'governance-control-plane', 'hooks-linux', 'verify', 'verify-browser-agent', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-datatable-handles', 'verify-browser-datatable-perception', 'verify-browser-field-edges', 'verify-browser-interaction', 'verify-browser-overlay', 'verify-browser-overlay-rows', 'verify-browser-searchable-fields', 'verify-browser-select-all', 'verify-browser-sweeps', 'verify-browser-tree-navigation', 'verify-static'])
  assert.equal(workflow.jobs.verify.name, 'Verify(tsc + tests + compile + build)')
  assert.equal(workflow.jobs.verify.timeoutMinutes, 15)
  assert.equal(workflow.jobs.verify.if, 'always()')
  // 2026-09-21:hooks-linux 進 fan-in。先前它**既不在 needs、也不是 required check** ——
  // 發版同意 hook 的整套端對端測試(17 格)全紅也擋不住合併與發版,等於那道防線沒有機械面。
  // 原註解說「它留在 verify 之外,讓 hook 失敗讀起來就是 hook 失敗」—— 可讀性不該用「不把關」換。
  assert.deepEqual([...workflow.jobs.verify.needs].sort(), ['container-closed-git', 'governance-control-plane', 'hooks-linux', 'verify-browser-agent', 'verify-browser-datatable', 'verify-browser-datatable-dpr2', 'verify-browser-datatable-handles', 'verify-browser-datatable-perception', 'verify-browser-field-edges', 'verify-browser-interaction', 'verify-browser-overlay', 'verify-browser-overlay-rows', 'verify-browser-searchable-fields', 'verify-browser-select-all', 'verify-browser-sweeps', 'verify-browser-tree-navigation', 'verify-static'])
  // 解析器只留 runSha256 與 env(不留 run 原文):上游 result 必須經 env 進來,再由原始文字驗它們全部 = success 才過。
  const fanInEnv = JSON.stringify(workflow.jobs.verify.steps[0].env)
  // 2026-09-11:兩個 DataTable job 的上限 15 → 25。那天 `verify-browser-datatable` 跑到 15.4 分被砍掉
  // (砍掉的那次每一項判定其實都是綠的),原因是同一天把快速捲動閘 `--runs` 2→3、感知閘重跑上限 3→5 ——
  // 自己加的工作量,不是機器變慢。逾時本身不是品質訊號,但**上限仍是契約**:只有 SLOW_BROWSER_JOBS
  // 這個集合裡的 job 可以到 25(每一筆的理由與實測數字寫在集合旁),其餘一律 15,而且沒有任何 job 可以超過 25
  //(否則就不再是「快速 deterministic 範圍」了)。2026-09-22 稽核:這段原本寫「只有 DataTable 的三個」,
  // 與下方集合早已不符 —— 註解要指向集合,不要重抄集合。
  // verify-browser-sweeps 一併列入(2026-09-17):它跑兩支「全 1034 支 story 掃一遍」的閘,
  // CI 實測 Avatar 7.3 分 + 選項列前緣 ≥ 9 分,15 分鐘會被取消。
  // verify-browser-select-all 同列(2026-09-17):同樣是全 story 掃,而且每支還要開面板互動,本機 6.6 分。
  // verify-browser-interaction 同列(2026-09-21):12 筆 CI 實測 10.8–13.0 分全成功,一次 15.2 分
  // 撞到 15 分預算被取消 —— 而 job 逾時在 GitHub 上是 `cancelled`,那一輪因此沒有裁決,
  // 發布閘只能 fail closed,一次機器變異就把已合併的版本卡住。
  // verify-browser-overlay 同列(2026-09-27):2026-09-12 拆出來時兩邊各 7-9 分,之後閘又加了(form-gap-token 等),
  // 本分支 8 筆 CI 實測 11.9–14.6 分成功、15.1 / 15.1 / 15.2 分三次撞 15 分被取消(被砍前的判定全綠);
  // 同 interaction 的理由:逾時毀掉的是裁決,不是品質訊號。
  // verify-browser-searchable-fields 同列(2026-10-07):從 interaction 拆出的可搜尋欄位按鍵閘 + 從 datatable-handles 搬來的選單焦點閘,
  // 建置 + 安裝約 4 分、兩支閘本機合計約 10 分(CI 約 1.2–1.4 倍)→ 估 15–18 分,15 分上限會被取消。
  const SLOW_BROWSER_JOBS = new Set(['verify-browser-searchable-fields', 'verify-browser-datatable', 'verify-browser-datatable-perception', 'verify-browser-datatable-dpr2', 'verify-browser-sweeps', 'verify-browser-select-all', 'verify-browser-overlay-rows', 'verify-browser-datatable-handles', 'verify-browser-interaction', 'verify-browser-overlay'])
  for (const upstream of ['verify-static', 'verify-browser-datatable', 'verify-browser-datatable-perception', 'verify-browser-datatable-dpr2', 'verify-browser-searchable-fields', 'verify-browser-tree-navigation', 'verify-browser-interaction', 'verify-browser-overlay', 'verify-browser-agent', 'verify-browser-sweeps', 'verify-browser-select-all', 'verify-browser-field-edges', 'verify-browser-overlay-rows', 'verify-browser-datatable-handles', 'hooks-linux', 'governance-control-plane', 'container-closed-git']) {
    assert.match(fanInEnv, new RegExp(`needs\\.${upstream}\\.result`))
    assert.equal(workflow.jobs[upstream].timeoutMinutes, SLOW_BROWSER_JOBS.has(upstream) ? 25 : 15)
    assert.equal(workflow.jobs[upstream].if, null)
    assert.equal(workflow.jobs[upstream].needs, null)
  }
  // 2026-09-20:原本只斷言一段寫死的前綴,而且**只驗 env 變數存在**(上面那圈)——
  // 一個 job 可以同時出現在 needs 與 env,卻沒有被判斷式檢查,於是它紅了 verify 照樣綠。
  // 「env 有宣告」被當成「它真的在把關」,正是同一族的代理錯誤(M37)。
  // 改成從 env 反推:**每一個上游的 result 變數都必須出現在判斷式裡**,漏一個就紅。
  // parseWorkflowSemantics 只給 runSha256,不給 run 原文 —— 判斷式要從原始檔文字取。
  const fanInStep = workflow.jobs.verify.steps[0]
  const gateLine = source.split('\n').find(line => line.includes('" = success ]'))
  assert.ok(gateLine, 'fan-in 必須有一行實際檢查每個上游結果的判斷式')
  for (const [name, expr] of Object.entries(fanInStep.env)) {
    assert.match(String(expr), /needs\.[a-z0-9-]+\.result/, `${name} 必須綁到某個上游的 result`)
    assert.ok(gateLine.includes(`[ "$${name}" = success ]`),
      `${name} 出現在 env 卻沒有被判斷式檢查 —— 那個 job 紅了 verify 仍會綠`)
  }
  assert.equal(Object.keys(fanInStep.env).length, workflow.jobs.verify.needs.length,
    'fan-in 的 env 數必須等於 needs 數:少一個就有 job 不被檢查')
  // The shell hooks only ever ran on macOS, which is how BSD-only `stat -c` / `date -d` fallbacks
  // shipped to Linux cloud sessions. This job is their Linux regression gate inside the fast PR scope.
  // (2026-09-22 稽核:它**已經**在 `verify` 的 fan-in 裡 —— 上方迴圈就在斷言 `needs.hooks-linux.result`;
  // 先前這段寫「stays out of verify」與同檔斷言矛盾。hook 失敗仍以自己的 job 名稱呈現,可讀性不變。)
  assert.equal(workflow.jobs['hooks-linux'].name, 'Governance hooks(Linux portability)')
  assert.equal(workflow.jobs['hooks-linux'].timeoutMinutes, 15)
  // 2026-09-21:governance-control-plane 進 fan-in。這四支治理套件從 2026-09-08 起就被
  // ci-gate-coverage 的 NOT_A_PR_GATE 明列為「目前是紅的」—— 而正因為沒人跑,紅了就沒人修。
  assert.equal(workflow.jobs['governance-control-plane'].name, 'Governance control plane(套件測試 + provider-neutral 殘留)')
  assert.equal(workflow.jobs['governance-control-plane'].timeoutMinutes, 15)
  assert.match(source, /npm run hooks:test/)
  // 2026-09-23:container-closed-git 進 fan-in。Visual Regression 的容器設定(映像、簽出旗標、closed git 在 root 對
  // uid 1001 簽出目錄的行為)在 PR 階段從沒被跑過:#288(缺 git-lfs)/ #289(dubious ownership)都是 user 親手按了
  // 才紅。這個 job 用同一個映像跑同一段開頭命令 + 三面對照組(閘自帶 --require:略過不准算綠);映像 tag 必須與
  // visual-regression.yml 相同,而那個 tag 又被下方的測試釘在 package-lock 的 playwright 版本上(SSOT 是 lock)。
  const containerJob = workflow.jobs['container-closed-git']
  assert.equal(containerJob.timeoutMinutes, 15)
  const visualImage = parseWorkflowSemantics(readWorkflow('visual-regression.yml')).jobs['visual-regression'].container?.image
  assert.ok(typeof visualImage === 'string' && visualImage.length > 0)
  assert.equal(containerJob.container?.image, visualImage, 'PR 階段的容器 job 必須跟 Visual Regression 用同一個映像,否則測的是另一個環境')
  assert.match(source, /node scripts\/closed-git-foreign-owner-invariant\.mjs --require --workspace="\$GITHUB_WORKSPACE"/)
  assert.match(source, /node scripts\/visual-baseline-diff-report\.mjs --selftest/)
  // run #297:參考樹場景過濾腳本的對照組也在同一個容器 job 跑(它在 Visual Regression 裡是重拍前的必經一步)
  assert.match(source, /node scripts\/visual-manifest-intersect\.mjs --selftest/, '過濾腳本的對照組必須在 PR 階段的容器 job 跑')
  assert.doesNotMatch(source, /^\s*lfs:\s*true\b/m, '容器裡沒有 git-lfs(#288)')
  // 同日第二次:映像沒有 jq,治理的依賴安裝走 closed 工具組缺一就停(PR #152 第一次跑就死在這裡)。
  // 補直譯器那一步兩支 workflow 必須逐字相同、而且都排在安裝依賴之前 —— 否則 PR 閘測的又是另一個環境。
  const interpreterStep = src => src.match(/- name: Provide the closed tool profile interpreters the image lacks\n\s+run: \|\n((?: {10}.*\n)+)/)?.[1]
  const visualSource = readWorkflow('visual-regression.yml')
  const containerSource = source.slice(source.indexOf('\n  container-closed-git:\n'))
  assert.ok(interpreterStep(containerSource) && interpreterStep(visualSource), '兩支容器 job 都要補齊映像缺的 closed 工具組直譯器')
  assert.equal(interpreterStep(containerSource), interpreterStep(visualSource), '補直譯器那一步必須逐字相同')
  for (const [label, src] of [['ci.yml container-closed-git', containerSource], ['visual-regression.yml', visualSource]]) {
    assert.ok(src.indexOf('Provide the closed tool profile interpreters') < src.indexOf('npm run --silent setup:dependencies'), `${label}:補直譯器必須排在安裝依賴之前`)
  }
  // 沒有任何 job 可以超過 25 分鐘(上面兩個 DataTable job 是唯一的例外值)。
  for (const [id, job] of Object.entries(workflow.jobs)) assert.ok((job.timeoutMinutes ?? 0) <= 25, `${id} timeout-minutes ${job.timeoutMinutes} > 25`)
  // Each job that runs code installs once; the fan-in job checks out nothing and installs nothing.
  // +1(2026-09-16):DataTable pixel job 的**參考建置(main)**在 tmp/ref-src 裡另裝一次,同樣走受管的 setup:dependencies
  //(原本是裸 `npm ci`,被 scripts/audit-workflow-security.mjs 判 WF-LIFECYCLE / SIGNATURE / VULNERABILITY,
  // 讓「Verify authority candidate without credentials」每支 PR 都紅)。
  const installingJobs = Object.entries(workflow.jobs).filter(([id]) => id !== 'verify')
  // 2026-09-29:參考建置的重裝改用**候選(HEAD)的**治理程式(`setup-authority-governance.mjs --root=tmp/ref-src`),
  // 不再呼叫參考樹自己的 `setup:dependencies`(main 上那份不認得之後才登記的通報形狀 → 候選一改相依就死在安裝;ad442603 首跑),
  // 所以 `setup:dependencies` 的出現次數回到「每個會跑程式的 job 各一次」。
  assert.equal((source.match(/setup:dependencies/g) ?? []).length, installingJobs.length)
  const commandLines = source.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
  assert.equal((commandLines.match(/\bnpm ci\b/g) ?? []).length, 0, 'ci.yml 不得出現裸 npm ci(參考建置也走 setup:dependencies;註解不算)')
  // 2026-09-23:參考建置(main)的 lock 與候選相同時共用候選已驗證的 node_modules,不再第二次安裝 ——
  // 否則「比 main」綁死在「main 裝得起來」,main 上的供應鏈閘一紅,連修它的 PR 都過不了(#153 第一輪)。
  // lock 不同才重裝;symlink 必須在移除 worktree 前先解開。
  const referenceBuild = source.slice(source.indexOf('git worktree add tmp/ref-src'), source.indexOf('git worktree remove --force tmp/ref-src'))
  assert.match(referenceBuild, /if cmp -s package-lock\.json tmp\/ref-src\/package-lock\.json; then\n\s+echo[^\n]*\n\s+ln -s "\$PWD\/node_modules" tmp\/ref-src\/node_modules\n\s+else\n(?:\s+#[^\n]*\n)*\s+echo[^\n]*\n\s+node "\$GITHUB_WORKSPACE\/scripts\/setup-authority-governance\.mjs" --dependencies-only --root=tmp\/ref-src --vulnerability-policy=report-render-only-reference\n\s+fi/, '參考建置:lock 相同共用 node_modules,不同才用候選的治理程式對參考樹安裝(弱點只報告、完整性照擋),不得呼叫參考樹自己的 setup:dependencies')
  assert.doesNotMatch(referenceBuild, /cd tmp\/ref-src && npm run --silent setup:dependencies/, '參考樹不得再跑自己那份 bootstrap(main 上的舊形狀會把候選鎖死)')
  assert.match(referenceBuild, /\[ -L tmp\/ref-src\/node_modules \] && rm tmp\/ref-src\/node_modules\n\s*$/, '移除 worktree 前必須先解開 symlink')
  assert.equal(workflow.jobs.verify.steps.length, 1)
  // 瀏覽器閘的兩個 job 都要自己 build storybook 與裝 chromium(彼此平行,不共用 artifact):
  // build-storybook 出現 3 次(static 的 manifest 驗證 + 兩個瀏覽器 job),playwright install 2 次。
  // 5 → 6(2026-09-11):DataTable pixel job 另外 build 一份**參考建置(main)**,
  // 因為空白那條斷言唯一不受 runner 漂移影響的形式是「同 job 交錯比 main」——
  // 同一份元件邏輯在 CI 上量到空白中位 162 / 325 / 485 / 471 / 687ms(4 倍散佈),絕對門檻只是在量那台機器。
  // 6 → 7 / 4 → 5(2026-09-12):新增 verify-browser-overlay,它同樣自己 build storybook 與裝 chromium。
  // 7 → 8 / 5 → 6(2026-09-15):新增 verify-browser-datatable-perception,同樣自己 build storybook 與裝 chromium。
  // 8 → 9 / 6 → 7(2026-09-17):新增 verify-browser-sweeps(兩支全 story 掃描),同樣自己 build storybook 與裝 chromium。
  // 9 → 10 / 7 → 8(2026-09-17):新增 verify-browser-select-all(多選 footer 標籤 / 狀態),同上。
  // 10 → 11 / 8 → 9(2026-09-20):新增 verify-browser-field-edges。它是從 select-all 拆出來的,
  // 不是新工作量 —— 那五支掃描原本在同一個 job 裡排隊(實測 1076 秒),拆成兩個平行 job 之後
  // 牆鐘減半。代價是多一份 storybook build 與一次 chromium 安裝(算力),換掉的是使用者等待時間。
  // 11 → 12 / 9 → 10(2026-09-20,同日第二次):再把 sweeps 拆成兩個。**誠實記錄**:第一次拆的是
  // 第二長的 select-all(1076→508 秒),關鍵路徑 sweeps 1183 秒原封不動 —— 我當時在 commit 裡
  // 寫「關鍵路徑砍掉三分之一」是錯的。這次才動到第一名,瓶頸讓位給 perception(1055 秒)。
  // 12 → 13 / 10 → 11(2026-09-21):把 perception 的「把手 / 釘選 resize / dpr1 迴圈」拆成
  // verify-browser-datatable-handles。原因是同日把該 job 裡對照組的逾時由寫死 120s 改成由子行程
  // 的 MAX_ATTEMPTS 推導(根因:子行程依設計最多重試 5 次、每次約 38 秒,父行程卻只給 120 秒),
  // 放寬後最壞情況會把原 job 推到 25 分鐘上限。
  // 13 → 14 / 11 → 12(2026-10-07):新增 verify-browser-searchable-fields(從 interaction / datatable-handles 拆出,同樣自己 build storybook 與裝 chromium)。
  // 14 → 15 / 12 → 13(2026-10-07):新增 verify-browser-tree-navigation(TreeView 步驟導覽閘 + 從 interaction 搬來的鍵盤路線閘)。
  assert.equal((source.match(/npm run build-storybook/g) ?? []).length, 15)
  assert.equal((source.match(/playwright install chromium/g) ?? []).length, 13)
  // 2026-09-25:**必需瀏覽器的 lane**。裝了 Chromium 跑閘的 job 裡起不了瀏覽器 = 這個 job 壞了;
  // 共用政策(scripts/lib/launch-browser.mjs exitOnBrowserLaunchFailure)只有在 GOVERNANCE_BROWSER_REQUIRED=1 時
  // 才 exit 非 0,未宣告就印 SKIPPED-ENV、exit 0 —— 整批閘靜默通過(M37:沒量到被讀成沒發生)。
  // 從「這個 job 會不會裝 Chromium」反推必須宣告(不寫死 job 名單,新拆的瀏覽器 job 漏宣告就紅);
  // 沒裝 Chromium 的 job(verify-static 等)不得宣告 —— 那裡刻意在無瀏覽器環境跑判定表(test:launch-browser 就在那)。
  const jobIds = Object.keys(workflow.jobs)
  const jobBlock = (id) => {
    const start = source.indexOf(`\n  ${id}:\n`)
    assert.ok(start >= 0, `找不到 job ${id} 的原始文字`)
    const rest = source.slice(start + 1)
    const next = rest.slice(1).search(/\n  [a-z0-9-]+:\n/)
    return next < 0 ? rest : rest.slice(0, next + 1)
  }
  const browserJobs = []
  for (const id of jobIds) {
    const commands = jobBlock(id).split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
    const installsChromium = /playwright install chromium/.test(commands)
    if (installsChromium) browserJobs.push(id)
    assert.equal(workflow.jobs[id].env?.GOVERNANCE_BROWSER_REQUIRED ?? null, installsChromium ? '1' : null,
      installsChromium
        ? `${id} 裝了 Chromium 跑瀏覽器閘,必須在 job 層宣告 GOVERNANCE_BROWSER_REQUIRED: '1'(否則起不了瀏覽器會被印成 SKIPPED-ENV 當通過)`
        : `${id} 沒有裝 Chromium,不得宣告 GOVERNANCE_BROWSER_REQUIRED(那裡的判定表刻意在無瀏覽器環境跑)`)
  }
  // 11 → 12(2026-10-07):新增 verify-browser-searchable-fields。
  // 12 → 13(2026-10-07):新增 verify-browser-tree-navigation。
  assert.equal(browserJobs.length, 13, '宣告必需瀏覽器的 job 數必須等於裝 Chromium 的 job 數')
  assert.match(jobBlock('verify-static'), /\n\s+npm run test:launch-browser\n/, '「起不了瀏覽器」政策的兩面對照必須在沒有瀏覽器的 verify-static 跑')
  for (const command of [
    'npm run build:lib',
    'npx --no-install tsc -b',
    'npm run build-storybook',
    '/usr/bin/git diff --exit-code -- packages/design-system/ds-story-manifest.json',
    'node --test infra/governance/test/ci-workflow-scope.test.mjs',
    "node --test --test-name-pattern='canonical GitHub profile minima' infra/governance/test/model-validation.test.mjs",
    'node --test infra/governance/test/workflow-identity-sync.test.mjs',
    'node --test infra/governance/test/release-workflow.test.mjs',
    'node scripts/governance-build-graph.mjs --check',
    'npm run build',
  ]) assert.match(source, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  // 2026-09-29(待辦總帳 OE8):視覺稽核以前整支排除在 PR 閘之外 —— 像素比對是釘死容器的 Ubuntu 渲染、a11y 另有基線閘、全量 131 場景
  // 100 秒。現在只准**一種確定性形狀**進 PR:只掃改到的元件、不做像素比對、不跑 a11y、base 明確傳入(沒有本地 main 的乾淨 checkout
  // 不准靜默算出 0 個元件)。任何其他形狀的 visual-audit 呼叫(--scope=all、帶 diff、沒給 base)仍然禁止。
  const ALLOWED_VISUAL_AUDIT = 'node scripts/visual-audit.mjs --static --scope=changed --no-diff --no-a11y --base="${VISUAL_AUDIT_BASE}"'
  assert.equal(source.split(ALLOWED_VISUAL_AUDIT).length - 1, 1, '視覺稽核只准以「改到的元件 + 無像素比對 + 無 a11y + 明確 base」這一種形狀進 PR 閘,且只出現一次')
  assert.match(source, /VISUAL_AUDIT_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/, 'base 必須是 PR base sha 或 push 的前一個 head,不得留給腳本猜')
  const withoutAllowedVisualAudit = source.split('\n').filter((line) => !(line.includes('visual-audit') && (line.includes(ALLOWED_VISUAL_AUDIT) || line.trimStart().startsWith('#')))).join('\n')
  assert.doesNotMatch(withoutAllowedVisualAudit, /setup:playwright|setup:provider-cli|test:governance-harnesses|test-governance-build-graph|@qijenchen\/governance test|storybook-smoke-test|visual-audit/)
})

for (const name of [
  'a11y-and-size.yml',
  'visual-regression.yml',
  'composition-fidelity.yml',
  'packaging-canary.yml',
]) {
  test(`${name} is scheduled/manual, outside the PR gate, and reports failures truthfully`, () => {
    const source = readWorkflow(name)
    const workflow = parseWorkflowSemantics(source)
    // 2026-09-23:visual-regression 多聽一個 repository_dispatch —— 治理 token 沒有 Actions 寫入權限(按鈕 403)
    // 但能發 repository_dispatch(204);只監聽按鈕 = 把重拍綁在「user 親手登入按下去」這個代理上。事件型別封閉為一個。
    // 2026-10-14(R3):visual-regression 再多一個 push —— 只在非 main 分支、只在重拍請求檔變動時(下方專門那條測試逐項斷言);
    // 它仍然不是 PR 閘:沒有 pull_request、job 名不像必過檢查、不進 ci.yml 的 fan-in。
    const expectedTriggers = name === 'visual-regression.yml' ? ['push', 'repository_dispatch', 'schedule', 'workflow_dispatch'] : ['schedule', 'workflow_dispatch']
    assert.deepEqual(Object.keys(workflow.on).sort(), expectedTriggers)
    if (name === 'visual-regression.yml') {
      assert.match(source, /repository_dispatch:\n\s+types: \[visual-regression-run\]/)
      assert.deepEqual(workflow.on.push, { 'branches-ignore': ['main'], paths: [REBAKE_REQUEST_PATH] }, 'push 只准「非 main 分支 + 只看重拍請求檔」這一種形狀')
    }
    assert.ok(Object.values(workflow.jobs).every(job => job.continueOnError !== true))
    assert.doesNotMatch(source, /^\s{2}pull_request(?:_target)?:/m)
    if (name !== 'visual-regression.yml') assert.doesNotMatch(source, /^\s{2}push:/m)
    assert.doesNotMatch(source, /name:\s*(?:Verify\(|a11y\(|Bundle size budget|Visual Regression Diff|Composition Fidelity Diff|Packaging integrity\()/)
  })
}

test('visual-regression 的渲染器釘死在與 lock 相同版本的 Playwright 容器,而且重拍 baseline 不會直接寫進 repo', () => {
  // 2026-09-22:baseline 是 7/28 在 runner 映像 20260720.247.2 拍的;8/12 起 runner 映像每週更新
  //(20260810.271.1 → 20260907.300.1),字型／反鋸齒跟著變,25 張「超標」全是字緣差異、零區塊變動,
  // 週跑連紅六週沒人看見。渲染器一浮動,「截圖等於 baseline」就不再代表「產品沒變」。
  // 容器 tag 的版本必須等於 package-lock 鎖定的 playwright 版本 —— lock 是 SSOT,yml 不是第二份。
  const source = readWorkflow('visual-regression.yml')
  const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8'))
  const locked = lock.packages['node_modules/playwright']?.version
  assert.match(locked || '', /^\d+\.\d+\.\d+$/, 'package-lock 必須鎖定 playwright 的精確版本')
  const tag = source.match(/container:\s*\n\s*image:\s*mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble/)
  assert.ok(tag, 'visual-regression job 必須跑在 mcr.microsoft.com/playwright 官方容器裡(渲染器釘死)')
  assert.equal(tag[1], locked, `容器映像 v${tag[1]} 必須等於 lock 的 playwright ${locked} —— 兩者分開時瀏覽器與字型都會跟著分開`)
  // 重拍 baseline 只能是手動輸入,且產物走 artifact,不得直接寫 repo(接受新圖 = 產品語意決策,要走 PR + 拍板)
  assert.match(source, /update_baseline:\s*\n\s*description:/, '必須提供 update_baseline 手動輸入')
  // 三種觸發(按鈕 / repository_dispatch / 排程)的輸入收斂到 job env 的兩個變數,步驟只讀 env(SSOT);
  // 參考 commit 的預設值只能寫一次(env 的 fallback),手動輸入的 default 留空。
  assert.match(source, /UPDATE_BASELINE: \$\{\{ \(inputs\.update_baseline == true \|\| github\.event\.client_payload\.update_baseline == true/, 'UPDATE_BASELINE 必須同時接按鈕與 repository_dispatch')
  // 2026-09-29:預設參考 commit 不再寫死(每發一版就過期一次,09-27 兩次實跑都倒在它不產 build-info.json);
  // 留空由 job 內解析成「最近一次真的已發布」的 release —— tag 存在 ≠ 已發布(實查 141 個 tag 只有 128 個有 release)。
  assert.match(source, /REFERENCE_REF: \$\{\{ inputs\.reference_ref \|\| github\.event\.client_payload\.reference_ref \|\| '' \}\}/, 'REFERENCE_REF 不再寫死預設 commit:留空由 job 內解析成最近一次已發布的 release')
  assert.match(source, /name: Resolve reference ref[\s\S]{0,3000}git tag --merged origin\/main --sort=-v:refname 'v\*'[\s\S]{0,1500}releases\/tags\/[\s\S]{0,1500}echo "REFERENCE_REF=\$resolved" >> "\$GITHUB_ENV"/, '留空時必須在 job 內掃 origin/main 的 v* tag、以 Releases API 確認真的已發布、解析成完整 SHA 寫進 GITHUB_ENV(tag 存在 ≠ 已發布)')
  assert.doesNotMatch(source, /'[0-9a-f]{40}'/, '不得再寫死任何 commit 當預設參考(每發一版就過期一次)')
  assert.doesNotMatch(source.slice(source.indexOf('\njobs:\n')).replace(/inputs\.(update_baseline|reference_ref|target_ref)/g, ''), /\$\{\{[^}]*inputs\./, 'jobs 區的步驟不得直接讀 inputs,一律經 env')
  // 2026-09-23:repository_dispatch 永遠用預設分支的 workflow 檔,checkout 不指定 ref 就只拍 main ——「修了元件、baseline 要
  // 跟著換」的 PR 分支永遠拍不到。要拍哪棵樹是輸入(target_ref),不是「觸發當下 main 是哪一版」這個代理(M37)。
  assert.match(source, /target_ref:\s*\n\s*description:/, '必須提供 target_ref 輸入(要拍的分支或 commit)')
  assert.match(source, /TARGET_REF: \$\{\{ inputs\.target_ref \|\| github\.event\.client_payload\.target_ref \|\| github\.sha \}\}/, 'TARGET_REF 必須同時接按鈕與 repository_dispatch,fallback = 觸發當下的 commit')
  assert.match(source, /if: \$\{\{ env\.UPDATE_BASELINE == 'true' \}\}[\s\S]{0,200}--update-baseline/, '重拍步驟必須由 UPDATE_BASELINE 閘住')
  assert.match(source, /if: \$\{\{ env\.UPDATE_BASELINE != 'true' \}\}[\s\S]{0,200}visual-audit -- --scope=all/, '一般比對步驟必須在不重拍時跑')
  assert.match(source, /name: visual-baselines-recaptured/, '重拍結果必須以 artifact 上傳')
  // 「新拍的圖」不等於「對的圖」:重拍 job 必須自證三件事(2026-09-22)
  assert.match(source, /reference_ref:\s*\n\s*description:/, '必須提供 reference_ref 輸入(同渲染器歸因的參考 commit)')
  assert.match(source, /ref: \$\{\{ env\.REFERENCE_REF \}\}\s*\n\s*path: reference/, '參考 commit 必須簽出到子目錄,在同一個容器重拍')
  assert.match(source, /working-directory: reference[\s\S]{0,2600}--update-baseline/, '參考 commit 必須真的重拍')
  // 2026-09-23 run #291:參考樹(8/5)用它自己的治理程式裝依賴,撞到之後才登記的弱點而 fail closed —— 歷史樹永遠
  // 無法滿足今天的弱點資料庫。參考樹必須用 HEAD 的治理程式安裝(--root=.),弱點稽核走 report-render-only-reference
  //(只報告不擋;完整性照舊擋),而且不得再呼叫參考樹自己的 setup:dependencies。
  const referenceRecapture = source.slice(source.indexOf('name: Recapture the reference commit'), source.indexOf('name: Recapture curated baselines'))
  assert.match(referenceRecapture, /node "\$GITHUB_WORKSPACE\/scripts\/setup-authority-governance\.mjs" --dependencies-only --root=\. --vulnerability-policy=report-render-only-reference/, '參考樹必須用 HEAD 的治理程式、以 render-only 政策安裝')
  assert.doesNotMatch(referenceRecapture, /npm run --silent setup:dependencies/, '參考樹不得再用它自己(歷史版)的 bootstrap')
  // run #292:PLAYWRIGHT_BROWSERS_PATH=0 下瀏覽器裝在各自的 node_modules,參考樹要自己裝 Chromium,而且要在重拍之前
  const refInstall = referenceRecapture.indexOf('npx --no-install playwright install chromium --with-deps')
  const refRecapture = referenceRecapture.indexOf('--update-baseline')
  assert.ok(refInstall > 0 && refInstall < refRecapture, '參考樹必須在重拍前自己裝 Chromium(各自的 node_modules)')
  // run #293:儀器用今天的、內容用參考樹的 —— 重拍前把今天的截圖腳本 / 場景清單 / scripts/lib 蓋進參考樹,而且在建置之後
  const refBuild = referenceRecapture.indexOf('npm run build-storybook')
  // run #297:參考樹只拍它自己有的場景 —— 清單蓋進去之後、重拍之前,用參考樹的 index.json 過濾(HEAD 新增的 story 在
  // 參考樹是 404 → render error → 整條重拍紅);新增場景由歸因報告標 new-scenario。
  const intersect = 'node "$GITHUB_WORKSPACE/scripts/visual-manifest-intersect.mjs" --index storybook-static/index.json --manifest scripts/visual-assertions.json --out scripts/visual-assertions.json'
  const intersectAt = referenceRecapture.indexOf(intersect)
  const manifestOverlayAt = referenceRecapture.indexOf('cp "$GITHUB_WORKSPACE/scripts/visual-assertions.json" scripts/visual-assertions.json')
  assert.ok(intersectAt > manifestOverlayAt && manifestOverlayAt > 0 && intersectAt < refRecapture, '參考樹重拍前必須用它自己的 index.json 過濾今天的場景清單(在蓋入清單之後、重拍之前)')
  for (const overlay of ['cp "$GITHUB_WORKSPACE/scripts/visual-audit.mjs" scripts/visual-audit.mjs', 'cp "$GITHUB_WORKSPACE/scripts/visual-assertions.json" scripts/visual-assertions.json', 'cp -R "$GITHUB_WORKSPACE/scripts/lib/." scripts/lib/']) {
    const at = referenceRecapture.indexOf(overlay)
    assert.ok(at > refBuild && at < refRecapture, `參考樹重拍前必須蓋上今天的儀器:${overlay}`)
  }
  const recaptureIdx = source.indexOf('name: Recapture curated baselines(update_baseline)')
  const stabilityIdx = source.indexOf('name: Instrument stability')
  const attributeIdx = source.indexOf('name: Attribute recaptured baselines')
  assert.ok(recaptureIdx > 0 && stabilityIdx > recaptureIdx && attributeIdx > stabilityIdx, '順序必須是 重拍 → 穩定性再比 → 歸因')
  const stability = source.slice(stabilityIdx, attributeIdx)
  assert.match(stability, /visual-audit -- --scope=all\s*2>&1/, '穩定性步驟必須用**不帶** --update-baseline 的比對')
  assert.doesNotMatch(stability, /--update-baseline/, '穩定性步驟不得再寫 baseline')
  assert.doesNotMatch(stability, /continue-on-error|\|\| true/, '穩定性步驟失敗必須讓 job 紅(不穩的儀器不得產生 baseline)')
  const attribute = source.slice(attributeIdx, source.indexOf('name: Upload recaptured baselines'))
  assert.match(attribute, /visual-baseline-diff-report\.mjs --selftest/, '歸因腳本要先跑自己的對照組')
  assert.match(attribute, /--old-dir "\$RUNNER_TEMP\/reference-baseline"/, '歸因必須比對「參考 commit 在同一個容器重拍」的圖')
  assert.match(attribute, /--since-ref "\$REFERENCE_REF"/, '歸因區間必須是 REFERENCE_REF..HEAD(引號包住的 shell 變數,不直接內插)')
  // 2026-10-14(R3):artifact 的根目錄 = 審核包(新圖全部 + 相對已提交基準的 before / after / diff + 歸因報告原樣),
  // 審核包由歸因的輸出建出 —— 沒有歸因就沒有審核包(版面與判定見 scripts/visual-baseline-review-package.mjs)。
  assert.match(source, /--attribution \.git\/governance-runtime\/evidence\/visual\/baseline-diff \\\n\s+--out \.git\/governance-runtime\/evidence\/visual\/baseline-review/, '審核包必須由歸因輸出建出')
  assert.match(source, /name: visual-baselines-recaptured\s*\n\s*path: \.git\/governance-runtime\/evidence\/visual\/baseline-review\/\s*\n\s*if-no-files-found: error/, 'artifact 必須就是審核包目錄(缺包 = 紅)')
  assert.doesNotMatch(source, /git (commit|push)/, '這個 job 不得自己 commit / push baseline')
  assert.match(source, /permissions:\s*\n\s*contents: read/, '維持 contents: read')
  // 2026-09-22 run #288:容器裡沒有 git-lfs,checkout 的 LFS 旗標讓 job 在 36 秒內死在簽出階段。LFS 從沒啟用 ——
  // 為不存在的未來預留的旗標,環境一換就是硬失敗。真要用 LFS 時,同一個 PR 必須同時裝 git-lfs 並改這條斷言。
  assert.doesNotMatch(source, /^\s*lfs:\s*true\b/m, '容器內的 checkout 不得要求 git-lfs(映像沒有它;LFS 也沒在用)')
  // 2026-09-23 run #294:歸因報告跑 `git log <reference>..HEAD`,HEAD 的簽出必須帶完整歷史(重拍 job 第一個 checkout 的 fetch-depth: 0)
  // 2026-10-14:檔案裡第一個 checkout 現在是 rebake-gate 的稀疏簽出(只要兩個檔),所以從重拍 job 起算
  const recaptureJob = source.slice(source.indexOf('\n  visual-regression:\n'))
  const firstCheckout = recaptureJob.slice(recaptureJob.indexOf('- uses: actions/checkout@'), recaptureJob.indexOf('- uses: actions/setup-node@'))
  assert.match(firstCheckout, /fetch-depth: 0/, 'HEAD 的簽出必須 fetch-depth: 0,否則 reference..HEAD 的歸因區間拿不到歷史')
  assert.match(firstCheckout, /ref: \$\{\{ env\.TARGET_REF \}\}/, 'HEAD 的簽出必須拍 TARGET_REF 那棵樹(否則 PR 分支永遠拍不到)')
  assert.equal((source.match(/\bTARGET_REF\b/g) ?? []).length, 3, 'TARGET_REF 只有三處:env 宣告、註解裡的說明、第一個 checkout 的 ref(不得散到別的步驟)')
})

// 2026-10-14(待辦總帳 SM7):Visual Regression 的「Resolve reference ref」09-30 進 main 後兩次週跑(09-30 job 109831972793、
// 10-07 job 112744821910)都死在 `fatal: detected dubious ownership` —— 容器裡 root 讀 uid 1001 的簽出目錄,裸 git 拒讀;
// `for tag in $(git tag …)` 的命令替換失敗不觸發 bash -e,迴圈 0 圈 → 被印成「找不到任何有已發布 release 的 v* tag」。
// 這一條測兩件事:(1) PR 階段的容器 job 逐字跑同一步(上面那條只照搬了開頭幾步,所以 PR 抓不到);(2) 這一步本身的行為 ——
// 用 git 自己的測試開關 GIT_TEST_ASSUME_DIFFERENT_OWNER 造出「執行者 ≠ 擁有者」(不需要 root),四面:
//   A 對照組:裸 git 在這個條件下必拒(條件真的重現);B 簽出目錄 = 指名的 safe.directory → 解析出最新 release tag 的 40 碼;
//   C 簽出目錄不在信任範圍 → 儀器失效、印出 git 原話(dubious ownership),不得印成「沒有 tag / 沒有 release」;
//   D 明確輸入 reference_ref 時 git 讀不到 → 同樣是儀器失效 + git 原話,不得印成「解析不到 commit」;E 0 個 v* tag → 儀器失效。
// Releases API 以假的 curl 回 200 / draft:false 代替(這條測的是 git 那一半;API 那一半的 404 / 非 200 分支照原文不動)。
test('Visual Regression「Resolve reference ref」:git 讀不到簽出目錄 = 儀器失效並印 git 原話;PR 容器 job 逐字跑同一步', () => {
  const STEP = /- name: Resolve reference ref\(留空 = origin\/main 上最近一次已發布的 release tag\)\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: \|\n((?: {10}.*\n)+)/
  const visualSource = readWorkflow('visual-regression.yml')
  const ciSource = readWorkflow('ci.yml')
  const containerSource = ciSource.slice(ciSource.indexOf('\n  container-closed-git:\n'))
  const visualStep = visualSource.match(STEP)?.[1]
  const containerStep = containerSource.match(STEP)?.[1]
  assert.ok(visualStep, 'visual-regression.yml 找不到「Resolve reference ref」步驟')
  assert.ok(containerStep, 'ci.yml container-closed-git 必須逐字跑 Visual Regression 的「Resolve reference ref」(PR 階段才抓得到容器裡的 git 問題)')
  assert.equal(containerStep, visualStep, '兩邊的「Resolve reference ref」run 內容必須逐字相同')
  assert.ok(containerSource.indexOf('Resolve reference ref') < containerSource.indexOf('npm run --silent setup:dependencies'), '容器 job 的順序要跟 Visual Regression 一樣:解析參考 commit 在安裝依賴之前')
  const containerCheckout = containerSource.slice(containerSource.indexOf('- name: Checkout reviewed source'), containerSource.indexOf('- name: Setup Node'))
  assert.match(containerCheckout, /fetch-depth: 0/, '容器 job 的簽出必須帶完整歷史與 tag(同 Visual Regression),否則預設路徑讀不到 origin/main 與 v* tag')
  const body = visualStep.split('\n').map((line) => line.slice(10)).join('\n')
  assert.doesNotMatch(body, /for tag in \$\(/, 'tag 清單不得寫在 for 的命令替換裡(失敗會被吞成 0 圈)')
  // 只看命令位置(引號裡的訊息文字不算):剝掉雙引號字串後,行首或 ; | & ( $ 之後出現的 `git ` 才是一次呼叫
  const bareGit = body.split('\n')
    .filter((line) => !/^ws_git\(\) \{ git -c safe\.directory="\$GITHUB_WORKSPACE" "\$@"; \}$/.test(line))
    .filter((line) => /(^|[\s;|&($])git\s/.test(line.replace(/"(?:[^"\\]|\\.)*"/g, '""')))
  assert.deepEqual(bareGit, [], '這一步的每一次 git 呼叫都必須經 ws_git(只信任簽出目錄本身)')
  // Releases API 的每一次 curl 都要帶重試與逾時:container-closed-git 在必過 Verify 裡,一次暫時性 5xx / 斷線就判儀器失效
  // 會擋住合併,而 PAT 沒有 actions:write、不能重跑(#163 / 09d2eaa2 的前例)。404 不在 curl 的重試清單裡,行為不變。
  const curlCalls = body.split('\n').filter((line) => /\bcurl\s/.test(line))
  assert.ok(curlCalls.length > 0, '對照組失效:這一步找不到任何 curl 呼叫(步驟改寫了?這條斷言要跟著改,不能讓它空轉成綠)')
  for (const line of curlCalls) {
    assert.match(line, /\s--retry [1-9]\d*\s/, `Releases API 的 curl 必須帶 --retry:${line.trim()}`)
    assert.match(line, /\s--max-time [1-9]\d*\s/, `Releases API 的 curl 必須帶 --max-time(重試要有每次的上限):${line.trim()}`)
  }

  const base = realpathSync(mkdtempSync(join(tmpdir(), 'resolve-reference-ref-')))
  try {
    const hermetic = { HOME: join(base, 'home'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' }
    mkdirSync(hermetic.HOME)
    const git = (cwd, args) => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...hermetic, GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@example.invalid', GIT_COMMITTER_NAME: 'f', GIT_COMMITTER_EMAIL: 'f@example.invalid' } })
      assert.equal(r.status, 0, `fixture git ${args.join(' ')}:${r.stderr}`)
      return r.stdout.trim()
    }
    const makeRepo = (name, tags) => {
      const repo = join(base, name)
      mkdirSync(repo)
      git(repo, ['init', '-q'])
      for (const [i, tag] of tags.entries()) {
        writeFileSync(join(repo, 'f.txt'), `${i}\n`)
        git(repo, ['add', 'f.txt'])
        git(repo, ['commit', '-q', '-m', `c${i}`])
        git(repo, ['tag', tag])
      }
      if (!tags.length) { writeFileSync(join(repo, 'f.txt'), 'x\n'); git(repo, ['add', 'f.txt']); git(repo, ['commit', '-q', '-m', 'c']) }
      git(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
      return repo
    }
    const tagged = makeRepo('tagged', ['v0.1.0-beta.1', 'v0.1.0-beta.2'])
    const untagged = makeRepo('untagged', [])
    const fakeBin = join(base, 'bin')
    mkdirSync(fakeBin)
    // 假 curl:把 {"draft":false} 寫到 -o 指定的檔、回 200(只代 Releases API;git 那一半全是真的)
    writeFileSync(join(fakeBin, 'curl'), '#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && { out="$2"; shift; }; shift; done\nprintf \'{"draft":false}\' > "$out"\nprintf 200\n')
    chmodSync(join(fakeBin, 'curl'), 0o755)
    const run = ({ cwd, workspace, reference = '' }) => {
      const runnerTemp = mkdtempSync(join(base, 'runner-'))
      const envFile = join(runnerTemp, 'github-env')
      writeFileSync(envFile, '')
      const r = spawnSync('bash', ['-eo', 'pipefail', '-c', body], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...hermetic, PATH: `${fakeBin}:${process.env.PATH}`, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1', GITHUB_WORKSPACE: workspace, RUNNER_TEMP: runnerTemp, GITHUB_ENV: envFile, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture', REFERENCE_REF: reference },
      })
      return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '', env: readFileSync(envFile, 'utf8') }
    }
    // A 對照組:條件真的重現 —— 裸 git 在「執行者 ≠ 擁有者」下必拒
    const raw = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: tagged, encoding: 'utf8', env: { ...process.env, ...hermetic, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } })
    assert.equal(raw.status, 128, `對照組失效:裸 git 在 GIT_TEST_ASSUME_DIFFERENT_OWNER=1 下沒有拒絕(git ${spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim()} 不認這個開關?)`)
    assert.match(raw.stderr, /dubious ownership/)
    // B 修法生效:簽出目錄就是指名的 safe.directory → 解析出最新那個 release tag 的 40 碼並寫進 GITHUB_ENV
    const ok = run({ cwd: tagged, workspace: tagged })
    assert.equal(ok.status, 0, `B 應解析成功:${ok.stderr}`)
    assert.equal(ok.env.trim(), `REFERENCE_REF=${git(tagged, ['rev-parse', 'v0.1.0-beta.2^{commit}'])}`)
    // C 簽出目錄不在信任範圍 → 儀器失效 + git 原話;不得被讀成「沒有 tag / 沒有 release」
    const other = mkdtempSync(join(base, 'elsewhere-'))
    const broken = run({ cwd: tagged, workspace: other })
    assert.notEqual(broken.status, 0)
    assert.match(broken.stderr, /INSTRUMENT-FAIL/)
    assert.match(broken.stderr, /dubious ownership/, 'git 讀不到時必須印出 git 自己的原話')
    assert.doesNotMatch(broken.stderr, /沒有一個有已發布的 release|0 個 v\* tag/, 'git 讀不到不得被印成「沒有 tag / 沒有 release」')
    assert.equal(broken.env, '', '儀器失效時不得寫出參考 commit')
    // D 明確輸入 reference_ref + git 讀不到 → 同樣是儀器失效 + git 原話,不得印成「解析不到 commit」
    const explicit = run({ cwd: tagged, workspace: other, reference: 'v0.1.0-beta.1' })
    assert.notEqual(explicit.status, 0)
    assert.match(explicit.stderr, /dubious ownership/)
    assert.doesNotMatch(explicit.stderr, /解析不到 commit/)
    // 同一個明確輸入,git 讀得到時照常解析(對照)
    const explicitOk = run({ cwd: tagged, workspace: tagged, reference: 'v0.1.0-beta.1' })
    assert.equal(explicitOk.env.trim(), `REFERENCE_REF=${git(tagged, ['rev-parse', 'v0.1.0-beta.1^{commit}'])}`)
    // E 讀得到、但 0 個 v* tag → 儀器失效(簽出沒帶 tag),不是「沒有 release」
    const empty = run({ cwd: untagged, workspace: untagged })
    assert.notEqual(empty.status, 0)
    assert.match(empty.stderr, /INSTRUMENT-FAIL:git 讀得到 origin\/main,但上面 0 個 v\* tag/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('Pages deployment binds and reads back the exact Storybook source', () => {
  const source = readWorkflow('deploy-storybook.yml')
  const workflow = parseWorkflowSemantics(source)
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run'])
  assert.deepEqual(workflow.on.workflow_run.workflows, ['CI'])
  assert.deepEqual(workflow.on.workflow_run.types, ['completed'])
  assert.equal(workflow.jobs['deploy-pages'].needs, 'build-pages')
  assert.equal(workflow.jobs['deploy-pages'].timeoutMinutes, 15)
  for (const evidence of [
    'storybook-static/deployment.json',
    'needs.build-pages.outputs.source_sha',
    '$base_url/deployment.json?$cache_key',
    '$base_url/index.json?$cache_key',
    '$base_url/iframe.html?id=$story_id&viewMode=story&source=$EXPECTED_SHA',
    "cache_key=\"source=$EXPECTED_SHA&attempt=$attempt\"",
  ]) assert.ok(source.includes(evidence), `Pages readback evidence is missing:${evidence}`)
  assert.match(source, /jq -er '\.sourceSha'/)
  assert.match(source, /select\(\.type == \"story\"\)/)
  assert.match(source, /test "\$SOURCE_SHA" = "\$current_main_sha"/)
  const build = workflow.jobs['build-pages']
  const stepNames = build.steps.map(step => step.name).filter(Boolean)
  assert.ok(stepNames.indexOf('Rebuild exact Storybook') < stepNames.indexOf('Refuse a stale artifact before upload'))
  assert.ok(stepNames.indexOf('Refuse a stale artifact before upload') < stepNames.indexOf('Upload Pages artifact'))
})

// 2026-10-14(待辦總帳 R3):PR 分支用**自己的**這份 Visual Regression 重拍。repository_dispatch 永遠拿 main 的 workflow 檔跑,
// 而 main 那份的「Resolve reference ref」在合併前是壞的(SM7)→ 合併前沒有任何路徑能重拍;R3 的圖組要在合併前給 user 逐張看。
// push 事件跑的是被推上去那個 commit 自己的 workflow 檔,所以開一條**只在非 main、只看重拍請求檔**的 push 觸發;
// 但「觸發了」不等於「是給這條分支的請求」(合併 / rebase main 帶進來的請求檔、GitHub 對 >1,000 commit 或差異逾時一律觸發),
// 所以真正的判定在 job `rebake-gate`:請求檔的 branch 必須等於這次推送的分支。
// 這一條測五件事:(1) 觸發形狀、權限與 concurrency(以運算式求值驗性質,不只比字串);(2) 閘的形狀;
// (3) 兩支 workflow 照搬的步驟逐字相同(整個 step 區塊,不只 run);(4) env 優先序 —— 用 workflow 裡**真的那幾步**
//     (閘 → job 的 if → 讀請求檔 → Resolve reference ref)在夾具裡依序跑,按 GitHub 的 GITHUB_OUTPUT / GITHUB_ENV 規則疊加;
// (5) 審核包與上傳的條件。
const MIRRORED_CONTAINER_STEPS = Object.freeze([
  'Provide the closed tool profile interpreters the image lacks',
  'Resolve reference ref(留空 = origin/main 上最近一次已發布的 release tag)',
])
function stepBlock(source, name) {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line === `      - name: ${name}`)
  if (start < 0) return null
  const out = [lines[start]]
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || /^ {6}(?:- |#)/.test(line) || /^ {0,5}\S/.test(line)) break
    out.push(line)
  }
  return out.join('\n')
}

/**
 * GitHub Actions 運算式的最小求值器(只收這支 workflow 用到的子集:字串字面、context 路徑、== / !=、&& / ||、!、括號、
 * format()、cancelled())。&& / || 回傳運算元本身(GitHub 語意),不是布林。用來驗「運算式在各種事件下算出什麼」這個性質,
 * 而不是只比字串 —— 2026-10-14 的教訓:字串照抄進測試,錯的性質(dispatch 全擠一組)也跟著被斷言成對的。
 */
function evaluateExpression(text, context) {
  const trimmed = text.trim()
  // 整段是一個 ${{ }} → 回傳運算值;字面文字夾著 ${{ }}(例 group: a-${{ x }}-b)→ 逐段代入成字串(GitHub 同樣支援這種寫法)
  if (!/^\$\{\{[\s\S]*\}\}$/.test(trimmed) || /\}\}[\s\S]*\$\{\{/.test(trimmed)) {
    return trimmed.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, inner) => String(evaluateExpression(`\${{${inner}}}`, context)))
  }
  const body = trimmed.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '')
  const tokens = []
  const lexer = /\s*(?:('(?:[^']|'')*')|(\|\||&&|==|!=|[(),!])|([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*))/y
  let at = 0
  while (at < body.length) {
    lexer.lastIndex = at
    const match = lexer.exec(body)
    if (!match) throw new Error(`運算式無法解析:${body.slice(at)}`)
    at = lexer.lastIndex
    if (match[1]) tokens.push({ type: 'str', value: match[1].slice(1, -1).replace(/''/g, "'") })
    else if (match[2]) tokens.push({ type: 'op', value: match[2] })
    else if (match[3]) tokens.push({ type: 'id', value: match[3] })
    if (/^\s*$/.test(body.slice(at))) break
  }
  let index = 0
  const peek = () => tokens[index]
  const take = (value) => { const token = tokens[index]; if (value !== undefined && token?.value !== value) throw new Error(`預期 ${value},得到 ${token?.value}`); index += 1; return token }
  const truthy = (value) => value !== '' && value !== false && value !== null && value !== undefined && value !== 0
  const lookup = (path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), context)
  const primary = () => {
    const token = take()
    if (token.type === 'str') return token.value
    if (token.value === '!') return !truthy(primary())
    if (token.value === '(') { const value = or(); take(')'); return value }
    if (token.type === 'id' && peek()?.value === '(') {
      take('(')
      const args = []
      if (peek()?.value !== ')') { args.push(or()); while (peek()?.value === ',') { take(','); args.push(or()) } }
      take(')')
      if (token.value === 'format') return args[0].replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) + 1] ?? ''))
      if (token.value === 'cancelled') return Boolean(context.cancelled)
      throw new Error(`未支援的函式 ${token.value}`)
    }
    if (token.type === 'id') return lookup(token.value) ?? ''
    throw new Error(`非預期的 ${token.value}`)
  }
  const comparison = () => {
    const left = primary()
    if (peek()?.value === '==' || peek()?.value === '!=') {
      const op = take().value
      const equal = String(left).toLowerCase() === String(primary()).toLowerCase()
      return op === '==' ? equal : !equal
    }
    return left
  }
  const and = () => { let value = comparison(); while (peek()?.value === '&&') { take(); const right = comparison(); value = truthy(value) ? right : value } return value }
  const or = () => { let value = and(); while (peek()?.value === '||') { take(); const right = and(); value = truthy(value) ? value : right } return value }
  const result = or()
  if (index !== tokens.length) throw new Error(`運算式沒讀完:${tokens.slice(index).map((t) => t.value).join(' ')}`)
  return result
}

test('Visual Regression 的 PR 分支重拍路徑:push 只在非 main + 只看請求檔、閘判分支、權限封閉、concurrency 只讓 push 互相取代、env 優先序實跑、照搬步驟逐字相同', () => {
  const source = readWorkflow('visual-regression.yml')
  const document = loadYaml(source)
  const workflow = parseWorkflowSemantics(source)
  // (1) 觸發形狀:非 main、只看請求檔;不准 branches / tags(會把 main 或 tag 推送放進來)、不准 pull_request(那是 PR 閘的事)
  assert.deepEqual(workflow.on.push, { 'branches-ignore': ['main'], paths: [REBAKE_REQUEST_PATH] })
  assert.equal(REBAKE_REQUEST_PATH, 'infra/governance/baseline/visual/rebake-request.json', '請求檔路徑的 SSOT 在 scripts/visual-rebake-request.mjs,workflow 的 paths 必須同一個字串')
  assert.deepEqual(workflow.permissions, { contents: 'read' }, '只准 contents: read')
  for (const job of Object.values(workflow.jobs)) assert.equal(job.permissions, null, 'job 不得自己加權限')
  assert.doesNotMatch(source, /\bsecrets\./, '除了 github.token 之外不得讀任何 secret')
  // concurrency:只有 push 互相取代(同一條分支),其他事件每個 run 自成一組。
  // GitHub 在同一組裡會取消任何已在等待中的 run(不看 cancel-in-progress)—— repository_dispatch 的 github.ref 永遠是預設分支,
  // 若 dispatch 共用一組,連發三個不同 target_ref 的 dispatch,第二個會被第三個砍掉。以下對運算式**求值**驗這個性質。
  assert.deepEqual(workflow.concurrency, {
    group: "${{ github.event_name == 'push' && format('visual-regression-push-{0}', github.ref) || format('visual-regression-{0}-{1}', github.event_name, github.run_id) }}",
    'cancel-in-progress': "${{ github.event_name == 'push' }}",
  })
  const groupOf = (github) => evaluateExpression(workflow.concurrency.group, { github })
  const cancels = (github) => evaluateExpression(workflow.concurrency['cancel-in-progress'], { github })
  const dispatches = [101, 102, 103].map((run_id) => groupOf({ event_name: 'repository_dispatch', ref: 'refs/heads/main', run_id }))
  assert.equal(new Set(dispatches).size, 3, `三個 dispatch(ref 都是預設分支)必須各自一組,否則等待中的那個會被取代:${dispatches.join(' / ')}`)
  assert.notEqual(groupOf({ event_name: 'schedule', ref: 'refs/heads/main', run_id: 1 }), groupOf({ event_name: 'schedule', ref: 'refs/heads/main', run_id: 2 }), '排程每次各自一組')
  assert.notEqual(groupOf({ event_name: 'workflow_dispatch', ref: 'refs/heads/main', run_id: 7 }), groupOf({ event_name: 'workflow_dispatch', ref: 'refs/heads/main', run_id: 8 }), '按鈕每次各自一組')
  assert.equal(groupOf({ event_name: 'push', ref: 'refs/heads/fix/r3', run_id: 1 }), groupOf({ event_name: 'push', ref: 'refs/heads/fix/r3', run_id: 2 }), '同一條分支的兩次 push 必須同一組(後一次取代前一次)')
  assert.notEqual(groupOf({ event_name: 'push', ref: 'refs/heads/fix/r3', run_id: 1 }), groupOf({ event_name: 'push', ref: 'refs/heads/fix/other', run_id: 1 }), '不同分支的 push 互不影響')
  assert.ok(!dispatches.includes(groupOf({ event_name: 'push', ref: 'refs/heads/main', run_id: 101 })), 'push 的組與 dispatch 的組不得重疊')
  assert.equal(cancels({ event_name: 'push' }), true)
  for (const event_name of ['repository_dispatch', 'workflow_dispatch', 'schedule']) assert.equal(cancels({ event_name }), false, `${event_name} 不得取消執行中的 run`)

  // (2) 閘:只在 push、不用容器、沒有自己的權限、只稀疏簽出請求檔與判定腳本、輸出 rebake;重拍 job needs 它並以它的輸出決定 push 時跑不跑
  const visualJob = document.jobs['visual-regression']
  const gateJob = document.jobs['rebake-gate']
  assert.ok(gateJob, '必須有 rebake-gate job')
  assert.deepEqual(Object.keys(document.jobs), ['rebake-gate', 'visual-regression'])
  assert.equal(gateJob.if, "${{ github.event_name == 'push' }}", '閘只在 push 跑')
  assert.equal(gateJob['runs-on'], 'ubuntu-24.04')
  assert.equal(gateJob.container, undefined, '閘是輕量 job,不用容器')
  assert.equal(gateJob.permissions, undefined, '閘不得自己加權限(沿用 contents: read)')
  assert.ok(Number.isInteger(gateJob['timeout-minutes']) && gateJob['timeout-minutes'] <= 10, '閘要有短逾時')
  assert.deepEqual(gateJob.outputs, { rebake: '${{ steps.gate.outputs.rebake }}' })
  assert.equal(gateJob.steps.length, 3, '閘只有三步:簽出 / node / 判定')
  const [gateCheckout, gateNode, gateStep] = gateJob.steps
  assert.equal(gateCheckout.uses, visualJob.steps[0].uses, '閘的 checkout 與重拍 job 用同一個釘死的版本')
  assert.deepEqual(gateCheckout.with, {
    'persist-credentials': false,
    'sparse-checkout': `${REBAKE_REQUEST_PATH}\nscripts/visual-rebake-request.mjs\n`,
    'sparse-checkout-cone-mode': false,
  }, '閘只稀疏簽出請求檔與判定腳本')
  const visualNode = visualJob.steps.find((step) => String(step.uses).startsWith('actions/setup-node@'))
  assert.equal(gateNode.uses, visualNode.uses, '閘的 setup-node 與重拍 job 用同一個釘死的版本')
  assert.equal(gateNode.with['node-version'], visualNode.with['node-version'], '閘與重拍 job 用同一個 node 版本')
  assert.equal(gateStep.id, 'gate')
  assert.equal(gateStep.run, `node scripts/visual-rebake-request.mjs --gate --file ${REBAKE_REQUEST_PATH} --github-output "$GITHUB_OUTPUT"`)
  assert.deepEqual(visualJob.needs, ['rebake-gate'])
  assert.equal(visualJob.if, "${{ !cancelled() && (github.event_name != 'push' || needs.rebake-gate.outputs.rebake == 'true') }}")
  const jobRuns = ({ event_name, rebake = '' }) => Boolean(evaluateExpression(visualJob.if, { github: { event_name }, needs: { 'rebake-gate': { outputs: { rebake } } }, cancelled: false }))
  assert.equal(jobRuns({ event_name: 'push', rebake: 'true' }), true)
  assert.equal(jobRuns({ event_name: 'push', rebake: 'false' }), false, '閘判略過 → 重拍 job 不跑')
  assert.equal(jobRuns({ event_name: 'push', rebake: '' }), false, '閘紅了(沒有輸出)→ 重拍 job 不跑')
  for (const event_name of ['schedule', 'workflow_dispatch', 'repository_dispatch']) assert.equal(jobRuns({ event_name }), true, `${event_name}:閘被略過,重拍 job 仍照常跑`)

  // 讀請求檔的那一步:只在 push、排在簽出之後與 Resolve reference ref 之前、命令逐字固定
  const steps = visualJob.steps
  const names = steps.map((step) => step.name ?? step.uses)
  const readIdx = names.indexOf('Read the rebake request(只在 push 事件)')
  const resolveIdx = names.indexOf(MIRRORED_CONTAINER_STEPS[1])
  const checkoutIdx = names.findIndex((name) => String(name).startsWith('actions/checkout@'))
  assert.ok(checkoutIdx >= 0 && readIdx > checkoutIdx && readIdx < resolveIdx, '讀請求檔必須在簽出之後、Resolve reference ref 之前(那一步讀的 REFERENCE_REF 要是請求檔的值)')
  const readStep = steps[readIdx]
  assert.equal(readStep.if, "${{ github.event_name == 'push' }}", '只在 push 事件讀請求檔;其他事件的值已在 job env')
  assert.equal(readStep.run, `node scripts/visual-rebake-request.mjs --file ${REBAKE_REQUEST_PATH} --github-env "$GITHUB_ENV"`)
  // GitHub 的優先序:步驟層 env 會蓋過 GITHUB_ENV —— 任何步驟自己設這兩個名字,請求檔的值就被蓋回去
  for (const step of steps) {
    for (const name of ['UPDATE_BASELINE', 'REFERENCE_REF']) assert.ok(!step.env || !(name in step.env), `步驟「${step.name ?? step.uses}」不得在步驟層設 ${name}(會蓋過 GITHUB_ENV)`)
  }
  // job env 對 push 事件只會落到預設:兩個運算式只讀 inputs / client_payload(push 時兩者都空)
  const jobEnv = visualJob.env
  assert.match(jobEnv.UPDATE_BASELINE, /^\$\{\{ \(inputs\.update_baseline == true \|\| github\.event\.client_payload\.update_baseline == true \|\| github\.event\.client_payload\.update_baseline == 'true'\) && 'true' \|\| 'false' \}\}$/)
  assert.equal(jobEnv.REFERENCE_REF, "${{ inputs.reference_ref || github.event.client_payload.reference_ref || '' }}")

  // (3) 照搬的步驟:整個 step 區塊(name / env / run)逐字相同,不只 run 內容
  const ciSource = readWorkflow('ci.yml')
  const containerSource = ciSource.slice(ciSource.indexOf('\n  container-closed-git:\n'))
  for (const name of MIRRORED_CONTAINER_STEPS) {
    const visual = stepBlock(source, name)
    const container = stepBlock(containerSource, name)
    assert.ok(visual && container, `兩支 workflow 都必須有「${name}」`)
    assert.equal(container, visual, `「${name}」兩邊的整個 step 區塊必須逐字相同`)
  }
  // PR 閘在同一個映像裡先跑這條路用到的三支對照組
  for (const command of ['node scripts/visual-rebake-request.mjs --selftest', 'node scripts/visual-baseline-review-package.mjs --selftest', 'node scripts/test-apply-approved-baselines.mjs']) {
    assert.ok(containerSource.includes(`          ${command}\n`), `ci.yml container-closed-git 必須跑:${command}`)
  }

  // (5) 審核包:歸因紅了也建包(user 才看得到要查哪幾張),重拍 / 穩定性紅了 → 歸因被略過 → 不建包;上傳只看建包成功
  const packageStep = steps.find((step) => step.id === 'review-package')
  assert.ok(packageStep, '必須有建審核包的步驟(id: review-package)')
  assert.equal(packageStep.if, "${{ !cancelled() && env.UPDATE_BASELINE == 'true' && (steps.attribution.outcome == 'success' || steps.attribution.outcome == 'failure') }}")
  assert.ok(steps.findIndex((step) => step.id === 'attribution') < steps.indexOf(packageStep), '審核包在歸因之後')
  const upload = steps.find((step) => step.with?.name === 'visual-baselines-recaptured')
  assert.equal(upload.if, "${{ !cancelled() && env.UPDATE_BASELINE == 'true' && steps.review-package.outcome == 'success' }}")
  assert.equal(upload.with.path, '.git/governance-runtime/evidence/visual/baseline-review/')

  // workflow 以路徑呼叫的三支 CLI 真的會跑:它們都有「被 import 時不跑」的守衛,守衛若判錯,CLI 會靜默 exit 0(假綠)
  for (const [script, marker] of [
    ['scripts/visual-rebake-request.mjs', /✓ visual-rebake-request selftest/],
    ['scripts/visual-baseline-review-package.mjs', /✓ visual-baseline-review-package selftest/],
    ['scripts/visual-baseline-diff-report.mjs', /✓ visual-baseline-diff-report selftest/],
  ]) {
    const r = spawnSync(process.execPath, [resolve(ROOT, script), '--selftest'], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(r.status, 0, `${script} --selftest:${r.stderr}`)
    assert.match(r.stdout, marker, `${script} 以路徑呼叫時沒有真的執行(守衛判錯 = 靜默 exit 0)`)
  }

  // 已提交的請求檔(若有)必須能被同一支解析器讀懂 —— 壞的請求在 PR 閘就紅,不等到 push 觸發才紅
  const committedRequest = resolve(ROOT, REBAKE_REQUEST_PATH)
  try {
    const text = readFileSync(committedRequest, 'utf8')
    const parsed = parseRebakeRequest(text)
    assert.ok(parsed.ok, `已提交的重拍請求檔不合格:${parsed.errors?.join(' / ')}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  // (4) 實跑:workflow 裡真的那幾步依序在夾具跑 —— 閘(在只有兩個檔的稀疏目錄,證明稀疏簽出就夠)→ 重拍 job 的 if(求值)
  //     → 讀請求檔 → Resolve reference ref;GITHUB_OUTPUT / GITHUB_ENV 依 GitHub 規則疊加(後寫的蓋前面、蓋過 job env)
  const resolveStep = steps[resolveIdx]
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'rebake-request-env-')))
  try {
    const hermetic = { HOME: join(base, 'home'), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C' }
    mkdirSync(hermetic.HOME)
    const gitEnv = { ...process.env, ...hermetic, GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@example.invalid', GIT_COMMITTER_NAME: 'f', GIT_COMMITTER_EMAIL: 'f@example.invalid' }
    const git = (cwd, args) => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv })
      assert.equal(r.status, 0, `fixture git ${args.join(' ')}:${r.stderr}`)
      return r.stdout.trim()
    }
    const repo = join(base, 'repo')
    mkdirSync(join(repo, 'scripts'), { recursive: true })
    git(repo, ['init', '-q'])
    for (const [i, tag] of ['v0.1.0-beta.1', 'v0.1.0-beta.2'].entries()) {
      writeFileSync(join(repo, 'f.txt'), `${i}\n`)
      git(repo, ['add', 'f.txt'])
      git(repo, ['commit', '-q', '-m', `c${i}`])
      git(repo, ['tag', tag])
    }
    git(repo, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
    // 讀請求檔的 CLI 在夾具裡就是同一支(複製,不改一個位元組)
    const cli = readFileSync(resolve(ROOT, 'scripts/visual-rebake-request.mjs'))
    writeFileSync(join(repo, 'scripts/visual-rebake-request.mjs'), cli)
    const fakeBin = join(base, 'bin')
    mkdirSync(fakeBin)
    writeFileSync(join(fakeBin, 'curl'), '#!/bin/sh\nout=""\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && { out="$2"; shift; }; shift; done\nprintf \'{"draft":false}\' > "$out"\nprintf 200\n')
    chmodSync(join(fakeBin, 'curl'), 0o755)
    const readKeyValues = (file) => {
      const out = {}
      for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
        const eq = line.indexOf('=')
        assert.ok(eq > 0, `GITHUB_ENV / GITHUB_OUTPUT 只准 NAME=value 形狀:${line}`)
        out[line.slice(0, eq)] = line.slice(eq + 1)
      }
      return out
    }
    const runStep = (run, env, cwd = repo) => {
      const runnerTemp = mkdtempSync(join(base, 'runner-'))
      const githubEnv = join(runnerTemp, 'github-env')
      const githubOutput = join(runnerTemp, 'github-output')
      writeFileSync(githubEnv, '')
      writeFileSync(githubOutput, '')
      const r = spawnSync('bash', ['-eo', 'pipefail', '-c', run], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...hermetic, PATH: `${fakeBin}:${process.env.PATH}`, GITHUB_WORKSPACE: cwd, RUNNER_TEMP: runnerTemp, GITHUB_ENV: githubEnv, GITHUB_OUTPUT: githubOutput, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture', ...env },
      })
      return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '', githubEnv, githubOutput }
    }
    const placeRequest = (root, request) => {
      const requestPath = join(root, REBAKE_REQUEST_PATH)
      rmSync(requestPath, { force: true })
      if (request !== undefined) {
        mkdirSync(dirname(requestPath), { recursive: true })
        writeFileSync(requestPath, typeof request === 'string' ? request : JSON.stringify(request))
      }
    }
    // 模擬一次 run:閘(只在 push)→ 重拍 job 的 if → job env(依事件)→ 讀請求檔(只在 push)→ Resolve reference ref
    const simulate = ({ event, ref = 'refs/heads/fix/r3', request, payload = {} }) => {
      const refName = ref.replace(/^refs\/(?:heads|tags)\//, '')
      const pushEnv = { GITHUB_EVENT_NAME: event, GITHUB_REF: ref, GITHUB_REF_NAME: refName }
      placeRequest(repo, request)
      let rebake = ''
      if (evaluateExpression(gateJob.if, { github: { event_name: event } })) {
        // 稀疏簽出:只有請求檔(若在)與判定腳本 —— 腳本若多 import 任何東西,這裡就跑不起來
        const sparse = mkdtempSync(join(base, 'sparse-'))
        mkdirSync(join(sparse, 'scripts'))
        writeFileSync(join(sparse, 'scripts/visual-rebake-request.mjs'), cli)
        placeRequest(sparse, request)
        const gate = runStep(gateStep.run, pushEnv, sparse)
        if (gate.status !== 0) return { failedAt: 'gate', stderr: gate.stderr, githubOutput: readFileSync(gate.githubOutput, 'utf8') }
        rebake = readKeyValues(gate.githubOutput).rebake ?? ''
        assert.ok(['true', 'false'].includes(rebake), `閘必須輸出 rebake=true|false,得到 ${JSON.stringify(readFileSync(gate.githubOutput, 'utf8'))}`)
      }
      if (!jobRuns({ event_name: event, rebake })) return { skipped: true, rebake }
      // job env:按鈕 / API 的值只在各自的事件出現(這裡照 workflow 的運算式語意代入);push 與排程兩者皆空 → 預設
      const env = {
        ...pushEnv,
        UPDATE_BASELINE: event === 'repository_dispatch' && payload.update_baseline === true ? 'true' : 'false',
        REFERENCE_REF: (event === 'repository_dispatch' && payload.reference_ref) || '',
      }
      if (evaluateExpression(readStep.if, { github: { event_name: event } })) {
        const read = runStep(readStep.run, env)
        if (read.status !== 0) return { failedAt: 'read-request', stderr: read.stderr, githubEnv: readFileSync(read.githubEnv, 'utf8') }
        Object.assign(env, readKeyValues(read.githubEnv))
      }
      const resolved = runStep(resolveStep.run, env)
      if (resolved.status !== 0) return { failedAt: 'resolve', stderr: resolved.stderr }
      return Object.assign(env, readKeyValues(resolved.githubEnv))
    }
    const shaOf = (tag) => git(repo, ['rev-parse', `${tag}^{commit}`])
    const good = { schemaVersion: 1, branch: 'fix/r3', update_baseline: true, reference_ref: 'v0.1.0-beta.1', reason: 'R3 圖組重拍,給 user 逐張看', requestedAt: '2026-10-14T21:30:00+08:00' }
    // push + 給這條分支的請求 + 指定參考 → 後面的步驟看到 UPDATE_BASELINE=true、REFERENCE_REF=那個 tag 的 40 碼(不是最新 release)
    const pinned = simulate({ event: 'push', request: good })
    assert.equal(pinned.failedAt, undefined, pinned.stderr)
    assert.equal(pinned.skipped, undefined, '給這條分支的請求必須重拍')
    assert.equal(pinned.UPDATE_BASELINE, 'true')
    assert.equal(pinned.REFERENCE_REF, shaOf('v0.1.0-beta.1'), '請求檔的 reference_ref 必須流到 Resolve reference ref 並被解析成 40 碼')
    // push + 參考留空 → 走預設路徑(最近一次已發布的 release)
    const latest = simulate({ event: 'push', request: { ...good, reference_ref: '' } })
    assert.equal(latest.REFERENCE_REF, shaOf('v0.1.0-beta.2'))
    // push + 只比對
    assert.equal(simulate({ event: 'push', request: { ...good, update_baseline: false } }).UPDATE_BASELINE, 'false')
    // 閘的「略過、不紅」兩面:別條分支留下的請求(合併 / rebase main 帶進來的)、請求檔已刪(合併前的最後一步)
    for (const [why, args] of [
      ['請求寫的是別條分支', { event: 'push', request: { ...good, branch: 'feat/other' } }],
      ['請求檔已刪除', { event: 'push' }],
    ]) {
      const got = simulate(args)
      assert.equal(got.failedAt, undefined, `${why}:閘不得紅(${got.stderr})`)
      assert.deepEqual(got, { skipped: true, rebake: 'false' }, `${why}:閘必須輸出 rebake=false,重拍 job 略過`)
    }
    // 閘的「紅」:形狀不合格(不得因為分支不符就吞掉)/ 在 main → 閘就紅,GITHUB_OUTPUT 一行都沒寫,重拍 job 不跑
    for (const [why, args, pattern] of [
      ['字串布林', { event: 'push', request: { ...good, update_baseline: 'true' } }, /JSON 布林/],
      ['短 SHA', { event: 'push', request: { ...good, reference_ref: shaOf('v0.1.0-beta.1').slice(0, 8) } }, /短 SHA/],
      ['缺 branch(舊形狀)', { event: 'push', request: (({ branch: _b, ...rest }) => rest)(good) }, /缺欄位:branch/],
      ['形狀不合格且分支不符', { event: 'push', request: { ...good, branch: 'feat/other', update_baseline: 'true' } }, /JSON 布林/],
      ['main 分支', { event: 'push', ref: 'refs/heads/main', request: good }, /main 不收重拍請求/],
    ]) {
      const got = simulate(args)
      assert.equal(got.failedAt, 'gate', `${why}:必須在閘那一步紅`)
      assert.match(got.stderr, pattern, `${why}:錯誤沒指名`)
      assert.equal(got.githubOutput, '', `${why}:GITHUB_OUTPUT 必須一行都沒寫`)
    }
    // 第二道:閘被改壞、重拍 job 照樣跑時,讀請求那一步自己也拒絕別條分支的請求與已刪的檔(GITHUB_ENV 一行都不寫)
    for (const [why, request, pattern] of [
      ['別條分支的請求', { ...good, branch: 'feat/other' }, /不屬於這次推送/],
      ['請求檔已刪除', undefined, /請求檔不在/],
    ]) {
      placeRequest(repo, request)
      const read = runStep(readStep.run, { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/fix/r3', GITHUB_REF_NAME: 'fix/r3' })
      assert.notEqual(read.status, 0, `讀請求那一步對「${why}」必須紅`)
      assert.match(read.stderr, pattern, `讀請求那一步對「${why}」錯誤沒指名`)
      assert.equal(readFileSync(read.githubEnv, 'utf8'), '', `讀請求那一步對「${why}」不得寫 GITHUB_ENV`)
    }
    // 其他事件不碰請求檔:repository_dispatch 時就算 repo 裡有一份「要重拍」的請求檔,也只看 payload
    const dispatch = simulate({ event: 'repository_dispatch', request: good, payload: { update_baseline: false } })
    assert.equal(dispatch.UPDATE_BASELINE, 'false', 'repository_dispatch 不得讀請求檔')
    assert.equal(dispatch.REFERENCE_REF, shaOf('v0.1.0-beta.2'))
    assert.equal(simulate({ event: 'schedule', request: good }).UPDATE_BASELINE, 'false', '排程不得讀請求檔')
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
