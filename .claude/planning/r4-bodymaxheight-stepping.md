# R4 — DataTable bodyMaxHeight per-frame stepping fix

**Status**: 🟡 awaiting codex deep eval
**Brief**: PR #7 [comment 4402277095](https://github.com/ajenchen/design-system/pull/7#issuecomment-4402277095) sent 2026-05-07T18:48Z + followup [4402393026](https://github.com/ajenchen/design-system/pull/7#issuecomment-4402393026) at +42m
**Queue entry**: `.claude/memory/codex-brief-queue.jsonl` `id=4402277095`
**Owner**: Claude (synthesizer + implementer);codex = 2nd-opinion gatekeeper
**Branch**: `claude/fix-title-formatting-XleRV`

---

## 1. Problem (user-reported, 2026-05-07)

切 Storybook story:`大量資料`(layout=`centered`)→ `WithBulkActions`(layout=`fullscreen`)時,DataTable 的 `bodyMaxHeight` state 從 0→242px 以 **+2px/frame** 連續成長 ~2 秒(**121 次 setState**),user 視覺看到「table 從矮慢慢長高」動畫。

**Triggers**:
- 跨 layout decorator 切換 story(centered ↔ fullscreen)才重現
- 同 story 內 reload 不重現
- 真實 browser(user devtools)觀察到,headless Playwright sandbox 5 次 probe 都只觀察到 single jump null→282 抓不到 121 frame stepping

**Affected story**:`WithBulkActions`,但根因是 `isFillHeight` branch + ResizeObserver `compute()` 鏈 — 任何 fullscreen + flex parent 場景都可能受影響。

---

## 2. Hypothesis(root cause analysis,Step 0.5 own-version)

**Direct evidence**:
- `getComputedStyle(outer).transitionDuration === "0s"`(無 CSS transition cascade)
- 沿 outer→html 任何 ancestor `parseFloat(transitionDuration) > 0` filter chain = 0
- 故 121 frame 的 stepping **必然來自 `compute()` 真的 121 次跑出不同值** → outer's `getBoundingClientRect()` 真的 121 frame 給不同值

**Causal chain hypothesis**:
1. Story 切換瞬間 Storybook decorator 從 centered 改 fullscreen layout
2. Parent flex chain(`<div h-screen flex flex-col>` → `flex-1 min-h-0 mx-loose mb-loose>`)跨多 frame 收斂(layout settle phase)
3. ResizeObserver 忠實觀察 outer per-frame settling
4. Each RO callback 觸發 `compute()` → `getBoundingClientRect().height` → `setState(bodyMaxHeight)`
5. setState → React re-render → flex layout 微小 reflow → RO 再 fire(potential feedback loop)
6. 6 rows < `VIRTUAL_THRESHOLD=30` → `useVirtual=false` → `virtualizer.measureElement` 永不執行,所以這不是 virtualizer 副作用
7. 結果:每 frame +2px stepping 持續 121 frame ~2 秒,直到 layout 收斂

**Code anchor**:`data-table.tsx:1697-1709` 既有註解寫「revert P2 guard,觀察 R4 是否回歸 → 重現 = 補 dampening(差異 <1px 不 setState / 一幀只 update 一次)+ low-freq sampling」。R4 確認回歸,正是當初 codex 標記要補 dampening 的場景。

**Alternative causes 未排除**(問 codex Q1):
- React Concurrent Mode batching 導致 RO callback 跨 frame 累積
- Storybook decorator-level layout settle 機制(手動測 isolation)
- @dnd-kit `SortableContext` mount-time measurement(若 enableRowDrag 才有,WithBulkActions 應無)
- `selection` controlled state mount-time race(BulkActionBar 條件 render 影響 outer 高度?)

---

## 3. Benchmarks cited (M22 / M26)

### DataTable 高度模式 ≥3 source
- **TanStack Table** virtualization-when-needed: [`packages/react-virtual/src/index.tsx`](https://github.com/TanStack/table) — `VIRTUAL_THRESHOLD` skip-virt-small idiom 對齊本 DS line 868 `VIRTUAL_THRESHOLD = 30`
- **AG Grid** `domLayout`: [docs](https://ag-grid.com/react-data-grid/grid-size) — `normal`(constrained)/`autoHeight`(intrinsic)/`print`(全 render)三模式對齊本 DS isFillHeight branch
- **Material X-DataGrid**: [`x-data-grid/src/components/DataGrid.tsx`](https://github.com/mui/mui-x) — `autoHeight` prop 切 intrinsic vs constrained
- **Linear / Notion / Airtable**:三家 fill-height table 都採「parent flex 提供約束」的 100% pattern(對齊 spec § 二「Linear 做法」)

### ResizeObserver dampening pattern ≥3 source
- React docs: RO callback rAF coalesce(避 layout thrashing)
- `react-resize-detector`: [maslianok/react-resize-detector](https://github.com/maslianok/react-resize-detector) — 預設 100ms `refreshRate` debounce community baseline
- Lexical / Slate / TipTap editor:三家對 RO callback rAF batch + delta filter

---

## 4. DS Internal Canonical Consulted (M23)

| Anchor | 摘要 |
|---|---|
| `data-table.spec.md § 二` | 高度模式雙模式:資料少 hug content / 資料多 cap+scroll(2026-04-30 codified)|
| `data-table.tsx:904-910` | CSS `%` height 在 flex column min-h-0 + auto basis 場景 Chromium 不可靠 shrink — CSS-only 路徑已 explicit 否決 |
| `data-table.tsx:1697-1709` | codex 前次 R4 判斷:revert guard,確認回歸 → 補 dampening。本次 R4 重現 = 該 dampening 該落地 |
| `data-table.tsx:1813` + cva line 45 | outer `overflow-hidden`(rounded corners 必要)→ CSS-only flex-1 body 路徑會被 outer overflow-hidden 切 V scroll |
| `scripts/data-table-invariants.mjs` | 既有 5 條(cell width / display↔edit Δ / Field height fill / no-resize ≥ width)。R4 mount-time stability 應作為**第 6 條** invariant(M10 + M14)|
| `lib/column-meta.ts` | Internal SSOT pattern,同模式可套到 fill-height body → 抽 `lib/use-fill-height-body.ts` |

---

## 5. Fix candidates matrix(Step 0.5 own-version)

| | A 純 idempotency | **B rAF coalesce + delta + settle commit** | C CSS flex-1 body | D hybrid CSS+JS |
|---|---|---|---|---|
| 機制 | `if (next === last) return` | rAF queue + Δ<1px skip + 100ms idle force commit | body `flex:1 1 0` outer 永遠 = parent | content<parent CSS / content>parent JS |
| 阻 feedback loop | ✅ | ✅ | N/A(無 JS observation)| ✅ |
| 阻 per-frame settling | ❌(每 frame 真不同值)| ✅ | ✅(無 observation)| ✅ |
| 守 spec § 二「資料少 hug」 | ✅ | ✅ | ❌ **違反 spec** | ✅ |
| 守 V scroll trigger | ✅ | ✅ | ✅(body overflow)| ✅ |
| BulkActionBar inline 不破 | ✅ | ✅ | ✅ | ✅ |
| Responsive viewport resize | ✅(RO 跑)| ✅(RO + rAF)| ✅(CSS reflow)| ✅ |
| Future SSOT 防重蹈 | 弱(無 invariant)| 強(extract hook + invariant)| N/A | 強(branch 複雜)|
| Implementation cost | 5 lines | ~30 lines + new hook + invariant | refactor outer flex chain | branch logic |
| Spec § 二 雙模式 invariant | ✅ | ✅ | ❌ | ✅ |

**Claude recommendation**:**B + extract `lib/use-fill-height-body.ts` hook + 加 invariant 第 6 條**

理由:
1. **M17 SSOT** — 抽 hook 讓任何 fill-height table consumer 共享同邏輯
2. **M10 mechanical 防重蹈** — invariant 量「mount 後 2s 內 bodyMaxHeight transitions ≤ 3」機械擋
3. 對齊 `spec § 二` 不犧牲「資料少 hug」
4. 對齊 `data-table.tsx:1705-1706` codex 前次 dampening 建議
5. Cost 中等可接受(~30 lines + 1 hook + 1 invariant)

---

## 6. Step 4.6 regression scan plan(per candidate)

對 final 選定 fix(假設 B + hook + invariant)動 code 前必跑:

| 4.6 check | 方法 |
|---|---|
| Grep callers / consumers | `grep -rn "bodyMaxHeight\|setBodyMaxHeight" src/` — 確認除 data-table.tsx 無外部 consumer |
| Type contract | extract hook `useFillHeightBody(ref, opts)` — opts schema 定義(`deltaPx?`, `settleMs?`, `enabled`)無 breaking |
| Edge case (a) | `enabled=false`(非 fill-height mode)→ hook bypass,不跑 RO |
| Edge case (b) | `ref.current=null` mount-time → guard early return |
| Edge case (c) | rapid re-mount(StrictMode double-mount)→ rAF cleanup + RO disconnect |
| Edge case (d) | viewport resize during settle window(<100ms)→ 第二次 fire 重置 timer |
| Edge case (e) | StrictMode + unmount mid-settle → cleanup pending rAF + setTimeout |
| Cross-component | TreeView / Sheet / Dialog 是否有同 fill-height 模式可共享?目前不擴 scope,只 DataTable 用 |
| Tests | `npx tsc -b` + `node scripts/data-table-invariants.mjs`(原 5 + 新第 6)+ Playwright probe 4 stories(virtual / autoRow / inline-edit / pinned-columns)+ WithBulkActions 互動驗 |

---

## 7. Open questions to codex(Q1-Q5,等 deep eval)

**Q1 Root cause alternative** — 4 種我沒考慮?(Concurrent Mode batching / Storybook decorator settle / dnd-kit mount measure / selection mount race)

**Q2 B 方案 dampening 細節**:
- (a) 100ms idle settle 太久/太短?world-class 共識?
- (b) Δ<1px 還是 Δ<2px?或 ratio(<1% parent.height)?
- (c) rAF coalesce 跟 settle commit 是否衝突?或兩層各司其職?
- (d) 第一次 sync compute 仍在 `useLayoutEffect`(避 first paint blank)還是 deferred + skeleton fallback?

**Q3 SSOT scope** — `lib/use-fill-height-body.ts` 對?還是升 `patterns/fill-height-container/` 更上層 primitive?若升 pattern,共享給 ScrollArea / Sheet / Dialog body?

**Q4 Invariant test 框架**:
- (a) Playwright probe + rAF sample(sandbox 抓不到 121 frame,改 assert「2s 後 transitions ≤ 3」)
- (b) Unit test mock RO + 驗 callback pattern(穩但離 real env 遠)
- (c) Visual regression(snapshot 1s vs 3s 相同)
- 哪個對 mount-time stability 最 robust?

**Q5 Counter-proposal** — 是否該徹底 retire bodyMaxHeight JS compute 改 CSS-only?若 yes,如何同時守(a)spec § 二 hug 雙模式(b)bypass line 905-907 Chromium flex shrink bug(c)outer overflow-hidden 三 hard constraint?若 no,B 是否最佳?

---

## 8. Decision flow(等 codex reply 後)

1. **Codex deep reply 收到** → Step 4.5 verify 每條 claim(grep / WebFetch / counter-example)
2. **Step 4.6 regression scan** 對 codex 提的方案 + 我的 B 方案各跑一次
3. **Step 5 比稿** matrix:my B vs codex's vs combo,逐條取優棄劣
4. **Final synthesized fix** → implement → tsc + invariants(原 5 + 新第 6)+ 4 stories Playwright + WithBulkActions 互動驗
5. **Commit + push** → close R4 thread on PR

---

## 9. Constraints(implementation gate)

- DS 原則 M1-M27 全適用(尤其 M8 ≥3 source / M17 SSOT / M22 cite path+line / M23 DS-first / M27 namespace)
- 不可 regress 既有 4 stories(virtual / autoRow / inline-edit / pinned-columns)
- 必相容 BulkActionBar inline composition(spec § L2 七)
- 程式碼建議須 cite world-class DS source path + line ref
- 必通過 spec § 二「資料少 hug + 資料多 cap+scroll」雙模式 + Responsive 三條 invariant

---

## 10. Update log

- **2026-05-07T18:48Z** brief sent (R1)
- **2026-05-07T19:30Z** auto-followup #1 sent (no codex reply within 30min initial window)
- **2026-05-08** planning doc consolidated(本檔)
- _Pending_:codex deep reply → Step 4.5 verify + 4.6 regression + Step 5 比稿 → final fix
