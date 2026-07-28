# 範例選擇原則(完整)

每次新增、修改、或審查 story 範例時的第一準則——適用 `.stories.tsx` / `.principles.stories.tsx` / `.anatomy.stories.tsx` 的所有範例情境。

## 最高準則:用耳熟能詳的真實業務場景,禁止極端 / 虛構 / 佔位案例

Storybook 是**公開文件**,受眾是任何打開的設計師 / 開發者 / PM。範例的核心功能是**教學**,不是展示元件能跑——不是跑得起來就算,而是要讓讀者從範例**推得出自己產品該怎麼用**。

## 合法場景來源(按優先序)

1. **對標世界級 SaaS 的真實功能**:Jira task status、Linear priority、Slack DM notification、Notion settings toggle、Figma toolbar、GitHub PR review、Stripe 付款、Airtable filter、Google Docs 權限設定
2. **台灣 / 全球常見業務流程**:電商結帳(信用卡 / 轉帳 / 貨到付款)、訂閱方案(月付 / 年付 / 企業)、文件協作(編輯 / 評論 / 唯讀)、表單提交(送出 / 儲存草稿 / 放棄變更)
3. **該元件原生生態的慣用場景**:Segmented 的「全部 / 進行中 / 已完成」、Tabs 的「總覽 / 活動 / 成員 / 設定」、RadioGroup 的付款方式、Checkbox 的同意條款

## 明確禁止

| 禁止類型 | 範例 | 為什麼 |
|---------|------|-------|
| **佔位符** | `Option A / B / C`、`Lorem ipsum`、`foo / bar`、`Test value` | 無情境,讀者學不到任何東西 |
| **抽象代號** | `按鈕一 / 按鈕二`、`Variant X`、`Rule A / B` | 不是產品語言,破壞「受眾是設計師」的前提 |
| **極端不現實案例** | 單 button「刪除全部使用者資料包含備份無法復原」、filter 有 50 個項目、dialog 嵌套 5 層 | 非日常使用情境,失去教學價值 |
| **視覺符號表達式** | `│─ 業務 ─│`、`A → B → C`、ASCII art | 不是產品 UI,污染 Storybook 視覺 |
| **spec 內部代號** | 「符合 Rule 3.2」「遵循 Convention A」 | 讀者沒讀 spec 也要看得懂 |

## 兩個驗收 test(寫完 / 審時自問)

### Test 1 — 「人」test
新加入的設計師打開 Storybook,**遮住所有 title / label / note**,只看元件裡的文字和情境,能不能 5 秒內說出「喔這是在做 X 流程」?
- 能 → 場景有教學力
- 不能 → 改成具體業務場景,不是補說明文字

### Test 2 — 「舉一反三」test
讀者看完這 3-5 個範例,**推得出自己專案類似情境該怎麼用嗎**?
- 能 → 範例涵蓋了決策維度(如 RadioGroup 的付款方式 + 訂閱方案 + 權限角色 = 教會讀者「決策節點類」的三個面向)
- 不能 → 範例之間同質、缺維度——增加互補場景而非重複

**黃金比例**:5 個具代表性的真實場景 > 20 個重複 placeholder。

## 正確範例(✅)對照

- **Button**:「送出表單 / 儲存草稿 / 放棄變更」(表單流程三按鈕)、「刪除專案」(destructive confirm)
- **Badge**:「3 個新通知」、「未讀訊息 12」、「必填」、「Beta」
- **SegmentedControl**:「總覽 / 活動 / 成員 / 設定」(workspace tab)、「日 / 週 / 月」(時間範圍)
- **RadioGroup**:「信用卡 / 銀行轉帳 / 超商付款」(付款方式)、「月付 / 年付(省 20%)/ 企業」(訂閱)
- **Switch**:「Bluetooth 開 / 關」、「Email 通知」、「Dark mode」
- **Checkbox**:「我同意服務條款」、「寄送促銷 email」(訂閱偏好)

## 適用範圍

| Story 類型 | 適用性 | 備註 |
|-----------|-------|------|
| `.principles.stories.tsx` | **最嚴格** | 教學性高,範例品質 = 設計系統品質 |
| `.stories.tsx`(展示) | 嚴格 | 範例代表元件「日常應該長這樣」,不是 test case |
| `.anatomy.stories.tsx` | 彈性 | token 藍圖 / inspect 面板可用合成內容,但**元件渲染範例仍須真實場景** |
| `explorations/` | 寬鬆 | 比稿可用抽象內容,但定案後轉入正式系統前須替換 |

## Rule note 品質

**Rule note 必須傳達原則而非結論**,讓讀者能舉一反三——寫「為什麼」而不只是「是什麼」。例如:
- ❌「禁止 primary」 → ✅「工具層必須是視覺重量最低的一層,否則搶走業務焦點」
- ❌「全程 icon-only」 → ✅「這些 icon 在此脈絡下約定俗成,使用者不需 label 就能辨識」

## 視覺與文案品質

- **Toolbar 範例**統一使用 `ToolbarFrame`(滿版 + 短標題),不用裸 `ButtonGroup` 漂在半空
- `ToolbarFrame` 標題模擬真實產品(2–4 字如「文件」「專案」),說明放在下方 `Label`,不塞進標題導致文字與按鈕碰撞
- 同一個 story 內的範例容器必須一致,不混用不同寬度
- ❌/✅ 判斷放在 `Label`,不放在 ToolbarFrame 標題內
- **排版層級清晰**:主標用 `h3`(深色、正常大小),副標用 `text-caption`(灰色、限寬 720px),Label 用 `text-footnote`(最小字、範例解說)。三層視覺上必須有明顯區隔
- **icon-only 按鈕有 `aria-label`**;互動範例可用鍵盤操作
