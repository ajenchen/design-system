<!-- Authority/status: governance/planning/registry.json -->
# DS Devmode Addon — 規格 + 開工計劃

**Status**: ✅ **Shipped**(2026-04-24 commit `b3acb79`)
**Redundancy**: on-disk(本檔)+ memory `project_ds_devmode_addon_2026_04_24.md`

## 交付驗證(2026-04-24)

4 階段全完成,Playwright self-verify 7 張截圖對照 `ref/*.png`:
- ✅ Stage 1:click-to-pin + Off/Live/Pin toggle + Alt+I + Esc
- ✅ Stage 2:computed style + token reverse lookup(`var(--radius-sm, 4px)` 等正確反查)
- ✅ Stage 3:redline overlay(紫 outline + 紅距離 + dashed parent)
- ✅ Stage 4:padding hatching(藍 45deg)+ List/Code toggle + Copy

實作 location:`.storybook/addons/ds-devmode/`(Panel/manager/preview/utils × 4/preset/package.json/README)
Self-verify script:`scripts/verify-ds-devmode.mjs`

## 目標(User ref 圖明確要求)

Figma Dev Mode 等級的 Storybook 內 inspect 體驗。`ref/` 資料夾有 2 張 PNG(2026-04-24 user 放入):

1. **點擊元件會在右側出現 panel 呈現詳細資訊**
   - Layer properties / anatomy box 圖示(padding / border / margin 紅色距離 label)
   - List / Code 切換、CSS 分段 Layout + Style
   - 含 `var(--s2d-info, #0065EA)` token 名 + resolved 值

2. **點擊元件本身會出現 redline**
   - 紫色 border + padding 藍色斜紋 hatching + 到 parent edges 的紅色距離 label + property badge

## 為什麼非自建不可(市面 0 addon 達成)

- `@storybook/addon-measure`(essentials 內建)只 Alt+hover,無 click-pin,無 token resolution
- `@whitespace/storybook-addon-html`(已裝)只顯 HTML + className,無 computed style 無 token 反查
- `storybook-addon-pseudo-states`(**2026-04-24 已 uninstall**)— user 驗證沒觸發 hover 且偏題
- Figma 官方 Storybook Connect 是反方向(Figma 內看 Storybook,非 Storybook 內看 Figma)

## 架構路徑

**位置**:`.storybook/addons/ds-devmode/`(本地 addon,不發 npm)

**檔案結構**:
```
.storybook/addons/ds-devmode/
├── preset.ts           — Storybook addon 註冊入口
├── manager.ts          — panel register + toolbar toggle button
├── preview.ts          — canvas iframe 內:click listener + redline overlay renderer
├── Panel.tsx           — 右側 panel UI(anatomy box + CSS dump + token lookup)
├── utils/
│   ├── dom-geometry.ts — getBoundingClientRect + parent-distance 計算
│   ├── computed-style.ts — getComputedStyle + variant 篩選
│   └── token-reverse-lookup.ts — 掃 :root custom properties + CSS var 反查
└── README.md           — 使用說明 + keyboard shortcut
```

## 4 階段迭代(每階段 commit + 截圖)

### Stage 1 — Click-to-pin + 基本 panel(30-45 min)
- `preview.ts`:listener on canvas iframe document,click → postMessage 給 manager
- `Panel.tsx`:接 message → 顯 bounding rect(width/height/x/y/padding/margin)+ className + tag
- Toolbar 按鈕切 Inspect mode on/off

### Stage 2 — Computed style + token reverse lookup(45-60 min)
- `utils/computed-style.ts`:`getComputedStyle(el)` 只抓 layout / color / typography / spacing,過濾 default browser styles
- `utils/token-reverse-lookup.ts`:
  - 啟動掃 `document.documentElement` `:root` CSS custom properties → 建 reverse map(`#0065EA` → `--primary` / `--s2d-info`)
  - 相同值多 token → 全列
  - 顯示:`background: var(--primary, #0065EA)` + hover 顯 token chain(`--primary = var(--color-blue-6) = #0065EA`)
- Panel 加 Layout / Style 分節

### Stage 3 — Redline overlay(canvas 層,~1 小時)
- `preview.ts`:click 後 render overlay div inside iframe document
- Overlay 含:
  - 紫色 outline 包住元素
  - 到 parent 的距離 label(top/right/bottom/left)紅色數字
  - SVG / absolute lines 連接 element → parent edges
- Pin 狀態保留;Live 狀態 hover 切換

### Stage 4 — Padding hatching + List/Code toggle(~1 小時)
- Padding 斜紋:`repeating-linear-gradient` 畫藍色 hatching 在 computed padding 區
- Panel List / Code 切換:
  - List:semantic 呈現(Layout: display, height, padding...)
  - Code:可複製 CSS 區塊

**總預估**:3.5-4.5 小時 focused(AI 實際速度)

## Pin vs Live 雙模式

| 模式 | 行為 |
|------|------|
| **Live**(default) | hover 任何元素即時 update panel,適合快速掃視 |
| **Pin**(click 啟動 / Alt+I toggle) | 點擊鎖定,panel 凍結該元素;可再 hover 別處不受影響 |

## Reusability guarantees(user 已確認需求)

| 問題 | 保證 | 實作 |
|------|------|------|
| 新元件 / 新 story auto 可用? | ✅ YES | DOM-level listener,跟元件 implementation 無關 |
| 互動 flow / 動畫每幀可檢閱? | ✅ YES(Pin mode) | 讀 live DOM + getBoundingClientRect,任何時點 click 都抓當下 |

## 建 addon 時的 technical gotchas

1. **iframe 邊界**:Storybook canvas 在 iframe 內,event listener + overlay 都綁 iframe 內 `document`,非 manager 端
2. **Keyboard shortcut**:`Alt+I` toggle Inspect mode;避免單鍵 `I`(story 可能用 keyboard 測)
3. **Hover 狀態檢視** 透過 Pin mode 實現(先 pin element,再 hover 看 canvas 其他互動)
4. **SB 8.6 API**:用 `@storybook/manager-api` 不是 `storybook/manager-api`(後者是 SB 9)
5. **Memoize 不需要**:每次 click 重算一次即可,不 subscribe(flow 換幀再 click 再讀)

## 開工 checklist

- [ ] 建 `.storybook/addons/ds-devmode/` 目錄
- [ ] Stage 1 — click-to-pin + basic panel
- [ ] Stage 2 — computed style + token reverse lookup
- [ ] Stage 3 — redline overlay
- [ ] Stage 4 — padding hatching + List/Code toggle
- [ ] README.md — 使用說明 + keyboard shortcut + pin/live 切換
- [ ] 每階段截圖驗證 + commit + push
- [ ] 完工後 CLAUDE.md `# 技術架構概覽` 加 pointer 到 `.storybook/addons/ds-devmode/README.md`

## 時間估算校正(2026-04-24)

先前給 user 的「MVP 2-3 天 / 完整 1-2 週」是套人類工程師全日 padding,偏防禦性。實際 AI 速度 3.5-4.5 小時 focused 可完工。User 直接指出估算過大,校正入本檔。
