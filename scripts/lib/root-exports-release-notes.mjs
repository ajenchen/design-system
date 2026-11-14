// root 出口登記清單(scripts/root-exports-removals.json)↔ GitHub Release 說明「破壞性變更 → root 出口」的單一實作。
//
// 為什麼(2026-11-10):Release 一直用 `gh release create --generate-notes` 建,登記清單從沒被寫進說明;
// root-exports-invariant 在下一次發布後要先證明「那一版的說明收錄了登記的名字」才准刪舊段 →
// 每次有拿掉出口的發版之後,所有分支(含 main)必紅(beta.148 實例:27 個名字一個都沒寫)。
//
// 呼叫端(誰呼叫它):
//   - scripts/release-github-release.mjs —— 建 Release 時把本段當 `--notes` 接在自動產生的說明前面,
//     發布(--draft=false)前讀回草稿說明再用 namesMissingFromNotes 驗收,少一個名字就不發布。
//   - scripts/root-exports-invariant.mjs —— `--notes=<檔>` 的判定(namesMissingFromNotes)與 `--selftest` 判定表。
//
// 本檔只准用 node 內建模組:Release workflow 的 publish-github-release job 沒有 npm install(不能碰 typescript)。

export const REGISTRY_PATH = 'scripts/root-exports-removals.json'
export class InstrumentError extends Error {}

/** 發布說明裡沒出現的登記名字(整個識別字比對,不比子字串);notesText 空白 = 儀器失效 */
export function namesMissingFromNotes(entries, notesText) {
  if (typeof notesText !== 'string' || !notesText.trim()) throw new InstrumentError('--notes 給的發布說明是空的 —— 沒驗到不是通過')
  const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return entries.filter((e) => e?.name && !new RegExp(`(?<![\\w$])${esc(e.name)}(?![\\w$])`).test(notesText)).map((e) => e.name)
}

const KIND_LABEL = Object.freeze({ value: '執行期', type: '只有型別' })

/**
 * 純函式:登記段 → Release 說明段落(markdown)。
 * entries = registry.releases[previousTag];空陣列 = 這一版沒有拿掉任何出口 → 回空字串(不寫段落)。
 * 任何一筆缺 name / kind / reason 都丟 InstrumentError —— 寫不出完整段落不得當成「沒有要寫的」。
 */
export function removedExportsNotesSection(entries, previousTag) {
  if (!Array.isArray(entries)) throw new InstrumentError(`${REGISTRY_PATH} 的登記段不是陣列`)
  if (entries.length === 0) return ''
  if (typeof previousTag !== 'string' || !previousTag) throw new InstrumentError('沒有上一次發布的 tag,寫不出「跟哪一版比」')
  const lines = entries.map((e, i) => {
    const at = `${REGISTRY_PATH} releases["${previousTag}"][${i}]`
    if (!e || typeof e.name !== 'string' || !e.name) throw new InstrumentError(`${at}:沒有 name`)
    const label = KIND_LABEL[e.kind]
    if (!label) throw new InstrumentError(`${at}:「${e.name}」kind 要寫 value 或 type`)
    if (typeof e.reason !== 'string' || !e.reason.trim()) throw new InstrumentError(`${at}:「${e.name}」理由空白`)
    return `- \`${e.name}\`(${label}):${e.reason.trim().replace(/\s*\n\s*/g, ' ')}`
  })
  return [
    '## 破壞性變更 → root 出口',
    '',
    `這一版從套件 root 出口拿掉了下面 ${entries.length} 個名字(跟 ${previousTag} 比;理由來自 \`${REGISTRY_PATH}\`)。`,
    '',
    ...lines,
  ].join('\n')
}

/**
 * 發版用:在 gitHead(要發布的那個 commit)上取「新 tag 之前最近一次發布」的 tag 與那一版的登記清單 ——
 * 就是 root-exports-invariant 在同一個 commit、打 tag 之前比對的同一段(它用 `git describe --tags --abbrev=0 --match v[0-9]* HEAD`)。
 * git = (args) => { status, stdout, stderr },由呼叫端注入(發布端走 closed git)。
 */
export function rootExportsRemovalNotes({ gitHead, tag, git }) {
  if (typeof git !== 'function') throw new InstrumentError('沒有注入 git 讀取函式')
  if (typeof tag !== 'string' || !tag) throw new InstrumentError('沒有要發布的 tag')
  const described = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', '--exclude', tag, gitHead])
  const previousTag = String(described?.stdout ?? '').trim()
  if (described?.status !== 0 || !previousTag) {
    throw new InstrumentError(`找不到 ${tag} 之前最近一次發布的 tag(git describe exit ${described?.status}:${String(described?.stderr ?? '').trim().slice(0, 200)})—— 簽出要 fetch-depth: 0 帶 tag`)
  }
  const shown = git(['show', `${gitHead}:${REGISTRY_PATH}`])
  let registry
  if (shown?.status === 0) {
    try { registry = JSON.parse(String(shown.stdout)) } catch (e) { throw new InstrumentError(`${gitHead.slice(0, 12)} 的 ${REGISTRY_PATH} 不是合法 JSON:${e.message}`) }
  } else if (/does not exist in|exists on disk, but not in/.test(String(shown?.stderr ?? ''))) {
    registry = { releases: {} } // 與 root-exports-invariant 的 readRegistry 同義:沒有這個檔 = 沒有登記
  } else {
    throw new InstrumentError(`讀不到 ${gitHead.slice(0, 12)} 的 ${REGISTRY_PATH}(git show exit ${shown?.status}:${String(shown?.stderr ?? '').trim().slice(0, 200)})`)
  }
  const entries = registry?.releases?.[previousTag] ?? []
  return { previousTag, entries, section: removedExportsNotesSection(entries, previousTag) }
}
