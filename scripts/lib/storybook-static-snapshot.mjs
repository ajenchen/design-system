// ═══════════════════════════════════════════════════════════════════════════
// 凍結受測建置:把 storybook-static 複製成本次執行獨佔的快照
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個**(2026-09-24,本機誤紅一次):
// `data-table-invariants.mjs` 在 :156 `waitForSelector` 逾時 30 秒,重跑就綠。實際經過:
// 另一個 agent 在**同一份工作樹**跑 `npm run build-storybook`(10:24:00 起,10:26:13 建完),
// Storybook 8 的 build 第一步就是把輸出目錄整個刪掉再重寫
// (node_modules/@storybook/core/dist/core-server/index.js「Cleaning outputDir」→ rm recursive),
// 前 ~70 秒 iframe.html 與 assets/ 都不存在。閘的第一次導覽用的是舊檔、成功;第二次導覽時目錄
// 已被清空 → 資源 404 → story 永遠不渲染 → 30 秒後被當成「表格沒有列」。重跑之所以綠,只是因為
// 那時對方剛好建完了。
//
// 這是 M37:閘開頭的 stale-build 守衛驗的是「那一刻的那份建置」,之後每次導覽讀的卻是
// 「路徑 storybook-static 底下當下剛好有的東西」—— 把「路徑」當成「建置身分」。
//
// 正解:守衛通過之後,把那份建置複製到只有本次執行讀得到的暫存目錄,後續一律從快照供檔。
// 身分標記用既有的 build-info.json(scripts/gen-build-info.mjs):它是 `npm run build-storybook`
// **最後**寫的檔、內含 builtAt 毫秒時間戳,而重建的第一步會把它刪掉 —— 所以
//   「複製前後都存在且逐位元組相同」⇔「複製期間沒有任何重建開始或結束」。
// 不存在 = 目前沒有完整的建置(正在重建或從沒建完),以**儀器失效**的名義紅,不指控被測物。

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export class StorybookBuildNotStableError extends Error {}

const MARKER = 'build-info.json'

// `copy` 只給測試注入(在複製途中改動標記,確定性地走到「複製期間被重建」那一枝);正式呼叫一律用預設。
export function snapshotStorybookStatic(staticDir, { copy = (from, to) => cpSync(from, to, { recursive: true }) } = {}) {
  const markerPath = join(staticDir, MARKER)
  const readMarker = () => (existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : null)
  const before = readMarker()
  if (before === null) {
    throw new StorybookBuildNotStableError(
      `INSTRUMENT: ${markerPath} 不存在 —— storybook-static 不是一份完整的建置(正在重建,或上次沒建完)。` +
      '這不是被測元件的失敗;等建置完成(或跑 `npm run build-storybook`)再執行。',
    )
  }
  const dir = mkdtempSync(join(tmpdir(), 'storybook-static-snapshot-'))
  try {
    copy(staticDir, dir)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw new StorybookBuildNotStableError(`INSTRUMENT: 複製 storybook-static 失敗(複製期間目錄被改動?):${error.message}`)
  }
  const after = readMarker()
  const copied = existsSync(join(dir, MARKER)) ? readFileSync(join(dir, MARKER), 'utf8') : null
  if (after !== before || copied !== before) {
    rmSync(dir, { recursive: true, force: true })
    throw new StorybookBuildNotStableError(
      'INSTRUMENT: 複製期間 storybook-static 被重建(build-info.json 前後不一致)—— 快照不是單一建置。這不是被測元件的失敗。',
    )
  }
  let disposed = false
  return Object.freeze({
    dir,
    buildInfo: JSON.parse(before),
    dispose() {
      if (disposed) return
      disposed = true
      rmSync(dir, { recursive: true, force: true })
    },
  })
}
