"""
Phase 10 API routes
B: Email OTP 二次驗證（信任裝置 7 天）
A: 綠界 ECPay 金流整合
"""
import os, json, hashlib, secrets, hmac, urllib.parse
from datetime import datetime, timedelta
from typing import Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import APIRouter, HTTPException, Depends, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, EmailStr
from auth import verify_password, get_password_hash, create_access_token, decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ── DB 連線 ────────────────────────────────────────────────
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "db"),
    "database": os.getenv("DB_NAME", "caxn_platform"),
    "user": os.getenv("DB_USER", "admin"),
    "password": os.getenv("DB_PASS", "admin123"),
    "port": os.getenv("DB_PORT", "5432")
}
def get_db(): return psycopg2.connect(**DB_CONFIG)

security = HTTPBearer(auto_error=False)
def get_current_user(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred: raise HTTPException(401, "需要登入")
    payload = decode_access_token(cred.credentials)
    if not payload: raise HTTPException(401, "Token 無效")
    return payload

router = APIRouter()

# ── Email 發送工具 ────────────────────────────────────────
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
EMAIL_FROM       = os.getenv("EMAIL_FROM", "noreply@caxn.io")
EMAIL_FROM_NAME  = os.getenv("EMAIL_FROM_NAME", "CAXN Platform")

def send_email_otp(to_email: str, otp: str, purpose: str = "登入") -> bool:
    """透過 SendGrid 發送 OTP Email，若未設定 API Key 則走 SMTP fallback"""
    if SENDGRID_API_KEY:
        return _send_via_sendgrid(to_email, otp, purpose)
    return _send_via_smtp(to_email, otp, purpose)

def _send_via_sendgrid(to_email: str, otp: str, purpose: str) -> bool:
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        message = Mail(
            from_email=(EMAIL_FROM, EMAIL_FROM_NAME),
            to_emails=to_email,
            subject=f"CAXN 驗證碼（{purpose}）",
            html_content=f"""
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#0f172a;color:#f8fafc;border-radius:12px">
              <h2 style="color:#6366f1;margin:0 0 1rem">CAXN Platform</h2>
              <p>您的 <strong>{purpose}</strong> 驗證碼：</p>
              <div style="font-size:2.5rem;font-weight:900;letter-spacing:0.3em;color:#10b981;text-align:center;padding:1rem;background:rgba(16,185,129,0.1);border-radius:8px;margin:1rem 0">{otp}</div>
              <p style="color:#94a3b8;font-size:0.85rem">此驗證碼 10 分鐘內有效，請勿分享給他人。</p>
              <p style="color:#64748b;font-size:0.75rem">若非您本人操作，請忽略此郵件。</p>
            </div>""")
        sg.send(message)
        return True
    except Exception as e:
        print(f"SendGrid error: {e}")
        return False

def _send_via_smtp(to_email: str, otp: str, purpose: str) -> bool:
    """SMTP fallback（Gmail / 自架 SMTP）"""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not smtp_user:
        print("[Email] 未設定 SMTP_USER，跳過發送（開發模式 OTP 請查看後端 log）")
        print(f"[DEV OTP] {to_email}: {otp}")
        return True  # 開發環境不擋流程
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"CAXN 驗證碼（{purpose}）"
        msg["From"] = f"{EMAIL_FROM_NAME} <{smtp_user}>"
        msg["To"] = to_email
        msg.attach(MIMEText(f"您的 {purpose} 驗證碼：{otp}（10 分鐘有效）", "plain", "utf-8"))
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"SMTP error: {e}")
        return False

# ── 工具函式 ────────────────────────────────────────────────
def generate_otp() -> str:
    """生成 6 位數字 OTP"""
    return str(secrets.randbelow(900000) + 100000)

def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

def get_device_hash(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else ""
    return hashlib.sha256(f"{ua}{ip}".encode()).hexdigest()

def is_trusted_device(cur, user_id: str, device_hash: str) -> bool:
    cur.execute("""SELECT device_id FROM trusted_devices
        WHERE user_id = %s::uuid AND device_hash = %s AND expires_at > NOW()""",
        (user_id, device_hash))
    return cur.fetchone() is not None

def trust_device(cur, user_id: str, device_hash: str, user_agent: str):
    cur.execute("""INSERT INTO trusted_devices (user_id, device_hash, user_agent, expires_at)
        VALUES (%s::uuid, %s, %s, NOW() + INTERVAL '7 days')
        ON CONFLICT DO NOTHING""", (user_id, device_hash, user_agent))

# ═══════════════════════════════════════════════════════════
# B: Email OTP 二次驗證
# ═══════════════════════════════════════════════════════════

class StepOneRequest(BaseModel):
    username: str
    password: str

class StepTwoRequest(BaseModel):
    username: str
    otp: str
    trust_device: bool = True

class SetEmailRequest(BaseModel):
    email: str

@router.post("/api/auth/login/step1")
async def login_step1(req: StepOneRequest, request: Request):
    """第一步：帳號密碼驗證 → 發 OTP 或（信任裝置時）直接登入"""
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users WHERE username = %s AND status = 'APPROVED'", (req.username,))
        user = cur.fetchone()
        if not user or not verify_password(req.password, user['password_hash']):
            raise HTTPException(401, "帳號或密碼錯誤")

        device_hash = get_device_hash(request)
        user_id_str = str(user['user_id'])

        # 若無 email，直接走舊流程（不做 OTP）
        if not user.get('email'):
            access_token = create_access_token({
                "user_id": user_id_str, "sub": user['username'],
                "role": user['user_role'],
                "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None
            })
            raw_refresh = secrets.token_hex(32)
            refresh_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
            cur.execute("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, NOW() + INTERVAL '7 days')",
                (user['user_id'], refresh_hash))
            conn.commit()
            return {
                "status": "success", "step": "done",
                "access_token": access_token, "refresh_token": raw_refresh,
                "user": {"username": user['username'], "role": user['user_role'],
                         "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None,
                         "user_id": user_id_str}
            }

        # 信任裝置：跳過 OTP
        if is_trusted_device(cur, user_id_str, device_hash):
            access_token = create_access_token({
                "user_id": user_id_str, "sub": user['username'],
                "role": user['user_role'],
                "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None
            })
            raw_refresh = secrets.token_hex(32)
            refresh_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
            cur.execute("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, NOW() + INTERVAL '7 days')",
                (user['user_id'], refresh_hash))
            conn.commit()
            return {
                "status": "success", "step": "done",
                "access_token": access_token, "refresh_token": raw_refresh,
                "user": {"username": user['username'], "role": user['user_role'],
                         "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None,
                         "user_id": user_id_str}
            }

        # 發送 OTP
        otp = generate_otp()
        otp_hash = hash_otp(otp)
        cur.execute("UPDATE email_otps SET used = true WHERE user_id = %s::uuid AND purpose = 'LOGIN' AND used = false", (user_id_str,))
        cur.execute("INSERT INTO email_otps (user_id, otp_hash, purpose, expires_at) VALUES (%s::uuid, %s, 'LOGIN', NOW() + INTERVAL '10 minutes')",
            (user_id_str, otp_hash))
        conn.commit()

        email_sent = send_email_otp(user['email'], otp, "登入")
        masked = user['email'][:3] + "***" + user['email'][user['email'].find('@'):]
        return {
            "status": "success", "step": "otp_required",
            "message": f"驗證碼已發送至 {masked}",
            "email_sent": email_sent
        }
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()


@router.post("/api/auth/login/step2")
async def login_step2(req: StepTwoRequest, request: Request):
    """第二步：驗證 OTP → 發 Access Token + Refresh Token"""
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users WHERE username = %s AND status = 'APPROVED'", (req.username,))
        user = cur.fetchone()
        if not user: raise HTTPException(401, "使用者不存在")
        user_id_str = str(user['user_id'])

        otp_hash = hash_otp(req.otp)
        cur.execute("""SELECT otp_id FROM email_otps
            WHERE user_id = %s::uuid AND otp_hash = %s AND purpose = 'LOGIN'
            AND used = false AND expires_at > NOW()""", (user_id_str, otp_hash))
        otp_record = cur.fetchone()
        if not otp_record:
            raise HTTPException(400, "驗證碼無效或已過期")

        cur.execute("UPDATE email_otps SET used = true WHERE otp_id = %s", (otp_record['otp_id'],))

        # 信任此裝置 7 天
        if req.trust_device:
            device_hash = get_device_hash(request)
            user_agent = request.headers.get("user-agent", "")[:200]
            trust_device(cur, user_id_str, device_hash, user_agent)

        access_token = create_access_token({
            "user_id": user_id_str, "sub": user['username'],
            "role": user['user_role'],
            "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None
        })
        raw_refresh = secrets.token_hex(32)
        refresh_hash = hashlib.sha256(raw_refresh.encode()).hexdigest()
        cur.execute("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, NOW() + INTERVAL '7 days')",
            (user['user_id'], refresh_hash))
        conn.commit()
        return {
            "status": "success", "step": "done",
            "access_token": access_token, "refresh_token": raw_refresh,
            "user": {"username": user['username'], "role": user['user_role'],
                     "enterprise_id": str(user['enterprise_id']) if user['enterprise_id'] else None,
                     "user_id": user_id_str}
        }
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()


@router.patch("/api/users/me/email")
async def set_my_email(req: SetEmailRequest, request: Request, current_user=Depends(get_current_user)):
    """綁定/更新 Email → 發送驗證 OTP"""
    user_id = current_user.get("user_id")
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        otp = generate_otp()
        otp_hash = hash_otp(otp)
        cur.execute("UPDATE users SET email = %s, email_verified = false WHERE user_id = %s::uuid", (req.email, user_id))
        cur.execute("UPDATE email_otps SET used = true WHERE user_id = %s::uuid AND purpose = 'VERIFY_EMAIL'", (user_id,))
        cur.execute("INSERT INTO email_otps (user_id, otp_hash, purpose, expires_at) VALUES (%s::uuid, %s, 'VERIFY_EMAIL', NOW() + INTERVAL '30 minutes')",
            (user_id, otp_hash))
        conn.commit()
        sent = send_email_otp(req.email, otp, "Email 驗證")
        return {"status": "success", "message": f"驗證碼已發送至 {req.email}", "email_sent": sent}
    except Exception as e: conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()


@router.post("/api/auth/verify-email")
async def verify_email(body: dict, current_user=Depends(get_current_user)):
    """驗證 Email 綁定 OTP"""
    user_id = current_user.get("user_id")
    otp = body.get("otp", "")
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        otp_hash = hash_otp(otp)
        cur.execute("""SELECT otp_id FROM email_otps
            WHERE user_id = %s::uuid AND otp_hash = %s AND purpose = 'VERIFY_EMAIL'
            AND used = false AND expires_at > NOW()""", (user_id, otp_hash))
        rec = cur.fetchone()
        if not rec: raise HTTPException(400, "驗證碼無效或已過期")
        cur.execute("UPDATE email_otps SET used = true WHERE otp_id = %s", (rec['otp_id'],))
        cur.execute("UPDATE users SET email_verified = true WHERE user_id = %s::uuid", (user_id,))
        conn.commit()
        return {"status": "success", "message": "Email 驗證成功！登入後將啟用二次驗證"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()


# ═══════════════════════════════════════════════════════════
# A: 綠界 ECPay 金流
# ═══════════════════════════════════════════════════════════

ECPAY_MERCHANT_ID  = os.getenv("ECPAY_MERCHANT_ID", "2000132")   # 測試商店代號
ECPAY_HASH_KEY     = os.getenv("ECPAY_HASH_KEY",    "5294y06JbISpM5x9")  # 測試 HashKey
ECPAY_HASH_IV      = os.getenv("ECPAY_HASH_IV",     "v77hoKGq4kWxNNIS")  # 測試 HashIV
ECPAY_API_URL      = os.getenv("ECPAY_API_URL", "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5")
ECPAY_RETURN_URL   = os.getenv("ECPAY_RETURN_URL", "http://localhost:8000/api/payment/ecpay/callback")
ECPAY_CLIENT_BACK  = os.getenv("ECPAY_CLIENT_BACK", "http://localhost:3000")
SITE_URL           = os.getenv("SITE_URL", "http://localhost:3000")

# 點數費率（可在 .env 調整）
POINT_RATE         = float(os.getenv("POINT_RATE", "1.0"))  # 1 元 = 1 點

def ecpay_checksum(params: dict) -> str:
    """計算綠界 CheckMacValue"""
    sorted_params = sorted(params.items(), key=lambda x: x[0].lower())
    raw = f"HashKey={ECPAY_HASH_KEY}&" + "&".join(f"{k}={v}" for k, v in sorted_params) + f"&HashIV={ECPAY_HASH_IV}"
    encoded = urllib.parse.quote_plus(raw).lower()
    return hashlib.sha256(encoded.encode()).hexdigest().upper()


class CreatePaymentRequest(BaseModel):
    amount: int          # 台幣金額（最低 1 元）
    payment_type: str = "PERSONAL"  # PERSONAL | ENTERPRISE
    enterprise_id: Optional[str] = None

@router.post("/api/payment/ecpay/create")
async def create_ecpay_payment(req: CreatePaymentRequest, current_user=Depends(get_current_user)):
    """建立綠界付款訂單，回傳 HTML Form（自動 POST 導向綠界）"""
    user_id = current_user.get("user_id")
    if req.amount < 1:
        raise HTTPException(400, "金額至少 1 元")

    points_to_add = req.amount * POINT_RATE
    merchant_trade_no = f"CAXN{datetime.now().strftime('%Y%m%d%H%M%S')}{secrets.token_hex(3).upper()}"

    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("""INSERT INTO payment_orders
            (user_id, enterprise_id, payment_type, merchant_trade_no, amount, points_to_add, status, gateway)
            VALUES (%s::uuid, %s, %s, %s, %s, %s, 'PENDING', 'ECPAY')""",
            (user_id, req.enterprise_id, req.payment_type, merchant_trade_no, req.amount, points_to_add))
        conn.commit()
    except Exception as e:
        conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()

    trade_desc = f"CAXN點數{'企業' if req.payment_type=='ENTERPRISE' else '個人'}儲值"
    params = {
        "MerchantID":        ECPAY_MERCHANT_ID,
        "MerchantTradeNo":   merchant_trade_no,
        "MerchantTradeDate": datetime.now().strftime("%Y/%m/%d %H:%M:%S"),
        "PaymentType":       "aio",
        "TotalAmount":       str(req.amount),
        "TradeDesc":         urllib.parse.quote(trade_desc),
        "ItemName":          f"CAXN 點數 {int(points_to_add)} 點",
        "ReturnURL":         ECPAY_RETURN_URL,
        "ClientBackURL":     f"{SITE_URL}/payment/result?order={merchant_trade_no}",
        "ChoosePayment":     "ALL",
        "EncryptType":       "1",
    }
    params["CheckMacValue"] = ecpay_checksum(params)

    # 回傳自動提交的 HTML Form
    form_inputs = "\n".join(f'<input type="hidden" name="{k}" value="{v}" />' for k, v in params.items())
    html = f"""<!DOCTYPE html><html><body>
    <form id="ecpay" action="{ECPAY_API_URL}" method="POST">{form_inputs}</form>
    <script>document.getElementById('ecpay').submit();</script>
    </body></html>"""
    return HTMLResponse(content=html)


@router.post("/api/payment/ecpay/callback")
async def ecpay_callback(request: Request):
    """綠界付款結果回傳（非同步通知 ReturnURL）"""
    form = await request.form()
    data = dict(form)

    # 驗證 CheckMacValue
    received_mac = data.pop("CheckMacValue", "")
    expected_mac = ecpay_checksum(data)
    if received_mac.upper() != expected_mac.upper():
        return HTMLResponse("0|ErrorMessage")

    rtn_code = data.get("RtnCode", "0")
    merchant_trade_no = data.get("MerchantTradeNo", "")
    trade_no = data.get("TradeNo", "")

    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM payment_orders WHERE merchant_trade_no = %s AND status = 'PENDING'",
            (merchant_trade_no,))
        order = cur.fetchone()
        if not order:
            return HTMLResponse("1|OK")  # 已處理過，回傳成功避免重複通知

        if rtn_code == "1":  # 付款成功
            cur.execute("UPDATE payment_orders SET status='PAID', trade_no=%s, payment_method=%s, raw_response=%s, paid_at=NOW() WHERE merchant_trade_no=%s",
                (trade_no, data.get("PaymentType", ""), json.dumps(dict(data), ensure_ascii=False), merchant_trade_no))

            points = float(order['points_to_add'])
            user_id = str(order['user_id'])

            if order['payment_type'] == 'ENTERPRISE' and order['enterprise_id']:
                cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid", (points, order['enterprise_id']))
                cur.execute("INSERT INTO wallet_transactions (to_wallet_id, amount, transaction_type, description) VALUES ((SELECT wallet_id FROM wallets WHERE owner_id=%s::uuid LIMIT 1), %s, 'TOPUP', %s)",
                    (order['enterprise_id'], points, f"ECPay 儲值 TWD {order['amount']}"))
            else:
                cur.execute("UPDATE users SET personal_points = personal_points + %s WHERE user_id = %s::uuid", (points, user_id))

            conn.commit()
            # SSE 通知（非同步，不阻塞 callback）
            try:
                import asyncio
                from main import push_notification
                asyncio.create_task(push_notification(user_id, 'TOPUP_SUCCESS',
                    f'💰 儲值成功！已獲得 {int(points)} 點',
                    f'付款金額：TWD {order["amount"]}，交易編號：{trade_no}'))
            except Exception:
                pass
        else:
            cur.execute("UPDATE payment_orders SET status='FAILED', raw_response=%s WHERE merchant_trade_no=%s",
                (json.dumps(dict(data), ensure_ascii=False), merchant_trade_no))
            conn.commit()

        return HTMLResponse("1|OK")
    except Exception as e:
        conn.rollback()
        print(f"[ECPay Callback Error] {e}")
        return HTMLResponse("0|ErrorMessage")
    finally: cur.close(); conn.close()


@router.get("/api/payment/history")
async def payment_history(current_user=Depends(get_current_user)):
    """查詢個人付款記錄"""
    user_id = current_user.get("user_id")
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT order_id, merchant_trade_no, trade_no, amount, points_to_add,
                   payment_type, status, payment_method, gateway, created_at, paid_at
            FROM payment_orders WHERE user_id = %s::uuid
            ORDER BY created_at DESC LIMIT 50""", (user_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()


@router.get("/api/payment/result")
async def payment_result_page(order: str = ""):
    """付款結果頁（前端 ClientBackURL 跳轉過來）"""
    if not order:
        return RedirectResponse("/")
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT status, amount, points_to_add, paid_at FROM payment_orders WHERE merchant_trade_no = %s", (order,))
        rec = cur.fetchone()
        if not rec:
            return RedirectResponse("/")
        status = rec['status']
        return RedirectResponse(f"{ECPAY_CLIENT_BACK}?payment_status={status}&amount={rec['amount']}&points={rec['points_to_add']}&order={order}")
    finally: cur.close(); conn.close()


# ═══════════════════════════════════════════════════════════
# 提領申請 API（企業點數換回現金，最低 5000 點）
# ═══════════════════════════════════════════════════════════

WITHDRAW_MIN_POINTS = float(os.getenv("WITHDRAW_MIN_POINTS", "5000"))

class WithdrawRequest(BaseModel):
    amount: float           # 提領點數（≥ 5000）
    bank_name: str          # 銀行名稱
    bank_code: str          # 銀行代碼（3碼）
    account_name: str       # 戶名
    account_number: str     # 帳號

def require_enterprise_admin_p10(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred: raise HTTPException(401, "需要登入")
    payload = decode_access_token(cred.credentials)
    if not payload: raise HTTPException(401, "Token 無效")
    if payload.get("role") not in ["ENTERPRISE_ADMIN", "PLATFORM_ADMIN"]:
        raise HTTPException(403, "需要企業管理員權限")
    return payload

def require_platform_admin_p10(cred: HTTPAuthorizationCredentials = Depends(security)):
    if not cred: raise HTTPException(401, "需要登入")
    payload = decode_access_token(cred.credentials)
    if not payload: raise HTTPException(401, "Token 無效")
    if payload.get("role") != "PLATFORM_ADMIN":
        raise HTTPException(403, "需要平台管理員權限")
    return payload

@router.get("/api/wallets/withdraw/check")
async def check_withdrawal_eligibility(current_user=Depends(require_enterprise_admin_p10)):
    """檢查企業錢包是否達到最低提領門檻（5000 點）"""
    ent_id = current_user.get("enterprise_id")
    if not ent_id: raise HTTPException(400, "無企業帳戶")
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        w = cur.fetchone()
        balance = float(w['balance']) if w else 0.0
        return {
            "status": "success",
            "balance": balance,
            "min_withdraw": WITHDRAW_MIN_POINTS,
            "eligible": balance >= WITHDRAW_MIN_POINTS,
            "message": f"{'✅ 可申請提領' if balance >= WITHDRAW_MIN_POINTS else f'❌ 餘額不足，需達 {int(WITHDRAW_MIN_POINTS)} 點才可申請'}"
        }
    finally: cur.close(); conn.close()


@router.post("/api/wallets/withdraw")
async def submit_withdrawal(req: WithdrawRequest, current_user=Depends(require_enterprise_admin_p10)):
    """提交提領申請（點數換回現金轉帳）"""
    ent_id = current_user.get("enterprise_id")
    user_id = current_user.get("user_id")
    if not ent_id: raise HTTPException(400, "無企業帳戶")

    if req.amount < WITHDRAW_MIN_POINTS:
        raise HTTPException(400, f"最低提領金額為 {int(WITHDRAW_MIN_POINTS)} 點")
    if not req.bank_code or len(req.bank_code) < 3:
        raise HTTPException(400, "請輸入正確的銀行代碼（3碼）")
    if not req.account_number or len(req.account_number) < 10:
        raise HTTPException(400, "請輸入正確的銀行帳號")

    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT wallet_id, balance FROM wallets WHERE owner_id = %s::uuid", (ent_id,))
        w = cur.fetchone()
        if not w or float(w['balance']) < req.amount:
            raise HTTPException(400, f"企業錢包餘額不足（目前 {float(w['balance']) if w else 0} 點，申請 {req.amount} 點）")

        # 凍結點數（預扣，待平台確認後正式扣除）
        cur.execute("UPDATE wallets SET balance = balance - %s WHERE wallet_id = %s", (req.amount, w['wallet_id']))
        cur.execute("""INSERT INTO withdrawal_requests
            (enterprise_id, applicant_id, amount, bank_name, bank_code, account_name, account_number, status)
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, 'PENDING')
            RETURNING request_id""",
            (ent_id, user_id, req.amount, req.bank_name, req.bank_code, req.account_name, req.account_number))
        request_id = cur.fetchone()['request_id']

        # 記錄交易
        cur.execute("""INSERT INTO wallet_transactions (from_wallet_id, amount, transaction_type, description)
            VALUES (%s, %s, 'WITHDRAW', %s)""",
            (w['wallet_id'], req.amount, f"提領申請 #{str(request_id)[:8]} - 待平台審核"))
        conn.commit()
        return {
            "status": "success",
            "request_id": str(request_id),
            "message": f"提領申請已提交！申請 {int(req.amount)} 點（約 TWD {int(req.amount)}）將由平台在 3~5 個工作日內處理轉帳。"
        }
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()


@router.get("/api/wallets/withdraw/history")
async def withdrawal_history(current_user=Depends(require_enterprise_admin_p10)):
    """查詢提領申請記錄"""
    ent_id = current_user.get("enterprise_id")
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT request_id, amount, bank_name, bank_code, account_name,
                   CONCAT(LEFT(account_number, 4), '****', RIGHT(account_number, 4)) as account_masked,
                   status, admin_note, created_at, processed_at
            FROM withdrawal_requests WHERE enterprise_id = %s::uuid
            ORDER BY created_at DESC LIMIT 30""", (ent_id,))
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()


@router.get("/api/admin/withdraw/pending")
async def get_pending_withdrawals(current_user=Depends(require_platform_admin_p10)):
    """平台管理員：查看所有待處理的提領申請"""
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT wr.*, e.name as enterprise_name, u.username as applicant_name
            FROM withdrawal_requests wr
            LEFT JOIN enterprises e ON wr.enterprise_id = e.enterprise_id
            LEFT JOIN users u ON wr.applicant_id = u.user_id
            WHERE wr.status = 'PENDING'
            ORDER BY wr.created_at ASC""")
        return {"status": "success", "data": cur.fetchall()}
    finally: cur.close(); conn.close()


class ProcessWithdrawalRequest(BaseModel):
    action: str   # 'APPROVE' | 'REJECT'
    admin_note: str = ""

@router.patch("/api/admin/withdraw/{request_id}")
async def process_withdrawal(request_id: str, req: ProcessWithdrawalRequest, current_user=Depends(require_platform_admin_p10)):
    """平台管理員：核准或拒絕提領申請"""
    conn = get_db(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM withdrawal_requests WHERE request_id = %s::uuid AND status = 'PENDING'", (request_id,))
        wr = cur.fetchone()
        if not wr: raise HTTPException(404, "提領申請不存在或已處理")

        new_status = 'APPROVED' if req.action == 'APPROVE' else 'REJECTED'
        cur.execute("UPDATE withdrawal_requests SET status = %s, admin_note = %s, processed_at = NOW() WHERE request_id = %s::uuid",
            (new_status, req.admin_note, request_id))

        if req.action == 'REJECT':
            # 拒絕時退還凍結點數
            cur.execute("UPDATE wallets SET balance = balance + %s WHERE owner_id = %s::uuid",
                (wr['amount'], wr['enterprise_id']))
            cur.execute("""INSERT INTO wallet_transactions (to_wallet_id, amount, transaction_type, description)
                VALUES ((SELECT wallet_id FROM wallets WHERE owner_id=%s::uuid LIMIT 1), %s, 'REFUND', %s)""",
                (wr['enterprise_id'], wr['amount'], f"提領申請退回 - {req.admin_note}"))

        conn.commit()
        return {"status": "success", "message": f"提領申請已{'核准' if req.action == 'APPROVE' else '拒絕'}"}
    except HTTPException: raise
    except Exception as e: conn.rollback(); raise HTTPException(500, str(e))
    finally: cur.close(); conn.close()
