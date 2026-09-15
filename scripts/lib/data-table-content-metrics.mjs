export function quantileSummary(values) {
  const a = values.slice().sort((x, y) => x - y);
  return {
    n: a.length,
    median: a[Math.floor(a.length * 0.5)] ?? null,
    p95: a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)] ?? null,
    max: a.at(-1) ?? null,
  };
}

// A correct final DOM offset cannot prove the PNG stream covered the input.
// The 100 ms capture-gap bound is an instrumentation completeness check, not a
// claim that unobserved content latencies below that bound were measured.
export function assessContentCoverage(
  rawSamples,
  { inputStart, inputEnd, inputDistance, finalY }
) {
  // 依時間戳排序後評估;亂序只記數(CDP 幀送達順序不保證),非有限值才是無效樣本
  const reorderedSamples = rawSamples.reduce(
    (n, s, i) => n + (i > 0 && s.timestampMs < rawSamples[i - 1].timestampMs ? 1 : 0),
    0
  );
  const samples = [...rawSamples].sort((a, b) => a.timestampMs - b.timestampMs);
  const active = samples.filter(
    (s) => s.timestampMs >= inputStart && s.timestampMs <= inputEnd
  );
  const durationMs = inputEnd - inputStart;
  const first = samples[0],
    last = samples.at(-1);
  const activeFirst = active[0],
    activeLast = active.at(-1);
  const activeSpanMs =
    activeFirst && activeLast
      ? activeLast.timestampMs - activeFirst.timestampMs
      : 0;
  const activeUniqueOffsets = new Set(active.map((s) => s.scrollY)).size;
  const offsets = active.map((s) => s.scrollY);
  const activeTravelPx = offsets.length
    ? Math.max(...offsets) - Math.min(...offsets)
    : 0;
  const gaps = active
    .slice(1)
    .map((s, i) => s.timestampMs - active[i].timestampMs);
  const firstActiveDelayMs = activeFirst
    ? activeFirst.timestampMs - inputStart
    : null;
  const lastActiveLagMs = activeLast ? inputEnd - activeLast.timestampMs : null;
  const maxActiveGapMs = active.length
    ? Math.max(0, ...gaps, firstActiveDelayMs, lastActiveLagMs)
    : null;
  const spanRatio = durationMs > 0 ? activeSpanMs / durationMs : 0;
  const travelRatio = inputDistance > 0 ? activeTravelPx / inputDistance : 0;
  const reasons = [];
  if (
    ![inputStart, inputEnd, inputDistance, finalY].every(Number.isFinite) ||
    durationMs <= 0 ||
    inputDistance <= 0
  )
    reasons.push("invalid input interval or distance");
  if (
    samples.some(
      (s) => !Number.isFinite(s.timestampMs) || !Number.isFinite(s.scrollY)
    )
  )
    reasons.push("invalid PNG samples");
  if (active.length < 10) reasons.push("fewer than 10 active PNGs");
  if (activeUniqueOffsets < 10)
    reasons.push("fewer than 10 decoded scroll positions");
  if (spanRatio < 0.9)
    reasons.push("PNGs cover less than 90% of the input interval");
  if (travelRatio < 0.9)
    reasons.push("active PNGs cover less than 90% of requested travel");
  // 送幀缺口門檻預設 100ms,`DT_PERCEPTION_GAP_MS` 可調(2026-09-11)。
  // 這是**擷取有效性**判定(這次量到的東西可不可信),不是表格的品質判定 —— 調它不會放過表格的回歸。
  // 需要調的原因:dpr2 每張 PNG 是 dpr1 的四倍畫素,慢 runner 上編碼一慢就整排踩線
  // (50ee1d3b 五次的最長缺口是 114 / 110 / 116 / 103 / 109ms,而同 job 的固定工作量對照顯示那台機器慢 ~40%)。
  // 其餘覆蓋率守衛(≥10 幀、≥10 個解碼位置、涵蓋 90% 輸入區間與行程、首尾偏移準確)一條都沒動。
  const GAP_LIMIT_MS = Number(process.env.DT_PERCEPTION_GAP_MS ?? 100);
  if (maxActiveGapMs == null || maxActiveGapMs > GAP_LIMIT_MS)
    reasons.push(`active PNG gap exceeds ${GAP_LIMIT_MS} ms`);
  if (!first || Math.abs(first.scrollY) > 2)
    reasons.push("initial PNG does not show the starting offset");
  if (!last || Math.abs(last.scrollY - finalY) > 2)
    reasons.push("final PNG does not show the final DOM offset");
  if (Math.abs(finalY - inputDistance) > 2)
    reasons.push("final offset differs from requested travel");
  return {
    valid: reasons.length === 0,
    reasons,
    reorderedSamples,
    activeFrames: active.length,
    activeUniqueOffsets,
    activeSpanMs,
    inputDurationMs: durationMs,
    spanRatio,
    activeTravelPx,
    travelRatio,
    firstActiveDelayMs,
    lastActiveLagMs,
    maxActiveGapMs,
    firstDecodedScrollY: first?.scrollY ?? null,
    finalDecodedScrollY: last?.scrollY ?? null,
  };
}
// Row IDs are encoded in a narrow inert paint marker that moves with the actual
// scrolling row. Decode the same PNG as its content; do not join DOM and raster
// clocks and pretend that their states are simultaneous.
export function analyzeContent(rawPixels, setup, inputEnd, input = {}) {
  // 幀依擷取時間戳排序(perception 腳本已排過;這裡是給其他呼叫端的防線)
  const pixels = [...rawPixels].sort((a, b) => a.ts - b.ts);
  const seen = new Map(),
    inkSeen = new Map();
  const inputStart = input.inputStart ?? pixels[0]?.ts * 1000;
  const decodedFrames = [],
    blankFullRows = new Set();
  let blankFullFrames = 0,
    fullContentSamples = 0;
  let areaMs = 0,
    shellFrames = 0,
    activeFrames = 0,
    missingAreaMs = 0,
    unmappedFrames = 0,
    missingFrames = 0;
  // 最後一個解得出捲動位置的幀:輸入結束後的靜止畫面(perception 腳本在輸入結束後再擷取 900ms),慢機器判準看它有沒有補齊
  let settled = null;
  for (let i = 0; i < pixels.length; i++) {
    const f = pixels[i],
      dt = ((pixels[i + 1]?.ts ?? f.ts + 0.0167) - f.ts) * 1000;
    if (f.ts * 1000 >= inputStart && f.ts * 1000 <= inputEnd) {
      activeFrames++;
      if (f.rows.some((r) => r.shell)) shellFrames++;
    }
    const full = f.rows.find((r) => r.bottom - r.top >= setup.rowHeight - 2);
    if (!full) {
      unmappedFrames++;
      continue;
    }
    const scrollY = full.index * setup.rowHeight - (full.top - setup.rect.y);
    f.decodedScrollY = scrollY;
    decodedFrames.push({ timestampMs: f.ts * 1000, scrollY });
    let blankFull = false;
    for (const row of f.rows) {
      // A nearly complete row includes its text region. Partial entering rows
      // can legitimately expose only padding, so they are not ink assertions.
      if (row.shell || row.bottom - row.top < setup.rowHeight - 2) continue;
      fullContentSamples++;
      if (!Number.isFinite(row.ink) || row.ink <= 0) {
        blankFull = true;
        blankFullRows.add(row.index);
      }
    }
    if (blankFull) blankFullFrames++;
    const actual = new Map(f.rows.map((r) => [r.index, r]));
    const first = Math.max(0, Math.floor(scrollY / setup.rowHeight)),
      last = Math.ceil((scrollY + setup.rect.height) / setup.rowHeight) - 1;
    let missing = false;
    const frameShellRows = [],
      frameMissingRows = [];
    for (let idx = first; idx <= last; idx++) {
      const height =
        Math.min((idx + 1) * setup.rowHeight, scrollY + setup.rect.height) -
        Math.max(idx * setup.rowHeight, scrollY);
      // 露出不到 3 CSS px 的邊緣列不列入判定:這不是寬容,是量出來的解碼下限。
      // 標記條是列內 `top:0;bottom:1px` 的直條,列被視窗上下緣裁到只剩 1-2px 時,可用掃描線只剩 0-1 條,
      // 又被裁切邊的反鋸齒染色 → 解碼成功率只有一半。2026-09-10 用同一份擷取交叉比對 DOM 取樣量到:
      // 露出 1px 解到 4 次 / 解不到 4 次;2px 解到 2 / 解不到 2;3px 起 40 次全解到、零失手。
      // 對照證據:被判「缺列」的那兩幀,DOM 取樣裡該列是已掛載的完整列(`top:55 bottom:95`,視窗上緣 93),
      // 也就是畫面上真的有東西,只是 2px 讀不出條碼。門檻取 3 = 解碼可靠的最小值,不多讓一格。
      if (height < 3) continue;
      const row = actual.get(idx),
        ready = row && !row.shell;
      if (!seen.has(idx))
        seen.set(idx, {
          index: idx,
          entered: f.ts,
          full: null,
          initialState: row ? (row.shell ? "shell" : "content") : "missing",
          lastSeen: f.ts,
          visibleFrames: 0,
        });
      const e = seen.get(idx);
      e.lastSeen = f.ts;
      e.visibleFrames++;
      if (e.full == null && ready) e.full = f.ts;
      if (ready && row.ink > 0 && !inkSeen.has(idx)) inkSeen.set(idx, f.ts);
      if (row?.shell) {
        areaMs += height * setup.rect.width * dt;
        frameShellRows.push(idx);
      }
      if (!row) {
        missingAreaMs += height * setup.rect.width * dt;
        missing = true;
        frameMissingRows.push(idx);
      }
    }
    if (missing) missingFrames++;
    settled = {
      ts: f.ts,
      afterInputMs: f.ts * 1000 - inputEnd,
      shellRows: frameShellRows,
      missingRows: frameMissingRows,
    };
  }
  if (settled) {
    // screencast 只在畫面有變化時送幀:最後一幀之後沒有新幀 = 之後沒再變,所以最後一幀就是靜止畫面 ——
    // 前提是擷取本身有跑到輸入結束後 ≥ 250ms(perception 腳本停擷取前等 900ms,以 input.captureEnd 傳進來);
    // 沒給 captureEnd 就保守地用最後一幀的時間(本機快機器最後一幀常在輸入結束後 ~240ms,4ec7eb19 讀回時 CI 那跑是 894ms)。
    settled.captureAfterInputMs = (input.captureEnd ?? settled.ts * 1000) - inputEnd;
    settled.valid = settled.captureAfterInputMs >= 250;
    settled.incompleteRows = settled.shellRows.length + settled.missingRows.length;
  }
  const rows = [...seen.values()];
  const captureCoverage = assessContentCoverage(decodedFrames, {
    inputStart,
    inputEnd,
    inputDistance: input.inputDistance,
    finalY: input.finalY,
  });
  return {
    rows,
    pixelRows: seen.size,
    pixelLatencyMs: quantileSummary(
      rows.filter((r) => r.full != null).map((r) => (r.full - r.entered) * 1000)
    ),
    pixelInkExposureMs: quantileSummary(
      rows
        .filter((r) => inkSeen.has(r.index))
        .map((r) => (inkSeen.get(r.index) - r.entered) * 1000)
    ),
    pixelShellFrames: shellFrames,
    activeFrames,
    pixelShellFrameRatio: activeFrames ? shellFrames / activeFrames : null,
    shellAreaCssPxMs: areaMs,
    missingAreaCssPxMs: missingAreaMs,
    pixelMissingFrames: missingFrames,
    pixelFullContentSamples: fullContentSamples,
    pixelBlankFullFrames: blankFullFrames,
    pixelBlankFullRows: blankFullRows.size,
    captureCoverage,
    captureCoverageValid: captureCoverage.valid,
    unmappedFrames,
    unresolved: rows.filter((r) => r.full == null),
    settled,
  };
}

// 慢機器判準(三次都整窗跳轉時由 perception 父程序使用):只斷言不依賴機器速度的事 ——
// 滿列從不留白、擷取有效、輸入完整送達、靜止後畫面補齊(無殼、無缺列)。
// 掃過視窗期間沒來得及補齊的列(unresolved)**不在此列**:runner 凍結 240ms 後補送的 scroll 事件一次跳 300–539px,
// 列在視窗裡只待 5–6 幀(≈90ms)就被捲走,那是機器沒趕上,不是表格(2026-09-10,4ec7eb19 dpr2 4500 讀回:
// 列 39–41 殼 90ms 後離開視窗、列 52 殼 280ms 其中 240ms 是主執行緒凍結;輸入結束後 13 列全滿、零殼零缺列)。
// 一般速度的路徑仍斷言 unresolved = 0(停頓的那一跑會重跑,不會走到這裡)。
export function slowMachineVerdict(x) {
  const reasons = [];
  if (x.pixelBlankFullFrames !== 0) reasons.push(`滿列留白 ${x.pixelBlankFullFrames} 幀`);
  if (!x.captureCoverageValid) reasons.push("擷取無效");
  if (x.wheelCoalesced) reasons.push("wheel tick 合併成整窗跳轉");
  if ((x.errors?.length ?? 0) !== 0) reasons.push(`頁面錯誤 ${x.errors.length} 則`);
  if (!(Math.abs(x.finalY - x.inputDistance) <= 2)) reasons.push("輸入未完整送達");
  if (!(x.pixelFullContentSamples >= 10)) reasons.push("滿列樣本不足 10");
  if (!x.settled?.valid) reasons.push("靜止畫面未擷取(擷取在輸入結束後 < 250ms 就停了)");
  else if (x.settled.incompleteRows > 0)
    reasons.push(`靜止後仍未補齊:殼 ${x.settled.shellRows.length} 列 / 缺列 ${x.settled.missingRows.length}`);
  return { ok: reasons.length === 0, reasons };
}
