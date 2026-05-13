import os
import json
import psycopg2
import psycopg2.extras
from psycopg2.extras import RealDictCursor
import uuid
from fastapi import FastAPI, HTTPException, Body, Depends
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
import PIL.Image
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth import verify_password, get_password_hash, create_access_token, decode_access_token

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. 配置與常數設定 ---
UPLOADS_PATH = "/app/uploads"
DONE_PATH = os.path.join(UPLOADS_PATH, "done")
TEST_ENTERPRISE_ID = "d4404339-1d19-4acf-966b-8ab460935fe6"
SECONDARY_ENTERPRISE_ID = "77777777-7777-7777-7777-777777777777"
PLATFORM_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000000"
AI_DIAGNOSTIC_FEE = 10.00

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

# --- JWT Auth ---
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

def require_platform_admin(user = Depends(get_current_user)):
    if user.get("role") != "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Platform Admin access required")
    return user

def require_enterprise_admin(user = Depends(get_current_user)):
    role = user.get("role")
    if role not in ["ENTERPRISE_ADMIN", "PLATFORM_ADMIN"]:
        raise HTTPException(status_code=403, detail="Enterprise Admin access required")
    return user

@app.on_event("startup")
def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            from_wallet_id UUID REFERENCES wallets(wallet_id),
            to_wallet_id UUID REFERENCES wallets(wallet_id),
            amount DECIMAL(15,2) NOT NULL,
            fee_amount DECIMAL(15,2) DEFAULT 0.00,
            transaction_type VARCHAR(50) NOT NULL,
            related_asset_id UUID,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS logistics_orders (
            order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(user_id),
            asset_id UUID REFERENCES assets(asset_id),
            delivery_method VARCHAR(50) NOT NULL,
            recipient_name VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            address TEXT,
            status VARCHAR(50) DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cur.execute("SELECT user_id FROM users WHERE username = 'admin'")
    if not cur.fetchone():
        pwd = get_password_hash("password123")
        cur.execute("INSERT INTO users (username, password_hash, user_role, phone_number) VALUES ('admin', %s, 'PLATFORM_ADMIN', '0000000000')", (pwd,))
        cur.execute("INSERT INTO users (enterprise_id, username, password_hash, user_role, phone_number) VALUES (%s::uuid, 'ent_admin', %s, 'ENTERPRISE_ADMIN', '1111111111')", (TEST_ENTERPRISE_ID, pwd))
        cur.execute("INSERT INTO users (enterprise_id, username, password_hash, user_role, phone_number) VALUES (%s::uuid, 'ent_user', %s, 'ENTERPRISE_USER', '2222222222')", (TEST_ENTERPRISE_ID, pwd))
    
    conn.commit()
    cur.close()
    conn.close()

# --- 資料模型 ---
class LoginRequest(BaseModel):
    username: str
    password: str

class AssetLogRequest(BaseModel):
    image_path: str
    original_filename: str
    theme: str = "通用素材"

class ArchiveRequest(BaseModel):
    asset_type: str
    title: str
    required_points: float = 0.00

class TopUpRequest(BaseModel):
    amount: float
    description: str = "線上儲值"

class WithdrawRequest(BaseModel):
    amount: float
    bank_account: str

class LogisticsRequest(BaseModel):
    asset_id: str
    delivery_method: str
    recipient_name: str
    phone: str
    address: str

# --- API ---
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT user_id, enterprise_id, username, password_hash, user_role FROM users WHERE username = %s", (req.username,))
        user = cur.fetchone()
        if not user or not verify_password(req.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Incorrect auth")
        
        token_data = {
            "sub": user['username'],
            "user_id": str(user['user_id']),
            "role": user['user_role'],
            "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None
        }
        token = create_access_token(token_data)
        return {"status": "success", "access_token": token, "user": token_data}
    finally:
        cur.close(); conn.close()

@app.get("/api/auth/me")
async def get_me(current_user = Depends(get_current_user)):
    return {"status": "success", "user": current_user}

@app.post("/process-asset")
async def process_asset(req: AssetLogRequest = Body(...), current_user = Depends(require_enterprise_admin)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        new_asset_id = str(uuid.uuid4())
        is_passed = False
        ai_score = 0
        reason = "System Err"
        ai_metadata = {}
        category = "IMAGE"
        summary = ""
        seo_tags = []
        try:
            img = PIL.Image.open(req.image_path)
            prompt = "請分析這張圖片作為企業共享資源素材的適合度。請以 JSON 格式回應，包含 is_passed, score, reason, category, summary, seo_tags"
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[img, prompt],
                config={"response_mime_type": "application/json"}
            )
            res = json.loads(response.text)
            is_passed = res.get('is_passed', False)
            ai_score = res.get('score', 0)
            reason = res.get('reason', '')
            category = res.get('category', 'IMAGE')
            summary = res.get('summary', '')
            seo_tags = res.get('seo_tags', [])
            ai_metadata = res
        except Exception as e:
            reason = str(e)
            
        ent_id = current_user.get("enterprise_id") or TEST_ENTERPRISE_ID
        cur.execute(
            """INSERT INTO assets (asset_id, owner_enterprise_id, asset_type, title, content_url, contribution_pts_reward) 
               VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)""",
            (new_asset_id, ent_id, category, req.original_filename, req.image_path, 50.0)
        )
        
        status = 'COMPLETED' if is_passed else 'REJECTED'
        cur.execute(
            """INSERT INTO assets_log (asset_id, is_passed, reason, ai_score, ai_metadata, ai_tags, ai_analysis, status, asset_type) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (new_asset_id, is_passed, reason, ai_score, json.dumps(ai_metadata), json.dumps(seo_tags), summary, status, category)
        )
        
        if is_passed:
            cur.execute("UPDATE wallets SET balance = balance + 50 WHERE owner_id = %s::uuid", (ent_id,))
            cur.execute("INSERT INTO contribution_log (enterprise_id, asset_id, contribution_type, reward_points) VALUES (%s::uuid, %s::uuid, 'CONTENT_CONTRIBUTION', 50)", (ent_id, new_asset_id))
            
        conn.commit()
        return {"status": "success", "asset_id": new_asset_id, "is_passed": is_passed}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()

@app.post("/archive-asset/{log_id}")
async def archive_asset(log_id: str, req: ArchiveRequest, current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        wallet = cur.fetchone()
        if not wallet or float(wallet['balance']) < AI_DIAGNOSTIC_FEE:
            raise HTTPException(status_code=400, detail="餘額不足支付 AI 診斷費")
            
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE wallet_id = %s", (AI_DIAGNOSTIC_FEE, wallet['wallet_id']))
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (AI_DIAGNOSTIC_FEE, PLATFORM_WALLET_OWNER_ID))
        cur.execute("""INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, transaction_type, description) 
                       VALUES (%s, (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid), %s, 'FEE', 'AI手續費')""",
                    (wallet['wallet_id'], PLATFORM_WALLET_OWNER_ID, AI_DIAGNOSTIC_FEE))
                    
        cur.execute("UPDATE assets SET asset_type = %s, title = %s, required_points = %s WHERE asset_id = %s::uuid", 
                    (req.asset_type, req.title, req.required_points, log_id))
        cur.execute("UPDATE assets_log SET is_archived = true, asset_type = %s WHERE asset_id = %s::uuid", (req.asset_type, log_id))
        conn.commit()
        return {"status": "success", "message": "歸檔成功並已扣除 AI 手續費"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.post("/purchase-asset/{asset_id}")
async def purchase_asset(asset_id: str, current_user = Depends(get_current_user)):
    buyer_owner_id = current_user.get("enterprise_id")
    if not buyer_owner_id: raise HTTPException(status_code=403, detail="Platform cannot buy")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT required_points, owner_enterprise_id FROM assets WHERE asset_id = %s::uuid", (asset_id,))
        asset = cur.fetchone()
        if not asset: raise HTTPException(status_code=404, detail="Not found")
        
        full_price = float(asset['required_points'])
        seller_id = asset['owner_enterprise_id']
        platform_fee = full_price * 0.2
        seller_revenue = full_price * 0.8
        
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (buyer_owner_id,))
        buyer_wallet = cur.fetchone()
        if not buyer_wallet or float(buyer_wallet['balance']) < full_price:
            raise HTTPException(status_code=400, detail="餘額不足")
            
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE owner_id = %s::uuid", (full_price, buyer_owner_id))
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (platform_fee, PLATFORM_WALLET_OWNER_ID))
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (seller_revenue, seller_id))
        
        cur.execute("""INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, fee_amount, transaction_type, related_asset_id) 
                       VALUES (%s, (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid), %s, %s, 'ASSET_EXCHANGE', %s::uuid)""",
                    (buyer_wallet['wallet_id'], PLATFORM_WALLET_OWNER_ID, full_price, platform_fee, asset_id))
        conn.commit()
        return {"status": "success", "message": "分潤採購成功"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/assets")
async def get_assets():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT l.asset_id, l.ai_score, l.ai_tags, l.ai_analysis, l.is_archived, l.asset_type, a.title, a.content_url, a.required_points 
                       FROM assets_log l JOIN assets a ON l.asset_id = a.asset_id WHERE l.is_archived = true ORDER BY l.created_at DESC""")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/manage-assets")
async def manage_assets(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT l.asset_id, l.ai_metadata, l.is_archived, l.asset_type, a.title, a.required_points, l.ai_score, l.created_at 
                       FROM assets_log l JOIN assets a ON l.asset_id = a.asset_id WHERE a.owner_enterprise_id = %s::uuid ORDER BY l.created_at DESC""", (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/transactions")
async def get_transactions(current_user = Depends(require_platform_admin)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.transaction_id, t.amount, t.fee_amount, t.transaction_type, t.description, t.created_at,
                   f.owner_id as from_owner_id, tw.owner_id as to_owner_id,
                   ef.company_name as from_company, et.company_name as to_company, a.title as asset_title
            FROM wallet_transactions t
            LEFT JOIN wallets f ON t.from_wallet_id = f.wallet_id
            LEFT JOIN wallets tw ON t.to_wallet_id = tw.wallet_id
            LEFT JOIN enterprises ef ON f.owner_id = ef.enterprise_id
            LEFT JOIN enterprises et ON tw.owner_id = et.enterprise_id
            LEFT JOIN assets a ON t.related_asset_id = a.asset_id
            ORDER BY t.created_at DESC LIMIT 100
        """)
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/wallets/me")
async def get_wallet(current_user = Depends(get_current_user)):
    owner_id = current_user.get("enterprise_id")
    if not owner_id: return {"status": "success", "balance": 0}
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT balance FROM wallets WHERE owner_id = %s::uuid", (owner_id,))
        row = cur.fetchone()
        return {"status": "success", "balance": row['balance'] if row else 0}
    finally: cur.close(); conn.close()

@app.post("/wallets/topup")
async def topup_wallet(req: TopUpRequest, current_user = Depends(get_current_user)):
    owner_id = current_user.get("enterprise_id")
    if not owner_id: raise HTTPException(status_code=403, detail="No enterprise")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE wallets SET balance = balance + %s, updated_at = now() WHERE owner_id = %s::uuid RETURNING wallet_id", (req.amount, owner_id))
        wallet = cur.fetchone()
        if not wallet:
            cur.execute("INSERT INTO wallets (owner_id, balance) VALUES (%s::uuid, %s) RETURNING wallet_id", (owner_id, req.amount))
            wallet = cur.fetchone()
        cur.execute("INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, transaction_type, description) VALUES (NULL, %s, %s, 'TOPUP', %s)",
                    (wallet['wallet_id'], req.amount, req.description))
        conn.commit()
        return {"status": "success", "message": "Topup success"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.post("/wallets/withdraw")
async def withdraw_wallet(req: WithdrawRequest, current_user = Depends(require_enterprise_admin)):
    owner_id = current_user.get("enterprise_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (owner_id,))
        wallet = cur.fetchone()
        if not wallet or float(wallet['balance']) < req.amount: raise HTTPException(status_code=400, detail="餘額不足")
        cur.execute("UPDATE wallets SET balance = balance - %s, updated_at = now() WHERE wallet_id = %s", (req.amount, wallet['wallet_id']))
        cur.execute("INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, transaction_type, description) VALUES (%s, NULL, %s, 'WITHDRAWAL', %s)",
                    (wallet['wallet_id'], req.amount, "提領"))
        conn.commit()
        return {"status": "success"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.post("/api/logistics")
async def create_logistics_order(req: LogisticsRequest, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT 1 FROM wallet_transactions t
            JOIN wallets w ON t.from_wallet_id = w.wallet_id
            JOIN users u ON w.owner_id = u.enterprise_id
            WHERE t.related_asset_id = %s::uuid AND u.user_id = %s::uuid AND t.transaction_type = 'ASSET_EXCHANGE'
        """, (req.asset_id, user_id))
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="尚未購買此資產授權")
        cur.execute("""
            INSERT INTO logistics_orders (user_id, asset_id, delivery_method, recipient_name, phone, address)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)
        """, (user_id, req.asset_id, req.delivery_method, req.recipient_name, req.phone, req.address))
        conn.commit()
        return {"status": "success", "message": "物流訂單建立成功"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/assets/{asset_id}/download")
async def download_asset(asset_id: str, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT a.content_url, a.owner_enterprise_id FROM assets a WHERE a.asset_id = %s::uuid", (asset_id,))
        asset = cur.fetchone()
        if not asset: raise HTTPException(status_code=404, detail="資產不存在")
        if str(asset['owner_enterprise_id']) != current_user.get("enterprise_id"):
            cur.execute("""
                SELECT 1 FROM wallet_transactions t
                JOIN wallets w ON t.from_wallet_id = w.wallet_id
                JOIN users u ON w.owner_id = u.enterprise_id
                WHERE t.related_asset_id = %s::uuid AND u.user_id = %s::uuid AND t.transaction_type = 'ASSET_EXCHANGE'
            """, (asset_id, user_id))
            if not cur.fetchone(): raise HTTPException(status_code=403, detail="尚未購買此資產授權，無法下載")
        file_path = os.path.join(DONE_PATH, os.path.basename(asset['content_url']))
        if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="實體檔案遺失")
        return FileResponse(path=file_path, filename=os.path.basename(asset['content_url']))
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
