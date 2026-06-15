# Composition Fidelity(SSOT,2026-05-27 初版 / 2026-06-02 conformance-model 修正)

**目標**:驗證「DS components 在 consumer(ds-product-template / fork)被正確使用、沒違反設計原則 / SSOT token」。

**2026-06-02 模型修正(per CF research + world-class benchmark + 專案 2026-05-27 自身結論)**:
驗的是「**consumer 有沒有用對 DS(conformance)**」,**不是**「consumer 畫面跟 DS showcase 長得一模一樣(pixel-identity)」。後者對「內容刻意不同的產品範本」是 **false-positive 來源、世界級公認反 pattern**。

## 對齊世界級(2026-06-02 WebFetch verified,修正初版未驗 benchmark)

初版宣稱「Polaris/MUI/Carbon/Atlassian 都做 cross DS+consumer pixel diff」= **未驗證 + 不實**(M22/M26 違反)。實證(URL）:

- **Consumer 用對 DS = 一律靜態 lint,非截圖**:Polaris [`stylelint-polaris`](https://polaris-react.shopify.com/tools/stylelint-polaris)(40+ rule promote DS adoption in consuming apps;「Please use a Polaris color token」)/ Atlassian [`@atlaskit/eslint-plugin-design-system`](https://atlassian.design/components/eslint-plugin-design-system/)(`ensure-design-token-usage` / `prefer-primitives` / `use-tokens-space`,帶 auto-fix）/ Carbon [`stylelint-plugin-carbon-tokens`](https://github.com/carbon-design-system/stylelint-plugin-carbon-tokens)(「enforce Carbon tokens ... rather than hard-coded values」)/ MUI(TS theme 型別 + eslint）。
- **Visual regression = 同一個 story 跨 commit 比自己的 baseline**(抓 DS 改壞自己),非跨 repo 比不同畫面:[Chromatic](https://www.chromatic.com/docs/branching-and-baselines/)(「baseline = last known good state of the story ... from a previous commit on that same branch」)/ [Storybook](https://storybook.js.org/docs/writing-tests/visual-testing)（「compare rendered pixels of every story against known baselines」+ 測 component-in-isolation）。
- **VR deterministic 鐵律**:seed 靜態 fixture + mask 動態區。產品 app 內容本質跟 DS showcase 不同 → 拿來 pixel 比必全紅 = 100% false positive。

## 機制三層(conformance 主、pixel identity 窄)

| 層 | 驗什麼 | 落地 |
|---|---|---|
| **1 marker(conformance 意圖)** | consumer wrap 高風險 primitive 必標 `// @story-baseline: <DS-path>#<export>` cite canonical | `check_consumer_app_invariants.sh(r2,2026-06-11 merge)`(P0)+ `check_story_invariants.sh` R7 |
| **2 靜態 conformance(主防線)** | consumer 用對 token/primitive、沒 simplified mock、沒硬寫色值/字級/間距/shadow、沒 API-misuse | `check_consumer_app_invariants.sh(r3,2026-06-11 merge)`(P0,含 2026-06-02 Pattern 8 硬寫 token)+ `check_layout_space_magic_numbers.sh`(P0 間距)+ `check_story_invariants.sh` R8(P0,registry antiPattern)+ `check_chrome_header_avatar_canonical.sh` / `check_sidebar_menu_button_implicit_wrap.sh` |
| **3 pixel/DOM identity(opt-in,窄用)** | 僅「忠實複製 replica」或「同 story 跨版本回歸」才比 render identity | `scripts/composition-fidelity-visual-diff.mjs`,**只比標了 `@composition-fidelity-mode` 的 mapping**;單獨 `@story-baseline` = conformance 不做 identity diff |

**層 3 為何 opt-in(2026-06-02)**:`@story-baseline` 單獨 = conformance 意圖(交層 2 驗)。pixel/DOM identity 只在該 consumer story **額外標** `@composition-fidelity-mode: pixel|shell-only|structural` 才跑(用於忠實複製 / same-story 回歸)。0 個 opt-in → script exit 0(conformance 由層 2 保證)。**禁** 拿產品範本(內容刻意不同)去 pixel 比 DS showcase。

## 層 3 用法(opt-in 時)

```bash
node scripts/composition-fidelity-visual-diff.mjs \
  --ds-static=storybook-static \
  --consumer-static=/path/to/ds-product-template/storybook-static \
  --consumer-root=/path/to/ds-product-template --threshold-pct=0.5
```

掛在 `.github/workflows/composition-fidelity.yml`(checkout DS + ds-product-template,build 兩邊 storybook 後比對;**build-storybook 前必先 `build:lib`** 否則 storybook-config tsc 找不到 `@qijenchen/design-system` 型別 = TS2307)。**2026-06-11 cheap pre-step**:checkout 後先秒級 grep consumer `@composition-fidelity-mode` marker(regex 對齊 diff script L118),0 命中 → skip 整段 ~30 min dual build(script 對 0 mapping 必 vacuous exit 0);≥1 命中 → full gate。現役 opt-in sentinel = `apps/template/src/CompositionFidelityReplica.stories.tsx`(Button#IconOnly 忠實複製 replica,mode pixel,經 mirror 傳播到 ds-product-template),讓 gate 名實相符。

## 不該做的事

- ❌ **拿產品範本 demo 當 pixel-identity baseline 對 DS showcase 比**(內容刻意不同 = false positive,world-class 公認反 pattern)— 2026-06-02 改 identity opt-in 修正
- ❌ baseline story 用 `Math.random()` 等非確定性產值(render 不可重現 → 任何 diff 都是 noise)— 2026-06-02 修 `sidebar.stories.tsx` PageContent
- ❌ 把 baseline screenshots commit 進 consumer repo(stale)— fetch from DS Pages live
- ❌ 抽樣 N stories(M-rule 不抽樣)

## 歷史錨例

- **2026-05-27**:user 抓 AppShell Avatar+Label drift。Root cause = stale build artifact(DS storybook-static built BEFORE fix commit)。Lesson:byte-identity ≠ visual ≠ deployed identity。
- **2026-06-02**:CF check 從建立起 30 次全紅 = 把產品範本(App.tsx,Acme Product / 自訂 nav / dashboard 內容)硬比 DS `sidebar#IconCollapse`(Acme Inc / 不同 nav / 隨機亂數內容),pixel/DOM identity 物理上不可能。修法:層 3 改 opt-in、補層 2 靜態 conformance(Pattern 8 + R8 升 P0)、修 baseline 隨機亂數。對齊專案 2026-05-27 自身結論(memory `feedback_ai_ground_truth_unreliable_mechanical_primary`:render fidelity 由架構保障、template-vs-canonical pixel diff = noise 非 drift)。
