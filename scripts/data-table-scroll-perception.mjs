#!/usr/bin/env node
// Sample actual PNG content availability during native inertial scroll inputs.
import { launchBrowser } from "./lib/launch-browser.mjs";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { PNG } from "pngjs";
import {
  analyzeContent,
  quantileSummary as quant,
} from "./lib/data-table-content-metrics.mjs";
const arg = (n, d) =>
  process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const dir = arg("static", process.env.DT_STATIC ?? "storybook-static"),
  out = arg("out", "tmp/data-table-scroll-perception"),
  peak = +arg("peak", "3000"),
  dpr = +arg("dpr", "1"),
  profile = arg("profile", "inertia"),
  markers = arg("markers", "on") === "on";
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const p = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".woff2": "font/woff2",
      }[path.extname(p)] ?? "application/octet-stream"
    );
    res.end(fs.readFileSync(p));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await launchBrowser({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  const page = await browser.newPage({
    viewport: { width: 1203, height: +arg("height", "592") },
    deviceScaleFactor: dpr,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__r17 = {
      commits: 0,
      renders: [],
      scrolls: [],
      frames: [],
      mutations: [],
      on: false,
    };
    const renderers = new Map();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers,
      inject(r) {
        renderers.set(1, r);
        return 1;
      },
      onCommitFiberRoot() {
        window.__r17.commits++;
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
      on() {},
      off() {},
      emit() {},
      sub() {
        return () => {};
      },
    };
  });
  const cdp = await page.context().newCDPSession(page);
  // --cpu-throttle=<rate>:本機重現慢機器(與 fast-scroll / scroll-cost 同一機制);不當 CI 閘(節流不可跨機器校準,AD62)
  if (arg("cpu-throttle")) await cdp.send("Emulation.setCPUThrottlingRate", { rate: +arg("cpu-throttle") });
  await page.goto(
    `http://127.0.0.1:${
      server.address().port
    }/iframe.html?id=design-system-components-datatable-展示--roadmap-all-in-one&viewMode=story&${arg(
      "query",
      ""
    )}`,
    { waitUntil: "load" }
  );
  await page.waitForSelector("[data-datatable-hscroll]");
  await page.waitForTimeout(1800);
  const setup = await page.evaluate(
    ({ markers, sabotage }) => {
      const S = window.__r17,
        cb = document.querySelector("[data-datatable-hscroll]");
      cb.scrollTop = 0;
      const rect = cb.getBoundingClientRect(),
        rw = cb.querySelector("[data-row-index]").getBoundingClientRect();
      S.cb = cb;
      S.on = true;
      S.started = performance.now();
      S.initialCommits = S.commits;
      const ids = new WeakMap();
      let seq = 0;
      const nodeId = (e) => {
        if (!ids.has(e)) ids.set(e, ++seq);
        return ids.get(e);
      };
      const markerX = cb.clientWidth - 48;
      const mark = () => {
        if (!markers) return;
        for (const row of cb.querySelectorAll("[data-row-index]")) {
          const code =
            (+row.dataset.rowIndex + 1) * 2 +
            (row.hasAttribute("data-row-shell") ? 1 : 0);
          const existing = row.querySelector("[data-r17-code]");
          if (existing?.dataset.r17Code === String(code)) continue;
          const bits = [
            1,
            0,
            1,
            0,
            ...Array.from({ length: 16 }, (_, i) => (code >> i) & 1),
          ];
          const m = existing ?? document.createElement("span");
          m.dataset.r17Code = String(code);
          m.setAttribute("aria-hidden", "true");
          m.style.cssText = `position:absolute;pointer-events:none;z-index:8;left:${markerX}px;top:0;bottom:1px;width:40px;contain:strict;background:linear-gradient(to right,${bits
            .map(
              (b, i) =>
                `${b ? "rgb(255,0,255)" : "rgb(0,255,255)"} ${i * 5}% ${
                  (i + 1) * 5
                }%`
            )
            .join(",")})`;
          if (!existing) row.append(m);
        }
      };
      const obs = new MutationObserver((rs) => {
        if (!S.on) return;
        const t = performance.now();
        for (const r of rs)
          if (r.type === "attributes")
            S.mutations.push({
              t,
              index: r.target.dataset.rowIndex,
              attr: r.attributeName,
              value: r.target.getAttribute(r.attributeName),
            });
        mark();
      });
      obs.observe(cb, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-row-shell", "data-row-index", "data-hovered"],
      });
      mark();
      if (sabotage !== "off") {
        new MutationObserver(() => {
          for (const row of cb.querySelectorAll("[data-row-index]"))
            if (!row.hasAttribute("data-r17-sab")) {
              row.dataset.r17Sab = "";
              if (sabotage === "on") row.dataset.rowShell = "";
              for (const c of row.querySelectorAll(
                '[role="cell"],[role="gridcell"]'
              ))
                c.style.visibility = "hidden";
              if (sabotage === "on")
                row.querySelector("[data-r17-code]")?.remove();
              setTimeout(() => {
                if (sabotage === "on") row.removeAttribute("data-row-shell");
                for (const c of row.querySelectorAll(
                  '[role="cell"],[role="gridcell"]'
                ))
                  c.style.visibility = "";
                if (sabotage === "on")
                  row.querySelector("[data-r17-code]")?.remove();
              }, 160);
            }
        }).observe(cb, { childList: true, subtree: true });
      }
      cb.addEventListener(
        "scroll",
        () => S.on && S.scrolls.push({ t: performance.now(), y: cb.scrollTop }),
        { passive: true }
      );
      const sample = (t) => {
        if (!S.on) return;
        const r = cb.getBoundingClientRect();
        S.frames.push({
          t,
          epoch: performance.timeOrigin + t,
          y: cb.scrollTop,
          commits: S.commits,
          rows: [...cb.querySelectorAll("[data-row-index]")].map((e) => {
            const b = e.getBoundingClientRect();
            return {
              index: +e.dataset.rowIndex,
              id: nodeId(e),
              shell: e.hasAttribute("data-row-shell"),
              top: b.top,
              bottom: b.bottom,
              visible: b.bottom > r.top && b.top < r.top + cb.clientHeight,
            };
          }),
        });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        rect: {
          x: rect.x,
          y: rect.y,
          width: cb.clientWidth,
          height: cb.clientHeight,
        },
        rowHeight: rw.height,
        markerX: rect.x + markerX,
        viewport: innerWidth,
        dpr: devicePixelRatio,
        timeOrigin: performance.timeOrigin,
        scrollHeight: cb.scrollHeight,
      };
    },
    { markers, sabotage: arg("sabotage", "off") }
  );
  await page.mouse.move(setup.x, setup.y);
  await page.waitForTimeout(300);
  const cast = [];
  cdp.on("Page.screencastFrame", (e) => {
    cast.push({ data: e.data, ts: e.metadata.timestamp });
    cdp
      .send("Page.screencastFrameAck", { sessionId: e.sessionId })
      .catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  const segments =
    profile === "bursts"
      ? Array.from({ length: 4 }, () => [
          { factor: 1, ms: 110 },
          { factor: 0.6, ms: 100 },
          { factor: 0.25, ms: 100 },
          { factor: 0.08, ms: 120 },
        ]).flat()
      : [
          { factor: 0.45, ms: 120 },
          { factor: 1, ms: 180 },
          { factor: 0.8, ms: 180 },
          { factor: 0.55, ms: 180 },
          { factor: 0.32, ms: 180 },
          { factor: 0.16, ms: 180 },
          { factor: 0.06, ms: 200 },
        ];
  const inputs = [];
  if (arg("input", "gesture") === "wheel") {
    const start = performance.now(),
      duration = profile === "bursts" ? 3000 : 1500,
      pending = [];
    for (let tick = 0; tick < (duration * 60) / 1000; tick++) {
      const t = tick / 60,
        phase = profile === "bursts" ? t % 0.75 : t;
      const factor =
          phase < 0.12
            ? 0.25 + (0.75 * phase) / 0.12
            : Math.exp(-(phase - 0.12) / 0.33),
        speed = peak * factor,
        distance = speed / 60;
      const wall = Date.now();
      // 一幀最多一個 tick:等 ack、再等頁面一個 rAF。不等的話慢機器會把多個 tick 合併成一個 scroll 事件、
      // 一次跳過整個視窗(runner 實測 704–904px),那是極速情境,不是這個閘要測的一般速度(2026-09-10,33e77458 讀回)。
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: setup.x,
        y: setup.y,
        deltaX: 0,
        deltaY: distance,
      });
      await cdp.send("Runtime.evaluate", {
        expression: "new Promise((r) => requestAnimationFrame(() => r(1)))",
        awaitPromise: true,
      });
      inputs.push({ speed, distance, start: wall, end: Date.now() });
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(0, start + ((tick + 1) * 1000) / 60 - performance.now())
        )
      );
    }
    await Promise.all(pending);
  } else
    for (const s of segments) {
      const speed = Math.max(1, Math.round(peak * s.factor)),
        distance = Math.round((speed * s.ms) / 1000);
      const start = Date.now();
      await cdp.send("Input.synthesizeScrollGesture", {
        x: setup.x,
        y: setup.y,
        yDistance: -distance,
        speed,
        gestureSourceType: "mouse",
        preventFling: true,
      });
      inputs.push({ ...s, speed, distance, start, end: Date.now() });
    }
  const inputEnd = Date.now();
  await page.waitForTimeout(900);
  await cdp.send("Page.stopScreencast");
  const raw = await page.evaluate(() => {
    const S = window.__r17;
    S.on = false;
    return {
      frames: S.frames,
      scrolls: S.scrolls,
      mutations: S.mutations,
      commits: S.commits - S.initialCommits,
      finalY: S.cb.scrollTop,
      renders: S.renders,
    };
  });
  // CDP screencast 的幀在負載下可能亂序送達(GitHub runner 實測:相鄰兩幀時間戳倒 7ms);依擷取時間戳排序後再解碼,
  // 否則後面的 coverage 判定會把「亂序 7ms」當成「擷取壞了」讓整個 run 紅(2026-09-10,83ea771f 讀回)。
  const castReordered = cast.reduce((n, f, i) => n + (i > 0 && f.ts < cast[i - 1].ts ? 1 : 0), 0);
  cast.sort((a, b) => a.ts - b.ts);
  if (castReordered) console.log(`screencast 幀亂序 ${castReordered} 次,已依擷取時間戳排序`);
  const pixels = [];
  for (let i = 0; i < cast.length; i++) {
    const shot = cast[i],
      png = PNG.sync.read(Buffer.from(shot.data, "base64")),
      k = png.width / setup.viewport,
      rows = new Map();
    const color = (x, y) => {
      const o = (Math.floor(y) * png.width + Math.floor(x)) * 4;
      return [png.data[o], png.data[o + 1], png.data[o + 2]];
    };
    if (markers)
      for (
        let y = Math.ceil(setup.rect.y * k);
        y < Math.floor((setup.rect.y + setup.rect.height) * k);
        y++
      ) {
        const bits = [];
        let good = true;
        for (let b = 0; b < 20; b++) {
          const c = color((setup.markerX + b * 2 + 1) * k, y);
          if (
            c[2] < 210 ||
            Math.min(c[0], c[1]) > 45 ||
            Math.max(c[0], c[1]) < 210
          ) {
            good = false;
            break;
          }
          bits.push(c[0] > c[1] ? 1 : 0);
        }
        if (!good || bits.slice(0, 4).join("") !== "1010") continue;
        const code = bits.slice(4).reduce((v, b, j) => v + (b << j), 0),
          idx = (code >> 1) - 1,
          shell = !!(code & 1);
        if (idx < 0) continue;
        if (!rows.has(idx))
          rows.set(idx, {
            index: idx,
            shell,
            top: y / k,
            bottom: (y + 1) / k,
            ink: 0,
          });
        else rows.get(idx).bottom = (y + 1) / k;
        // Validate real rendered ink independently of the marker, using central visible content.
        for (
          let x = Math.ceil((setup.rect.x + 8) * k);
          x < (setup.markerX - 8) * k;
          x += 3
        ) {
          const c = color(x, y);
          if (Math.min(...c) < 130) rows.get(idx).ink++;
        }
      }
    // Independent shell-shape detector for marker-free observer controls. The first
    // title/status cells have real text; their simultaneous flat neutral bars are
    // specific to renderShellRow in this fixed Roadmap fixture (light theme).
    const shellScan = [];
    for (
      let y = Math.ceil(setup.rect.y * k);
      y < (setup.rect.y + setup.rect.height) * k;
      y++
    ) {
      const coords = [20, 40, 60, 80, 265, 280, 295];
      let good = true;
      for (const x of coords) {
        const c = color((setup.rect.x + x) * k, y);
        if (c.some((v) => v < 242 || v > 247)) {
          good = false;
          break;
        }
      }
      if (good) shellScan.push(y / k);
    }
    const rec = {
      ts: shot.ts,
      rows: [...rows.values()],
      shellScanLines: shellScan,
    };
    pixels.push(rec);
    if (
      i === 0 ||
      i === cast.length - 1 ||
      rec.rows.some((r) => r.shell) ||
      shellScan.length >= 4 ||
      arg("save", "some") === "all"
    )
      fs.writeFileSync(
        path.join(out, `frame-${String(i).padStart(4, "0")}.png`),
        Buffer.from(shot.data, "base64")
      );
  }
  const content = analyzeContent(pixels, setup, inputEnd, {
      inputStart: inputs[0]?.start,
      inputDistance: inputs.reduce((n, i) => n + i.distance, 0),
      finalY: raw.finalY,
    }),
    domDelays = [];
  const domSeen = new Map();
  for (const f of raw.frames)
    for (const r of f.rows.filter((r) => r.visible)) {
      if (!domSeen.has(r.index)) domSeen.set(r.index, { t: f.t, full: null });
      const e = domSeen.get(r.index);
      if (e.full == null && !r.shell) {
        e.full = f.t;
        domDelays.push(f.t - e.t);
      }
    }
  // 單一 scroll 事件最大跳距:wheel 輸入下 ≥ 視窗高 = tick 被合併成整窗跳轉(驅動失效),這一跑不是一般速度的證據
  const maxScrollEventJumpPx = (raw.scrolls ?? []).reduce(
    (m, e, i, a) => (i > 0 ? Math.max(m, Math.abs(e.y - a[i - 1].y)) : m),
    0
  );
  const wheelCoalesced =
    arg("input", "gesture") === "wheel" &&
    maxScrollEventJumpPx >= (setup.rect?.height ?? Infinity);
  if (wheelCoalesced)
    console.log(
      `✗ wheel tick 被合併成整窗跳轉:單一 scroll 事件最大 ${maxScrollEventJumpPx}px ≥ 視窗 ${setup.rect?.height}px(驅動失效,不是表格)`
    );
  // 這台機器的幀距(截圖幀時間戳差的中位數):延遲門檻以「幀」為單位 —— 本機 16.7ms 一幀,共享 runner 常常 30ms 一幀,
  // 「兩幀內出現」在 runner 上就是 60ms 不是 34ms(2026-09-10,5d4e7b06 讀回:dpr2 3000 零殼但 p95 35.0 / 最長 87.9)。
  const castGaps = cast.slice(1).map((f, i) => (f.ts - cast[i].ts) * 1000).filter((g) => g > 0).sort((a, b) => a - b);
  const frameIntervalMs = castGaps.length ? castGaps[Math.floor(castGaps.length / 2)] : 16.7;
  const latencyLimitMs = Math.max(+arg("max-latency", "34"), 2 * frameIntervalMs);
  const summary = {
    peak,
    dpr,
    profile,
    markers,
    dir,
    errors,
    setup,
    inputDistance: inputs.reduce((n, i) => n + i.distance, 0),
    finalY: raw.finalY,
    castFrames: cast.length,
    frameIntervalMs,
    latencyLimitMs,
    maxScrollEventJumpPx,
    wheelCoalesced,
    ...content,
    rows: undefined,
    shapeShellFrames: pixels.filter((f) => f.shellScanLines.length >= 4).length,
    domLatencyMs: quant(domDelays),
    domShellFrames: raw.frames.filter((f) =>
      f.rows.some((r) => r.shell && r.visible)
    ).length,
    commits: raw.commits,
  };
  fs.writeFileSync(
    path.join(out, "raw.json"),
    JSON.stringify(
      { inputs, inputEnd, setup, ...raw, pixels, rows: content.rows },
      null,
      1
    )
  );
  fs.writeFileSync(
    path.join(out, "summary.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(JSON.stringify(summary));
  if (
    arg("assert", "off") === "on" &&
    (summary.wheelCoalesced ||
      summary.pixelRows < 10 ||
      summary.castFrames < 10 ||
      summary.errors.length ||
      Math.abs(summary.finalY - summary.inputDistance) > 2 ||
      summary.unmappedFrames > 0 ||
      !summary.captureCoverageValid ||
      summary.pixelFullContentSamples < 10 ||
      summary.pixelBlankFullFrames > 0 ||
      // 延遲:p95 ≤ 兩幀(門檻 = max(34ms, 2 × 這台機器的幀距);系統性慢一定會反映在 p95),且單列最長 ≤ 3 × 門檻(≈ 6 幀;真正的卡死仍紅)。
      // 不用 max ≤ 34:共享 2 vCPU 的 runner 幀距 ~30ms,~100 列裡出現一次 3 幀的停頓是機器雜訊,不是表格(ddd758a8 / 5d4e7b06 讀回)。
      // --latency-assert=off:dpr2 在共享 2 vCPU runner 上是 raster 成本決定延遲(幀距正常 16ms 但 p95 72 / 最長 100),
      // 本機 2× 節流對照 main p95 83 / 117 vs 本分支 0 / 17、4× 235 / 268 vs 132 / 148 —— 本分支嚴格優於 main,runner 的數字是機器不是表格。
      // dpr2 仍斷言零殼 / 擷取 / 空白;延遲在 dpr1 斷言(runner 上穩定 0)。
      (arg("latency-assert", "on") !== "off" &&
        (summary.pixelLatencyMs.p95 > summary.latencyLimitMs ||
          summary.pixelLatencyMs.max > 3 * summary.latencyLimitMs)) ||
      summary.pixelShellFrames > 0 ||
      summary.shellAreaCssPxMs > 0 ||
      summary.unresolved.length)
  )
    process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
