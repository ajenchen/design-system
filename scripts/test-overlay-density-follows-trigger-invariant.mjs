#!/usr/bin/env node
// meta-test for overlay-density-follows-trigger-invariant —— 現況必綠(七種浮層 × 整頁一般 / 大 × 一般 / 大密度區塊 = 28 格、60 條)
// + 對照組(--selftest;每一種破法都比「紅的集合 = 期望的集合」,不是數紅了幾格):
//   判定表(不開瀏覽器)                         每一條各自會紅;量不到(0 / NaN / 缺元素 / 密度沒套上)一律判成儀器失效
//   ui-size-gone  拿掉內容根元素的控制項檔位      每一種浮層「區塊 ≠ 整頁」那 2 格的 H / A / T 紅;L、子選單的 P、另外 2 格必綠
//   lock-gone / attr-gone / forced-md(就地)    版面間距那一條:鎖的(Select、日期區間)與不鎖的(下拉選單、HoverCard、Tooltip)各自紅在該紅的 2 格
//   sub-reparent  子選單的包層搬到 body          只有子選單「區塊 ≠ 整頁」那 2 格的 H、P 紅;主選單 4 格必綠
//   token-unreadable、假建置                     必須被判成儀器失效(假建置那一次整支閘結束碼 2),不可以讀成紅或綠
// 每一格量什麼、每一種破法紅在哪,唯一的住所是閘檔頭的 @gate-contract 與閘裡的 KINDS / BREAKS 兩張表;這裡只是摘要。
// 跑法與判準的單一實作住在 scripts/lib/gate-selftest-meta.mjs(它只認閘印出的標記:所以閘的 --selftest 成功時不會印出任何標記字樣)。
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'

runGateSelftestMeta('scripts/overlay-density-follows-trigger-invariant.mjs')
