# 0.1.6 變更後 Code Review 與安全掃描

日期：2026-11-17（Asia/Taipei）。本輪審查的是新增狀態列選項及 Codex 舊紀錄顯示，不沿用 0.1.5 的安全結論替代新改動審查。

## 範圍與方式

- 比較起點：`92977d5`（0.1.5 交付）。
- 審查版本：`6acff7cdb11a228996043db8b8d9fa3affc1fcc0`。
- 差異：`git diff 92977d5...6acff7c`，包含 `c49d393` 功能與 `6acff7c` 文件。
- Standards、Spec 各由獨立審查者檢視；另一位審查者針對設定橋接、資料投影、DOM／Markdown 和警告狀態作安全檢查。
- 安全檢查採針對變更的 guidance／focused review，並非再做一次整個 repo 的完整稽核。來源、測試與封裝檢視均未查詢登入中的供應商或讀取登入資料。

## Standards

**0 項可處理發現，無最高優先級問題。**

五個 manifest 選項與狀態列預設一致，Gemini 兩個時間窗及 Argon 預設開啟。摘要使用新 group／row 陣列，未修改完整 view；hover 仍接收完整資料。設定讀取與寫入維持 manifest 已知鍵、boolean／enum 驗證。新的舊紀錄狀態保留來源時間、用量與 reset pending。未發現需修正的文件規範違反或具實質影響的維護退化。

## Spec

**0 項可處理發現，無最高優先級問題。**

已逐項核對 Gemini 5-hour／Weekly 加獨立 Argon Weekly 預設、可選 Claude/GPT 時間窗、只篩選狀態列、全取消時省略 Antigravity、未選額度不影響摘要警告，以及空間有限但不虛構固定字數上限的提示。Codex 年齡／reset 到期採 Last recorded 中性呈現，讀取錯誤仍警告，原用量及時間不被改寫。沒有改動來源查詢、憑證、帳號切換或雲端行為。

## 針對性安全檢查

**未確認新的安全漏洞。** 主要核對下列邊界：

- Webview 原生訊息仍有操作 allowlist；設定更新需通過已知鍵與正確型別驗證，讀取亦驗證型別。五個新選項不能選擇任意命令、檔案或憑證。
- DOM 仍以 `textContent` 建立動態顯示；hover 動態字串經 Markdown escape，只信任固定 dashboard focus 命令。CSP 與 media resource roots 未放寬。
- 篩選只建立顯示用副本。`staleReason` 以錯誤優先，`recordedOnly` 只適用有時間戳與已知值的年齡／reset 到期情況；來源讀取失敗不會被當作正常閒置。
- 依賴 lock 的差異只有根專案版本，139 個依賴的版本圖未改變。仍另以 [OSV 批次查詢](https://google.github.io/osv.dev/post-v1-querybatch/) 重查，2026-11-17 結果為 **139 個版本、0 筆公告命中**，只傳送公開名稱及版本。
- 本地所有可達 Git refs 的 **309 個 blob** 經 private key、Anthropic／OpenAI project key、GitHub token、AWS access-key 特徵掃描，**0 命中**；每物件上限 2 MiB，無超限略過，沒有輸出疑似秘密值。

以上是有範圍的來源與資料庫檢查，不代表不存在任何漏洞，也不涵蓋任意格式秘密或遠端不可達歷史。

## 測試與封裝核對

本輪沒有修改 runtime，因此不重跑已通過的同一組測試；已核對 0.1.6 的 **67／67** 測試、語法及人工 dashboard 驗證紀錄。瀏覽器紀錄包含五個選項、預設 Argon、280／360／900px、Pro／Max fixture、折疊／鍵盤／Unknown／Context 及 Codex 中性狀態。審查者檢視了來源與測試，沒有將 parent 的執行結果宣稱為自行執行。

重新檢查實際 VSIX：27 檔、69,959 bytes、同一預覽 ID、0 個 npm runtime 依賴。檔案集合完全符合 runtime allowlist；來源、media、授權及說明檔位元組與 repo 一致，相對 `require` 均可解析，沒有封裝 node_modules、測試、報告或憑證目錄。

交付檔案：`artifacts/nexus-ai-usage-0.1.6.vsix`。

SHA-256：`8e7fcd291b336cbc9a664da08219032c90db099887a28b3cba082efe6a273864`。

本輪沒有重建或改動安裝檔內容；本文件與交付清理說明不在 VSIX allowlist 中。

## 交付清理與限制

驗證最新版後，刪除 `artifacts` 的 38 個舊版安裝包、暫存預覽／量測與驗證輸出，合計 1,458,674 bytes；**只保留 0.1.6.vsix 一個檔案**。必要結果與雜湊保存在本文件，歷史版本的審查說明仍留在 docs。開發用 `test:ui` 仍可重新產生人工圖片，但圖片不是本次保留的交付物。

一般 Pro／Max 真實帳號、Windows／macOS 原生環境、OS ACL、已安裝官方 CLI 來源及實際 IDE webview 隔離仍未完成實機驗收。這些限制沒有因本輪來源審查而被宣稱已解決。

雙軸摘要：Standards 0、Spec 0；各軸皆無需修正項目。針對變更安全檢查未確認新的漏洞。
