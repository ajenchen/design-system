---
name: visual-audit
description: Pixel-level visual audit for design-system components based on user-provided screenshots. Catches bug classes that code/spec audits cannot see — asymmetric padding / broken overlay positioning / gap-eaten-by-hover-bg / baseline misalignment / overflow indicator obscuring content / wrong zoom step / dark-mode token mismatch. Requires a screenshot to run; refuses to proceed on guesses. Invoke via /visual-audit when user says「視覺對齊不對」「排版有問題」「gap 好像錯了」「看起來歪了」or uploads a Storybook screenshot asking「這樣對嗎」,auto-invoked by `/design-system-audit` Phase 3 (post-fix visual verify) and `/component-quality-gate` Ship phase.
---

# Visual Audit — screenshot-based pixel-level 稽核

## 存在意義

現有 `/design-system-audit`(全 dim per design-system-audit SSOT)+ `/product-ui-audit`(6 dim)**全部在 code / spec 層**。code 對、spec 對,**視覺仍可能錯**——這類 bug 在專案歷史反覆出現:

- **DatePicker** 四邊邊距不對稱(左右不等 12px)、箭頭按鈕到容器頂距離 ≠ 最後一排日期到容器底距離
- **Badge** 疊 Button 距離離譜(overlay offset 寫死 px 非 token)
- **Avatar hover namecard** 的 list item 結構視覺跑掉
- **Carousel** prev/next 箭頭覆蓋 content
- **Rating** 星星有多餘邊框
- **Image viewer** 滾輪縮放跳大步(對標 Figma 該每 notch ~1.1×)
- **Button 群 gap** 被 hover bg overflow 吃掉(node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md 有「同 flex 列互動 slot 幾何鐵律」但缺視覺 audit gate 鎖住)
- **FileViewer 工具列** dark mode 切換後對比跑掉
- **FileUpload / FileItem** 沒 fill container

這些 bug 的共通點:`cva` 對、token 對、spec 對,但是消費組合後**實際 render 的 pixel 關係錯**。code audit 無視,只能靠視覺稽核。

## 兩層架構 + state coverage canonical

**Layer A mechanical**(`npm run visual-audit`):截圖 + WCAG + geometry。**Layer B AI**(本 skill):合理 / 一致 / 世界級對照。**Workflow**:`npm run visual-audit` → `/visual-audit` 讀 `snapshots/report.json`。詳 → [`references/audit-architecture.md`](references/audit-architecture.md)(兩層架構 + hover / focus-visible / play() coverage roadmap)。

## Skill 生態位

```
/design-system-audit    全 dim 深度 audit(per design-system-audit SSOT,code/spec 層,Phase 0 自建 baseline)
/product-ui-audit       consumer UI 對 DS 消費的 6 dim audit(code 層)
/visual-audit           pixel-level 視覺 audit(本 skill,需 screenshot)
/component-quality-gate  合入 DS 前的 45 項 checklist(Ship phase 可 chain 本 skill)
```

**關鍵切分**:visual-audit 只看 pixel,**不讀 code / 不改 code**。code / spec / cva 的事全部歸前兩 skill;視覺幾何對齊 / overlay 定位 / baseline / typography vertical rhythm 等「眼睛看得到、mechanical 量得出」的事才是本 skill scope。

## When to invoke

**明確觸發(直接 invoke)**:
- User 說「視覺對齊不對」「排版歪了」「gap 好像錯」「4 邊邊距不對稱」「dark mode 看起來怪」
- User 上傳 Storybook screenshot 配問題:「這樣對嗎」「能看出哪裡錯嗎」
- User 指名元件 + 上傳圖:「audit DatePicker 的視覺」

**自動觸發(chain from other skills)**:
- `/design-system-audit` Phase 3 code/spec 修完後,若 user 要求 visual verify
- `/component-quality-gate` Phase 4 Ship 階段,元件即將 merge 進 DS 前

**不觸發**:
- 要改 spec / cva / token → 走對應 code/spec skill,不是視覺 audit
- 沒有 screenshot → **本 skill 拒跑**(見 Preconditions)
- 只要看一眼順不順 → 不做 audit(這不 mechanical)

## Preconditions(硬規則)

**本 skill 在下列任一缺失下拒跑,回報 user 補齊後再 invoke**:

1. **screenshot 缺失** — user 未上傳 Storybook 或元件實際 render 的截圖
2. **audit target 未明** — 沒指定要稽核哪個元件 / 哪個 story / 哪個頁面
3. **容器尺寸 / viewport 未知** — screenshot 沒附上容器寬度 / viewport size / 元件 size prop,無法 mechanical 量
4. **token 聲明未知** — 該元件 spec 沒宣告該看哪些 token(本 skill 不推測,只比對)

**拒跑回報範例**:

```
本 skill 需要以下資訊才能跑,目前缺:
- [x] screenshot(Storybook 或實際 render)
- [ ] 稽核 target(哪個元件 / 哪個 story 或 URL)
- [ ] 容器 / viewport 資訊(container width / density / theme)

補齊後請 re-invoke /visual-audit,不要讓我用猜的跑 audit。
```

**絕不**在資訊不足下憑感覺判斷——「看起來有點歪」不是 audit,是直覺。本 skill 產出必須全部是 mechanical 可驗證的結論。

---

## 涵蓋的視覺面向(13 項 checklist)

完整 checklist(每項的「怎麼量」「合格標準」「refer 的 DS 規則 / token」)見 [references/visual-checklist.md](references/visual-checklist.md)。以下是摘要(每項 ≤ 2 行):

| # | 面向 | 核心檢查 |
|---|------|---------|
| 1 | **4 邊邊距對稱** | 容器 top / right / bottom / left padding 實測值相等(除明文 asymmetric spec 外) |
| 2 | **垂直對稱(to-top ↔ to-bottom)** | 最外層 element 到容器頂 = 最內層 element 到容器底(DatePicker 箭頭 vs 最後排日期) |
| 3 | **水平 gap 實際值 == gap token 宣告值** | hover bg / ring / focus outline 不可溢出 box 吃掉宣告 gap(node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md「同 flex 列互動 slot 幾何鐵律」) |
| 4 | **Overlay 定位(badge / popover / hover-card)** | anchor-offset / side-offset 對稱;不覆蓋 anchor 內容 |
| 5 | **Typography baseline 對齊** | icon 與同行 text 的 baseline 對齊(非 geometric center 誤植) |
| 6 | **Icon ↔ text gap 一致** | 同類型 row 裡所有 icon-to-text 距離相等 |
| 7 | **容器寬度 fill** | FileUpload / FileItem / Empty 等 block-level 元件是否 100% fill container(非內縮) |
| 8 | **同 row field 高度對齊** | Input / Select / Button 並排時高度相同(`--field-height-md` = 36px) |
| 9 | **跨 OS 一致 scrollbar** | 橫向 scrollbar 是否是 ScrollArea(避免 macOS 隱藏 / Windows 吃寬度) |
| 10 | **Zoom / step 幅度** | 滾輪縮放 step ≈ 1.1×–1.25×(對標 Figma);不可跳大步(如 2×) |
| 11 | **Dark mode 對比 / token 聯動** | 亮暗切換後 fg / bg / border / shadow 全部 token 對應;FileViewer 工具列永遠 dark mode |
| 12 | **Overflow indicator 遮擋** | fade mask / 箭頭 button 不可遮到可讀資訊 |
| 13 | **箭頭按鈕定位(Carousel / Image viewer)** | prev / next 箭頭不覆蓋 content;與邊緣距離對稱 |

**世界級 benchmark 對照**(每項對齊的外部 DS)見 [references/world-class-benchmarks.md](references/world-class-benchmarks.md)。

---

## Workflow

### Phase 0 — Setup + 拒跑 gate

1. 讀 CLAUDE.md 完整(最新 token / 最新 layout primitive 規則)
2. 檢查 user 是否提供 4 項必要資訊(見 Preconditions):
   - screenshot
   - audit target(元件 / story / URL)
   - 容器 / viewport 資訊
   - 該元件對應的 spec.md path
3. **任一缺失 → 停下,按 Preconditions 範例回報,不 proceed**
4. 讀該元件的 `{name}.spec.md`——記下 spec 宣告的 token 值(e.g.「field-height-md = 36px」「gap-2 = 8px」「layout-space-loose = 16px」),作為 mechanical 對照基準
5. Create TaskList entries(13 個 checklist item 各一)

### Phase 1 — 逐項 checklist(13 面向 mechanical 量測)

對 screenshot 逐項走 [references/visual-checklist.md](references/visual-checklist.md)。每項執行:

1. 開對應章節,照「怎麼量」的指引
2. 用 image reading 讀 pixel 距離(screenshot 的座標或尺寸)
3. 比對該項「合格標準」(通常是 token 值或 ratio)
4. 記錄結果之一:
   - `PASS` — 實測值 == spec 宣告值(或 ratio 在容差內)
   - `FAIL` — 實測值偏離,記下**實測值 / 預期值 / 差異 / 對應 DS 規則**
   - `無法判定` — screenshot 解析度 / 角度不夠量,記下**需要補什麼**

**大原則**:
- **不寫主觀描述**(「看起來鬆散」「感覺歪」不算 audit 結論)——只寫可 mechanical 驗證的數字 / ratio
- **不推測 code**(「應該是 cva size 錯」不是本 skill 結論;code 的事走 `/design-system-audit`)
- **不修 code**(本 skill 只報告,不 Edit 任何檔)
- **超出 checklist 的視覺問題** → 記為 `額外觀察`,附 screenshot 座標 + 描述,交 user 決定要不要升級為 checklist 項

### Phase 2 — 輸出 report(固定格式)

產出檔案路徑:

```
node_modules/@qijenchen/design-system/ds-canonical/skills/visual-audit/output/{YYYYMMDD}-{component}-visual-audit.md
```

**檔名規則**:同一天同元件多次跑 → 加 `-v2` / `-v3`。`{component}` 用 kebab-case(對齊專案慣例),例:`20260421-date-picker-visual-audit.md`。

### Report 格式(嚴格)

```markdown
# Visual Audit — {Component} — {YYYY-MM-DD}

Target: {story path / URL / description}
Screenshot: {user-provided, 檔名或描述}
容器資訊: {width / viewport / density / theme}
Spec 依據: {node_modules/@qijenchen/design-system/src/components/{Name}/{name}.spec.md}

## Summary

- PASS: N / 13
- FAIL: M / 13
- 無法判定: K / 13
- 額外觀察: P 項

## Checklist 結果

### 1. 4 邊邊距對稱
- 狀態: PASS / FAIL / 無法判定
- 實測: top=12px, right=12px, bottom=8px, left=12px
- 預期: 4 邊 = layout-space-loose(16px)或 spec 明文 asymmetric
- 差異: bottom 少 4px,且非 spec 明文例外
- 對應規則: `node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 → layout-space token + 該元件 spec.md 第 N 段
- 建議修法方向(不自己改): 調整 bottom padding 對齊 layout-space-loose,或在 spec 記 rationale 為何 asymmetric

### 2. 垂直對稱
...

(每項都展開,PASS 項可一行帶過「實測相等」)

## 額外觀察(非 checklist 13 項)

- {描述 + screenshot 座標 + 建議討論是否升級為 checklist 項}

## 下一步

- FAIL 項優先修順序: 1 → 3 → 4(geometry 類先於 typography 類)
- 無法判定項需要: {補什麼 screenshot / 量測}
- 本 report 不改 code;fix 請走 `/design-system-audit` 或直接 edit
```

### Phase 3 — Checkpoint(必停,STOP 點)

Report 寫完後**停下來**,不 auto-fix。回報 user:

```
Visual audit 寫到 node_modules/@qijenchen/design-system/ds-canonical/skills/visual-audit/output/{YYYYMMDD}-{component}-visual-audit.md

- PASS: N / 13
- FAIL: M / 13
- 無法判定: K / 13

FAIL 項摘要:
- #1 4 邊邊距: bottom 少 4px(見 report 詳細)
- #3 gap 吃掉: hover bg 溢出 ~4px(違反「同 flex 列幾何鐵律」)
- ...

下一步選項:
1. 依 FAIL 清單去改 code / spec(我可以 chain 進 /design-system-audit 或手動 edit)
2. 對某項 FAIL 有爭議 → 討論是否為 spec 明文例外(可加 rationale)
3. 本輪 audit 就結束,user 自行處理

(本 skill 不 auto-proceed;改 code 由其他 skill 或 user 決定。)
```

---

## Non-goals(關鍵 — 混到這些就是職責混亂)

- **不 audit code / spec**(code 層走 `/design-system-audit` / `/product-ui-audit`)
- **不取代 pixel-diff 自動化**(Chromatic / Storybook screenshot-diff 是 tech debt,本 skill 過渡方案)
- **不在沒有 screenshot 下跑 audit**(拒跑,見 Preconditions)
- **不做主觀審美**(「看起來比較漂亮」不是 audit 結論)
- **不改 code / spec / story**(純 read-only report)
- **不推斷沒截到的部分**(screenshot 沒含某 state 不做推測)
- **不 auto-fix**(Phase 3 STOP 交 user 決策)

## Common failure modes(watch for these)

- **憑感覺判 FAIL**:「看起來不順」不算;必須 mechanical 量測 + 對應 token 值
- **把 code 問題寫進 report**(「cva size 應改 md」越界;本 skill 只記「視覺上 field 高度差 4px」讓後續 audit 查 code)
- **主觀 + 機械混寫**:每項結論必須可驗證,主觀觀察一律進「額外觀察」區分
- **screenshot 解析度不足硬量**:記「無法判定」+ 說明需求,不瞎猜
- **跨元件比對忽略容器脈絡**:FileItem in Sidebar vs in Page 邊距可能本來就不同,先讀 spec 有無 context-aware 規則
- **忘記對照 dark mode 版本**:亮暗兩套都要看,尤其 fg / bg / border / shadow

## References

- [references/visual-checklist.md](references/visual-checklist.md) — 13 面向完整 checklist(怎麼量 / 合格標準 / refer 的 DS 規則 / token)
- [references/world-class-benchmarks.md](references/world-class-benchmarks.md) — 世界級對照(Figma zoom step、Material date-picker 邊距、Notion menu sticky header 等)

## 相關

- `node_modules/@qijenchen/design-system/ds-canonical/skills/design-system-audit/SKILL.md` — 全 dim code/spec audit(per design-system-audit SSOT);本 skill 是其 pixel-level 補位
- `node_modules/@qijenchen/design-system/ds-canonical/skills/product-ui-audit/SKILL.md` — consumer UI 對 DS 消費 audit(code 層),不處理視覺
- `node_modules/@qijenchen/design-system/ds-canonical/skills/component-quality-gate/SKILL.md` — 元件合入 DS 前的 45 項 checklist;Ship phase 可 chain 本 skill
- node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md `# 同 flex 列的互動 slot 幾何鐵律` — 本 skill checklist #3 的主要 canonical 來源
- `node_modules/@qijenchen/design-system/ds-canonical/rules/ui-development.md`「建立 UI 前必讀」 → layout primitive / token spec 清單 — 本 skill「合格標準」的對照錨
- `memory/project_pending_tasks`「視覺 regression 基建」條目 — 長期 tech debt(Chromatic / screenshot-diff)
