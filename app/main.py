import os
import json
import psycopg2
import psycopg2.extras  # <--- 必須加上這一行！
from psycopg2.extras import RealDictCursor # 這樣下面用 RealDictCursor 會更方便
import uuid
import shutil
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from google import genai
from google.genai import types
import PIL.Image

app = FastAPI()

# --- 1. 配置與常數設定 ---
UPLOADS_PATH = "/app/uploads"
DONE_PATH = os.path.join(UPLOADS_PATH, "done")
TEST_ENTERPRISE_ID = "d4404339-1d19-4acf-966b-8ab460935fe6"
SECONDARY_ENTERPRISE_ID = "77777777-7777-7777-7777-777777777777" # 測試用第二企業 ID
PLATFORM_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000000" # 平台收益帳號
AI_DIAGNOSTIC_FEE = 10.00 # 每次 AI 診斷扣除 10 點

if not os.path.exists(DONE_PATH):
    os.makedirs(DONE_PATH, exist_ok=True)

app.mount("/static", StaticFiles(directory=UPLOADS_PATH), name="static")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL_NAME = "gemini-3.1-flash-lite"

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "db"),
    "database": os.getenv("DB_NAME", "caxn_platform"),
    "user": os.getenv("DB_USER", "admin"),
    "password": os.getenv("DB_PASS", "admin123"),
    "port": os.getenv("DB_PORT", "5432")
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

# --- 2. 資料模型 ---
class AssetLogRequest(BaseModel):
    image_path: str
    original_filename: str
    theme: str = "通用素材"

class ArchiveRequest(BaseModel):
    asset_type: str
    title: str
    required_points: float = 0.00 # 歸檔時設定資產價值

# --- 3. 核心 API：AI 診斷與企業扣點 ---
@app.post("/process-asset")
async def process_asset(req: AssetLogRequest = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 1. 產生新資產 ID
        new_asset_id = str(uuid.uuid4())
        
        # 2. 呼叫 Gemini AI 進行診斷
        is_passed = False
        ai_score = 0
        reason = "系統異常或未審核"
        ai_metadata = {}
        
        try:
            img = PIL.Image.open(req.image_path)
            prompt = """
            請分析這張圖片作為企業共享資源素材的適合度。請以 JSON 格式回應，必須包含三個欄位：
            1. is_passed (boolean): 是否適合上架分享
            2. score (整數 1-100): 素材品質評分
            3. reason (字串): 評分與判斷的原因說明
            """
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[img, prompt],
                config={"response_mime_type": "application/json"}
            )
            result = json.loads(response.text)
            is_passed = result.get('is_passed', False)
            ai_score = result.get('score', 0)
            reason = result.get('reason', '')
            ai_metadata = result
            print(f"🤖 AI 審核結果 ({req.original_filename}): score={ai_score}, passed={is_passed}")
        except Exception as e:
            print(f"⚠️ AI 審核失敗: {str(e)}")
            reason = f"AI Error: {str(e)}"

        # 3. 寫入資產表 (Assets) - 預設給予測試企業
        cur.execute(
            """
            INSERT INTO assets (asset_id, owner_enterprise_id, asset_type, title, content_url, contribution_pts_reward)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)
            """,
            (new_asset_id, TEST_ENTERPRISE_ID, "IMAGE", req.original_filename, req.image_path, 50.0) # 預設獎勵 50 點
        )

        # 4. 寫入審核日誌 (Assets_log)
        status = 'COMPLETED' if is_passed else 'REJECTED'
        cur.execute(
            """
            INSERT INTO assets_log (asset_id, is_passed, reason, ai_score, ai_metadata, status, asset_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (new_asset_id, is_passed, reason, ai_score, json.dumps(ai_metadata), status, "IMAGE")
        )

        # 5. 若通過審核，執行企業分潤
        if is_passed:
            cur.execute(
                "UPDATE wallets SET balance = balance + %s, updated_at = now() WHERE owner_id = %s::uuid",
                (50.0, TEST_ENTERPRISE_ID)
            )

            cur.execute(
                """
                INSERT INTO contribution_log (enterprise_id, asset_id, contribution_type, reward_points)
                VALUES (%s::uuid, %s::uuid, %s, %s)
                """,
                (TEST_ENTERPRISE_ID, new_asset_id, 'CONTENT_CONTRIBUTION', 50.0)
            )
            print(f"✅ 分潤成功: 企業 {TEST_ENTERPRISE_ID} 獲得 50 點")

        conn.commit()
        return {
            "status": "success", 
            "message": "處理完成", 
            "asset_id": new_asset_id,
            "ai_score": ai_score,
            "is_passed": is_passed
        }
    except Exception as e:
        conn.rollback()
        print(f"🔥 系統錯誤: {str(e)}")
        raise HTTPException(status_code=500, detail=f"伺服器錯誤: {str(e)}")
    finally:
        cur.close()
        conn.close()

# --- 4. 歸檔與設定價值 ---
@app.post("/archive-asset/{log_id}")
async def archive_asset(log_id: str, req: ArchiveRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE assets 
            SET asset_type = %s, title = %s, required_points = %s 
            WHERE asset_id = %s;
        """, (req.asset_type, req.title, req.required_points, log_id))

        cur.execute("UPDATE assets_log SET is_archived = true, asset_type = %s WHERE asset_id = %s", 
                   (req.asset_type, log_id))

        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()

# --- 5. 資產購買與 20% 分潤邏輯 ---
@app.post("/purchase-asset/{asset_id}")
async def purchase_asset(asset_id: str, buyer_owner_id: str):
    conn = get_db_connection()
    # 建議使用 RealDictCursor 讓代碼更易讀，避免 index out of range
    # cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) 
    # 修改後（更安全且簡潔）：
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 1. 取得資產資訊 (增加類型檢查與存在判定)
        cur.execute("""
            SELECT required_points, owner_enterprise_id 
            FROM assets WHERE asset_id = %s::uuid
        """, (asset_id,))
        asset = cur.fetchone()
        
        if asset is None:
            raise HTTPException(status_code=404, detail=f"找不到資產 ID: {asset_id}")
        
        # 使用 Key 存取，避免 tuple index 錯誤
        full_price = float(asset['required_points'])
        seller_id = asset['owner_enterprise_id']
        platform_fee = full_price * 0.2
        seller_revenue = full_price * 0.8

        # 2. 檢查買家餘額
        cur.execute("SELECT balance FROM wallets WHERE owner_id = %s::uuid", (buyer_owner_id,))
        buyer_wallet = cur.fetchone()
        
        if buyer_wallet is None:
            raise HTTPException(status_code=404, detail="買家錢包不存在")
        
        if float(buyer_wallet['balance']) < full_price:
            raise HTTPException(status_code=400, detail="餘額不足")

        # 3. 執行分潤轉帳 (分開執行，確保穩定)
        # 扣買家
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE owner_id = %s::uuid", (full_price, buyer_owner_id))
        # 給平台 20%
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (platform_fee, PLATFORM_WALLET_OWNER_ID))
        # 給賣家 80%
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (seller_revenue, seller_id))

        # 4. 寫入交易日誌
        cur.execute("""
            INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, fee_amount, transaction_type, related_asset_id)
            VALUES (
                (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid),
                (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid),
                %s, %s, 'ASSET_EXCHANGE', %s::uuid
            )
        """, (buyer_owner_id, PLATFORM_WALLET_OWNER_ID, full_price, platform_fee, asset_id))

        conn.commit()
        return {"status": "success", "message": "分潤採購成功"}

    except Exception as e:
        conn.rollback()
        print(f"🔥 系統報錯: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

   

# --- 6. 管理後台 UI (解決 f-string 與 JS 衝突) ---
# --- 6. 管理後台 UI (採用非 f-string 模式，徹底避免 JS 衝突) ---
@app.get("/admin", response_class=HTMLResponse)
async def admin_panel():
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT l.asset_id, l.ai_metadata, l.is_archived, l.asset_type, a.title
        FROM assets_log l
        LEFT JOIN assets a ON l.asset_id = a.asset_id
        ORDER BY l.created_at DESC
    """
    cur.execute(query)
    rows = cur.fetchall()
    
    rows_html = ""
    # 確保與檔案開頭定義的一致
    buyer_id = SECONDARY_ENTERPRISE_ID

    for r in rows:
        log_id, meta, archived, a_type, title = r
        score = (meta or {}).get('score', 'N/A')
        display_name = title or f"Asset_{log_id[:8]}"
        
        if archived:
            status_html = f"<span style='color:green;'>✅ 已歸檔 ({a_type})</span>"
            buy_btn_html = f"<td><button class='btn-buy' onclick=\"simulatePurchase('{log_id}')\">模擬採購分潤</button></td>"
        else:
            status_html = f"""
                <input type="text" id="t_{log_id}" value="{display_name}" style="width:100px;">
                <input type="number" id="p_{log_id}" value="50" style="width:50px;">
                <select id="s_{log_id}">
                    <option value="IMAGE">素材</option><option value="COURSE">課程</option>
                    <option value="GOODS">福利品</option><option value="VIDEO">形象影片</option>
                    <option value="ECARD">電子賀卡</option>
                </select>
                <button onclick="archive('{log_id}')">歸檔</button>
            """
            buy_btn_html = "<td>-</td>"

        rows_html += f"<tr><td>{log_id[:8]}</td><td>{display_name}</td><td>{score}</td><td>{status_html}</td>{buy_btn_html}</tr>"

    cur.close()
    conn.close()

    # 使用普通字串，不加 'f'。JS 的 ${assetId} 就能正常運作。
    html_template = """
    <html>
    <head>
        <title>CAXN 管理後台</title>
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f4f7f6; }
            .test-panel { background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #2ecc71; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; background: white; }
            th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
            th { background: #eee; }
            .btn-buy { background: #e67e22; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px; }
        </style>
        <script>
            async function simulatePurchase(assetId) {
                const buyerId = "VAR_BUYER_ID";
                if (!confirm("確定要進行分潤測試嗎？")) return;
                try {
                    const response = await fetch(`/purchase-asset/${assetId}?buyer_owner_id=${buyerId}`, { method: 'POST' });
                    const result = await response.json();
                    if (response.ok) {
                        alert("測試成功！請查看 DBeaver。");
                        location.reload();
                    } else {
                        alert("錯誤：" + (result.detail || "未知錯誤"));
                    }
                } catch (e) { 
                    alert("請求失敗"); 
                }
            }
            async function archive(id) {
                const type = document.getElementById('s_'+id).value;
                const title = document.getElementById('t_'+id).value;
                const pts = document.getElementById('p_'+id).value;
                await fetch('/archive-asset/'+id, {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({asset_type:type, title:title, required_points:pts})
                });
                location.reload();
            }
        </script>
    </head>
    <body>
        <div class="test-panel"><strong>🧪 測試模式</strong> | 當前買家：<code>VAR_BUYER_ID</code></div>
        <table>
            <tr><th>ID</th><th>名稱</th><th>AI 分數</th><th>操作狀態</th><th>模擬採購測試</th></tr>
            VAR_ROWS_HTML
        </table>
    </body>
    </html>
    """

    # 手動替換預留的佔位符
    final_html = html_template.replace("VAR_BUYER_ID", buyer_id).replace("VAR_ROWS_HTML", rows_html)
    return HTMLResponse(content=final_html)

# 確保檔案最後只有一個這個區塊，並且縮排正確
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
