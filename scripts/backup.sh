#!/bin/bash
# ============================================================
# CAXN Platform 資料庫自動備份腳本
# 建議用 crontab 每日執行：0 2 * * * /path/to/backup.sh
# ============================================================

# --- 設定 ---
BACKUP_DIR="/backups/caxn"
DB_CONTAINER="caxn_db"
DB_NAME="${DB_NAME:-caxn_platform}"
DB_USER="${DB_USER:-admin}"
KEEP_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"

# --- 建立備份目錄 ---
mkdir -p "$BACKUP_DIR"

# --- 執行備份 ---
echo "[$(date)] 開始備份資料庫..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] ✅ 備份成功：$BACKUP_FILE (${SIZE})"
else
    echo "[$(date)] ❌ 備份失敗！" >&2
    exit 1
fi

# --- 刪除超過 N 天的舊備份 ---
echo "[$(date)] 清除 ${KEEP_DAYS} 天前的舊備份..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${KEEP_DAYS}" -delete
echo "[$(date)] 清理完成。"

# --- 列出目前備份清單 ---
echo "[$(date)] 目前備份清單："
ls -lh "$BACKUP_DIR" | tail -10
