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
