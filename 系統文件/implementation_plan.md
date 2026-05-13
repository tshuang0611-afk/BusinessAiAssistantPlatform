# CAXN 平台專案重構與 AI 整合計畫

本計畫旨在實作先前提出的三項建議：清理專案環境與版本控制、修復 API 不一致問題，並將 Gemini AI 的影像審核與評分邏輯重新整合至主程式。

## User Review Required

> [!IMPORTANT]
> 此計畫將會刪除 `app/` 目錄下的大量備份檔案（約 80 幾個 `main2026...py` 等檔案）。這些操作不可逆，但能讓專案恢復整潔，後續將以 Git 進行版本控制。若您有特定想保留的舊程式碼，請在核准前告知。
> 同時，`docker-compose.yml` 中的硬編碼 API Key 會被移除並轉移至 `.env` 中。

## Proposed Changes

---

### 環境清理與版本控制 (Environment & Git)

#### [NEW] [`.env`](file:///d:/CAXN_Project/.env)
- 建立環境變數檔，存放資料庫連線資訊與 `GEMINI_API_KEY`。

#### [NEW] [`.gitignore`](file:///d:/CAXN_Project/.gitignore)
- 加入 Python, Docker, 作業系統相關的暫存檔忽略規則，並確保 `.env` 不被加入 Git。

#### [MODIFY] [`docker-compose.yml`](file:///d:/CAXN_Project/docker-compose.yml)
- 移除 `environment` 區塊中寫死的變數，改用 `env_file: - .env`。

#### [DELETE] 大量備份檔與備忘錄
- 刪除 `app/` 目錄下的 `main2026*.py`, `main(*).py`, `batch_processor2*.py`, `requirements2026*.txt` 等備份檔。
- 刪除根目錄的 `上傳記得取消API_KEY.txt`。

---

### API 修復與 AI 審核整合 (API & AI Verification)

#### [MODIFY] [`app/main.py`](file:///d:/CAXN_Project/app/main.py)
- **API 端點重構 (`/process-asset`)**：
  - 修改為接收 `AssetLogRequest`（包含 `image_path`, `original_filename`）。
  - 在接收到請求後，產生一個新的 `asset_id`。
- **Gemini AI 整合**：
  - 讀取 `image_path` 指定的圖檔。
  - 使用 `google-genai` 呼叫 Gemini API (模型: `gemini-3.1-flash-lite`) 對圖片進行分析，取得 `is_passed` (布林值)、`ai_score` (1-100) 與 `reason` (審核意見)。
- **資料庫整合**：
  - 將原始檔案資訊與 AI 評分結果寫入 `assets` 與 `assets_log` 資料表。
  - 若 `is_passed` 為 true，則執行現有的分潤邏輯，獎勵上傳該資產的企業。

#### [MODIFY] [`app/batch_processor.py`](file:///d:/CAXN_Project/app/batch_processor.py)
- 確保 payload 格式與新版 `main.py` 的 `/process-asset` 完全吻合。
- 增強錯誤處理與日誌輸出，讓批次執行時更清楚知道每一筆的 AI 審核結果。

## Verification Plan

### Automated Tests / Scripts
- 執行 `python app/batch_processor.py` 處理幾張測試圖片。
- 觀察 Console 輸出，確認 Gemini API 是否有成功回傳評分與審核結果。
- 檢查 PostgreSQL 資料庫中的 `assets_log` 是否有寫入正確的 `ai_score` 與 `ai_metadata`。

### Manual Verification
- 重新啟動 Docker 容器 `docker-compose down && docker-compose up -d --build` 確認服務能正常啟動。
- 開啟 `/admin` 後台介面，確認最新經過 AI 審核的資產是否正確顯示 AI 分數。
