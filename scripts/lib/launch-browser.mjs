// ═══════════════════════════════════════════════════════════════════════════
// Playwright 啟動參數的單一來源
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個檔**(2026-09-07):
// 全 repo 有 20 支以上的腳本各自寫 `chromium.launch({ headless: true })`,
// 而本 repo 的沙箱**少了 `--single-process --no-sandbox` 就起不了 Chromium**。
// 結果是:有 SKIPPED-ENV 守衛的腳本一路回 exit 0(看起來綠的,其實一條都沒驗);
// 沒有守衛的直接爆掉。實測 `data-table-invariants.mjs` 的 322 條不變條件
// **在本機從來沒有真的執行過** —— 補上參數後才第一次跑起來(而且全過)。
//
// 這是「同一個值散在 20 幾處」的典型(M17):任何一支忘了寫,它就靜靜地不驗任何東西。
//
// `--single-process`:沙箱不給開 zygote / 多程序。
// `--no-sandbox`:外層已經有沙箱,Chromium 自己的那層起不來。
// 實測(2026-09-07)三種組合:只給 `--no-sandbox` 起不來、什麼都不給也起不來,**兩個都要**。
//
// ⚠️ **`--single-process` 的代價:開不了第二個 browser context。**
// 需要多個 context(不同 deviceScaleFactor / 不同權限)的腳本,要**每種情境重開一次瀏覽器**,
// 不能在同一個 browser 上 `newContext()` —— 那會「第一個過、第二個當場崩」,
// 症狀是跑到一半才爆,很容易被誤讀成別的問題(`test-devmode-geometry-invariant.mjs` 踩過)。
// 同一個 context 內開多個 page 也不穩,長流程建議一個 page 走完。
//
// 用法:
//   import { launchBrowser } from './lib/launch-browser.mjs'
//   const browser = await launchBrowser()                       // 起不來會丟例外
//   const browser = await launchBrowser({ headless: false })     // 覆寫任何選項
//   const browser = await launchBrowserOrSkip()                  // 起不來 → 印 SKIPPED-ENV 並 exit 0

import { chromium } from 'playwright'

/** 本 repo 沙箱起得了 Chromium 的必要參數。 */
export const SANDBOX_ARGS = ['--single-process', '--no-sandbox']

export async function launchBrowser(options = {}) {
  const { args = [], ...rest } = options
  return chromium.launch({ headless: true, ...rest, args: [...SANDBOX_ARGS, ...args] })
}

/**
 * 起不了瀏覽器時印 SKIPPED-ENV 並 `exit 0`。
 *
 * **只給真的可能在無瀏覽器環境跑的腳本用。** 用它就要接受「這次什麼都沒驗」也是綠的 ——
 * 所以呼叫端最好在 CI 另外確認它真的有跑到(不然就會重演上面那個 322 條的狀況)。
 */
export async function launchBrowserOrSkip(options = {}) {
  try {
    return await launchBrowser(options)
  } catch (error) {
    console.error(`⚠️  SKIPPED-ENV: 無法啟動 Chromium(${String(error?.message || error).split('\n')[0]})`)
    process.exit(0)
  }
}
