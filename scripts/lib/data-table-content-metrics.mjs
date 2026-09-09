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
  if (maxActiveGapMs == null || maxActiveGapMs > 100)
    reasons.push("active PNG gap exceeds 100 ms");
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
    for (let idx = first; idx <= last; idx++) {
      const height =
        Math.min((idx + 1) * setup.rowHeight, scrollY + setup.rect.height) -
        Math.max(idx * setup.rowHeight, scrollY);
      // Less than 2 CSS pixels can be solely the row divider or barcode rounding.
      if (height < 2) continue;
      const row = actual.get(idx),
        ready = row && !row.shell;
      if (!seen.has(idx))
        seen.set(idx, {
          index: idx,
          entered: f.ts,
          full: null,
          initialState: row ? (row.shell ? "shell" : "content") : "missing",
        });
      const e = seen.get(idx);
      if (e.full == null && ready) e.full = f.ts;
      if (ready && row.ink > 0 && !inkSeen.has(idx)) inkSeen.set(idx, f.ts);
      if (row?.shell) areaMs += height * setup.rect.width * dt;
      if (!row) {
        missingAreaMs += height * setup.rect.width * dt;
        missing = true;
      }
    }
    if (missing) missingFrames++;
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
  };
}
