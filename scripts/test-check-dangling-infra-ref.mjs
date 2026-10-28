#!/usr/bin/env node
// Isolated meta-test for dangling LIVE infra references.  Never edits live docs.
//
// @gate-contract
//   保證: check-dangling-infra-ref 在該紅的時候會紅、該綠的時候會綠,掃描本身壞掉時報儀器失效,而且呼叫端 repo 本身目前沒有懸空的 infra 引用
//   紅: 隔離夾具裡注入不存在的 hook 名、裸 .mjs 檔名指到 scripts / hooks / 根目錄以外、完整路徑指到不存在的檔、
//       workflow 呼叫不存在的 .mjs(檔名開頭是不是 check / build 都一樣)→ 閘必須 exit 非 0;
//       宣告要掃的目錄有檔卻 0 份收進來、整個根目錄 0 份文件 → 閘必須以 INSTRUMENT-FAIL 紅;任何一面沒照預期,本測試就紅並指名是哪一面
//   綠: 呼叫端 repo 與只有一份乾淨文件的夾具必須 exit 0;「完整路徑、檔案在」「workflow 帶簽出前綴、檔案在」必須 exit 0
//       (證明閘沒有變成一律紅,也沒有把前綴寫法當成不存在);全程只寫隔離暫存目錄、repo 零寫入,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = process.cwd()
const CHECKER = resolve(REPO, 'scripts/check-dangling-infra-ref.mjs')
const run = (root) => {
  const r = spawnSync(process.execPath, ['--', CHECKER, '--check', '--root', root], {
    cwd: REPO,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

if (run(REPO).code !== 0) {
  console.error('✗ baseline run 應 PASS 卻 FAIL — repo 有 dangling LIVE infra ref')
  process.exit(1)
}
console.log('✓ caller repo baseline PASS')

let ok = true
const expectFace = (label, root, expect) => {
  const { code, out } = run(root)
  const instrument = /INSTRUMENT-FAIL/.test(out)
  const observed = code === 0 ? 'green' : instrument ? 'instrument-fail' : 'red'
  if (observed !== expect) { console.error(`✗ ${label}:期望 ${expect},實得 ${observed}(exit ${code})\n${out.trim().split('\n').slice(-6).join('\n')}`); ok = false }
  else console.log(`✓ ${label} → ${observed}`)
}

const fixture = mkdtempSync(join(tmpdir(), 'dangling-infra-meta-'))
try {
  const refs = join(fixture, 'packages/design-system/ds-canonical/references')
  mkdirSync(refs, { recursive: true })
  const target = join(refs, 'naming-conventions.md')
  writeFileSync(target, '# Fixture\n')
  if (run(fixture).code !== 0) {
    console.error('✗ isolated fixture baseline 應 PASS 卻 FAIL')
    ok = false
  }

  writeFileSync(target, '# Fixture\n- LIVE ref: check_meta_test_dangling_ref_probe.sh\n')
  const { code } = run(fixture)
  if (code === 0) {
    console.error('✗ 注入 dangling LIVE ref 後 gate 未 FAIL(detection 失效)')
    ok = false
  } else {
    console.log(`✓ isolated fixture dangling LIVE ref 被抓(exit ${code})`)
  }

  // 2026-10-14(SM5):帶目錄的 .mjs 指標也要真的驗存在 —— 先前拿整條路徑判「是不是 infra 腳本」,帶目錄的一律被略過,
  // 所以把裸檔名改寫成完整路徑會「轉綠」卻沒有被檢查過。三面:
  //   (a) 裸檔名、檔案在 scripts / hooks / 根目錄以外(historical-bugs.md:480 的原形)→ 紅
  //   (b) 同一個檔寫完整路徑、檔案真的在 → 綠
  //   (c) 完整路徑、檔案不在 → 紅(這一面在修前會被略過而綠)
  const testDir = join(fixture, 'packages/governance/test')
  mkdirSync(testDir, { recursive: true })
  writeFileSync(join(testDir, 'plugin-meta-probe.test.mjs'), '// fixture\n')
  const faces = [
    ['(a) 裸檔名指到 scripts / hooks / 根目錄以外的檔', '# Fixture\n- 經入口測:`plugin-meta-probe.test.mjs`\n', 'red'],
    ['(b) 同一個檔寫完整路徑(檔案在)', '# Fixture\n- 經入口測:`packages/governance/test/plugin-meta-probe.test.mjs`\n', 'green'],
    ['(c) 完整路徑、檔案不在', '# Fixture\n- 經入口測:`packages/governance/test/plugin-meta-probe-gone.test.mjs`\n', 'red'],
  ]
  for (const [label, body, expect] of faces) {
    writeFileSync(target, body)
    expectFace(label, fixture, expect)
  }
  writeFileSync(target, '# Fixture\n')

  // 2026-10-14(SM5 複驗):.github/workflows 從 2026-07-07 起列在掃描範圍,但收檔只認 .md / .json,一支 .yml 都沒讀過
  // (輸出只有一行總數,看不出來)。修前的閘下面 (d1)(d2)(e3) 都是綠 = 沒掃到。workflow 裡的 .mjs 也不套檔名開頭的過濾
  // ((d2) 用 release- 開頭證明這件事),並把簽出前綴對回 repo 根((e1)(e2) 證明前綴寫法、檔案在 → 綠,不會假紅)。
  const scriptsDir = join(fixture, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  writeFileSync(join(scriptsDir, 'release-meta-probe.mjs'), '// fixture\n')
  const workflows = join(fixture, '.github/workflows')
  mkdirSync(workflows, { recursive: true })
  const workflow = join(workflows, 'probe.yml')
  const job = (steps) => `name: Probe\non: push\njobs:\n  probe:\n    runs-on: ubuntu-24.04\n    steps:\n${steps}`
  const checkoutTrusted = '      - uses: actions/checkout@0000000000000000000000000000000000000000\n        with:\n          path: trusted\n'
  const workflowFaces = [
    ['(d1) workflow 呼叫不存在的 check- 腳本', job('      - run: node scripts/check-meta-probe-gone.mjs --check\n'), 'red'],
    ['(d2) workflow 呼叫不存在的腳本(檔名不在 check / build 那張清單)', job('      - run: node scripts/release-meta-probe-gone.mjs\n'), 'red'],
    ['(d3) workflow 經 ${{ github.workspace }}/ 呼叫不存在的腳本', job('      - run: node "${{ github.workspace }}/scripts/release-meta-probe-gone.mjs"\n'), 'red'],
    ['(e1) workflow 經 $GITHUB_WORKSPACE/ 呼叫存在的腳本', job('      - run: node "$GITHUB_WORKSPACE/scripts/release-meta-probe.mjs"\n'), 'green'],
    ['(e2) workflow 經自己宣告的簽出 path(trusted/)呼叫存在的腳本', job(`${checkoutTrusted}      - run: node trusted/scripts/release-meta-probe.mjs\n`), 'green'],
    ['(e3) 簽出 path 沒宣告 → trusted/ 不得被當成前綴拿掉', job('      - run: node trusted/scripts/release-meta-probe.mjs\n'), 'red'],
  ]
  for (const [label, body, expect] of workflowFaces) {
    writeFileSync(workflow, body)
    expectFace(label, fixture, expect)
  }
  rmSync(workflow)

  // 儀器失效兩面:宣告要掃的目錄有檔卻 0 份收進來(.github/workflows 修前的形狀);整個根目錄 0 份文件
  const memory = join(fixture, 'governance/memory')
  mkdirSync(memory, { recursive: true })
  writeFileSync(join(memory, 'notes.txt'), 'not a scanned type\n')
  expectFace('(f1) 宣告要掃的目錄有檔、0 份收進來', fixture, 'instrument-fail')
  rmSync(memory, { recursive: true, force: true })
  const emptyRoot = mkdtempSync(join(tmpdir(), 'dangling-infra-meta-empty-'))
  try { expectFace('(f2) 根目錄 0 份文件', emptyRoot, 'instrument-fail') } finally { rmSync(emptyRoot, { recursive: true, force: true }) }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

if (run(REPO).code !== 0) {
  console.error('✗ isolated test 後 caller repo 應 PASS')
  process.exit(1)
}
console.log(ok ? '✅ meta-test PASS(repo 零寫入)' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
