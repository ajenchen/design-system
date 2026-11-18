/**
 * 「誰真的會把 scripts/*.mjs 跑起來」的解析器(2026-09-27,待辦總帳 N33)。
 *
 * 執行面是 `.github/workflows/*.yml`:一支腳本被跑起來只有兩種形狀 ——
 *   (a) workflow 直接 `node scripts/x.mjs`(含 `node trusted/scripts/x.mjs`、`node "$GITHUB_WORKSPACE/scripts/x.mjs"`);
 *   (b) workflow `npm run <name>` → package.json `scripts[name]` 的指令文字提到 `scripts/x.mjs`
 *       (npm script 之間再互相 `npm run` 也遞移展開;npm 會自動跑 `pre<name>` / `post<name>` 也算)。
 *
 * **package.json 本身不是執行面**:一條 npm script 存在,不代表有人跑它。舊量法把 package.json 當根,
 * 於是「從 CI 拿掉一道閘」不會紅 —— 只要 package.json 還留著那條 script,閘就被判成「可達」
 * (M37:拿「有一條 npm script 提到它」代替「CI 會跑它」)。
 *
 * 註解不算:workflow 裡 `#` 開頭的行整行剔除。ci.yml 的註解記過兩次「這支閘沒被 CI 呼叫」的病史,
 * 一支腳本的名字只出現在那種註解裡,正是最典型的孤兒。
 *
 * 純函式:所有輸入都可以用記憶體內的物件餵(對照組要能不碰檔案就造出「只在 package.json 出現」的情境)。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load as loadYaml } from 'js-yaml'

const SCRIPT_TOKEN = /scripts\/([A-Za-z0-9._-]+\.mjs)\b/g
// `npm run x` / `npm run --silent x` / `npm run-script x` / `npm run --workspace=pkg x`(旗標可以夾在中間)
const NPM_RUN = /\bnpm\s+(?:run|run-script)\s+((?:--?[A-Za-z0-9-]+(?:=\S+)?\s+)*)([A-Za-z0-9:_.-]+)/g
// `npm -w pkg run x` / `npm --workspace pkg run x` / `npm -w pkg test`
const NPM_WORKSPACE = /\bnpm\s+(?:-w|--workspace)[=\s]+(\S+)\s+(?:run\s+)?([A-Za-z0-9:_.-]+)/g
const NPM_TEST = /\bnpm\s+test\b/g

/** 去掉 YAML / shell 的整行註解(只剔「整行是註解」的行,不碰行內 `#`,免得誤傷 `${{ }}` 之類)。 */
export function stripCommentLines(text) {
  return String(text ?? '').split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
}

/**
 * 同上,再加 JS 的整行註解(`//`、`/*`、block 註解續行的 `*`)—— 給 hook / 腳本原文用(2026-11-18,D10-02)。
 * gate-reachability 分「PR 可達 / 只在夜間可達」時,hook 與腳本裡**註解提到**的檔名不算有人跑它:
 * 實測 check_story_invariants.sh 只在 `#` 註解提到 category-classification-invariant.mjs、
 * hooks/lib/benchmark-citation.mjs 只在 `//` 註解提到 exemption-expiry-invariant.mjs,兩支都不會在 PR 上被跑。
 * 同樣只剔整行,行尾註解不動(偏向多算可達,不會把真的呼叫剔掉)。
 */
export function stripCodeCommentLines(text) {
  return String(text ?? '').split('\n').filter((line) => !/^\s*(?:#|\/\/|\/\*|\*)/.test(line)).join('\n')
}

export function readWorkflowSources(root, dir = '.github/workflows') {
  const base = join(root, dir)
  if (!existsSync(base)) return {}
  return Object.fromEntries(readdirSync(base)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => [name, readFileSync(join(base, name), 'utf8')]))
}

/**
 * 從一段「執行面文字」找出它會觸發的 npm script 名稱(root 的與 workspace 的分開回)。
 */
export function npmScriptReferences(text) {
  const rootScripts = new Set()
  const workspaceScripts = []
  for (const m of text.matchAll(NPM_RUN)) {
    const flags = m[1] || ''
    const workspace = /--workspace(?:=|\s+)(\S+)/.exec(flags)?.[1] ?? /(?:^|\s)-w(?:=|\s+)(\S+)/.exec(flags)?.[1]
    if (workspace) workspaceScripts.push({ workspace, name: m[2] })
    else rootScripts.add(m[2])
  }
  for (const m of text.matchAll(NPM_WORKSPACE)) workspaceScripts.push({ workspace: m[1], name: m[2] })
  if (NPM_TEST.test(text)) rootScripts.add('test')
  NPM_TEST.lastIndex = 0
  return { rootScripts, workspaceScripts }
}

/**
 * 解析執行面 → 真的會被跑到的 scripts/*.mjs 檔名集合。
 *
 * @param {object} input
 * @param {Record<string,string>} input.workflows      workflow 檔名 → 原文(註解會在這裡剔除)
 * @param {Record<string,string>} input.packageScripts root package.json 的 scripts
 * @param {Record<string,Record<string,string>>} [input.workspaceScripts] workspace 名稱 → 它的 scripts
 * @param {string[]} [input.extraSurfaces] 其他執行面的文字(hooks / harness inventory 等),同樣會解析 npm run
 * @returns {{ scripts: Set<string>, npmScripts: Set<string>, corpus: string }}
 *   scripts = 可達的 scripts/*.mjs 檔名;npmScripts = 被觸發到的 root npm script 名;
 *   corpus = 執行面文字 + 被觸發到的 npm script 指令(給呼叫端做既有的字面比對)
 */
export function resolveWorkflowInvocationSurface({
  workflows = {},
  packageScripts = {},
  workspaceScripts = {},
  extraSurfaces = [],
} = {}) {
  const surfaceText = [
    ...Object.values(workflows).map(stripCommentLines),
    ...extraSurfaces.map((text) => String(text ?? '')),
  ].join('\n')
  const triggered = new Set()
  const workspaceTriggered = []
  const enqueue = (text) => {
    const refs = npmScriptReferences(text)
    for (const name of refs.rootScripts) {
      for (const candidate of [name, `pre${name}`, `post${name}`]) {
        if (typeof packageScripts[candidate] === 'string' && !triggered.has(candidate)) {
          triggered.add(candidate)
          enqueue(packageScripts[candidate])
        }
      }
    }
    for (const ref of refs.workspaceScripts) {
      const command = workspaceScripts[ref.workspace]?.[ref.name]
      const key = `${ref.workspace}::${ref.name}`
      if (typeof command === 'string' && !workspaceTriggered.includes(key)) {
        workspaceTriggered.push(key)
        enqueue(command)
      }
    }
  }
  enqueue(surfaceText)
  const commands = [
    ...[...triggered].map((name) => packageScripts[name]),
    ...workspaceTriggered.map((key) => { const [ws, name] = key.split('::'); return workspaceScripts[ws][name] }),
  ]
  const corpus = `${surfaceText}\n${commands.join('\n')}`
  const scripts = new Set()
  for (const m of corpus.matchAll(SCRIPT_TOKEN)) scripts.add(m[1])
  return { scripts, npmScripts: triggered, corpus }
}

/**
 * workflow 的觸發事件名稱(`on:` 的鍵;字串 / 陣列 / 物件三種寫法都收)。
 * YAML 解析失敗或沒有 `on:` → 丟例外(呼叫端當儀器失效處理,不當成「沒有觸發」)。
 */
export function workflowTriggers(source) {
  const document = loadYaml(String(source ?? ''))
  const on = document?.on
  if (typeof on === 'string') return [on]
  if (Array.isArray(on)) return on.map(String)
  if (on && typeof on === 'object') return Object.keys(on)
  throw new Error('workflow 沒有 on: 觸發宣告')
}

/**
 * 一份 workflow **真的會執行的指令文字**:每個 job 每個 step 的 `run:`(YAML 折行由解析器還原),
 * shell 的整行註解與行尾註解(`#` 前面是空白)剔除。
 *
 * 與 `resolveWorkflowInvocationSurface` 拿 workflow 全文的差別:step 的 `name:`、`env:` 提到腳本檔名不算有人跑它;
 * `run: >-` 折行寫法把 `--selftest` 放在下一行,也還原成同一條指令。呼叫 reusable workflow 的 job(`uses:`)
 * 沒有 run 文字可讀,不算 —— 寧可少認,不可多認(多認 = 把沒人跑的對照組算成有人跑)。
 */
export function workflowRunText(source) {
  const document = loadYaml(String(source ?? ''))
  const jobs = document?.jobs
  if (!jobs || typeof jobs !== 'object') throw new Error('workflow 沒有 jobs')
  const runs = []
  for (const job of Object.values(jobs)) {
    for (const step of Array.isArray(job?.steps) ? job.steps : []) {
      if (typeof step?.run !== 'string') continue
      runs.push(stripCommentLines(step.run).split('\n').map((line) => line.replace(/(^|\s)#.*$/, '$1')).join('\n'))
    }
  }
  return runs.join('\n')
}

/**
 * 指令文字 → 「以 `--selftest` 跑起來的 scripts/*.mjs」檔名集合。
 *
 * **歸屬以單一指令為單位**:先接回 `\` 續行,再以換行 / `&&` / `||` / `;` / `|` 切成一條條指令,
 * 一條指令裡同時有「第一個 scripts/x.mjs」與 `--selftest` 旗標,才算 x 的對照組有人跑。
 * 2026-11-18 量到的反例:`npm run test:agent-panel-invariants` 是
 * `node scripts/agent-fab-hit-area-invariant.mjs && … && node scripts/agent-fab-drag-click-invariant.mjs --selftest`
 * —— 整行掃 `--selftest` 會把後面那支的對照組記到前面五支頭上(它們在 PR 只跑現況)。
 * `--selftest-force-ink` 之類的長旗標不算 `--selftest`。
 */
export function selftestScriptInvocations(text) {
  const found = new Set()
  const commands = String(text ?? '').replace(/\\\r?\n/g, ' ').split(/\r?\n|&&|\|\||;|\|/)
  for (const command of commands) {
    if (!/(?:^|\s)--selftest(?![\w-])/.test(command)) continue
    const first = /scripts\/([A-Za-z0-9._-]+\.mjs)\b/.exec(command)
    if (first) found.add(first[1])
  }
  return found
}

/** 讀 repo 內的 workspace package.json(名稱 → scripts),給 `npm -w <name> run x` 用。 */
export function readWorkspaceScripts(root) {
  const out = {}
  let rootPkg
  try { rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) } catch { return out }
  for (const pattern of rootPkg.workspaces ?? []) {
    const [dir] = String(pattern).split('/*')
    const base = join(root, dir)
    let entries; try { entries = readdirSync(base) } catch { continue }
    for (const name of entries) {
      const manifest = join(base, name, 'package.json')
      if (!existsSync(manifest)) continue
      try {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        if (pkg.name && pkg.scripts) out[pkg.name] = pkg.scripts
      } catch { /* 壞掉的 manifest 不是本解析器要判的事 */ }
    }
  }
  return out
}
