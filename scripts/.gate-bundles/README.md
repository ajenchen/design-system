# 閘用暫存打包輸出(不進版控)

`test-agent-fab-drag-zones.mjs` / `test-distribute-column-widths.mjs` 要測的是 `.tsx` / `.ts` 原始碼裡的純函式,
所以先用 esbuild 打包成 `.mjs` 再 import。

**為什麼是固定檔名而不是 `mktemp` 亂數路徑**(2026-09-21):治理 harness 的來源審查只允許
`import('<字面字串>')` —— 亂數路徑一律判為「動態模組載入」而擋下整個 runner。這兩支閘因此
從沒被 runner 跑過。固定路徑讓 specifier 變回字面值,而每次執行都會先覆寫,所以不會測到舊的。

檔名刻意不以 `test-` 開頭:`scripts/` 的 harness discovery 只收 `test-*.mjs`,這樣產出物不會
被當成一支新的治理測試而弄破 source closure。
