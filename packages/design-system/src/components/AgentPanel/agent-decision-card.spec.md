# AgentDecisionCard 設計原則(AgentPanel 家族;獨立 SSOT)

> **本 spec 是 AgentPanel 家族決策卡的獨立 SSOT**(2026-09-27 從 `agent-panel.spec.md`「元件規格」第 8 節整段抽出,避免單一 spec 過長(674 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭與檔尾指標)。家族定位 / Token / 何時用 / 動畫總表 / Esc 與關閉語意 / 禁止事項仍住 `./agent-panel.spec.md`;程式碼在 `agent-panel.tsx`(`AgentDecisionCard` 與產題守則機械層 `warnDecisionRules`)。
>
> **Layout Family**:同 `agent-panel.spec.md`(self-contained 容器家族;決策卡繼承 Popover surface 配方 + SurfaceFooter,見下)。本檔不另立 family。

### 8. AgentDecisionCard(決策卡)

- 僅代理被阻擋、需人決策時出現;完全覆蓋輸入區、貼面板底。
- 繼承 Popover surface(rounded-lg、border、elevation-200、compact header 45)+SurfaceFooter;
  改寫:無下圓角;header 下、footer 上無分隔線;body 上下無內距、左右 `--layout-space-loose`。
- Header:`[小標「n / N」(僅 N>1)][題目 text-body font-medium][×=跳過]`,items-start。
- 選項卡(拍板樣張 2026-09-02):每個選項=灰底卡 `bg-secondary rounded-md px-3 py-2`,
  **整卡可點**(滑過見下一條);卡片組合 `SelectionItem`(**py 0**:卡的 py 8 是唯一行距 owner,SelectionItem 自帶
  (32−1lh)/2 歸零,避免 double padding——`../Checkbox/checkbox.spec.md`「零外部 gap」鐵律的反向)
  + RadioGroupItem md(複選=Checkbox md);radio↔label 8、label↔description 2;卡間距 8。
  「其他」卡永遠最後、**常駐 Input**(md 32;label 行框↔Input 8;左縮排 24 = radio 16 + gap 8 對齊 label,
  [Polaris ChoiceChildren 同款](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/Choice/Choice.module.css);
  距卡右/下各 12);聚焦即選中「其他」;**滑鼠/觸控點整張「其他」卡 → 自動聚焦 Input**(明確指向意圖),
  鍵盤方向鍵選中不搶焦點(APG radio roving,Tab 一步即到);radio `aria-controls` 指向 Input。
  幾何:一般卡 8+21+2+21+8 = 60;「其他」卡 8+21+8+32+12 = 81。
- 選項卡滑過(2026-09-26 AI 建議,列在「其餘建議」、user 未另提 → AI 判讀照建議做;user 的問句見上;待辦總帳 B12):指標在整張卡的**任何位置**(內距、圓與字的空隙、說明文字、「其他」卡的輸入格),
  卡內的圓(複選是方框)照它被自己的 label 滑過時的樣子變色 —— 顏色即 `../Checkbox/checkbox.spec.md`「狀態」Radio / Checkbox 表的 hover 列,
  不新增顏色;**卡片灰底不換色**、字色不變;卡與卡之間的 8 不屬任何卡,滑過不變、點了也不選。
  理由:DS 原本的單選/複選項目本身沒有滑過樣式,回應的只有控件(`../SelectionControl/selection-item.spec.md`「為何無 ColorMatrix / StateBehavior」),
  指到字上圓也會變是 HTML label 的轉發;選項卡的命中區是整卡,同一套語言的回應範圍就是整卡。
  user 原問句(逐字;問句,不是決定):「我覺得好像不用加上底色變化，若它是 radio 的話，那滑到整個 radio item 應該跟原本的radio item有一樣的設計語言？仔細研究查查原本hover radio item會長怎樣？全盤確認。」
  「其他」卡指在輸入格上:圓照樣變,輸入格外框自己的滑過疊在上面 —— 卡片是宿主、輸入格是卡內控件,宿主保留自己的滑過
  (`../../tokens/color/color.spec.md`「Hover 換色配對總則」巢狀滑過段;套到「宿主的滑過是控件變色」是 AI 推導);點輸入格即選中「其他」,圓亮起來的承諾成立。
  作法:卡片掛具名群組 `group/agent-option`,控件把**自己的** `hover:` 配對原樣接到群組滑過(`agent-panel.tsx` `OPTION_RADIO_HOVER` /
  `OPTION_CHECKBOX_HOVER`,逐條鏡射 `../RadioGroup/radio-group.tsx` / `../Checkbox/checkbox.tsx` 的 hover 行,owner 改色時同步改);
  不把整卡改成 `<label>`:卡內已有 SelectionItem 的 label、`<div>` 與輸入格,違反 [WHATWG label 內容模型](https://html.spec.whatwg.org/multipage/forms.html#the-label-element)。
  鍵盤不受影響(焦點框仍在控件本體)。世界級:卡片式單選 [Joy UI Radio `overlay`](https://github.com/mui/material-ui/blob/f2e0dab9d80271310843c57b9bd430e07e267b8d/docs/data/joy/components/radio-button/radio-button.md#L113-L119)
  同形(整卡可點、滑過只變圓;Joy UI 已於 2026-03-11 自 MUI 主 repo 移除,只作曾經的做法);Carbon RadioTile 改換卡片底色
  ([_tile.scss#L62-L73](https://github.com/carbon-design-system/carbon/blob/7e8c8f7db6dd2ed98c4947b78b37614f43eda920/packages/styles/scss/components/tile/_tile.scss#L62-L73)),
  本 DS 不採 —— 單選狀態表的底色欄一律不變(`../Checkbox/checkbox.spec.md`「狀態 › Radio」)。
- 關閉:header × 恆為跳過;第一題另有跳過鈕(第二題起左鈕換成上一題),兩者同一行為=跳過;無 Esc、無外點關閉(阻擋語意)。
- 步進:**一題一步**,footer 左鈕=第一題「跳過」(用預設繼續)、第二題起「上一題」(答案保留;
  [Material Stepper Back](https://m1.material.io/components/steppers.html) / [GOV.UK Back link](https://design-system.service.gov.uk/components/back-link/) 同款,
  2026-09-02 user 拍板);右鈕=「下一題」、末步「送出」;header × 恆為跳過。
  「其他」選中而文字為空 → 下一題/送出 disabled。
- 選項=**RadioGroup md 包裝不改造**(Popover all-sm 律之顯式拍板豁免;footer 鈕維持 sm 守律);
  預選項(`defaultValue`,省略=第一項)由元件在 label 後加「(建議)」。
- 進出=淡入+下滑 8、`--motion-duration-overlay`。
- A11y:`role="group"` + `aria-labelledby`;radiogroup / checkbox 原生鍵盤。

#### 產題守則(約束代理出題品質;標 ⚙ 者由元件 DEV 警告或渲染邏輯機械強制)

1. ⚙ **題數 1–3,每題必須改變代理下一步**;能一題就不問兩題;禁「計畫可以嗎?」類空問。
   ([Claude Agent SDK AskUserQuestion 1–4 題/次](https://code.claude.com/docs/en/agent-sdk/user-input),
   本 DS 收緊為 ≤3;[GOV.UK one thing per page](https://design-system.service.gov.uk/patterns/question-pages/))
2. ⚙ **一題一步**:一次只顯示一題;N≥2 才顯示小標「n / N」;第二題起可「上一題」回頭改答(答案保留),不可跳題。
   ([GOV.UK 需要才加簡單「Question 3 of 9」](https://design-system.service.gov.uk/patterns/question-pages/);
   [NN/g wizards 標出目前步、強制順序](https://www.nngroup.com/articles/wizards/))
3. ⚙ **題目=一句完整問句、以「?」結尾、句內點名決策對象**(「公告要用哪種語氣?」);禁「確定嗎?」「注意!」。
   ([Material 對話框標題=問句或陳述、禁 Are you sure?](https://m1.material.io/components/dialogs.html))
4. ⚙ **具名選項 2–4 個**(不含「其他」);>4 → 拆題。
   ([SDK 2–4 options](https://code.claude.com/docs/en/agent-sdk/user-input);
   [NN/g ≤5 用 radio](https://www.nngroup.com/articles/listbox-dropdown/);`../RadioGroup/radio-group.spec.md`「2-5 且全部可見」)
5. ⚙ **選項標籤單行、≤10 字、無句尾標點、同題平行結構**;標籤說「選了會怎樣」,禁 A/B/C、「方案一」。
   ([Polaris ChoiceList:label based on what the option will do、無句尾標點](https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/components/selection-and-input/choice-list.mdx))
6. ⚙ **每個具名選項附一行差異描述**:單句、無句號、不重複標籤、同題各選項比同一個維度(後果/取捨)。
   ([GOV.UK hint 單句無句號](https://design-system.service.gov.uk/components/radios/))
7. ⚙ **「其他」由元件附加、永遠最後**;代理不得自列「其他」;送出值=使用者文字(非「其他」二字);空字串不得前進。
   ([SDK:custom text as the answer value, not the word 'Other'](https://code.claude.com/docs/en/agent-sdk/user-input);
   [GOV.UK none 選項放最後](https://design-system.service.gov.uk/components/checkboxes/))
8. ⚙ **單選題必預選推薦解、推薦解排第一、「(建議)」由元件標**(代理不寫該字樣);推薦必是代理有證據的最佳解。
   例外:不可逆/安全/法律/身分稱謂類題 `noDefault` 不預選,把後果寫進描述。
   ([NN/g:pre-select the recommended when confident;例外 legal/presumptuous](https://www.nngroup.com/articles/radio-buttons-default-selection/);
   反例 [GOV.UK do not pre-select](https://design-system.service.gov.uk/components/radios/) 的顧慮是漏答/交錯答,本卡一題一步且 Skip 明示用預設繼續,故取 NN/g 立場)
9. **排序**:推薦第一;其餘常見→少見或邏輯序(小→大、保守→激進),禁字母序;「其他」最後。
   ([GOV.UK most-to-least common](https://design-system.service.gov.uk/components/radios/))
10. ⚙ **單選為預設;答案本質可複選才 `multiSelect`**(「要包含哪些章節?」):複選改 CheckboxGroup、選項不得互斥、
    **不預選**、仍附「其他」。([SDK multiSelect](https://code.claude.com/docs/en/agent-sdk/user-input);
    [GOV.UK checkboxes 不預選](https://design-system.service.gov.uk/components/checkboxes/))
11. ⚙ **Skip=「全部用預設繼續」**(非取消、非關對話);header × 恆為 Skip;footer 只有兩鈕(第一題 跳過/下一題,之後 上一題/下一題|送出)。
    ([Material ≤2 actions、肯定右否定左](https://m1.material.io/components/dialogs.html);[NN/g wizards allow exit midway](https://www.nngroup.com/articles/wizards/))
12. **題與題互不依賴**:後題不因前題答案改變;需要分支 → 下一回合另開一張卡。
    ([NN/g wizards self-sufficient steps](https://www.nngroup.com/articles/wizards/))
13. **每步不需捲動即可讀完**(面板寬內 4 選項+描述皆單行);描述過長=精簡,不截斷
    (`../Checkbox/checkbox.spec.md`「Clamp 政策」;ScrollArea 僅兜底)。
14. **內容真實**:題目與選項必是可辨識業務情境(檔名、頻道、客戶名);禁 Option A/B/C、Lorem(`AGENTS.md` mindset #4)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
