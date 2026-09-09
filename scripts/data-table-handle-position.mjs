#!/usr/bin/env node
// R17: compare portal geometry, fading ghosts, row identity, and hover mutations.
// Usage: node scripts/data-table-handle-position.mjs --static=<storybook-static> --out=<dir> --dpr=2
// Geometry gate includes fading handles (computed opacity > 0), not just logical hover.
// The original 150 ms fade must keep following its owning row. --selftest injects
// an intentional 20 px position error and proves this gate rejects it. PNG/trace
// artifacts use --capture=true --trace=true; the probe and gesture input are identical.
import { launchBrowser } from "./lib/launch-browser.mjs";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";
const arg = (n, d) =>
  process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const selftest = process.argv.includes("--selftest");
const maxDy = Number(arg("assert-max-dy", 1));
const cfg = {
  build: arg(
    "static",
    process.env.DT_STATIC ||
      fileURLToPath(new URL("../storybook-static", import.meta.url))
  ),
  out: arg("out", ""),
  label: arg("label", "branch"),
  dpr: +arg("dpr", 1),
  peak: +arg("peak", 3000),
  duration: +arg("duration", 10000),
  capture: arg("capture", "false") === "true",
  trace: arg("trace", "false") === "true",
  probe: arg("probe", "true") === "true",
  control: selftest ? "offset" : arg("control", "none"),
  hover: arg("hover", "stationary"),
  input: arg("input", "gesture"),
};
if (!cfg.build || !cfg.out) throw Error("--static and --out are required");
fs.mkdirSync(cfg.out, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  try {
    const f = path.join(cfg.build, decodeURIComponent(req.url.split("?")[0]));
    res.setHeader(
      "Content-Type",
      mime[path.extname(f)] ?? "application/octet-stream"
    );
    res.end(fs.readFileSync(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await launchBrowser({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  const page = await browser.newPage({
    viewport: { width: 1203, height: 592 },
    deviceScaleFactor: cfg.dpr,
  });
  const cdp = await page.context().newCDPSession(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${
      server.address().port
    }/iframe.html?id=design-system-components-datatable-%E5%B1%95%E7%A4%BA--roadmap-all-in-one&viewMode=story`,
    { waitUntil: "load" }
  );
  await page.waitForSelector("[data-datatable-hscroll]");
  await page.waitForTimeout(1800);
  const setup = await page.evaluate(() => {
    const e = document.querySelector("[data-datatable-hscroll]");
    e.scrollTop = 1000;
    const r = e.getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height * 0.5,
      box: r.toJSON(),
      timeOrigin: performance.timeOrigin,
      dpr: devicePixelRatio,
      scrollTop: e.scrollTop,
    };
  });
  await page.waitForTimeout(500);
  await page.mouse.move(setup.x, setup.y);
  await page.waitForTimeout(400);
  if (cfg.control === "freeze-hover") {
    await page.evaluate(() => {
      for (const n of document.querySelectorAll("[data-hovered]"))
        n.removeAttribute("data-hovered");
      for (const type of ["mouseover", "mouseout"])
        document.addEventListener(
          type,
          (e) => e.stopImmediatePropagation(),
          true
        );
    });
    await page.waitForTimeout(200);
  }
  if (cfg.control === "no-hover")
    await page.addStyleTag({
      content:
        "[data-row-index][data-hovered]{background-color:transparent!important}",
    });
  if (cfg.control === "no-transition")
    await page.addStyleTag({
      content: 'button[aria-label="拖曳重排此列"]{transition:none!important}',
    });
  if (cfg.control === "offset")
    await page.addStyleTag({
      content: 'button[aria-label="拖曳重排此列"]{translate:0 20px!important}',
    });
  if (cfg.control === "track-fade")
    await page.evaluate(() => {
      const el = document.querySelector("[data-datatable-hscroll]");
      const follow = () => {
        for (const b of document.querySelectorAll(
          'button[aria-label="拖曳重排此列"]'
        )) {
          if (+getComputedStyle(b).opacity <= 0.001) continue;
          const k = Object.keys(b).find((k) => k.startsWith("__reactFiber$"));
          for (let f = b[k]; f; f = f.return)
            if (f.tag === 5 && f.stateNode?.matches?.("[data-row-index]")) {
              const r = f.stateNode.getBoundingClientRect();
              b.style.top = `${r.top + r.height / 2}px`;
              break;
            }
        }
      };
      el.addEventListener("scroll", follow);
      window.__fadeControl = follow;
    });
  await page.evaluate(
    ({ probe, control }) => {
      const sc = document.querySelector("[data-datatable-hscroll]");
      const root = sc.closest("[data-data-table-outer]").parentElement;
      const ids = new WeakMap();
      let seq = 0;
      const id = (n) => {
        if (!ids.has(n)) ids.set(n, ++seq);
        return ids.get(n);
      };
      const buttonSelector =
        'button[aria-label="拖曳重排此列"],button[aria-label="排序中無法拖曳"]';
      const rowSelector = "[data-datatable-hscroll] [data-row-index]";
      const ownedRow = (b) => {
        const key = Object.keys(b).find((k) => k.startsWith("__reactFiber$"));
        for (let f = b[key]; f; f = f.return) {
          const n = f.tag === 5 && f.stateNode;
          if (n?.matches?.("[data-row-index]")) return n;
        }
        return null;
      };
      const state = (window.__h = {
        active: true,
        start: performance.now(),
        frames: [],
        scrolls: [],
        hover: [],
        portals: [],
        identities: [],
        marks: [],
        mouse: [],
        rows: new Map(),
        probe,
      });
      const noteRows = () => {
        for (const n of document.querySelectorAll(rowSelector)) {
          const key =
            n.dataset.rowId ?? n.dataset.sortableRowId ?? n.dataset.rowIndex;
          const old = state.rows.get(key);
          if (old && old !== n)
            state.identities.push({
              t: performance.now(),
              key,
              old: id(old),
              current: id(n),
              oldShell: old.hasAttribute("data-row-shell"),
              shell: n.hasAttribute("data-row-shell"),
            });
          state.rows.set(key, n);
        }
      };
      noteRows();
      const collect = (phase) => {
        if (!state.active) return;
        const t = performance.now(),
          measureStart = t;
        const handles = [];
        for (const b of root.querySelectorAll(buttonSelector)) {
          const opacity = +getComputedStyle(b).opacity;
          if (opacity <= 0.001) continue;
          const row = ownedRow(b),
            br = b.getBoundingClientRect(),
            rr = row?.getBoundingClientRect();
          handles.push({
            button: id(b),
            row: row ? id(row) : null,
            rowKey:
              row?.dataset.rowId ??
              row?.dataset.sortableRowId ??
              row?.dataset.rowIndex,
            connected: row?.isConnected ?? false,
            rowHovered: row?.hasAttribute("data-hovered") ?? false,
            buttonHovered: b.matches(":hover"),
            opacity,
            targetOpacity: b.style.opacity,
            buttonRect: br.toJSON(),
            rowRect: rr?.toJSON() ?? null,
            dy: rr ? br.top + br.height / 2 - rr.top - rr.height / 2 : null,
            shell: row?.hasAttribute("data-row-shell") ?? false,
          });
        }
        state.frames.push({
          t,
          phase,
          y: sc.scrollTop,
          handles,
          probeMs: performance.now() - measureStart,
        });
      };
      const frame = () => {
        if (!state.active) return;
        if (probe) {
          collect("raf");
          setTimeout(() => collect("after-raf"), 0);
        }
        requestAnimationFrame(frame);
      };
      if (probe) requestAnimationFrame(frame);
      const observer = new MutationObserver((list) => {
        for (const m of list) {
          const t = performance.now();
          if (m.type === "attributes") {
            const n = m.target;
            const mark = `r17-hover-${state.hover.length}`;
            performance.mark(mark);
            state.hover.push({
              t,
              mark,
              node: id(n),
              row:
                n.dataset.rowId ??
                n.dataset.sortableRowId ??
                n.dataset.rowIndex,
              panel:
                n.closest("[data-datatable-panel]")?.dataset.datatablePanel ??
                "center",
              old: m.oldValue,
              value: n.getAttribute("data-hovered"),
            });
          } else
            for (const type of ["addedNodes", "removedNodes"])
              for (const n of m[type]) {
                if (n.nodeType !== 1) continue;
                const buttons = [
                  ...(n.matches(buttonSelector) ? [n] : []),
                  ...n.querySelectorAll(buttonSelector),
                ];
                for (const b of buttons) {
                  const row = ownedRow(b);
                  state.portals.push({
                    t,
                    type,
                    button: id(b),
                    row: row ? id(row) : null,
                    rowKey:
                      row?.dataset.rowId ??
                      row?.dataset.sortableRowId ??
                      row?.dataset.rowIndex,
                  });
                }
              }
        }
        noteRows();
      });
      observer.observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-hovered"],
        attributeOldValue: true,
        childList: true,
      });
      sc.addEventListener(
        "scroll",
        () => {
          if (state.active)
            state.scrolls.push({ t: performance.now(), y: sc.scrollTop });
        },
        { passive: true }
      );
      root.addEventListener("mousemove", (e) => {
        if (state.active)
          state.mouse.push({
            t: performance.now(),
            x: e.clientX,
            y: e.clientY,
            trusted: e.isTrusted,
          });
      });
      state.stop = () => {
        state.active = false;
        state.end = performance.now();
        observer.disconnect();
        const { rows, stop, ...result } = state;
        return result;
      };
      performance.mark("r17-start");
    },
    { probe: cfg.probe, control: cfg.control }
  );
  const frames = [],
    traces = [],
    layers = [];
  let screencastIndex = 0;
  cdp.on("LayerTree.layerTreeDidChange", (e) =>
    layers.push({
      t: performance.now(),
      count: e.layers?.length ?? 0,
      drawing: e.layers?.filter((l) => l.drawsContent).length ?? 0,
    })
  );
  await cdp.send("LayerTree.enable");
  await cdp.send("Performance.enable");
  if (cfg.capture) {
    const frameDir = path.join(cfg.out, "frames");
    fs.mkdirSync(frameDir, { recursive: true });
    cdp.on("Page.screencastFrame", (e) => {
      const index = screencastIndex++;
      fs.writeFileSync(
        path.join(frameDir, `${String(index).padStart(5, "0")}.png`),
        Buffer.from(e.data, "base64")
      );
      frames.push({ index, ...e.metadata });
      void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId });
    });
    await cdp.send("Page.startScreencast", {
      format: "png",
      everyNthFrame: 1,
      maxWidth: 1203 * cfg.dpr,
      maxHeight: 592 * cfg.dpr,
    });
  }
  cdp.on("Tracing.dataCollected", (e) => traces.push(...e.value));
  if (cfg.trace)
    await cdp.send("Tracing.start", {
      traceConfig: {
        includedCategories: [
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "blink.user_timing",
          "cc",
          "viz",
          "gpu",
        ],
        recordMode: "recordContinuously",
        traceBufferSizeInKb: 131072,
      },
      transferMode: "ReportEvents",
    });
  await page.evaluate(() => performance.mark("r17-trace-window-start"));
  const m0 = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
      m.name,
      m.value,
    ])
  );
  const start = performance.now(),
    gestures = [];
  let expectedDistance = 0;
  if (cfg.input === "wheel") {
    let tick = 0;
    const pending = [];
    while (tick < Math.ceil((cfg.duration * 60) / 1000)) {
      const t = performance.now() - start;
      const cycle = t % 1500;
      const speed = cfg.peak * Math.exp(-cycle / 450);
      expectedDistance += speed / 60;
      pending.push(
        cdp.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: setup.x,
          y: setup.y,
          deltaX: 0,
          deltaY: speed / 60,
        })
      );
      tick++;
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(0, start + (tick * 1000) / 60 - performance.now())
        )
      );
    }
    await Promise.all(pending);
  } else {
    for (let cycle = 0; cycle < Math.ceil(cfg.duration / 1500); cycle++) {
      for (const factor of [1, 0.72, 0.45, 0.25, 0.12]) {
        const speed = Math.max(100, cfg.peak * factor),
          distance = Math.max(10, speed * 0.1);
        expectedDistance += distance;
        gestures.push({ t: performance.now() - start, speed, distance });
        await cdp.send("Input.synthesizeScrollGesture", {
          x: setup.x,
          y: setup.y,
          yDistance: -distance,
          speed,
          gestureSourceType: "mouse",
          preventFling: true,
        });
        if (cfg.hover === "follow")
          await page.mouse.move(setup.x, setup.y + (gestures.length % 2) * 2);
      }
      await page.waitForTimeout(75);
    }
  }
  await page.waitForTimeout(350);
  const data = await page.evaluate(() => {
    performance.mark("r17-end");
    return window.__h.stop();
  });
  const m1 = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
      m.name,
      m.value,
    ])
  );
  let traceComplete = {};
  if (cfg.trace) {
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    traceComplete = await done;
  }
  if (cfg.capture) await cdp.send("Page.stopScreencast");
  await page.screenshot({ path: path.join(cfg.out, "after.png") });
  const result = {
    expectedDistance,
    inputNodeStart: start,
    inputNodeEnd: performance.now(),
    cfg,
    setup,
    gestures,
    data,
    frames,
    layers,
    errors,
    traceComplete,
    metricDelta: Object.fromEntries(
      Object.keys(m1).map((k) => [k, m1[k] - m0[k]])
    ),
  };
  fs.writeFileSync(path.join(cfg.out, "raw.json"), JSON.stringify(result));
  fs.writeFileSync(
    path.join(cfg.out, "trace.json"),
    JSON.stringify({ traceEvents: traces })
  );
  const percentile = (a, p) =>
    a.length
      ? [...a].sort((a, b) => a - b)[
          Math.min(a.length - 1, Math.floor(a.length * p))
        ]
      : null;
  const dyStats = (a) => ({
    n: a.length,
    p50: percentile(a, 0.5),
    p95: percentile(a, 0.95),
    max: a.length ? Math.max(...a) : null,
    over1: a.filter((x) => x > 1).length,
  });
  const geometry = {};
  for (const phase of ["raf", "after-raf"]) {
    const f = data.frames.filter((x) => x.phase === phase),
      h = f.flatMap((x) => x.handles);
    geometry[phase] = {
      frames: f.length,
      visibleFrames: f.filter((x) => x.handles.length).length,
      all: dyStats(h.filter((x) => x.dy !== null).map((x) => Math.abs(x.dy))),
      logical: dyStats(
        h
          .filter((x) => x.dy !== null && x.targetOpacity !== "0")
          .map((x) => Math.abs(x.dy))
      ),
      fading: dyStats(
        h
          .filter((x) => x.dy !== null && x.targetOpacity === "0")
          .map((x) => Math.abs(x.dy))
      ),
      disconnected: h.filter((x) => !x.connected).length,
      multipleHandlesFrames: f.filter((x) => x.handles.length > 1).length,
      probeMs: dyStats(f.map((x) => x.probeMs)),
    };
  }
  const timeline = {};
  for (const name of ["Layout", "UpdateLayoutTree", "Paint", "RasterTask"]) {
    const e = traces.filter((e) => e.name === name && e.ph === "X");
    timeline[name] = {
      count: e.length,
      ms: e.reduce((s, x) => s + (x.dur ?? 0), 0) / 1000,
    };
  }
  const summary = {
    cfg,
    traceValid: !traceComplete.dataLossOccurred,
    geometry,
    hover: {
      count: data.hover.length,
      perSecond: data.hover.length / ((data.end - data.start) / 1000),
      actualChanges: data.hover.filter((x) => x.old !== x.value).length,
    },
    portals: {
      added: data.portals.filter((x) => x.type === "addedNodes").length,
      removed: data.portals.filter((x) => x.type === "removedNodes").length,
    },
    rowIdentityChanges: data.identities.length,
    frames: frames.length,
    scrollEvents: data.scrolls.length,
    mouseMoves: data.mouse.length,
    timeline,
    metricDelta: result.metricDelta,
    errors,
  };
  fs.writeFileSync(
    path.join(cfg.out, "summary.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(JSON.stringify(summary));
  if (traceComplete.dataLossOccurred) {
    console.error("FAIL: incomplete trace, timing totals cannot be used");
    process.exitCode = 1;
  }
  const measured = summary.geometry["after-raf"];
  const covered =
    measured.all.n >= 50 &&
    measured.fading.n >= 10 &&
    summary.scrollEvents >= 10;
  const actualDistance =
    (data.scrolls.at(-1)?.y ?? setup.scrollTop) - setup.scrollTop;
  const inputComplete =
    Math.abs(actualDistance - expectedDistance) <= 2 &&
    (cfg.input !== "gesture" ||
      gestures.length === 5 * Math.ceil(cfg.duration / 1500));
  const validRun =
    errors.length === 0 && !traceComplete.dataLossOccurred && inputComplete;
  const pass =
    validRun &&
    covered &&
    measured.disconnected === 0 &&
    measured.all.p95 <= maxDy &&
    measured.all.max <= maxDy;
  const verdict = {
    pass,
    validRun,
    inputComplete,
    expectedDistance,
    actualDistance,
    covered,
    maxDy,
    measured: measured.all,
    fading: measured.fading,
    selftest,
  };
  fs.writeFileSync(
    path.join(cfg.out, "verdict.json"),
    JSON.stringify(verdict, null, 2)
  );
  if (selftest) {
    if (!validRun || !covered || measured.all.p95 < 19 || pass) {
      console.error("FAIL: intentional 20 px handle offset was not detected");
      process.exitCode = 1;
    } else
      console.log(
        "PASS: intentional 20 px handle offset rejected by geometry gate"
      );
  } else if (!pass) {
    console.error(
      "FAIL: visible drag handle detached from owning row",
      JSON.stringify(verdict)
    );
    process.exitCode = 1;
  } else
    console.log(
      "PASS: visible and fading drag handles follow owning rows within " +
        maxDy +
        " px"
    );
} finally {
  await browser?.close();
  server.close();
}
