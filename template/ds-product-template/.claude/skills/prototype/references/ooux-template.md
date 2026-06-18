# OOUX Template — Object-Oriented UX(Object Map + NOM + CTA Inventory)

Object-Oriented UX 是 Sophia V. Prater(Rewired UX)提出的方法論。核心主張:使用者想的是**物件**,不是流程。設計 UI 前先盤核心 objects(名詞),產出以物件為中心的 UI。

**為什麼本 skill 整合 OOUX**:
- Phase 1 benchmark 只看視覺 + 功能 = 抄形式,抄不到 **information architecture**;加 OOUX 看物件結構才是深度對標
- Phase 3 每 candidate 先定 object model,UI 決策變 derivation(list view 顯示什麼 attributes / detail view 什麼 CTAs)— 不靠直覺
- 跨 candidate 共享同一 product-level object 定義,stakeholder 比稿時不被物件命名差異污染

出處:[Sophia V. Prater — OOUX](https://www.ooux.com/) / [Rewired UX podcast](https://rewiredux.com/)

---

## ORCA Process(4 步)

1. **O**bjects — 找出產品核心「名詞」
2. **R**elationships — 物件間如何關聯(NOM = Nested Object Matrix)
3. **C**TAs — 每個物件 per user role 可做什麼動作
4. **A**ttributes — 每個物件的 properties

Airbnb 範例(參考 reference model):

| Object | Attributes | Relationships | CTAs(Host) | CTAs(Guest) |
|--------|-----------|---------------|------------|------------|
| Listing | title / photos / price / amenities / location | has many Reviews / belongs to Host / has many Reservations | Edit / Delist / Update price | Book / Save / Share |
| Reservation | check-in / check-out / total / status | belongs to Listing / belongs to Guest | View / Cancel | View / Cancel / Review |
| Review | rating / text / photos / date | belongs to Listing / by Guest | Reply | Write / Edit / Delete |
| Host | name / avatar / bio / languages / response-rate | has many Listings / has many Reviews | Edit profile | View profile / Message |
| Guest | name / avatar / verified / trips | has many Reservations / has many Reviews | — | Edit profile |

注意:一個 object 可能有**不同 UI 展示 shape**(list row / card / detail page / inline chip),OOUX 不決定 shape,只決定 structure。shape 選擇走 Phase 3 時 consume DS 元件決定。

---

## Phase 1 用法 — 分析每個競品的 object model

benchmark scan 時,每個 reference 後加 mini object map:

```markdown
### Reference: Linear(issue tracking)

**Core objects identified**:
- Issue(title / desc / priority / assignee / labels / cycle / status)
- Cycle(name / start-end / scope / issues)
- Project(name / description / lead / issues / status)
- User(avatar / name / role)
- Team(name / members / issues)

**Relationships**(NOM highlights):
- Issue belongs to Project(1:1 optional)+ Cycle(1:1 optional)+ Assignee(1:1)
- Issue has many Comments / many Labels
- Cycle belongs to Team / has many Issues
- Project has many Issues / has Lead(= User)

**CTAs per role**(key ones):
- Admin/Lead:create / archive Project;set Cycle;assign Issue
- Member:create Issue;comment;change status;assign self

**UI shape observed**:
- Issue:row in list view / card in board view / detail page / quick-preview peek panel
- Cycle:sidebar entry / breadcrumb / filter chip
- Project:sidebar nav / breadcrumb / filter

**深度觀察**(比視覺更有價值的 pattern):
- Issue 物件在 5 種 UI shape 中 attributes 顯示不同但 identity 一致 — row 只看 title + assignee,card 加 priority + label,detail 全顯示。這種「attribute progressive disclosure by context」是 Linear IA 強項。
```

做完 5+ 家 benchmark 後,可能發現:
- 每家都有 "Issue / Task / Ticket / Work Item" 類的 object → 我們也該命名一個 canonical 名詞(Phase 3 用)
- 關係模型普遍是 `Item → Project → Team` 三層,有例外值得留意

---

## Phase 3.0 — Build our own Object Map(design 前強制步驟)

每個 shortlisted candidate 開始 design 前,先完成 ORCA。不是每個 candidate 都有獨立 object map — 通常**同一 feature 的 3 個 candidate 共享 product-level object definition**,差異只在 UI shape + CTAs 順序。

### Step 1:Objects(從 Phase 0 framing + Phase 1 benchmark 抽)

列出核心名詞。**原則**:
- 2-7 個 objects 最理想(>7 通常是合併機會)
- 命名三重 test(CLAUDE.md):既有設計語言 / 世界級 idiom / 跨元件認知衝突
- 若 benchmark 發現 Linear 叫 "Issue"、Jira 叫 "Ticket"、我們叫什麼?根據自身業務 + 目標 user 慣用語 pick one,整個 skill 延伸統一用此命名

```markdown
## Our Feature Object Map

**Objects**(我們 feature 的核心名詞):
1. Task(對齊 Jira convention,台灣用戶更熟)
2. Sprint(對齊 Agile convention)
3. User
4. Comment
5. Attachment
```

### Step 2:Attributes per object

```markdown
| Object | Core attributes | Metadata | Identifying |
|--------|----------------|----------|-------------|
| Task | title / description / priority / status / assignee | created-at / updated-at | id / title |
| Sprint | name / start-end / goal / velocity | state(active/closed) | id / name |
| User | avatar / name / role / email | joined-at | id / email |
| Comment | body / author / timestamp | edited / reactions | id |
| Attachment | filename / size / type / url | uploaded-by | id |
```

### Step 3:Relationships(NOM)

```markdown
| From → To | Relationship |
|-----------|-------------|
| Task → Sprint | belongs to(optional,unscheduled Task 也 OK) |
| Task → User(assignee) | belongs to(1:1 optional) |
| Task → User(reporter) | belongs to(1:1 required) |
| Task → Comments | has many |
| Task → Attachments | has many |
| Sprint → Tasks | has many |
| Sprint → Team(via Users) | indirect |
| Comment → Task | belongs to(1:1 required) |
| Comment → User(author) | belongs to(1:1 required) |
| Attachment → Task | belongs to(1:1 required) |
```

### Step 4:CTAs per role per object

```markdown
## CTA Inventory

### Role: Admin
- Task: Create / Edit / Delete / Assign / Change status / Move to sprint
- Sprint: Create / Close / Reopen / Edit goal
- User: Invite / Remove / Change role
- Comment: Pin / Delete any
- Attachment: Delete any

### Role: Member(assignee)
- Task: Create / Edit own / Change status / Add comment / Add attachment
- Sprint: View / Join
- User: Edit own profile
- Comment: Edit own / Delete own
- Attachment: Add / Delete own

### Role: Viewer
- Task: View / Add comment
- Sprint: View
- User: View profile
- Comment: Add
```

### Step 5:以 Object Map 推 UI 決策

每個 object 要決定的展示 shape(consume DS 元件):

```markdown
## UI Shape per Object

| Object | List | Card | Detail | Inline |
|--------|------|------|--------|--------|
| Task | MenuItem(sidebar quick) / DataTable row(board) | FileItem-style card 若有 attachment preview / 普通 Card | Page 全螢幕 + Tabs 切換 | Tag(labels)/ Chip(status) |
| Sprint | MenuItem | Summary Card | Dialog + Tabs | Badge(active dot) |
| User | Avatar + name(inline)/ MenuItem(picker) | NameCard(hover) | Profile Page | Avatar(chip) |
| Comment | Message item(chat style) | — | — | Thread inline |
| Attachment | FileItem compact | FileItem rich | — | Link(inline mention) |
```

此表直接對齊 DS 既有元件(MenuItem / DataTable / Card / Avatar / NameCard / FileItem / Tag / Chip 等)。若某 cell 找不到對應 DS 元件 → Phase 3 可能需要新 primitive(走 Checkpoint 3)。

---

## Object Map 跨 candidate 一致性

**關鍵 insight**:Phase 3 每 candidate 共享同一 Object Map。候選差別在:
- Attributes progressive disclosure 策略不同(Linear:list 只秀 3 attr / Jira:list 秀 8 attr)
- CTAs 順序 / 預設值不同(Notion:Edit 藏 hover 選單 / Jira:直接可見)
- Relationship 展示方式不同(Linear:inline chip / Jira:separate section)

但 **object 本身的定義**(什麼是 Task / 什麼是 Sprint / 怎麼關聯)必須 identical。否則 stakeholder Phase 4 比稿變成「比物件定義」,失焦。

---

## 何時 OOUX 不適用 / 過度

- 極小 feature(單一 button 加到既有 page,無新 object)→ 跳過 ORCA,直接 Phase 3
- 純視覺 refresh(無 data model 改動)→ 跳過
- 1-object features(e.g., 設定單一開關)→ ORCA 退化為「這 object 有哪些 attributes」

判斷法:若 Phase 0 framing 涉及 2+ 名詞互動 → OOUX 有用;若只涉及 1 動作 1 物件 → 跳過。

---

## References

- Sophia V. Prater, "OOUX: A Foundation for Interaction Design" — Rewired UX blog
- [ooux.com/tools](https://www.ooux.com/tools) — Object Map / NOM / CTA template 原版
- Rewired podcast(搜「OOUX」)
- Dan Klyn "Information Architecture Institute" 相關 IA 理論
- Alan Cooper "About Face" — 互動設計經典,object-centric 思維源頭之一
