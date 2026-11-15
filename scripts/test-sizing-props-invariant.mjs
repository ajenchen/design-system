#!/usr/bin/env node
// meta-test for sizing-props-invariant —— 現況必綠 + 對照組必紅。純靜態,不需要 storybook 建置。
// 對照組(--selftest):合成原始碼證明 R1(新同義名 / 舊名缺 @deprecated)、R2(DS 自己的 JSX 用已停用舊名)、
// R3(size 收數字或任意字串)、R4(繼承 InputHTMLAttributes 沒 Omit 原生 width / height)各自會紅,
// 合規寫法、非 *Props 型別、svg / img 的 height、正方形媒體例外不誤報。
// 出處:user 2026-11-11「尺寸:甲」;規則 packages/design-system/ds-canonical/references/props-naming.md「尺寸參數」。
// 跑法與判準的單一實作住 scripts/lib/gate-selftest-meta.mjs。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/sizing-props-invariant.mjs')
