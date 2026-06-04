# ============================================================
# CAXN Platform - Cloud Run Deployment Script
# Please ensure Google Cloud SDK (gcloud) is installed before running.
# Download: https://cloud.google.com/sdk/docs/install
# ============================================================

${PROJECT_ID}  = "gen-lang-client-0780315685"
${REGION}      = "asia-east1"
$REPO        = "caxn-repo"                  # Artifact Registry repository name
${DB_INSTANCE} = "caxn-db-prod"               # Cloud SQL instance name
${DB_NAME}     = "caxn_platform"
${DB_USER}     = "caxn_admin"
${DB_PASS}     = "CaxnDb@2026Secure"          # Production DB password
$APP_IMAGE   = "${REGION}-docker.pkg.dev/${PROJECT_ID}/$REPO/caxn-app:latest"
$WEB_IMAGE   = "${REGION}-docker.pkg.dev/${PROJECT_ID}/$REPO/caxn-frontend:latest"

# Auto-detect gcloud path (resolves issues when path is not set globally)
if (!(Get-Command gcloud -ErrorAction SilentlyContinue)) {
    $gcloudDefaultPath = "$env:USERPROFILE\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin"
    if (Test-Path "$gcloudDefaultPath\gcloud.cmd") {
        $env:PATH += ";$gcloudDefaultPath"
        Write-Host "Automatically added gcloud path to PATH: $gcloudDefaultPath" -ForegroundColor Green
    } else {
        $gcloudProgramFiles = "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin"
        if (Test-Path "$gcloudProgramFiles\gcloud.cmd") {
            $env:PATH += ";$gcloudProgramFiles"
            Write-Host "Automatically added gcloud path to PATH: $gcloudProgramFiles" -ForegroundColor Green
        } else {
            Write-Error "Cannot find gcloud command. Please ensure Google Cloud SDK is installed."
            exit 1
        }
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  CAXN Platform - Cloud Run Deployment" -ForegroundColor Cyan
Write-Host "  Project ID: ${PROJECT_ID}" -ForegroundColor Cyan
Write-Host "  Region:     ${REGION}" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# -- STEP 1: Set gcloud project ------------------------------
Write-Host "`n[Step 1] Setting GCP Project..." -ForegroundColor Yellow
gcloud config set project ${PROJECT_ID}
gcloud config set run/region ${REGION}

# -- STEP 2: Enable required APIs ----------------------------
Write-Host "`n[Step 2] Enabling required GCP APIs (Takes 1-2 mins)..." -ForegroundColor Yellow
$apis = @(
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com"
)
foreach ($api in $apis) {
    Write-Host "  Enabling $api ..." -NoNewline
    gcloud services enable $api --quiet
    Write-Host " Done" -ForegroundColor Green
}

# -- STEP 3: Create Artifact Registry repository -------------
Write-Host "`n[Step 3] Creating Artifact Registry repository..." -ForegroundColor Yellow
gcloud artifacts repositories create $REPO `
    --repository-format=docker `
    --location=${REGION} `
    --description="CAXN Platform Docker Images" `
    --quiet
Write-Host "  Done: Repository $REPO created" -ForegroundColor Green

# -- STEP 4: Configure Docker authentication -----------------
Write-Host "`n[Step 4] Configuring Docker authentication..." -ForegroundColor Yellow
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
Write-Host "  Done: Docker authentication configured" -ForegroundColor Green

# -- STEP 5: Create Cloud SQL PostgreSQL instance ------------
Write-Host "`n[Step 5] Creating Cloud SQL PostgreSQL 15 instance..." -ForegroundColor Yellow
Write-Host "  Note: This step takes 5-10 minutes, please wait..." -ForegroundColor Magenta
gcloud sql instances create ${DB_INSTANCE} `
    --database-version=POSTGRES_15 `
    --tier=db-f1-micro `
    --region=${REGION} `
    --storage-size=10GB `
    --storage-type=SSD `
    --no-backup `
    --quiet
Write-Host "  Done: Cloud SQL instance created" -ForegroundColor Green

# -- STEP 6: Create database and user ------------------------
Write-Host "`n[Step 6] Creating database and user..." -ForegroundColor Yellow
gcloud sql databases create ${DB_NAME} --instance=${DB_INSTANCE} --quiet
gcloud sql users create ${DB_USER} --instance=${DB_INSTANCE} --password=${DB_PASS} --quiet
Write-Host "  Done: Database '${DB_NAME}' and user '${DB_USER}' created" -ForegroundColor Green

# Get Cloud SQL Connection Name
${SQL_CONN} = "${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
Write-Host "  Cloud SQL Connection Name: ${SQL_CONN}" -ForegroundColor Cyan

# -- STEP 7: Save GCP credentials to Secret Manager ----------
Write-Host "`n[Step 7] Saving GCP credentials to Secret Manager..." -ForegroundColor Yellow
gcloud secrets create gcp-key-json `
    --data-file="gcp-key.json" `
    --quiet
Write-Host "  Done: Secret 'gcp-key-json' created" -ForegroundColor Green

# -- STEP 8: Build and push backend image --------------------
Write-Host "`n[Step 8] Building and pushing backend Docker image..." -ForegroundColor Yellow
docker build --no-cache -f app/Dockerfile.cloudrun -t $APP_IMAGE ./app
docker push $APP_IMAGE
Write-Host "  Done: Backend image pushed to $APP_IMAGE" -ForegroundColor Green

# -- STEP 9: Deploy backend to Cloud Run ----------------------
Write-Host "`n[Step 9] Deploying backend API to Cloud Run..." -ForegroundColor Yellow
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
Write-Host "  Done: Backend deployed" -ForegroundColor Green

# Get Backend URL
${BACKEND_URL} = gcloud run services describe caxn-app --region=${REGION} --format="value(status.url)"
Write-Host "  Backend URL: ${BACKEND_URL}" -ForegroundColor Cyan

# -- STEP 10: Build and push frontend image ------------------
Write-Host "`n[Step 10] Building and pushing frontend Docker image..." -ForegroundColor Yellow
docker build --no-cache `
    -f frontend/Dockerfile.cloudrun `
    --build-arg VITE_API_BASE="${BACKEND_URL}" `
    -t $WEB_IMAGE ./frontend
docker push $WEB_IMAGE
Write-Host "  Done: Frontend image pushed to $WEB_IMAGE" -ForegroundColor Green

# -- STEP 11: Deploy frontend to Cloud Run -------------------
Write-Host "`n[Step 11] Deploying frontend to Cloud Run..." -ForegroundColor Yellow
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
Write-Host "  Done: Frontend deployed" -ForegroundColor Green

# Get Frontend URL
${FRONTEND_URL} = gcloud run services describe caxn-frontend --region=${REGION} --format="value(status.url)"

# -- STEP 12: Update ECPay settings on backend ---------------
Write-Host "`n[Step 12] Updating ECPay return and client back URL..." -ForegroundColor Yellow
gcloud run services update caxn-app `
    --region=${REGION} `
    --update-env-vars="ECPAY_RETURN_URL=${BACKEND_URL}/api/payment/ecpay/callback,ECPAY_CLIENT_BACK=${FRONTEND_URL}" `
    --quiet
Write-Host "  Done: ECPay URLs updated" -ForegroundColor Green

# -- Summary -------------------------------------------------
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Deployment Completed Successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Frontend URL: ${FRONTEND_URL}" -ForegroundColor Cyan
Write-Host "  Backend URL:  ${BACKEND_URL}" -ForegroundColor Cyan
Write-Host "  API Docs:     ${BACKEND_URL}/docs" -ForegroundColor Cyan
Write-Host "  Cloud SQL:    ${SQL_CONN}" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Green
Write-Host "`n  Deployment Checklist:" -ForegroundColor Yellow
Write-Host "  1. Update ECPay ReturnURL to: ${BACKEND_URL}/api/payment/ecpay/callback" -ForegroundColor Yellow
Write-Host "  2. Update ECPay ClientBackURL to: ${FRONTEND_URL}" -ForegroundColor Yellow
Write-Host "  3. Verify Cloud SQL connection in GCP Console" -ForegroundColor Yellow
