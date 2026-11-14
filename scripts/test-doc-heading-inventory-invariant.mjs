#!/usr/bin/env node
// meta-test for doc-heading-inventory-invariant —— 現況必綠 + 對照組必紅。需要 storybook 建置(瀏覽器 lane)。
// 對照組(--selftest,完整跑):判定表(A1 / A2 / A3 各自只紅自己、量不到一律儀器失效、地板只在完整掃描檢查);
// 真頁面 Avatar 設計原則「使用指引」(2026-11-14 前是 Chip 那一頁,理由見閘的 CONTROL_TITLE 註解)—— α 文件一開始就把一般密度的 tight 改成 8px
// (正好紅 A1 + A2 lg「Avatar 代表身份…」,並印「只比首次標記看不到」),
// β 首次量完才改(正好紅 A2 md、lg),γ 重判之後內容下推 4px(那一頁每格 A3 紅、正好多 4);channel 換空函式 / 不存在的 story / 假建置 → 儀器失效。
// baseline 用 --limit=60 收斂:這支驗的是**偵測力**(該紅會不會紅),覆蓋率由 CI 的完整掃描負責(同 test-avatar-anchor-box-invariant.mjs 的理由)。
// 出處:tmp wip MASTER-TODO A7 ⑤(第四批審查第 13 條)。「兩種密度判定相同」依 layoutSpace.spec.md 規則 3「標題區 → 內容」的固定門檻句;
// 「首次 = 重判」與數法本身是【AI 推導】,不是 user 的決定。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/doc-heading-inventory-invariant.mjs', { baseArgs: ['--limit=60'] })
