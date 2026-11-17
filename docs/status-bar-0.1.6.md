# 0.1.6：可選擇的狀態列摘要

日期：2026-11-17（Asia/Taipei）。依使用者補充，Argon 為重要高階額度，預設保留。

## 預設與設定方式

Antigravity 預設顯示 **Gemini Models 5-hour、Gemini Models Weekly、Gemini 4 Argon Weekly**。Gemini 與 Argon 保持獨立名稱和額度，不會合併。

開啟 dashboard 的 **Settings → Antigravity**，即可獨立勾選以下五項；VS Code 原生設定亦提供同一組選項。

設定名稱共用 `nexusAiUsage.antigravity.statusBar.` 前綴：

| 選項 | 設定名稱 | 預設 |
| --- | --- | --- |
| Gemini Models · 5-hour | `geminiFiveHour` | 開 |
| Gemini Models · Weekly | `geminiWeekly` | 開 |
| Claude/GPT · 5-hour | `claudeGptFiveHour` | 關 |
| Claude/GPT · Weekly | `claudeGptWeekly` | 關 |
| Gemini 4 Argon · Weekly | `argonWeekly` | 開 |

這些選項僅控制狀態列摘要。完整 hover 和 dashboard 保留所有已監控額度，不會因為取消摘要而停止讀取、移除資料，或以其他額度替代。選中的缺失值仍顯示 Unknown；全取消時，狀態列省略 Antigravity。原有各供應商的 In status bar 開關仍可使用。

## 空間與提示

狀態列與其他 IDE 項目共用有限寬度，會受視窗大小、字型／縮放及其他擴充套件影響。此版不宣稱固定字數上限，也不截斷數值以假裝一定放得下。使用者可以自行取捨時間窗與供應商；選得較多時，仍可能超出 IDE 可用空間。

hover 開頭及 Settings 的 Status Bar 區段均提示「空間有限，只顯示所選摘要；完整額度請查看 hover 或面板」。摘要改為列出所選時間窗，不再只替每個 Antigravity 群組挑最高使用率的一項。

## Codex 舊紀錄

本機額度事件因時間經過或重置時間已過，且沒有讀取錯誤時，顯示中性的 **Last recorded**；保留來源事件時間和最後已知百分比。單純舊紀錄不會讓狀態列變黃。完整明細仍標示到期 reset 等待新讀值，不會自行將用量歸零或重置日期向後推進。

真實讀取失敗時，保留最後資料、顯示錯誤並使用警告背景。沒有來源時間的資料不會被描述為已知的歷史事件。其他供應商既有 missing／error／stale 標示保留。資料取得方式、輪詢、官方 CLI 登入處理與快取未更換。

## 驗證與交付

- 語法檢查、**67／67** 項測試通過。涵蓋預設三項含 Argon、五項布林驗證、自訂與全取消、未選額度不影響摘要警告、完整資料不被修改、host 設定套用、Codex 29 分鐘舊事件與 reset 到期／錯誤。
- 使用實際 dashboard HTML／CSS／JS 與人工資料，確認選項預設、checkbox 訊息、空間提示、280／360／900px 設定頁無橫向溢出、Codex 中性標示，並保留既有折疊／鍵盤／Unknown／Pro-Max／Context 檢查。
- 原生 IDE 的實際可用狀態列寬度仍由使用者環境決定；沒有宣稱自動偵測剩餘像素或所有環境均可完整顯示。
- 安裝檔：`artifacts/nexus-ai-usage-0.1.6.vsix`，同一預覽 ID，可覆蓋更新。27 檔、69,959 bytes，SHA-256：`8e7fcd291b336cbc9a664da08219032c90db099887a28b3cba082efe6a273864`。
- 已核對封裝來源、授權／說明位元組、相對 require、預設選項與 runtime allowlist；沒有 npm runtime 依賴或登入資料。
- 人工設定預覽已以 DEMO DATA 完成檢視；依交付清理要求，暫存圖片與舊輸出不再保留於 `artifacts`，可用 `test:ui` 重新產生。
- 功能與測試提交：`c49d393`；文件另作收尾提交。未安裝、未 push。

## 變更後審查

已完成 [0.1.6 Code Review 與針對性安全掃描](review-0.1.6.md)。Standards、Spec 均無需修正項目；安全檢查未確認新的漏洞。`artifacts` 最終僅保留 `nexus-ai-usage-0.1.6.vsix`，必要驗證結果與雜湊留在審查文件。
