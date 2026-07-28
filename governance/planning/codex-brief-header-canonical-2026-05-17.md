<!-- Authority/status: governance/planning/registry.json -->
# Codex Brief — Header canonical SSOT 比稿

## User 原話(verbatim,不 paraphrase)

近 3 turn user 連續 verbatim quotes:

**Turn N-2**:「我認為有tabs的header的下底線不應該由tabs畫才對，應該header自己畫吧？所以應該是要拿掉原本tabs下方會有的底線？你仔細研究看這樣對不對 另外要確認一下世界級的設計怎麼分類各種尺寸tabs的用途，如圖一所示的情境分類是否合理？ 但你還是要確保兩種header的SSOT是連動的吧？避免改了A處結果B處偏移」

**Turn N-1**:「『注意:WebFetch 對 Material 3 / Primer / Polaris 都拿不到 detail(403 / 稀薄)— 上述世界級對照是 general knowledge,不是 cited evidence(M22 retract marker)。如果你要 hard commitment,我需要看 screenshot 你提供的真實 Notion/Figma/Linear app 截圖驗證。』怎麼可能拿不到？那ant design 和arco design 呢」+「我傾向類似這個做法，然後lg的定義應該其實很明確，就是當獨立存在的tabs要直接取代header用的，所以才會讓高度基本上都是跟page chrome header 對齊?應該是這樣吧」+「反正我認為你先踏實的把所有世界級的設計都如實抓下來研究，確認你的論述都沒問題的話，那就照你建議做」

**Turn N(本次)**:「你跟codex先比稿，討論並辯論，給我最佳解讓我評估，但要確保SSOT的UI/UX是要如我們所定義的」

## Claude 理解 + 脈絡

### 我 v1(已 ship Phase 1 spec SSOT,production code 等 user 拍板)

**已 land**(Phase 1,governance only):
1. NEW `packages/design-system/src/patterns/header-canonical/header-canonical.spec.md`(SSOT,含 W1-W6 withTabs lockstep)
2. Update `packages/design-system/src/components/Tabs/tabs.spec.md` size table 重整 + border 段加 cite
3. 6 consumer spec.md 加 pointer(Sidebar / Dialog / Sheet / Popover / FileViewer / ssot-consultation.md)
4. 跑過 tsc + audit-content-quality + extract-canonical-rules 三綠

**6-rule lockstep**(Phase 1 spec 已 codify):

| Rule | 規則 | Cite |
|---|---|---|
| W1 Border auto-suppress | header `border-b` 移除,TabsList border 接管(視覺同一條線) | GitHub Primer PageHeader verbatim「hasBorder NOT rendered if Navigation child contains UnderlineNav」+ 既有 `tabs.spec.md:197,244` |
| W2 Tabs padding align header | TabsList `px-loose` = header `px-loose` | Carbon verbatim「first label should always align to other content in the space」 |
| W3 Tabs size 對應 family | overlay+chrome header = tabs sm;獨立取代 chrome header = tabs lg | Ant verbatim「Large in page header, small in Modal」+ token alignment 鐵證 `--tab-height-lg`=`--chrome-header-height`(48/56) |
| W4 Flush stack,no negative margin | header content row + tabs row 直疊 gap=0 | M25 chain invariant + GitHub Primer 實作 pattern |
| W5 md size = future tier | token 保留,spec 明寫無 use case | Material/MUI/Primer/Polaris 多家世界級 single size 共識 |
| W6 cva default sm | 從 md 改 sm(W5 後 default 應 = sm)— Phase 2 production code 等拍板 | W5 邏輯延伸 |

**3-column SSOT owner table**(M29 mandatory):

| Candidate owner spec | Canonical sentence | Conflicting code/comment |
|---|---|---|
| `tabs.spec.md:185-197` | 「TabsList border 與 header border 視覺同一條,Consumer 把 Tabs 放在 header 區域內、移除 header 自己的 border-b,讓 Tabs 的 border 接管」 | 無(`tabs.tsx:108` 實作對齊) |
| `overlay-surface.spec.md` | SurfaceHeader padding-based + dismiss size sm | 無 |
| `tokens/uiSize/uiSize.spec.md:240-260` | Padding-based vs Fixed-h decision tree + 8 家 world-class 對照 | 無 |
| `sidebar.spec.md:205-230` | SidebarHeader `h-[var(--chrome-header-height)]` density-responsive | 無 |
| `file-viewer.spec.md:103` | Toolbar 固定 `h-14`(56) | **DRIFT**:不消費 `--chrome-header-height`(md=48/lg=56)— Phase 1 已 codify Phase 2 migrate;intent「viewer chrome lock lg」未 codify rationale |

### Dimension matrix(per axis 比稿)

| Axis | My v1 | 你獨立 propose | Verdict |
|---|---|---|---|
| **Q1 Border ownership** | A 方向(tabs 畫,header auto-suppress)— Primer + 既有 spec | ? | ? |
| **Q2 Tabs size 階梯** | 3-tier 保留 token,sm/lg active,md future tier | ? | ? |
| **Q3 Flush stack vs negative margin** | Flush stack `<div flex flex-col>`(M25 chain invariant) | ? | ? |
| **Q4 cva default sm 遷移風險** | Phase 2 改;grep 所有 consumer 確認無 break(可能 break 既有 stories) | ? | ? |
| **Q5 ChromeHeader primitive 設計** | 新建 `patterns/header-canonical/chrome-header.tsx`,API:`<ChromeHeader withTabs?: boolean density?: 'md'\|'lg'>{children}</ChromeHeader>` | ? | ? |
| **Q6 SurfaceHeader 加 withTabs** | 加 `withTabs?: boolean` prop auto-suppress border | ? | ? |
| **Q7 FileViewer h-14 drift** | Phase 2 codify「viewer chrome lock lg」rationale 進 spec + 改 `h-[var(--chrome-header-height)] data-density="lg"` | ? | ? |
| **Q8 Hook 機械強制** | `check_header_with_tabs_border.sh` + `check_chrome_header_handcraft.sh`;P0 BLOCKER 還是 P1 soft warn? | ? | ? |

## 請獨立解讀 user 原話

**不被我 Claude 框架限**,獨立基於 user verbatim quotes 解讀並回答:

1. **Q1 Border ownership**:user 直覺「header 自己畫,拿掉 tabs 底線」— 是 reject A 方向?還是 user 在表達「視覺上 header 應 own border」但實作可走 A?你的獨立判斷?
2. **Q2 Tabs size 階梯**:user 明確「lg = 獨立 tabs 取代 header,高度 = chrome-header-height」— 這個 use case 在世界級 DS 真的存在嗎?有 anchor app 案例?
3. **Q3 Token alignment(W3 SSOT linkage 機械保證)**:`--tab-height-lg`=`--chrome-header-height` 像素相等是巧合還是設計 intent?動一方必同步另一方該怎麼 enforce(token alias vs assert vs hook)?
4. **Q4 Phase 2 production code 風險**:cva default `md`→`sm` 會 break 哪些 consumer?你 grep 過嗎?
5. **Q5 ChromeHeader primitive 必要性**:現在 Sidebar / FileViewer / InfoPanel 各自 hardcode `h-[var(--chrome-header-height)] border-b px-loose`,新建 primitive 會不會過度抽象(M21 prop variant test 風險)?
6. **Q6 你對我 W1-W6 lockstep 有任何 disagree?**

### Per-axis verbatim cite requirement(M22 mandate)

你的 reply 必含:
- 每 axis 至少 1 個 inline source citation(URL / file:line / GitHub source / verbatim quote)
- 若 disagree 我 v1 → 必 counter-cite(指出我 cite 的 source 哪錯 OR 補我漏的 source)
- 若 agree → 也必 cite(不可空 agree)

### 禁止

- ❌ Pass-through「都對」/「酌情」/「都 ok」
- ❌ 無 cite hand-wave
- ❌ 簡單 paraphrase 我 v1(必獨立 own-version)
- ❌ 跳 Q5/Q6 不答

### 環境

- 本 DS 位於 `packages/design-system/src/`,framework Vite + React + TS + Tailwind v4 + Radix
- 既有 Phase 1 spec.md SSOT 已 ship(per Phase 1 file list)
- M31 5-step canonical:本 brief 是 Step 0.05/0.5/1;你回完進 Step 4-4.5-4.6-5

請 read-only 跑(`exec -s read-only`),不 commit / Edit file,純 propose。
