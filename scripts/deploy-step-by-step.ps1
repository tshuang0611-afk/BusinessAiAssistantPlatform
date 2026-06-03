# ============================================================
# CAXN Platform - 逐步部署指南（手動執行版）
# 如果完整腳本有問題，請依序執行以下各區塊
# ============================================================

# === 變數設定（請先執行此區塊）===
$PROJECT_ID  = "gen-lang-client-0780315685"
$REGION      = "asia-east1"
$REPO        = "caxn-repo"
$DB_INSTANCE = "caxn-db-prod"
$DB_NAME     = "caxn_platform"
$DB_USER     = "caxn_admin"
$DB_PASS     = "CaxnDb@2026Secure"
$SQL_CONN    = "${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
$APP_IMAGE   = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/caxn-app:latest"
$WEB_IMAGE   = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/caxn-frontend:latest"

# === BLOCK 1：初始化 gcloud ===
gcloud auth login
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# === BLOCK 2：啟用 GCP API ===
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com

# === BLOCK 3：建立 Artifact Registry ===
gcloud artifacts repositories create $REPO `
    --repository-format=docker `
    --location=$REGION `
    --description="CAXN Docker Images"

# 設定 Docker 認證
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

# === BLOCK 4：建立 Cloud SQL（約需 5-10 分鐘）===
gcloud sql instances create $DB_INSTANCE `
    --database-version=POSTGRES_15 `
    --tier=db-f1-micro `
    --region=$REGION `
    --storage-size=10GB `
    --storage-type=SSD `
    --no-backup

# 建立資料庫與使用者
gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE
gcloud sql users create $DB_USER --instance=$DB_INSTANCE --password=$DB_PASS

# === BLOCK 5：建立 Secrets ===
# Gemini API Key
$GEMINI_KEY = "AIzaSyBrs9anwMq7EsPdkC7YKIDkbQAIMoKecok"
$GEMINI_KEY | gcloud secrets create gemini-api-key --data-file=-

# GCS 金鑰
gcloud secrets create gcp-key-json --data-file="gcp-key.json"

# 授予 Cloud Run 讀取 Secret 的權限
$PROJECT_NUM = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$SA = "${PROJECT_NUM}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding gemini-api-key --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding gcp-key-json   --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor"

# === BLOCK 6：Build 後端 Image ===
docker build -f app/Dockerfile.cloudrun -t $APP_IMAGE ./app
docker push $APP_IMAGE

# === BLOCK 7：部署後端到 Cloud Run ===
gcloud run deploy caxn-app `
    --image=$APP_IMAGE `
    --region=$REGION `
    --platform=managed `
    --allow-unauthenticated `
    --memory=512Mi `
    --cpu=1 `
    --min-instances=0 `
    --max-instances=5 `
    --timeout=300 `
    --add-cloudsql-instances=$SQL_CONN `
    --set-env-vars="DB_HOST=/cloudsql/${SQL_CONN},DB_NAME=${DB_NAME},DB_USER=${DB_USER},DB_PASS=${DB_PASS},DB_PORT=5432" `
    --set-env-vars="STORAGE_PROVIDER=gcs,GCS_BUCKET=caxn-uploads-0780315685,GCS_PROJECT=${PROJECT_ID},GCS_KEY_PATH=/secrets/gcp-key" `
    --set-env-vars="JWT_SECRET=caxn_prod_jwt_2026_change_me,JWT_EXPIRE_HOURS=2" `
    --set-env-vars="ECPAY_MERCHANT_ID=2000132,ECPAY_HASH_KEY=5294y06JbISpM5x9,ECPAY_HASH_IV=v77hoKGq4kWxNNIS" `
    --set-env-vars="ECPAY_API_URL=https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5" `
    --set-env-vars="POINT_RATE=1.0,WITHDRAW_MIN_POINTS=5000" `
    --set-secrets="GEMINI_API_KEY=gemini-api-key:latest,/secrets/gcp-key=gcp-key-json:latest"

# 取得後端 URL
$BACKEND_URL = gcloud run services describe caxn-app --region=$REGION --format="value(status.url)"
Write-Host "後端 URL: $BACKEND_URL"

# === BLOCK 8：Build 前端 Image（帶入 API URL）===
docker build `
    -f frontend/Dockerfile.cloudrun `
    --build-arg VITE_API_BASE=$BACKEND_URL `
    -t $WEB_IMAGE ./frontend
docker push $WEB_IMAGE

# === BLOCK 9：部署前端到 Cloud Run ===
gcloud run deploy caxn-frontend `
    --image=$WEB_IMAGE `
    --region=$REGION `
    --platform=managed `
    --allow-unauthenticated `
    --memory=256Mi `
    --cpu=1 `
    --min-instances=0 `
    --max-instances=3

# 取得前端 URL
$FRONTEND_URL = gcloud run services describe caxn-frontend --region=$REGION --format="value(status.url)"

# === BLOCK 10：更新 ECPay 回調 URL ===
gcloud run services update caxn-app `
    --region=$REGION `
    --set-env-vars="ECPAY_RETURN_URL=${BACKEND_URL}/api/payment/ecpay/callback,ECPAY_CLIENT_BACK=${FRONTEND_URL},SITE_URL=${FRONTEND_URL}"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "部署完成！" -ForegroundColor Green
Write-Host "前端: $FRONTEND_URL" -ForegroundColor Cyan
Write-Host "後端: $BACKEND_URL" -ForegroundColor Cyan
Write-Host "API 文件: ${BACKEND_URL}/docs" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
