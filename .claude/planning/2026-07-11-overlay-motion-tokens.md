# 浮層動畫 Token 設計提案(2026-07-11,motion workflow wgxto9cag)

**觸發**:codex A.1b 抓出 7 浮層 fade/zoom/slide 動畫 class 無 CSS(外掛未裝)= 全 no-op;user 問「delay token 有沒有正確套用 + 動畫要不要重新定義變數確保一致設計語言」。
**狀態**:待 user 拍板(§5 六項)。核准後實作。

## 現況盤查(逐檔 grep/read,非憑記憶)
{
 "perOverlay": [
  {
   "component": "Tooltip (tooltip.tsx L38-39)",
   "animClasses": "animate-in + fade-in-0/fade-out-0 + zoom-in-95/zoom-out-95 + slide。特例:open 用裸 `animate-in fade-in-0 zoom-in-95`(無 data-[state=open] 前綴,靠 Radix mount 套用),close 才用 data-[state=closed]:animate-out;另有獨有 `motion-reduce:zoom-in-100`。motion-reduce:animate-none 有。",
   "slideDistance": "slide-in-from-{top/right/left/bottom}-2 → N=2 = 0.5rem = 8px,4 側皆有(方向性 8px)",
   "hardcoded": "無顯式 duration/easing(吃 tailwindcss-animate 預設 ~150ms);zoom scale 95 與 slide 8px 均硬寫 utility 字面值,非 token"
  },
  {
   "component": "Popover (popover.tsx L103-104)",
   "animClasses": "data-[state=open]:animate-in / data-[state=closed]:animate-out + fade-in-0/out-0 + zoom-in-95/out-95 + slide;open/close 顯式對稱配對;motion-reduce:animate-none 有",
   "slideDistance": "slide-in-from-*-2 → N=2 = 8px,4 側(與 Tooltip/HoverCard/DropdownMenu 一致)",
   "hardcoded": "無 duration/easing;zoom-95 + slide-2(8px)硬寫字面值"
  },
  {
   "component": "HoverCard (hover-card.tsx L59-64)",
   "animClasses": "data-[state=open]:animate-in / closed:animate-out + fade + zoom-in-95/out-95 + slide;顯式對稱;motion-reduce:animate-none 有",
   "slideDistance": "slide-in-from-*-2 → N=2 = 8px,4 側",
   "hardcoded": "無 duration/easing;zoom-95 + slide-2 硬寫"
  },
  {
   "component": "DropdownMenu (dropdown-menu.tsx L42-50 floatingLayerClass)",
   "animClasses": "共用 floatingLayerClass:open:animate-in / closed:animate-out + fade + zoom-in-95/out-95 + slide;motion-reduce:animate-none 有。SubContent(L187)復用同一 floatingLayerClass",
   "slideDistance": "slide-in-from-*-2 → N=2 = 8px,4 側",
   "hardcoded": "無 duration/easing;zoom-95 + slide-2 硬寫(但至少 DropdownMenu 內部 Content/SubContent 共用同一 const,是 7 者中唯一有局部 SSOT 的)"
  },
  {
   "component": "Dialog (dialog.tsx Overlay L45-46 / Content L110-114)",
   "animClasses": "Overlay:只 fade(open:animate-in/closed:animate-out + fade-in-0/out-0)。Content:open:animate-in/closed:animate-out + fade + zoom-in-95/out-95 + slide;motion-reduce:animate-none 兩處都有",
   "slideDistance": "非方向性 -N:open = slide-in-from-left-1/2(置中 50% 位移)+ slide-in-from-top-[48%](硬寫 48% 由中心略上入場);close = slide-out-to-left-1/2 + slide-out-to-top-[48%]",
   "hardcoded": "48% 為 arbitrary value 硬寫;50%(1/2)為置中位移;無 duration/easing"
  },
  {
   "component": "Sheet (sheet.tsx sheetVariants base L71 + side L79-80 / Overlay L54-55)",
   "animClasses": "Overlay:只 fade + motion-reduce:animate-none。Content:只 slide,**無 fade 無 zoom**;base 帶 `transition ease-in-out`;motion-reduce 走 transition-none + data-[state]:duration-0(與其他 6 者 animate-none 寫法不同)",
   "slideDistance": "slide-in-from-right(**無 N → 100% 全屏外滑入**);其他 side top/bottom/left 同樣無 N = 全屏",
   "hardcoded": "唯一硬寫顯式 duration:data-[state=open]:duration-300 + data-[state=closed]:duration-300 + ease-in-out easing;無 fade/zoom"
  },
  {
   "component": "FileViewer (file-viewer.tsx Overlay L940-947 / Content L948-955)",
   "animClasses": "Overlay + Content 皆**只 fade**(open:animate-in/closed:animate-out + fade-in-0/out-0);無 zoom 無 slide;**兩處都缺 motion-reduce:animate-none 守衛**(7 者中唯一漏)",
   "slideDistance": "無 slide",
   "hardcoded": "無 duration/easing;缺 motion-reduce a11y 守衛 = 與其餘 6 個不一致(prefers-reduced-motion 下 FileViewer 仍全動畫)"
  }
 ],
 "inconsistencies": [
  "Slide 距離三種互斥制式並存無統一:輕量浮層(Tooltip/Popover/HoverCard/DropdownMenu)= 方向性 8px(slide-in-from-*-2);Dialog = 置中 50%(1/2)+ 硬寫 48% arbitrary;Sheet = 100% 全屏外滑(slide-in-from-right 無 N);FileViewer = 完全無 slide。",
  "zoom 有無不一:Tooltip/Popover/HoverCard/DropdownMenu/Dialog 用 zoom-in-95/out-95;Sheet 與 FileViewer 完全無 zoom。",
  "duration/easing 只有 Sheet 顯式設定(duration-300 + ease-in-out),其餘 6 個全吃 tailwindcss-animate 隱式預設(~150ms)無任何顯式值 → Sheet 進出場明顯比其他慢一截且刻意 tuned,其他 6 者的實際時長無人 own、改 tailwindcss-animate 版本即漂移。",
  "motion-reduce a11y 守衛不一致:Tooltip/Popover/HoverCard/DropdownMenu/Dialog 用 motion-reduce:animate-none,Sheet 用 motion-reduce:transition-none + duration-0,唯 FileViewer overlay+content 兩處都完全漏 → reduced-motion 使用者在 FileViewer 仍看到 fade 動畫(a11y gap)。",
  "open/close class 寫法不對稱:Tooltip open 用裸 animate-in(靠 Radix mount),其餘 6 個統一 data-[state=open]/closed 顯式配對;Tooltip 另有獨有 motion-reduce:zoom-in-100,別人沒有。",
  "同值多處硬寫、無 SSOT:zoom scale 95 在 5 個元件各自寫一次;slide 8px(-2)在 4 個各自寫一次;僅 DropdownMenu 內部 Content/SubContent 靠共用 floatingLayerScript const 收斂,跨元件層級零 SSOT → 改任一值要逐檔手改(M17 假 SSOT 反 pattern)。"
 ],
 "tokenGap": "motion token 系統目前只有 3 個 hover-delay token(--hover-delay-plain 500 / rich 700 / close 200ms,motion.css L26-30 + motion.ts 鏡像),**完全沒有**進出場動畫的 duration / easing / slide-distance / zoom-scale token;7 浮層的 zoom-95、slide-*-2(8px)、Sheet 的 duration-300 + ease-in-out、Dialog 的 48%/50% 全是各元件各自硬寫的 Tailwind utility 字面值,無任何可傳播的 SSOT。"
}

## 世界級對照(WebFetch verified)
[
 {
  "source": "Material Design 3 motion system — cross-verified from two official Google repos: material-web token SCSS (tokens/versions/v0_192/_md-sys-motion) and material-components-android Motion.md docs. The m3.material.io spec page itself is JS-rendered and returned no scrapable content, so I used Google's canonical token source files (which the spec page is generated from). Both sources agree on every value.",
  "url": "https://m3.material.io/styles/motion/easing-and-duration/tokens-specs | https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md | https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-sys-motion.scss",
  "durationTokens": "DURATION TOKENS (md.sys.motion.duration.*), all in milliseconds:\nShort — short1: 50ms, short2: 100ms, short3: 150ms, short4: 200ms\nMedium — medium1: 250ms, medium2: 300ms, medium3: 350ms, medium4: 400ms\nLong — long1: 450ms, long2: 500ms, long3: 550ms, long4: 600ms\nExtra-long — extra-long1: 700ms, extra-long2: 800ms, extra-long3: 900ms, extra-long4: 1000ms\n(Android attr naming: motionDurationShort1..ExtraLong4)",
  "easingTokens": "EASING TOKENS (md.sys.motion.easing.*), CSS cubic-bezier values:\nemphasized: cubic-bezier(0.2, 0, 0, 1) — NOTE: the true M3 \"emphasized\" curve is a two-segment spline (path: M 0,0 C 0.05,0 0.133333,0.06 0.166666,0.4 C 0.208333,0.82 0.25,1 1,1); cubic-bezier(0.2,0,0,1) is the single-bezier CSS approximation used in material-web.\nemphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15)\nemphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1)\nstandard: cubic-bezier(0.2, 0, 0, 1)\nstandard-accelerate: cubic-bezier(0.3, 0, 1, 1)\nstandard-decelerate: cubic-bezier(0, 0, 0, 1)\nlinear: cubic-bezier(0, 0, 1, 1)\n(Legacy/M2 set also exists: legacy 0.4,0,0.2,1 ; legacy-accelerate 0.4,0,1,1 ; legacy-decelerate 0,0,0.2,1)",
  "notes": "Key facts for consuming these tokens:\n1. Duration scale is a uniform grid: short 50-200 (step 50), medium 250-400 (step 50), long 450-600 (step 50), extra-long 700-1000 (step 100). Total 16 duration tokens.\n2. Two easing families: \"emphasized\" (M3 signature, for prominent/hero transitions) and \"standard\" (for simple/utility transitions). Each has base + accelerate (element leaving screen) + decelerate (element entering screen) variants.\n3. IMPORTANT nuance: \"emphasized\" base easing is NOT a plain cubic-bezier in M3 spec — it is a two-part spline. Both single-value CSS token (0.2,0,0,1) and the full spline path are documented; use the spline for canvas/JS motion, the cubic-bezier for CSS. \"standard\" base and \"emphasized\" base share the same single-bezier value (0.2,0,0,1) in the CSS token set.\n4. There is also a separate \"legacy\" (Material 2 / FastOutSlowIn) easing set — do not confuse cubic-bezier(0.4,0,0.2,1) [legacy] with the M3 standard (0.2,0,0,1). Many web search snippets wrongly cite 0.4,0,0.2,1 as \"standard\" — that is the M2 value.\n5. Verified against two independent official Google repos that agree exactly; the m3.material.io canonical spec URL is included but was not directly scrapable (JS-rendered).",
  "verified": true
 },
 {
  "source": "IBM Carbon Design System — @carbon/motion package source (packages/motion/src/index.ts), cross-checked against Carbon motion docs",
  "url": "https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/motion/src/index.ts",
  "durationTokens": "fast-01: 70ms; fast-02: 110ms; moderate-01: 150ms; moderate-02: 240ms; slow-01: 400ms; slow-02: 700ms",
  "easingTokens": "Productive — standard: cubic-bezier(0.2, 0, 0.38, 0.9); entrance: cubic-bezier(0, 0, 0.38, 0.9); exit: cubic-bezier(0.2, 0, 1, 0.9). Expressive — standard: cubic-bezier(0.4, 0.14, 0.3, 1); entrance: cubic-bezier(0, 0, 0.3, 1); exit: cubic-bezier(0.4, 0.14, 1, 1).",
  "notes": "Values taken verbatim from the @carbon/motion source file (index.ts on main branch) — the SSOT for Carbon motion tokens — so full source confidence (not search-only). Duration scale: 6 static tokens grouped fast/moderate/slow (70/110/150/240/400/700 ms). Easing: two motion styles (productive = UI feedback, faster; expressive = notable/celebratory moments, slower) each with 3 curves (standard for on-screen movement, entrance/incoming for elements appearing, exit/outgoing for elements leaving). Carbon guidance: use productive for task/efficiency-focused motion, expressive for user-attention moments; duration should scale with distance/size of the animated change. The requested doc page https://carbondesignsystem.com/elements/motion/overview/ loaded but its body was truncated by WebFetch; /style-guidelines and /guidelines/motion/* returned 404 (site restructured to /elements/motion/). The GitHub raw source (index.ts) provided the complete, unambiguous token values and is the canonical origin the docs derive from. WebSearch corroborated the fast-01=70ms / fast-02=110ms / moderate-01=150ms scale and the productive-vs-expressive split.",
  "verified": true
 },
 {
  "source": "tailwindcss-animate (Jamie Kyle, Tailwind v3 plugin) + tw-animate-css (Wombosvideo, Tailwind v4 successor). Confirmed from raw source: index.js (jamiebuilds) and src/tw-animate.css (Wombosvideo). This is the exact mechanism shadcn/ui uses for Radix overlay enter/exit animations.",
  "url": "https://github.com/jamiebuilds/tailwindcss-animate ; https://github.com/Wombosvideo/tw-animate-css ; raw CSS: https://raw.githubusercontent.com/Wombosvideo/tw-animate-css/main/src/tw-animate.css",
  "durationTokens": "Utility tokens: duration-{75,100,150,200,300,500,700,1000} (arbitrary duration-[180ms] allowed). Underlying CSS vars — Tailwind v4 standard `--tw-duration` (set by duration-* utility) plus library-specific `--tw-animation-duration`. Resolution order in the `--animate-in`/`--animate-out` shorthand: `var(--tw-animation-duration, var(--tw-duration, 150ms))`. DEFAULT = 150ms. Customize by CSS var directly: style={{ '--tw-duration': '200ms' }} or '--tw-animation-duration'.",
  "easingTokens": "Utility tokens: ease-{linear,in,out,in-out} (arbitrary ease-[cubic-bezier(...)] allowed). Underlying CSS var — Tailwind v4 standard `--tw-ease` (set by ease-* utility). Resolution in shorthand: `var(--tw-ease, ease)`. DEFAULT = ease. Customize by CSS var directly: style={{ '--tw-ease': 'cubic-bezier(0.32,0.72,0,1)' }}. (v3 tailwindcss-animate sets animation-timing-function directly via ease-* rather than a dedicated var.)",
  "notes": "MECHANISM: apply base `animate-in` (enter) / `animate-out` (exit), which run @keyframes `enter`/`exit`. These keyframes read per-axis CSS vars for the FROM (enter) / TO (exit) transform, so distance/scale/opacity/rotate/blur are all CSS-variable-driven and independently overridable.\n\nENTER vars (read in `@keyframes enter { from { ... } }`): --tw-enter-opacity, --tw-enter-scale, --tw-enter-rotate, --tw-enter-translate-x, --tw-enter-translate-y (tw-animate-css adds --tw-enter-blur). EXIT counterparts: --tw-exit-opacity, --tw-exit-scale, --tw-exit-rotate, --tw-exit-translate-x, --tw-exit-translate-y (+ --tw-exit-blur). All default to identity (opacity 1, scale 1, translate 0, rotate 0). The keyframe uses translate3d(var(--tw-enter-translate-x,0), var(--tw-enter-translate-y,0), 0) scale3d(...) rotate(...).\n\nMODIFIER UTILITIES set those vars: fade-in / fade-in-{0,25,50,75} -> --tw-enter-opacity ; zoom-in / zoom-in-{50,75,95} -> --tw-enter-scale ; spin-in-{deg} -> --tw-enter-rotate ; slide-in-from-{top,bottom,left,right}-{n} -> --tw-enter-translate-x/y (distance from Tailwind spacing scale, e.g. slide-in-from-top-2 = 0.5rem; arbitrary slide-in-from-top-[8px]). Same for animate-out with fade-out / zoom-out / slide-out-to-*.\n\nANIMATION CONTROL vars (tw-animate-css): --tw-animation-duration, --tw-animation-delay, --tw-animation-direction, --tw-animation-fill-mode, --tw-animation-iteration-count, plus Tailwind v4 core --tw-duration / --tw-ease. Set via duration-*, delay-*, ease-*, direction-*, fill-mode-*, repeat-* utilities OR inline CSS vars.\n\nCAN YOU CUSTOMIZE DURATION/EASING/DISTANCE VIA CSS VAR? YES. Two equivalent paths: (1) utility classes (duration-200 ease-out slide-in-from-top-2 zoom-in-95); (2) raw CSS vars in style / a wrapper class, e.g. style={{ '--tw-duration':'180ms', '--tw-ease':'cubic-bezier(0.32,0.72,0,1)', '--tw-enter-translate-y':'-8px', '--tw-enter-scale':'0.96' }}. This makes them ideal SSOT targets — define design tokens once (e.g. --motion-overlay-duration, --motion-overlay-ease) and map onto --tw-duration/--tw-ease/--tw-enter-* on the overlay.\n\ndata-[state] USAGE (shadcn/Radix canonical): Radix sets data-state=open|closed (and data-side=top|bottom|left|right on positioned content). Gate the utilities on state:\ndata-[state=open]:animate-in data-[state=closed]:animate-out\ndata-[state=closed]:fade-out-0 data-[state=open]:fade-in-0\ndata-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95\ndata-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2\nRadix keeps the node mounted during exit until the CSS animation finishes, so animate-out actually plays on close.\n\nMIGRATION NOTE: shadcn on Tailwind v4 dropped the tailwindcss-animate plugin in favor of tw-animate-css imported in CSS via `@import \"tw-animate-css\";`. API (class names + --tw-enter-*/--tw-exit-* vars) is unchanged; v4 version routes duration/easing through --tw-duration/--tw-ease and adds blur-in/blur-out + --tw-enter-blur.",
  "verified": true
 },
 {
  "source": "Shopify Polaris — Motion tokens + Motion design principles",
  "url": "https://polaris-react.shopify.com/tokens/motion (redirected from https://polaris.shopify.com/tokens/motion); principles at https://polaris-react.shopify.com/design/motion",
  "durationTokens": "--p-motion-duration-0: 0ms | --p-motion-duration-50: 50ms | --p-motion-duration-100: 100ms | --p-motion-duration-150: 150ms | --p-motion-duration-200: 200ms | --p-motion-duration-250: 250ms | --p-motion-duration-300: 300ms | --p-motion-duration-350: 350ms | --p-motion-duration-400: 400ms | --p-motion-duration-450: 450ms | --p-motion-duration-500: 500ms | --p-motion-duration-5000: 5000ms (5s stepped scale, base unit 50ms; small UI feedback 100-250ms, larger transitions 300-500ms, 5000ms reserved for long-running loops)",
  "easingTokens": "--p-motion-linear: cubic-bezier(0, 0, 1, 1) | --p-motion-ease: cubic-bezier(0.25, 0.1, 0.25, 1) | --p-motion-ease-in: cubic-bezier(0.42, 0, 1, 1) | --p-motion-ease-out: cubic-bezier(0.19, 0.91, 0.38, 1) | --p-motion-ease-in-out: cubic-bezier(0.42, 0, 0.58, 1)",
  "notes": "Two sources fetched. (1) Token values from the Polaris tokens page (real cubic-bezier + ms values, listed exactly). (2) Motion design principles from /design/motion — the principles page itself documents NO numeric tokens, only 3 principles: Purposeful (motion has clear purpose, helps merchants understand results of actions; avoid decorative-only animation), Responsive (react immediately to interaction, scale motion to magnitude of the action), Snappy (quick and subtle; start rapidly then decelerate smoothly = ease-out bias). Design guidance implication: the ease-out token cubic-bezier(0.19,0.91,0.38,1) is the \"snappy\" curve (fast start, smooth decel) that matches the Snappy principle; use ease-out for entrances/user-triggered feedback, ease-in-out for continuous/two-way transitions, linear for spinners/progress. Duration scale is a stepped 50ms-based ramp (0-500ms) plus a 5000ms outlier for long loops. Original polaris.shopify.com host 301-redirects to polaris-react.shopify.com. search-only confidence NOT needed — both pages fetched successfully with full content.",
  "verified": true
 }
]

## 提案全文
已盤點完現況與既有 token 結構,以下是完整提案。

---

# DS 浮層動畫 Token 設計提案(給拍板,非實作)

**驗證錨點(我實際 grep/read 過的 code,非憑印象)**
- `packages/design-system/src/tokens/motion/motion.css` — 目前只有 `--hover-delay-plain:500ms / -rich:700ms / -close:200ms`,命名慣例 = `--hover-delay-{語意 tier}`(刻意不用元件名、不用純數字)。
- `motion.ts` = 上述三值的 JS number 鏡像(給 Radix `delayDuration/openDelay/closeDelay` 吃)。
- **`tailwindcss-animate` / `tw-animate-css` 在整個 repo 的任何 `package.json` 都查無**(grep exit 1);`packages/design-system/src` 內**查無任何 `@keyframes enter` 或 `--tw-enter-*` 定義**。

---

## 1. 現況總結

**分兩層看,結論很不一樣:**

**(A) delay token — 已正確落地。** `--hover-delay-{plain|rich|close}` 三個「hover 開/關延遲」token 已定義、已鏡像到 JS、已被 Tooltip / HoverCard / ProfileCard / OverflowIndicator 消費。這一層是健康的,本提案不動它。

**(B) 進出場動畫(fade / zoom / slide)— 目前是「寫了但沒接電」。** 7 個浮層在 class 上都寫了 `animate-in` / `fade-in-0` / `zoom-in-95` / `slide-in-from-*-2`,**但驅動這些 class 的外掛(tailwindcss-animate / tw-animate-css)根本沒安裝,對應的 `@keyframes enter/exit` 與 `--tw-enter-*` 變數在 repo 裡完全不存在**。意思是:這些 utility class 現在是**空砲彈 —— 展開/收合實際上沒有任何動畫,是瞬間跳出/跳掉的**。唯一可能有反應的是 Sheet 的 `transition ease-in-out`,但它靠的也是 animate 系統的 `slide-in-from-right` 餵 CSS 變數,同樣沒外掛就沒位移。

**所以現況的真相是:全部 7 個浮層的「進出場」都是 no-op。** 你看到的「不一致」(zoom 有無、slide 距離三種制式、duration 只有 Sheet 設)其實是**7 份互相矛盾的「意圖」,而非 7 份真的在跑的動畫**。這反而是好消息 —— 我們是在一張乾淨的白紙上訂 SSOT,不是去改動已上線的視覺。

**Token 缺口:** 進出場的 duration / easing / slide 距離 / zoom scale **完全沒有 token**,7 浮層各自硬寫 `zoom-95`、`slide-*-2`、`duration-300`、`48%` 等 Tailwind 字面值,零可傳播 SSOT(M17「假 SSOT」反 pattern)。

---

## 2. 要不要定義動畫變數 —— 明確回答

**要,建議定義。** 兩個理由:

1. **不定義的另一條路(刪死 class + spec 承認「浮層無進出場動畫」)不符世界級標準。** 對照的 4 家 DS 全都有正式 motion token 系統與浮層進出場動畫 —— Material、Carbon、Polaris、shadcn/Radix 官方 overlay 全有 enter/exit。無動畫的浮層在現代 DS = 缺陷,不是「簡約」。
2. **既然要有動畫,值就必須 token 化,否則立刻回到「7 份硬寫、改一個值要逐檔手改」的 M17 假 SSOT。**

### 建議 token 集(6 個,對齊既有 `--hover-delay-*` 命名哲學:語意化、不綁元件名、不用純數字)

```css
/* ── Duration:依浮層「份量」分 2 tier ── */
--motion-duration-overlay: 150ms;   /* 輕量浮層:Tooltip / Popover / HoverCard / DropdownMenu */
--motion-duration-surface: 250ms;   /* 模態面板:Dialog / Sheet / FileViewer(面積大、位移遠 → 稍長)*/

/* ── Easing:進場減速 / 出場加速(方向性,對齊世界級 enter=decelerate、exit=accelerate)── */
--motion-easing-enter: cubic-bezier(0, 0, 0, 1);     /* 快起慢收,元件「進場」*/
--motion-easing-exit:  cubic-bezier(0.3, 0, 1, 1);   /* 慢起快走,元件「離場」*/

/* ── Enter 幾何:沿用現行事實值,只是收成 token ── */
--motion-enter-distance: 0.5rem;   /* = 8px = 現行 slide-*-2,也 = shadcn/Radix canonical */
--motion-enter-scale: 0.95;        /* = 現行 zoom-95,也 = shadcn default */
```

### 每個值的 benchmark 依據(附 URL)

| Token | 建議值 | 世界級對照(≥3 家) |
|---|---|---|
| `-duration-overlay` | **150ms** | 四家罕見地完全一致在 150ms:Material `short3`=150ms、Carbon `moderate-01`=150ms、Polaris `--p-motion-duration-150`=150ms、tw-animate-css 預設也是 150ms。→ 這是跨 DS 的「輕量 UI 回饋」黃金值。 |
| `-duration-surface` | **250ms** | Material `medium1`=250ms、Polaris `--p-motion-duration-250`=250ms、Carbon `moderate-02`=240ms。Carbon 明講「duration 應隨位移/面積放大」→ 模態比 popup 慢一階合理。(此值**取代 Sheet 現行硬寫的 300ms**;若你偏好 Sheet 因全螢幕位移保留 300,見 §5 決策點。) |
| `-easing-enter` | **cubic-bezier(0,0,0,1)** | Material `standard-decelerate`。decelerate = 「進入畫面的元件」的官方曲線(快起、平滑落定)。備選見下。 |
| `-easing-exit` | **cubic-bezier(0.3,0,1,1)** | Material `standard-accelerate`。accelerate = 「離開畫面的元件」官方曲線;Carbon `productive exit`=`cubic-bezier(0.2,0,1,0.9)`、Polaris ease-in=`cubic-bezier(0.42,0,1,1)` 同屬此族。 |
| `-enter-distance` | **8px (0.5rem)** | 現行 4 個輕量浮層已在用(`slide-*-2`),也正是 shadcn/Radix canonical overlay 的預設位移。不發明新值。 |
| `-enter-scale` | **0.95** | 現行 5 個浮層已在用(`zoom-95`),= shadcn default。不發明新值。 |

**`-easing-enter` 備選(這是設計語氣選擇,列給你挑):**
- **A(建議,中性沉穩)**:Material standard-decelerate `cubic-bezier(0, 0, 0, 1)` —— 低調、不搶戲。
- **B(較有活力,「snappy」)**:Polaris ease-out `cubic-bezier(0.19, 0.91, 0.38, 1)` —— Polaris 的「Snappy」原則曲線(急起、順滑減速),進場更有彈跳感但無 overshoot。

Benchmark URL:
- Material 3 motion tokens(官方 token 原始檔):https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-sys-motion.scss(spec 頁 https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
- Carbon `@carbon/motion` 原始 SSOT:https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/motion/src/index.ts
- Polaris motion tokens:https://polaris-react.shopify.com/tokens/motion(原則 https://polaris-react.shopify.com/design/motion)
- tw-animate-css(shadcn v4 用的機制)原始碼:https://github.com/Wombosvideo/tw-animate-css / https://raw.githubusercontent.com/Wombosvideo/tw-animate-css/main/src/tw-animate.css

**命名要誠實揭露一個抉擇:** 既有 `--hover-delay-*` **沒有** `--motion-` 前綴(雖然檔案在 `motion/` 資料夾)。新 token 我建議用 `--motion-*` 命名空間(對齊 Material `md-sys-motion-*`、Polaris `p-motion-*`、Carbon `motion` package 三家慣例)。這會讓「delay 用 `--hover-delay-`、進出場用 `--motion-`」兩套並存;是否順手把 `--hover-delay-*` 也遷成 `--motion-delay-*` 求命名空間統一,列為 §5 待拍板(那會動到 JS 鏡像 + spec + stories,屬另一件事,不綁進本提案)。

---

## 3. Wiring 方案 —— 推薦「裝 tw-animate-css + 用 CSS 變數綁 token」

**推薦:安裝 `tw-animate-css`(Tailwind v4 版),在 `globals.css` `@import`,然後把它的 `--tw-*` 變數綁到我們的 motion token。**

**為什麼是這條,而不是「刪死 class + spec 承認無動畫」:**

1. **7 浮層的 class 幾乎不用改。** tw-animate-css 的 API(`animate-in` / `fade` / `zoom` / `slide-in-from-*` + `--tw-enter-*` 變數)與現行寫法完全相容 —— 現況這些 class 就是照它的規格寫的,只是外掛沒裝。裝上去 = 現有意圖「通電」。
2. **它天生就是「CSS 變數驅動」,是理想的 token 綁定點。** 機制(已從原始碼確認):`animate-in`/`animate-out` 跑 `@keyframes enter/exit`,而 keyframe 讀的是 `--tw-duration`(預設 `var(--tw-duration, 150ms)`)、`--tw-ease`、`--tw-enter-translate-*`、`--tw-enter-scale` 等 per-axis 變數。我們只要把這些指到自己的 token:

```css
/* 一個共用的 overlay 動畫類(SSOT),7 浮層消費它 */
.ds-overlay-motion {
  --tw-duration: var(--motion-duration-overlay);
  --tw-ease: var(--motion-easing-enter);
  --tw-enter-translate-y: var(--motion-enter-distance); /* 方向由 data-side gate */
  --tw-enter-scale: var(--motion-enter-scale);
  /* + data-[state=open]:animate-in / closed:animate-out
     + data-[side=*]:slide-in-from-* (方向感知,shadcn canonical)
     + motion-reduce:animate-none  ← 統一守衛,一次補齊 FileViewer 缺口 */
}
```

3. **這正是 shadcn 官方在 Tailwind v4 的做法** —— shadcn 已從 `tailwindcss-animate` plugin 遷到 `@import "tw-animate-css";`,API 不變。我們跟 upstream 對齊,不是自創路。
4. **「刪死 class + spec 寫『浮層無動畫』」= 主動選擇低於世界級**,違 mindset #1;且要逐檔刪 7 份、還要在 spec 承認缺陷,工不比裝外掛少,結果更差。**否決。**

**落地形態建議(對齊既有唯一的局部 SSOT):** DropdownMenu 現在已經有一個 `floatingLayerClass` const 讓 Content/SubContent 共用 —— 把它**升級成跨元件的共用 SSOT**(一個 shared const 或 `@utility`),分兩個 tier:`overlayMotion`(輕量,吃 `-duration-overlay`)+ `surfaceMotion`(模態,吃 `-duration-surface`)。7 浮層全部 import 同一份 → 改任何值只改 token 一處。

---

## 4. 一致性遷移 —— 6 個不一致點如何收斂

| # | 現況不一致 | 收斂後 |
|---|---|---|
| 1 | **Slide 距離三制式並存** | **輕量浮層(4 個)** 統一 `--motion-enter-distance`(8px)+ 方向感知(`data-side`)。**Dialog** 保留置中 scale+fade,但把硬寫的 `48%`/`50%` arbitrary 值清掉,改吃 token。**Sheet** 的 100% 邊緣滑入**是正當的不同 pattern(抽屜從螢幕邊緣進),不算 drift** —— 保留全屏位移,但 duration/easing 吃 `-surface` token。**FileViewer** 見決策點 §5。 |
| 2 | **zoom 有無不一** | 輕量浮層 + Dialog 用 `--motion-enter-scale`(0.95)。**Sheet 邊緣抽屜正當地不用 zoom**(從邊滑入,縮放沒意義)—— 保留。FileViewer 見 §5。 |
| 3 | **duration/easing 只有 Sheet 顯式** | **全部 7 個改吃 token** —— 輕量 `-duration-overlay`(150)、模態 `-duration-surface`(250),easing 統一 `enter`/`exit` 曲線。Sheet 的 `duration-300` 硬寫由 token 接管(300→250,或見 §5 保留)。從此「實際時長有人 own」,不再隨外掛版本漂移。 |
| 4 | **motion-reduce a11y 守衛不一致(FileViewer 兩處全漏)** | **統一 `motion-reduce:animate-none` 收進共用 SSOT 類**,7 個一次補齊 —— **直接關掉 FileViewer 的 a11y gap**。Tooltip 那個獨有的 `motion-reduce:zoom-in-100` 一併移除。 |
| 5 | **open/close 寫法不對稱** | Tooltip 的裸 `animate-in` → 統一成 `data-[state=open]:animate-in` 顯式配對(跟其餘 6 個一致,也是 shadcn canonical)。 |
| 6 | **同值多處硬寫、零跨元件 SSOT** | zoom-95 / slide-8px / duration / easing 全部只存在於 token + 一份共用類。改值 = 改 1 處傳播到 7 個。M17 滿足。 |

**收斂後的「正當差異」(不是 drift,要留):** Sheet 邊緣抽屜(100% 位移、無 zoom)vs 輕量 popup(8px + zoom)vs Dialog 置中(scale + fade)—— 這是**三種語意不同的浮層原型**,對齊 Material「standard vs emphasized」、Carbon「productive vs expressive」的兩/多 tier 分層,不該強行抹平成同一種動畫。我們統一的是 **token(時長/曲線/單位)**,不是抹平**原型**。

---

## 5. 待 User 拍板項(SSOT-UI/UX,我不自決)

1. **要不要加進出場動畫?** —— 這是真實視覺變更(現況 no-op → 有動畫)。同意加 = 走本提案;不加 = 走「刪死 class + spec 承認無動畫」(不建議)。
2. **兩 tier 模型接受嗎?** 輕量浮層(150ms/8px/zoom)vs 模態面板(250ms)分兩級。
3. **Token 值定案:**
   - duration:overlay=**150** / surface=**250**(或 Sheet 因全屏位移保留 **300**,獨立成 `-surface-lg`?)
   - `-easing-enter`:**A 中性 `(0,0,0,1)`** 還是 **B snappy `(0.19,0.91,0.38,1)`**?
   - distance=8px、scale=0.95(沿用現行事實值,建議直接收)—— 有異議才調。
4. **命名空間:** 新 token 用 `--motion-*`(建議);要不要順手把既有 `--hover-delay-*` 遷成 `--motion-delay-*` 求統一(另開一件事,會動 JS 鏡像+spec+stories)?
5. **FileViewer 動畫原型:** 它是模態影像檢視器 —— 跟 **Dialog 一致(zoom+fade)**,還是**維持 fade-only**?(不論哪個,a11y 守衛都會補上。)
6. **Sheet duration:** 保留現行 tuned 的 300ms(全屏位移較遠),還是正規化到 250ms 跟其他模態齊?

---

**相關檔案(絕對路徑):**
- `packages/design-system/src/tokens/motion/motion.css`(新增 6 token 的落點)
- `packages/design-system/src/tokens/motion/motion.ts`(進出場為純 CSS 驅動,**不需**JS 鏡像 —— 與 hover-delay 不同,Radix 不吃這些值)
- `packages/design-system/src/tokens/motion/motion.spec.md`(canonical 補進出場段 + benchmark cite)
- `packages/design-system/src/components/{Tooltip,Popover,HoverCard,DropdownMenu,Dialog,Sheet,FileViewer}/*.tsx`(7 消費點)
- `packages/design-system/src/globals.css`(`@import "tw-animate-css"` 落點)
- 各 `package.json`(新增 `tw-animate-css` dependency)
