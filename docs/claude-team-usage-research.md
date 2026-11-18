# Claude Team 成員額度查證

查證日期為 2026 年 11 月 18 日。範圍為已登入成員自己的 5 小時、每週所有模型及每週 Fable 額度。

| 查詢方式 | 一手證據 |
| --- | --- |
| Claude Code 官方 `/usage` | Anthropic 說明 Team 的額度按成員計算，可在 **Settings → Usage** 查看，官方命令文件也明列 Team。真實 Team 用戶回報 Claude Code 2.1.146 的 `/usage` 與同帳戶的 Desktop 用量頁同時顯示工作階段 35%、每週所有模型 12%。[Team 官方說明](https://support.claude.com/en/articles/9266767-what-is-the-team-plan)、[Claude Code 命令表](https://code.claude.com/docs/en/commands)、[Team 用戶回報 #62721](https://github.com/anthropics/claude-code/issues/62721) |
| Nexus 採用的 CLI `get_usage` | Windows 11 上的 Team 用戶回報，Claude Code 2.1.266 透過 stream-JSON `get_usage` 回傳 `rate_limits.model_scoped`，Fable 每週已用 57%，並附重設時間。Anthropic 的 Agent SDK 變更紀錄把對應的查詢方法列為實驗性功能。[Team 用戶回報 #93107](https://github.com/anthropics/claude-code/issues/93107)、[Anthropic Agent SDK 變更紀錄](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md#03169) |
| 同一 `get_usage` 的失敗案例 | T3 Code 用戶以真實 Team 帳戶和 macOS 上的 Claude Code 2.1.288 直接測試，CLI 成功回應 `subscription_type: "team"` 和 `rate_limits_available: true`，`rate_limits` 卻是 `null`。另一位 Team 用戶在 2.1.318 也遇到空回應，同時在正常 Claude Code 工作階段內收到了含 5 小時和每週數值的事件。[T3 Code #15364](https://github.com/pingdotgg/t3code/issues/15364)、[T3 Code #30310](https://github.com/pingdotgg/t3code/issues/30310) |
| 第三方用量工具 | CodexBar 用戶透過網頁工作階段讀到 Team 的工作階段 3%、每週 14%。回報也確認 0.23 將 Team 標成 Max，升到 0.24 後標籤正確。UsageNow 的 README 明確將真實 Team 帳戶比對列為待驗證。[CodexBar #851](https://github.com/steipete/CodexBar/issues/851)、[UsageNow Team 說明](https://github.com/usagenow/usagenow#team-plans) |

查到的公開 Analytics API 涵蓋每日 Claude Code 活動、成本及 Enterprise 組織分析。Claude Code 官方 `statusLine` 文件目前列出的 `rate_limits` 適用範圍為 Pro／Max／Ultra 或設定支出上限的 gateway。另有真實 Team 使用者回報，`statusLine` 曾在同一工作階段交替回傳與省略 5 小時及每週數值。[Anthropic Analytics API](https://platform.claude.com/docs/en/manage-claude/analytics-api)、[Claude Code statusLine](https://code.claude.com/docs/en/statusline#fields-that-may-be-absent)、[Team 用戶回報 #84995](https://github.com/anthropics/claude-code/issues/84995)

## 核對 Nexus 的 CLI 啟動錯誤

Nexus 0.1.12 會先啟動官方 Claude Code IDE 擴充套件內的 CLI，然後在啟動失敗時嘗試同一環境的原生安裝路徑。畫面上的 `Cannot start Claude Code in this extension host` 對應到程序啟動失敗，發生在 CLI 回傳 Team 額度之前。Nexus 使用真實 Team 帳戶的端對端比對仍待完成。[CLI 啟動程式](../src/claudeUsageCli.js)、[Dashboard 資料來源與診斷程式](../src/extension.js)

1. 在出錯的同一個 IDE 視窗開命令選擇區。執行 **Nexus AI Usage: Show Diagnostics**，繁體中文介面為 **Nexus AI Usage: 顯示診斷資訊**。
2. 在 **輸出**面板選擇 **Nexus AI Usage**，記下 `platform`、`remoteName`、`extensionVersion`、`officialClaudeVersion`、`officialCliPresent`、`nativeCliPresent`、`sources.claude.error`。
3. 在同一視窗打開官方 **Claude Code** 面板，確認它能開啟並以 Team 工作區登入。在官方 Claude Code 的對話輸入欄執行 `/usage`，會開啟 **Account & usage**。記下它有沒有顯示 5 小時、每週及 Fable。若無法開啟面板，記下 IDE 顯示的錯誤。[Anthropic Team 登入指引](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)、[官方 VS Code 面板的 `/usage` 操作](https://code.claude.com/docs/en/vs-code#check-account-and-usage)
