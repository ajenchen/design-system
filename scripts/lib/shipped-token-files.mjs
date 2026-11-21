// 已安裝的 @qijenchen/design-system 套件裡,治理 hook 會讀的發布檔(路徑相對於套件根目錄)。
// 假 fork(scripts/test-fork-governance.mjs)與 consumer clean-room(scripts/test-consumer-governance.mjs)兩種夾具,
// 都要把這些檔放在跟 npm 包一樣的相對路徑(package.json files 含 src/**/*.{tsx,ts,css} 與 src/**/*.json;
// `npm pack --dry-run` 列得到 src/tokens/layoutSpace/layoutSpace.css)。少放一份 = 夾具比真的 consumer 弱:
// 2026-11-09 packaging canary 就是 fork 夾具沒放 layoutSpace.css,check_layout_space_magic_numbers.sh 讀幻覺 token 白名單時
// 兩處都找不到 → exit 70,乾淨樣本被當成違規(真的 consumer 裝得到這份檔,hook 沒錯)。
// 清單只住這裡(M17):A76 只補了 fork 夾具那一份,consumer 夾具手抄的那一份沒跟上,夜間 consumer-clean-room 因此一直紅
// (GOV-CONTENT-002「layout-space token SSOT unavailable」;2026-11-20 A121-F7)。兩支測試都從這裡取,不准各自再寫一份。
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const SHIPPED_TOKEN_FILES = Object.freeze([
  'src/tokens/utility-registry.json',
  'src/tokens/layoutSpace/layoutSpace.css',
])

/** 從 DS 原始碼(sourceDsRoot = <repo>/packages/design-system)把發布檔放進夾具裡的已安裝套件(installedDsRoot)。 */
export function installShippedTokenFiles({ sourceDsRoot, installedDsRoot }) {
  for (const relative of SHIPPED_TOKEN_FILES) {
    mkdirSync(dirname(join(installedDsRoot, relative)), { recursive: true })
    copyFileSync(join(sourceDsRoot, relative), join(installedDsRoot, relative))
  }
}
