// 規範位置的建置輸出(2026-11-27,上游判定 B4)—— 產品 repo 的「哪些資料夾是建置輸出、掃原始碼時略過」只住這一份。
//
// 規範位置 = 每個 workspace 根(repo 根、apps/<name>,DS repo 另有 packages/<name>)的**直接子資料夾**,而且名字在下面清單裡。
// 不按名字到處略過:原始碼放在 apps/x/src/dist 或 apps/x/src/build 照樣要掃(按名字略過 = 取個像輸出的資料夾名就能躲過檢查)。
//
// 使用端:
//   - scripts/lint-ds-internal-imports.mjs、scripts/consumer-source-harness.mjs —— import 本檔(兩支與本檔都以受管檔出貨給產品 repo)
//   - scripts/governance-check.mjs —— 以單一檔出貨給產品 repo(不能 import),同一份清單寫成字面值
//   - packages/design-system/ds-canonical/hooks/lib/_micro_geometry.sh —— hook 端(shell + python)同一份清單寫成字面值
//   後兩處與本檔逐字相同由 scripts/test-setup-governance.mjs 的「consumer output roots」測試守(漂移就紅)。
import { basename, dirname, resolve } from 'node:path'

export const CONSUMER_OUTPUT_DIRECTORY_NAMES = Object.freeze([
  'node_modules', 'dist', 'build', 'coverage', 'storybook-static', '.next', '.turbo', '.cache', '.vite',
])

/** directory 是不是 workspaceRoot 的規範位置建置輸出(直接子資料夾 + 名字在清單裡) */
export function isCanonicalOutputRoot(workspaceRoot, directory) {
  const dir = resolve(directory)
  return dirname(dir) === resolve(workspaceRoot) && CONSUMER_OUTPUT_DIRECTORY_NAMES.includes(basename(dir))
}
