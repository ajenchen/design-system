#!/usr/bin/env node
// meta-test for layout-body-edges-invariant —— 現況必綠 + 對照組必紅。需要 storybook 建置(瀏覽器 lane)。
// 對照組(--selftest):判定表(bounded / unbounded / element × 容器種類兩面、標記實不實、宣告種類、例外 / pending / 觸發點 / 過期 / 只准變少、儀器失效)
// + 真建置 Dialog「大檔位:對話框裡放表格」(A18 那則,點開才看得到):現況綠、不點觸發點量不到、拿掉表格的 data-layout-region 紅(缺標記)、
// 容器不再自判紅(SurfaceBody 三段同一個破法紅「與頂部同值」)、一般按鈕 / 選單項目打開的對話框點了量得到、不點量不到(審查 MF1)、標記造假兩種紅;
// 判定表另含例外檔整筆比(同一個 key 放寬也紅,審查 MF4)。
// baseline 用 --limit=60 收斂:這支驗的是偵測力(該紅會不會紅),覆蓋率由 CI 的完整掃描負責(同 test-doc-heading-inventory-invariant.mjs 的理由)。
// 出處:A102(2026-11-17)—— user 同日:「到底要怎樣才能根本解？確保你每次該遵循layout space設計原則的地方都有遵循？」;規則 = layoutSpace.spec.md 規則 4。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/layout-body-edges-invariant.mjs', { baseArgs: ['--limit=60'] })
