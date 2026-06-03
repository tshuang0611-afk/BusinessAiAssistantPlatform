"""
storage_helper.py
儲存抽象層：根據 STORAGE_PROVIDER 環境變數，自動切換本地或 GCS 模式。

STORAGE_PROVIDER=local  → 存到 /app/uploads/ (Docker Volume)
STORAGE_PROVIDER=gcs    → 存到 Google Cloud Storage Bucket

使用方式：
  from storage_helper import save_file, get_file_url, delete_file
"""
import os
import uuid
from pathlib import Path

STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local")
GCS_BUCKET       = os.getenv("GCS_BUCKET", "caxn-uploads-0780315685")
GCS_KEY_PATH     = os.getenv("GCS_KEY_PATH", "/app/gcp-key.json")
LOCAL_UPLOAD_DIR = os.getenv("LOCAL_UPLOAD_DIR", "/app/uploads")
# 公開 URL 前綴（GCS 公開 Bucket）
GCS_PUBLIC_URL   = f"https://storage.googleapis.com/{GCS_BUCKET}"

# ── GCS Client (Lazy init) ──────────────────────────────────
_gcs_client = None
_gcs_bucket = None

def _get_gcs_bucket():
    global _gcs_client, _gcs_bucket
    if _gcs_bucket is None:
        from google.cloud import storage
        from google.oauth2 import service_account
        if os.path.exists(GCS_KEY_PATH):
            credentials = service_account.Credentials.from_service_account_file(GCS_KEY_PATH)
            _gcs_client = storage.Client(credentials=credentials)
        else:
            # Cloud Run 上使用 Workload Identity，不需要金鑰檔
            _gcs_client = storage.Client()
        _gcs_bucket = _gcs_client.bucket(GCS_BUCKET)
    return _gcs_bucket

# ── 主要 API ────────────────────────────────────────────────

def save_file(file_bytes: bytes, original_filename: str, subfolder: str = "general") -> dict:
    """
    儲存檔案，回傳：
      { "filename": "xxx.jpg", "path": "材料/xxx.jpg", "url": "https://..." }
    """
    ext = Path(original_filename).suffix.lower() or ".bin"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    relative_path = f"{subfolder}/{unique_name}"

    if STORAGE_PROVIDER == "gcs":
        return _save_to_gcs(file_bytes, relative_path, unique_name)
    else:
        return _save_to_local(file_bytes, relative_path, unique_name)


def get_file_url(relative_path: str) -> str:
    """根據相對路徑取得完整可存取 URL"""
    if STORAGE_PROVIDER == "gcs":
        return f"{GCS_PUBLIC_URL}/{relative_path}"
    else:
        # 本地端透過 FastAPI StaticFiles 提供
        return f"/uploads/{relative_path}"


def delete_file(relative_path: str) -> bool:
    """刪除檔案（本地或 GCS）"""
    if STORAGE_PROVIDER == "gcs":
        return _delete_from_gcs(relative_path)
    else:
        return _delete_from_local(relative_path)


# ── 本地儲存實作 ────────────────────────────────────────────

def _save_to_local(file_bytes: bytes, relative_path: str, filename: str) -> dict:
    full_path = os.path.join(LOCAL_UPLOAD_DIR, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(file_bytes)
    return {
        "filename": filename,
        "path": relative_path,
        "url": f"/uploads/{relative_path}",
        "provider": "local"
    }


def _delete_from_local(relative_path: str) -> bool:
    full_path = os.path.join(LOCAL_UPLOAD_DIR, relative_path)
    if os.path.exists(full_path):
        os.remove(full_path)
        return True
    return False


# ── GCS 儲存實作 ────────────────────────────────────────────

def _save_to_gcs(file_bytes: bytes, relative_path: str, filename: str) -> dict:
    bucket = _get_gcs_bucket()
    blob = bucket.blob(relative_path)
    # 自動設定 Content-Type
    ext = Path(filename).suffix.lower()
    content_type_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",  ".gif": "image/gif",
        ".webp": "image/webp",".mp4": "video/mp4",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
    }
    content_type = content_type_map.get(ext, "application/octet-stream")
    blob.upload_from_string(file_bytes, content_type=content_type)
    public_url = f"{GCS_PUBLIC_URL}/{relative_path}"
    return {
        "filename": filename,
        "path": relative_path,
        "url": public_url,
        "provider": "gcs"
    }


def _delete_from_gcs(relative_path: str) -> bool:
    try:
        bucket = _get_gcs_bucket()
        blob = bucket.blob(relative_path)
        blob.delete()
        return True
    except Exception as e:
        print(f"[GCS Delete Error] {e}")
        return False


# ── 測試工具（可在容器內執行）──────────────────────────────

def test_connection() -> dict:
    """測試儲存連線是否正常"""
    if STORAGE_PROVIDER == "gcs":
        try:
            bucket = _get_gcs_bucket()
            test_blob = bucket.blob("_health_check.txt")
            test_blob.upload_from_string(b"ok", content_type="text/plain")
            test_blob.delete()
            return {"status": "ok", "provider": "gcs", "bucket": GCS_BUCKET}
        except Exception as e:
            return {"status": "error", "provider": "gcs", "error": str(e)}
    else:
        try:
            os.makedirs(LOCAL_UPLOAD_DIR, exist_ok=True)
            return {"status": "ok", "provider": "local", "dir": LOCAL_UPLOAD_DIR}
        except Exception as e:
            return {"status": "error", "provider": "local", "error": str(e)}
