# CAXN Platform

**企業 AI 資源共享與福利管理平台**

---

## 功能總覽

| 功能模組 | 說明 |
|---|---|
| 🏠 資產大廳 | 瀏覽/購買 AI 素材、形象影片、電子賀卡、線上課程 |
| ✨ AI 創作坊 | 選用素材 + 描述規範，由 Gemini AI 生成創意文案腳本 |
| ⬆️ 資產上架 | 三軌上架：素材 / AI 創意成品 / 企業福利品 |
| 💰 點數系統 | 企業儲值→分配給員工，員工亦可自行購買個人點數 |
| 🎁 福利品大廳 | 員工用個人點數兌換，支援物流配送/自取/純兌換碼 |
| 📦 訂單管理 | 企業管理員追蹤訂單、填快遞單號、標記出貨（SSE 即時通知） |
| 📊 數據報表 | Recharts 圖表：點數趨勢、資產分佈、企業排行 |
| 🔔 即時通知 | SSE 推播：點數入帳/資產審核/訂單狀態 |
| 🔌 夥伴 Webhook | API Key 管理，外部系統可驗證兌換碼 |
| 👤 個人中心 | 個人資料、密碼修改、已購授權、兌換記錄、收藏 |
| 🔒 安全機制 | Refresh Token 自動輪換、Audit Log 操作稽核 |

---

## 快速啟動（本地開發）

### 環境需求
- Docker Desktop (Windows/Mac)
- Node.js 20+（僅前端本機開發時）

### 步驟

```bash
# 1. Clone 專案
git clone https://github.com/your-repo/CAXN_Project.git
cd CAXN_Project

# 2. 複製並設定環境變數
cp .env.example .env
# 編輯 .env，填入 GEMINI_API_KEY 等設定

# 3. 啟動所有服務
docker-compose up --build -d

# 4. 查看狀態
docker-compose ps
```

### 服務端點
| 服務 | 本地端點 |
|---|---|
| 🌐 前端 | http://localhost:3000 |
| 🔧 後端 API | http://localhost:8000 |
| 🔀 Nginx (生產) | http://localhost:80 |
| 📖 API 文件 | http://localhost:8000/docs |

### 預設測試帳號
| 角色 | 帳號 | 密碼 |
|---|---|---|
| 平台管理員 | `admin` | `password123` |
| 企業功能性使用者 | `ent_admin` | `password123` |
| 企業一般使用者 | `ent_user` | `password123` |

---

## 雲端部署指南

### 選項 A：Google Cloud Run（推薦，費用最低）

```bash
# 1. 建置映像
docker build -t gcr.io/YOUR_PROJECT/caxn-app ./app
docker build -t gcr.io/YOUR_PROJECT/caxn-frontend ./frontend

# 2. 推送至 GCR
docker push gcr.io/YOUR_PROJECT/caxn-app
docker push gcr.io/YOUR_PROJECT/caxn-frontend

# 3. 部署（CloudSQL 連接）
gcloud run deploy caxn-app \
  --image gcr.io/YOUR_PROJECT/caxn-app \
  --platform managed \
  --region asia-east1 \
  --set-env-vars DB_HOST=...,GEMINI_API_KEY=...
```

### 選項 B：VM（GCP / AWS / DigitalOcean）

```bash
# 在 VM 上執行
git clone ...
cp .env.example .env && vim .env

# 設定防火牆開放 80、443 port
docker-compose -f docker-compose.yml up -d
```

### HTTPS 設定（使用 Certbot）

```bash
# 安裝 certbot
apt install certbot python3-certbot-nginx

# 申請憑證（替換 your-domain.com）
certbot --nginx -d your-domain.com

# 自動續期
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
```

---

## 資料庫備份

```bash
# 手動備份
chmod +x scripts/backup.sh
./scripts/backup.sh

# 自動每日凌晨 2 點備份（加入 crontab）
0 2 * * * /path/to/CAXN_Project/scripts/backup.sh >> /var/log/caxn_backup.log 2>&1
```

---

## 主要技術棧

| 層 | 技術 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Recharts + Lucide |
| 後端 | FastAPI (Python 3.11) + psycopg2 |
| 資料庫 | PostgreSQL 15 |
| AI | Google Gemini API |
| 容器 | Docker + Docker Compose |
| 反向代理 | Nginx Alpine |
| 認證 | JWT (Access Token 2h) + Refresh Token (7d) |

---

## 環境變數說明

請參考 [.env.example](.env.example) 取得完整清單。

| 變數 | 說明 | 必填 |
|---|---|---|
| `DB_HOST` | PostgreSQL 主機 | ✅ |
| `JWT_SECRET` | JWT 簽名金鑰（請設長亂數字串） | ✅ |
| `GEMINI_API_KEY` | Google Gemini API Key | ✅ |
| `VITE_API_BASE` | 前端呼叫後端的 URL | ✅ |

---

## 開發歷程

| 階段 | 主要功能 |
|---|---|
| Phase 1–5 | 核心架構、認證、資產管理、點數錢包 |
| Phase 6 | 審核流程、AI 創作工具 |
| Phase 7 | 三軌上架（素材/創意/福利品）、串流播放 |
| Phase 8 | Recharts 報表、SSE 通知、物流訂單、Webhook |
| Phase 9 | 個人中心、Refresh Token、Nginx、批量操作、Audit Log |
