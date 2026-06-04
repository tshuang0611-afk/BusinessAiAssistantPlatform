# ============================================================
# CAXN Platform - Cloud Run 完整部署腳本
# 執行前請確認已安裝 Google Cloud SDK (gcloud)
# 下載：https://cloud.google.com/sdk/docs/install
# ============================================================

${PROJECT_ID}  = "gen-lang-client-0780315685"
${REGION}      = "asia-east1"
$REPO        = "caxn-repo"                  # Artifact Registry 儲存庫名稱
${DB_INSTANCE} = "caxn-db-prod"               # Cloud SQL 執行個體名稱
${DB_NAME}     = "caxn_platform"
${DB_USER}     = "caxn_admin"
${DB_PASS}     = "CaxnDb@2026Secure"          # 生產環境密碼（可自行修改）
$APP_IMAGE   = "${REGION}-docker.pkg.dev/${PROJECT_ID}/$REPO/caxn-app:latest"
$WEB_IMAGE   = "${REGION}-docker.pkg.dev/${PROJECT_ID}/$REPO/caxn-frontend:latest"

# 自動偵測並將 gcloud 加進 PATH（解決本機環境變數未設定問題）
if (!(Get-Command gcloud -ErrorAction SilentlyContinue)) {
    $gcloudDefaultPath = "$env:USERPROFILE\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin"
    if (Test-Path "$gcloudDefaultPath\gcloud.cmd") {
        $env:PATH += ";$gcloudDefaultPath"
        Write-Host "已自動將 gcloud 路徑加入 PATH: $gcloudDefaultPath" -ForegroundColor Green
    } else {
        $gcloudProgramFiles = "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin"
        if (Test-Path "$gcloudProgramFiles\gcloud.cmd") {
            $env:PATH += ";$gcloudProgramFiles"
            Write-Host "已自動將 gcloud 路徑加入 PATH: $gcloudProgramFiles" -ForegroundColor Green
        } else {
            Write-Error "找不到 gcloud 指令，請確認已安裝 Google Cloud SDK。"
            exit 1
        }
    }
}


Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  CAXN Platform - Cloud Run 部署流程" -ForegroundColor Cyan
Write-Host "  專案 ID: ${PROJECT_ID}" -ForegroundColor Cyan
Write-Host "  區域:    ${REGION}" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ── STEP 1：設定 gcloud 專案 ──────────────────────────────
Write-Host "`n[Step 1] 設定 GCP 專案..." -ForegroundColor Yellow
gcloud config set project ${PROJECT_ID}
gcloud config set run/region ${REGION}

# ── STEP 2：啟用必要 API ──────────────────────────────────
Write-Host "`n[Step 2] 啟用必要的 GCP API（約需 1-2 分鐘）..." -ForegroundColor Yellow
$apis = @(
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com"
)
foreach ($api in $apis) {
    Write-Host "  啟用 $api ..." -NoNewline
    gcloud services enable $api --quiet
    Write-Host " ✓" -ForegroundColor Green
}

# ── STEP 3：建立 Artifact Registry 儲存庫 ────────────────
Write-Host "`n[Step 3] 建立 Artifact Registry Docker 儲存庫..." -ForegroundColor Yellow
gcloud artifacts repositories create $REPO `
    --repository-format=docker `
    --location=${REGION} `
    --description="CAXN Platform Docker Images" `
    --quiet
Write-Host "  ✓ 儲存庫 $REPO 建立完成" -ForegroundColor Green

# ── STEP 4：設定 Docker 認證 ────────────────────────────
Write-Host "`n[Step 4] 設定 Docker 連接 Artifact Registry..." -ForegroundColor Yellow
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
Write-Host "  ✓ Docker 認證設定完成" -ForegroundColor Green

# ── STEP 5：建立 Cloud SQL PostgreSQL 執行個體 ────────────
Write-Host "`n[Step 5] 建立 Cloud SQL PostgreSQL 15 執行個體..." -ForegroundColor Yellow
Write-Host "  注意：此步驟約需 5-10 分鐘，請耐心等待..." -ForegroundColor Magenta
gcloud sql instances create ${DB_INSTANCE} `
    --database-version=POSTGRES_15 `
    --tier=db-f1-micro `
    --region=${REGION} `
    --storage-size=10GB `
    --storage-type=SSD `
    --no-backup `
    --quiet
Write-Host "  ✓ Cloud SQL 執行個體建立完成" -ForegroundColor Green

# ── STEP 6：建立資料庫與使用者 ────────────────────────────
Write-Host "`n[Step 6] 建立資料庫與使用者帳號..." -ForegroundColor Yellow
gcloud sql databases create ${DB_NAME} --instance=${DB_INSTANCE} --quiet
gcloud sql users create ${DB_USER} --instance=${DB_INSTANCE} --password=${DB_PASS} --quiet
Write-Host "  ✓ 資料庫 '${DB_NAME}' 與使用者 '${DB_USER}' 建立完成" -ForegroundColor Green

# 取得 Cloud SQL Connection Name
${SQL_CONN} = "${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
Write-Host "  Cloud SQL Connection Name: ${SQL_CONN}" -ForegroundColor Cyan

# ── STEP 7：將 GCS 金鑰存入 Secret Manager ───────────────
Write-Host "`n[Step 7] 將 GCP 金鑰存入 Secret Manager（安全管理）..." -ForegroundColor Yellow
gcloud secrets create gcp-key-json `
    --data-file="gcp-key.json" `
    --quiet
Write-Host "  ✓ Secret 'gcp-key-json' 建立完成" -ForegroundColor Green

# ── STEP 8：Build 並 Push 後端 Docker Image ──────────────
Write-Host "`n[Step 8] 建置並推送後端 Docker Image..." -ForegroundColor Yellow
docker build --no-cache -f app/Dockerfile.cloudrun -t $APP_IMAGE ./app
docker push $APP_IMAGE
Write-Host "  ✓ 後端 Image 推送完成：$APP_IMAGE" -ForegroundColor Green

# ── STEP 9：部署後端到 Cloud Run ────────────────────────
Write-Host "`n[Step 9] 部署後端 API 到 Cloud Run..." -ForegroundColor Yellow
gcloud run deploy caxn-app `
    --image=$APP_IMAGE `
    --region=${REGION} `
    --platform=managed `
    --allow-unauthenticated `
    --memory=512Mi `
    --cpu=1 `
    --min-instances=0 `
    --max-instances=3 `
    --add-cloudsql-instances=${SQL_CONN} `
    --set-env-vars="DB_HOST=/cloudsql/${SQL_CONN},DB_NAME=${DB_NAME},DB_USER=${DB_USER},DB_PASS=${DB_PASS},DB_PORT=5432" `
    --set-env-vars="STORAGE_PROVIDER=gcs,GCS_BUCKET=caxn-uploads-0780315685,GCS_PROJECT=${PROJECT_ID}" `
    --set-env-vars="JWT_SECRET=caxn_prod_jwt_secret_2026,JWT_EXPIRE_HOURS=2" `
    --set-env-vars="ECPAY_MERCHANT_ID=2000132,ECPAY_HASH_KEY=5294y06JbISpM5x9,ECPAY_HASH_IV=v77hoKGq4kWxNNIS" `
    --set-env-vars="ECPAY_API_URL=https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5" `
    --set-env-vars="POINT_RATE=1.0,WITHDRAW_MIN_POINTS=5000" `
    --set-secrets="GEMINI_API_KEY=gemini-api-key:latest,GCS_KEY_PATH=gcp-key-json:latest" `
    --quiet
Write-Host "  ✓ 後端部署完成" -ForegroundColor Green

# 取得後端 URL
${BACKEND_URL} = gcloud run services describe caxn-app --region=${REGION} --format="value(status.url)"
Write-Host "  後端 URL: ${BACKEND_URL}" -ForegroundColor Cyan

# ── STEP 10：Build 並 Push 前端 Docker Image ──────────────
Write-Host "`n[Step 10] 建置並推送前端 Docker Image..." -ForegroundColor Yellow
docker build --no-cache `
    -f frontend/Dockerfile.cloudrun `
    --build-arg VITE_API_BASE="${BACKEND_URL}" `
    -t $WEB_IMAGE ./frontend
docker push $WEB_IMAGE
Write-Host "  ✓ 前端 Image 推送完成：$WEB_IMAGE" -ForegroundColor Green

# ── STEP 11：部署前端到 Cloud Run ────────────────────────
Write-Host "`n[Step 11] 部署前端到 Cloud Run..." -ForegroundColor Yellow
gcloud run deploy caxn-frontend `
    --image=$WEB_IMAGE `
    --region=${REGION} `
    --platform=managed `
    --allow-unauthenticated `
    --memory=256Mi `
    --cpu=1 `
    --min-instances=0 `
    --max-instances=2 `
    --set-env-vars="VITE_API_BASE=${BACKEND_URL}" `
    --quiet
Write-Host "  ✓ 前端部署完成" -ForegroundColor Green

# 取得前端 URL
${FRONTEND_URL} = gcloud run services describe caxn-frontend --region=${REGION} --format="value(status.url)"

# ── STEP 12：更新後端的 ECPay Callback URL ───────────────
Write-Host "`n[Step 12] 更新後端的 ECPay Callback 與前端跳轉網址..." -ForegroundColor Yellow
gcloud run services update caxn-app `
    --region=${REGION} `
    --update-env-vars="ECPAY_RETURN_URL=${BACKEND_URL}/api/payment/ecpay/callback,ECPAY_CLIENT_BACK=${FRONTEND_URL}" `
    --quiet
Write-Host "  ✓ ECPay 網址更新完成" -ForegroundColor Green


# ── 完成摘要 ──────────────────────────────────────────────
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  🎉 CAXN Platform 部署完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  前端網址:  ${FRONTEND_URL}" -ForegroundColor Cyan
Write-Host "  後端 API:  ${BACKEND_URL}" -ForegroundColor Cyan
Write-Host "  API 文件:  ${BACKEND_URL}/docs" -ForegroundColor Cyan
Write-Host "  Cloud SQL: ${SQL_CONN}" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Green
Write-Host "`n  ⚠️  部署後記得：" -ForegroundColor Yellow
Write-Host "  1. 更新 ECPay ReturnURL 為：${BACKEND_URL}/api/payment/ecpay/callback" -ForegroundColor Yellow
Write-Host "  2. 更新 ECPay ClientBackURL 為：${FRONTEND_URL}" -ForegroundColor Yellow
Write-Host "  3. 在 GCP Console 驗證 Cloud SQL 資料庫連線正常" -ForegroundColor Yellow
