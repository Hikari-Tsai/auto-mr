# auto-mr

每兩小時檢查多個 GitHub repository，當來源 branch 領先目標 branch 時建立 PR，並在目標 repository 的 CI、review、deployment 與 branch protection 全部允許後合併。

## 行為

- 預設建立 `staging` → `main` PR。
- 同一組 branch 已有 open PR 時會沿用，不重複建立。
- CI 或人工 review 尚未完成時保持等待，不視為錯誤。
- 不修改或繞過 branch protection、rulesets 與 CI。
- 單一專案失敗不會阻擋其他專案；整輪結束後 Actions job 會標示失敗。
- 每次執行結果會寫入 GitHub Actions job summary。

## 1. 建立 Fine-grained PAT

開啟 [GitHub Fine-grained token 建立頁](https://github.com/settings/personal-access-tokens/new?name=auto-mr&description=Promote%20staging%20branches%20through%20pull%20requests&expires_in=90&contents=read&pull_requests=write)，然後設定：

1. `Resource owner`：選擇你的個人帳號。
2. `Repository access`：選 `Only select repositories`。
3. 選取所有需要由 auto-mr 管理的 repositories。
4. `Repository permissions`：
   - `Contents: Read-only`
   - `Pull requests: Read and write`
   - `Metadata: Read-only`（GitHub 自動提供）
5. 選擇到期日並建立 token。

Token 只顯示一次。不要貼到 issue、commit、設定檔或聊天訊息。

## 2. 儲存 Actions Secret

在這個 auto-mr repository 開啟：

`Settings → Secrets and variables → Actions → New repository secret`

- Name：`AUTO_MR_TOKEN`
- Secret：上一步產生的 token

程式只從環境變數讀取 token，不會將它寫入 summary。

## 3. 設定專案

編輯 `config/projects.yml`：

```yaml
defaults:
  source_branch: staging
  target_branch: main
  merge_method: squash

projects:
  - repository: your-account/service-a

  - repository: your-account/service-b
    source_branch: pre-production
    merge_method: merge

  - repository: your-account/temporarily-disabled
    enabled: false
```

支援欄位：

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `repository` | 是 | `owner/name` 格式 |
| `source_branch` | 否 | 預設 `staging` |
| `target_branch` | 否 | 預設 `main` |
| `merge_method` | 否 | `merge`、`squash` 或 `rebase` |
| `enabled` | 否 | 預設 `true` |

PAT 與 `projects.yml` 必須同時加入新的 repository，否則 GitHub API 會拒絕存取。

## 4. 啟用原生 Auto-merge

在每個目標 repository 開啟：

`Settings → General → Pull Requests → Allow auto-merge`

開啟後，PR 會在人工批准或 CI 通過時立即合併。若未開啟，auto-mr 仍會保留 PR，並在下一次兩小時排程重試，因此最多延遲約兩小時。

目標 repository 必須允許 `projects.yml` 指定的 merge method，否則該專案會回報失敗。

## 5. 手動驗證

1. 將本 repository 推送到 GitHub，確保 default branch 包含 workflow。
2. 開啟 `Actions → Promote staging branches`。
3. 點 `Run workflow`。
4. 查看執行頁面的 summary。

排程為 `17 */2 * * *`，即 UTC 每個偶數小時的第 17 分鐘執行。GitHub 排程可能有短暫延遲。

## 本機開發

```bash
npm ci --ignore-scripts --no-audit
npm test
npm run typecheck
npm run build
```

只有在要對真實 repositories 執行時才設定：

```bash
AUTO_MR_TOKEN=... npm start
```

不要將 token 寫入 `.env` 後提交；`.env`、`*.pem`、`node_modules` 與 `dist` 已被 `.gitignore` 排除。

## Token 輪替

1. 建立具備相同 repository selection 與權限的新 token。
2. 更新 `AUTO_MR_TOKEN` secret。
3. 手動執行 workflow 驗證。
4. 驗證成功後撤銷舊 token。

Fine-grained PAT 綁定個人帳號。未來需要跨 Organization 時，可將 `src/github.ts` 的認證來源改成 GitHub App installation token，而不需要更改專案設定與 promotion 流程。
