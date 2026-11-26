# Co-Edit Workflow

Team 內多人 PR-based 共編,規範 + tooling。

## Branch + PR flow

```
# 1. Pull latest main
git checkout main && git pull

# 2. Branch
git checkout -b feat/<your-feature-name>

# 3. Edit + commit + push
git add . && git commit -m "feat(<scope>): <description>"
git push -u origin feat/<your-feature-name>

# 4. Open PR via GitHub UI(或 gh CLI:gh-pr-create)
```

## CI 自動跑(每 PR / push)

- `audit.yml`:單次 locked install + tsc + lint:imports + build all apps，發布唯一 required context `Verify consumer`
- Exact template 更新由上游 release mirror 建立一般 protected-main PR；template 不保留第二條 release-dispatch/updater workflow
- Storybook deploy 走 `netlify.toml` Git integration auto-build,不需 workflow file

## Code review(CODEOWNERS)

`.github/CODEOWNERS`:
```
* @ajenchen   # ← fork user 第 1 件事:改成自己 GitHub username(或 team handle)
```

**Fork user 必跑**:
```bash
sed -i '' 's/@ajenchen/@<your-github-username>/g' .github/CODEOWNERS
```

加 team member 後改 per-app owner:
```
/apps/order-dashboard/ @wendy @teammate2
```

### 改到別人負責的 app:提醒與通知,不強制核准

- **不強制**:合併只看 `Verify consumer` 綠燈與 PR 對話串都已解決;不設「必須那個 app 的負責人核准才能合併」的規則(ruleset 核准數 0、不要求 Code Owner 核准)。
- **通知管道 = CODEOWNERS**:PR 改到 `apps/<別人的 app>/` 時,GitHub 依上面的 per-app owner 自動把負責人加進審查者並通知他。
- **提醒改的人**:開 PR 時 GitHub 會自動帶入 `.github/pull_request_template.md`,照它寫明動了哪個 app、為什麼,讓負責人收到通知時看得懂。
- 依據:user 2026-11-26 第五輪決策卡 B5 留言(逐字):「先建議和提醒想要更改的人就好，給想要更改的人有通知的管道，不要強制限制」

## 多人協作的私有 repo:協作者的預覽建置

產品 repo 是**私有**、又有 Netlify 團隊以外的人推 branch / 開 PR 時,先讀這段。要用哪一種放行做法、付不付費,是 **Netlify 帳號擁有者(Team Owner)的決定**;這段只列限制、做法與各自的費用和風險,不替你選。以下事實 2026-11-26 對照 Netlify 官方文件(每條附來源),方案與價格以官方頁面為準。

**限制**:Netlify 的 Deploy Request Policy 只自動建置「認得的作者」推到私有 repo 的變更 —— Owner、Developer、Git Contributor,以及 GitHub Marketplace 的 bot;production、branch deploy、Deploy Preview 三種都適用,build hook 觸發的不受影響。其他人(GitHub 上能推 repo、但不是 Netlify 團隊成員的協作者,也包含 CMS 這類 Git 服務)觸發的建置,在該站 **Deploys** 頁顯示 **Pending approval**、deploy log 寫 **Deploy request is pending review**,要 Team Owner 核准才會開始建置;Netlify 把這類建置當成 untrusted。來源:<https://docs.netlify.com/deploy/deploy-overview/#deploy-permissions>

**先看方案**:點數計費(credit-based)方案的對照表裡,「Git Contributors can commit to project through private repositories」與「Organization-owned private repos」兩列,Free 與 Personal 都是 N/A,Pro 是 ✓(Git Contributor 為 Unlimited, included in plan)。官方定價頁 2026-11-26 寫的是 Pro $20/month、unlimited members。仍在舊制 Legacy Pro 的團隊,成員費是「$19 /month per member, including active Git Contributors」,且只對當期有觸發建置的 Git Contributor 計費(Enterprise 方案也對 Git Contributor 計費,舊制定價表的成員費寫 Custom)。來源:<https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/>、<https://www.netlify.com/pricing/>、<https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/legacy-pricing-plans/>、<https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/billing-faq-for-legacy-plans/#git-contributors-and-billing>

**兩種放行做法**(來源:<https://docs.netlify.com/deploy/deploy-overview/#deploy-permissions>、<https://docs.netlify.com/manage/accounts-and-billing/team-management/roles-and-permissions/#git-contributor>)

| | A. 每人核准一次(設定值 Require approval) | B. 團隊自動核准(設定值 Auto-approve) |
|---|---|---|
| 怎麼運作 | 新協作者觸發的建置停在 Pending approval;Team Owner 核准並把他加為 Git Contributor 後,他之後推的變更都自動建置 | 非團隊成員觸發的建置直接跑、不再出現核准請求,並自動把那個人加為 Git Contributor |
| 在哪裡設定 | 該站 **Deploys** 頁找到那筆 pending deploy → **Start approval process** → **Further action required** 下拉選 **Approve and add as Git Contributor**(他其實已是團隊成員、只是 Git 帳號沒連上時,改選 **Approve and match with existing team member**);不放行就在站台 overview 頁那筆 pending deploy 旁選 **Reject** | **Team settings > Access & security > Visitor access > Auto-approve deploys from non-team members** → **Edit settings** → **Auto-approve** → **Save**;同一處改選 **Require approval** 即回到 A |
| 費用 | Credit Pro:Git Contributor 不另收費。Legacy Pro:被核准、當期有觸發建置的每一位按上面的成員費計;沒核准的人不計費 | Credit Pro:自動加入的 Git Contributor 不收費。Legacy Pro / Enterprise:自動加入的 Git Contributor 會計費 |
| 風險 | 每多一位協作者,Team Owner 要核准一次;核准前他的預覽不會建置 | 任何能推到 repo 的人或服務觸發的建置都直接跑,不經 Team Owner 看過 |

**兩種做法共同的風險:被放行的建置讀得到環境變數**

- Netlify 對 untrusted 建置的原文:「These builds run code you haven't reviewed yet. They can access your environment variables and cause unexpected resource and compute consumption on your team's account.」來源:<https://docs.netlify.com/deploy/deploy-overview/#untrusted-deploys-policy>
- 環境變數預設「available to all scopes and have the same value for all deploy contexts」,其中 Functions scope 含 Edge Functions。來源:<https://docs.netlify.com/build/environment-variables/overview/>
- 【AI 推導,由上兩句推得,官方沒有針對「私有 repo 核准後」逐字這樣寫】所以範本密碼保護用的 `STORYBOOK_BASIC_AUTH` 在被放行的 Deploy Preview / branch deploy 裡讀得到,而協作者 PR 裡的程式碼(包括 `netlify/edge-functions/basic-auth.ts` 本身)就在那次建置與那個預覽站上執行。
- 能縮小範圍的設定:環境變數的 **Scopes**(只給 Builds / Functions / Runtime / Post processing 其中幾種)官方標明「available on Pro and Enterprise plans」;每個 deploy context(Production / Deploy Previews / Branch deploys …)設不同值,同一頁沒有標方案限制。來源:<https://docs.netlify.com/build/environment-variables/overview/>
- 【AI 推導】`STORYBOOK_BASIC_AUTH` 是給 edge function 讀的,必須留在 Functions scope,而 edge function 的程式碼就在協作者能改的 repo 裡,所以 scope 擋不住改了 edge function 的 PR;預覽(Deploy Previews / Branch deploys)與 Production 設不同的帳密,預覽那一組外流時 Production 不受影響。

**帳號擁有者要先決定的三件事**:(1) 方案 —— 點數計費的 Free / Personal 在私有 repo 沒有 Git Contributor,要 Pro;Legacy Pro 按人計費。(2) 放行做法 —— A 每人核准一次,或 B 團隊自動核准。(3) 【AI 推導】預覽與 Production 的 `STORYBOOK_BASIC_AUTH` 要不要分開設值。決定後的帳號設定寫進產品 repo 自己的維運文件,指回這段,不在多處重寫。`npm run setup:netlify` 的輸出也會提示這一步並指到這裡。

## Conflict resolution

```
# 同步 main(上 PR 前必跑)
git checkout main && git pull
git checkout feat/<your-branch>
git rebase main  # 或 git merge main

# 解 conflict(編輯 file → git add → git rebase --continue)
git push --force-with-lease
```

## 禁忌

- **禁** 改 `node_modules/@qijenchen/design-system/`(直接改 node_modules 是 antipattern)
- **禁** import DS internal paths(`/src/...` / `/dist/...`)— hook 攔
- **禁** force-push/direct-push main(branch ruleset 必須攔)

## Next

→ `docs/04-ds-upgrade.md` DS 升級 + codemod
