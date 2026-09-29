# AgentLogo 設計原則(AgentPanel 家族附屬資產;獨立 SSOT)

> **本 spec 是 AgentPanel 家族標誌的獨立 SSOT**(2026-09-27 從 `agent-panel.spec.md`「AgentLogo(標誌;附屬資產)」節整段抽出,避免單一 spec 過長(674 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭與檔尾指標)。品牌色階常數 `AGENT_BRAND`、家族 Token(`--motion-easing-swell` / `--motion-easing-settle`)與動畫總表仍住 `./agent-panel.spec.md`;程式碼對應 `agent-panel-logo.tsx`,機械閘 `scripts/agent-logo-continuity-invariant.mjs` / `scripts/agent-logo-brand-scale-invariant.mjs`。
>
> **Layout Family**:同 `agent-panel.spec.md`(self-contained 容器家族);標誌是 SVG 資產,無 row / pill / field anatomy,本檔不另立 family。

## AgentLogo(標誌;附屬資產)

- 造型=user 提供黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ、軸角 121.717°);
  產品用尺寸 16-48(展示 story 放大到 72 以便逐格檢視動畫,不是新的產品級距);**所有尺寸同一造型**(4 層:面 + 底面陰影 + 面 + 提亮;2026-09-02 user 拍板:
  形狀規則、不設簡化檔;原「≤24 自動簡化」與 `detail` prop 已移除)。
- 一息 3 秒家族(文字微光 2s 另計);緩動=swell(吸/起)/ settle(呼/收)/ exit(加速起步)token 值。
- **呼吸包絡(招喚與思考共用)**:0 靜 → **35% 吸頂**(脹 1.07、白疊層 14%)→ **85% 回落到底** →
  **85–100% 靜止空拍**;呼出去的波 0–35% 貼邊聚亮 → 35% 離體 → **90% 散盡**(比本體多 0.15s 餘韻)。
  依據:靜息呼吸 12–20 次/分 → 一息 3–5s([NCBI StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK537306/));
  靜息 I:E ≈ 1:2、呼氣為被動回彈且呼氣末有停頓([Deranged Physiology](https://derangedphysiology.com/main/cicm-primary-exam/respiratory-system/Chapter-539/inspiratory-pause-ie-ratio-and-inspiratory-rise-time));
  脹=吸氣([Apple Watch Breathe](https://support.apple.com/guide/watch/start-a-reflect-or-breathe-session-apd371dfe3d7/watchos))。
  **亮度包絡取代透明度包絡**:吸氣亮(白疊層)、呼氣暗;本體不透明度恆 1——白面上變淡=像停用,
  且與 shrink/scale 疊加屬前庭誘因([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion));
  2026-09-02 user 問「呼吸是否搭配透明度」→ 研究結論採亮度包絡 + 靜止空拍,不加透明度。
- **每次進入狀態從靜止起跑**:SMIL `begin="indefinite"` + 掛載當下 `beginElement()`(文件時間軸的
  `begin="0s"` 會讓晚掛的動畫從半途起跑、加速段直接凍在終點);同一 commit 掛上的標誌本體與 FAB 光圈同相。
  **起跑鍵必含 exit 段**:think → 減速段新掛的洞形變與亮度淡出同樣是 `begin="indefinite"`,鍵不含該段 = 7 個
  animate 永不起跑(整段減速洞持圓、停定瞬間跳回橢圓;2026-09-03 逐格實測的斷層根因);已起跑的呼吸疊層
  由 `data-begun` 守衛不重啟。機械驗證 = `scripts/agent-logo-continuity-invariant.mjs` C6。
  同一支腳本的 **C7/C8 是純原始碼靜態檢查、不開瀏覽器**,所以任何環境都真的跑(不會被 SKIPPED-ENV 蓋掉):
  C7 從定稿 path 反解外輪廓圓心並比對 `LOGO_CX/LOGO_CY`,同時掃 tsx 內是否還有把 627 當中心用的殘留
  (扣掉註解後全掃,不列舉寫法);C8 擋轉速寫死 —— ω 必須由 `BREATH_S / SPIN_TURNS_PER_BREATH` 推出,
  且一息必須切成整數圈。
- 狀態(prop `state`;「招喚/漣漪」為本家族新造狀態名,定義唯一住所=本節):
  - **still 靜止(=待機)**:完全不動。2026-09-02 拍板:待機一律靜止,不另立呼吸態,狀態分類收斂為三態。
  - **attract 招喚**(空狀態/FAB 有新訊):呼吸包絡上的脹 1.07+吸氣微亮(白疊層 0→14%→0→0)
    +遮罩單波(雙色放射盤內藍 .5→靛 .44→紫 .34→邊緣 0;行程 560→830;0–35% 貼邊聚亮(swell)、
    35% 離體擴散(settle)、90% 散盡;遮罩護負空間、無模糊)。`ripple={false}` 供 FAB 光圈代位。
  - **think 思考**(=回覆中):靜止起步 → 加速 0.25s(=半圈,exit 曲線,位移 126° 使交接速度連續)
    → 等速 **720°/s(0.5s/圈 = 一息/6)**,linear,**持續到離開思考,一直思考就不停**;離開思考 →
    **減速段**:從當下角度以 exit 曲線的時間鏡像 (0,0,0.7,1) 續轉最小 ≥252° 且落回正位 0° 的角度
    (時長 Δ/(ω·0.7) ∈ 0.50–1.21s,交接速度連續、停定即正位),**停定即接靜止、不淡入**(見「轉場」)。
    轉速依據(2026-09-04 修訂;取代 2026-09-02 版):比較對象一律取**出貨值**、逐檔讀第一手原始碼,
    由快到慢 —— [Chakra v2 0.45s](https://github.com/chakra-ui/chakra-ui/blob/v2/packages/components/src/spinner/spinner.tsx#L68)、
    [Carbon 690ms](https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/loading/_animation.scss#L13)、
    [Bootstrap .75s](https://github.com/twbs/bootstrap/blob/main/scss/_variables.scss#L1694)、
    [Radix Themes 800ms](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/spinner.css#L2)、
    [Primer 1000ms](https://github.com/primer/react/blob/main/packages/react/src/Spinner/Spinner.tsx#L10)、
    [Ant 1.2s](https://github.com/ant-design/ant-design/blob/master/components/spin/style/index.ts#L196)、
    [Fluent 1.5s](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-spinner/library/src/components/Spinner/useSpinnerStyles.styles.ts#L58)、
    [VS Code 1.5s](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css#L23)、
    [Material 3 ≈1568ms](https://github.com/material-components/material-web/blob/main/progress/internal/_circular-progress.scss#L47)
    (單層等速旋轉的常數是 `$linear-rotate-duration: calc($arc-duration * 360 / 306)` = 1333 × 360 / 306 ≈ 1568ms;
    `#L43` 的 `$arc-duration: 1333ms` 是弧長形變週期、不是轉速 —— 2026-09-05 更正,2026-09-02 版原本寫對,
    Material 因此移到「由快到慢」最慢端)。
    取 **0.5s/圈**:落在最快檔 0.45–0.69s 之內,不是自創的更快值;唯一更快的出貨值 0.45s 只多 11% 速度,
    卻讓「一息 = N 圈」斷掉(3 ÷ 0.45 = 6.67),故不取。實心雙緞帶比細弧線更吃轉速,取最快檔而非中性帶。
    **閃爍**:造型無 C2 對稱(洞心繞轉軸轉 180° 不落回自身)→ 整圈才重複一次 = 2.0 Hz,低於
    [WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) 的 3 次/秒;
    且 24px 全圖僅 576 px²,遠低於其面積門檻 341×256 = 87,296 px²。
    (2026-09-02 版曾以「600ms = urgent/frantic」定上限,來源是一篇 Jetpack Compose 教學、無研究方法,
    且被誤記為「實測」;2026-09-04 撤除該引用,改以出貨值定範圍。)
    加速未完即離開 → 等加速段結束再減速;<1 影格直接切。+**負空間形變耦合轉速**(起步 0.25s 洞
    橢圓→正圓、同 exit 曲線,轉到最快時洞正好圓;等速持圓;減速段正圓→橢圓、同 DECEL 曲線與時長,停定 0°
    時洞正好回定稿形。2026-09-02 user 問「形變是否用在高速」→ 由 6s 呼吸圓化改為速度耦合:形狀說速度、
    亮度說呼吸;對齊 squash-and-stretch「形變跟著速度」與 Dynamic Island「形隨動作」)+吸氣微亮(亮度
    6s=2 息,峰值 14% 與招喚統一)+色流動(色場定錨畫布=漸層同構逆轉,減速段同步)。
- **轉心 = 外輪廓圓心 (634.671, 604.106),不是 viewBox 中心 (627, 627)**(2026-09-04 修訂):
  墨色區 = 圓盤(r=505.300)減內橢圓;圓盤圓心由外弧端點反解(SVG 1.1 §F.6.5)得上值,與 viewBox 中心
  差 24.145 單位 = 外半徑的 4.78%。旋轉/縮放/波源全部用它。繞 viewBox 中心會出兩個瑕疵:
  (a) 思考態外緣每圈進出一次,24px 下**峰對峰 0.924px**,讀起來像動畫沒對正、不是轉速;
  (b) 招喚態遮罩(r=512)原想留 6.7 單位等寬餘量,偏心後一側超出本體 17.4、對側多切 30.8,
  光暈與本體邊緣之間出現不對稱死環。三個轉心選項覆算:外輪廓圓心對 viewBox 中心是 **Pareto 支配**
  (外緣晃動 24.145→0,洞公轉半徑 65.051→43.487);移到洞心則外緣晃動反增到 43.487,更糟。
- **負空間不置中**(2026-09-04;回答「最快速時洞是否該回到標誌中心」):**不要**。最快速時洞已是正圓,
  正圓與圓盤同心 = 完美圓環 = 旋轉不變,輪廓運動歸零 —— 恰好在最需要速度感的一刻把速度訊號關掉;
  且洞心與圓盤心相距 43.487 單位是定稿造型的**剛體不變量**(任何轉心選擇都不改變),要歸零只能改寫
  定稿路徑,等於在最被注視的一刻把黃金比例莫比烏斯換成泛用同心圓環。速度訊號維持由 2026-09-02 拍板的
  「形狀說速度」(橢圓→正圓)承擔,不另加位移通道。
- 轉場:狀態切換=新狀態 0.15s 淡入(`--motion-duration-overlay`,只動 opacity),禁跳切;**例外:still ↔ think
  不淡入**——兩邊在交接那一刻本來就長得一模一樣(定稿形、0°、無疊層),淡入會讓整顆先變透明再回來 = 斷層
  (2026-09-03 user「最後沒有流暢地把負空間以及色彩回復」根因之一);淡入只留給形態真的不同的交接(招喚 ↔ 其他)。
  減速段的色場基底亦設為當下角度,否則起跑前一影格會閃回 0°。**減動作**:
  互動觸發必可停(WCAG 2.3.3);常駐 loop 全停(嚴於條文),一律回靜止、淡入亦停。
- 多實例安全:漸層/遮罩 id 以 useId 唯一化。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
