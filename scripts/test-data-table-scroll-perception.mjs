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
        "--peak=4500",
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
