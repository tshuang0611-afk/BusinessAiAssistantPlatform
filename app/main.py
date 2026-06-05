import os
import json
import asyncio
import hashlib
import secrets
import psycopg2
import psycopg2.extras
from psycopg2.extras import RealDictCursor
import uuid
from datetime import datetime
from fastapi import FastAPI, HTTPException, Body, Depends, UploadFile, File, Form, Request
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
from google import genai
import PIL.Image
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth import verify_password, get_password_hash, create_access_token, decode_access_token
from phase9_routes import router as phase9_router
from phase10_routes import router as phase10_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(phase9_router)
app.include_router(phase10_router)

# --- 1. 配置與常數設定 ---
UPLOADS_PATH = os.getenv("LOCAL_UPLOAD_DIR", "/app/uploads")
DONE_PATH = os.path.join(UPLOADS_PATH, "done")
TEST_ENTERPRISE_ID = "d4404339-1d19-4acf-966b-8ab460935fe6"
SECONDARY_ENTERPRISE_ID = "77777777-7777-7777-7777-777777777777"
PLATFORM_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000000"
AI_DIAGNOSTIC_FEE = 10.00

os.makedirs(DONE_PATH, exist_ok=True)

app.mount("/static", StaticFiles(directory=UPLOADS_PATH), name="static")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL_NAME = "gemini-3.1-flash-lite"

# 儲存健康檢查
from storage_helper import test_connection as storage_test

@app.get("/api/health/storage")
async def health_storage():
    """檢查 GCS 或本地儲存連線狀態"""
    result = storage_test()
    return result

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
    
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)")

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

    # 第六階段：新增 status 欄位
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'APPROVED'")
    cur.execute("ALTER TABLE enterprises ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'APPROVED'")

    # 第七階段：資料庫擴充
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_points DECIMAL(15,2) DEFAULT 0.00")
    cur.execute("""
        ALTER TABLE assets
            ADD COLUMN IF NOT EXISTS publish_category VARCHAR(30) DEFAULT 'MATERIAL',
            ADD COLUMN IF NOT EXISTS associated_asset_id UUID,
            ADD COLUMN IF NOT EXISTS ai_script TEXT
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS point_distributions (
            distribution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            enterprise_id   UUID REFERENCES enterprises(enterprise_id),
            from_admin_id   UUID REFERENCES users(user_id),
            to_user_id      UUID REFERENCES users(user_id),
            amount          DECIMAL(15,2) NOT NULL,
            note            TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS enterprise_benefits (
            benefit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            enterprise_id   UUID REFERENCES enterprises(enterprise_id),
            title           VARCHAR(255) NOT NULL,
            description     TEXT,
            benefit_type    VARCHAR(50) DEFAULT 'PRODUCT',
            price_points    DECIMAL(15,2) DEFAULT 0,
            image_url       TEXT,
            stock           INT DEFAULT -1,
            is_active       BOOLEAN DEFAULT true,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS benefit_redemptions (
            redemption_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            benefit_id      UUID REFERENCES enterprise_benefits(benefit_id),
            user_id         UUID REFERENCES users(user_id),
            redemption_code VARCHAR(50) UNIQUE NOT NULL,
            status          VARCHAR(20) DEFAULT 'ACTIVE',
            external_ref    VARCHAR(255),
            external_platform VARCHAR(100),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            used_at         TIMESTAMP
        )
    """)

    # ===== 第八階段資料表 =====
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         UUID REFERENCES users(user_id),
            type            VARCHAR(50) NOT NULL,
            title           VARCHAR(255) NOT NULL,
            content         TEXT,
            related_id      VARCHAR(255),
            is_read         BOOLEAN DEFAULT false,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS benefit_orders (
            order_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            benefit_id      UUID REFERENCES enterprise_benefits(benefit_id),
            redemption_id   UUID REFERENCES benefit_redemptions(redemption_id),
            buyer_user_id   UUID REFERENCES users(user_id),
            seller_enterprise_id UUID REFERENCES enterprises(enterprise_id),
            recipient_name  VARCHAR(100),
            recipient_phone VARCHAR(20),
            recipient_company VARCHAR(100),
            recipient_address TEXT,
            delivery_method VARCHAR(30) DEFAULT 'COUPON',
            tracking_number VARCHAR(100),
            status          VARCHAR(20) DEFAULT 'PENDING',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            shipped_at      TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS asset_ratings (
            rating_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            asset_id    UUID REFERENCES assets(asset_id),
            user_id     UUID REFERENCES users(user_id),
            score       SMALLINT CHECK (score BETWEEN 1 AND 5),
            comment     TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (asset_id, user_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS asset_favorites (
            asset_id    UUID REFERENCES assets(asset_id),
            user_id     UUID REFERENCES users(user_id),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (asset_id, user_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS partner_platforms (
            platform_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        VARCHAR(100) NOT NULL,
            api_key_hash VARCHAR(64) NOT NULL,
            api_key_preview VARCHAR(20),
            callback_url TEXT,
            is_active   BOOLEAN DEFAULT true,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # ===== 第九階段資料表 =====
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            log_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID REFERENCES users(user_id),
            action      VARCHAR(100) NOT NULL,
            target_type VARCHAR(50),
            target_id   VARCHAR(255),
            detail      TEXT,
            ip_address  VARCHAR(45),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            token_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID REFERENCES users(user_id),
            token_hash  VARCHAR(64) NOT NULL UNIQUE,
            expires_at  TIMESTAMP NOT NULL,
            revoked     BOOLEAN DEFAULT false,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ===== 第十階段資料表 =====
    # users 加 email 欄位（安全遷移）
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS email_otps (
            otp_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID REFERENCES users(user_id),
            otp_hash    VARCHAR(64) NOT NULL,
            purpose     VARCHAR(30) DEFAULT 'LOGIN',
            expires_at  TIMESTAMP NOT NULL,
            used        BOOLEAN DEFAULT false,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS trusted_devices (
            device_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID REFERENCES users(user_id),
            device_hash VARCHAR(64) NOT NULL,
            user_agent  TEXT,
            expires_at  TIMESTAMP NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS payment_orders (
            order_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         UUID REFERENCES users(user_id),
            enterprise_id   UUID,
            payment_type    VARCHAR(20) DEFAULT 'PERSONAL',
            merchant_trade_no VARCHAR(30) UNIQUE NOT NULL,
            trade_no        VARCHAR(30),
            amount          NUMERIC(12,2) NOT NULL,
            points_to_add   NUMERIC(12,2) NOT NULL,
            status          VARCHAR(20) DEFAULT 'PENDING',
            payment_method  VARCHAR(30),
            gateway         VARCHAR(20) DEFAULT 'ECPAY',
            raw_response    TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at         TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
            request_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            enterprise_id   UUID NOT NULL,
            applicant_id    UUID REFERENCES users(user_id),
            amount          NUMERIC(12,2) NOT NULL,
            bank_name       VARCHAR(100),
            bank_code       VARCHAR(10),
            account_name    VARCHAR(100),
            account_number  VARCHAR(50),
            status          VARCHAR(20) DEFAULT 'PENDING',
            admin_note      TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at    TIMESTAMP
        )
     """)

    cur.execute("ALTER TABLE assets_log ADD COLUMN IF NOT EXISTS no_ai_review BOOLEAN DEFAULT FALSE")
    cur.execute("ALTER TABLE assets_log ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE")

    # 確保測試企業存在（避免外鍵衝突）
    cur.execute("SELECT enterprise_id FROM enterprises WHERE enterprise_id = %s::uuid", (TEST_ENTERPRISE_ID,))
    if not cur.fetchone():
        cur.execute("INSERT INTO enterprises (enterprise_id, tax_id, company_name, vip_level, security_score, enterprise_points) VALUES (%s::uuid, '12345678', 'Test Enterprise', 1, 5.0, 1000.00)", (TEST_ENTERPRISE_ID,))

    cur.execute("SELECT enterprise_id FROM enterprises WHERE enterprise_id = %s::uuid", (SECONDARY_ENTERPRISE_ID,))
    if not cur.fetchone():
        cur.execute("INSERT INTO enterprises (enterprise_id, tax_id, company_name, vip_level, security_score, enterprise_points) VALUES (%s::uuid, '87654321', 'Secondary Enterprise', 1, 5.0, 1000.00)", (SECONDARY_ENTERPRISE_ID,))

    cur.execute("""SELECT user_id FROM users WHERE username = 'admin'""")
    if not cur.fetchone():
        pwd = get_password_hash("password123")
        cur.execute("INSERT INTO users (username, password_hash, user_role, phone_number, status) VALUES ('admin', %s, 'PLATFORM_ADMIN', '0000000000', 'APPROVED')", (pwd,))
        cur.execute("INSERT INTO users (enterprise_id, username, password_hash, user_role, phone_number, status) VALUES (%s::uuid, 'ent_admin', %s, 'ENTERPRISE_ADMIN', '1111111111', 'APPROVED')", (TEST_ENTERPRISE_ID, pwd))
        cur.execute("INSERT INTO users (enterprise_id, username, password_hash, user_role, phone_number, status) VALUES (%s::uuid, 'ent_user', %s, 'ENTERPRISE_USER', '2222222222', 'APPROVED')", (TEST_ENTERPRISE_ID, pwd))

    conn.commit()
    cur.close()
    conn.close()


# --- 資料模型 ---
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    mode: str  # 'enterprise' 或 'employee'
    username: str
    password: str
    phone_number: str
    # 企業入駐用
    company_name: str = ""
    tax_id: str = ""
    # 員工加入用
    enterprise_tax_id: str = ""

class AssetLogRequest(BaseModel):
    image_path: str
    original_filename: str
    theme: str = "通用素材"

class ArchiveRequest(BaseModel):
    asset_type: str
    title: str
    required_points: float = 0.00
    no_ai_review: bool = False

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

class GenerateCreativeRequest(BaseModel):
    asset_id: str = ""
    prompt: str
    output_type: str = "VIDEO"

# --- 第七階段資料模型 ---
class DistributePointsRequest(BaseModel):
    to_user_id: str
    amount: float
    note: str = ""

class PersonalTopUpRequest(BaseModel):
    amount: float
    description: str = "員工自購點數"

class BenefitCreateRequest(BaseModel):
    title: str
    description: str = ""
    benefit_type: str = "PRODUCT"
    price_points: float = 0.0
    stock: int = -1

class BenefitUpdateRequest(BaseModel):
    title: str = ""
    description: str = ""
    price_points: float = -1
    stock: int = -99
    is_active: bool = True

# --- API ---
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT user_id, enterprise_id, username, password_hash, user_role, status FROM users WHERE username = %s", (req.username,))
        user = cur.fetchone()
        if not user or not verify_password(req.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Incorrect auth")
        
        # 第六階段：帳號審核狀態檢查
        user_status = user.get('status', 'APPROVED')
        if user_status == 'PENDING':
            raise HTTPException(status_code=403, detail="帳號審核中，請等候平台管理員核准後再登入")
        elif user_status == 'REJECTED':
            raise HTTPException(status_code=403, detail="帳號申請已被拒絕，請聯繫平台客服")
        
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

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    """註冊 API：支援企業入駐(enterprise)與員工加入(employee)兩種模式"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 確認帳號不重複
        cur.execute("SELECT user_id FROM users WHERE username = %s", (req.username,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="帳號已存在，請選擇其他帳號名稱")
        
        pwd = get_password_hash(req.password)
        
        if req.mode == 'enterprise':
            # 企業入駐模式：建立新企業 + 企業管理員帳號
            if not req.company_name or not req.tax_id:
                raise HTTPException(status_code=400, detail="請填寫公司名稱與統一編號")
            
            cur.execute("SELECT enterprise_id FROM enterprises WHERE tax_id = %s", (req.tax_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="此統一編號已完成申請，請改用員工加入模式")
            
            new_ent_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO enterprises (enterprise_id, company_name, tax_id, status) VALUES (%s::uuid, %s, %s, 'PENDING')",
                (new_ent_id, req.company_name, req.tax_id)
            )
            cur.execute(
                "INSERT INTO wallets (owner_id, owner_type, balance) VALUES (%s::uuid, 'ENTERPRISE', 0)",
                (new_ent_id,)
            )
            cur.execute(
                "INSERT INTO users (enterprise_id, username, password_hash, user_role, phone_number, status) VALUES (%s::uuid, %s, %s, 'ENTERPRISE_ADMIN', %s, 'PENDING')",
                (new_ent_id, req.username, pwd, req.phone_number)
            )
            conn.commit()
            return {"status": "success", "message": "企業申請已送出，等候平台管理員審核後即可登入"}
        
        elif req.mode == 'employee':
            # 員工加入模式：透過統編找到企業
            if not req.enterprise_tax_id:
                raise HTTPException(status_code=400, detail="請填寫公司統一編號")
            
            cur.execute("SELECT enterprise_id, status FROM enterprises WHERE tax_id = %s", (req.enterprise_tax_id,))
            ent = cur.fetchone()
            if not ent:
                raise HTTPException(status_code=404, detail="找不到此統一編號對應的企業，請確認後再試")
            
            cur.execute(
                "INSERT INTO users (enterprise_id, username, password_hash, user_role, phone_number, status) VALUES (%s::uuid, %s, %s, 'ENTERPRISE_USER', %s, 'PENDING')",
                (str(ent['enterprise_id']), req.username, pwd, req.phone_number)
            )
            conn.commit()
            return {"status": "success", "message": "員工申請已送出，等候平台管理員審核後即可登入"}
        
        else:
            raise HTTPException(status_code=400, detail="mode 必須為 enterprise 或 employee")
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/admin/pending-users")
async def get_pending_users(current_user = Depends(require_platform_admin)):
    """取得所有待審核帳號列表"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT u.user_id, u.username, u.user_role, u.phone_number, u.status, u.created_at,
                   e.company_name, e.tax_id, e.status as enterprise_status
            FROM users u
            LEFT JOIN enterprises e ON u.enterprise_id = e.enterprise_id
            WHERE u.status = 'PENDING'
            ORDER BY u.created_at ASC
        """)
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.post("/api/admin/approve-user/{user_id}")
async def approve_user(user_id: str, current_user = Depends(require_platform_admin)):
    """核准指定使用者帳號"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT user_id, enterprise_id, user_role FROM users WHERE user_id = %s::uuid AND status = 'PENDING'", (user_id,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="找不到待審核的使用者")
        
        cur.execute("UPDATE users SET status = 'APPROVED' WHERE user_id = %s::uuid", (user_id,))
        
        # 若為企業管理員，也一併核准企業
        if user['enterprise_id'] and user['user_role'] == 'ENTERPRISE_ADMIN':
            cur.execute("UPDATE enterprises SET status = 'APPROVED' WHERE enterprise_id = %s::uuid", (str(user['enterprise_id']),))
        
        conn.commit()
        return {"status": "success", "message": "帳號已核准"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.post("/api/admin/reject-user/{user_id}")
async def reject_user(user_id: str, current_user = Depends(require_platform_admin)):
    """拒絕指定使用者帳號申請"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE users SET status = 'REJECTED' WHERE user_id = %s::uuid AND status = 'PENDING'", (user_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="找不到待審核的使用者")
        conn.commit()
        return {"status": "success", "message": "已拒絕該帳號申請"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/admin/users")
async def get_all_users(current_user = Depends(require_platform_admin)):
    """取得所有使用者列表 (平台管理員)"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT u.user_id, u.username, u.user_role, u.phone_number, u.status, u.created_at, u.email,
                   e.company_name, e.tax_id
            FROM users u
            LEFT JOIN enterprises e ON u.enterprise_id = e.enterprise_id
            ORDER BY u.created_at DESC
        """)
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/admin/enterprises")
async def get_all_enterprises(current_user = Depends(require_platform_admin)):
    """取得所有企業列表 (平台管理員)"""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT enterprise_id, company_name, tax_id, vip_level, enterprise_points, status, created_at
            FROM enterprises
            ORDER BY created_at DESC
        """)
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.post("/api/ai/generate-creative")
async def generate_creative(req: GenerateCreativeRequest, current_user = Depends(require_enterprise_admin)):
    """AI 創作坊：使用 Gemini 生成影片腳本或電子賀卡文案，扣除 20 點 AI 運算費"""
    if current_user.get("role") == "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="平台管理者不應介入此功能運作")
    AI_CREATIVE_FEE = 20.0
    ent_id = current_user.get("enterprise_id")
    if not ent_id:
        raise HTTPException(status_code=403, detail="需要綁定企業才能使用 AI 創作坊")
    
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 檢查餘額
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        wallet = cur.fetchone()
        if not wallet or float(wallet['balance']) < AI_CREATIVE_FEE:
            raise HTTPException(status_code=400, detail=f"點數餘額不足，AI 創作需消耗 {AI_CREATIVE_FEE} 點")
        
        # 組合 Gemini Prompt
        if req.output_type == "VIDEO":
            system_prompt = f"""你是一位專業的品牌影片導演與廣告文案專家。
請根據以下需求，為企業生成一份完整的「Veo 影片分鏡腳本」。
格式必須是繁體中文，且以結構化 JSON 格式輸出，包含以下欄位：
- title（腳本標題）
- duration_seconds（建議影片秒數）
- style（畫面風格描述，英文，適合直接貼入 Veo）
- scenes（陣列，每個場景包含：scene_number, duration, visual_description_en, narration_zh, camera_angle）
- veo_main_prompt（一段完整的英文 Prompt，可直接貼入 Veo 生成影片）
- tagline（品牌標語，繁體中文）

企業需求：{req.prompt}"""
        else:  # ECARD
            system_prompt = f"""你是一位頂級的品牌創意總監與文案撰稿人。
請根據以下需求，為企業生成一份「AI 電子賀卡」的完整創作方案。
格式必須是繁體中文，且以結構化 JSON 格式輸出，包含以下欄位：
- title（賀卡標題）
- occasion（節日/場合）
- main_copy_zh（主文案，繁體中文，3-5句話）
- signature（落款建議）
- image_prompt_en（英文圖片生成 Prompt，適合貼入 Imagen 或 Nano Banana 生成背景圖）
- color_palette（建議色系，例如："#FF6B6B, #FFE66D, #4ECDC4"）
- font_suggestion（字型風格建議）

企業需求：{req.prompt}"""
        
        # 若有選擇素材圖片，嘗試載入
        contents = [system_prompt]
        if req.asset_id:
            try:
                cur.execute("SELECT content_url FROM assets WHERE asset_id = %s::uuid", (req.asset_id,))
                asset = cur.fetchone()
                if asset:
                    img_path = os.path.join(DONE_PATH, os.path.basename(asset['content_url']))
                    if os.path.exists(img_path):
                        img = PIL.Image.open(img_path)
                        contents.insert(0, img)
            except Exception:
                pass  # 圖片載入失敗不影響文字生成
        
        # 呼叫 Gemini
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config={"response_mime_type": "application/json"}
        )
        result_json = json.loads(response.text)
        
        # 扣除 AI 運算費
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE wallet_id = %s", (AI_CREATIVE_FEE, wallet['wallet_id']))
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (AI_CREATIVE_FEE, PLATFORM_WALLET_OWNER_ID))
        cur.execute("""
            INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, transaction_type, description)
            VALUES (%s, (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid), %s, 'FEE', 'AI創作坊手續費')
        """, (wallet['wallet_id'], PLATFORM_WALLET_OWNER_ID, AI_CREATIVE_FEE))
        
        conn.commit()
        return {
            "status": "success",
            "output_type": req.output_type,
            "result": result_json,
            "fee_charged": AI_CREATIVE_FEE
        }
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/auth/me")
async def get_me(current_user = Depends(get_current_user)):
    return {"status": "success", "user": current_user}

@app.post("/process-asset")
async def process_asset(req: AssetLogRequest = Body(...), current_user = Depends(require_enterprise_admin)):
    if current_user.get("role") == "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="平台管理者不應介入此功能運作")
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
            if not isinstance(category, str):
                category = "IMAGE"
            category = category.upper().strip()
            if category not in ['IMAGE', 'VIDEO_AD', 'ECARD', 'COURSE', 'GOODS']:
                category = "IMAGE"
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
    if current_user.get("role") == "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="平台管理者不應介入此功能運作")
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
        cur.execute("UPDATE assets_log SET is_archived = true, asset_type = %s, no_ai_review = %s WHERE asset_id = %s::uuid", 
                    (req.asset_type, req.no_ai_review, log_id))
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
        cur.execute("""SELECT l.asset_id, l.ai_score, l.ai_tags, l.ai_analysis, l.is_archived, l.asset_type, a.title, a.content_url, a.required_points, l.no_ai_review 
                       FROM assets_log l JOIN assets a ON l.asset_id::uuid = a.asset_id 
                       WHERE l.is_archived = true AND l.is_published = true 
                       ORDER BY l.created_at DESC""")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/manage-assets")
async def manage_assets(current_user = Depends(require_enterprise_admin)):
    role = current_user.get("role")
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if role == "PLATFORM_ADMIN":
            cur.execute("""SELECT l.asset_id, l.ai_metadata, l.is_archived, l.asset_type, a.title, a.required_points, l.ai_score, l.created_at, a.content_url,
                                  l.reason, l.ai_analysis, l.no_ai_review, l.is_published, e.company_name as owner_name 
                           FROM assets_log l JOIN assets a ON l.asset_id::uuid = a.asset_id 
                           LEFT JOIN enterprises e ON a.owner_enterprise_id = e.enterprise_id 
                           ORDER BY l.created_at DESC""")
        else:
            cur.execute("""SELECT l.asset_id, l.ai_metadata, l.is_archived, l.asset_type, a.title, a.required_points, l.ai_score, l.created_at, a.content_url,
                                  l.reason, l.ai_analysis, l.no_ai_review, l.is_published, e.company_name as owner_name 
                           FROM assets_log l JOIN assets a ON l.asset_id::uuid = a.asset_id 
                           LEFT JOIN enterprises e ON a.owner_enterprise_id = e.enterprise_id 
                           WHERE a.owner_enterprise_id = %s::uuid ORDER BY l.created_at DESC""", (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.post("/api/assets/{asset_id}/toggle-publish")
async def toggle_publish(asset_id: str, current_user = Depends(require_enterprise_admin)):
    role = current_user.get("role")
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if role == "PLATFORM_ADMIN":
            raise HTTPException(status_code=403, detail="平台管理者不應介入此功能運作")
        # 檢查該資產是否屬於該企業
        cur.execute("SELECT owner_enterprise_id FROM assets WHERE asset_id = %s::uuid", (asset_id,))
        asset = cur.fetchone()
        if not asset or str(asset['owner_enterprise_id']) != ent_id:
            raise HTTPException(status_code=403, detail="無權限操作此資產")
            
        cur.execute("UPDATE assets_log SET is_published = NOT COALESCE(is_published, true) WHERE asset_id = %s RETURNING is_published", (asset_id,))
        new_state = cur.fetchone()['is_published']
        conn.commit()
        return {"status": "success", "is_published": new_state}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close(); conn.close()

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

# ============================================================
# 第七階段 API
# ============================================================

# --- 點數分配系統 ---

@app.get("/api/enterprise/members")
async def get_enterprise_members(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT user_id, username, user_role, phone_number, personal_points, status, created_at
            FROM users WHERE enterprise_id = %s::uuid ORDER BY created_at ASC
        """, (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.post("/api/enterprise/distribute-points")
async def distribute_points(req: DistributePointsRequest, current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    admin_id = current_user.get("user_id")
    if not ent_id: raise HTTPException(status_code=403, detail="需要企業管理員權限")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 確認目標員工屬於同一企業
        cur.execute("SELECT user_id, username FROM users WHERE user_id = %s::uuid AND enterprise_id = %s::uuid", (req.to_user_id, ent_id))
        target = cur.fetchone()
        if not target: raise HTTPException(status_code=404, detail="找不到此員工或員工不屬於您的企業")
        # 從企業錢包扣款
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        wallet = cur.fetchone()
        if not wallet or float(wallet['balance']) < req.amount:
            raise HTTPException(status_code=400, detail=f"企業錢包餘額不足，目前僅有 {wallet['balance'] if wallet else 0} 點")
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE wallet_id = %s", (req.amount, wallet['wallet_id']))
        # 增加員工個人點數
        cur.execute("UPDATE users SET personal_points = personal_points + %s WHERE user_id = %s::uuid", (req.amount, req.to_user_id))
        # 寫入分配紀錄
        cur.execute("""
            INSERT INTO point_distributions (enterprise_id, from_admin_id, to_user_id, amount, note)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s)
        """, (ent_id, admin_id, req.to_user_id, req.amount, req.note))
        conn.commit()
        return {"status": "success", "message": f"已成功分配 {req.amount} 點給 {target['username']}"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/enterprise/distribution-log")
async def get_distribution_log(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT pd.distribution_id, pd.amount, pd.note, pd.created_at,
                   a.username as admin_name, u.username as user_name
            FROM point_distributions pd
            JOIN users a ON pd.from_admin_id = a.user_id
            JOIN users u ON pd.to_user_id = u.user_id
            WHERE pd.enterprise_id = %s::uuid ORDER BY pd.created_at DESC LIMIT 100
        """, (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/users/my-points")
async def get_my_points(current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT personal_points FROM users WHERE user_id = %s::uuid", (user_id,))
        row = cur.fetchone()
        return {"status": "success", "personal_points": float(row['personal_points']) if row else 0}
    finally: cur.close(); conn.close()

@app.post("/api/users/self-topup")
async def self_topup(req: PersonalTopUpRequest, current_user = Depends(get_current_user)):
    """員工自行用現金購買個人點數"""
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE users SET personal_points = personal_points + %s WHERE user_id = %s::uuid", (req.amount, user_id))
        conn.commit()
        return {"status": "success", "message": f"個人點數儲值 {req.amount} 點成功"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

# --- 三軌上架：軌道 A 素材真實上傳 ---
from storage_helper import save_file as storage_save, get_file_url, delete_file as storage_delete

@app.post("/api/upload/material")
async def upload_material(
    file: UploadFile = File(...),
    custom_prompt: str = Form(default=""),
    current_user = Depends(require_enterprise_admin)
):
    """真實 multipart 素材上傳，儲存到 GCS/本地後送 Gemini AI 審核"""
    if current_user.get("role") == "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="平台管理者不應介入此功能運作")
    ent_id = current_user.get("enterprise_id") or TEST_ENTERPRISE_ID
    new_asset_id = str(uuid.uuid4())
    file_bytes = await file.read()
    stored = storage_save(file_bytes, file.filename or f"{new_asset_id}.bin", subfolder="materials")
    public_url = stored["url"]
    relative_path = stored["path"]

    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        is_passed = False; ai_score = 0; reason = "審核中"; category = "IMAGE"
        summary = ""; seo_tags = []; ai_metadata = {}
        try:
            import io
            img = PIL.Image.open(io.BytesIO(file_bytes))
            base_prompt = "請分析這張圖片作為企業共享資源素材的適合度。請以 JSON 格式回應，包含 is_passed, score, reason, category, summary, seo_tags"
            if custom_prompt and custom_prompt.strip():
                prompt = f"{base_prompt}\n\n上傳者的補充審核重點：{custom_prompt.strip()}"
            else:
                prompt = base_prompt
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[img, prompt],
                config={"response_mime_type": "application/json"}
            )
            res = json.loads(response.text)
            is_passed = res.get('is_passed', False)
            ai_score  = res.get('score', 0)
            reason    = res.get('reason', '')
            category  = res.get('category', 'IMAGE')
            if not isinstance(category, str):
                category = "IMAGE"
            category = category.upper().strip()
            if category not in ['IMAGE', 'VIDEO_AD', 'ECARD', 'COURSE', 'GOODS']:
                category = "IMAGE"
            summary   = res.get('summary', '')
            seo_tags  = res.get('seo_tags', [])
            ai_metadata = res
        except Exception as e:
            reason = str(e)

        cur.execute("""INSERT INTO assets (asset_id, owner_enterprise_id, asset_type, title, content_url, contribution_pts_reward, publish_category)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, 'MATERIAL')""",
            (new_asset_id, ent_id, category, file.filename or new_asset_id, public_url, 50.0))
        status_val = 'COMPLETED' if is_passed else 'REJECTED'
        cur.execute("""INSERT INTO assets_log (asset_id, is_passed, reason, ai_score, ai_metadata, ai_tags, ai_analysis, status, asset_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (new_asset_id, is_passed, reason, ai_score, json.dumps(ai_metadata), json.dumps(seo_tags), summary, status_val, category))
        if is_passed:
            cur.execute("UPDATE wallets SET balance = balance + 50 WHERE owner_id = %s::uuid", (ent_id,))
            cur.execute("INSERT INTO contribution_log (enterprise_id, asset_id, contribution_type, reward_points) VALUES (%s::uuid, %s::uuid, 'CONTENT_CONTRIBUTION', 50)", (ent_id, new_asset_id))
        conn.commit()
        return {"status": "success", "asset_id": new_asset_id, "is_passed": is_passed, "ai_score": ai_score, "reason": reason, "url": public_url}
    except Exception as e:
        conn.rollback()
        storage_delete(relative_path)
        raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

# --- 三軌上架：軌道 B AI 創意內容 ---

@app.post("/api/upload/creative")
async def upload_creative(
    file: UploadFile = File(...),
    title: str = "AI 創意作品",
    description: str = "",
    tags: str = "",
    asset_type: str = "VIDEO_AD",
    required_points: float = 100.0,
    publish_category: str = "CREATIVE",
    current_user = Depends(require_enterprise_admin)
):
    """AI 創意成品直接上架：企業上傳由外部 AI 生成的影片/圖片，扣 AI 診斷費後發布供消費者點數解鎖"""
    if current_user.get("role") == "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="平台管理者不應介入此功能運作")
    ent_id = current_user.get("enterprise_id") or TEST_ENTERPRISE_ID
    new_asset_id = str(uuid.uuid4())
    file_bytes = await file.read()

    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    stored = None
    try:
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        wallet = cur.fetchone()
        if not wallet or float(wallet['balance']) < AI_DIAGNOSTIC_FEE:
            raise HTTPException(status_code=400, detail=f"企業錢包餘額不足，需要 {AI_DIAGNOSTIC_FEE} 點 AI 診斷費")

        stored = storage_save(file_bytes, file.filename or f"{new_asset_id}.mp4", subfolder="creative")
        public_url = stored["url"]

        # 扣除 AI 診斷費
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE wallet_id = %s", (AI_DIAGNOSTIC_FEE, wallet['wallet_id']))
        cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (AI_DIAGNOSTIC_FEE, PLATFORM_WALLET_OWNER_ID))
        cur.execute("""INSERT INTO wallet_transactions (from_wallet_id, to_wallet_id, amount, transaction_type, description)
            VALUES (%s, (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid), %s, 'FEE', 'AI創意內容診斷費')""",
            (wallet['wallet_id'], PLATFORM_WALLET_OWNER_ID, AI_DIAGNOSTIC_FEE))
        tag_list = [t.strip() for t in tags.split(',') if t.strip()] if tags else []
        cur.execute("""INSERT INTO assets (asset_id, owner_enterprise_id, asset_type, title, content_url, required_points, publish_category, ai_script)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)""",
            (new_asset_id, ent_id, asset_type, title, public_url, required_points, publish_category, description))
        cur.execute("""INSERT INTO assets_log (asset_id, is_passed, reason, ai_score, status, asset_type, is_archived)
            VALUES (%s, true, 'AI創意成品直接上架', 100, 'COMPLETED', %s, true)""",
            (new_asset_id, asset_type))
        conn.commit()
        return {"status": "success", "asset_id": new_asset_id, "url": public_url, "message": f"創意內容已上架，AI 診斷費 {AI_DIAGNOSTIC_FEE} 點已扣除"}
    except HTTPException: raise
    except Exception as e:
        conn.rollback()
        if stored: storage_delete(stored["path"])
        raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()


# --- 三軌上架：軌道 C 企業福利品 ---

@app.post("/api/benefits")
async def create_benefit(
    file: UploadFile = File(None),
    title: str = "",
    description: str = "",
    benefit_type: str = "PRODUCT",
    price_points: float = 0.0,
    stock: int = -1,
    current_user = Depends(require_enterprise_admin)
):
    ent_id = current_user.get("enterprise_id")
    if not ent_id: raise HTTPException(status_code=403, detail="需要企業帳號")
    image_url = None
    if file and file.filename:
        file_bytes = await file.read()
        stored = storage_save(file_bytes, file.filename, subfolder="benefits")
        image_url = stored["url"]
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO enterprise_benefits (enterprise_id, title, description, benefit_type, price_points, image_url, stock)
            VALUES (%s::uuid, %s, %s, %s, %s, %s, %s) RETURNING benefit_id""",
            (ent_id, title, description, benefit_type, price_points, image_url, stock))
        bid = cur.fetchone()['benefit_id']
        conn.commit()
        return {"status": "success", "benefit_id": str(bid), "image_url": image_url}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/benefits")
async def list_benefits():
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT b.*, e.company_name FROM enterprise_benefits b
            JOIN enterprises e ON b.enterprise_id = e.enterprise_id
            WHERE b.is_active = true ORDER BY b.created_at DESC""")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/benefits/mine")
async def my_benefits(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM enterprise_benefits WHERE enterprise_id = %s::uuid ORDER BY created_at DESC", (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.put("/api/benefits/{benefit_id}")
async def update_benefit(benefit_id: str, req: BenefitUpdateRequest, current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        updates, params = [], []
        if req.title: updates.append("title = %s"); params.append(req.title)
        if req.description: updates.append("description = %s"); params.append(req.description)
        if req.price_points >= 0: updates.append("price_points = %s"); params.append(req.price_points)
        if req.stock != -99: updates.append("stock = %s"); params.append(req.stock)
        updates.append("is_active = %s"); params.append(req.is_active)
        params.extend([benefit_id, ent_id])
        cur.execute(f"UPDATE enterprise_benefits SET {', '.join(updates)} WHERE benefit_id = %s::uuid AND enterprise_id = %s::uuid", params)
        conn.commit()
        return {"status": "success"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.delete("/api/benefits/{benefit_id}")
async def delete_benefit(benefit_id: str, current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE enterprise_benefits SET is_active = false WHERE benefit_id = %s::uuid AND enterprise_id = %s::uuid", (benefit_id, ent_id))
        conn.commit()
        return {"status": "success", "message": "福利品已下架"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.post("/api/benefits/{benefit_id}/redeem")
async def redeem_benefit(benefit_id: str, current_user = Depends(get_current_user)):
    """員工用個人點數兌換福利品，生成兌換碼"""
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM enterprise_benefits WHERE benefit_id = %s::uuid AND is_active = true", (benefit_id,))
        benefit = cur.fetchone()
        if not benefit: raise HTTPException(status_code=404, detail="福利品不存在或已下架")
        if benefit['stock'] == 0: raise HTTPException(status_code=400, detail="此福利品已售罄")
        # 檢查個人點數
        cur.execute("SELECT personal_points FROM users WHERE user_id = %s::uuid", (user_id,))
        u = cur.fetchone()
        if not u or float(u['personal_points']) < float(benefit['price_points']):
            raise HTTPException(status_code=400, detail=f"個人點數不足，需要 {benefit['price_points']} 點")
        # 扣點
        cur.execute("UPDATE users SET personal_points = personal_points - %s WHERE user_id = %s::uuid", (benefit['price_points'], user_id))
        # 減庫存
        if benefit['stock'] > 0:
            cur.execute("UPDATE enterprise_benefits SET stock = stock - 1 WHERE benefit_id = %s::uuid", (benefit_id,))
        # 生成兌換碼
        import secrets
        code = f"CAXN-{secrets.token_hex(8).upper()}"
        cur.execute("""INSERT INTO benefit_redemptions (benefit_id, user_id, redemption_code, status)
            VALUES (%s::uuid, %s::uuid, %s, 'ACTIVE') RETURNING redemption_id""",
            (benefit_id, user_id, code))
        conn.commit()
        return {"status": "success", "redemption_code": code, "message": "兌換成功！請妥善保管您的兌換碼"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/benefits/{benefit_id}/my-redemption")
async def get_my_redemption(benefit_id: str, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM benefit_redemptions WHERE benefit_id = %s::uuid AND user_id = %s::uuid ORDER BY created_at DESC LIMIT 1", (benefit_id, user_id))
        row = cur.fetchone()
        return {"status": "success", "data": row}
    finally: cur.close(); conn.close()

@app.get("/api/users/my-redemptions")
async def get_my_all_redemptions(current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT r.*, b.title, b.benefit_type FROM benefit_redemptions r
            JOIN enterprise_benefits b ON r.benefit_id = b.benefit_id
            WHERE r.user_id = %s::uuid ORDER BY r.created_at DESC""", (user_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

# --- 功能完善 ---

@app.get("/api/admin/pending-count")
async def get_pending_count(current_user = Depends(require_platform_admin)):
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM users WHERE status = 'PENDING'")
        count = cur.fetchone()[0]
        return {"status": "success", "count": count}
    finally: cur.close(); conn.close()

@app.get("/api/assets/search")
async def search_assets(keyword: str = "", asset_type: str = ""):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        sql = """SELECT l.asset_id, l.ai_score, l.ai_tags, l.ai_analysis, l.is_archived, l.asset_type,
                        a.title, a.content_url, a.required_points, a.publish_category
                 FROM assets_log l JOIN assets a ON l.asset_id::uuid = a.asset_id
                 WHERE l.is_archived = true"""
        params = []
        if asset_type: sql += " AND l.asset_type = %s"; params.append(asset_type)
        if keyword: sql += " AND (a.title ILIKE %s OR l.ai_analysis ILIKE %s)"; params.extend([f"%{keyword}%", f"%{keyword}%"])
        sql += " ORDER BY l.created_at DESC"
        cur.execute(sql, params)
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/assets/{asset_id}/stream")
async def stream_asset(asset_id: str, token: str = ""):
    """HTTP Range 串流播放，使用 query param token 認證"""
    from fastapi.responses import StreamingResponse
    import mimetypes
    # 驗證 token
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        user_id = payload.get("user_id")
        cur.execute("SELECT a.content_url, a.owner_enterprise_id, a.asset_type FROM assets a WHERE a.asset_id = %s::uuid", (asset_id,))
        asset = cur.fetchone()
        if not asset: raise HTTPException(status_code=404, detail="資產不存在")
        # 驗證購買或擁有權
        if str(asset['owner_enterprise_id']) != payload.get("enterprise_id"):
            cur.execute("""SELECT 1 FROM wallet_transactions t
                JOIN wallets w ON t.from_wallet_id = w.wallet_id
                JOIN users u ON w.owner_id = u.enterprise_id
                WHERE t.related_asset_id = %s::uuid AND u.user_id = %s::uuid AND t.transaction_type = 'ASSET_EXCHANGE'""",
                (asset_id, user_id))
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="尚未購買此資產授權")
        file_path = os.path.join(DONE_PATH, os.path.basename(asset['content_url']))
        if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="實體檔案遺失")
        mime_type = mimetypes.guess_type(file_path)[0] or "video/mp4"
        file_size = os.path.getsize(file_path)
        def iterfile(path, start=0, end=None):
            end = end or file_size - 1
            with open(path, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                chunk = 8192
                while remaining > 0:
                    data = f.read(min(chunk, remaining))
                    if not data: break
                    remaining -= len(data)
                    yield data
        return StreamingResponse(iterfile(file_path), media_type=mime_type, headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Range": f"bytes 0-{file_size-1}/{file_size}"
        })
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()


# ============================================================
# 第八階段 API
# ============================================================

# --- 通知輔助函數 ---
def create_notification(cur, user_id: str, ntype: str, title: str, content: str = "", related_id: str = ""):
    cur.execute("""INSERT INTO notifications (user_id, type, title, content, related_id)
        VALUES (%s::uuid, %s, %s, %s, %s)""",
        (user_id, ntype, title, content, related_id))

# --- SSE 通知流 ---
# 儲存連線中的用戶佇列 { user_id: asyncio.Queue }
_sse_queues: dict = {}

@app.get("/api/notifications/stream")
async def notification_stream(token: str = ""):
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("user_id")
    q: asyncio.Queue = asyncio.Queue()
    _sse_queues[user_id] = q

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'message': '已連線通知服務'})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(msg, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            _sse_queues.pop(user_id, None)

    return StreamingResponse(event_generator(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

async def push_notification(user_id: str, ntype: str, title: str, content: str = "", related_id: str = ""):
    """寫入 DB 並即時推送 SSE"""
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("""INSERT INTO notifications (user_id, type, title, content, related_id)
            VALUES (%s::uuid, %s, %s, %s, %s) RETURNING notification_id, created_at""",
            (user_id, ntype, title, content, related_id))
        row = cur.fetchone()
        conn.commit()
        if user_id in _sse_queues:
            await _sse_queues[user_id].put({"notification_id": str(row[0]), "type": ntype, "title": title, "content": content, "related_id": related_id, "created_at": str(row[1])})
    finally: cur.close(); conn.close()

@app.get("/api/notifications")
async def get_notifications(current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM notifications WHERE user_id = %s::uuid ORDER BY created_at DESC LIMIT 50", (user_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/notifications/unread-count")
async def get_unread_count(current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM notifications WHERE user_id = %s::uuid AND is_read = false", (user_id,))
        return {"status": "success", "count": cur.fetchone()[0]}
    finally: cur.close(); conn.close()

@app.patch("/api/notifications/{nid}/read")
async def mark_read(nid: str, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("UPDATE notifications SET is_read = true WHERE notification_id = %s::uuid AND user_id = %s::uuid", (nid, user_id))
        conn.commit(); return {"status": "success"}
    finally: cur.close(); conn.close()

@app.post("/api/notifications/read-all")
async def mark_all_read(current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("UPDATE notifications SET is_read = true WHERE user_id = %s::uuid", (user_id,))
        conn.commit(); return {"status": "success"}
    finally: cur.close(); conn.close()

# --- 統計報表 API ---

@app.get("/api/enterprise/stats")
async def enterprise_stats(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COALESCE(SUM(amount),0) as total_distributed FROM point_distributions WHERE enterprise_id = %s::uuid", (ent_id,))
        distributed = float(cur.fetchone()['total_distributed'])
        cur.execute("SELECT COUNT(*) as cnt FROM benefit_redemptions r JOIN enterprise_benefits b ON r.benefit_id = b.benefit_id WHERE b.enterprise_id = %s::uuid", (ent_id,))
        redemptions = cur.fetchone()['cnt']
        cur.execute("SELECT COUNT(*) as cnt FROM assets WHERE owner_enterprise_id = %s::uuid", (ent_id,))
        assets_count = cur.fetchone()['cnt']
        cur.execute("SELECT COALESCE(balance,0) as bal FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        r = cur.fetchone(); wallet_balance = float(r['bal']) if r else 0
        cur.execute("SELECT asset_type, COUNT(*) as cnt FROM assets WHERE owner_enterprise_id = %s::uuid GROUP BY asset_type", (ent_id,))
        asset_dist = cur.fetchall()
        cur.execute("SELECT COUNT(*) as cnt FROM users WHERE enterprise_id = %s::uuid", (ent_id,))
        member_count = cur.fetchone()['cnt']
        return {"status": "success", "data": {
            "total_distributed": distributed, "redemptions": redemptions,
            "assets_count": assets_count, "wallet_balance": wallet_balance,
            "asset_distribution": asset_dist, "member_count": member_count
        }}
    finally: cur.close(); conn.close()

@app.get("/api/enterprise/points-timeline")
async def points_timeline(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT DATE(created_at) as date, SUM(amount) as out_amount
            FROM point_distributions WHERE enterprise_id = %s::uuid
            AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at) ORDER BY date
        """, (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.get("/api/platform/stats")
async def platform_stats(current_user = Depends(require_platform_admin)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COUNT(*) as cnt FROM enterprises")
        ent_count = cur.fetchone()['cnt']
        cur.execute("SELECT COUNT(*) as cnt FROM assets")
        asset_count = cur.fetchone()['cnt']
        cur.execute("SELECT COALESCE(SUM(amount),0) as total FROM wallet_transactions WHERE transaction_type = 'ASSET_EXCHANGE'")
        total_tx = float(cur.fetchone()['total'])
        cur.execute("""SELECT e.company_name, COALESCE(SUM(pd.amount),0) as distributed
            FROM enterprises e LEFT JOIN point_distributions pd ON e.enterprise_id = pd.enterprise_id
            GROUP BY e.enterprise_id, e.company_name ORDER BY distributed DESC LIMIT 10""")
        ent_ranking = cur.fetchall()
        cur.execute("SELECT COUNT(*) as cnt FROM users WHERE status = 'PENDING'")
        pending_users = cur.fetchone()['cnt']
        return {"status": "success", "data": {
            "enterprise_count": ent_count, "asset_count": asset_count,
            "total_transaction": total_tx, "enterprise_ranking": ent_ranking,
            "pending_users": pending_users
        }}
    finally: cur.close(); conn.close()

# --- 福利品訂單（物流）API ---

class BenefitRedeemWithOrderRequest(BaseModel):
    delivery_method: str = "COUPON"
    recipient_name: str = ""
    recipient_phone: str = ""
    recipient_company: str = ""
    recipient_address: str = ""

@app.post("/api/benefits/{benefit_id}/redeem-order")
async def redeem_benefit_with_order(benefit_id: str, req: BenefitRedeemWithOrderRequest, current_user = Depends(get_current_user)):
    """兌換福利品並填寫物流資訊，同時通知賣家"""
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM enterprise_benefits WHERE benefit_id = %s::uuid AND is_active = true", (benefit_id,))
        benefit = cur.fetchone()
        if not benefit: raise HTTPException(status_code=404, detail="福利品不存在")
        if benefit['stock'] == 0: raise HTTPException(status_code=400, detail="此福利品已售罄")
        cur.execute("SELECT personal_points, username FROM users WHERE user_id = %s::uuid", (user_id,))
        u = cur.fetchone()
        if not u or float(u['personal_points']) < float(benefit['price_points']):
            raise HTTPException(status_code=400, detail=f"個人點數不足，需要 {benefit['price_points']} 點")
        # 扣點
        cur.execute("UPDATE users SET personal_points = personal_points - %s WHERE user_id = %s::uuid", (benefit['price_points'], user_id))
        if benefit['stock'] > 0:
            cur.execute("UPDATE enterprise_benefits SET stock = stock - 1 WHERE benefit_id = %s::uuid", (benefit_id,))
        # 生成兌換碼
        code = f"CAXN-{secrets.token_hex(8).upper()}"
        cur.execute("""INSERT INTO benefit_redemptions (benefit_id, user_id, redemption_code)
            VALUES (%s::uuid, %s::uuid, %s) RETURNING redemption_id""", (benefit_id, user_id, code))
        redemption_id = cur.fetchone()['redemption_id']
        # 建立訂單
        cur.execute("""INSERT INTO benefit_orders (benefit_id, redemption_id, buyer_user_id, seller_enterprise_id,
            recipient_name, recipient_phone, recipient_company, recipient_address, delivery_method)
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s) RETURNING order_id""",
            (benefit_id, redemption_id, user_id, benefit['enterprise_id'],
             req.recipient_name, req.recipient_phone, req.recipient_company, req.recipient_address, req.delivery_method))
        order_id = cur.fetchone()['order_id']
        # 通知賣家企業管理員
        cur.execute("SELECT user_id FROM users WHERE enterprise_id = %s::uuid AND user_role = 'ENTERPRISE_ADMIN' LIMIT 1", (benefit['enterprise_id'],))
        seller_admin = cur.fetchone()
        conn.commit()
        if seller_admin and req.delivery_method != 'COUPON':
            asyncio.create_task(push_notification(str(seller_admin['user_id']), 'ORDER_RECEIVED',
                f"📦 新訂單：{benefit['title']}",
                f"買家：{req.recipient_name} | {req.recipient_company} | {req.recipient_address} | {req.recipient_phone}",
                str(order_id)))
        return {"status": "success", "redemption_code": code, "order_id": str(order_id)}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/enterprise/benefit-orders")
async def get_benefit_orders(current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT bo.*, eb.title as benefit_title, u.username as buyer_username
            FROM benefit_orders bo
            JOIN enterprise_benefits eb ON bo.benefit_id = eb.benefit_id
            JOIN users u ON bo.buyer_user_id = u.user_id
            WHERE bo.seller_enterprise_id = %s::uuid ORDER BY bo.created_at DESC""", (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

class ShipOrderRequest(BaseModel):
    tracking_number: str = ""

@app.patch("/api/enterprise/benefit-orders/{order_id}/ship")
async def ship_order(order_id: str, req: ShipOrderRequest, current_user = Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE benefit_orders SET status = 'SHIPPED', tracking_number = %s, shipped_at = NOW()
            WHERE order_id = %s::uuid AND seller_enterprise_id = %s::uuid RETURNING buyer_user_id, benefit_id""",
            (req.tracking_number, order_id, ent_id))
        row = cur.fetchone()
        if not row: raise HTTPException(status_code=404, detail="訂單不存在")
        buyer_id = str(row['buyer_user_id'])
        conn.commit()
        asyncio.create_task(push_notification(buyer_id, 'ORDER_SHIPPED', '📬 您的訂單已出貨！',
            f"快遞單號：{req.tracking_number or '（無需物流）'}", order_id))
        return {"status": "success", "message": "已標記出貨"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

# --- 資產評分與收藏 API ---

class RatingRequest(BaseModel):
    score: int
    comment: str = ""

@app.post("/api/assets/{asset_id}/rate")
async def rate_asset(asset_id: str, req: RatingRequest, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    if not (1 <= req.score <= 5): raise HTTPException(status_code=400, detail="評分須介於 1-5 之間")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO asset_ratings (asset_id, user_id, score, comment)
            VALUES (%s::uuid, %s::uuid, %s, %s)
            ON CONFLICT (asset_id, user_id) DO UPDATE SET score = %s, comment = %s""",
            (asset_id, user_id, req.score, req.comment, req.score, req.comment))
        conn.commit()
        return {"status": "success", "message": "評分已記錄"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/assets/{asset_id}/ratings")
async def get_ratings(asset_id: str):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT r.score, r.comment, r.created_at, u.username
            FROM asset_ratings r JOIN users u ON r.user_id = u.user_id
            WHERE r.asset_id = %s::uuid ORDER BY r.created_at DESC""", (asset_id,))
        rows = cur.fetchall()
        avg = sum(r['score'] for r in rows) / len(rows) if rows else 0
        return {"status": "success", "data": rows, "avg_score": round(avg, 1), "count": len(rows)}
    finally: cur.close(); conn.close()

@app.post("/api/assets/{asset_id}/favorite")
async def add_favorite(asset_id: str, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("INSERT INTO asset_favorites (asset_id, user_id) VALUES (%s::uuid, %s::uuid) ON CONFLICT DO NOTHING", (asset_id, user_id))
        conn.commit(); return {"status": "success"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.delete("/api/assets/{asset_id}/favorite")
async def remove_favorite(asset_id: str, current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("DELETE FROM asset_favorites WHERE asset_id = %s::uuid AND user_id = %s::uuid", (asset_id, user_id))
        conn.commit(); return {"status": "success"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/users/favorites")
async def get_favorites(current_user = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT a.asset_id, a.title, a.asset_type, a.required_points, l.ai_score, l.ai_analysis
            FROM asset_favorites f JOIN assets a ON f.asset_id = a.asset_id
            LEFT JOIN assets_log l ON a.asset_id = l.asset_id::uuid
            WHERE f.user_id = %s::uuid ORDER BY f.created_at DESC""", (user_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

# --- 夥伴平台 Webhook API ---

class PartnerCreateRequest(BaseModel):
    name: str
    callback_url: str = ""

@app.post("/api/admin/partner-platforms")
async def create_partner(req: PartnerCreateRequest, current_user = Depends(require_platform_admin)):
    raw_key = f"caxn_{secrets.token_hex(24)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO partner_platforms (name, api_key_hash, api_key_preview, callback_url)
            VALUES (%s, %s, %s, %s) RETURNING platform_id""",
            (req.name, key_hash, raw_key[:20] + "...", req.callback_url))
        pid = cur.fetchone()['platform_id']
        conn.commit()
        return {"status": "success", "platform_id": str(pid), "api_key": raw_key, "warning": "請妥善保存此 API Key，僅顯示一次"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@app.get("/api/admin/partner-platforms")
async def list_partners(current_user = Depends(require_platform_admin)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT platform_id, name, api_key_preview, callback_url, is_active, created_at FROM partner_platforms ORDER BY created_at DESC")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@app.patch("/api/admin/partner-platforms/{pid}/toggle")
async def toggle_partner(pid: str, current_user = Depends(require_platform_admin)):
    conn = get_db_connection(); cur = conn.cursor()
    try:
        cur.execute("UPDATE partner_platforms SET is_active = NOT is_active WHERE platform_id = %s::uuid", (pid,))
        conn.commit(); return {"status": "success"}
    finally: cur.close(); conn.close()

class VerifyCodeRequest(BaseModel):
    code: str
    api_key: str

@app.post("/api/webhook/verify-code")
async def webhook_verify_code(req: VerifyCodeRequest):
    """公開端點：夥伴平台驗證兌換碼"""
    key_hash = hashlib.sha256(req.api_key.encode()).hexdigest()
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT platform_id, name, callback_url FROM partner_platforms WHERE api_key_hash = %s AND is_active = true", (key_hash,))
        partner = cur.fetchone()
        if not partner: raise HTTPException(status_code=401, detail="Invalid API Key")
        cur.execute("""SELECT r.*, eb.title FROM benefit_redemptions r
            JOIN enterprise_benefits eb ON r.benefit_id = eb.benefit_id
            WHERE r.redemption_code = %s""", (req.code,))
        redemption = cur.fetchone()
        if not redemption: return {"valid": False, "reason": "兌換碼不存在"}
        if redemption['status'] == 'USED': return {"valid": False, "reason": "兌換碼已使用", "used_at": str(redemption['used_at'])}
        # 標記已使用
        cur.execute("UPDATE benefit_redemptions SET status = 'USED', used_at = NOW(), external_platform = %s WHERE redemption_code = %s",
            (partner['name'], req.code))
        conn.commit()
        # 非同步呼叫 callback
        if partner['callback_url']:
            import httpx
            payload = {"code": req.code, "benefit_title": redemption['title'], "verified_at": str(datetime.now()), "verified_by": partner['name']}
            asyncio.create_task(asyncio.to_thread(lambda: httpx.post(partner['callback_url'], json=payload, timeout=5)))
        return {"valid": True, "benefit_title": redemption['title'], "redeemed_at": str(redemption['created_at'])}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
