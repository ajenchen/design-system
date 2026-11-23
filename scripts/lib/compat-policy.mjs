// 相容政策的**唯一**機器來源(2026-11-15):版本號 → 改名 / 移除時要不要留舊名。
//
// 規則文字住 `packages/design-system/ds-canonical/references/props-naming.md`「相容政策」(唯一住處,含 user 原話與 semver 引文);
// 這支只把那段規則變成機器讀得到的判斷,所有相關的閘(sizing-props R1 / R2、token-creation C10、compat-policy-invariant)讀這裡,
// 不各自寫死「0.x 不留舊名」或「留一版」。
//
// 判斷只看 `packages/design-system/package.json` 的 version(發布出去的就是這個版本):
//   - 主版號 0(0.y.z)或帶預發布標籤(-beta.N、-rc.N …)= `no-compat`:改名 / 移除一律不留舊名、不標 @deprecated,
//     同一版把 DS 自己的程式、範例、規格改完,並寫進變更帳本 packages/design-system/ds-changes.json(隨 npm 出貨;GitHub Release「破壞性變更」由它產生)。
//     依據 semver 2.0.0 第 4 條「Major version zero (0.y.z) is for initial development. Anything MAY change at any time.
//     The public API SHOULD NOT be considered stable.」、第 9 條「A pre-release version indicates that the version is unstable
//     and might not satisfy the intended compatibility requirements」(https://semver.org/spec/v2.0.0.html)。
//   - 1.0.0 以後的正式版(沒有預發布標籤)= `alias-one-release`:改名留舊名一個版本(@deprecated + 內部轉新名),下一版才刪。
//     【AI 推導 2026-11-15】正式版的這條沿用 2026-11-15 前 props-naming.md 第 5 條的寫法,user 還沒有對 1.0 之後的政策說過話。
//
// 讀不到版本 / 版本不是合法 semver → 丟例外(呼叫端判紅,不得當成某一種政策放行)。
// 本檔只准用 node 內建模組(release 端與純靜態閘都會 import)。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const DS_PACKAGE_JSON = 'packages/design-system/package.json'
/** 規則文字的唯一住處(閘的訊息指回這裡) */
export const POLICY_DOC = 'packages/design-system/ds-canonical/references/props-naming.md「相容政策」'

export class CompatPolicyError extends Error {}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/**
 * 純函式:版本號 → 相容政策。
 * @param {string} version
 * @returns {{ version: string, major: number, prerelease: string|null, mode: 'no-compat'|'alias-one-release', keepOldNames: boolean, why: string }}
 */
export function compatPolicyFor(version) {
  if (typeof version !== 'string' || !version.trim()) throw new CompatPolicyError('沒有版本號 —— 讀不到就不知道該用哪一種相容政策(不是放行)')
  const m = SEMVER.exec(version.trim())
  if (!m) throw new CompatPolicyError(`「${version}」不是合法的 semver 版本號 —— 判不出相容政策`)
  const major = Number(m[1])
  const prerelease = m[4] ?? null
  if (major === 0 || prerelease !== null) {
    return {
      version, major, prerelease, mode: 'no-compat', keepOldNames: false,
      why: `${version} 是${major === 0 ? '主版號 0(semver 第 4 條:初期開發,公開 API 不視為穩定)' : ''}${major === 0 && prerelease !== null ? '、' : ''}${prerelease !== null ? `預發布版(-${prerelease};semver 第 9 條:不保證相容)` : ''} → 改名 / 移除不留舊名,登記進發布說明`,
    }
  }
  return {
    version, major, prerelease, mode: 'alias-one-release', keepOldNames: true,
    why: `${version} 是 1.0 以後的正式版 → 改名留舊名一個版本(@deprecated),下一版才刪`,
  }
}

/** 讀 repo 現在的版本 → 政策。root = repo 根目錄。 */
export function readCompatPolicy(root) {
  let raw
  try { raw = readFileSync(join(root, DS_PACKAGE_JSON), 'utf8') } catch (e) { throw new CompatPolicyError(`讀不到 ${DS_PACKAGE_JSON}:${e.message}`) }
  let pkg
  try { pkg = JSON.parse(raw) } catch (e) { throw new CompatPolicyError(`${DS_PACKAGE_JSON} 不是合法 JSON:${e.message}`) }
  return compatPolicyFor(pkg?.version)
}

/**
 * 判定表(呼叫端的 --selftest 都可以拿來證明「讀的是這一支」)。
 * 每一列:[版本號, 期望 mode]。
 */
export const COMPAT_POLICY_TABLE = Object.freeze([
  ['0.1.0-beta.148', 'no-compat'],
  ['0.9.3', 'no-compat'],
  ['1.0.0-rc.1', 'no-compat'],
  ['1.0.0', 'alias-one-release'],
  ['2.3.4+build.7', 'alias-one-release'],
])
