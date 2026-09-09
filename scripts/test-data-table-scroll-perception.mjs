#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  analyzeContent,
  assessContentCoverage,
} from "./lib/data-table-content-metrics.mjs";

const arg = (key, fallback) =>
  process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3) ??
  fallback;
const out = resolve(arg("out", "tmp/data-table-scroll-perception-controls"));
mkdirSync(out, { recursive: true });
const setup = { rowHeight: 40, rect: { y: 0, height: 80, width: 500 } };
const row = (index, shell = false) => ({
  index,
  shell,
  top: index * 40,
  bottom: index * 40 + 39,
  ink: shell ? 0 : 12,
});
const negative = analyzeContent(
  [
    { ts: 0, rows: [row(0), row(1)] },
    { ts: 0.02, rows: [row(0), row(1)] },
  ],
  setup,
  1000
);
assert.equal(negative.pixelLatencyMs.max, 0);
assert.equal(negative.pixelShellFrames, 0);
const delayed = analyzeContent(
  [
    { ts: 0, rows: [row(0), row(1, true)] },
    { ts: 0.16, rows: [row(0), row(1)] },
  ],
  setup,
  1000
);
assert.equal(delayed.pixelLatencyMs.max, 160);
assert.equal(delayed.shellAreaCssPxMs, 40 * 500 * 160);
const missing = analyzeContent(
  [
    { ts: 0, rows: [row(0)] },
    { ts: 0.08, rows: [row(0), row(1)] },
  ],
  setup,
  1000
);
assert.equal(missing.pixelLatencyMs.max, 80);
assert.equal(missing.pixelMissingFrames, 1);
const unresolved = analyzeContent(
  [{ ts: 0, rows: [row(0), row(1, true)] }],
  setup,
  1000
);
assert.equal(unresolved.unresolved.length, 1);
const blank = analyzeContent(
  [{ ts: 0, rows: [{ ...row(0), ink: 0 }, row(1)] }],
  setup,
  1000
);
assert.equal(
  blank.pixelShellFrames,
  0,
  "Real-row markers do not imply painted cell content"
);
assert.equal(blank.pixelBlankFullFrames, 1);
assert.equal(blank.pixelBlankFullRows, 1);
const partialPadding = analyzeContent(
  [{ ts: 0, rows: [row(0), { ...row(1), bottom: 46, ink: 0 }] }],
  setup,
  1000
);
assert.equal(
  partialPadding.pixelBlankFullFrames,
  0,
  "Entering row padding is not missing text"
);
const allUnmapped = analyzeContent([{ ts: 0, rows: [] }], setup, 1000);
assert.equal(allUnmapped.unmappedFrames, 1);
assert.equal(allUnmapped.captureCoverageValid, false);
const afterInputShell = analyzeContent(
  [
    { ts: 0, rows: [row(0), row(1)] },
    { ts: 0.05, rows: [row(0), row(1, true)] },
    { ts: 0.08, rows: [row(0), row(1)] },
  ],
  setup,
  20
);
assert.equal(afterInputShell.pixelShellFrames, 0);
assert.ok(
  afterInputShell.shellAreaCssPxMs > 0,
  "A post-input shell remains a visible defect"
);
const coverageInput = {
  inputStart: 0,
  inputEnd: 1000,
  inputDistance: 1000,
  finalY: 1000,
};
const completeSamples = Array.from({ length: 21 }, (_, i) => ({
  timestampMs: i * 50,
  scrollY: i * 50,
}));
assert.equal(assessContentCoverage(completeSamples, coverageInput).valid, true);
// 亂序 7ms 的幀(runner 實測 83ea771f 第 62 幀)不是擷取壞了:排序後仍有效、亂序數記 1
const swapped = completeSamples.slice();
[swapped[10], swapped[11]] = [
  { ...swapped[11], timestampMs: swapped[11].timestampMs - 7 },
  { ...swapped[10], timestampMs: swapped[10].timestampMs + 7 },
];
{
  const r = assessContentCoverage(swapped, coverageInput);
  assert.equal(r.valid, true, "Frames delivered 7ms out of order must be sorted, not rejected");
  assert.equal(r.reorderedSamples, 1, "The reorder must be counted");
}
assert.equal(
  assessContentCoverage(
    completeSamples.map((s, i) => (i === 5 ? { ...s, scrollY: NaN } : s)),
    coverageInput
  ).valid,
  false,
  "A sample whose marker could not be decoded must still fail"
);
assert.equal(
  assessContentCoverage(
    completeSamples.map((s) => ({ ...s, scrollY: 0 })),
    coverageInput
  ).valid,
  false,
  "Stale PNGs plus a correct DOM offset must fail"
);
assert.equal(
  assessContentCoverage(
    completeSamples.map((s) => ({ ...s, timestampMs: s.timestampMs + 1100 })),
    coverageInput
  ).valid,
  false,
  "Settled-only PNGs must fail"
);
assert.equal(
  assessContentCoverage(
    completeSamples.filter((s) => s.timestampMs <= 300 || s.timestampMs >= 550),
    coverageInput
  ).valid,
  false,
  "A gap hiding active content must fail"
);
assert.equal(
  assessContentCoverage(completeSamples.slice(1), coverageInput).valid,
  false,
  "Missing the initial PNG offset must fail"
);
assert.equal(
  assessContentCoverage(completeSamples.slice(0, -1), coverageInput).valid,
  false,
  "Missing the final PNG offset must fail"
);
if (process.argv.includes("--unit-only")) {
  console.log(
    "PASS: content/shell/missing/unresolved/full-row ink/partial padding/PNG coverage controls"
  );
} else {
  for (const mode of ["on", "ink"]) {
    const caseOut = join(out, mode === "on" ? "delayed" : "hidden-content");
    const result = spawnSync(
      process.execPath,
      [
        "scripts/data-table-scroll-perception.mjs",
        `--static=${arg(
          "static",
          process.env.DT_STATIC ?? "storybook-static"
        )}`,
        `--out=${caseOut}`,
        // 3000 而不是 4500(2026-09-10,0913057c 讀回):對照組的目的是證明「藏墨跡」與「延遲內容」兩個偵測器會紅,
        // 不是測速度。4500 在共享 runner 上一次 100–200ms 的主執行緒停頓 = 一個 scroll 事件跳 467px = 整個視窗,
        // 那是任何版本(含 R17)都會先出殼的「整窗跳轉」,對照組會因此誤紅;3000 要 ≥ 155ms 的停頓才會碰到。
        "--peak=3000",
        "--dpr=2",
        `--sabotage=${mode}`,
        "--assert=on",
      ],
      { encoding: "utf8", timeout: 120000 }
    );
    writeFileSync(
      join(out, `runtime-${mode}.log`),
      result.stdout + result.stderr
    );
    assert.equal(
      result.status,
      1,
      "Deliberate delay must make the normal gate exit 1"
    );
    const data = JSON.parse(readFileSync(join(caseOut, "summary.json")));
    assert.ok(
      data.castFrames >= 10 && data.pixelRows >= 10,
      "Instrumentation must run"
    );
    assert.equal(
      data.errors.length,
      0,
      "A runtime crash is not a successful control"
    );
    assert.equal(
      data.captureCoverageValid,
      true,
      "A failed capture is not a successful control"
    );
    if (mode === "on")
      assert.ok(
        data.pixelShellFrames >= 3 && data.pixelLatencyMs.max >= 50,
        "Actual delayed PNG content must be detected"
      );
    else {
      assert.equal(
        data.pixelShellFrames,
        0,
        "Hidden content must retain the full-row marker"
      );
      assert.ok(
        data.pixelBlankFullFrames >= 3,
        "The PNG gate must detect missing real ink independently of the marker"
      );
    }
    console.log(
      "PASS: intentional content delay rejected by PNG gate",
      JSON.stringify({
        frames: data.pixelShellFrames,
        delay: data.pixelLatencyMs.max,
        mode,
        blankFullFrames: data.pixelBlankFullFrames,
      })
    );
  }
}
