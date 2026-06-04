"""
Phase 9 API routes - imported by main.py
Contains: Refresh Token, User Profile, Hot/New Assets, Batch Operations, Audit Logs, Advanced Search
"""
import os, json, asyncio, hashlib, secrets, psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
from auth import verify_password, get_password_hash, create_access_token, decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "db"),
    "database": os.getenv("DB_NAME", "caxn_platform"),
    "user": os.getenv("DB_USER", "admin"),
    "password": os.getenv("DB_PASS", "admin123"),
    "port": os.getenv("DB_PORT", "5432")
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

def require_platform_admin(user=Depends(get_current_user)):
    if user.get("role") != "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Platform Admin required")
    return user

def require_enterprise_admin(user=Depends(get_current_user)):
    if user.get("role") not in ["ENTERPRISE_ADMIN", "PLATFORM_ADMIN"]:
        raise HTTPException(status_code=403, detail="Enterprise Admin required")
    return user

router = APIRouter()

# ---------- Audit Log helper ----------
def write_audit_log(cur, user_id, action, target_type="", target_id="", detail="", ip=""):
    try:
        cur.execute("""INSERT INTO audit_logs (user_id, action, target_type, target_id, detail, ip_address)
            VALUES (%s::uuid, %s, %s, %s, %s, %s)""",
            (user_id, action, target_type, target_id, detail, ip))
    except Exception:
        pass

# ---------- Refresh Token ----------
class LoginV2Request(BaseModel):
    username: str
    password: str

@router.post("/api/auth/login-v2")
async def login_v2(req: LoginV2Request, request: Request):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users WHERE username = %s AND status = 'APPROVED'", (req.username,))
        user = cur.fetchone()
        if not user or not verify_password(req.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
        access_token = create_access_token({
            "user_id": str(user['user_id']), "sub": user['username'],
            "role": user['user_role'],
            "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None
        })
        raw_refresh = secrets.token_hex(32)
        refresh_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        cur.execute("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, NOW() + INTERVAL '7 days')",
            (user['user_id'], refresh_hash))
        write_audit_log(cur, str(user['user_id']), 'LOGIN', 'USER', str(user['user_id']), '', request.client.host if request.client else '')
        conn.commit()
        return {"status": "success", "access_token": access_token, "refresh_token": raw_refresh,
                "user": {"username": user['username'], "role": user['user_role'],
                         "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None,
                         "user_id": str(user['user_id'])}}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@router.post("/api/auth/refresh")
async def refresh_token(request: Request):
    body = await request.json()
    raw_token = body.get("refresh_token", "")
    if not raw_token:
        raise HTTPException(status_code=401, detail="無效的 Refresh Token")
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT rt.*, u.username, u.user_role, u.enterprise_id
            FROM refresh_tokens rt JOIN users u ON rt.user_id = u.user_id
            WHERE rt.token_hash = %s AND rt.revoked = false AND rt.expires_at > NOW()""", (token_hash,))
        record = cur.fetchone()
        if not record:
            raise HTTPException(status_code=401, detail="Refresh Token 已過期或已廢止")
        new_raw = secrets.token_hex(32)
        new_hash = hashlib.sha256(new_raw.encode()).hexdigest()
        cur.execute("UPDATE refresh_tokens SET revoked = true WHERE token_hash = %s", (token_hash,))
        cur.execute("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, NOW() + INTERVAL '7 days')",
            (record['user_id'], new_hash))
        new_access = create_access_token({
            "user_id": str(record['user_id']), "sub": record['username'],
            "role": record['user_role'],
            "enterprise_id": str(record['enterprise_id']) if record['enterprise_id'] else None
        })
        conn.commit()
        return {"status": "success", "access_token": new_access, "refresh_token": new_raw}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@router.post("/api/auth/logout")
async def logout_v2(request: Request, current_user=Depends(get_current_user)):
    try:
        body = await request.json()
    except Exception:
        body = {}
    raw_token = body.get("refresh_token", "")
    if raw_token:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        conn = get_db_connection(); cur = conn.cursor()
        try:
            cur.execute("UPDATE refresh_tokens SET revoked = true WHERE token_hash = %s", (token_hash,))
            conn.commit()
        finally: cur.close(); conn.close()
    return {"status": "success"}

# ---------- 個人中心 ----------
class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    phone_number: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.get("/api/users/me/profile")
async def get_my_profile(current_user=Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT user_id, username, user_role, phone_number, personal_points, status, created_at, enterprise_id FROM users WHERE user_id = %s::uuid", (user_id,))
        return {"status": "success", "data": cur.fetchone()}
    finally: cur.close(); conn.close()

@router.patch("/api/users/me")
async def update_profile(req: UpdateProfileRequest, current_user=Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        updates, values = [], []
        if req.display_name is not None:
            updates.append("username = %s"); values.append(req.display_name)
        if req.phone_number is not None:
            updates.append("phone_number = %s"); values.append(req.phone_number)
        if updates:
            values.append(user_id)
            cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE user_id = %s::uuid", values)
            write_audit_log(cur, user_id, 'UPDATE_PROFILE', 'USER', user_id)
            conn.commit()
        return {"status": "success", "message": "個人資料已更新"}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@router.patch("/api/users/me/password")
async def change_password(req: ChangePasswordRequest, current_user=Depends(get_current_user)):
    user_id = current_user.get("user_id")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密碼至少 6 碼")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT password_hash FROM users WHERE user_id = %s::uuid", (user_id,))
        u = cur.fetchone()
        if not u or not verify_password(req.old_password, u['password_hash']):
            raise HTTPException(status_code=400, detail="舊密碼不正確")
        cur.execute("UPDATE users SET password_hash = %s WHERE user_id = %s::uuid", (get_password_hash(req.new_password), user_id))
        cur.execute("UPDATE refresh_tokens SET revoked = true WHERE user_id = %s::uuid", (user_id,))
        write_audit_log(cur, user_id, 'CHANGE_PASSWORD', 'USER', user_id)
        conn.commit()
        return {"status": "success", "message": "密碼已更新，請重新登入"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

@router.get("/api/users/me/licenses")
async def get_my_licenses(current_user=Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT wt.created_at as purchased_at, wt.amount as points_spent,
                   a.asset_id, a.title, a.asset_type, a.content_url, a.required_points,
                   al.ai_score, al.ai_analysis
            FROM wallet_transactions wt
            JOIN assets a ON wt.related_asset_id::uuid = a.asset_id
            LEFT JOIN assets_log al ON a.asset_id = al.asset_id::uuid
            WHERE wt.transaction_type = 'ASSET_EXCHANGE'
            AND wt.from_wallet_id IN (SELECT wallet_id FROM wallets WHERE owner_id = %s::uuid)
            ORDER BY wt.created_at DESC""", (user_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@router.get("/api/users/me/redemptions")
async def get_my_redemptions(current_user=Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT r.redemption_id, r.redemption_code, r.status, r.created_at, r.used_at,
                   eb.title as benefit_title, eb.benefit_type,
                   bo.delivery_method, bo.tracking_number, bo.status as order_status, bo.shipped_at
            FROM benefit_redemptions r
            JOIN enterprise_benefits eb ON r.benefit_id = eb.benefit_id
            LEFT JOIN benefit_orders bo ON r.redemption_id = bo.redemption_id
            WHERE r.user_id = %s::uuid ORDER BY r.created_at DESC""", (user_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

# ---------- 熱門與最新資產 ----------
@router.get("/api/assets/hot")
async def get_hot_assets():
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT a.asset_id, a.title, a.asset_type, a.required_points, a.publish_category,
                   al.ai_score, al.ai_analysis,
                   COALESCE(r.rating_avg, 0) as avg_rating,
                   COALESCE(b.buy_count, 0) as buy_count
            FROM assets a
            LEFT JOIN assets_log al ON a.asset_id = al.asset_id::uuid
            LEFT JOIN (SELECT asset_id, ROUND(AVG(score)::numeric, 1) as rating_avg FROM asset_ratings GROUP BY asset_id) r ON a.asset_id = r.asset_id
            LEFT JOIN (SELECT related_asset_id::uuid as asset_id, COUNT(*) as buy_count FROM wallet_transactions WHERE transaction_type = 'ASSET_EXCHANGE' AND related_asset_id IS NOT NULL GROUP BY related_asset_id) b ON a.asset_id = b.asset_id
            WHERE al.is_archived = true
            ORDER BY (COALESCE(b.buy_count, 0) * 2 + COALESCE(r.rating_avg, 0) * 3) DESC LIMIT 6""")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@router.get("/api/assets/new")
async def get_new_assets():
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT a.asset_id, a.title, a.asset_type, a.required_points, a.created_at,
                   al.ai_score, al.ai_analysis
            FROM assets a LEFT JOIN assets_log al ON a.asset_id = al.asset_id::uuid
            WHERE al.is_archived = true AND a.created_at >= NOW() - INTERVAL '7 days'
            ORDER BY a.created_at DESC LIMIT 8""")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

@router.get("/api/assets/search-advanced")
async def search_assets_advanced(
    q: str = "", asset_type: str = "", min_price: float = 0, max_price: float = 999999,
    sort: str = "latest", enterprise_id: str = ""
):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        where = ["al.is_archived = true"]
        params = []
        if q:
            where.append("(a.title ILIKE %s OR al.ai_analysis ILIKE %s)")
            params += [f'%{q}%', f'%{q}%']
        if asset_type:
            where.append("a.asset_type = %s"); params.append(asset_type)
        if min_price > 0:
            where.append("a.required_points >= %s"); params.append(min_price)
        if max_price < 999999:
            where.append("a.required_points <= %s"); params.append(max_price)
        if enterprise_id:
            where.append("a.owner_enterprise_id = %s::uuid"); params.append(enterprise_id)
        order_map = {"latest": "a.created_at DESC", "popular": "buy_count DESC",
                     "rating": "avg_rating DESC", "price_asc": "a.required_points ASC", "price_desc": "a.required_points DESC"}
        order_clause = order_map.get(sort, "a.created_at DESC")
        cur.execute(f"""SELECT a.asset_id, a.title, a.asset_type, a.required_points, a.created_at, a.publish_category,
                   al.ai_score, al.ai_analysis,
                   COALESCE(r.rating_avg, 0) as avg_rating, COALESCE(b.buy_count, 0) as buy_count
            FROM assets a
            LEFT JOIN assets_log al ON a.asset_id = al.asset_id::uuid
            LEFT JOIN (SELECT asset_id, ROUND(AVG(score)::numeric,1) as rating_avg FROM asset_ratings GROUP BY asset_id) r ON a.asset_id = r.asset_id
            LEFT JOIN (SELECT related_asset_id::uuid as asset_id, COUNT(*) as buy_count FROM wallet_transactions WHERE transaction_type='ASSET_EXCHANGE' AND related_asset_id IS NOT NULL GROUP BY related_asset_id) b ON a.asset_id = b.asset_id
            WHERE {' AND '.join(where)} ORDER BY {order_clause} LIMIT 50""", params)
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()

# ---------- 批量操作 ----------
class BatchDistributeItem(BaseModel):
    user_id: str
    amount: float
    note: str = ""

class BatchDistributeRequest(BaseModel):
    distributions: list[BatchDistributeItem]

@router.post("/api/enterprise/batch-distribute")
async def batch_distribute(req: BatchDistributeRequest, current_user=Depends(require_enterprise_admin)):
    ent_id = current_user.get("enterprise_id")
    admin_id = current_user.get("user_id")
    if not ent_id: raise HTTPException(status_code=403, detail="需要企業管理員權限")
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        total = sum(d.amount for d in req.distributions)
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        wallet = cur.fetchone()
        if not wallet or float(wallet['balance']) < total:
            raise HTTPException(status_code=400, detail=f"企業錢包不足，需要 {total} 點，目前 {wallet['balance'] if wallet else 0} 點")
        results = []
        for d in req.distributions:
            cur.execute("SELECT user_id, username FROM users WHERE user_id = %s::uuid AND enterprise_id = %s::uuid", (d.user_id, ent_id))
            target = cur.fetchone()
            if not target:
                results.append({"user_id": d.user_id, "success": False, "reason": "員工不存在"}); continue
            cur.execute("UPDATE wallets SET balance = balance - %s WHERE wallet_id = %s", (d.amount, wallet['wallet_id']))
            cur.execute("UPDATE users SET personal_points = personal_points + %s WHERE user_id = %s::uuid", (d.amount, d.user_id))
            cur.execute("INSERT INTO point_distributions (enterprise_id, from_admin_id, to_user_id, amount, note) VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s)",
                (ent_id, admin_id, d.user_id, d.amount, d.note))
            results.append({"user_id": d.user_id, "username": target['username'], "amount": d.amount, "success": True})
        write_audit_log(cur, admin_id, 'BATCH_DISTRIBUTE', 'ENTERPRISE', ent_id, f'批量發送，共 {len(req.distributions)} 人，共 {total} 點')
        conn.commit()
        return {"status": "success", "results": results, "total_distributed": sum(r['amount'] for r in results if r.get('success'))}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

class BatchApproveRequest(BaseModel):
    ids: list[str]
    target_type: str
    action: str
    reason: str = ""

@router.post("/api/admin/batch-approve")
async def batch_approve(req: BatchApproveRequest, current_user=Depends(require_platform_admin)):
    admin_id = current_user.get("user_id")
    conn = get_db_connection(); cur = conn.cursor()
    results = []
    try:
        for rid in req.ids:
            try:
                if req.target_type == 'USER':
                    cur.execute("UPDATE users SET status = %s WHERE user_id = %s::uuid",
                        ('APPROVED' if req.action == 'APPROVE' else 'REJECTED', rid))
                elif req.target_type == 'ENTERPRISE':
                    cur.execute("UPDATE enterprises SET status = %s WHERE enterprise_id = %s::uuid",
                        ('APPROVED' if req.action == 'APPROVE' else 'REJECTED', rid))
                elif req.target_type == 'ASSET':
                    is_passed = req.action == 'APPROVE'
                    cur.execute("UPDATE assets_log SET is_passed = %s, reason = %s, is_archived = %s WHERE asset_id = %s::uuid",
                        (is_passed, req.reason, is_passed, rid))
                results.append({"id": rid, "success": True})
            except Exception as e:
                results.append({"id": rid, "success": False, "reason": str(e)})
        write_audit_log(cur, admin_id, f'BATCH_{req.action}', req.target_type, '', f'共 {len(req.ids)} 筆')
        conn.commit()
        return {"status": "success", "results": results}
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: cur.close(); conn.close()

# ---------- Audit Log 查詢 ----------
@router.get("/api/admin/audit-logs")
async def get_audit_logs(action: str = "", limit: int = 100, current_user=Depends(require_platform_admin)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if action:
            cur.execute("""SELECT al.*, u.username FROM audit_logs al
                LEFT JOIN users u ON al.user_id = u.user_id
                WHERE al.action ILIKE %s ORDER BY al.created_at DESC LIMIT %s""", (f'%{action}%', limit))
        else:
            cur.execute("""SELECT al.*, u.username FROM audit_logs al
                LEFT JOIN users u ON al.user_id = u.user_id
                ORDER BY al.created_at DESC LIMIT %s""", (limit,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()
