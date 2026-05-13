import os
import requests
import json
import shutil
from datetime import datetime

# 環境路徑設定
UPLOADS_DIR = "/app/uploads"
DONE_DIR = os.path.join(UPLOADS_DIR, "done")
# 修改前
# API_URL = "http://127.0.0.1:8000/process-asset"

# 修改後 (建議寫法)
import os
# 如果在 Docker 內執行，優先使用環境變數或服務名，否則用 localhost
# API_URL = os.getenv("API_URL", "http://localhost:8000/process-asset")
API_URL = os.getenv("API_URL", "http://127.0.0.1:8000/process-asset")

def run_batch_with_report():
    if not os.path.exists(DONE_DIR):
        os.makedirs(DONE_DIR)

    # 僅處理 root 目錄下的圖檔[cite: 11]
    files = [f for f in os.listdir(UPLOADS_DIR) 
             if os.path.isfile(os.path.join(UPLOADS_DIR, f)) and f.endswith(('.jpg', '.jpeg', '.png'))]
    
    if not files:
        print("目前沒有待處理的新檔案。")
        return

    print(f"開始批次處理，預計處理 {len(files)} 個檔案...")

    for filename in files:
        file_path = os.path.join(UPLOADS_DIR, filename)
        
        # 傳送完整檔名作為識別與保存[cite: 14]
        payload = {
            "image_path": file_path,
            "original_filename": filename, # 保存完整檔名[cite: 14]
            "theme": "企業資源共享測試"
        }

        try:
            response = requests.post(API_URL, json=payload, timeout=60)
            if response.status_code == 200:
                result_data = response.json()
                score = result_data.get('ai_score', 'N/A')
                is_passed = result_data.get('is_passed', False)
                status_icon = "✅ 通過" if is_passed else "❌ 退回"
                print(f"處理成功: {filename} -> {status_icon} (AI 評分: {score})")
                
                # 處理完畢，移動檔案到 done 目錄
                shutil.move(file_path, os.path.join(DONE_DIR, filename))
            else:
                print(f"❌ {filename} -> API錯誤 {response.status_code}")
        except Exception as e:
            print(f"⚠️ {filename} 異常: {str(e)}")

if __name__ == "__main__":
    run_batch_with_report()