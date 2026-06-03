# ============================================================
# setup-gcloud-env.ps1
# 每次開新 PowerShell 時先執行此腳本，設定 gcloud 環境
# 用法：. .\scripts\setup-gcloud-env.ps1
# ============================================================

Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
$env:PATH += ";C:\Users\tshuang0611\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin"

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

Write-Host "✅ gcloud 環境已設定" -ForegroundColor Green
Write-Host "   PROJECT: $PROJECT_ID"
Write-Host "   REGION:  $REGION"
gcloud config set project $PROJECT_ID --quiet
gcloud config set run/region $REGION --quiet
