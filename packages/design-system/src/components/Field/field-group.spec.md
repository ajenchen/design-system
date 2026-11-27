# FieldGroup 設計原則(field 的分節)

> **本檔是 FieldGroup(多 Field 垂直堆疊)的規格**(2026-11-27 從 `field.spec.md` 整段抽出「FieldGroup — 多 Field 垂直堆疊」一節,含它底下的「FieldGroup `labelWidth` cascade」,因為 `field.spec.md` 扣掉自動維護段後 509 行,超過 `packages/design-system/ds-canonical/hooks/lib/_size_budget.sh` 一般規格的上限 500;內容逐字不改,只加本檔頭)。Field 本身的結構、Orientation(含「硬規則」:同一表單的多個 horizontal Field 必經 `FieldGroup labelWidth` 統一 label 寬)與閱讀情境(範圍 = 最外層 FieldGroup)仍住 `./field.spec.md`;程式碼對應 `field.tsx` 的 `FieldGroup`。內文「退役紀錄」那句的「本檔其餘 user 決定」指的是抽出前的 `field.spec.md`。
>
> **Layout Family**:同 `field.spec.md`(不屬於 4-Family Model 的 element layout families,是 form composition pattern);本檔不另立 family。

## FieldGroup — 多 Field 垂直堆疊

```tsx
<FieldGroup labelWidth={120}>
  <Field><FieldLabel>姓名</FieldLabel><Input /></Field>
  <Field><FieldLabel>Email</FieldLabel><Input /></Field>
  <Field orientation="horizontal">
    <FieldLabel>訂閱通知</FieldLabel>
    <Switch />
  </Field>
  <Field orientation="horizontal">
    <FieldLabel>小字體</FieldLabel>
    <Switch />
  </Field>
</FieldGroup>
```

**欄位垂直間距 = `--layout-space-loose`,不開放 per-instance 選檔(2026-09-12 user 拍板〔UD-F19〕)。**

`FieldGroup` 直接消費 `gap-[var(--layout-space-loose)]`(md 16px / lg 24px),**沒有 `gap` prop**。
表單間距是**系統級**設定:要調就整個 density 一起調,不是每個表單各自挑一檔。
依據是 DS 自己早就寫下的規則 —— `tokens/layoutSpace/layoutSpace.spec.md`「親疏 3 級」表逐字把
「跨範疇 + parallel / independent」的例子列為「**form fields stack(parallel inputs)**」→ 規則 3 = **loose**。

**退役紀錄**:原本有 `gap?: 'compact' | 'normal' | 'loose'`(硬寫 `gap-3/4/6`、凍結不隨 density)。
它來自 2026-04-10 的 `9917993e`,commit 訊息宣稱「rename to shadcn conventions」(`git show 9917993e`:「refactor(fields): restructure field architecture + rename to shadcn conventions」)([來源](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/field.tsx#L44)),
但 shadcn 的 `FieldGroup` **根本沒有 gap prop**(props 只有 `className`,間距由元件固定)——
那三檔是重構時自己長出來的,沒有任何 user 決定背書(本檔其餘 user 決定都有 user 拍板 / user 確認標記,
唯獨那張表沒有)。實際使用也證實它不帶資訊:全 repo 33 個 `<FieldGroup>` 只有 2 個傳過 `gap`
(1 個 `compact` 沒寫理由、1 個傳的就是預設值),`loose` 一次都沒用過。
對照 shadcn:`FieldGroup` 的間距由元件固定,沒有 per-instance 檔位(上段來源;原句另列的兩家沒附一手來源,2026-11-16 撤回)。
**影響**:md 下新舊值都是 16px(33 個用法裡 32 個視覺零變化),lg 下從凍結的 16px 變成 24px。

### FieldGroup `labelWidth` cascade(2026-04-20;2026-11-15 前叫 `horizontalLabelWidth`)

同一畫面 / 同一 FieldGroup 內多個 horizontal Field **必須共用 label 欄寬度**。若每個 Field 各自傳 `labelWidth`(或省略 → 內容撐開),label 寬度會參差不齊,Switch / Input 的左邊緣不對齊,視覺上每一行「歪七扭八」。

表單的 label 欄固定寬，讓每列 control 從同一條線開始，使列與列形成可掃描的欄位格網；label 長度不得逐列改變 control 起點。

`FieldGroup labelWidth` 透過 React Context cascade 到所有子 Field(含 `vertical` 模式的 Field 不受影響——vertical 無 label 欄概念)。單一 Field 仍可用自己的 `labelWidth` prop 覆寫 group 預設(罕見 — 通常 group 預設就是 canonical)。

**同一個值只有一個名字**(2026-11-15,user 2026-11-11 決策頁「尺寸:甲」):群組層與單一 Field 層管的是同一個值(水平排版時的 label 欄寬),
原本群組層叫 `horizontalLabelWidth`、單一 Field 叫 `labelWidth` = 一個值兩個名字。群組層改名 `labelWidth`,型別一併收數字(px);
舊名 `horizontalLabelWidth` 已移除、不留舊名(user 2026-11-15 原話「我認為還是 beta 的狀況下都不要再顧及所有向後相容的部分」;0.x 相容政策 = `ds-canonical/references/props-naming.md`「相容政策」)。【AI 推導 2026-11-15:把這一對收成同名是「尺寸:甲」的落地,
user 原話沒有點名這個參數;依據是盤點 audit-r7 INV-14 列在甲案遷移清單裡】

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `field-control-group.spec.md`
