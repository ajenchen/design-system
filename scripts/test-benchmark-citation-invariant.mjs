#!/usr/bin/env node
// meta-test for benchmark-citation-invariant —— 現況必綠 + 對照組必紅。純靜態,不需要 storybook 建置。
// 對照組(--selftest):判定表每格兩面(有來源 / 沒來源 / partial / tsx 範例資料 / 程式碼框 / 豁免標記 …)同時跑共用實作
// packages/design-system/ds-canonical/hooks/lib/benchmark-citation.mjs 與真的 check_benchmark_citation.sh,兩邊必須同判;
// 合成樹三類(元件規格 / 其他規格 / tsx)各放一支違規檔,三類都要被掃到;棘輪新檔 / 變多紅、持平 / 變少綠、元件規格不吃棘輪。
// 出處:M22(meta-patterns.md);2026-11-16 A29。跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/benchmark-citation-invariant.mjs')
