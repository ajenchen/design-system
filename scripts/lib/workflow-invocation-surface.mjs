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
 * 剔註解只擋得住註解;assert / 資料 / 訊息裡的檔名擋不住 —— 窄口徑的遞移展開與 hook / infra 根面已改用下方的
 * execShapedText(WP-18 反駁 #2),這支現在只給「test-<stem>.mjs 原文有沒有提到 <stem>.mjs」那條配對規則用。
 */
export function stripCodeCommentLines(text) {
  return String(text ?? '').split('\n').filter((line) => !/^\s*(?:#|\/\/|\/\*|\*)/.test(line)).join('\n')
}

// ── 執行形狀(2026-11-18,WP-18 反駁 #2)──────────────────────────────────────────────
// 剔掉註解還不夠:腳本原文裡出現檔名,多半是**資料**——assert 的期望值、複製清單、說明字串、
// 夾具裡的 package.json、讀檔比對的路徑。舊量法把這些全當「會跑它」,於是一行
// `assert.deepEqual(plan.argv, ['node', 'scripts/x-invariant.mjs'])` 就能讓一支只在夜間跑的閘
// 被算成 PR 可達、合法退出棘輪(M37「被提到 = 有人跑」)。這裡只留下**會把東西跑起來的那幾段原文**,
// 呼叫端照舊對它做字面比對 / npm run 解析。認的形狀:
//   JS:spawn / spawnSync / execFile / execFileSync / execSync / fork / 裸 exec / 動態 import(…) 的整段引數
//       (跨行也算,括號配對時略過字串與註解);靜態 `import … from '…'`、`export … from '…'`、`import '…'`;
//       以及這些引數裡用到的 `const|let|var` 常數的右值(`const G = join(ROOT, 'scripts/x.mjs')` 之後
//       `spawnSync(process.execPath, [G])`;常數再引用常數也跟)。
//       **不認**:沒有流進上述呼叫的命令字串(`'node scripts/x.mjs'` 當資料寫在夾具 / 期望值裡)、assert / 訊息。
//   sh:`node` / `npm` 是指令字(不在引號裡;`"$(node …)"` 的子殼算)的那一行;heredoc 內文是資料、不算;
//       被這些行用到的變數(`GATE="$ROOT/scripts/x.mjs"` 之後 `node "$GATE"`)的賦值行也算。
//   其他副檔名(.json / .yml 等)在窄口徑一律當資料。
// 刻意偏嚴:認不出的執行寫法(包一層的 helper `run('scripts/x.mjs')`、動態組字串)會少算可達,
// 讓閘多報「只在夜間 / 其他」(看得見的方向);反過來把資料當執行,閘會默默放走一支沒人在 PR 跑的閘(看不見的方向)。

const JS_CALL = /\b(?:spawn|spawnSync|execFile|execFileSync|execSync|fork)\s*\(|(?<![.\w$])exec\s*\(|\bimport\s*\(/g
const JS_STATIC_IMPORT = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom[ \t]*(['"])/gm
const JS_SIDE_EFFECT_IMPORT = /^[ \t]*import[ \t]*(['"])/gm
const JS_ASSIGN = /(?:^|[;{}\n])[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=(?!=)/g
const SPAN_CAP = 20000

/**
 * 回兩份與原文等長的文字(換行保留):
 *   masked     字串 / 樣板字面 / 註解 / regex 字面的**內容**換成空白(引號保留),給括號配對與找識別字用 ——
 *              字串裡的 `(` 或 `consumer-source-harness` 裡的 `source` 不該被當程式碼;樣板字面的 `${…}` 是程式碼,保留。
 *   uncommented 只把註解換成空白,字串原樣 —— 輸出用:跨行呼叫裡夾的 `// 'scripts/old.mjs'` 不算有人跑。
 */
function maskJs(text) {
  const out = text.split('')
  const uncommented = text.split('')
  const n = text.length
  const blank = (from, to, comment = false) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] === '\n') continue
      out[k] = ' '
      if (comment) uncommented[k] = ' '
    }
  }
  const templateDepths = []
  let depth = 0
  let mode = 'code'
  let lastSignificant = '\n'
  let i = 0
  while (i < n) {
    const c = text[i]
    if (mode === 'template') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue }
      if (c === '`') { mode = 'code'; lastSignificant = '`'; i++; continue }
      if (c === '$' && text[i + 1] === '{') { templateDepths.push(depth); mode = 'code'; i += 2; continue }
      blank(i, i + 1); i++; continue
    }
    if (c === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); const end = e < 0 ? n : e; blank(i, end, true); i = end; continue }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; blank(i, end, true); i = end; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      blank(i + 1, j); i = j + 1; lastSignificant = c; continue
    }
    if (c === '`') { mode = 'template'; i++; continue }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^\n]/.test(lastSignificant)) {
      let j = i + 1
      let inClass = false
      while (j < n && text[j] !== '\n') {
        const d = text[j]
        if (d === '\\') { j += 2; continue }
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) break
        j++
      }
      blank(i + 1, j); i = j + 1; lastSignificant = '/'; continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      if (templateDepths.length && depth === templateDepths[templateDepths.length - 1]) { templateDepths.pop(); mode = 'template'; i++; continue }
      depth--
    }
    if (!/\s/.test(c)) lastSignificant = c
    i++
  }
  return { masked: out.join(''), uncommented: uncommented.join('') }
}

/** 從 open(某個開括號的位置)找到配對的收括號;字串已被 maskJs 清空。找不到就截在 SPAN_CAP。 */
function closeOf(masked, open) {
  let depth = 0
  const limit = Math.min(masked.length, open + SPAN_CAP)
  for (let k = open; k < limit; k++) {
    const c = masked[k]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return k }
  }
  return limit - 1
}

/** 一段 `=` 之後的右值:括號深度回到 0 的第一個換行或分號為止。 */
function rhsEnd(masked, from) {
  let depth = 0
  let seen = false
  const limit = Math.min(masked.length, from + SPAN_CAP)
  for (let k = from; k < limit; k++) {
    const c = masked[k]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (depth <= 0 && seen && (c === '\n' || c === ';')) return k
    if (!/\s/.test(c)) seen = true
  }
  return limit
}

/** span 裡用到的識別字(不含屬性存取 `a.b` 的 b;展開 `...args` 的 args 算)。 */
function identifiersIn(masked, [from, to]) {
  const names = new Set()
  for (const m of masked.slice(from, to).matchAll(/[A-Za-z_$][\w$]*/g)) {
    const at = from + m.index
    if (at > 0 && /[\w$]/.test(masked[at - 1])) continue
    if (masked[at - 1] === '.' && masked[at - 2] !== '.') continue
    names.add(m[0])
  }
  return names
}

function execShapedJs(text) {
  const { masked, uncommented } = maskJs(text)
  const spans = []
  for (const m of masked.matchAll(JS_CALL)) {
    const open = m.index + m[0].length - 1
    spans.push([m.index, closeOf(masked, open) + 1])
  }
  for (const pattern of [JS_STATIC_IMPORT, JS_SIDE_EFFECT_IMPORT]) {
    for (const m of masked.matchAll(pattern)) {
      const quote = m.index + m[0].length - 1
      const end = masked.indexOf(m[1], quote + 1)
      spans.push([m.index, end < 0 ? quote + 1 : end + 1])
    }
  }
  const assignments = [...masked.matchAll(JS_ASSIGN)].map((m) => {
    const from = m.index + m[0].length
    return { name: m[1], span: [from, rhsEnd(masked, from)] }
  })
  const used = new Set()
  for (const span of spans) for (const name of identifiersIn(masked, span)) used.add(name)
  const taken = new Set()
  for (let changed = true; changed;) {
    changed = false
    for (const [index, { name, span }] of assignments.entries()) {
      if (taken.has(index) || !used.has(name)) continue
      taken.add(index)
      spans.push(span)
      for (const next of identifiersIn(masked, span)) used.add(next)
      changed = true
    }
  }
  return spans.map(([from, to]) => uncommented.slice(from, to)).join('\n')
}

/** shell 一行:單引號內容整段清空;雙引號內容清空,但 `$(…)` 子殼保留(那裡面是指令)。 */
function maskShellLine(line) {
  let out = ''
  let quote = null
  let subshell = 0
  for (let k = 0; k < line.length; k++) {
    const c = line[k]
    if (quote === "'") { out += c === "'" ? (quote = null, c) : ' '; continue }
    if (c === '\\') { out += quote === '"' && !subshell ? '  ' : line.slice(k, k + 2); k++; continue }
    if (quote === '"' && !subshell) {
      if (c === '"') { quote = null; out += c; continue }
      if (c === '$' && line[k + 1] === '(') { subshell = 1; out += '$('; k++; continue }
      out += ' '; continue
    }
    if (quote === '"' && subshell) {
      if (c === '(') subshell++
      else if (c === ')') subshell--
      out += c; continue
    }
    if (c === "'" || c === '"') { quote = c; out += c; continue }
    out += c
  }
  return out
}

const SH_COMMAND = /(?:^|[\s;&|(`])(?:exec[ \t]+|command[ \t]+)?(?:node|npm)(?=[ \t])/
const SH_ASSIGN = /^[ \t]*(?:local[ \t]+|export[ \t]+|readonly[ \t]+|declare[ \t]+(?:-\w+[ \t]+)*)?([A-Za-z_]\w*)=/

function execShapedShell(text) {
  const lines = String(text).split('\n')
  const live = []
  let heredoc = null
  for (const [index, line] of lines.entries()) {
    if (heredoc) { if (line.trim() === heredoc) heredoc = null; continue }
    if (/^\s*#/.test(line)) continue
    const masked = maskShellLine(line)
    live.push({ index, line, masked })
    const at = masked.search(/(?<!<)<<(?!<)/)
    if (at >= 0) {
      const delimiter = /^<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/.exec(line.slice(at))
      if (delimiter) heredoc = delimiter[2]
    }
  }
  const keep = new Set(live.filter((l) => SH_COMMAND.test(l.masked)).map((l) => l.index))
  for (let changed = true; changed;) {
    changed = false
    const keptText = live.filter((l) => keep.has(l.index)).map((l) => l.line).join('\n')
    for (const l of live) {
      if (keep.has(l.index)) continue
      const assign = SH_ASSIGN.exec(l.line)
      if (!assign) continue
      if (new RegExp(`\\$\\{?${assign[1]}(?![\\w])`).test(keptText)) { keep.add(l.index); changed = true }
    }
  }
  return lines.filter((_, index) => keep.has(index)).join('\n')
}

/** 依副檔名決定怎麼讀;null = 資料檔,窄口徑不當執行面。 */
export function executableLanguageOf(path) {
  if (/\.(?:sh|bash)$/.test(path)) return 'sh'
  if (/\.(?:mjs|cjs|js)$/.test(path)) return 'js'
  return null
}

/**
 * 只留下「會把東西跑起來」的那幾段原文(形狀與理由見上方區塊註解)。
 * @param {string} text 原文
 * @param {'js'|'sh'} language
 */
export function execShapedText(text, language) {
  if (language === 'sh') return execShapedShell(text)
  if (language === 'js') return execShapedJs(String(text ?? ''))
  return ''
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
