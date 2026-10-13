#!/usr/bin/env node
// meta-test for toast-stage-placement-invariant —— 現況必綠、注入改動前的落點(toaster offset 釘回 sonner 預設)必讓並排 / 拖寬 / 入口鈕三個情境紅
// (gate-meta-test 家族)。需要已 build 的 storybook-static;略過只認閘印出的 MISSING-BUILD / STALE-BUILD / SKIPPED-ENV,
// INSTRUMENT-FAIL 一律紅(判定由共用實作 lib/gate-selftest-meta.mjs 負責,不在這裡另寫一份)。規格:toast.spec.md「落點」。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/toast-stage-placement-invariant.mjs')
